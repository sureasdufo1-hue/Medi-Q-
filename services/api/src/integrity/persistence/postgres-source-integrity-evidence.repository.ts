import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  SOURCE_INTEGRITY_ALGORITHM,
  type SourceIntegrityManifest,
} from "../application/source-integrity-manifest.builder.js";
import {
  SourceIntegrityEvidenceConflictError,
  SourceIntegrityEvidencePersistenceError,
  SourceIntegrityEvidenceUnavailableError,
  isSourceIntegrityManifest,
  type SourceIntegrityEvidenceRecord,
  type SourceIntegrityEvidenceRepository,
} from "./source-integrity-evidence.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IntegrityEvidenceRow extends QueryResultRow {
  integrity_id: string;
  operation_id: string;
  exchange_session_id: string;
  package_id: string;
  study_ref_id: string;
  verification_stage: string;
  algorithm: string;
  source_digest: string;
  source_object_count: number;
  status: string;
  verified_at: Date | null;
  created_at: Date;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasExactDataProperties(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  return (
    keys.length === expected.length &&
    keys.every(
      (key) =>
        typeof key === "string" &&
        expected.includes(key) &&
        descriptors[key]?.enumerable === true &&
        Object.hasOwn(descriptors[key] ?? {}, "value"),
    )
  );
}

function toRecord(row: IntegrityEvidenceRow): SourceIntegrityEvidenceRecord {
  if (
    !validUuid(row.integrity_id) ||
    !validUuid(row.operation_id) ||
    !validUuid(row.exchange_session_id) ||
    !validUuid(row.package_id) ||
    !validUuid(row.study_ref_id) ||
    row.verification_stage !== "SOURCE_CAPTURE" ||
    row.algorithm !== SOURCE_INTEGRITY_ALGORITHM ||
    typeof row.source_digest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(row.source_digest) ||
    !Number.isInteger(row.source_object_count) ||
    row.source_object_count < 1 ||
    row.status !== "PENDING" ||
    row.verified_at !== null ||
    !(row.created_at instanceof Date) ||
    Number.isNaN(row.created_at.getTime())
  ) {
    throw new SourceIntegrityEvidenceConflictError();
  }

  return Object.freeze({
    integrityId: row.integrity_id,
    operationId: row.operation_id,
    exchangeSessionId: row.exchange_session_id,
    packageId: row.package_id,
    studyRefId: row.study_ref_id,
    verificationStage: "SOURCE_CAPTURE",
    algorithm: SOURCE_INTEGRITY_ALGORITHM,
    sourceDigest: row.source_digest as `sha256:${string}`,
    sourceObjectCount: row.source_object_count,
    status: "PENDING",
    verifiedAt: null,
    createdAt: row.created_at,
  });
}

const RETURNING_COLUMNS = `integrity_id, operation_id, exchange_session_id,
  package_id, study_ref_id, verification_stage, algorithm, source_digest,
  source_object_count, status, verified_at, created_at`;

export class PostgresSourceIntegrityEvidenceRepository
  implements SourceIntegrityEvidenceRepository
{
  constructor(
    private readonly transaction: PoolClient,
    private readonly createId: () => string = randomUUID,
  ) {}

  async createPendingSourceCapture(input: {
    readonly operationId: string;
    readonly manifest: SourceIntegrityManifest;
    readonly now: Date;
  }): Promise<{
    readonly record: SourceIntegrityEvidenceRecord;
    readonly created: boolean;
  }> {
    if (
      !hasExactDataProperties(input, ["operationId", "manifest", "now"]) ||
      !validUuid(input.operationId) ||
      !isSourceIntegrityManifest(input.manifest) ||
      !(input.now instanceof Date) ||
      Number.isNaN(input.now.getTime())
    ) {
      throw new SourceIntegrityEvidencePersistenceError();
    }

    const integrityId = this.createId();
    if (!validUuid(integrityId)) {
      throw new SourceIntegrityEvidencePersistenceError();
    }

    let inserted: IntegrityEvidenceRow | undefined;
    try {
      const result = await this.transaction.query<IntegrityEvidenceRow>(
        `INSERT INTO integrity_evidence
          (integrity_id, operation_id, exchange_session_id, package_id,
           study_ref_id, verification_stage, algorithm, source_digest,
           source_object_count, status, verified_at, created_at)
         SELECT $1, op.operation_id, e.session_id, p.package_id,
                s.study_ref_id, 'SOURCE_CAPTURE', $2, $3, $4,
                'PENDING', NULL, $5
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
          WHERE op.operation_id = $6
            AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
            AND op.state = 'CREATED'
         ON CONFLICT (operation_id, verification_stage)
           WHERE operation_id IS NOT NULL DO NOTHING
         RETURNING ${RETURNING_COLUMNS}`,
        [
          integrityId,
          input.manifest.algorithm,
          input.manifest.aggregateDigest,
          input.manifest.objectCount,
          input.now,
          input.operationId,
        ],
      );
      inserted = result.rows[0];
    } catch (error) {
      if (
        error instanceof SourceIntegrityEvidencePersistenceError ||
        error instanceof SourceIntegrityEvidenceUnavailableError ||
        error instanceof SourceIntegrityEvidenceConflictError
      ) {
        throw error;
      }
      throw new SourceIntegrityEvidencePersistenceError();
    }

    if (inserted) {
      const record = toRecord(inserted);
      if (
        record.operationId !== input.operationId.toLowerCase() ||
        record.algorithm !== input.manifest.algorithm ||
        record.sourceDigest !== input.manifest.aggregateDigest ||
        record.sourceObjectCount !== input.manifest.objectCount
      ) {
        throw new SourceIntegrityEvidenceConflictError();
      }
      return { record, created: true };
    }

    try {
      const existing = await this.transaction.query<IntegrityEvidenceRow>(
        `SELECT ${RETURNING_COLUMNS}
           FROM integrity_evidence
          WHERE operation_id = $1
            AND verification_stage = 'SOURCE_CAPTURE'`,
        [input.operationId],
      );
      if (existing.rowCount !== 1 || !existing.rows[0]) {
        throw new SourceIntegrityEvidenceUnavailableError();
      }
      const record = toRecord(existing.rows[0]);
      if (
        record.operationId !== input.operationId.toLowerCase() ||
        record.algorithm !== input.manifest.algorithm ||
        record.sourceDigest !== input.manifest.aggregateDigest ||
        record.sourceObjectCount !== input.manifest.objectCount
      ) {
        throw new SourceIntegrityEvidenceConflictError();
      }
      return { record, created: false };
    } catch (error) {
      if (
        error instanceof SourceIntegrityEvidenceUnavailableError ||
        error instanceof SourceIntegrityEvidenceConflictError
      ) {
        throw error;
      }
      throw new SourceIntegrityEvidencePersistenceError();
    }
  }
}
