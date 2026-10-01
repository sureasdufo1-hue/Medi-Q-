import type { PoolClient, QueryResultRow } from "pg";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DICOM_UID_PATTERN = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/;

export interface SourceCaptureScope {
  readonly operationId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly packageId: string;
  readonly patientRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly sessionState: string;
  readonly operationState: string;
  readonly studyInstanceUid: string;
  readonly seriesCount: number | null;
  readonly instanceCount: number | null;
}

export class SourceCaptureScopePersistenceError extends Error {
  constructor() {
    super("SOURCE_CAPTURE_SCOPE_UNAVAILABLE");
    this.name = "SourceCaptureScopePersistenceError";
  }
}

interface SourceCaptureScopeRow extends QueryResultRow {
  operation_id: string;
  tenant_id: string;
  exchange_session_id: string;
  study_ref_id: string;
  operation_state: string;
  patient_ref_id: string;
  source_hospital_id: string;
  destination_hospital_id: string;
  session_state: string;
  package_id: string;
  study_instance_uid: string;
  series_count: number | null;
  instance_count: number | null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validStudyUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    DICOM_UID_PATTERN.test(value)
  );
}

function validCount(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function toScope(row: SourceCaptureScopeRow): SourceCaptureScope {
  if (
    !validUuid(row.operation_id) ||
    !validUuid(row.tenant_id) ||
    !validUuid(row.exchange_session_id) ||
    !validUuid(row.study_ref_id) ||
    !validUuid(row.package_id) ||
    !validUuid(row.patient_ref_id) ||
    !validUuid(row.source_hospital_id) ||
    !validUuid(row.destination_hospital_id) ||
    typeof row.operation_state !== "string" ||
    typeof row.session_state !== "string" ||
    !validStudyUid(row.study_instance_uid) ||
    !validCount(row.series_count) ||
    !validCount(row.instance_count)
  ) {
    throw new SourceCaptureScopePersistenceError();
  }

  return Object.freeze({
    operationId: row.operation_id.toLowerCase(),
    tenantId: row.tenant_id.toLowerCase(),
    exchangeSessionId: row.exchange_session_id.toLowerCase(),
    studyRefId: row.study_ref_id.toLowerCase(),
    packageId: row.package_id.toLowerCase(),
    patientRefId: row.patient_ref_id.toLowerCase(),
    sourceHospitalId: row.source_hospital_id.toLowerCase(),
    destinationHospitalId: row.destination_hospital_id.toLowerCase(),
    sessionState: row.session_state,
    operationState: row.operation_state,
    studyInstanceUid: row.study_instance_uid,
    seriesCount: row.series_count,
    instanceCount: row.instance_count,
  });
}

/** Resolves every PACS/Study boundary from the Tenant-visible operation graph. */
export class PostgresSourceCaptureScopeRepository {
  constructor(private readonly transaction: Pick<PoolClient, "query">) {}

  async findByOperationId(
    operationId: string,
    tenantId: string,
  ): Promise<SourceCaptureScope | null> {
    if (!validUuid(operationId) || !validUuid(tenantId)) {
      throw new SourceCaptureScopePersistenceError();
    }

    try {
      const result = await this.transaction.query<SourceCaptureScopeRow>(
        `SELECT op.operation_id::text AS operation_id,
                op.tenant_id::text AS tenant_id,
                op.exchange_session_id::text AS exchange_session_id,
                op.study_ref_id::text AS study_ref_id,
                op.state AS operation_state,
                e.patient_ref_id::text AS patient_ref_id,
                e.source_hospital_id::text AS source_hospital_id,
                e.destination_hospital_id::text AS destination_hospital_id,
                e.state AS session_state,
                p.package_id::text AS package_id,
                sr.study_instance_uid AS study_instance_uid,
                sr.series_count AS series_count,
                sr.instance_count AS instance_count
           FROM pacs_transfer_operations AS op
           JOIN exchange_sessions AS e
             ON e.session_id = op.exchange_session_id
           JOIN study_references AS sr
             ON sr.study_ref_id = op.study_ref_id
            AND sr.source_hospital_id = e.source_hospital_id
           JOIN imaging_packages AS p
             ON p.package_id = sr.package_id
            AND p.exchange_session_id = e.session_id
            AND p.patient_ref_id = e.patient_ref_id
            AND p.source_hospital_id = e.source_hospital_id
          WHERE op.operation_id = $1::uuid
            AND op.tenant_id = $2::uuid
            AND op.tenant_id = NULLIF(current_setting('mediq.tenant_id', true), '')::uuid`,
        [operationId.toLowerCase(), tenantId.toLowerCase()],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1) throw new SourceCaptureScopePersistenceError();
      return toScope(result.rows[0]!);
    } catch (error) {
      if (error instanceof SourceCaptureScopePersistenceError) throw error;
      throw new SourceCaptureScopePersistenceError();
    }
  }
}

export function sameSourceCaptureBinding(
  left: SourceCaptureScope,
  right: SourceCaptureScope,
): boolean {
  return (
    left.operationId === right.operationId &&
    left.tenantId === right.tenantId &&
    left.exchangeSessionId === right.exchangeSessionId &&
    left.studyRefId === right.studyRefId &&
    left.packageId === right.packageId &&
    left.patientRefId === right.patientRefId &&
    left.sourceHospitalId === right.sourceHospitalId &&
    left.destinationHospitalId === right.destinationHospitalId &&
    left.studyInstanceUid === right.studyInstanceUid &&
    left.seriesCount === right.seriesCount &&
    left.instanceCount === right.instanceCount
  );
}
