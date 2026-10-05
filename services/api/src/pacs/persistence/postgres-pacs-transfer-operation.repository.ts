import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";
import { PacsTransferOperation } from "../domain/pacs-transfer-operation.js";
import {
  PacsTransferOperationConcurrencyError,
  PacsTransferOperationConflictError,
  PacsTransferOperationPersistenceError,
  type PacsTransferOperationRepository,
} from "./pacs-transfer-operation.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

interface OperationRow extends QueryResultRow {
  operation_id: string;
  tenant_id: string;
  exchange_session_id: string;
  study_ref_id: string;
  actor_id: string;
  idempotency_key: string;
  request_digest: string;
  state: string;
  version: number;
  reason_code: string | null;
  source_object_count: number | null;
  destination_object_count: number | null;
  created_at: Date;
  updated_at: Date;
  stow_started_at: Date | null;
}

function validUuid(value: string): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function snapshot(row: OperationRow): PacsTransferOperation {
  return PacsTransferOperation.reconstitute({
    operationId: row.operation_id,
    tenantId: row.tenant_id,
    exchangeSessionId: row.exchange_session_id,
    studyRefId: row.study_ref_id,
    actorId: row.actor_id,
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    state: row.state as
      | "CREATED"
      | "PREFLIGHT_PASSED"
      | "STOW_STARTED"
      | "VERIFYING"
      | "COMPLETED"
      | "DENIED"
      | "FAILED"
      | "PARTIAL"
      | "RESULT_UNKNOWN",
    version: row.version,
    reasonCode: row.reason_code,
    sourceObjectCount: row.source_object_count,
    destinationObjectCount: row.destination_object_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stowStartedAt: row.stow_started_at,
  });
}

async function recordAudit(
  client: PoolClient,
  operation: PacsTransferOperation,
  correlationId: string,
  auditEventId: string,
): Promise<void> {
  const state = operation.snapshot.state;
  const result = state === "DENIED" ? "DENY"
    : state === "FAILED" || state === "PARTIAL" || state === "RESULT_UNKNOWN"
      ? "FAILURE"
      : "SUCCESS";
  const reasonCode = operation.snapshot.reasonCode ?? state;
  const inserted = await client.query(
    `INSERT INTO audit_events
      (audit_event_id, occurred_at, actor_id, tenant_id,
       exchange_session_id, resource_type, resource_id, action,
       result, reason_code, correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'PACS_TRANSFER_OPERATION', $6,
             'PACS_TRANSFER_OPERATION_STATE_CHANGED', $7, $8, $9, $10)`,
    [
      auditEventId,
      operation.snapshot.updatedAt,
      operation.snapshot.actorId,
      operation.snapshot.tenantId,
      operation.snapshot.exchangeSessionId,
      operation.snapshot.operationId,
      result,
      reasonCode,
      correlationId,
      operation.snapshot.updatedAt,
    ],
  );
  if (inserted.rowCount !== 1) throw new Error("AUDIT_ROW_COUNT_INVALID");
}

async function rollbackSavepoint(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK TO SAVEPOINT mediq_pacs_operation_write");
  await client.query("RELEASE SAVEPOINT mediq_pacs_operation_write");
}

