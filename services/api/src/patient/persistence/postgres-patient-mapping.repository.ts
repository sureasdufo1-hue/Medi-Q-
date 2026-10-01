import type { PoolClient, QueryResultRow } from "pg";
import {
  InvalidPatientMappingError,
  PatientMapping,
  type PatientMappingState,
  type PatientMappingStatus,
} from "../domain/patient-mapping.js";
import type { PatientMappingRepository } from "../application/patient-mapping.repository.js";

interface PatientMappingRow extends QueryResultRow {
  mapping_id: string;
  patient_ref_id: string;
  hospital_id: string;
  local_patient_id: string;
  status: PatientMappingStatus;
  validated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PatientMappingConflictError extends Error {
  constructor() {
    super("PATIENT_MAPPING_CONFLICT");
    this.name = "PatientMappingConflictError";
  }
}

export class PatientMappingPersistenceError extends Error {
  constructor() {
    super("PATIENT_MAPPING_PERSISTENCE_FAILED");
    this.name = "PatientMappingPersistenceError";
  }
}

const selectedColumns = `
  mapping_id,
  patient_ref_id,
  hospital_id,
  local_patient_id,
  status,
  validated_at,
  created_at,
  updated_at
`;

function toDomain(row: PatientMappingRow): PatientMapping {
  const state: PatientMappingState = {
    mappingId: row.mapping_id,
    patientRefId: row.patient_ref_id,
    hospitalId: row.hospital_id,
    localPatientId: row.local_patient_id,
    status: row.status,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return PatientMapping.reconstitute(state);
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function validateLookup(hospitalId: string, key: string): void {
  if (
    !PatientMapping.isValidId(hospitalId) ||
    !PatientMapping.isValidId(key)
  ) {
    throw new InvalidPatientMappingError();
  }
}

export class PostgresPatientMappingRepository
  implements PatientMappingRepository
{
  constructor(
    private readonly database: Pick<PoolClient, "query" | "release">,
  ) {}

  async create(mapping: PatientMapping): Promise<PatientMapping> {
    let rows: PatientMappingRow[];
    try {
      const result = await this.database.query<PatientMappingRow>(
        `INSERT INTO patient_mappings
          (mapping_id, patient_ref_id, hospital_id, local_patient_id,
           status, validated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${selectedColumns}`,
        [
          mapping.mappingId,
          mapping.patientRefId,
          mapping.hospitalId,
          mapping.localPatientId,
          mapping.status,
          mapping.validatedAt,
          mapping.createdAt,
          mapping.updatedAt,
        ],
      );
      rows = result.rows;
    } catch (error) {
      if (postgresErrorCode(error) === "23505") {
        throw new PatientMappingConflictError();
      }
      throw new PatientMappingPersistenceError();
    }

    if (rows.length !== 1) {
      throw new PatientMappingPersistenceError();
    }
    return toDomain(rows[0]);
  }

  async findByIdForHospital(
    hospitalId: string,
    mappingId: string,
  ): Promise<PatientMapping | null> {
    validateLookup(hospitalId, mappingId);
    return this.findOne(
      `SELECT ${selectedColumns} FROM patient_mappings
        WHERE hospital_id = $1 AND mapping_id = $2`,
      [hospitalId.toLowerCase(), mappingId.toLowerCase()],
    );
  }

  async findByLocalPatientId(
    hospitalId: string,
    localPatientId: string,
  ): Promise<PatientMapping | null> {
    if (
      !PatientMapping.isValidId(hospitalId) ||
      !PatientMapping.isValidLocalPatientId(localPatientId)
    ) {
      throw new InvalidPatientMappingError();
    }
    return this.findOne(
      `SELECT ${selectedColumns} FROM patient_mappings
        WHERE hospital_id = $1 AND local_patient_id = $2`,
      [hospitalId.toLowerCase(), localPatientId],
    );
  }

  async findByPatientReference(
    hospitalId: string,
    patientRefId: string,
  ): Promise<PatientMapping | null> {
    validateLookup(hospitalId, patientRefId);
    return this.findOne(
      `SELECT ${selectedColumns} FROM patient_mappings
        WHERE hospital_id = $1 AND patient_ref_id = $2`,
      [hospitalId.toLowerCase(), patientRefId.toLowerCase()],
    );
  }

  private async findOne(
    statement: string,
    parameters: unknown[],
  ): Promise<PatientMapping | null> {
    let rows: PatientMappingRow[];
    try {
      const result = await this.database.query<PatientMappingRow>(
        statement,
        parameters,
      );
      rows = result.rows;
    } catch {
      throw new PatientMappingPersistenceError();
    }

    if (rows.length > 1) {
      throw new PatientMappingPersistenceError();
    }
    return rows.length === 0 ? null : toDomain(rows[0]);
  }
}
