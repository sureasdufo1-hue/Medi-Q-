import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { exchangeSessions } from "./exchange.js";
import { imagingPackages, studyReferences } from "./imaging.js";
import { pacsTransferOperations } from "./pacs-transfer-operation.js";
import { tenantRlsPolicies } from "./tenant-rls.js";

export const integrityEvidence = pgTable(
  "integrity_evidence",
  {
    integrityId: uuid("integrity_id").primaryKey(),
    operationId: uuid("operation_id").references(
      () => pacsTransferOperations.operationId,
      { onDelete: "restrict" },
    ),
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
    verificationStage: varchar("verification_stage", { length: 32 }).notNull(),
    algorithm: varchar("algorithm", { length: 32 }),
    sourceDigest: varchar("source_digest", { length: 256 }),
    destinationDigest: varchar("destination_digest", { length: 256 }),
    sourceObjectCount: integer("source_object_count"),
    destinationObjectCount: integer("destination_object_count"),
    status: varchar("status", { length: 20 }).notNull(),
    verifiedAt: timestamp("verified_at", {
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
      "integrity_evidence_stage_check",
      sql`verification_stage IN ('SOURCE_CAPTURE', 'DESTINATION_VERIFY', 'END_TO_END')`,
    ),
    check(
      "integrity_evidence_status_check",
      sql`status IN ('PENDING', 'VERIFIED', 'FAILED', 'NOT_APPLICABLE')`,
    ),
    check(
      "integrity_evidence_source_count_check",
      sql`source_object_count IS NULL OR source_object_count >= 0`,
    ),
    check(
      "integrity_evidence_destination_count_check",
      sql`destination_object_count IS NULL OR destination_object_count >= 0`,
    ),
    check(
      "integrity_evidence_source_capture_binding_check",
      sql`verification_stage <> 'SOURCE_CAPTURE' OR (
        operation_id IS NOT NULL
        AND study_ref_id IS NOT NULL
        AND algorithm = 'SHA256-MANIFEST-V1'
        AND source_digest IS NOT NULL
        AND source_digest ~ '^sha256:[0-9a-f]{64}$'
        AND source_object_count IS NOT NULL
        AND source_object_count > 0
        AND destination_digest IS NULL
        AND destination_object_count IS NULL
        AND status = 'PENDING'
        AND verified_at IS NULL
      )`,
    ),
    check(
      "integrity_evidence_destination_verify_binding_check",
      sql`verification_stage <> 'DESTINATION_VERIFY' OR (
        operation_id IS NOT NULL
        AND study_ref_id IS NOT NULL
        AND algorithm = 'SHA256-MANIFEST-V1'
        AND source_digest IS NOT NULL
        AND source_digest ~ '^sha256:[0-9a-f]{64}$'
        AND destination_digest IS NOT NULL
        AND destination_digest ~ '^sha256:[0-9a-f]{64}$'
        AND destination_digest = source_digest
        AND source_object_count IS NOT NULL
        AND source_object_count > 0
        AND destination_object_count IS NOT NULL
        AND destination_object_count = source_object_count
        AND status = 'VERIFIED'
        AND verified_at IS NOT NULL
        AND created_at >= verified_at
      )`,
    ),
    index("integrity_evidence_exchange_session_id_idx").on(
      table.exchangeSessionId,
    ),
    index("integrity_evidence_package_id_idx").on(table.packageId),
    index("integrity_evidence_status_idx").on(table.status),
    uniqueIndex("integrity_evidence_operation_stage_unique")
      .on(table.operationId, table.verificationStage)
      .where(sql`${table.operationId} IS NOT NULL`),
    ...tenantRlsPolicies(
      "integrity_evidence",
      sql`EXISTS (
        SELECT 1 FROM exchange_sessions e
         WHERE e.session_id = ${table.exchangeSessionId}
      )`,
    ),
  ],
).enableRLS();
