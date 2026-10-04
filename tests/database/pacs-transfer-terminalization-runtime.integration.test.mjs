import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import { PostgresProvenanceRepository } from "../../services/api/dist/provenance/persistence/postgres-provenance.repository.js";
import { PostgresSourceIntegrityEvidenceRepository } from "../../services/api/dist/integrity/persistence/postgres-source-integrity-evidence.repository.js";

function fixture() {
  const raw = process.env.MEDIQ_PACS_TERMINALIZATION_TEST_FIXTURE;
  assert.ok(raw, "TERM020_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "studyRefId",
    "consentId", "grantId",
  ];
  assert.ok(required.every((key) => typeof value[key] === "string"), "TERM020_FIXTURE_INVALID");
  return value;
}

async function beginTenant(client, tenantId) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
}

function transition(operation, nextState, reasonCode, extra = {}) {
  return operation.transitionTo({
    nextState,
    reasonCode,
    now: new Date(operation.snapshot.updatedAt.getTime() + 10),
    ...extra,
  });
}

async function expectTerminalGuardDenial(client, savepoint, sql, values, constraint) {
  const probe = {
    term020_provenance_missing_facts: "PROVENANCE",
    term020_operation_missing_facts: "OPERATION",
    term020_session_missing_facts: "SESSION",
  }[savepoint];
  assert.ok(probe, "TERM020_UNKNOWN_GUARD_PROBE");
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await client.query(sql, values);
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!rejection) {
    console.error(`TERM020_GUARD=${probe}_NOT_REJECTED`);
    throw new Error(`TERM020_GUARD_${probe}_NOT_REJECTED`);
  }
  if (rejection?.code !== "23514" || rejection?.constraint !== constraint) {
    const category = rejection?.code === "23514"
      ? "23514_UNEXPECTED_CONSTRAINT"
      : ({
          "42501": "INSUFFICIENT_PRIVILEGE",
          "25P02": "TRANSACTION_ABORTED",
          "23505": "UNIQUE_VIOLATION",
        }[rejection?.code] ?? "OTHER_SQLSTATE");
    console.error(`TERM020_GUARD=${probe}_${category}`);
    throw new Error(`TERM020_GUARD_${probe}_${category}`);
  }
  console.error(`TERM020_GUARD=${probe}_EXPECTED`);
}

async function insertTerminalAudit(client, ids, operationId, event, correlationId) {
  const occurredAt = new Date();
  return client.query(
    `INSERT INTO audit_events
      (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id,
       resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUCCESS', $9, $10, $2)`,
    [randomUUID(), occurredAt, ids.actorId, ids.tenantId, ids.sessionId,
      event.resourceType, event.resourceId(operationId, ids), event.action,
      event.reasonCode, correlationId],
  );
}

async function expectAuditCorrelationGuardDenial(client, savepoint, ids, operationId, event, correlationId) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await insertTerminalAudit(client, ids, operationId, event, correlationId);
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.equal(rejection?.code, "23514", "TERM027_AUDIT_CORRELATION_SQLSTATE_INVALID");
  assert.equal(rejection?.constraint, "audit_events_terminal_correlation_guard",
    "TERM027_AUDIT_CORRELATION_CONSTRAINT_INVALID");
}

