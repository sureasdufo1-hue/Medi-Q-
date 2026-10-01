ALTER TABLE "actors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hospital_endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hospitals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patient_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "imaging_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transfer_grant_scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transfer_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integrity_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provenance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patient_refs" ADD CONSTRAINT "patient_refs_p0_synthetic_code_check" CHECK ("patient_refs"."patient_ref_code" ~ '^MQ-TEST-[A-Z0-9][A-Z0-9-]{0,55}$');--> statement-breakpoint
CREATE POLICY "actors_tenant_scope" ON "actors" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("actors"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("actors"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "actors_migration_access" ON "actors" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "hospital_endpoints_tenant_scope" ON "hospital_endpoints" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = "hospital_endpoints"."hospital_id"
           AND h.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      )) WITH CHECK (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = "hospital_endpoints"."hospital_id"
           AND h.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      ));--> statement-breakpoint
CREATE POLICY "hospital_endpoints_migration_access" ON "hospital_endpoints" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "hospitals_tenant_scope" ON "hospitals" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("hospitals"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("hospitals"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "hospitals_migration_access" ON "hospitals" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "organizations_tenant_scope" ON "organizations" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM tenants t
         WHERE t.organization_id = "organizations"."organization_id"
           AND t.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tenants t
         WHERE t.organization_id = "organizations"."organization_id"
           AND t.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      ));--> statement-breakpoint
CREATE POLICY "organizations_migration_access" ON "organizations" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tenants_tenant_scope" ON "tenants" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("tenants"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("tenants"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "tenants_migration_access" ON "tenants" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "patient_mappings_tenant_scope" ON "patient_mappings" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = "patient_mappings"."hospital_id"
           AND h.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      )) WITH CHECK (EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = "patient_mappings"."hospital_id"
           AND h.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

      ));--> statement-breakpoint
CREATE POLICY "patient_mappings_migration_access" ON "patient_mappings" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "exchange_sessions_tenant_scope" ON "exchange_sessions" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
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
CREATE POLICY "exchange_sessions_migration_access" ON "exchange_sessions" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "imaging_packages_tenant_scope" ON "imaging_packages" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "imaging_packages"."exchange_session_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "imaging_packages"."exchange_session_id"
      ));--> statement-breakpoint
CREATE POLICY "imaging_packages_migration_access" ON "imaging_packages" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "study_references_tenant_scope" ON "study_references" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "study_references"."package_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = "study_references"."package_id"
      ));--> statement-breakpoint
CREATE POLICY "study_references_migration_access" ON "study_references" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "consent_actions_tenant_scope" ON "consent_actions" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM consents c
         WHERE c.consent_id = "consent_actions"."consent_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM consents c
         WHERE c.consent_id = "consent_actions"."consent_id"
      ));--> statement-breakpoint
CREATE POLICY "consent_actions_migration_access" ON "consent_actions" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "consents_tenant_scope" ON "consents" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "consents"."exchange_session_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "consents"."exchange_session_id"
      ));--> statement-breakpoint
CREATE POLICY "consents_migration_access" ON "consents" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "transfer_grant_scopes_tenant_scope" ON "transfer_grant_scopes" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM transfer_grants g
         WHERE g.grant_id = "transfer_grant_scopes"."grant_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM transfer_grants g
         WHERE g.grant_id = "transfer_grant_scopes"."grant_id"
      ));--> statement-breakpoint
CREATE POLICY "transfer_grant_scopes_migration_access" ON "transfer_grant_scopes" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "transfer_grants_tenant_scope" ON "transfer_grants" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("transfer_grants"."recipient_tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        OR EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = "transfer_grants"."exchange_session_id"
        )) WITH CHECK ("transfer_grants"."recipient_tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        OR EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = "transfer_grants"."exchange_session_id"
        ));--> statement-breakpoint
CREATE POLICY "transfer_grants_migration_access" ON "transfer_grants" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "integrity_evidence_tenant_scope" ON "integrity_evidence" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "integrity_evidence"."exchange_session_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "integrity_evidence"."exchange_session_id"
      ));--> statement-breakpoint
CREATE POLICY "integrity_evidence_migration_access" ON "integrity_evidence" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "provenance_records_tenant_scope" ON "provenance_records" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "provenance_records"."exchange_session_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = "provenance_records"."exchange_session_id"
      ));--> statement-breakpoint
CREATE POLICY "provenance_records_migration_access" ON "provenance_records" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "audit_events_tenant_scope" ON "audit_events" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("audit_events"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
) WITH CHECK ("audit_events"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
);--> statement-breakpoint
CREATE POLICY "audit_events_migration_access" ON "audit_events" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "actors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hospital_endpoints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hospitals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "patient_mappings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exchange_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "imaging_packages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "study_references" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "consent_actions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "consents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transfer_grant_scopes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transfer_grants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integrity_evidence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provenance_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT SELECT (patient_ref_id, patient_ref_code, status, created_at, updated_at)
  ON TABLE patient_refs TO mediq_runtime;
--> statement-breakpoint
GRANT INSERT (patient_ref_id, patient_ref_code, status, created_at, updated_at)
  ON TABLE patient_refs TO mediq_runtime;
