import { validatePacsPatientIdBinding } from "../../services/api/dist/pacs/domain/pacs-patient-id-binding.js";
import { describe, expect, it } from "vitest";

describe("PACS synthetic byte-preserving PatientID binding", () => {
  const mappingPatientId = "TEST-PATIENT-007";

  it("accepts a non-empty source Study only when every instance exactly matches the destination mapping", () => {
    expect(validatePacsPatientIdBinding({
      destinationLocalPatientId: mappingPatientId,
      sourceInstancePatientIds: [mappingPatientId, mappingPatientId, mappingPatientId],
    })).toEqual({ kind: "IDENTITY_MATCHED", sourceInstanceCount: 3 });
  });

  it("denies an empty or malformed source instance set without returning identifiers", () => {
    expect(validatePacsPatientIdBinding({
      destinationLocalPatientId: mappingPatientId,
      sourceInstancePatientIds: [],
    })).toEqual({ kind: "DENY", reason: "SOURCE_INSTANCE_SET_EMPTY" });
    expect(validatePacsPatientIdBinding({
      destinationLocalPatientId: mappingPatientId,
      sourceInstancePatientIds: null,
    })).toEqual({ kind: "DENY", reason: "SOURCE_INSTANCE_SET_EMPTY" });
  });

  it.each([undefined, null, "", "PATIENT-REAL-123", "test-patient-007", "TEST- ID", `TEST-${"A".repeat(61)}`])(
    "denies missing, malformed, non-synthetic or overlength source identity %s",
    (sourcePatientId) => {
      expect(validatePacsPatientIdBinding({
        destinationLocalPatientId: mappingPatientId,
        sourceInstancePatientIds: [sourcePatientId],
      })).toEqual({ kind: "DENY", reason: "SOURCE_IDENTITY_INVALID" });
    },
  );

  it("denies a single mismatching instance even when other instances match", () => {
    const result = validatePacsPatientIdBinding({
      destinationLocalPatientId: mappingPatientId,
      sourceInstancePatientIds: [mappingPatientId, "TEST-PATIENT-008", mappingPatientId],
    });
    expect(result).toEqual({ kind: "DENY", reason: "SOURCE_IDENTITY_MISMATCH" });
    expect(JSON.stringify(result)).not.toContain("TEST-PATIENT");
  });

  it("denies a malformed destination mapping identity", () => {
    expect(validatePacsPatientIdBinding({
      destinationLocalPatientId: "TEST PATIENT",
      sourceInstancePatientIds: [mappingPatientId],
    })).toEqual({ kind: "DENY", reason: "DESTINATION_IDENTITY_INVALID" });
  });
});
