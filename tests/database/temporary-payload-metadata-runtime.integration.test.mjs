import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import {
  PostgresTemporaryPayloadMetadataRepository,
  TemporaryPayloadMetadataPersistenceError,
} from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";

function fixture() {
  const raw = process.env.MEDIQ_TEMP_PAYLOAD_TEST_FIXTURE;
  assert.ok(raw, "TEMP_PAYLOAD_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "packageId",
    "studyRefId", "siblingStudyRefId", "sourceHospitalId",
  ];
  assert.ok(required.every((key) => typeof value[key] === "string"), "TEMP_PAYLOAD_FIXTURE_INVALID");
  return value;
}

function makeOperation(ids, studyRefId) {
  return PacsTransferOperation.create({
    operationId: randomUUID(),
    semantics: {
      tenantId: ids.tenantId,
      actorId: ids.actorId,
      exchangeSessionId: ids.sessionId,
      studyRefId,
      consentId: randomUUID(),
      grantId: randomUUID(),
      action: "PACS_IMPORT",
    },
    idempotencyKey: randomUUID(),
    now: new Date(),
  });
}

async function beginTenant(client, tenantId) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
}

async function createOperation(client, ids, studyRefId) {
  await beginTenant(client, ids.tenantId);
  const created = await new PostgresPacsTransferOperationRepository(client)
    .createIdempotently({
      operation: makeOperation(ids, studyRefId),
      correlationId: randomUUID(),
    });
  assert.equal(created.created, true);
  await client.query("COMMIT");
  return created.operation;
}

function operationBinding(ids, operation, studyRefId = operation.snapshot.studyRefId) {
  return Object.freeze({
    operationId: operation.snapshot.operationId,
    tenantId: ids.tenantId,
    exchangeSessionId: ids.sessionId,
    packageId: ids.packageId,
    studyRefId,
    sourceHospitalId: ids.sourceHospitalId,
  });
}

function reserveInput(binding, storageRef = randomUUID()) {
  return {
    binding,
    storageRef,
    expiresAt: new Date(Date.now() + 60_000),
  };
}

async function readStudyState(client, tenantId, studyRefId) {
  await beginTenant(client, tenantId);
  const result = await client.query(
    `SELECT package_id, temporary_storage_ref, temporary_payload_state,
            temporary_payload_expires_at, temporary_payload_purged_at
       FROM study_references WHERE study_ref_id=$1`,
    [studyRefId],
  );
  await client.query("COMMIT");
  return result.rows[0] ?? null;
}

