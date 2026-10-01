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
import { currentTenantContext, tenantRlsPolicies } from "./tenant-rls.js";
import { hospitals } from "./registry.js";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const updatedAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const patientRefs = pgTable(
  "patient_refs",
  {
    patientRefId: uuid("patient_ref_id").primaryKey(),
    patientRefCode: varchar("patient_ref_code", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("patient_refs_patient_ref_code_unique").on(table.patientRefCode),
    check(
      "patient_refs_p0_synthetic_code_check",
      sql`${table.patientRefCode} ~ '^MQ-TEST-[A-Z0-9][A-Z0-9-]{0,55}$'`,
    ),
    check(
      "patient_refs_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`,
    ),
    index("patient_refs_status_idx").on(table.status),
  ],
);

export const patientMappings = pgTable(
  "patient_mappings",
  {
    mappingId: uuid("mapping_id").primaryKey(),
    patientRefId: uuid("patient_ref_id")
      .notNull()
      .references(() => patientRefs.patientRefId, { onDelete: "restrict" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    localPatientId: varchar("local_patient_id", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    validatedAt: timestamp("validated_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("patient_mappings_hospital_local_patient_unique").on(
      table.hospitalId,
      table.localPatientId,
    ),
    unique("patient_mappings_patient_hospital_unique").on(
      table.patientRefId,
      table.hospitalId,
    ),
    check(
      "patient_mappings_status_check",
      sql`${table.status} IN ('VALID', 'UNVERIFIED', 'AMBIGUOUS', 'REVOKED')`,
    ),
    index("patient_mappings_patient_ref_id_idx").on(table.patientRefId),
    index("patient_mappings_hospital_id_idx").on(table.hospitalId),
    index("patient_mappings_status_idx").on(table.status),
    ...tenantRlsPolicies(
      "patient_mappings",
      sql`EXISTS (
        SELECT 1 FROM hospitals h
         WHERE h.hospital_id = ${table.hospitalId}
           AND h.tenant_id = ${currentTenantContext}
      )`,
    ),
  ],
).enableRLS();
