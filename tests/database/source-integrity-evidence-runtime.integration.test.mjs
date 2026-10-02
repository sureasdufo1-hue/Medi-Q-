import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import {
  SourceIntegrityEvidenceConflictError,
  SourceIntegrityEvidenceUnavailableError,
} from "../../services/api/dist/integrity/persistence/source-integrity-evidence.repository.js";
import { PostgresSourceIntegrityEvidenceRepository } from "../../services/api/dist/integrity/persistence/postgres-source-integrity-evidence.repository.js";

function fixture() {
  if (!process.env.MEDIQ_INT001_TEST_FIXTURE) {
    throw new Error("INT001_FIXTURE_MISSING");
  }
  const value = JSON.parse(process.env.MEDIQ_INT001_TEST_FIXTURE);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "packageId", "studyRefId",
    "lateStudyRefId", "sourceHospitalId", "destinationHospitalId",
  ];
  if (required.some((key) => typeof value[key] !== "string")) {
    throw new Error("INT001_FIXTURE_INVALID");
  }
  return value;
}

const manifest = Object.freeze({
  algorithm: "SHA256-MANIFEST-V1",
  aggregateDigest: `sha256:${"b".repeat(64)}`,
  objectCount: 3,
  totalBytes: 1200,
});

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

async function persistOperation(client, ids, studyRefId = ids.studyRefId) {
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

async function createEvidence(client, operationId, suppliedManifest = manifest) {
  return new PostgresSourceIntegrityEvidenceRepository(client)
    .createPendingSourceCapture({
      operationId,
      manifest: suppliedManifest,
      now: new Date(),
    });
}

test("INT-001 operation-bound pending source Integrity PostgreSQL/RLS Acceptance", {
  timeout: 30_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("INT001_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  let client;
  try {
    client = await pool.connect();

    const privileges = await client.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='SELECT')::int AS evidence_select,
        count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='INSERT')::int AS evidence_insert,
        count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='UPDATE')::int AS evidence_update,
        count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='DELETE')::int AS evidence_delete,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT')::int AS study_select,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT'
          AND column_name IN ('study_instance_uid','series_count','instance_count'))::int AS capture_scope_select,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='UPDATE')::int AS study_update,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type='UPDATE'
          AND column_name IN ('temporary_storage_ref','temporary_payload_state',
                              'temporary_payload_expires_at','temporary_payload_purged_at'))::int AS temporary_metadata_update,
        count(*) FILTER (WHERE table_name='study_references' AND privilege_type IN ('INSERT','UPDATE','DELETE'))::int AS study_write
      FROM information_schema.column_privileges
      WHERE grantee='mediq_runtime' AND table_schema='public'`);
    assert.deepEqual(privileges.rows[0], {
      total: 244,
      evidence_select: 12,
      evidence_insert: 12,
      evidence_update: 0,
      evidence_delete: 0,
      study_select: 10,
      capture_scope_select: 3,
      study_update: 4,
      temporary_metadata_update: 4,
      study_write: 4,
    });
    const tablePrivileges = await client.query(`
      SELECT count(*)::int AS total FROM information_schema.table_privileges
      WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public'`);
    assert.equal(tablePrivileges.rows[0].total, 0);

    const operation = await persistOperation(client, ids);
    const noContext = await client.query(
      "SELECT integrity_id FROM integrity_evidence WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(noContext.rowCount, 0, "missing Tenant context hides evidence");
    await client.query("BEGIN");
    await assert.rejects(
      createEvidence(client, operation.snapshot.operationId),
      SourceIntegrityEvidenceUnavailableError,
      "missing Tenant context must fail closed for evidence insertion",
    );
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    const rollbackProbe = await createEvidence(client, operation.snapshot.operationId);
    assert.equal(rollbackProbe.created, true);
    await client.query("ROLLBACK");
    await beginTenant(client, ids.tenantId);
    const afterRollback = await client.query(
      "SELECT integrity_id FROM integrity_evidence WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(afterRollback.rowCount, 0, "caller rollback removes evidence");
    const created = await createEvidence(client, operation.snapshot.operationId);
    assert.equal(created.created, true);
    assert.equal(created.record.operationId, operation.snapshot.operationId);
    assert.equal(created.record.exchangeSessionId, ids.sessionId);
    assert.equal(created.record.studyRefId, ids.studyRefId);
    assert.equal(created.record.packageId, ids.packageId);
    assert.equal(created.record.verificationStage, "SOURCE_CAPTURE");
    assert.equal(created.record.status, "PENDING");
    assert.equal(created.record.verifiedAt, null);
    await client.query("COMMIT");

    await beginTenant(client, ids.tenantId);
    const replay = await createEvidence(client, operation.snapshot.operationId);
    assert.equal(replay.created, false);
    assert.equal(replay.record.integrityId, created.record.integrityId);
    await assert.rejects(
      createEvidence(client, operation.snapshot.operationId, {
        ...manifest,
        aggregateDigest: `sha256:${"c".repeat(64)}`,
      }),
      SourceIntegrityEvidenceConflictError,
      "changed source digest cannot replace the first baseline",
    );
    await client.query("COMMIT");

    await beginTenant(client, ids.otherTenantId);
    const crossTenant = await client.query(
      "SELECT integrity_id FROM integrity_evidence WHERE operation_id=$1",
      [operation.snapshot.operationId],
    );
    assert.equal(crossTenant.rowCount, 0);
    await assert.rejects(
      createEvidence(client, operation.snapshot.operationId),
      SourceIntegrityEvidenceUnavailableError,
    );
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    const unknownOperationId = randomUUID();
    await assert.rejects(
      createEvidence(client, unknownOperationId),
      SourceIntegrityEvidenceUnavailableError,
      "unknown or mismatched operation binding is not disclosed",
    );
    await client.query("ROLLBACK");

    await beginTenant(client, ids.tenantId);
    await client.query("SAVEPOINT invalid_source_probe");
    await assert.rejects(
      client.query(
        `INSERT INTO integrity_evidence
          (integrity_id, operation_id, exchange_session_id, package_id,
           study_ref_id, verification_stage, status, created_at)
         SELECT $1, op.operation_id, e.session_id, p.package_id,
                op.study_ref_id, 'SOURCE_CAPTURE', 'PENDING', now()
           FROM pacs_transfer_operations op
           JOIN exchange_sessions e ON e.session_id=op.exchange_session_id
           JOIN imaging_packages p ON p.exchange_session_id=e.session_id
          WHERE op.operation_id=$2`,
        [randomUUID(), operation.snapshot.operationId],
      ),
      (error) => error?.code === "23514",
      "missing algorithm/digest/count cannot create a source baseline",
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_source_probe");
    await assert.rejects(
      client.query(
        `INSERT INTO integrity_evidence
          (integrity_id, operation_id, exchange_session_id, package_id,
           study_ref_id, verification_stage, algorithm, source_digest,
           source_object_count, status, verified_at, created_at)
         SELECT $1, op.operation_id, e.session_id, p.package_id,
                op.study_ref_id, 'SOURCE_CAPTURE', $3, $4, 3,
                'VERIFIED', now(), now()
           FROM pacs_transfer_operations op
           JOIN exchange_sessions e ON e.session_id=op.exchange_session_id
           JOIN imaging_packages p ON p.exchange_session_id=e.session_id
          WHERE op.operation_id=$2`,
        [
          randomUUID(), operation.snapshot.operationId,
          manifest.algorithm, manifest.aggregateDigest,
        ],
      ),
      (error) => error?.code === "23514",
      "source baseline cannot claim destination verification or VERIFIED",
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
    await beginTenant(client, ids.tenantId);
    await assert.rejects(
      createEvidence(client, lateOperation.snapshot.operationId),
      SourceIntegrityEvidenceUnavailableError,
      "first source baseline is denied after operation leaves CREATED",
    );
    const lateEvidence = await client.query(
      "SELECT integrity_id FROM integrity_evidence WHERE operation_id=$1",
      [lateOperation.snapshot.operationId],
    );
    assert.equal(lateEvidence.rowCount, 0);
    await client.query("COMMIT");
  } finally {
    if (client) {
      if (client.getTransactionStatus?.() !== 0) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      client.release();
    }
    await pool.end();
  }
});
