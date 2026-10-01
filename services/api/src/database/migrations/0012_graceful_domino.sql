ALTER TABLE "exchange_sessions" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
UPDATE "exchange_sessions" SET "idempotency_key" = gen_random_uuid() WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_requester_idempotency_key_unique" UNIQUE("requester_actor_id","idempotency_key");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE exchange_sessions, audit_events FROM PUBLIC, mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, idempotency_key, purpose, state, created_at, updated_at, expires_at, completed_at)
  ON TABLE exchange_sessions FROM PUBLIC, mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id, resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
  ON TABLE audit_events FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT SELECT (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, idempotency_key, purpose, state, created_at, updated_at, expires_at, completed_at)
  ON TABLE exchange_sessions TO mediq_runtime;--> statement-breakpoint
GRANT INSERT (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, idempotency_key, purpose, state, created_at, updated_at, expires_at, completed_at)
  ON TABLE exchange_sessions TO mediq_runtime;--> statement-breakpoint
GRANT INSERT (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id, resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
  ON TABLE audit_events TO mediq_runtime;
