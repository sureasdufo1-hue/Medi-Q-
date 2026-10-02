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
});
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const auditResult = await pool.query(
    `SELECT correlation_id::text AS correlation_id, action, result, count(*)::integer AS count
       FROM audit_events
      WHERE correlation_id = ANY($1::uuid[])
      GROUP BY correlation_id, action, result`,
    [[ids.denied, ids.failure, ids.success]],
  );
  const actualAudit = new Map(
    auditResult.rows.map((row) => [`${row.correlation_id}|${row.action}|${row.result}`, row.count]),
  );
  const expectedAudit = new Map([
    [`${ids.denied}|PACS_SOURCE_CAPTURE_DENIED|DENY`, 1],
    [`${ids.failure}|PACS_SOURCE_CAPTURE_STARTED|ALLOW`, 1],
    [`${ids.failure}|PACS_SOURCE_CAPTURE_FAILED|FAILURE`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURE_STARTED|ALLOW`, 1],
    [`${ids.success}|PACS_SOURCE_CAPTURED|SUCCESS`, 1],
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
  console.log("int001_capture_audit=PASS denied=1 failed=1 success=1");
  console.log("int001_capture_persistence=PASS pending=1 operation_state=CREATED");
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED";
  throw new Error(`INT001_OBSERVER_FAILED:${safeCode}`);
} finally {
  await pool.end();
}
