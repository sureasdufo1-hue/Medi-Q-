import { describe, expect, it, vi } from "vitest";
import { validateDestinationPatientMapping } from "../../services/api/dist/patient/domain/patient-mapping-validation.js";
import {
  PatientMappingPersistenceError,
  PostgresPatientMappingRepository,
} from "../../services/api/dist/patient/persistence/postgres-patient-mapping.repository.js";

const now = new Date("2026-09-30T00:00:00.000Z");
const patientRefId = "22000000-0000-4000-8000-000000000001";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const mappingId = "23000000-0000-4000-8000-000000000001";
const localPatientId = "TEST-B-982";

function row(overrides = {}) {
  return {
    mapping_id: mappingId,
    patient_ref_id: patientRefId,
    hospital_id: destinationHospitalId,
    local_patient_id: localPatientId,
    status: "VALID",
    validated_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function repositoryWithQuery(query) {
  return new PostgresPatientMappingRepository({ query, release: vi.fn() });
}

async function lookupRow(queryRows) {
  const query = vi.fn().mockResolvedValue({ rows: queryRows, rowCount: queryRows.length });
  const repository = repositoryWithQuery(query);
  const mapping = await repository.findByPatientReference(
    destinationHospitalId,
    patientRefId,
  );
  return { mapping, query };
}

function evaluate(mapping) {
  return validateDestinationPatientMapping({
    patientRefId,
    destinationHospitalId,
    candidates: mapping === null ? [] : [mapping],
  });
}

describe("PAT-004 PatientMapping persistence-to-domain denial boundary", () => {
  it("maps a zero-row destination lookup to MAPPING_MISSING", async () => {
    const { mapping, query } = await lookupRow([]);

    expect(mapping).toBeNull();
    expect(evaluate(mapping)).toEqual({ kind: "DENY", reason: "MAPPING_MISSING" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["AMBIGUOUS", null, "MAPPING_AMBIGUOUS"],
    ["UNVERIFIED", null, "MAPPING_UNVERIFIED"],
    ["REVOKED", null, "MAPPING_REVOKED"],
    ["VALID", null, "MAPPING_VALIDATION_EVIDENCE_MISSING"],
  ])("preserves persisted state %s and denies it", async (status, validatedAt, reason) => {
    const { mapping } = await lookupRow([row({ status, validated_at: validatedAt })]);

    expect(mapping.status).toBe(status);
    expect(mapping.validatedAt).toBeNull();
    expect(evaluate(mapping)).toEqual({ kind: "DENY", reason });
  });

  it("fails closed for duplicate rows without selecting the first row", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [row(), row({ mapping_id: "23000000-0000-4000-8000-000000000002" })],
      rowCount: 2,
    });
    const repository = repositoryWithQuery(query);
    const error = await repository
      .findByPatientReference(destinationHospitalId, patientRefId)
      .catch((failure) => failure);

    expect(error).toBeInstanceOf(PatientMappingPersistenceError);
    expect(error.message).toBe("PATIENT_MAPPING_PERSISTENCE_FAILED");
    expect(error.message).not.toContain(localPatientId);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("converts query errors to a fixed persistence error without driver details", async () => {
    const driverFailure = Object.assign(
      new Error(`driver detail for ${localPatientId}`),
      {
        code: "XX999",
        detail: `SELECT local_patient_id FROM patient_mappings WHERE local_patient_id = '${localPatientId}'`,
      },
    );
    const query = vi.fn().mockRejectedValue(driverFailure);
    const repository = repositoryWithQuery(query);
    const error = await repository
      .findByPatientReference(destinationHospitalId, patientRefId)
      .catch((failure) => failure);

    expect(error).toBeInstanceOf(PatientMappingPersistenceError);
    expect(error.message).toBe("PATIENT_MAPPING_PERSISTENCE_FAILED");
    expect(error.message).not.toContain(localPatientId);
    expect(error.message).not.toContain("driver detail");
    expect(error.message).not.toContain("SELECT local_patient_id");
    expect(error.message).not.toContain("XX999");
  });
});
