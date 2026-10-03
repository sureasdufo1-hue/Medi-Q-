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
  const raw = process.env.MEDIQ_GRT003_TEST_FIXTURE;
  assert.ok(raw, "MEDIQ_GRT003_TEST_FIXTURE is required");
  const fixture = JSON.parse(raw);
  for (const key of ["subjectUserB", "actorUserB", "subjectUserC", "actorUserC", "tenantB", "hospitalA", "hospitalB", "patientRefId", "tenantC"]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} required`);
  }
  return fixture;
}

async function createJwksServer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "mediq-grt003-test-key", alg: "RS256", use: "sig" });
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

function grantDatabaseFailure(stage, error, elapsed) {
  const phases = new Set(["CONNECT", "RESET", "BEGIN", "TENANT", "REGISTRY", "COMMIT", "ROLLBACK", "QUERY"]);
  const phase = phases.has(stage) ? stage : "QUERY";
  const messages = new Map([["query read timeout", "QUERY_READ_TIMEOUT"],
    ["connection terminated unexpectedly", "CONNECTION_TERMINATED"],
    ["connection timeout expired", "CONNECTION_TIMEOUT"],
    ["timeout exceeded when trying to connect", "CONNECT_TIMEOUT"]]);
  const nodeCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ERR_QUERY_TIMEOUT"]);
  const category = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? `SQLSTATE_${error.code}` : nodeCodes.has(error?.code) ? `NODE_${error.code}`
      : messages.get(typeof error?.message === "string" ? error.message.trim().toLowerCase() : "") ?? "UNCLASSIFIED";
  const duration = !Number.isFinite(elapsed) || elapsed < 0 ? "INVALID_DURATION"
    : elapsed < 100 ? "LT100MS" : elapsed < 1000 ? "100TO999MS" : elapsed < 5000 ? "1TO4SEC" : "GTE5SEC";
  return `GRT003_DB_FAILURE=${phase}_${category}_${duration}`;
}

function runtimeProxy(pool, failAt = "") {
  let auditCount = 0;
  return {
    async connect() {
      const started = performance.now();
      let client;
      try { client = await pool.connect(); }
      catch (error) {
        console.error(grantDatabaseFailure("CONNECT", error, performance.now() - started));
        throw error;
      }
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") {
            return async (query, ...args) => {
              const text = typeof query === "string" ? query : query?.text ?? "";
              const values = typeof query === "string" ? args[0] : query?.values;
              if (failAt === "scope" && text.includes("INSERT INTO transfer_grant_scopes")) {
                return Promise.reject(new Error("synthetic scope write failure"));
              }
              if (failAt === "audit" && text.includes("INSERT INTO audit_events")) {
                auditCount += 1;
                if (auditCount === 2) return Promise.reject(new Error("synthetic audit write failure"));
              }
              if (failAt === "grant-denial-audit" && values?.[7] === "GRANT_DENIED") {
                return Promise.reject(new Error("synthetic Grant-denial Audit write failure"));
              }
              if (failAt === "revoke-audit" && values?.[7] === "GRANT_REVOKED") {
                return Promise.reject(new Error("synthetic Grant revocation audit failure"));
              }
              if (failAt === "commit" && text.trim().toUpperCase() === "COMMIT") {
                return Promise.reject(new Error("synthetic transaction commit failure"));
              }
              const statement = text.trim().toUpperCase();
              const phase = ["BEGIN", "COMMIT", "ROLLBACK"].includes(statement) ? statement
                : statement.startsWith("RESET ") ? "RESET" : statement.includes("SET_CONFIG(") ? "TENANT"
                  : statement.includes("FROM ACTORS") ? "REGISTRY" : "QUERY";
              const started = performance.now();
              try { return await target.query(query, ...args); }
              catch (error) {
                console.error(grantDatabaseFailure(phase, error, performance.now() - started));
                throw error;
              }
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

async function token(privateKey, issuer, subject) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "mediq-grt003-test-key" })
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

async function createSession(context, fixture, suffix) {
  return context.run({ issuer: context.issuer, subject: fixture.subjectUserB }, fixture.tenantB, async (identity, client) => {
    const session = ExchangeSession.create({
      patientRefId: fixture.patientRefId,
      sourceHospitalId: fixture.hospitalA,
      destinationHospitalId: fixture.hospitalB,
      requesterActorId: identity.actorId,
      purpose: `GRT003-${suffix}-${randomUUID()}`,
    });
    return (await new PostgresExchangeSessionRepository(client).createIdempotently(session, randomUUID())).session;
  });
}

async function seedConsentAndPackage(inspector, fixture, session) {
  const consentId = randomUUID();
  const packageId = randomUUID();
  const studyRefId = randomUUID();
  const studyUid = `1.2.826.0.1.3680043.10.543.1.${Date.now()}.${Math.floor(Math.random() * 900000 + 100000)}`;
  await withTenant(inspector, fixture.tenantB, async (client) => {
    await client.query("UPDATE exchange_sessions SET state='CONSENTED', updated_at=now() WHERE session_id=$1", [session.sessionId]);
    await client.query(
      `INSERT INTO imaging_packages
        (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
         state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
       VALUES ($1,$2,$3,$4,'AVAILABLE',NULL,1,now(),now(),now()+interval '1 day',NULL)`,
      [packageId, session.sessionId, fixture.patientRefId, fixture.hospitalA],
    );
    await client.query(
      `INSERT INTO consents
        (consent_id, exchange_session_id, patient_ref_id, source_hospital_id,
         destination_hospital_id, imaging_package_id, status, consent_version,
         issued_at, expires_at, withdrawn_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',1,now(),now()+interval '2 hours',NULL,now(),now())`,
      [consentId, session.sessionId, fixture.patientRefId, fixture.hospitalA, fixture.hospitalB, packageId],
    );
    await client.query(
      "INSERT INTO consent_actions (consent_action_id, consent_id, action) VALUES ($1,$2,$3)",
      [randomUUID(), consentId, "VIEW"],
    );
    await client.query(
      `INSERT INTO study_references
        (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
       VALUES ($1,$2,$3,$4,'CT',1,1,now())`,
      [studyRefId, packageId, fixture.hospitalA, studyUid],
    );
  });
  return { consentId, packageId };
}

