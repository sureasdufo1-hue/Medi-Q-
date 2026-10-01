CREATE TABLE "imaging_packages" (
	"package_id" uuid PRIMARY KEY NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"patient_ref_id" uuid NOT NULL,
	"source_hospital_id" uuid NOT NULL,
	"state" varchar(32) NOT NULL,
	"storage_ref" varchar(1024),
	"study_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"retention_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "imaging_packages_state_check" CHECK ("imaging_packages"."state" IN ('REGISTERED', 'AVAILABLE', 'IN_EXCHANGE', 'SESSION_COMPLETE', 'RETENTION_PENDING', 'DELETED', 'FAILED')),
	CONSTRAINT "imaging_packages_study_count_check" CHECK ("imaging_packages"."study_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "study_references" (
	"study_ref_id" uuid PRIMARY KEY NOT NULL,
	"package_id" uuid NOT NULL,
	"source_hospital_id" uuid NOT NULL,
	"study_instance_uid" varchar(128) NOT NULL,
	"modality" varchar(16),
	"series_count" integer,
	"instance_count" integer,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "study_references_package_uid_unique" UNIQUE("package_id","study_instance_uid"),
	CONSTRAINT "study_references_series_count_check" CHECK ("study_references"."series_count" IS NULL OR "study_references"."series_count" >= 0),
	CONSTRAINT "study_references_instance_count_check" CHECK ("study_references"."instance_count" IS NULL OR "study_references"."instance_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "imaging_packages" ADD CONSTRAINT "imaging_packages_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imaging_packages" ADD CONSTRAINT "imaging_packages_patient_ref_id_patient_refs_patient_ref_id_fk" FOREIGN KEY ("patient_ref_id") REFERENCES "public"."patient_refs"("patient_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imaging_packages" ADD CONSTRAINT "imaging_packages_source_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("source_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_references" ADD CONSTRAINT "study_references_package_id_imaging_packages_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."imaging_packages"("package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_references" ADD CONSTRAINT "study_references_source_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("source_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imaging_packages_exchange_session_id_idx" ON "imaging_packages" USING btree ("exchange_session_id");--> statement-breakpoint
CREATE INDEX "imaging_packages_patient_ref_id_idx" ON "imaging_packages" USING btree ("patient_ref_id");--> statement-breakpoint
CREATE INDEX "imaging_packages_source_hospital_id_idx" ON "imaging_packages" USING btree ("source_hospital_id");--> statement-breakpoint
CREATE INDEX "imaging_packages_state_idx" ON "imaging_packages" USING btree ("state");--> statement-breakpoint
CREATE INDEX "imaging_packages_retention_expires_at_idx" ON "imaging_packages" USING btree ("retention_expires_at");--> statement-breakpoint
CREATE INDEX "study_references_package_id_idx" ON "study_references" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "study_references_source_hospital_id_idx" ON "study_references" USING btree ("source_hospital_id");--> statement-breakpoint
CREATE INDEX "study_references_study_instance_uid_idx" ON "study_references" USING btree ("study_instance_uid");