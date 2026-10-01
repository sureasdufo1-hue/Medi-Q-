import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  ProvenanceConflictError,
  ProvenancePersistenceError,
  ProvenanceUnavailableError,
  type PacsImportProvenanceRecord,
  type ProvenanceRepository,
} from "./provenance.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProvenanceRow extends QueryResultRow {
  provenance_id: string;
  operation_id: string;
  exchange_session_id: string;
  package_id: string;
  study_ref_id: string | null;
  source_hospital_id: string;
  destination_hospital_id: string | null;
  transfer_type: string;
  transfer_status: string;
  created_at: Date;
}

function validUuid(value: string): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function toRecord(row: ProvenanceRow): PacsImportProvenanceRecord {
  if (
    !validUuid(row.provenance_id) ||
    !validUuid(row.operation_id) ||
    !validUuid(row.exchange_session_id) ||
    !validUuid(row.package_id) ||
    !row.study_ref_id ||
    !validUuid(row.study_ref_id) ||
    !validUuid(row.source_hospital_id) ||
    !row.destination_hospital_id ||
    !validUuid(row.destination_hospital_id) ||
    row.transfer_type !== "PACS_IMPORT" ||
    row.transfer_status !== "PENDING" ||
    !(row.created_at instanceof Date) ||
    Number.isNaN(row.created_at.getTime())
  ) {
    throw new ProvenanceConflictError();
  }

  return Object.freeze({
    provenanceId: row.provenance_id,
    operationId: row.operation_id,
    exchangeSessionId: row.exchange_session_id,
    packageId: row.package_id,
    studyRefId: row.study_ref_id,
    sourceHospitalId: row.source_hospital_id,
    destinationHospitalId: row.destination_hospital_id,
    transferType: "PACS_IMPORT",
    transferStatus: "PENDING",
    createdAt: row.created_at,
  });
}

const RETURNING_COLUMNS = `provenance_id, operation_id, exchange_session_id,
  package_id, study_ref_id, source_hospital_id, destination_hospital_id,
  transfer_type, transfer_status, created_at`;

export class PostgresProvenanceRepository implements ProvenanceRepository {
  constructor(
    private readonly transaction: PoolClient,
    private readonly createId: () => string = randomUUID,
  ) {}

  async createPendingForPacsImport(input: {
    readonly operationId: string;
    readonly now: Date;
  }): Promise<{
    readonly record: PacsImportProvenanceRecord;
    readonly created: boolean;
  }> {
    if (
      !validUuid(input.operationId) ||
      !(input.now instanceof Date) ||
      Number.isNaN(input.now.getTime())
    ) {
      throw new ProvenancePersistenceError();
    }

    const provenanceId = this.createId();
    if (!validUuid(provenanceId)) throw new ProvenancePersistenceError();

    let inserted: ProvenanceRow | undefined;
    try {
      const result = await this.transaction.query<ProvenanceRow>(
        `INSERT INTO provenance_records
          (provenance_id, operation_id, exchange_session_id, package_id,
           study_ref_id, source_hospital_id, destination_hospital_id,
           integrity_id, transfer_type, transfer_status, ingested_at,
           transferred_at, created_at)
         SELECT $1, op.operation_id, op.exchange_session_id, s.package_id,
                op.study_ref_id, e.source_hospital_id, e.destination_hospital_id,
                NULL, 'PACS_IMPORT', 'PENDING', NULL, NULL, $2
           FROM pacs_transfer_operations op
           JOIN exchange_sessions e
             ON e.session_id = op.exchange_session_id
           JOIN study_references s
             ON s.study_ref_id = op.study_ref_id
            AND s.source_hospital_id = e.source_hospital_id
           JOIN imaging_packages p
             ON p.package_id = s.package_id
            AND p.exchange_session_id = e.session_id
            AND p.source_hospital_id = e.source_hospital_id
          WHERE op.operation_id = $3
            AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
            AND op.state IN ('CREATED', 'PREFLIGHT_PASSED')
         ON CONFLICT (operation_id) WHERE operation_id IS NOT NULL DO NOTHING
         RETURNING ${RETURNING_COLUMNS}`,
        [provenanceId, input.now, input.operationId],
      );
      inserted = result.rows[0];
    } catch (error) {
      if (
        error instanceof ProvenancePersistenceError ||
        error instanceof ProvenanceUnavailableError ||
        error instanceof ProvenanceConflictError
      ) {
        throw error;
      }
      throw new ProvenancePersistenceError();
    }

    if (inserted) {
      const record = toRecord(inserted);
      if (record.operationId !== input.operationId) {
        throw new ProvenanceConflictError();
      }
      return { record, created: true };
    }

    try {
      const existing = await this.transaction.query<ProvenanceRow>(
        `SELECT ${RETURNING_COLUMNS}
           FROM provenance_records
          WHERE operation_id = $1`,
        [input.operationId],
      );
      if (existing.rowCount !== 1 || !existing.rows[0]) {
        throw new ProvenanceUnavailableError();
      }
      const record = toRecord(existing.rows[0]);
      if (record.operationId !== input.operationId) {
        throw new ProvenanceConflictError();
      }
      return { record, created: false };
    } catch (error) {
      if (
        error instanceof ProvenanceUnavailableError ||
        error instanceof ProvenanceConflictError
      ) {
        throw error;
      }
      throw new ProvenancePersistenceError();
    }
  }
}
