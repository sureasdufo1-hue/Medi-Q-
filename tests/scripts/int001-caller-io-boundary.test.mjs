import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const text = await readFile(new URL('../integration/authorized-source-capture.orthanc.integration.test.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('capture.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const find = name => {
  const nodes = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.equal(nodes.length, 1); return nodes[0].getText(ast);
};
const runtime = runInNewContext(`${find('createTransactionObservation')};${find('observeStreamReads')};
  ({createTransactionObservation,observeStreamReads})`, { assert, AsyncLocalStorage });
const create = runtime.createTransactionObservation, wrap = runtime.observeStreamReads;
const boundaryError = error => error?.code === 'ERR_ASSERTION' && error.message === 'DEC017_IO_WITHIN_OWN_TRANSACTION';
const barrier = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
function source(observer, failure) {
  let reads = 0; const cancelled = [];
  const stream = new ReadableStream({
    pull(controller) { reads++; if (failure) { controller.error(failure); return; }
      if (reads > 2) controller.close(); else controller.enqueue(new Uint8Array([reads])); },
    cancel(reason) { cancelled.push(reason); },
  }, { highWaterMark: 0 });
  assert.equal(wrap(stream, observer.assertOutside), stream, 'native stream identity is preserved');
  return { stream, reads: () => reads, cancelled };
}

for (const phase of ['BEFORE_BEGIN','BEGIN_PENDING','OPEN','COMMIT_PENDING','UNKNOWN','CLOSED']) {
  test(`pre-acquired reader rejects own ${phase} before underlying read and resumes after run`, async () => {
    const observer = create(), s = source(observer), reader = s.stream.getReader();
    try {
      await observer.run(async () => {
        if (phase !== 'BEFORE_BEGIN') {
          const begin = observer.query('BEGIN');
          if (phase !== 'BEGIN_PENDING') begin(true);
          if (['COMMIT_PENDING','UNKNOWN','CLOSED'].includes(phase)) {
            const commit = observer.query('COMMIT');
            if (phase !== 'COMMIT_PENDING') commit(phase === 'CLOSED');
          }
        }
        assert.equal(observer.snapshot().own, phase);
        await assert.rejects(reader.read(), boundaryError); assert.equal(s.reads(), 0);
      });
      assert.deepEqual([...(await reader.read()).value], [1]);
    } finally { await reader.cancel(); reader.releaseLock(); }
  });
}
test('nested completed context cannot escape active owning parent through an inherited callback', async () => {
  const observer = create(), s = source(observer), reader = s.stream.getReader(), release = barrier();
  let inherited;
  try {
    await observer.run(async () => {
      observer.query('BEGIN')(true);
      await observer.run(async () => { inherited = release.promise.then(() => reader.read()); });
      release.resolve(); await assert.rejects(inherited, boundaryError);
      assert.equal(s.reads(), 0);
    });
    assert.deepEqual([...(await reader.read()).value], [1]);
  } finally { release.resolve(); await reader.cancel(); reader.releaseLock(); }
});
test('caller guard permits unrelated concurrent transaction without waiting for it to finish', async () => {
  const observer = create(), release = barrier(), ready = barrier(), s = source(observer), reader = s.stream.getReader();
  const held = observer.run(async () => { observer.query('BEGIN')(true); ready.resolve(); await release.promise; });
  try {
    await ready.promise; assert.equal(observer.snapshot().other, 'OPEN');
    assert.deepEqual([...(await reader.read()).value], [1]);
    assert.deepEqual([...(await reader.read()).value], [2]);
    assert.equal((await reader.read()).done, true); assert.equal(s.reads(), 3);
  } finally { release.resolve(); await held; reader.releaseLock(); }
});
test('caller wrapper preserves original source error identity, lock lifecycle and cancellation', async () => {
  const observer = create(), error = new Error('TEST-ONLY'), s = source(observer, error), reader = s.stream.getReader();
  await assert.rejects(reader.read(), cause => cause === error);
  await assert.rejects(reader.closed, cause => cause === error); reader.releaseLock();
  const clean = source(observer), cancel = clean.stream.getReader();
  await cancel.cancel('TEST-CANCEL'); cancel.releaseLock();
  assert.deepEqual(clean.cancelled, ['TEST-CANCEL']); assert.equal(clean.reads(), 0);
});
test('actual Node Readable.fromWeb consumption reaches caller guard before physical read', async () => {
  const observer = create(), s = source(observer);
  await observer.run(async () => {
    observer.query('BEGIN')(true);
    const native = Readable.fromWeb(s.stream);
    await assert.rejects(async () => { for await (const _chunk of native) assert.fail('unexpected read'); }, boundaryError);
    assert.equal(s.reads(), 0);
  });
});

let monitorExpression;
function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'monitored') monitorExpression = n.initializer.getText(ast); ts.forEachChild(n, visit); }
visit(ast); assert.ok(monitorExpression);
test('actual transport monitor allows independent transaction overlap (old global guard RED)', async () => {
  const observer = create(), release = barrier(), ready = barrier();
  let pulls = 0;
  const monitored = runInNewContext(monitorExpression, {
    ReadableStream, assert, activeTenantTransactions: 1, initialAuthorizationCommitted: true,
    assertOutsideTransaction: observer.assertOutside,
    reader: { read: async () => { pulls++; return { done: true }; }, cancel: async () => {} },
    recordSourceFailure: () => {},
  });
  const reader = wrap(monitored, observer.assertOutside).getReader();
  const held = observer.run(async () => { observer.query('BEGIN')(true); ready.resolve(); await release.promise; });
  try { await ready.promise; assert.equal((await reader.read()).done, true); assert.equal(pulls, 1); }
  finally { release.resolve(); await held; await reader.cancel().catch(() => {}); reader.releaseLock(); }
});

