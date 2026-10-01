import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { actors, hospitals } from "./registry.js";
import { patientRefs } from "./patient.js";
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const updatedAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const exchangeSessions = pgTable(
  "exchange_sessions",
  {
    sessionId: uuid("session_id").primaryKey(),
    patientRefId: uuid("patient_ref_id")
      .notNull()
      .references(() => patientRefs.patientRefId, { onDelete: "restrict" }),
    sourceHospitalId: uuid("source_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    destinationHospitalId: uuid("destination_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    requesterActorId: uuid("requester_actor_id")
      .notNull()
      .references(() => actors.actorId, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    purpose: varchar("purpose", { length: 255 }).notNull(),
    state: varchar("state", { length: 32 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    unique("exchange_sessions_requester_idempotency_key_unique").on(
      table.requesterActorId,
      table.idempotencyKey,
    ),
    check(
      "exchange_sessions_state_check",
      sql`${table.state} IN ('REQUESTED', 'CONSENT_PENDING', 'CONSENTED', 'AUTHORIZED', 'READY', 'ACTIVE', 'COMPLETED', 'REJECTED', 'EXPIRED', 'REVOKED', 'FAILED', 'CANCELLED')`,
    ),
    check(
      "exchange_sessions_distinct_hospitals_check",
      sql`${table.sourceHospitalId} <> ${table.destinationHospitalId}`,
    ),
    index("exchange_sessions_patient_ref_id_idx").on(table.patientRefId),
    index("exchange_sessions_source_hospital_id_idx").on(table.sourceHospitalId),
    index("exchange_sessions_destination_hospital_id_idx").on(
      table.destinationHospitalId,
    ),
    index("exchange_sessions_requester_actor_id_idx").on(table.requesterActorId),
    index("exchange_sessions_state_idx").on(table.state),
    index("exchange_sessions_created_at_idx").on(table.createdAt),
    index("exchange_sessions_destination_state_idx").on(
      table.destinationHospitalId,
      table.state,
    ),
    ...tenantRlsPolicies(
      "exchange_sessions",
      sql`EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id IN (
           ${table.sourceHospitalId}, ${table.destinationHospitalId}
         )
           AND h.tenant_id = ${currentTenantContext}
      )`,
    ),
  ],
).enableRLS();
