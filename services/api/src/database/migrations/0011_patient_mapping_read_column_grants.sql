REVOKE ALL PRIVILEGES ON TABLE patient_mappings FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT SELECT (mapping_id, patient_ref_id, hospital_id, local_patient_id, status, validated_at, created_at, updated_at)
  ON TABLE patient_mappings TO mediq_runtime;
