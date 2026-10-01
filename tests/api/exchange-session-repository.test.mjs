import { describe, expect, it, vi } from "vitest";
import {
  ExchangeSession,
  InvalidExchangeSessionError,
} from "../../services/api/dist/exchange/domain/exchange-session.js";
import {
  ExchangeSessionConflictError,
  ExchangeSessionIdempotencyConflictError,
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../services/api/dist/exchange/persistence/postgres-exchange-session.repository.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const fixedSessionId = "25000000-0000-4000-8000-000000000001";
const patientRefId = "22000000-0000-4000-8000-000000000001";
const sourceHospitalId = "04000000-0000-4000-8000-000000000001";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const requesterActorId = "03000000-0000-4000-8000-000000000001";
const approvedColumns = [
  "session_id",
  "patient_ref_id",
  "source_hospital_id",
  "destination_hospital_id",
  "requester_actor_id",
  "purpose",
  "state",
  "created_at",
  "updated_at",
  "expires_at",
  "completed_at",
  "idempotency_key",
];
const fixedIdempotencyKey = "26000000-0000-4000-8000-000000000001";

function session(overrides = {}) {
  return ExchangeSession.reconstitute({
    sessionId: fixedSessionId,
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    requesterActorId,
    purpose: "Referral imaging review",
    state: "REQUESTED",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    expiresAt: null,
    completedAt: null,
    ...overrides,
  });
}

function row(overrides = {}) {
  return {
    session_id: fixedSessionId,
    patient_ref_id: patientRefId,
    source_hospital_id: sourceHospitalId,
    destination_hospital_id: destinationHospitalId,
    requester_actor_id: requesterActorId,
    purpose: "Referral imaging review",
    state: "REQUESTED",
    created_at: fixedNow,
    updated_at: fixedNow,
    expires_at: null,
    completed_at: null,
    idempotency_key: fixedIdempotencyKey,
    ...overrides,
  };
}

function databaseWithQuery(query) {
  return { query };
}

describe("PostgresExchangeSessionRepository", () => {
  it("inserts only the approved 12 columns using bound values and maps the row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    const saved = await repository.create(session());
    const [statement, parameters] = query.mock.calls[0];
    const insertColumns = statement.match(
      /INSERT INTO exchange_sessions\s*\(([\s\S]*?)\)\s*VALUES/,
    )?.[1];
    const returningColumns = statement.match(/\bRETURNING\b([\s\S]*)$/)?.[1];

    expect(statement).toContain("INSERT INTO exchange_sessions");
    expect(insertColumns?.split(",").map((column) => column.trim())).toEqual(
      approvedColumns,
    );
    expect(returningColumns?.split(",").map((column) => column.trim())).toEqual(
      approvedColumns,
    );
    expect(statement).toContain("VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)");
    expect(statement.match(/\bRETURNING\b/g)).toHaveLength(1);
    expect(statement).not.toContain(fixedSessionId);
    expect(statement).not.toContain("payload");
    expect(parameters.slice(0, 11)).toEqual([
      fixedSessionId,
      patientRefId,
      sourceHospitalId,
      destinationHospitalId,
      requesterActorId,
      "Referral imaging review",
      "REQUESTED",
      fixedNow,
      fixedNow,
      null,
      null,
    ]);
    expect(parameters[11]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved).toBeInstanceOf(ExchangeSession);
    expect(saved.sessionId).toBe(fixedSessionId);
    expect(saved.state).toBe("REQUESTED");
  });

  it("returns the existing session for an exact idempotent replay", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    const repository = new PostgresExchangeSessionRepository(databaseWithQuery(query));

    const result = await repository.createIdempotently(session(), fixedIdempotencyKey);

    expect(result).toMatchObject({ created: false, session: { sessionId: fixedSessionId } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (requester_actor_id, idempotency_key) DO NOTHING");
    expect(query.mock.calls[1][0]).toContain("WHERE requester_actor_id = $1 AND idempotency_key = $2");
    expect(query.mock.calls[1][1]).toEqual([requesterActorId, fixedIdempotencyKey]);
  });

  it("rejects reusing an idempotency key for a different request", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row({ purpose: "Different purpose" })], rowCount: 1 });
    const repository = new PostgresExchangeSessionRepository(databaseWithQuery(query));

    await expect(repository.createIdempotently(session(), fixedIdempotencyKey)).rejects.toBeInstanceOf(
      ExchangeSessionIdempotencyConflictError,
    );
  });

  it("persists the approved CANCELLED state without changing it", async () => {
    const cancelled = session({ state: "CANCELLED" });
    const query = vi.fn().mockResolvedValue({
      rows: [row({ state: "CANCELLED" })],
      rowCount: 1,
    });
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    await expect(repository.create(cancelled)).resolves.toMatchObject({
      state: "CANCELLED",
    });
    expect(query.mock.calls[0][1][6]).toBe("CANCELLED");
  });

  it("finds one Session using an exact bound ID predicate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    const found = await repository.findById(fixedSessionId.toUpperCase());
    const [statement, parameters] = query.mock.calls[0];
    const selectedColumns = statement.match(
      /\bSELECT\b([\s\S]*?)\bFROM\b/,
    )?.[1];

    expect(statement).toContain("FROM exchange_sessions");
    expect(statement).toContain("WHERE session_id = $1");
    expect(selectedColumns?.split(",").map((column) => column.trim())).toEqual(
      approvedColumns,
    );
    expect(statement).not.toContain(fixedSessionId);
    expect(parameters).toEqual([fixedSessionId]);
    expect(found?.sessionId).toBe(fixedSessionId);
  });

  it("returns the same null result for absent or RLS-hidden rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    await expect(repository.findById(fixedSessionId)).resolves.toBeNull();
  });

  it("maps unique conflicts to a fixed non-disclosing error", async () => {
    const query = vi.fn().mockRejectedValue({
      code: "23505",
      detail: `duplicate session_id ${fixedSessionId}`,
    });
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );
    const error = await repository.create(session()).catch((failure) => failure);

    expect(error).toBeInstanceOf(ExchangeSessionConflictError);
    expect(error.message).toBe("EXCHANGE_SESSION_CONFLICT");
    expect(error.message).not.toContain(fixedSessionId);
  });

  it("maps database failures to a fixed error without SQL or driver details", async () => {
    const query = vi.fn().mockRejectedValue(
      new Error(`constraint detail ${fixedSessionId}`),
    );
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );
    const error = await repository.findById(fixedSessionId).catch((failure) => failure);

    expect(error).toBeInstanceOf(ExchangeSessionPersistenceError);
    expect(error.message).toBe("EXCHANGE_SESSION_PERSISTENCE_FAILED");
    expect(error.message).not.toContain(fixedSessionId);
  });

  it("rejects malformed and injection-shaped lookup IDs before any query", async () => {
    const query = vi.fn();
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    await expect(repository.findById("not-a-uuid")).rejects.toBeInstanceOf(
      InvalidExchangeSessionError,
    );
    await expect(
      repository.findById(`${fixedSessionId}' OR '1'='1`),
    ).rejects.toBeInstanceOf(InvalidExchangeSessionError);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects non-domain values before insert", async () => {
    const query = vi.fn();
    const repository = new PostgresExchangeSessionRepository(
      databaseWithQuery(query),
    );

    await expect(repository.create({})).rejects.toBeInstanceOf(
      InvalidExchangeSessionError,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed on impossible row counts and invalid persisted state", async () => {
    const multiRowQuery = vi.fn().mockResolvedValue({
      rows: [row(), row({ session_id: "25000000-0000-4000-8000-000000000002" })],
      rowCount: 2,
    });
    const multiRowRepository = new PostgresExchangeSessionRepository(
      databaseWithQuery(multiRowQuery),
    );
    await expect(
      multiRowRepository.findById(fixedSessionId),
    ).rejects.toBeInstanceOf(ExchangeSessionPersistenceError);

    const corruptQuery = vi.fn().mockResolvedValue({
      rows: [row({ state: "UNRECOGNIZED" })],
      rowCount: 1,
    });
    const corruptRepository = new PostgresExchangeSessionRepository(
      databaseWithQuery(corruptQuery),
    );
    await expect(
      corruptRepository.findById(fixedSessionId),
    ).rejects.toBeInstanceOf(ExchangeSessionPersistenceError);
  });
});
