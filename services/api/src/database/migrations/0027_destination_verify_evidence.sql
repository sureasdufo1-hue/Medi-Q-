ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_destination_verify_binding_check" CHECK (verification_stage <> 'DESTINATION_VERIFY' OR (
        operation_id IS NOT NULL
        AND study_ref_id IS NOT NULL
        AND algorithm = 'SHA256-MANIFEST-V1'
        AND source_digest IS NOT NULL
        AND source_digest ~ '^sha256:[0-9a-f]{64}$'
        AND destination_digest IS NOT NULL
        AND destination_digest ~ '^sha256:[0-9a-f]{64}$'
        AND destination_digest = source_digest
        AND source_object_count IS NOT NULL
        AND source_object_count > 0
        AND destination_object_count IS NOT NULL
        AND destination_object_count = source_object_count
        AND status = 'VERIFIED'
        AND verified_at IS NOT NULL
        AND created_at >= verified_at
      ));
--> statement-breakpoint
REVOKE ALL PRIVILEGES (destination_digest, destination_object_count)
  ON TABLE integrity_evidence FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT SELECT (destination_digest, destination_object_count),
  INSERT (destination_digest, destination_object_count)
  ON TABLE integrity_evidence TO mediq_runtime;
--> statement-breakpoint
REVOKE UPDATE (integrity_id)
  ON TABLE provenance_records FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT UPDATE (integrity_id)
  ON TABLE provenance_records TO mediq_runtime;
