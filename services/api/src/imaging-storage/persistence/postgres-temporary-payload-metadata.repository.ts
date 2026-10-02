import type { PoolClient, QueryResultRow } from "pg";
import { AuditEvent } from "../../audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../audit/persistence/postgres-audit-event-writer.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TemporaryPayloadPurgeReason =
  | "CAPTURE_FAILURE"
  | "EXPLICIT_CLOSE"
  | "TRANSFER_TERMINAL"
  | "TTL_EXPIRED"
  | "PROCESS_RESTART";

export interface TemporaryPayloadOperationBinding {
  readonly operationId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly packageId: string;
  readonly studyRefId: string;
  readonly sourceHospitalId: string;
}

export class TemporaryPayloadMetadataPersistenceError extends Error {
  constructor() {
    super("TEMPORARY_PAYLOAD_METADATA_UNAVAILABLE");
    this.name = "TemporaryPayloadMetadataPersistenceError";
  }
}

interface PayloadStateRow extends QueryResultRow {
  readonly temporary_payload_state: string | null;
  readonly temporary_storage_ref: string | null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validBinding(value: unknown): value is TemporaryPayloadOperationBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return (
    validUuid(binding.operationId) &&
    validUuid(binding.tenantId) &&
    validUuid(binding.exchangeSessionId) &&
    validUuid(binding.packageId) &&
    validUuid(binding.studyRefId) &&
    validUuid(binding.sourceHospitalId)
  );
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizedBinding(binding: TemporaryPayloadOperationBinding) {
  return {
    operationId: binding.operationId.toLowerCase(),
    tenantId: binding.tenantId.toLowerCase(),
    exchangeSessionId: binding.exchangeSessionId.toLowerCase(),
    packageId: binding.packageId.toLowerCase(),
    studyRefId: binding.studyRefId.toLowerCase(),
    sourceHospitalId: binding.sourceHospitalId.toLowerCase(),
  };
}

/**
 * Writes only the four DEC-008 StudyReference metadata columns. The caller
 * must provide a verified Tenant transaction; this repository is not an
 * authorization capability and never accepts a caller-derived resource graph.
 */
export class PostgresTemporaryPayloadMetadataRepository {
  constructor(private readonly transaction: Pick<PoolClient, "query">) {}

