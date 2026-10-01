ALTER TABLE "provenance_records" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_operation_id_pacs_transfer_operations_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."pacs_transfer_operations"("operation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provenance_records_operation_id_unique" ON "provenance_records" USING btree ("operation_id") WHERE "provenance_records"."operation_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_pacs_operation_required_check" CHECK (transfer_type <> 'PACS_IMPORT' OR (
        operation_id IS NOT NULL
        AND destination_hospital_id IS NOT NULL
        AND study_ref_id IS NOT NULL
      ));
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE provenance_records FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
REVOKE ALL PRIVILEGES (provenance_id, exchange_session_id, package_id,
  study_ref_id, source_hospital_id, destination_hospital_id, integrity_id,
  transfer_type, transfer_status, ingested_at, transferred_at, created_at,
  operation_id)
  ON TABLE provenance_records FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT SELECT (provenance_id, exchange_session_id, package_id, study_ref_id,
  source_hospital_id, destination_hospital_id, integrity_id, transfer_type,
  transfer_status, ingested_at, transferred_at, created_at, operation_id),
  INSERT (provenance_id, exchange_session_id, package_id, study_ref_id,
  source_hospital_id, destination_hospital_id, integrity_id, transfer_type,
  transfer_status, ingested_at, transferred_at, created_at, operation_id)
  ON TABLE provenance_records TO mediq_runtime;
