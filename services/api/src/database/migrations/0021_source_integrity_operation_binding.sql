ALTER TABLE "integrity_evidence" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_operation_id_pacs_transfer_operations_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."pacs_transfer_operations"("operation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integrity_evidence_operation_stage_unique" ON "integrity_evidence" USING btree ("operation_id","verification_stage") WHERE "integrity_evidence"."operation_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "integrity_evidence" ADD CONSTRAINT "integrity_evidence_source_capture_binding_check" CHECK (verification_stage <> 'SOURCE_CAPTURE' OR (
        operation_id IS NOT NULL
        AND study_ref_id IS NOT NULL
        AND algorithm = 'SHA256-MANIFEST-V1'
        AND source_digest IS NOT NULL
        AND source_digest ~ '^sha256:[0-9a-f]{64}$'
        AND source_object_count IS NOT NULL
        AND source_object_count > 0
        AND destination_digest IS NULL
        AND destination_object_count IS NULL
        AND status = 'PENDING'
        AND verified_at IS NULL
      ));