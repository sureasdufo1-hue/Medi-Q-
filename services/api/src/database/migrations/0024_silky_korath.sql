CREATE TABLE "temporary_payload_package_quotas" (
	"package_id" uuid PRIMARY KEY NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temporary_payload_package_quotas_bytes_check" CHECK ("temporary_payload_package_quotas"."reserved_bytes" >= 0 AND "temporary_payload_package_quotas"."reserved_bytes" <= 2147483648)
);
--> statement-breakpoint
ALTER TABLE "temporary_payload_package_quotas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "temporary_payload_quota_state" (
	"singleton_id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"max_environment_bytes" bigint DEFAULT 10737418240 NOT NULL,
	"max_package_bytes" bigint DEFAULT 2147483648 NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temporary_payload_quota_singleton_check" CHECK ("temporary_payload_quota_state"."singleton_id"),
	CONSTRAINT "temporary_payload_quota_environment_limit_check" CHECK ("temporary_payload_quota_state"."max_environment_bytes" > 0 AND "temporary_payload_quota_state"."max_environment_bytes" <= 10737418240),
	CONSTRAINT "temporary_payload_quota_package_limit_check" CHECK ("temporary_payload_quota_state"."max_package_bytes" > 0 AND "temporary_payload_quota_state"."max_package_bytes" <= 2147483648),
	CONSTRAINT "temporary_payload_quota_reserved_bytes_check" CHECK ("temporary_payload_quota_state"."reserved_bytes" >= 0 AND "temporary_payload_quota_state"."reserved_bytes" <= "temporary_payload_quota_state"."max_environment_bytes")
);
--> statement-breakpoint
ALTER TABLE "temporary_payload_quota_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "temporary_payload_reservations" (
	"storage_ref" uuid PRIMARY KEY NOT NULL,
	"quota_state_id" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"study_ref_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"writer_id" uuid NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temporary_payload_reservations_bytes_check" CHECK ("temporary_payload_reservations"."reserved_bytes" >= 0 AND "temporary_payload_reservations"."reserved_bytes" <= 2147483648)
);
--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "temporary_payload_package_quotas" ADD CONSTRAINT "temporary_payload_package_quotas_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ADD CONSTRAINT "temporary_payload_reservations_quota_state_id_temporary_payload_quota_state_singleton_id_fk" FOREIGN KEY ("quota_state_id") REFERENCES "public"."temporary_payload_quota_state"("singleton_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ADD CONSTRAINT "temporary_payload_reservations_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ADD CONSTRAINT "temporary_payload_reservations_study_ref_id_study_references_study_ref_id_fk" FOREIGN KEY ("study_ref_id") REFERENCES "public"."study_references"("study_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_payload_reservations" ADD CONSTRAINT "temporary_payload_reservations_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "temporary_payload_reservations_tenant_package_idx" ON "temporary_payload_reservations" USING btree ("tenant_id","package_id");--> statement-breakpoint
CREATE INDEX "temporary_payload_reservations_tenant_study_idx" ON "temporary_payload_reservations" USING btree ("tenant_id","study_ref_id");--> statement-breakpoint
CREATE POLICY "hospitals_mediq_quota_owner_tenant_scope" ON "hospitals" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING ("hospitals"."tenant_id" =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("hospitals"."tenant_id" =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "exchange_sessions_mediq_quota_owner_tenant_scope" ON "exchange_sessions" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id IN (
           "exchange_sessions"."source_hospital_id", "exchange_sessions"."destination_hospital_id"
         )
           AND h.tenant_id =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      )) WITH CHECK (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id IN (
           "exchange_sessions"."source_hospital_id", "exchange_sessions"."destination_hospital_id"
         )
           AND h.tenant_id =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      ));--> statement-breakpoint
CREATE POLICY "imaging_packages_mediq_quota_owner_tenant_scope" ON "imaging_packages" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "imaging_packages"."exchange_session_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "imaging_packages"."exchange_session_id"
      ));--> statement-breakpoint
