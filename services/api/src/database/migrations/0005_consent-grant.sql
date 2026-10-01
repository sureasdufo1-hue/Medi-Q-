CREATE TABLE "consent_actions" (
	"consent_action_id" uuid PRIMARY KEY NOT NULL,
	"consent_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	CONSTRAINT "consent_actions_consent_action_unique" UNIQUE("consent_id","action"),
	CONSTRAINT "consent_actions_action_check" CHECK ("consent_actions"."action" IN ('VIEW', 'DOWNLOAD', 'PACS_IMPORT', 'MOBILE_EXPORT'))
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"consent_id" uuid PRIMARY KEY NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"patient_ref_id" uuid NOT NULL,
	"source_hospital_id" uuid NOT NULL,
	"destination_hospital_id" uuid NOT NULL,
	"imaging_package_id" uuid,
	"status" varchar(20) NOT NULL,
	"consent_version" integer NOT NULL,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "consents_session_version_unique" UNIQUE("exchange_session_id","consent_version"),
	CONSTRAINT "consents_status_check" CHECK ("consents"."status" IN ('PENDING', 'ACTIVE', 'WITHDRAWN', 'EXPIRED', 'REJECTED')),
	CONSTRAINT "consents_version_check" CHECK ("consents"."consent_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "transfer_grant_scopes" (
	"grant_scope_id" uuid PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	CONSTRAINT "transfer_grant_scopes_grant_scope_unique" UNIQUE("grant_id","scope"),
	CONSTRAINT "transfer_grant_scopes_scope_check" CHECK ("transfer_grant_scopes"."scope" IN ('study:view', 'study:download', 'study:pacs-transfer', 'study:mobile-export'))
);
--> statement-breakpoint
CREATE TABLE "transfer_grants" (
	"grant_id" uuid PRIMARY KEY NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"recipient_tenant_id" uuid NOT NULL,
	"recipient_hospital_id" uuid NOT NULL,
	"recipient_actor_id" uuid,
	"imaging_package_id" uuid,
	"status" varchar(20) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transfer_grants_status_check" CHECK ("transfer_grants"."status" IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'CONSUMED')),
	CONSTRAINT "transfer_grants_expiry_check" CHECK ("transfer_grants"."expires_at" > "transfer_grants"."issued_at")
);
--> statement-breakpoint
ALTER TABLE "consent_actions" ADD CONSTRAINT "consent_actions_consent_id_consents_consent_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("consent_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_ref_id_patient_refs_patient_ref_id_fk" FOREIGN KEY ("patient_ref_id") REFERENCES "public"."patient_refs"("patient_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_source_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("source_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_destination_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("destination_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_imaging_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("imaging_package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grant_scopes" ADD CONSTRAINT "transfer_grant_scopes_grant_id_transfer_grants_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."transfer_grants"("grant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_consent_id_consents_consent_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("consent_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_recipient_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("recipient_tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_recipient_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("recipient_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_recipient_actor_id_actors_actor_id_fk" FOREIGN KEY ("recipient_actor_id") REFERENCES "public"."actors"("actor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_imaging_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("imaging_package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_actions_consent_id_idx" ON "consent_actions" USING btree ("consent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_one_active_per_session_uidx" ON "consents" USING btree ("exchange_session_id") WHERE "consents"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "consents_exchange_session_id_idx" ON "consents" USING btree ("exchange_session_id");--> statement-breakpoint
CREATE INDEX "consents_patient_ref_id_idx" ON "consents" USING btree ("patient_ref_id");--> statement-breakpoint
CREATE INDEX "consents_status_idx" ON "consents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consents_expires_at_idx" ON "consents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transfer_grants_exchange_session_id_idx" ON "transfer_grants" USING btree ("exchange_session_id");--> statement-breakpoint
CREATE INDEX "transfer_grants_consent_id_idx" ON "transfer_grants" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "transfer_grants_recipient_tenant_id_idx" ON "transfer_grants" USING btree ("recipient_tenant_id");--> statement-breakpoint
CREATE INDEX "transfer_grants_recipient_hospital_id_idx" ON "transfer_grants" USING btree ("recipient_hospital_id");--> statement-breakpoint
CREATE INDEX "transfer_grants_status_idx" ON "transfer_grants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transfer_grants_expires_at_idx" ON "transfer_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transfer_grants_exchange_session_status_idx" ON "transfer_grants" USING btree ("exchange_session_id","status");