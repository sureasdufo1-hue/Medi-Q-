import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { exchangeSessions } from "./exchange.js";
import { imagingPackages } from "./imaging.js";
import { patientRefs } from "./patient.js";
import { actors, hospitals, tenants } from "./registry.js";
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const updatedAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const consents = pgTable(
  "consents",
  {
    consentId: uuid("consent_id").primaryKey(),
    exchangeSessionId: uuid("exchange_session_id")
      .notNull()
      .references(() => exchangeSessions.sessionId, { onDelete: "restrict" }),
    patientRefId: uuid("patient_ref_id")
      .notNull()
      .references(() => patientRefs.patientRefId, { onDelete: "restrict" }),
    sourceHospitalId: uuid("source_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    destinationHospitalId: uuid("destination_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    imagingPackageId: uuid("imaging_package_id").references(
      () => imagingPackages.packageId,
      { onDelete: "restrict" },
    ),
    status: varchar("status", { length: 20 }).notNull(),
    consentVersion: integer("consent_version").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    withdrawnAt: timestamp("withdrawn_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("consents_session_version_unique").on(
      table.exchangeSessionId,
      table.consentVersion,
    ),
    check(
      "consents_status_check",
      sql`${table.status} IN ('PENDING', 'ACTIVE', 'WITHDRAWN', 'EXPIRED', 'REJECTED')`,
    ),
    check("consents_version_check", sql`${table.consentVersion} > 0`),
    uniqueIndex("consents_one_active_per_session_uidx")
      .on(table.exchangeSessionId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index("consents_exchange_session_id_idx").on(table.exchangeSessionId),
    index("consents_patient_ref_id_idx").on(table.patientRefId),
    index("consents_status_idx").on(table.status),
    index("consents_expires_at_idx").on(table.expiresAt),
    ...tenantRlsPolicies(
      "consents",
      sql`EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = ${table.exchangeSessionId}
      )`,
    ),
  ],
).enableRLS();

export const consentActions = pgTable(
  "consent_actions",
  {
    consentActionId: uuid("consent_action_id").primaryKey(),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consents.consentId, { onDelete: "restrict" }),
    action: varchar("action", { length: 32 }).notNull(),
  },
  (table) => [
    unique("consent_actions_consent_action_unique").on(
      table.consentId,
      table.action,
    ),
    check(
      "consent_actions_action_check",
      sql`${table.action} IN ('VIEW', 'DOWNLOAD', 'PACS_IMPORT', 'MOBILE_EXPORT')`,
    ),
    index("consent_actions_consent_id_idx").on(table.consentId),
    ...tenantRlsPolicies(
      "consent_actions",
      sql`EXISTS (
        SELECT 1 FROM consents c
         WHERE c.consent_id = ${table.consentId}
      )`,
    ),
  ],
).enableRLS();

export const transferGrants = pgTable(
  "transfer_grants",
  {
    grantId: uuid("grant_id").primaryKey(),
    exchangeSessionId: uuid("exchange_session_id")
      .notNull()
      .references(() => exchangeSessions.sessionId, { onDelete: "restrict" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consents.consentId, { onDelete: "restrict" }),
    recipientTenantId: uuid("recipient_tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    recipientHospitalId: uuid("recipient_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    recipientActorId: uuid("recipient_actor_id").references(
      () => actors.actorId,
      { onDelete: "restrict" },
    ),
    idempotencyKey: uuid("idempotency_key"),
    imagingPackageId: uuid("imaging_package_id").references(
      () => imagingPackages.packageId,
      { onDelete: "restrict" },
    ),
    status: varchar("status", { length: 20 }).notNull(),
    issuedAt: timestamp("issued_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    check(
      "transfer_grants_status_check",
      sql`${table.status} IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'CONSUMED')`,
    ),
    check(
      "transfer_grants_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}`,
    ),
    check(
      "transfer_grants_idempotency_actor_check",
      sql`${table.idempotencyKey} IS NULL OR ${table.recipientActorId} IS NOT NULL`,
    ),
    index("transfer_grants_exchange_session_id_idx").on(
      table.exchangeSessionId,
    ),
    index("transfer_grants_consent_id_idx").on(table.consentId),
    index("transfer_grants_recipient_tenant_id_idx").on(
      table.recipientTenantId,
    ),
    index("transfer_grants_recipient_hospital_id_idx").on(
      table.recipientHospitalId,
    ),
    index("transfer_grants_status_idx").on(table.status),
    index("transfer_grants_expires_at_idx").on(table.expiresAt),
    index("transfer_grants_exchange_session_status_idx").on(
      table.exchangeSessionId,
      table.status,
    ),
    uniqueIndex("transfer_grants_tenant_actor_idempotency_key_unique")
      .on(table.recipientTenantId, table.recipientActorId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    ...tenantRlsPolicies(
      "transfer_grants",
      sql`${table.recipientTenantId} = ${currentTenantContext}
        OR EXISTS (
          SELECT 1 FROM exchange_sessions e
           WHERE e.session_id = ${table.exchangeSessionId}
        )`,
    ),
  ],
).enableRLS();

export const transferGrantScopes = pgTable(
  "transfer_grant_scopes",
  {
    grantScopeId: uuid("grant_scope_id").primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => transferGrants.grantId, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 64 }).notNull(),
  },
  (table) => [
    unique("transfer_grant_scopes_grant_scope_unique").on(
      table.grantId,
      table.scope,
    ),
    check(
      "transfer_grant_scopes_scope_check",
      sql`${table.scope} IN ('study:view', 'study:download', 'study:pacs-transfer', 'study:mobile-export')`,
    ),
    ...tenantRlsPolicies(
      "transfer_grant_scopes",
      sql`EXISTS (
        SELECT 1 FROM transfer_grants g
         WHERE g.grant_id = ${table.grantId}
      )`,
    ),
  ],
).enableRLS();
