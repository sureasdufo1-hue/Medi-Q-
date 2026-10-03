import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../integration/authorized-source-capture.orthanc.integration.test.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('capture.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const named = name => {
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1);
  return matches[0].getText(ast);
};
const create = runInNewContext(`${named('createTransactionObservation')}; createTransactionObservation`, { AsyncLocalStorage, assert });
const project = runInNewContext(`${named('sourceFailureMarkers')}; sourceFailureMarkers`);
const plain = observer => ({ ...observer.snapshot() });
const barrier = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const none = { own: 'NONE', other: 'NONE' };

test('actual observer distinguishes run lifetime from acknowledged SQL transaction lifetime', async () => {
  const observer = create();
  assert.deepEqual(plain(observer), none);
  await observer.run(async () => {
    assert.deepEqual(plain(observer), { own: 'BEFORE_BEGIN', other: 'NONE' });
    const begin = observer.query('BEGIN');
    assert.equal(observer.snapshot().own, 'BEGIN_PENDING');
    begin(true); assert.equal(observer.snapshot().own, 'OPEN');
    observer.query('SELECT TEST_ONLY')(true); assert.equal(observer.snapshot().own, 'OPEN');
    const commit = observer.query('COMMIT');
    assert.equal(observer.snapshot().own, 'COMMIT_PENDING');
    commit(true); assert.equal(observer.snapshot().own, 'CLOSED');
    observer.query('RESET mediq.tenant_id')(true); assert.equal(observer.snapshot().own, 'CLOSED');
  });
  assert.deepEqual(plain(observer), none);
});

test('unacknowledged transaction failure remains UNKNOWN, never a false closed transaction', async () => {
  for (const statement of ['BEGIN', 'COMMIT', 'ROLLBACK']) {
    const observer = create();
    await observer.run(async () => {
      observer.query('BEGIN')(true);
      observer.query(statement)(false);
      assert.equal(observer.snapshot().own, 'UNKNOWN');
      const rollback = observer.query('ROLLBACK');
      assert.equal(observer.snapshot().own, 'ROLLBACK_PENDING');
      rollback(true); assert.equal(observer.snapshot().own, 'CLOSED');
      rollback(false); assert.equal(observer.snapshot().own, 'CLOSED');
    });
    assert.deepEqual(plain(observer), none);
  }
});

test('unrelated concurrent run is other OPEN and nested transaction is own OPEN with distinct outer context', async () => {
  const observer = create(), ready = barrier(), release = barrier();
  const held = observer.run(async () => {
    observer.query('BEGIN')(true); ready.resolve(); await release.promise;
    observer.query('ROLLBACK')(true);
  });
  try {
    await ready.promise; assert.deepEqual(plain(observer), { own: 'NONE', other: 'OPEN' });
    await observer.run(async () => {
      assert.deepEqual(plain(observer), { own: 'BEFORE_BEGIN', other: 'OPEN' });
      observer.query('BEGIN')(true);
      assert.deepEqual(plain(observer), { own: 'OPEN', other: 'OPEN' });
      await observer.run(async () => {
        assert.deepEqual(plain(observer), { own: 'BEFORE_BEGIN', other: 'OPEN' });
        observer.query('BEGIN')(true);
        assert.deepEqual(plain(observer), { own: 'OPEN', other: 'OPEN' });
        observer.query('COMMIT')(true);
      });
      assert.deepEqual(plain(observer), { own: 'OPEN', other: 'OPEN' });
      observer.query('COMMIT')(true);
    });
  } finally { release.resolve(); await held; }
  assert.deepEqual(plain(observer), none);
});

test('settled and throwing runs release frames, including delayed callbacks inherited from their context', async () => {
  const observer = create(), release = barrier(), error = new Error('TEST-ONLY');
  let escaped;
  await assert.rejects(observer.run(async () => {
    observer.query('BEGIN')(true);
    escaped = release.promise.then(() => plain(observer));
    throw error;
  }), cause => cause === error);
  assert.deepEqual(plain(observer), none);
  release.resolve(); assert.deepEqual(await escaped, none);
  observer.query('BEGIN')(true); assert.deepEqual(plain(observer), none);
});

