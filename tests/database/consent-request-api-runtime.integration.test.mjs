import "reflect-metadata";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import pg from "pg";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { APP_CONFIG } from "../../services/api/dist/health/health.tokens.js";
import { OIDC_TOKEN_VERIFIER } from "../../services/api/dist/authentication/authentication.tokens.js";
import { RemoteJwksOidcTokenVerifier } from "../../services/api/dist/authentication/oidc-jwt.verifier.js";
import { ConsentModule } from "../../services/api/dist/consent/consent.module.js";
import { AuthenticationModule } from "../../services/api/dist/authentication/authentication.module.js";
import { RuntimeDatabaseService } from "../../services/api/dist/database/runtime-database.service.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { ExchangeSession } from "../../services/api/dist/exchange/domain/exchange-session.js";
import { PostgresExchangeSessionRepository } from "../../services/api/dist/exchange/persistence/postgres-exchange-session.repository.js";

const { Pool } = pg;
const AUDIENCE = "mediq-api-test";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadFixture() {
  const raw = process.env.MEDIQ_CON003_TEST_FIXTURE;
  assert.ok(raw, "MEDIQ_CON003_TEST_FIXTURE is required");
  const fixture = JSON.parse(raw);
  for (const key of ["subjectA", "actorA", "tenantA", "hospitalA", "subjectB", "actorB", "tenantB", "hospitalB", "serviceSubjectB", "serviceActorB", "subjectC", "actorC", "tenantC", "patientRefId"]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} required`);
  }
  return fixture;
}

async function createJwksServer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "mediq-con003-test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    privateKey,
    issuer: "https://identity.example.test/issuer",
    jwksUri: `http://127.0.0.1:${address.port}/jwks`,
  };
}

