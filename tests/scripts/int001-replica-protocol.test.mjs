import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const moduleUrl = new URL("../integration/authorized-source-capture.orthanc.integration.test.mjs", import.meta.url).href;
const source = await readFile(fileURLToPath(moduleUrl), "utf8");
const ast = ts.createSourceFile("source.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "runReplicaProcess");
assert.equal(functions.length, 1, "EXACT_REPLICA_RUNNER_REQUIRED");
// Execute the actual function, not a copied implementation. Only import.meta's
// known module URL is supplied explicitly because vm scripts are not ESM.
const functionSource = functions[0].getText(ast).replaceAll("import.meta.url", "moduleUrl");

function harness(input = { signedToken: "TEST-EPHEMERAL-ONLY", handoff: { synthetic: true } }, signal) {
  const child = new EventEmitter();
  child.pid = 202;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let capturedInput = "", invocation, timeout, cleared = false, settled = false;
  const kills = [];
  child.stdin.setEncoding("utf8").on("data", chunk => { capturedInput += chunk; });
  child.kill = signal => { kills.push(signal); return true; };
  const runner = runInNewContext(`${functionSource}; runReplicaProcess`, {
    assert, Buffer, moduleUrl, fileURLToPath,
    process: { execPath: "TEST-node", pid: 101,
      env: { TEST_RUNTIME: "synthetic", NODE_TEST_CONTEXT: "child-v8", NODE_OPTIONS: "TEST-flags" } },
    spawn: (...args) => { invocation = args; return child; },
    setTimeout: (callback, millis) => { assert.equal(millis, 60_000); timeout = callback; return 17; },
    clearTimeout: id => { assert.equal(id, 17); cleared = true; },
  });
  const completion = runner(input, signal);
  completion.then(() => { settled = true; }, () => { settled = true; });
  return { child, completion, kills, expire: () => timeout(),
    state: () => ({ capturedInput, invocation, cleared, settled }) };
}

async function assertPending(run) {
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(run.state().settled, false, "MUST_WAIT_FOR_CHILD_CLOSE");
}

test("replica protocol: success waits for close and uses bounded stdin, not arguments", async () => {
  const controller = new AbortController();
  const run = harness(undefined, controller.signal);
  run.child.stdout.write("DEC017_REPLICA_RECOVERY_PASS\n");
  await assertPending(run);
  const [executable, args, options] = run.state().invocation;
  assert.equal(executable, "TEST-node");
  assert.equal(JSON.stringify(args), JSON.stringify([fileURLToPath(moduleUrl), "--mediq-recovery-child"]));
  assert.equal(options.env.NODE_TEST_CONTEXT, undefined);
  assert.equal(options.env.NODE_OPTIONS, undefined);
  assert.equal(options.env.TEST_RUNTIME, "synthetic");
  assert.equal(options.windowsHide, true);
  assert.equal(JSON.parse(run.state().capturedInput).signedToken, "TEST-EPHEMERAL-ONLY");
  run.child.emit("close", 0, null);
  await run.completion;
  assert.equal(run.state().cleared, true);
  controller.abort();
  assert.deepEqual(run.kills, [], "ABORT_LISTENER_REMOVED_AFTER_CLOSE");
});

for (const origin of ["spawn", "stdin"]) {
  test(`replica protocol: ${origin} error still awaits close and suppresses raw error`, async () => {
    const run = harness();
    (origin === "spawn" ? run.child : run.child.stdin).emit("error", new Error("TEST-RAW-ERROR"));
    await assertPending(run);
    run.child.emit("close", 1, null);
    await assert.rejects(run.completion, { message: "DEC017_REPLICA_FAILED" });
    assert.equal(run.state().cleared, true);
  });
}

test("replica protocol: timeout kills only its child and awaits actual close", async () => {
  const run = harness();
  run.expire();
  assert.deepEqual(run.kills, ["SIGKILL"]);
  await assertPending(run);
  run.child.emit("close", null, "SIGKILL");
  await assert.rejects(run.completion, { message: "DEC017_REPLICA_FAILED" });
  assert.equal(run.state().cleared, true);
});

test("replica protocol: test cancellation kills only its child and awaits close", async () => {
  const controller = new AbortController();
  const run = harness(undefined, controller.signal);
  controller.abort();
  assert.deepEqual(run.kills, ["SIGKILL"]);
  await assertPending(run);
  run.child.emit("close", null, "SIGKILL");
  await assert.rejects(run.completion, { message: "DEC017_REPLICA_FAILED" });
  assert.equal(run.state().cleared, true);
});

test("replica protocol: a cancelled test cannot spawn a child", async () => {
  const controller = new AbortController();
  controller.abort();
  const run = harness(undefined, controller.signal);
  await assert.rejects(run.completion, { message: "DEC017_REPLICA_CANCELLED" });
  assert.equal(run.state().invocation, undefined);
});

test("replica protocol: stdout and stderr share one output bound", async () => {
  const run = harness();
  run.child.stdout.write("x".repeat(2048));
  run.child.stderr.write("y".repeat(2049));
  assert.deepEqual(run.kills, ["SIGKILL"]);
  await assertPending(run);
  run.child.emit("close", null, "SIGKILL");
  await assert.rejects(run.completion, { message: "DEC017_REPLICA_FAILED" });
});

for (const [stream, code, content, expected] of [
  ["stdout", 0, "TEST-RAW-STDOUT", "DEC017_REPLICA_PROTOCOL"],
  ["stderr", 0, "TEST-RAW-STDERR", "DEC017_REPLICA_FAILED"],
  ["stdout", 1, "TEST-RAW-ERROR", "DEC017_REPLICA_FAILED"],
  ["stdout", 1, "DEC017_REPLICA_FAILED_ERR_ASSERTION_LINE_123\n", "DEC017_REPLICA_FAILED_ERR_ASSERTION_LINE_123"],
]) {
  test(`replica protocol: ${stream}/${code}/${expected} reports fixed diagnostics only`, async () => {
    const run = harness();
    run.child[stream].write(content);
    await assertPending(run);
    run.child.emit("close", code, null);
    await assert.rejects(run.completion, { message: expected });
  });
}

test("replica protocol: oversized input cannot spawn a child", async () => {
  const run = harness({ synthetic: "x".repeat(65_537) });
  await assert.rejects(run.completion, error => error.message === "DEC017_REPLICA_INPUT_BOUND");
  assert.equal(run.state().invocation, undefined);
  assert.equal(run.state().cleared, false);
});
