import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import {
  PostgresTemporaryPayloadMetadataRepository,
  TemporaryPayloadMetadataPersistenceError,
} from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";
import {
  PostgresTemporaryPayloadQuotaRepository,
  TemporaryPayloadQuotaPersistenceError,
} from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-quota.repository.js";
import {
  TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES,
} from "../../services/api/dist/imaging-storage/application/temporary-payload-quota.port.js";
import {
  EphemeralEncryptedTemporaryImagingStore,
} from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";
import {
  TemporaryPayloadPurgeCoordinator,
  TemporaryPayloadPurgeUnavailableError,
} from "../../services/api/dist/imaging-storage/application/temporary-payload-purge.coordinator.js";

function fixture() {
  const raw = process.env.MEDIQ_TEMP_PAYLOAD_TEST_FIXTURE;
  assert.ok(raw, "TEMP_PAYLOAD_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "packageId",
    "studyRefId", "siblingStudyRefId", "sourceHospitalId",
    "sourceTenantId", "sourceActorId", "sourceStudyRefId",
  ];
  assert.ok(required.every((key) => typeof value[key] === "string"), "TEMP_PAYLOAD_FIXTURE_INVALID");
  assert.ok(
    Array.isArray(value.quotaEnvironmentFillTargets) && value.quotaEnvironmentFillTargets.length === 5,
    "TEMP_PAYLOAD_QUOTA_ENVIRONMENT_FILL_FIXTURE_INVALID",
  );
  assert.ok(value.quotaEnvironmentProbe && typeof value.quotaEnvironmentProbe === "object",
    "TEMP_PAYLOAD_QUOTA_ENVIRONMENT_PROBE_FIXTURE_INVALID");
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

function reserveInput(binding, storageRef = randomUUID(), ttlMilliseconds = 60_000) {
  return {
    binding,
    storageRef,
    expiresAt: new Date(Date.now() + ttlMilliseconds),
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
  timeout: 120_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "TEMP_PAYLOAD_DATABASE_URL_MISSING");
  const inspectConnectionString = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectConnectionString, "TEMP_PAYLOAD_INSPECT_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  const inspector = new Pool({ connectionString: inspectConnectionString, max: 2, connectionTimeoutMillis: 5_000 });
  const clients = [];
  let temporaryRoot;
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
      total: 258,
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

    currentStage = "QUOTA_LIMITS_BINDING_AND_INDEPENDENT_SESSION_RACE";
    const quotaInput = {
      tenantId: ids.tenantId,
      studyRefId: ids.siblingStudyRefId,
      storageRef: siblingRef,
    };
    const quotaBackendPids = [];
    const quotaTransactions = {
      async withTenant(tenantId, work) {
        const client = await pool.connect();
        try {
          await beginTenant(client, tenantId);
          const pid = await client.query("SELECT pg_backend_pid()::text AS pid");
          quotaBackendPids.push(pid.rows[0].pid);
          const result = await work(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      },
    };
    const quotaRepository = new PostgresTemporaryPayloadQuotaRepository(quotaTransactions);

    async function setQuotaCaps(environmentBytes, packageBytes) {
      const client = await inspector.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE mediq_quota_owner");
        await client.query(
          `UPDATE temporary_payload_quota_state
              SET max_environment_bytes=$1, max_package_bytes=$2
            WHERE singleton_id=true`,
          [environmentBytes, packageBytes],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    async function readQuota(label, {
      tenantId = ids.tenantId,
      packageId = ids.packageId,
      storageRef = siblingRef,
    } = {}) {
      const client = await inspector.connect();
      try {
        currentStage = `QUOTA_READ_${label}_BEGIN`;
        await client.query("BEGIN");
        currentStage = `QUOTA_READ_${label}_SET_OWNER`;
        await client.query("SET LOCAL ROLE mediq_quota_owner");
        currentStage = `QUOTA_READ_${label}_TENANT_CONTEXT`;
        await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [tenantId]);
        currentStage = `QUOTA_READ_${label}_QUERY`;
        const result = await client.query(
          `SELECT q.max_environment_bytes::text AS max_environment_bytes,
                  q.max_package_bytes::text AS max_package_bytes,
                  q.reserved_bytes::text AS environment_reserved,
                  COALESCE(pq.reserved_bytes,0)::text AS package_reserved,
                  COALESCE(r.reserved_bytes,0)::text AS ref_reserved,
                  (SELECT count(*)::int FROM temporary_payload_reservations
                    WHERE tenant_id=$2) AS reservation_rows
             FROM temporary_payload_quota_state q
             LEFT JOIN temporary_payload_package_quotas pq ON pq.package_id=$1::uuid
             LEFT JOIN temporary_payload_reservations r ON r.storage_ref=$3
            WHERE q.singleton_id=true`,
          [packageId, tenantId, storageRef],
        );
        currentStage = `QUOTA_READ_${label}_COMMIT`;
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const reservationBlock = TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES;
    // A deliberately reduced disposable limit makes the two-session race cheap
    // while leaving enough Package headroom to isolate the environment ceiling.
    await setQuotaCaps(reservationBlock, 2 * reservationBlock);
    const competingWriterIds = [randomUUID(), randomUUID()];
    const independentRace = await Promise.allSettled([
      ...competingWriterIds.map((writerId) => quotaRepository.reserve({
        ...quotaInput,
        writerId,
        deltaBytes: reservationBlock,
      })),
    ]);
    assert.equal(independentRace.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(independentRace.filter((result) => result.status === "rejected").length, 1);
    assert.equal(new Set(quotaBackendPids).size, 2, "reservations must race on independent mediq_runtime sessions");
    const winningWriterIndex = independentRace.findIndex((result) => result.status === "fulfilled");
    const losingWriterResult = independentRace[1 - winningWriterIndex];
    assert.ok(
      losingWriterResult.reason instanceof TemporaryPayloadQuotaPersistenceError,
      "a distinct writer colliding on the same storage reference must be denied",
    );
    const quotaWriterId = competingWriterIds[winningWriterIndex];
    let quotaSnapshot = await readQuota("RACE");
    assert.equal(quotaSnapshot.environment_reserved, String(reservationBlock));
    assert.equal(quotaSnapshot.package_reserved, String(reservationBlock));
    assert.equal(quotaSnapshot.ref_reserved, String(reservationBlock));

    currentStage = "SOURCE_RECIPIENT_CROSS_TENANT_PACKAGE_AGGREGATE";
    const sourceTenantContext = {
      ...ids,
      tenantId: ids.sourceTenantId,
      actorId: ids.sourceActorId,
    };
    const sourceOperation = await createOperation(
      privilegesClient,
      sourceTenantContext,
      ids.sourceStudyRefId,
    );
    const sourceBinding = operationBinding(
      sourceTenantContext,
      sourceOperation,
      ids.sourceStudyRefId,
    );
    const sourceStorageRef = randomUUID();
    const sourceMetadataClient = await pool.connect();
    try {
      await beginTenant(sourceMetadataClient, ids.sourceTenantId);
      await new PostgresTemporaryPayloadMetadataRepository(sourceMetadataClient)
        .reserveStaging(reserveInput(sourceBinding, sourceStorageRef));
      await sourceMetadataClient.query("COMMIT");
    } catch (error) {
      await sourceMetadataClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      sourceMetadataClient.release();
    }

    // Leave global headroom so a denial proves that the Package counter is
    // shared across participant Tenants, rather than failing at the env cap.
    await setQuotaCaps(2 * reservationBlock, reservationBlock);
    const crossTenantPackageError = await (async () => {
      const client = await pool.connect();
      try {
        await beginTenant(client, ids.sourceTenantId);
        const error = await client.query(
          "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
          [ids.sourceStudyRefId, sourceStorageRef, randomUUID(), reservationBlock],
        ).then(() => null, (queryError) => queryError);
        if (error) await client.query("ROLLBACK");
        else await client.query("COMMIT");
        return error;
      } finally {
        client.release();
      }
    })();
    assert.equal(
      crossTenantPackageError?.code,
      "54000",
      "source Tenant must see and enforce the Package reservation already made by recipient Tenant",
    );
    quotaSnapshot = await readQuota("CROSS_TENANT_PACKAGE_DENIED", {
      tenantId: ids.sourceTenantId,
      storageRef: sourceStorageRef,
    });
    assert.equal(quotaSnapshot.max_environment_bytes, String(2 * reservationBlock));
    assert.equal(quotaSnapshot.max_package_bytes, String(reservationBlock));
    assert.equal(quotaSnapshot.environment_reserved, String(reservationBlock));
    assert.equal(quotaSnapshot.package_reserved, String(reservationBlock));
    assert.equal(quotaSnapshot.ref_reserved, "0");
    assert.equal(quotaSnapshot.reservation_rows, 0);

    // Restore headroom so later scope-denial probes do not pass only because
    // the shared Package is still at its deliberately reduced test cap.
    await setQuotaCaps(2 * reservationBlock, 2 * reservationBlock);

    const deniedBindings = await Promise.all([
      quotaRepository.reserve({ ...quotaInput, writerId: randomUUID(), deltaBytes: reservationBlock })
        .then(() => false, (error) => error instanceof TemporaryPayloadQuotaPersistenceError),
      quotaRepository.reserve({
        ...quotaInput,
        writerId: quotaWriterId,
        studyRefId: ids.studyRefId,
        deltaBytes: reservationBlock,
      })
        .then(() => false, (error) => error instanceof TemporaryPayloadQuotaPersistenceError),
      quotaRepository.reserve({
        ...quotaInput,
        writerId: quotaWriterId,
        tenantId: ids.otherTenantId,
        deltaBytes: reservationBlock,
      })
        .then(() => false, (error) => error instanceof TemporaryPayloadQuotaPersistenceError),
    ]);
    assert.deepEqual(deniedBindings, [true, true, true]);

    await beginTenant(privilegesClient, ids.tenantId);
    await privilegesClient.query(
      "UPDATE study_references SET temporary_payload_expires_at=now()-interval '1 second' WHERE study_ref_id=$1",
      [ids.siblingStudyRefId],
    );
    await privilegesClient.query("COMMIT");
    await assert.rejects(
      quotaRepository.reserve({ ...quotaInput, writerId: quotaWriterId, deltaBytes: reservationBlock }),
      TemporaryPayloadQuotaPersistenceError,
      "expired StudyReference storage must fail closed",
    );
    await beginTenant(privilegesClient, ids.tenantId);
    await privilegesClient.query(
      "UPDATE study_references SET temporary_payload_expires_at=now()+interval '1 hour' WHERE study_ref_id=$1",
      [ids.siblingStudyRefId],
    );
    await privilegesClient.query("COMMIT");

    const noTenantQuota = await privilegesClient.query(
      "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
      [ids.siblingStudyRefId, siblingRef, quotaWriterId, reservationBlock],
    ).then(() => null, (error) => error);
    assert.equal(noTenantQuota?.code, "42501", "quota function requires transaction-local Tenant context");
    await assert.rejects(
      privilegesClient.query("SELECT reserved_bytes FROM temporary_payload_quota_state"),
      (error) => error?.code === "42501",
      "runtime must not read quota counters directly",
    );
    const invalidDelta = await (async () => {
      await privilegesClient.query("BEGIN");
      await privilegesClient.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenantId]);
      return privilegesClient.query(
        "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,1)",
        [ids.siblingStudyRefId, siblingRef, quotaWriterId],
      ).then(() => null, (error) => error);
    })();
    assert.equal(invalidDelta?.code, "22023", "non-block quota deltas must be rejected by the fixed function");
    await privilegesClient.query("ROLLBACK").catch(() => undefined);

    const runtimeQuotaPrivileges = await privilegesClient.query(`
      SELECT has_function_privilege('mediq_runtime',
               'public.reserve_temporary_payload_quota(uuid,uuid,uuid,bigint)', 'EXECUTE') AS reserve,
             has_function_privilege('mediq_runtime',
               'public.settle_temporary_payload_quota(uuid,uuid,uuid,bigint)', 'EXECUTE') AS settle,
             has_function_privilege('mediq_runtime',
               'public.release_temporary_payload_quota(uuid,uuid)', 'EXECUTE') AS release,
             has_table_privilege('mediq_runtime','public.temporary_payload_quota_state','SELECT') AS state_select,
             has_table_privilege('mediq_runtime','public.temporary_payload_package_quotas','SELECT') AS package_select,
             has_table_privilege('mediq_runtime','public.temporary_payload_reservations','SELECT') AS ledger_select`);
    assert.deepEqual(runtimeQuotaPrivileges.rows[0], {
      reserve: true,
      settle: true,
      release: true,
      state_select: false,
      package_select: false,
      ledger_select: false,
    });

    // Restore the approved maxima and exercise the exact Package ceiling using
    // reservation counters (not 2 GiB of allocated DICOM bytes).
    await setQuotaCaps(10 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024);
    const fillQuota = await pool.connect();
    try {
      await beginTenant(fillQuota, ids.tenantId);
      for (let block = 1; block < 128; block += 1) {
        await fillQuota.query(
          "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
          [ids.siblingStudyRefId, siblingRef, quotaWriterId, reservationBlock],
        );
      }
      await fillQuota.query("SAVEPOINT over_package_cap");
      await assert.rejects(
        fillQuota.query(
          "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
          [ids.siblingStudyRefId, siblingRef, quotaWriterId, reservationBlock],
        ),
        (error) => error?.code === "54000",
        "the first reservation beyond the 2 GiB Package ceiling must fail closed",
      );
      await fillQuota.query("ROLLBACK TO SAVEPOINT over_package_cap");
      await fillQuota.query("RELEASE SAVEPOINT over_package_cap");
      await fillQuota.query("COMMIT");
    } finally {
      if (fillQuota.getTransactionStatus?.() !== 0) {
        await fillQuota.query("ROLLBACK").catch(() => undefined);
      }
      fillQuota.release();
    }
    quotaSnapshot = await readQuota("PACKAGE_CAP");
    assert.equal(quotaSnapshot.max_environment_bytes, "10737418240");
    assert.equal(quotaSnapshot.max_package_bytes, "2147483648");
    assert.equal(quotaSnapshot.environment_reserved, "2147483648");
    assert.equal(quotaSnapshot.package_reserved, "2147483648");
    assert.equal(quotaSnapshot.ref_reserved, "2147483648");
    assert.equal(quotaSnapshot.reservation_rows, 1);

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
    for (const [binding, storageRef] of [[bindingA, firstRef]]) {
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

    currentStage = "PHYSICAL_PURGE_RESTART_AND_AUDIT_RETRY";
    temporaryRoot = await mkdtemp(join(tmpdir(), "mediq-pacs-purge-"));
    const storageRoot = join(temporaryRoot, "ciphertext");
    const restartRef = siblingRef;
    const restartBinding = operationBinding(ids, opB, ids.siblingStudyRefId);

    const childFixture = JSON.stringify({
      rootDirectory: storageRoot,
      storageRef: restartRef,
      packageBinding: {
        tenantId: ids.tenantId,
        exchangeSessionId: ids.sessionId,
        packageId: ids.packageId,
        purpose: "PACS_IMPORT",
      },
      instanceBinding: {
        studyRefId: ids.siblingStudyRefId,
        seriesInstanceUid: "2.25.910001",
        sopInstanceUid: "2.25.910002",
      },
    });
    currentStage = "PHYSICAL_PURGE_CHILD_PROCESS";
    const childPath = fileURLToPath(new URL("../helpers/stage-temporary-payload-child.mjs", import.meta.url));
    const child = spawnSync(process.execPath, [childPath], {
      encoding: "utf8",
      env: { MEDIQ_TEMP_PAYLOAD_CHILD_FIXTURE: childFixture },
      maxBuffer: 1_000_000,
    });
    assert.equal(child.error, undefined, "synthetic payload child must start");
    assert.equal(child.status, 0, "synthetic payload child must stage successfully");
    const payloadDirectory = join(storageRoot, restartRef);
    const stagedFiles = await readdir(payloadDirectory);
    assert.equal(stagedFiles.length, 1);
    const ciphertext = await readFile(join(payloadDirectory, stagedFiles[0]));
    assert.equal(ciphertext.includes(Buffer.from("SYNTHETIC-PURGE-FIXTURE")), false);

    currentStage = "QUOTA_SETTLE_TO_SEALED_CIPHERTEXT_BYTES";
    const syntheticPayloadBytes = Buffer.byteLength("SYNTHETIC-PURGE-FIXTURE-NOT-REAL-DICOM-OR-PHI", "utf8");
    const settlementInput = { ...quotaInput, writerId: quotaWriterId, actualBytes: syntheticPayloadBytes };
    const beforeSettlementFailure = await readQuota("BEFORE_SETTLEMENT_FAILURE");
    const rollbackSettlementRepository = new PostgresTemporaryPayloadQuotaRepository({
      withTenant: (tenantId, work) => quotaTransactions.withTenant(tenantId, async (client) => {
        await work(client);
        // Fail inside the real transaction after the fixed function changed counters.
        await client.query("SELECT 1 / 0");
      }),
    });
    await assert.rejects(rollbackSettlementRepository.settle(settlementInput), TemporaryPayloadQuotaPersistenceError);
    assert.deepEqual(await readQuota("SETTLEMENT_ROLLED_BACK"), beforeSettlementFailure);

    const lostSettlementAckRepository = new PostgresTemporaryPayloadQuotaRepository({
      async withTenant(tenantId, work) {
        await quotaTransactions.withTenant(tenantId, work);
        throw new Error("injected acknowledgement loss after commit");
      },
    });
    await assert.rejects(lostSettlementAckRepository.settle(settlementInput), TemporaryPayloadQuotaPersistenceError);
    quotaSnapshot = await readQuota("SETTLED");
    assert.equal(quotaSnapshot.environment_reserved, String(syntheticPayloadBytes));
    assert.equal(quotaSnapshot.package_reserved, String(syntheticPayloadBytes));
    assert.equal(quotaSnapshot.ref_reserved, String(syntheticPayloadBytes));
    await quotaRepository.settle(settlementInput);
    assert.deepEqual(await readQuota("SETTLEMENT_IDENTICAL_RETRY"), quotaSnapshot);
    await assert.rejects(
      quotaRepository.settle({ ...settlementInput, actualBytes: syntheticPayloadBytes - 1 }),
      TemporaryPayloadQuotaPersistenceError,
      "a settled reservation cannot be changed by a different replay",
    );
    assert.deepEqual(await readQuota("SETTLEMENT_CHANGED_REPLAY_DENIED"), quotaSnapshot);
    await beginTenant(privilegesClient, ids.tenantId);
    await metadataRepository.markAvailable({ binding: bindingB, storageRef: siblingRef, now: new Date() });
    await privilegesClient.query("COMMIT");

    const restartedStore = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
    currentStage = "PHYSICAL_PURGE_RESTART_BOUNDARY";
    await assert.rejects(
      restartedStore.beginPackage({
        tenantId: ids.tenantId,
        exchangeSessionId: ids.sessionId,
        packageId: ids.packageId,
        purpose: "PACS_IMPORT",
      }),
      (error) => error?.code === "RECOVERY_REQUIRED",
    );
    const tenantRunner = {
      async run(_principal, tenantId, work) {
        const client = await pool.connect();
        try {
          await beginTenant(client, tenantId);
          const result = await work({
            issuer: "https://synthetic.test",
            subject: "synthetic-service",
            actorId: ids.actorId,
            tenantId,
            hospitalId: null,
            actorType: "SERVICE",
          }, client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      },
    };
    const purgeCommand = {
      principal: { issuer: "https://synthetic.test", subject: "synthetic-service" },
      tenantCandidate: ids.tenantId,
      binding: restartBinding,
      storageRef: restartRef,
      correlationId: randomUUID(),
      reason: "PROCESS_RESTART",
    };

    const failedStorageCoordinator = new TemporaryPayloadPurgeCoordinator(
      tenantRunner,
      { purgeByReference: async () => { throw new Error("injected unlink failure"); } },
    );
    currentStage = "PHYSICAL_PURGE_STORAGE_FAILURE_CALL";
    await assert.rejects(
      failedStorageCoordinator.purge(purgeCommand),
      TemporaryPayloadPurgeUnavailableError,
    );
    currentStage = "PHYSICAL_PURGE_STORAGE_FAILURE_STATE";
    let recoveredState = await readStudyState(privilegesClient, ids.tenantId, ids.siblingStudyRefId);
    assert.equal(recoveredState.temporary_payload_state, "PURGE_PENDING");
    assert.equal(recoveredState.temporary_storage_ref, restartRef);
    currentStage = "PHYSICAL_PURGE_STORAGE_FAILURE_FILE";
    assert.equal((await stat(join(payloadDirectory, stagedFiles[0]))).isFile(), true);

    const collisionCoordinator = new TemporaryPayloadPurgeCoordinator(
      tenantRunner,
      restartedStore,
      () => new Date(),
      () => collisionAuditId,
    );
    currentStage = "PHYSICAL_PURGE_AUDIT_FAILURE_RETRY";
    const failedConcurrentPurges = await Promise.allSettled([
      collisionCoordinator.purge(purgeCommand),
      collisionCoordinator.purge(purgeCommand),
    ]);
    assert.equal(failedConcurrentPurges.length, 2);
    assert.ok(failedConcurrentPurges.every(
      (result) => result.status === "rejected" && result.reason instanceof TemporaryPayloadPurgeUnavailableError,
    ));
    recoveredState = await readStudyState(privilegesClient, ids.tenantId, ids.siblingStudyRefId);
    assert.equal(recoveredState.temporary_payload_state, "PURGE_PENDING");
    assert.equal(recoveredState.temporary_storage_ref, restartRef);
    await assert.rejects(stat(payloadDirectory), (error) => error?.code === "ENOENT");
    quotaSnapshot = await readQuota("AUDIT_ROLLBACK");
    assert.equal(quotaSnapshot.environment_reserved, String(syntheticPayloadBytes));
    assert.equal(quotaSnapshot.package_reserved, String(syntheticPayloadBytes));
    assert.equal(quotaSnapshot.ref_reserved, String(syntheticPayloadBytes));
    assert.equal(quotaSnapshot.reservation_rows, 1, "Audit rollback must retain the retryable quota reservation");

    const beforeReleaseFailure = quotaSnapshot;
    for (const failurePoint of ["before-release", "after-release"]) {
      currentStage = `QUOTA_RELEASE_FAULT_${failurePoint}`;
      const failedReleaseAuditId = randomUUID();
      let releaseFaultInjected = false;
      const faultingRunner = {
        run(principal, tenantId, work) {
          return tenantRunner.run(principal, tenantId, (context, client) => work(context, {
            async query(sql, ...args) {
              if (typeof sql === "string" && sql.includes("public.release_temporary_payload_quota(")) {
                if (failurePoint === "after-release") await client.query(sql, ...args);
                releaseFaultInjected = true;
                // A real SQL error aborts the same Tenant transaction, including
                // the preceding PURGED update and, for after-release, quota effects.
                return client.query("SELECT 1 / 0");
              }
              return client.query(sql, ...args);
            },
          }));
        },
      };
      const faultingCoordinator = new TemporaryPayloadPurgeCoordinator(
        faultingRunner, restartedStore, () => new Date(), () => failedReleaseAuditId,
      );
      await assert.rejects(faultingCoordinator.purge(purgeCommand), (error) =>
        error instanceof TemporaryPayloadPurgeUnavailableError && error.phase === "FINALIZE_AUDIT");
      assert.equal(releaseFaultInjected, true);
      recoveredState = await readStudyState(privilegesClient, ids.tenantId, ids.siblingStudyRefId);
      assert.equal(recoveredState.temporary_payload_state, "PURGE_PENDING");
      assert.equal(recoveredState.temporary_storage_ref, restartRef);
      assert.equal(recoveredState.temporary_payload_purged_at, null);
      await assert.rejects(stat(payloadDirectory), (error) => error?.code === "ENOENT");
      assert.deepEqual(await readQuota(`RELEASE_${failurePoint}_ROLLBACK`), beforeReleaseFailure);
      const observer = await inspector.connect();
      try {
        await beginTenant(observer, ids.tenantId);
        const audit = await observer.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE audit_event_id=$1",
          [failedReleaseAuditId],
        );
        assert.equal(audit.rows[0].count, 0, "release failure must never commit a success Audit");
        await observer.query("COMMIT");
      } finally {
        await observer.query("ROLLBACK").catch(() => undefined);
        observer.release();
      }
    }

    const purgeAuditId = randomUUID();
    const successfulCoordinator = new TemporaryPayloadPurgeCoordinator(
      tenantRunner,
      restartedStore,
      () => new Date(),
      () => purgeAuditId,
    );
    currentStage = "QUOTA_RELEASE_AND_PHYSICAL_PURGE_CONCURRENT_CALL";
    const successfulConcurrentPurges = await Promise.all([
      successfulCoordinator.purge(purgeCommand),
      successfulCoordinator.purge(purgeCommand),
    ]);
    currentStage = "PHYSICAL_PURGE_CONCURRENT_RESULT_ASSERTION";
    assert.deepEqual(successfulConcurrentPurges.map((result) => result.kind).sort(), [
      "ALREADY_PURGED",
      "PURGED",
    ]);
    assert.deepEqual(await successfulCoordinator.purge(purgeCommand), { kind: "ALREADY_PURGED" });
    currentStage = "PHYSICAL_PURGE_FINAL_STATE_READ";
    recoveredState = await readStudyState(privilegesClient, ids.tenantId, ids.siblingStudyRefId);
    assert.equal(recoveredState.temporary_payload_state, "PURGED");
    assert.equal(recoveredState.temporary_storage_ref, restartRef);
    currentStage = "QUOTA_RELEASE_FINAL_COUNTER_READ";
    quotaSnapshot = await readQuota("PURGED");
    assert.equal(quotaSnapshot.environment_reserved, "0");
    assert.equal(quotaSnapshot.package_reserved, "0");
    assert.equal(quotaSnapshot.ref_reserved, "0");
    assert.equal(quotaSnapshot.reservation_rows, 0, "successful unlink plus PURGED/Audit must release quota atomically");
    currentStage = "PURGE_AUDIT_OBSERVATION";

    const purgeAuditObserver = await inspector.connect();
    let purgeAuditRows;
    try {
      await beginTenant(purgeAuditObserver, ids.tenantId);
      purgeAuditRows = await purgeAuditObserver.query(
        `SELECT action, result, reason_code
           FROM audit_events
          WHERE audit_event_id=$1 AND correlation_id=$2`,
        [purgeAuditId, purgeCommand.correlationId],
      );
      await purgeAuditObserver.query("COMMIT");
    } finally {
      if (purgeAuditObserver.getTransactionStatus?.() !== 0) {
        await purgeAuditObserver.query("ROLLBACK").catch(() => undefined);
      }
      purgeAuditObserver.release();
    }
    assert.deepEqual(purgeAuditRows.rows, [{
      action: "PACS_TEMPORARY_OBJECT_PURGED",
      result: "SUCCESS",
      reason_code: "PROCESS_RESTART",
    }]);
    assert.deepEqual(await readdir(storageRoot), []);

    const otherStudyStateBeforePurge = await readStudyState(
      privilegesClient,
      ids.tenantId,
      ids.studyRefId,
    );
    assert.equal(otherStudyStateBeforePurge.temporary_payload_state, "AVAILABLE");
    assert.equal(otherStudyStateBeforePurge.temporary_storage_ref, firstRef);

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
    assert.equal(siblingAfterPurge.temporary_payload_state, "PURGED");
    assert.equal(siblingAfterPurge.temporary_storage_ref, restartRef);

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

    currentStage = "QUOTA_EXACT_10_GIB_ENVIRONMENT_CEILING_SETUP";
    const environmentLimitBytes = 10 * 1024 * 1024 * 1024;
    const packageLimitBytes = 2 * 1024 * 1024 * 1024;
    const blocksPerPackage = packageLimitBytes / reservationBlock;
    await setQuotaCaps(environmentLimitBytes, packageLimitBytes);
    quotaSnapshot = await readQuota("ENVIRONMENT_EXACT_BASELINE");
    assert.equal(quotaSnapshot.environment_reserved, "0", "exact environment test must start with an empty quota ledger");
    assert.equal(quotaSnapshot.reservation_rows, 0);

    async function prepareEnvironmentQuotaTarget(target) {
      const targetIds = {
        ...ids,
        tenantId: target.tenantId,
        actorId: target.actorId,
        sessionId: target.sessionId,
        packageId: target.packageId,
      };
      const operation = await createOperation(privilegesClient, targetIds, target.studyRefId);
      const binding = operationBinding(targetIds, operation, target.studyRefId);
      const storageRef = randomUUID();
      const targetWriterId = randomUUID();
      const metadataClient = await pool.connect();
      try {
        await beginTenant(metadataClient, targetIds.tenantId);
        await new PostgresTemporaryPayloadMetadataRepository(metadataClient)
          .reserveStaging(reserveInput(binding, storageRef, 60 * 60 * 1000));
        await metadataClient.query("COMMIT");
      } catch (error) {
        await metadataClient.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        metadataClient.release();
      }
      return {
        tenantId: targetIds.tenantId,
        actorId: targetIds.actorId,
        packageId: targetIds.packageId,
        studyRefId: target.studyRefId,
        binding,
        storageRef,
        writerId: targetWriterId,
      };
    }

    const environmentFillTargets = [];
    for (const target of ids.quotaEnvironmentFillTargets) {
      environmentFillTargets.push(await prepareEnvironmentQuotaTarget(target));
    }
    const environmentProbe = await prepareEnvironmentQuotaTarget(ids.quotaEnvironmentProbe);
    assert.equal(new Set(environmentFillTargets.map((target) => target.packageId)).size, 5);
    assert.equal(new Set(environmentFillTargets.map((target) => target.studyRefId)).size, 5);
    assert.equal(new Set([...environmentFillTargets, environmentProbe].map((target) => target.storageRef)).size, 6);

    currentStage = "QUOTA_EXACT_10_GIB_ENVIRONMENT_CEILING_FILL";
    const exactFillClient = await pool.connect();
    try {
      await beginTenant(exactFillClient, ids.tenantId);
      for (const target of environmentFillTargets) {
        assert.equal(target.tenantId, ids.tenantId, "all exact-cap fixtures use one verified Tenant context");
        for (let block = 0; block < blocksPerPackage; block += 1) {
          await exactFillClient.query(
            "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
            [target.studyRefId, target.storageRef, target.writerId, reservationBlock],
          );
        }
      }
      await exactFillClient.query("COMMIT");
    } catch (error) {
      await exactFillClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      exactFillClient.release();
    }

    currentStage = "QUOTA_EXACT_10_GIB_ENVIRONMENT_CEILING_ASSERT";
    for (const target of environmentFillTargets) {
      quotaSnapshot = await readQuota("ENVIRONMENT_PACKAGE_FULL", {
        tenantId: target.tenantId,
        packageId: target.packageId,
        storageRef: target.storageRef,
      });
      assert.equal(quotaSnapshot.max_environment_bytes, String(environmentLimitBytes));
      assert.equal(quotaSnapshot.max_package_bytes, String(packageLimitBytes));
      assert.equal(quotaSnapshot.environment_reserved, String(environmentLimitBytes));
      assert.equal(quotaSnapshot.package_reserved, String(packageLimitBytes));
      assert.equal(quotaSnapshot.ref_reserved, String(packageLimitBytes));
      assert.equal(quotaSnapshot.reservation_rows, 5);
    }

    currentStage = "QUOTA_EXACT_10_GIB_ENVIRONMENT_OVERFLOW_DENIAL";
    const overflowClient = await pool.connect();
    let environmentOverflowError;
    try {
      await beginTenant(overflowClient, environmentProbe.tenantId);
      await overflowClient.query("SAVEPOINT quota_environment_overflow_probe");
      environmentOverflowError = await overflowClient.query(
        "SELECT public.reserve_temporary_payload_quota($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
        [environmentProbe.studyRefId, environmentProbe.storageRef, environmentProbe.writerId, reservationBlock],
      ).then(() => null, (error) => error);
      await overflowClient.query("ROLLBACK TO SAVEPOINT quota_environment_overflow_probe");
      await overflowClient.query("RELEASE SAVEPOINT quota_environment_overflow_probe");
      await overflowClient.query("COMMIT");
    } finally {
      if (overflowClient.getTransactionStatus?.() !== 0) {
        await overflowClient.query("ROLLBACK").catch(() => undefined);
      }
      overflowClient.release();
    }
    assert.equal(environmentOverflowError?.code, "54000",
      "the next valid 16 MiB reservation must be rejected by the exact 10 GiB environment cap");
    quotaSnapshot = await readQuota("ENVIRONMENT_OVERFLOW_DENIED", {
      tenantId: environmentProbe.tenantId,
      packageId: environmentProbe.packageId,
      storageRef: environmentProbe.storageRef,
    });
    assert.equal(quotaSnapshot.environment_reserved, String(environmentLimitBytes));
    assert.equal(quotaSnapshot.package_reserved, "0", "probe Package must have headroom to isolate environment denial");
    assert.equal(quotaSnapshot.ref_reserved, "0");
    assert.equal(quotaSnapshot.reservation_rows, 5, "rejected overflow must not create a ledger row");

    currentStage = "QUOTA_EXACT_10_GIB_ENVIRONMENT_FIXTURE_PURGE";
    for (const target of [...environmentFillTargets, environmentProbe]) {
      await assert.rejects(
        stat(join(storageRoot, target.storageRef)),
        (error) => error?.code === "ENOENT",
        "quota-only fixture must not have created any ciphertext file",
      );
      await beginTenant(privilegesClient, target.tenantId);
      await metadataRepository.markPurgePending({
        binding: target.binding,
        storageRef: target.storageRef,
      });
      const finalized = await metadataRepository.finalizePurgeAndAudit({
        binding: target.binding,
        storageRef: target.storageRef,
        actorId: target.actorId,
        correlationId: randomUUID(),
        auditEventId: randomUUID(),
        reason: "CAPTURE_FAILURE",
        now: new Date(),
      });
      assert.equal(finalized, "PURGED");
      await privilegesClient.query("COMMIT");
    }
    quotaSnapshot = await readQuota("ENVIRONMENT_TEST_CLEANUP");
    assert.equal(quotaSnapshot.environment_reserved, "0", "product purge path must restore the pre-test environment quota");
    assert.equal(quotaSnapshot.reservation_rows, 0);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : error instanceof TemporaryPayloadPurgeUnavailableError
          ? `PURGE_${error.phase}`
        : error instanceof Error
          ? error.name
          : "UNKNOWN";
    throw new Error(`TEMP_PAYLOAD_STAGE=${currentStage} code=${code}`);
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
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
