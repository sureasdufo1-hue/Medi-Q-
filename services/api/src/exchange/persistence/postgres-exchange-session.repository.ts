import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  ExchangeSession,
  InvalidExchangeSessionError,
  type ExchangeSessionSnapshot,
  type ExchangeSessionState,
} from "../domain/exchange-session.js";
import type { ExchangeSessionRepository } from "../application/exchange-session.repository.js";

interface ExchangeSessionRow extends QueryResultRow {
  session_id: string;
  patient_ref_id: string;
  source_hospital_id: string;
  destination_hospital_id: string;
  requester_actor_id: string;
  purpose: string;
  state: ExchangeSessionState;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  completed_at: Date | null;
  idempotency_key: string;
}

export class ExchangeSessionConflictError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_CONFLICT");
    this.name = "ExchangeSessionConflictError";
  }
}

export class ExchangeSessionPersistenceError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_PERSISTENCE_FAILED");
    this.name = "ExchangeSessionPersistenceError";
  }
}

export class ExchangeSessionIdempotencyConflictError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_IDEMPOTENCY_CONFLICT");
    this.name = "ExchangeSessionIdempotencyConflictError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const selectedColumns = `
  session_id,
  patient_ref_id,
  source_hospital_id,
  destination_hospital_id,
  requester_actor_id,
  purpose,
  state,
  created_at,
  updated_at,
  expires_at,
  completed_at,
  idempotency_key
`;

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function toDomain(row: ExchangeSessionRow): ExchangeSession {
  const snapshot: ExchangeSessionSnapshot = {
    sessionId: row.session_id,
    patientRefId: row.patient_ref_id,
    sourceHospitalId: row.source_hospital_id,
    destinationHospitalId: row.destination_hospital_id,
    requesterActorId: row.requester_actor_id,
    purpose: row.purpose,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  };
  return ExchangeSession.reconstitute(snapshot);
}

function toPersistenceError<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new ExchangeSessionPersistenceError();
  }
}

export class PostgresExchangeSessionRepository
  implements ExchangeSessionRepository
{
  constructor(private readonly database: Pick<PoolClient, "query">) {}

  async create(session: ExchangeSession): Promise<ExchangeSession> {
    const result = await this.createIdempotently(session, randomUUID());
    return result.session;
  }

  async createIdempotently(
    session: ExchangeSession,
    idempotencyKey: string,
  ): Promise<{ session: ExchangeSession; created: boolean }> {
    if (!(session instanceof ExchangeSession)) {
      throw new InvalidExchangeSessionError();
    }
    if (!uuidPattern.test(idempotencyKey)) {
      throw new InvalidExchangeSessionError();
    }

    let rows: ExchangeSessionRow[];
    try {
      const result = await this.database.query<ExchangeSessionRow>(
        `INSERT INTO exchange_sessions
          (session_id, patient_ref_id, source_hospital_id,
           destination_hospital_id, requester_actor_id, purpose, state,
           created_at, updated_at, expires_at, completed_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (requester_actor_id, idempotency_key) DO NOTHING
         RETURNING ${selectedColumns}`,
        [
          session.sessionId,
          session.patientRefId,
          session.sourceHospitalId,
          session.destinationHospitalId,
          session.requesterActorId,
          session.purpose,
          session.state,
          session.createdAt,
          session.updatedAt,
          session.expiresAt,
          session.completedAt,
          idempotencyKey.toLowerCase(),
        ],
      );
      rows = result.rows;
    } catch (error) {
      if (postgresErrorCode(error) === "23505") {
        throw new ExchangeSessionConflictError();
      }
      throw new ExchangeSessionPersistenceError();
    }

    if (rows.length > 1) {
      throw new ExchangeSessionPersistenceError();
    }
    if (rows.length === 1) {
      return {
        session: toPersistenceError(() => toDomain(rows[0])),
        created: true,
      };
    }

    let existingRows: ExchangeSessionRow[];
    try {
      const existing = await this.database.query<ExchangeSessionRow>(
        `SELECT ${selectedColumns}
           FROM exchange_sessions
          WHERE requester_actor_id = $1 AND idempotency_key = $2`,
        [session.requesterActorId, idempotencyKey.toLowerCase()],
      );
      existingRows = existing.rows;
    } catch {
      throw new ExchangeSessionPersistenceError();
    }
    if (existingRows.length !== 1) {
      throw new ExchangeSessionPersistenceError();
    }

    const existing = toPersistenceError(() => toDomain(existingRows[0]));
    const sameRequest =
      existing.patientRefId === session.patientRefId &&
      existing.sourceHospitalId === session.sourceHospitalId &&
      existing.destinationHospitalId === session.destinationHospitalId &&
      existing.purpose === session.purpose;
    if (!sameRequest) throw new ExchangeSessionIdempotencyConflictError();
    return { session: existing, created: false };
  }

  async findById(sessionId: string): Promise<ExchangeSession | null> {
    if (!ExchangeSession.isValidId(sessionId)) {
      throw new InvalidExchangeSessionError();
    }

    let rows: ExchangeSessionRow[];
    try {
      const result = await this.database.query<ExchangeSessionRow>(
        `SELECT ${selectedColumns}
           FROM exchange_sessions
          WHERE session_id = $1`,
        [sessionId.toLowerCase()],
      );
      rows = result.rows;
    } catch {
      throw new ExchangeSessionPersistenceError();
    }

    if (rows.length === 0) {
      return null;
    }
    if (rows.length !== 1) {
      throw new ExchangeSessionPersistenceError();
    }
    return toPersistenceError(() => toDomain(rows[0]));
  }

  async transitionRequestedToConsentPending(
    session: ExchangeSession,
    now: Date,
  ): Promise<ExchangeSession> {
    if (!(session instanceof ExchangeSession) || session.state !== "REQUESTED") {
      throw new ExchangeSessionConflictError();
    }
    const next = session.transitionTo("CONSENT_PENDING", now);
    try {
      const result = await this.database.query<ExchangeSessionRow>(
        `UPDATE exchange_sessions
            SET state = $1, updated_at = $2
          WHERE session_id = $3
            AND state = 'REQUESTED'
            AND requester_actor_id = $4
          RETURNING ${selectedColumns}`,
        [next.state, next.updatedAt, next.sessionId, next.requesterActorId],
      );
      if (result.rows.length !== 1) throw new ExchangeSessionConflictError();
      return toPersistenceError(() => toDomain(result.rows[0]));
    } catch (error) {
      if (error instanceof ExchangeSessionConflictError) throw error;
      throw new ExchangeSessionPersistenceError();
    }
  }

  async transitionConsentPendingToConsented(
    session: ExchangeSession,
    now: Date,
  ): Promise<ExchangeSession> {
    if (!(session instanceof ExchangeSession) || session.state !== "CONSENT_PENDING") {
      throw new ExchangeSessionConflictError();
    }
    const next = session.transitionTo("CONSENTED", now);
    try {
      const result = await this.database.query<ExchangeSessionRow>(
        `UPDATE exchange_sessions
            SET state = $1, updated_at = $2
          WHERE session_id = $3
            AND state = 'CONSENT_PENDING'
            AND patient_ref_id = $4
          RETURNING ${selectedColumns}`,
        [next.state, next.updatedAt, next.sessionId, next.patientRefId],
      );
      if (result.rows.length !== 1) throw new ExchangeSessionConflictError();
      return toPersistenceError(() => toDomain(result.rows[0]));
    } catch (error) {
      if (error instanceof ExchangeSessionConflictError) throw error;
      throw new ExchangeSessionPersistenceError();
    }
  }
}
