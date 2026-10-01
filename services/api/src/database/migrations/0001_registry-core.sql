CREATE TABLE "actors" (
	"actor_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hospital_id" uuid,
	"actor_type" varchar(20) NOT NULL,
	"external_subject" varchar(255) NOT NULL,
	"display_name" varchar(200),
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "actors_tenant_subject_unique" UNIQUE("tenant_id","external_subject"),
	CONSTRAINT "actors_actor_type_check" CHECK ("actors"."actor_type" IN ('USER', 'SERVICE'))
);
--> statement-breakpoint
CREATE TABLE "hospital_endpoints" (
	"endpoint_id" uuid PRIMARY KEY NOT NULL,
	"hospital_id" uuid NOT NULL,
	"endpoint_type" varchar(20) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hospital_endpoints_hospital_type_unique" UNIQUE("hospital_id","endpoint_type"),
	CONSTRAINT "hospital_endpoints_endpoint_type_check" CHECK ("hospital_endpoints"."endpoint_type" IN ('QIDO_RS', 'WADO_RS', 'STOW_RS'))
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"hospital_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"hospital_code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"environment_type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hospitals_hospital_code_unique" UNIQUE("hospital_code"),
	CONSTRAINT "hospitals_environment_type_check" CHECK ("hospitals"."environment_type" IN ('TEST', 'DEVELOPMENT'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"organization_code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"organization_type" varchar(32) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organizations_organization_code_unique" UNIQUE("organization_code"),
	CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tenants_tenant_code_unique" UNIQUE("tenant_code"),
	CONSTRAINT "tenants_status_check" CHECK ("tenants"."status" IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);
--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_endpoints" ADD CONSTRAINT "hospital_endpoints_hospital_id_hospitals_hospital_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actors_tenant_id_idx" ON "actors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "actors_hospital_id_idx" ON "actors" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "actors_status_idx" ON "actors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hospital_endpoints_hospital_id_idx" ON "hospital_endpoints" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "hospital_endpoints_endpoint_type_idx" ON "hospital_endpoints" USING btree ("endpoint_type");--> statement-breakpoint
CREATE INDEX "hospitals_tenant_id_idx" ON "hospitals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hospitals_organization_id_idx" ON "hospitals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hospitals_status_idx" ON "hospitals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_organization_id_idx" ON "tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");