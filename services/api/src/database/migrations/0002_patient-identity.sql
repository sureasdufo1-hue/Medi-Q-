CREATE TABLE "patient_mappings" (
	"mapping_id" uuid PRIMARY KEY NOT NULL,
	"patient_ref_id" uuid NOT NULL,
	"hospital_id" uuid NOT NULL,
	"local_patient_id" varchar(128) NOT NULL,
	"status" varchar(20) NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "patient_mappings_hospital_local_patient_unique" UNIQUE("hospital_id","local_patient_id"),
	CONSTRAINT "patient_mappings_patient_hospital_unique" UNIQUE("patient_ref_id","hospital_id"),
	CONSTRAINT "patient_mappings_status_check" CHECK ("patient_mappings"."status" IN ('VALID', 'UNVERIFIED', 'AMBIGUOUS', 'REVOKED'))
);
--> statement-breakpoint
CREATE TABLE "patient_refs" (
	"patient_ref_id" uuid PRIMARY KEY NOT NULL,
	"patient_ref_code" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "patient_refs_patient_ref_code_unique" UNIQUE("patient_ref_code"),
	CONSTRAINT "patient_refs_status_check" CHECK ("patient_refs"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
ALTER TABLE "patient_mappings" ADD CONSTRAINT "patient_mappings_patient_ref_id_patient_refs_patient_ref_id_fk" FOREIGN KEY ("patient_ref_id") REFERENCES "public"."patient_refs"("patient_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_mappings" ADD CONSTRAINT "patient_mappings_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_mappings_patient_ref_id_idx" ON "patient_mappings" USING btree ("patient_ref_id");--> statement-breakpoint
CREATE INDEX "patient_mappings_hospital_id_idx" ON "patient_mappings" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "patient_mappings_status_idx" ON "patient_mappings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "patient_refs_status_idx" ON "patient_refs" USING btree ("status");