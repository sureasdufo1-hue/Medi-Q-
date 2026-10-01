import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import {
  ActorTenantContextDeniedError,
} from "../../services/api/dist/identity/identity-context.types.js";

const { Pool } = pg;
const tenantA = process.env.MEDIQ_IAM002_TEST_TENANT_A || "02000000-0000-4000-8000-000000000001";
const tenantB = process.env.MEDIQ_IAM002_TEST_TENANT_B || "02000000-0000-4000-8000-000000000002";
const tenantC = process.env.MEDIQ_IAM002_TEST_TENANT_C || "02000000-0000-4000-8000-000000000003";
const hospitalA = process.env.MEDIQ_IAM002_TEST_HOSPITAL_A || "04000000-0000-4000-8000-000000000001";
const configuredIssuer = "https://identity.example.test/issuer";

test("IAM-002 resolves synthetic membership under runtime grants and clears pooled Tenant context", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  const subject = process.env.MEDIQ_IAM002_TEST_SUBJECT;
  const expectedActorId = process.env.MEDIQ_IAM002_TEST_ACTOR_ID;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.ok(subject?.startsWith("synthetic-iam002-"), "synthetic fixture subject is required");
  assert.ok(expectedActorId, "synthetic fixture actor id is required");
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
  const service = new ActorTenantContextService(
    appConfig,
    database,
    new ActorRegistryRepository(),
  );
  const principal = Object.freeze({ issuer: configuredIssuer, subject });

  try {
    console.error("IAM002_STAGE=CATALOG");
    const catalogClient = await pool.connect();
    try {
      const catalog = await catalogClient.query(`
        SELECT table_name, column_name, privilege_type
          FROM information_schema.column_privileges
         WHERE grantee = current_user
           AND table_schema = 'public'
           AND table_name IN ('actors', 'tenants', 'hospitals')
         ORDER BY table_name, column_name, privilege_type
      `);
      const receivedGrants = catalog.rows.map(
        (row) => `${row.table_name}.${row.column_name}:${row.privilege_type}`,
      );
      const expectedGrants = [
        "actors.actor_id:SELECT",
        "actors.actor_type:SELECT",
        "actors.external_subject:SELECT",
        "actors.hospital_id:SELECT",
        "actors.status:SELECT",
        "actors.tenant_id:SELECT",
        "hospitals.hospital_id:SELECT",
        "hospitals.status:SELECT",
        "hospitals.tenant_id:SELECT",
        "tenants.status:SELECT",
        "tenants.tenant_id:SELECT",
      ];
      if (JSON.stringify(receivedGrants) !== JSON.stringify(expectedGrants)) {
        console.error(`IAM002_PRIVILEGE_MISMATCH=${receivedGrants.join(",")}`);
      }
      assert.deepEqual(receivedGrants, expectedGrants, "IAM002_RUNTIME_PRIVILEGE_SET_MISMATCH");
      console.error("IAM002_STAGE=CATALOG_PRIVILEGES_OK");
      const rls = await catalogClient.query(`
        SELECT count(*)::int AS forced_count
          FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relname IN ('actors', 'tenants', 'hospitals')
           AND relrowsecurity
           AND relforcerowsecurity
      `);
      assert.equal(rls.rows[0]?.forced_count, 3, "IAM002_IDENTITY_RLS_MISMATCH");
      console.error("IAM002_STAGE=CATALOG_RLS_OK");
    } finally {
      catalogClient.release();
    }

    console.error("IAM002_STAGE=MEMBERSHIP");
    const resolved = await service.run(principal, tenantA, async (context, client) => {
      assert.equal(context.actorId, expectedActorId);
      assert.equal(context.tenantId, tenantA);
      assert.equal(context.hospitalId, hospitalA);
      assert.equal(Object.isFrozen(context), true);
      const visibleTenants = await client.query("SELECT tenant_id FROM tenants ORDER BY tenant_id");
      assert.deepEqual(visibleTenants.rows.map((row) => row.tenant_id), [tenantA]);
      const visibleActors = await client.query("SELECT actor_id, tenant_id FROM actors ORDER BY actor_id");
      assert.ok(visibleActors.rows.some((row) => row.actor_id === expectedActorId));
      assert.ok(visibleActors.rows.every((row) => row.tenant_id === tenantA));
      return context;
    });
    assert.equal(resolved.subject, subject);

    console.error("IAM002_STAGE=DENIAL");
    let invoked = false;
    await assert.rejects(
      service.run(principal, tenantB, async () => {
        invoked = true;
      }),
      ActorTenantContextDeniedError,
    );
    assert.equal(invoked, false);

    console.error("IAM002_STAGE=POOL_RESET");
    const reusedClient = await pool.connect();
    try {
      const leakedSetting = await reusedClient.query(
        "SELECT current_setting('mediq.tenant_id', true) AS tenant_id",
      );
      assert.ok(
        leakedSetting.rows[0]?.tenant_id === null || leakedSetting.rows[0]?.tenant_id === "",
      );
      const visibleWithoutContext = await reusedClient.query("SELECT tenant_id FROM tenants");
      assert.equal(visibleWithoutContext.rowCount, 0);
    } finally {
      reusedClient.release();
    }

    await assert.rejects(
      service.run(principal, tenantC, async () => {
        throw new Error("must not be invoked");
      }),
      ActorTenantContextDeniedError,
    );
    console.error("IAM002_STAGE=COMPLETE");
  } finally {
    await pool.end();
  }
});
