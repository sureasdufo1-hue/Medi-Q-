// Deterministic negative controls; real database RLS/denial proof is separate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditDispatchSelectColumns, legacyRuntimePrivileges, dispatchAuditRuntimePrivileges,
  destinationEvidencePrivilegeDelta, postDestinationRuntimePrivileges,
  terminalizationPrivilegeDelta, expectedRuntimePrivileges,
  assertRuntimePrivilegeCatalog } from '../fixtures/runtime-privilege-contract.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [migration,journalText,wrapper,integration,observer,dockerfile,runtimeTest,destinationMigration,terminalizationMigration] = await Promise.all([
  read('../../services/api/src/database/migrations/0026_dispatch_audit_metadata_select.sql'),
  read('../../services/api/src/database/migrations/meta/_journal.json'),
  read('../../scripts/test-db-008-full-schema.ps1'),
  read('../integration/authorized-source-capture.orthanc.integration.test.mjs'),
  read('../../scripts/verify-int001-dispatched-reads.mjs'),
  read('../../services/api/Dockerfile'),
  read('../database/dispatch-audit-metadata-runtime.integration.test.mjs'),
  read('../../services/api/src/database/migrations/0027_destination_verify_evidence.sql'),
  read('../../services/api/src/database/migrations/0028_pacs_terminalization.sql'),
]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('R3 preserves all previous 244 entries and adds only exact nine Audit SELECT tuples', () => {
  const legacy = legacyRuntimePrivileges(), current = dispatchAuditRuntimePrivileges();
  assert.equal(legacy.length,244);
  assert.equal(hash(legacy),'15696857e81de1d02b5f6fc901865e19e1440057e787220c156cf11060b4d98a');
  assert.equal(current.length,253); assert.equal(new Set(current).size,253);
  assert.deepEqual(legacy.filter(value => !current.includes(value)),[]);
  assert.deepEqual(current.filter(value => !legacy.includes(value)),auditDispatchSelectColumns.map(c => `audit_events.${c}:SELECT`));
  assert.equal(current.filter(value => /^audit_events\..*:INSERT$/.test(value)).length,12);
  assert.deepEqual(auditDispatchSelectColumns,['action','actor_id','exchange_session_id','occurred_at','reason_code','resource_id','resource_type','result','tenant_id']);
});

test('DEC-023 adds only the exact five destination evidence column privileges', () => {
  const previous = dispatchAuditRuntimePrivileges(), current = postDestinationRuntimePrivileges();
  assert.equal(previous.length,253);
  assert.equal(current.length,258);
  assert.deepEqual(current.filter(value => !previous.includes(value)),destinationEvidencePrivilegeDelta().sort());
  assert.deepEqual(destinationEvidencePrivilegeDelta().sort(),[
    'integrity_evidence.destination_digest:INSERT',
    'integrity_evidence.destination_digest:SELECT',
    'integrity_evidence.destination_object_count:INSERT',
    'integrity_evidence.destination_object_count:SELECT',
    'provenance_records.integrity_id:UPDATE',
  ]);
});

test('DEC-024 adds only the exact four terminalization UPDATE tuples', () => {
  const previous = postDestinationRuntimePrivileges(), current = expectedRuntimePrivileges();
  const sql = terminalizationMigration.replace(/^--.*$/gm,'');
  assert.equal(previous.length,258);
  assert.equal(current.length,262);
  assert.deepEqual(current.filter(value => !previous.includes(value)),terminalizationPrivilegeDelta().sort());
  assert.match(sql,/GRANT UPDATE \(transfer_status, ingested_at, transferred_at\)\s+ON TABLE provenance_records TO mediq_runtime;/);
  assert.match(sql,/GRANT UPDATE \(completed_at\)\s+ON TABLE exchange_sessions TO mediq_runtime;/);
  assert.doesNotMatch(sql,/SECURITY\s+DEFINER/i);
  assert.equal((sql.match(/CREATE TRIGGER/g) ?? []).length,3);
});

test('new migration consists only of the approved column SELECT grant', () => {
  const sql = migration.replace(/^--.*$/gm,'').trim();
  const match = /^GRANT SELECT\s*\(([^)]+)\)\s+ON TABLE audit_events TO mediq_runtime;$/i.exec(sql);
  assert.ok(match,'R3_ONE_COLUMN_GRANT_ONLY');
  assert.deepEqual(match[1].split(',').map(s => s.trim()).sort(),[...auditDispatchSelectColumns]);
});

test('DEC-023 migration adds exact rights and invoker guards only', () => {
  const sql = destinationMigration.replace(/^--.*$/gm,'');
  assert.match(sql,/GRANT SELECT \(destination_digest, destination_object_count\),\s*INSERT \(destination_digest, destination_object_count\)\s*ON TABLE integrity_evidence TO mediq_runtime;/);
  assert.match(sql,/GRANT UPDATE \(integrity_id\)\s*ON TABLE provenance_records TO mediq_runtime;/);
  assert.match(sql,/REVOKE ALL PRIVILEGES \(destination_digest, destination_object_count\)/);
  assert.match(sql,/REVOKE UPDATE \(integrity_id\)\s*ON TABLE provenance_records FROM PUBLIC, mediq_runtime;/);
  assert.equal((sql.match(/CREATE FUNCTION/g) ?? []).length,2);
  assert.equal((sql.match(/CREATE TRIGGER/g) ?? []).length,2);
  assert.doesNotMatch(sql,/SECURITY\s+DEFINER/i);
  assert.match(sql,/CREATE TRIGGER integrity_evidence_destination_verify_binding_trigger/);
  assert.match(sql,/CREATE TRIGGER provenance_records_destination_integrity_link_trigger/);
  assert.match(sql,/JOIN public\.integrity_evidence AS src\s+ON src\.operation_id = op\.operation_id[\s\S]*?src\.integrity_id <> NEW\.integrity_id/);
  assert.doesNotMatch(sql,/src\.integrity_id = NEW\.integrity_id/);
});

