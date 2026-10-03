import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { temporaryCaptureLifecycleCases, privacyColumnContract, privacyPhases, privacyAssert,
  privacyTokenMatches, parsePrivacyProbe, assertPrivacyText, assertPrivacySnapshot,
  assertPublicCaptureProjection, assertPublicCaptureError } from "../fixtures/temporary-capture-lifecycle-fixture.mjs";

const scenario = temporaryCaptureLifecycleCases[0], digest = `sha256:${"a".repeat(64)}`;
test("privacy column contract matches independently read approved CREATE and later ADD COLUMN migrations", async () => {
  const directory = new URL("../../services/api/src/database/migrations/", import.meta.url);
  const columns = new Map();
  for (const filename of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(filename, directory), "utf8");
    assert.doesNotMatch(sql, /\b(?:DROP\s+COLUMN|RENAME\s+COLUMN)\b/i, "UNSUPPORTED_CATALOG_DDL_REQUIRES_EXPLICIT_TEST_UPDATE");
    for (const match of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\r?\n\);/g)) {
      columns.set(match[1], [...match[2].matchAll(/^\s*"([^"]+)"\s/gm)].map(column => column[1]));
    }
    for (const match of sql.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/g)) {
      assert.ok(columns.has(match[1]), "ALTER_TARGET_MUST_EXIST");
      columns.get(match[1]).push(match[2]);
    }
  }
  for (const [table, expected] of Object.entries(privacyColumnContract)) {
    const actual = columns.get(table)?.filter(column => table !== "study_references" || column.startsWith("temporary_"));
    assert.deepEqual(actual?.sort(), [...expected].sort(), `CATALOG_CONTRACT_${table}`);
  }
});
const ref = "bb000000-0000-4000-8000-000000000001", instant = new Date("2026-10-03T00:00:00Z");
function snapshot() {
  return {
    study_references: [{ temporary_storage_ref: ref, temporary_payload_state: "AVAILABLE", temporary_payload_expires_at: instant, temporary_payload_purged_at: null }],
    temporary_payload_quota_state: [{ singleton_id: true, max_environment_bytes: "10737418240", max_package_bytes: "2147483648", reserved_bytes: "1024", updated_at: instant }],
    temporary_payload_package_quotas: [{ package_id: scenario.packageId, reserved_bytes: "1024", updated_at: instant }],
    temporary_payload_reservations: [{ storage_ref: ref, quota_state_id: true, tenant_id: "02000000-0000-4000-8000-000000000002",
      study_ref_id: scenario.studyRefId, package_id: scenario.packageId, writer_id: ref, reserved_bytes: "1024", created_at: instant, updated_at: instant, settled: true }],
    integrity_evidence: [{ integrity_id: ref, exchange_session_id: scenario.sessionId, package_id: scenario.packageId, study_ref_id: scenario.studyRefId,
      verification_stage: "SOURCE_CAPTURE", algorithm: "SHA256-MANIFEST-V1", source_digest: digest, destination_digest: null,
      source_object_count: 3, destination_object_count: null, status: "PENDING", verified_at: null, created_at: instant, operation_id: scenario.operationId }],
    audit_events: [{ audit_event_id: ref, occurred_at: instant, actor_id: "0a000000-0000-4000-8000-000000000001",
      tenant_id: "02000000-0000-4000-8000-000000000002", exchange_session_id: scenario.sessionId, resource_type: "STUDY",
      resource_id: scenario.studyRefId, action: "PACS_SOURCE_CAPTURED", result: "SUCCESS", reason_code: null,
      correlation_id: scenario.correlationId, created_at: instant }],
  };
}
const rejects = work => assert.throws(work, error => /^DEC017_PRIVACY_[A-Z_]+$/.test(error.message) && !error.message.includes("TEST-PATIENT"));
test("privacy snapshots accept exact scoped live values and final released quota", () => {
  assert.deepEqual(assertPrivacySnapshot(snapshot(), scenario, digest), { state: "AVAILABLE", reserved: 1024 });
  const final = snapshot();
  final.study_references[0].temporary_payload_state = "PURGED";
  final.study_references[0].temporary_payload_purged_at = instant;
  final.temporary_payload_quota_state[0].reserved_bytes = "0";
  final.temporary_payload_package_quotas = [];
  final.temporary_payload_reservations = [];
  assert.deepEqual(assertPrivacySnapshot(final, scenario, digest), { state: "PURGED", reserved: 0 });
});
test("privacy settlement flag accepts staging Boolean false but denies available unsettled or non-Boolean values", () => {
  const staging = snapshot();
  staging.study_references[0].temporary_payload_state = "STAGING";
  staging.temporary_payload_reservations[0].settled = false;
  assert.equal(assertPrivacySnapshot(staging, scenario, digest).state, "STAGING");
  for (const value of [false, "true", "false", 1, null]) {
    const current = snapshot(); current.temporary_payload_reservations[0].settled = value;
    rejects(() => assertPrivacySnapshot(current, scenario, digest));
  }
});
for (const [table, columns] of Object.entries(privacyColumnContract)) {
  for (const column of columns) {
    test(`privacy rejects patient and key sentinels in ${table}.${column}`, () => {
      for (const value of ["TEST-PATIENT-007", "fa".repeat(32)]) {
        const current = snapshot(); current[table][0][column] = value;
        rejects(() => assertPrivacySnapshot(current, scenario, digest));
      }
    });
  }
  test(`privacy rejects missing and unexpected columns in ${table}`, () => {
    const extra = snapshot(); extra[table][0].patient_copy = "TEST-PATIENT-007";
    rejects(() => assertPrivacySnapshot(extra, scenario, digest));
    const missing = snapshot(); delete missing[table][0][columns[0]];
    rejects(() => assertPrivacySnapshot(missing, scenario, digest));
  });
}
test("privacy rejects wrong scope, digest, quota totals and destination evidence", () => {
  for (const change of [
    value => { value.temporary_payload_reservations[0].tenant_id = scenario.sessionId; },
    value => { value.integrity_evidence[0].source_digest = `sha256:${"b".repeat(64)}`; },
    value => { value.integrity_evidence[0].destination_digest = digest; },
    value => { value.temporary_payload_quota_state[0].reserved_bytes = "1025"; },
    value => { value.audit_events[0].resource_id = scenario.operationId; },
    value => { value.study_references[0].temporary_payload_state = "PURGED"; value.study_references[0].temporary_payload_purged_at = instant; },
  ]) { const current = snapshot(); change(current); rejects(() => assertPrivacySnapshot(current, scenario, digest)); }
});
test("privacy token comparison denies missing, wrong, oversized and Unicode input", () => {
  const token = "a".repeat(64);
  assert.equal(privacyTokenMatches(token, token), true);
  for (const input of [undefined, null, [], "b".repeat(64), "a".repeat(65), "한".repeat(64)]) assert.equal(privacyTokenMatches(token, input), false);
});
test("privacy protocol accepts only registered scenario and phase, without selectors or SQL", () => {
  assert.equal(parsePrivacyProbe({ scenario: scenario.name, phase: "AVAILABLE" }).scenario, scenario);
  for (const input of [null, [], {}, { scenario: "unknown", phase: "AVAILABLE" },
    { scenario: scenario.name, phase: "DROP" }, { scenario: scenario.name, phase: "AVAILABLE", sql: "SELECT secret" },
    { scenario: scenario.name, phase: "AVAILABLE", storageRef: ref }]) rejects(() => parsePrivacyProbe(input));
});
test("ordinary public projection retains only the approved four or two fields", () => {
  const success = { kind: "CAPTURED", evidenceId: ref, status: "PENDING", objectCount: 3 };
  assertPublicCaptureProjection(success);
  assertPublicCaptureProjection({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
  for (const field of ["handoff", "patientId", "studyInstanceUid", "dek", "path"]) rejects(() => assertPublicCaptureProjection({ ...success, [field]: "TEST-PATIENT-007" }));
  rejects(() => assertPublicCaptureProjection({ kind: "DENIED", reason: "SECRET" }));
  const error = Object.assign(new Error("SOURCE_CAPTURE_UNAVAILABLE"), { name: "AuthorizedSourceCaptureUnavailableError" });
  assertPublicCaptureError(error);
  rejects(() => assertPublicCaptureError(Object.assign(error, { payload: "TEST-PATIENT-007" })));
});
test("ordinary diagnostics reject quoted key material, source UID and path sentinels", () => {
  for (const text of ['{"password":"TEST-only"}', '{"dek":"TEST-only"}', "2.25.123", "TEST-PATIENT-007", "/tmp/example", "C:\\temp\\secret", "Bearer test-token"]) rejects(() => assertPrivacyText(text));
});

// The actual server function with a fake listener and pool; no socket/DB opened.
const serverSource = await readFile(new URL("../../scripts/verify-int001-source-capture.mjs", import.meta.url), "utf8");
const ast = ts.createSourceFile("observer.mjs", serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "servePrivacyObserver");
assert.equal(functions.length, 1);
async function serverHarness() {
  const server = new EventEmitter(), processFake = new EventEmitter();
  const token = "a".repeat(64);
  processFake.env = { MEDIQ_TEST_OBSERVATION_TOKEN: token };
  let handler, observations = 0, ready, requestedPhase;
  const initialized = new Promise(resolve => { ready = resolve; });
  server.listen = (_port, _host, done) => { done(); ready(); };
  server.closeAllConnections = () => {};
  server.close = () => server.emit("close");
  const run = runInNewContext(`${functions[0].getText(ast)}; servePrivacyObserver`, {
    URL, process: processFake, createServer: fn => { handler = fn; return server; },
    databaseUrl: "postgresql://mediq_migrator@localhost/synthetic", ids: { study: scenario.studyRefId },
    pool: { async query(sql) { return { rows: sql.includes("FROM pg_tables") ? [{ tablename: "TEST_TABLE" }]
      : [{ status: "VALID", study_instance_uid: "2.25.1", local_patient_id: "TEST-PATIENT-007" }] }; } },
    privacyAssert, privacyTokenMatches, parsePrivacyProbe, temporaryCaptureLifecycleCases,
    privacySnapshot: async () => {
      observations++;
      return { state: { RESERVED: "STAGING", QUOTA: "STAGING", AVAILABLE: "AVAILABLE", READ_RESULT: "AVAILABLE",
        PHYSICAL_ABSENT: "PURGE_PENDING", FINAL: "PURGED" }[requestedPhase], reserved: ["RESERVED", "FINAL"].includes(requestedPhase) ? 0 : 1024 };
    },
    setTimeout: () => 1, clearTimeout: () => {}, console: { log: () => {} },
  });
  const completion = run();
  await initialized;
  return { observations: () => observations, async request({ method = "POST", url = "/probe", suppliedToken = token, body = {} } = {}) {
    let response;
    requestedPhase = body?.phase;
    const request = { method, url, headers: { "x-mediq-test-observation": suppliedToken },
      async *[Symbol.asyncIterator]() { yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body)); } };
    const reply = { writeHead(code) { this.httpStatus = code; return this; }, end(text) { response = { httpStatus: this.httpStatus, ...JSON.parse(text) }; } };
    await handler(request, reply); return response;
  }, async close() { processFake.emit("SIGTERM"); await completion; } };
}
test("observer auth/protocol failures cannot trigger database snapshots or a false summary PASS", async () => {
  const run = await serverHarness();
  try {
    assert.equal((await run.request({ suppliedToken: "한".repeat(64) })).httpStatus, 401);
    assert.equal((await run.request({ suppliedToken: "" })).httpStatus, 401);
    assert.equal((await run.request({ body: { scenario: scenario.name, phase: "RESERVED", sql: "arbitrary" } })).httpStatus, 503);
    assert.equal((await run.request({ body: "x".repeat(1025) })).httpStatus, 503);
    assert.equal((await run.request({ body: "{invalid" })).httpStatus, 503);
    assert.equal(run.observations(), 0);
    assert.equal((await run.request({ method: "GET", url: "/summary" })).status, "INCOMPLETE");
  } finally { await run.close(); }
});
test("observer successful probes return fixed status only and incomplete ledger stays unaccepted", async () => {
  const run = await serverHarness();
  try {
    assert.deepEqual(await run.request({ body: { scenario: scenario.name, phase: "RESERVED" } }), { httpStatus: 200, status: "OK" });
    assert.equal(run.observations(), 1);
    assert.equal((await run.request({ method: "GET", url: "/summary" })).status, "INCOMPLETE");
  } finally { await run.close(); }
});

