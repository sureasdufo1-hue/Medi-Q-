export const transferDispatchObserverStages = Object.freeze([
  "OPERATION_QUERY",
  "PROVENANCE_QUERY",
  "INTEGRITY_QUERY",
  "STATE_AUDIT_QUERY",
  "TERMINAL_AUDIT_QUERY",
  "QUOTA_QUERY",
]);

export const transferDispatchObserverAssertionMarkers = Object.freeze([
  "TRANSFER_DISPATCH_OPERATION_CARDINALITY",
  "TRANSFER_DISPATCH_OPERATION_BINDING",
  "TRANSFER_DISPATCH_STOW_STARTED_TIME",
  "TRANSFER_DISPATCH_PENDING_PROVENANCE_BINDING",
  "TRANSFER_DISPATCH_SOURCE_EVIDENCE_ONLY",
  "TRANSFER_DISPATCH_SOURCE_STAGE",
  "TRANSFER_DISPATCH_SOURCE_STATUS",
  "TRANSFER_DISPATCH_SOURCE_ALGORITHM",
  "TRANSFER_DISPATCH_SOURCE_OBJECT_COUNT",
  "TRANSFER_DISPATCH_SOURCE_NOT_VERIFIED",
  "TRANSFER_DISPATCH_SOURCE_DIGEST_FORMAT",
  "TRANSFER_DISPATCH_EXACT_STATE_AUDITS",
  "TRANSFER_DISPATCH_NO_TERMINAL_AUDIT",
  "TRANSFER_DISPATCH_TEMPORARY_QUOTA_RETAINED",
  "TRANSFER_DISPATCH_TEMPORARY_QUOTA_NONZERO",
  "TRANSFER_DISPATCH_QUOTA_OBSERVER_SCOPE",
]);

const safeNetworkCodes = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENOTFOUND", "ETIMEDOUT"]);

export function projectTransferDispatchObserverFailure({ stage, error }) {
  const safeStage = transferDispatchObserverStages.includes(stage) ? stage : "UNKNOWN";
  if (error?.code === "ERR_ASSERTION" && typeof error?.message === "string") {
    const marker = transferDispatchObserverAssertionMarkers.find(value =>
      error.message === value || error.message.startsWith(`${value}\n`));
    if (marker) return marker;
    return `STAGE_${safeStage}_ASSERTION`;
  }

  if (typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) {
    return `STAGE_${safeStage}_SQLSTATE_${error.code}`;
  }
  if (safeNetworkCodes.has(error?.code)) return `STAGE_${safeStage}_NETWORK_${error.code}`;
  return `STAGE_${safeStage}_UNCLASSIFIED`;
}
