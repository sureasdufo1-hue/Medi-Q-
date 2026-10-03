-- PACS-001-DEC-020-R3: only metadata required by durable dispatch predicates.
-- Existing FORCE RLS/Tenant policy and append-only Audit INSERT stay unchanged.
GRANT SELECT (resource_id, resource_type, exchange_session_id, actor_id,
  tenant_id, action, result, reason_code, occurred_at)
  ON TABLE audit_events TO mediq_runtime;
