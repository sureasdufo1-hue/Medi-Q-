import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { AuditEvent } from "../../services/api/dist/audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../services/api/dist/audit/persistence/postgres-audit-event-writer.js";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import {
  PacsTransferTerminalizationConflictError,
  PacsTransferTerminalizationUnavailableError,
  PostgresPacsTransferTerminalizationRepository,
} from "../../services/api/dist/pacs/persistence/pacs-transfer-terminalization.repository.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import { PostgresDestinationIntegrityEvidenceRepository } from "../../services/api/dist/integrity/persistence/postgres-destination-integrity-evidence.repository.js";
import { PostgresProvenanceRepository } from "../../services/api/dist/provenance/persistence/postgres-provenance.repository.js";
import { PostgresSourceIntegrityEvidenceRepository } from "../../services/api/dist/integrity/persistence/postgres-source-integrity-evidence.repository.js";
import { PostgresTemporaryPayloadMetadataRepository } from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";
import { acquireExchangeSessionFence } from "../../services/api/dist/exchange/persistence/exchange-session-fence.js";

function fixture() {
  const raw = process.env.MEDIQ_PACS_TERMINALIZATION_TEST_FIXTURE;
  assert.ok(raw, "TERM020_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = [
    "tenantId", "otherTenantId", "actorId", "sessionId", "studyRefId",
    "consentId", "grantId", "hospitalId", "sourceHospitalId", "packageId",
    "fenceSessionId", "fencePackageId", "fenceStudyRefId", "fenceSiblingStudyRefId",
    "fenceConsentId", "fenceGrantId", "boundarySessionId", "boundaryPackageId",
    "boundaryStudyRefId", "boundarySiblingStudyRefId", "boundaryConsentId", "boundaryGrantId",
  ];
  assert.ok(required.every((key) => typeof value[key] === "string"), "TERM020_FIXTURE_INVALID");
  return value;
}

async function beginTenant(client, tenantId) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
}

