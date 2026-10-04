// Independent approved catalog contract, not derived from migration SQL/results.
import assert from 'node:assert/strict';
export const auditDispatchSelectColumns = Object.freeze([
  'action','actor_id','exchange_session_id','occurred_at','reason_code','resource_id','resource_type','result','tenant_id',
]);
export function legacyRuntimePrivileges() {
  const columns = {
    actors: ["actor_id", "actor_type", "external_subject", "hospital_id", "status", "tenant_id"],
    hospitals: ["hospital_id", "status", "tenant_id"],
    tenants: ["status", "tenant_id"],
    patient_refs: ["created_at", "patient_ref_code", "patient_ref_id", "status", "updated_at"],
    patient_mappings: ["created_at", "hospital_id", "local_patient_id", "mapping_id", "patient_ref_id", "status", "updated_at", "validated_at"],
    exchange_sessions: ["completed_at", "created_at", "destination_hospital_id", "expires_at", "idempotency_key", "patient_ref_id", "purpose", "requester_actor_id", "session_id", "source_hospital_id", "state", "updated_at"],
    audit_events: ["action", "actor_id", "audit_event_id", "correlation_id", "created_at", "exchange_session_id", "occurred_at", "reason_code", "resource_id", "resource_type", "result", "tenant_id"],
    consents: ["consent_id", "created_at", "consent_version", "destination_hospital_id", "exchange_session_id", "expires_at", "imaging_package_id", "issued_at", "patient_ref_id", "source_hospital_id", "status", "updated_at", "withdrawn_at"],
    consent_actions: ["action", "consent_action_id", "consent_id"],
    transfer_grants: ["consent_id", "created_at", "exchange_session_id", "expires_at", "grant_id", "idempotency_key", "imaging_package_id", "issued_at", "recipient_actor_id", "recipient_hospital_id", "recipient_tenant_id", "revoked_at", "status"],
    transfer_grant_scopes: ["grant_id", "scope"],
    imaging_packages: ["deleted_at", "exchange_session_id", "package_id", "patient_ref_id", "retention_expires_at", "source_hospital_id", "state"],
    study_references: ["instance_count", "package_id", "series_count", "source_hospital_id", "study_instance_uid", "study_ref_id", "temporary_payload_expires_at", "temporary_payload_purged_at", "temporary_payload_state", "temporary_storage_ref"],
    integrity_evidence: ["algorithm", "created_at", "exchange_session_id", "integrity_id", "operation_id", "package_id", "source_digest", "source_object_count", "status", "study_ref_id", "verification_stage", "verified_at"],
    pacs_transfer_operations: ["actor_id", "created_at", "destination_object_count", "exchange_session_id", "idempotency_key", "operation_id", "reason_code", "request_digest", "source_object_count", "state", "stow_started_at", "study_ref_id", "tenant_id", "updated_at", "version"],
    provenance_records: ["created_at", "destination_hospital_id", "exchange_session_id", "ingested_at", "integrity_id", "operation_id", "package_id", "provenance_id", "source_hospital_id", "study_ref_id", "transfer_status", "transfer_type", "transferred_at"],
  };
  const privileges = [];
  for (const [table, names] of Object.entries(columns)) {
    for (const column of names) {
      if (table !== "audit_events") privileges.push(`${table}.${column}:SELECT`);
      if (["patient_refs", "exchange_sessions", "consents", "consent_actions", "transfer_grants", "pacs_transfer_operations", "provenance_records", "integrity_evidence"].includes(table)) {
        privileges.push(`${table}.${column}:INSERT`);
      }
      if (table === "audit_events") privileges.push(`${table}.${column}:INSERT`);
    }
  }
  privileges.push("exchange_sessions.state:UPDATE", "exchange_sessions.updated_at:UPDATE");
  privileges.push("consents.status:UPDATE", "consents.issued_at:UPDATE", "consents.updated_at:UPDATE", "consents.withdrawn_at:UPDATE");
  privileges.push("transfer_grants.status:UPDATE", "transfer_grants.revoked_at:UPDATE");
  privileges.push(
    "study_references.temporary_storage_ref:UPDATE",
    "study_references.temporary_payload_state:UPDATE",
    "study_references.temporary_payload_expires_at:UPDATE",
    "study_references.temporary_payload_purged_at:UPDATE",
  );
  privileges.push(
    "pacs_transfer_operations.state:UPDATE",
    "pacs_transfer_operations.version:UPDATE",
    "pacs_transfer_operations.reason_code:UPDATE",
    "pacs_transfer_operations.source_object_count:UPDATE",
    "pacs_transfer_operations.destination_object_count:UPDATE",
    "pacs_transfer_operations.updated_at:UPDATE",
    "pacs_transfer_operations.stow_started_at:UPDATE",
  );
  privileges.push(
    "transfer_grant_scopes.grant_scope_id:INSERT",
    "transfer_grant_scopes.grant_id:INSERT",
    "transfer_grant_scopes.scope:INSERT",
  );
  return privileges.sort();
}
export function expectedRuntimePrivileges() {
  return [...postDestinationRuntimePrivileges(), ...terminalizationPrivilegeDelta()].sort();
}
export function postDestinationRuntimePrivileges() {
  return [...dispatchAuditRuntimePrivileges(), ...destinationEvidencePrivilegeDelta()].sort();
}
export function terminalizationPrivilegeDelta() {
  return [
    'provenance_records.transfer_status:UPDATE',
    'provenance_records.ingested_at:UPDATE',
    'provenance_records.transferred_at:UPDATE',
    'exchange_sessions.completed_at:UPDATE',
  ];
}
export function dispatchAuditRuntimePrivileges() {
  return [...legacyRuntimePrivileges(), ...auditDispatchSelectColumns.map(column => `audit_events.${column}:SELECT`)].sort();
}
export function destinationEvidencePrivilegeDelta() {
  return [
    'integrity_evidence.destination_digest:SELECT',
    'integrity_evidence.destination_digest:INSERT',
    'integrity_evidence.destination_object_count:SELECT',
    'integrity_evidence.destination_object_count:INSERT',
    'provenance_records.integrity_id:UPDATE',
  ];
}
export async function assertRuntimePrivilegeCatalog(client) {
  const result = await client.query(`SELECT table_name,column_name,privilege_type FROM information_schema.column_privileges
    WHERE grantee='mediq_runtime' AND table_schema='public'`);
  const actual = result.rows.map(row => `${row.table_name}.${row.column_name}:${row.privilege_type}`).sort();
  assert.ok(JSON.stringify(actual) === JSON.stringify(expectedRuntimePrivileges()), 'PACS_TERMINALIZATION_EXACT_262_PRIVILEGES');
  const forbidden = await client.query(`SELECT
    (SELECT count(*)::int FROM information_schema.table_privileges WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public') AS tables,
    (SELECT count(*)::int FROM information_schema.column_privileges WHERE grantee='PUBLIC' AND table_schema='public') AS public_columns`);
  assert.deepEqual(forbidden.rows[0], { tables:0, public_columns:0 }, 'DISPATCH_AUDIT_NO_TABLE_PUBLIC_RIGHTS');
}
