import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ALGORITHM = "SHA256-MANIFEST-V1";
const MAX_PROOF_AGE_MS = 5 * 60 * 1000;

export class DestinationIntegrityEvidencePersistenceError extends Error {
  constructor() {
    super("DESTINATION_INTEGRITY_PERSISTENCE_UNAVAILABLE");
    this.name = "DestinationIntegrityEvidencePersistenceError";
  }
}

interface InsertedDestinationEvidence extends QueryResultRow {
  integrity_id: string;
  operation_id: string;
  exchange_session_id: string;
  package_id: string;
  study_ref_id: string;
  verification_stage: string;
  algorithm: string;
  source_digest: string;
  destination_digest: string;
  source_object_count: number;
  destination_object_count: number;
  status: string;
  verified_at: Date;
  created_at: Date;
}

interface LinkedProvenance extends QueryResultRow {
  provenance_id: string;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Persists only the source owner's already-authorized destination comparison.
 * It neither authorizes the caller nor completes the PACS operation. The
 * caller must hold the verified Tenant transaction and Session fence.
 */
export class PostgresDestinationIntegrityEvidenceRepository {
  constructor(
    private readonly transaction: Pick<PoolClient, "query">,
    private readonly createId: () => string = randomUUID,
  ) {}

  async appendVerifiedAndLinkPendingProvenance(input: Readonly<{
    operationId: string;
    tenantId: string;
    actorId: string;
    exchangeSessionId: string;
    packageId: string;
    studyRefId: string;
    sourceEvidenceId: string;
    algorithm: string;
    aggregateDigest: string;
    objectCount: number;
    comparedAt: Date;
    now: Date;
  }>): Promise<Readonly<{ integrityId: string; provenanceId: string }>> {
    if (
      !input ||
      !validUuid(input.operationId) ||
      !validUuid(input.tenantId) ||
      !validUuid(input.actorId) ||
      !validUuid(input.exchangeSessionId) ||
      !validUuid(input.packageId) ||
      !validUuid(input.studyRefId) ||
      !validUuid(input.sourceEvidenceId) ||
      input.algorithm !== ALGORITHM ||
      !DIGEST_PATTERN.test(input.aggregateDigest) ||
      !Number.isSafeInteger(input.objectCount) ||
      input.objectCount < 1 ||
      !validDate(input.comparedAt) ||
      !validDate(input.now) ||
      input.comparedAt.getTime() > input.now.getTime() ||
      input.now.getTime() - input.comparedAt.getTime() > MAX_PROOF_AGE_MS
    ) {
      throw new DestinationIntegrityEvidencePersistenceError();
    }

    const integrityId = this.createId();
    if (!validUuid(integrityId)) throw new DestinationIntegrityEvidencePersistenceError();

    try {
      const inserted = await this.transaction.query<InsertedDestinationEvidence>(
        `INSERT INTO integrity_evidence
          (integrity_id, operation_id, exchange_session_id, package_id,
           study_ref_id, verification_stage, algorithm, source_digest,
           destination_digest, source_object_count, destination_object_count,
           status, verified_at, created_at)
         SELECT $1::uuid, op.operation_id, es.session_id, p.package_id,
                sr.study_ref_id, 'DESTINATION_VERIFY', src.algorithm,
                src.source_digest, $10::varchar(256), src.source_object_count, $11::integer,
                'VERIFIED', $12::timestamptz, $13::timestamptz
           FROM pacs_transfer_operations AS op
           JOIN exchange_sessions AS es
             ON es.session_id = op.exchange_session_id
           JOIN study_references AS sr
             ON sr.study_ref_id = op.study_ref_id
            AND sr.source_hospital_id = es.source_hospital_id
           JOIN imaging_packages AS p
             ON p.package_id = sr.package_id
            AND p.exchange_session_id = es.session_id
            AND p.source_hospital_id = es.source_hospital_id
           JOIN integrity_evidence AS src
             ON src.integrity_id = $8::uuid
            AND src.operation_id = op.operation_id
            AND src.exchange_session_id = es.session_id
            AND src.package_id = p.package_id
            AND src.study_ref_id = sr.study_ref_id
            AND src.verification_stage = 'SOURCE_CAPTURE'
            AND src.status = 'PENDING'
            AND src.verified_at IS NULL
           JOIN provenance_records AS pr
             ON pr.operation_id = op.operation_id
            AND pr.exchange_session_id = es.session_id
            AND pr.package_id = p.package_id
            AND pr.study_ref_id = sr.study_ref_id
            AND pr.source_hospital_id = es.source_hospital_id
            AND pr.destination_hospital_id = es.destination_hospital_id
            AND pr.transfer_type = 'PACS_IMPORT'
            AND pr.transfer_status = 'PENDING'
            AND pr.integrity_id IS NULL
            AND pr.ingested_at IS NULL
            AND pr.transferred_at IS NULL
          WHERE op.operation_id = $2::uuid
            AND op.tenant_id = $3::uuid
            AND op.actor_id = $4::uuid
            AND op.exchange_session_id = $5::uuid
            AND op.study_ref_id = $7::uuid
            AND op.state = 'VERIFYING'
            AND op.version = 3
            AND op.source_object_count = $11
            AND op.destination_object_count IS NULL
            AND op.stow_started_at IS NOT NULL
            AND op.stow_started_at >= op.created_at
            AND op.stow_started_at <= op.updated_at
            AND src.algorithm = $9::varchar(32)
            AND src.source_digest = $10::varchar(256)
            AND src.source_object_count = $11::integer
            AND sr.package_id = $6::uuid
            AND sr.temporary_payload_state = 'PURGED'
            AND sr.temporary_storage_ref IS NOT NULL
            AND sr.temporary_payload_purged_at IS NOT NULL
            AND sr.temporary_payload_expires_at > $13::timestamptz
            AND $12::timestamptz >= op.stow_started_at
            AND $12::timestamptz < sr.temporary_payload_expires_at
            AND $12::timestamptz <= $13::timestamptz
            AND $13::timestamptz <= $12::timestamptz + interval '5 minutes'
            AND $13::timestamptz <= op.updated_at + interval '5 minutes'
            AND $13::timestamptz <= sr.temporary_payload_purged_at + interval '5 minutes'
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = op.tenant_id
            AND EXISTS (
              SELECT 1 FROM audit_events AS purge_audit
               WHERE purge_audit.tenant_id = op.tenant_id
                 AND purge_audit.exchange_session_id = es.session_id
                 AND purge_audit.resource_type = 'STUDY'
                 AND purge_audit.resource_id = sr.study_ref_id
                 AND purge_audit.action = 'PACS_TEMPORARY_OBJECT_PURGED'
                 AND purge_audit.result = 'SUCCESS'
                 AND purge_audit.occurred_at = sr.temporary_payload_purged_at
            )
            AND EXISTS (
              SELECT 1 FROM audit_events AS verify_audit
               WHERE verify_audit.tenant_id = op.tenant_id
                 AND verify_audit.actor_id = op.actor_id
                 AND verify_audit.exchange_session_id = es.session_id
                 AND verify_audit.resource_type = 'STUDY'
                 AND verify_audit.resource_id = sr.study_ref_id
                 AND verify_audit.action = 'PACS_DESTINATION_VERIFY_AUTHORIZED'
                 AND verify_audit.result = 'ALLOW'
                 AND verify_audit.reason_code = 'FINAL'
                 AND verify_audit.occurred_at >= op.stow_started_at
                 AND verify_audit.occurred_at <= $12::timestamptz
            )
            AND EXISTS (
              SELECT 1 FROM audit_events AS preflight_audit
               WHERE preflight_audit.tenant_id = op.tenant_id
                 AND preflight_audit.actor_id = op.actor_id
                 AND preflight_audit.exchange_session_id = es.session_id
                 AND preflight_audit.resource_type = 'PACS_TRANSFER_OPERATION'
                 AND preflight_audit.resource_id = op.operation_id
                 AND preflight_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
                 AND preflight_audit.result = 'SUCCESS'
                 AND preflight_audit.reason_code = 'PREFLIGHT_PASSED'
                 AND preflight_audit.occurred_at <= op.stow_started_at
            )
            AND EXISTS (
              SELECT 1 FROM audit_events AS dispatch_audit
               WHERE dispatch_audit.tenant_id = op.tenant_id
                 AND dispatch_audit.actor_id = op.actor_id
                 AND dispatch_audit.exchange_session_id = es.session_id
                 AND dispatch_audit.resource_type = 'PACS_TRANSFER_OPERATION'
                 AND dispatch_audit.resource_id = op.operation_id
                 AND dispatch_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
                 AND dispatch_audit.result = 'SUCCESS'
                 AND dispatch_audit.reason_code = 'STOW_STARTED'
                 AND dispatch_audit.occurred_at = op.stow_started_at
            )
            AND EXISTS (
              SELECT 1 FROM audit_events AS verifying_audit
               WHERE verifying_audit.tenant_id = op.tenant_id
                 AND verifying_audit.actor_id = op.actor_id
                 AND verifying_audit.exchange_session_id = es.session_id
                 AND verifying_audit.resource_type = 'PACS_TRANSFER_OPERATION'
                 AND verifying_audit.resource_id = op.operation_id
                 AND verifying_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
                 AND verifying_audit.result = 'SUCCESS'
                 AND verifying_audit.reason_code = 'VERIFYING'
                 AND verifying_audit.occurred_at = op.updated_at
            )
         ON CONFLICT (operation_id, verification_stage)
           WHERE operation_id IS NOT NULL DO NOTHING
         RETURNING integrity_id, operation_id, exchange_session_id, package_id,
           study_ref_id, verification_stage, algorithm, source_digest,
           destination_digest, source_object_count, destination_object_count,
           status, verified_at, created_at`,
        [
          integrityId,
          input.operationId.toLowerCase(),
          input.tenantId.toLowerCase(),
          input.actorId.toLowerCase(),
          input.exchangeSessionId.toLowerCase(),
          input.packageId.toLowerCase(),
          input.studyRefId.toLowerCase(),
          input.sourceEvidenceId.toLowerCase(),
          input.algorithm,
          input.aggregateDigest,
          input.objectCount,
          new Date(input.comparedAt.getTime()),
          new Date(input.now.getTime()),
        ],
      );
      const row = inserted.rows[0];
      if (inserted.rowCount !== 1 || !row ||
        row.integrity_id !== integrityId || row.operation_id !== input.operationId.toLowerCase() ||
        row.exchange_session_id !== input.exchangeSessionId.toLowerCase() ||
        row.package_id !== input.packageId.toLowerCase() || row.study_ref_id !== input.studyRefId.toLowerCase() ||
        row.verification_stage !== "DESTINATION_VERIFY" || row.algorithm !== ALGORITHM ||
        row.source_digest !== input.aggregateDigest || row.destination_digest !== input.aggregateDigest ||
        row.source_object_count !== input.objectCount || row.destination_object_count !== input.objectCount ||
        row.status !== "VERIFIED" || !validDate(row.verified_at) || !validDate(row.created_at) ||
        row.verified_at.getTime() !== input.comparedAt.getTime() || row.created_at.getTime() !== input.now.getTime()) {
        throw new DestinationIntegrityEvidencePersistenceError();
      }

      const linked = await this.transaction.query<LinkedProvenance>(
        `UPDATE provenance_records AS pr
            SET integrity_id = $1::uuid
           FROM exchange_sessions AS es
          WHERE pr.operation_id = $2::uuid
            AND pr.exchange_session_id = $3::uuid
            AND pr.package_id = $4::uuid
            AND pr.study_ref_id = $5::uuid
            AND pr.source_hospital_id = es.source_hospital_id
            AND pr.destination_hospital_id = es.destination_hospital_id
            AND es.session_id = $3::uuid
            AND es.session_id = pr.exchange_session_id
            AND pr.transfer_type = 'PACS_IMPORT'
            AND pr.transfer_status = 'PENDING'
            AND pr.integrity_id IS NULL
            AND pr.ingested_at IS NULL
            AND pr.transferred_at IS NULL
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $6::uuid
            AND es.patient_ref_id IS NOT NULL
         RETURNING pr.provenance_id`,
        [integrityId, input.operationId.toLowerCase(), input.exchangeSessionId.toLowerCase(),
          input.packageId.toLowerCase(), input.studyRefId.toLowerCase(), input.tenantId.toLowerCase()],
      );
      const provenanceId = linked.rows[0]?.provenance_id;
      if (linked.rowCount !== 1 || linked.rows.length !== 1 || !validUuid(provenanceId)) {
        throw new DestinationIntegrityEvidencePersistenceError();
      }
      return Object.freeze({ integrityId, provenanceId });
    } catch {
      throw new DestinationIntegrityEvidencePersistenceError();
    }
  }
}
