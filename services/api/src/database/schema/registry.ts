import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const updatedAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const organizations = pgTable(
  "organizations",
  {
    organizationId: uuid("organization_id").primaryKey(),
    organizationCode: varchar("organization_code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    organizationType: varchar("organization_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("organizations_organization_code_unique").on(table.organizationCode),
    check(
      "organizations_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`,
    ),
    index("organizations_status_idx").on(table.status),
    ...tenantRlsPolicies(
      "organizations",
      sql`EXISTS (
        SELECT 1 FROM tenants t
         WHERE t.organization_id = ${table.organizationId}
           AND t.tenant_id = ${currentTenantContext}
      )`,
    ),
  ],
).enableRLS();

export const tenants = pgTable(
  "tenants",
  {
    tenantId: uuid("tenant_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "restrict" }),
    tenantCode: varchar("tenant_code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("tenants_tenant_code_unique").on(table.tenantCode),
    unique("tenants_tenant_org_unique").on(table.tenantId, table.organizationId),
    check(
      "tenants_status_check",
      sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`,
    ),
    index("tenants_organization_id_idx").on(table.organizationId),
    index("tenants_status_idx").on(table.status),
    ...tenantRlsPolicies(
      "tenants",
      sql`${table.tenantId} = ${currentTenantContext}`,
    ),
  ],
).enableRLS();

export const hospitals = pgTable(
  "hospitals",
  {
    hospitalId: uuid("hospital_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "restrict" }),
    hospitalCode: varchar("hospital_code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    environmentType: varchar("environment_type", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("hospitals_hospital_code_unique").on(table.hospitalCode),
    unique("hospitals_tenant_hospital_unique").on(table.tenantId, table.hospitalId),
    foreignKey({
      name: "hospitals_tenant_org_fk",
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [tenants.tenantId, tenants.organizationId],
    }).onDelete("restrict"),
    check(
      "hospitals_environment_type_check",
      sql`${table.environmentType} IN ('TEST', 'DEVELOPMENT')`,
    ),
    check(
      "hospitals_status_check",
      sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`,
    ),
    index("hospitals_tenant_id_idx").on(table.tenantId),
    index("hospitals_organization_id_idx").on(table.organizationId),
    index("hospitals_status_idx").on(table.status),
    ...tenantRlsPolicies(
      "hospitals",
      sql`${table.tenantId} = ${currentTenantContext}`,
    ),
  ],
).enableRLS();

export const hospitalEndpoints = pgTable(
  "hospital_endpoints",
  {
    endpointId: uuid("endpoint_id").primaryKey(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    endpointType: varchar("endpoint_type", { length: 20 }).notNull(),
    baseUrl: varchar("base_url", { length: 500 }).notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("hospital_endpoints_hospital_type_unique").on(
      table.hospitalId,
      table.endpointType,
    ),
    check(
      "hospital_endpoints_endpoint_type_check",
      sql`${table.endpointType} IN ('QIDO_RS', 'WADO_RS', 'STOW_RS')`,
    ),
    index("hospital_endpoints_hospital_id_idx").on(table.hospitalId),
    index("hospital_endpoints_endpoint_type_idx").on(table.endpointType),
    ...tenantRlsPolicies(
      "hospital_endpoints",
      sql`EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = ${table.hospitalId}
           AND h.tenant_id = ${currentTenantContext}
      )`,
    ),
  ],
).enableRLS();

export const actors = pgTable(
  "actors",
  {
    actorId: uuid("actor_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    hospitalId: uuid("hospital_id").references(() => hospitals.hospitalId, {
      onDelete: "restrict",
    }),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    externalSubject: varchar("external_subject", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 200 }),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("actors_tenant_subject_unique").on(
      table.tenantId,
      table.externalSubject,
    ),
    check("actors_actor_type_check", sql`${table.actorType} IN ('USER', 'SERVICE')`),
    check(
      "actors_status_check",
      sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')`,
    ),
    foreignKey({
      name: "actors_tenant_hospital_fk",
      columns: [table.tenantId, table.hospitalId],
      foreignColumns: [hospitals.tenantId, hospitals.hospitalId],
    }).onDelete("restrict"),
    index("actors_tenant_id_idx").on(table.tenantId),
    index("actors_hospital_id_idx").on(table.hospitalId),
    index("actors_status_idx").on(table.status),
    ...tenantRlsPolicies(
      "actors",
      sql`${table.tenantId} = ${currentTenantContext}`,
    ),
  ],
).enableRLS();
