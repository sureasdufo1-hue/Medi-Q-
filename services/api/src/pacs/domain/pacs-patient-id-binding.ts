const SYNTHETIC_PATIENT_ID_PATTERN = /^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAX_DICOM_PATIENT_ID_LENGTH = 64;

export type PacsPatientIdBindingDecision =
  | Readonly<{ kind: "IDENTITY_MATCHED"; sourceInstanceCount: number }>
  | Readonly<{
      kind: "DENY";
      reason:
        | "DESTINATION_IDENTITY_INVALID"
        | "SOURCE_INSTANCE_SET_EMPTY"
        | "SOURCE_IDENTITY_INVALID"
        | "SOURCE_IDENTITY_MISMATCH";
    }>;

function isCanonicalSyntheticPatientId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DICOM_PATIENT_ID_LENGTH &&
    SYNTHETIC_PATIENT_ID_PATTERN.test(value)
  );
}

/**
 * Checks the P0 byte-preserving PatientID invariant without modifying or
 * returning identifiers. A matched result is identity eligibility only; it
 * is not Consent, Authorization, a TransferGrant, or permission to import.
 */
export function validatePacsPatientIdBinding(input: {
  readonly destinationLocalPatientId: unknown;
  readonly sourceInstancePatientIds: unknown;
}): PacsPatientIdBindingDecision {
  if (!isCanonicalSyntheticPatientId(input.destinationLocalPatientId)) {
    return Object.freeze({
      kind: "DENY",
      reason: "DESTINATION_IDENTITY_INVALID",
    });
  }

  if (
    !Array.isArray(input.sourceInstancePatientIds) ||
    input.sourceInstancePatientIds.length === 0
  ) {
    return Object.freeze({ kind: "DENY", reason: "SOURCE_INSTANCE_SET_EMPTY" });
  }

  for (const patientId of input.sourceInstancePatientIds) {
    if (!isCanonicalSyntheticPatientId(patientId)) {
      return Object.freeze({ kind: "DENY", reason: "SOURCE_IDENTITY_INVALID" });
    }
    if (patientId !== input.destinationLocalPatientId) {
      return Object.freeze({ kind: "DENY", reason: "SOURCE_IDENTITY_MISMATCH" });
    }
  }

  return Object.freeze({
    kind: "IDENTITY_MATCHED",
    sourceInstanceCount: input.sourceInstancePatientIds.length,
  });
}