test("observer summary requires every registered phase and returns no stored values", async () => {
  const run = await serverHarness();
  try {
    for (const current of temporaryCaptureLifecycleCases) {
      for (const phase of privacyPhases) assert.equal((await run.request({ body: { scenario: current.name, phase } })).status, "OK");
    }
    assert.deepEqual(await run.request({ method: "GET", url: "/summary" }), { httpStatus: 200, status: "PRIVACY_OBSERVER_PASS" });
  } finally { await run.close(); }
});

const snapshotFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "privacySnapshot");
function snapshotHarness(shouldFail = false) {
  const calls = [], data = snapshot(), baseline = { studyUid: "2.25.1", patientId: "TEST-PATIENT-007", tables: ["TEST_TABLE"] };
  let released = false;
  const client = { async query(sql, args) {
    calls.push({ sql, args });
    if (shouldFail && sql.startsWith("SELECT * FROM integrity_evidence")) throw new Error("TEST-RAW-SECRET");
    if (sql.includes("FROM pg_class")) return { rows: Object.entries(privacyColumnContract).flatMap(([table_name, columns]) => columns.map(column_name => ({ table_name, column_name }))) };
    if (sql.includes("FROM pg_tables")) return { rows: [{ tablename: "TEST_TABLE" }] };
    if (sql.includes("CROSS JOIN patient_mappings")) return { rows: [{ study_instance_uid: baseline.studyUid, local_patient_id: baseline.patientId, status: "VALID" }] };
    if (sql.startsWith("SELECT source_digest")) return { rows: [{ source_digest: digest }] };
    if (sql.startsWith("SELECT temporary_storage_ref")) return { rows: data.study_references };
    const table = /^SELECT \* FROM ([a-z_]+)/.exec(sql)?.[1];
    if (table) return { rows: data[table] };
    return { rows: [] };
  }, release() { released = true; } };
  const run = runInNewContext(`${snapshotFunction.getText(ast)}; privacySnapshot`, {
    pool: { connect: async () => client }, ids: { tenant: "02000000-0000-4000-8000-000000000002", operation: scenario.operationId },
    privacyColumnContract, privacyAssert, assertPrivacySnapshot,
  });
  return { calls, released: () => released, run: () => run(scenario, baseline) };
}
test("observer transaction is read-only, exact-scope, role-local and always rolled back/released", async () => {
  const run = snapshotHarness();
  assert.deepEqual(await run.run(), { state: "AVAILABLE", reserved: 1024 });
  assert.equal(run.calls[0].sql, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.ok(run.calls.every(item => /^(BEGIN|SELECT|SET LOCAL ROLE mediq_quota_owner$|ROLLBACK$)/.test(item.sql)));
  assert.equal(run.calls.at(-1).sql, "ROLLBACK");
  assert.equal(run.released(), true);
});
test("observer database failure does not leave its read-only role/transaction open", async () => {
  const run = snapshotHarness(true);
  await assert.rejects(run.run(), { message: "TEST-RAW-SECRET" });
  assert.equal(run.calls.at(-1).sql, "ROLLBACK");
  assert.equal(run.released(), true);
});

test("observer actual HTTP transport enforces token/body/projection boundaries and closes its owned listener", { timeout: 10_000 }, async () => {
  const processFake = new EventEmitter(), token = "a".repeat(64);
  processFake.env = { MEDIQ_TEST_OBSERVATION_TOKEN: token };
  let server, observations = 0, ready;
  const initialized = new Promise(resolve => { ready = resolve; });
  const run = runInNewContext(`${functions[0].getText(ast)}; servePrivacyObserver`, {
    URL, process: processFake, createServer: handler => {
      server = createServer(handler);
      const listen = server.listen.bind(server);
      server.listen = (port, host, done) => {
        assert.equal(port, 8791); assert.equal(host, "0.0.0.0");
        return listen(0, "127.0.0.1", () => { done(); ready(); });
      };
      return server;
    },
    databaseUrl: "postgresql://mediq_migrator@localhost/synthetic", ids: { study: scenario.studyRefId },
    pool: { async query(sql) { return { rows: sql.includes("FROM pg_tables") ? [{ tablename: "TEST_TABLE" }]
      : [{ status: "VALID", study_instance_uid: "2.25.1", local_patient_id: "TEST-PATIENT-007" }] }; } },
    privacyAssert, privacyTokenMatches, parsePrivacyProbe, temporaryCaptureLifecycleCases,
    privacySnapshot: async () => { observations++; return { state: "STAGING", reserved: 0 }; },
    setTimeout, clearTimeout, console: { log: () => {} },
  });
  const completion = run();
  try {
    await initialized;
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const request = async (body, suppliedToken = token, path = "/probe") => {
      const response = await fetch(endpoint + path, { method: path === "/probe" ? "POST" : "GET",
        headers: { "x-mediq-test-observation": suppliedToken }, body: path === "/probe" ? body : undefined,
        signal: AbortSignal.timeout(2000) });
      return { status: response.status, body: await response.json() };
    };
    assert.deepEqual(await request("{}", ""), { status: 401, body: { status: "DENIED" } });
    assert.deepEqual(await request("{}", "b".repeat(64)), { status: 401, body: { status: "DENIED" } });
    assert.equal(observations, 0);
    assert.deepEqual(await request(JSON.stringify({ scenario: scenario.name, phase: "RESERVED" })), { status: 200, body: { status: "OK" } });
    for (const body of ["{invalid", "x".repeat(1025), JSON.stringify({ scenario: scenario.name, phase: "RESERVED", sql: "TEST-RAW" })]) {
      const result = await request(body);
      assert.equal(result.status, 503);
      assert.equal(result.body.status, "FAILED");
      assert.match(result.body.code, /^DEC017_PRIVACY_[A-Z_]+$/);
      assert.deepEqual(Object.keys(result.body).sort(), ["code", "status"]);
    }
    assert.equal(observations, 1);
    assert.deepEqual(await request(undefined, token, "/summary"), { status: 503, body: { status: "INCOMPLETE" } });
  } finally {
    processFake.emit("SIGTERM");
    await completion;
    assert.equal(server.listening, false);
  }
});

const clientSource = await readFile(new URL("../integration/authorized-source-capture.orthanc.integration.test.mjs", import.meta.url), "utf8");
const clientAst = ts.createSourceFile("client.mjs", clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const probeFunction = clientAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "observePrivacy");
for (const [phase, reply, expected] of [
  ["RESERVED", { status: "FAILED", code: "DEC017_PRIVACY_CATALOG" }, "DEC017_PRIVACY_PROBE_RESERVED_DEC017_PRIVACY_CATALOG"],
  ["TEST-RAW-SECRET", { status: "FAILED", code: "TEST-RAW-SECRET" }, "DEC017_PRIVACY_PROBE_UNKNOWN_DEC017_PRIVACY_OBSERVER_REJECTED"],
]) {
  test(`privacy probe emits only fixed sanitized failure diagnostics: ${expected}`, async () => {
    const logs = [];
    const probe = runInNewContext(`${probeFunction.getText(clientAst)}; observePrivacy`, {
      URL, Buffer, AbortSignal, privacyAssert, process: { env: { MEDIQ_TEST_OBSERVATION_URL: "http://mediq-int001-capture-123456abcdef-privacy-observer:8791",
        MEDIQ_TEST_OBSERVATION_TOKEN: "a".repeat(64) } }, console: { error: message => logs.push(message) },
      fetch: async () => ({ ok: false, body: { async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(reply)); } } }),
    });
    await assert.rejects(probe(scenario, phase), error => /^DEC017_PRIVACY_[A-Z_]+$/.test(error.message));
    assert.deepEqual(logs, [expected]);
  });
}
