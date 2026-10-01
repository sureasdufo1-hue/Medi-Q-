CREATE TABLE "integrity_evidence" (
	"integrity_id" uuid PRIMARY KEY NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"study_ref_id" uuid,
	"verification_stage" varchar(32) NOT NULL,
	"algorithm" varchar(32),
	"source_digest" varchar(256),
	"destination_digest" varchar(256),
	"source_object_count" integer,
	"destination_object_count" integer,
	"status" varchar(20) NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "integrity_evidence_stage_check" CHECK (verification_stage IN ('SOURCE_CAPTURE', 'DESTINATION_VERIFY', 'END_TO_END')),
	CONSTRAINT "integrity_evidence_status_check" CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED', 'NOT_APPLICABLE')),
	CONSTRAINT "integrity_evidence_source_count_check" CHECK (source_object_count IS NULL OR source_object_count >= 0),
	CONSTRAINT "integrity_evidence_destination_count_check" CHECK (destination_object_count IS NULL OR destination_object_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "provenance_records" (
	"provenance_id" uuid PRIMARY KEY NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"study_ref_id" uuid,
	"source_hospital_id" uuid NOT NULL,
	"destination_hospital_id" uuid,
	"integrity_id" uuid,
	"transfer_type" varchar(32) NOT NULL,
	"transfer_status" varchar(20) NOT NULL,
	"ingested_at" timestamp with time zone,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provenance_records_transfer_type_check" CHECK (transfer_type IN ('VIEW', 'DOWNLOAD', 'PACS_IMPORT', 'MOBILE_EXPORT')),
	CONSTRAINT "provenance_records_transfer_status_check" CHECK (transfer_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"audit_event_id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"tenant_id" uuid,
	"exchange_session_id" uuid,
	"resource_type" varchar(64),
	"resource_id" uuid,
	"action" varchar(64) NOT NULL,
	"result" varchar(20) NOT NULL,
	"reason_code" varchar(64),
	"correlation_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_events_result_check" CHECK (result IN ('SUCCESS', 'FAILURE', 'ALLOW', 'DENY'))
);
--> statement-breakpoint
ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_study_ref_id_study_references_study_ref_id_fk" FOREIGN KEY ("study_ref_id") REFERENCES "public"."study_references"("study_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_study_ref_id_study_references_study_ref_id_fk" FOREIGN KEY ("study_ref_id") REFERENCES "public"."study_references"("study_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_source_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("source_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_destination_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("destination_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_integrity_id_integrity_evidence_integrity_id_fk" FOREIGN KEY ("integrity_id") REFERENCES "public"."integrity_evidence"("integrity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_actors_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("actor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integrity_evidence_exchange_session_id_idx" ON "integrity_evidence" USING btree ("exchange_session_id");--> statement-breakpoint
CREATE INDEX "integrity_evidence_package_id_idx" ON "integrity_evidence" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "integrity_evidence_status_idx" ON "integrity_evidence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "provenance_records_exchange_session_id_idx" ON "provenance_records" USING btree ("exchange_session_id");--> statement-breakpoint
CREATE INDEX "provenance_records_package_id_idx" ON "provenance_records" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "provenance_records_source_hospital_id_idx" ON "provenance_records" USING btree ("source_hospital_id");--> statement-breakpoint
CREATE INDEX "provenance_records_destination_hospital_id_idx" ON "provenance_records" USING btree ("destination_hospital_id");--> statement-breakpoint
CREATE INDEX "provenance_records_transfer_status_idx" ON "provenance_records" USING btree ("transfer_status");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_exchange_session_occurred_at_idx" ON "audit_events" USING btree ("exchange_session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_at_idx" ON "audit_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_at_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events" USING btree ("correlation_id");