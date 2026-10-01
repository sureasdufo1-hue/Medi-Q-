import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import {
  PacsTransferOperationConcurrencyError,
  PacsTransferOperationConflictError,
  PacsTransferOperationPersistenceError,
} from "../../services/api/dist/pacs/persistence/pacs-transfer-operation.repository.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";

function fixture() {
  if (!process.env.MEDIQ_PACS007_TEST_FIXTURE) {
    throw new Error("PACS007_FIXTURE_MISSING");
  }
  const value = JSON.parse(process.env.MEDIQ_PACS007_TEST_FIXTURE);
  const required = ["tenantId", "otherTenantId", "actorId", "sessionId", "studyRefId", "consentId", "grantId"];
  if (required.some((key) => typeof value[key] !== "string")) {
    throw new Error("PACS007_FIXTURE_INVALID");
  }
  return value;
}

function makeOperation(ids, overrides = {}) {
  const semantics = overrides.semantics ?? {
    tenantId: ids.tenantId,
    actorId: ids.actorId,
    exchangeSessionId: ids.sessionId,
    studyRefId: ids.studyRefId,
    consentId: ids.consentId,
    grantId: ids.grantId,
    action: "PACS_IMPORT",
  };
  return PacsTransferOperation.create({
    operationId: randomUUID(),
    semantics,
    idempotencyKey: ids.idempotencyKey ?? randomUUID(),
    now: new Date(),
    ...(overrides.idempotencyKey ? { idempotencyKey: overrides.idempotencyKey } : {}),
  });
}

async function beginTenant(client, tenantId) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
}

