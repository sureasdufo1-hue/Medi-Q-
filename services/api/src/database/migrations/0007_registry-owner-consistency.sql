ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tenant_org_unique" UNIQUE("tenant_id","organization_id");--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_tenant_hospital_unique" UNIQUE("tenant_id","hospital_id");--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_status_check" CHECK ("hospitals"."status" IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'));--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_status_check" CHECK ("actors"."status" IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'));--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_tenant_org_fk" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "public"."tenants"("tenant_id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_tenant_hospital_fk" FOREIGN KEY ("tenant_id","hospital_id") REFERENCES "public"."hospitals"("tenant_id","hospital_id") ON DELETE restrict ON UPDATE no action;