async function issue(app, headers, sessionId, body, key = randomUUID()) {
  return app.inject({
    method: "POST",
    url: `/api/v1/exchange-sessions/${sessionId}/grants/issue`,
    headers: { ...headers, "idempotency-key": key },
    payload: body,
  });
}

async function revoke(app, headers, sessionId, grantId, extra = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/exchange-sessions/${sessionId}/grants/${grantId}/revoke${extra.query ?? ""}`,
    headers,
    ...(Object.hasOwn(extra, "payload") ? { payload: extra.payload } : {}),
  });
}

async function createTestActor(inspector, fixture, subject) {
  const actorId = randomUUID();
  await withTenant(inspector, fixture.tenantB, (client) => client.query(
    `INSERT INTO actors
      (actor_id, tenant_id, hospital_id, actor_type, external_subject,
       display_name, status, created_at, updated_at)
     VALUES ($1,$2,$3,'USER',$4,'Synthetic additional recipient','ACTIVE',now(),now())`,
    [actorId, fixture.tenantB, fixture.hospitalB, subject],
  ));
  return actorId;
}

async function revocationEvidence(inspector, tenantId, sessionId, grantId) {
  return withTenant(inspector, tenantId, async (client) => {
    const result = await client.query(`
      SELECT g.status, g.revoked_at,
        (SELECT count(*)::int FROM audit_events a
          WHERE a.exchange_session_id=$1 AND a.resource_type='TRANSFER_GRANT'
            AND a.resource_id=$2 AND a.action='GRANT_REVOKED' AND a.result='SUCCESS') AS success_audits,
        (SELECT count(*)::int FROM audit_events a
          WHERE a.exchange_session_id=$1 AND a.action='AUTHORIZATION_DENIED'
            AND a.reason_code='GRANT_REVOKE_DENIED') AS denied_audits,
        (SELECT count(*)::int FROM audit_events a
          WHERE a.exchange_session_id=$1 AND a.action='GRANT_DENIED'
            AND a.reason_code='GRANT_REVOKE_DENIED') AS grant_denied_audits,
        (SELECT count(*)::int FROM audit_events a
          WHERE a.exchange_session_id=$1 AND a.action='AUTHORIZATION_DENIED'
            AND a.reason_code='GRANT_REVOKE_DENIED'
            AND EXISTS (SELECT 1 FROM audit_events g
              WHERE g.action='GRANT_DENIED' AND g.result='DENY'
                AND g.tenant_id=a.tenant_id AND g.actor_id=a.actor_id
                AND g.exchange_session_id=a.exchange_session_id
                AND g.correlation_id=a.correlation_id
                AND g.reason_code=a.reason_code AND g.occurred_at=a.occurred_at)) AS denial_pairs
      FROM transfer_grants g WHERE g.grant_id=$2 AND g.exchange_session_id=$1
    `, [sessionId, grantId]);
    return result.rows[0] ?? null;
  });
}

async function sessionEvidence(inspector, tenantId, sessionId) {
  return withTenant(inspector, tenantId, async (client) => {
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM transfer_grants WHERE exchange_session_id=$1) AS grants,
        (SELECT count(*)::int FROM transfer_grant_scopes gs JOIN transfer_grants g USING (grant_id) WHERE g.exchange_session_id=$1) AS scopes,
        (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='AUTHORIZATION_GRANTED') AS allowed_audits,
        (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='GRANT_CREATED') AS created_audits,
        (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='AUTHORIZATION_DENIED') AS denied_audits,
        (SELECT count(*)::int FROM audit_events WHERE exchange_session_id=$1 AND action='GRANT_DENIED') AS grant_denied_audits,
        (SELECT count(*)::int FROM audit_events a WHERE exchange_session_id=$1 AND action='AUTHORIZATION_DENIED'
          AND EXISTS (SELECT 1 FROM audit_events g WHERE g.action='GRANT_DENIED' AND g.result='DENY'
            AND g.tenant_id=a.tenant_id AND g.actor_id=a.actor_id
            AND g.exchange_session_id=a.exchange_session_id AND g.correlation_id=a.correlation_id
            AND g.reason_code=a.reason_code AND g.occurred_at=a.occurred_at)) AS denial_pairs
    `, [sessionId]);
    return result.rows[0];
  });
}

