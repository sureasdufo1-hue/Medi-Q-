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
import { hospitals } from "./registry.js";
import { patientRefs } from "./patient.js";
import { tenantRlsPolicies } from "./tenant-rls.js";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const updatedAt = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const imagingPackages = pgTable(
  "imaging_packages",
  {
    packageId: uuid("package_id").primaryKey(),
    exchangeSessionId: uuid("exchange_session_id")
      .notNull()
      .references(() => exchangeSessions.sessionId, { onDelete: "restrict" }),
    patientRefId: uuid("patient_ref_id")
      .notNull()
      .references(() => patientRefs.patientRefId, { onDelete: "restrict" }),
    sourceHospitalId: uuid("source_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    state: varchar("state", { length: 32 }).notNull(),
    storageRef: varchar("storage_ref", { length: 1024 }),
    studyCount: integer("study_count").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    check(
      "imaging_packages_state_check",
      sql`${table.state} IN ('REGISTERED', 'AVAILABLE', 'IN_EXCHANGE', 'SESSION_COMPLETE', 'RETENTION_PENDING', 'DELETED', 'FAILED')`,
    ),
    check("imaging_packages_study_count_check", sql`${table.studyCount} >= 0`),
    index("imaging_packages_exchange_session_id_idx").on(
      table.exchangeSessionId,
    ),
    index("imaging_packages_patient_ref_id_idx").on(table.patientRefId),
    index("imaging_packages_source_hospital_id_idx").on(
      table.sourceHospitalId,
    ),
    index("imaging_packages_state_idx").on(table.state),
    index("imaging_packages_retention_expires_at_idx").on(
      table.retentionExpiresAt,
    ),
    ...tenantRlsPolicies(
      "imaging_packages",
      sql`EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = ${table.exchangeSessionId}
      )`,
    ),
  ],
).enableRLS();

export const studyReferences = pgTable(
  "study_references",
  {
    studyRefId: uuid("study_ref_id").primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => imagingPackages.packageId, { onDelete: "restrict" }),
    sourceHospitalId: uuid("source_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    studyInstanceUid: varchar("study_instance_uid", { length: 128 }).notNull(),
    modality: varchar("modality", { length: 16 }),
    seriesCount: integer("series_count"),
    instanceCount: integer("instance_count"),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    unique("study_references_package_uid_unique").on(
      table.packageId,
      table.studyInstanceUid,
    ),
    check(
      "study_references_series_count_check",
      sql`${table.seriesCount} IS NULL OR ${table.seriesCount} >= 0`,
    ),
    check(
      "study_references_instance_count_check",
      sql`${table.instanceCount} IS NULL OR ${table.instanceCount} >= 0`,
    ),
    index("study_references_package_id_idx").on(table.packageId),
    index("study_references_source_hospital_id_idx").on(table.sourceHospitalId),
    index("study_references_study_instance_uid_idx").on(table.studyInstanceUid),
    ...tenantRlsPolicies(
      "study_references",
      sql`EXISTS (
        SELECT 1 FROM imaging_packages p
         WHERE p.package_id = ${table.packageId}
      )`,
    ),
  ],
).enableRLS();
