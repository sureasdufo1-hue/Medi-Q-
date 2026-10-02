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
    [`${ids.failure}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.failure}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURED|SUCCESS|<NULL>`, 1],
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
  console.log("int001_capture_audit=PASS denied=7 hidden_or_unavailable=0 failed=1 success=1");
  console.log("int001_capture_persistence=PASS pending=1 operation_state=CREATED");
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED";
  throw new Error(`INT001_OBSERVER_FAILED:${safeCode}`);
} finally {
  await pool.end();
}
