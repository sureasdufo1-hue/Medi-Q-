ALTER TABLE "transfer_grants" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_grants_tenant_actor_idempotency_key_unique" ON "transfer_grants" USING btree ("recipient_tenant_id","recipient_actor_id","idempotency_key") WHERE "transfer_grants"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_grants" ADD CONSTRAINT "transfer_grants_idempotency_actor_check" CHECK ("transfer_grants"."idempotency_key" IS NULL OR "transfer_grants"."recipient_actor_id" IS NOT NULL);
--> statement-breakpoint
GRANT INSERT (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
  recipient_hospital_id, recipient_actor_id, imaging_package_id, idempotency_key,
  status, issued_at, expires_at, revoked_at, created_at)
  ON TABLE transfer_grants TO mediq_runtime;
--> statement-breakpoint
GRANT SELECT (created_at, idempotency_key)
  ON TABLE transfer_grants TO mediq_runtime;
--> statement-breakpoint
GRANT INSERT (grant_scope_id, grant_id, scope)
  ON TABLE transfer_grant_scopes TO mediq_runtime;