async function issuePrerequisiteEvidence(inspector, fixture, sessionId, consentId, packageId) {
  return withTenant(inspector, fixture.tenantB, async (client) => {
    const result = await client.query(`
      SELECT
        (s.state='CONSENTED' AND (s.expires_at IS NULL OR s.expires_at>now())
          AND s.requester_actor_id=$4 AND s.destination_hospital_id=$5) AS session_ok,
        (c.status='ACTIVE' AND c.issued_at IS NOT NULL AND c.issued_at<=now()
          AND (c.expires_at IS NULL OR c.expires_at>now()) AND c.withdrawn_at IS NULL
          AND c.exchange_session_id=s.session_id AND c.patient_ref_id=s.patient_ref_id
          AND c.source_hospital_id=s.source_hospital_id
          AND c.destination_hospital_id=s.destination_hospital_id
          AND (c.imaging_package_id IS NULL OR c.imaging_package_id=$3)) AS consent_ok,
        EXISTS (SELECT 1 FROM consent_actions a WHERE a.consent_id=c.consent_id AND a.action='VIEW') AS view_action_ok,
        (p.exchange_session_id=s.session_id AND p.patient_ref_id=s.patient_ref_id
          AND p.source_hospital_id=s.source_hospital_id AND p.state IN ('AVAILABLE','IN_EXCHANGE')
          AND p.deleted_at IS NULL AND (p.retention_expires_at IS NULL OR p.retention_expires_at>now())) AS package_ok,
        EXISTS (SELECT 1 FROM study_references r WHERE r.package_id=p.package_id
          AND r.source_hospital_id=s.source_hospital_id) AS study_ok,
        EXISTS (SELECT 1 FROM actors a WHERE a.actor_id=$4 AND a.tenant_id=$6
          AND a.hospital_id=$5 AND a.actor_type='USER' AND a.status='ACTIVE') AS requester_membership_ok
      FROM exchange_sessions s
      JOIN consents c ON c.consent_id=$2
      JOIN imaging_packages p ON p.package_id=$3
      WHERE s.session_id=$1
    `, [sessionId, consentId, packageId, fixture.actorUserB, fixture.hospitalB, fixture.tenantB]);
    assert.equal(result.rows.length, 1, "GRT003_DIAGNOSTIC_FIXTURE_MISSING");
    return result.rows[0];
  });
}

