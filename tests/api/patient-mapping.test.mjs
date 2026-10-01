import { describe, expect, it, vi } from "vitest";
import {
  InvalidPatientMappingError,
  PatientMapping,
} from "../../services/api/dist/patient/domain/patient-mapping.js";
import {
  PatientMappingConflictError,
  PatientMappingPersistenceError,
  PostgresPatientMappingRepository,
} from "../../services/api/dist/patient/persistence/postgres-patient-mapping.repository.js";
import {
  PatientReference,
} from "../../services/api/dist/patient/domain/patient-reference.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const fixedMappingId = "23000000-0000-4000-8000-000000000001";
const fixedPatientRefId = "22000000-0000-4000-8000-000000000001";
const fixedPatientRefCode = "MQ-TEST-PAT002-01";
const fixedHospitalId = "04000000-0000-4000-8000-000000000001";
const fixedLocalPatientId = "TEST-A-001";

function patientReference(overrides = {}) {
  return PatientReference.create({
    patientRefCode: fixedPatientRefCode,
    patientRefId: fixedPatientRefId,
    now: fixedNow,
    ...overrides,
  });
}

function mapping(overrides = {}) {
  return PatientMapping.create({
    patientReference: patientReference(),
    hospitalId: fixedHospitalId,
    localPatientId: fixedLocalPatientId,
    mappingId: fixedMappingId,
    now: fixedNow,
    ...overrides,
  });
}

