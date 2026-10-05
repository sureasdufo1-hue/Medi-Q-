import assert from "node:assert/strict";
import pg from "pg";
import { projectTransferDispatchObserverFailure } from "./int001-transfer-dispatch-diagnostics.mjs";

const { Pool } = pg;
const databaseUrl = process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL;
if (!databaseUrl) throw new Error("TRANSFER_DISPATCH_OBSERVER_DATABASE_REQUIRED");

const ids = Object.freeze({
  actor: "0a000000-0000-4000-8000-000000000001",
  tenant: "02000000-0000-4000-8000-000000000002",
  hospitalA: "04000000-0000-4000-8000-000000000001",
  hospitalB: "04000000-0000-4000-8000-000000000002",
  session: "16000000-0000-4000-8000-000000000075",
  package: "17000000-0000-4000-8000-000000000075",
  study: "18000000-0000-4000-8000-000000000075",
  operation: "1b000000-0000-4000-8000-000000000075",
  correlation: "1d000000-0000-4000-8000-000000000090",
});
const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5_000 });
let observerStage = "OPERATION_QUERY";
async function inspectTemporaryQuota() {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL ROLE mediq_quota_owner");
    const scope = (await client.query(`SELECT current_user AS role,
        current_setting('transaction_read_only') AS read_only`)).rows;
    assert.deepEqual(scope, [{ role: "mediq_quota_owner", read_only: "on" }],
      "TRANSFER_DISPATCH_QUOTA_OBSERVER_SCOPE");
    await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
    return (await client.query(`SELECT count(*)::integer AS count,
        coalesce(sum(reserved_bytes),0)::bigint AS bytes
      FROM temporary_payload_reservations WHERE study_ref_id=$1::uuid`, [ids.study])).rows[0];
  } finally {
    try {
      if (transactionOpen) await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}

try {
  const operation = (await pool.query(`SELECT op.operation_id::text,op.tenant_id::text,op.actor_id::text,
      op.exchange_session_id::text,op.study_ref_id::text,op.state,op.version,op.reason_code,
      op.source_object_count,op.destination_object_count,op.stow_started_at,
      s.state AS session_state,s.completed_at,
      sr.package_id::text,sr.temporary_payload_state,sr.temporary_payload_purged_at
    FROM pacs_transfer_operations op
    JOIN exchange_sessions s ON s.session_id=op.exchange_session_id
    JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    WHERE op.operation_id=$1::uuid`, [ids.operation])).rows;
  assert.equal(operation.length, 1, "TRANSFER_DISPATCH_OPERATION_CARDINALITY");
  assert.deepEqual(operation[0], {
    operation_id: ids.operation,
    tenant_id: ids.tenant,
    actor_id: ids.actor,
    exchange_session_id: ids.session,
    study_ref_id: ids.study,
    state: "VERIFYING",
    version: 3,
    reason_code: "STOW_ACKNOWLEDGED",
    source_object_count: 3,
    destination_object_count: null,
    stow_started_at: operation[0].stow_started_at,
    session_state: "ACTIVE",
    completed_at: null,
    package_id: ids.package,
    temporary_payload_state: "AVAILABLE",
    temporary_payload_purged_at: null,
  }, "TRANSFER_DISPATCH_OPERATION_BINDING");
  assert.ok(operation[0].stow_started_at instanceof Date, "TRANSFER_DISPATCH_STOW_STARTED_TIME");

  observerStage = "PROVENANCE_QUERY";
  const provenance = (await pool.query(`SELECT operation_id::text,exchange_session_id::text,package_id::text,
      study_ref_id::text,source_hospital_id::text,destination_hospital_id::text,transfer_type,
      transfer_status,integrity_id,ingested_at,transferred_at
    FROM provenance_records WHERE operation_id=$1::uuid`, [ids.operation])).rows;
  assert.deepEqual(provenance, [{
    operation_id: ids.operation,
    exchange_session_id: ids.session,
    package_id: ids.package,
    study_ref_id: ids.study,
    source_hospital_id: ids.hospitalA,
    destination_hospital_id: ids.hospitalB,
    transfer_type: "PACS_IMPORT",
    transfer_status: "PENDING",
    integrity_id: null,
    ingested_at: null,
    transferred_at: null,
  }], "TRANSFER_DISPATCH_PENDING_PROVENANCE_BINDING");

  observerStage = "INTEGRITY_QUERY";
  const integrity = (await pool.query(`SELECT verification_stage,status,algorithm,source_digest,
      source_object_count,verified_at
    FROM integrity_evidence WHERE operation_id=$1::uuid ORDER BY verification_stage`, [ids.operation])).rows;
  assert.equal(integrity.length, 1, "TRANSFER_DISPATCH_SOURCE_EVIDENCE_ONLY");
  assert.equal(integrity[0].verification_stage, "SOURCE_CAPTURE", "TRANSFER_DISPATCH_SOURCE_STAGE");
  assert.equal(integrity[0].status, "PENDING", "TRANSFER_DISPATCH_SOURCE_STATUS");
  assert.equal(integrity[0].algorithm, "SHA256-MANIFEST-V1", "TRANSFER_DISPATCH_SOURCE_ALGORITHM");
  assert.equal(integrity[0].source_object_count, 3, "TRANSFER_DISPATCH_SOURCE_OBJECT_COUNT");
  assert.equal(integrity[0].verified_at, null, "TRANSFER_DISPATCH_SOURCE_NOT_VERIFIED");
  assert.match(integrity[0].source_digest, /^sha256:[0-9a-f]{64}$/, "TRANSFER_DISPATCH_SOURCE_DIGEST_FORMAT");

  observerStage = "STATE_AUDIT_QUERY";
  const stateAudits = (await pool.query(`SELECT actor_id::text,tenant_id::text,exchange_session_id::text,
      resource_type,resource_id::text,action,result,reason_code,correlation_id::text
    FROM audit_events
    WHERE correlation_id=$1::uuid AND action='PACS_TRANSFER_OPERATION_STATE_CHANGED'
    ORDER BY occurred_at,audit_event_id`, [ids.correlation])).rows;
  assert.deepEqual(stateAudits, ["CREATED", "PREFLIGHT_PASSED", "STOW_STARTED", "STOW_ACKNOWLEDGED"].map(reason_code => ({
    actor_id: ids.actor,
    tenant_id: ids.tenant,
    exchange_session_id: ids.session,
    resource_type: "PACS_TRANSFER_OPERATION",
    resource_id: ids.operation,
    action: "PACS_TRANSFER_OPERATION_STATE_CHANGED",
    result: "SUCCESS",
    reason_code,
    correlation_id: ids.correlation,
  })), "TRANSFER_DISPATCH_EXACT_STATE_AUDITS");

  observerStage = "TERMINAL_AUDIT_QUERY";
  const terminalAuditCount = (await pool.query(`SELECT count(*)::integer AS count FROM audit_events
    WHERE correlation_id=$1::uuid AND action IN ('PACS_TRANSFER_COMPLETED','INTEGRITY_VERIFIED','SESSION_COMPLETED')`,
  [ids.correlation])).rows[0].count;
  assert.equal(terminalAuditCount, 0, "TRANSFER_DISPATCH_NO_TERMINAL_AUDIT");
  observerStage = "QUOTA_QUERY";
  const reservation = await inspectTemporaryQuota();
  assert.equal(reservation.count, 1, "TRANSFER_DISPATCH_TEMPORARY_QUOTA_RETAINED");
  assert.ok(BigInt(reservation.bytes) > 0n, "TRANSFER_DISPATCH_TEMPORARY_QUOTA_NONZERO");

  console.log("transfer_dispatch_observer=PASS operation=VERIFYING provenance=PENDING state_audits=4 source_integrity=PENDING destination_integrity=0 quota=retained terminal=0");
} catch (error) {
  const safeCode = projectTransferDispatchObserverFailure({ stage: observerStage, error });
  console.error(`TRANSFER_DISPATCH_OBSERVER_FAILED_${safeCode}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
