import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureMutationController, createMutationServer, parseMutationRequest } from "../../scripts/int001-fixture-mutation-controller.mjs";
import { sourceMutationCases, mutationFixtureIds as ids, mutationExpectedAudit } from "../fixtures/source-capture-mutation-fixture.mjs";
import { temporaryCaptureLifecycleCases } from "../fixtures/temporary-capture-lifecycle-fixture.mjs";

const now = new Date("2026-10-03T00:00:00Z");
const copy = value => structuredClone(value);
const request = (scenario, transition = "APPLY") => ({ scenario: scenario.name, transition });
function registry() {
  return {
    actors: [
      { actor_id: ids.actor, tenant_id: ids.tenant, hospital_id: ids.hospital, actor_type: "USER", external_subject: "synthetic-int001-source-capture-actor", display_name: "Synthetic Destination Clinician", status: "ACTIVE", created_at: now, updated_at: now },
      { actor_id: "0a000000-0000-4000-8000-000000000002", tenant_id: "02000000-0000-4000-8000-000000000001", hospital_id: ids.source, actor_type: "USER", external_subject: "synthetic-int001-cross-tenant-actor", display_name: "Synthetic Cross-Tenant Clinician", status: "ACTIVE", created_at: now, updated_at: now },
      { actor_id: "0a000000-0000-4000-8000-000000000003", tenant_id: ids.tenant, hospital_id: null, actor_type: "USER", external_subject: "synthetic-int001-patient-actor", display_name: "Synthetic Consent Patient", status: "ACTIVE", created_at: now, updated_at: now },
    ],
    mappings: [{ mapping_id: ids.mapping, patient_ref_id: ids.patient, hospital_id: ids.hospital, local_patient_id: ids.baselineLocalId,
      status: "VALID", validated_at: now, created_at: now, updated_at: now }],
  };
}
function graph(scenario) {
  const state = scenario.boundary === "METADATA" ? null : scenario.boundary === "RESERVED" ? "STAGING" : "AVAILABLE";
  return { operation_id: scenario.operationId, tenant_id: ids.tenant, exchange_session_id: scenario.sessionId,
    study_ref_id: scenario.studyRefId, actor_id: ids.actor, state: "CREATED", version: 0, stow_started_at: null,
    package_id: scenario.packageId, source_hospital_id: ids.source, study_instance_uid: "2.25.139413224574575433810421680499794275977",
    temporary_storage_ref: state ? "bb000000-0000-4000-8000-000000000001" : null,
    temporary_payload_state: state, temporary_payload_expires_at: state ? new Date(Date.now() + 600_000) : null,
    temporary_payload_purged_at: null, patient_ref_id: ids.patient, package_state: "AVAILABLE", package_storage_ref: null,
    destination_hospital_id: ids.hospital, requester_actor_id: ids.actor,
    package_session_id: scenario.sessionId, package_source_hospital_id: ids.source,
    session_patient_ref_id: ids.patient, session_source_hospital_id: ids.source, session_state: "ACTIVE",
    session_expires_at: new Date(Date.now() + 3_600_000), evidence_count: state === "AVAILABLE" ? 1 : 0 };
}
function audits(scenario, after = false) {
  return Object.entries(mutationExpectedAudit(scenario, after)).flatMap(([key, count]) => {
    const [action, result, reason] = key.split("|");
    return Array.from({ length: count }, () => ({ actor_id: ids.actor, tenant_id: ids.tenant, exchange_session_id: scenario.sessionId,
      resource_type: "STUDY", resource_id: scenario.studyRefId, action, result, reason_code: reason || null, correlation_id: scenario.correlationId }));
  });
}
function fakeDatabase() {
  const state = { registry: registry(), graphs: new Map(), audits: new Map(), calls: [], releases: 0, connects: 0,
    role: "mediq_migrator", fail: null, uncertainCommit: false, hold: null, updateCount: 1 };
  const pool = { async connect() {
    state.connects++;
    if (state.fail === "CONNECT") throw new Error("TEST-RAW-CREDENTIAL");
    let backup;
    return { release() { state.releases++; }, async query(sql, parameters) {
      state.calls.push({ sql, parameters: copy(parameters) });
      if (state.hold && sql.startsWith("SELECT * FROM actors")) { const pending = state.hold; state.hold = null; pending.entered(); await pending.promise; }
      if (state.fail === sql) throw new Error("TEST-RAW-SQL-SECRET");
      if (sql.startsWith("BEGIN")) { backup = copy(state.registry); return { rows: [] }; }
      if (sql === "COMMIT") { backup = undefined; if (state.uncertainCommit) throw new Error("TEST-LOST-COMMIT-ACK"); return { rows: [] }; }
      if (sql === "ROLLBACK") { if (backup) state.registry = backup; backup = undefined; return { rows: [] }; }
      if (sql.startsWith("SET LOCAL") || sql.startsWith("SELECT set_config") || sql.startsWith("SELECT pg_advisory")) return { rows: [] };
      if (sql === "SELECT current_user AS role") return { rows: [{ role: state.role }] };
      if (sql.startsWith("SELECT * FROM actors")) return { rows: copy(state.registry.actors) };
      if (sql.startsWith("SELECT * FROM patient_mappings")) return { rows: copy(state.registry.mappings) };
      if (sql.includes("FROM pacs_transfer_operations op")) return { rows: state.graphs.has(parameters[0]) ? [copy(state.graphs.get(parameters[0]))] : [] };
      if (sql.includes("FROM audit_events WHERE exchange_session_id")) return { rows: copy(state.audits.get(parameters[0]) ?? []) };
      if (sql.startsWith("UPDATE ")) {
        const actor = sql.startsWith("UPDATE actors"), local = sql.includes("SET local_patient_id");
        const field = local ? "local_patient_id" : "status", key = actor ? "actor_id" : "mapping_id";
        const target = (actor ? state.registry.actors : state.registry.mappings).find(row => row[key] === parameters[1] && row[field] === parameters[2]);
        if (!target || state.updateCount !== 1) return { rowCount: 0, rows: [] };
        target[field] = parameters[0]; return { rowCount: 1, rows: [] };
      }
      throw new Error("UNEXPECTED_TEST_SQL");
    } };
  } };
  return { pool, state, prepare(scenario) { state.graphs.set(scenario.operationId, graph(scenario)); state.audits.set(scenario.sessionId, audits(scenario)); },
    deny(scenario) { state.audits.set(scenario.sessionId, audits(scenario, true)); } };
}

