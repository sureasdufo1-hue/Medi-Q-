REVOKE ALL PRIVILEGES ON TABLE exchange_sessions, consents, consent_actions, transfer_grants, transfer_grant_scopes, imaging_packages, study_references FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT SELECT (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, state, expires_at)
  ON TABLE exchange_sessions TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, issued_at, expires_at, withdrawn_at)
  ON TABLE consents TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (consent_id, action)
  ON TABLE consent_actions TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (grant_id, exchange_session_id, consent_id, recipient_tenant_id, recipient_hospital_id, recipient_actor_id, imaging_package_id, status, issued_at, expires_at, revoked_at)
  ON TABLE transfer_grants TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (grant_id, scope)
  ON TABLE transfer_grant_scopes TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (package_id, exchange_session_id, patient_ref_id, source_hospital_id, state, retention_expires_at, deleted_at)
  ON TABLE imaging_packages TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (study_ref_id, package_id, source_hospital_id)
  ON TABLE study_references TO mediq_runtime;
