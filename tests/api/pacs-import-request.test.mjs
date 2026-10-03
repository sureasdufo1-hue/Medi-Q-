import { describe, expect, it } from 'vitest';
import { parsePacsImportSubmission, parsePacsImportStatus, parsePacsImportOperationStatus,
  PacsImportRequestInvalidError, PacsImportStatusInvalidError } from '../../services/api/dist/pacs/application/pacs-import-request.parser.js';
import { pacsTransferOperationDigest } from '../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js';
import { pacsTransferOperationStates } from '../../services/api/dist/pacs/domain/pacs-transfer-operation.js';

const id = n => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const headers = () => ({ sessionId: id(1), tenantCandidate: id(2), idempotencyKey: id(3), correlationId: id(4) });
const body = () => ({ grantId: id(5), studyRefId: id(6) });
const request = () => ({ ...headers(), body: body() });
const receipt = () => ({ operationId: id(7), sessionId: id(1), studyRefId: id(6), sourceHospitalId: id(8),
  destinationHospitalId: id(9), integrityId: id(10), provenanceId: id(11), transferStatus: 'COMPLETED',
  destinationVerified: true, integrityStatus: 'VERIFIED', completionAuditRecorded: true, temporaryPayloadPurged: true });
const status = (state = 'CREATED') => ({ operationId: id(7), sessionId: id(1), operationState: state,
  completionConfirmed: state === 'COMPLETED', resendAllowed: false, updatedAt: '2026-10-04T00:00:00.000Z',
  ...(state === 'COMPLETED' ? { result: receipt() } : {}) });
const malformed = [undefined, null, false, true, 1, {}, [], [id(1)], '', ` ${id(1)}`, `${id(1)} `,
  `urn:uuid:${id(1)}`, id(1).replaceAll('-', ''), 'SENSITIVE_TEST_VALUE', `${id(1)}\n`];
function invalid(fn, input, ErrorType = PacsImportRequestInvalidError) {
  let caught;
  try { fn(input); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ErrorType);
  expect(caught.message).toBe(ErrorType === PacsImportRequestInvalidError ? 'PACS_IMPORT_REQUEST_INVALID' : 'PACS_IMPORT_STATUS_INVALID');
  expect(Object.keys(caught)).toEqual(['name']);
  expect(caught.cause).toBeUndefined();
}

