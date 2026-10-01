import { describe, expect, it, vi } from "vitest";
import {
  ConsentArtifact,
  InvalidConsentArtifactError,
} from "../../services/api/dist/consent/domain/consent-artifact.js";
import {
  ConsentContextDeniedError,
  ConsentPersistenceError,
  ConsentVersionConflictError,
  ConsentVersionExhaustedError,
  ConsentWithdrawalConflictError,
  PostgresConsentRepository,
} from "../../services/api/dist/consent/persistence/postgres-consent.repository.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const sessionId = "25000000-0000-4000-8000-000000000001";
const patientRefId = "22000000-0000-4000-8000-000000000001";
const sourceHospitalId = "04000000-0000-4000-8000-000000000001";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const consentId = "27000000-0000-4000-8000-000000000001";

function input(overrides = {}) {
  return {
    exchangeSessionId: sessionId,
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    imagingPackageId: null,
    actions: ["VIEW", "PACS_IMPORT"],
    now: fixedNow,
    expiresAt: null,
    ...overrides,
  };
}

function sessionRow(overrides = {}) {
  return {
    session_id: sessionId,
    patient_ref_id: patientRefId,
    source_hospital_id: sourceHospitalId,
    destination_hospital_id: destinationHospitalId,
    ...overrides,
  };
}

function consentRow(overrides = {}) {
  return {
    consent_id: consentId,
    exchange_session_id: sessionId,
    patient_ref_id: patientRefId,
    source_hospital_id: sourceHospitalId,
    destination_hospital_id: destinationHospitalId,
    imaging_package_id: null,
    status: "PENDING",
    consent_version: 1,
    issued_at: null,
    expires_at: null,
    withdrawn_at: null,
    created_at: fixedNow,
    updated_at: fixedNow,
    ...overrides,
  };
}

function createDatabase(options = {}) {
  let insertedRow;
  const query = vi.fn(async (statement, parameters = []) => {
    if (statement.startsWith("SAVEPOINT ") || statement.startsWith("RELEASE SAVEPOINT ") || statement.startsWith("ROLLBACK TO SAVEPOINT ")) {
      return { rows: [], rowCount: null };
    }
    if (statement.includes("current_setting('transaction_isolation')")) {
      return {
        rows: [{ transaction_isolation: options.isolation ?? "read committed" }],
        rowCount: 1,
      };
    }
    if (statement.includes("pg_advisory_xact_lock")) {
      return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
    }
    if (statement.includes("FROM exchange_sessions")) {
      return {
        rows: (options.sessionRows ?? 1) === 0 ? [] : [options.session ?? sessionRow()],
        rowCount: options.sessionRows ?? 1,
      };
    }
    if (statement.includes("MAX(consent_version)")) {
      return { rows: [{ next_version: options.nextVersion ?? "1" }], rowCount: 1 };
    }
    if (statement.includes("INSERT INTO consents")) {
      if (options.consentInsertError) throw options.consentInsertError;
      insertedRow = consentRow({
        consent_id: parameters[0],
        exchange_session_id: parameters[1],
        patient_ref_id: parameters[2],
        source_hospital_id: parameters[3],
        destination_hospital_id: parameters[4],
        imaging_package_id: parameters[5],
        consent_version: parameters[6],
        expires_at: parameters[7],
        created_at: parameters[8],
        updated_at: parameters[9],
      });
      return { rows: [insertedRow], rowCount: 1 };
    }
    if (statement.includes("INSERT INTO consent_actions")) {
      if (options.actionInsertError) throw options.actionInsertError;
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes("FROM consents")) {
      return { rows: options.findRows ?? [], rowCount: (options.findRows ?? []).length };
    }
    if (statement.includes("FROM consent_actions")) {
      return {
        rows: options.actionRows ?? [
          { consent_action_id: "28000000-0000-4000-8000-000000000001", action: "PACS_IMPORT" },
          { consent_action_id: "28000000-0000-4000-8000-000000000002", action: "VIEW" },
        ],
        rowCount: 2,
      };
    }
    throw new Error(`Unexpected SQL in test double: ${statement}`);
  });
  return { query, insertedRow: () => insertedRow };
}

