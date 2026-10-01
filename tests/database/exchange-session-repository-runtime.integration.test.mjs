import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { ExchangeSession } from "../../services/api/dist/exchange/domain/exchange-session.js";
import {
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../services/api/dist/exchange/persistence/postgres-exchange-session.repository.js";

const { Pool } = pg;
const configuredIssuer = "https://identity.example.test/issuer";
const exchangeSessionColumns = [
  "session_id",
  "patient_ref_id",
  "source_hospital_id",
  "destination_hospital_id",
  "requester_actor_id",
  "purpose",
  "state",
  "created_at",
  "updated_at",
  "expires_at",
  "completed_at",
  "idempotency_key",
];

function readFixture() {
  const rawFixture = process.env.MEDIQ_EXC002_TEST_FIXTURE;
  assert.ok(rawFixture, "MEDIQ_EXC002_TEST_FIXTURE is required");
  const fixture = JSON.parse(rawFixture);
  for (const key of [
    "subjectA", "actorA", "tenantA", "hospitalA",
    "subjectB", "actorB", "tenantB", "hospitalB",
    "subjectC", "actorC", "tenantC", "hospitalC", "patientRefId",
  ]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} is required`);
  }
  assert.ok(fixture.subjectA.startsWith("synthetic-iam002-"));
  assert.ok(fixture.subjectB.startsWith("synthetic-aut005-b-"));
  assert.ok(fixture.subjectC.startsWith("synthetic-aut005-c-"));
  return fixture;
}

function principal(subject) {
  return Object.freeze({ issuer: configuredIssuer, subject });
}

function newSession(fixture, purpose) {
  return ExchangeSession.create({
    patientRefId: fixture.patientRefId,
    sourceHospitalId: fixture.hospitalA,
    destinationHospitalId: fixture.hospitalB,
    requesterActorId: fixture.actorA,
    purpose,
    now: new Date(),
  });
}

test("EXC-002 persists synthetic ExchangeSessions under verified Tenant RLS and scratch-only grants", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  const fixture = readFixture();
  const parsedUrl = new URL(connectionString);
  assert.equal(decodeURIComponent(parsedUrl.username), "mediq_runtime");
  assert.equal(parsedUrl.hostname, "postgres");

  const pool = new Pool({ connectionString, max: 1 });
  const database = { connect: () => pool.connect() };
  const appConfig = {
    oidcAuthentication: {
      issuer: configuredIssuer,
      audience: "mediq-api-test",
      jwksUri: "https://identity.example.test/jwks",
    },
  };
  const contextService = new ActorTenantContextService(
    appConfig,
    database,
    new ActorRegistryRepository(),
  );
  const actors = {
    a: principal(fixture.subjectA),
    b: principal(fixture.subjectB),
    c: principal(fixture.subjectC),
  };

  try {
    console.error("EXC002_STAGE=SCRATCH_PRIVILEGES");
    const privilegeResult = await pool.query(`
      SELECT column_name, privilege_type
        FROM information_schema.column_privileges
       WHERE grantee = current_user
         AND table_schema = 'public'
         AND table_name = 'exchange_sessions'
       ORDER BY privilege_type, column_name
    `);
    const actualPrivileges = privilegeResult.rows.map(
      (row) => `${row.privilege_type}:${row.column_name}`,
    );
    const expectedPrivileges = [
      ...exchangeSessionColumns.map((column) => `INSERT:${column}`),
      ...exchangeSessionColumns.map((column) => `SELECT:${column}`),
      "UPDATE:state",
      "UPDATE:updated_at",
    ].sort();
    assert.deepEqual(actualPrivileges, expectedPrivileges, "EXC002_EXACT_RUNTIME_PRIVILEGES_MISMATCH");
    const rlsResult = await pool.query(`
      SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relname = 'exchange_sessions'
    `);
    assert.equal(rlsResult.rows.length, 1);
    assert.equal(rlsResult.rows[0].relrowsecurity, true);
    assert.equal(rlsResult.rows[0].relforcerowsecurity, true);

    console.error("EXC002_STAGE=CREATE_READ_ROUND_TRIP");
    const session = newSession(fixture, "Synthetic EXC-002 repository integration");
    const created = await contextService.run(
      actors.a,
      fixture.tenantA,
      async (context, client) => {
        assert.equal(context.actorId, fixture.actorA);
        assert.equal(context.tenantId, fixture.tenantA);
        assert.equal(context.hospitalId, fixture.hospitalA);
        return new PostgresExchangeSessionRepository(client).create(session);
      },
    );
    assert.equal(created.sessionId, session.sessionId);
    assert.equal(created.patientRefId, session.patientRefId);
    assert.equal(created.sourceHospitalId, fixture.hospitalA.toLowerCase());
    assert.equal(created.destinationHospitalId, fixture.hospitalB.toLowerCase());
    assert.equal(created.requesterActorId, fixture.actorA.toLowerCase());
    assert.equal(created.purpose, session.purpose);
    assert.equal(created.state, "REQUESTED");
    assert.equal(created.createdAt.getTime(), session.createdAt.getTime());
    assert.equal(created.updatedAt.getTime(), session.updatedAt.getTime());
    assert.equal(created.expiresAt, null);
    assert.equal(created.completedAt, null);

    const sourceRead = await contextService.run(
      actors.a,
      fixture.tenantA,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(session.sessionId),
    );
    assert.equal(sourceRead?.sessionId, session.sessionId);

    console.error("EXC002_STAGE=BILATERAL_RLS");
    const destinationRead = await contextService.run(
      actors.b,
      fixture.tenantB,
      async (context, client) => {
        assert.equal(context.actorId, fixture.actorB);
        assert.equal(context.tenantId, fixture.tenantB);
        assert.equal(context.hospitalId, fixture.hospitalB);
        return new PostgresExchangeSessionRepository(client).findById(session.sessionId);
      },
    );
    assert.equal(destinationRead?.sessionId, session.sessionId);

    console.error("EXC002_STAGE=UNRELATED_TENANT_DENIAL");
    const unrelatedRead = await contextService.run(
      actors.c,
      fixture.tenantC,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(session.sessionId),
    );
    assert.equal(unrelatedRead, null);

    console.error("EXC002_STAGE=ROLLBACK");
    const rolledBackSession = newSession(fixture, "Synthetic EXC-002 rollback probe");
    await assert.rejects(
      contextService.run(actors.a, fixture.tenantA, async (_context, client) => {
        await new PostgresExchangeSessionRepository(client).create(rolledBackSession);
        throw new Error("EXC002_EXPECTED_ROLLBACK");
      }),
      /EXC002_EXPECTED_ROLLBACK/,
    );
    const afterRollback = await contextService.run(
      actors.a,
      fixture.tenantA,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(rolledBackSession.sessionId),
    );
    assert.equal(afterRollback, null);

    console.error("EXC002_STAGE=NO_CONTEXT_DENIAL");
    const noContextClient = await pool.connect();
    try {
      const noContextRead = await new PostgresExchangeSessionRepository(
        noContextClient,
      ).findById(session.sessionId);
      assert.equal(noContextRead, null);
      await assert.rejects(
        new PostgresExchangeSessionRepository(noContextClient).create(
          newSession(fixture, "Synthetic EXC-002 no-context probe"),
        ),
        ExchangeSessionPersistenceError,
      );
    } finally {
      noContextClient.release();
    }

    console.error("EXC002_STAGE=POOL_CONTEXT_RESET");
    const reusedClient = await pool.connect();
    try {
      const contextState = await reusedClient.query(
        "SELECT current_setting('mediq.tenant_id', true) AS tenant_id",
      );
      assert.ok(
        contextState.rows[0].tenant_id === null || contextState.rows[0].tenant_id === "",
      );
      const hiddenAfterReset = await new PostgresExchangeSessionRepository(
        reusedClient,
      ).findById(session.sessionId);
      assert.equal(hiddenAfterReset, null);
    } finally {
      reusedClient.release();
    }
    console.error("EXC002_STAGE=COMPLETE");
  } finally {
    await pool.end();
  }
});