describe('DEC-021 actual data-only import request validators', () => {
  it('omitted and literal true verification produce identical frozen normalized snapshots', () => {
    const r = request(); const result = parsePacsImportSubmission(r);
    expect(result).toEqual({ exchangeSessionId: id(1), tenantCandidate: id(2), idempotencyKey: id(3),
      correlationId: id(4), ...body(), verifyDestination: true });
    expect(Object.isFrozen(result)).toBe(true);
    expect(parsePacsImportSubmission({ ...r, body: { ...r.body, verifyDestination: true } })).toEqual(result);
    for (const field of Object.keys(headers())) r[field] = r[field].toUpperCase();
    for (const field of Object.keys(r.body)) r.body[field] = r.body[field].toUpperCase();
    expect(parsePacsImportSubmission(r)).toEqual(result);
    r.body.grantId = id(99); r.sessionId = id(99);
    expect(result.grantId).toBe(id(5)); expect(result.exchangeSessionId).toBe(id(1));
  });
  it('accepts null-prototype data records and status lookup using retained key, not operationId', () => {
    expect(parsePacsImportSubmission(Object.assign(Object.create(null), request(),
      { body: Object.assign(Object.create(null), body()) }))).toEqual(parsePacsImportSubmission(request()));
    const result = parsePacsImportStatus(headers());
    expect(Object.isFrozen(result)).toBe(true); expect(result.idempotencyKey).toBe(id(3));
    expect(result.operationId).toBeUndefined();
  });
  for (const field of Object.keys(headers())) it(`rejects all invalid/duplicate-array ${field} for both actions`, () => {
    for (const value of malformed) {
      invalid(parsePacsImportSubmission, { ...request(), [field]: value });
      invalid(parsePacsImportStatus, { ...headers(), [field]: value });
    }
    const r = request(); delete r[field]; invalid(parsePacsImportSubmission, r);
    const h = headers(); delete h[field]; invalid(parsePacsImportStatus, h);
  });
  for (const field of Object.keys(body())) it(`rejects invalid or missing body ${field}`, () => {
    for (const value of malformed) invalid(parsePacsImportSubmission, { ...request(), body: { ...body(), [field]: value } });
    const b = body(); delete b[field]; invalid(parsePacsImportSubmission, { ...request(), body: b });
  });
  it('does not coerce false/null/undefined/number/string verification or omit it implicitly', () => {
    for (const value of [false, null, undefined, 0, 1, 'true', 'false', [], {}])
      invalid(parsePacsImportSubmission, { ...request(), body: { ...body(), verifyDestination: value } });
  });
  for (const field of ['tenantId', 'actorId', 'consentId', 'principal', 'action', 'endpoint', 'credential', 'operationId', '__proto__'])
    it(`rejects unknown authority/transport field ${field} instead of stripping it`, () => {
      invalid(parsePacsImportSubmission, { ...request(), [field]: 'SENSITIVE_TEST_VALUE' });
      invalid(parsePacsImportSubmission, { ...request(), body: { ...body(), [field]: 'SENSITIVE_TEST_VALUE' } });
      invalid(parsePacsImportStatus, { ...headers(), [field]: 'SENSITIVE_TEST_VALUE' });
    });
  it('rejects wrong input/body shapes with fixed safe errors', () => {
    for (const value of [undefined, null, false, 1, '', [], new Date(), new Map(), Object.create({ inherited: true })]) {
      invalid(parsePacsImportSubmission, value); invalid(parsePacsImportStatus, value);
      invalid(parsePacsImportSubmission, { ...request(), body: value });
    }
  });
});

describe('DEC-021-A actual response binding, not authorization or evidence certification', () => {
  for (const state of pacsTransferOperationStates) it(`validates closed ${state} status without permitting resend`, () => {
    const r = status(state); const out = parsePacsImportOperationStatus(r);
    expect(out).toEqual(r); expect(Object.isFrozen(out)).toBe(true); expect(out.resendAllowed).toBe(false);
    if (state === 'COMPLETED') { expect(Object.isFrozen(out.result)).toBe(true); r.result.studyRefId = id(99); expect(out.result.studyRefId).toBe(id(6)); }
    r.operationId = id(99); expect(out.operationId).toBe(id(7));
  });
  it('normalizes uppercase result/envelope IDs before exact binding', () => {
    const r = status('COMPLETED'); r.operationId = r.operationId.toUpperCase(); r.result.sessionId = r.result.sessionId.toUpperCase();
    expect(parsePacsImportOperationStatus(r)).toEqual(status('COMPLETED'));
  });
  for (const field of ['operationId', 'sessionId']) it(`rejects structurally valid foreign completion ${field}`, () => {
    const r = status('COMPLETED'); r.result[field] = id(99);
    invalid(parsePacsImportOperationStatus, r, PacsImportStatusInvalidError);
  });
  for (const field of Object.keys(receipt())) it(`rejects missing or malformed receipt ${field}`, () => {
    const r = status('COMPLETED'); delete r.result[field]; invalid(parsePacsImportOperationStatus, r, PacsImportStatusInvalidError);
    for (const value of malformed.filter(value => value !== receipt()[field])) {
      const r2 = status('COMPLETED'); r2.result[field] = value; invalid(parsePacsImportOperationStatus, r2, PacsImportStatusInvalidError);
    }
  });
  it('rejects failed/pending success, wrong state flags, unknown fields and noncanonical/calendar-invalid timestamps', () => {
    for (const patch of [{ operationState: 'UNKNOWN' }, { completionConfirmed: true }, { resendAllowed: true },
      { result: receipt() }, { patientId: 'SENSITIVE_TEST_VALUE' }, { digest: 'x' }, { payload: 'x' }])
      invalid(parsePacsImportOperationStatus, { ...status(), ...patch }, PacsImportStatusInvalidError);
    for (const patch of [{ completionConfirmed: false }, { result: null }, { result: undefined }])
      invalid(parsePacsImportOperationStatus, { ...status('COMPLETED'), ...patch }, PacsImportStatusInvalidError);
    for (const value of ['2026-02-30T00:00:00.000Z', '2026-10-04T24:00:00.000Z', '2026-10-04T00:00:00Z',
      '2026-10-04T00:00:00.000+00:00', 'invalid', null, new Date()])
      invalid(parsePacsImportOperationStatus, { ...status(), updatedAt: value }, PacsImportStatusInvalidError);
    for (const patch of [{ transferStatus: 'FAILED' }, { integrityStatus: 'PENDING' }, { integrityStatus: 'FAILED' },
      { endpoint: 'x' }, { credential: 'SENSITIVE_TEST_VALUE' }])
      invalid(parsePacsImportOperationStatus, { ...status('COMPLETED'), result: { ...receipt(), ...patch } }, PacsImportStatusInvalidError);
  });
});

