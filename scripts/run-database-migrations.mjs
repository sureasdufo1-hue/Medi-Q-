import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const migrationDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../services/api/src/database/migrations",
);
const migrationRole = "mediq_migrator";
const migrationTable = 'public."__drizzle_migrations"';
const advisoryLockNamespace = 1936028273;
const advisoryLockKey = 1;

export function parseMigrationConnection(environment) {
  const rawUrl = environment.MEDIQ_MIGRATION_DATABASE_URL;
  const expectedDatabase = environment.MEDIQ_POSTGRES_DB;
  if (
    environment.MEDIQ_RUNTIME_PROFILE !== "container" ||
    environment.MEDIQ_ENV !== "development" ||
    !rawUrl ||
    !expectedDatabase ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(expectedDatabase)
  ) {
    throw new Error("MEDIQ_MIGRATION_CONFIG_INVALID");
  }

  let connectionUrl;
  try {
    connectionUrl = new URL(rawUrl);
  } catch {
    throw new Error("MEDIQ_MIGRATION_CONFIG_INVALID");
  }

  let username;
  let password;
  let database;
  try {
    username = decodeURIComponent(connectionUrl.username);
    password = decodeURIComponent(connectionUrl.password);
    database = decodeURIComponent(connectionUrl.pathname.slice(1));
  } catch {
    throw new Error("MEDIQ_MIGRATION_CONFIG_INVALID");
  }

  if (
    connectionUrl.protocol !== "postgresql:" ||
    connectionUrl.hostname !== "postgres" ||
    connectionUrl.port !== "5432" ||
    username !== migrationRole ||
    password.length === 0 ||
    database !== expectedDatabase ||
    connectionUrl.search !== "" ||
    connectionUrl.hash !== ""
  ) {
    throw new Error("MEDIQ_MIGRATION_CONFIG_INVALID");
  }

  return connectionUrl.toString();
}

export function validateMigrationJournal(journal, fileNames) {
  if (
    journal?.version !== "7" ||
    journal?.dialect !== "postgresql" ||
    !Array.isArray(journal.entries) ||
    journal.entries.length === 0
  ) {
    throw new Error("MEDIQ_MIGRATION_JOURNAL_INVALID");
  }

  const seenTags = new Set();
  const seenTimestamps = new Set();
  let previousTimestamp = -1;
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry?.idx !== index ||
      typeof entry.tag !== "string" ||
      !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag) ||
      entry.tag.slice(0, 4) !== String(index).padStart(4, "0") ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= previousTimestamp ||
      typeof entry.breakpoints !== "boolean" ||
      seenTags.has(entry.tag) ||
      seenTimestamps.has(entry.when) ||
      !fileNames.has(`${entry.tag}.sql`)
    ) {
      throw new Error("MEDIQ_MIGRATION_JOURNAL_INVALID");
    }
    seenTags.add(entry.tag);
    seenTimestamps.add(entry.when);
    previousTimestamp = entry.when;
  }

  return journal.entries;
}

