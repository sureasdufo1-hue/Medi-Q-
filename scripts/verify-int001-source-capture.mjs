import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { temporaryCaptureLifecycleCases, allSourceLifecycleCases, expectedPrivacyPhases, privacyColumnContract, privacyAssert, privacyTokenMatches,
  parsePrivacyProbe, assertPrivacySnapshot } from "../tests/fixtures/temporary-capture-lifecycle-fixture.mjs";
import { mutationExpectedAudit } from "../tests/fixtures/source-capture-mutation-fixture.mjs";
import { coordinatorFaultCases } from "../tests/fixtures/pacs-coordinator-fault-fixture.mjs";

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
  coordinatorSession: "16000000-0000-4000-8000-000000000051",
  coordinatorPackage: "17000000-0000-4000-8000-000000000051",
  coordinatorStudy: "18000000-0000-4000-8000-000000000051",
  coordinatorConsent: "19000000-0000-4000-8000-000000000051",
  coordinatorGrant: "1a000000-0000-4000-8000-000000000051",
  coordinatorOperation: "1b000000-0000-4000-8000-000000000051",
  coordinatorIdempotency: "1b000000-0000-4000-8000-000000000052",
  coordinatorCorrelation: "1d000000-0000-4000-8000-000000000051",
  coordinatorDenyMalformedCorrelation: "1d000000-0000-4000-8000-000000000052",
  coordinatorDenyMissingGrantCorrelation: "1d000000-0000-4000-8000-000000000053",
  coordinatorDenyRevokedGrantCorrelation: "1d000000-0000-4000-8000-000000000054",
  coordinatorDenyExpiredGrantCorrelation: "1d000000-0000-4000-8000-000000000055",
  coordinatorDenyWithdrawnConsentCorrelation: "1d000000-0000-4000-8000-000000000056",
  coordinatorDenyWrongScopeCorrelation: "1d000000-0000-4000-8000-000000000057",
  coordinatorDenyCrossSessionCorrelation: "1d000000-0000-4000-8000-000000000058",
  coordinatorDenyCrossTenantCorrelation: "1d000000-0000-4000-8000-000000000059",
  coordinatorDenyForeignStudyCorrelation: "1d000000-0000-4000-8000-000000000060",
  coordinatorMappingSession: "16000000-0000-4000-8000-000000000052",
  coordinatorMappingPackage: "17000000-0000-4000-8000-000000000052",
  coordinatorMappingStudy: "18000000-0000-4000-8000-000000000052",
  coordinatorMappingConsent: "19000000-0000-4000-8000-000000000052",
  coordinatorMappingGrant: "1a000000-0000-4000-8000-000000000052",
  coordinatorMappingOperation: "1b000000-0000-4000-8000-000000000080",
  coordinatorMappingIdempotency: "1b000000-0000-4000-8000-000000000083",
  coordinatorMappingCorrelation: "1d000000-0000-4000-8000-000000000061",
  coordinatorPatientIdSession: "16000000-0000-4000-8000-000000000053",
  coordinatorPatientIdPackage: "17000000-0000-4000-8000-000000000053",
  coordinatorPatientIdStudy: "18000000-0000-4000-8000-000000000053",
  coordinatorPatientIdConsent: "19000000-0000-4000-8000-000000000053",
  coordinatorPatientIdGrant: "1a000000-0000-4000-8000-000000000053",
  coordinatorPatientIdOperation: "1b000000-0000-4000-8000-000000000081",
  coordinatorPatientIdIdempotency: "1b000000-0000-4000-8000-000000000084",
  coordinatorPatientIdCorrelation: "1d000000-0000-4000-8000-000000000062",
  coordinatorMetadataSession: "16000000-0000-4000-8000-000000000054",
  coordinatorMetadataPackage: "17000000-0000-4000-8000-000000000054",
  coordinatorMetadataStudy: "18000000-0000-4000-8000-000000000054",
  coordinatorMetadataConsent: "19000000-0000-4000-8000-000000000054",
  coordinatorMetadataGrant: "1a000000-0000-4000-8000-000000000054",
  coordinatorMetadataOperation: "1b000000-0000-4000-8000-000000000082",
  coordinatorMetadataIdempotency: "1b000000-0000-4000-8000-000000000085",
  coordinatorMetadataCorrelation: "1d000000-0000-4000-8000-000000000063",
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
  ids.coordinatorCorrelation,
  ids.coordinatorDenyMalformedCorrelation,
  ids.coordinatorDenyMissingGrantCorrelation,
  ids.coordinatorDenyRevokedGrantCorrelation,
  ids.coordinatorDenyExpiredGrantCorrelation,
  ids.coordinatorDenyWithdrawnConsentCorrelation,
  ids.coordinatorDenyWrongScopeCorrelation,
  ids.coordinatorDenyCrossSessionCorrelation,
  ids.coordinatorDenyCrossTenantCorrelation,
  ids.coordinatorDenyForeignStudyCorrelation,
  ids.coordinatorMappingCorrelation,
  ids.coordinatorPatientIdCorrelation,
  ids.coordinatorMetadataCorrelation,
  ...coordinatorFaultCases.map(scenario => scenario.correlationId),
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
sourceAuditScopes.set(ids.coordinatorCorrelation, {
  sessionId: ids.coordinatorSession,
  studyRefId: ids.coordinatorStudy,
});
sourceAuditScopes.set(ids.coordinatorMappingCorrelation, {
  sessionId: ids.coordinatorMappingSession,
  studyRefId: ids.coordinatorMappingStudy,
});
sourceAuditScopes.set(ids.coordinatorPatientIdCorrelation, {
  sessionId: ids.coordinatorPatientIdSession,
  studyRefId: ids.coordinatorPatientIdStudy,
});
sourceAuditScopes.set(ids.coordinatorMetadataCorrelation, {
  sessionId: ids.coordinatorMetadataSession,
  studyRefId: ids.coordinatorMetadataStudy,
});
for (const scenario of coordinatorFaultCases) {
  sourceAuditScopes.set(scenario.correlationId, {
    sessionId: scenario.sessionId,
    studyRefId: scenario.studyRefId,
  });
}
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
async function inspectLifecycleQuota(scenario) {
  // mediq_migrator is NOINHERIT. Its already approved owner membership is
  // explicit, transaction-local and used only by this independent observer.
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE mediq_quota_owner");
    await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
    return (await client.query(`SELECT reserved_bytes::text AS environment_reserved,
      (SELECT count(*)::int FROM temporary_payload_reservations WHERE study_ref_id=$1) AS refs,
      (SELECT count(*)::int FROM temporary_payload_package_quotas WHERE package_id=$2) AS packages
      FROM temporary_payload_quota_state`, [scenario.studyRefId, scenario.packageId])).rows[0];
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
}
async function privacySnapshot(scenario, baseline, phase) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
    const catalog = (await client.query(`SELECT c.relname AS table_name,a.attname AS column_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,
    [Object.keys(privacyColumnContract)])).rows;
    for (const [table, columns] of Object.entries(privacyColumnContract)) {
      const actual = catalog.filter(row => row.table_name === table).map(row => row.column_name)
        .filter(column => table !== "study_references" || column.startsWith("temporary_"));
      privacyAssert(actual.sort().join(",") === [...columns].sort().join(","), "CATALOG");
    }
    const tableNames = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename);
    privacyAssert(JSON.stringify(tableNames) === JSON.stringify(baseline.tables), "TABLE_INVENTORY");
    const approved = (await client.query(`SELECT sr.study_instance_uid,pm.local_patient_id,pm.status
      FROM study_references sr CROSS JOIN patient_mappings pm WHERE sr.study_ref_id=$1
        AND pm.mapping_id='15000000-0000-4000-8000-000000000002'`, [scenario.studyRefId])).rows;
    const changed = scenario.mutation && ["MUTATED", "DENIED"].includes(phase);
    privacyAssert(approved.length === 1 && approved[0].study_instance_uid === baseline.studyUid &&
      approved[0].local_patient_id === (changed && scenario.mutation === "MAPPING_REBOUND" ? "TEST-R6-REBOUND" : baseline.patientId) &&
      approved[0].status === (changed && scenario.mutation === "MAPPING_REVOKED" ? "REVOKED" : "VALID"), "APPROVED_IDENTIFIERS");
    if (scenario.mutation) {
      const actors = (await client.query(`SELECT actor_id,tenant_id,hospital_id,actor_type,external_subject,status
        FROM actors WHERE actor_id=$1`, [ids.actor])).rows;
      privacyAssert(actors.length === 1 && actors[0].actor_id === ids.actor && actors[0].tenant_id === ids.tenant &&
        actors[0].hospital_id === '04000000-0000-4000-8000-000000000002' && actors[0].actor_type === 'USER' &&
        actors[0].external_subject === 'synthetic-int001-source-capture-actor' &&
        actors[0].status === (changed && scenario.mutation === "ACTOR_INACTIVE" ? "INACTIVE" : "ACTIVE"), "REGISTRY_MUTATION");
    }
    if (scenario.consentWithdrawal) {
      const consent = (await client.query(`SELECT c.consent_id,c.exchange_session_id,c.status,c.withdrawn_at,
        g.grant_id,g.consent_id AS grant_consent_id,g.status AS grant_status
        FROM consents c JOIN transfer_grants g ON g.consent_id=c.consent_id
        WHERE c.consent_id=$1 AND g.grant_id=$2`, [scenario.consentId,scenario.grantId])).rows;
      privacyAssert(consent.length === 1 && consent[0].consent_id === scenario.consentId &&
        consent[0].exchange_session_id === scenario.sessionId && consent[0].status === 'WITHDRAWN' &&
        consent[0].withdrawn_at instanceof Date && Number.isFinite(consent[0].withdrawn_at.getTime()) &&
        consent[0].grant_id === scenario.grantId && consent[0].grant_consent_id === scenario.consentId &&
        consent[0].grant_status === 'ACTIVE', 'CONSENT_WITHDRAWAL');
    }
    const expectedDigest = (await client.query("SELECT source_digest FROM integrity_evidence WHERE operation_id=$1 AND verification_stage='SOURCE_CAPTURE'", [ids.operation])).rows[0]?.source_digest;
    const snapshot = {
      study_references: (await client.query(`SELECT temporary_storage_ref,temporary_payload_state,temporary_payload_expires_at,temporary_payload_purged_at
        FROM study_references WHERE study_ref_id=$1`, [scenario.studyRefId])).rows,
      integrity_evidence: (await client.query("SELECT * FROM integrity_evidence WHERE operation_id=$1", [scenario.operationId])).rows,
      audit_events: (await client.query("SELECT * FROM audit_events WHERE correlation_id=ANY($1::uuid[])", [[scenario.correlationId, scenario.revokeCorrelationId]])).rows,
    };
    // Existing observer-only membership, never a new grant or API credential.
    await client.query("SET LOCAL ROLE mediq_quota_owner");
    snapshot.temporary_payload_quota_state = (await client.query("SELECT * FROM temporary_payload_quota_state")).rows;
    snapshot.temporary_payload_package_quotas = (await client.query("SELECT * FROM temporary_payload_package_quotas WHERE package_id=$1", [scenario.packageId])).rows;
    snapshot.temporary_payload_reservations = (await client.query("SELECT * FROM temporary_payload_reservations WHERE study_ref_id=$1", [scenario.studyRefId])).rows;
    return assertPrivacySnapshot(snapshot, scenario, expectedDigest);
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
}

async function assertCoordinatorFaultPendingObserver() {
  const scenario = coordinatorFaultCases.find(item => item.name === "purge-unresolved");
  privacyAssert(Boolean(scenario), "COORD004_FAULT_PENDING_FIXTURE");
  const rows = (await pool.query(`SELECT op.tenant_id::text AS tenant_id,op.actor_id::text AS actor_id,
      op.exchange_session_id::text AS exchange_session_id,op.study_ref_id::text AS study_ref_id,
      op.idempotency_key::text AS idempotency_key,op.state AS operation_state,op.version,op.stow_started_at,
      count(DISTINCT ie.integrity_id)::integer AS evidence_count,
      count(DISTINCT pr.provenance_id)::integer AS provenance_count,
      sr.temporary_storage_ref::text AS temporary_storage_ref,sr.temporary_payload_state,
      sr.temporary_payload_expires_at,sr.temporary_payload_purged_at
    FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    LEFT JOIN integrity_evidence ie ON ie.operation_id=op.operation_id
    LEFT JOIN provenance_records pr ON pr.operation_id=op.operation_id
    WHERE op.operation_id=$1::uuid GROUP BY op.operation_id,sr.study_ref_id`, [scenario.operationId])).rows;
  privacyAssert(rows.length === 1, "COORD004_FAULT_PENDING_OPERATION_CARDINALITY");
  const row = rows[0];
  privacyAssert(row.tenant_id === ids.tenant && row.actor_id === ids.actor &&
    row.exchange_session_id === scenario.sessionId && row.study_ref_id === scenario.studyRefId &&
    row.idempotency_key === scenario.idempotencyKey && row.operation_state === "CREATED" && row.version === 0 &&
    row.stow_started_at === null && row.evidence_count === 0 && row.provenance_count === 0 &&
    /^[0-9a-f-]{36}$/i.test(row.temporary_storage_ref ?? "") &&
    row.temporary_payload_state === "PURGE_PENDING" && row.temporary_payload_expires_at instanceof Date &&
    row.temporary_payload_purged_at === null, "COORD004_FAULT_PENDING_OPERATION_AND_METADATA");
  const quota = await inspectLifecycleQuota(scenario);
  privacyAssert(BigInt(quota.environment_reserved) > 0n && quota.refs === 1 && quota.packages === 1,
    "COORD004_FAULT_PENDING_QUOTA_RETAINED");
  const audits = (await pool.query(`SELECT actor_id::text AS actor_id,tenant_id::text AS tenant_id,
      exchange_session_id::text AS exchange_session_id,resource_type,resource_id::text AS resource_id,
      action,result,reason_code,correlation_id::text AS correlation_id
    FROM audit_events WHERE correlation_id=$1::uuid ORDER BY action COLLATE "C"`,
  [scenario.correlationId])).rows;
  const expected = [{
    actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: scenario.sessionId,
    resource_type: "PACS_TRANSFER_OPERATION", resource_id: scenario.operationId,
    action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", result: "SUCCESS", reason_code: "CREATED",
    correlation_id: scenario.correlationId,
  }, ...scenario.auditTuples.map(tuple => {
    const [action, resourceType, result, reason] = tuple.split("|");
    return {
      actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: scenario.sessionId,
      resource_type: resourceType,
      resource_id: resourceType === "PACS_TRANSFER_OPERATION" ? scenario.operationId : scenario.studyRefId,
      action, result, reason_code: reason === "NULL" ? null : reason, correlation_id: scenario.correlationId,
    };
  })].sort((left, right) => left.action < right.action ? -1 : left.action > right.action ? 1 : 0);
  privacyAssert(JSON.stringify(audits) === JSON.stringify(expected), "COORD004_FAULT_PENDING_EXACT_AUDIT");
}

async function servePrivacyObserver() {
  const observationToken = process.env.MEDIQ_TEST_OBSERVATION_TOKEN;
  privacyAssert(privacyTokenMatches(observationToken, observationToken), "TOKEN_CONFIGURATION");
  privacyAssert(decodeURIComponent(new URL(databaseUrl).username) === "mediq_migrator", "OBSERVER_ROLE");
  const approved = (await pool.query(`SELECT sr.study_instance_uid,pm.local_patient_id,pm.status
    FROM study_references sr CROSS JOIN patient_mappings pm WHERE sr.study_ref_id=$1
      AND pm.mapping_id='15000000-0000-4000-8000-000000000002'`, [ids.study])).rows[0];
  privacyAssert(approved?.status === "VALID", "BASELINE");
  const baseline = { studyUid: approved.study_instance_uid, patientId: approved.local_patient_id,
    tables: (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename) };
  const observed = new Set();
  let failed = false, active = 0;
  const server = createServer(async (request, response) => {
    const reply = (status, body) => response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
    if (!privacyTokenMatches(observationToken, request.headers["x-mediq-test-observation"])) return reply(401, { status: "DENIED" });
    if (request.method === "GET" && request.url === "/health") return reply(200, { status: "READY" });
    if (request.method === "GET" && request.url === "/summary") {
      const complete = allSourceLifecycleCases.every(scenario => expectedPrivacyPhases(scenario)
        .every(phase => observed.has(`${scenario.name}:${phase}`))) && observed.has("COORD004_FAULT_PENDING");
      return reply(!failed && complete && active === 0 ? 200 : 503, { status: !failed && complete && active === 0 ? "PRIVACY_OBSERVER_PASS" : "INCOMPLETE" });
    }
    if (request.method !== "POST" || !["/probe", "/fault-pending"].includes(request.url)) return reply(404, { status: "DENIED" });
    if (active >= 4) return reply(429, { status: "DENIED" });
    active++;
    try {
      let body = "", size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        privacyAssert(size <= 1024, "BODY_BOUND");
        body += chunk.toString("utf8");
      }
      const payload = JSON.parse(body);
      if (request.url === "/fault-pending") {
        privacyAssert(Object.keys(payload).sort().join(",") === "scenario" && payload.scenario === "purge-unresolved",
          "COORD004_FAULT_PENDING_PROTOCOL");
        await assertCoordinatorFaultPendingObserver();
        observed.add("COORD004_FAULT_PENDING");
        reply(200, { status: "OK" });
        return;
      }
      const { scenario, phase } = parsePrivacyProbe(payload);
      const result = await privacySnapshot(scenario, baseline, phase);
      if (phase === "RESERVED") privacyAssert(result.state === "STAGING" && result.reserved === 0, "RESERVED_PHASE");
      if (phase === "QUOTA") privacyAssert(result.state === "STAGING" && result.reserved > 0, "QUOTA_PHASE");
      if (phase === "AVAILABLE") privacyAssert(result.state === "AVAILABLE" && result.reserved > 0, "AVAILABLE_PHASE");
      if (phase === "PHYSICAL_ABSENT") privacyAssert(["PURGE_PENDING", "PURGED"].includes(result.state), "PURGE_PHASE");
      if (phase === "FINAL") privacyAssert(result.state === (scenario.boundary === "METADATA" ? null : "PURGED") && result.reserved === 0, "FINAL_PHASE");
      if (["MUTATED", "DENIED", "RESTORED", "WITHDRAWN"].includes(phase)) {
        const expected = scenario.boundary === "METADATA" ? null : scenario.boundary === "RESERVED" ? "STAGING" : "AVAILABLE";
        privacyAssert(result.state === expected && (expected === "AVAILABLE" ? result.reserved > 0 : result.reserved === 0), "MUTATION_PHASE");
      }
      observed.add(`${scenario.name}:${phase}`);
      reply(200, { status: "OK" });
    } catch (error) {
      failed = true;
      const code = /^DEC017_PRIVACY_[A-Z_]{1,80}$/.test(error?.message ?? "") ? error.message : "DEC017_PRIVACY_OBSERVER_UNAVAILABLE";
      reply(503, { status: "FAILED", code });
    } finally { active--; }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 16;
  server.maxConnections = 8;
  const stopped = new Promise(resolve => server.once("close", resolve));
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGTERM", stop);
  const deadline = setTimeout(stop, 30 * 60 * 1000);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(8791, "0.0.0.0", resolve); });
    console.log("INT001_PRIVACY_OBSERVER_READY");
    await stopped;
  } finally { clearTimeout(deadline); process.removeListener("SIGTERM", stop); }
}

if (process.argv.includes("--serve-privacy")) {
  try { await servePrivacyObserver(); }
  catch { throw new Error("INT001_PRIVACY_OBSERVER_UNAVAILABLE"); }
  finally { await pool.end(); }
} else {
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
    [`${ids.coordinatorCorrelation}|PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|CREATED`, 1],
    [`${ids.coordinatorCorrelation}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.coordinatorCorrelation}|PACS_SOURCE_CAPTURED|SUCCESS|<NULL>`, 1],
    [`${ids.coordinatorCorrelation}|PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|EXPLICIT_CLOSE`, 1],
    [`${ids.coordinatorMappingCorrelation}|PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|CREATED`, 1],
    [`${ids.coordinatorMappingCorrelation}|PACS_SOURCE_CAPTURE_DENIED|DENY|PATIENT_MAPPING_INVALID`, 1],
    [`${ids.coordinatorPatientIdCorrelation}|PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|CREATED`, 1],
    [`${ids.coordinatorPatientIdCorrelation}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.coordinatorPatientIdCorrelation}|PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_PATIENT_ID_MISMATCH`, 1],
    [`${ids.coordinatorMetadataCorrelation}|PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|CREATED`, 1],
    [`${ids.coordinatorMetadataCorrelation}|PACS_SOURCE_CAPTURE_STARTED|ALLOW|<NULL>`, 1],
    [`${ids.coordinatorMetadataCorrelation}|PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED`, 1],
  ]);
  for (const scenario of coordinatorFaultCases) {
    expectedAudit.set(`${scenario.correlationId}|PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|CREATED`, 1);
    for (const tuple of scenario.auditTuples) {
      const [action, _resourceType, result, reason] = tuple.split("|");
      expectedAudit.set(`${scenario.correlationId}|${action}|${result}|${reason === "NULL" ? "<NULL>" : reason}`, 1);
    }
  }
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
      "PACS_TEMPORARY_OBJECT_PURGED",
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
    "PACS_TEMPORARY_OBJECT_PURGED|STUDY|SUCCESS|CAPTURE_FAILURE",
    "PACS_TEMPORARY_OBJECT_PURGED|STUDY|SUCCESS|EXPLICIT_CLOSE",
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
  console.log(`int001_capture_audit=PASS denied=13 unresolved=4 failed=9 started=15 capture_success=2 grant_revoked=1 source_rows=${sourceAuditResult.rows.length} metadata_allowlist=PASS`);
  console.log("int001_cap003_operation_matrix=PASS mismatched_bindings=2 failed_state=1 no_evidence=true");
  console.log("int001_cap010_success_capture=PASS evidence=pending_one success_audit=one operation_state=CREATED response_allowlist=true");
  console.log("int001_cap012_insert_failures=PASS start_no_wado=true final_transaction_rollback=true operation_state=CREATED evidence=none");

  const coordinator = (await pool.query(`SELECT op.operation_id::text,op.tenant_id::text,op.actor_id::text,
    op.exchange_session_id::text,op.study_ref_id::text,op.idempotency_key::text,op.request_digest,
    op.state,op.version,op.stow_started_at,ie.verification_stage,ie.status AS evidence_status,
    ie.algorithm,ie.source_digest,ie.source_object_count,ie.verified_at,
    pr.provenance_id::text,pr.package_id::text,pr.source_hospital_id::text,pr.destination_hospital_id::text,
    pr.integrity_id::text,pr.transfer_type,pr.transfer_status,pr.ingested_at,pr.transferred_at,
    sr.temporary_storage_ref::text,sr.temporary_payload_state,sr.temporary_payload_purged_at
    FROM pacs_transfer_operations op JOIN integrity_evidence ie ON ie.operation_id=op.operation_id
    LEFT JOIN provenance_records pr ON pr.operation_id=op.operation_id
    JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    WHERE op.operation_id=$1::uuid`, [ids.coordinatorOperation])).rows;
  assert.equal(coordinator.length, 1, "COORD004_INDEPENDENT_GRAPH");
  const row = coordinator[0];
  assert.equal(row.tenant_id, ids.tenant);
  assert.equal(row.actor_id, ids.actor);
  assert.equal(row.exchange_session_id, ids.coordinatorSession);
  assert.equal(row.study_ref_id, ids.coordinatorStudy);
  assert.equal(row.idempotency_key, ids.coordinatorIdempotency);
  const canonicalDigest = JSON.stringify({ action: "PACS_IMPORT", actorId: ids.actor,
    consentId: ids.coordinatorConsent, exchangeSessionId: ids.coordinatorSession,
    grantId: ids.coordinatorGrant, studyRefId: ids.coordinatorStudy, tenantId: ids.tenant });
  assert.equal(row.request_digest, createHash("sha256").update(canonicalDigest, "utf8").digest("hex"));
  assert.equal(row.state, "CREATED"); assert.equal(row.version, 0); assert.equal(row.stow_started_at, null);
  assert.equal(row.verification_stage, "SOURCE_CAPTURE"); assert.equal(row.evidence_status, "PENDING");
  assert.equal(row.algorithm, "SHA256-MANIFEST-V1"); assert.equal(row.source_object_count, 3); assert.equal(row.verified_at, null);
  assert.match(row.source_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(row.provenance_id, null); assert.equal(row.package_id, null);
  assert.equal(row.source_hospital_id, null); assert.equal(row.destination_hospital_id, null);
  assert.equal(row.integrity_id, null); assert.equal(row.transfer_type, null);
  assert.equal(row.transfer_status, null); assert.equal(row.ingested_at, null); assert.equal(row.transferred_at, null);
  assert.match(row.temporary_storage_ref, /^[0-9a-f-]{36}$/i); assert.equal(row.temporary_payload_state, "PURGED");
  assert.ok(row.temporary_payload_purged_at instanceof Date);
  const coordinatorAudits = (await pool.query(`SELECT actor_id::text,tenant_id::text,
    exchange_session_id::text,resource_type,resource_id::text,action,result,reason_code,
    correlation_id::text FROM audit_events WHERE correlation_id=$1::uuid ORDER BY action`,
  [ids.coordinatorCorrelation])).rows;
  assert.deepEqual(coordinatorAudits, [
    { actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: ids.coordinatorSession,
      resource_type: "STUDY", resource_id: ids.coordinatorStudy, action: "PACS_SOURCE_CAPTURED",
      result: "SUCCESS", reason_code: null, correlation_id: ids.coordinatorCorrelation },
    { actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: ids.coordinatorSession,
      resource_type: "STUDY", resource_id: ids.coordinatorStudy, action: "PACS_SOURCE_CAPTURE_STARTED",
      result: "ALLOW", reason_code: null, correlation_id: ids.coordinatorCorrelation },
    { actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: ids.coordinatorSession,
      resource_type: "STUDY", resource_id: ids.coordinatorStudy, action: "PACS_TEMPORARY_OBJECT_PURGED",
      result: "SUCCESS", reason_code: "EXPLICIT_CLOSE", correlation_id: ids.coordinatorCorrelation },
    { actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: ids.coordinatorSession,
      resource_type: "PACS_TRANSFER_OPERATION", resource_id: ids.coordinatorOperation,
      action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", result: "SUCCESS", reason_code: "CREATED",
      correlation_id: ids.coordinatorCorrelation },
  ], "COORD004_INDEPENDENT_AUDIT_BINDING");
  const coordinatorFixture = { studyRefId: ids.coordinatorStudy, packageId: ids.coordinatorPackage };
  const coordinatorQuota = await inspectLifecycleQuota(coordinatorFixture);
  assert.equal(coordinatorQuota.refs, 0);
  assert.equal(coordinatorQuota.packages, 0);
  console.log("int001_pacs_import_coordinator=PASS independent_runtime_facts=true operation=CREATED source_evidence=one provenance=ABSENT_BEFORE_DISPATCH temp_payload=PURGED quota=0");

  const coordinatorSourceCases = [
    { operationId: ids.coordinatorMappingOperation, sessionId: ids.coordinatorMappingSession,
      packageId: ids.coordinatorMappingPackage, studyRefId: ids.coordinatorMappingStudy,
      idempotencyKey: ids.coordinatorMappingIdempotency, correlationId: ids.coordinatorMappingCorrelation,
      sourceAudit: "PACS_SOURCE_CAPTURE_DENIED|DENY|PATIENT_MAPPING_INVALID" },
    { operationId: ids.coordinatorPatientIdOperation, sessionId: ids.coordinatorPatientIdSession,
      packageId: ids.coordinatorPatientIdPackage, studyRefId: ids.coordinatorPatientIdStudy,
      idempotencyKey: ids.coordinatorPatientIdIdempotency, correlationId: ids.coordinatorPatientIdCorrelation,
      sourceAudit: "PACS_SOURCE_CAPTURE_STARTED|ALLOW|NULL,PACS_SOURCE_CAPTURE_DENIED|DENY|SOURCE_PATIENT_ID_MISMATCH" },
    { operationId: ids.coordinatorMetadataOperation, sessionId: ids.coordinatorMetadataSession,
      packageId: ids.coordinatorMetadataPackage, studyRefId: ids.coordinatorMetadataStudy,
      idempotencyKey: ids.coordinatorMetadataIdempotency, correlationId: ids.coordinatorMetadataCorrelation,
      sourceAudit: "PACS_SOURCE_CAPTURE_STARTED|ALLOW|NULL,PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_READ_FAILED" },
  ];
  const coordinatorSourceOperations = (await pool.query(`SELECT op.operation_id::text AS operation_id,
      op.tenant_id::text AS tenant_id,op.actor_id::text AS actor_id,
      op.exchange_session_id::text AS exchange_session_id,op.study_ref_id::text AS study_ref_id,
      op.idempotency_key::text AS idempotency_key,op.state AS operation_state,op.version,op.stow_started_at,
      count(DISTINCT ie.integrity_id)::integer AS evidence_count,
      count(DISTINCT pr.provenance_id)::integer AS provenance_count,
      sr.temporary_storage_ref::text AS temporary_storage_ref,sr.temporary_payload_state,
      sr.temporary_payload_expires_at,sr.temporary_payload_purged_at
    FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    LEFT JOIN integrity_evidence ie ON ie.operation_id=op.operation_id
    LEFT JOIN provenance_records pr ON pr.operation_id=op.operation_id
    WHERE op.operation_id=ANY($1::uuid[])
    GROUP BY op.operation_id,sr.study_ref_id
    ORDER BY op.operation_id`, [coordinatorSourceCases.map(scenario => scenario.operationId)])).rows;
  assert.deepEqual(coordinatorSourceOperations, coordinatorSourceCases.map(scenario => ({
    operation_id: scenario.operationId,
    tenant_id: ids.tenant,
    actor_id: ids.actor,
    exchange_session_id: scenario.sessionId,
    study_ref_id: scenario.studyRefId,
    idempotency_key: scenario.idempotencyKey,
    operation_state: "CREATED",
    version: 0,
    stow_started_at: null,
    evidence_count: 0,
    provenance_count: 0,
    temporary_storage_ref: null,
    temporary_payload_state: null,
    temporary_payload_expires_at: null,
    temporary_payload_purged_at: null,
  })), "COORD004_SOURCE_INDEPENDENT_OPERATION_EVIDENCE_PAYLOAD_BINDING");

  for (const scenario of coordinatorSourceCases) {
    const quota = await inspectLifecycleQuota(scenario);
    assert.equal(quota.refs, 0, "COORD004_SOURCE_INDEPENDENT_QUOTA_RELEASED");
    assert.equal(quota.packages, 0, "COORD004_SOURCE_INDEPENDENT_QUOTA_RELEASED");
    const rows = (await pool.query(`SELECT actor_id::text AS actor_id,tenant_id::text AS tenant_id,
        exchange_session_id::text AS exchange_session_id,resource_type,resource_id::text AS resource_id,
        action,result,reason_code,correlation_id::text AS correlation_id
      FROM audit_events WHERE correlation_id=$1::uuid ORDER BY action COLLATE "C"`, [scenario.correlationId])).rows;
    const expected = [
      {
      actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: scenario.sessionId,
      resource_type: "PACS_TRANSFER_OPERATION", resource_id: scenario.operationId,
      action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", result: "SUCCESS", reason_code: "CREATED",
      correlation_id: scenario.correlationId,
      },
      ...scenario.sourceAudit.split(",").map(tuple => {
        const [action, result, reason] = tuple.split("|");
        return {
          actor_id: ids.actor,
          tenant_id: ids.tenant,
          exchange_session_id: scenario.sessionId,
          resource_type: "STUDY",
          resource_id: scenario.studyRefId,
          action,
          result,
          reason_code: reason === "NULL" ? null : reason,
          correlation_id: scenario.correlationId,
        };
      }),
    ].sort((left, right) => left.action < right.action ? -1 : left.action > right.action ? 1 : 0);
    assert.deepEqual(rows, expected,
      "COORD004_SOURCE_INDEPENDENT_AUDIT_BINDING");
  }
  assert.deepEqual((await pool.query(`SELECT mapping_id::text AS mapping_id,
      patient_ref_id::text AS patient_ref_id,hospital_id::text AS hospital_id,
      local_patient_id,status,validated_at
    FROM patient_mappings WHERE mapping_id='15000000-0000-4000-8000-000000000052'`)).rows,
  [{ mapping_id: "15000000-0000-4000-8000-000000000052",
    patient_ref_id: "15000000-0000-4000-8000-000000000051",
    hospital_id: "04000000-0000-4000-8000-000000000002",
    local_patient_id: "TEST-PATIENT-COORD-INVALID", status: "REVOKED", validated_at: null }],
  "COORD004_SOURCE_INVALID_MAPPING_FIXTURE_UNCHANGED");
  console.log("int001_pacs_import_source_denials=PASS cases=3 exact_operation_audit=true evidence_provenance_payload=0 quota=0");

  const coordinatorFaultRows = (await pool.query(`SELECT op.operation_id::text AS operation_id,
      op.tenant_id::text AS tenant_id,op.actor_id::text AS actor_id,
      op.exchange_session_id::text AS exchange_session_id,op.study_ref_id::text AS study_ref_id,
      op.idempotency_key::text AS idempotency_key,op.state AS operation_state,op.version,op.stow_started_at,
      count(DISTINCT ie.integrity_id)::integer AS evidence_count,
      count(DISTINCT pr.provenance_id)::integer AS provenance_count,
      sr.temporary_storage_ref::text AS temporary_storage_ref,sr.temporary_payload_state,
      sr.temporary_payload_expires_at,sr.temporary_payload_purged_at
    FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    LEFT JOIN integrity_evidence ie ON ie.operation_id=op.operation_id
    LEFT JOIN provenance_records pr ON pr.operation_id=op.operation_id
    WHERE op.operation_id=ANY($1::uuid[])
    GROUP BY op.operation_id,sr.study_ref_id ORDER BY op.operation_id`,
  [coordinatorFaultCases.map(scenario => scenario.operationId)])).rows;
  assert.equal(coordinatorFaultRows.length, coordinatorFaultCases.length,
    "COORD004_FAULT_INDEPENDENT_OPERATION_CARDINALITY");
  const unresolvedPurgeCase = coordinatorFaultCases.find(scenario => scenario.name === "purge-unresolved");
  assert.ok(unresolvedPurgeCase, "COORD004_FAULT_UNRESOLVED_CASE_PRESENT");
  const unresolvedQuota = await inspectLifecycleQuota(unresolvedPurgeCase);
  assert.ok(BigInt(unresolvedQuota.environment_reserved) > 0n,
    "COORD004_FAULT_UNRESOLVED_QUOTA_REMAINS_RESERVED");
  assert.equal(unresolvedQuota.refs, 1);
  assert.equal(unresolvedQuota.packages, 1);
  for (const [index, scenario] of coordinatorFaultCases.entries()) {
    const row = coordinatorFaultRows[index];
    assert.deepEqual({
      operation_id: row.operation_id,
      tenant_id: row.tenant_id,
      actor_id: row.actor_id,
      exchange_session_id: row.exchange_session_id,
      study_ref_id: row.study_ref_id,
      idempotency_key: row.idempotency_key,
      operation_state: row.operation_state,
      version: row.version,
      stow_started_at: row.stow_started_at,
      evidence_count: row.evidence_count,
      provenance_count: row.provenance_count,
    }, {
      operation_id: scenario.operationId,
      tenant_id: ids.tenant,
      actor_id: ids.actor,
      exchange_session_id: scenario.sessionId,
      study_ref_id: scenario.studyRefId,
      idempotency_key: scenario.idempotencyKey,
      operation_state: "CREATED",
      version: 0,
      stow_started_at: null,
      evidence_count: 0,
      provenance_count: 0,
    }, "COORD004_FAULT_INDEPENDENT_OPERATION_AND_EVIDENCE_BINDING");
    if (scenario.temporaryState === "NONE") {
      assert.equal(row.temporary_storage_ref, null);
      assert.equal(row.temporary_payload_state, null);
      assert.equal(row.temporary_payload_expires_at, null);
      assert.equal(row.temporary_payload_purged_at, null);
    } else {
      assert.match(row.temporary_storage_ref, /^[0-9a-f-]{36}$/i);
      assert.equal(row.temporary_payload_state, scenario.temporaryState);
      assert.ok(row.temporary_payload_expires_at instanceof Date);
      if (scenario.temporaryState === "PURGED") assert.ok(row.temporary_payload_purged_at instanceof Date);
      else assert.equal(row.temporary_payload_purged_at, null,
        "COORD004_FAULT_UNRESOLVED_PURGE_REMAINS_PENDING");
    }
    const quota = await inspectLifecycleQuota(scenario);
    if (scenario.quota === "ZERO") {
      assert.deepEqual(quota, {
        environment_reserved: unresolvedQuota.environment_reserved,
        refs: 0,
        packages: 0,
      },
        "COORD004_FAULT_INDEPENDENT_QUOTA_RELEASED");
    } else {
      assert.deepEqual(quota, unresolvedQuota, "COORD004_FAULT_UNRESOLVED_QUOTA_BOUND_TO_ONE_PACKAGE");
    }
    const audits = (await pool.query(`SELECT actor_id::text AS actor_id,tenant_id::text AS tenant_id,
        exchange_session_id::text AS exchange_session_id,resource_type,resource_id::text AS resource_id,
        action,result,reason_code,correlation_id::text AS correlation_id
      FROM audit_events WHERE correlation_id=$1::uuid ORDER BY action COLLATE "C"`,
    [scenario.correlationId])).rows;
    const expected = [{
      actor_id: ids.actor,
      tenant_id: ids.tenant,
      exchange_session_id: scenario.sessionId,
      resource_type: "PACS_TRANSFER_OPERATION",
      resource_id: scenario.operationId,
      action: "PACS_TRANSFER_OPERATION_STATE_CHANGED",
      result: "SUCCESS",
      reason_code: "CREATED",
      correlation_id: scenario.correlationId,
    }, ...scenario.auditTuples.map(tuple => {
      const [action, resourceType, result, reason] = tuple.split("|");
      return {
        actor_id: ids.actor,
        tenant_id: ids.tenant,
        exchange_session_id: scenario.sessionId,
        resource_type: resourceType,
        resource_id: resourceType === "PACS_TRANSFER_OPERATION" ? scenario.operationId : scenario.studyRefId,
        action,
        result,
        reason_code: reason === "NULL" ? null : reason,
        correlation_id: scenario.correlationId,
      };
    })].sort((left, right) => left.action < right.action ? -1 : left.action > right.action ? 1 : 0);
    assert.deepEqual(audits, expected, "COORD004_FAULT_INDEPENDENT_EXACT_AUDIT_BINDING");
  }
  console.log("int001_pacs_import_faults=PASS cases=8 exact_operation_audit=true integrity_provenance=0 quota_and_purge_observed=true");

  // Separate observer process: these privileged reads are not application rights.
  const baselineDigest = (await pool.query("SELECT source_digest FROM integrity_evidence WHERE operation_id=$1 AND verification_stage='SOURCE_CAPTURE'", [ids.operation])).rows[0].source_digest;
  for (const scenario of allSourceLifecycleCases) {
    const rows = await pool.query(`SELECT op.state,op.version,op.stow_started_at,
      sr.temporary_storage_ref::text,sr.temporary_payload_state,sr.temporary_payload_purged_at,
      sr.temporary_payload_expires_at,sr.study_instance_uid,
      p.state AS package_state,p.storage_ref,p.study_count,p.patient_ref_id::text,
      p.source_hospital_id::text, p.deleted_at,
      g.status AS grant_status,c.status AS consent_status,
      (SELECT count(*)::int FROM integrity_evidence ie WHERE ie.operation_id=op.operation_id) AS evidence_count
      FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
      JOIN imaging_packages p ON p.package_id=sr.package_id JOIN transfer_grants g ON g.grant_id=$2
      JOIN consents c ON c.consent_id=g.consent_id
      WHERE op.operation_id=$1`, [scenario.operationId, scenario.grantId]);
    assert.equal(rows.rowCount, 1, "DEC017_OBSERVER_GRAPH");
    const row = rows.rows[0];
    assert.equal(row.state, "CREATED"); assert.equal(row.version, 0); assert.equal(row.stow_started_at, null);
    const noAllocation = scenario.boundary === "METADATA";
    assert.equal(row.temporary_payload_state, noAllocation ? null : "PURGED");
    if (noAllocation) {
      assert.equal(row.temporary_storage_ref, null); assert.equal(row.temporary_payload_purged_at, null); assert.equal(row.temporary_payload_expires_at, null);
    } else {
      assert.match(row.temporary_storage_ref, /^[0-9a-f-]{36}$/);
      assert.ok(row.temporary_payload_purged_at instanceof Date && row.temporary_payload_expires_at instanceof Date);
    }
    assert.equal(row.study_instance_uid, "2.25.139413224574575433810421680499794275977");
    assert.equal(row.package_state, "AVAILABLE"); assert.equal(row.storage_ref, null);
    assert.equal(row.study_count, 1); assert.equal(row.deleted_at, null);
    assert.equal(row.patient_ref_id, "15000000-0000-4000-8000-000000000001");
    assert.equal(row.source_hospital_id, "04000000-0000-4000-8000-000000000001");
    assert.equal(row.grant_status, scenario.name === "read_revoked" ? "REVOKED" : "ACTIVE");
    assert.equal(row.consent_status, scenario.name === "read_withdrawn" || scenario.consentWithdrawal ? "WITHDRAWN" : "ACTIVE");
    const completionFailed = ["completion_audit_failure", "capture_write_failure", "capture_fsync_failure", "capture_evidence_failure", "capture_mapping_revoked", "capture_actor_inactive", "capture_consent_withdrawn"].includes(scenario.name);
    assert.equal(row.evidence_count, completionFailed ? 0 : 1);
    if (!completionFailed) {
      const evidence = (await pool.query(`SELECT verification_stage,status,verified_at,source_digest,source_object_count
        FROM integrity_evidence WHERE operation_id=$1`, [scenario.operationId])).rows;
      assert.deepEqual(evidence, [{ verification_stage: "SOURCE_CAPTURE", status: "PENDING", verified_at: null,
        source_digest: baselineDigest, source_object_count: 3 }]);
    }
    const audits = (await pool.query(`SELECT actor_id::text,tenant_id::text,exchange_session_id::text,
      resource_type,resource_id::text,action,result,reason_code,correlation_id::text
      FROM audit_events WHERE correlation_id=ANY($1::uuid[])`, [[scenario.correlationId, scenario.revokeCorrelationId]])).rows;
    const observed = {};
    for (const audit of audits) {
      const withdraw = audit.action === "CONSENT_WITHDRAWN";
      assert.equal(audit.actor_id, withdraw ? "0a000000-0000-4000-8000-000000000003" : ids.actor);
      assert.equal(audit.tenant_id, ids.tenant);
      assert.equal(audit.exchange_session_id, scenario.sessionId);
      const revoke = audit.action === "GRANT_REVOKED";
      assert.equal(audit.resource_type, revoke ? "TRANSFER_GRANT" : withdraw ? "CONSENT" : "STUDY");
      assert.equal(audit.resource_id, revoke ? scenario.grantId : withdraw ? scenario.consentId : scenario.studyRefId);
      assert.equal(audit.correlation_id, revoke || withdraw ? scenario.revokeCorrelationId : scenario.correlationId);
      const key = `${audit.action}|${audit.result}|${audit.reason_code ?? "NULL"}`;
      observed[key] = (observed[key] ?? 0) + 1;
    }
    const replay = scenario.name === "replay_refetch", competing = scenario.name === "concurrent_capture";
    const replica = scenario.name === "replica_recovery";
    const validRead = scenario.name === "roundtrip" || replay || competing || replica;
    const readCount = replay ? 6 : validRead ? 3 : 1;
    const expected = { "PACS_SOURCE_CAPTURE_STARTED|ALLOW|NULL": replay ? 3 : competing ? 2 : 1,
      [`PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|${completionFailed ? "CAPTURE_FAILURE" : replica ? "PROCESS_RESTART" : "EXPLICIT_CLOSE"}`]: replay ? 2 : 1 };
    if (completionFailed) {
      const reason = ["capture_write_failure", "capture_fsync_failure"].includes(scenario.name)
        ? "SOURCE_READ_FAILED" : "SOURCE_CAPTURE_PERSISTENCE_FAILED";
      expected[`PACS_SOURCE_CAPTURE_FAILED|FAILURE|${reason}`] = 1;
    }
    else {
      expected["PACS_SOURCE_CAPTURED|SUCCESS|NULL"] = replay ? 2 : 1;
      expected["PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT"] = readCount;
      if (validRead) expected["PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DELIVERY"] = readCount;
      if (!validRead || replay || replica) expected["PACS_TEMPORARY_READ_FAILED|FAILURE|TEMPORARY_READ_FAILED"] = 1;
      if (scenario.name === "read_revoked") expected["GRANT_REVOKED|SUCCESS|NULL"] = 1;
      if (scenario.name === "read_withdrawn") expected["CONSENT_WITHDRAWN|SUCCESS|NULL"] = 1;
      if (competing || replay) expected["PACS_SOURCE_CAPTURE_FAILED|FAILURE|SOURCE_CAPTURE_PERSISTENCE_FAILED"] = 1;
    }
    if (scenario.consentWithdrawal) {
      assert.deepEqual(observed, { 'PACS_SOURCE_CAPTURE_STARTED|ALLOW|NULL': 1,
        'CONSENT_WITHDRAWN|SUCCESS|NULL': 1, 'PACS_SOURCE_CAPTURE_DENIED|DENY|AUTHORIZATION_DENIED': 1 }, 'DEC017_OBSERVER_CAPTURE_WITHDRAWAL_AUDIT');
    } else if (scenario.mutation) {
      const mutationAudits = Object.fromEntries(Object.entries(mutationExpectedAudit(scenario, true)).map(([key, count]) => [key.endsWith('|') ? key + 'NULL' : key, count]));
      if (!noAllocation) mutationAudits["PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|EXPLICIT_CLOSE"] = 1;
      assert.deepEqual(observed, mutationAudits, "DEC017_OBSERVER_MUTATION_AUDIT");
    } else assert.deepEqual(observed, expected, "DEC017_OBSERVER_EXACT_AUDIT");
    assert.doesNotMatch(JSON.stringify(audits), /2\.25\.|TEST-PATIENT|PRIVATE KEY|credential|password|\.enc|\/tmp\//i);
    const quota = await inspectLifecycleQuota(scenario);
    assert.equal(quota.refs, 0);
    assert.equal(quota.packages, 0);
  }
  assert.deepEqual((await pool.query("SELECT local_patient_id,status FROM patient_mappings WHERE mapping_id='15000000-0000-4000-8000-000000000002'")).rows, [{ local_patient_id: "TEST-PATIENT-007", status: "VALID" }]);
  assert.deepEqual((await pool.query("SELECT actor_id,status FROM actors ORDER BY actor_id")).rows,
    [1,2,3].map(n => ({ actor_id: `0a000000-0000-4000-8000-${String(n).padStart(12,'0')}`, status: 'ACTIVE' })));
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM study_references WHERE study_ref_id=ANY($1::uuid[])
    AND (temporary_storage_ref IS NOT NULL OR temporary_payload_state IS NOT NULL OR temporary_payload_expires_at IS NOT NULL OR temporary_payload_purged_at IS NOT NULL)`, [[ids.study, ids.studyOther, ids.studyMissingCount]])).rows[0].n, 0);
  console.log("int001_lifecycle_observer=PASS cases=23 purge_audits=22 quota_released=true operations_created=true approved_identifiers_restored=true capture_consent_withdrawal_persisted=true");
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED";
  const assertionMarker = error?.name === "AssertionError" && typeof error?.message === "string"
    ? /^([A-Z][A-Z0-9_]{1,127})/.exec(error.message)?.[1]
    : undefined;
  throw new Error(`INT001_OBSERVER_FAILED:${safeCode}${assertionMarker ? `:${assertionMarker}` : ""}`);
} finally {
  await pool.end();
}
}
