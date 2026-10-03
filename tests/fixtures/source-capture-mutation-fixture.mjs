// Fixed synthetic R6 graphs; these selectors are never authorization credentials.
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const sourceMutationCases = Object.freeze([
  ["capture_mapping_revoked", "METADATA", "MAPPING_REVOKED"],
  ["capture_actor_inactive", "RESERVED", "ACTOR_INACTIVE"],
  ["read_mapping_revoked", "BETWEEN", "MAPPING_REVOKED"],
  ["read_mapping_rebound", "BETWEEN", "MAPPING_REBOUND"],
  ["read_actor_inactive_before", "BEFORE", "ACTOR_INACTIVE"],
  ["read_actor_inactive_between", "BETWEEN", "ACTOR_INACTIVE"],
].map(([name, boundary, mutation], index) => {
  const n = 117 + index;
  return Object.freeze({ name, boundary, mutation,
    sessionId: id("16", n), sessionKey: id("1c", n), packageId: id("17", n), studyRefId: id("18", n),
    consentId: id("19", n), consentActionId: id("19", n + 100),
    grantId: id("1a", n), grantKey: id("1c", n + 100), grantScopeId: id("1a", n + 100),
    operationId: id("1b", n), operationKey: id("1c", n + 200),
    correlationId: id("1d", n), revokeCorrelationId: id("1d", n + 100),
  });
}));
export const mutationFixtureIds = Object.freeze({
  actor: "0a000000-0000-4000-8000-000000000001",
  tenant: "02000000-0000-4000-8000-000000000002",
  hospital: "04000000-0000-4000-8000-000000000002",
  source: "04000000-0000-4000-8000-000000000001",
  patient: "15000000-0000-4000-8000-000000000001",
  mapping: "15000000-0000-4000-8000-000000000002",
  baselineLocalId: "TEST-PATIENT-007", reboundLocalId: "TEST-R6-REBOUND",
});

export function mutationExpectedAudit(scenario, afterDenial = false) {
  const result = { "PACS_SOURCE_CAPTURE_STARTED|ALLOW|": 1 };
  if (!["METADATA", "RESERVED"].includes(scenario.boundary)) result["PACS_SOURCE_CAPTURED|SUCCESS|"] = 1;
  if (scenario.boundary === "BETWEEN") result["PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT"] = 1;
  if (afterDenial && scenario.mutation !== "ACTOR_INACTIVE") {
    if (scenario.boundary === "METADATA") result["PACS_SOURCE_CAPTURE_DENIED|DENY|PATIENT_MAPPING_INVALID"] = 1;
    else result["PACS_TEMPORARY_READ_FAILED|FAILURE|TEMPORARY_READ_FAILED"] = 1;
  }
  return result;
}