export function splitMigrationStatements(sqlText) {
  return sqlText
    .split(/^\s*--> statement-breakpoint\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function loadMigrations() {
  const journalText = await readFile(
    path.join(migrationDirectory, "meta", "_journal.json"),
    "utf8",
  );
  const journal = JSON.parse(journalText);
  const files = await readdir(migrationDirectory);
  const entries = validateMigrationJournal(
    journal,
    new Set(files),
  );
  const journalTags = new Set(entries.map((entry) => `${entry.tag}.sql`));
  if (files.some((file) => file.endsWith(".sql") && !journalTags.has(file))) {
    throw new Error("MEDIQ_MIGRATION_JOURNAL_INVALID");
  }

  const migrations = [];
  for (const entry of entries) {
    const sqlText = await readFile(
      path.join(migrationDirectory, `${entry.tag}.sql`),
      "utf8",
    );
    if (sqlText.trim().length === 0) {
      throw new Error("MEDIQ_MIGRATION_FILE_INVALID");
    }
    migrations.push({
      tag: entry.tag,
      createdAt: entry.when,
      hash: createHash("sha256").update(sqlText).digest("hex"),
      statements: splitMigrationStatements(sqlText),
    });
  }
  return migrations;
}

async function verifyDatabaseBoundary(client, expectedDatabase) {
  const result = await client.query(`
    SELECT current_user AS role_name,
           current_database() AS database_name,
           role.rolsuper AS is_superuser,
           role.rolcreatedb AS can_create_database,
           role.rolcreaterole AS can_create_role,
           role.rolbypassrls AS can_bypass_rls,
           has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
           has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_schema,
           has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema
      FROM pg_roles AS role
     WHERE role.rolname = current_user
  `);
  const boundary = result.rows[0];
  if (
    !boundary ||
    boundary.role_name !== migrationRole ||
    boundary.database_name !== expectedDatabase ||
    boundary.is_superuser ||
    boundary.can_create_database ||
    boundary.can_create_role ||
    boundary.can_bypass_rls ||
    !boundary.can_use_schema ||
    !boundary.can_create_in_schema ||
    boundary.can_create_schema
  ) {
    throw new Error("MEDIQ_MIGRATION_ROLE_BOUNDARY_INVALID");
  }
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint NOT NULL UNIQUE
    )
  `);

  const result = await client.query(`
    SELECT owner.rolname AS owner_name,
           column_info.column_name
      FROM pg_class AS table_info
      JOIN pg_namespace AS schema_info ON schema_info.oid = table_info.relnamespace
      JOIN pg_roles AS owner ON owner.oid = table_info.relowner
      LEFT JOIN information_schema.columns AS column_info
        ON column_info.table_schema = schema_info.nspname
       AND column_info.table_name = table_info.relname
     WHERE schema_info.nspname = 'public'
       AND table_info.relname = '__drizzle_migrations'
     ORDER BY column_info.ordinal_position
  `);
  if (
    result.rows.length !== 3 ||
    result.rows.some((row) => row.owner_name !== migrationRole) ||
    result.rows.map((row) => row.column_name).join(",") !== "id,hash,created_at"
  ) {
    throw new Error("MEDIQ_MIGRATION_LEDGER_INVALID");
  }
}

export async function verifyLedger(client, migrations) {
  const result = await client.query(
    `SELECT hash, created_at FROM ${migrationTable} ORDER BY created_at`,
  );
  if (result.rows.length > migrations.length) {
    throw new Error("MEDIQ_MIGRATION_LEDGER_INVALID");
  }

  for (const [index, applied] of result.rows.entries()) {
    const expected = migrations[index];
    if (
      !expected ||
      BigInt(applied.created_at) !== BigInt(expected.createdAt) ||
      applied.hash !== expected.hash
    ) {
      throw new Error("MEDIQ_MIGRATION_HISTORY_MISMATCH");
    }
  }
  return result.rows.length;
}

export async function applyMigrations(client, migrations, alreadyApplied) {
  for (const migration of migrations.slice(alreadyApplied)) {
    await client.query("BEGIN");
    try {
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO ${migrationTable} (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, migration.createdAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    console.log(`migration_applied=${migration.tag}`);
  }
}

export async function runMigrations(environment = process.env) {
  let phase = "configuration";
  const connectionString = parseMigrationConnection(environment);
  phase = "migration-files";
  const migrations = await loadMigrations();
  const client = new Client({
    connectionString,
    application_name: "mediq-p0-migrator",
    connectionTimeoutMillis: 5000,
  });

  let lockAcquired = false;
  try {
    phase = "database-connect";
    await client.connect();
    phase = "session-limits";
    await client.query("SET statement_timeout = '30s'");
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET idle_in_transaction_session_timeout = '30s'");
    phase = "role-boundary";
    await verifyDatabaseBoundary(client, environment.MEDIQ_POSTGRES_DB);
    phase = "migration-lock";
    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired",
      [advisoryLockNamespace, advisoryLockKey],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      throw new Error("MEDIQ_MIGRATION_LOCK_BUSY");
    }

    phase = "ledger-init";
    await ensureLedger(client);
    phase = "history-check";
    const alreadyApplied = await verifyLedger(client, migrations);
    phase = "migration-apply";
    await applyMigrations(client, migrations, alreadyApplied);
    return migrations.length;
  } catch (error) {
    if (error && typeof error === "object") {
      error.safePhase = phase;
    }
    throw error;
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [
          advisoryLockNamespace,
          advisoryLockKey,
        ])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

async function main() {
  try {
    const count = await runMigrations();
    console.log(`migration_complete=PASS total=${count}`);
  } catch (error) {
    const message =
      error instanceof Error && /^MEDIQ_[A-Z0-9_]+$/.test(error.message)
        ? `${error.message} phase=${error.safePhase ?? "unknown"}`
        : error?.code && /^[A-Z0-9]{5}$/.test(error.code)
          ? `MEDIQ_MIGRATION_DATABASE_ERROR phase=${error.safePhase ?? "unknown"} sqlstate=${error.code}`
          : `MEDIQ_MIGRATION_FAILED phase=${error?.safePhase ?? "unknown"} type=${error?.constructor?.name ?? "unknown"}`;
    console.error(message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
