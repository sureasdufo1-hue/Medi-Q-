import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL;
if (!databaseUrl) throw new Error("INT001_OBSERVER_DATABASE_URL_REQUIRED");
const ids = Object.freeze({
  operation: "1b000000-0000-4000-8000-000000000001",
  denied: "1d000000-0000-4000-8000-000000000001",
  failure: "1d000000-0000-4000-8000-000000000002",
  success: "1d000000-0000-4000-8000-000000000003",
  missingConsent: "1d000000-0000-4000-8000-000000000004",
  withdrawnConsent: "1d000000-0000-4000-8000-000000000005",
  expiredConsent: "1d000000-0000-4000-8000-000000000006",
  revokedGrant: "1d000000-0000-4000-8000-000000000007",
  expiredGrant: "1d000000-0000-4000-8000-000000000008",
  wrongScope: "1d000000-0000-4000-8000-000000000009",
  crossTenant: "1d000000-0000-4000-8000-000000000010",
  unavailable: "1d000000-0000-4000-8000-000000000011",
  bindingMismatch: "1d000000-0000-4000-8000-000000000012",
  sourceMismatch: "1d000000-0000-4000-8000-000000000013",
  notCreated: "1d000000-0000-4000-8000-000000000014",
  fixtureStateTransition: "1d000000-0000-4000-8000-000000000015",
  missingCount: "1d000000-0000-4000-8000-000000000016",
  metadataEmpty: "1d000000-0000-4000-8000-000000000017",
  metadataCountMismatch: "1d000000-0000-4000-8000-000000000018",
  metadataSeriesMismatch: "1d000000-0000-4000-8000-000000000019",
  metadataWrongStudy: "1d000000-0000-4000-8000-000000000020",
  metadataDuplicate: "1d000000-0000-4000-8000-000000000021",
  metadataMalformed: "1d000000-0000-4000-8000-000000000022",
  metadataMissingTag: "1d000000-0000-4000-8000-000000000023",
  metadataOverLimit: "1d000000-0000-4000-8000-000000000024",
  metadataUnavailable: "1d000000-0000-4000-8000-000000000025",
  operationBindingMismatch: "1b000000-0000-4000-8000-000000000011",
  operationSourceMismatch: "1b000000-0000-4000-8000-000000000012",
  operationNotCreated: "1b000000-0000-4000-8000-000000000013",
  operationMissingCount: "1b000000-0000-4000-8000-000000000014",
});
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const auditResult = await pool.query(
    `SELECT correlation_id::text AS correlation_id, action, result, reason_code, count(*)::integer AS count
       FROM audit_events
      WHERE correlation_id = ANY($1::uuid[])
      GROUP BY correlation_id, action, result, reason_code`,
    [[
      ids.denied,
      ids.failure,
      ids.success,
      ids.missingConsent,
      ids.withdrawnConsent,
      ids.expiredConsent,
      ids.revokedGrant,
      ids.expiredGrant,
      ids.wrongScope,
      ids.crossTenant,
      ids.unavailable,
      ids.bindingMismatch,
      ids.sourceMismatch,
      ids.notCreated,
      ids.fixtureStateTransition,
      ids.missingCount,
      ids.metadataEmpty,
      ids.metadataCountMismatch,
      ids.metadataSeriesMismatch,
      ids.metadataWrongStudy,
      ids.metadataDuplicate,
      ids.metadataMalformed,
      ids.metadataMissingTag,
      ids.metadataOverLimit,
      ids.metadataUnavailable,
    ]],
  );
  const actualAudit = new Map(
    auditResult.rows.map((row) => [
      `${row.correlation_id}|${row.action}|${row.result}|${row.reason_code ?? "<NULL>"}`,
      row.count,
    ]),
  );
  const deniedAudit = (correlationId) =>
    `${correlationId}|PACS_SOURCE_CAPTURE_DENIED|DENY|AUTHORIZATION_DENIED`;
  const expectedAudit = new Map([
    [deniedAudit(ids.denied), 1],
    [deniedAudit(ids.missingConsent), 1],
    [deniedAudit(ids.withdrawnConsent), 1],
    [deniedAudit(ids.expiredConsent), 1],
    [deniedAudit(ids.revokedGrant), 1],
    [deniedAudit(ids.expiredGrant), 1],
    [deniedAudit(ids.wrongScope), 1],
    [deniedAudit(ids.notCreated), 1],
    [`${ids.fixtureStateTransition}|PACS_TRANSFER_OPERATION_STATE_CHANGED|FAILURE|SYNTHETIC_SETUP_FAILURE`, 1],
    [`${ids.failure}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.failure}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURED|SUCCESS|<NULL>`, 1],
    [`${ids.missingCount}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_METADATA_INVALID`, 1],
    [`${ids.metadataEmpty}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataEmpty}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_METADATA_INVALID`, 1],
    [`${ids.metadataCountMismatch}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataCountMismatch}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_METADATA_INVALID`, 1],
    [`${ids.metadataSeriesMismatch}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataSeriesMismatch}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_METADATA_INVALID`, 1],
    [`${ids.metadataWrongStudy}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataWrongStudy}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.metadataDuplicate}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataDuplicate}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.metadataMalformed}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataMalformed}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.metadataMissingTag}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataMissingTag}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.metadataOverLimit}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataOverLimit}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.metadataUnavailable}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.metadataUnavailable}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
  ]);
  assert.deepEqual(actualAudit, expectedAudit, "Committed source-capture Audit outcomes must match the test cases");

  const finalState = await pool.query(
    `SELECT op.state AS operation_state,
            count(e.integrity_id)::integer AS evidence_count,
            min(e.verification_stage) AS verification_stage,
            min(e.status) AS evidence_status,
            min(e.source_object_count)::integer AS source_object_count
       FROM pacs_transfer_operations op
       LEFT JOIN integrity_evidence e ON e.operation_id = op.operation_id
      WHERE op.operation_id = $1::uuid
      GROUP BY op.state`,
    [ids.operation],
  );
  assert.equal(finalState.rowCount, 1);
  assert.deepEqual(finalState.rows[0], {
    operation_state: "CREATED",
    evidence_count: 1,
    verification_stage: "SOURCE_CAPTURE",
    evidence_status: "PENDING",
    source_object_count: 3,
  });

  const operationMatrix = await pool.query(
    `SELECT op.operation_id::text AS operation_id,
            op.state AS operation_state,
            count(e.integrity_id)::integer AS evidence_count
       FROM pacs_transfer_operations op
       LEFT JOIN integrity_evidence e ON e.operation_id = op.operation_id
      WHERE op.operation_id = ANY($1::uuid[])
      GROUP BY op.operation_id, op.state
      ORDER BY op.operation_id`,
    [[ids.operationBindingMismatch, ids.operationSourceMismatch, ids.operationNotCreated, ids.operationMissingCount]],
  );
  assert.deepEqual(operationMatrix.rows, [
    { operation_id: ids.operationBindingMismatch, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.operationSourceMismatch, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.operationNotCreated, operation_state: "FAILED", evidence_count: 0 },
    { operation_id: ids.operationMissingCount, operation_state: "CREATED", evidence_count: 0 },
  ]);
  console.log("int001_capture_audit=PASS denied=12 unresolved=4 failed=7 started=11 success=1");
  console.log("int001_cap003_operation_matrix=PASS mismatched_bindings=2 failed_state=1 no_evidence=true");
  console.log("int001_capture_persistence=PASS pending=1 operation_state=CREATED");
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED";
  throw new Error(`INT001_OBSERVER_FAILED:${safeCode}`);
} finally {
  await pool.end();
}
