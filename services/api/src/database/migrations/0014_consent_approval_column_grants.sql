REVOKE UPDATE ON TABLE consents FROM PUBLIC, mediq_runtime;--> statement-breakpoint
REVOKE UPDATE (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, consent_version, issued_at, expires_at, withdrawn_at, created_at, updated_at)
  ON TABLE consents FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT UPDATE (status, issued_at, updated_at)
  ON TABLE consents TO mediq_runtime;
