import { types } from "node:util";

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
