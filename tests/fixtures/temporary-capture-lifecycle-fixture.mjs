// Fixed synthetic selectors shared by isolated seed/test/independent observer.
// No credential, payload or runtime-generated storage/key material belongs here.
import { timingSafeEqual } from "node:crypto";
import { sourceMutationCases } from "./source-capture-mutation-fixture.mjs";
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const temporaryCaptureLifecycleCases = Object.freeze([
  "roundtrip", "read_revoked", "completion_audit_failure", "read_audit_failure",
  "read_withdrawn", "read_purge_pending", "read_expired_metadata",
  "ciphertext_tampered", "ciphertext_truncated", "ciphertext_swapped",
  "capture_write_failure", "capture_fsync_failure", "capture_evidence_failure",
  "concurrent_capture", "replay_refetch", "replica_recovery",
].map((name, index) => {
  const n = 101 + index;
  return Object.freeze({ name,
    sessionId: id("16", n), sessionKey: id("1c", n),
    packageId: id("17", n), studyRefId: id("18", n),
    consentId: id("19", n), consentActionId: id("19", n + 100),
    grantId: id("1a", n), grantKey: id("1c", n + 100), grantScopeId: id("1a", n + 100),
    operationId: id("1b", n), operationKey: id("1c", n + 200),
    correlationId: id("1d", n), revokeCorrelationId: id("1d", n + 100),
  });
}));

export const captureConsentWithdrawalCase = Object.freeze({
  name: "capture_consent_withdrawn", boundary: "METADATA", consentWithdrawal: true,
  sessionId: id("16", 123), sessionKey: id("1c", 123), packageId: id("17", 123), studyRefId: id("18", 123),
  consentId: id("19", 123), consentActionId: id("19", 223), grantId: id("1a", 123), grantKey: id("1c", 223),
  grantScopeId: id("1a", 223), operationId: id("1b", 123), operationKey: id("1c", 323),
  correlationId: id("1d", 123), revokeCorrelationId: id("1d", 223),
});

// Read-only test-observer contracts, never runtime routes or DB permissions.
export const allSourceLifecycleCases = Object.freeze([...temporaryCaptureLifecycleCases, ...sourceMutationCases, captureConsentWithdrawalCase]);
export const privacyPhases = Object.freeze(["RESERVED", "QUOTA", "AVAILABLE", "READ_RESULT", "PHYSICAL_ABSENT", "FINAL", "MUTATED", "DENIED", "RESTORED", "WITHDRAWN"]);
export function expectedPrivacyPhases(scenario) {
  if (scenario.consentWithdrawal) return ["WITHDRAWN", "DENIED", "FINAL"];
  if (scenario.mutation) {
    const changes = ["MUTATED", "DENIED", "RESTORED", "FINAL"];
    if (scenario.boundary === "METADATA") return changes;
    if (scenario.boundary === "RESERVED") return ["RESERVED", ...changes, "PHYSICAL_ABSENT"];
    return ["RESERVED", "QUOTA", "AVAILABLE", ...changes, "READ_RESULT", "PHYSICAL_ABSENT"];
  }
  const failed = ["completion_audit_failure", "capture_write_failure", "capture_fsync_failure", "capture_evidence_failure"].includes(scenario.name);
  return ["RESERVED", "QUOTA", "PHYSICAL_ABSENT", "FINAL", ...(failed ? [] : ["AVAILABLE", "READ_RESULT"])];
}
export const privacyColumnContract = Object.freeze({
  study_references: ["temporary_storage_ref", "temporary_payload_state", "temporary_payload_expires_at", "temporary_payload_purged_at"],
  temporary_payload_quota_state: ["singleton_id", "max_environment_bytes", "max_package_bytes", "reserved_bytes", "updated_at"],
  temporary_payload_package_quotas: ["package_id", "reserved_bytes", "updated_at"],
  temporary_payload_reservations: ["storage_ref", "quota_state_id", "tenant_id", "study_ref_id", "package_id", "writer_id", "reserved_bytes", "created_at", "updated_at", "settled"],
  integrity_evidence: ["integrity_id", "exchange_session_id", "package_id", "study_ref_id", "verification_stage", "algorithm", "source_digest", "destination_digest", "source_object_count", "destination_object_count", "status", "verified_at", "created_at", "operation_id"],
  audit_events: ["audit_event_id", "occurred_at", "actor_id", "tenant_id", "exchange_session_id", "resource_type", "resource_id", "action", "result", "reason_code", "correlation_id", "created_at"],
});
export function privacyAssert(condition, code) {
  if (!condition) throw new Error(`DEC017_PRIVACY_${code}`);
}
export function privacyTokenMatches(expected, candidate) {
  return typeof expected === "string" && /^[0-9a-f]{64}$/.test(expected) &&
    typeof candidate === "string" && /^[0-9a-f]{64}$/.test(candidate) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}