export class PostgresPacsTransferOperationRepository
  implements PacsTransferOperationRepository
{
  constructor(
    private readonly transaction: PoolClient,
    private readonly createId: () => string = randomUUID,
  ) {}

  async findById(input: {
    readonly operationId: string;
    readonly tenantId: string;
  }): Promise<PacsTransferOperation | null> {
    if (!validUuid(input.operationId) || !validUuid(input.tenantId)) {
      throw new PacsTransferOperationPersistenceError();
    }
    try {
      const found = await this.transaction.query<OperationRow>(
        `SELECT operation_id, tenant_id, exchange_session_id, study_ref_id,
                actor_id, idempotency_key, request_digest, state, version,
                reason_code, source_object_count, destination_object_count,
                created_at, updated_at, stow_started_at
           FROM pacs_transfer_operations
          WHERE operation_id = $1::uuid
            AND tenant_id = $2::uuid
            AND tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid`,
        [input.operationId.toLowerCase(), input.tenantId.toLowerCase()],
      );
      if (found.rowCount === 0 && found.rows.length === 0) return null;
      if (found.rowCount !== 1 || found.rows.length !== 1) {
        throw new PacsTransferOperationPersistenceError();
      }
      return snapshot(found.rows[0]!);
    } catch (error) {
      if (error instanceof PacsTransferOperationPersistenceError) throw error;
      throw new PacsTransferOperationPersistenceError();
    }
  }

  async createIdempotently(input: {
    readonly operation: PacsTransferOperation;
    readonly correlationId: string;
  }): Promise<{ readonly operation: PacsTransferOperation; readonly created: boolean }> {
    const operation = input.operation;
    const value = operation.snapshot;
    if (
      !validUuid(input.correlationId) ||
      !validUuid(value.tenantId) ||
      !validUuid(value.actorId) ||
      !validUuid(value.exchangeSessionId) ||
      !validUuid(value.studyRefId) ||
      !validUuid(value.operationId) ||
      !validUuid(value.idempotencyKey) ||
      !DIGEST_PATTERN.test(value.requestDigest)
    ) {
      throw new PacsTransferOperationPersistenceError();
    }

    try {
      await acquireExchangeSessionFence(
        this.transaction,
        value.exchangeSessionId,
      );
      await this.transaction.query(
        "SAVEPOINT mediq_pacs_operation_write",
      );
      const inserted = await this.transaction.query<OperationRow>(
        `INSERT INTO pacs_transfer_operations
          (operation_id, tenant_id, exchange_session_id, study_ref_id,
           actor_id, idempotency_key, request_digest, state, version,
           reason_code, source_object_count, destination_object_count,
           created_at, updated_at, stow_started_at)
         SELECT $1, $2, e.session_id, sr.study_ref_id,
                $5, $6, $7, 'CREATED', 0, NULL, NULL, NULL, $8, $8, NULL
           FROM exchange_sessions e
           JOIN imaging_packages p ON p.exchange_session_id = e.session_id
           JOIN study_references sr ON sr.package_id = p.package_id
          WHERE e.session_id = $3
            AND sr.study_ref_id = $4
            AND EXISTS (
              SELECT 1 FROM actors a
               WHERE a.actor_id = $5 AND a.tenant_id = $2
            )
         ON CONFLICT DO NOTHING
         RETURNING operation_id, tenant_id, exchange_session_id,
                   study_ref_id, actor_id, idempotency_key, request_digest,
                   state, version, reason_code, source_object_count,
                   destination_object_count, created_at, updated_at,
                   stow_started_at`,
        [
          value.operationId,
          value.tenantId,
          value.exchangeSessionId,
          value.studyRefId,
          value.actorId,
          value.idempotencyKey,
          value.requestDigest,
          value.createdAt,
        ],
      );

      if (inserted.rowCount === 1) {
        const created = snapshot(inserted.rows[0]!);
        await recordAudit(
          this.transaction,
          created,
          input.correlationId.toLowerCase(),
          this.createId(),
        );
        await this.transaction.query(
          "RELEASE SAVEPOINT mediq_pacs_operation_write",
        );
        return Object.freeze({ operation: created, created: true });
      }

      const existing = await this.transaction.query<OperationRow>(
        `SELECT operation_id, tenant_id, exchange_session_id, study_ref_id,
                actor_id, idempotency_key, request_digest, state, version,
                reason_code, source_object_count, destination_object_count,
                created_at, updated_at, stow_started_at
           FROM pacs_transfer_operations
          WHERE (tenant_id = $1 AND actor_id = $2 AND idempotency_key = $3)
             OR (exchange_session_id = $4 AND study_ref_id = $5)
          ORDER BY created_at
          LIMIT 1`,
        [
          value.tenantId,
          value.actorId,
          value.idempotencyKey,
          value.exchangeSessionId,
          value.studyRefId,
        ],
      );
      await this.transaction.query(
        "RELEASE SAVEPOINT mediq_pacs_operation_write",
      );
      if (existing.rowCount !== 1) {
        throw new PacsTransferOperationPersistenceError();
      }

      const persisted = snapshot(existing.rows[0]!);
      if (
        persisted.snapshot.tenantId !== value.tenantId.toLowerCase() ||
        persisted.snapshot.actorId !== value.actorId.toLowerCase() ||
        persisted.snapshot.exchangeSessionId !==
          value.exchangeSessionId.toLowerCase() ||
        persisted.snapshot.studyRefId !== value.studyRefId.toLowerCase() ||
        persisted.snapshot.idempotencyKey !== value.idempotencyKey.toLowerCase() ||
        persisted.snapshot.requestDigest !== value.requestDigest
      ) {
        throw new PacsTransferOperationConflictError();
      }
      return Object.freeze({ operation: persisted, created: false });
    } catch (error) {
      if (
        error instanceof PacsTransferOperationConflictError ||
        error instanceof PacsTransferOperationPersistenceError
      ) {
        throw error;
      }
      try {
        await rollbackSavepoint(this.transaction);
      } catch {
        // The outer verified-Tenant transaction must fail closed on SQL failure.
      }
      throw new PacsTransferOperationPersistenceError();
    }
  }

  async transition(input: {
    readonly current: PacsTransferOperation;
    readonly next: PacsTransferOperation;
    readonly correlationId: string;
  }): Promise<PacsTransferOperation> {
    const current = input.current.snapshot;
    const next = input.next.snapshot;
    if (
      !validUuid(input.correlationId) ||
      current.operationId !== next.operationId ||
      current.tenantId !== next.tenantId ||
      current.exchangeSessionId !== next.exchangeSessionId ||
      current.studyRefId !== next.studyRefId ||
      current.actorId !== next.actorId ||
      current.idempotencyKey !== next.idempotencyKey ||
      current.requestDigest !== next.requestDigest ||
      next.version !== current.version + 1
    ) {
      throw new PacsTransferOperationPersistenceError();
    }

    try {
      await acquireExchangeSessionFence(
        this.transaction,
        current.exchangeSessionId,
      );
      await this.transaction.query(
        "SAVEPOINT mediq_pacs_operation_write",
      );
      const changed = await this.transaction.query<OperationRow>(
        `UPDATE pacs_transfer_operations
            SET state = $1,
                version = $2,
                reason_code = $3,
                source_object_count = $4,
                destination_object_count = $5,
                updated_at = $6,
                stow_started_at = $7
          WHERE operation_id = $8
            AND tenant_id = $9
            AND actor_id = $10
            AND exchange_session_id = $11
            AND study_ref_id = $12
            AND request_digest = $13
            AND state = $14
            AND version = $15
         RETURNING operation_id, tenant_id, exchange_session_id,
                   study_ref_id, actor_id, idempotency_key, request_digest,
                   state, version, reason_code, source_object_count,
                   destination_object_count, created_at, updated_at,
                   stow_started_at`,
        [
          next.state,
          next.version,
          next.reasonCode,
          next.sourceObjectCount,
          next.destinationObjectCount,
          next.updatedAt,
          next.stowStartedAt,
          current.operationId,
          current.tenantId,
          current.actorId,
          current.exchangeSessionId,
          current.studyRefId,
          current.requestDigest,
          current.state,
          current.version,
        ],
      );
      if (changed.rowCount !== 1) {
        await rollbackSavepoint(this.transaction);
        throw new PacsTransferOperationConcurrencyError();
      }
      const updated = snapshot(changed.rows[0]!);
      await recordAudit(
        this.transaction,
        updated,
        input.correlationId.toLowerCase(),
        this.createId(),
      );
      await this.transaction.query(
        "RELEASE SAVEPOINT mediq_pacs_operation_write",
      );
      return updated;
    } catch (error) {
      if (
        error instanceof PacsTransferOperationConcurrencyError ||
        error instanceof PacsTransferOperationPersistenceError
      ) {
        throw error;
      }
      try {
        await rollbackSavepoint(this.transaction);
      } catch {
        // The outer verified-Tenant transaction must fail closed on SQL failure.
      }
      throw new PacsTransferOperationPersistenceError();
    }
  }
}
