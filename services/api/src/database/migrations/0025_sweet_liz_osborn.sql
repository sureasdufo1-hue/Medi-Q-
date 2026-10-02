GRANT SELECT (temporary_payload_purged_at)
  ON TABLE public.study_references TO mediq_quota_owner;
--> statement-breakpoint
SET ROLE mediq_quota_owner;
--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ADD COLUMN "settled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reserve_temporary_payload_quota(
  p_study_ref_id uuid,
  p_storage_ref uuid,
  p_writer_id uuid,
  p_delta_bytes bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $quota_reserve$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('mediq.tenant_id', true), '')::uuid;
  v_package_id uuid;
  v_max_environment bigint;
  v_max_package bigint;
  v_environment_reserved bigint;
  v_package_reserved bigint;
  v_current_reserved bigint := 0;
  v_existing_tenant uuid;
  v_existing_study uuid;
  v_existing_package uuid;
  v_existing_writer uuid;
  v_existing_settled boolean;
BEGIN
  IF session_user <> 'mediq_runtime' OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  IF p_study_ref_id IS NULL OR p_storage_ref IS NULL OR p_writer_id IS NULL
     OR p_delta_bytes IS NULL OR p_delta_bytes < 1
     OR p_delta_bytes > 16777216 OR p_delta_bytes % 16777216 <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_INVALID';
  END IF;

  SELECT q.max_environment_bytes, q.max_package_bytes, q.reserved_bytes
    INTO v_max_environment, v_max_package, v_environment_reserved
    FROM public.temporary_payload_quota_state AS q
   WHERE q.singleton_id = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;

  SELECT sr.package_id
    INTO v_package_id
    FROM public.study_references AS sr
    JOIN public.imaging_packages AS p ON p.package_id = sr.package_id
    JOIN public.pacs_transfer_operations AS op
      ON op.study_ref_id = sr.study_ref_id
     AND op.exchange_session_id = p.exchange_session_id
     AND op.tenant_id = v_tenant_id
     AND op.state = 'CREATED'
   WHERE sr.study_ref_id = p_study_ref_id
     AND sr.temporary_storage_ref = p_storage_ref
     AND sr.temporary_payload_state = 'STAGING'
     AND sr.temporary_payload_expires_at > clock_timestamp()
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;

  SELECT pq.reserved_bytes INTO v_package_reserved
    FROM public.temporary_payload_package_quotas AS pq
   WHERE pq.package_id = v_package_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.temporary_payload_package_quotas (package_id, reserved_bytes)
    VALUES (v_package_id, 0);
    v_package_reserved := 0;
  END IF;

  SELECT r.tenant_id, r.study_ref_id, r.package_id, r.writer_id,
         r.reserved_bytes, r.settled
    INTO v_existing_tenant, v_existing_study, v_existing_package,
         v_existing_writer, v_current_reserved, v_existing_settled
    FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref FOR UPDATE;
  IF FOUND THEN
    IF v_existing_tenant <> v_tenant_id OR v_existing_study <> p_study_ref_id
       OR v_existing_package <> v_package_id OR v_existing_writer <> p_writer_id
       OR v_existing_settled THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
    END IF;
  ELSE
    v_current_reserved := 0;
    INSERT INTO public.temporary_payload_reservations
      (storage_ref, quota_state_id, tenant_id, study_ref_id, package_id,
       writer_id, reserved_bytes, settled)
    VALUES (p_storage_ref, true, v_tenant_id, p_study_ref_id,
            v_package_id, p_writer_id, 0, false);
  END IF;

  IF v_package_reserved > v_max_package - p_delta_bytes
     OR v_environment_reserved > v_max_environment - p_delta_bytes THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_EXCEEDED';
  END IF;

  UPDATE public.temporary_payload_quota_state
     SET reserved_bytes = v_environment_reserved + p_delta_bytes,
         updated_at = clock_timestamp()
   WHERE singleton_id = true;
  UPDATE public.temporary_payload_package_quotas
     SET reserved_bytes = v_package_reserved + p_delta_bytes,
         updated_at = clock_timestamp()
   WHERE package_id = v_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  UPDATE public.temporary_payload_reservations
     SET reserved_bytes = v_current_reserved + p_delta_bytes,
         updated_at = clock_timestamp()
   WHERE storage_ref = p_storage_ref
     AND tenant_id = v_tenant_id
     AND study_ref_id = p_study_ref_id
     AND package_id = v_package_id
     AND writer_id = p_writer_id
     AND NOT settled;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  RETURN v_current_reserved + p_delta_bytes;
