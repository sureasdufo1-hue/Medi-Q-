import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../api/authorized-source-capture.test.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('capture.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const diagnostic = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createLifecycleTimingDiagnostic');
assert.ok(diagnostic);
const create = runInNewContext(`${diagnostic.getText(ast)}; createLifecycleTimingDiagnostic`);
test('actual timing formatter returns fixed phase/monotonic buckets without caller fields', () => {
  let time = 0; const state = create(() => time);
  assert.equal(state.marker(), 'DEC017_API_LIFECYCLE_SETUP_ROOT_LT1000MS');
  state.mark('SYNC');
  for (const [elapsed, bucket] of [[999,'LT1000MS'],[1000,'LT4000MS'],[3999,'LT4000MS'],[4000,'GTE4000MS'],[5001,'GTE4000MS']]) {
    time = elapsed; assert.equal(state.marker(), `DEC017_API_LIFECYCLE_SYNC_${bucket}`);
  }
  state.mark('READ'); assert.equal(state.marker(), 'DEC017_API_LIFECYCLE_READ_LT1000MS');
});
test('actual formatter suppresses malformed phase, raw text and invalid/backward clocks', () => {
  let time = 1; const state = create(() => time);
  for (const phase of [undefined,null,{},'TEST-RAW-SECRET','SYNC\nTEST-RAW']) {
    state.mark(phase); assert.equal(state.marker(), 'DEC017_API_LIFECYCLE_UNKNOWN_LT1000MS');
  }
  state.mark('CAPTURE');
  for (const clock of [0,NaN,Infinity,'TEST-RAW']) { time = clock; assert.equal(state.marker(), 'DEC017_API_LIFECYCLE_CAPTURE_UNKNOWN'); }
});
const lifecycle = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'withLifecycle');
const arrows = new Map();
function visit(n) {
  if (ts.isPropertyAssignment(n) && ['write','sync'].includes(n.name.getText(ast)) && ts.isArrowFunction(n.initializer)) arrows.set(n.name.getText(ast), n.initializer.getText(ast));
  ts.forEachChild(n, visit);
}
visit(lifecycle); assert.equal(arrows.size, 2);
test('instrumented physical write forwards exact arguments and original promise with no added await', async () => {
  const marks = [], events = [], args = [], expected = Promise.resolve('TEST-RESULT');
  const write = runInNewContext(`(${arrows.get('write')})`, {
    mark: value => marks.push(value), harness: { activeTransactions: 0, reservedBytes: 8, lifecycleEvents: events },
    expect: actual => ({ toBe: wanted => assert.equal(actual, wanted), toBeGreaterThanOrEqual: wanted => assert.ok(actual >= wanted) }),
  });
  const bytes = new Uint8Array([1,2]);
  const file = { write(...passed) { args.push(passed); return expected; } };
  assert.equal(write(file, bytes, 0, 2, null), expected);
  assert.deepEqual(args, [[bytes,0,2,null]]); assert.deepEqual(marks, ['WRITE']); assert.deepEqual(events, ['physical:write']);
  await expected;
});
test('instrumented sync preserves receiver/result and synchronous error identity', () => {
  const marks = [], result = Promise.resolve();
  const sync = runInNewContext(`(${arrows.get('sync')})`, { mark: stage => marks.push(stage) });
  const file = { sync() { assert.equal(this, file); return result; } };
  assert.equal(sync(file), result);
  const error = new Error('TEST-ONLY');
  assert.throws(() => sync({ sync() { throw error; } }), cause => cause === error);
  assert.deepEqual(marks, ['SYNC','SYNC']);
});
