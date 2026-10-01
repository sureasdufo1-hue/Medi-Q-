import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { exchangeSessions } from "./exchange.js";
import { studyReferences } from "./imaging.js";
import { actors, tenants } from "./registry.js";
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";

const requiredTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const pacsTransferOperations = pgTable(
  "pacs_transfer_operations",
  {
    operationId: uuid("operation_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    exchangeSessionId: uuid("exchange_session_id")
      .notNull()
      .references(() => exchangeSessions.sessionId, { onDelete: "restrict" }),
    studyRefId: uuid("study_ref_id")
      .notNull()
      .references(() => studyReferences.studyRefId, { onDelete: "restrict" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.actorId, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestDigest: varchar("request_digest", { length: 64 }).notNull(),
    state: varchar("state", { length: 32 }).notNull(),
    version: integer("version").notNull().default(0),
    reasonCode: varchar("reason_code", { length: 64 }),
    sourceObjectCount: integer("source_object_count"),
    destinationObjectCount: integer("destination_object_count"),
    createdAt: requiredTimestamp("created_at"),
    updatedAt: requiredTimestamp("updated_at"),
    stowStartedAt: timestamp("stow_started_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    unique("pacs_transfer_operations_session_study_unique").on(
      table.exchangeSessionId,
      table.studyRefId,
    ),
    unique("pacs_transfer_operations_tenant_actor_key_unique").on(
      table.tenantId,
      table.actorId,
      table.idempotencyKey,
    ),
    check(
      "pacs_transfer_operations_state_check",
      sql`${table.state} IN ('CREATED', 'PREFLIGHT_PASSED', 'STOW_STARTED', 'VERIFYING', 'COMPLETED', 'DENIED', 'FAILED', 'PARTIAL', 'RESULT_UNKNOWN')`,
    ),
    check(
      "pacs_transfer_operations_version_check",
      sql`${table.version} >= 0`,
    ),
    check(
      "pacs_transfer_operations_digest_check",
      sql`${table.requestDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "pacs_transfer_operations_reason_code_check",
      sql`${table.reasonCode} IS NULL OR ${table.reasonCode} ~ '^[A-Z0-9_]{1,64}$'`,
    ),
    check(
      "pacs_transfer_operations_source_count_check",
      sql`${table.sourceObjectCount} IS NULL OR ${table.sourceObjectCount} >= 0`,
    ),
    check(
      "pacs_transfer_operations_destination_count_check",
      sql`${table.destinationObjectCount} IS NULL OR ${table.destinationObjectCount} >= 0`,
    ),
    check(
      "pacs_transfer_operations_dispatch_timestamp_check",
      sql`(${table.state} IN ('CREATED', 'PREFLIGHT_PASSED', 'DENIED') AND ${table.stowStartedAt} IS NULL)
        OR (${table.state} IN ('STOW_STARTED', 'VERIFYING', 'COMPLETED', 'PARTIAL', 'RESULT_UNKNOWN') AND ${table.stowStartedAt} IS NOT NULL)
        OR ${table.state} = 'FAILED'`,
    ),
    check(
      "pacs_transfer_operations_completed_count_check",
      sql`${table.state} <> 'COMPLETED' OR (
        ${table.sourceObjectCount} IS NOT NULL
        AND ${table.sourceObjectCount} > 0
        AND ${table.destinationObjectCount} = ${table.sourceObjectCount}
      )`,
    ),
    index("pacs_transfer_operations_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    ...tenantRlsPolicies(
      "pacs_transfer_operations",
      sql`${table.tenantId} = ${currentTenantContext}
        AND EXISTS (
          SELECT 1 FROM actors a
           WHERE a.actor_id = ${table.actorId}
             AND a.tenant_id = ${currentTenantContext}
        )
        AND EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = ${table.exchangeSessionId}
        )`,
    ),
  ],
).enableRLS();