test('different concurrent phases are bounded MULTIPLE, not arbitrary identities or an unbounded list', async () => {
  const observer = create(), release = barrier();
  const holds = ['BEGIN', 'COMMIT'].map(statement => observer.run(async () => {
    observer.query(statement); await release.promise;
  }));
  try { assert.deepEqual(plain(observer), { own: 'NONE', other: 'MULTIPLE' }); }
  finally { release.resolve(); await Promise.all(holds); }
  assert.deepEqual(plain(observer), none);
});

test('fixed context projection rejects raw phases, ignores raw fields and preserves bounded original diagnostics', () => {
  const failure = { stage: 'HTTP_BODY', code: 'ASSERTION', transactionActive: true,
    transactionContext: { own: 'NONE', other: 'OPEN', sql: 'TEST-RAW' } };
  assert.deepEqual([...project([failure])], [
    'DEC017_STAGE_HTTP_BODY_ASSERTION_TX_ACTIVE', 'DEC017_CONTEXT_HTTP_BODY_OWN_NONE_OTHER_OPEN',
  ]);
  for (const context of [null, {}, { own: 'TEST-RAW', other: 'OPEN' }, { own: 'NONE', other: 'TEST-RAW' }]) {
    assert.deepEqual([...project([{ ...failure, transactionContext: context }])], ['DEC017_STAGE_HTTP_BODY_ASSERTION_TX_ACTIVE']);
  }
  assert.equal(project(Array.from({ length: 100 }, () => failure)).length, 2);
  assert.equal(JSON.stringify(project([failure])).includes('TEST-RAW'), false);
});

const monitors = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'monitored') monitors.push(node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast); assert.equal(monitors.length, 1);
function monitor(observer, failures) {
  // Keep R8's pull-context diagnostic counterexample independently of R9's
  // caller guard. These tests deliberately inject a rejecting model check;
  // the real caller/Node-adapter behavior is tested in caller-io-boundary.
  return runInNewContext(`const activeTenantTransactions=1, initialAuthorizationCommitted=true;
    const assertOutsideTransaction=()=>assert.equal(activeTenantTransactions,0);
    const monitored=${monitors[0]}; monitored`, {
    ReadableStream, assert,
    reader: { read: async () => { throw new Error('TEST-MUST-NOT-READ'); }, cancel: async () => undefined },
    recordSourceFailure: stage => failures.push({ stage, ...plain(observer) }),
  });
}
test('actual monitor still denies demanded I/O inside its own transaction and records OWN OPEN', async () => {
  const observer = create(), failures = [];
  await observer.run(async () => {
    observer.query('BEGIN')(true);
    const reader = monitor(observer, failures).getReader();
    try { await assert.rejects(reader.read(), cause => cause.code === 'ERR_ASSERTION'); }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    observer.query('ROLLBACK')(true);
  });
  assert.deepEqual(failures, [{ stage: 'HTTP_BODY', own: 'OPEN', other: 'NONE' }]);
});
test('actual monitor retains global denial but distinguishes unrelated transaction overlap', async () => {
  const observer = create(), failures = [], release = barrier(), ready = barrier();
  const held = observer.run(async () => {
    observer.query('BEGIN')(true); ready.resolve(); await release.promise;
    observer.query('ROLLBACK')(true);
  });
  try {
    await ready.promise;
    const reader = monitor(observer, failures).getReader();
    try { await assert.rejects(reader.read(), cause => cause.code === 'ERR_ASSERTION'); }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    assert.deepEqual(failures, [{ stage: 'HTTP_BODY', own: 'NONE', other: 'OPEN' }]);
  } finally { release.resolve(); await held; }
  assert.deepEqual(plain(observer), none);
});

test('pre-created stream read inside a transaction also reports OTHER: pull context cannot authorize reads', async () => {
  const observer = create(), failures = [];
  // Same observable snapshot as unrelated work, but this read is deliberately
  // awaited inside the transaction. Never replace rejection with OTHER=allow.
  const reader = monitor(observer, failures).getReader();
  try {
    await observer.run(async () => {
      observer.query('BEGIN')(true);
      assert.equal(observer.snapshot().own, 'OPEN', 'caller really is inside its transaction');
      await assert.rejects(reader.read(), cause => cause.code === 'ERR_ASSERTION');
      observer.query('ROLLBACK')(true);
    });
    assert.deepEqual(failures, [{ stage: 'HTTP_BODY', own: 'NONE', other: 'OPEN' }]);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  assert.deepEqual(plain(observer), none);
});
