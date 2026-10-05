// Test-only process. Never imported/registered by the application runtime.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { sourceMutationCases, mutationFixtureIds as ids, mutationExpectedAudit } from "../tests/fixtures/source-capture-mutation-fixture.mjs";
import { privacyTokenMatches } from "../tests/fixtures/temporary-capture-lifecycle-fixture.mjs";

const check = (condition, code) => { if (!condition) throw new Error(`DEC017_MUTATION_${code}`); };
const serialize = value => JSON.stringify(value);
const same = (actual, expected, code) => check(serialize(actual) === serialize(expected), code);
const clone = value => JSON.parse(serialize(value));
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

function assertSyntheticRegistry(snapshot) {
  check(snapshot.actors.length === 3 && snapshot.mappings.length === 2, "SYNTHETIC_BASELINE");
  const actorColumns = ["actor_id", "tenant_id", "hospital_id", "actor_type", "external_subject", "display_name", "status", "created_at", "updated_at"].sort();
  const mappingColumns = ["mapping_id", "patient_ref_id", "hospital_id", "local_patient_id", "status", "validated_at", "created_at", "updated_at"].sort();
  const fixedActors = [
    [ids.actor, ids.tenant, ids.hospital, "synthetic-int001-source-capture-actor", "Synthetic Destination Clinician"],
    ["0a000000-0000-4000-8000-000000000002", "02000000-0000-4000-8000-000000000001", ids.source, "synthetic-int001-cross-tenant-actor", "Synthetic Cross-Tenant Clinician"],
    ["0a000000-0000-4000-8000-000000000003", ids.tenant, null, "synthetic-int001-patient-actor", "Synthetic Consent Patient"],
  ];
  const date = value => value instanceof Date && Number.isFinite(value.getTime());
  snapshot.actors.forEach((actor, index) => {
    same(Object.keys(actor).sort(), actorColumns, "SYNTHETIC_COLUMNS");
    same([actor.actor_id, actor.tenant_id, actor.hospital_id, actor.external_subject, actor.display_name], fixedActors[index], "SYNTHETIC_BASELINE");
    check(actor.status === "ACTIVE" && actor.actor_type === "USER" && date(actor.created_at) && date(actor.updated_at), "SYNTHETIC_BASELINE");
  });
  const mapping = snapshot.mappings.find(row => row.mapping_id === ids.mapping);
  check(mapping, "SYNTHETIC_BASELINE");
  same(Object.keys(mapping).sort(), mappingColumns, "SYNTHETIC_COLUMNS");
  check(mapping.mapping_id === ids.mapping && mapping.patient_ref_id === ids.patient && mapping.hospital_id === ids.hospital &&
    mapping.local_patient_id === ids.baselineLocalId && mapping.status === "VALID" && date(mapping.validated_at) &&
    date(mapping.created_at) && date(mapping.updated_at), "SYNTHETIC_BASELINE");
  const invalidMapping = snapshot.mappings.find(row => row.mapping_id === ids.coordinatorInvalidMap);
  check(invalidMapping, "SYNTHETIC_BASELINE");
  same(Object.keys(invalidMapping).sort(), mappingColumns, "SYNTHETIC_COLUMNS");
  check(invalidMapping.patient_ref_id === ids.coordinatorInvalidMapPatient &&
    invalidMapping.hospital_id === ids.hospital && invalidMapping.local_patient_id === "TEST-PATIENT-COORD-INVALID" &&
    invalidMapping.status === "REVOKED" && invalidMapping.validated_at === null &&
    date(invalidMapping.created_at) && date(invalidMapping.updated_at), "SYNTHETIC_INVALID_MAPPING_BASELINE");
}

export function parseMutationRequest(input) {
  check(input && typeof input === "object" && !Array.isArray(input) &&
    Object.keys(input).sort().join(",") === "scenario,transition", "PROTOCOL");
  const scenario = sourceMutationCases.find(item => item.name === input.scenario);
  check(scenario && ["APPLY", "ASSERT_AND_RESTORE"].includes(input.transition), "PROTOCOL");
  return { scenario, transition: input.transition };
}

async function registrySnapshot(client, lock = false) {
  const suffix = lock ? " FOR UPDATE" : "";
  return {
    actors: (await client.query(`SELECT * FROM actors ORDER BY actor_id${suffix}`)).rows,
    mappings: (await client.query(`SELECT * FROM patient_mappings ORDER BY mapping_id${suffix}`)).rows,
  };
}