async function runDiagnosticSubtest(t, name, stage, work) {
  await t.test(name, async () => {
    console.error(`GRT003_STAGE=${stage}`);
    try {
      await work();
    } catch (error) {
      const candidate = error && typeof error === "object" ? error : {};
      const errorName = typeof candidate.name === "string" && /^[A-Za-z]+Error$/.test(candidate.name)
        ? candidate.name
        : "Error";
      const errorCode = typeof candidate.code === "string" && /^[A-Z0-9_]{2,80}$/.test(candidate.code)
        ? candidate.code
        : "NONE";
      const constraint = typeof candidate.constraint === "string" && /^[A-Za-z0-9_]{1,100}$/.test(candidate.constraint)
        ? candidate.constraint
        : "NONE";
      const message = typeof candidate.message === "string" && /^[A-Z0-9_]{2,120}$/.test(candidate.message)
        ? candidate.message
        : typeof candidate.message === "string"
          ? (candidate.message.match(/(?:^|\n)(GRT003_[A-Z0-9_]+)/)?.[1] ?? "REDACTED")
          : "REDACTED";
      const scalar = (value) => {
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        if (typeof value === "string" && /^[A-Z0-9_-]{1,40}$/.test(value)) return value;
        return "REDACTED";
      };
      const actual = scalar(candidate.actual);
      const expected = scalar(candidate.expected);
      const operator = typeof candidate.operator === "string" && /^[a-z]{1,16}$/.test(candidate.operator)
        ? candidate.operator
        : "NONE";
      console.error(`GRT003_FAILURE=stage:${stage}|type:${errorName}|code:${errorCode}|constraint:${constraint}|message:${message}|actual:${actual}|expected:${expected}|operator:${operator}`);
      throw error;
    }
  });
}

