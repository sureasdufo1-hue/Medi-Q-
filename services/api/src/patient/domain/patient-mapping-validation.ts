import {
  PatientMapping,
  patientMappingStatuses,
} from "./patient-mapping.js";

export type DestinationPatientMappingDenialReason =
  | "INVALID_INPUT"
  | "MAPPING_MISSING"
  | "MAPPING_AMBIGUOUS"
  | "INVALID_MAPPING"
  | "MAPPING_BINDING_MISMATCH"
  | "MAPPING_UNVERIFIED"
  | "MAPPING_REVOKED"
  | "MAPPING_VALIDATION_EVIDENCE_MISSING";

export type DestinationPatientMappingDecision =
  | Readonly<{ kind: "VALID"; mappingId: string }>
  | Readonly<{
      kind: "DENY";
      reason: DestinationPatientMappingDenialReason;
    }>;

function deny(
  reason: DestinationPatientMappingDenialReason,
): DestinationPatientMappingDecision {
  return Object.freeze({ kind: "DENY", reason });
}

/**
 * Pure, fail-closed eligibility check for one server-resolved destination
 * mapping. A VALID result only describes mapping eligibility; it is not an
 * Authorization decision or permission to perform PACS_IMPORT.
 */
export function validateDestinationPatientMapping(
  input: unknown,
): DestinationPatientMappingDecision {
  try {
    return evaluateDestinationPatientMapping(input);
  } catch {
    return deny("INVALID_INPUT");
  }
}

function evaluateDestinationPatientMapping(
  input: unknown,
): DestinationPatientMappingDecision {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return deny("INVALID_INPUT");
  }

  const candidateInput = input as {
    patientRefId?: unknown;
    destinationHospitalId?: unknown;
    candidates?: unknown;
  };
  const { patientRefId, destinationHospitalId, candidates } = candidateInput;

  if (
    typeof patientRefId !== "string" ||
    typeof destinationHospitalId !== "string" ||
    !PatientMapping.isValidId(patientRefId) ||
    !PatientMapping.isValidId(destinationHospitalId) ||
    !Array.isArray(candidates)
  ) {
    return deny("INVALID_INPUT");
  }

  if (candidates.length === 0) return deny("MAPPING_MISSING");
  if (candidates.length !== 1) return deny("MAPPING_AMBIGUOUS");

  const mapping: unknown = candidates[0];
  if (!(mapping instanceof PatientMapping)) return deny("INVALID_MAPPING");

  if (
    !PatientMapping.isValidId(mapping.mappingId) ||
    !PatientMapping.isValidId(mapping.patientRefId) ||
    !PatientMapping.isValidId(mapping.hospitalId) ||
    !PatientMapping.isValidLocalPatientId(mapping.localPatientId) ||
    !patientMappingStatuses.includes(mapping.status)
  ) {
    return deny("INVALID_MAPPING");
  }

  if (
    mapping.patientRefId !== patientRefId.toLowerCase() ||
    mapping.hospitalId !== destinationHospitalId.toLowerCase()
  ) {
    return deny("MAPPING_BINDING_MISMATCH");
  }

  switch (mapping.status) {
    case "AMBIGUOUS":
      return deny("MAPPING_AMBIGUOUS");
    case "UNVERIFIED":
      return deny("MAPPING_UNVERIFIED");
    case "REVOKED":
      return deny("MAPPING_REVOKED");
    case "VALID":
      if (
        !(mapping.validatedAt instanceof Date) ||
        !Number.isFinite(mapping.validatedAt.getTime())
      ) {
        return deny("MAPPING_VALIDATION_EVIDENCE_MISSING");
      }
      return Object.freeze({ kind: "VALID", mappingId: mapping.mappingId });
    default:
      return deny("INVALID_MAPPING");
  }
}