export function parsePrivacyProbe(input) {
  privacyAssert(input && typeof input === "object" && !Array.isArray(input) &&
    Object.keys(input).sort().join(",") === "phase,scenario", "PROTOCOL");
  const scenario = allSourceLifecycleCases.find(item => item.name === input.scenario);
  privacyAssert(scenario && expectedPrivacyPhases(scenario).includes(input.phase), "PROTOCOL");
  return { scenario, phase: input.phase };
}
export function assertPrivacyText(text) {
  privacyAssert(typeof text === "string" && !/TEST-PATIENT|2\.25\.|PRIVATE KEY|Bearer\s|\/tmp\/|[A-Za-z]:\\|\.enc\b|\b(?:password|credential|plaintext|dek|kek)["']?\s*[:=]/i.test(text), "SENSITIVE_VALUE");
}
export function assertPublicCaptureProjection(result) {
  assertPrivacyText(JSON.stringify(result));
  const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  if (result?.kind === "CAPTURED") {
    privacyAssert(Object.keys(result).sort().join(",") === "evidenceId,kind,objectCount,status" &&
      uuid(result.evidenceId) && result.status === "PENDING" && Number.isSafeInteger(result.objectCount) &&
      result.objectCount > 0 && result.objectCount <= 2000, "PUBLIC_RESULT");
  } else {
    privacyAssert(result?.kind === "DENIED" && Object.keys(result).sort().join(",") === "kind,reason" &&
      ["AUTHORIZATION_DENIED", "OPERATION_NOT_CAPTUREABLE", "PATIENT_MAPPING_INVALID", "SOURCE_PATIENT_ID_MISMATCH", "SOURCE_METADATA_INVALID"].includes(result.reason), "PUBLIC_RESULT");
  }
}
export function assertPublicCaptureError(error) {
  const messages = { AuthorizedSourceCaptureInvalidRequestError: "SOURCE_CAPTURE_REQUEST_INVALID",
    AuthorizedSourceCaptureUnavailableError: "SOURCE_CAPTURE_UNAVAILABLE" };
  privacyAssert(error && messages[error.name] === error.message && typeof error.message === "string" &&
    Object.keys(error).every(key => ["name", "message"].includes(key)), "PUBLIC_ERROR");
  // Public projection only; stack traces and internal handoffs are not responses.
  assertPrivacyText(JSON.stringify({ name: error.name, message: error.message }));
}
export function assertPrivacySnapshot(snapshot, scenario, expectedDigest) {
  const check = (condition, name) => privacyAssert(condition, `SNAPSHOT_${name}`);
  const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  const date = value => value instanceof Date && Number.isFinite(value.getTime());
  const number = (value, max) => /^(0|[1-9][0-9]*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
  const rows = (name, values) => {
    check(Array.isArray(values), "ARRAY");
    for (const row of values) {
      check(Object.keys(row).sort().join(",") === [...privacyColumnContract[name]].sort().join(","), "COLUMNS");
      assertPrivacyText(JSON.stringify(row));
    }
    return values;
  };
  check(Object.keys(snapshot).sort().join(",") === Object.keys(privacyColumnContract).sort().join(","), "TABLES");
  const metadata = rows("study_references", snapshot.study_references);
  check(metadata.length === 1, "METADATA_COUNT");
  const state = metadata[0];
  const noAllocation = ["capture_mapping_revoked", "capture_consent_withdrawn"].includes(scenario.name);
  check(noAllocation ? Object.values(state).every(value => value === null) : uuid(state.temporary_storage_ref) && ["STAGING", "AVAILABLE", "PURGE_PENDING", "PURGED"].includes(state.temporary_payload_state) &&
    date(state.temporary_payload_expires_at) && (state.temporary_payload_state === "PURGED"
      ? date(state.temporary_payload_purged_at) : state.temporary_payload_purged_at === null), "METADATA");
  const environment = rows("temporary_payload_quota_state", snapshot.temporary_payload_quota_state);
  check(environment.length === 1 && environment[0].singleton_id === true &&
    Number(environment[0].max_environment_bytes) === 10_737_418_240 && Number(environment[0].max_package_bytes) === 2_147_483_648 &&
    number(environment[0].reserved_bytes, 10_737_418_240) && date(environment[0].updated_at), "ENVIRONMENT_QUOTA");
  const packages = rows("temporary_payload_package_quotas", snapshot.temporary_payload_package_quotas);
  check(packages.length <= 1, "PACKAGE_QUOTA_COUNT");
  for (const row of packages) check(row.package_id === scenario.packageId && number(row.reserved_bytes, 2_147_483_648) && date(row.updated_at), "PACKAGE_QUOTA");
  const reservations = rows("temporary_payload_reservations", snapshot.temporary_payload_reservations);
  check(reservations.length <= 1, "RESERVATION_COUNT");
  for (const row of reservations) check(row.storage_ref === state.temporary_storage_ref && row.quota_state_id === true &&
    row.tenant_id === "02000000-0000-4000-8000-000000000002" && row.study_ref_id === scenario.studyRefId &&
    row.package_id === scenario.packageId && uuid(row.writer_id) && number(row.reserved_bytes, 2_147_483_648) && date(row.created_at) && date(row.updated_at) &&
    typeof row.settled === "boolean" && (state.temporary_payload_state !== "AVAILABLE" || row.settled), "RESERVATION");
  const reserved = reservations.reduce((sum, row) => sum + Number(row.reserved_bytes), 0);
  if (noAllocation) check(reservations.length === 0 && packages.length === 0 && reserved === 0, "NO_ALLOCATION");
  check(reserved === Number(environment[0].reserved_bytes) && reserved === packages.reduce((sum, row) => sum + Number(row.reserved_bytes), 0), "QUOTA_TOTAL");
  if (state.temporary_payload_state === "PURGED") check(reservations.length === 0 && packages.length === 0 && reserved === 0, "FINAL_QUOTA");
  const evidence = rows("integrity_evidence", snapshot.integrity_evidence);
  check(evidence.length <= (noAllocation ? 0 : 1), "EVIDENCE_COUNT");
  for (const row of evidence) check(uuid(row.integrity_id) && row.exchange_session_id === scenario.sessionId && row.package_id === scenario.packageId &&
    row.study_ref_id === scenario.studyRefId && row.operation_id === scenario.operationId && row.verification_stage === "SOURCE_CAPTURE" &&
    row.algorithm === "SHA256-MANIFEST-V1" && /^sha256:[0-9a-f]{64}$/.test(expectedDigest) && row.source_digest === expectedDigest &&
    row.source_object_count === 3 && row.destination_digest === null && row.destination_object_count === null &&
    row.status === "PENDING" && row.verified_at === null && date(row.created_at), "EVIDENCE");
  const actions = ["PACS_SOURCE_CAPTURE_STARTED", "PACS_SOURCE_CAPTURED", "PACS_SOURCE_CAPTURE_FAILED", "PACS_TEMPORARY_READ_AUTHORIZED", "PACS_TEMPORARY_READ_FAILED", "PACS_TEMPORARY_OBJECT_PURGED", "GRANT_REVOKED", "CONSENT_WITHDRAWN", ...(noAllocation ? ["PACS_SOURCE_CAPTURE_DENIED"] : [])];
  const reasons = [null, "SOURCE_CAPTURE_PERSISTENCE_FAILED", "SOURCE_READ_FAILED", "BEFORE_DECRYPT", "BEFORE_DELIVERY", "TEMPORARY_READ_FAILED", "CAPTURE_FAILURE", "EXPLICIT_CLOSE", "PROCESS_RESTART", ...(noAllocation ? [scenario.consentWithdrawal ? "AUTHORIZATION_DENIED" : "PATIENT_MAPPING_INVALID"] : [])];
  for (const row of rows("audit_events", snapshot.audit_events)) {
    const resource = { STUDY: scenario.studyRefId, CONSENT: scenario.consentId, TRANSFER_GRANT: scenario.grantId }[row.resource_type];
    check(uuid(row.audit_event_id) && date(row.occurred_at) && date(row.created_at) &&
      ["0a000000-0000-4000-8000-000000000001", "0a000000-0000-4000-8000-000000000003"].includes(row.actor_id) &&
      row.tenant_id === "02000000-0000-4000-8000-000000000002" && row.exchange_session_id === scenario.sessionId &&
      resource && row.resource_id === resource && actions.includes(row.action) && ["SUCCESS", "FAILURE", "ALLOW", ...(noAllocation ? ["DENY"] : [])].includes(row.result) &&
      reasons.includes(row.reason_code) && [scenario.correlationId, scenario.revokeCorrelationId].includes(row.correlation_id), "AUDIT");
  }
  return { state: state.temporary_payload_state, reserved };
}
