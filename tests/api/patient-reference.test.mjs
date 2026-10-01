import { describe, expect, it, vi } from "vitest";
import {
  InvalidPatientReferenceError,
  PatientReference,
} from "../../services/api/dist/patient/domain/patient-reference.js";
import {
  PatientReferenceConflictError,
  PatientReferencePersistenceError,
  PostgresPatientReferenceRepository,
} from "../../services/api/dist/patient/persistence/postgres-patient-reference.repository.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const fixedId = "22000000-0000-4000-8000-000000000001";
const fixedCode = "MQ-TEST-PAT001-01";

function row(overrides = {}) {
  return {
    patient_ref_id: fixedId,
    patient_ref_code: fixedCode,
    status: "ACTIVE",
    created_at: fixedNow,
    updated_at: fixedNow,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    patientRefId: fixedId,
    patientRefCode: fixedCode,
    status: "ACTIVE",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

function databaseWithQuery(query) {
  return { query };
}

describe("PatientReference domain", () => {
  it("creates only a synthetic ACTIVE reference with a UUID and immutable timestamps", () => {
    const reference = PatientReference.create({
      patientRefCode: fixedCode,
      patientRefId: fixedId,
      now: fixedNow,
    });

    expect(reference.patientRefId).toBe(fixedId);
    expect(reference.patientRefCode).toBe(fixedCode);
    expect(reference.status).toBe("ACTIVE");
    expect(reference.createdAt.toISOString()).toBe(fixedNow.toISOString());
    expect(reference.updatedAt.toISOString()).toBe(fixedNow.toISOString());
    expect(() => PatientReference.create({ patientRefCode: "TEST-A-001" })).toThrow(
      InvalidPatientReferenceError,
    );
  });

  it.each([
    "MQ-TEST-",
    "MQ-TEST-lowercase",
    "MQ-TEST-INVALID$",
    `MQ-TEST-${"A".repeat(57)}`,
    "TEST-A-001",
  ])("rejects non-canonical synthetic reference code %s without echoing it", (code) => {
    expect(() =>
      PatientReference.create({ patientRefCode: code, patientRefId: fixedId, now: fixedNow }),
    ).toThrow(InvalidPatientReferenceError);
    try {
      PatientReference.create({ patientRefCode: code, patientRefId: fixedId, now: fixedNow });
    } catch (error) {
      expect(error.message).not.toContain(code);
    }
  });

  it("rehydrates ACTIVE and INACTIVE states and rejects invalid state or time", () => {
    const inactive = PatientReference.reconstitute(state({ status: "INACTIVE" }));
    expect(inactive.status).toBe("INACTIVE");

    expect(() => PatientReference.reconstitute(state({ status: "DELETED" }))).toThrow(
      InvalidPatientReferenceError,
    );
    expect(() =>
      PatientReference.reconstitute(state({ patientRefId: "not-a-uuid" })),
    ).toThrow(InvalidPatientReferenceError);
    expect(() =>
      PatientReference.reconstitute(
        state({ updatedAt: new Date("2026-09-29T23:59:59.000Z") }),
      ),
    ).toThrow(InvalidPatientReferenceError);
  });

  it("does not expose mutable Date references", () => {
    const reference = PatientReference.create({
      patientRefCode: fixedCode,
      patientRefId: fixedId,
      now: fixedNow,
    });
    const returnedDate = reference.createdAt;
    returnedDate.setUTCFullYear(2000);

    expect(reference.createdAt.toISOString()).toBe(fixedNow.toISOString());
  });
});

describe("PostgresPatientReferenceRepository", () => {
  it("creates with bound parameters and maps the approved five-column row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const repository = new PostgresPatientReferenceRepository(databaseWithQuery(query));
    const reference = PatientReference.create({
      patientRefCode: fixedCode,
      patientRefId: fixedId,
      now: fixedNow,
    });

    const created = await repository.create(reference);
    const [statement, parameters] = query.mock.calls[0];

    expect(statement).toMatch(/INSERT INTO patient_refs/);
    expect(statement).toMatch(/patient_ref_id, patient_ref_code, status, created_at, updated_at/);
    expect(statement).toContain("VALUES ($1, $2, $3, $4, $5)");
    expect(statement).not.toContain(fixedCode);
    expect(statement).not.toMatch(/local_patient_id|birth|name|phone/i);
    expect(parameters).toEqual([fixedId, fixedCode, "ACTIVE", fixedNow, fixedNow]);
    expect(created.patientRefCode).toBe(fixedCode);
    expect(Object.keys(row())).toEqual([
      "patient_ref_id",
      "patient_ref_code",
      "status",
      "created_at",
      "updated_at",
    ]);
  });

  it("finds by id and code using parameterized, minimal-column queries", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    const repository = new PostgresPatientReferenceRepository(databaseWithQuery(query));

    await repository.findById(fixedId);
    await repository.findByCode(fixedCode);

    expect(query.mock.calls[0][0]).toContain("WHERE patient_ref_id = $1");
    expect(query.mock.calls[0][0]).not.toContain(fixedId);
    expect(query.mock.calls[0][1]).toEqual([fixedId]);
    expect(query.mock.calls[1][0]).toContain("WHERE patient_ref_code = $1");
    expect(query.mock.calls[1][0]).not.toContain(fixedCode);
    expect(query.mock.calls[1][1]).toEqual([fixedCode]);
    expect(query.mock.calls[0][0]).not.toMatch(/local_patient_id|birth|name|phone/i);
  });

  it("returns null when a reference is absent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const repository = new PostgresPatientReferenceRepository(databaseWithQuery(query));

    await expect(repository.findById(fixedId)).resolves.toBeNull();
    await expect(repository.findByCode(fixedCode)).resolves.toBeNull();
  });

  it("maps unique conflicts and database errors to non-disclosing errors", async () => {
    const duplicateQuery = vi.fn().mockRejectedValue({
      code: "23505",
      detail: `duplicate patient_ref_code ${fixedCode}`,
    });
    const duplicateRepository = new PostgresPatientReferenceRepository(
      databaseWithQuery(duplicateQuery),
    );
    const reference = PatientReference.create({
      patientRefCode: fixedCode,
      patientRefId: fixedId,
      now: fixedNow,
    });

    const conflictError = await duplicateRepository.create(reference).catch((error) => error);
    expect(conflictError).toBeInstanceOf(PatientReferenceConflictError);
    expect(conflictError.message).not.toContain(fixedCode);
    expect(conflictError.message).not.toContain("duplicate patient_ref_code");

    const failedQuery = vi.fn().mockRejectedValue(new Error(`DB detail ${fixedCode}`));
    const failedRepository = new PostgresPatientReferenceRepository(databaseWithQuery(failedQuery));
    const persistenceError = await failedRepository.findById(fixedId).catch((error) => error);
    expect(persistenceError).toBeInstanceOf(PatientReferencePersistenceError);
    expect(persistenceError.message).not.toContain(fixedCode);
    expect(persistenceError.message).not.toContain("DB detail");
  });

  it("does not insert rehydrated inactive records or query malformed keys", async () => {
    const query = vi.fn();
    const repository = new PostgresPatientReferenceRepository(databaseWithQuery(query));
    const inactive = PatientReference.reconstitute(state({ status: "INACTIVE" }));

    await expect(repository.create(inactive)).rejects.toBeInstanceOf(
      InvalidPatientReferenceError,
    );
    await expect(repository.findByCode("local-patient-123")).rejects.toBeInstanceOf(
      InvalidPatientReferenceError,
    );
    await expect(
      repository.findByCode("MQ-TEST-' OR '1'='1"),
    ).rejects.toBeInstanceOf(InvalidPatientReferenceError);
    await expect(repository.findById("not-a-uuid")).rejects.toBeInstanceOf(
      InvalidPatientReferenceError,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
