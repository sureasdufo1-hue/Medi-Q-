CREATE TABLE "exchange_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"patient_ref_id" uuid NOT NULL,
	"source_hospital_id" uuid NOT NULL,
	"destination_hospital_id" uuid NOT NULL,
	"requester_actor_id" uuid NOT NULL,
	"purpose" varchar(255) NOT NULL,
	"state" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "exchange_sessions_state_check" CHECK ("exchange_sessions"."state" IN ('REQUESTED', 'CONSENT_PENDING', 'CONSENTED', 'AUTHORIZED', 'READY', 'ACTIVE', 'COMPLETED', 'REJECTED', 'EXPIRED', 'REVOKED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "exchange_sessions_distinct_hospitals_check" CHECK ("exchange_sessions"."source_hospital_id" <> "exchange_sessions"."destination_hospital_id")
);
--> statement-breakpoint
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_patient_ref_id_patient_refs_patient_ref_id_fk" FOREIGN KEY ("patient_ref_id") REFERENCES "public"."patient_refs"("patient_ref_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_source_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("source_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_destination_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("destination_hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_requester_actor_id_actors_actor_id_fk" FOREIGN KEY ("requester_actor_id") REFERENCES "public"."actors"("actor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_sessions_patient_ref_id_idx" ON "exchange_sessions" USING btree ("patient_ref_id");--> statement-breakpoint
CREATE INDEX "exchange_sessions_source_hospital_id_idx" ON "exchange_sessions" USING btree ("source_hospital_id");--> statement-breakpoint
CREATE INDEX "exchange_sessions_destination_hospital_id_idx" ON "exchange_sessions" USING btree ("destination_hospital_id");--> statement-breakpoint
CREATE INDEX "exchange_sessions_requester_actor_id_idx" ON "exchange_sessions" USING btree ("requester_actor_id");--> statement-breakpoint
CREATE INDEX "exchange_sessions_state_idx" ON "exchange_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "exchange_sessions_created_at_idx" ON "exchange_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exchange_sessions_destination_state_idx" ON "exchange_sessions" USING btree ("destination_hospital_id","state");