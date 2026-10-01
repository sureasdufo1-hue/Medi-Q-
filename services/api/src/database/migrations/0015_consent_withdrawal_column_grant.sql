REVOKE UPDATE (withdrawn_at)
  ON TABLE consents FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT UPDATE (withdrawn_at)
  ON TABLE consents TO mediq_runtime;
