ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_reason_code_check" CHECK ("pacs_transfer_operations"."reason_code" IS NULL OR "pacs_transfer_operations"."reason_code" ~ '^[A-Z0-9_]{1,64}$');--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_completed_count_check" CHECK ("pacs_transfer_operations"."state" <> 'COMPLETED' OR (
        "pacs_transfer_operations"."source_object_count" IS NOT NULL
        AND "pacs_transfer_operations"."source_object_count" > 0
        AND "pacs_transfer_operations"."destination_object_count" = "pacs_transfer_operations"."source_object_count"
      ));
--> statement-breakpoint
CREATE FUNCTION public.enforce_pacs_transfer_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $pacs_transfer_operation_state$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'CREATED' OR NEW.version <> 0 OR NEW.stow_started_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_INITIAL_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.exchange_session_id IS DISTINCT FROM OLD.exchange_session_id
     OR NEW.study_ref_id IS DISTINCT FROM OLD.study_ref_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_digest IS DISTINCT FROM OLD.request_digest
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_BINDING_IMMUTABLE';
  END IF;

  IF NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_VERSION_INVALID';
  END IF;

  IF NOT (
    (OLD.state = 'CREATED' AND NEW.state IN ('PREFLIGHT_PASSED', 'DENIED', 'FAILED'))
    OR (OLD.state = 'PREFLIGHT_PASSED' AND NEW.state IN ('STOW_STARTED', 'DENIED', 'FAILED'))
    OR (OLD.state = 'STOW_STARTED' AND NEW.state IN ('VERIFYING', 'FAILED', 'PARTIAL', 'RESULT_UNKNOWN'))
    OR (OLD.state = 'VERIFYING' AND NEW.state IN ('COMPLETED', 'FAILED', 'PARTIAL', 'RESULT_UNKNOWN'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_TRANSITION_INVALID';
  END IF;

  IF NEW.state = 'STOW_STARTED' THEN
    IF OLD.state <> 'PREFLIGHT_PASSED'
       OR NEW.stow_started_at IS NULL
       OR NEW.stow_started_at < OLD.updated_at THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_DISPATCH_TIME_INVALID';
    END IF;
  ELSIF NEW.stow_started_at IS DISTINCT FROM OLD.stow_started_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PACS_TRANSFER_OPERATION_DISPATCH_TIME_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$pacs_transfer_operation_state$;
--> statement-breakpoint
CREATE TRIGGER pacs_transfer_operations_state_guard
  BEFORE INSERT OR UPDATE ON pacs_transfer_operations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pacs_transfer_operation_state();
