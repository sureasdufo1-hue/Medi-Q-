-- Custom SQL migration file, put your code below! --
-- PACS-001-DEC-024 / DEC-025: terminalize only a bound, verified one-Study import.
-- The runtime principal is shared: these invoker guards validate facts, not caller identity.
CREATE FUNCTION public.pacs_transfer_terminal_facts_valid(
  p_operation_id uuid,
  p_completed_at timestamptz,
  p_correlation_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('mediq.tenant_id', true), '')::uuid IS NOT NULL
     AND p_operation_id IS NOT NULL
     AND p_completed_at IS NOT NULL
     AND p_correlation_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.pacs_transfer_operations AS op
         JOIN public.exchange_sessions AS es
           ON es.session_id = op.exchange_session_id
         JOIN public.actors AS actor
           ON actor.actor_id = op.actor_id
          AND actor.tenant_id = op.tenant_id
          AND actor.hospital_id = es.destination_hospital_id
          AND actor.status = 'ACTIVE'
         JOIN public.hospitals AS destination
           ON destination.hospital_id = es.destination_hospital_id
          AND destination.tenant_id = op.tenant_id
          AND destination.status = 'ACTIVE'
         JOIN public.tenants AS tenant
           ON tenant.tenant_id = op.tenant_id
          AND tenant.status = 'ACTIVE'
         JOIN public.imaging_packages AS package
           ON package.exchange_session_id = es.session_id
          AND package.patient_ref_id = es.patient_ref_id
          AND package.source_hospital_id = es.source_hospital_id
          AND package.state IN ('AVAILABLE', 'IN_EXCHANGE')
          AND package.deleted_at IS NULL
          AND (package.retention_expires_at IS NULL OR package.retention_expires_at > p_completed_at)
         JOIN public.study_references AS study
           ON study.study_ref_id = op.study_ref_id
          AND study.package_id = package.package_id
          AND study.source_hospital_id = es.source_hospital_id
         JOIN public.provenance_records AS provenance
           ON provenance.operation_id = op.operation_id
          AND provenance.exchange_session_id = es.session_id
          AND provenance.package_id = package.package_id
          AND provenance.study_ref_id = study.study_ref_id
          AND provenance.source_hospital_id = es.source_hospital_id
          AND provenance.destination_hospital_id = es.destination_hospital_id
          AND provenance.transfer_type = 'PACS_IMPORT'
          AND provenance.integrity_id IS NOT NULL
         JOIN public.integrity_evidence AS destination_evidence
           ON destination_evidence.integrity_id = provenance.integrity_id
          AND destination_evidence.operation_id = op.operation_id
          AND destination_evidence.exchange_session_id = es.session_id
          AND destination_evidence.package_id = package.package_id
          AND destination_evidence.study_ref_id = study.study_ref_id
          AND destination_evidence.verification_stage = 'DESTINATION_VERIFY'
          AND destination_evidence.status = 'VERIFIED'
          AND destination_evidence.algorithm = 'SHA256-MANIFEST-V1'
          AND destination_evidence.source_digest IS NOT NULL
          AND destination_evidence.destination_digest = destination_evidence.source_digest
          AND destination_evidence.destination_object_count = destination_evidence.source_object_count
          AND destination_evidence.verified_at IS NOT NULL
          AND destination_evidence.created_at >= destination_evidence.verified_at
         JOIN public.integrity_evidence AS source_evidence
           ON source_evidence.operation_id = op.operation_id
          AND source_evidence.exchange_session_id = es.session_id
          AND source_evidence.package_id = package.package_id
          AND source_evidence.study_ref_id = study.study_ref_id
          AND source_evidence.verification_stage = 'SOURCE_CAPTURE'
          AND source_evidence.status = 'PENDING'
          AND source_evidence.verified_at IS NULL
          AND source_evidence.integrity_id <> destination_evidence.integrity_id
          AND source_evidence.algorithm = destination_evidence.algorithm
          AND source_evidence.source_digest = destination_evidence.source_digest
          AND source_evidence.source_object_count = destination_evidence.source_object_count
        WHERE op.operation_id = p_operation_id
          AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
          AND op.actor_id = actor.actor_id
          AND op.state IN ('VERIFYING', 'COMPLETED')
          AND ((op.state = 'VERIFYING' AND op.version = 3 AND op.destination_object_count IS NULL)
            OR (op.state = 'COMPLETED' AND op.version = 4
              AND op.destination_object_count = op.source_object_count))
          AND op.source_object_count > 0
          AND op.source_object_count = source_evidence.source_object_count
          AND op.stow_started_at IS NOT NULL
          AND op.stow_started_at >= op.created_at
          AND op.stow_started_at <= op.updated_at
          AND op.updated_at <= p_completed_at
          AND es.state IN ('ACTIVE', 'COMPLETED')
          AND ((es.state = 'ACTIVE' AND es.completed_at IS NULL)
            OR (es.state = 'COMPLETED' AND es.completed_at = p_completed_at))
          AND (es.expires_at IS NULL OR es.expires_at > p_completed_at)
          AND study.temporary_payload_state = 'PURGED'
          AND study.temporary_storage_ref IS NOT NULL
          AND study.temporary_payload_purged_at IS NOT NULL
          AND p_completed_at >= destination_evidence.created_at
          AND ((provenance.transfer_status = 'PENDING'
                AND provenance.ingested_at IS NULL AND provenance.transferred_at IS NULL)
            OR (provenance.transfer_status = 'COMPLETED'
                AND provenance.ingested_at = p_completed_at
                AND provenance.transferred_at = p_completed_at))
          AND EXISTS (
            SELECT 1
              FROM public.consents AS consent
              JOIN public.consent_actions AS consent_action
                ON consent_action.consent_id = consent.consent_id
               AND consent_action.action = 'PACS_IMPORT'
              JOIN public.transfer_grants AS grant_record
                ON grant_record.exchange_session_id = es.session_id
               AND grant_record.consent_id = consent.consent_id
               AND grant_record.recipient_tenant_id = op.tenant_id
               AND grant_record.recipient_hospital_id = es.destination_hospital_id
               AND (grant_record.recipient_actor_id IS NULL OR grant_record.recipient_actor_id = op.actor_id)
               AND grant_record.imaging_package_id = package.package_id
               AND grant_record.status = 'ACTIVE'
               AND grant_record.revoked_at IS NULL
               AND grant_record.issued_at <= p_completed_at
               AND grant_record.expires_at > p_completed_at
              JOIN public.transfer_grant_scopes AS grant_scope
                ON grant_scope.grant_id = grant_record.grant_id
               AND grant_scope.scope = 'study:pacs-transfer'
             WHERE consent.exchange_session_id = es.session_id
               AND consent.patient_ref_id = es.patient_ref_id
               AND consent.source_hospital_id = es.source_hospital_id
               AND consent.destination_hospital_id = es.destination_hospital_id
               AND (consent.imaging_package_id IS NULL OR consent.imaging_package_id = package.package_id)
               AND consent.status = 'ACTIVE'
               AND consent.withdrawn_at IS NULL
               AND consent.issued_at <= p_completed_at
               AND (consent.expires_at IS NULL OR consent.expires_at > p_completed_at)
               AND NOT EXISTS (
                 SELECT 1 FROM public.consent_actions AS other_action
                  WHERE other_action.consent_id = consent.consent_id
                    AND other_action.action NOT IN ('VIEW', 'DOWNLOAD', 'PACS_IMPORT')
               )
               AND NOT EXISTS (
                 SELECT 1 FROM public.transfer_grant_scopes AS other_scope
                  WHERE other_scope.grant_id = grant_record.grant_id
                    AND (other_scope.scope NOT IN ('study:view', 'study:download', 'study:pacs-transfer')
                      OR (other_scope.scope = 'study:view' AND NOT EXISTS (
                        SELECT 1 FROM public.consent_actions ca
                         WHERE ca.consent_id = consent.consent_id AND ca.action = 'VIEW'))
                      OR (other_scope.scope = 'study:download' AND NOT EXISTS (
                        SELECT 1 FROM public.consent_actions ca
                         WHERE ca.consent_id = consent.consent_id AND ca.action = 'DOWNLOAD'))
                      OR (other_scope.scope = 'study:pacs-transfer' AND NOT EXISTS (
                        SELECT 1 FROM public.consent_actions ca
                         WHERE ca.consent_id = consent.consent_id AND ca.action = 'PACS_IMPORT')))
               )
          )
          AND EXISTS (
            SELECT 1 FROM public.audit_events AS purge_audit
             WHERE purge_audit.tenant_id = op.tenant_id
               AND purge_audit.exchange_session_id = es.session_id
               AND purge_audit.resource_type = 'STUDY'
               AND purge_audit.resource_id = study.study_ref_id
               AND purge_audit.action = 'PACS_TEMPORARY_OBJECT_PURGED'
               AND purge_audit.result = 'SUCCESS'
               AND purge_audit.occurred_at = study.temporary_payload_purged_at
          )
          AND EXISTS (
            SELECT 1 FROM public.audit_events AS preflight_audit
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
            SELECT 1 FROM public.audit_events AS dispatch_audit
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
            SELECT 1 FROM public.audit_events AS verifying_audit
             WHERE verifying_audit.tenant_id = op.tenant_id
               AND verifying_audit.actor_id = op.actor_id
               AND verifying_audit.exchange_session_id = es.session_id
               AND verifying_audit.resource_type = 'PACS_TRANSFER_OPERATION'
               AND verifying_audit.resource_id = op.operation_id
               AND verifying_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
               AND verifying_audit.result = 'SUCCESS'
               AND verifying_audit.reason_code = 'VERIFYING'
               AND verifying_audit.occurred_at >= op.stow_started_at
               AND verifying_audit.occurred_at <= destination_evidence.verified_at
          )
          AND EXISTS (
            SELECT 1 FROM public.audit_events AS destination_audit
             WHERE destination_audit.tenant_id = op.tenant_id
               AND destination_audit.actor_id = op.actor_id
               AND destination_audit.exchange_session_id = es.session_id
               AND destination_audit.resource_type = 'STUDY'
               AND destination_audit.resource_id = study.study_ref_id
               AND destination_audit.action = 'PACS_DESTINATION_VERIFY_AUTHORIZED'
               AND destination_audit.result = 'ALLOW'
               AND destination_audit.reason_code = 'FINAL'
               AND destination_audit.occurred_at >= op.stow_started_at
               AND destination_audit.occurred_at <= destination_evidence.verified_at
          )
          AND (SELECT count(*) FROM public.audit_events AS transfer_audit
                WHERE transfer_audit.tenant_id = op.tenant_id
                  AND transfer_audit.actor_id = op.actor_id
                  AND transfer_audit.exchange_session_id = es.session_id
                  AND transfer_audit.resource_type = 'STUDY'
                  AND transfer_audit.resource_id = study.study_ref_id
                  AND transfer_audit.action = 'PACS_TRANSFER_COMPLETED'
                  AND transfer_audit.result = 'SUCCESS'
                  AND transfer_audit.reason_code IS NULL
                  AND transfer_audit.occurred_at = p_completed_at
                  AND transfer_audit.correlation_id = p_correlation_id) = 1
          AND (SELECT count(*) FROM public.audit_events AS integrity_audit
                WHERE integrity_audit.tenant_id = op.tenant_id
                  AND integrity_audit.actor_id = op.actor_id
                  AND integrity_audit.exchange_session_id = es.session_id
                  AND integrity_audit.resource_type = 'STUDY'
                  AND integrity_audit.resource_id = study.study_ref_id
                  AND integrity_audit.action = 'INTEGRITY_VERIFIED'
                  AND integrity_audit.result = 'SUCCESS'
                  AND integrity_audit.reason_code IS NULL
                  AND integrity_audit.occurred_at = p_completed_at
                  AND integrity_audit.correlation_id = p_correlation_id) = 1
          AND (SELECT count(*) FROM public.audit_events AS operation_audit
                WHERE operation_audit.tenant_id = op.tenant_id
                  AND operation_audit.actor_id = op.actor_id
                  AND operation_audit.exchange_session_id = es.session_id
                  AND operation_audit.resource_type = 'PACS_TRANSFER_OPERATION'
                  AND operation_audit.resource_id = op.operation_id
                  AND operation_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
                  AND operation_audit.result = 'SUCCESS'
                  AND operation_audit.reason_code = 'COMPLETED'
                  AND operation_audit.occurred_at = p_completed_at
                  AND operation_audit.correlation_id = p_correlation_id) = 1
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pacs_transfer_terminal_facts_valid(uuid, timestamptz, uuid) FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pacs_transfer_terminal_facts_valid(uuid, timestamptz, uuid) TO mediq_runtime;
--> statement-breakpoint
REVOKE UPDATE (transfer_status, ingested_at, transferred_at)
  ON TABLE provenance_records FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT UPDATE (transfer_status, ingested_at, transferred_at)
  ON TABLE provenance_records TO mediq_runtime;
