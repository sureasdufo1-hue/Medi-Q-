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

function loadFixture() {
  const raw = process.env.MEDIQ_CON004_TEST_FIXTURE;
  assert.ok(raw, "MEDIQ_CON004_TEST_FIXTURE is required");
  const fixture = JSON.parse(raw);
  for (const key of ["subjectB", "tenantB", "tenantC", "serviceSubjectB", "patientRefId"]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} required`);
  }
  return fixture;
}

async function createJwksServer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "mediq-con004-test-key", alg: "RS256", use: "sig" });
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") return response.writeHead(404).end();
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
              if (failAt === "consent" && text.includes("UPDATE consents")) return Promise.reject(new Error("synthetic approval Consent failure"));
              if (failAt === "withdraw-consent" && text.includes("UPDATE consents") && text.includes("WITHDRAWN")) return Promise.reject(new Error("synthetic withdrawal Consent failure"));
              if (failAt === "session" && text.includes("UPDATE exchange_sessions") && text.includes("CONSENT_PENDING")) return Promise.reject(new Error("synthetic approval Session failure"));
              if (failAt === "audit" && values?.[7] === "CONSENT_APPROVED") return Promise.reject(new Error("synthetic approval Audit failure"));
              if (failAt === "withdraw-audit" && values?.[7] === "CONSENT_WITHDRAWN") return Promise.reject(new Error("synthetic withdrawal Audit failure"));
              if (failAt === "commit" && text.trim().toUpperCase() === "COMMIT") return Promise.reject(new Error("synthetic approval commit failure"));
              if (failAt === "withdraw-commit" && text.trim().toUpperCase() === "COMMIT") return Promise.reject(new Error("synthetic withdrawal commit failure"));
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
  const config = { oidcAuthentication: { issuer: oidc.issuer, audience: AUDIENCE, jwksUri: oidc.jwksUri } };
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

async function token(privateKey, issuer, subject, patientRefId) {
  const claims = patientRefId === undefined ? {} : { mediq_patient_ref_id: patientRefId };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "mediq-con004-test-key" })
    .setIssuer(issuer).setAudience(AUDIENCE).setSubject(subject)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
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

async function createTestActor(inspector, fixture, subject, hospitalId = null, status = "ACTIVE") {
  const actorId = randomUUID();
  await withTenant(inspector, fixture.tenantB, (client) => client.query(
    `INSERT INTO actors
      (actor_id, tenant_id, hospital_id, actor_type, external_subject,
       display_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'USER', $4, 'Synthetic CON-004 test user', $5, now(), now())`,
    [actorId, fixture.tenantB, hospitalId, subject, status],
  ));
  return actorId;
}

async function createSession(context, fixture, purpose) {
  return context.run({ issuer: context.issuer, subject: fixture.subjectB }, fixture.tenantB, async (identity, client) => {
    const session = ExchangeSession.create({
      patientRefId: fixture.patientRefId,
      sourceHospitalId: fixture.hospitalA,
      destinationHospitalId: fixture.hospitalB,
      requesterActorId: identity.actorId,
      purpose: `CON004-${purpose}-${randomUUID()}`,
    });
    return (await new PostgresExchangeSessionRepository(client).createIdempotently(session, randomUUID())).session;
  });
}

async function createPending(app, headers, session) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/exchange-sessions/${session.sessionId}/consents/request`,
    headers,
    payload: { allowedActions: ["VIEW"] },
  });
  assert.equal(response.statusCode, 201, "CON004_SETUP_PENDING_CONSENT_FAILED");
  return response.json();
}

