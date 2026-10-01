import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import {
  PatientMappingAccessDeniedError,
  PatientMappingAccessService,
} from "../../services/api/dist/patient/application/patient-mapping-access.service.js";
import { PostgresPatientMappingRepository } from "../../services/api/dist/patient/persistence/postgres-patient-mapping.repository.js";

const { Pool } = pg;
const issuer = "https://identity.example.test/issuer";

test("PAT-002 reads synthetic mappings only for the verified Hospital under exact SELECT grants", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  const fixtureText = process.env.MEDIQ_PAT002_TEST_FIXTURE;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  assert.ok(fixtureText, "MEDIQ_PAT002_TEST_FIXTURE is required");
  const fixture = JSON.parse(fixtureText);
  for (const key of [
    "subjectUserA", "subjectUserB", "subjectUserC", "subjectServiceA",
    "subjectTenantLevel", "tenantA", "tenantB", "tenantC", "hospitalA",
    "hospitalAOther", "hospitalB", "hospitalC", "mappingA", "mappingAOther",
    "mappingB", "mappingC",
  ]) assert.ok(fixture[key], `PAT002 fixture is missing ${key}`);

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

  let mappingQueryCount = 0;
  const repositoryFactory = (client) => {
    const trackedClient = {
      query(text, values) {
        if (/\b(?:FROM|INTO|UPDATE|TABLE)\s+patient_mappings\b/i.test(text)) {
          mappingQueryCount += 1;
        }
        return client.query(text, values);
      },
      release(error) {
        return client.release(error);
      },
    };
    return new PostgresPatientMappingRepository(trackedClient);
  };
  const access = new PatientMappingAccessService(
    contextService,
    repositoryFactory,
  );

  const principal = (subject) => Object.freeze({ issuer, subject });
  const read = (subject, tenantId, hospitalId, mappingId) =>
    access.findById(principal(subject), tenantId, hospitalId, mappingId);

  try {
    console.error("PAT002_STAGE=CATALOG");
    const catalogClient = await pool.connect();
    try {
      const grants = await catalogClient.query(`
        SELECT column_name, privilege_type
          FROM information_schema.column_privileges
         WHERE grantee = current_user
           AND table_schema = 'public'
           AND table_name = 'patient_mappings'
         ORDER BY column_name, privilege_type
      `);
      assert.deepEqual(
        grants.rows.map((row) => `${row.column_name}:${row.privilege_type}`),
        [
          "created_at:SELECT", "hospital_id:SELECT", "local_patient_id:SELECT",
          "mapping_id:SELECT", "patient_ref_id:SELECT", "status:SELECT",
          "updated_at:SELECT", "validated_at:SELECT",
        ],
        "PAT002_MAPPING_GRANT_SET_MISMATCH",
      );
      const mappingRls = await catalogClient.query(`
        SELECT relrowsecurity AND relforcerowsecurity AS forced
          FROM pg_class
         WHERE oid = 'public.patient_mappings'::regclass
      `);
      assert.equal(mappingRls.rows[0]?.forced, true, "PAT002_MAPPING_RLS_NOT_FORCED");
    } finally {
      catalogClient.release();
    }

    console.error("PAT002_STAGE=HOSPITAL_A_B_ALLOW");
    const source = await read(
      fixture.subjectUserA, fixture.tenantA, fixture.hospitalA, fixture.mappingA,
    );
    assert.equal(source?.mappingId, fixture.mappingA);
    assert.equal(source?.hospitalId, fixture.hospitalA);
    assert.equal(source?.localPatientId, "TEST-A-001");
    const destination = await read(
      fixture.subjectUserB, fixture.tenantB, fixture.hospitalB, fixture.mappingB,
    );
    assert.equal(destination?.mappingId, fixture.mappingB);
    assert.equal(destination?.localPatientId, "TEST-B-001");

    console.error("PAT002_STAGE=WRONG_HOSPITAL_DENIAL");
    const beforeWrongHospital = mappingQueryCount;
    await assert.rejects(
      read(
        fixture.subjectUserA,
        fixture.tenantA,
        fixture.hospitalAOther,
        fixture.mappingAOther,
      ),
      PatientMappingAccessDeniedError,
    );
    await assert.rejects(
      read(fixture.subjectUserA, fixture.tenantA, fixture.hospitalB, fixture.mappingB),
      PatientMappingAccessDeniedError,
    );
    assert.equal(mappingQueryCount, beforeWrongHospital, "wrong Hospital must be denied before mapping SQL");

    console.error("PAT002_STAGE=ACTOR_AND_TENANT_DENIAL");
    const beforeUntrusted = mappingQueryCount;
    await assert.rejects(
      read(fixture.subjectServiceA, fixture.tenantA, fixture.hospitalA, fixture.mappingA),
      PatientMappingAccessDeniedError,
    );
    await assert.rejects(
      read(fixture.subjectTenantLevel, fixture.tenantA, fixture.hospitalA, fixture.mappingA),
      PatientMappingAccessDeniedError,
    );
    await assert.rejects(
      read(fixture.subjectUserA, fixture.tenantB, fixture.hospitalA, fixture.mappingA),
      PatientMappingAccessDeniedError,
    );
    await assert.rejects(
      access.findById(null, fixture.tenantA, fixture.hospitalA, fixture.mappingA),
      PatientMappingAccessDeniedError,
    );
    assert.equal(mappingQueryCount, beforeUntrusted, "unverified Actor/Hospital must not query mapping data");

    console.error("PAT002_STAGE=TENANT_C_RLS");
    const invisibleFromC = await contextService.run(
      principal(fixture.subjectUserC),
      fixture.tenantC,
      async (_identity, client) => {
        const result = await client.query(
          "SELECT mapping_id FROM patient_mappings WHERE mapping_id = $1",
          [fixture.mappingA],
        );
        return result.rowCount;
      },
    );
    assert.equal(invisibleFromC, 0, "Tenant C must not see the Tenant A mapping through forced RLS");
    const cResult = await read(
      fixture.subjectUserC, fixture.tenantC, fixture.hospitalC, fixture.mappingA,
    );
    assert.equal(cResult, null, "Tenant C mapping query must not disclose the A mapping");

    console.error("PAT002_STAGE=WRITE_DENIAL");
    await contextService.run(
      principal(fixture.subjectUserA),
      fixture.tenantA,
      async (_identity, client) => {
        const denied = async (statement, values = []) => {
          await client.query("SAVEPOINT pat002_write_probe");
          try {
            await assert.rejects(
              client.query(statement, values),
              (error) => error?.code === "42501",
            );
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT pat002_write_probe");
            await client.query("RELEASE SAVEPOINT pat002_write_probe");
          }
        };
        await denied(
          `INSERT INTO patient_mappings
             (mapping_id, patient_ref_id, hospital_id, local_patient_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'UNVERIFIED', now(), now())`,
          [fixture.mappingWriteProbe, fixture.patientRefId, fixture.hospitalA, "TEST-A-WRITE-PROBE"],
        );
        await denied("UPDATE patient_mappings SET status = 'REVOKED' WHERE mapping_id = $1", [fixture.mappingA]);
        await denied("DELETE FROM patient_mappings WHERE mapping_id = $1", [fixture.mappingA]);
        await denied("TRUNCATE TABLE patient_mappings");
      },
    );

    console.error("PAT002_STAGE=POOL_RESET");
    const reusedClient = await pool.connect();
    try {
      const reset = await reusedClient.query(
        "SELECT current_setting('mediq.tenant_id', true) AS tenant_id",
      );
      assert.ok(reset.rows[0]?.tenant_id === null || reset.rows[0]?.tenant_id === "");
      const withoutContext = await reusedClient.query(
        "SELECT count(*)::int AS visible_count FROM patient_mappings",
      );
      assert.equal(withoutContext.rows[0]?.visible_count, 0);
    } finally {
      reusedClient.release();
    }

    console.error("PAT002_STAGE=COMPLETE");
  } finally {
    await pool.end();
  }
});