test('journal preserves prior entries and appends ordered migrations 0027 and 0028', () => {
  const journal = JSON.parse(journalText);
  assert.equal(journal.entries.length,29);
  assert.equal(hash(journal.entries.slice(0,26)),'a771273a49f31fd0865aa4cfac6f407fdc0fb769d3cfe0ee08968dbd5813e448');
  for (const [index,entry] of journal.entries.entries()) {
    assert.equal(entry.idx,index);
    if (index) assert.ok(entry.when > journal.entries[index-1].when);
  }
  assert.deepEqual(journal.entries[26],{idx:26,version:'7',when:1791039600000,tag:'0026_dispatch_audit_metadata_select',breakpoints:true});
  assert.deepEqual(journal.entries[27],{idx:27,version:'7',when:1791066791084,tag:'0027_destination_verify_evidence',breakpoints:true});
  assert.deepEqual(journal.entries[28],{idx:28,version:'7',when:1791082308596,tag:'0028_pacs_terminalization',breakpoints:true});
});

const rowsFor = entries => entries.map(entry => {
  const [name,privilege_type] = entry.split(':'), [table_name,column_name] = name.split('.');
  return { table_name,column_name,privilege_type };
});
const catalogClient = (entries,forbidden={tables:0,public_columns:0}) => ({
  async query(sql) {
    if (sql.includes('SELECT table_name,column_name,privilege_type')) return { rows:rowsFor(entries) };
    assert.match(sql,/information_schema\.table_privileges/);
    return { rows:[forbidden] };
  },
});

test('exact catalog comparison accepts reordered complete entries, not count-only substitutions', async () => {
  const approved = expectedRuntimePrivileges();
  await assertRuntimePrivilegeCatalog(catalogClient([...approved].reverse()));
  const swapped = approved.map(value => value === 'audit_events.occurred_at:SELECT' ? 'audit_events.created_at:SELECT' : value);
  assert.equal(swapped.length,262);
  await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(swapped)),/PACS_TERMINALIZATION_EXACT_262_PRIVILEGES/);
});

test('catalog rejects missing extra duplicate and mutable Audit privileges', async () => {
  const approved = expectedRuntimePrivileges();
  for (const invalid of [approved.slice(1),[...approved,'audit_events.action:UPDATE'],
    [...approved.slice(1),approved[1]],approved.map(v => v === 'audit_events.action:SELECT' ? 'audit_events.action:DELETE' : v)]) {
    await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(invalid)),/PACS_TERMINALIZATION_EXACT_262_PRIVILEGES/);
  }
});

test('catalog rejects table-level and PUBLIC rights even with exact approved column entries', async () => {
  for (const forbidden of [{tables:1,public_columns:0},{tables:0,public_columns:1}]) {
    await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(expectedRuntimePrivileges(),forbidden)),/DISPATCH_AUDIT_NO_TABLE_PUBLIC_RIGHTS/);
  }
});

test('source and independent observer use exact shared contract, not old 244 assertions', () => {
  // Source, dispatched read and the new actual destination path each prove the
  // same exact catalog; no count-only or alternate privilege set is allowed.
  assert.equal((integration.match(/await assertRuntimePrivilegeCatalog\(runtime\)/g) ?? []).length,3);
  assert.match(observer,/await assertRuntimePrivilegeCatalog\(client\)/);
  assert.doesNotMatch(integration,/rows\[0\]\.n, 244/);
  assert.match(dockerfile,/COPY tests\/fixtures\/runtime-privilege-contract\.mjs tests\/fixtures\/runtime-privilege-contract\.mjs/);
});

test('DB wrapper runs separate runtime acceptance with exact success and failure summaries', () => {
  assert.match(wrapper,/\$auditReadArgs = \$integrationArgs \+ @\("node", "--test", "--test-reporter=tap", "tests\/database\/dispatch-audit-metadata-runtime\.integration\.test\.mjs"\)/);
  assert.match(wrapper,/Assert-R3AuditReadResult -ExitCode \$auditReadExitCode -Output \$auditReadOutput/);
  assert.match(wrapper,/tests 1/); assert.match(wrapper,/pass 1/); assert.match(wrapper,/fail 0/);
  assert.match(wrapper,/\[regex\]::Escape\(\$marker\)/);
  assert.match(wrapper,/raw output suppressed/);
  assert.match(runtimeTest,/for \(const tenant of \[fixture\.tenantA,fixture\.tenantB\]\)/);
  for (const field of ['audit_event_id','correlation_id','created_at']) assert.ok(runtimeTest.includes(`SELECT ${field} FROM audit_events WHERE false`));
  assert.ok(runtimeTest.includes('SELECT * FROM audit_events WHERE false'));
  assert.ok(runtimeTest.includes('UPDATE audit_events SET action=action WHERE false'));
  assert.ok(runtimeTest.includes('DELETE FROM audit_events WHERE false'));
});