--> statement-breakpoint
CREATE FUNCTION public.enforce_destination_integrity_insert_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.verification_stage <> 'DESTINATION_VERIFY' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pacs_transfer_operations AS op
      JOIN public.exchange_sessions AS es
        ON es.session_id = op.exchange_session_id
      JOIN public.imaging_packages AS p
        ON p.package_id = NEW.package_id
       AND p.exchange_session_id = es.session_id
       AND p.source_hospital_id = es.source_hospital_id
      JOIN public.study_references AS sr
        ON sr.study_ref_id = NEW.study_ref_id
       AND sr.package_id = p.package_id
       AND sr.source_hospital_id = es.source_hospital_id
      JOIN public.integrity_evidence AS src
        ON src.operation_id = op.operation_id
       AND src.exchange_session_id = es.session_id
       AND src.package_id = p.package_id
       AND src.study_ref_id = sr.study_ref_id
       AND src.verification_stage = 'SOURCE_CAPTURE'
       AND src.status = 'PENDING'
       AND src.verified_at IS NULL
       AND src.integrity_id <> NEW.integrity_id
      JOIN public.provenance_records AS pr
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
     WHERE op.operation_id = NEW.operation_id
       AND op.exchange_session_id = NEW.exchange_session_id
       AND op.study_ref_id = NEW.study_ref_id
       AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
       AND op.state = 'VERIFYING'
       AND op.version = 3
       AND op.destination_object_count IS NULL
       AND op.source_object_count = NEW.source_object_count
       AND op.stow_started_at IS NOT NULL
       AND op.stow_started_at >= op.created_at
       AND op.stow_started_at <= op.updated_at
       AND src.algorithm = NEW.algorithm
       AND src.source_digest = NEW.source_digest
       AND src.source_object_count = NEW.source_object_count
       AND NEW.destination_digest = NEW.source_digest
       AND NEW.destination_object_count = NEW.source_object_count
       AND sr.temporary_payload_state = 'PURGED'
       AND sr.temporary_storage_ref IS NOT NULL
       AND sr.temporary_payload_purged_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.audit_events AS purge_audit
          WHERE purge_audit.tenant_id = op.tenant_id
            AND purge_audit.exchange_session_id = es.session_id
            AND purge_audit.resource_type = 'STUDY'
            AND purge_audit.resource_id = sr.study_ref_id
            AND purge_audit.action = 'PACS_TEMPORARY_OBJECT_PURGED'
            AND purge_audit.result = 'SUCCESS'
            AND purge_audit.occurred_at = sr.temporary_payload_purged_at
       )
       AND EXISTS (
         SELECT 1 FROM public.audit_events AS verify_audit
          WHERE verify_audit.tenant_id = op.tenant_id
            AND verify_audit.actor_id = op.actor_id
            AND verify_audit.exchange_session_id = es.session_id
            AND verify_audit.resource_type = 'STUDY'
            AND verify_audit.resource_id = sr.study_ref_id
            AND verify_audit.action = 'PACS_DESTINATION_VERIFY_AUTHORIZED'
            AND verify_audit.result = 'ALLOW'
            AND verify_audit.reason_code = 'FINAL'
            AND verify_audit.occurred_at >= op.stow_started_at
            AND verify_audit.occurred_at <= NEW.verified_at
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
            AND verifying_audit.occurred_at = op.updated_at
       )
       AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = op.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DESTINATION_INTEGRITY_BINDING_INVALID',
      CONSTRAINT = 'integrity_evidence_destination_verify_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.enforce_provenance_destination_integrity_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.integrity_id IS NOT DISTINCT FROM OLD.integrity_id THEN
    RETURN NEW;
  END IF;

  IF OLD.integrity_id IS NOT NULL
     OR NEW.integrity_id IS NULL
     OR OLD.transfer_type <> 'PACS_IMPORT'
     OR OLD.transfer_status <> 'PENDING'
     OR OLD.ingested_at IS NOT NULL
     OR OLD.transferred_at IS NOT NULL
     OR ROW(NEW.provenance_id, NEW.exchange_session_id, NEW.package_id,
            NEW.study_ref_id, NEW.source_hospital_id, NEW.destination_hospital_id,
            NEW.operation_id, NEW.transfer_type, NEW.transfer_status,
            NEW.ingested_at, NEW.transferred_at, NEW.created_at)
        IS DISTINCT FROM
        ROW(OLD.provenance_id, OLD.exchange_session_id, OLD.package_id,
            OLD.study_ref_id, OLD.source_hospital_id, OLD.destination_hospital_id,
            OLD.operation_id, OLD.transfer_type, OLD.transfer_status,
            OLD.ingested_at, OLD.transferred_at, OLD.created_at)
     OR NOT EXISTS (
       SELECT 1
         FROM public.integrity_evidence AS dst
         JOIN public.integrity_evidence AS src
           ON src.operation_id = dst.operation_id
          AND src.exchange_session_id = dst.exchange_session_id
          AND src.package_id = dst.package_id
          AND src.study_ref_id = dst.study_ref_id
          AND src.verification_stage = 'SOURCE_CAPTURE'
          AND src.status = 'PENDING'
          AND src.verified_at IS NULL
         JOIN public.pacs_transfer_operations AS op
           ON op.operation_id = dst.operation_id
         JOIN public.exchange_sessions AS es
           ON es.session_id = op.exchange_session_id
         JOIN public.imaging_packages AS p
           ON p.package_id = dst.package_id
          AND p.exchange_session_id = es.session_id
          AND p.source_hospital_id = es.source_hospital_id
         JOIN public.study_references AS sr
           ON sr.study_ref_id = dst.study_ref_id
          AND sr.package_id = p.package_id
          AND sr.source_hospital_id = es.source_hospital_id
        WHERE dst.integrity_id = NEW.integrity_id
          AND dst.operation_id = NEW.operation_id
          AND dst.exchange_session_id = NEW.exchange_session_id
          AND dst.package_id = NEW.package_id
          AND dst.study_ref_id = NEW.study_ref_id
          AND dst.verification_stage = 'DESTINATION_VERIFY'
          AND dst.status = 'VERIFIED'
          AND dst.algorithm = src.algorithm
          AND dst.source_digest = src.source_digest
          AND dst.source_object_count = src.source_object_count
          AND dst.destination_digest = dst.source_digest
          AND dst.destination_object_count = dst.source_object_count
          AND dst.verified_at IS NOT NULL
          AND dst.created_at >= dst.verified_at
          AND src.integrity_id <> dst.integrity_id
          AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
          AND op.state = 'VERIFYING'
          AND op.version = 3
          AND op.source_object_count = dst.source_object_count
          AND op.destination_object_count IS NULL
          AND op.stow_started_at IS NOT NULL
          AND op.stow_started_at <= op.updated_at
          AND sr.temporary_payload_state = 'PURGED'
          AND sr.temporary_payload_purged_at IS NOT NULL
          AND OLD.exchange_session_id = es.session_id
          AND OLD.package_id = p.package_id
          AND OLD.study_ref_id = sr.study_ref_id
          AND OLD.source_hospital_id = es.source_hospital_id
          AND OLD.destination_hospital_id = es.destination_hospital_id
          AND EXISTS (
            SELECT 1 FROM public.audit_events AS purge_audit
             WHERE purge_audit.tenant_id = op.tenant_id
               AND purge_audit.exchange_session_id = es.session_id
               AND purge_audit.resource_type = 'STUDY'
               AND purge_audit.resource_id = sr.study_ref_id
               AND purge_audit.action = 'PACS_TEMPORARY_OBJECT_PURGED'
               AND purge_audit.result = 'SUCCESS'
               AND purge_audit.occurred_at = sr.temporary_payload_purged_at
          )
          AND EXISTS (
            SELECT 1 FROM public.audit_events AS verify_audit
             WHERE verify_audit.tenant_id = op.tenant_id
               AND verify_audit.actor_id = op.actor_id
               AND verify_audit.exchange_session_id = es.session_id
               AND verify_audit.resource_type = 'STUDY'
               AND verify_audit.resource_id = sr.study_ref_id
               AND verify_audit.action = 'PACS_DESTINATION_VERIFY_AUTHORIZED'
               AND verify_audit.result = 'ALLOW'
               AND verify_audit.reason_code = 'FINAL'
               AND verify_audit.occurred_at >= op.stow_started_at
               AND verify_audit.occurred_at <= dst.verified_at
          )
          AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = op.tenant_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PROVENANCE_DESTINATION_INTEGRITY_LINK_INVALID',
      CONSTRAINT = 'provenance_records_destination_integrity_link_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_destination_integrity_insert_binding() FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_provenance_destination_integrity_link() FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
CREATE TRIGGER integrity_evidence_destination_verify_binding_trigger
  BEFORE INSERT ON integrity_evidence
  FOR EACH ROW EXECUTE FUNCTION public.enforce_destination_integrity_insert_binding();
--> statement-breakpoint
CREATE TRIGGER provenance_records_destination_integrity_link_trigger
  BEFORE UPDATE ON provenance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provenance_destination_integrity_link();