END
$quota_reserve$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.settle_temporary_payload_quota(
  p_study_ref_id uuid,
  p_storage_ref uuid,
  p_writer_id uuid,
  p_actual_bytes bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $quota_settle$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('mediq.tenant_id', true), '')::uuid;
  v_package_id uuid;
  v_environment_reserved bigint;
  v_package_reserved bigint;
  v_current_reserved bigint;
  v_current_settled boolean;
  v_delta bigint;
BEGIN
  IF session_user <> 'mediq_runtime' OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  IF p_study_ref_id IS NULL OR p_storage_ref IS NULL OR p_writer_id IS NULL
     OR p_actual_bytes IS NULL OR p_actual_bytes < 1 OR p_actual_bytes > 2147483648 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_INVALID';
  END IF;

  SELECT q.reserved_bytes INTO v_environment_reserved
    FROM public.temporary_payload_quota_state AS q
   WHERE q.singleton_id = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  SELECT sr.package_id INTO v_package_id
    FROM public.study_references AS sr
    JOIN public.imaging_packages AS p ON p.package_id = sr.package_id
    JOIN public.pacs_transfer_operations AS op
      ON op.study_ref_id = sr.study_ref_id
     AND op.exchange_session_id = p.exchange_session_id
     AND op.tenant_id = v_tenant_id
     AND op.state = 'CREATED'
   WHERE sr.study_ref_id = p_study_ref_id
     AND sr.temporary_storage_ref = p_storage_ref
     AND sr.temporary_payload_state = 'STAGING'
     AND sr.temporary_payload_expires_at > clock_timestamp()
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  SELECT pq.reserved_bytes INTO v_package_reserved
    FROM public.temporary_payload_package_quotas AS pq
   WHERE pq.package_id = v_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  SELECT r.reserved_bytes, r.settled
    INTO v_current_reserved, v_current_settled
    FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref
     AND r.tenant_id = v_tenant_id
     AND r.study_ref_id = p_study_ref_id
     AND r.package_id = v_package_id
     AND r.writer_id = p_writer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  IF v_current_settled THEN
    IF p_actual_bytes <> v_current_reserved THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
    END IF;
    RETURN p_actual_bytes;
  END IF;
  IF p_actual_bytes > v_current_reserved THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;

  v_delta := v_current_reserved - p_actual_bytes;
  UPDATE public.temporary_payload_quota_state
     SET reserved_bytes = reserved_bytes - v_delta,
         updated_at = clock_timestamp()
   WHERE singleton_id = true AND reserved_bytes >= v_delta;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  UPDATE public.temporary_payload_package_quotas
     SET reserved_bytes = reserved_bytes - v_delta,
         updated_at = clock_timestamp()
   WHERE package_id = v_package_id AND reserved_bytes >= v_delta;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  UPDATE public.temporary_payload_reservations
     SET reserved_bytes = p_actual_bytes,
         settled = true,
         updated_at = clock_timestamp()
   WHERE storage_ref = p_storage_ref AND tenant_id = v_tenant_id
     AND study_ref_id = p_study_ref_id AND package_id = v_package_id
     AND writer_id = p_writer_id AND NOT settled;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  RETURN p_actual_bytes;
END
$quota_settle$;
--> statement-breakpoint
ALTER FUNCTION public.release_temporary_payload_quota(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
RESET ROLE;
