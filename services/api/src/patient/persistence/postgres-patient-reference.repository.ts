import type { Pool, QueryResultRow } from "pg";
import {
  InvalidPatientReferenceError,
  PatientReference,
  type PatientReferenceState,
  type PatientReferenceStatus,
} from "../domain/patient-reference.js";
import type { PatientReferenceRepository } from "../application/patient-reference.repository.js";

interface PatientReferenceRow extends QueryResultRow {
  patient_ref_id: string;
  patient_ref_code: string;
  status: PatientReferenceStatus;
  created_at: Date;
  updated_at: Date;
}

export class PatientReferenceConflictError extends Error {
  constructor() {
    super("PATIENT_REFERENCE_CONFLICT");
    this.name = "PatientReferenceConflictError";
  }
}

export class PatientReferencePersistenceError extends Error {
  constructor() {
    super("PATIENT_REFERENCE_PERSISTENCE_FAILED");
    this.name = "PatientReferencePersistenceError";
  }
}

const selectedColumns = `
  patient_ref_id,
  patient_ref_code,
  status,
  created_at,
  updated_at
`;

function toDomain(row: PatientReferenceRow): PatientReference {
  const state: PatientReferenceState = {
    patientRefId: row.patient_ref_id,
    patientRefCode: row.patient_ref_code,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return PatientReference.reconstitute(state);
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export class PostgresPatientReferenceRepository
  implements PatientReferenceRepository
{
  constructor(private readonly database: Pick<Pool, "query">) {}

  async create(reference: PatientReference): Promise<PatientReference> {
    if (reference.status !== "ACTIVE") {
      throw new InvalidPatientReferenceError();
    }

    let rows: PatientReferenceRow[];
    try {
      const result = await this.database.query<PatientReferenceRow>(
        `INSERT INTO patient_refs
          (patient_ref_id, patient_ref_code, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${selectedColumns}`,
        [
          reference.patientRefId,
          reference.patientRefCode,
          reference.status,
          reference.createdAt,
          reference.updatedAt,
        ],
      );
      rows = result.rows;
    } catch (error) {
      if (postgresErrorCode(error) === "23505") {
        throw new PatientReferenceConflictError();
      }
      throw new PatientReferencePersistenceError();
    }

    if (rows.length !== 1) {
      throw new PatientReferencePersistenceError();
    }
    return toDomain(rows[0]);
  }

  async findById(patientRefId: string): Promise<PatientReference | null> {
    if (!PatientReference.isValidId(patientRefId)) {
      throw new InvalidPatientReferenceError();
    }

    let rows: PatientReferenceRow[];
    try {
      const result = await this.database.query<PatientReferenceRow>(
        `SELECT ${selectedColumns} FROM patient_refs WHERE patient_ref_id = $1`,
        [patientRefId.toLowerCase()],
      );
      rows = result.rows;
    } catch {
      throw new PatientReferencePersistenceError();
    }

    return rows.length === 0 ? null : toDomain(rows[0]);
  }

  async findByCode(patientRefCode: string): Promise<PatientReference | null> {
    if (!PatientReference.isValidCode(patientRefCode)) {
      throw new InvalidPatientReferenceError();
    }

    let rows: PatientReferenceRow[];
    try {
      const result = await this.database.query<PatientReferenceRow>(
        `SELECT ${selectedColumns} FROM patient_refs WHERE patient_ref_code = $1`,
        [patientRefCode],
      );
      rows = result.rows;
    } catch {
      throw new PatientReferencePersistenceError();
    }

    return rows.length === 0 ? null : toDomain(rows[0]);
  }
}