const holdReadOnly = runInNewContext(`${find('startUnrelatedReadOnlyTransaction')}; startUnrelatedReadOnlyTransaction`, { assert, Date });
function backgroundFixture({ role = 'mediq_runtime', mode = 'on', returnedTenant = '', observerError = false } = {}) {
  const state = { active: false, ownerFinished: false, observerReleased: 0, returnedReleased: 0, connects: 0, queries: [] };
  const holder = { async query(sql) {
    state.queries.push(sql);
    if (sql === 'SET TRANSACTION READ ONLY') return { rows: [] };
    return { rows: [{ pid: 71, role, readonly: mode }] };
  } };
  const observer = { async query(sql, params) {
    state.queries.push(sql); assert.deepEqual([...params], [71]);
    if (observerError) throw new Error('TEST-OBSERVER-FAILURE');
    return { rowCount: 1, rows: [{ observer_role: 'mediq_runtime', observer_pid: 72, pid: 71,
      state: state.active ? 'idle in transaction' : 'idle', xact_start: state.active ? new Date() : null }] };
  }, release() { state.observerReleased++; } };
  const returned = { async query(sql) { state.queries.push(sql); return { rows: [{ pid: 71, tenant: returnedTenant, readonly: 'off' }] }; },
    release() { state.returnedReleased++; } };
  const harness = {
    actorContext: { async run(_principal, _tenant, work) {
      state.active = true;
      try { return await work({}, holder); }
      finally { state.active = false; state.ownerFinished = true; }
    } },
    database: { async connect() { return ++state.connects === 1 ? observer : returned; } },
    assertOutsideTransaction() {},
  };
  return { harness, state };
}
test('actual holder helper uses separate same-role observer, counts all effect stages and releases/reset-checks once', async () => {
  const f = backgroundFixture(), held = await holdReadOnly(f.harness, {}, 'TEST-TENANT');
  for (const stage of ['SOURCE','WRITE','SYNC','CONSUMER','PURGE']) await held.assertHeld(stage);
  assert.deepEqual({ ...held.counts() }, { SOURCE: 1, WRITE: 1, SYNC: 1, CONSUMER: 1, PURGE: 1 });
  const first = held.close(); assert.equal(held.close(), first); await first;
  assert.equal(f.state.ownerFinished, true); assert.equal(f.state.observerReleased, 1); assert.equal(f.state.returnedReleased, 1);
  assert.ok(f.state.queries.every(sql => /^(SELECT|SET TRANSACTION READ ONLY)/.test(sql)));
});
test('holder setup denies wrong role/read-write mode and does not leave a waiting owner', async () => {
  for (const option of [{ role: 'TEST-WRONG-ROLE' }, { mode: 'off' }]) {
    const f = backgroundFixture(option);
    await assert.rejects(holdReadOnly(f.harness, {}, 'TEST-TENANT'), error => error.code === 'ERR_ASSERTION');
    assert.equal(f.state.ownerFinished, true); assert.equal(f.state.active, false); assert.equal(f.state.connects, 0);
  }
});
test('holder cleanup retains observer/reset failure but still releases both clients and holder', async () => {
  for (const option of [{ observerError: true }, { returnedTenant: 'TEST-LEAKED-TENANT' }]) {
    const f = backgroundFixture(option), held = await holdReadOnly(f.harness, {}, 'TEST-TENANT');
    await assert.rejects(held.close(), { message: 'DEC017_OVERLAP_CLEANUP_FAILED' });
    assert.equal(f.state.ownerFinished, true); assert.equal(f.state.observerReleased, 1);
    if (option.returnedTenant) assert.equal(f.state.returnedReleased, 1);
  }
});
test('abort releases an active holder and reports failure instead of successful overlap cleanup', async () => {
  const f = backgroundFixture(), controller = new AbortController();
  const held = await holdReadOnly(f.harness, {}, 'TEST-TENANT', controller.signal);
  controller.abort();
  await assert.rejects(held.close(), { message: 'DEC017_OVERLAP_CLEANUP_FAILED' });
  assert.equal(f.state.ownerFinished, true); assert.equal(f.state.observerReleased, 1);
  const before = backgroundFixture();
  await assert.rejects(holdReadOnly(before.harness, {}, 'TEST-TENANT', controller.signal), { message: 'DEC017_OVERLAP_ABORTED' });
  assert.equal(before.state.active, false); assert.equal(before.state.connects, 0);
});

test('actual overlap check requires exactly two purge-port observations, not one Audit or a lower bound', () => {
  const expressions = [];
  function visitPurge(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'assert.equal' &&
      node.arguments[0]?.getText(ast) === 'overlapObserver.counts().PURGE') expressions.push(node.getText(ast));
    ts.forEachChild(node, visitPurge);
  }
  visitPurge(ast); assert.equal(expressions.length, 1);
  const run = count => runInNewContext(expressions[0], { assert, overlapObserver: { counts: () => ({ PURGE: count }) } });
  assert.doesNotThrow(() => run(2));
  for (const count of [0,1,3]) assert.throws(() => run(count), error => error.code === 'ERR_ASSERTION');
});