test("GRT-003 signed destination requester issues actor/package-bound idempotent Grants atomically", async (t) => {
  console.error("GRT003_STAGE=ENVIRONMENT");
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  const inspectUrl = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectUrl, "MEDIQ_TEST_INSPECT_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(inspectUrl).username), "mediq_migrator");
  const fixture = loadFixture();
  console.error("GRT003_STAGE=FIXTURE");
  const pool = new Pool({ connectionString, max: 10 });
  const inspector = new Pool({ connectionString: inspectUrl, max: 3 });
  const oidc = await createJwksServer();
  console.error("GRT003_STAGE=OIDC_SERVER");
  const context = new ActorTenantContextService(
    { oidcAuthentication: { issuer: oidc.issuer, audience: AUDIENCE, jwksUri: oidc.jwksUri } },
    runtimeProxy(pool),
    new ActorRegistryRepository(),
  );
  context.issuer = oidc.issuer;
  let app;
  try {
    const catalog = await pool.query(`
      SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee=current_user AND table_schema='public'
    `);
    assert.equal(catalog.rows.length, 253, "GRT004_EXACT_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
    const tablePrivileges = await pool.query(
      "SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee IN ('PUBLIC',current_user) AND table_schema='public'",
    );
    assert.equal(tablePrivileges.rows[0].n, 0, "GRT003_BROAD_TABLE_GRANT_PRESENT");
    app = await createApi(pool, oidc);
    console.error("GRT003_STAGE=APP_READY");
    const requesterToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectUserB);
    const headers = { authorization: `Bearer ${requesterToken}`, "x-tenant-id": fixture.tenantB };

    await runDiagnosticSubtest(t, "success, server-derived recipient, 30-minute cap, and semantic replay", "SUCCESS_REPLAY", async () => {
      const session = await createSession(context, fixture, "success");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const key = randomUUID();
      const payload = { consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"] };
      const first = await issue(app, headers, session.sessionId, payload, key);
      if (first.statusCode !== 201) {
        const gates = await issuePrerequisiteEvidence(inspector, fixture, session.sessionId, binding.consentId, binding.packageId);
        console.error(`GRT003_PREFLIGHT_FACTS=${Object.entries(gates).map(([name, value]) => `${name}:${value}`).join(",")}`);
      }
      assert.equal(first.statusCode, 201, "GRT003_VALID_ISSUE_FAILED");
      const grant = first.json();
      assert.equal(grant.status, "ACTIVE");
      assert.equal(grant.recipientTenantId, fixture.tenantB);
      assert.equal(grant.recipientHospitalId, fixture.hospitalB);
      assert.equal(grant.recipientActorId, fixture.actorUserB);
      assert.equal(grant.imagingPackageId, binding.packageId);
      assert.deepEqual(grant.scopes, ["study:view"]);
      assert.deepEqual(Object.keys(grant).sort(), [
        "consentId", "expiresAt", "grantId", "imagingPackageId", "issuedAt",
        "recipientActorId", "recipientHospitalId", "recipientTenantId", "scopes", "sessionId", "status",
      ].sort());
      assert.equal(new Date(grant.expiresAt).getTime() - new Date(grant.issuedAt).getTime(), 30 * 60 * 1000);
      assert.equal(first.headers["cache-control"], "no-store");
      assert.ok(first.headers["x-correlation-id"]);
      const replay = await issue(app, headers, session.sessionId, payload, key);
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.headers["idempotency-replayed"], "true");
      assert.equal(replay.json().grantId, grant.grantId);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 1, scopes: 1, allowed_audits: 1, created_audits: 1,
        denied_audits: 0, grant_denied_audits: 0, denial_pairs: 0,
      });
    });

    await runDiagnosticSubtest(t, "scope expansion and untrusted recipient fields are denied without writes", "DENIAL_BINDING", async () => {
      const session = await createSession(context, fixture, "denial");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const deniedScope = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:pacs-transfer"],
      });
      assert.equal(deniedScope.statusCode, 403);
      const spoofedRecipient = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId,
        imagingPackageId: binding.packageId,
        scopes: ["study:view"],
        recipientHospitalId: fixture.hospitalA,
      });
      assert.equal(spoofedRecipient.statusCode, 400);
      const wrongPackage = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: randomUUID(), scopes: ["study:view"],
      });
      assert.equal(wrongPackage.statusCode, 403);
      const malformedKey = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
      }, "not-a-uuid");
      assert.equal(malformedKey.statusCode, 400);
      const malformedCorrelation = await issue(app, { ...headers, "x-correlation-id": "not-a-uuid" }, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
      });
      assert.equal(malformedCorrelation.statusCode, 400);
      const clientExpiry = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId,
        scopes: ["study:view"], expiresAt: new Date().toISOString(),
      });
      assert.equal(clientExpiry.statusCode, 400);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 0, scopes: 0, allowed_audits: 0, created_audits: 0,
        denied_audits: 2, grant_denied_audits: 2, denial_pairs: 2,
      });
    });

    await runDiagnosticSubtest(t, "distinct idempotency keys create independent exact Grants", "DISTINCT_KEYS", async () => {
      const session = await createSession(context, fixture, "distinct-keys");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const body = { consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"] };
      const first = await issue(app, headers, session.sessionId, body, randomUUID());
      const second = await issue(app, headers, session.sessionId, body, randomUUID());
      assert.equal(first.statusCode, 201);
      assert.equal(second.statusCode, 201);
      assert.notEqual(first.json().grantId, second.json().grantId);
      assert.deepEqual(first.json().scopes, ["study:view"]);
      assert.deepEqual(second.json().scopes, ["study:view"]);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 2, scopes: 2, allowed_audits: 2, created_audits: 2,
        denied_audits: 0, grant_denied_audits: 0, denial_pairs: 0,
      });
    });

    await runDiagnosticSubtest(t, "same key with a different scope conflicts and does not mutate the issued Grant", "KEY_CONFLICT", async () => {
      const session = await createSession(context, fixture, "key-conflict");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const key = randomUUID();
      const view = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
      }, key);
      assert.equal(view.statusCode, 201);
      const conflict = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:download"],
      }, key);
      assert.equal(conflict.statusCode, 409);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 1, scopes: 1, allowed_audits: 1, created_audits: 1,
        denied_audits: 1, grant_denied_audits: 1, denial_pairs: 1,
      });
    });

    await runDiagnosticSubtest(t, "concurrent same-key requests create one Grant and one success Audit pair", "CONCURRENCY", async () => {
      const session = await createSession(context, fixture, "concurrent");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const key = randomUUID();
      const body = { consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"] };
      const responses = await Promise.all([
        issue(app, headers, session.sessionId, body, key),
        issue(app, headers, session.sessionId, body, key),
      ]);
      assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 201]);
      assert.equal(responses[0].json().grantId, responses[1].json().grantId);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 1, scopes: 1, allowed_audits: 1, created_audits: 1,
        denied_audits: 0, grant_denied_audits: 0, denial_pairs: 0,
      });
    });

    await runDiagnosticSubtest(t, "a different Tenant cannot see or issue against the Session", "CROSS_TENANT", async () => {
      const session = await createSession(context, fixture, "cross-tenant");
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const tokenC = await token(oidc.privateKey, oidc.issuer, fixture.subjectUserC);
      const crossTenant = await issue(app, {
        authorization: `Bearer ${tokenC}`, "x-tenant-id": fixture.tenantC,
      }, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
      });
      assert.equal(crossTenant.statusCode, 403);
      assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
        grants: 0, scopes: 0, allowed_audits: 0, created_audits: 0,
        denied_audits: 0, grant_denied_audits: 0, denial_pairs: 0,
      });
    });

    await runDiagnosticSubtest(t, "Audit or Scope persistence failure rolls back all Grant rows", "ROLLBACK", async () => {
      await app.close();
      app = undefined;
      for (const failAt of ["audit", "scope", "grant-denial-audit"]) {
        const mark = step => console.error(`GRT003_ROLLBACK_STAGE=${failAt.replaceAll("-", "_").toUpperCase()}_${step}`);
        mark("CREATE_SESSION");
        const session = await createSession(context, fixture, `rollback-${failAt}`);
        mark("SEED");
        const binding = await seedConsentAndPackage(inspector, fixture, session);
        if (failAt === "grant-denial-audit") {
          await withTenant(inspector, fixture.tenantB, (client) => client.query(
            "UPDATE consents SET status='WITHDRAWN', withdrawn_at=now() WHERE consent_id=$1",
            [binding.consentId],
          ));
        }
        mark("APP");
        const failingApp = await createApi(pool, oidc, failAt);
        try {
          mark("ISSUE");
          const response = await issue(failingApp, headers, session.sessionId, {
            consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
          });
          assert.equal(response.statusCode, 503, `GRT003_${failAt.toUpperCase()}_FAILURE_RESPONSE`);
        } finally {
          mark("CLOSE");
          await failingApp.close();
        }
        mark("OBSERVE");
        assert.deepEqual(await sessionEvidence(inspector, fixture.tenantB, session.sessionId), {
          grants: 0, scopes: 0, allowed_audits: 0, created_audits: 0,
          denied_audits: 0, grant_denied_audits: 0, denial_pairs: 0,
        }, `GRT003_${failAt.toUpperCase()}_ATOMIC_ROLLBACK`);
      }
    });
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => oidc.server.close(resolve));
    await inspector.end();
    await pool.end();
  }
});

