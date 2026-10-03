import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../database/grant-issue-api-runtime.integration.test.mjs", import.meta.url), "utf8");
const ast = ts.createSourceFile("grant.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ["grantDatabaseFailure", "runtimeProxy"];
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(selected.length, 2, "EXACT_DIAGNOSTIC_FUNCTIONS_REQUIRED");

function harness({ connectError, queryError, failAt = "" } = {}) {
  const logs = [], calls = [];
  let clock = 0, released = false;
  const client = {
    async query(...args) { calls.push(args); if (queryError) throw queryError; return { synthetic: true }; },
    release() { assert.equal(this, client); released = true; },
  };
  const pool = { async connect() { if (connectError) throw connectError; return client; } };
  const api = runInNewContext(`${selected.map(node => node.getText(ast)).join("\n")}; ({runtimeProxy,grantDatabaseFailure})`, {
    performance: { now: () => { clock += 5001; return clock; } }, console: { error: marker => logs.push(marker) },
  });
  return { proxy: api.runtimeProxy(pool, failAt), classify: api.grantDatabaseFailure, logs, calls,
    released: () => released };
}

test("Grant diagnostics forward exact query object, parameters, timeout and release receiver", async () => {
  const run = harness(), client = await run.proxy.connect();
  const query = { text: "COMMIT", query_timeout: 5000 }, params = ["TEST-only"];
  const result = await client.query(query, params);
  assert.deepEqual(result, { synthetic: true });
  assert.equal(run.calls[0][0], query);
  assert.equal(run.calls[0][1], params);
  client.release();
  assert.equal(run.released(), true);
  assert.deepEqual(run.logs, []);
});

test("Grant connect failure preserves error identity and redacts raw credentials", async () => {
  const error = new Error("TEST-RAW-SECRET SQL /patient/path");
  const run = harness({ connectError: error });
  await assert.rejects(run.proxy.connect(), actual => actual === error);
  assert.deepEqual(run.logs, ["GRT003_DB_FAILURE=CONNECT_UNCLASSIFIED_GTE5SEC"]);
});

for (const [query, error, expected] of [
  [{ text: "COMMIT", query_timeout: 5000 }, new Error("Query read timeout"), "COMMIT_QUERY_READ_TIMEOUT"],
  ["RESET mediq.tenant_id", { code: "ECONNRESET", message: "TEST-RAW-SECRET" }, "RESET_NODE_ECONNRESET"],
  ["BEGIN", { code: "08006" }, "BEGIN_SQLSTATE_08006"],
  ["SELECT set_config('mediq.tenant_id',$1,true)", { code: "42501" }, "TENANT_SQLSTATE_42501"],
  ["SELECT actor_id FROM actors WHERE actor_id=$1", { code: "42P01" }, "REGISTRY_SQLSTATE_42P01"],
  ["ROLLBACK", new Error("connection terminated unexpectedly"), "ROLLBACK_CONNECTION_TERMINATED"],
  ["SELECT 'TEST-RAW-SECRET'", { code: "TEST-RAW-SECRET", message: "TEST-RAW-SECRET" }, "QUERY_UNCLASSIFIED"],
]) {
  test(`Grant diagnostics classify ${expected} without changing the failed query`, async () => {
    const run = harness({ queryError: error }), client = await run.proxy.connect();
    await assert.rejects(client.query(query), actual => actual === error);
    assert.equal(run.calls[0][0], query);
    assert.deepEqual(run.logs, [`GRT003_DB_FAILURE=${expected}_GTE5SEC`]);
  });
}

for (const [failAt, query, params, repeats] of [
  ["scope", "INSERT INTO transfer_grant_scopes", [], 1],
  ["audit", "INSERT INTO audit_events", [], 2],
  ["grant-denial-audit", "INSERT INTO audit_events", [null, null, null, null, null, null, null, "GRANT_DENIED"], 1],
  ["revoke-audit", "INSERT INTO audit_events", [null, null, null, null, null, null, null, "GRANT_REVOKED"], 1],
  ["commit", { text: "COMMIT", query_timeout: 5000 }, [], 1],
]) {
  test(`Grant diagnostics preserve intentional ${failAt} fault without treating it as an unexpected DB failure`, async () => {
    const run = harness({ failAt }), client = await run.proxy.connect();
    for (let i = 1; i < repeats; i++) await client.query(query, params);
    await assert.rejects(client.query(query, params));
    assert.equal(run.calls.length, repeats - 1);
    assert.deepEqual(run.logs, []);
  });
}

test("Grant diagnostic labels and timing are bounded, never raw caller values", () => {
  const run = harness();
  for (const [elapsed, bucket] of [[-1, "INVALID_DURATION"], [NaN, "INVALID_DURATION"], [0, "LT100MS"],
    [100, "100TO999MS"], [1000, "1TO4SEC"], [5000, "GTE5SEC"]]) {
    assert.equal(run.classify("TEST-RAW-SECRET", new Error("TEST-RAW-SECRET"), elapsed),
      `GRT003_DB_FAILURE=QUERY_UNCLASSIFIED_${bucket}`);
  }
});
