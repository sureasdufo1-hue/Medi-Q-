import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import {
  PatientReference,
} from "../../services/api/dist/patient/domain/patient-reference.js";
import {
  PatientReferenceConflictError,
  PatientReferencePersistenceError,
  PostgresPatientReferenceRepository,
} from "../../services/api/dist/patient/persistence/postgres-patient-reference.repository.js";

const { Pool } = pg;

test("PAT-001 repository persists only synthetic references as runtime and rolls back", async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "MEDIQ_TEST_DATABASE_URL is required");
  const parsedUrl = new URL(connectionString);
  assert.equal(decodeURIComponent(parsedUrl.username), "mediq_runtime");
  assert.equal(parsedUrl.hostname, "postgres");

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let lastDatabaseErrorCode;
  const repository = new PostgresPatientReferenceRepository({
    query: async (queryText, values) => {
      try {
        return await client.query(queryText, values);
      } catch (error) {
        lastDatabaseErrorCode =
          typeof error === "object" && error !== null && "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined;
        throw error;
      }
    },
  });
  const persist = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PatientReferencePersistenceError) {
        throw new Error(
          `${error.message}; databaseCode=${lastDatabaseErrorCode ?? "unknown"}`,
        );
      }
      throw error;
    }
  };

  const code = `MQ-TEST-INT-${randomUUID().toUpperCase()}`;
  const reference = PatientReference.create({ patientRefCode: code });
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const created = await persist(() => repository.create(reference));
    assert.equal(created.patientRefId, reference.patientRefId);
    assert.equal(created.patientRefCode, code);
    assert.equal(created.status, "ACTIVE");

    const byId = await persist(() => repository.findById(reference.patientRefId));
    const byCode = await persist(() => repository.findByCode(code));
    assert.equal(byId?.patientRefCode, code);
    assert.equal(byCode?.patientRefId, reference.patientRefId);

    await assert.rejects(
      repository.create(reference),
      PatientReferenceConflictError,
    );

    await client.query("ROLLBACK");
    transactionOpen = false;
    assert.equal(await persist(() => repository.findByCode(code)), null);
  } finally {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    client.release();
    await pool.end();
  }
});
