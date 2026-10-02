ALTER TABLE "study_references" ADD COLUMN "temporary_storage_ref" uuid;--> statement-breakpoint
ALTER TABLE "study_references" ADD COLUMN "temporary_payload_state" varchar(32);--> statement-breakpoint
ALTER TABLE "study_references" ADD COLUMN "temporary_payload_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_references" ADD COLUMN "temporary_payload_purged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "study_references_temporary_payload_cleanup_idx" ON "study_references" USING btree ("temporary_payload_state","temporary_payload_expires_at") WHERE "study_references"."temporary_payload_state" IN ('STAGING', 'AVAILABLE', 'PURGE_PENDING');--> statement-breakpoint
CREATE UNIQUE INDEX "study_references_temporary_storage_ref_unique" ON "study_references" USING btree ("temporary_storage_ref") WHERE "study_references"."temporary_storage_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "study_references" ADD CONSTRAINT "study_references_temporary_payload_state_check" CHECK ("study_references"."temporary_payload_state" IS NULL OR "study_references"."temporary_payload_state" IN ('STAGING', 'AVAILABLE', 'PURGE_PENDING', 'PURGED'));--> statement-breakpoint
ALTER TABLE "study_references" ADD CONSTRAINT "study_references_temporary_payload_shape_check" CHECK ((
        "study_references"."temporary_payload_state" IS NULL
        AND "study_references"."temporary_storage_ref" IS NULL
        AND "study_references"."temporary_payload_expires_at" IS NULL
        AND "study_references"."temporary_payload_purged_at" IS NULL
      ) OR (
        "study_references"."temporary_payload_state" IS NOT NULL
        AND
        "study_references"."temporary_payload_state" IN ('STAGING', 'AVAILABLE', 'PURGE_PENDING')
        AND "study_references"."temporary_storage_ref" IS NOT NULL
        AND "study_references"."temporary_payload_expires_at" IS NOT NULL
        AND "study_references"."temporary_payload_purged_at" IS NULL
      ) OR (
        "study_references"."temporary_payload_state" IS NOT NULL
        AND
        "study_references"."temporary_payload_state" = 'PURGED'
        AND "study_references"."temporary_storage_ref" IS NOT NULL
        AND "study_references"."temporary_payload_expires_at" IS NOT NULL
        AND "study_references"."temporary_payload_purged_at" IS NOT NULL
      ));
--> statement-breakpoint
REVOKE ALL PRIVILEGES (temporary_storage_ref, temporary_payload_state,
  temporary_payload_expires_at, temporary_payload_purged_at)
  ON TABLE study_references FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT SELECT (temporary_storage_ref, temporary_payload_state,
  temporary_payload_expires_at, temporary_payload_purged_at)
  ON TABLE study_references TO mediq_runtime;
--> statement-breakpoint
GRANT UPDATE (temporary_storage_ref, temporary_payload_state,
  temporary_payload_expires_at, temporary_payload_purged_at)
  ON TABLE study_references TO mediq_runtime;
