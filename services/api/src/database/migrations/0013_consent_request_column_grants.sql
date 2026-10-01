REVOKE ALL PRIVILEGES ON TABLE consents, consent_actions FROM PUBLIC, mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, consent_version, issued_at, expires_at, withdrawn_at, created_at, updated_at)
  ON TABLE consents FROM PUBLIC, mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (consent_action_id, consent_id, action)
  ON TABLE consent_actions FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT SELECT (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, consent_version, issued_at, expires_at, withdrawn_at, created_at, updated_at),
      INSERT (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, consent_version, issued_at, expires_at, withdrawn_at, created_at, updated_at)
  ON TABLE consents TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (consent_action_id, consent_id, action),
      INSERT (consent_action_id, consent_id, action)
  ON TABLE consent_actions TO mediq_runtime;--> statement-breakpoint
GRANT UPDATE (state, updated_at)
  ON TABLE exchange_sessions TO mediq_runtime;
