// Fixed synthetic selectors shared by isolated seed/test/independent observer.
// No credential, payload or runtime-generated storage/key material belongs here.
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const temporaryCaptureLifecycleCases = Object.freeze([
  "roundtrip", "read_revoked", "completion_audit_failure", "read_audit_failure",
  "read_withdrawn", "read_purge_pending", "read_expired_metadata",
  "ciphertext_tampered", "ciphertext_truncated", "ciphertext_swapped",
  "capture_write_failure", "capture_fsync_failure", "capture_evidence_failure",
  "concurrent_capture", "replay_refetch",
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