async function graphSnapshot(client, scenario) {
  const rows = (await client.query(`SELECT op.operation_id,op.tenant_id,op.exchange_session_id,op.study_ref_id,
    op.actor_id,op.state,op.version,op.stow_started_at,sr.package_id,sr.source_hospital_id,sr.study_instance_uid,
    sr.temporary_storage_ref,sr.temporary_payload_state,sr.temporary_payload_expires_at,sr.temporary_payload_purged_at,
    p.patient_ref_id,p.state AS package_state,p.storage_ref AS package_storage_ref,
    p.exchange_session_id AS package_session_id,p.source_hospital_id AS package_source_hospital_id,
    s.destination_hospital_id,s.requester_actor_id,s.patient_ref_id AS session_patient_ref_id,
    s.source_hospital_id AS session_source_hospital_id,s.state AS session_state,s.expires_at AS session_expires_at,
    (SELECT count(*)::int FROM integrity_evidence e WHERE e.operation_id=op.operation_id) AS evidence_count
    FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
    JOIN imaging_packages p ON p.package_id=sr.package_id JOIN exchange_sessions s ON s.session_id=op.exchange_session_id
    WHERE op.operation_id=$1`, [scenario.operationId])).rows;
  check(rows.length === 1, "GRAPH");
  const row = rows[0];
  for (const [key, value] of Object.entries({ operation_id: scenario.operationId, tenant_id: ids.tenant,
    exchange_session_id: scenario.sessionId, study_ref_id: scenario.studyRefId, actor_id: ids.actor,
    state: "CREATED", version: 0, stow_started_at: null, package_id: scenario.packageId,
    source_hospital_id: ids.source, patient_ref_id: ids.patient, package_state: "AVAILABLE", package_storage_ref: null,
    destination_hospital_id: ids.hospital, requester_actor_id: ids.actor,
    package_session_id: scenario.sessionId, package_source_hospital_id: ids.source,
    session_patient_ref_id: ids.patient, session_source_hospital_id: ids.source, session_state: "ACTIVE",
    study_instance_uid: "2.25.139413224574575433810421680499794275977" })) check(row[key] === value, "GRAPH");
  check(row.session_expires_at instanceof Date && row.session_expires_at.getTime() > Date.now(), "GRAPH");
  return row;
}

