import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { TransferGrant } from "../../services/api/dist/grant/domain/transfer-grant.js";
import {
  PostgresTransferGrantRepository,
  TransferGrantPersistenceError,
} from "../../services/api/dist/grant/persistence/postgres-transfer-grant.repository.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";

const { Pool } = pg;
const issuer = "https://identity.example.test/issuer";

function fixtureFromEnvironment() {
  const raw = process.env.MEDIQ_GRT002_TEST_FIXTURE;
  assert.ok(raw, "MEDIQ_GRT002_TEST_FIXTURE is required");
  const fixture = JSON.parse(raw);
  for (const key of [
    "subjectA", "actorA", "tenantA", "hospitalA",
    "subjectB", "actorB", "tenantB", "hospitalB",
    "subjectC", "actorC", "tenantC", "hospitalC",
    "sessionId", "consentId", "grantId", "revokedGrantId", "expiredGrantId", "packageId",
  ]) {
    assert.equal(typeof fixture[key], "string", `synthetic ${key} is required`);
  }
  return fixture;
}

function principal(subject) {
  return Object.freeze({ issuer, subject });
}

test("GRT-002 persists and reconstitutes TransferGrant under exact permanent grants and Tenant RLS", async (t) => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.equal(decodeURIComponent(new URL(connectionString).username), "mediq_runtime");
  assert.equal(new URL(connectionString).hostname, "postgres");
  const fixture = fixtureFromEnvironment();
  const pool = new Pool({ connectionString, max: 8 });
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
  const actors = {
    a: principal(fixture.subjectA),
    b: principal(fixture.subjectB),
    c: principal(fixture.subjectC),
  };

  try {
    await t.test("current exact Grant privileges and forced Grant RLS", async () => {
      const privileges = await pool.query(`
        SELECT table_name, column_name, privilege_type
          FROM information_schema.column_privileges
         WHERE grantee = current_user AND table_schema = 'public'
         ORDER BY table_name, column_name, privilege_type
      `);
      const byTable = (table, kind) => privileges.rows
        .filter((row) => row.table_name === table && row.privilege_type === kind)
        .map((row) => row.column_name).sort();
      assert.equal(privileges.rows.length, 244, "GRT002_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
      assert.deepEqual(byTable("transfer_grants", "INSERT"), [
        "consent_id", "created_at", "exchange_session_id", "expires_at", "grant_id",
        "idempotency_key", "imaging_package_id", "issued_at", "recipient_actor_id",
        "recipient_hospital_id", "recipient_tenant_id", "revoked_at", "status",
      ]);
      assert.deepEqual(byTable("transfer_grants", "SELECT"), [
        "consent_id", "created_at", "exchange_session_id", "expires_at", "grant_id",
        "idempotency_key", "imaging_package_id", "issued_at", "recipient_actor_id",
        "recipient_hospital_id", "recipient_tenant_id", "revoked_at", "status",
      ]);
      assert.deepEqual(byTable("transfer_grant_scopes", "INSERT"), [
        "grant_id", "grant_scope_id", "scope",
      ]);
      assert.deepEqual(byTable("transfer_grant_scopes", "SELECT"), ["grant_id", "scope"]);
      assert.deepEqual(
        privileges.rows.filter((row) => row.privilege_type === "INSERT" &&
          !["patient_refs", "exchange_sessions", "consents", "consent_actions", "audit_events", "transfer_grants", "transfer_grant_scopes", "pacs_transfer_operations", "provenance_records", "integrity_evidence"].includes(row.table_name)),
        [],
      );
      const broad = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM information_schema.table_privileges
            WHERE grantee IN ('PUBLIC', current_user) AND table_schema='public') AS table_grants,
          (SELECT count(*)::int FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
              AND a.grantee IN (0, current_user::regrole)) AS default_grants
      `);
      assert.deepEqual(broad.rows[0], { table_grants: 0, default_grants: 0 });
      for (const table of ["transfer_grants", "transfer_grant_scopes"]) {
        const rls = await pool.query(
          "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1",
          [table],
        );
        assert.deepEqual(rls.rows, [{ relrowsecurity: true, relforcerowsecurity: true }]);
      }
    });

    let createdGrant;
    await t.test("ACTIVE Grant and exact P0 scopes persist and reconstitute", async () => {
      createdGrant = TransferGrant.issue({
        exchangeSessionId: fixture.sessionId,
        consentId: fixture.consentId,
        recipientTenantId: fixture.tenantB,
        recipientHospitalId: fixture.hospitalB,
        recipientActorId: fixture.actorB,
        imagingPackageId: fixture.packageId,
        scopes: ["study:view", "study:pacs-transfer"],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await contextService.run(actors.b, fixture.tenantB, (_context, client) =>
        new PostgresTransferGrantRepository(client).insert(createdGrant),
      );
      const restored = await contextService.run(actors.b, fixture.tenantB, (_context, client) =>
        new PostgresTransferGrantRepository(client).findById(createdGrant.grantId),
      );
      assert.ok(restored);
      assert.equal(restored.grantId, createdGrant.grantId);
      assert.equal(restored.status, "ACTIVE");
      assert.equal(restored.consentId, fixture.consentId);
      assert.equal(restored.recipientTenantId, fixture.tenantB);
      assert.equal(restored.recipientHospitalId, fixture.hospitalB);
      assert.equal(restored.recipientActorId, fixture.actorB);
      assert.equal(restored.imagingPackageId, fixture.packageId);
      assert.deepEqual([...restored.scopes].sort(), [...createdGrant.scopes].sort());
      assert.equal(restored.issuedAt.getTime(), createdGrant.issuedAt.getTime());
      assert.equal(restored.expiresAt.getTime(), createdGrant.expiresAt.getTime());
      assert.equal(restored.createdAt.getTime(), createdGrant.createdAt.getTime());
    });

    await t.test("persisted active and revoked rows reconstitute; elapsed time is not authorization", async () => {
      const repositoryRead = (grantId, actor, tenantId) => contextService.run(
        actor,
        tenantId,
        (_context, client) => new PostgresTransferGrantRepository(client).findById(grantId),
      );
      const active = await repositoryRead(fixture.grantId, actors.b, fixture.tenantB);
      const revoked = await repositoryRead(fixture.revokedGrantId, actors.b, fixture.tenantB);
      const expired = await repositoryRead(fixture.expiredGrantId, actors.b, fixture.tenantB);
      assert.equal(active?.status, "ACTIVE");
      assert.equal(revoked?.status, "REVOKED");
      assert.equal(expired?.status, "ACTIVE");
      assert.equal(expired?.isTemporallyActiveAt(new Date()), false);
    });

    await t.test("participant Tenant visibility is distinct from unrelated/no-context access", async () => {
      assert.ok(createdGrant);
      const read = (actor, tenantId) => contextService.run(
        actor,
        tenantId,
        (_context, client) => new PostgresTransferGrantRepository(client).findById(createdGrant.grantId),
      );
      assert.equal((await read(actors.a, fixture.tenantA))?.grantId, createdGrant.grantId);
      assert.equal((await read(actors.b, fixture.tenantB))?.grantId, createdGrant.grantId);
      assert.equal(await read(actors.c, fixture.tenantC), null);
      const client = await pool.connect();
      try {
        assert.equal(await new PostgresTransferGrantRepository(client).findById(createdGrant.grantId), null);
      } finally {
        client.release();
      }
    });

    await t.test("scope insert failure rolls back the parent and earlier scope row", async () => {
      const candidate = TransferGrant.issue({
        exchangeSessionId: fixture.sessionId,
        consentId: fixture.consentId,
        recipientTenantId: fixture.tenantB,
        recipientHospitalId: fixture.hospitalB,
        recipientActorId: fixture.actorB,
        imagingPackageId: fixture.packageId,
        scopes: ["study:view", "study:pacs-transfer"],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      let scopeInsertCount = 0;
      await assert.rejects(
        contextService.run(actors.b, fixture.tenantB, (_context, client) => {
          const failingClient = {
            query(statement, values) {
              if (statement.includes("INSERT INTO transfer_grant_scopes")) {
                scopeInsertCount += 1;
                if (scopeInsertCount === 2) {
                  return client.query(statement, [values[0], values[1], "study:view"]);
                }
              }
              return client.query(statement, values);
            },
          };
          return new PostgresTransferGrantRepository(failingClient).insert(candidate);
        }),
        TransferGrantPersistenceError,
      );
      assert.equal(scopeInsertCount, 2);
      const absent = await contextService.run(actors.b, fixture.tenantB, (_context, client) =>
        new PostgresTransferGrantRepository(client).findById(candidate.grantId),
      );
      assert.equal(absent, null);
    });

    await t.test("missing Tenant context cannot persist a Grant", async () => {
      const candidate = TransferGrant.issue({
        exchangeSessionId: fixture.sessionId,
        consentId: fixture.consentId,
        recipientTenantId: fixture.tenantB,
        recipientHospitalId: fixture.hospitalB,
        recipientActorId: fixture.actorB,
        imagingPackageId: fixture.packageId,
        scopes: ["study:view"],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assert.rejects(
          new PostgresTransferGrantRepository(client).insert(candidate),
          TransferGrantPersistenceError,
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      const hidden = await contextService.run(actors.b, fixture.tenantB, (_context, scopedClient) =>
        new PostgresTransferGrantRepository(scopedClient).findById(candidate.grantId),
      );
      assert.equal(hidden, null);
    });
  } finally {
    await pool.end();
  }
});
