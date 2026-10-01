REVOKE ALL PRIVILEGES ON TABLE actors, tenants, hospitals FROM mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
  ON TABLE actors FROM mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
  ON TABLE tenants FROM mediq_runtime;--> statement-breakpoint
REVOKE ALL PRIVILEGES (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
  ON TABLE hospitals FROM mediq_runtime;--> statement-breakpoint
GRANT SELECT (actor_id, tenant_id, hospital_id, actor_type, external_subject, status)
  ON TABLE actors TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (tenant_id, status)
  ON TABLE tenants TO mediq_runtime;--> statement-breakpoint
GRANT SELECT (hospital_id, tenant_id, status)
  ON TABLE hospitals TO mediq_runtime;