test("PACS-001 DEC-008 temporary payload metadata PostgreSQL/RLS Acceptance", {
  timeout: 30_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "TEMP_PAYLOAD_DATABASE_URL_MISSING");
  const inspectConnectionString = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectConnectionString, "TEMP_PAYLOAD_INSPECT_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000 });
  const inspector = new Pool({ connectionString: inspectConnectionString, max: 2, connectionTimeoutMillis: 5_000 });
  const clients = [];
  let currentStage = "PRIVILEGE_CATALOG";
  try {
    const privilegesClient = await pool.connect();
    clients.push(privilegesClient);
    const privileges = await privilegesClient.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT')::int AS study_select,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='UPDATE')::int AS study_update,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='INSERT')::int AS study_insert,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='DELETE')::int AS study_delete,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT'
          AND column_name IN ('temporary_storage_ref','temporary_payload_state',
                              'temporary_payload_expires_at','temporary_payload_purged_at'))::int AS metadata_select,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='UPDATE'
          AND column_name IN ('temporary_storage_ref','temporary_payload_state',
                              'temporary_payload_expires_at','temporary_payload_purged_at'))::int AS metadata_update,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='UPDATE'
          AND column_name NOT IN ('temporary_storage_ref','temporary_payload_state',
                                  'temporary_payload_expires_at','temporary_payload_purged_at'))::int AS other_update
      FROM information_schema.column_privileges
      WHERE grantee='mediq_runtime' AND table_schema='public'`);
    assert.deepEqual(privileges.rows[0], {
      total: 244,
      study_select: 10,
      study_update: 4,
      study_insert: 0,
      study_delete: 0,
      metadata_select: 4,
      metadata_update: 4,
      other_update: 0,
    });
    const tablePrivileges = await privilegesClient.query(`
      SELECT count(*)::int AS total FROM information_schema.table_privileges
       WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public'`);
    assert.equal(tablePrivileges.rows[0].total, 0);
    const rls = await privilegesClient.query(`
      SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE oid='public.study_references'::regclass`);
    assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    const indexes = await privilegesClient.query(`
      SELECT index_class.relname AS name, index_data.indisunique AS is_unique,
             pg_get_expr(index_data.indpred, index_data.indrelid) AS predicate
        FROM pg_index index_data
        JOIN pg_class index_class ON index_class.oid=index_data.indexrelid
       WHERE index_data.indrelid='public.study_references'::regclass
         AND index_class.relname IN (
           'study_references_temporary_payload_cleanup_idx',
           'study_references_temporary_storage_ref_unique'
         )
       ORDER BY index_class.relname`);
    assert.equal(indexes.rowCount, 2, "both lifecycle indexes must be present");
    const cleanupIndex = indexes.rows.find((row) => row.name === "study_references_temporary_payload_cleanup_idx");
    assert.equal(cleanupIndex.is_unique, false);
    assert.match(cleanupIndex.predicate, /STAGING/);
    assert.match(cleanupIndex.predicate, /AVAILABLE/);
    assert.match(cleanupIndex.predicate, /PURGE_PENDING/);
    const storageRefIndex = indexes.rows.find((row) => row.name === "study_references_temporary_storage_ref_unique");
    assert.equal(storageRefIndex.is_unique, true);
    assert.match(storageRefIndex.predicate, /temporary_storage_ref/);
    assert.match(storageRefIndex.predicate, /IS NOT NULL/);

    const noContext = await privilegesClient.query(
      "SELECT study_ref_id FROM study_references WHERE study_ref_id=$1",
      [ids.studyRefId],
    );
    assert.equal(noContext.rowCount, 0, "missing Tenant context hides the StudyReference");

    currentStage = "OPERATION_RESERVATION_AND_RACE";
    const opA = await createOperation(privilegesClient, ids, ids.studyRefId);
    const opB = await createOperation(privilegesClient, ids, ids.siblingStudyRefId);
    const bindingA = operationBinding(ids, opA);
    const bindingB = operationBinding(ids, opB);

    const first = await pool.connect();
    const racing = await pool.connect();
    const sibling = await pool.connect();
    clients.push(first, racing, sibling);
    const firstRef = randomUUID();
    const losingRef = randomUUID();
    await beginTenant(first, ids.tenantId);
    await new PostgresTemporaryPayloadMetadataRepository(first).reserveStaging(
      reserveInput(bindingA, firstRef),
    );

    // A distinct operation in the same package must not block on or overwrite the first Study.
    await beginTenant(sibling, ids.tenantId);
    const siblingRef = randomUUID();
    await new PostgresTemporaryPayloadMetadataRepository(sibling).reserveStaging(
      reserveInput(bindingB, siblingRef),
    );
    await sibling.query("COMMIT");

    // A second reservation for the same operation waits for the first row lock, then is denied.
    await beginTenant(racing, ids.tenantId);
    const racingResult = new PostgresTemporaryPayloadMetadataRepository(racing)
      .reserveStaging(reserveInput(bindingA, losingRef))
      .then(() => null, (error) => error);
    let reservationWaitObserved = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = await privilegesClient.query(`
        SELECT count(*)::int AS count
          FROM pg_stat_activity
         WHERE datname=current_database()
           AND usename=current_user
           AND wait_event_type='Lock'
           AND query LIKE '%UPDATE study_references AS sr%'`);
      if (waiting.rows[0].count > 0) {
        reservationWaitObserved = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(reservationWaitObserved, true, "the competing reservation must block on the StudyReference row");
    await first.query("COMMIT");
    const racingError = await racingResult;
    assert.ok(racingError instanceof TemporaryPayloadMetadataPersistenceError);
    await racing.query("ROLLBACK");

    const stateA = await readStudyState(privilegesClient, ids.tenantId, ids.studyRefId);
    const stateB = await readStudyState(privilegesClient, ids.tenantId, ids.siblingStudyRefId);
    assert.equal(stateA.package_id, ids.packageId);
    assert.equal(stateA.temporary_storage_ref, firstRef);
    assert.equal(stateA.temporary_payload_state, "STAGING");
    assert.equal(stateA.temporary_payload_purged_at, null);
    assert.equal(stateB.package_id, ids.packageId);
    assert.equal(stateB.temporary_storage_ref, siblingRef);
    assert.equal(stateB.temporary_payload_state, "STAGING");

    await beginTenant(privilegesClient, ids.otherTenantId);
    const unrelatedTenantRead = await privilegesClient.query(
      "SELECT study_ref_id FROM study_references WHERE study_ref_id=$1",
      [ids.studyRefId],
    );
    assert.equal(unrelatedTenantRead.rowCount, 0);
    await assert.rejects(
      new PostgresTemporaryPayloadMetadataRepository(privilegesClient).markAvailable({
        binding: bindingA,
        storageRef: firstRef,
        now: new Date(),
      }),
      TemporaryPayloadMetadataPersistenceError,
    );
    await privilegesClient.query("ROLLBACK");

    currentStage = "CONSTRAINT_AND_METADATA_TRANSITIONS";
    await beginTenant(privilegesClient, ids.tenantId);
    await privilegesClient.query("SAVEPOINT invalid_shape_probe");
    await assert.rejects(
      privilegesClient.query(
        `UPDATE study_references SET temporary_payload_state='PURGED',
                temporary_payload_purged_at=NULL WHERE study_ref_id=$1`,
        [ids.studyRefId],
      ),
      (error) => error?.code === "23514",
      "PURGED state without purged_at must violate the lifecycle shape CHECK",
    );
    await privilegesClient.query("ROLLBACK TO SAVEPOINT invalid_shape_probe");
    await privilegesClient.query("RELEASE SAVEPOINT invalid_shape_probe");

    await privilegesClient.query("SAVEPOINT duplicate_ref_probe");
    await assert.rejects(
      privilegesClient.query(
        "UPDATE study_references SET temporary_storage_ref=$1 WHERE study_ref_id=$2",
        [firstRef, ids.siblingStudyRefId],
      ),
      (error) => error?.code === "23505",
      "one opaque storage reference cannot alias sibling Study payloads",
    );
    await privilegesClient.query("ROLLBACK TO SAVEPOINT duplicate_ref_probe");
    await privilegesClient.query("RELEASE SAVEPOINT duplicate_ref_probe");

    const metadataRepository = new PostgresTemporaryPayloadMetadataRepository(privilegesClient);
    for (const [binding, storageRef] of [[bindingA, firstRef], [bindingB, siblingRef]]) {
      await metadataRepository.markAvailable({ binding, storageRef, now: new Date() });
    }
    await privilegesClient.query("COMMIT");

    const wrongBindingClient = await pool.connect();
    clients.push(wrongBindingClient);
    await beginTenant(wrongBindingClient, ids.tenantId);
    await assert.rejects(
      new PostgresTemporaryPayloadMetadataRepository(wrongBindingClient).markAvailable({
        binding: { ...bindingA, packageId: randomUUID() },
        storageRef: firstRef,
        now: new Date(),
      }),
      TemporaryPayloadMetadataPersistenceError,
    );
    await wrongBindingClient.query("ROLLBACK");

    currentStage = "AUDIT_FAILURE_ROLLBACK_AND_PURGE";
    const collisionAuditId = randomUUID();
    await beginTenant(privilegesClient, ids.tenantId);
    await privilegesClient.query(
      `INSERT INTO audit_events
        (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id,
         resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
       VALUES ($1, now(), $2, $3, $4, 'STUDY', $5, 'TEST_ID_COLLISION',
               'SUCCESS', NULL, $6, now())`,
      [collisionAuditId, ids.actorId, ids.tenantId, ids.sessionId, ids.studyRefId, randomUUID()],
    );
    await privilegesClient.query("COMMIT");

    await beginTenant(privilegesClient, ids.tenantId);
    await metadataRepository.markPurgePending({ binding: bindingA, storageRef: firstRef });
    await privilegesClient.query("COMMIT");
    await beginTenant(privilegesClient, ids.tenantId);
    await assert.rejects(
      metadataRepository.finalizePurgeAndAudit({
        binding: bindingA,
        storageRef: firstRef,
        actorId: ids.actorId,
        correlationId: randomUUID(),
        auditEventId: collisionAuditId,
        reason: "CAPTURE_FAILURE",
        now: new Date(),
      }),
      TemporaryPayloadMetadataPersistenceError,
      "an Audit failure must fail the enclosing purge transaction",
    );
    await privilegesClient.query("ROLLBACK");
    const afterAuditFailure = await readStudyState(
      privilegesClient,
      ids.tenantId,
      ids.studyRefId,
    );
    assert.equal(afterAuditFailure.temporary_payload_state, "PURGE_PENDING");
    assert.equal(afterAuditFailure.temporary_storage_ref, firstRef);

    const firstAuditId = randomUUID();
    await beginTenant(privilegesClient, ids.tenantId);
    const purged = await metadataRepository.finalizePurgeAndAudit({
      binding: bindingA,
      storageRef: firstRef,
      actorId: ids.actorId,
      correlationId: randomUUID(),
      auditEventId: firstAuditId,
      reason: "CAPTURE_FAILURE",
      now: new Date(),
    });
    assert.equal(purged, "PURGED");
    await privilegesClient.query("COMMIT");

    await beginTenant(privilegesClient, ids.tenantId);
    const auditObserver = await inspector.connect();
    let auditRows;
    try {
      await beginTenant(auditObserver, ids.tenantId);
      auditRows = await auditObserver.query(
        `SELECT action, resource_type, resource_id, result, reason_code
           FROM audit_events WHERE audit_event_id=$1`,
        [firstAuditId],
      );
      await auditObserver.query("COMMIT");
    } finally {
      if (auditObserver.getTransactionStatus?.() !== 0) {
        await auditObserver.query("ROLLBACK").catch(() => undefined);
      }
      auditObserver.release();
    }
    assert.deepEqual(auditRows.rows, [{
      action: "PACS_TEMPORARY_OBJECT_PURGED",
      resource_type: "STUDY",
      resource_id: ids.studyRefId,
      result: "SUCCESS",
      reason_code: "CAPTURE_FAILURE",
    }]);
    const replay = await metadataRepository.finalizePurgeAndAudit({
      binding: bindingA,
      storageRef: firstRef,
      actorId: ids.actorId,
      correlationId: randomUUID(),
      auditEventId: randomUUID(),
      reason: "EXPLICIT_CLOSE",
      now: new Date(),
    });
    assert.equal(replay, "ALREADY_PURGED");
    await privilegesClient.query("COMMIT");

    const siblingAfterPurge = await readStudyState(
      privilegesClient,
      ids.tenantId,
      ids.siblingStudyRefId,
    );
    assert.equal(siblingAfterPurge.temporary_payload_state, "AVAILABLE");
    assert.equal(siblingAfterPurge.temporary_storage_ref, siblingRef);

    currentStage = "RETRY_AND_POST_STOW_FENCE";
    const retryRef = randomUUID();
    await beginTenant(privilegesClient, ids.tenantId);
    await metadataRepository.reserveStaging(reserveInput(bindingA, retryRef));
    await metadataRepository.markAvailable({ binding: bindingA, storageRef: retryRef, now: new Date() });
    await metadataRepository.markPurgePending({ binding: bindingA, storageRef: retryRef });
    assert.equal(await metadataRepository.finalizePurgeAndAudit({
      binding: bindingA,
      storageRef: retryRef,
      actorId: ids.actorId,
      correlationId: randomUUID(),
      auditEventId: randomUUID(),
      reason: "EXPLICIT_CLOSE",
      now: new Date(),
    }), "PURGED");
    await privilegesClient.query("COMMIT");

    const operationRepository = new PostgresPacsTransferOperationRepository(privilegesClient);
    const preflight = opA.transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(opA.snapshot.updatedAt.getTime() + 1),
    });
    await beginTenant(privilegesClient, ids.tenantId);
    const persistedPreflight = await operationRepository.transition({
      current: opA,
      next: preflight,
      correlationId: randomUUID(),
    });
    await privilegesClient.query("COMMIT");
    const stowStarted = persistedPreflight.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(persistedPreflight.snapshot.updatedAt.getTime() + 1),
    });
    await beginTenant(privilegesClient, ids.tenantId);
    await operationRepository.transition({
      current: persistedPreflight,
      next: stowStarted,
      correlationId: randomUUID(),
    });
    await privilegesClient.query("COMMIT");
    await beginTenant(privilegesClient, ids.tenantId);
    await assert.rejects(
      metadataRepository.reserveStaging(reserveInput(bindingA, randomUUID())),
      TemporaryPayloadMetadataPersistenceError,
      "a new source retrieval is denied after STOW_STARTED",
    );
    await privilegesClient.query("ROLLBACK");

    await beginTenant(privilegesClient, ids.tenantId);
    const packageState = await privilegesClient.query(
      "SELECT state, deleted_at FROM imaging_packages WHERE package_id=$1",
      [ids.packageId],
    );
    assert.deepEqual(packageState.rows[0], { state: "AVAILABLE", deleted_at: null });
    await privilegesClient.query("COMMIT");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : error instanceof Error
          ? error.name
          : "UNKNOWN";
    throw new Error(`TEMP_PAYLOAD_STAGE=${currentStage} code=${code}`);
  } finally {
    for (const client of clients.reverse()) {
      if (client.getTransactionStatus?.() !== 0) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      client.release();
    }
    await pool.end();
    await inspector.end();
  }
});