CREATE POLICY "study_references_mediq_quota_owner_tenant_scope" ON "study_references" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "study_references"."package_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "study_references"."package_id"
      ));--> statement-breakpoint
CREATE POLICY "pacs_transfer_operations_mediq_quota_owner_tenant_scope" ON "pacs_transfer_operations" AS PERMISSIVE FOR SELECT TO "mediq_quota_owner" USING ("pacs_transfer_operations"."tenant_id" =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "temporary_payload_package_quotas_mediq_quota_owner_scope" ON "temporary_payload_package_quotas" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "temporary_payload_package_quotas"."package_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "temporary_payload_package_quotas"."package_id"
      ));--> statement-breakpoint
CREATE POLICY "temporary_payload_package_quotas_mediq_migrator_scope" ON "temporary_payload_package_quotas" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "temporary_payload_quota_state_mediq_quota_owner_scope" ON "temporary_payload_quota_state" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "temporary_payload_quota_state_mediq_migrator_scope" ON "temporary_payload_quota_state" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "temporary_payload_reservations_mediq_quota_owner_scope" ON "temporary_payload_reservations" AS PERMISSIVE FOR ALL TO "mediq_quota_owner" USING ("temporary_payload_reservations"."tenant_id" =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("temporary_payload_reservations"."tenant_id" =
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "temporary_payload_reservations_mediq_migrator_scope" ON "temporary_payload_reservations" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.temporary_payload_quota_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_payload_package_quotas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_payload_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.temporary_payload_quota_state,
  public.temporary_payload_package_quotas,
  public.temporary_payload_reservations FROM PUBLIC, mediq_runtime;
ALTER TABLE public.temporary_payload_quota_state OWNER TO mediq_quota_owner;
ALTER TABLE public.temporary_payload_package_quotas OWNER TO mediq_quota_owner;
ALTER TABLE public.temporary_payload_reservations OWNER TO mediq_quota_owner;
--> statement-breakpoint
GRANT SELECT (hospital_id, tenant_id) ON TABLE public.hospitals TO mediq_quota_owner;
GRANT SELECT (session_id, source_hospital_id, destination_hospital_id)
  ON TABLE public.exchange_sessions TO mediq_quota_owner;
GRANT SELECT (package_id, exchange_session_id)
  ON TABLE public.imaging_packages TO mediq_quota_owner;
GRANT SELECT (study_ref_id, package_id, temporary_storage_ref,
  temporary_payload_state, temporary_payload_expires_at)
  ON TABLE public.study_references TO mediq_quota_owner;
GRANT SELECT (operation_id, tenant_id, exchange_session_id, study_ref_id, state)
  ON TABLE public.pacs_transfer_operations TO mediq_quota_owner;
--> statement-breakpoint
SET ROLE mediq_quota_owner;
INSERT INTO public.temporary_payload_quota_state (singleton_id)
VALUES (true);
--> statement-breakpoint
CREATE FUNCTION public.reserve_temporary_payload_quota(
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

  SELECT r.tenant_id, r.study_ref_id, r.package_id, r.writer_id, r.reserved_bytes
    INTO v_existing_tenant, v_existing_study, v_existing_package,
         v_existing_writer, v_current_reserved
    FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref FOR UPDATE;
  IF FOUND THEN
    IF v_existing_tenant <> v_tenant_id OR v_existing_study <> p_study_ref_id
       OR v_existing_package <> v_package_id OR v_existing_writer <> p_writer_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
    END IF;
  ELSE
    v_current_reserved := 0;
  END IF;

  IF v_package_reserved > v_max_package - p_delta_bytes
     OR v_environment_reserved > v_max_environment - p_delta_bytes THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_EXCEEDED';
  END IF;

  IF v_current_reserved = 0 AND NOT EXISTS (
    SELECT 1 FROM public.temporary_payload_reservations AS r
     WHERE r.storage_ref = p_storage_ref
  ) THEN
    INSERT INTO public.temporary_payload_reservations
      (storage_ref, quota_state_id, tenant_id, study_ref_id, package_id,
       writer_id, reserved_bytes)
    VALUES (p_storage_ref, true, v_tenant_id, p_study_ref_id,
            v_package_id, p_writer_id, 0);
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
     AND writer_id = p_writer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  RETURN v_current_reserved + p_delta_bytes;
END
$quota_reserve$;
--> statement-breakpoint
CREATE FUNCTION public.settle_temporary_payload_quota(
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
  SELECT r.reserved_bytes INTO v_current_reserved
    FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref
     AND r.tenant_id = v_tenant_id
     AND r.study_ref_id = p_study_ref_id
     AND r.package_id = v_package_id
     AND r.writer_id = p_writer_id
   FOR UPDATE;
  IF NOT FOUND OR p_actual_bytes > v_current_reserved THEN
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
         updated_at = clock_timestamp()
   WHERE storage_ref = p_storage_ref AND tenant_id = v_tenant_id
     AND study_ref_id = p_study_ref_id AND package_id = v_package_id
     AND writer_id = p_writer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  RETURN p_actual_bytes;
END
$quota_settle$;
--> statement-breakpoint
CREATE FUNCTION public.release_temporary_payload_quota(
  p_study_ref_id uuid,
  p_storage_ref uuid
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $quota_release$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('mediq.tenant_id', true), '')::uuid;
  v_package_id uuid;
  v_reserved bigint;
  v_package_reserved bigint;
BEGIN
  IF session_user <> 'mediq_runtime' OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  IF p_study_ref_id IS NULL OR p_storage_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_INVALID';
  END IF;
  PERFORM 1 FROM public.temporary_payload_quota_state AS q
   WHERE q.singleton_id = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  PERFORM 1 FROM public.study_references AS sr
   WHERE sr.study_ref_id = p_study_ref_id
     AND sr.temporary_storage_ref = p_storage_ref
     AND sr.temporary_payload_state = 'PURGED'
     AND sr.temporary_payload_purged_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_DENIED';
  END IF;
  SELECT r.package_id, r.reserved_bytes INTO v_package_id, v_reserved
    FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref
     AND r.tenant_id = v_tenant_id
     AND r.study_ref_id = p_study_ref_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  UPDATE public.temporary_payload_quota_state
     SET reserved_bytes = reserved_bytes - v_reserved,
         updated_at = clock_timestamp()
   WHERE singleton_id = true AND reserved_bytes >= v_reserved;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  UPDATE public.temporary_payload_package_quotas
     SET reserved_bytes = reserved_bytes - v_reserved,
         updated_at = clock_timestamp()
   WHERE package_id = v_package_id AND reserved_bytes >= v_reserved
   RETURNING reserved_bytes INTO v_package_reserved;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  DELETE FROM public.temporary_payload_package_quotas
   WHERE package_id = v_package_id AND v_package_reserved = 0;
  DELETE FROM public.temporary_payload_reservations AS r
   WHERE r.storage_ref = p_storage_ref
     AND r.tenant_id = v_tenant_id
     AND r.study_ref_id = p_study_ref_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE';
  END IF;
  RETURN v_reserved;
END
$quota_release$;
REVOKE ALL ON FUNCTION public.reserve_temporary_payload_quota(uuid, uuid, uuid, bigint)
  FROM PUBLIC, mediq_runtime, mediq_migrator;
REVOKE ALL ON FUNCTION public.settle_temporary_payload_quota(uuid, uuid, uuid, bigint)
  FROM PUBLIC, mediq_runtime, mediq_migrator;
REVOKE ALL ON FUNCTION public.release_temporary_payload_quota(uuid, uuid)
  FROM PUBLIC, mediq_runtime, mediq_migrator;
GRANT EXECUTE ON FUNCTION public.reserve_temporary_payload_quota(uuid, uuid, uuid, bigint)
  TO mediq_runtime;
GRANT EXECUTE ON FUNCTION public.settle_temporary_payload_quota(uuid, uuid, uuid, bigint)
  TO mediq_runtime;
GRANT EXECUTE ON FUNCTION public.release_temporary_payload_quota(uuid, uuid)
  TO mediq_runtime;
RESET ROLE;
