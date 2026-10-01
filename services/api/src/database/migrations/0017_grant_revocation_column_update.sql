REVOKE UPDATE (status, revoked_at)
  ON TABLE transfer_grants FROM PUBLIC, mediq_runtime;--> statement-breakpoint
GRANT UPDATE (status, revoked_at)
  ON TABLE transfer_grants TO mediq_runtime;