function row(overrides = {}) {
  return {
    mapping_id: fixedMappingId,
    patient_ref_id: fixedPatientRefId,
    hospital_id: fixedHospitalId,
    local_patient_id: fixedLocalPatientId,
    status: "UNVERIFIED",
    validated_at: null,
    created_at: fixedNow,
    updated_at: fixedNow,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    mappingId: fixedMappingId,
    patientRefId: fixedPatientRefId,
    hospitalId: fixedHospitalId,
    localPatientId: fixedLocalPatientId,
    status: "UNVERIFIED",
    validatedAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

function databaseWithQuery(query) {
  return { query, release: vi.fn() };
}

describe("PatientMapping domain", () => {
  it("creates only a synthetic mapping in UNVERIFIED state", () => {
    const created = mapping();

    expect(created.mappingId).toBe(fixedMappingId);
    expect(created.patientRefId).toBe(fixedPatientRefId);
    expect(created.hospitalId).toBe(fixedHospitalId);
    expect(created.localPatientId).toBe(fixedLocalPatientId);
    expect(created.status).toBe("UNVERIFIED");
    expect(created.validatedAt).toBeNull();
  });

  it.each([
    "",
    "TEST-",
    "test-a-001",
    "TEST-A-",
    "TEST--A",
    "TEST-A--001",
    "TEST-A-001\n",
    "TEST-A-001 ' OR '1'='1",
    `TEST-${"A".repeat(124)}`,
    "REAL-PATIENT-001",
  ])("rejects non-canonical synthetic Local Patient ID %s", (localPatientId) => {
    expect(() => mapping({ localPatientId })).toThrow(InvalidPatientMappingError);
  });

  it("rejects an inactive PatientReference and malformed Hospital identifiers", () => {
    const inactiveReference = PatientReference.reconstitute({
      patientRefId: fixedPatientRefId,
      patientRefCode: fixedPatientRefCode,
      status: "INACTIVE",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    expect(() =>
      PatientMapping.create({
        patientReference: inactiveReference,
        hospitalId: fixedHospitalId,
        localPatientId: fixedLocalPatientId,
        now: fixedNow,
      }),
    ).toThrow(InvalidPatientMappingError);
    expect(() => mapping({ hospitalId: "not-a-uuid" })).toThrow(
      InvalidPatientMappingError,
    );
    expect(() =>
      PatientMapping.create({
        patientReference: {
          patientRefId: fixedPatientRefId,
          patientRefCode: fixedPatientRefCode,
          status: "ACTIVE",
        },
        hospitalId: fixedHospitalId,
        localPatientId: fixedLocalPatientId,
        now: fixedNow,
      }),
    ).toThrow(InvalidPatientMappingError);
  });

  it("rehydrates only declared statuses and valid immutable timestamps", () => {
    for (const status of ["VALID", "UNVERIFIED", "AMBIGUOUS", "REVOKED"]) {
      expect(
        PatientMapping.reconstitute(state({
          status,
          validatedAt: status === "VALID" ? fixedNow : null,
        })),
      ).toBeInstanceOf(PatientMapping);
    }

    expect(() => PatientMapping.reconstitute(state({ status: "UNKNOWN" }))).toThrow(
      InvalidPatientMappingError,
    );
    expect(() =>
      PatientMapping.reconstitute(state({
        updatedAt: new Date("2026-09-29T23:59:59.000Z"),
      })),
    ).toThrow(InvalidPatientMappingError);
  });

  it("does not expose mutable Date references", () => {
    const created = mapping();
    const date = created.createdAt;
    date.setUTCFullYear(2000);

    expect(created.createdAt.toISOString()).toBe(fixedNow.toISOString());
  });
});

describe("PostgresPatientMappingRepository", () => {
  it("creates using only approved columns and bound synthetic values", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );

    const created = await repository.create(mapping());
    const [statement, parameters] = query.mock.calls[0];

    expect(statement).toContain("INSERT INTO patient_mappings");
    expect(statement).toContain(
      "mapping_id, patient_ref_id, hospital_id, local_patient_id",
    );
    expect(statement).toContain("VALUES ($1, $2, $3, $4, $5, $6, $7, $8)");
    expect(statement).not.toContain(fixedLocalPatientId);
    expect(parameters).toEqual([
      fixedMappingId,
      fixedPatientRefId,
      fixedHospitalId,
      fixedLocalPatientId,
      "UNVERIFIED",
      null,
      fixedNow,
      fixedNow,
    ]);
    expect(created.localPatientId).toBe(fixedLocalPatientId);
  });

  it("scopes all lookup statements to the exact Hospital with bound values", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );

    await repository.findByIdForHospital(fixedHospitalId, fixedMappingId);
    await repository.findByLocalPatientId(fixedHospitalId, fixedLocalPatientId);
    await repository.findByPatientReference(fixedHospitalId, fixedPatientRefId);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain(
      "WHERE hospital_id = $1 AND mapping_id = $2",
    );
    expect(query.mock.calls[0][1]).toEqual([fixedHospitalId, fixedMappingId]);
    expect(query.mock.calls[1][0]).toContain(
      "WHERE hospital_id = $1 AND local_patient_id = $2",
    );
    expect(query.mock.calls[1][1]).toEqual([
      fixedHospitalId,
      fixedLocalPatientId,
    ]);
    expect(query.mock.calls[2][0]).toContain(
      "WHERE hospital_id = $1 AND patient_ref_id = $2",
    );
    expect(query.mock.calls[2][1]).toEqual([
      fixedHospitalId,
      fixedPatientRefId,
    ]);
    for (const [statement] of query.mock.calls) {
      expect(statement).not.toContain(fixedHospitalId);
      expect(statement).not.toContain(fixedLocalPatientId);
    }
  });

  it("returns null for absent mappings", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );

    await expect(
      repository.findByIdForHospital(fixedHospitalId, fixedMappingId),
    ).resolves.toBeNull();
  });

  it("maps uniqueness conflicts to a fixed, non-disclosing error", async () => {
    const query = vi.fn().mockRejectedValue({
      code: "23505",
      detail: `duplicate local_patient_id ${fixedLocalPatientId}`,
    });
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );
    const error = await repository.create(mapping()).catch((failure) => failure);

    expect(error).toBeInstanceOf(PatientMappingConflictError);
    expect(error.message).not.toContain(fixedLocalPatientId);
    expect(error.message).not.toContain("duplicate local_patient_id");
  });

  it("maps database failures without exposing SQL, identifiers or driver details", async () => {
    const query = vi.fn().mockRejectedValue(
      new Error(`database detail ${fixedLocalPatientId}`),
    );
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );
    const error = await repository
      .findByLocalPatientId(fixedHospitalId, fixedLocalPatientId)
      .catch((failure) => failure);

    expect(error).toBeInstanceOf(PatientMappingPersistenceError);
    expect(error.message).not.toContain(fixedLocalPatientId);
    expect(error.message).not.toContain("database detail");
  });

  it("rejects malformed or injection-shaped keys before any query", async () => {
    const query = vi.fn();
    const repository = new PostgresPatientMappingRepository(
      databaseWithQuery(query),
    );

    await expect(
      repository.findByIdForHospital("not-a-uuid", fixedMappingId),
    ).rejects.toBeInstanceOf(InvalidPatientMappingError);
    await expect(
      repository.findByLocalPatientId(
        fixedHospitalId,
        "TEST-A-001' OR '1'='1",
      ),
    ).rejects.toBeInstanceOf(InvalidPatientMappingError);
    await expect(
      repository.findByPatientReference(fixedHospitalId, "bad-reference"),
    ).rejects.toBeInstanceOf(InvalidPatientMappingError);
    expect(query).not.toHaveBeenCalled();
  });
});