async function evidence(inspector, tenantId, sessionId) {
  return withTenant(inspector, tenantId, async (client) => {
    const result = await client.query(`
      SELECT (SELECT state FROM exchange_sessions WHERE session_id=$1) AS state,
             (SELECT status FROM consents WHERE exchange_session_id=$1 ORDER BY consent_version LIMIT 1) AS consent_status,
             (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='CONSENT_APPROVED') AS approval_audits,
             (SELECT count(*)::int FROM transfer_grants WHERE exchange_session_id=$1) AS grants
    `, [sessionId]);
    return result.rows[0];
  });
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

async function approve(app, headers, sessionId, consentId, options = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/exchange-sessions/${sessionId}/consents/${consentId}/approve${options.query ?? ""}`,
    headers: { ...headers, ...(options.headers ?? {}) },
    ...(Object.hasOwn(options, "payload") ? { payload: options.payload } : {}),
  });
}

async function withdraw(app, headers, sessionId, consentId, options = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/exchange-sessions/${sessionId}/consents/${consentId}/withdraw${options.query ?? ""}`,
    headers: { ...headers, ...(options.headers ?? {}) },
    ...(Object.hasOwn(options, "payload") ? { payload: options.payload } : {}),
  });
}

async function withdrawalEvidence(inspector, tenantId, sessionId, consentId) {
  return withTenant(inspector, tenantId, async (client) => {
    const result = await client.query(`
      SELECT (SELECT state FROM exchange_sessions WHERE session_id=$1) AS session_state,
             (SELECT status FROM consents WHERE consent_id=$2) AS consent_status,
             (SELECT withdrawn_at FROM consents WHERE consent_id=$2) AS withdrawn_at,
             (SELECT updated_at FROM consents WHERE consent_id=$2) AS consent_updated_at,
             (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='CONSENT_WITHDRAWN') AS withdrawal_audits,
             (SELECT count(*)::int FROM transfer_grants WHERE exchange_session_id=$1) AS grants
    `, [sessionId, consentId]);
    return result.rows[0];
  });
}