test("PACS-007 runtime persistence, idempotency, CAS, RLS and atomic Audit boundary", {
  timeout: 30_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("PACS007_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  let client;
  let contender;
  try {
    client = await pool.connect();

    const noContext = await client.query(
      "SELECT operation_id FROM pacs_transfer_operations WHERE exchange_session_id=$1",
      [ids.sessionId],
    );
    assert.equal(noContext.rowCount, 0, "missing Tenant context must fail closed");

    await beginTenant(client, ids.tenantId);
    const repository = new PostgresPacsTransferOperationRepository(client);
    const operation = makeOperation(ids);
    const created = await repository.createIdempotently({
      operation,
      correlationId: randomUUID(),
    });
    assert.equal(created.created, true);
    assert.equal(created.operation.snapshot.state, "CREATED");
    await client.query("SAVEPOINT direct_state_guard_probe");
    await assert.rejects(
      client.query(
        `UPDATE pacs_transfer_operations
            SET state='STOW_STARTED', version=version+1,
                stow_started_at=now(), updated_at=now()
          WHERE operation_id=$1`,
        [operation.snapshot.operationId],
      ),
      (error) => error?.code === "23514",
      "database trigger must reject bypassing Mandatory Preflight state",
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_state_guard_probe");
    await client.query("RELEASE SAVEPOINT direct_state_guard_probe");
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    const replay = await new PostgresPacsTransferOperationRepository(
      client,
    ).createIdempotently({
      operation: makeOperation(ids, {
        idempotencyKey: operation.snapshot.idempotencyKey,
      }),
      correlationId: randomUUID(),
    });
    assert.equal(replay.created, false, "an exact replay returns the durable record");
    assert.equal(replay.operation.snapshot.operationId, operation.snapshot.operationId);

    await assert.rejects(
      new PostgresPacsTransferOperationRepository(client).createIdempotently({
        operation: makeOperation(ids, {
          idempotencyKey: operation.snapshot.idempotencyKey,
          semantics: {
            tenantId: ids.tenantId,
            actorId: ids.actorId,
            exchangeSessionId: ids.sessionId,
            studyRefId: ids.studyRefId,
            consentId: ids.consentId,
            grantId: randomUUID(),
            action: "PACS_IMPORT",
          },
        }),
        correlationId: randomUUID(),
      }),
      PacsTransferOperationConflictError,
    );
    await assert.rejects(
      new PostgresPacsTransferOperationRepository(client).createIdempotently({
        operation: makeOperation(ids),
        correlationId: randomUUID(),
      }),
      PacsTransferOperationConflictError,
    );
    await client.query("COMMIT");

    const preflight = operation.transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(operation.snapshot.updatedAt.getTime() + 1),
    });
    contender = await pool.connect();
    await beginTenant(client, ids.tenantId);
    const claimed = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation,
      next: preflight,
      correlationId: randomUUID(),
    });

    await beginTenant(contender, ids.tenantId);
    const competingClaim = new PostgresPacsTransferOperationRepository(
      contender,
    ).transition({
      current: operation,
      next: preflight,
      correlationId: randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.query("COMMIT");
    await assert.rejects(competingClaim, PacsTransferOperationConcurrencyError);
    await contender.query("ROLLBACK");
    client.release();
    contender.release();
    client = undefined;
    contender = undefined;

    client = await pool.connect();
    await beginTenant(client, ids.tenantId);
    const currentResult = await client.query(
      `SELECT operation_id, tenant_id, exchange_session_id, study_ref_id,
              actor_id, idempotency_key, request_digest, state, version,
              reason_code, source_object_count, destination_object_count,
              created_at, updated_at, stow_started_at
         FROM pacs_transfer_operations WHERE operation_id=$1`,
      [operation.snapshot.operationId],
    );
    assert.equal(currentResult.rowCount, 1);
    assert.equal(currentResult.rows[0].state, "PREFLIGHT_PASSED");

    const current = PacsTransferOperation.reconstitute({
      operationId: currentResult.rows[0].operation_id,
      tenantId: currentResult.rows[0].tenant_id,
      exchangeSessionId: currentResult.rows[0].exchange_session_id,
      studyRefId: currentResult.rows[0].study_ref_id,
      actorId: currentResult.rows[0].actor_id,
      idempotencyKey: currentResult.rows[0].idempotency_key,
      requestDigest: currentResult.rows[0].request_digest,
      state: currentResult.rows[0].state,
      version: currentResult.rows[0].version,
      reasonCode: currentResult.rows[0].reason_code,
      sourceObjectCount: currentResult.rows[0].source_object_count,
      destinationObjectCount: currentResult.rows[0].destination_object_count,
      createdAt: currentResult.rows[0].created_at,
      updatedAt: currentResult.rows[0].updated_at,
      stowStartedAt: currentResult.rows[0].stow_started_at,
    });
    const dispatch = current.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(current.snapshot.updatedAt.getTime() + 1),
      reasonCode: "AUDIT_FAIL_TEST",
    });
    await assert.rejects(
      new PostgresPacsTransferOperationRepository(client).transition({
        current,
        next: dispatch,
        correlationId: randomUUID(),
      }),
      PacsTransferOperationPersistenceError,
    );
    const unchanged = await client.query(
      "SELECT state, version FROM pacs_transfer_operations WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.deepEqual(unchanged.rows[0], { state: "PREFLIGHT_PASSED", version: 1 });
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    const read = await client.query(
      `SELECT operation_id, tenant_id, exchange_session_id, study_ref_id,
              actor_id, idempotency_key, request_digest, state, version,
              reason_code, source_object_count, destination_object_count,
              created_at, updated_at, stow_started_at
         FROM pacs_transfer_operations WHERE operation_id=$1`,
      [operation.snapshot.operationId],
    );
    const beforeDispatch = PacsTransferOperation.reconstitute({
      operationId: read.rows[0].operation_id,
      tenantId: read.rows[0].tenant_id,
      exchangeSessionId: read.rows[0].exchange_session_id,
      studyRefId: read.rows[0].study_ref_id,
      actorId: read.rows[0].actor_id,
      idempotencyKey: read.rows[0].idempotency_key,
      requestDigest: read.rows[0].request_digest,
      state: read.rows[0].state,
      version: read.rows[0].version,
      reasonCode: read.rows[0].reason_code,
      sourceObjectCount: read.rows[0].source_object_count,
      destinationObjectCount: read.rows[0].destination_object_count,
      createdAt: read.rows[0].created_at,
      updatedAt: read.rows[0].updated_at,
      stowStartedAt: read.rows[0].stow_started_at,
    });
    const dispatchClaim = beforeDispatch.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(beforeDispatch.snapshot.updatedAt.getTime() + 1),
      reasonCode: "DISPATCH_CLAIMED",
    });
    const started = await new PostgresPacsTransferOperationRepository(client).transition({
      current: beforeDispatch,
      next: dispatchClaim,
      correlationId: randomUUID(),
    });
    const unknown = started.transitionTo({
      nextState: "RESULT_UNKNOWN",
      now: new Date(started.snapshot.updatedAt.getTime() + 1),
      reasonCode: "UPSTREAM_RESPONSE_UNKNOWN",
    });
    await new PostgresPacsTransferOperationRepository(client).transition({
      current: started,
      next: unknown,
      correlationId: randomUUID(),
    });
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    const durableUnknown = await client.query(
      "SELECT state, version FROM pacs_transfer_operations WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.deepEqual(durableUnknown.rows[0], { state: "RESULT_UNKNOWN", version: 3 });
    assert.throws(
      () => unknown.transitionTo({
        nextState: "STOW_STARTED",
        now: new Date(unknown.snapshot.updatedAt.getTime() + 1),
      }),
      /PACS_TRANSFER_OPERATION_TRANSITION_INVALID/,
    );
    await client.query("COMMIT");

    await beginTenant(client, ids.otherTenantId);
    const crossTenant = await client.query(
      "SELECT operation_id FROM pacs_transfer_operations WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(crossTenant.rowCount, 0, "cross-Tenant reads must return no operation");
    await assert.rejects(
      client.query(
        "UPDATE pacs_transfer_operations SET tenant_id=$1 WHERE operation_id=$2",
        [ids.otherTenantId, operation.snapshot.operationId],
      ),
      (error) => error?.code === "42501",
      "runtime must not update immutable Tenant binding",
    );
    await client.query("ROLLBACK");
  } finally {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* cleanup only */ }
      client.release();
    }
    if (contender) {
      try { await contender.query("ROLLBACK"); } catch { /* cleanup only */ }
      contender.release();
    }
    await pool.end();
  }
});