test("GRT-004 exact recipient revokes a Grant with replay, denial, concurrency and atomic Audit", async (t) => {
  console.error("GRT004_STAGE=ENVIRONMENT");
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  const inspectUrl = process.env.MEDIQ_TEST_INSPECT_DATABASE_URL;
  assert.ok(inspectUrl, "MEDIQ_TEST_INSPECT_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(inspectUrl).username), "mediq_migrator");
  const fixture = loadFixture();
  const pool = new Pool({ connectionString, max: 10 });
  const inspector = new Pool({ connectionString: inspectUrl, max: 3 });
  const oidc = await createJwksServer();
  const context = new ActorTenantContextService(
    { oidcAuthentication: { issuer: oidc.issuer, audience: AUDIENCE, jwksUri: oidc.jwksUri } },
    { connect: () => pool.connect() },
    new ActorRegistryRepository(),
  );
  context.issuer = oidc.issuer;
  let app;
  try {
    app = await createApi(pool, oidc);
    const recipientToken = await token(oidc.privateKey, oidc.issuer, fixture.subjectUserB);
    const headers = { authorization: `Bearer ${recipientToken}`, "x-tenant-id": fixture.tenantB };
    const createActiveGrant = async (label) => {
      const session = await createSession(context, fixture, `revoke-${label}`);
      const binding = await seedConsentAndPackage(inspector, fixture, session);
      const issued = await issue(app, headers, session.sessionId, {
        consentId: binding.consentId, imagingPackageId: binding.packageId, scopes: ["study:view"],
      });
      assert.equal(issued.statusCode, 201, `GRT004_${label.toUpperCase()}_ISSUE`);
      return { session, binding, grant: issued.json() };
    };

    await runRevocationSubtest(t, "risk-reducing revoke succeeds despite withdrawn Consent, terminal Session and elapsed Grant expiry; replay is stable", "RISK_REDUCTION_REPLAY", async () => {
      const { session, binding, grant } = await createActiveGrant("risk-reduction");
      await withTenant(inspector, fixture.tenantB, async (client) => {
        await client.query("UPDATE consents SET status='WITHDRAWN', withdrawn_at=now(), updated_at=now() WHERE consent_id=$1", [binding.consentId]);
        await client.query("UPDATE exchange_sessions SET state='EXPIRED', expires_at=now()-interval '1 minute', updated_at=now() WHERE session_id=$1", [session.sessionId]);
        await client.query("UPDATE transfer_grants SET issued_at=now()-interval '2 minutes', expires_at=now()-interval '1 minute' WHERE grant_id=$1", [grant.grantId]);
      });
      const first = await revoke(app, headers, session.sessionId, grant.grantId);
      assert.equal(first.statusCode, 200);
      assert.equal(first.headers["cache-control"], "no-store");
      assert.ok(first.headers["x-correlation-id"]);
      assert.equal(first.headers["idempotency-replayed"], undefined);
      assert.equal(first.json().status, "REVOKED");
      assert.deepEqual(first.json().scopes, ["study:view"]);
      assert.ok(first.json().revokedAt);
      const evidence = await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId);
      assert.equal(evidence.status, "REVOKED");
      assert.equal(evidence.success_audits, 1);
      const replay = await revoke(app, headers, session.sessionId, grant.grantId);
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.headers["idempotency-replayed"], "true");
      assert.equal(replay.json().revokedAt, first.json().revokedAt);
      assert.equal((await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId)).success_audits, 1);
    });

    await runRevocationSubtest(t, "another same-hospital Actor and a mismatched Session cannot revoke", "RECIPIENT_BINDING", async () => {
      const { session, grant } = await createActiveGrant("recipient-binding");
      const alternateSubject = `synthetic-grt004-other-${randomUUID()}`;
      await createTestActor(inspector, fixture, alternateSubject);
      const alternateToken = await token(oidc.privateKey, oidc.issuer, alternateSubject);
      const wrongActor = await revoke(app, { authorization: `Bearer ${alternateToken}`, "x-tenant-id": fixture.tenantB }, session.sessionId, grant.grantId);
      assert.equal(wrongActor.statusCode, 403);
      const otherSession = await createSession(context, fixture, "wrong-route-session");
      const wrongRoute = await revoke(app, headers, otherSession.sessionId, grant.grantId);
      assert.equal(wrongRoute.statusCode, 403);
      const missingGrant = await revoke(app, headers, session.sessionId, randomUUID());
      assert.equal(missingGrant.statusCode, 403);
      const evidence = await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId);
      assert.equal(evidence.status, "ACTIVE");
      assert.equal(evidence.success_audits, 0);
      assert.equal(evidence.denied_audits, 2);
      assert.equal(evidence.grant_denied_audits, 2);
      assert.equal(evidence.denial_pairs, 2);
    });

    await runRevocationSubtest(t, "EXPIRED and CONSUMED Grants conflict; body and query overrides are rejected", "TERMINAL_AND_INPUT", async () => {
      for (const status of ["EXPIRED", "CONSUMED"]) {
        const { session, grant } = await createActiveGrant(`terminal-${status.toLowerCase()}`);
        await withTenant(inspector, fixture.tenantB, (client) => client.query(
          "UPDATE transfer_grants SET status=$2 WHERE grant_id=$1", [grant.grantId, status],
        ));
        const response = await revoke(app, headers, session.sessionId, grant.grantId);
        assert.equal(response.statusCode, 409);
        const evidence = await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId);
        assert.equal(evidence.status, status);
        assert.equal(evidence.success_audits, 0);
      }
      const { session, grant } = await createActiveGrant("input-rejection");
      assert.equal((await revoke(app, headers, session.sessionId, grant.grantId, { payload: { status: "REVOKED" } })).statusCode, 400);
      assert.equal((await revoke(app, headers, session.sessionId, grant.grantId, { query: "?status=REVOKED" })).statusCode, 400);
      assert.equal((await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId)).status, "ACTIVE");
    });

    await runRevocationSubtest(t, "concurrent revoke calls produce one state transition and one success Audit", "CONCURRENCY", async () => {
      const { session, grant } = await createActiveGrant("concurrency");
      const responses = await Promise.all([
        revoke(app, headers, session.sessionId, grant.grantId),
        revoke(app, headers, session.sessionId, grant.grantId),
      ]);
      assert.deepEqual(responses.map((response) => response.statusCode), [200, 200]);
      assert.equal(responses.filter((response) => response.headers["idempotency-replayed"] === "true").length, 1);
      const evidence = await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId);
      assert.equal(evidence.status, "REVOKED");
      assert.equal(evidence.success_audits, 1);
    });

    await runRevocationSubtest(t, "Audit failure rolls the status change back, and another Tenant remains denied", "ROLLBACK_CROSS_TENANT", async () => {
      const { session, grant } = await createActiveGrant("audit-rollback");
      const failingApp = await createApi(pool, oidc, "revoke-audit");
      const failed = await revoke(failingApp, headers, session.sessionId, grant.grantId);
      assert.equal(failed.statusCode, 503);
      await failingApp.close();
      const afterFailure = await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId);
      assert.equal(afterFailure.status, "ACTIVE");
      assert.equal(afterFailure.success_audits, 0);
      const tokenC = await token(oidc.privateKey, oidc.issuer, fixture.subjectUserC);
      const crossTenant = await revoke(app, { authorization: `Bearer ${tokenC}`, "x-tenant-id": fixture.tenantC }, session.sessionId, grant.grantId);
      assert.equal(crossTenant.statusCode, 403);
      assert.equal((await revocationEvidence(inspector, fixture.tenantB, session.sessionId, grant.grantId)).status, "ACTIVE");
    });
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => oidc.server.close(resolve));
    await inspector.end();
    await pool.end();
  }
});

async function runRevocationSubtest(t, name, stage, work) {
  await t.test(name, async () => {
    console.error(`GRT004_STAGE=${stage}`);
    try {
      await work();
    } catch (error) {
      console.error(`GRT004_FAILURE=${stage}:${error?.code ?? error?.name ?? "Error"}`);
      throw error;
    }
  });
}
