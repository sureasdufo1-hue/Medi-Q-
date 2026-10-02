import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { ExchangeSession } from "../../services/api/dist/exchange/domain/exchange-session.js";
import { PostgresExchangeSessionRepository } from "../../services/api/dist/exchange/persistence/postgres-exchange-session.repository.js";
import {
  ConsentContextDeniedError,
  ConsentPersistenceError,
  PostgresConsentRepository,
} from "../../services/api/dist/consent/persistence/postgres-consent.repository.js";

const { Pool } = pg;
const configuredIssuer = "https://identity.example.test/issuer";
const consentColumns = [
  "consent_id", "exchange_session_id", "patient_ref_id", "source_hospital_id",
  "destination_hospital_id", "imaging_package_id", "status", "consent_version",
  "issued_at", "expires_at", "withdrawn_at", "created_at", "updated_at",
];
const consentActionColumns = ["consent_action_id", "consent_id", "action"];

function readFixture() {
  const rawFixture = process.env.MEDIQ_CON002_TEST_FIXTURE;
  assert.ok(rawFixture, "MEDIQ_CON002_TEST_FIXTURE is required");
  const fixture = JSON.parse(rawFixture);
  for (const key of [
    "subjectA", "actorA", "tenantA", "hospitalA",
    "subjectB", "actorB", "tenantB", "hospitalB",
    "subjectC", "actorC", "tenantC", "hospitalC", "patientRefId",
  ]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} is required`);
  }
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

function consentInput(session, actions = ["VIEW", "PACS_IMPORT"]) {
  return {
    exchangeSessionId: session.sessionId,
    patientRefId: session.patientRefId,
    sourceHospitalId: session.sourceHospitalId,
    destinationHospitalId: session.destinationHospitalId,
    imagingPackageId: null,
    actions,
    expiresAt: null,
  };
}

async function createSession(contextService, actor, tenantId, fixture, purpose) {
  return contextService.run(actor, tenantId, async (_context, client) => {
    const session = newSession(fixture, purpose);
    const result = await new PostgresExchangeSessionRepository(client)
      .createIdempotently(session, randomUUID());
    return result.session;
  });
}

test("CON-002 persists synthetic PENDING Consents with atomic session versions under exact runtime grants", async (t) => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  const fixture = readFixture();
  const parsedUrl = new URL(connectionString);
  assert.equal(decodeURIComponent(parsedUrl.username), "mediq_runtime");
  assert.equal(parsedUrl.hostname, "postgres");

  const pool = new Pool({ connectionString, max: 12 });
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
    await t.test("exact temporary runtime privileges and forced RLS", async () => {
      const result = await pool.query(`
        SELECT table_name, column_name, privilege_type
          FROM information_schema.column_privileges
         WHERE grantee = current_user
           AND table_schema = 'public'
           AND table_name IN ('consents', 'consent_actions')
         ORDER BY table_name, privilege_type, column_name
      `);
      const expected = [
        ...consentColumns.flatMap((column) => [
          `INSERT:consents:${column}`,
          `SELECT:consents:${column}`,
        ]),
        ...consentActionColumns.flatMap((column) => [
          `INSERT:consent_actions:${column}`,
          `SELECT:consent_actions:${column}`,
        ]),
        "UPDATE:consents:issued_at",
        "UPDATE:consents:status",
        "UPDATE:consents:updated_at",
        "UPDATE:consents:withdrawn_at",
      ].sort();
      const actual = result.rows
        .map((row) => `${row.privilege_type}:${row.table_name}:${row.column_name}`)
        .sort();
      assert.deepEqual(actual, expected, "CON002_EXACT_CONSENT_PRIVILEGES_MISMATCH");

      const inventory = await pool.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE privilege_type='UPDATE')::int AS updates,
               count(*) FILTER (WHERE privilege_type NOT IN ('SELECT','INSERT','UPDATE'))::int AS other
          FROM information_schema.column_privileges
         WHERE grantee = current_user AND table_schema = 'public'
      `);
      assert.deepEqual(inventory.rows[0], { total: 244, updates: 19, other: 0 });
      const sessionUpdates = await pool.query(`
        SELECT column_name FROM information_schema.column_privileges
         WHERE grantee=current_user AND table_schema='public'
           AND table_name='exchange_sessions' AND privilege_type='UPDATE'
         ORDER BY column_name
      `);
      assert.deepEqual(sessionUpdates.rows.map((row) => row.column_name), ["state", "updated_at"]);
      const consentUpdates = await pool.query(`
        SELECT column_name FROM information_schema.column_privileges
         WHERE grantee=current_user AND table_schema='public'
           AND table_name='consents' AND privilege_type='UPDATE'
         ORDER BY column_name
      `);
      assert.deepEqual(consentUpdates.rows.map((row) => row.column_name), ["issued_at", "status", "updated_at", "withdrawn_at"]);

      const broad = await pool.query(`
        SELECT count(*)::int AS table_privileges
          FROM information_schema.table_privileges
         WHERE grantee = current_user AND table_schema = 'public'
      `);
      assert.equal(broad.rows[0].table_privileges, 0);

      for (const tableName of ["consents", "consent_actions"]) {
        const rls = await pool.query(
          `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1`,
          [tableName],
        );
        assert.equal(rls.rows.length, 1);
        assert.equal(rls.rows[0].relrowsecurity, true);
        assert.equal(rls.rows[0].relforcerowsecurity, true);
      }
    });

    await t.test("PENDING persistence, readback and sequential versions", async () => {
      const session = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 sequential version fixture",
      );
      const first = await contextService.run(actors.a, fixture.tenantA, (_context, client) =>
        new PostgresConsentRepository(client).createPending(consentInput(session)),
      );
      const second = await contextService.run(actors.a, fixture.tenantA, (_context, client) =>
        new PostgresConsentRepository(client).createPending(
          consentInput(session, ["DOWNLOAD"]),
        ),
      );
      assert.equal(first.consentVersion, 1);
      assert.equal(second.consentVersion, 2);
      for (const consent of [first, second]) {
        assert.equal(consent.status, "PENDING");
        assert.equal(consent.issuedAt, null);
        assert.equal(consent.withdrawnAt, null);
        assert.equal(consent.patientRefId, session.patientRefId);
      }
      const saved = await contextService.run(actors.a, fixture.tenantA, (_context, client) =>
        new PostgresConsentRepository(client).findById(first.consentId),
      );
      assert.equal(saved?.consentId, first.consentId);
      assert.equal(saved?.consentVersion, 1);
      assert.deepEqual(saved?.actions, ["PACS_IMPORT", "VIEW"]);

      const otherSession = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 independent version fixture",
      );
      const independent = await contextService.run(actors.a, fixture.tenantA, (_context, client) =>
        new PostgresConsentRepository(client).createPending(
          consentInput(otherSession, ["VIEW"]),
        ),
      );
      assert.equal(independent.consentVersion, 1);
    });

    await t.test("concurrent same-Session creates allocate distinct contiguous versions", async () => {
      const session = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 concurrent version fixture",
      );
      const created = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          contextService.run(actors.a, fixture.tenantA, (_context, client) =>
            new PostgresConsentRepository(client).createPending(
              consentInput(session, index % 2 === 0 ? ["VIEW"] : ["DOWNLOAD"]),
            ),
          ),
        ),
      );
      const versions = created
        .map((consent) => consent.consentVersion)
        .sort((left, right) => left - right);
      assert.deepEqual(versions, Array.from({ length: 12 }, (_, index) => index + 1));
      assert.equal(new Set(created.map((consent) => consent.consentId)).size, 12);
    });

    await t.test("Session binding, missing RLS context and unsupported action fail closed", async () => {
      const session = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 denial fixture",
      );
      await assert.rejects(
        contextService.run(actors.a, fixture.tenantA, (_context, client) =>
          new PostgresConsentRepository(client).createPending({
            ...consentInput(session, ["VIEW"]),
            patientRefId: randomUUID(),
          }),
        ),
        ConsentContextDeniedError,
      );
      await assert.rejects(
        contextService.run(actors.a, fixture.tenantA, (_context, client) =>
          new PostgresConsentRepository(client).createPending(
            consentInput(session, ["MOBILE_EXPORT"]),
          ),
        ),
      );

      const noContextClient = await pool.connect();
      try {
        await assert.rejects(
          new PostgresConsentRepository(noContextClient).createPending(
            consentInput(session),
          ),
          ConsentPersistenceError,
        );
      } finally {
        noContextClient.release();
      }
    });

    await t.test("PostgreSQL action uniqueness failure rolls back the parent Consent", async () => {
      const session = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 rollback fixture",
      );
      let attemptedConsentId;
      let actionWrite = 0;
      await assert.rejects(
        contextService.run(actors.a, fixture.tenantA, (_context, client) => {
          const injectingClient = {
            query(statement, values) {
              if (statement.includes("INSERT INTO consents")) attemptedConsentId = values[0];
              if (statement.includes("INSERT INTO consent_actions")) {
                actionWrite += 1;
                if (actionWrite === 2) {
                  return client.query(statement, [values[0], values[1], "PACS_IMPORT"]);
                }
              }
              return client.query(statement, values);
            },
          };
          return new PostgresConsentRepository(injectingClient).createPending(
            consentInput(session, ["PACS_IMPORT", "VIEW"]),
          );
        }),
        ConsentPersistenceError,
      );
      assert.ok(attemptedConsentId);
      const afterRollback = await contextService.run(
        actors.a,
        fixture.tenantA,
        (_context, client) =>
          new PostgresConsentRepository(client).findById(attemptedConsentId),
      );
      assert.equal(afterRollback, null);
    });

    await t.test("RLS hides Consent from unrelated/no-context tenants; participant visibility is not Authorization", async () => {
      const session = await createSession(
        contextService, actors.a, fixture.tenantA, fixture,
        "Synthetic CON-002 tenant visibility fixture",
      );
      const consent = await contextService.run(actors.a, fixture.tenantA, (_context, client) =>
        new PostgresConsentRepository(client).createPending(
          consentInput(session, ["VIEW"]),
        ),
      );
      const participantRead = await contextService.run(
        actors.b,
        fixture.tenantB,
        (_context, client) =>
          new PostgresConsentRepository(client).findById(consent.consentId),
      );
      assert.equal(participantRead?.consentId, consent.consentId);
      const unrelatedRead = await contextService.run(
        actors.c,
        fixture.tenantC,
        (_context, client) =>
          new PostgresConsentRepository(client).findById(consent.consentId),
      );
      assert.equal(unrelatedRead, null);
      const noContextClient = await pool.connect();
      try {
        const hidden = await new PostgresConsentRepository(noContextClient)
          .findById(consent.consentId);
        assert.equal(hidden, null);
      } finally {
        noContextClient.release();
      }
    });
  } finally {
    await pool.end();
  }
});