function terminalizationQueryDiagnosticClient(client, setStage, stagePrefix, beforeQuery = undefined) {
  let firstSafeFailureReported = false;
  const safeConstraints = new Map([
    ["provenance_records_terminalization_guard", "PROVENANCE_TERMINALIZATION_GUARD"],
    ["pacs_transfer_operation_completion_guard", "OPERATION_COMPLETION_GUARD"],
    ["exchange_sessions_terminal_completion_guard", "SESSION_COMPLETION_GUARD"],
    ["audit_events_terminal_correlation_guard", "AUDIT_CORRELATION_GUARD"],
  ]);
  const queryCategory = (input) => {
    const sql = typeof input === "string" ? input : input?.text ?? "";
    if (/pg_advisory_xact_lock/i.test(sql)) return "SESSION_FENCE";
    if (/^\s*(?:SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(sql)) return "SAVEPOINT";
    if (/^\s*INSERT\s+INTO\s+audit_events/i.test(sql)) return "AUDIT_INSERT";
    if (/^\s*UPDATE\s+provenance_records/i.test(sql)) return "PROVENANCE_UPDATE";
    if (/^\s*UPDATE\s+pacs_transfer_operations/i.test(sql)) return "OPERATION_UPDATE";
    if (/^\s*UPDATE\s+exchange_sessions/i.test(sql)) return "SESSION_UPDATE";
    if (/\b(?:consents|consent_actions|transfer_grants|transfer_grant_scopes)\b/i.test(sql)) {
      return "AUTHORIZATION_SELECT";
    }
    if (/\bFROM\s+pacs_transfer_operations\b/i.test(sql) && /\bFOR\s+UPDATE\b/i.test(sql)) {
      return "TERMINAL_BINDING_SELECT";
    }
    if (/\bFROM\s+pacs_transfer_operations\b/i.test(sql)) return "OPERATION_SELECT";
    if (/clock_timestamp/i.test(sql)) return "DATABASE_CLOCK";
    return "OTHER_QUERY";
  };
  return Object.freeze({
    query: async (...args) => {
      const category = queryCategory(args[0]);
      setStage(`${stagePrefix}_SQL_${category}`);
      try {
        if (typeof beforeQuery === "function") await beforeQuery(category, args);
        return await client.query(...args);
      } catch (error) {
        const code = typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
          ? error.code
          : "UNKNOWN";
        const constraint = typeof error?.constraint === "string"
          ? safeConstraints.get(error.constraint)
          : undefined;
        setStage(`${stagePrefix}_SQL_${category}_ERROR_${code}${constraint ? `_${constraint}` : ""}`);
        if (!firstSafeFailureReported) {
          firstSafeFailureReported = true;
          console.error(`${stagePrefix}_INNER_SQL_FAILURE=${category}:${code}${constraint ? `:${constraint}` : ""}`);
        }
        throw error;
      }
    },
  });
}

async function terminalizationScopeFingerprint(inspector, operationId, sessionId, correlationId) {
  const result = await inspector.query(`
    SELECT
      (SELECT md5(COALESCE(string_agg(operation_id::text || ':' || xmin::text, ',' ORDER BY operation_id), ''))
         FROM pacs_transfer_operations WHERE operation_id <> $1) AS other_operations,
      (SELECT md5(COALESCE(string_agg(provenance_id::text || ':' || xmin::text, ',' ORDER BY provenance_id), ''))
         FROM provenance_records WHERE operation_id <> $1) AS other_provenance,
      (SELECT md5(COALESCE(string_agg(session_id::text || ':' || xmin::text, ',' ORDER BY session_id), ''))
         FROM exchange_sessions WHERE session_id <> $2) AS other_sessions,
      (SELECT md5(COALESCE(string_agg(study_ref_id::text || ':' || xmin::text, ',' ORDER BY study_ref_id), ''))
         FROM study_references) AS study_rows,
      (SELECT md5(COALESCE(string_agg(integrity_id::text || ':' || xmin::text, ',' ORDER BY integrity_id), ''))
         FROM integrity_evidence) AS integrity_rows,
      (SELECT md5(COALESCE(string_agg(audit_event_id::text || ':' || xmin::text, ',' ORDER BY audit_event_id), ''))
         FROM audit_events WHERE correlation_id <> $3) AS unrelated_audit_rows`,
  [operationId, sessionId, correlationId]);
  assert.equal(result.rowCount, 1, "TERM031_SCOPE_FINGERPRINT_UNAVAILABLE");
  return result.rows[0];
}

async function terminalizationTargetSnapshot(inspector, operationId, correlationId) {
  const result = await inspector.query(`
    SELECT operation.state, operation.version, operation.reason_code,
           operation.source_object_count, operation.destination_object_count,
           operation.updated_at, operation.xmin::text AS operation_xmin,
           provenance.transfer_status, provenance.ingested_at, provenance.transferred_at,
           provenance.integrity_id, provenance.xmin::text AS provenance_xmin,
           session.state AS session_state, session.completed_at,
           session.xmin::text AS session_xmin,
           (SELECT count(*)::int FROM audit_events audit
             WHERE audit.tenant_id=operation.tenant_id
               AND audit.exchange_session_id=operation.exchange_session_id
               AND audit.correlation_id=$2
               AND audit.action IN ('PACS_TRANSFER_COMPLETED','INTEGRITY_VERIFIED',
                 'PACS_TRANSFER_OPERATION_STATE_CHANGED','SESSION_COMPLETED')) AS terminal_audit_count
      FROM pacs_transfer_operations operation
      JOIN provenance_records provenance ON provenance.operation_id=operation.operation_id
      JOIN exchange_sessions session ON session.session_id=operation.exchange_session_id
     WHERE operation.operation_id=$1`,
  [operationId, correlationId]);
  assert.equal(result.rowCount, 1, "TERM032_TARGET_SNAPSHOT_MISSING");
  return result.rows[0];
}

async function terminalizationFactsCategoryDiagnostics(client, operationId, completedAt, correlationId) {
  const result = await client.query(`
    SELECT
      (NULLIF(current_setting('mediq.tenant_id', true), '') IS NOT NULL
       AND $1::uuid IS NOT NULL AND $2::timestamptz IS NOT NULL AND $3::uuid IS NOT NULL
       AND $3::text = lower(NULLIF(current_setting('mediq.terminal_correlation_id', true), '')))
        AS runtime_context,
      EXISTS (
        SELECT 1 FROM public.pacs_transfer_operations op
        JOIN public.exchange_sessions es ON es.session_id=op.exchange_session_id
        JOIN public.imaging_packages package ON package.exchange_session_id=es.session_id
          AND package.patient_ref_id=es.patient_ref_id
          AND package.source_hospital_id=es.source_hospital_id
        JOIN public.study_references study ON study.study_ref_id=op.study_ref_id
          AND study.package_id=package.package_id AND study.source_hospital_id=es.source_hospital_id
        JOIN public.provenance_records provenance ON provenance.operation_id=op.operation_id
          AND provenance.exchange_session_id=es.session_id AND provenance.package_id=package.package_id
          AND provenance.study_ref_id=study.study_ref_id
        JOIN public.integrity_evidence destination_evidence ON destination_evidence.integrity_id=provenance.integrity_id
          AND destination_evidence.operation_id=op.operation_id
          AND destination_evidence.verification_stage='DESTINATION_VERIFY'
        JOIN public.integrity_evidence source_evidence ON source_evidence.operation_id=op.operation_id
          AND source_evidence.verification_stage='SOURCE_CAPTURE'
        WHERE op.operation_id=$1
          AND op.tenant_id=NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
          AND op.state IN ('VERIFYING','COMPLETED')
          AND op.source_object_count>0
          AND package.state IN ('AVAILABLE','IN_EXCHANGE') AND package.deleted_at IS NULL
          AND study.temporary_payload_state='PURGED' AND study.temporary_payload_purged_at IS NOT NULL
          AND destination_evidence.status='VERIFIED' AND destination_evidence.verified_at IS NOT NULL
          AND destination_evidence.destination_digest=destination_evidence.source_digest
          AND destination_evidence.destination_object_count=destination_evidence.source_object_count
          AND source_evidence.status='PENDING' AND source_evidence.verified_at IS NULL
          AND source_evidence.source_digest=destination_evidence.source_digest
          AND source_evidence.source_object_count=destination_evidence.source_object_count
          AND provenance.transfer_status IN ('PENDING','COMPLETED')
          AND es.state IN ('ACTIVE','COMPLETED')) AS resource_integrity_and_lifecycle,
      EXISTS (
        SELECT 1 FROM public.pacs_transfer_operations op
        JOIN public.exchange_sessions es ON es.session_id=op.exchange_session_id
        JOIN public.imaging_packages package ON package.exchange_session_id=es.session_id
        JOIN public.consents consent ON consent.exchange_session_id=es.session_id
          AND consent.patient_ref_id=es.patient_ref_id
          AND consent.source_hospital_id=es.source_hospital_id
          AND consent.destination_hospital_id=es.destination_hospital_id
          AND consent.status='ACTIVE' AND consent.withdrawn_at IS NULL
        JOIN public.consent_actions ca ON ca.consent_id=consent.consent_id AND ca.action='PACS_IMPORT'
        JOIN public.transfer_grants grant_record ON grant_record.exchange_session_id=es.session_id
          AND grant_record.consent_id=consent.consent_id
          AND grant_record.recipient_tenant_id=op.tenant_id
          AND grant_record.recipient_hospital_id=es.destination_hospital_id
          AND grant_record.imaging_package_id=package.package_id
          AND grant_record.status='ACTIVE' AND grant_record.revoked_at IS NULL
          AND grant_record.issued_at<=$2 AND grant_record.expires_at>$2
        JOIN public.transfer_grant_scopes scope ON scope.grant_id=grant_record.grant_id
          AND scope.scope='study:pacs-transfer'
        WHERE op.operation_id=$1
          AND (consent.imaging_package_id IS NULL OR consent.imaging_package_id=package.package_id)
          AND consent.issued_at<=$2 AND (consent.expires_at IS NULL OR consent.expires_at>$2)
          AND (grant_record.recipient_actor_id IS NULL OR grant_record.recipient_actor_id=op.actor_id)
          AND NOT EXISTS (SELECT 1 FROM public.consent_actions other_action
            WHERE other_action.consent_id=consent.consent_id
              AND other_action.action NOT IN ('VIEW','DOWNLOAD','PACS_IMPORT'))
          AND NOT EXISTS (SELECT 1 FROM public.transfer_grant_scopes other_scope
            WHERE other_scope.grant_id=grant_record.grant_id
              AND other_scope.scope NOT IN ('study:view','study:download','study:pacs-transfer')))
        AS consent_and_grant_scope,
      EXISTS (
        SELECT 1 FROM public.pacs_transfer_operations op
        JOIN public.exchange_sessions es ON es.session_id=op.exchange_session_id
        JOIN public.study_references study ON study.study_ref_id=op.study_ref_id
        WHERE op.operation_id=$1
          AND EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.exchange_session_id=es.session_id AND a.resource_type='STUDY'
            AND a.resource_id=study.study_ref_id AND a.action='PACS_TEMPORARY_OBJECT_PURGED'
            AND a.result='SUCCESS' AND a.occurred_at=study.temporary_payload_purged_at)
          AND EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=op.operation_id
            AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
            AND a.reason_code='PREFLIGHT_PASSED')
          AND EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=op.operation_id
            AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
            AND a.reason_code='STOW_STARTED' AND a.occurred_at=op.stow_started_at)
          AND EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=op.operation_id
            AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
            AND a.reason_code='VERIFYING')
          AND EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='STUDY' AND a.resource_id=study.study_ref_id
            AND a.action='PACS_DESTINATION_VERIFY_AUTHORIZED' AND a.result='ALLOW'
            AND a.reason_code='FINAL')) AS prerequisite_audits,
      EXISTS (
        SELECT 1 FROM public.pacs_transfer_operations op
        JOIN public.exchange_sessions es ON es.session_id=op.exchange_session_id
        JOIN public.study_references study ON study.study_ref_id=op.study_ref_id
        WHERE op.operation_id=$1
          AND (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='STUDY' AND a.resource_id=study.study_ref_id
            AND a.action='PACS_TRANSFER_COMPLETED' AND a.result='SUCCESS'
            AND a.reason_code IS NULL AND a.occurred_at=$2)=1
          AND (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='STUDY' AND a.resource_id=study.study_ref_id
            AND a.action='INTEGRITY_VERIFIED' AND a.result='SUCCESS'
            AND a.reason_code IS NULL AND a.occurred_at=$2)=1
          AND (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=op.tenant_id
            AND a.actor_id=op.actor_id AND a.exchange_session_id=es.session_id
            AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=op.operation_id
            AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
            AND a.reason_code='COMPLETED' AND a.occurred_at=$2)=1) AS terminal_audits;
  `, [operationId, completedAt, correlationId]);
  const row = result.rows[0];
  return Object.freeze({
    runtime_context: row?.runtime_context === true,
    resource_integrity_and_lifecycle: row?.resource_integrity_and_lifecycle === true,
    consent_and_grant_scope: row?.consent_and_grant_scope === true,
    prerequisite_audits: row?.prerequisite_audits === true,
    terminal_audits: row?.terminal_audits === true,
  });
}

async function terminalizationFactsExactCategoryDiagnostics(client, operationId, completedAt, correlationId) {
  const result = await client.query(`
    WITH candidate AS (
      SELECT op.operation_id, op.tenant_id, op.actor_id, op.exchange_session_id, op.study_ref_id,
             op.state AS op_state, op.version AS op_version, op.source_object_count,
             op.destination_object_count, op.created_at AS op_created_at,
             op.updated_at AS op_updated_at, op.stow_started_at,
             es.patient_ref_id, es.source_hospital_id, es.destination_hospital_id,
             es.state AS session_state, es.completed_at AS session_completed_at, es.expires_at,
             actor.status AS actor_status, destination.status AS destination_status,
             tenant.status AS tenant_status,
             package.package_id, package.state AS package_state, package.deleted_at,
             package.retention_expires_at,
             study.temporary_payload_state, study.temporary_storage_ref,
             study.temporary_payload_purged_at,
             provenance.transfer_type, provenance.transfer_status,
             provenance.ingested_at, provenance.transferred_at,
             provenance.integrity_id AS provenance_integrity_id,
             dst.integrity_id AS dst_integrity_id, dst.status AS dst_status,
             dst.algorithm AS dst_algorithm, dst.source_digest AS dst_source_digest,
             dst.destination_digest AS dst_destination_digest,
             dst.source_object_count AS dst_source_count,
             dst.destination_object_count AS dst_destination_count,
             dst.verified_at AS dst_verified_at, dst.created_at AS dst_created_at,
             src.integrity_id AS src_integrity_id, src.status AS src_status,
             src.verified_at AS src_verified_at, src.algorithm AS src_algorithm,
             src.source_digest AS src_digest, src.source_object_count AS src_count
        FROM public.pacs_transfer_operations op
        JOIN public.exchange_sessions es ON es.session_id=op.exchange_session_id
        JOIN public.actors actor ON actor.actor_id=op.actor_id
          AND actor.tenant_id=op.tenant_id AND actor.hospital_id=es.destination_hospital_id
        JOIN public.hospitals destination ON destination.hospital_id=es.destination_hospital_id
          AND destination.tenant_id=op.tenant_id
        JOIN public.tenants tenant ON tenant.tenant_id=op.tenant_id
        JOIN public.imaging_packages package ON package.exchange_session_id=es.session_id
          AND package.patient_ref_id=es.patient_ref_id
          AND package.source_hospital_id=es.source_hospital_id
        JOIN public.study_references study ON study.study_ref_id=op.study_ref_id
          AND study.package_id=package.package_id AND study.source_hospital_id=es.source_hospital_id
        JOIN public.provenance_records provenance ON provenance.operation_id=op.operation_id
          AND provenance.exchange_session_id=es.session_id AND provenance.package_id=package.package_id
          AND provenance.study_ref_id=study.study_ref_id
          AND provenance.source_hospital_id=es.source_hospital_id
          AND provenance.destination_hospital_id=es.destination_hospital_id
        JOIN public.integrity_evidence dst ON dst.integrity_id=provenance.integrity_id
          AND dst.operation_id=op.operation_id AND dst.exchange_session_id=es.session_id
          AND dst.package_id=package.package_id AND dst.study_ref_id=study.study_ref_id
          AND dst.verification_stage='DESTINATION_VERIFY'
        JOIN public.integrity_evidence src ON src.operation_id=op.operation_id
          AND src.exchange_session_id=es.session_id AND src.package_id=package.package_id
          AND src.study_ref_id=study.study_ref_id AND src.verification_stage='SOURCE_CAPTURE'
       WHERE op.operation_id=$1
         AND op.tenant_id=NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
         AND op.actor_id=actor.actor_id
    )
    SELECT
      (NULLIF(current_setting('mediq.tenant_id', true), '') IS NOT NULL
       AND $1::uuid IS NOT NULL AND $2::timestamptz IS NOT NULL AND $3::uuid IS NOT NULL
       AND $3::text=lower(NULLIF(current_setting('mediq.terminal_correlation_id', true), '')))
        AS runtime_context,
      EXISTS (SELECT 1 FROM candidate c WHERE c.actor_status='ACTIVE'
        AND c.destination_status='ACTIVE' AND c.tenant_status='ACTIVE'
        AND c.package_state IN ('AVAILABLE','IN_EXCHANGE') AND c.deleted_at IS NULL
        AND (c.retention_expires_at IS NULL OR c.retention_expires_at>$2)
        AND c.temporary_payload_state='PURGED' AND c.temporary_storage_ref IS NOT NULL
        AND c.temporary_payload_purged_at IS NOT NULL) AS resource_lifecycle,
      EXISTS (SELECT 1 FROM candidate c WHERE c.op_state IN ('VERIFYING','COMPLETED')
        AND ((c.op_state='VERIFYING' AND c.op_version=3 AND c.destination_object_count IS NULL)
          OR (c.op_state='COMPLETED' AND c.op_version=4
            AND c.destination_object_count=c.source_object_count))
        AND c.source_object_count>0 AND c.source_object_count=c.src_count
        AND c.stow_started_at IS NOT NULL AND c.stow_started_at>=c.op_created_at
        AND c.stow_started_at<=c.op_updated_at AND c.op_updated_at<=$2
        AND c.session_state IN ('ACTIVE','COMPLETED')
        AND ((c.session_state='ACTIVE' AND c.session_completed_at IS NULL)
          OR (c.session_state='COMPLETED' AND c.session_completed_at=$2))
        AND (c.expires_at IS NULL OR c.expires_at>$2)
        AND $2>=c.dst_created_at) AS operation_session_timing,
      EXISTS (SELECT 1 FROM candidate c WHERE c.transfer_type='PACS_IMPORT'
        AND c.provenance_integrity_id IS NOT NULL
        AND ((c.transfer_status='PENDING' AND c.ingested_at IS NULL AND c.transferred_at IS NULL)
          OR (c.transfer_status='COMPLETED' AND c.ingested_at=$2 AND c.transferred_at=$2))
        AND c.dst_status='VERIFIED' AND c.dst_algorithm='SHA256-MANIFEST-V1'
        AND c.dst_source_digest IS NOT NULL AND c.dst_destination_digest=c.dst_source_digest
        AND c.dst_destination_count=c.dst_source_count AND c.dst_verified_at IS NOT NULL
        AND c.dst_created_at>=c.dst_verified_at
        AND c.src_status='PENDING' AND c.src_verified_at IS NULL
        AND c.src_integrity_id<>c.dst_integrity_id
        AND c.src_algorithm=c.dst_algorithm AND c.src_digest=c.dst_source_digest
        AND c.src_count=c.dst_source_count) AS provenance_and_integrity,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.consents consent
        JOIN public.consent_actions consent_action ON consent_action.consent_id=consent.consent_id
          AND consent_action.action='PACS_IMPORT'
        JOIN public.transfer_grants grant_record ON grant_record.exchange_session_id=c.exchange_session_id
          AND grant_record.consent_id=consent.consent_id
          AND grant_record.recipient_tenant_id=c.tenant_id
          AND grant_record.recipient_hospital_id=c.destination_hospital_id
          AND (grant_record.recipient_actor_id IS NULL OR grant_record.recipient_actor_id=c.actor_id)
          AND grant_record.imaging_package_id=c.package_id
          AND grant_record.status='ACTIVE' AND grant_record.revoked_at IS NULL
          AND grant_record.issued_at<=$2 AND grant_record.expires_at>$2
        JOIN public.transfer_grant_scopes grant_scope ON grant_scope.grant_id=grant_record.grant_id
          AND grant_scope.scope='study:pacs-transfer'
        WHERE consent.exchange_session_id=c.exchange_session_id
          AND consent.patient_ref_id=c.patient_ref_id
          AND consent.source_hospital_id=c.source_hospital_id
          AND consent.destination_hospital_id=c.destination_hospital_id
          AND (consent.imaging_package_id IS NULL OR consent.imaging_package_id=c.package_id)
          AND consent.status='ACTIVE' AND consent.withdrawn_at IS NULL
          AND consent.issued_at<=$2 AND (consent.expires_at IS NULL OR consent.expires_at>$2)
          AND NOT EXISTS (SELECT 1 FROM public.consent_actions other_action
            WHERE other_action.consent_id=consent.consent_id
              AND other_action.action NOT IN ('VIEW','DOWNLOAD','PACS_IMPORT'))
          AND NOT EXISTS (SELECT 1 FROM public.transfer_grant_scopes other_scope
            WHERE other_scope.grant_id=grant_record.grant_id
              AND (other_scope.scope NOT IN ('study:view','study:download','study:pacs-transfer')
                OR (other_scope.scope='study:view' AND NOT EXISTS (
                  SELECT 1 FROM public.consent_actions ca WHERE ca.consent_id=consent.consent_id
                    AND ca.action='VIEW'))
                OR (other_scope.scope='study:download' AND NOT EXISTS (
                  SELECT 1 FROM public.consent_actions ca WHERE ca.consent_id=consent.consent_id
                    AND ca.action='DOWNLOAD'))
                OR (other_scope.scope='study:pacs-transfer' AND NOT EXISTS (
                  SELECT 1 FROM public.consent_actions ca WHERE ca.consent_id=consent.consent_id
                    AND ca.action='PACS_IMPORT')))))) AS authorization_scope,
      EXISTS (SELECT 1 FROM candidate c WHERE
        EXISTS (SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.exchange_session_id=c.exchange_session_id AND a.resource_type='STUDY'
          AND a.resource_id=c.study_ref_id AND a.action='PACS_TEMPORARY_OBJECT_PURGED'
          AND a.result='SUCCESS' AND a.occurred_at=c.temporary_payload_purged_at)) AS purge_audit,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='PREFLIGHT_PASSED' AND a.occurred_at<=c.stow_started_at)) AS preflight_audit,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='STOW_STARTED' AND a.occurred_at=c.stow_started_at)) AS dispatch_audit,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='VERIFYING')) AS verifying_audit_exists,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='VERIFYING' AND a.occurred_at>=c.stow_started_at)) AS verifying_audit_after_stow,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='VERIFYING' AND a.occurred_at<=c.dst_verified_at))
        AS verifying_audit_before_destination_verification,
      EXISTS (SELECT 1 FROM candidate c WHERE c.stow_started_at<=c.dst_verified_at)
        AS stow_before_destination_verification,
      EXISTS (SELECT 1 FROM candidate c WHERE EXISTS (
        SELECT 1 FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='STUDY' AND a.resource_id=c.study_ref_id
          AND a.action='PACS_DESTINATION_VERIFY_AUTHORIZED' AND a.result='ALLOW'
          AND a.reason_code='FINAL' AND a.occurred_at>=c.stow_started_at
          AND a.occurred_at<=c.dst_verified_at)) AS destination_authorization_audit,
      EXISTS (SELECT 1 FROM candidate c WHERE
        (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='STUDY' AND a.resource_id=c.study_ref_id
          AND a.action='PACS_TRANSFER_COMPLETED' AND a.result='SUCCESS'
          AND a.reason_code IS NULL AND a.occurred_at=$2)=1
        AND (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='STUDY' AND a.resource_id=c.study_ref_id
          AND a.action='INTEGRITY_VERIFIED' AND a.result='SUCCESS'
          AND a.reason_code IS NULL AND a.occurred_at=$2)=1
        AND (SELECT count(*) FROM public.audit_events a WHERE a.tenant_id=c.tenant_id
          AND a.actor_id=c.actor_id AND a.exchange_session_id=c.exchange_session_id
          AND a.resource_type='PACS_TRANSFER_OPERATION' AND a.resource_id=c.operation_id
          AND a.action='PACS_TRANSFER_OPERATION_STATE_CHANGED' AND a.result='SUCCESS'
          AND a.reason_code='COMPLETED' AND a.occurred_at=$2)=1) AS terminal_audits;
  `, [operationId, completedAt, correlationId]);
  const row = result.rows[0];
  return Object.freeze({
    runtime_context: row?.runtime_context === true,
    resource_lifecycle: row?.resource_lifecycle === true,
    operation_session_timing: row?.operation_session_timing === true,
    provenance_and_integrity: row?.provenance_and_integrity === true,
    authorization_scope: row?.authorization_scope === true,
    purge_audit: row?.purge_audit === true,
    preflight_audit: row?.preflight_audit === true,
    dispatch_audit: row?.dispatch_audit === true,
    verifying_audit_exists: row?.verifying_audit_exists === true,
    verifying_audit_after_stow: row?.verifying_audit_after_stow === true,
    verifying_audit_before_destination_verification:
      row?.verifying_audit_before_destination_verification === true,
    stow_before_destination_verification: row?.stow_before_destination_verification === true,
    destination_authorization_audit: row?.destination_authorization_audit === true,
    terminal_audits: row?.terminal_audits === true,
  });
}

async function terminalizationFactsDiagnosticWithinSavepoint(
  client, stagePrefix, operationId, completedAt, correlationId,
) {
  const savepoint = "mediq_terminal_facts_diagnostic";
  try {
    await client.query(`SAVEPOINT ${savepoint}`);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code
      : "UNKNOWN";
    console.error(`${stagePrefix}_FACTS_DIAGNOSTIC=UNAVAILABLE:${code}`);
    return;
  }
  try {
    const canonical = await client.query(`
      SELECT public.pacs_transfer_terminal_facts_valid($1::uuid, $2::timestamptz, $3::uuid)
        AS facts_valid`, [operationId, completedAt, correlationId]);
    const groups = await terminalizationFactsExactCategoryDiagnostics(
      client, operationId, completedAt, correlationId,
    );
    const facts = {
      canonical: canonical.rows[0]?.facts_valid === true,
      ...groups,
    };
    console.error(`${stagePrefix}_FACTS_GROUPS=${Object.entries(facts)
      .map(([name, value]) => `${name}=${value}`).join(";")}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code
      : "UNKNOWN";
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      console.error(`${stagePrefix}_FACTS_DIAGNOSTIC=UNAVAILABLE:${code}:CLEANUP_FAILED`);
      throw error;
    }
    console.error(`${stagePrefix}_FACTS_DIAGNOSTIC=UNAVAILABLE:${code}`);
  }
}

const TERMINALIZATION_FAULT_CASES = Object.freeze([
  { stage: "AUDIT_PACS_TRANSFER_COMPLETED", action: "PACS_TRANSFER_COMPLETED" },
  { stage: "AUDIT_INTEGRITY_VERIFIED", action: "INTEGRITY_VERIFIED" },
  { stage: "AUDIT_SESSION_COMPLETED", action: "SESSION_COMPLETED" },
  { stage: "AUDIT_OPERATION_STATE_CHANGED", action: "PACS_TRANSFER_OPERATION_STATE_CHANGED" },
  { stage: "ROW_PROVENANCE" },
  { stage: "ROW_OPERATION" },
  { stage: "ROW_SESSION" },
]);

const TERMINALIZATION_FAULT_TRIGGER_NAMES = Object.freeze([
  "zz_mediq_term032_audit_fault",
  "zz_mediq_term032_provenance_fault",
  "zz_mediq_term032_operation_fault",
  "zz_mediq_term032_session_fault",
]);

async function terminalizationFaultInventory(inspector) {
  const result = await inspector.query(`
    SELECT
      (SELECT count(*)::int FROM pg_trigger
        WHERE NOT tgisinternal AND tgname = ANY($1::text[])) AS trigger_count,
      (SELECT count(*)::int FROM pg_proc procedure
         JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='public'
          AND procedure.proname='mediq_term032_fault') AS function_count`,
  [TERMINALIZATION_FAULT_TRIGGER_NAMES]);
  assert.equal(result.rowCount, 1, "TERM032_FAULT_INVENTORY_UNAVAILABLE");
  return result.rows[0];
}

async function installTerminalizationFaultTriggers(inspector) {
  const before = await terminalizationFaultInventory(inspector);
  assert.deepEqual(before, { trigger_count: 0, function_count: 0 },
    "TERM032_PREEXISTING_TEST_INSTRUMENTATION");
  await inspector.query("BEGIN");
  try {
    await inspector.query(`
      CREATE FUNCTION public.mediq_term032_fault() RETURNS trigger
      LANGUAGE plpgsql AS $fault$
      DECLARE
        requested_stage text := current_setting('mediq.test_terminalization_fault_stage', true);
        target_operation uuid := NULLIF(current_setting('mediq.test_terminalization_fault_operation', true), '')::uuid;
        target_session uuid := NULLIF(current_setting('mediq.test_terminalization_fault_session', true), '')::uuid;
        target_study uuid := NULLIF(current_setting('mediq.test_terminalization_fault_study', true), '')::uuid;
      BEGIN
        IF TG_TABLE_NAME = 'audit_events' THEN
          IF NEW.tenant_id = NULLIF(current_setting('mediq.test_terminalization_fault_tenant', true), '')::uuid
             AND NEW.exchange_session_id = target_session
             AND ((requested_stage = 'AUDIT_PACS_TRANSFER_COMPLETED'
                   AND NEW.action = 'PACS_TRANSFER_COMPLETED'
                   AND NEW.resource_type = 'STUDY' AND NEW.resource_id = target_study)
               OR (requested_stage = 'AUDIT_INTEGRITY_VERIFIED'
                   AND NEW.action = 'INTEGRITY_VERIFIED'
                   AND NEW.resource_type = 'STUDY' AND NEW.resource_id = target_study)
               OR (requested_stage = 'AUDIT_SESSION_COMPLETED'
                   AND NEW.action = 'SESSION_COMPLETED'
                   AND NEW.resource_type = 'EXCHANGE_SESSION' AND NEW.resource_id = target_session)
               OR (requested_stage = 'AUDIT_OPERATION_STATE_CHANGED'
                   AND NEW.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
                   AND NEW.resource_type = 'PACS_TRANSFER_OPERATION'
                   AND NEW.resource_id = target_operation)) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TERM032_INJECTED_FAULT';
          END IF;
        ELSIF TG_TABLE_NAME = 'provenance_records'
           AND requested_stage = 'ROW_PROVENANCE'
           AND NEW.operation_id = target_operation THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TERM032_INJECTED_FAULT';
        ELSIF TG_TABLE_NAME = 'pacs_transfer_operations'
           AND requested_stage = 'ROW_OPERATION'
           AND NEW.operation_id = target_operation THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TERM032_INJECTED_FAULT';
        ELSIF TG_TABLE_NAME = 'exchange_sessions'
           AND requested_stage = 'ROW_SESSION'
           AND NEW.session_id = target_session THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TERM032_INJECTED_FAULT';
        END IF;
        RETURN NEW;
      END;
      $fault$;
      CREATE TRIGGER zz_mediq_term032_audit_fault
        BEFORE INSERT ON audit_events FOR EACH ROW
        EXECUTE FUNCTION public.mediq_term032_fault();
      CREATE TRIGGER zz_mediq_term032_provenance_fault
        BEFORE UPDATE ON provenance_records FOR EACH ROW
        EXECUTE FUNCTION public.mediq_term032_fault();
      CREATE TRIGGER zz_mediq_term032_operation_fault
        BEFORE UPDATE ON pacs_transfer_operations FOR EACH ROW
        EXECUTE FUNCTION public.mediq_term032_fault();
      CREATE TRIGGER zz_mediq_term032_session_fault
        BEFORE UPDATE ON exchange_sessions FOR EACH ROW
        EXECUTE FUNCTION public.mediq_term032_fault();`);
    await inspector.query("COMMIT");
  } catch (error) {
    try { await inspector.query("ROLLBACK"); } catch { /* preserve installation error */ }
    throw error;
  }
  const after = await terminalizationFaultInventory(inspector);
  try {
    assert.deepEqual(after, { trigger_count: 4, function_count: 1 },
      "TERM032_TEST_INSTRUMENTATION_INSTALL_INCOMPLETE");
  } catch (error) {
    await removeTerminalizationFaultTriggers(inspector);
    throw error;
  }
}

async function removeTerminalizationFaultTriggers(inspector) {
  await inspector.query("BEGIN");
  try {
    await inspector.query(`
      DROP TRIGGER IF EXISTS zz_mediq_term032_audit_fault ON audit_events;
      DROP TRIGGER IF EXISTS zz_mediq_term032_provenance_fault ON provenance_records;
      DROP TRIGGER IF EXISTS zz_mediq_term032_operation_fault ON pacs_transfer_operations;
      DROP TRIGGER IF EXISTS zz_mediq_term032_session_fault ON exchange_sessions;
      DROP FUNCTION IF EXISTS public.mediq_term032_fault();`);
    await inspector.query("COMMIT");
  } catch (error) {
    try { await inspector.query("ROLLBACK"); } catch { /* preserve cleanup error */ }
    throw error;
  }
  const after = await terminalizationFaultInventory(inspector);
  assert.deepEqual(after, { trigger_count: 0, function_count: 0 },
    "TERM032_TEST_INSTRUMENTATION_REMAINS");
}

function authorizationContext(ids) {
  return AuthorizationContext.create({
    identity: {
      issuer: "https://synthetic-terminalization.test.invalid",
      subject: "synthetic-terminalization-actor",
      actorId: ids.actorId,
      tenantId: ids.tenantId,
      hospitalId: ids.hospitalId,
      actorType: "USER",
    },
    exchangeSessionId: ids.sessionId,
    resource: { kind: "STUDY", id: ids.studyRefId },
    action: "PACS_IMPORT",
    consentId: ids.consentId,
    grantId: ids.grantId,
  });
}

function transition(operation, nextState, reasonCode, extra = {}) {
  return operation.transitionTo({
    nextState,
    reasonCode,
    now: new Date(operation.snapshot.updatedAt.getTime() + 10),
    ...extra,
  });
}

async function prepareSyntheticTerminalizationScenario(client, ids, setStage = () => {}) {
  const operationId = randomUUID();
  const createdAt = new Date();
  const draft = PacsTransferOperation.create({
    operationId,
    semantics: {
      tenantId: ids.tenantId,
      actorId: ids.actorId,
      exchangeSessionId: ids.sessionId,
      studyRefId: ids.studyRefId,
      consentId: ids.consentId,
      grantId: ids.grantId,
      action: "PACS_IMPORT",
    },
    idempotencyKey: randomUUID(),
    now: createdAt,
  });
  setStage("SYNTHETIC_OPERATION_CREATED");
  await beginTenant(client, ids.tenantId);
  const created = await new PostgresPacsTransferOperationRepository(client)
    .createIdempotently({ operation: draft, correlationId: randomUUID() });
  assert.equal(created.created, true, "TERM034_SYNTHETIC_OPERATION_NOT_CREATED");

  setStage("SYNTHETIC_SOURCE_EVIDENCE");
  const source = await new PostgresSourceIntegrityEvidenceRepository(client)
    .createPendingSourceCapture({
      operationId,
      manifest: {
        algorithm: "SHA256-MANIFEST-V1",
        aggregateDigest: `sha256:${"b".repeat(64)}`,
        objectCount: 1,
        totalBytes: 2048,
      },
      now: new Date(),
    });
  assert.equal(source.created, true, "TERM034_SYNTHETIC_SOURCE_EVIDENCE_NOT_CREATED");

  setStage("SYNTHETIC_PAYLOAD_AVAILABLE");
  const payloadBinding = {
    operationId,
    tenantId: ids.tenantId,
    exchangeSessionId: ids.sessionId,
    packageId: ids.packageId,
    studyRefId: ids.studyRefId,
    sourceHospitalId: ids.sourceHospitalId,
  };
  const storageRef = randomUUID();
  const payloadMetadata = new PostgresTemporaryPayloadMetadataRepository(client);
  await payloadMetadata.reserveStaging({
    binding: payloadBinding,
    storageRef,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  await payloadMetadata.markAvailable({ binding: payloadBinding, storageRef, now: new Date() });

  setStage("SYNTHETIC_PROVENANCE_PENDING");
  const provenance = await new PostgresProvenanceRepository(client)
    .createPendingForPacsImport({ operationId, now: new Date() });
  assert.equal(provenance.created, true, "TERM034_SYNTHETIC_PROVENANCE_NOT_CREATED");

  setStage("SYNTHETIC_OPERATION_VERIFYING");
  let operation = created.operation;
  for (const [nextState, reasonCode, extra] of [
    ["PREFLIGHT_PASSED", "PREFLIGHT_PASSED", {}],
    ["STOW_STARTED", "STOW_STARTED", {}],
    ["VERIFYING", "VERIFYING", { sourceObjectCount: 1 }],
  ]) {
    const next = transition(operation, nextState, reasonCode, extra);
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation,
      next,
      correlationId: randomUUID(),
    });
  }
  assert.equal(operation.snapshot.state, "VERIFYING", "TERM034_SYNTHETIC_OPERATION_NOT_VERIFYING");
  assert.equal(operation.snapshot.version, 3, "TERM034_SYNTHETIC_OPERATION_VERSION_INVALID");

  setStage("SYNTHETIC_PURGE_AUDIT");
  await payloadMetadata.markPurgePending({ binding: payloadBinding, storageRef });
  const purgeTime = (await client.query("SELECT clock_timestamp() AS occurred_at")).rows[0]?.occurred_at;
  assert.ok(purgeTime instanceof Date, "TERM034_SYNTHETIC_PURGE_TIME_INVALID");
  const purged = await payloadMetadata.finalizePurgeAndAudit({
    binding: payloadBinding,
    storageRef,
    actorId: ids.actorId,
    correlationId: randomUUID(),
    auditEventId: randomUUID(),
    reason: "TRANSFER_TERMINAL",
    now: purgeTime,
  });
  assert.equal(purged, "PURGED", "TERM034_SYNTHETIC_PURGE_METADATA_NOT_SET");

  setStage("SYNTHETIC_DESTINATION_AUTH_AUDIT");
  const comparedAt = (await client.query(
    "SELECT GREATEST(clock_timestamp(), $1::timestamptz) AS compared_at",
    [operation.snapshot.updatedAt],
  )).rows[0]?.compared_at;
  assert.ok(comparedAt instanceof Date, "TERM034_SYNTHETIC_DESTINATION_TIME_INVALID");
  assert.ok(comparedAt.getTime() >= operation.snapshot.updatedAt.getTime(),
    "TERM034_DESTINATION_PRECEDES_VERIFYING_AUDIT");
  const auditWriter = new PostgresAuditEventWriter(client);
  await auditWriter.record(AuditEvent.create({
    auditEventId: randomUUID(),
    occurredAt: comparedAt,
    actorId: ids.actorId,
    tenantId: ids.tenantId,
    exchangeSessionId: ids.sessionId,
    resourceType: "STUDY",
    resourceId: ids.studyRefId,
    action: "PACS_DESTINATION_VERIFY_AUTHORIZED",
    result: "ALLOW",
    reasonCode: "FINAL",
    correlationId: randomUUID(),
    createdAt: comparedAt,
  }));
  setStage("SYNTHETIC_DESTINATION_EVIDENCE");
  const destinationRecordedAt = (await client.query(
    "SELECT GREATEST(clock_timestamp(), $1::timestamptz) AS recorded_at",
    [comparedAt],
  )).rows[0]?.recorded_at;
  assert.ok(destinationRecordedAt instanceof Date && destinationRecordedAt.getTime() >= comparedAt.getTime(),
    "TERM034_DESTINATION_EVIDENCE_TIME_PRECEDES_COMPARISON");
  const destinationEvidence = await new PostgresDestinationIntegrityEvidenceRepository(client)
    .appendVerifiedAndLinkPendingProvenance({
      operationId,
      tenantId: ids.tenantId,
      actorId: ids.actorId,
      exchangeSessionId: ids.sessionId,
      packageId: ids.packageId,
      studyRefId: ids.studyRefId,
      sourceEvidenceId: source.record.integrityId,
      algorithm: "SHA256-MANIFEST-V1",
      aggregateDigest: `sha256:${"b".repeat(64)}`,
      objectCount: 1,
      comparedAt,
      now: destinationRecordedAt,
    });
  assert.ok(destinationEvidence, "TERM034_SYNTHETIC_DESTINATION_EVIDENCE_MISSING");
  await auditWriter.record(AuditEvent.create({
    auditEventId: randomUUID(),
    occurredAt: destinationRecordedAt,
    actorId: ids.actorId,
    tenantId: ids.tenantId,
    exchangeSessionId: ids.sessionId,
    resourceType: "STUDY",
    resourceId: ids.studyRefId,
    action: "PACS_DESTINATION_INTEGRITY_RECORDED",
    result: "SUCCESS",
    reasonCode: "DESTINATION_MATCH",
    correlationId: randomUUID(),
    createdAt: destinationRecordedAt,
  }));
  setStage("SYNTHETIC_FIXTURE_COMMIT");
  await client.query("COMMIT");

  return {
    operationId,
    context: authorizationContext(ids),
    ids,
  };
}

async function waitForLockWait(inspector, backendPid) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await inspector.query(
      `SELECT 1 FROM pg_locks
        WHERE pid=$1 AND locktype='advisory' AND granted=false
          AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
      [backendPid],
    );
    if (result.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("TERM034_WAITER_DID_NOT_REACH_SESSION_FENCE");
}

async function finalizeWithSessionFenceCompetition({
  connectionString,
  inspector,
  holder,
  ids,
  operationId,
  context,
  winnerCorrelationId,
}) {
  const loserCorrelationId = randomUUID();
  const replayCorrelationId = randomUUID();
  const waiterPool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  let waiter;
  let waiterBackendPid;
  let holderTransactionOpen = false;
  let waiterTransactionOpen = false;
  let waiterAttempt;
  let phase = "HOLDER_TRANSACTION_BEGIN";
  const mark = (nextPhase) => {
    phase = nextPhase;
    console.error(`TERM034_STAGE=${phase}`);
  };
  try {
    mark("HOLDER_TRANSACTION_BEGIN");
    holderTransactionOpen = true;
    await beginTenant(holder, ids.tenantId);
    mark("HOLDER_SESSION_FENCE_ACQUIRE");
    await acquireExchangeSessionFence(holder, ids.sessionId);
    mark("HOLDER_SESSION_FENCE_ACQUIRED");

    mark("WAITER_CONNECT");
    waiter = await waiterPool.connect();
    const backend = await waiter.query("SELECT pg_backend_pid() AS backend_pid");
    waiterBackendPid = backend.rows[0]?.backend_pid;
    assert.ok(Number.isSafeInteger(waiterBackendPid) && waiterBackendPid > 0,
      "TERM034_WAITER_BACKEND_PID_INVALID");
    mark("WAITER_TENANT_TRANSACTION_BEGIN");
    waiterTransactionOpen = true;
    await beginTenant(waiter, ids.tenantId);
    mark("WAITER_FINALIZE_START");
    waiterAttempt = new PostgresPacsTransferTerminalizationRepository(waiter)
      .finalize({ operationId, context, correlationId: loserCorrelationId })
      .then((value) => ({ value, error: null }), (error) => ({ value: null, error }));

    mark("WAIT_FOR_REAL_SESSION_LOCK");
    await waitForLockWait(inspector, waiterBackendPid);
    mark("WAITER_CONFIRMED_BLOCKED_ON_LOCK");
    const winner = await new PostgresPacsTransferTerminalizationRepository(holder)
      .finalize({ operationId, context, correlationId: winnerCorrelationId });
    mark("HOLDER_FINALIZER_RETURNED");
    assert.equal(winner.state, "COMPLETED", "TERM034_WINNER_NOT_COMPLETED");
    await holder.query("COMMIT");
    holderTransactionOpen = false;
    mark("HOLDER_COMMIT_CONFIRMED");

    const loser = await waiterAttempt;
    assert.ok(loser.error instanceof PacsTransferTerminalizationConflictError,
      "TERM034_CONCURRENT_LOSER_NOT_CONFLICT");
    assert.equal(loser.value, null, "TERM034_CONCURRENT_LOSER_RETURNED_SUCCESS");
    mark("WAITER_CONFLICT_CONFIRMED");
    await waiter.query("COMMIT");
    waiterTransactionOpen = false;
    mark("WAITER_COMMIT_CONFIRMED");

    mark("REPLAY_TRANSACTION_BEGIN");
    waiterTransactionOpen = true;
    await beginTenant(waiter, ids.tenantId);
    let replayError;
    try {
      await new PostgresPacsTransferTerminalizationRepository(waiter)
        .finalize({ operationId, context, correlationId: replayCorrelationId });
    } catch (error) {
      replayError = error;
    }
    assert.ok(replayError instanceof PacsTransferTerminalizationConflictError,
      "TERM034_SEQUENTIAL_REPLAY_NOT_CONFLICT");
    mark("SEQUENTIAL_REPLAY_CONFLICT_CONFIRMED");
    await waiter.query("COMMIT");
    waiterTransactionOpen = false;
    mark("SEQUENTIAL_REPLAY_COMMIT_CONFIRMED");

    mark("TRANSACTION_LOCAL_GUC_CHECK");
    const settings = await Promise.all([
      holder.query("SELECT current_setting('mediq.terminal_correlation_id', true) AS value"),
      waiter.query("SELECT current_setting('mediq.terminal_correlation_id', true) AS value"),
    ]);
    for (const [index, result] of settings.entries()) {
      assert.notEqual(result.rows[0]?.value, index === 0 ? winnerCorrelationId : replayCorrelationId,
        "TERM034_TERMINAL_CORRELATION_GUC_LEAKED");
    }
    mark("COMPETITION_COMPLETE");
    return { winner, loserCorrelationId, replayCorrelationId };
  } catch (error) {
    const safeError = typeof error?.message === "string" &&
      /^(?:TERM034_|PACS_TRANSFER_TERMINALIZATION_)[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : (typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
        ? error.code
        : (error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED"));
    console.error(`TERM034_STAGE=${phase}_FAILED`);
    console.error(`TERM034_ERROR=${safeError}`);
    throw error;
  } finally {
    if (holderTransactionOpen) {
      try { await holder.query("ROLLBACK"); } catch { /* cleanup only */ }
    }
    if (waiterAttempt) {
      try { await waiterAttempt; } catch { /* result is captured; cleanup continues */ }
    }
    if (waiterTransactionOpen && waiter) {
      try { await waiter.query("ROLLBACK"); } catch { /* cleanup only */ }
    }
    if (waiter) waiter.release();
    await waiterPool.end();
  }
}

async function expectTerminalGuardDenial(client, savepoint, sql, values, constraint) {
  const probe = {
    term020_provenance_missing_facts: "PROVENANCE",
    term020_operation_missing_facts: "OPERATION",
    term020_session_missing_facts: "SESSION",
  }[savepoint];
  assert.ok(probe, "TERM020_UNKNOWN_GUARD_PROBE");
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await client.query(sql, values);
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!rejection) {
    console.error(`TERM020_GUARD=${probe}_NOT_REJECTED`);
    throw new Error(`TERM020_GUARD_${probe}_NOT_REJECTED`);
  }
  if (rejection?.code !== "23514" || rejection?.constraint !== constraint) {
    const category = rejection?.code === "23514"
      ? "23514_UNEXPECTED_CONSTRAINT"
      : ({
          "42501": "INSUFFICIENT_PRIVILEGE",
          "25P02": "TRANSACTION_ABORTED",
          "23505": "UNIQUE_VIOLATION",
        }[rejection?.code] ?? "OTHER_SQLSTATE");
    console.error(`TERM020_GUARD=${probe}_${category}`);
    throw new Error(`TERM020_GUARD_${probe}_${category}`);
  }
  console.error(`TERM020_GUARD=${probe}_EXPECTED`);
}

async function insertTerminalAudit(client, ids, operationId, event, correlationId, occurredAt = new Date()) {
  return client.query(
    `INSERT INTO audit_events
      (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id,
       resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUCCESS', $9, $10, $2)`,
    [randomUUID(), occurredAt, ids.actorId, ids.tenantId, ids.sessionId,
      event.resourceType, event.resourceId(operationId, ids), event.action,
      event.reasonCode, correlationId],
  );
}

async function expectAuditCorrelationGuardDenial(client, savepoint, ids, operationId, event, correlationId) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await insertTerminalAudit(client, ids, operationId, event, correlationId);
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.equal(rejection?.code, "23514", "TERM027_AUDIT_CORRELATION_SQLSTATE_INVALID");
  assert.equal(rejection?.constraint, "audit_events_terminal_correlation_guard",
    "TERM027_AUDIT_CORRELATION_CONSTRAINT_INVALID");
}

test("TERM-020 denials and TERM-030/031 single-Study terminalizer persistence under runtime RLS", {
  timeout: 120_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  const inspectionConnectionString = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.equal(process.env.MEDIQ_PACS_DB008_SCRATCH_ONLY, "1",
    "TERM032_SCRATCH_ONLY_GUARD_REQUIRED");
  assert.ok(connectionString, "TERM020_RUNTIME_DATABASE_URL_MISSING");
  assert.ok(inspectionConnectionString, "TERM020_INSPECT_DATABASE_URL_MISSING");
  const ids = fixture();
  const runtime = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  const inspector = new Pool({ connectionString: inspectionConnectionString, max: 1, connectionTimeoutMillis: 5000 });
  let client;
  let fixtureOperationId;
  let stage = "RUNTIME_CONNECT";
  let stageFamily = "TERM020";
  let sourceEvidence;
  let payloadBinding;
  let payloadStorageRef;
  try {
    client = await runtime.connect();
    stage = "RUNTIME_ROLE_CHECK";
    const role = await client.query(`
      SELECT current_user AS role_name,
             (SELECT count(*)::int FROM information_schema.column_privileges
               WHERE grantee='mediq_runtime' AND table_schema='public') AS column_privileges,
             (SELECT count(*)::int FROM information_schema.table_privileges
               WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public') AS table_privileges,
             (SELECT array_agg(table_name || '.' || column_name ORDER BY table_name, column_name)
                FROM information_schema.column_privileges
               WHERE grantee='mediq_runtime' AND table_schema='public'
                 AND privilege_type='UPDATE'
                 AND ((table_name='provenance_records' AND column_name IN
                       ('transfer_status','ingested_at','transferred_at'))
                   OR (table_name='exchange_sessions' AND column_name='completed_at'))) AS terminal_update_columns
    `);
    assert.equal(role.rows[0].role_name, "mediq_runtime", "TERM020_RUNTIME_ROLE_MISMATCH");
    assert.equal(role.rows[0].column_privileges, 262, "TERM020_EXACT_PRIVILEGE_COUNT_MISMATCH");
    assert.equal(role.rows[0].table_privileges, 0, "TERM020_TABLE_PRIVILEGE_PRESENT");
    assert.deepEqual(role.rows[0].terminal_update_columns, [
      "exchange_sessions.completed_at",
      "provenance_records.ingested_at",
      "provenance_records.transfer_status",
      "provenance_records.transferred_at",
    ]);
    stage = "RUNTIME_ROLE_VERIFIED";

    const createdAt = new Date();
    const draft = PacsTransferOperation.create({
      operationId: randomUUID(),
      semantics: {
        tenantId: ids.tenantId,
        actorId: ids.actorId,
        exchangeSessionId: ids.sessionId,
        studyRefId: ids.studyRefId,
        consentId: ids.consentId,
        grantId: ids.grantId,
        action: "PACS_IMPORT",
      },
      idempotencyKey: randomUUID(),
      now: createdAt,
    });
    fixtureOperationId = draft.snapshot.operationId;

    stage = "FIXTURE_OPERATION_CREATE";
    await beginTenant(client, ids.tenantId);
    const created = await new PostgresPacsTransferOperationRepository(client)
      .createIdempotently({ operation: draft, correlationId: randomUUID() });
    assert.equal(created.created, true, "TERM020_OPERATION_FIXTURE_NOT_CREATED");

    stage = "FIXTURE_SOURCE_EVIDENCE_CREATE";
    sourceEvidence = await new PostgresSourceIntegrityEvidenceRepository(client)
      .createPendingSourceCapture({
        operationId: fixtureOperationId,
        manifest: {
          algorithm: "SHA256-MANIFEST-V1",
          aggregateDigest: `sha256:${"a".repeat(64)}`,
          objectCount: 1,
          totalBytes: 1024,
        },
        now: new Date(),
      });
    assert.equal(sourceEvidence.created, true, "TERM020_SOURCE_FIXTURE_NOT_CREATED");

    payloadBinding = {
      operationId: fixtureOperationId,
      tenantId: ids.tenantId,
      exchangeSessionId: ids.sessionId,
      packageId: ids.packageId,
      studyRefId: ids.studyRefId,
      sourceHospitalId: ids.sourceHospitalId,
    };
    payloadStorageRef = randomUUID();
    const payloadMetadata = new PostgresTemporaryPayloadMetadataRepository(client);
    const payloadExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    stage = "FIXTURE_TEMPORARY_PAYLOAD_AVAILABLE";
    await payloadMetadata.reserveStaging({
      binding: payloadBinding,
      storageRef: payloadStorageRef,
      expiresAt: payloadExpiresAt,
    });
    await payloadMetadata.markAvailable({
      binding: payloadBinding,
      storageRef: payloadStorageRef,
      now: new Date(),
    });

    stage = "FIXTURE_PROVENANCE_CREATE";
    const provenance = await new PostgresProvenanceRepository(client)
      .createPendingForPacsImport({ operationId: fixtureOperationId, now: new Date() });
    assert.equal(provenance.created, true, "TERM020_PROVENANCE_FIXTURE_NOT_CREATED");

    stage = "OPERATION_TRANSITIONS";
    let operation = created.operation;
    let next = transition(operation, "PREFLIGHT_PASSED", "PREFLIGHT_PASSED");
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    next = transition(operation, "STOW_STARTED", "STOW_STARTED");
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    next = transition(operation, "VERIFYING", "VERIFYING", { sourceObjectCount: 1 });
    operation = await new PostgresPacsTransferOperationRepository(client).transition({
      current: operation, next, correlationId: randomUUID(),
    });
    assert.equal(operation.snapshot.state, "VERIFYING");
    assert.equal(operation.snapshot.version, 3);
    await client.query("COMMIT");
    stage = "VERIFYING_FIXTURE_COMMITTED";

    stage = "NO_CONTEXT_RLS_PROBE";
    const noContext = await client.query(
      `UPDATE provenance_records SET transfer_status='COMPLETED'
        WHERE operation_id=$1 RETURNING provenance_id`,
      [fixtureOperationId],
    );
    assert.equal(noContext.rowCount, 0, "TERM020_MISSING_TENANT_CONTEXT_NOT_DENIED");

    stage = "WRONG_TENANT_RLS_PROBE";
    await beginTenant(client, ids.otherTenantId);
    const wrongTenant = await client.query(
      `UPDATE provenance_records SET transfer_status='COMPLETED'
        WHERE operation_id=$1 RETURNING provenance_id`,
      [fixtureOperationId],
    );
    assert.equal(wrongTenant.rowCount, 0, "TERM020_CROSS_TENANT_WRITE_NOT_DENIED");
    await client.query("COMMIT");

    stage = "PROVENANCE_TERMINAL_GUARD_PROBE";
    await beginTenant(client, ids.tenantId);
    await expectTerminalGuardDenial(
      client,
      "term020_provenance_missing_facts",
      `UPDATE provenance_records AS provenance
          SET transfer_status='COMPLETED', ingested_at=stamp.completed_at,
              transferred_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE provenance.operation_id=$1`,
      [fixtureOperationId],
      "provenance_records_terminalization_guard",
    );
    stage = "OPERATION_TERMINAL_GUARD_PROBE";
    await expectTerminalGuardDenial(
      client,
      "term020_operation_missing_facts",
      `UPDATE pacs_transfer_operations AS operation
          SET state='COMPLETED', version=4, reason_code='COMPLETED',
              destination_object_count=operation.source_object_count,
              updated_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE operation.operation_id=$1`,
      [fixtureOperationId],
      "pacs_transfer_operations_completion_guard",
    );
    stage = "SESSION_TERMINAL_GUARD_PROBE";
    await expectTerminalGuardDenial(
      client,
      "term020_session_missing_facts",
      `UPDATE exchange_sessions AS session
          SET state='COMPLETED', updated_at=stamp.completed_at,
              completed_at=stamp.completed_at
         FROM (SELECT clock_timestamp() AS completed_at) AS stamp
        WHERE session.session_id=$1`,
      [ids.sessionId],
      "exchange_sessions_terminal_completion_guard",
    );
    await client.query("COMMIT");

    stage = "TERMINAL_AUDIT_CORRELATION_CONTEXT_PROBE";
    const terminalEvents = [
      { action: "PACS_TRANSFER_COMPLETED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "INTEGRITY_VERIFIED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", resourceType: "PACS_TRANSFER_OPERATION",
        reasonCode: "COMPLETED", resourceId: (operationId) => operationId },
      { action: "SESSION_COMPLETED", resourceType: "EXCHANGE_SESSION", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.sessionId },
    ];
    await beginTenant(client, ids.tenantId);
    for (const [eventIndex, event] of terminalEvents.entries()) {
      for (const [modeIndex, mode] of ["MISSING", "MALFORMED", "MISMATCH"].entries()) {
        const expectedCorrelationId = randomUUID();
        let actualCorrelationId = randomUUID();
        if (mode === "MISMATCH" && actualCorrelationId === expectedCorrelationId) {
          actualCorrelationId = randomUUID();
        }
        const settingValue = mode === "MISSING" ? "" :
          mode === "MALFORMED" ? "not-a-uuid" : expectedCorrelationId;
        await client.query(
          "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
          [settingValue],
        );
        await expectAuditCorrelationGuardDenial(
          client,
          `term_corr_${eventIndex}_${modeIndex}`,
          ids,
          fixtureOperationId,
          event,
          actualCorrelationId,
        );
      }

      const matchingCorrelationId = randomUUID();
      await client.query(
        "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
        [matchingCorrelationId],
      );
      const matching = await insertTerminalAudit(
        client, ids, fixtureOperationId, event, matchingCorrelationId,
      );
      assert.equal(matching.rowCount, 1, "TERM027_MATCHING_TERMINAL_AUDIT_REJECTED");
    }
    const rolledBackCorrelationId = randomUUID();
    await client.query(
      "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
      [rolledBackCorrelationId],
    );
    await client.query("ROLLBACK");
    const rollbackSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(rollbackSetting.rows[0]?.value, rolledBackCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_AFTER_ROLLBACK");

    stage = "TERMINAL_AUDIT_CORRELATION_COMMIT_RESET_PROBE";
    await beginTenant(client, ids.tenantId);
    const committedCorrelationId = randomUUID();
    await client.query(
      "SELECT set_config('mediq.terminal_correlation_id', $1, true)",
      [committedCorrelationId],
    );
    await client.query("COMMIT");
    const commitSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(commitSetting.rows[0]?.value, committedCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_AFTER_COMMIT");
    client.release();
    client = await runtime.connect();
    const pooledSetting = await client.query(
      "SELECT current_setting('mediq.terminal_correlation_id', true) AS value",
    );
    assert.notEqual(pooledSetting.rows[0]?.value, committedCorrelationId,
      "TERM027_CORRELATION_SETTING_LEAKED_THROUGH_POOL_REUSE");

    stage = "INDEPENDENT_OBSERVER_QUERY";
    const observed = await inspector.query(`
      SELECT operation.state, operation.version, operation.destination_object_count,
             provenance.transfer_status, provenance.ingested_at, provenance.transferred_at,
             session.state AS session_state, session.completed_at,
             (SELECT count(*)::int FROM audit_events AS audit
               WHERE audit.tenant_id=operation.tenant_id
                 AND audit.exchange_session_id=operation.exchange_session_id
                 AND ((audit.resource_type='STUDY'
                       AND audit.resource_id=operation.study_ref_id
                       AND audit.action IN ('PACS_TRANSFER_COMPLETED','INTEGRITY_VERIFIED'))
                   OR (audit.resource_type='PACS_TRANSFER_OPERATION'
                       AND audit.resource_id=operation.operation_id
                       AND audit.reason_code='COMPLETED')
                   OR (audit.resource_type='EXCHANGE_SESSION'
                       AND audit.resource_id=operation.exchange_session_id
                       AND audit.action='SESSION_COMPLETED'))) AS terminal_audit_count,
             (SELECT count(*)::int FROM integrity_evidence AS destination
               WHERE destination.operation_id=operation.operation_id
                 AND destination.verification_stage='DESTINATION_VERIFY') AS destination_evidence_count
        FROM pacs_transfer_operations AS operation
        JOIN provenance_records AS provenance ON provenance.operation_id=operation.operation_id
        JOIN exchange_sessions AS session ON session.session_id=operation.exchange_session_id
       WHERE operation.operation_id=$1`,
    [fixtureOperationId]);
    assert.equal(observed.rowCount, 1, "TERM020_INDEPENDENT_OBSERVER_ROW_MISSING");
    assert.deepEqual(observed.rows[0], {
      state: "VERIFYING",
      version: 3,
      destination_object_count: null,
      transfer_status: "PENDING",
      ingested_at: null,
      transferred_at: null,
      session_state: "ACTIVE",
      completed_at: null,
      terminal_audit_count: 0,
      destination_evidence_count: 0,
    });
    stage = "INDEPENDENT_OBSERVER_CONFIRMED";
    console.error(`TERM020_STAGE=${stage}`);

    stageFamily = "TERM030";
    stage = "SYNTHETIC_PURGE_AND_DESTINATION_EVIDENCE";
    await beginTenant(client, ids.tenantId);
    const purgeMetadata = new PostgresTemporaryPayloadMetadataRepository(client);
    await purgeMetadata.markPurgePending({
      binding: payloadBinding,
      storageRef: payloadStorageRef,
    });
    const purgeTime = (await client.query(
      "SELECT clock_timestamp() AS occurred_at",
    )).rows[0]?.occurred_at;
    assert.ok(purgeTime instanceof Date, "TERM030_PURGE_TIMESTAMP_INVALID");
    const purgeResult = await purgeMetadata.finalizePurgeAndAudit({
      binding: payloadBinding,
      storageRef: payloadStorageRef,
      actorId: ids.actorId,
      correlationId: randomUUID(),
      auditEventId: randomUUID(),
      reason: "TRANSFER_TERMINAL",
      now: purgeTime,
    });
    assert.equal(purgeResult, "PURGED", "TERM030_SYNTHETIC_PURGE_METADATA_NOT_SET");

    const comparedAt = (await client.query(
      "SELECT clock_timestamp() AS compared_at",
    )).rows[0]?.compared_at;
    assert.ok(comparedAt instanceof Date, "TERM030_DESTINATION_COMPARE_TIME_INVALID");
    const auditWriter = new PostgresAuditEventWriter(client);
    await auditWriter.record(AuditEvent.create({
      auditEventId: randomUUID(),
      occurredAt: comparedAt,
      actorId: ids.actorId,
      tenantId: ids.tenantId,
      exchangeSessionId: ids.sessionId,
      resourceType: "STUDY",
      resourceId: ids.studyRefId,
      action: "PACS_DESTINATION_VERIFY_AUTHORIZED",
      result: "ALLOW",
      reasonCode: "FINAL",
      correlationId: randomUUID(),
      createdAt: comparedAt,
    }));
    const destinationRecordedAt = (await client.query(
      "SELECT clock_timestamp() AS recorded_at",
    )).rows[0]?.recorded_at;
    assert.ok(destinationRecordedAt instanceof Date && destinationRecordedAt >= comparedAt,
      "TERM030_DESTINATION_RECORD_TIME_INVALID");
    const destinationEvidence = await new PostgresDestinationIntegrityEvidenceRepository(client)
      .appendVerifiedAndLinkPendingProvenance({
        operationId: fixtureOperationId,
        tenantId: ids.tenantId,
        actorId: ids.actorId,
        exchangeSessionId: ids.sessionId,
        packageId: ids.packageId,
        studyRefId: ids.studyRefId,
        sourceEvidenceId: sourceEvidence.record.integrityId,
        algorithm: "SHA256-MANIFEST-V1",
        aggregateDigest: `sha256:${"a".repeat(64)}`,
        objectCount: 1,
        comparedAt,
        now: destinationRecordedAt,
      });
    await auditWriter.record(AuditEvent.create({
      auditEventId: randomUUID(),
      occurredAt: destinationRecordedAt,
      actorId: ids.actorId,
      tenantId: ids.tenantId,
      exchangeSessionId: ids.sessionId,
      resourceType: "STUDY",
      resourceId: ids.studyRefId,
      action: "PACS_DESTINATION_INTEGRITY_RECORDED",
      result: "SUCCESS",
      reasonCode: "DESTINATION_MATCH",
      correlationId: randomUUID(),
      createdAt: destinationRecordedAt,
    }));
    await client.query("COMMIT");

    const context = authorizationContext(ids);
    const terminalCorrelationId = randomUUID();
    stageFamily = "TERM032";
    stage = "FAULT_TRIGGER_INSTALL";
    await installTerminalizationFaultTriggers(inspector);
    let faultTriggersInstalled = true;
    try {
      for (const faultCase of TERMINALIZATION_FAULT_CASES) {
        const failedCorrelationId = randomUUID();
        stage = `FAILURE_AT_${faultCase.stage}`;
        const before = await terminalizationTargetSnapshot(
          inspector, fixtureOperationId, failedCorrelationId,
        );
        assert.equal(before.state, "VERIFYING", "TERM032_PRESTATE_NOT_VERIFYING");
        assert.equal(before.version, 3, "TERM032_PRESTATE_VERSION_INVALID");
        assert.equal(before.transfer_status, "PENDING", "TERM032_PRESTATE_PROVENANCE_NOT_PENDING");
        assert.equal(before.ingested_at, null, "TERM032_PRESTATE_INGESTED_AT_PRESENT");
        assert.equal(before.transferred_at, null, "TERM032_PRESTATE_TRANSFERRED_AT_PRESENT");
        assert.equal(before.session_state, "ACTIVE", "TERM032_PRESTATE_SESSION_NOT_ACTIVE");
        assert.equal(before.completed_at, null, "TERM032_PRESTATE_SESSION_TIME_PRESENT");
        assert.equal(before.terminal_audit_count, 0, "TERM032_PRESTATE_TERMINAL_AUDIT_PRESENT");
        const scopeBeforeFailure = await terminalizationScopeFingerprint(
          inspector, fixtureOperationId, ids.sessionId, failedCorrelationId,
        );

        await beginTenant(client, ids.tenantId);
        await client.query(
          `SELECT set_config('mediq.test_terminalization_fault_stage', $1, true),
                  set_config('mediq.test_terminalization_fault_operation', $2, true),
                  set_config('mediq.test_terminalization_fault_session', $3, true),
                  set_config('mediq.test_terminalization_fault_study', $4, true),
                  set_config('mediq.test_terminalization_fault_tenant', $5, true)`,
          [faultCase.stage, fixtureOperationId, ids.sessionId, ids.studyRefId, ids.tenantId],
        );
        let failure;
        try {
          await new PostgresPacsTransferTerminalizationRepository(client)
            .finalize({
              operationId: fixtureOperationId,
              context,
              correlationId: failedCorrelationId,
            });
        } catch (error) {
          failure = error;
        }
        assert.ok(failure instanceof PacsTransferTerminalizationUnavailableError,
          `TERM032_WRONG_EXTERNAL_ERROR_${faultCase.stage}`);
        assert.equal(failure.message, "PACS_TRANSFER_TERMINALIZATION_UNAVAILABLE",
          `TERM032_ERROR_NOT_FIXED_${faultCase.stage}`);
        const stillUsable = await client.query(`
          SELECT 1 AS usable,
                 current_setting('mediq.tenant_id', true) AS tenant_id,
                 current_setting('mediq.terminal_correlation_id', true) AS terminal_correlation_id`);
        assert.equal(stillUsable.rows[0]?.usable, 1,
          `TERM032_OUTER_TRANSACTION_UNUSABLE_${faultCase.stage}`);
        assert.equal(stillUsable.rows[0]?.tenant_id, ids.tenantId,
          `TERM032_TENANT_CONTEXT_LOST_${faultCase.stage}`);
        assert.notEqual(stillUsable.rows[0]?.terminal_correlation_id, failedCorrelationId,
          `TERM032_TERMINAL_GUC_SURVIVED_SAVEPOINT_${faultCase.stage}`);
        await client.query("COMMIT");

        const after = await terminalizationTargetSnapshot(
          inspector, fixtureOperationId, failedCorrelationId,
        );
        assert.deepEqual(after, before, `TERM032_PARTIAL_TERMINAL_STATE_${faultCase.stage}`);
        const scopeAfterFailure = await terminalizationScopeFingerprint(
          inspector, fixtureOperationId, ids.sessionId, failedCorrelationId,
        );
        assert.deepEqual(scopeAfterFailure, scopeBeforeFailure,
          `TERM032_UNRELATED_STATE_CHANGED_${faultCase.stage}`);
        console.error(`TERM032_STAGE=ROLLBACK_${faultCase.stage}_CONFIRMED`);
      }
    } finally {
      if (faultTriggersInstalled) {
        stage = "FAULT_TRIGGER_CLEANUP";
        await removeTerminalizationFaultTriggers(inspector);
        faultTriggersInstalled = false;
      }
    }
    stage = "TERM032_FAILURE_MATRIX_CONFIRMED";
    console.error("TERM032_FAILURE_MATRIX=PASS fault_points=7 savepoint_rollback=PASS outer_commit=PASS triggers_removed=PASS");

    stage = "TERM030_UNRELATED_SCOPE_SNAPSHOT";
    const scopeBefore = await terminalizationScopeFingerprint(
      inspector, fixtureOperationId, ids.sessionId, terminalCorrelationId,
    );
    stage = "TERM033_034_SESSION_FENCE_COMPETITION";
    const competition = await finalizeWithSessionFenceCompetition({
      connectionString,
      inspector,
      holder: client,
      ids: { tenantId: ids.tenantId, sessionId: ids.sessionId },
      operationId: fixtureOperationId,
      context,
      winnerCorrelationId: terminalCorrelationId,
    });
    const terminalized = competition.winner;
    console.error("TERM033_POST_ROLLBACK_PERSISTENCE=PASS attempts=1 no_ambiguous_retry=PASS");
    assert.equal(terminalized.operationId, fixtureOperationId);
    assert.equal(terminalized.exchangeSessionId, ids.sessionId);
    assert.equal(terminalized.state, "COMPLETED", "TERM030_OPERATION_NOT_COMPLETED");
    assert.equal(terminalized.version, 4, "TERM030_OPERATION_VERSION_INVALID");
    assert.equal(terminalized.sessionState, "COMPLETED", "TERM030_SINGLE_STUDY_SESSION_NOT_COMPLETED");
    assert.ok(terminalized.completedAt instanceof Date, "TERM030_COMPLETION_TIME_INVALID");
    stage = "CALLER_OUTER_TRANSACTION_COMMIT";
    await client.query("COMMIT");

    stage = "TERM031_INDEPENDENT_OBSERVER_QUERY";
    const committed = await inspector.query(`
      SELECT operation.state, operation.version,
             operation.source_object_count, operation.destination_object_count,
             provenance.provenance_id,
             provenance.transfer_status, provenance.ingested_at,
             provenance.transferred_at, provenance.integrity_id AS linked_integrity_id,
             session.state AS session_state, session.completed_at AS session_completed_at,
             source.status AS source_status, destination.status AS destination_status,
             destination.integrity_id AS destination_integrity_id,
             destination.source_digest AS destination_source_digest,
             destination.destination_digest,
             destination.source_object_count AS destination_source_count,
             destination.destination_object_count,
             (SELECT count(*)::int FROM audit_events AS audit
               WHERE audit.tenant_id=operation.tenant_id
                 AND audit.exchange_session_id=operation.exchange_session_id
                 AND audit.correlation_id=$2) AS correlated_audit_count
        FROM pacs_transfer_operations AS operation
        JOIN provenance_records AS provenance ON provenance.operation_id=operation.operation_id
        JOIN exchange_sessions AS session ON session.session_id=operation.exchange_session_id
        JOIN integrity_evidence AS source
          ON source.operation_id=operation.operation_id
         AND source.verification_stage='SOURCE_CAPTURE'
        JOIN integrity_evidence AS destination
          ON destination.operation_id=operation.operation_id
         AND destination.verification_stage='DESTINATION_VERIFY'
       WHERE operation.operation_id=$1`,
    [fixtureOperationId, terminalCorrelationId]);
    stage = "TERM031_GRAPH_ASSERTIONS";
    assert.equal(committed.rowCount, 1, "TERM031_COMMITTED_GRAPH_MISSING");
    const row = committed.rows[0];
    assert.equal(row.state, "COMPLETED", "TERM031_OPERATION_STATE_MISMATCH");
    assert.equal(row.version, 4, "TERM031_OPERATION_VERSION_MISMATCH");
    assert.equal(row.source_object_count, 1, "TERM031_SOURCE_COUNT_MISMATCH");
    assert.equal(row.destination_object_count, 1, "TERM031_DESTINATION_COUNT_MISMATCH");
    assert.equal(row.transfer_status, "COMPLETED", "TERM031_PROVENANCE_STATUS_MISMATCH");
    assert.ok(row.ingested_at instanceof Date && row.transferred_at instanceof Date,
      "TERM031_PROVENANCE_TIMESTAMPS_MISSING");
    assert.equal(row.ingested_at.getTime(), row.transferred_at.getTime(),
      "TERM031_PROVENANCE_TIMESTAMPS_DIVERGE");
    assert.ok(row.session_completed_at instanceof Date, "TERM031_SESSION_COMPLETION_MISSING");
    assert.equal(row.session_state, "COMPLETED", "TERM031_SESSION_STATE_MISMATCH");
    assert.equal(row.session_completed_at.getTime(), row.ingested_at.getTime(),
      "TERM031_SESSION_PROVENANCE_TIME_MISMATCH");
    assert.equal(row.source_status, "PENDING", "TERM031_SOURCE_EVIDENCE_CHANGED");
    assert.equal(row.destination_status, "VERIFIED", "TERM031_DESTINATION_NOT_VERIFIED");
    assert.equal(row.linked_integrity_id, row.destination_integrity_id,
      "TERM031_PROVENANCE_DESTINATION_LINK_MISMATCH");
    assert.equal(row.destination_source_digest, row.destination_digest,
      "TERM031_DESTINATION_DIGEST_MISMATCH");
    assert.equal(row.destination_source_count, row.destination_object_count,
      "TERM031_DESTINATION_EVIDENCE_COUNT_MISMATCH");
    assert.equal(row.correlated_audit_count, 4, "TERM031_TERMINAL_AUDIT_CARDINALITY_MISMATCH");

    stage = "TERM031_UNRELATED_SCOPE_FINGERPRINT";
    const scopeAfter = await terminalizationScopeFingerprint(
      inspector, fixtureOperationId, ids.sessionId, terminalCorrelationId,
    );
    assert.deepEqual(scopeAfter, scopeBefore, "TERM031_UNRELATED_TENANT_OR_STUDY_ROWS_CHANGED");

    stage = "TERM031_AUDIT_QUERY";
    const terminalAudits = await inspector.query(`
      SELECT resource_type, resource_id, action, result, reason_code,
             correlation_id, occurred_at
        FROM audit_events
       WHERE tenant_id=$1 AND exchange_session_id=$2 AND correlation_id=$3
       ORDER BY action`,
    [ids.tenantId, ids.sessionId, terminalCorrelationId]);
    stage = "TERM031_AUDIT_ASSERTIONS";
    const expectedTerminalAudits = [
      { resource_type: "STUDY", resource_id: ids.studyRefId,
        action: "INTEGRITY_VERIFIED", result: "SUCCESS", reason_code: null,
        correlation_id: terminalCorrelationId, occurred_at: row.ingested_at.getTime() },
      { resource_type: "STUDY", resource_id: ids.studyRefId,
        action: "PACS_TRANSFER_COMPLETED", result: "SUCCESS", reason_code: null,
        correlation_id: terminalCorrelationId, occurred_at: row.ingested_at.getTime() },
      { resource_type: "PACS_TRANSFER_OPERATION", resource_id: fixtureOperationId,
        action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", result: "SUCCESS", reason_code: "COMPLETED",
        correlation_id: terminalCorrelationId, occurred_at: row.ingested_at.getTime() },
      { resource_type: "EXCHANGE_SESSION", resource_id: ids.sessionId,
        action: "SESSION_COMPLETED", result: "SUCCESS", reason_code: null,
        correlation_id: terminalCorrelationId, occurred_at: row.ingested_at.getTime() },
    ];
    assert.equal(terminalAudits.rowCount, expectedTerminalAudits.length,
      "TERM031_AUDIT_EVENT_COUNT_MISMATCH");
    assert.deepEqual(terminalAudits.rows.map((audit) => audit.action),
      expectedTerminalAudits.map((audit) => audit.action),
      "TERM031_AUDIT_ACTION_SET_MISMATCH");
    for (const [index, expected] of expectedTerminalAudits.entries()) {
      const actual = terminalAudits.rows[index];
      assert.equal(actual.resource_type, expected.resource_type,
        `TERM031_AUDIT_RESOURCE_TYPE_${index}_MISMATCH`);
      assert.equal(actual.resource_id, expected.resource_id,
        `TERM031_AUDIT_RESOURCE_ID_${index}_MISMATCH`);
      assert.equal(actual.result, expected.result,
        `TERM031_AUDIT_RESULT_${index}_MISMATCH`);
      assert.equal(actual.reason_code, expected.reason_code,
        `TERM031_AUDIT_REASON_CODE_${index}_MISMATCH`);
      assert.equal(actual.correlation_id, expected.correlation_id,
        `TERM031_AUDIT_CORRELATION_${index}_MISMATCH`);
      assert.ok(actual.occurred_at instanceof Date,
        `TERM031_AUDIT_TIMESTAMP_${index}_INVALID`);
      assert.equal(actual.occurred_at.getTime(), expected.occurred_at,
        `TERM031_AUDIT_TIMESTAMP_${index}_MISMATCH`);
    }
    const losingAuditCount = await inspector.query(`
      SELECT count(*)::int AS audit_count FROM audit_events
       WHERE tenant_id=$1 AND exchange_session_id=$2
         AND correlation_id = ANY($3::uuid[])`,
    [ids.tenantId, ids.sessionId,
      [competition.loserCorrelationId, competition.replayCorrelationId]]);
    assert.equal(losingAuditCount.rows[0]?.audit_count, 0,
      "TERM034_LOSER_OR_REPLAY_CREATED_AUDIT");
    const operationTerminalAuditCount = await inspector.query(`
      SELECT count(*)::int AS audit_count FROM audit_events
       WHERE tenant_id=$1 AND exchange_session_id=$2 AND correlation_id=$5 AND (
         (action IN ('PACS_TRANSFER_COMPLETED','INTEGRITY_VERIFIED')
           AND resource_type='STUDY' AND resource_id=$3)
         OR (action='PACS_TRANSFER_OPERATION_STATE_CHANGED'
           AND resource_type='PACS_TRANSFER_OPERATION' AND resource_id=$4
           AND reason_code='COMPLETED')
         OR (action='SESSION_COMPLETED'
           AND resource_type='EXCHANGE_SESSION' AND resource_id=$2))`,
    [ids.tenantId, ids.sessionId, ids.studyRefId, fixtureOperationId, terminalCorrelationId]);
    assert.equal(operationTerminalAuditCount.rows[0]?.audit_count, 4,
      "TERM034_TERMINAL_AUDIT_NOT_EXACTLY_ONCE");
    console.error("TERM034_CONCURRENCY_REPLAY=PASS winner=1 loser=CONFLICT replay=CONFLICT");
    stage = "TERM031_COMMITTED_STATE_INDEPENDENTLY_CONFIRMED";
    console.error(`TERM030_STAGE=${stage}`);

    const boundaryIds = {
      tenantId: ids.tenantId,
      actorId: ids.actorId,
      hospitalId: ids.hospitalId,
      sourceHospitalId: ids.sourceHospitalId,
      sessionId: ids.boundarySessionId,
      packageId: ids.boundaryPackageId,
      studyRefId: ids.boundaryStudyRefId,
      consentId: ids.boundaryConsentId,
      grantId: ids.boundaryGrantId,
    };
    stageFamily = "TERM035";
    stage = "TWO_STUDY_FIXTURE_CHECK";
    const packageStudyCount = await inspector.query(`
      SELECT count(*)::int AS study_count FROM study_references
       WHERE package_id=$1`, [boundaryIds.packageId]);
    assert.equal(packageStudyCount.rows[0]?.study_count, 2,
      "TERM035_FIXTURE_NOT_EXACTLY_TWO_STUDIES");

    stage = "TERM035_SYNTHETIC_FIXTURE_PREPARE";
    const multiStudy = await prepareSyntheticTerminalizationScenario(
      client, boundaryIds, (nextStage) => { stage = `TERM035_${nextStage}`; },
    );
    stage = "TERM035_SIBLING_PRESTATE_SNAPSHOT";
    const siblingBefore = await inspector.query(`
      SELECT study_ref_id, xmin::text AS study_xmin,
             (SELECT count(*)::int FROM pacs_transfer_operations operation
               WHERE operation.study_ref_id=study.study_ref_id) AS operation_count,
             (SELECT count(*)::int FROM provenance_records provenance
               WHERE provenance.study_ref_id=study.study_ref_id) AS provenance_count,
             (SELECT count(*)::int FROM integrity_evidence evidence
               WHERE evidence.study_ref_id=study.study_ref_id) AS integrity_count
        FROM study_references study WHERE study_ref_id=$1`,
    [ids.boundarySiblingStudyRefId]);
    assert.equal(siblingBefore.rowCount, 1, "TERM035_SIBLING_REFERENCE_MISSING");
    stage = "TERM035_SCOPE_FINGERPRINT_BEFORE";
    const multiCorrelationId = randomUUID();
    const multiScopeBefore = await terminalizationScopeFingerprint(
      inspector, multiStudy.operationId, boundaryIds.sessionId, multiCorrelationId,
    );
    stage = "TERM035_RUNTIME_TENANT_CONTEXT";
    await beginTenant(client, ids.tenantId);
    stage = "TERM035_REPOSITORY_FINALIZE";
    const diagnosticClient = terminalizationQueryDiagnosticClient(
      client,
      (nextStage) => { stage = nextStage; },
      "TERM035",
      async (category, args) => {
        if (category !== "PROVENANCE_UPDATE") return;
        const parameters = args[1];
        if (!Array.isArray(parameters) || !(parameters[0] instanceof Date) ||
            typeof parameters[2] !== "string") {
          console.error("TERM035_FACTS_DIAGNOSTIC=UNAVAILABLE:INPUT_SHAPE");
          return;
        }
        await terminalizationFactsDiagnosticWithinSavepoint(
          client, "TERM035", parameters[2], parameters[0], multiCorrelationId,
        );
      },
    );
    const multiResult = await new PostgresPacsTransferTerminalizationRepository(diagnosticClient)
      .finalize({
        operationId: multiStudy.operationId,
        context: multiStudy.context,
        correlationId: multiCorrelationId,
      });
    assert.equal(multiResult.state, "COMPLETED", "TERM035_SELECTED_STUDY_NOT_COMPLETED");
    assert.equal(multiResult.sessionState, "ACTIVE", "TERM035_SESSION_CLOSED_WITH_SIBLING");
    stage = "TERM035_COMMIT";
    await client.query("COMMIT");
    stage = "TERM035_POSTCOMMIT_SNAPSHOT";
    const multiTarget = await terminalizationTargetSnapshot(
      inspector, multiStudy.operationId, multiCorrelationId,
    );
    assert.equal(multiTarget.state, "COMPLETED", "TERM035_OPERATION_STATE_MISMATCH");
    assert.equal(multiTarget.transfer_status, "COMPLETED", "TERM035_PROVENANCE_STATE_MISMATCH");
    assert.equal(multiTarget.session_state, "ACTIVE", "TERM035_SESSION_NOT_ACTIVE");
    assert.equal(multiTarget.completed_at, null, "TERM035_SESSION_COMPLETION_TIME_PRESENT");
    assert.equal(multiTarget.terminal_audit_count, 3, "TERM035_TERMINAL_AUDIT_CARDINALITY_MISMATCH");
    const sessionAudit = await inspector.query(`
      SELECT count(*)::int AS audit_count FROM audit_events
       WHERE tenant_id=$1 AND exchange_session_id=$2 AND correlation_id=$3
         AND action='SESSION_COMPLETED'`,
    [ids.tenantId, boundaryIds.sessionId, multiCorrelationId]);
    assert.equal(sessionAudit.rows[0]?.audit_count, 0, "TERM035_SESSION_COMPLETION_AUDIT_PRESENT");
    const siblingAfter = await inspector.query(`
      SELECT study_ref_id, xmin::text AS study_xmin,
             (SELECT count(*)::int FROM pacs_transfer_operations operation
               WHERE operation.study_ref_id=study.study_ref_id) AS operation_count,
             (SELECT count(*)::int FROM provenance_records provenance
               WHERE provenance.study_ref_id=study.study_ref_id) AS provenance_count,
             (SELECT count(*)::int FROM integrity_evidence evidence
               WHERE evidence.study_ref_id=study.study_ref_id) AS integrity_count
        FROM study_references study WHERE study_ref_id=$1`,
    [ids.boundarySiblingStudyRefId]);
    assert.deepEqual(siblingAfter.rows, siblingBefore.rows,
      "TERM035_SIBLING_ROWS_CHANGED");
    const multiScopeAfter = await terminalizationScopeFingerprint(
      inspector, multiStudy.operationId, boundaryIds.sessionId, multiCorrelationId,
    );
    assert.deepEqual(multiScopeAfter, multiScopeBefore, "TERM035_UNRELATED_ROWS_CHANGED");
    console.error("TERM035_MULTI_STUDY=PASS selected_study=COMPLETED session=ACTIVE sibling=UNCHANGED");

    stageFamily = "TERM036";
    stage = "SAME_PRINCIPAL_FIXTURE_START";
    const sharedPrincipalIds = { ...boundaryIds, studyRefId: ids.boundarySiblingStudyRefId };
    const sharedPrincipalScenario = await prepareSyntheticTerminalizationScenario(
      client, sharedPrincipalIds, (nextStage) => { stage = nextStage; },
    );
    stage = "SAME_PRINCIPAL_TARGET_SNAPSHOT";
    const sharedCorrelationId = randomUUID();
    const directBefore = await terminalizationTargetSnapshot(
      inspector, sharedPrincipalScenario.operationId, sharedCorrelationId,
    );
    assert.equal(directBefore.state, "VERIFYING", "TERM036_PRESTATE_NOT_VERIFYING");
    assert.equal(directBefore.version, 3, "TERM036_PRESTATE_VERSION_INVALID");
    assert.equal(directBefore.transfer_status, "PENDING", "TERM036_PRESTATE_PROVENANCE_NOT_PENDING");
    const directScopeBefore = await terminalizationScopeFingerprint(
      inspector, sharedPrincipalScenario.operationId, boundaryIds.sessionId, sharedCorrelationId,
    );
    stage = "SAME_PRINCIPAL_RUNTIME_CONTEXT";
    await beginTenant(client, ids.tenantId);
    const runtimeIdentity = await client.query(
      "SELECT current_user AS role_name, current_setting('mediq.tenant_id', true) AS tenant_id",
    );
    assert.equal(runtimeIdentity.rows[0]?.role_name, "mediq_runtime",
      "TERM036_RUNTIME_ROLE_MISMATCH");
    assert.equal(runtimeIdentity.rows[0]?.tenant_id, ids.tenantId,
      "TERM036_TENANT_CONTEXT_MISMATCH");
    stage = "SAME_PRINCIPAL_TERMINAL_CORRELATION";
    await client.query(
      "SELECT set_config('mediq.terminal_correlation_id', $1, true)", [sharedCorrelationId],
    );
    const directCompletedAt = (await client.query(
      "SELECT clock_timestamp() AS completed_at",
    )).rows[0]?.completed_at;
    assert.ok(directCompletedAt instanceof Date, "TERM036_COMPLETION_TIME_UNAVAILABLE");
    const directEvents = [
      { action: "PACS_TRANSFER_COMPLETED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "INTEGRITY_VERIFIED", resourceType: "STUDY", reasonCode: null,
        resourceId: (_operationId, fixtureIds) => fixtureIds.studyRefId },
      { action: "PACS_TRANSFER_OPERATION_STATE_CHANGED", resourceType: "PACS_TRANSFER_OPERATION",
        reasonCode: "COMPLETED", resourceId: (operationId) => operationId },
    ];
    for (const [index, event] of directEvents.entries()) {
      stage = `SAME_PRINCIPAL_TERMINAL_AUDIT_${index + 1}`;
      const inserted = await insertTerminalAudit(
        client, sharedPrincipalIds, sharedPrincipalScenario.operationId,
        event, sharedCorrelationId, directCompletedAt,
      );
      assert.equal(inserted.rowCount, 1, `TERM036_AUDIT_INSERT_REJECTED_${event.action}`);
    }
    stage = "SAME_PRINCIPAL_TERMINAL_FACTS_PRECHECK";
    const terminalFacts = await client.query(`
      SELECT public.pacs_transfer_terminal_facts_valid($1::uuid, $2::timestamptz, $3::uuid)
        AS facts_valid`,
    [sharedPrincipalScenario.operationId, directCompletedAt, sharedCorrelationId]);
    if (terminalFacts.rows[0]?.facts_valid !== true) {
      stage = "SAME_PRINCIPAL_FACTS_GROUP_DIAGNOSTICS";
      const factsGroups = await terminalizationFactsExactCategoryDiagnostics(
        client, sharedPrincipalScenario.operationId, directCompletedAt, sharedCorrelationId,
      );
      console.error(`TERM036_FACTS_GROUPS=${Object.entries({
        canonical: terminalFacts.rows[0]?.facts_valid === true,
        ...factsGroups,
      }).map(([name, value]) => `${name}=${value}`).join(";")}`);
    }
    assert.equal(terminalFacts.rows[0]?.facts_valid, true,
      "TERM036_DATABASE_TERMINAL_FACTS_REJECTED");
    stage = "SAME_PRINCIPAL_PROVENANCE_UPDATE";
    const provenanceUpdate = await client.query(`
      UPDATE provenance_records
         SET transfer_status='COMPLETED', ingested_at=$1, transferred_at=$1
       WHERE operation_id=$2 AND exchange_session_id=$3 AND study_ref_id=$4
         AND transfer_type='PACS_IMPORT' AND transfer_status='PENDING'
         AND integrity_id=$5 AND ingested_at IS NULL AND transferred_at IS NULL`,
    [directCompletedAt, sharedPrincipalScenario.operationId, boundaryIds.sessionId,
      sharedPrincipalIds.studyRefId, directBefore.integrity_id]);
    assert.equal(provenanceUpdate.rowCount, 1, "TERM036_PROVENANCE_UPDATE_REJECTED");
    stage = "SAME_PRINCIPAL_OPERATION_UPDATE";
    const operationUpdate = await client.query(`
      UPDATE pacs_transfer_operations
         SET state='COMPLETED', version=4, reason_code='COMPLETED',
             source_object_count=$1, destination_object_count=$2, updated_at=$3
       WHERE operation_id=$4 AND tenant_id=$5 AND actor_id=$6
         AND exchange_session_id=$7 AND study_ref_id=$8
         AND state='VERIFYING' AND version=3
         AND source_object_count=$1 AND destination_object_count IS NULL`,
    [directBefore.source_object_count, directBefore.source_object_count, directCompletedAt,
      sharedPrincipalScenario.operationId, ids.tenantId, ids.actorId,
      boundaryIds.sessionId, sharedPrincipalIds.studyRefId]);
    assert.equal(operationUpdate.rowCount, 1, "TERM036_OPERATION_UPDATE_REJECTED");
    stage = "SAME_PRINCIPAL_COMMIT";
    await client.query("COMMIT");
    const directAfter = await terminalizationTargetSnapshot(
      inspector, sharedPrincipalScenario.operationId, sharedCorrelationId,
    );
    assert.equal(directAfter.state, "COMPLETED", "TERM036_COHERENT_SQL_NOT_ACCEPTED");
    assert.equal(directAfter.version, 4, "TERM036_OPERATION_VERSION_MISMATCH");
    assert.equal(directAfter.transfer_status, "COMPLETED", "TERM036_PROVENANCE_NOT_COMPLETED");
    assert.equal(directAfter.terminal_audit_count, 3, "TERM036_AUDIT_CARDINALITY_MISMATCH");
    assert.equal(directAfter.session_state, "ACTIVE", "TERM036_MULTI_STUDY_SESSION_NOT_ACTIVE");
    assert.equal(directAfter.completed_at, null, "TERM036_SESSION_COMPLETION_TIME_PRESENT");
    const directScopeAfter = await terminalizationScopeFingerprint(
      inspector, sharedPrincipalScenario.operationId, boundaryIds.sessionId, sharedCorrelationId,
    );
    assert.deepEqual(directScopeAfter, directScopeBefore, "TERM036_UNRELATED_ROWS_CHANGED");
    console.error("TERM036_SHARED_PRINCIPAL_DIRECT_SQL=ACCEPTED role=mediq_runtime product_authorization=NOT_PROVEN stow=NOT_PROVEN");
  } catch (error) {
    console.error(`${stageFamily}_STAGE=${stage}`);
    const errorMessagePrefix = typeof error?.message === "string"
      ? error.message.split(/\r?\n/, 1)[0]
      : "";
    const safeError = /^(?:TERM(?:020|03[0-6])_[A-Z0-9_]+|PACS_TRANSFER_TERMINALIZATION_[A-Z_]+|[A-Z0-9]{5})$/
      .test(errorMessagePrefix)
      ? errorMessagePrefix
      : (typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
        ? error.code
        : (error?.name === "AssertionError" ? "ASSERTION_FAILED" : "UNCLASSIFIED"));
    console.error(`${stageFamily}_ERROR=${safeError}`);
    throw error;
  } finally {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* cleanup only */ }
      client.release();
    }
    await runtime.end();
    await inspector.end();
  }
});