test("TERM-020 denies incomplete Provenance, operation and Session terminal writes under runtime RLS", {
  timeout: 30_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  const inspectionConnectionString = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(connectionString, "TERM020_RUNTIME_DATABASE_URL_MISSING");
  assert.ok(inspectionConnectionString, "TERM020_INSPECT_DATABASE_URL_MISSING");
  const ids = fixture();
  const runtime = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  const inspector = new Pool({ connectionString: inspectionConnectionString, max: 1, connectionTimeoutMillis: 5000 });
  let client;
  let fixtureOperationId;
  let stage = "RUNTIME_CONNECT";
  try {
    client = await runtime.connect();
    stage = "RUNTIME_ROLE_CHECK";
    const role = await client.query(`
      SELECT current_user AS role_name,
             (SELECT count(*)::int FROM information_schema.column_privileges
               WHERE grantee='mediq_runtime' AND table_schema='public') AS column_privileges,
             (SELECT count(*)::int FROM information_schema.table_privileges
               WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public') AS table_privileges,
             (SELECT array_agg(table_name || '.' || column_name ORDER BY table_name, column_name)
                FROM information_schema.column_privileges
               WHERE grantee='mediq_runtime' AND table_schema='public'
                 AND privilege_type='UPDATE'
                 AND ((table_name='provenance_records' AND column_name IN
                       ('transfer_status','ingested_at','transferred_at'))
                   OR (table_name='exchange_sessions' AND column_name='completed_at'))) AS terminal_update_columns
    `);
    assert.equal(role.rows[0].role_name, "mediq_runtime", "TERM020_RUNTIME_ROLE_MISMATCH");
    assert.equal(role.rows[0].column_privileges, 262, "TERM020_EXACT_PRIVILEGE_COUNT_MISMATCH");
    assert.equal(role.rows[0].table_privileges, 0, "TERM020_TABLE_PRIVILEGE_PRESENT");
    assert.deepEqual(role.rows[0].terminal_update_columns, [
      "exchange_sessions.completed_at",
      "provenance_records.ingested_at",
      "provenance_records.transfer_status",
      "provenance_records.transferred_at",
    ]);
    stage = "RUNTIME_ROLE_VERIFIED";

    const createdAt = new Date();
    const draft = PacsTransferOperation.create({
      operationId: randomUUID(),
      semantics: {
        tenantId: ids.tenantId,
        actorId: ids.actorId,
        exchangeSessionId: ids.sessionId,
        studyRefId: ids.studyRefId,
        consentId: ids.consentId,
        grantId: ids.grantId,
        action: "PACS_IMPORT",
      },
      idempotencyKey: randomUUID(),
      now: createdAt,
    });
    fixtureOperationId = draft.snapshot.operationId;

    stage = "FIXTURE_OPERATION_CREATE";
    await beginTenant(client, ids.tenantId);
    const created = await new PostgresPacsTransferOperationRepository(client)
      .createIdempotently({ operation: draft, correlationId: randomUUID() });
    assert.equal(created.created, true, "TERM020_OPERATION_FIXTURE_NOT_CREATED");

    stage = "FIXTURE_SOURCE_EVIDENCE_CREATE";
    const source = await new PostgresSourceIntegrityEvidenceRepository(client)
      .createPendingSourceCapture({
        operationId: fixtureOperationId,
        manifest: {
          algorithm: "SHA256-MANIFEST-V1",
          aggregateDigest: `sha256:${"a".repeat(64)}`,
          objectCount: 1,
          totalBytes: 1024,
        },
        now: new Date(),
      });
    assert.equal(source.created, true, "TERM020_SOURCE_FIXTURE_NOT_CREATED");

    stage = "FIXTURE_PROVENANCE_CREATE";
    const provenance = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({ operationId: fixtureOperationId, now: new Date() });
    assert.equal(provenance.created, true, "TERM020_PROVENANCE_FIXTURE_NOT_CREATED");

    stage = "OPERATION_TRANSITIONS";
    let operation = created.operation;
    let next = transition(operation, "PREFLIGHT_PASSED", "PREFLIGHT_PASSED");
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    next = transition(operation, "STOW_STARTED", "STOW_STARTED");
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    next = transition(operation, "VERIFYING", "VERIFYING", { sourceObjectCount: 1 });
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    assert.equal(operation.snapshot.state, "VERIFYING");
    assert.equal(operation.snapshot.version, 3);
    await client.query("COMMIT");
    stage = "VERIFYING_FIXTURE_COMMITTED";

    stage = "NO_CONTEXT_RLS_PROBE";
    const noContext = await client.query(
      `UPDATE provenance_records SET transfer_status='COMPLETED'
        WHERE operation_id=$1 RETURNING provenance_id`,
      [fixtureOperationId],
    );
    assert.equal(noContext.rowCount, 0, "TERM020_MISSING_TENANT_CONTEXT_NOT_DENIED");

    stage = "WRONG_TENANT_RLS_PROBE";
    await beginTenant(client, ids.otherTenantId);
    const wrongTenant = await client.query(
      `UPDATE provenance_records SET transfer_status='COMPLETED'
        WHERE operation_id=$1 RETURNING provenance_id`,
      [fixtureOperationId],
    );
    assert.equal(wrongTenant.rowCount, 0, "TERM020_CROSS_TENANT_WRITE_NOT_DENIED");
    await client.query("COMMIT");

    stage = "PROVENANCE_TERMINAL_GUARD_PROBE";
    await beginTenant(client, ids.tenantId);
    await expectTerminalGuardDenial(
      client,
      "term020_provenance_missing_facts",
      `UPDATE provenance_records AS provenance
          SET transfer_status='COMPLETED', ingested_at=stamp.completed_at,
              transferred_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE provenance.operation_id=$1`,
      [fixtureOperationId],
      "provenance_records_terminalization_guard",
    );
    stage = "OPERATION_TERMINAL_GUARD_PROBE";
    await expectTerminalGuardDenial(
      client,
      "term020_operation_missing_facts",
      `UPDATE pacs_transfer_operations AS operation
          SET state='COMPLETED', version=4, reason_code='COMPLETED',
              destination_object_count=operation.source_object_count,
              updated_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE operation.operation_id=$1`,
      [fixtureOperationId],
      "pacs_transfer_operations_completion_guard",
    );
    stage = "SESSION_TERMINAL_GUARD_PROBE";
    await expectTerminalGuardDenial(
      client,
      "term020_session_missing_facts",
      `UPDATE exchange_sessions AS session
          SET state='COMPLETED', updated_at=stamp.completed_at,
              completed_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE session.session_id=$1`,
      [ids.sessionId],
      "exchange_sessions_terminal_completion_guard",
    );
    await client.query("COMMIT");

    stage = "TERMINAL_AUDIT_CORRELATION_CONTEXT_PROBE";
    const terminalEvents = [
      { action: "PACS_TRANSFER_COMPLETED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "INTEGRITY_VERIFIED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", resourceType: "PACS_TRANSFER_OPERATION",
        reasonCode: "COMPLETED", resourceId: (operationId) => operationId },
      { action: "SESSION_COMPLETED", resourceType: "EXCHANGE_SESSION", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.sessionId },
    ];
    await beginTenant(client, ids.tenantId);
    for (const [eventIndex, event] of terminalEvents.entries()) {
      for (const [modeIndex, mode] of ["MISSING", "MALFORMED", "MISMATCH"].entries()) {
        const expectedCorrelationId = randomUUID();
        let actualCorrelationId = randomUUID();
        if (mode === "MISMATCH" && actualCorrelationId === expectedCorrelationId) {
          actualCorrelationId = randomUUID();
        }
        const settingValue = mode === "MISSING" ? "" :
          mode === "MALFORMED" ? "not-a-uuid" : expectedCorrelationId;
        await client.query(
          "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
          [settingValue],
        );
        await expectAuditCorrelationGuardDenial(
          client,
          `term_corr_${eventIndex}_${modeIndex}`,
          ids,
          fixtureOperationId,
          event,
          actualCorrelationId,
        );
      }

      const matchingCorrelationId = randomUUID();
      await client.query(
        "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
        [matchingCorrelationId],
      );
      const matching = await insertTerminalAudit(
        client, ids, fixtureOperationId, event, matchingCorrelationId,
      );
      assert.equal(matching.rowCount, 1, "TERM027_MATCHING_TERMINAL_AUDIT_REJECTED");
    }
    const rolledBackCorrelationId = randomUUID();
    await client.query(
      "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
      [rolledBackCorrelationId],
    );
    await client.query("ROLLBACK");
    const rollbackSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(rollbackSetting.rows[0]?.value, rolledBackCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_AFTER_ROLLBACK");

    stage = "TERMINAL_AUDIT_CORRELATION_COMMIT_RESET_PROBE";
    await beginTenant(client, ids.tenantId);
    const committedCorrelationId = randomUUID();
    await client.query(
      "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
      [committedCorrelationId],
    );
    await client.query("COMMIT");
    const commitSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(commitSetting.rows[0]?.value, committedCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_AFTER_COMMIT");
    client.release();
    client = await runtime.connect();
    const pooledSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(pooledSetting.rows[0]?.value, committedCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_THROUGH_POOL_REUSE");

    stage = "INDEPENDENT_OBSERVER_QUERY";
    const observed = await inspector.query(`
      SELECT operation.state, operation.version, operation.destination_object_count,
             provenance.transfer_status, provenance.ingested_at, provenance.transferred_at,
             session.state AS session_state, session.completed_at,
             (SELECT count(*)::int FROM audit_events AS audit
               WHERE audit.tenant_id=operation.tenant_id
                 AND audit.exchange_session_id=operation.exchange_session_id
                 AND ((audit.resource_type='STUDY'
                       AND audit.resource_id=operation.study_ref_id
                       AND audit.action IN ('PACS_TRANSFER_COMPLETED','INTEGRITY_VERIFIED'))
                   OR (audit.resource_type='PACS_TRANSFER_OPERATION'
                       AND audit.resource_id=operation.operation_id
                       AND audit.reason_code='COMPLETED')
                   OR (audit.resource_type='EXCHANGE_SESSION'
                       AND audit.resource_id=operation.exchange_session_id
                       AND audit.action='SESSION_COMPLETED'))) AS terminal_audit_count,
             (SELECT count(*)::int FROM integrity_evidence AS destination
               WHERE destination.operation_id=operation.operation_id
                 AND destination.verification_stage='DESTINATION_VERIFY') AS destination_evidence_count
        FROM pacs_transfer_operations AS operation
        JOIN provenance_records AS provenance ON provenance.operation_id=operation.operation_id
        JOIN exchange_sessions AS session ON session.session_id=operation.exchange_session_id
       WHERE operation.operation_id=$1`,
    [fixtureOperationId]);
    assert.equal(observed.rowCount, 1, "TERM020_INDEPENDENT_OBSERVER_ROW_MISSING");
    assert.deepEqual(observed.rows[0], {
      state: "VERIFYING",
      version: 3,
      destination_object_count: null,
      transfer_status: "PENDING",
      ingested_at: null,
      transferred_at: null,
      session_state: "ACTIVE",
      completed_at: null,
      terminal_audit_count: 0,
      destination_evidence_count: 0,
    });
    stage = "INDEPENDENT_OBSERVER_CONFIRMED";
    console.error(`TERM020_STAGE=${stage}`);
  } catch (error) {
    console.error(`TERM020_STAGE=${stage}`);
    throw error;
  } finally {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* cleanup only */ }
      client.release();
    }
    await runtime.end();
    await inspector.end();
  }
});