  async reserveStaging(input: {
    readonly binding: TemporaryPayloadOperationBinding;
    readonly storageRef: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    if (
      !input ||
      !validBinding(input.binding) ||
      !validUuid(input.storageRef) ||
      !validDate(input.expiresAt)
    ) {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
    const binding = normalizedBinding(input.binding);
    try {
      const result = await this.transaction.query(
        `UPDATE study_references AS sr
            SET temporary_storage_ref = $1::uuid,
                temporary_payload_state = 'STAGING',
                temporary_payload_expires_at = $2,
                temporary_payload_purged_at = NULL
          WHERE sr.study_ref_id = $3::uuid
            AND sr.package_id = $4::uuid
            AND sr.source_hospital_id = $8::uuid
            AND (sr.temporary_payload_state IS NULL
              OR sr.temporary_payload_state = 'PURGED')
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $5::uuid
            AND EXISTS (
              SELECT 1
                FROM pacs_transfer_operations AS op
                JOIN exchange_sessions AS e
                  ON e.session_id = op.exchange_session_id
                JOIN imaging_packages AS p
                  ON p.package_id = sr.package_id
                 AND p.exchange_session_id = e.session_id
                 AND p.patient_ref_id = e.patient_ref_id
                 AND p.source_hospital_id = e.source_hospital_id
               WHERE op.operation_id = $6::uuid
                 AND op.tenant_id = $5::uuid
                 AND op.exchange_session_id = $7::uuid
                 AND op.study_ref_id = sr.study_ref_id
                 AND op.state = 'CREATED'
                 AND e.session_id = $7::uuid
                 AND sr.source_hospital_id = e.source_hospital_id
            )`,
        [
          input.storageRef.toLowerCase(),
          input.expiresAt,
          binding.studyRefId,
          binding.packageId,
          binding.tenantId,
          binding.operationId,
          binding.exchangeSessionId,
          binding.sourceHospitalId,
        ],
      );
      if (result.rowCount !== 1) throw new Error("STAGING_RESERVATION_REJECTED");
    } catch {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
  }

  async markAvailable(input: {
    readonly binding: TemporaryPayloadOperationBinding;
    readonly storageRef: string;
    readonly now: Date;
  }): Promise<void> {
    if (
      !input ||
      !validBinding(input.binding) ||
      !validUuid(input.storageRef) ||
      !validDate(input.now)
    ) {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
    const binding = normalizedBinding(input.binding);
    try {
      const result = await this.transaction.query(
        `UPDATE study_references AS sr
            SET temporary_payload_state = 'AVAILABLE'
          WHERE sr.study_ref_id = $1::uuid
            AND sr.package_id = $2::uuid
            AND sr.source_hospital_id = $3::uuid
            AND sr.temporary_storage_ref = $4::uuid
            AND sr.temporary_payload_state = 'STAGING'
            AND sr.temporary_payload_expires_at > $5
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $6::uuid
            AND EXISTS (
              SELECT 1
                FROM pacs_transfer_operations AS op
                JOIN exchange_sessions AS e
                  ON e.session_id = op.exchange_session_id
                JOIN imaging_packages AS p
                  ON p.package_id = sr.package_id
                 AND p.exchange_session_id = e.session_id
                 AND p.patient_ref_id = e.patient_ref_id
                 AND p.source_hospital_id = e.source_hospital_id
               WHERE op.operation_id = $7::uuid
                 AND op.tenant_id = $6::uuid
                 AND op.exchange_session_id = $8::uuid
                 AND op.study_ref_id = sr.study_ref_id
                 AND op.state = 'CREATED'
                 AND e.session_id = $8::uuid
                 AND sr.source_hospital_id = e.source_hospital_id
            )`,
        [
          binding.studyRefId,
          binding.packageId,
          binding.sourceHospitalId,
          input.storageRef.toLowerCase(),
          input.now,
          binding.tenantId,
          binding.operationId,
          binding.exchangeSessionId,
        ],
      );
      if (result.rowCount !== 1) throw new Error("STAGING_ACTIVATION_REJECTED");
    } catch {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
  }

  async markPurgePending(input: {
    readonly binding: TemporaryPayloadOperationBinding;
    readonly storageRef: string;
  }): Promise<void> {
    if (!input || !validBinding(input.binding) || !validUuid(input.storageRef)) {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
    const binding = normalizedBinding(input.binding);
    try {
      const result = await this.transaction.query(
        `UPDATE study_references AS sr
            SET temporary_payload_state = CASE
                  WHEN sr.temporary_payload_state = 'PURGED' THEN 'PURGED'
                  ELSE 'PURGE_PENDING'
                END,
                temporary_payload_purged_at = CASE
                  WHEN sr.temporary_payload_state = 'PURGED'
                    THEN sr.temporary_payload_purged_at
                  ELSE NULL
                END
          WHERE sr.study_ref_id = $1::uuid
            AND sr.package_id = $2::uuid
            AND sr.source_hospital_id = $3::uuid
            AND sr.temporary_storage_ref = $4::uuid
            AND sr.temporary_payload_state IN ('STAGING', 'AVAILABLE', 'PURGE_PENDING', 'PURGED')
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $5::uuid
            AND EXISTS (
              SELECT 1
                FROM pacs_transfer_operations AS op
                JOIN exchange_sessions AS e
                  ON e.session_id = op.exchange_session_id
                JOIN imaging_packages AS p
                  ON p.package_id = sr.package_id
                 AND p.exchange_session_id = e.session_id
                 AND p.patient_ref_id = e.patient_ref_id
                 AND p.source_hospital_id = e.source_hospital_id
               WHERE op.operation_id = $6::uuid
                 AND op.tenant_id = $5::uuid
                 AND op.exchange_session_id = $7::uuid
                 AND op.study_ref_id = sr.study_ref_id
                 AND e.session_id = $7::uuid
                 AND sr.source_hospital_id = e.source_hospital_id
            )`,
        [
          binding.studyRefId,
          binding.packageId,
          binding.sourceHospitalId,
          input.storageRef.toLowerCase(),
          binding.tenantId,
          binding.operationId,
          binding.exchangeSessionId,
        ],
      );
      if (result.rowCount !== 1) throw new Error("PURGE_RESERVATION_REJECTED");
    } catch {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
  }

  async finalizePurgeAndAudit(input: {
    readonly binding: TemporaryPayloadOperationBinding;
    readonly storageRef: string;
    readonly actorId: string;
    readonly correlationId: string;
    readonly auditEventId: string;
    readonly reason: TemporaryPayloadPurgeReason;
    readonly now: Date;
  }): Promise<"PURGED" | "ALREADY_PURGED" | "NOT_ELIGIBLE"> {
    const allowedReasons = new Set<TemporaryPayloadPurgeReason>([
      "CAPTURE_FAILURE",
      "EXPLICIT_CLOSE",
      "TRANSFER_TERMINAL",
      "TTL_EXPIRED",
      "PROCESS_RESTART",
    ]);
    if (
      !input ||
      !validBinding(input.binding) ||
      !validUuid(input.storageRef) ||
      !validUuid(input.actorId) ||
      !validUuid(input.correlationId) ||
      !validUuid(input.auditEventId) ||
      !allowedReasons.has(input.reason) ||
      !validDate(input.now)
    ) {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
    const binding = normalizedBinding(input.binding);
    try {
      const updated = await this.transaction.query(
        `UPDATE study_references AS sr
            SET temporary_payload_state = 'PURGED',
                temporary_payload_purged_at = $5
          WHERE sr.study_ref_id = $1::uuid
            AND sr.package_id = $2::uuid
            AND sr.source_hospital_id = $3::uuid
            AND sr.temporary_storage_ref = $4::uuid
            AND sr.temporary_payload_state = 'PURGE_PENDING'
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $6::uuid
            AND EXISTS (
              SELECT 1
                FROM pacs_transfer_operations AS op
                JOIN exchange_sessions AS e
                  ON e.session_id = op.exchange_session_id
                JOIN imaging_packages AS p
                  ON p.package_id = sr.package_id
                 AND p.exchange_session_id = e.session_id
                 AND p.patient_ref_id = e.patient_ref_id
                 AND p.source_hospital_id = e.source_hospital_id
               WHERE op.operation_id = $7::uuid
                 AND op.tenant_id = $6::uuid
                 AND op.exchange_session_id = $8::uuid
                 AND op.study_ref_id = sr.study_ref_id
                 AND e.session_id = $8::uuid
                 AND sr.source_hospital_id = e.source_hospital_id
            )
          RETURNING sr.study_ref_id`,
        [
          binding.studyRefId,
          binding.packageId,
          binding.sourceHospitalId,
          input.storageRef.toLowerCase(),
          input.now,
          binding.tenantId,
          binding.operationId,
          binding.exchangeSessionId,
        ],
      );

      if (updated.rowCount === 1) {
        await this.transaction.query(
          "SELECT public.release_temporary_payload_quota($1::uuid, $2::uuid)",
          [binding.studyRefId, input.storageRef.toLowerCase()],
        );
        await new PostgresAuditEventWriter(this.transaction).record(
          AuditEvent.create({
            auditEventId: input.auditEventId.toLowerCase(),
            occurredAt: input.now,
            actorId: input.actorId.toLowerCase(),
            tenantId: binding.tenantId,
            exchangeSessionId: binding.exchangeSessionId,
            resourceType: "STUDY",
            resourceId: binding.studyRefId,
            action: "PACS_TEMPORARY_OBJECT_PURGED",
            result: "SUCCESS",
            reasonCode: input.reason,
            correlationId: input.correlationId.toLowerCase(),
            createdAt: input.now,
          }),
        );
        return "PURGED";
      }

      const current = await this.transaction.query<PayloadStateRow>(
        `SELECT sr.temporary_payload_state, sr.temporary_storage_ref::text
           FROM study_references AS sr
           JOIN imaging_packages AS p
             ON p.package_id = sr.package_id
           JOIN exchange_sessions AS e
             ON e.session_id = p.exchange_session_id
           JOIN pacs_transfer_operations AS op
             ON op.study_ref_id = sr.study_ref_id
            AND op.exchange_session_id = e.session_id
          WHERE sr.study_ref_id = $1::uuid
            AND sr.package_id = $2::uuid
            AND sr.source_hospital_id = $3::uuid
            AND sr.temporary_storage_ref = $4::uuid
            AND op.operation_id = $5::uuid
            AND op.tenant_id = $6::uuid
            AND op.exchange_session_id = $7::uuid
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $6::uuid`,
        [
          binding.studyRefId,
          binding.packageId,
          binding.sourceHospitalId,
          input.storageRef.toLowerCase(),
          binding.operationId,
          binding.tenantId,
          binding.exchangeSessionId,
        ],
      );
      if (
        current.rows.length === 1 &&
        current.rows[0]?.temporary_payload_state === "PURGED" &&
        current.rows[0]?.temporary_storage_ref?.toLowerCase() === input.storageRef.toLowerCase()
      ) {
        return "ALREADY_PURGED";
      }
      if (current.rows.length === 0) return "NOT_ELIGIBLE";
      throw new Error("PURGE_STATE_CONFLICT");
    } catch {
      throw new TemporaryPayloadMetadataPersistenceError();
    }
  }
}