--> statement-breakpoint
REVOKE UPDATE (completed_at)
  ON TABLE exchange_sessions FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT UPDATE (completed_at)
  ON TABLE exchange_sessions TO mediq_runtime;
--> statement-breakpoint
CREATE FUNCTION public.enforce_pacs_import_provenance_terminalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  terminal_correlation_id uuid;
BEGIN
  IF ROW(NEW.transfer_status, NEW.ingested_at, NEW.transferred_at)
       IS NOT DISTINCT FROM ROW(OLD.transfer_status, OLD.ingested_at, OLD.transferred_at) THEN
    RETURN NEW;
  END IF;

  SELECT transfer_audit.correlation_id
    INTO terminal_correlation_id
    FROM public.audit_events AS transfer_audit
    JOIN public.pacs_transfer_operations AS op
      ON op.operation_id = NEW.operation_id
   WHERE transfer_audit.tenant_id = op.tenant_id
     AND transfer_audit.actor_id = op.actor_id
     AND transfer_audit.exchange_session_id = op.exchange_session_id
     AND transfer_audit.resource_type = 'STUDY'
     AND transfer_audit.resource_id = NEW.study_ref_id
     AND transfer_audit.action = 'PACS_TRANSFER_COMPLETED'
     AND transfer_audit.result = 'SUCCESS'
     AND transfer_audit.reason_code IS NULL
     AND transfer_audit.occurred_at = NEW.transferred_at
   LIMIT 1;

  IF OLD.transfer_type <> 'PACS_IMPORT'
     OR OLD.transfer_status <> 'PENDING'
     OR NEW.transfer_status <> 'COMPLETED'
     OR OLD.integrity_id IS NULL
     OR NEW.integrity_id IS DISTINCT FROM OLD.integrity_id
     OR NEW.ingested_at IS NULL
     OR NEW.transferred_at IS NULL
     OR NEW.ingested_at IS DISTINCT FROM NEW.transferred_at
     OR NEW.transferred_at < OLD.created_at
     OR ROW(NEW.provenance_id, NEW.exchange_session_id, NEW.package_id,
            NEW.study_ref_id, NEW.source_hospital_id, NEW.destination_hospital_id,
            NEW.integrity_id, NEW.operation_id, NEW.transfer_type, NEW.created_at)
        IS DISTINCT FROM
        ROW(OLD.provenance_id, OLD.exchange_session_id, OLD.package_id,
            OLD.study_ref_id, OLD.source_hospital_id, OLD.destination_hospital_id,
            OLD.integrity_id, OLD.operation_id, OLD.transfer_type, OLD.created_at)
     OR terminal_correlation_id IS NULL
     OR NOT public.pacs_transfer_terminal_facts_valid(
          NEW.operation_id, NEW.transferred_at, terminal_correlation_id)
     OR NULLIF(current_setting('mediq.tenant_id', true), '')::uuid IS DISTINCT FROM
          (SELECT op.tenant_id FROM public.pacs_transfer_operations op WHERE op.operation_id = NEW.operation_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_IMPORT_PROVENANCE_TERMINALIZATION_INVALID',
      CONSTRAINT='provenance_records_terminalization_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_pacs_import_provenance_terminalization() FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
CREATE TRIGGER provenance_records_terminalization_guard
  BEFORE UPDATE ON provenance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pacs_import_provenance_terminalization();
--> statement-breakpoint
CREATE FUNCTION public.enforce_pacs_transfer_operation_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  terminal_correlation_id uuid;
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;
  IF NEW.state <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT operation_audit.correlation_id
    INTO terminal_correlation_id
    FROM public.audit_events AS operation_audit
   WHERE operation_audit.tenant_id = NEW.tenant_id
     AND operation_audit.actor_id = NEW.actor_id
     AND operation_audit.exchange_session_id = NEW.exchange_session_id
     AND operation_audit.resource_type = 'PACS_TRANSFER_OPERATION'
     AND operation_audit.resource_id = NEW.operation_id
     AND operation_audit.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'
     AND operation_audit.result = 'SUCCESS'
     AND operation_audit.reason_code = 'COMPLETED'
     AND operation_audit.occurred_at = NEW.updated_at
   LIMIT 1;

  IF OLD.state <> 'VERIFYING'
     OR OLD.version <> 3
     OR NEW.version <> 4
     OR NEW.reason_code IS DISTINCT FROM 'COMPLETED'
     OR NEW.source_object_count IS NULL
     OR NEW.source_object_count < 1
     OR NEW.destination_object_count IS DISTINCT FROM NEW.source_object_count
     OR NEW.stow_started_at IS DISTINCT FROM OLD.stow_started_at
     OR NEW.updated_at < OLD.updated_at
     OR terminal_correlation_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.provenance_records AS provenance
        WHERE provenance.operation_id = NEW.operation_id
          AND provenance.exchange_session_id = NEW.exchange_session_id
          AND provenance.study_ref_id = NEW.study_ref_id
          AND provenance.transfer_type = 'PACS_IMPORT'
          AND provenance.transfer_status = 'COMPLETED'
          AND provenance.ingested_at = NEW.updated_at
          AND provenance.transferred_at = NEW.updated_at
          AND provenance.integrity_id IS NOT NULL
     )
     OR NOT public.pacs_transfer_terminal_facts_valid(
          NEW.operation_id, NEW.updated_at, terminal_correlation_id)
     OR NULLIF(current_setting('mediq.tenant_id', true), '')::uuid IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_COMPLETION_INVALID',
      CONSTRAINT='pacs_transfer_operations_completion_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_pacs_transfer_operation_completion() FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
