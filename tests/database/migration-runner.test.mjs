import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMigrations,
  parseMigrationConnection,
  splitMigrationStatements,
  validateMigrationJournal,
  verifyLedger,
} from "../../scripts/run-database-migrations.mjs";

const validEnvironment = {
  MEDIQ_RUNTIME_PROFILE: "container",
  MEDIQ_ENV: "development",
  MEDIQ_POSTGRES_DB: "mediq",
  MEDIQ_MIGRATION_DATABASE_URL:
    "postgresql://mediq_migrator:local%40secret@postgres:5432/mediq",
};

test("accepts only the local isolated migration database endpoint", () => {
  assert.match(
    parseMigrationConnection(validEnvironment),
    /^postgresql:\/\/mediq_migrator:/,
  );
});

test("rejects profile, environment, identity, host, database, and URL options outside the approved boundary", () => {
  const invalidEnvironments = [
    { ...validEnvironment, MEDIQ_RUNTIME_PROFILE: "host" },
    { ...validEnvironment, MEDIQ_ENV: "production" },
    {
      ...validEnvironment,
      MEDIQ_MIGRATION_DATABASE_URL: "postgresql://postgres:x@postgres:5432/mediq",
    },
    {
      ...validEnvironment,
      MEDIQ_MIGRATION_DATABASE_URL: "postgresql://mediq_migrator:x@remote:5432/mediq",
    },
    {
      ...validEnvironment,
      MEDIQ_MIGRATION_DATABASE_URL: "postgresql://mediq_migrator:x@postgres:5432/other",
    },
    {
      ...validEnvironment,
      MEDIQ_MIGRATION_DATABASE_URL: "postgresql://mediq_migrator:x@postgres:5432/mediq?sslmode=disable",
    },
  ];
  for (const environment of invalidEnvironments) {
    assert.throws(
      () => parseMigrationConnection(environment),
      { message: "MEDIQ_MIGRATION_CONFIG_INVALID" },
    );
  }
});

test("validates journal order, timestamps, tags, and matching SQL files", () => {
  const journal = {
    version: "7",
    dialect: "postgresql",
    entries: [
      { idx: 0, tag: "0000_framework-baseline", when: 1790691952668, breakpoints: true },
    ],
  };
  assert.deepEqual(
    validateMigrationJournal(journal, new Set(["0000_framework-baseline.sql"])),
    journal.entries,
  );
  assert.throws(
    () => validateMigrationJournal(journal, new Set()),
    { message: "MEDIQ_MIGRATION_JOURNAL_INVALID" },
  );
  assert.throws(
    () =>
      validateMigrationJournal(
        { ...journal, entries: [{ ...journal.entries[0], idx: 1 }] },
        new Set(["0000_framework-baseline.sql"]),
      ),
    { message: "MEDIQ_MIGRATION_JOURNAL_INVALID" },
  );
  assert.throws(
    () => validateMigrationJournal({ ...journal, entries: [] }, new Set()),
    { message: "MEDIQ_MIGRATION_JOURNAL_INVALID" },
  );
});

test("splits generated SQL only at Drizzle statement breakpoints", () => {
  assert.deepEqual(
    splitMigrationStatements("SELECT 1;\n--> statement-breakpoint\nSELECT 2;"),
    ["SELECT 1;", "SELECT 2;"],
  );
});

test("rolls back a failed migration and does not write its ledger row", async () => {
  const calls = [];
  const client = {
    async query(statement) {
      calls.push(statement);
      if (statement === "SELECT FAIL;") {
        throw new Error("synthetic migration failure");
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    applyMigrations(
      client,
      [
        {
          tag: "0000_framework-baseline",
          createdAt: 1790691952668,
          hash: "synthetic-hash",
          statements: ["SELECT 1;", "SELECT FAIL;"],
        },
      ],
      0,
    ),
    /synthetic migration failure/,
  );
  assert.ok(calls.includes("BEGIN"));
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.some((statement) => statement === "COMMIT"), false);
  assert.equal(
    calls.some((statement) => String(statement).startsWith("INSERT INTO")),
    false,
  );
});

test("requires applied ledger history to be the matching ordered migration prefix", async () => {
  const migrations = [
    { tag: "0000_framework-baseline", createdAt: 1000, hash: "hash-a" },
    { tag: "0001_next-schema", createdAt: 2000, hash: "hash-b" },
  ];
  const matchingClient = {
    async query() {
      return {
        rows: [
          { created_at: "1000", hash: "hash-a" },
          { created_at: "2000", hash: "hash-b" },
        ],
      };
    },
  };
  assert.equal(await verifyLedger(matchingClient, migrations), 2);

  const tamperedClient = {
    async query() {
      return { rows: [{ created_at: "1000", hash: "changed" }] };
    },
  };
  await assert.rejects(
    verifyLedger(tamperedClient, migrations),
    { message: "MEDIQ_MIGRATION_HISTORY_MISMATCH" },
  );
});
