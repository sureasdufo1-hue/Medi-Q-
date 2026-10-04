import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { AuthorizationContext } from "../../authorization/domain/authorization-context.js";
import { decideObjectAuthorization } from "../../authorization/domain/object-authorization-policy.js";
import { PostgresAuthorizationEvidenceReader } from "../../authorization/persistence/postgres-authorization-evidence.reader.js";
import { AuditEvent } from "../../audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../audit/persistence/postgres-audit-event-writer.js";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PacsTransferTerminalizationResult {
  readonly operationId: string;
  readonly exchangeSessionId: string;
  readonly state: "COMPLETED";
  readonly version: 4;
  readonly completedAt: Date;
  readonly sessionState: "ACTIVE" | "COMPLETED";
}

export class PacsTransferTerminalizationDeniedError extends Error {
  constructor() {
    super("PACS_TRANSFER_TERMINALIZATION_DENIED");
    this.name = "PacsTransferTerminalizationDeniedError";
  }
}

export class PacsTransferTerminalizationConflictError extends Error {
  constructor() {
    super("PACS_TRANSFER_TERMINALIZATION_CONFLICT");
    this.name = "PacsTransferTerminalizationConflictError";
  }
}

export class PacsTransferTerminalizationUnavailableError extends Error {
  constructor() {
    super("PACS_TRANSFER_TERMINALIZATION_UNAVAILABLE");
    this.name = "PacsTransferTerminalizationUnavailableError";
  }
}

interface InitialOperationRow extends QueryResultRow {
  operation_id: string;
  tenant_id: string;
  actor_id: string;
  exchange_session_id: string;
  study_ref_id: string;
}

interface TerminalBindingRow extends InitialOperationRow {
  state: string;
  version: number;
  source_object_count: number | null;
  destination_object_count: number | null;
  created_at: Date;
  updated_at: Date;
  stow_started_at: Date | null;
  session_state: string;
  session_completed_at: Date | null;
  provenance_id: string;
  integrity_id: string | null;
  transfer_type: string;
  transfer_status: string;
  ingested_at: Date | null;
  transferred_at: Date | null;
  source_integrity_id: string;
  source_status: string;
  source_digest: string;
  source_count: number;
  destination_integrity_id: string;
  destination_status: string;
  destination_digest: string;
  destination_count: number;
  destination_verified_at: Date;
  destination_created_at: Date;
  temporary_storage_ref: string | null;
  temporary_payload_state: string | null;
  temporary_payload_purged_at: Date | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function exactInput(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set(["operationId", "context", "correlationId"]);
    return Reflect.ownKeys(descriptors).length === allowed.size &&
      Reflect.ownKeys(descriptors).every((key) => typeof key === "string" &&
        allowed.has(key) && descriptors[key]!.enumerable &&
        Object.hasOwn(descriptors[key]!, "value"));
  } catch {
    return false;
  }
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function terminalAudit(input: {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly action: "PACS_TRANSFER_COMPLETED" | "INTEGRITY_VERIFIED";
  readonly correlationId: string;
}): AuditEvent {
  return AuditEvent.create({
    auditEventId: input.auditEventId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    tenantId: input.tenantId,
    exchangeSessionId: input.exchangeSessionId,
    resourceType: "STUDY",
    resourceId: input.studyRefId,
    action: input.action,
    result: "SUCCESS",
    reasonCode: null,
    correlationId: input.correlationId,
    createdAt: input.occurredAt,
  });
}

export class PostgresPacsTransferTerminalizationRepository {
  private readonly authorizationReader = new PostgresAuthorizationEvidenceReader();
  private readonly auditWriter: PostgresAuditEventWriter;

  constructor(
    private readonly transaction: PoolClient,
    private readonly createId: () => string = randomUUID,
  ) {
    this.auditWriter = new PostgresAuditEventWriter(transaction);
  }

