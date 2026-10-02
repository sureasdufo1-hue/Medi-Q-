import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { ExchangeSessionCreationService } from "../../services/api/dist/exchange/application/exchange-session-creation.service.js";
import { ExchangeSession } from "../../services/api/dist/exchange/domain/exchange-session.js";
import { PostgresExchangeSessionAuditRepository } from "../../services/api/dist/exchange/persistence/postgres-exchange-session-audit.repository.js";
import { PostgresExchangeSessionRepository } from "../../services/api/dist/exchange/persistence/postgres-exchange-session.repository.js";

const { Pool } = pg;
const issuer = "https://identity.example.test/issuer";

function readFixture() {
  const raw = process.env.MEDIQ_EXC003_TEST_FIXTURE;
  assert.ok(raw, "MEDIQ_EXC003_TEST_FIXTURE is required");
  const fixture = JSON.parse(raw);
  for (const key of [
    "subjectA", "actorA", "tenantA", "hospitalA",
    "subjectB", "actorB", "tenantB", "hospitalB",
    "subjectC", "actorC", "tenantC", "hospitalC", "patientRefId",
  ]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} is required`);
  }
  assert.ok(fixture.subjectB.startsWith("synthetic-exc003-user-"));
  return fixture;
}

function principal(subject) {
  return Object.freeze({ issuer, subject });
}

function request(fixture, idempotencyKey, overrides = {}) {
  return {
    principal: principal(fixture.subjectB),
    tenantCandidate: fixture.tenantB,
    idempotencyKey,
    correlationId: randomUUID(),
    body: {
      patientRefId: fixture.patientRefId,
      sourceHospitalId: fixture.hospitalA,
      destinationHospitalId: fixture.hospitalB,
      purpose: `EXC003-TEST-${randomUUID()}`,
      ...overrides,
    },
  };
}

test("EXC-003 creates a destination-bound idempotent Session and atomic Audit under runtime grants/RLS", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  const fixture = readFixture();
  const parsedUrl = new URL(connectionString);
  assert.equal(decodeURIComponent(parsedUrl.username), "mediq_runtime");
  assert.equal(parsedUrl.hostname, "postgres");

  const pool = new Pool({ connectionString, max: 1 });
  const contextService = new ActorTenantContextService(
    {
      oidcAuthentication: {
        issuer,
        audience: "mediq-api-test",
        jwksUri: "https://identity.example.test/jwks",
      },
    },
    { connect: () => pool.connect() },
    new ActorRegistryRepository(),
  );
  const creation = new ExchangeSessionCreationService(contextService);

  try {
    console.error("EXC003_STAGE=EXACT_RUNTIME_PRIVILEGES");
    const catalog = await pool.query(`
      SELECT table_name, column_name, privilege_type
        FROM information_schema.column_privileges
       WHERE grantee = current_user AND table_schema = 'public'
       ORDER BY table_name, column_name, privilege_type
    `);
    assert.equal(catalog.rows.length, 236, "EXC003_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
    const sessionInsertColumns = catalog.rows.filter(
      (row) => row.table_name === "exchange_sessions" && row.privilege_type === "INSERT",
    );
    const sessionSelectColumns = catalog.rows.filter(
      (row) => row.table_name === "exchange_sessions" && row.privilege_type === "SELECT",
    );
    const auditInsertColumns = catalog.rows.filter(
      (row) => row.table_name === "audit_events" && row.privilege_type === "INSERT",
    );
    assert.equal(sessionInsertColumns.length, 12);
    assert.equal(sessionSelectColumns.length, 12);
    assert.equal(auditInsertColumns.length, 12);
    assert.equal(catalog.rows.some((row) => row.table_name === "audit_events" && row.privilege_type !== "INSERT"), false);
    console.error("EXC003_STAGE=EXACT_RUNTIME_PRIVILEGES_OK");

    console.error("EXC003_STAGE=CREATE_AND_IDEMPOTENT_REPLAY");
    const key = randomUUID();
    const firstRequest = request(fixture, key, { purpose: "Synthetic EXC-003 create" });
    const first = await creation.create(firstRequest);
    assert.equal(first.replayed, false);
    assert.equal(first.session.state, "REQUESTED");
    assert.equal(first.session.requesterActorId, fixture.actorB.toLowerCase());
    assert.equal(first.session.destinationHospitalId, fixture.hospitalB.toLowerCase());

    const second = await creation.create(firstRequest);
    assert.equal(second.replayed, true);
    assert.equal(second.session.sessionId, first.session.sessionId);

    await assert.rejects(
      creation.create(request(fixture, key, { purpose: "Changed EXC-003 request" })),
      (error) => error?.message === "EXCHANGE_SESSION_IDEMPOTENCY_CONFLICT",
    );
    const readBack = await contextService.run(
      principal(fixture.subjectB),
      fixture.tenantB,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(first.session.sessionId),
    );
    assert.equal(readBack?.purpose, "Synthetic EXC-003 create");
    console.error("EXC003_STAGE=CREATE_AND_IDEMPOTENT_REPLAY_OK");

    console.error("EXC003_STAGE=DESTINATION_HOSPITAL_BOUNDARY");
    await assert.rejects(
      creation.create({
        ...request(fixture, randomUUID()),
        principal: principal(fixture.subjectA),
        tenantCandidate: fixture.tenantA,
      }),
      (error) => error?.message === "EXCHANGE_SESSION_CREATION_DENIED",
    );
    const unrelatedRead = await contextService.run(
      principal(fixture.subjectC),
      fixture.tenantC,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(first.session.sessionId),
    );
    assert.equal(unrelatedRead, null);
    console.error("EXC003_STAGE=DESTINATION_HOSPITAL_BOUNDARY_OK");

    console.error("EXC003_STAGE=AUDIT_ATOMIC_ROLLBACK");
    const rollbackSession = ExchangeSession.create({
      patientRefId: fixture.patientRefId,
      sourceHospitalId: fixture.hospitalA,
      destinationHospitalId: fixture.hospitalB,
      requesterActorId: fixture.actorB,
      purpose: `EXC003-ROLLBACK-${randomUUID()}`,
    });
    await assert.rejects(
      contextService.run(principal(fixture.subjectB), fixture.tenantB, async (context, client) => {
        await new PostgresExchangeSessionRepository(client).create(rollbackSession);
        await new PostgresExchangeSessionAuditRepository(client).recordCreated({
          auditEventId: randomUUID(),
          occurredAt: rollbackSession.createdAt,
          actorId: context.actorId,
          tenantId: fixture.tenantC,
          exchangeSessionId: rollbackSession.sessionId,
          resourceId: rollbackSession.sessionId,
          correlationId: randomUUID(),
          createdAt: rollbackSession.createdAt,
        });
      }),
      (error) => error?.message === "EXCHANGE_SESSION_AUDIT_PERSISTENCE_FAILED",
    );
    const rolledBack = await contextService.run(
      principal(fixture.subjectB),
      fixture.tenantB,
      async (_context, client) =>
        new PostgresExchangeSessionRepository(client).findById(rollbackSession.sessionId),
    );
    assert.equal(rolledBack, null);
    console.error("EXC003_STAGE=AUDIT_ATOMIC_ROLLBACK_OK");

    console.error("EXC003_STAGE=WRITE_PRIVILEGE_DENIAL");
    const noContext = await pool.connect();
    try {
      await assert.rejects(
        noContext.query("UPDATE exchange_sessions SET purpose = purpose"),
        (error) => error?.code === "42501",
      );
      await assert.rejects(
        noContext.query("DELETE FROM audit_events"),
        (error) => error?.code === "42501",
      );
    } finally {
      noContext.release();
    }
    console.error("EXC003_STAGE=WRITE_PRIVILEGE_DENIAL_OK");
    console.error("EXC003_STAGE=COMPLETE");
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "unclassified";
    console.error(`EXC003_FAILURE=${error?.message ?? "unknown"} databaseCode=${code}`);
    throw error;
  } finally {
    await pool.end();
  }
});
