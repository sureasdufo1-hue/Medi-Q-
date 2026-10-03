import { types } from "node:util";
import { pacsTransferOperationStates, type PacsTransferOperationState } from "../domain/pacs-transfer-operation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PacsImportRequestInvalidError extends Error {
  constructor() {
    super("PACS_IMPORT_REQUEST_INVALID");
    this.name = "PacsImportRequestInvalidError";
  }
}

export interface PacsImportSubmissionRequest {
  readonly exchangeSessionId: string;
  /** An untrusted membership selector, never a resolved Tenant/Actor claim. */
  readonly tenantCandidate: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly grantId: string;
  readonly studyRefId: string;
  readonly verifyDestination: true;
}

export interface PacsImportStatusRequest {
  readonly exchangeSessionId: string;
  readonly tenantCandidate: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

function data(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || types.isProxy(value) || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new PacsImportRequestInvalidError();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (required.some(key => !Object.hasOwn(fields, key)) || Reflect.ownKeys(fields).some(key =>
    typeof key !== "string" || (!required.includes(key) && !optional.includes(key)) ||
    !fields[key]?.enumerable || !Object.hasOwn(fields[key]!, "value"))) throw new PacsImportRequestInvalidError();
  return Object.fromEntries(Object.keys(fields).map(key => [key, fields[key]!.value]));
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new PacsImportRequestInvalidError();
  return value.toLowerCase();
}

function headers(fields: Record<string, unknown>): PacsImportStatusRequest {
  return Object.freeze({
    exchangeSessionId: uuid(fields.sessionId),
    tenantCandidate: uuid(fields.tenantCandidate),
    idempotencyKey: uuid(fields.idempotencyKey),
    correlationId: uuid(fields.correlationId),
  });
}

/**
 * Data validation only: no principal, resolver, SQL, Grant lookup or DICOM I/O.
 * Correlation ID is supplied by the trusted HTTP layer after bounded validation
 * or server generation; neither it nor the key/selector gives access authority.
 */
export function parsePacsImportSubmission(input: unknown): PacsImportSubmissionRequest {
  try {
    const fields = data(input, ["sessionId", "tenantCandidate", "idempotencyKey", "correlationId", "body"]);
    const body = data(fields.body, ["grantId", "studyRefId"], ["verifyDestination"]);
    if (Object.hasOwn(body, "verifyDestination") && body.verifyDestination !== true) throw new PacsImportRequestInvalidError();
    return Object.freeze({ ...headers(fields), grantId: uuid(body.grantId), studyRefId: uuid(body.studyRefId), verifyDestination: true });
  } catch { throw new PacsImportRequestInvalidError(); }
}

/** Poll by retained request key, even when the first response lost operationId. */
export function parsePacsImportStatus(input: unknown): PacsImportStatusRequest {
  try { return headers(data(input, ["sessionId", "tenantCandidate", "idempotencyKey", "correlationId"])); }
  catch { throw new PacsImportRequestInvalidError(); }
}

export class PacsImportStatusInvalidError extends Error {
  constructor() {
    super("PACS_IMPORT_STATUS_INVALID");
    this.name = "PacsImportStatusInvalidError";
  }
}

export interface PacsImportVerifiedResult {
  readonly operationId: string;
  readonly sessionId: string;
  readonly studyRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly integrityId: string;
  readonly provenanceId: string;
  readonly transferStatus: "COMPLETED";
  readonly destinationVerified: true;
  readonly integrityStatus: "VERIFIED";
  readonly completionAuditRecorded: true;
  readonly temporaryPayloadPurged: true;
}

interface StatusEnvelope {
  readonly operationId: string;
  readonly sessionId: string;
  readonly resendAllowed: false;
  readonly updatedAt: string;
}

export type PacsImportOperationStatus = StatusEnvelope & (
  | { readonly operationState: "COMPLETED"; readonly completionConfirmed: true; readonly result: PacsImportVerifiedResult }
  | { readonly operationState: Exclude<PacsTransferOperationState, "COMPLETED">; readonly completionConfirmed: false }
);

const resultFields = ["operationId", "sessionId", "studyRefId", "sourceHospitalId", "destinationHospitalId",
  "integrityId", "provenanceId", "transferStatus", "destinationVerified", "integrityStatus",
  "completionAuditRecorded", "temporaryPayloadPurged"] as const;

/** Shape/literal/binding validation only. Never certifies destination or purge facts. */
export function parsePacsImportOperationStatus(input: unknown): PacsImportOperationStatus {
  try {
    const f = data(input, ["operationId", "sessionId", "operationState", "completionConfirmed", "resendAllowed", "updatedAt"], ["result"]);
    if (typeof f.operationState !== "string" ||
      !pacsTransferOperationStates.includes(f.operationState as PacsTransferOperationState) ||
      f.resendAllowed !== false || typeof f.updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(f.updatedAt) ||
      new Date(f.updatedAt).toISOString() !== f.updatedAt) throw new PacsImportStatusInvalidError();
    const envelope: StatusEnvelope = Object.freeze({ operationId: uuid(f.operationId), sessionId: uuid(f.sessionId),
      resendAllowed: false, updatedAt: f.updatedAt });
    if (f.operationState !== "COMPLETED") {
      if (f.completionConfirmed !== false || Object.hasOwn(f, "result")) throw new PacsImportStatusInvalidError();
      return Object.freeze({ ...envelope, operationState: f.operationState as Exclude<PacsTransferOperationState, "COMPLETED">,
        completionConfirmed: false });
    }
    if (f.completionConfirmed !== true) throw new PacsImportStatusInvalidError();
    const r = data(f.result, resultFields);
    if (r.transferStatus !== "COMPLETED" || r.destinationVerified !== true || r.integrityStatus !== "VERIFIED" ||
      r.completionAuditRecorded !== true || r.temporaryPayloadPurged !== true) throw new PacsImportStatusInvalidError();
    const result: PacsImportVerifiedResult = Object.freeze({ operationId: uuid(r.operationId), sessionId: uuid(r.sessionId),
      studyRefId: uuid(r.studyRefId), sourceHospitalId: uuid(r.sourceHospitalId), destinationHospitalId: uuid(r.destinationHospitalId),
      integrityId: uuid(r.integrityId), provenanceId: uuid(r.provenanceId), transferStatus: "COMPLETED", destinationVerified: true,
      integrityStatus: "VERIFIED", completionAuditRecorded: true, temporaryPayloadPurged: true });
    if (result.operationId !== envelope.operationId || result.sessionId !== envelope.sessionId) throw new PacsImportStatusInvalidError();
    return Object.freeze({ ...envelope, operationState: "COMPLETED", completionConfirmed: true, result });
  } catch { throw new PacsImportStatusInvalidError(); }
}
