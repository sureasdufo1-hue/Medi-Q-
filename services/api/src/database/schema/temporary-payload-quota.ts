import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { imagingPackages, studyReferences } from "./imaging.js";
import { currentTenantContext } from "./tenant-rls.js";
import { tenants } from "./registry.js";

const ENVIRONMENT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const PACKAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

export const temporaryPayloadQuotaState = pgTable(
  "temporary_payload_quota_state",
  {
    singletonId: boolean("singleton_id").primaryKey().notNull().default(true),
    maxEnvironmentBytes: bigint("max_environment_bytes", { mode: "number" })
      .notNull()
      .default(ENVIRONMENT_LIMIT_BYTES),
    maxPackageBytes: bigint("max_package_bytes", { mode: "number" })
      .notNull()
      .default(PACKAGE_LIMIT_BYTES),
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("temporary_payload_quota_singleton_check", sql`${table.singletonId}`),
    check(
      "temporary_payload_quota_environment_limit_check",
      sql`${table.maxEnvironmentBytes} > 0 AND ${table.maxEnvironmentBytes} <= 10737418240`,
    ),
    check(
      "temporary_payload_quota_package_limit_check",
      sql`${table.maxPackageBytes} > 0 AND ${table.maxPackageBytes} <= 2147483648`,
    ),
    check(
      "temporary_payload_quota_reserved_bytes_check",
      sql`${table.reservedBytes} >= 0 AND ${table.reservedBytes} <= ${table.maxEnvironmentBytes}`,
    ),
    pgPolicy("temporary_payload_quota_state_mediq_quota_owner_scope", {
      to: "mediq_quota_owner",
      for: "all",
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy("temporary_payload_quota_state_mediq_migrator_scope", {
      to: "mediq_migrator",
      for: "all",
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const temporaryPayloadPackageQuotas = pgTable(
  "temporary_payload_package_quotas",
  {
    packageId: uuid("package_id")
      .primaryKey()
      .references(() => imagingPackages.packageId, { onDelete: "restrict" }),
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "temporary_payload_package_quotas_bytes_check",
      sql`${table.reservedBytes} >= 0 AND ${table.reservedBytes} <= 2147483648`,
    ),
    pgPolicy("temporary_payload_package_quotas_mediq_quota_owner_scope", {
      to: "mediq_quota_owner",
      for: "all",
      using: sql`EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = ${table.packageId}
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = ${table.packageId}
      )`,
    }),
    pgPolicy("temporary_payload_package_quotas_mediq_migrator_scope", {
      to: "mediq_migrator",
      for: "all",
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const temporaryPayloadReservations = pgTable(
  "temporary_payload_reservations",
  {
    storageRef: uuid("storage_ref").primaryKey(),
    quotaStateId: boolean("quota_state_id")
      .notNull()
      .default(true)
      .references(() => temporaryPayloadQuotaState.singletonId, { onDelete: "restrict" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    studyRefId: uuid("study_ref_id")
      .notNull()
      .references(() => studyReferences.studyRefId, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => imagingPackages.packageId, { onDelete: "restrict" }),
    writerId: uuid("writer_id").notNull(),
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "temporary_payload_reservations_bytes_check",
      sql`${table.reservedBytes} >= 0 AND ${table.reservedBytes} <= 2147483648`,
    ),
    index("temporary_payload_reservations_tenant_package_idx").on(
      table.tenantId,
      table.packageId,
    ),
    index("temporary_payload_reservations_tenant_study_idx").on(
      table.tenantId,
      table.studyRefId,
    ),
    pgPolicy("temporary_payload_reservations_mediq_quota_owner_scope", {
      to: "mediq_quota_owner",
      for: "all",
      using: sql`${table.tenantId} = ${currentTenantContext}`,
      withCheck: sql`${table.tenantId} = ${currentTenantContext}`,
    }),
    pgPolicy("temporary_payload_reservations_mediq_migrator_scope", {
      to: "mediq_migrator",
      for: "all",
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
