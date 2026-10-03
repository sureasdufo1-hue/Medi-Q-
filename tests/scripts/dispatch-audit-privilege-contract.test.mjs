// Deterministic negative controls; real database RLS/denial proof is separate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditDispatchSelectColumns, legacyRuntimePrivileges, expectedRuntimePrivileges,
  assertRuntimePrivilegeCatalog } from '../fixtures/runtime-privilege-contract.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [migration,journalText,wrapper,integration,observer,dockerfile,runtimeTest] = await Promise.all([
  read('../../services/api/src/database/migrations/0026_dispatch_audit_metadata_select.sql'),
  read('../../services/api/src/database/migrations/meta/_journal.json'),
  read('../../scripts/test-db-008-full-schema.ps1'),
  read('../integration/authorized-source-capture.orthanc.integration.test.mjs'),
  read('../../scripts/verify-int001-dispatched-reads.mjs'),
  read('../../services/api/Dockerfile'),
  read('../database/dispatch-audit-metadata-runtime.integration.test.mjs'),
]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('R3 preserves all previous 244 entries and adds only exact nine Audit SELECT tuples', () => {
  const legacy = legacyRuntimePrivileges(), current = expectedRuntimePrivileges();
  assert.equal(legacy.length,244);
  assert.equal(hash(legacy),'15696857e81de1d02b5f6fc901865e19e1440057e787220c156cf11060b4d98a');
  assert.equal(current.length,253); assert.equal(new Set(current).size,253);
  assert.deepEqual(legacy.filter(value => !current.includes(value)),[]);
  assert.deepEqual(current.filter(value => !legacy.includes(value)),auditDispatchSelectColumns.map(c => `audit_events.${c}:SELECT`));
  assert.equal(current.filter(value => /^audit_events\..*:INSERT$/.test(value)).length,12);
  assert.deepEqual(auditDispatchSelectColumns,['action','actor_id','exchange_session_id','occurred_at','reason_code','resource_id','resource_type','result','tenant_id']);
});

test('new migration consists only of the approved column SELECT grant', () => {
  const sql = migration.replace(/^--.*$/gm,'').trim();
  const match = /^GRANT SELECT\s*\(([^)]+)\)\s+ON TABLE audit_events TO mediq_runtime;$/i.exec(sql);
  assert.ok(match,'R3_ONE_COLUMN_GRANT_ONLY');
  assert.deepEqual(match[1].split(',').map(s => s.trim()).sort(),[...auditDispatchSelectColumns]);
});

test('journal keeps 26 historical entries and appends ordered migration 0026', () => {
  const journal = JSON.parse(journalText);
  assert.equal(journal.entries.length,27);
  assert.equal(hash(journal.entries.slice(0,26)),'a771273a49f31fd0865aa4cfac6f407fdc0fb769d3cfe0ee08968dbd5813e448');
  for (const [index,entry] of journal.entries.entries()) {
    assert.equal(entry.idx,index);
    if (index) assert.ok(entry.when > journal.entries[index-1].when);
  }
  assert.deepEqual(journal.entries[26],{idx:26,version:'7',when:1791039600000,tag:'0026_dispatch_audit_metadata_select',breakpoints:true});
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
  assert.equal(swapped.length,253);
  await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(swapped)),/DISPATCH_AUDIT_EXACT_253_PRIVILEGES/);
});

test('catalog rejects missing extra duplicate and mutable Audit privileges', async () => {
  const approved = expectedRuntimePrivileges();
  for (const invalid of [approved.slice(1),[...approved,'audit_events.action:UPDATE'],
    [...approved.slice(1),approved[1]],approved.map(v => v === 'audit_events.action:SELECT' ? 'audit_events.action:DELETE' : v)]) {
    await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(invalid)),/DISPATCH_AUDIT_EXACT_253_PRIVILEGES/);
  }
});

test('catalog rejects table-level and PUBLIC rights even with exact approved column entries', async () => {
  for (const forbidden of [{tables:1,public_columns:0},{tables:0,public_columns:1}]) {
    await assert.rejects(assertRuntimePrivilegeCatalog(catalogClient(expectedRuntimePrivileges(),forbidden)),/DISPATCH_AUDIT_NO_TABLE_PUBLIC_RIGHTS/);
  }
});

test('source and independent observer use exact shared contract, not old 244 assertions', () => {
  assert.equal((integration.match(/await assertRuntimePrivilegeCatalog\(runtime\)/g) ?? []).length,2);
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