async function assertAudits(client, scenario, afterDenial) {
  const rows = (await client.query(`SELECT actor_id,tenant_id,exchange_session_id,resource_type,resource_id,
    action,result,reason_code,correlation_id FROM audit_events WHERE exchange_session_id=$1 ORDER BY audit_event_id`,
  [scenario.sessionId])).rows;
  const counts = {};
  for (const row of rows) {
    check(row.actor_id === ids.actor && row.tenant_id === ids.tenant && row.exchange_session_id === scenario.sessionId &&
      row.resource_type === "STUDY" && row.resource_id === scenario.studyRefId && row.correlation_id === scenario.correlationId, "AUDIT_SCOPE");
    const key = `${row.action}|${row.result}|${row.reason_code ?? ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const sorted = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b));
  same(sorted(counts), sorted(mutationExpectedAudit(scenario, afterDenial)), "AUDIT_STATE");
}

function mutatedSnapshot(baseline, scenario) {
  const expected = clone(baseline);
  if (scenario.mutation === "ACTOR_INACTIVE") expected.actors.find(row => row.actor_id === ids.actor).status = "INACTIVE";
  else {
    const mapping = expected.mappings.find(row => row.mapping_id === ids.mapping);
    if (scenario.mutation === "MAPPING_REVOKED") mapping.status = "REVOKED";
    else mapping.local_patient_id = ids.reboundLocalId;
  }
  return expected;
}

async function updateTarget(client, scenario, restoring) {
  let result;
  if (scenario.mutation === "ACTOR_INACTIVE") {
    result = await client.query("UPDATE actors SET status=$1 WHERE actor_id=$2 AND status=$3",
      restoring ? ["ACTIVE", ids.actor, "INACTIVE"] : ["INACTIVE", ids.actor, "ACTIVE"]);
  } else if (scenario.mutation === "MAPPING_REVOKED") {
    result = await client.query("UPDATE patient_mappings SET status=$1 WHERE mapping_id=$2 AND status=$3",
      restoring ? ["VALID", ids.mapping, "REVOKED"] : ["REVOKED", ids.mapping, "VALID"]);
  } else {
    result = await client.query("UPDATE patient_mappings SET local_patient_id=$1 WHERE mapping_id=$2 AND local_patient_id=$3",
      restoring ? [ids.baselineLocalId, ids.mapping, ids.reboundLocalId] : [ids.reboundLocalId, ids.mapping, ids.baselineLocalId]);
  }
  check(result.rowCount === 1, "UPDATE_COUNT");
}

export function createFixtureMutationController(pool) {
  let baseline, active, busy = false, failed = false;
  const finished = new Set();
  async function transaction(work, readOnly = false) {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
      if (!readOnly) await client.query("SELECT pg_advisory_xact_lock(hashtextextended('INT001_R6_FIXTURE_MUTATION',0))");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  return Object.freeze({
    async initialize() {
      check(!baseline && !busy && !failed, "INITIALIZATION");
      busy = true;
      try {
        baseline = await transaction(async client => {
          const role = (await client.query("SELECT current_user AS role")).rows;
          check(role.length === 1 && role[0].role === "mediq_migrator", "ROLE");
          const snapshot = await registrySnapshot(client);
          assertSyntheticRegistry(snapshot);
          return clone(snapshot);
        }, true);
      } catch { failed = true; throw new Error("DEC017_MUTATION_INITIALIZATION_FAILED"); }
      finally { busy = false; }
    },
    async transition(input) {
      const { scenario, transition } = parseMutationRequest(input);
      check(baseline && !busy && !failed, "UNAVAILABLE");
      check(transition === "APPLY" ? !active && !finished.has(scenario.name) : active?.scenario.name === scenario.name, "ORDER");
      busy = true;
      try {
        const captured = await transaction(async client => {
          same(await registrySnapshot(client, true), transition === "APPLY" ? baseline : mutatedSnapshot(baseline, scenario), "REGISTRY_CHANGED");
          const graph = await graphSnapshot(client, scenario);
          if (transition === "APPLY") {
            const state = scenario.boundary === "METADATA" ? null : scenario.boundary === "RESERVED" ? "STAGING" : "AVAILABLE";
            check(graph.temporary_payload_state === state && graph.evidence_count === (state === "AVAILABLE" ? 1 : 0) &&
              graph.temporary_payload_purged_at === null, "PRESTATE");
            check(state === null ? graph.temporary_storage_ref === null && graph.temporary_payload_expires_at === null
              : uuid(graph.temporary_storage_ref) && graph.temporary_payload_expires_at instanceof Date &&
                graph.temporary_payload_expires_at.getTime() > Date.now(), "PRESTATE");
          } else same(graph, active.graph, "GRAPH_CHANGED");
          await assertAudits(client, scenario, transition === "ASSERT_AND_RESTORE");
          await updateTarget(client, scenario, transition === "ASSERT_AND_RESTORE");
          same(await registrySnapshot(client), transition === "APPLY" ? mutatedSnapshot(baseline, scenario) : baseline, "POSTSTATE");
          return clone(graph);
        });
        if (transition === "APPLY") active = { scenario, graph: captured };
        else { active = undefined; finished.add(scenario.name); }
        return Object.freeze({ status: "OK" });
      } catch (error) {
        // An uncertain COMMIT is not replayed/restored. Dispose the owned fixture.
        failed = true;
        throw new Error(/^DEC017_MUTATION_[A-Z_]{1,60}$/.test(error?.message ?? "") ? error.message : "DEC017_MUTATION_DATABASE_FAILED");
      } finally { busy = false; }
    },
    summary() { return Object.freeze({ status: baseline && !failed && !busy && !active && finished.size === sourceMutationCases.length
      ? "MUTATION_CONTROLLER_PASS" : "INCOMPLETE" }); },
  });
}

export function createMutationServer(controller, token) {
  check(privacyTokenMatches(token, token), "TOKEN_CONFIGURATION");
  const server = createServer(async (request, response) => {
    const reply = (status, body) => response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
    if (!privacyTokenMatches(token, request.headers["x-mediq-test-mutation"])) return reply(401, { status: "DENIED" });
    if (request.method === "GET" && request.url === "/health") return reply(200, { status: "READY" });
    if (request.method === "GET" && request.url === "/summary") {
      const result = controller.summary();
      return reply(result.status === "MUTATION_CONTROLLER_PASS" ? 200 : 503, result);
    }
    if (request.method !== "POST" || request.url !== "/transition") return reply(404, { status: "DENIED" });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; check(size <= 1024, "BODY_BOUND"); chunks.push(chunk); }
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      parseMutationRequest(parsed);
      return reply(200, await controller.transition(parsed));
    } catch (error) {
      return reply(503, { status: "FAILED", code: /^DEC017_MUTATION_[A-Z_]{1,60}$/.test(error?.message ?? "")
        ? error.message : "DEC017_MUTATION_UNAVAILABLE" });
    }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.maxHeadersCount = 16; server.maxConnections = 4;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool, server, deadline;
  try {
    check(/^mediq-int001-capture-[0-9a-f]{12}$/.test(process.env.MEDIQ_TEST_PROJECT ?? ""), "PROJECT");
    const url = new URL(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL);
    check(url.hostname === "postgres" && decodeURIComponent(url.username) === "mediq_migrator", "DATABASE_BOUNDARY");
    pool = new pg.Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    const controller = createFixtureMutationController(pool);
    await controller.initialize();
    server = createMutationServer(controller, process.env.MEDIQ_TEST_MUTATION_TOKEN);
    const stopped = new Promise(resolve => server.once("close", resolve));
    const stop = () => { server.closeAllConnections(); server.close(); };
    process.once("SIGTERM", stop);
    deadline = setTimeout(stop, 30 * 60 * 1000);
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(8792, "0.0.0.0", resolve); });
      console.log("INT001_FIXTURE_MUTATION_READY");
      await stopped;
    } finally { process.removeListener("SIGTERM", stop); }
  } catch { console.error("INT001_FIXTURE_MUTATION_FAILED"); process.exitCode = 1; }
  finally { clearTimeout(deadline); if (server?.listening) { server.closeAllConnections(); server.close(); } await pool?.end(); }
}
