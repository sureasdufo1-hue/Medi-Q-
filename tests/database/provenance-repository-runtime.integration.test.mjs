import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import {
  ProvenanceUnavailableError,
} from "../../services/api/dist/provenance/persistence/provenance.repository.js";
import { PostgresProvenanceRepository } from "../../services/api/dist/provenance/persistence/postgres-provenance.repository.js";

function fixture() {
  if (!process.env.MEDIQ_PROV001_TEST_FIXTURE) {
    throw new Error("PROV001_FIXTURE_MISSING");
  }
  const value = JSON.parse(process.env.MEDIQ_PROV001_TEST_FIXTURE);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "studyRefId",
    "lateStudyRefId", "sourceHospitalId", "destinationHospitalId",
  ];
  if (required.some((key) => typeof value[key] !== "string")) {
    throw new Error("PROV001_FIXTURE_INVALID");
  }
  return value;
}

function makeOperation(ids, studyRefId = ids.studyRefId) {
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

async function persistOperation(client, ids, studyRefId) {
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

test("PROV-001 operation-bound pending Provenance PostgreSQL/RLS Acceptance", {
  timeout: 30_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("PROV001_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  let client;
  try {
    client = await pool.connect();

    const privileges = await client.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='SELECT')::int AS provenance_select,
        count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='INSERT')::int AS provenance_insert,
        count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='UPDATE')::int AS provenance_update,
        array_agg(column_name::text ORDER BY column_name::text) FILTER (WHERE table_name='provenance_records' AND privilege_type='UPDATE') AS provenance_update_columns,
        count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='DELETE')::int AS provenance_delete
      FROM information_schema.column_privileges
      WHERE grantee='mediq_runtime' AND table_schema='public'`);
    assert.deepEqual(privileges.rows[0], {
      total: 262,
      provenance_select: 13,
      provenance_insert: 13,
      provenance_update: 4,
      provenance_update_columns: ["ingested_at", "integrity_id", "transfer_status", "transferred_at"],
      provenance_delete: 0,
    });
    const tablePrivileges = await client.query(`
      SELECT count(*)::int AS total FROM information_schema.table_privileges
      WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public'`);
    assert.equal(tablePrivileges.rows[0].total, 0);

    const noContext = await client.query(
      "SELECT operation_id FROM pacs_transfer_operations WHERE exchange_session_id=$1",
      [ids.sessionId],
    );
    assert.equal(noContext.rowCount, 0);

    const operation = await persistOperation(client, ids, ids.studyRefId);

    await assert.rejects(
      new PostgresProvenanceRepository(client).createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(),
      }),
      ProvenanceUnavailableError,
      "missing Tenant context must not create or reveal Provenance",
    );
    const unscopedProvenance = await client.query(
      "SELECT provenance_id FROM provenance_records WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(unscopedProvenance.rowCount, 0);

    await beginTenant(client, ids.tenantId);
    const rollbackProbe = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(),
      });
    assert.equal(rollbackProbe.created, true);
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    const afterRollback = await client.query(
      "SELECT provenance_id FROM provenance_records WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(afterRollback.rowCount, 0, "caller rollback removes row");
    const created = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(),
      });
    assert.equal(created.created, true);
    assert.equal(created.record.operationId, operation.snapshot.operationId);
    assert.equal(created.record.exchangeSessionId, ids.sessionId);
    assert.equal(created.record.studyRefId, ids.studyRefId);
    assert.equal(created.record.sourceHospitalId, ids.sourceHospitalId);
    assert.equal(created.record.destinationHospitalId, ids.destinationHospitalId);
    assert.equal(created.record.transferStatus, "PENDING");
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    const replay = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(Date.now() + 1000),
      });
    assert.equal(replay.created, false);
    assert.equal(replay.record.provenanceId, created.record.provenanceId);
    await client.query("COMMIT");

    const preflight = operation.transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(operation.snapshot.updatedAt.getTime() + 1),
    });
    await beginTenant(client, ids.tenantId);
    await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation,
      next: preflight,
      correlationId: randomUUID(),
    });
    await client.query("COMMIT");
    await beginTenant(client, ids.tenantId);
    const preflightReplay = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(),
      });
    assert.equal(preflightReplay.created, false);
    assert.equal(preflightReplay.record.provenanceId, created.record.provenanceId);
    await client.query("COMMIT");

    await beginTenant(client, ids.otherTenantId);
    const crossTenant = await client.query(
      "SELECT provenance_id FROM provenance_records WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(crossTenant.rowCount, 0);
    await assert.rejects(
      new PostgresProvenanceRepository(client).createPendingForPacsImport({
        operationId: operation.snapshot.operationId,
        now: new Date(),
      }),
      ProvenanceUnavailableError,
    );
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    await assert.rejects(
      client.query(
        `INSERT INTO provenance_records
          (provenance_id, exchange_session_id, package_id, source_hospital_id,
           transfer_type, transfer_status, created_at)
         SELECT $1, e.session_id, p.package_id, e.source_hospital_id,
                'PACS_IMPORT', 'PENDING', now()
           FROM exchange_sessions e
           JOIN imaging_packages p ON p.exchange_session_id=e.session_id
          WHERE e.session_id=$2 LIMIT 1`,
        [randomUUID(), ids.sessionId],
      ),
      (error) => error?.code === "23514",
      "PACS_IMPORT without operation/destination must fail the database CHECK",
    );
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    await assert.rejects(
      client.query(
        `INSERT INTO provenance_records
          (provenance_id, operation_id, exchange_session_id, package_id,
           study_ref_id, source_hospital_id, destination_hospital_id,
           transfer_type, transfer_status, created_at)
         SELECT $1, op.operation_id, e.session_id, p.package_id, NULL,
                e.source_hospital_id, e.destination_hospital_id,
                'PACS_IMPORT', 'PENDING', now()
           FROM pacs_transfer_operations op
           JOIN exchange_sessions e ON e.session_id=op.exchange_session_id
           JOIN imaging_packages p ON p.exchange_session_id=e.session_id
          WHERE op.operation_id=$2 LIMIT 1`,
        [randomUUID(), operation.snapshot.operationId],
      ),
      (error) => error?.code === "23514",
      "PACS_IMPORT without a Study binding must fail the database CHECK",
    );
    await client.query("ROLLBACK");

    const lateOperation = await persistOperation(client, ids, ids.lateStudyRefId);
    const latePreflight = lateOperation.transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(lateOperation.snapshot.updatedAt.getTime() + 1),
    });
    await beginTenant(client, ids.tenantId);
    await new PostgresPacsTransferOperationRepository(client).transition({
      current: lateOperation,
      next: latePreflight,
      correlationId: randomUUID(),
    });
    await client.query("COMMIT");
    const stowStarted = latePreflight.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(latePreflight.snapshot.updatedAt.getTime() + 1),
    });
    await beginTenant(client, ids.tenantId);
    await new PostgresPacsTransferOperationRepository(client).transition({
      current: latePreflight,
      next: stowStarted,
      correlationId: randomUUID(),
    });
    await client.query("COMMIT");
    await beginTenant(client, ids.tenantId);
    await assert.rejects(
      new PostgresProvenanceRepository(client).createPendingForPacsImport({
        operationId: lateOperation.snapshot.operationId,
        now: new Date(),
      }),
      ProvenanceUnavailableError,
    );
    const lateRow = await client.query(
      "SELECT provenance_id FROM provenance_records WHERE operation_id=$1",
      [lateOperation.snapshot.operationId],
    );
    assert.equal(lateRow.rowCount, 0, "no first-time provenance after dispatch");
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    await client.query("SAVEPOINT no_update_probe");
    await assert.rejects(
      client.query(
        "UPDATE provenance_records SET transfer_status='COMPLETED' WHERE operation_id=$1",
        [operation.snapshot.operationId],
      ),
      (error) => error?.code === "23514" &&
        error?.constraint === "provenance_records_terminalization_guard",
      "incomplete granted-column terminal update must fail at the named database guard",
    );
    await client.query("ROLLBACK TO SAVEPOINT no_update_probe");
    await client.query("RELEASE SAVEPOINT no_update_probe");
    await client.query("SAVEPOINT no_delete_probe");
    await assert.rejects(
      client.query("DELETE FROM provenance_records WHERE operation_id=$1", [
        operation.snapshot.operationId,
      ]),
      (error) => error?.code === "42501",
    );
    await client.query("ROLLBACK TO SAVEPOINT no_delete_probe");
    await client.query("RELEASE SAVEPOINT no_delete_probe");
    await client.query("COMMIT");
  } finally {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* cleanup only */ }
      client.release();
    }
    await pool.end();
  }
});
