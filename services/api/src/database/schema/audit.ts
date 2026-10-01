import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { exchangeSessions } from "./exchange.js";
import { actors, tenants } from "./registry.js";
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";

export const auditEvents = pgTable(
  "audit_events",
  {
    auditEventId: uuid("audit_event_id").primaryKey(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    actorId: uuid("actor_id").references(() => actors.actorId, {
      onDelete: "restrict",
    }),
    tenantId: uuid("tenant_id").references(() => tenants.tenantId, {
      onDelete: "restrict",
    }),
    exchangeSessionId: uuid("exchange_session_id").references(
      () => exchangeSessions.sessionId,
      { onDelete: "restrict" },
    ),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceId: uuid("resource_id"),
    action: varchar("action", { length: 64 }).notNull(),
    result: varchar("result", { length: 20 }).notNull(),
    reasonCode: varchar("reason_code", { length: 64 }),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    check(
      "audit_events_result_check",
      sql`result IN ('SUCCESS', 'FAILURE', 'ALLOW', 'DENY')`,
    ),
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_exchange_session_occurred_at_idx").on(
      table.exchangeSessionId,
      table.occurredAt,
    ),
    index("audit_events_actor_occurred_at_idx").on(
      table.actorId,
      table.occurredAt,
    ),
    index("audit_events_tenant_occurred_at_idx").on(
      table.tenantId,
      table.occurredAt,
    ),
    index("audit_events_correlation_id_idx").on(table.correlationId),
    ...tenantRlsPolicies(
      "audit_events",
      sql`${table.tenantId} = ${currentTenantContext}`,
    ),
  ],
).enableRLS();
