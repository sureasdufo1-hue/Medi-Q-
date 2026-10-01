import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { actors, hospitals, tenants } from "./registry.js";
import { exchangeSessions } from "./exchange.js";
import { integrityEvidence } from "./integrity.js";
import { imagingPackages, studyReferences } from "./imaging.js";
import { pacsTransferOperations } from "./pacs-transfer-operation.js";
import { tenantRlsPolicies } from "./tenant-rls.js";

export const provenanceRecords = pgTable(
  "provenance_records",
  {
    provenanceId: uuid("provenance_id").primaryKey(),
    exchangeSessionId: uuid("exchange_session_id")
      .notNull()
      .references(() => exchangeSessions.sessionId, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => imagingPackages.packageId, { onDelete: "restrict" }),
    studyRefId: uuid("study_ref_id").references(
      () => studyReferences.studyRefId,
      { onDelete: "restrict" },
    ),
    sourceHospitalId: uuid("source_hospital_id")
      .notNull()
      .references(() => hospitals.hospitalId, { onDelete: "restrict" }),
    destinationHospitalId: uuid("destination_hospital_id").references(
      () => hospitals.hospitalId,
      { onDelete: "restrict" },
    ),
    integrityId: uuid("integrity_id").references(
      () => integrityEvidence.integrityId,
      { onDelete: "restrict" },
    ),
    operationId: uuid("operation_id").references(
      () => pacsTransferOperations.operationId,
      { onDelete: "restrict" },
    ),
    transferType: varchar("transfer_type", { length: 32 }).notNull(),
    transferStatus: varchar("transfer_status", { length: 20 }).notNull(),
    ingestedAt: timestamp("ingested_at", {
      withTimezone: true,
      mode: "date",
    }),
    transferredAt: timestamp("transferred_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    check(
      "provenance_records_transfer_type_check",
      sql`transfer_type IN ('VIEW', 'DOWNLOAD', 'PACS_IMPORT', 'MOBILE_EXPORT')`,
    ),
    check(
      "provenance_records_transfer_status_check",
      sql`transfer_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "provenance_records_pacs_operation_required_check",
      sql`transfer_type <> 'PACS_IMPORT' OR (
        operation_id IS NOT NULL
        AND destination_hospital_id IS NOT NULL
        AND study_ref_id IS NOT NULL
      )`,
    ),
    uniqueIndex("provenance_records_operation_id_unique")
      .on(table.operationId)
      .where(sql`${table.operationId} IS NOT NULL`),
    index("provenance_records_exchange_session_id_idx").on(
      table.exchangeSessionId,
    ),
    index("provenance_records_package_id_idx").on(table.packageId),
    index("provenance_records_source_hospital_id_idx").on(
      table.sourceHospitalId,
    ),
    index("provenance_records_destination_hospital_id_idx").on(
      table.destinationHospitalId,
    ),
    index("provenance_records_transfer_status_idx").on(table.transferStatus),
    ...tenantRlsPolicies(
      "provenance_records",
      sql`EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = ${table.exchangeSessionId}
      )`,
    ),
  ],
).enableRLS();
