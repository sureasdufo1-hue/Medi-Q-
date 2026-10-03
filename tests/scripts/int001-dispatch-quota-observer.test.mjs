// Actual helper execution with controlled client results; real SQL/RLS is separate.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../scripts/verify-int001-dispatched-reads.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('observer.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'inspectDispatchedQuota');
assert.equal(helpers.length, 1);
const inspect = runInNewContext(`${helpers[0].getText(ast)}; inspectDispatchedQuota`, {
  check: (condition, marker) => assert.ok(condition, `DISPREAD_OBSERVER_${marker}`),
});
const scope = "SELECT current_user AS role,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation";
const queries = [scope, 'SET LOCAL ROLE mediq_quota_owner', scope,
  'SELECT count(*)::int AS n FROM temporary_payload_reservations',
  'SELECT count(*)::int AS n FROM temporary_payload_package_quotas',
  'SELECT reserved_bytes::text AS reserved_bytes FROM temporary_payload_quota_state'];
const validRows = () => [
  [{ role: 'mediq_migrator', read_only: 'on', isolation: 'repeatable read' }], [],
  [{ role: 'mediq_quota_owner', read_only: 'on', isolation: 'repeatable read' }],
  [{ n: 0 }], [{ n: 0 }], [{ reserved_bytes: '0' }],
];
function clientFor(rows = validRows(), failAt = -1) {
  const calls = [];
  return { calls, async query(sql) {
    const index = calls.length; calls.push(sql);
    assert.equal(sql, queries[index], 'QUOTA_EXACT_FIXED_QUERY_ORDER');
    if (index === failAt) throw Object.assign(new Error('SENSITIVE_TEST_VALUE'), { code: '42501' });
    return { rows: rows[index] };
  } };
}
test('actual quota helper uses only six fixed observer queries in verified read-only scope', async () => {
  const client = clientFor(); await inspect(client);
  assert.deepEqual(client.calls, queries);
  assert.ok(!queries.some(sql => /GRANT|INSERT|UPDATE|DELETE|SET ROLE(?! LOCAL)/.test(sql)));
});
for (const [index, expectedRole] of [[0, 'mediq_migrator'], [2, 'mediq_quota_owner']]) {
  for (const field of ['role', 'read_only', 'isolation']) {
    test(`scope ${index} refuses incorrect ${field} before protected quota reads`, async () => {
      const rows = validRows(); rows[index][0][field] = field === 'role' ? 'mediq_runtime' : 'incorrect';
      const client = clientFor(rows);
      await assert.rejects(inspect(client), new RegExp(index === 0 ? 'QUOTA_INITIAL_SCOPE' : 'QUOTA_OWNER_SCOPE'));
      assert.equal(client.calls.length, index + 1);
      assert.ok(expectedRole !== 'mediq_runtime');
    });
  }
  test(`scope ${index} refuses missing or duplicate role rows`, async () => {
    for (const replacement of [[], [...validRows()[index], ...validRows()[index]]]) {
      const rows = validRows(); rows[index] = replacement;
      await assert.rejects(inspect(clientFor(rows)), /QUOTA_(INITIAL|OWNER)_SCOPE/);
    }
  });
}
for (const index of [3, 4]) {
  test(`quota count ${index} refuses nonzero, malformed, missing or duplicate results`, async () => {
    for (const replacement of [[{ n: 1 }], [{ n: -1 }], [{ n: '0' }], [{ n: false }], [{}], [], [{ n: 0 }, { n: 0 }]]) {
      const rows = validRows(); rows[index] = replacement;
      await assert.rejects(inspect(clientFor(rows)), /NO_(RESERVATIONS|PACKAGE_QUOTAS)/);
    }
  });
}
test('environment quota requires exactly one explicit decimal-zero singleton', async () => {
  for (const replacement of [[{ reserved_bytes: '1' }], [{ reserved_bytes: '00' }], [{ reserved_bytes: 0 }],
    [{ reserved_bytes: null }], [{ reserved_bytes: false }], [{}], [], [{ reserved_bytes: '0' }, { reserved_bytes: '0' }]]) {
    const rows = validRows(); rows[5] = replacement;
    await assert.rejects(inspect(clientFor(rows)), /NO_ENVIRONMENT_QUOTA/);
  }
});
for (let index = 0; index < queries.length; index++) {
  test(`query failure ${index} propagates and never continues or succeeds`, async () => {
    const client = clientFor(validRows(), index);
    await assert.rejects(inspect(client), error => error.code === '42501');
    assert.equal(client.calls.length, index + 1);
  });
}
test('outer transaction resets local role on success or rollback before pool release', () => {
  const helperCall = source.indexOf('  await inspectDispatchedQuota(client);');
  assert.ok(helperCall > source.indexOf('EXACT_AUDIT_PARTITION'));
  assert.ok(helperCall > source.indexOf('await assertRuntimePrivilegeCatalog(client)'));
  const terminal = source.slice(helperCall);
  assert.match(terminal, /await client\.query\('COMMIT'\);\s+check\(\(await client\.query\('SELECT current_user AS role'\)\)\.rows\[0\]\?\.role === 'mediq_migrator', 'QUOTA_ROLE_RESET'\);/);
  assert.ok(terminal.indexOf('QUOTA_ROLE_RESET') < terminal.indexOf("console.log('dispatched_read_observer=PASS"));
  assert.ok(terminal.indexOf("client?.query('ROLLBACK')") < terminal.indexOf('client?.release()'));
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.doesNotMatch(source, /GRANT\s|ALTER ROLE|SET ROLE\s|MEDIQ_DATABASE_URL/);
});
