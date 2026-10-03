import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sourceMutationCases } from "../fixtures/source-capture-mutation-fixture.mjs";

// Execute the real client without importing/running the integration entry point.
const source = await readFile(new URL("../integration/authorized-source-capture.orthanc.integration.test.mjs", import.meta.url), "utf8");
const ast = ts.createSourceFile("source.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "controlMutation");
assert.ok(fn);
const diagnosticFn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sourceFailureMarkers');
const projectFailures = runInNewContext(`${diagnosticFn.getText(ast)}; sourceFailureMarkers`);
test('source diagnostic projection accepts only fixed stage/code/Boolean without raw fields', () => {
  const valid={stage:'HTTP_BODY',code:'ASSERTION',transactionActive:true,message:'TEST-RAW',path:'/tmp/TEST-RAW'};
  assert.deepEqual([...projectFailures([valid])],['DEC017_STAGE_HTTP_BODY_ASSERTION_TX_ACTIVE']);
  for (const input of [undefined,null,{},[null],[{...valid,stage:'TEST-RAW'}],[{...valid,code:'TEST-RAW'}],[{...valid,transactionActive:'true'}]])
    assert.deepEqual([...projectFailures(input)],[]);
  assert.equal(JSON.stringify(projectFailures([valid])).includes('TEST-RAW'),false);
});
test('source diagnostic projection deduplicates and bounds fixed markers', () => {
  const repeated=Array.from({length:100},()=>({stage:'METADATA',code:'GENERIC',transactionActive:false}));
  assert.deepEqual([...projectFailures(repeated)],['DEC017_STAGE_METADATA_GENERIC_TX_CLOSED']);
  const diverse=['FETCH','METADATA','INSTANCE_OPEN','HTTP_BODY','INSTANCE_BODY','FAILURE_AUDIT'].flatMap(stage=>
    [true,false].map(transactionActive=>({stage,code:'GENERIC',transactionActive})));
  assert.equal(projectFailures(diverse).length,8);
  assert.ok(projectFailures(diverse).every(item=>/^DEC017_STAGE_[A-Z_]+$/.test(item)));
});
function harness({ env = {}, response = { status: "OK" }, ok = true, raw, error } = {}) {
  const calls = [];
  const run = runInNewContext(`${fn.getText(ast)}; controlMutation`, {
    assert, URL, Buffer, AbortSignal, sourceMutationCases,
    process: { env: { MEDIQ_TEST_MUTATION_URL: "http://mediq-int001-capture-123456abcdef-fixture-mutator:8792",
      MEDIQ_TEST_MUTATION_TOKEN: "a".repeat(64), ...env } },
    fetch: async (url, input) => {
      calls.push({ url: url.href, ...input });
      if (error) throw error;
      return { ok, body: { async *[Symbol.asyncIterator]() { yield Buffer.from(raw ?? JSON.stringify(response)); } } };
    },
  });
  return { run, calls };
}
for (const transition of ["APPLY", "ASSERT_AND_RESTORE"]) {
  test(`mutation client forwards only fixed scenario/transition: ${transition}`, async () => {
    const h = harness(), signal = new AbortController().signal;
    await h.run(sourceMutationCases[0], transition, signal);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, "http://mediq-int001-capture-123456abcdef-fixture-mutator:8792/transition");
    assert.equal(h.calls[0].method, "POST");
    assert.deepEqual(JSON.parse(h.calls[0].body), { scenario: sourceMutationCases[0].name, transition });
    assert.deepEqual(Object.keys(h.calls[0].headers).sort(), ["content-type", "x-mediq-test-mutation"]);
    assert.equal(h.calls[0].headers["x-mediq-test-mutation"], "a".repeat(64));
    assert.equal(h.calls[0].signal.aborted, false);
  });
}
for (const url of [undefined, "https://mediq-int001-capture-123456abcdef-fixture-mutator:8792", "http://localhost:8792",
  "http://mediq-int001-capture-123456abcdef-fixture-mutator:8791", "http://mediq-int001-capture-123456abcdef-fixture-mutator:8792/other",
  "http://user:secret@mediq-int001-capture-123456abcdef-fixture-mutator:8792", "http://mediq-int001-capture-123456abcdef-fixture-mutator:8792?x=1",
  "http://mediq-int001-capture-123456abcdef-fixture-mutator:8792#fragment"]) {
  test("mutation client denies unsafe address before network", async () => {
    const h = harness({ env: { MEDIQ_TEST_MUTATION_URL: url } });
    await assert.rejects(h.run(sourceMutationCases[0], "APPLY"), { message: "DEC017_MUTATION_CLIENT_UNAVAILABLE" });
    assert.equal(h.calls.length, 0);
  });
}
test("mutation client denies missing/wrong token and forged scenario/transition before network", async () => {
  for (const token of [undefined, "short", "A".repeat(64)]) {
    const h = harness({ env: { MEDIQ_TEST_MUTATION_TOKEN: token } });
    await assert.rejects(h.run(sourceMutationCases[0], "APPLY"), { message: "DEC017_MUTATION_CLIENT_UNAVAILABLE" });
    assert.equal(h.calls.length, 0);
  }
  for (const [scenario, transition] of [[{ ...sourceMutationCases[0] }, "APPLY"], [sourceMutationCases[0], "SQL"]]) {
    const h = harness();
    await assert.rejects(h.run(scenario, transition), { message: "DEC017_MUTATION_CLIENT_UNAVAILABLE" });
    assert.equal(h.calls.length, 0);
  }
});
for (const [options, code] of [
  [{ raw: "x".repeat(1025) }, "CLIENT_UNAVAILABLE"], [{ raw: "{bad" }, "CLIENT_UNAVAILABLE"],
  [{ response: { status: "OK", value: "TEST-RAW" } }, "CLIENT_UNAVAILABLE"],
  [{ ok: false, response: { status: "FAILED", code: "TEST-RAW" } }, "REJECTED"],
  [{ ok: false, response: { status: "FAILED", code: "DEC017_MUTATION_PRESTATE" } }, "PRESTATE"],
  [{ error: new Error("TEST-RAW-SECRET") }, "CLIENT_UNAVAILABLE"],
]) {
  test(`mutation client fails closed with fixed bounded error: ${code}`, async () => {
    await assert.rejects(harness(options).run(sourceMutationCases[0], "APPLY"), { message: `DEC017_MUTATION_${code}` });
  });
}