test("R6 fixture IDs are distinct from each other and all 208 R5 selectors", () => {
  const fields = ["sessionId", "sessionKey", "packageId", "studyRefId", "consentId", "consentActionId", "grantId", "grantKey", "grantScopeId", "operationId", "operationKey", "correlationId", "revokeCorrelationId"];
  const ids = [...temporaryCaptureLifecycleCases, ...sourceMutationCases].flatMap(s => fields.map(key => s[key]));
  assert.equal(ids.length, 286); assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)));
});
test("R6 expected Audit counts distinguish metadata denial, inactive identity and between-check admission", () => {
  assert.deepEqual(mutationExpectedAudit(sourceMutationCases[0], true), {
    "PACS_SOURCE_CAPTURE_STARTED|ALLOW|": 1, "PACS_SOURCE_CAPTURE_DENIED|DENY|PATIENT_MAPPING_INVALID": 1 });
  assert.deepEqual(mutationExpectedAudit(sourceMutationCases[1], true), { "PACS_SOURCE_CAPTURE_STARTED|ALLOW|": 1 });
  assert.deepEqual(mutationExpectedAudit(sourceMutationCases[2], true), { "PACS_SOURCE_CAPTURE_STARTED|ALLOW|": 1,
    "PACS_SOURCE_CAPTURED|SUCCESS|": 1, "PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT": 1,
    "PACS_TEMPORARY_READ_FAILED|FAILURE|TEMPORARY_READ_FAILED": 1 });
  assert.equal(mutationExpectedAudit(sourceMutationCases[4], true)["PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT"], undefined);
  assert.equal(mutationExpectedAudit(sourceMutationCases[5], true)["PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT"], 1);
});
for (const input of [null, [], {}, { ...request(sourceMutationCases[0]), sql: "UPDATE actors" },
  { scenario: "unknown", transition: "APPLY" }, { scenario: sourceMutationCases[0].name, transition: "RESTORE" },
  { ...request(sourceMutationCases[0]), value: "ACTIVE" }]) {
  test(`mutation protocol rejects non-allowlisted input ${JSON.stringify(input)}`, () => {
    assert.throws(() => parseMutationRequest(input), { message: "DEC017_MUTATION_PROTOCOL" });
  });
}
test("actual controller commits each exact mutation then restores only after observed denial state", async () => {
  const db = fakeDatabase(), controller = createFixtureMutationController(db.pool), baseline = copy(db.state.registry);
  assert.deepEqual(controller.summary(), { status: "INCOMPLETE" });
  await controller.initialize();
  assert.equal(db.state.calls.some(call => call.sql.startsWith("UPDATE")), false);
  for (const scenario of sourceMutationCases) {
    db.prepare(scenario);
    assert.deepEqual(await controller.transition(request(scenario)), { status: "OK" });
    const expected = copy(baseline);
    if (scenario.mutation === "ACTOR_INACTIVE") expected.actors[0].status = "INACTIVE";
    else if (scenario.mutation === "MAPPING_REVOKED") expected.mappings[0].status = "REVOKED";
    else expected.mappings[0].local_patient_id = ids.reboundLocalId;
    assert.deepEqual(db.state.registry, expected);
    assert.deepEqual(controller.summary(), { status: "INCOMPLETE" });
    const connects = db.state.connects;
    await assert.rejects(controller.transition(request(scenario)), { message: "DEC017_MUTATION_ORDER" });
    assert.equal(db.state.connects, connects);
    db.deny(scenario);
    assert.deepEqual(await controller.transition(request(scenario, "ASSERT_AND_RESTORE")), { status: "OK" });
    assert.deepEqual(db.state.registry, baseline);
  }
  assert.deepEqual(controller.summary(), { status: "MUTATION_CONTROLLER_PASS" });
  assert.equal(db.state.connects, db.state.releases);
  assert.equal(db.state.calls.filter(call => call.sql.startsWith("UPDATE")).length, 12);
  assert.ok(db.state.calls.filter(call => call.sql.startsWith("UPDATE")).every(call => call.parameters.length === 3 && !call.sql.includes(ids.actor)));
});
for (const problem of ["ROLE", "BASELINE", "CONNECT"]) {
  test(`controller initialization fails closed without raw details: ${problem}`, async () => {
    const db = fakeDatabase();
    if (problem === "ROLE") db.state.role = "mediq_runtime";
    if (problem === "BASELINE") db.state.registry.mappings[0].local_patient_id = "TEST-UNEXPECTED";
    if (problem === "CONNECT") db.state.fail = "CONNECT";
    const controller = createFixtureMutationController(db.pool);
    await assert.rejects(controller.initialize(), { message: "DEC017_MUTATION_INITIALIZATION_FAILED" });
    assert.deepEqual(controller.summary(), { status: "INCOMPLETE" });
    assert.equal(db.state.calls.some(call => call.sql.startsWith("UPDATE")), false);
  });
}
for (const problem of ["REGISTRY", "GRAPH", "PRESTATE", "AUDIT", "UPDATE", "SQL", "COMMIT"]) {
  test(`actual controller rejects ${problem} and never blindly retries an uncertain transition`, async () => {
    const db = fakeDatabase(), scenario = sourceMutationCases[2], controller = createFixtureMutationController(db.pool);
    await controller.initialize(); db.prepare(scenario);
    if (problem === "REGISTRY") db.state.registry.actors[1].display_name = "TEST-CHANGED";
    if (problem === "GRAPH") db.state.graphs.get(scenario.operationId).tenant_id = scenario.sessionId;
    if (problem === "PRESTATE") db.state.graphs.get(scenario.operationId).temporary_payload_state = "PURGED";
    if (problem === "AUDIT") db.state.audits.set(scenario.sessionId, []);
    if (problem === "UPDATE") db.state.updateCount = 0;
    if (problem === "SQL") db.state.fail = "SELECT * FROM actors ORDER BY actor_id FOR UPDATE";
    if (problem === "COMMIT") db.state.uncertainCommit = true;
    await assert.rejects(controller.transition(request(scenario)), error => /^DEC017_MUTATION_[A-Z_]+$/.test(error.message) && !error.message.includes("TEST-RAW"));
    const calls = db.state.calls.length;
    await assert.rejects(controller.transition(request(scenario)), { message: "DEC017_MUTATION_UNAVAILABLE" });
    await assert.rejects(controller.transition(request(scenario, "ASSERT_AND_RESTORE")), { message: "DEC017_MUTATION_UNAVAILABLE" });
    assert.equal(db.state.calls.length, calls); assert.equal(db.state.connects, db.state.releases);
    assert.deepEqual(controller.summary(), { status: "INCOMPLETE" });
    if (problem === "COMMIT") assert.equal(db.state.registry.mappings[0].status, "REVOKED");
  });
}
test("restore requires exact retained graph and denial Audit, not just a request to undo", async () => {
  for (const corruption of ["missing-denial", "graph", "non-target"]) {
    const db = fakeDatabase(), scenario = sourceMutationCases[2], controller = createFixtureMutationController(db.pool);
    await controller.initialize(); db.prepare(scenario); await controller.transition(request(scenario));
    if (corruption !== "missing-denial") db.deny(scenario);
    if (corruption === "graph") db.state.graphs.get(scenario.operationId).temporary_storage_ref = scenario.operationId;
    if (corruption === "non-target") db.state.registry.actors[1].status = "INACTIVE";
    await assert.rejects(controller.transition(request(scenario, "ASSERT_AND_RESTORE")), /^Error: DEC017_MUTATION_/);
    assert.equal(db.state.registry.mappings[0].status, "REVOKED");
    assert.equal(db.state.calls.filter(call => call.sql.startsWith("UPDATE")).length, 1);
  }
});
test("pending mutation cannot race another transition and no second SQL transaction starts", async () => {
  const db = fakeDatabase(), scenario = sourceMutationCases[2], controller = createFixtureMutationController(db.pool);
  await controller.initialize(); db.prepare(scenario);
  let release, entered;
  const atBarrier = new Promise(resolve => { entered = resolve; });
  db.state.hold = { promise: new Promise(resolve => { release = resolve; }), entered };
  const pending = controller.transition(request(scenario));
  try {
    await atBarrier;
    const connects = db.state.connects;
    await assert.rejects(controller.transition(request(scenario)), { message: "DEC017_MUTATION_UNAVAILABLE" });
    assert.equal(db.state.connects, connects); assert.equal(controller.summary().status, "INCOMPLETE");
  } finally { release(); await pending; }
});
for (const drift of ["peer-id", "display-name", "extra-column"]) {
  test(`fixture initialization rejects exact baseline drift: ${drift}`, async () => {
    const db = fakeDatabase();
    if (drift === "peer-id") db.state.registry.actors[1].actor_id = sourceMutationCases[0].operationId;
    if (drift === "display-name") db.state.registry.actors[0].display_name = "TEST-UNEXPECTED-NAME";
    if (drift === "extra-column") db.state.registry.mappings[0].unapproved = "TEST-UNAPPROVED";
    const controller = createFixtureMutationController(db.pool);
    await assert.rejects(controller.initialize(), { message: "DEC017_MUTATION_INITIALIZATION_FAILED" });
    assert.equal(db.state.calls.some(call => call.sql.startsWith("UPDATE")), false);
  });
}
test("fixture mutation rejects Package belonging to a different Session before UPDATE", async () => {
  const db = fakeDatabase(), scenario = sourceMutationCases[2], controller = createFixtureMutationController(db.pool);
  await controller.initialize(); db.prepare(scenario);
  db.state.graphs.get(scenario.operationId).package_session_id = sourceMutationCases[0].sessionId;
  await assert.rejects(controller.transition(request(scenario)), { message: "DEC017_MUTATION_GRAPH" });
  assert.equal(db.state.calls.some(call => call.sql.startsWith("UPDATE")), false);
});
test("actual mutation HTTP transport bounds/authenticates requests and projects fixed responses", { timeout: 10_000 }, async () => {
  const token = "a".repeat(64), calls = [];
  const server = createMutationServer({ summary: () => ({ status: "INCOMPLETE" }), async transition(body) {
    calls.push(body); if (body.scenario === sourceMutationCases[1].name) throw new Error("TEST-RAW-CREDENTIAL");
    return { status: "OK" };
  } }, token);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const invoke = async (body, credential = token, path = "/transition") => {
      const response = await fetch(url + path, { method: path === "/transition" ? "POST" : "GET", headers: { "x-mediq-test-mutation": credential },
        body: path === "/transition" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(2000) });
      assert.equal(response.headers.get("cache-control"), "no-store"); return { status: response.status, body: await response.json() };
    };
    for (const credential of ["", "b".repeat(64)]) assert.deepEqual(await invoke({}, credential), { status: 401, body: { status: "DENIED" } });
    for (const bad of ["x".repeat(1025), "{bad", { ...request(sourceMutationCases[0]), sql: "TEST-RAW" }]) {
      const reply = await invoke(bad); assert.equal(reply.status, 503); assert.deepEqual(Object.keys(reply.body).sort(), ["code", "status"]);
    }
    assert.equal(calls.length, 0);
    assert.deepEqual(await invoke(request(sourceMutationCases[0])), { status: 200, body: { status: "OK" } });
    assert.deepEqual(await invoke(request(sourceMutationCases[1])), { status: 503, body: { status: "FAILED", code: "DEC017_MUTATION_UNAVAILABLE" } });
    assert.deepEqual(await invoke(undefined, token, "/summary"), { status: 503, body: { status: "INCOMPLETE" } });
    assert.deepEqual(await invoke(undefined, token, "/unknown"), { status: 404, body: { status: "DENIED" } });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(server.listening, false);
});
