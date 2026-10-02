import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL;
if (!databaseUrl) throw new Error("INT001_OBSERVER_DATABASE_URL_REQUIRED");
const ids = Object.freeze({
  actor: "0a000000-0000-4000-8000-000000000001",
  tenant: "02000000-0000-4000-8000-000000000002",
  session: "16000000-0000-4000-8000-000000000001",
  sessionOther: "16000000-0000-4000-8000-000000000011",
  sessionInFlightRevocation: "16000000-0000-4000-8000-000000000021",
  cap012StartSession: "16000000-0000-4000-8000-000000000031",
  cap012EvidenceSession: "16000000-0000-4000-8000-000000000032",
  cap012SuccessAuditSession: "16000000-0000-4000-8000-000000000033",
  study: "18000000-0000-4000-8000-000000000001",
  studyOther: "18000000-0000-4000-8000-000000000011",
  studySourceMismatch: "18000000-0000-4000-8000-000000000012",
  studyMissingCount: "18000000-0000-4000-8000-000000000013",
  studyInFlightRevocation: "18000000-0000-4000-8000-000000000021",
  cap012StartStudy: "18000000-0000-4000-8000-000000000031",
  cap012EvidenceStudy: "18000000-0000-4000-8000-000000000032",
  cap012SuccessAuditStudy: "18000000-0000-4000-8000-000000000033",
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
  patientIdMismatch: "1d000000-0000-4000-8000-000000000026",
  inFlightRevocation: "1d000000-0000-4000-8000-000000000027",
  grantRevocation: "1d000000-0000-4000-8000-000000000028",
  operationBindingMismatch: "1b000000-0000-4000-8000-000000000011",
  operationSourceMismatch: "1b000000-0000-4000-8000-000000000012",
  operationNotCreated: "1b000000-0000-4000-8000-000000000013",
  operationMissingCount: "1b000000-0000-4000-8000-000000000014",
  operationInFlightRevocation: "1b000000-0000-4000-8000-000000000015",
  cap012StartOperation: "1b000000-0000-4000-8000-000000000021",
  cap012EvidenceOperation: "1b000000-0000-4000-8000-000000000022",
  cap012SuccessAuditOperation: "1b000000-0000-4000-8000-000000000023",
  cap012StartAuditFailure: "1d000000-0000-4000-8000-000000000029",
  cap012EvidenceInsertFailure: "1d000000-0000-4000-8000-000000000030",
  cap012SuccessAuditFailure: "1d000000-0000-4000-8000-000000000031",
});
const correlationIds = [
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
  ids.patientIdMismatch,
  ids.inFlightRevocation,
  ids.grantRevocation,
  ids.cap012StartAuditFailure,
  ids.cap012EvidenceInsertFailure,
  ids.cap012SuccessAuditFailure,
];
const sourceAuditScopes = new Map(
  correlationIds.map((correlationId) => [correlationId, {
    sessionId: ids.session,
    studyRefId: ids.study,
  }]),
);
sourceAuditScopes.set(ids.notCreated, { sessionId: ids.sessionOther, studyRefId: ids.studyOther });
sourceAuditScopes.set(ids.missingCount, { sessionId: ids.session, studyRefId: ids.studyMissingCount });
sourceAuditScopes.set(ids.inFlightRevocation, {
  sessionId: ids.sessionInFlightRevocation,
  studyRefId: ids.studyInFlightRevocation,
});
sourceAuditScopes.set(ids.cap012StartAuditFailure, {
  sessionId: ids.cap012StartSession,
  studyRefId: ids.cap012StartStudy,
});
sourceAuditScopes.set(ids.cap012EvidenceInsertFailure, {
  sessionId: ids.cap012EvidenceSession,
  studyRefId: ids.cap012EvidenceStudy,
});
sourceAuditScopes.set(ids.cap012SuccessAuditFailure, {
  sessionId: ids.cap012SuccessAuditSession,
  studyRefId: ids.cap012SuccessAuditStudy,
});
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const auditResult = await pool.query(
    `SELECT correlation_id::text AS correlation_id, action, result, reason_code, count(*)::integer AS count
       FROM audit_events
      WHERE correlation_id = ANY($1::uuid[])
      GROUP BY correlation_id, action, result, reason_code`,
    [correlationIds],
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
    [`${ids.patientIdMismatch}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.patientIdMismatch}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_PATIENT_ID_MISMATCH`, 1],
    [`${ids.inFlightRevocation}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.inFlightRevocation}|PACS_SOURCE_CAPTURE_DENIED|DENY|AUTHORIZATION_DENIED`, 1],
    [`${ids.grantRevocation}|GRANT_REVOKED|SUCCESS|<NULL>`, 1],
    [`${ids.cap012EvidenceInsertFailure}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.cap012EvidenceInsertFailure}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_CAPTURE_PERSISTENCE_FAILED`, 1],
    [`${ids.cap012SuccessAuditFailure}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.cap012SuccessAuditFailure}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_CAPTURE_PERSISTENCE_FAILED`, 1],
  ]);
  assert.deepEqual(actualAudit, expectedAudit, "Committed source-capture Audit outcomes must match the test cases");

  const auditColumns = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'audit_events'
      ORDER BY ordinal_position`,
  );
  assert.deepEqual(auditColumns.rows.map((row) => row.column_name), [
    "audit_event_id",
    "occurred_at",
    "actor_id",
    "tenant_id",
    "exchange_session_id",
    "resource_type",
    "resource_id",
    "action",
    "result",
    "reason_code",
    "correlation_id",
    "created_at",
  ], "Audit storage remains the exact metadata-only 12-column contract");

  const sourceAuditResult = await pool.query(
    `SELECT audit_event_id::text AS audit_event_id,
            occurred_at,
            actor_id::text AS actor_id,
            tenant_id::text AS tenant_id,
            exchange_session_id::text AS exchange_session_id,
            resource_type,
            resource_id::text AS resource_id,
            action,
            result,
            reason_code,
            correlation_id::text AS correlation_id,
            created_at
       FROM audit_events
      WHERE correlation_id = ANY($1::uuid[])
        AND action = ANY($2::text[])
      ORDER BY correlation_id, action, occurred_at, audit_event_id`,
    [correlationIds, [
      "PACS_SOURCE_CAPTURE_STARTED",
      "PACS_SOURCE_CAPTURED",
      "PACS_SOURCE_CAPTURE_DENIED",
      "PACS_SOURCE_CAPTURE_FAILED",
    ]],
  );
  const sourceAuditKeys = [
    "action",
    "actor_id",
    "audit_event_id",
    "correlation_id",
    "created_at",
    "exchange_session_id",
    "occurred_at",
    "reason_code",
    "resource_id",
    "resource_type",
    "result",
    "tenant_id",
  ];
  const allowedSourceAuditTuples = new Set([
    "PACS_SOURCE_CAPTURE_STARTED|STUDY|ALLOW|<NULL>",
    "PACS_SOURCE_CAPTURED|STUDY|SUCCESS|<NULL>",
    "PACS_SOURCE_CAPTURE_DENIED|STUDY|DENY|AUTHORIZATION_DENIED",
    "PACS_SOURCE_CAPTURE_DENIED|STUDY|DENY|OPERATION_NOT_CAPTUREABLE",
    "PACS_SOURCE_CAPTURE_DENIED|STUDY|DENY|PATIENT_MAPPING_INVALID",
    "PACS_SOURCE_CAPTURE_DENIED|STUDY|DENY|SOURCE_PATIENT_ID_MISMATCH",
    "PACS_SOURCE_CAPTURE_DENIED|STUDY|DENY|SOURCE_METADATA_INVALID",
    "PACS_SOURCE_CAPTURE_FAILED|STUDY|FAILURE|SOURCE_READ_FAILED",
    "PACS_SOURCE_CAPTURE_FAILED|STUDY|FAILURE|SOURCE_CAPTURE_CANCELLED",
    "PACS_SOURCE_CAPTURE_FAILED|STUDY|FAILURE|SOURCE_CAPTURE_DEADLINE",
    "PACS_SOURCE_CAPTURE_FAILED|STUDY|FAILURE|SOURCE_CAPTURE_PERSISTENCE_FAILED",
  ]);
  assert.ok(sourceAuditResult.rows.length > 0, "Expected scoped source-capture Audit rows");
  for (const row of sourceAuditResult.rows) {
    assert.deepEqual(Object.keys(row).sort(), sourceAuditKeys);
    assert.match(row.audit_event_id, /^[0-9a-f-]{36}$/i);
    const expectedScope = sourceAuditScopes.get(row.correlation_id);
    assert.ok(expectedScope, "Every observed row must bind to a known synthetic case");
    assert.equal(row.actor_id, ids.actor);
    assert.equal(row.tenant_id, ids.tenant);
    assert.equal(row.exchange_session_id, expectedScope.sessionId);
    assert.equal(row.resource_type, "STUDY");
    assert.equal(row.resource_id, expectedScope.studyRefId, "resource_id is the internal Study-reference UUID");
    assert.ok(allowedSourceAuditTuples.has(
      `${row.action}|${row.resource_type}|${row.result}|${row.reason_code ?? "<NULL>"}`,
    ));
    assert.match(row.correlation_id, /^[0-9a-f-]{36}$/i);
    assert.ok(row.occurred_at instanceof Date && Number.isFinite(row.occurred_at.getTime()));
    assert.ok(row.created_at instanceof Date && Number.isFinite(row.created_at.getTime()));
    assert.equal(row.created_at.getTime(), row.occurred_at.getTime());
  }
  assert.doesNotMatch(
    JSON.stringify(sourceAuditResult.rows),
    /2\.25\.|TEST-PATIENT-007|SYNTHETIC-DICOM-BYTES|credential|token|private key/i,
  );

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
    [[ids.operationBindingMismatch, ids.operationSourceMismatch, ids.operationNotCreated, ids.operationMissingCount, ids.operationInFlightRevocation, ids.cap012StartOperation, ids.cap012EvidenceOperation, ids.cap012SuccessAuditOperation]],
  );
  assert.deepEqual(operationMatrix.rows, [
    { operation_id: ids.operationBindingMismatch, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.operationSourceMismatch, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.operationNotCreated, operation_state: "FAILED", evidence_count: 0 },
    { operation_id: ids.operationMissingCount, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.operationInFlightRevocation, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.cap012StartOperation, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.cap012EvidenceOperation, operation_state: "CREATED", evidence_count: 0 },
    { operation_id: ids.cap012SuccessAuditOperation, operation_state: "CREATED", evidence_count: 0 },
  ]);
  console.log(`int001_capture_audit=PASS denied=13 unresolved=4 failed=9 started=14 capture_success=1 grant_revoked=1 source_rows=${sourceAuditResult.rows.length} metadata_allowlist=PASS`);
  console.log("int001_cap003_operation_matrix=PASS mismatched_bindings=2 failed_state=1 no_evidence=true");
  console.log("int001_cap010_success_capture=PASS evidence=pending_one success_audit=one operation_state=CREATED response_allowlist=true");
  console.log("int001_cap012_insert_failures=PASS start_no_wado=true final_transaction_rollback=true operation_state=CREATED evidence=none");
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED";
  throw new Error(`INT001_OBSERVER_FAILED:${safeCode}`);
} finally {
  await pool.end();
}