describe("PostgresConsentRepository", () => {
  it("persists only a PENDING snapshot and the P0 action set with a server-assigned version", async () => {
    const database = createDatabase({ nextVersion: "7" });
    const repository = new PostgresConsentRepository(database);

    const saved = await repository.createPending(input());

    expect(saved).toBeInstanceOf(ConsentArtifact);
    expect(saved).toMatchObject({
      exchangeSessionId: sessionId,
      patientRefId,
      sourceHospitalId,
      destinationHospitalId,
      status: "PENDING",
      consentVersion: 7,
      actions: ["PACS_IMPORT", "VIEW"],
      issuedAt: null,
      expiresAt: null,
      withdrawnAt: null,
    });
    expect(saved.createdAt).toEqual(fixedNow);

    const lockCall = database.query.mock.calls.find(([statement]) =>
      statement.includes("pg_advisory_xact_lock"),
    );
    expect(lockCall?.[1]).toEqual([sessionId]);
    const insertCall = database.query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO consents"),
    );
    expect(insertCall?.[0]).toContain("'PENDING'");
    expect(insertCall?.[0]).toContain("RETURNING");
    expect(insertCall?.[1][6]).toBe(7);
    expect(insertCall?.[0]).not.toContain("ACTIVE");
    expect(database.query.mock.calls.filter(([statement]) =>
      statement.includes("INSERT INTO consent_actions"),
    )).toHaveLength(2);
    expect(database.query.mock.calls.some(([statement]) =>
      statement.includes("UPDATE ") || statement.includes("DELETE "),
    )).toBe(false);
  });

  it("uses an explicit READ COMMITTED transaction and rolls back on any action persistence error", async () => {
    const database = createDatabase({ actionInsertError: new Error("secret driver detail") });
    const repository = new PostgresConsentRepository(database);

    await expect(repository.createPending(input())).rejects.toBeInstanceOf(
      ConsentPersistenceError,
    );
    expect(database.query.mock.calls.some(([statement]) =>
      statement.startsWith("ROLLBACK TO SAVEPOINT "),
    )).toBe(true);
    expect(database.query.mock.calls.some(([statement]) =>
      statement.startsWith("RELEASE SAVEPOINT "),
    )).toBe(true);
  });

  it("fails closed when transaction isolation is not READ COMMITTED", async () => {
    const database = createDatabase({ isolation: "repeatable read" });
    const repository = new PostgresConsentRepository(database);

    await expect(repository.createPending(input())).rejects.toBeInstanceOf(
      ConsentPersistenceError,
    );
    expect(database.query.mock.calls.some(([statement]) =>
      statement.includes("pg_advisory_xact_lock"),
    )).toBe(false);
    expect(database.query.mock.calls.some(([statement]) =>
      statement.includes("INSERT INTO consents"),
    )).toBe(false);
  });

  it("denies Session context mismatch before writing", async () => {
    const database = createDatabase({
      session: sessionRow({ patient_ref_id: "22000000-0000-4000-8000-000000000099" }),
    });
    const repository = new PostgresConsentRepository(database);

    await expect(repository.createPending(input())).rejects.toBeInstanceOf(
      ConsentContextDeniedError,
    );
    expect(database.query.mock.calls.some(([statement]) =>
      statement.includes("INSERT INTO consents"),
    )).toBe(false);
  });

  it("rejects P1 and malformed actions before opening a savepoint", async () => {
    const database = createDatabase();
    const repository = new PostgresConsentRepository(database);

    await expect(repository.createPending(input({ actions: ["MOBILE_EXPORT"] }))).rejects.toBeInstanceOf(
      InvalidConsentArtifactError,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it("fails closed on missing Session evidence and version exhaustion", async () => {
    const missingDatabase = createDatabase({ sessionRows: 0, session: undefined });
    const missingRepository = new PostgresConsentRepository(missingDatabase);
    await expect(missingRepository.createPending(input())).rejects.toBeInstanceOf(
      ConsentContextDeniedError,
    );

    const exhaustedDatabase = createDatabase({ nextVersion: "2147483648" });
    const exhaustedRepository = new PostgresConsentRepository(exhaustedDatabase);
    await expect(exhaustedRepository.createPending(input())).rejects.toBeInstanceOf(
      ConsentVersionExhaustedError,
    );
    expect(exhaustedDatabase.query.mock.calls.some(([statement]) =>
      statement.includes("INSERT INTO consents"),
    )).toBe(false);
  });

  it("maps only the approved session/version unique conflict to a fixed error", async () => {
    const database = createDatabase({
      consentInsertError: Object.assign(new Error("sensitive SQL details"), {
        code: "23505",
        constraint: "consents_session_version_unique",
      }),
    });
    const repository = new PostgresConsentRepository(database);
    const error = await repository.createPending(input()).catch((failure) => failure);

    expect(error).toBeInstanceOf(ConsentVersionConflictError);
    expect(error.message).toBe("CONSENT_VERSION_CONFLICT");
    expect(error.message).not.toContain("sensitive");
  });

  it("reconstitutes only RLS-visible Consent and action rows", async () => {
    const database = createDatabase({
      findRows: [consentRow()],
      actionRows: [
        { consent_action_id: "28000000-0000-4000-8000-000000000001", action: "PACS_IMPORT" },
        { consent_action_id: "28000000-0000-4000-8000-000000000002", action: "VIEW" },
      ],
    });
    const repository = new PostgresConsentRepository(database);

    await expect(repository.findById(consentId)).resolves.toMatchObject({
      consentId,
      status: "PENDING",
      consentVersion: 1,
      actions: ["PACS_IMPORT", "VIEW"],
    });
    expect(database.query.mock.calls[0][1]).toEqual([consentId]);
    expect(database.query.mock.calls[1][1]).toEqual([consentId]);
  });

  it("returns null for an absent/hidden ID and rejects malformed IDs without a query", async () => {
    const database = createDatabase({ findRows: [] });
    const repository = new PostgresConsentRepository(database);

    await expect(repository.findById(consentId)).resolves.toBeNull();
    await expect(repository.findById("not-a-uuid")).rejects.toBeInstanceOf(
      InvalidConsentArtifactError,
    );
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it("hides database error details", async () => {
    const query = vi.fn().mockRejectedValue(new Error("credential-bearing driver error"));
    const repository = new PostgresConsentRepository({ query });
    const error = await repository.findById(consentId).catch((failure) => failure);

    expect(error).toBeInstanceOf(ConsentPersistenceError);
    expect(error.message).toBe("CONSENT_PERSISTENCE_FAILED");
    expect(error.message).not.toContain("credential");
  });

  it("withdraws only the exact ACTIVE row without an expiry predicate and returns persisted actions", async () => {
    const withdrawalTime = new Date(fixedNow.getTime() + 1_000);
    const active = ConsentArtifact.reconstitute({
      consentId,
      exchangeSessionId: sessionId,
      patientRefId,
      sourceHospitalId,
      destinationHospitalId,
      imagingPackageId: null,
      actions: ["VIEW"],
      status: "ACTIVE",
      consentVersion: 1,
      issuedAt: fixedNow,
      expiresAt: new Date(fixedNow.getTime() - 1_000),
      withdrawnAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });
    const update = vi.fn(async () => ({
      rows: [consentRow({
        status: "WITHDRAWN",
        issued_at: fixedNow,
        expires_at: new Date(fixedNow.getTime() - 1_000),
        withdrawn_at: withdrawalTime,
        updated_at: withdrawalTime,
      })],
      rowCount: 1,
    }));
    const actions = vi.fn(async () => ({
      rows: [{ consent_action_id: "28000000-0000-4000-8000-000000000001", action: "VIEW" }],
      rowCount: 1,
    }));
    const database = { query: vi.fn(async (statement, parameters) => {
      if (statement.includes("UPDATE consents")) return update(statement, parameters);
      if (statement.includes("FROM consent_actions")) return actions(statement, parameters);
      throw new Error("Unexpected SQL");
    }) };

    const withdrawn = await new PostgresConsentRepository(database).withdrawActive({
      consent: active,
      now: withdrawalTime,
    });

    const [statement, parameters] = database.query.mock.calls[0];
    expect(statement).toContain("SET status = 'WITHDRAWN', withdrawn_at = $4, updated_at = $4");
    expect(statement).toContain("status = 'ACTIVE'");
    expect(statement).toContain("withdrawn_at IS NULL");
    expect(statement.split("RETURNING")[0]).not.toContain("expires_at");
    expect(parameters).toEqual([consentId, sessionId, patientRefId, withdrawalTime]);
    expect(withdrawn).toMatchObject({ status: "WITHDRAWN", actions: ["VIEW"] });
    expect(withdrawn.withdrawnAt).toEqual(withdrawalTime);
  });

  it("reports a fixed conflict when the conditional withdrawal update affects no row", async () => {
    const active = ConsentArtifact.reconstitute({
      consentId,
      exchangeSessionId: sessionId,
      patientRefId,
      sourceHospitalId,
      destinationHospitalId,
      imagingPackageId: null,
      actions: ["VIEW"],
      status: "ACTIVE",
      consentVersion: 1,
      issuedAt: fixedNow,
      expiresAt: null,
      withdrawnAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });
    const database = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };

    const error = await new PostgresConsentRepository(database).withdrawActive({
      consent: active,
      now: new Date(fixedNow.getTime() + 1_000),
    }).catch((failure) => failure);

    expect(error).toBeInstanceOf(ConsentWithdrawalConflictError);
    expect(error.message).toBe("CONSENT_WITHDRAWAL_CONFLICT");
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