CREATE TRIGGER pacs_transfer_operations_completion_guard
  BEFORE UPDATE ON pacs_transfer_operations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pacs_transfer_operation_completion();
--> statement-breakpoint
CREATE FUNCTION public.enforce_exchange_session_terminal_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  terminal_correlation_id uuid;
  bound_study_count bigint;
BEGIN
  IF NEW.state <> 'COMPLETED' AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
    RETURN NEW;
  END IF;
  IF NEW.state = OLD.state AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
    RETURN NEW;
  END IF;

  SELECT session_audit.correlation_id
    INTO terminal_correlation_id
    FROM public.audit_events AS session_audit
   WHERE session_audit.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
     AND session_audit.exchange_session_id = NEW.session_id
     AND session_audit.resource_type = 'EXCHANGE_SESSION'
     AND session_audit.resource_id = NEW.session_id
     AND session_audit.action = 'SESSION_COMPLETED'
     AND session_audit.result = 'SUCCESS'
     AND session_audit.reason_code IS NULL
     AND session_audit.occurred_at = NEW.completed_at
   LIMIT 1;

  SELECT count(*)
    INTO bound_study_count
    FROM public.imaging_packages AS package
    JOIN public.study_references AS study ON study.package_id = package.package_id
   WHERE package.exchange_session_id = NEW.session_id;

  IF OLD.state <> 'ACTIVE'
     OR OLD.completed_at IS NOT NULL
     OR NEW.state <> 'COMPLETED'
     OR NEW.completed_at IS NULL
     OR NEW.updated_at IS DISTINCT FROM NEW.completed_at
     OR bound_study_count <> 1
     OR terminal_correlation_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.pacs_transfer_operations AS op
         JOIN public.provenance_records AS provenance
           ON provenance.operation_id = op.operation_id
          AND provenance.transfer_type = 'PACS_IMPORT'
          AND provenance.transfer_status = 'COMPLETED'
          AND provenance.ingested_at = NEW.completed_at
          AND provenance.transferred_at = NEW.completed_at
        WHERE op.exchange_session_id = NEW.session_id
          AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
          AND op.state = 'COMPLETED'
          AND op.updated_at = NEW.completed_at
          AND op.actor_id IS NOT NULL
          AND (SELECT count(*) FROM public.audit_events a
                WHERE a.tenant_id = op.tenant_id
                  AND a.actor_id = op.actor_id
                  AND a.exchange_session_id = NEW.session_id
                  AND a.resource_type = 'EXCHANGE_SESSION'
                  AND a.resource_id = NEW.session_id
                  AND a.action = 'SESSION_COMPLETED'
                  AND a.result = 'SUCCESS'
                  AND a.reason_code IS NULL
                  AND a.occurred_at = NEW.completed_at
                  AND a.correlation_id = terminal_correlation_id) = 1
          AND public.pacs_transfer_terminal_facts_valid(
                op.operation_id, NEW.completed_at, terminal_correlation_id)
     )
     OR NULLIF(current_setting('mediq.tenant_id', true), '')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='EXCHANGE_SESSION_TERMINAL_COMPLETION_INVALID',
      CONSTRAINT='exchange_sessions_terminal_completion_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_exchange_session_terminal_completion() FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
CREATE TRIGGER exchange_sessions_terminal_completion_guard
  BEFORE UPDATE ON exchange_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exchange_session_terminal_completion();
