import { describe, expect, it, vi } from "vitest";
import { PatientMapping } from "../../services/api/dist/patient/domain/patient-mapping.js";
import { validateDestinationPatientMapping } from "../../services/api/dist/patient/domain/patient-mapping-validation.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const patientRefId = "22000000-0000-4000-8000-000000000001";
const otherPatientRefId = "22000000-0000-4000-8000-000000000002";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const otherHospitalId = "04000000-0000-4000-8000-000000000001";
const mappingId = "23000000-0000-4000-8000-000000000001";

function mapping(overrides = {}) {
  return PatientMapping.reconstitute({
    mappingId,
    patientRefId,
    hospitalId: destinationHospitalId,
    localPatientId: "TEST-B-982",
    status: "VALID",
    validatedAt: fixedNow,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  });
}

function input(candidates, overrides = {}) {
  return {
    patientRefId,
    destinationHospitalId,
    candidates,
    ...overrides,
  };
}

describe("validateDestinationPatientMapping", () => {
  it("accepts exactly one VALID mapping with matching server-resolved binding", () => {
    const result = validateDestinationPatientMapping(input([mapping()]));

    expect(result).toEqual({ kind: "VALID", mappingId });
    expect(result).not.toHaveProperty("localPatientId");
    expect(result).not.toHaveProperty("pacsImportAllowed");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("denies a missing mapping", () => {
    expect(validateDestinationPatientMapping(input([]))).toEqual({
      kind: "DENY",
      reason: "MAPPING_MISSING",
    });
  });

  it("denies multiple candidates without selecting one", () => {
    expect(
      validateDestinationPatientMapping(input([mapping(), mapping({
        mappingId: "23000000-0000-4000-8000-000000000002",
      })])),
    ).toEqual({ kind: "DENY", reason: "MAPPING_AMBIGUOUS" });
  });

  it("denies a single mapping explicitly marked ambiguous", () => {
    expect(
      validateDestinationPatientMapping(input([mapping({
        status: "AMBIGUOUS",
        validatedAt: null,
      })])),
    ).toEqual({ kind: "DENY", reason: "MAPPING_AMBIGUOUS" });
  });

  it.each([
    ["PatientReference", { patientRefId: otherPatientRefId }],
    ["Destination Hospital", { hospitalId: otherHospitalId }],
  ])("denies a %s binding mismatch", (_label, override) => {
    expect(validateDestinationPatientMapping(input([mapping(override)]))).toEqual({
      kind: "DENY",
      reason: "MAPPING_BINDING_MISMATCH",
    });
  });

  it.each([
    ["UNVERIFIED", null, "MAPPING_UNVERIFIED"],
    ["REVOKED", null, "MAPPING_REVOKED"],
    ["VALID", null, "MAPPING_VALIDATION_EVIDENCE_MISSING"],
  ])("denies mapping state %s without treating it as PACS authorization", (
    status,
    validatedAt,
    reason,
  ) => {
    expect(validateDestinationPatientMapping(input([mapping({
      status,
      validatedAt,
    })]))).toEqual({ kind: "DENY", reason });
  });

  it.each([
    [null, "INVALID_INPUT"],
    [undefined, "INVALID_INPUT"],
    [{ ...input([]), patientRefId: "not-a-uuid" }, "INVALID_INPUT"],
    [{ ...input([]), destinationHospitalId: "not-a-uuid" }, "INVALID_INPUT"],
    [{ ...input([]), candidates: null }, "INVALID_INPUT"],
    [input([null]), "INVALID_MAPPING"],
    [input([{}]), "INVALID_MAPPING"],
  ])("fails closed for malformed input or candidate", (value, reason) => {
    expect(validateDestinationPatientMapping(value)).toEqual({
      kind: "DENY",
      reason,
    });
  });

  it("converts property access failures into a fixed deny result", () => {
    const throwingInput = new Proxy({}, {
      get() {
        throw new Error("untrusted accessor");
      },
    });
    const throwingMapping = new Proxy(mapping(), {
      get() {
        throw new Error("untrusted accessor");
      },
    });

    expect(validateDestinationPatientMapping(throwingInput)).toEqual({
      kind: "DENY",
      reason: "INVALID_INPUT",
    });
    expect(validateDestinationPatientMapping(input([throwingMapping]))).toEqual({
      kind: "DENY",
      reason: "INVALID_INPUT",
    });
  });

  it("does not invoke database, HTTP, or PACS side-effect callbacks", () => {
    const databaseQuery = vi.fn();
    const httpCall = vi.fn();
    const stowCall = vi.fn();

    const result = validateDestinationPatientMapping({
      ...input([mapping()]),
      databaseQuery,
      httpCall,
      stowCall,
    });

    expect(result).toEqual({ kind: "VALID", mappingId });
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(httpCall).not.toHaveBeenCalled();
    expect(stowCall).not.toHaveBeenCalled();
  });
});
