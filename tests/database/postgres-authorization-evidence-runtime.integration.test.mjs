import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { expectedRuntimePrivileges } from '../fixtures/runtime-privilege-contract.mjs';
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { AuthorizationGatedOperationExecutor, AuthorizationDeniedError } from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";

const { Pool } = pg;
const issuer = "https://identity.example.test/issuer";
const otherId = "7f000000-0000-4000-8000-000000000001";


function createContext(identity, fixture, overrides = {}) {
  return AuthorizationContext.create({
    identity,
    exchangeSessionId: overrides.sessionId ?? fixture.sessionId,
    resource: {
      kind: overrides.resourceKind ?? "STUDY",
      id: overrides.studyRefId ?? fixture.studyRefId,
    },
    action: overrides.action ?? "VIEW",
    consentId: overrides.consentId ?? fixture.consentId,
    grantId: overrides.grantId ?? fixture.grantId,
  });
}

test("AUT-005 resolves exact Study evidence under runtime grants, verified Tenant RLS and same-client authorization", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  const fixtureText = process.env.MEDIQ_AUT005_TEST_FIXTURE;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.ok(fixtureText, "MEDIQ_AUT005_TEST_FIXTURE is required");
  const fixture = JSON.parse(fixtureText);
  assert.ok(fixture.subjectA.startsWith("synthetic-iam002-"));
  assert.ok(fixture.subjectB.startsWith("synthetic-aut005-b-"));
  assert.ok(fixture.subjectC.startsWith("synthetic-aut005-c-"));

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
  const actualReader = new PostgresAuthorizationEvidenceReader();
  let evidenceQueryCount = 0;
  let lastEvidenceClient = null;
  let lastFacts = undefined;
  const observedReader = {
    async resolve(context, client) {
      lastEvidenceClient = client;
      const trackedClient = {
        query(...args) {
          evidenceQueryCount += 1;
          return client.query(...args);
        },
      };
      lastFacts = await actualReader.resolve(context, trackedClient);
      return lastFacts;
    },
  };
  const policy = new ResolvedObjectAuthorizationPolicy(observedReader);
  const executor = new AuthorizationGatedOperationExecutor(
    contextService,
    new AuthorizationEngine(policy),
  );
  let protectedCallbacks = 0;

  async function executeAllowed({
    tenantId = fixture.tenantB,
    subject = fixture.subjectB,
    overrides = {},
  } = {}) {
    const principal = Object.freeze({ issuer, subject });
    return executor.execute(
      principal,
      tenantId,
      (identity) => createContext(identity, fixture, overrides),
      async (_context, client) => {
        protectedCallbacks += 1;
        assert.equal(client, lastEvidenceClient, "evidence read and protected callback must share the checked-out client");
        return "synthetic-allowed";
      },
    );
  }

  async function executeDenied(options = {}) {
    const callbacksBefore = protectedCallbacks;
    await assert.rejects(executeAllowed(options), AuthorizationDeniedError);
    assert.equal(protectedCallbacks, callbacksBefore, "DENY must precede the protected callback");
  }

  try {
    console.error("AUT005_STAGE=CATALOG");
    const catalogClient = await pool.connect();
    try {
      const privileges = await catalogClient.query(`
        SELECT table_name, column_name, privilege_type
          FROM information_schema.column_privileges
         WHERE grantee = current_user AND table_schema = 'public'
         ORDER BY table_name, column_name, privilege_type
      `);
      const actual = privileges.rows.map(
        (row) => `${row.table_name}.${row.column_name}:${row.privilege_type}`,
      ).sort();
      const expected = expectedRuntimePrivileges();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        console.error(`AUT005_PRIVILEGE_MISMATCH=${actual.join(",")}`);
      }
      assert.deepEqual(actual, expected, "AUT005_RUNTIME_PRIVILEGE_SET_MISMATCH");
      console.error("AUT005_STAGE=CATALOG_PRIVILEGES_OK");
      assert.equal(actual.length, 258, "AUT005_RUNTIME_PRIVILEGE_COUNT_MISMATCH");
      const broad = await catalogClient.query(`
        SELECT
          (SELECT count(*) FROM information_schema.table_privileges
            WHERE grantee IN ('PUBLIC', current_user) AND table_schema='public') AS table_grants,
          (SELECT count(*) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
              AND a.grantee IN (0, current_user::regrole)) AS default_grants,
          (SELECT count(*) FROM pg_class
            WHERE relnamespace='public'::regnamespace
              AND relname IN ('exchange_sessions','consents','consent_actions','transfer_grants',
                'transfer_grant_scopes','imaging_packages','study_references')
              AND relrowsecurity AND relforcerowsecurity) AS forced_evidence_rls
      `);
      assert.equal(Number(broad.rows[0].table_grants), 0, "AUT005_TABLE_WIDE_GRANT_PRESENT");
      assert.equal(Number(broad.rows[0].default_grants), 0, "AUT005_DEFAULT_GRANT_PRESENT");
      assert.equal(Number(broad.rows[0].forced_evidence_rls), 7, "AUT005_EVIDENCE_RLS_NOT_FORCED");
      console.error("AUT005_STAGE=CATALOG_RLS_OK");
    } finally {
      catalogClient.release();
    }

    console.error("AUT005_STAGE=PRIMARY_ALLOW");
    for (const action of ["VIEW", "DOWNLOAD", "PACS_IMPORT"]) {
      assert.equal(await executeAllowed({ overrides: { action } }), "synthetic-allowed");
      assert.ok(lastFacts, "the complete evidence query should resolve a row");
    }
    assert.equal(protectedCallbacks, 3);

    console.error("AUT005_STAGE=BINDING_AND_LIFECYCLE_DENIAL");
    await executeDenied({ overrides: { sessionId: otherId } });
    await executeDenied({ overrides: { grantId: otherId } });
    await executeDenied({ overrides: { studyRefId: otherId } });
    await executeDenied({ overrides: { grantId: fixture.revokedGrantId } });
    await executeDenied({ overrides: { grantId: fixture.expiredGrantId } });

    console.error("AUT005_STAGE=CON008_MISSING_CONSENT_DENIAL");
    for (const action of ["VIEW", "DOWNLOAD", "PACS_IMPORT"]) {
      await executeDenied({ overrides: { consentId: otherId, action } });
      assert.equal(lastFacts, null, "missing persisted Consent must resolve to no evidence");
    }

    console.error("AUT005_STAGE=CON008_WITHDRAWN_CONSENT_DENIAL");
    for (const action of ["VIEW", "DOWNLOAD", "PACS_IMPORT"]) {
      await executeDenied({
        overrides: {
          consentId: fixture.withdrawnConsentId,
          grantId: fixture.withdrawnConsentGrantId,
          action,
        },
      });
      assert.equal(lastFacts?.consent.status, "WITHDRAWN");
      assert.equal(lastFacts?.transferGrant.status, "ACTIVE");
    }

    console.error("AUT005_STAGE=UNSUPPORTED_RESOURCE_DENIAL");
    const queriesBeforeUnsupported = evidenceQueryCount;
    await executeDenied({ overrides: { resourceKind: "SERIES" } });
    await executeDenied({ overrides: { resourceKind: "INSTANCE" } });
    assert.equal(evidenceQueryCount, queriesBeforeUnsupported, "unsupported child resources must be rejected without a query");

    console.error("AUT005_STAGE=TENANT_A_RLS");
    await executeDenied({ tenantId: fixture.tenantA, subject: fixture.subjectA });
    assert.ok(lastFacts, "source Tenant may see bilateral evidence under RLS but must fail recipient Authorization");
    console.error("AUT005_STAGE=TENANT_C_RLS");
    await executeDenied({ tenantId: fixture.tenantC, subject: fixture.subjectC });
    assert.equal(lastFacts, null, "nonparticipant Tenant C must receive no evidence from forced RLS");

    console.error("AUT005_STAGE=POOL_RESET");
    const reusedClient = await pool.connect();
    try {
      const contextState = await reusedClient.query(
        "SELECT current_setting('mediq.tenant_id', true) AS tenant_id",
      );
      assert.ok(contextState.rows[0].tenant_id === null || contextState.rows[0].tenant_id === "");
      const invisibleSession = await reusedClient.query(
        "SELECT session_id FROM exchange_sessions WHERE session_id=$1::uuid",
        [fixture.sessionId],
      );
      assert.equal(invisibleSession.rowCount, 0);
    } finally {
      reusedClient.release();
    }
    console.error("AUT005_STAGE=COMPLETE");
  } finally {
    await pool.end();
  }
});
