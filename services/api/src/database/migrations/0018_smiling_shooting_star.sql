CREATE TABLE "pacs_transfer_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exchange_session_id" uuid NOT NULL,
	"study_ref_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_digest" varchar(64) NOT NULL,
	"state" varchar(32) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"reason_code" varchar(64),
	"source_object_count" integer,
	"destination_object_count" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"stow_started_at" timestamp with time zone,
	CONSTRAINT "pacs_transfer_operations_session_study_unique" UNIQUE("exchange_session_id","study_ref_id"),
	CONSTRAINT "pacs_transfer_operations_tenant_actor_key_unique" UNIQUE("tenant_id","actor_id","idempotency_key"),
	CONSTRAINT "pacs_transfer_operations_state_check" CHECK ("pacs_transfer_operations"."state" IN ('CREATED', 'PREFLIGHT_PASSED', 'STOW_STARTED', 'VERIFYING', 'COMPLETED', 'DENIED', 'FAILED', 'PARTIAL', 'RESULT_UNKNOWN')),
	CONSTRAINT "pacs_transfer_operations_version_check" CHECK ("pacs_transfer_operations"."version" >= 0),
	CONSTRAINT "pacs_transfer_operations_digest_check" CHECK ("pacs_transfer_operations"."request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pacs_transfer_operations_source_count_check" CHECK ("pacs_transfer_operations"."source_object_count" IS NULL OR "pacs_transfer_operations"."source_object_count" >= 0),
	CONSTRAINT "pacs_transfer_operations_destination_count_check" CHECK ("pacs_transfer_operations"."destination_object_count" IS NULL OR "pacs_transfer_operations"."destination_object_count" >= 0),
	CONSTRAINT "pacs_transfer_operations_dispatch_timestamp_check" CHECK (("pacs_transfer_operations"."state" IN ('CREATED', 'PREFLIGHT_PASSED', 'DENIED') AND "pacs_transfer_operations"."stow_started_at" IS NULL)
        OR ("pacs_transfer_operations"."state" IN ('STOW_STARTED', 'VERIFYING', 'COMPLETED', 'PARTIAL', 'RESULT_UNKNOWN') AND "pacs_transfer_operations"."stow_started_at" IS NOT NULL)
        OR "pacs_transfer_operations"."state" = 'FAILED')
);
--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_exchange_session_id_exchange_sessions_session_id_fk" FOREIGN KEY ("exchange_session_id") REFERENCES "public"."exchange_sessions"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_study_ref_id_study_references_study_ref_id_fk" FOREIGN KEY ("study_ref_id") REFERENCES "public"."study_references"("study_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacs_transfer_operations" ADD CONSTRAINT "pacs_transfer_operations_actor_id_actors_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("actor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pacs_transfer_operations_state_updated_idx" ON "pacs_transfer_operations" USING btree ("state","updated_at");--> statement-breakpoint
CREATE POLICY "pacs_transfer_operations_tenant_scope" ON "pacs_transfer_operations" AS PERMISSIVE FOR ALL TO "mediq_runtime" USING ("pacs_transfer_operations"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        AND EXISTS (
          SELECT 1 FROM actors a
           WHERE a.actor_id = "pacs_transfer_operations"."actor_id"
             AND a.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        )
        AND EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = "pacs_transfer_operations"."exchange_session_id"
        )) WITH CHECK ("pacs_transfer_operations"."tenant_id" = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        AND EXISTS (
          SELECT 1 FROM actors a
           WHERE a.actor_id = "pacs_transfer_operations"."actor_id"
             AND a.tenant_id = 
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid

        )
        AND EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = "pacs_transfer_operations"."exchange_session_id"
        ));--> statement-breakpoint
CREATE POLICY "pacs_transfer_operations_migration_access" ON "pacs_transfer_operations" AS PERMISSIVE FOR ALL TO "mediq_migrator" USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE pacs_transfer_operations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE pacs_transfer_operations FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
REVOKE ALL PRIVILEGES (operation_id, tenant_id, exchange_session_id, study_ref_id,
  actor_id, idempotency_key, request_digest, state, version, reason_code,
  source_object_count, destination_object_count, created_at, updated_at,
  stow_started_at)
  ON TABLE pacs_transfer_operations FROM PUBLIC, mediq_runtime;
--> statement-breakpoint
GRANT SELECT (operation_id, tenant_id, exchange_session_id, study_ref_id,
  actor_id, idempotency_key, request_digest, state, version, reason_code,
  source_object_count, destination_object_count, created_at, updated_at,
  stow_started_at),
  INSERT (operation_id, tenant_id, exchange_session_id, study_ref_id,
  actor_id, idempotency_key, request_digest, state, version, reason_code,
  source_object_count, destination_object_count, created_at, updated_at,
  stow_started_at)
  ON TABLE pacs_transfer_operations TO mediq_runtime;
--> statement-breakpoint
GRANT UPDATE (state, version, reason_code, source_object_count,
  destination_object_count, updated_at, stow_started_at)
  ON TABLE pacs_transfer_operations TO mediq_runtime;