// Execute hostile input cases against every production entry/record layer.
for (const [label, fn, factory, wrap, ErrorType] of [
  ['submit', parsePacsImportSubmission, request, value => value, PacsImportRequestInvalidError],
  ['body', parsePacsImportSubmission, body, value => ({ ...request(), body: value }), PacsImportRequestInvalidError],
  ['lookup', parsePacsImportStatus, headers, value => value, PacsImportRequestInvalidError],
  ['status', parsePacsImportOperationStatus, () => status('COMPLETED'), value => value, PacsImportStatusInvalidError],
  ['result', parsePacsImportOperationStatus, receipt, value => ({ ...status('COMPLETED'), result: value }), PacsImportStatusInvalidError],
]) {
  it(`${label} rejects symbols/non-enumerables/accessors without invoking getters`, () => {
    let calls = 0; const first = Object.keys(factory())[0];
    for (const decorate of [obj => Object.defineProperty(obj, first, { get() { calls++; throw new Error('SENSITIVE_TEST_VALUE'); }, enumerable: true }),
      obj => Object.defineProperty(obj, first, { enumerable: false }),
      obj => Object.defineProperty(obj, 'hidden', { value: 'x', enumerable: false }),
      obj => Object.assign(obj, { [Symbol('hidden')]: 'x' })]) {
      const obj = factory(); decorate(obj); invalid(fn, wrap(obj), ErrorType);
    }
    expect(calls).toBe(0);
  });
  it(`${label} rejects Proxy/revoked Proxy before executing any trap`, () => {
    let calls = 0;
    const traps = Object.fromEntries(['get', 'getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'].map(key =>
      [key, () => { calls++; throw new Error('SENSITIVE_TEST_VALUE'); }]));
    invalid(fn, wrap(new Proxy(factory(), traps)), ErrorType);
    const revoked = Proxy.revocable(factory(), traps); revoked.revoke(); invalid(fn, wrap(revoked.proxy), ErrorType);
    expect(calls).toBe(0);
  });
}

it('normalized parsing agrees with existing canonical semantic digest and separates every authority dimension', () => {
  const r = parsePacsImportSubmission(request());
  const semantics = { tenantId: r.tenantCandidate, actorId: id(12), exchangeSessionId: r.exchangeSessionId,
    studyRefId: r.studyRefId, grantId: r.grantId, consentId: id(13), action: 'PACS_IMPORT' };
  const original = pacsTransferOperationDigest(semantics);
  expect(pacsTransferOperationDigest(Object.fromEntries(Object.entries(semantics).map(([k, v]) => [k, v.toUpperCase()])))).toBe(original);
  for (const field of ['tenantId', 'actorId', 'exchangeSessionId', 'studyRefId', 'grantId', 'consentId'])
    expect(pacsTransferOperationDigest({ ...semantics, [field]: id(99) })).not.toBe(original);
  expect(() => pacsTransferOperationDigest({ ...semantics, action: 'VIEW' })).toThrow('PACS_TRANSFER_OPERATION_SEMANTICS_INVALID');
  // Digest unit behavior is not signed identity, current Consent or real durable UQ/concurrency proof.
});
