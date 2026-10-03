import type { PoolClient } from "pg";
import type { AuthorizedSourceCaptureCoordinatorHandoff } from "../application/authorized-source-capture.service.js";
import type { SourceCaptureScope } from "./postgres-source-capture-scope.repository.js";

/** Read-only gate inside the already authorized, Tenant-fenced transaction. */
export class PostgresDestinationVerificationGateRepository {
  constructor(private readonly transaction: Pick<PoolClient, "query">) {}

  async assertCurrent(input: Readonly<{
    scope: SourceCaptureScope;
    handoff: AuthorizedSourceCaptureCoordinatorHandoff;
    actorId: string;
    requestDigest: string;
    now: Date;
  }>): Promise<Date> {
    try {
      const { scope, handoff, actorId, requestDigest, now } = input;
      const temporary = handoff.temporaryPackage;
      if (!temporary) throw new Error("MISSING_CAPTURE");
      const expiresAt = new Date(temporary.expiresAt);
      const available = await this.transaction.query(
        `SELECT 1 AS capture_read_available
           FROM study_references AS sr
           JOIN integrity_evidence AS ie ON ie.study_ref_id = sr.study_ref_id
          WHERE sr.study_ref_id = $1::uuid AND sr.package_id = $2::uuid
            AND sr.source_hospital_id = $3::uuid AND sr.temporary_storage_ref = $4::uuid
            AND sr.temporary_payload_state = 'AVAILABLE' AND sr.temporary_payload_purged_at IS NULL
            AND sr.temporary_payload_expires_at = $5::timestamptz
            AND sr.temporary_payload_expires_at > $6::timestamptz
            AND ie.integrity_id = $7::uuid AND ie.operation_id = $8::uuid
            AND ie.exchange_session_id = $9::uuid AND ie.package_id = sr.package_id
            AND ie.verification_stage = 'SOURCE_CAPTURE' AND ie.status = 'PENDING'
            AND ie.verified_at IS NULL AND ie.algorithm = $10
            AND ie.source_digest = $11 AND ie.source_object_count = $12
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $13::uuid`,
        [scope.studyRefId, scope.packageId, scope.sourceHospitalId, temporary.storageRef,
          expiresAt, now, handoff.sourceEvidence.evidenceId, scope.operationId, scope.exchangeSessionId,
          handoff.sourceEvidence.algorithm, handoff.sourceEvidence.aggregateDigest,
          handoff.sourceEvidence.objectCount, scope.tenantId],
      );
      if (available.rowCount !== 1 || available.rows.length !== 1) throw new Error("SOURCE_CHANGED");
      const claim = await this.transaction.query<{ destination_verify_claimed_at: Date }>(
        `SELECT op.stow_started_at AS destination_verify_claimed_at
           FROM pacs_transfer_operations AS op
           JOIN provenance_records AS pr ON pr.operation_id = op.operation_id
          WHERE op.operation_id = $1::uuid AND op.tenant_id = $2::uuid AND op.actor_id = $3::uuid
            AND op.exchange_session_id = $4::uuid AND op.study_ref_id = $5::uuid
            AND op.request_digest = $6 AND op.state = 'VERIFYING' AND op.version = 3
            AND op.source_object_count = $7 AND op.destination_object_count IS NULL
            AND op.stow_started_at IS NOT NULL AND op.stow_started_at >= op.created_at
            AND op.stow_started_at <= op.updated_at AND op.updated_at <= $8::timestamptz
            AND op.stow_started_at < $9::timestamptz
            AND pr.exchange_session_id = op.exchange_session_id AND pr.package_id = $10::uuid
            AND pr.study_ref_id = op.study_ref_id AND pr.source_hospital_id = $11::uuid
            AND pr.destination_hospital_id = $12::uuid AND pr.transfer_type = 'PACS_IMPORT'
            AND pr.transfer_status = 'PENDING' AND pr.integrity_id IS NULL
            AND pr.ingested_at IS NULL AND pr.transferred_at IS NULL AND pr.created_at <= op.stow_started_at
            AND EXISTS (SELECT 1 FROM audit_events AS ae WHERE ae.resource_id = op.operation_id
              AND ae.resource_type = 'PACS_TRANSFER_OPERATION' AND ae.exchange_session_id = op.exchange_session_id
              AND ae.actor_id = op.actor_id AND ae.tenant_id = op.tenant_id
              AND ae.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED' AND ae.result = 'SUCCESS'
              AND ae.reason_code = 'PREFLIGHT_PASSED' AND ae.occurred_at <= op.stow_started_at)
            AND EXISTS (SELECT 1 FROM audit_events AS ae WHERE ae.resource_id = op.operation_id
              AND ae.resource_type = 'PACS_TRANSFER_OPERATION' AND ae.exchange_session_id = op.exchange_session_id
              AND ae.actor_id = op.actor_id AND ae.tenant_id = op.tenant_id
              AND ae.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED' AND ae.result = 'SUCCESS'
              AND ae.reason_code = 'STOW_STARTED' AND ae.occurred_at = op.stow_started_at)
            AND EXISTS (SELECT 1 FROM audit_events AS ae WHERE ae.resource_id = op.operation_id
              AND ae.resource_type = 'PACS_TRANSFER_OPERATION' AND ae.exchange_session_id = op.exchange_session_id
              AND ae.actor_id = op.actor_id AND ae.tenant_id = op.tenant_id
              AND ae.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED' AND ae.result = 'SUCCESS'
              AND ae.reason_code = 'VERIFYING' AND ae.occurred_at = op.updated_at)
            AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = op.tenant_id`,
        [scope.operationId, scope.tenantId, actorId, scope.exchangeSessionId, scope.studyRefId,
          requestDigest, handoff.sourceEvidence.objectCount, now, expiresAt, scope.packageId,
          scope.sourceHospitalId, scope.destinationHospitalId],
      );
      const timestamp = claim.rows[0]?.destination_verify_claimed_at;
      if (claim.rowCount !== 1 || claim.rows.length !== 1 || !(timestamp instanceof Date) ||
        !Number.isFinite(timestamp.getTime()) || timestamp > now || timestamp >= expiresAt) {
        throw new Error("VERIFY_GRAPH_CHANGED");
      }
      return new Date(timestamp);
    } catch {
      throw new Error("DESTINATION_VERIFICATION_GATE_UNAVAILABLE");
    }
  }
}