  /**
   * Internal persistence finalizer. It performs database work only; the future
   * PACS coordinator remains responsible for calling it only with its original
   * successful STOW, destination-byte proof and committed physical-purge facts.
   */
  async finalize(input: unknown): Promise<PacsTransferTerminalizationResult> {
    if (!exactInput(input)) throw new PacsTransferTerminalizationDeniedError();
    const operationId = input.operationId;
    const correlationId = input.correlationId;
    const context = input.context;
    if (
      typeof operationId !== "string" || !UUID_PATTERN.test(operationId) ||
      typeof correlationId !== "string" || !UUID_PATTERN.test(correlationId) ||
      !AuthorizationContext.is(context) ||
      context.action !== "PACS_IMPORT" ||
      context.resource.kind !== "STUDY" ||
      !UUID_PATTERN.test(context.resource.id)
    ) {
      throw new PacsTransferTerminalizationDeniedError();
    }
    const terminalCorrelationId = correlationId.toLowerCase();

    let savepointCreated = false;
    try {
      const initial = await this.transaction.query<InitialOperationRow>(
        `SELECT operation_id, tenant_id, actor_id, exchange_session_id, study_ref_id
           FROM pacs_transfer_operations
          WHERE operation_id = $1
            AND tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
            AND tenant_id = $2
            AND actor_id = $3
            AND exchange_session_id = $4
            AND study_ref_id = $5`,
        [operationId.toLowerCase(), context.tenantId, context.actorId,
          context.exchangeSessionId, context.resource.id],
      );
      if (initial.rowCount !== 1 || !initial.rows[0]) {
        throw new PacsTransferTerminalizationDeniedError();
      }
      const operation = initial.rows[0];
      await acquireExchangeSessionFence(this.transaction, operation.exchange_session_id);
      await this.transaction.query("SAVEPOINT mediq_pacs_terminalization");
      savepointCreated = true;

      const bindingResult = await this.transaction.query<TerminalBindingRow>(
        `SELECT op.operation_id, op.tenant_id, op.actor_id, op.exchange_session_id,
                op.study_ref_id, op.state, op.version, op.source_object_count,
                op.destination_object_count, op.created_at, op.updated_at,
                op.stow_started_at, es.state AS session_state,
                es.completed_at AS session_completed_at,
                pr.provenance_id, pr.integrity_id, pr.transfer_type,
                pr.transfer_status, pr.ingested_at, pr.transferred_at,
                src.integrity_id AS source_integrity_id, src.status AS source_status,
                src.source_digest, src.source_object_count AS source_count,
                dst.integrity_id AS destination_integrity_id, dst.status AS destination_status,
                dst.destination_digest AS destination_digest,
                dst.destination_object_count AS destination_count,
                dst.verified_at AS destination_verified_at,
                dst.created_at AS destination_created_at,
                sr.temporary_storage_ref, sr.temporary_payload_state,
                sr.temporary_payload_purged_at
           FROM pacs_transfer_operations op
           JOIN exchange_sessions es ON es.session_id = op.exchange_session_id
           JOIN imaging_packages p ON p.exchange_session_id = es.session_id
           JOIN study_references sr
             ON sr.study_ref_id = op.study_ref_id
            AND sr.package_id = p.package_id
            AND sr.source_hospital_id = es.source_hospital_id
           JOIN provenance_records pr
             ON pr.operation_id = op.operation_id
            AND pr.exchange_session_id = es.session_id
            AND pr.package_id = p.package_id
            AND pr.study_ref_id = sr.study_ref_id
           JOIN integrity_evidence src
             ON src.operation_id = op.operation_id
            AND src.exchange_session_id = es.session_id
            AND src.package_id = p.package_id
            AND src.study_ref_id = sr.study_ref_id
            AND src.verification_stage = 'SOURCE_CAPTURE'
           JOIN integrity_evidence dst
             ON dst.operation_id = op.operation_id
            AND dst.exchange_session_id = es.session_id
            AND dst.package_id = p.package_id
            AND dst.study_ref_id = sr.study_ref_id
            AND dst.verification_stage = 'DESTINATION_VERIFY'
          WHERE op.operation_id = $1
            AND op.tenant_id = $2
            AND op.actor_id = $3
            AND op.exchange_session_id = $4
            AND op.study_ref_id = $5
          FOR UPDATE OF op, es, pr`,
        [operation.operation_id, operation.tenant_id, operation.actor_id,
          operation.exchange_session_id, operation.study_ref_id],
      );
      if (bindingResult.rowCount !== 1 || !bindingResult.rows[0]) {
        throw new PacsTransferTerminalizationConflictError();
      }
      const binding = bindingResult.rows[0];
      if (
        binding.state !== "VERIFYING" || binding.version !== 3 ||
        binding.source_object_count === null || binding.source_object_count < 1 ||
        binding.destination_object_count !== null ||
        !validDate(binding.created_at) || !validDate(binding.updated_at) ||
        !validDate(binding.stow_started_at) ||
        binding.stow_started_at < binding.created_at ||
        binding.stow_started_at > binding.updated_at ||
        binding.session_state !== "ACTIVE" || binding.session_completed_at !== null ||
        binding.provenance_id === null || binding.integrity_id === null ||
        binding.transfer_type !== "PACS_IMPORT" || binding.transfer_status !== "PENDING" ||
        binding.ingested_at !== null || binding.transferred_at !== null ||
        binding.integrity_id !== binding.destination_integrity_id ||
        binding.source_status !== "PENDING" ||
        binding.destination_status !== "VERIFIED" ||
        binding.source_digest !== binding.destination_digest ||
        binding.source_count !== binding.source_object_count ||
        binding.destination_count !== binding.source_object_count ||
        binding.temporary_payload_state !== "PURGED" ||
        !binding.temporary_storage_ref || !validDate(binding.temporary_payload_purged_at) ||
        !validDate(binding.destination_verified_at) ||
        !validDate(binding.destination_created_at) ||
        binding.destination_created_at < binding.destination_verified_at
      ) {
        throw new PacsTransferTerminalizationConflictError();
      }

      const timeResult = await this.transaction.query<{ completed_at: Date }>(
        "SELECT clock_timestamp() AS completed_at",
      );
      const completedAt = timeResult.rows[0]?.completed_at;
      if (!validDate(completedAt) || completedAt < binding.destination_created_at) {
        throw new PacsTransferTerminalizationConflictError();
      }

      const facts = await this.authorizationReader.resolve(context, this.transaction);
      if (!facts || decideObjectAuthorization(context, facts, completedAt) !== "ALLOW") {
        throw new PacsTransferTerminalizationDeniedError();
      }

      const studyCountResult = await this.transaction.query<{ study_count: number }>(
        `SELECT count(*)::int AS study_count
           FROM imaging_packages p
           JOIN study_references sr ON sr.package_id = p.package_id
          WHERE p.exchange_session_id = $1`,
        [operation.exchange_session_id],
      );
      const studyCount = studyCountResult.rows[0]?.study_count;
      if (!Number.isSafeInteger(studyCount) || (studyCount as number) < 1) {
        throw new PacsTransferTerminalizationConflictError();
      }

      const common = {
        actorId: operation.actor_id,
        tenantId: operation.tenant_id,
        exchangeSessionId: operation.exchange_session_id,
        studyRefId: operation.study_ref_id,
        correlationId: terminalCorrelationId,
        occurredAt: completedAt,
      };
      const transferAuditId = this.createId();
      const integrityAuditId = this.createId();
      const operationAuditId = this.createId();
      const sessionAuditId = studyCount === 1 ? this.createId() : null;
      if ([transferAuditId, integrityAuditId, operationAuditId, ...(sessionAuditId ? [sessionAuditId] : [])]
        .some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
        throw new PacsTransferTerminalizationUnavailableError();
      }

      await this.transaction.query(
        "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
        [terminalCorrelationId],
      );
      await this.auditWriter.record(terminalAudit({
        ...common,
        auditEventId: transferAuditId,
        action: "PACS_TRANSFER_COMPLETED",
      }));
      await this.auditWriter.record(terminalAudit({
        ...common,
        auditEventId: integrityAuditId,
        action: "INTEGRITY_VERIFIED",
      }));
      if (sessionAuditId) {
        await this.auditWriter.record(AuditEvent.create({
          auditEventId: sessionAuditId,
          occurredAt: completedAt,
          actorId: operation.actor_id,
          tenantId: operation.tenant_id,
          exchangeSessionId: operation.exchange_session_id,
          resourceType: "EXCHANGE_SESSION",
          resourceId: operation.exchange_session_id,
          action: "SESSION_COMPLETED",
          result: "SUCCESS",
          reasonCode: null,
          correlationId: terminalCorrelationId,
          createdAt: completedAt,
        }));
      }
      const operationAudit = await this.transaction.query(
        `INSERT INTO audit_events
          (audit_event_id, occurred_at, actor_id, tenant_id,
           exchange_session_id, resource_type, resource_id, action,
           result, reason_code, correlation_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PACS_TRANSFER_OPERATION', $6,
                 'PACS_TRANSFER_OPERATION_STATE_CHANGED', 'SUCCESS', 'COMPLETED', $7, $2)`,
        [operationAuditId, completedAt, operation.actor_id, operation.tenant_id,
          operation.exchange_session_id, operation.operation_id, terminalCorrelationId],
      );
      if (operationAudit.rowCount !== 1) throw new Error("TERMINAL_OPERATION_AUDIT_ROW_COUNT_INVALID");

      const provenanceUpdate = await this.transaction.query(
        `UPDATE provenance_records
            SET transfer_status = 'COMPLETED', ingested_at = $1, transferred_at = $1
          WHERE provenance_id = $2
            AND operation_id = $3
            AND exchange_session_id = $4
            AND study_ref_id = $5
            AND transfer_type = 'PACS_IMPORT'
            AND transfer_status = 'PENDING'
            AND integrity_id = $6
            AND ingested_at IS NULL
            AND transferred_at IS NULL`,
        [completedAt, binding.provenance_id, operation.operation_id,
          operation.exchange_session_id, operation.study_ref_id, binding.integrity_id],
      );
      if (provenanceUpdate.rowCount !== 1) throw new PacsTransferTerminalizationConflictError();

      const operationUpdate = await this.transaction.query(
        `UPDATE pacs_transfer_operations
            SET state = 'COMPLETED', version = 4, reason_code = 'COMPLETED',
                source_object_count = $1, destination_object_count = $2, updated_at = $3
          WHERE operation_id = $4
            AND tenant_id = $5
            AND actor_id = $6
            AND exchange_session_id = $7
            AND study_ref_id = $8
            AND state = 'VERIFYING'
            AND version = 3
            AND source_object_count = $1
            AND destination_object_count IS NULL`,
        [binding.source_object_count, binding.destination_count, completedAt,
          operation.operation_id, operation.tenant_id, operation.actor_id,
          operation.exchange_session_id, operation.study_ref_id],
      );
      if (operationUpdate.rowCount !== 1) throw new PacsTransferTerminalizationConflictError();

      let sessionState: "ACTIVE" | "COMPLETED" = "ACTIVE";
      if (studyCount === 1) {
        const sessionUpdate = await this.transaction.query(
          `UPDATE exchange_sessions
              SET state = 'COMPLETED', updated_at = $1, completed_at = $1
            WHERE session_id = $2
              AND state = 'ACTIVE'
              AND completed_at IS NULL`,
          [completedAt, operation.exchange_session_id],
        );
        if (sessionUpdate.rowCount !== 1) throw new PacsTransferTerminalizationConflictError();
        sessionState = "COMPLETED";
      }

      await this.transaction.query("RELEASE SAVEPOINT mediq_pacs_terminalization");
      savepointCreated = false;
      return Object.freeze({
        operationId: operation.operation_id,
        exchangeSessionId: operation.exchange_session_id,
        state: "COMPLETED",
        version: 4,
        completedAt: new Date(completedAt),
        sessionState,
      });
    } catch (error) {
      if (savepointCreated) {
        try {
          await this.transaction.query("ROLLBACK TO SAVEPOINT mediq_pacs_terminalization");
          await this.transaction.query("RELEASE SAVEPOINT mediq_pacs_terminalization");
        } catch {
          // The owning verified-Tenant transaction must fail closed on SQL failure.
        }
      }
      if (
        error instanceof PacsTransferTerminalizationDeniedError ||
        error instanceof PacsTransferTerminalizationConflictError ||
        error instanceof PacsTransferTerminalizationUnavailableError
      ) {
        throw error;
      }
      throw new PacsTransferTerminalizationUnavailableError();
    }
  }
}