test("CON-004 signed synthetic patient claim approves Consent atomically and fails closed", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  const fixture = loadFixture();
  const inspectUrl = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectUrl, "MEDIQ_TEST_INSPECT_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(inspectUrl).username), "mediq_migrator");
  const pool = new Pool({ connectionString, max: 8 });
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
    console.error("CON004_STAGE=RUNTIME_PRIVILEGES");
    const catalog = await pool.query(`
      SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee=current_user AND table_schema='public'
       ORDER BY table_name, column_name, privilege_type
    `);
    assert.equal(catalog.rows.length, 209, "CON004_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
    assert.deepEqual(
      catalog.rows.filter((row) => row.privilege_type === "UPDATE").map((row) => `${row.table_name}.${row.column_name}`).sort(),
      ["consents.issued_at", "consents.status", "consents.updated_at", "consents.withdrawn_at", "exchange_sessions.state", "exchange_sessions.updated_at", "pacs_transfer_operations.destination_object_count", "pacs_transfer_operations.reason_code", "pacs_transfer_operations.source_object_count", "pacs_transfer_operations.state", "pacs_transfer_operations.stow_started_at", "pacs_transfer_operations.updated_at", "pacs_transfer_operations.version", "transfer_grants.revoked_at", "transfer_grants.status"],
    );
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee=current_user AND table_schema='public'")).rows[0].n, 0);
    for (const tableName of ["consents", "exchange_sessions", "audit_events"]) {
      const rls = await pool.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1", [tableName]);
      assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    }

    console.error("CON004_STAGE=APPROVAL_SUCCESS_AND_REPLAY");
    app = await createApi(pool, oidc);
    const requesterToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectB);
    const requesterHeaders = { authorization: `Bearer ${requesterToken}`, "x-tenant-id": fixture.tenantB };
    const patientSubject = `synthetic-con004-patient-${randomUUID()}`;
    const patientActorId = await createTestActor(inspector, fixture, patientSubject);
    const patientToken = await token(oidc.privateKey, oidc.issuer, patientSubject, fixture.patientRefId);
    const patientHeaders = { authorization: `Bearer ${patientToken}`, "x-tenant-id": fixture.tenantB };

    const successSession = await createSession(context, fixture, "success");
    const pending = await createPending(app, requesterHeaders, successSession);
    const success = await approve(app, patientHeaders, successSession.sessionId, pending.consentId);
    assert.equal(success.statusCode, 200, "CON004_SYNTHETIC_APPROVAL_FAILED");
    assert.equal(success.json().status, "ACTIVE");
    assert.equal(success.json().sessionId, successSession.sessionId);
    assert.equal(typeof success.json().issuedAt, "string");
    assert.equal(success.headers["cache-control"], "no-store");
    const approvalAudits = await consentAuditRows(inspector, fixture.tenantB, successSession.sessionId, "CONSENT_APPROVED");
    assert.equal(approvalAudits.length, 1, "CON004_APPROVAL_AUDIT_NOT_EXACTLY_ONCE");
    assert.ok(success.headers["x-correlation-id"], "CON004_CORRELATION_HEADER_MISSING");
    assertConsentAuditContext(approvalAudits[0], {
      actor_id: patientActorId,
      tenant_id: fixture.tenantB,
      exchange_session_id: successSession.sessionId,
      resource_type: "CONSENT",
      resource_id: pending.consentId,
      action: "CONSENT_APPROVED",
      result: "SUCCESS",
      reason_code: null,
      correlation_id: success.headers["x-correlation-id"].toLowerCase(),
    });
    assert.deepEqual(await evidence(inspector, fixture.tenantB, successSession.sessionId), {
      state: "CONSENTED", consent_status: "ACTIVE", approval_audits: 1, grants: 0,
    });
    const replay = await approve(app, patientHeaders, successSession.sessionId, pending.consentId);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.headers["idempotency-replayed"], "true");
    assert.equal((await evidence(inspector, fixture.tenantB, successSession.sessionId)).approval_audits, 1);

    console.error("CON004_STAGE=CONCURRENT_REPLAY");
    const raceSession = await createSession(context, fixture, "race");
    const raceConsent = await createPending(app, requesterHeaders, raceSession);
    const raced = await Promise.all([
      approve(app, patientHeaders, raceSession.sessionId, raceConsent.consentId),
      approve(app, patientHeaders, raceSession.sessionId, raceConsent.consentId),
    ]);
    assert.deepEqual(raced.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(raced.filter((response) => response.headers["idempotency-replayed"] === "true").length, 1);
    assert.equal((await evidence(inspector, fixture.tenantB, raceSession.sessionId)).approval_audits, 1);

    console.error("CON004_STAGE=CLAIM_ACTOR_AND_OVERRIDE_DENIAL");
    const denialSession = await createSession(context, fixture, "denials");
    const denialConsent = await createPending(app, requesterHeaders, denialSession);
    const noClaimToken = await token(oidc.privateKey, oidc.issuer, patientSubject);
    const mismatchToken = await token(oidc.privateKey, oidc.issuer, patientSubject, randomUUID());
    const requesterWithClaim = await token(oidc.privateKey, oidc.issuer, fixture.subjectB, fixture.patientRefId);
    const serviceWithClaim = await token(oidc.privateKey, oidc.issuer, fixture.serviceSubjectB, fixture.patientRefId);
    const malformedClaim = await token(oidc.privateKey, oidc.issuer, patientSubject, "not-a-uuid");
    const noClaim = await approve(app, { ...patientHeaders, authorization: `Bearer ${noClaimToken}` }, denialSession.sessionId, denialConsent.consentId);
    const mismatch = await approve(app, { ...patientHeaders, authorization: `Bearer ${mismatchToken}` }, denialSession.sessionId, denialConsent.consentId);
    const requester = await approve(app, { ...requesterHeaders, authorization: `Bearer ${requesterWithClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const service = await approve(app, { ...patientHeaders, authorization: `Bearer ${serviceWithClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const inactiveSubject = `synthetic-con004-inactive-${randomUUID()}`;
    await createTestActor(inspector, fixture, inactiveSubject, null, "SUSPENDED");
    const inactiveToken = await token(oidc.privateKey, oidc.issuer, inactiveSubject, fixture.patientRefId);
    const inactive = await approve(app, { ...patientHeaders, authorization: `Bearer ${inactiveToken}` }, denialSession.sessionId, denialConsent.consentId);
    const invalidClaim = await approve(app, { ...patientHeaders, authorization: `Bearer ${malformedClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const overrideBody = await approve(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { payload: { patientRefId: fixture.patientRefId } });
    const overrideQuery = await approve(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { query: `?patientRefId=${fixture.patientRefId}` });
    const overrideHeader = await approve(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { headers: { "x-patient-ref-id": fixture.patientRefId } });
    assert.deepEqual([noClaim.statusCode, mismatch.statusCode, requester.statusCode, service.statusCode, inactive.statusCode, invalidClaim.statusCode], [403, 403, 403, 403, 403, 401]);
    assert.deepEqual([overrideBody.statusCode, overrideQuery.statusCode, overrideHeader.statusCode], [400, 400, 400]);
    assert.deepEqual(await evidence(inspector, fixture.tenantB, denialSession.sessionId), {
      state: "CONSENT_PENDING", consent_status: "PENDING", approval_audits: 0, grants: 0,
    });

    const hospitalSubject = `synthetic-con004-hospital-${randomUUID()}`;
    await createTestActor(inspector, fixture, hospitalSubject, fixture.hospitalB);
    const hospitalToken = await token(oidc.privateKey, oidc.issuer, hospitalSubject, fixture.patientRefId);
    const hospitalActor = await approve(app, { ...patientHeaders, authorization: `Bearer ${hospitalToken}` }, denialSession.sessionId, denialConsent.consentId);
    assert.equal(hospitalActor.statusCode, 403);
    const crossTenantToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectC, fixture.patientRefId);
    const crossTenant = await approve(app, { authorization: `Bearer ${crossTenantToken}`, "x-tenant-id": fixture.tenantC }, denialSession.sessionId, denialConsent.consentId);
    assert.equal(crossTenant.statusCode, 403);

    console.error("CON004_STAGE=TENANT_AND_OBJECT_BINDING_DENIAL");
    const mismatchSession = await createSession(context, fixture, "pairing");
    const mismatchConsent = await createPending(app, requesterHeaders, mismatchSession);
    const mismatchedPair = await approve(app, patientHeaders, denialSession.sessionId, mismatchConsent.consentId);
    assert.equal(mismatchedPair.statusCode, 403);
    assert.deepEqual(await evidence(inspector, fixture.tenantB, mismatchSession.sessionId), {
      state: "CONSENT_PENDING", consent_status: "PENDING", approval_audits: 0, grants: 0,
    });

    console.error("CON004_STAGE=EXPIRY_DENIAL");
    const expiredConsentSession = await createSession(context, fixture, "expired-consent");
    const expiredConsent = await createPending(app, requesterHeaders, expiredConsentSession);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE consents SET expires_at=$2 WHERE consent_id=$1",
      [expiredConsent.consentId, new Date(Date.now() - 1_000)],
    ));
    const expiredConsentResult = await approve(app, patientHeaders, expiredConsentSession.sessionId, expiredConsent.consentId);
    assert.equal(expiredConsentResult.statusCode, 409);

    const expiredSession = await createSession(context, fixture, "expired-session");
    const expiredSessionConsent = await createPending(app, requesterHeaders, expiredSession);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE exchange_sessions SET expires_at=$2 WHERE session_id=$1",
      [expiredSession.sessionId, new Date(Date.now() - 1_000)],
    ));
    const expiredSessionResult = await approve(app, patientHeaders, expiredSession.sessionId, expiredSessionConsent.consentId);
    assert.equal(expiredSessionResult.statusCode, 409);

    const wrongSessionState = await createSession(context, fixture, "wrong-session-state");
    const wrongSessionStateConsent = await createPending(app, requesterHeaders, wrongSessionState);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE exchange_sessions SET state='CONSENTED', updated_at=now() WHERE session_id=$1",
      [wrongSessionState.sessionId],
    ));
    const wrongSessionStateResult = await approve(app, patientHeaders, wrongSessionState.sessionId, wrongSessionStateConsent.consentId);
    assert.equal(wrongSessionStateResult.statusCode, 409);

    const wrongConsentState = await createSession(context, fixture, "wrong-consent-state");
    const wrongConsentStateConsent = await createPending(app, requesterHeaders, wrongConsentState);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE consents SET status='REJECTED', updated_at=now() WHERE consent_id=$1",
      [wrongConsentStateConsent.consentId],
    ));
    const wrongConsentStateResult = await approve(app, patientHeaders, wrongConsentState.sessionId, wrongConsentStateConsent.consentId);
    assert.equal(wrongConsentStateResult.statusCode, 409);

    console.error("CON004_STAGE=ATOMIC_ROLLBACK");
    await app.close();
    app = undefined;
    for (const failure of ["consent", "session", "audit", "commit"]) {
      const faultSession = await createSession(context, fixture, `fault-${failure}`);
      const setupApp = await createApi(pool, oidc);
      const faultConsent = await createPending(setupApp, requesterHeaders, faultSession);
      await setupApp.close();
      const failingApp = await createApi(pool, oidc, failure);
      const result = await approve(failingApp, patientHeaders, faultSession.sessionId, faultConsent.consentId);
      assert.equal(result.statusCode, 503, `CON004_${failure.toUpperCase()}_FAILURE_RESPONSE`);
      await failingApp.close();
      assert.deepEqual(await evidence(inspector, fixture.tenantB, faultSession.sessionId), {
        state: "CONSENT_PENDING", consent_status: "PENDING", approval_audits: 0, grants: 0,
      }, `CON004_${failure.toUpperCase()}_ATOMIC_ROLLBACK`);
    }
    console.error("CON004_STAGE=COMPLETE");
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => oidc.server.close(resolve));
    await inspector.end();
    await pool.end();
  }
});

test("CON-005 signed synthetic patient claim withdraws Consent atomically and fails closed", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  const fixture = loadFixture();
  const inspectUrl = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectUrl, "MEDIQ_TEST_INSPECT_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(inspectUrl).username), "mediq_migrator");
  const pool = new Pool({ connectionString, max: 8 });
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
    console.error("CON005_STAGE=RUNTIME_PRIVILEGES");
    const catalog = await pool.query(`
      SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee=current_user AND table_schema='public'
       ORDER BY table_name, column_name, privilege_type
    `);
    assert.equal(catalog.rows.length, 209, "CON005_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
    assert.deepEqual(
      catalog.rows.filter((row) => row.privilege_type === "UPDATE").map((row) => `${row.table_name}.${row.column_name}`).sort(),
      ["consents.issued_at", "consents.status", "consents.updated_at", "consents.withdrawn_at", "exchange_sessions.state", "exchange_sessions.updated_at", "pacs_transfer_operations.destination_object_count", "pacs_transfer_operations.reason_code", "pacs_transfer_operations.source_object_count", "pacs_transfer_operations.state", "pacs_transfer_operations.stow_started_at", "pacs_transfer_operations.updated_at", "pacs_transfer_operations.version", "transfer_grants.revoked_at", "transfer_grants.status"],
    );
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee=current_user AND table_schema='public'")).rows[0].n, 0);
    for (const tableName of ["consents", "exchange_sessions", "audit_events"]) {
      const rls = await pool.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1", [tableName]);
      assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    }

    app = await createApi(pool, oidc);
    const requesterToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectB);
    const requesterHeaders = { authorization: `Bearer ${requesterToken}`, "x-tenant-id": fixture.tenantB };
    const patientSubject = `synthetic-con005-patient-${randomUUID()}`;
    const patientActorId = await createTestActor(inspector, fixture, patientSubject);
    const patientToken = await token(oidc.privateKey, oidc.issuer, patientSubject, fixture.patientRefId);
    const patientHeaders = { authorization: `Bearer ${patientToken}`, "x-tenant-id": fixture.tenantB };

    console.error("CON005_STAGE=SUCCESS_EXPIRY_TERMINAL_AND_REPLAY");
    const successSession = await createSession(context, fixture, "withdraw-success");
    const successConsent = await createPending(app, requesterHeaders, successSession);
    const approved = await approve(app, patientHeaders, successSession.sessionId, successConsent.consentId);
    assert.equal(approved.statusCode, 200, "CON005_SETUP_APPROVAL_FAILED");
    await withTenant(inspector, fixture.tenantB, async (client) => {
      await client.query("UPDATE consents SET expires_at=$2 WHERE consent_id=$1", [successConsent.consentId, new Date(Date.now() - 2_000)]);
      await client.query("UPDATE exchange_sessions SET state='FAILED', expires_at=$2, updated_at=now() WHERE session_id=$1", [successSession.sessionId, new Date(Date.now() - 1_000)]);
    });
    const withdrawn = await withdraw(app, patientHeaders, successSession.sessionId, successConsent.consentId);
    assert.equal(withdrawn.statusCode, 200, "CON005_SYNTHETIC_WITHDRAWAL_FAILED");
    assert.equal(withdrawn.json().status, "WITHDRAWN");
    assert.equal(typeof withdrawn.json().withdrawnAt, "string");
    assert.equal(withdrawn.headers["cache-control"], "no-store");
    const withdrawalAudits = await consentAuditRows(inspector, fixture.tenantB, successSession.sessionId, "CONSENT_WITHDRAWN");
    assert.equal(withdrawalAudits.length, 1, "CON005_WITHDRAWAL_AUDIT_NOT_EXACTLY_ONCE");
    assert.ok(withdrawn.headers["x-correlation-id"], "CON005_CORRELATION_HEADER_MISSING");
    assertConsentAuditContext(withdrawalAudits[0], {
      actor_id: patientActorId,
      tenant_id: fixture.tenantB,
      exchange_session_id: successSession.sessionId,
      resource_type: "CONSENT",
      resource_id: successConsent.consentId,
      action: "CONSENT_WITHDRAWN",
      result: "SUCCESS",
      reason_code: null,
      correlation_id: withdrawn.headers["x-correlation-id"].toLowerCase(),
    });
    const afterWithdrawal = await withdrawalEvidence(inspector, fixture.tenantB, successSession.sessionId, successConsent.consentId);
    assert.equal(afterWithdrawal.session_state, "FAILED", "CON005_SESSION_STATE_CHANGED");
    assert.equal(afterWithdrawal.consent_status, "WITHDRAWN");
    assert.ok(afterWithdrawal.withdrawn_at instanceof Date);
    assert.equal(afterWithdrawal.withdrawal_audits, 1);
    assert.equal(afterWithdrawal.grants, 0);
    const replay = await withdraw(app, patientHeaders, successSession.sessionId, successConsent.consentId);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.headers["idempotency-replayed"], "true");
    assert.equal(replay.json().withdrawnAt, withdrawn.json().withdrawnAt);
    const afterReplay = await withdrawalEvidence(inspector, fixture.tenantB, successSession.sessionId, successConsent.consentId);
    assert.equal(afterReplay.withdrawal_audits, 1);
    assert.deepEqual(afterReplay.withdrawn_at, afterWithdrawal.withdrawn_at);
    assert.deepEqual(afterReplay.consent_updated_at, afterWithdrawal.consent_updated_at);
    assert.equal(afterReplay.session_state, "FAILED");

    console.error("CON005_STAGE=ACTOR_CLAIM_TENANT_AND_INPUT_DENIAL");
    const denialSession = await createSession(context, fixture, "withdraw-denials");
    const denialConsent = await createPending(app, requesterHeaders, denialSession);
    const denialApproval = await approve(app, patientHeaders, denialSession.sessionId, denialConsent.consentId);
    assert.equal(denialApproval.statusCode, 200);
    const noClaim = await token(oidc.privateKey, oidc.issuer, patientSubject);
    const mismatchClaim = await token(oidc.privateKey, oidc.issuer, patientSubject, randomUUID());
    const requesterClaim = await token(oidc.privateKey, oidc.issuer, fixture.subjectB, fixture.patientRefId);
    const serviceClaim = await token(oidc.privateKey, oidc.issuer, fixture.serviceSubjectB, fixture.patientRefId);
    const malformedToken = "not.a.valid.jwt";
    const noClaimResult = await withdraw(app, { ...patientHeaders, authorization: `Bearer ${noClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const mismatchResult = await withdraw(app, { ...patientHeaders, authorization: `Bearer ${mismatchClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const requesterResult = await withdraw(app, { ...requesterHeaders, authorization: `Bearer ${requesterClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const serviceResult = await withdraw(app, { ...patientHeaders, authorization: `Bearer ${serviceClaim}` }, denialSession.sessionId, denialConsent.consentId);
    const malformedResult = await withdraw(app, { ...patientHeaders, authorization: `Bearer ${malformedToken}` }, denialSession.sessionId, denialConsent.consentId);
    const hospitalSubject = `synthetic-con005-hospital-${randomUUID()}`;
    await createTestActor(inspector, fixture, hospitalSubject, fixture.hospitalB);
    const hospitalToken = await token(oidc.privateKey, oidc.issuer, hospitalSubject, fixture.patientRefId);
    const hospitalResult = await withdraw(app, { ...patientHeaders, authorization: `Bearer ${hospitalToken}` }, denialSession.sessionId, denialConsent.consentId);
    const crossTenantToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectC, fixture.patientRefId);
    const crossTenantResult = await withdraw(app, { authorization: `Bearer ${crossTenantToken}`, "x-tenant-id": fixture.tenantC }, denialSession.sessionId, denialConsent.consentId);
    const otherSession = await createSession(context, fixture, "withdraw-binding");
    const otherConsent = await createPending(app, requesterHeaders, otherSession);
    const wrongPair = await withdraw(app, patientHeaders, denialSession.sessionId, otherConsent.consentId);
    const wrongConsent = await withdraw(app, patientHeaders, denialSession.sessionId, randomUUID());
    assert.deepEqual([
      noClaimResult.statusCode, mismatchResult.statusCode, requesterResult.statusCode,
      serviceResult.statusCode, hospitalResult.statusCode, crossTenantResult.statusCode,
      wrongPair.statusCode, wrongConsent.statusCode,
    ], [403, 403, 403, 403, 403, 403, 403, 403]);
    assert.equal(malformedResult.statusCode, 401);
    const overrideBody = await withdraw(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { payload: { patientRefId: fixture.patientRefId } });
    const overrideQuery = await withdraw(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { query: `?patientRefId=${fixture.patientRefId}` });
    const overrideHeader = await withdraw(app, patientHeaders, denialSession.sessionId, denialConsent.consentId, { headers: { "x-patient-ref-id": fixture.patientRefId } });
    assert.deepEqual([overrideBody.statusCode, overrideQuery.statusCode, overrideHeader.statusCode], [400, 400, 400]);
    const denialEvidence = await withdrawalEvidence(inspector, fixture.tenantB, denialSession.sessionId, denialConsent.consentId);
    assert.equal(denialEvidence.consent_status, "ACTIVE");
    assert.equal(denialEvidence.withdrawal_audits, 0);
    assert.equal(denialEvidence.session_state, "CONSENTED");

    console.error("CON005_STAGE=INVALID_STATE_AND_CONFLICT");
    const pendingSession = await createSession(context, fixture, "withdraw-pending");
    const pendingConsent = await createPending(app, requesterHeaders, pendingSession);
    const pendingResult = await withdraw(app, patientHeaders, pendingSession.sessionId, pendingConsent.consentId);
    assert.equal(pendingResult.statusCode, 409);
    const rejectedSession = await createSession(context, fixture, "withdraw-rejected");
    const rejectedConsent = await createPending(app, requesterHeaders, rejectedSession);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE consents SET status='REJECTED', updated_at=now() WHERE consent_id=$1",
      [rejectedConsent.consentId],
    ));
    const rejectedResult = await withdraw(app, patientHeaders, rejectedSession.sessionId, rejectedConsent.consentId);
    assert.equal(rejectedResult.statusCode, 409);
    const expiredStatusSession = await createSession(context, fixture, "withdraw-expired-status");
    const expiredStatusConsent = await createPending(app, requesterHeaders, expiredStatusSession);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE consents SET status='EXPIRED', updated_at=now() WHERE consent_id=$1",
      [expiredStatusConsent.consentId],
    ));
    const expiredStatusResult = await withdraw(app, patientHeaders, expiredStatusSession.sessionId, expiredStatusConsent.consentId);
    assert.equal(expiredStatusResult.statusCode, 409);
    const inconsistentSession = await createSession(context, fixture, "withdraw-inconsistent");
    const inconsistentConsent = await createPending(app, requesterHeaders, inconsistentSession);
    assert.equal((await approve(app, patientHeaders, inconsistentSession.sessionId, inconsistentConsent.consentId)).statusCode, 200);
    await withTenant(inspector, fixture.tenantB, (client) => client.query(
      "UPDATE consents SET withdrawn_at=now() WHERE consent_id=$1",
      [inconsistentConsent.consentId],
    ));
    const inconsistentResult = await withdraw(app, patientHeaders, inconsistentSession.sessionId, inconsistentConsent.consentId);
    assert.equal(inconsistentResult.statusCode, 409);

    console.error("CON005_STAGE=CONCURRENCY");
    const raceSession = await createSession(context, fixture, "withdraw-race");
    const raceConsent = await createPending(app, requesterHeaders, raceSession);
    assert.equal((await approve(app, patientHeaders, raceSession.sessionId, raceConsent.consentId)).statusCode, 200);
    const raced = await Promise.all([
      withdraw(app, patientHeaders, raceSession.sessionId, raceConsent.consentId),
      withdraw(app, patientHeaders, raceSession.sessionId, raceConsent.consentId),
    ]);
    assert.deepEqual(raced.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(raced.filter((response) => response.headers["idempotency-replayed"] === "true").length, 1);
    assert.equal((await withdrawalEvidence(inspector, fixture.tenantB, raceSession.sessionId, raceConsent.consentId)).withdrawal_audits, 1);

    console.error("CON005_STAGE=ATOMIC_ROLLBACK");
    for (const failure of ["withdraw-consent", "withdraw-audit", "withdraw-commit"]) {
      const faultSession = await createSession(context, fixture, `withdraw-fault-${failure}`);
      const faultConsent = await createPending(app, requesterHeaders, faultSession);
      assert.equal((await approve(app, patientHeaders, faultSession.sessionId, faultConsent.consentId)).statusCode, 200);
      const failingApp = await createApi(pool, oidc, failure);
      const response = await withdraw(failingApp, patientHeaders, faultSession.sessionId, faultConsent.consentId);
      assert.equal(response.statusCode, 503, `CON005_${failure.toUpperCase()}_FAILURE_RESPONSE`);
      await failingApp.close();
      const evidenceAfterFailure = await withdrawalEvidence(inspector, fixture.tenantB, faultSession.sessionId, faultConsent.consentId);
      assert.equal(evidenceAfterFailure.consent_status, "ACTIVE", `CON005_${failure.toUpperCase()}_CONSENT_ROLLBACK`);
      assert.equal(evidenceAfterFailure.withdrawn_at, null, `CON005_${failure.toUpperCase()}_TIMESTAMP_ROLLBACK`);
      assert.equal(evidenceAfterFailure.withdrawal_audits, 0, `CON005_${failure.toUpperCase()}_AUDIT_ROLLBACK`);
      assert.equal(evidenceAfterFailure.session_state, "CONSENTED", `CON005_${failure.toUpperCase()}_SESSION_UNCHANGED`);
    }
    console.error("CON005_STAGE=COMPLETE");
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => oidc.server.close(resolve));
    await inspector.end();
    await pool.end();
  }
});