function runtimeProxy(pool, failAt = "") {
  return {
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") {
            return (query, ...args) => {
              const text = typeof query === "string" ? query : query?.text ?? "";
              const values = typeof query === "string" ? args[0] : query?.values;
              if (failAt === "consent" && text.includes("INSERT INTO consents")) return Promise.reject(new Error("synthetic consent failure"));
              if (failAt === "action" && text.includes("INSERT INTO consent_actions")) return Promise.reject(new Error("synthetic action failure"));
              if (failAt === "session" && text.includes("UPDATE exchange_sessions")) return Promise.reject(new Error("synthetic session failure"));
              if (failAt === "audit" && values?.[7] === "CONSENT_REQUESTED") return Promise.reject(new Error("synthetic audit failure"));
              if (failAt === "commit" && text.trim().toUpperCase() === "COMMIT") return Promise.reject(new Error("synthetic commit failure"));
              return target.query(query, ...args);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
}

async function createApi(pool, oidc, failAt = "") {
  const config = {
    oidcAuthentication: { issuer: oidc.issuer, audience: AUDIENCE, jwksUri: oidc.jwksUri },
  };
  const verifier = new RemoteJwksOidcTokenVerifier(config.oidcAuthentication);
  const module = await Test.createTestingModule({ imports: [AuthenticationModule, ConsentModule] })
    .overrideProvider(APP_CONFIG).useValue(config)
    .overrideProvider(RuntimeDatabaseService).useValue(runtimeProxy(pool, failAt))
    .overrideProvider(OIDC_TOKEN_VERIFIER).useValue(verifier)
    .compile();
  const app = module.createNestApplication(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function token(privateKey, issuer, subject) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "mediq-con003-test-key" })
    .setIssuer(issuer).setAudience(AUDIENCE).setSubject(subject)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
}

async function createSession(context, subject, tenant, fixture, purpose, options = {}) {
  return context.run({ issuer: context.issuer, subject }, tenant, async (identity, client) => {
    const session = ExchangeSession.create({
      patientRefId: fixture.patientRefId,
      sourceHospitalId: fixture.hospitalA,
      destinationHospitalId: fixture.hospitalB,
      requesterActorId: identity.actorId,
      purpose: `CON003-${purpose}-${randomUUID()}`,
      now: options.now ?? new Date(),
      expiresAt: options.expiresAt ?? null,
    });
    return (await new PostgresExchangeSessionRepository(client).createIdempotently(session, randomUUID())).session;
  });
}

async function withTenant(inspector, tenantId, work) {
  const client = await inspector.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createTestActor(inspector, fixture, subject, status = "ACTIVE", hospitalId = fixture.hospitalB) {
  const actorId = randomUUID();
  await withTenant(inspector, fixture.tenantB, (client) => client.query(
    `INSERT INTO actors
      (actor_id, tenant_id, hospital_id, actor_type, external_subject,
       display_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'USER', $4, 'Synthetic CON-003 test user', $5, now(), now())`,
    [actorId, fixture.tenantB, hospitalId, subject, status],
  ));
  return actorId;
}

async function createOtherHospitalActor(inspector, fixture, subject) {
  const hospitalId = randomUUID();
  const actorId = randomUUID();
  await withTenant(inspector, fixture.tenantB, async (client) => {
    const tenant = await client.query("SELECT organization_id FROM tenants WHERE tenant_id=$1", [fixture.tenantB]);
    assert.equal(tenant.rows.length, 1, "CON003_TEST_TENANT_NOT_FOUND");
    await client.query(
      `INSERT INTO hospitals
        (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Synthetic alternate destination', 'TEST', 'ACTIVE', now(), now())`,
      [hospitalId, fixture.tenantB, tenant.rows[0].organization_id, `CON003-${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO actors
        (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'USER', $4, 'Synthetic wrong-hospital user', 'ACTIVE', now(), now())`,
      [actorId, fixture.tenantB, hospitalId, subject],
    );
  });
  return { hospitalId, actorId };
}

async function createPackage(inspector, tenantId, session, options = {}) {
  const packageId = randomUUID();
  await withTenant(inspector, tenantId, (client) => client.query(
    `INSERT INTO imaging_packages
      (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
       state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, NULL, 0, now(), now(), $6, $7)`,
    [packageId, options.sessionId ?? session.sessionId, session.patientRefId,
      session.sourceHospitalId, options.state ?? "AVAILABLE",
      options.retentionExpiresAt ?? null, options.deletedAt ?? null],
  ));
  return packageId;
}

async function countSessionRows(inspector, tenantId, sessionId) {
  const client = await inspector.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(`
      SELECT (SELECT count(*)::int FROM consents WHERE exchange_session_id=$1) AS consents,
             (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='CONSENT_REQUESTED') AS audits,
             (SELECT state FROM exchange_sessions WHERE session_id=$1) AS state
    `, [sessionId]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function consentAuditRows(inspector, tenantId, sessionId, action) {
  return withTenant(inspector, tenantId, async (client) => {
    const result = await client.query(`
      SELECT actor_id, tenant_id, exchange_session_id, resource_type, resource_id,
             action, result, reason_code, correlation_id, occurred_at, created_at
        FROM audit_events
       WHERE exchange_session_id=$1 AND action=$2
       ORDER BY occurred_at, audit_event_id
    `, [sessionId, action]);
    return result.rows;
  });
}

function assertConsentAuditContext(row, expected) {
  assert.deepEqual({
    actor_id: row.actor_id,
    tenant_id: row.tenant_id,
    exchange_session_id: row.exchange_session_id,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    action: row.action,
    result: row.result,
    reason_code: row.reason_code,
    correlation_id: row.correlation_id,
  }, expected);
  assert.ok(row.occurred_at instanceof Date, "AUDIT_OCCURRED_AT_MUST_BE_A_TIMESTAMP");
  assert.ok(row.created_at instanceof Date, "AUDIT_CREATED_AT_MUST_BE_A_TIMESTAMP");
  assert.equal(row.occurred_at.getTime(), row.created_at.getTime(), "AUDIT_TIMESTAMPS_MUST_SHARE_THE_TRANSITION_TIME");
}

test("CON-003 signed OIDC HTTP request atomically creates/replays Consent under exact runtime grants and RLS", async (t) => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  const fixture = loadFixture();
  const pool = new Pool({ connectionString, max: 8 });
  const inspectUrl = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectUrl, "MEDIQ_TEST_INSPECT_DATABASE_URL is required for synthetic evidence verification");
    assert.equal(decodeURIComponent(new URL(inspectUrl).username), "mediq_migrator");
    const inspector = new Pool({ connectionString: inspectUrl, max: 2 });
  const oidc = await createJwksServer();
  const context = new ActorTenantContextService(
    { oidcAuthentication: { issuer: oidc.issuer, audience: AUDIENCE, jwksUri: oidc.jwksUri } },
    { connect: () => pool.connect() },
    new ActorRegistryRepository(),
  );
  context.issuer = oidc.issuer;
  let app;
  try {
    const auditColumns = await inspector.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='audit_events'
       ORDER BY ordinal_position
    `);
    assert.deepEqual(auditColumns.rows.map((row) => row.column_name), [
      "audit_event_id", "occurred_at", "actor_id", "tenant_id", "exchange_session_id",
      "resource_type", "resource_id", "action", "result", "reason_code", "correlation_id", "created_at",
    ], "AUDIT_SCHEMA_MUST_REMAIN_REFERENCE_AND_METADATA_ONLY");
    console.error("CON003_STAGE=RUNTIME_PRIVILEGES");
    const catalog = await pool.query(`
      SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee=current_user AND table_schema='public'
       ORDER BY table_name, column_name, privilege_type
    `);
    assert.equal(catalog.rows.length, 209, "CON003_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
    const consentGrants = catalog.rows.filter((r) => ["consents", "consent_actions"].includes(r.table_name));
    assert.equal(consentGrants.filter((r) => r.privilege_type === "SELECT" && r.table_name === "consents").length, 13);
    assert.equal(consentGrants.filter((r) => r.privilege_type === "INSERT" && r.table_name === "consents").length, 13);
    assert.equal(consentGrants.filter((r) => r.privilege_type === "SELECT" && r.table_name === "consent_actions").length, 3);
    assert.equal(consentGrants.filter((r) => r.privilege_type === "INSERT" && r.table_name === "consent_actions").length, 3);
    assert.deepEqual(catalog.rows.filter((r) => r.privilege_type === "UPDATE").map((r) => `${r.table_name}.${r.column_name}`).sort(), ["consents.issued_at", "consents.status", "consents.updated_at", "consents.withdrawn_at", "exchange_sessions.state", "exchange_sessions.updated_at", "pacs_transfer_operations.destination_object_count", "pacs_transfer_operations.reason_code", "pacs_transfer_operations.source_object_count", "pacs_transfer_operations.state", "pacs_transfer_operations.stow_started_at", "pacs_transfer_operations.updated_at", "pacs_transfer_operations.version", "transfer_grants.revoked_at", "transfer_grants.status"]);

    console.error("CON003_STAGE=SIGNED_HTTP_SUCCESS_AND_REPLAY");
    app = await createApi(pool, oidc);
    console.error("CON003_STAGE=API_CREATED");
    const signedB = await token(oidc.privateKey, oidc.issuer, fixture.subjectB);
    const session = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "success");
    console.error("CON003_STAGE=REQUESTED_SESSION_CREATED");
    const body = { allowedActions: ["VIEW", "PACS_IMPORT"] };
    const url = `/api/v1/exchange-sessions/${session.sessionId}/consents/request`;
    const headers = { authorization: `Bearer ${signedB}`, "x-tenant-id": fixture.tenantB, "content-type": "application/json" };
    const requests = await Promise.all([
      app.inject({ method: "POST", url, headers, payload: body }),
      app.inject({ method: "POST", url, headers, payload: body }),
    ]);
    console.error(`CON003_STAGE=HTTP_RESULTS_${requests.map((r) => r.statusCode).join("_")}`);
    assert.deepEqual(requests.map((r) => r.statusCode), [201, 201]);
    const firstJson = requests[0].json();
    const secondJson = requests[1].json();
    assert.equal(firstJson.status, "PENDING");
    assert.equal(firstJson.sessionId, session.sessionId);
    assert.equal(firstJson.patientRefId, fixture.patientRefId);
    assert.deepEqual(firstJson.allowedActions, ["PACS_IMPORT", "VIEW"]);
    assert.equal(JSON.stringify(firstJson).includes("TEST-A-001"), false);
    assert.equal(requests.some((r) => r.headers["cache-control"] !== "no-store"), false);
    assert.equal(requests.some((r) => r.headers["x-correlation-id"] == null), false);
    const replayed = requests.map((r) => r.headers["idempotency-replayed"] === "true");
    assert.equal(replayed.filter(Boolean).length, 1);
    assert.equal(firstJson.consentId, secondJson.consentId);
    assert.deepEqual(await countSessionRows(inspector, fixture.tenantB, session.sessionId), { consents: 1, audits: 1, state: "CONSENT_PENDING" });
    const createdResponse = requests.find((response) => response.headers["idempotency-replayed"] !== "true");
    assert.ok(createdResponse, "CON003_CREATED_RESPONSE_NOT_FOUND");
    const requestAudits = await consentAuditRows(inspector, fixture.tenantB, session.sessionId, "CONSENT_REQUESTED");
    assert.equal(requestAudits.length, 1, "CON003_REQUEST_AUDIT_NOT_EXACTLY_ONCE");
    assertConsentAuditContext(requestAudits[0], {
      actor_id: session.requesterActorId,
      tenant_id: fixture.tenantB,
      exchange_session_id: session.sessionId,
      resource_type: "CONSENT",
      resource_id: firstJson.consentId,
      action: "CONSENT_REQUESTED",
      result: "SUCCESS",
      reason_code: null,
      correlation_id: createdResponse.headers["x-correlation-id"].toLowerCase(),
    });

    console.error("CON003_STAGE=DENIAL_AND_VALIDATION");
    const invalidToken = app.inject({ method: "POST", url, headers: { ...headers, authorization: "Bearer a.b.c" }, payload: body });
    const missingToken = app.inject({ method: "POST", url, headers: { "x-tenant-id": fixture.tenantB, "content-type": "application/json" }, payload: body });
    const crossTenant = app.inject({ method: "POST", url, headers: { ...headers, authorization: `Bearer ${await token(oidc.privateKey, oidc.issuer, fixture.subjectC)}`, "x-tenant-id": fixture.tenantC }, payload: body });
    const serviceActor = app.inject({ method: "POST", url, headers: { ...headers, authorization: `Bearer ${await token(oidc.privateKey, oidc.issuer, fixture.serviceSubjectB)}` }, payload: body });
    const malformed = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["VIEW", "VIEW"] } });
    const emptyActions = app.inject({ method: "POST", url, headers, payload: { allowedActions: [] } });
    const missingActions = app.inject({ method: "POST", url, headers, payload: {} });
    const unsupportedAction = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["MOBILE_EXPORT"] } });
    const unknownField = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["VIEW"], patientId: randomUUID() } });
    const invalidPackageId = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: "not-a-uuid" } });
    const invalidDate = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["VIEW"], expiresAt: "2026-02-30T00:00:00Z" } });
    const changed = app.inject({ method: "POST", url, headers, payload: { allowedActions: ["DOWNLOAD"] } });
    const nonRequesterSubject = `synthetic-con003-nonrequester-${randomUUID()}`;
    await createTestActor(inspector, fixture, nonRequesterSubject);
    const inactiveSubject = `synthetic-con003-inactive-${randomUUID()}`;
    await createTestActor(inspector, fixture, inactiveSubject, "SUSPENDED");
    const wrongHospitalSubject = `synthetic-con003-wrong-hospital-${randomUUID()}`;
    await createOtherHospitalActor(inspector, fixture, wrongHospitalSubject);
    const nonRequesterSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "nonrequester");
    const nonRequester = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${nonRequesterSession.sessionId}/consents/request`, headers: { ...headers, authorization: `Bearer ${await token(oidc.privateKey, oidc.issuer, nonRequesterSubject)}` }, payload: body });
    const inactiveActor = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${nonRequesterSession.sessionId}/consents/request`, headers: { ...headers, authorization: `Bearer ${await token(oidc.privateKey, oidc.issuer, inactiveSubject)}` }, payload: body });
    const wrongHospital = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${nonRequesterSession.sessionId}/consents/request`, headers: { ...headers, authorization: `Bearer ${await token(oidc.privateKey, oidc.issuer, wrongHospitalSubject)}` }, payload: body });
    const packageSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "package");
    const unknownPackage = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${packageSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: randomUUID() } });
    const registeredPackage = await createPackage(inspector, fixture.tenantB, packageSession, { state: "REGISTERED" });
    const unavailablePackage = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${packageSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: registeredPackage } });
    const deletedPackage = await createPackage(inspector, fixture.tenantB, packageSession, { deletedAt: new Date() });
    const deletedPackageRequest = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${packageSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: deletedPackage } });
    const expiredPackage = await createPackage(inspector, fixture.tenantB, packageSession, { retentionExpiresAt: new Date(Date.now() - 60_000) });
    const expiredPackageRequest = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${packageSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: expiredPackage } });
    const differentSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "package-other-session");
    const mismatchedPackage = await createPackage(inspector, fixture.tenantB, packageSession, { sessionId: differentSession.sessionId });
    const mismatchedPackageRequest = app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${packageSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], imagingPackageId: mismatchedPackage } });
    const [invalidResponse, missingResponse, tenantResponse, serviceResponse, malformedResponse, emptyResponse, missingActionsResponse, unsupportedResponse, unknownFieldResponse, invalidPackageResponse, invalidDateResponse, changedResponse, nonRequesterResponse, inactiveActorResponse, wrongHospitalResponse, packageResponse, unavailableResponse, deletedResponse, expiredResponse, mismatchedResponse] = await Promise.all([invalidToken, missingToken, crossTenant, serviceActor, malformed, emptyActions, missingActions, unsupportedAction, unknownField, invalidPackageId, invalidDate, changed, nonRequester, inactiveActor, wrongHospital, unknownPackage, unavailablePackage, deletedPackageRequest, expiredPackageRequest, mismatchedPackageRequest]);
    assert.equal(invalidResponse.statusCode, 401);
    assert.equal(missingResponse.statusCode, 401);
    assert.equal(tenantResponse.statusCode, 403);
    assert.equal(serviceResponse.statusCode, 403);
    assert.equal(malformedResponse.statusCode, 400);
    assert.equal(emptyResponse.statusCode, 400);
    assert.equal(missingActionsResponse.statusCode, 400);
    assert.equal(unsupportedResponse.statusCode, 400);
    assert.equal(unknownFieldResponse.statusCode, 400);
    assert.equal(invalidPackageResponse.statusCode, 400);
    assert.equal(invalidDateResponse.statusCode, 400);
    assert.equal(changedResponse.statusCode, 409);
    assert.equal(nonRequesterResponse.statusCode, 403);
    assert.equal(inactiveActorResponse.statusCode, 403);
    assert.equal(wrongHospitalResponse.statusCode, 403);
    assert.equal(packageResponse.statusCode, 409);
    assert.equal(unavailableResponse.statusCode, 409);
    assert.equal(deletedResponse.statusCode, 409);
    assert.equal(expiredResponse.statusCode, 409);
    assert.equal(mismatchedResponse.statusCode, 409);
    assert.equal(JSON.stringify([invalidResponse.json(), tenantResponse.json(), malformedResponse.json(), changedResponse.json(), packageResponse.json()]).includes("postgres"), false);
    assert.deepEqual(await countSessionRows(inspector, fixture.tenantB, session.sessionId), { consents: 1, audits: 1, state: "CONSENT_PENDING" });

    const now = Date.now();
    const expiredSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "expired", {
      now: new Date(now - 120_000), expiresAt: new Date(now - 60_000),
    });
    const expiredSessionResponse = await app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${expiredSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"] } });
    assert.equal(expiredSessionResponse.statusCode, 409, "CON003_EXPIRED_SESSION_DENIED");
    const boundedSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, "bounded-expiry", { expiresAt: new Date(now + 60_000) });
    const tooLongConsentExpiry = await app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${boundedSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], expiresAt: new Date(now + 120_000).toISOString() } });
    assert.equal(tooLongConsentExpiry.statusCode, 409, "CON003_CONSENT_EXPIRY_AFTER_SESSION_DENIED");
    const pastConsentExpiry = await app.inject({ method: "POST", url: `/api/v1/exchange-sessions/${boundedSession.sessionId}/consents/request`, headers, payload: { allowedActions: ["VIEW"], expiresAt: new Date(now - 60_000).toISOString() } });
    assert.equal(pastConsentExpiry.statusCode, 409, "CON003_PAST_CONSENT_EXPIRY_DENIED");

    console.error("CON003_STAGE=ROLLBACK_FAULTS");
    await app.close();
    for (const failure of ["consent", "action", "session", "audit", "commit"]) {
      const failedSession = await createSession(context, fixture.subjectB, fixture.tenantB, fixture, failure);
      const failingApp = await createApi(pool, oidc, failure);
      const response = await failingApp.inject({
        method: "POST",
        url: `/api/v1/exchange-sessions/${failedSession.sessionId}/consents/request`,
        headers,
        payload: { allowedActions: ["VIEW"] },
      });
      assert.equal(response.statusCode, 503, `CON003_${failure.toUpperCase()}_FAILURE_RESPONSE`);
      await failingApp.close();
      assert.deepEqual(await countSessionRows(inspector, fixture.tenantB, failedSession.sessionId), { consents: 0, audits: 0, state: "REQUESTED" }, `CON003_${failure.toUpperCase()}_ATOMIC_ROLLBACK`);
    }
    console.error("CON003_STAGE=ROLLBACK_FAULTS_OK");
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => oidc.server.close(resolve));
    await inspector.end();
    await pool.end();
  }
});
