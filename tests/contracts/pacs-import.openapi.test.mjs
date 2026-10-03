// Actual normative YAML/JSON Schema; does not contact HTTP/DB/PACS or prove destination facts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const doc = parseDocument(read('docs/OPENAPI.yaml'), { uniqueKeys: true });
assert.deepEqual(doc.errors, [], 'ENTIRE_YAML_MUST_PARSE_WITH_UNIQUE_KEYS');
const api = doc.toJS({ maxAliasCount: 0 });
const clone = value => structuredClone(value);
const id = n => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const path = '/exchange-sessions/{sessionId}/actions/pacs-import';
const submit = api.paths[path].post;
const lookup = api.paths[`${path}/status`].get;
const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
function pointer(ref) {
  assert.ok(ref.startsWith('#/'), 'ONLY_LOCAL_CONTRACT_REFS');
  return ref.slice(2).split('/').reduce((obj, encoded) => {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    assert.ok(Object.hasOwn(obj, key), `REFERENCE_NOT_FOUND:${ref}`);
    return obj[key];
  }, api);
}
const resolved = value => value.$ref ? pointer(value.$ref) : value;
function walk(value, visitor) {
  if (!value || typeof value !== 'object') return;
  visitor(value);
  for (const child of Object.values(value)) walk(child, visitor);
}

// Pointer routing only: schemas come from the parsed normative YAML, not hand-written substitutes.
// Keep only reachable definitions so unrelated OpenAPI annotations cannot mask strict errors here.
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(ajv, { mode: 'full' });
function validator(schema) {
  const definitions = {};
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    if (value.$ref) {
      const match = /^#\/components\/schemas\/([^/]+)$/.exec(value.$ref);
      assert.ok(match, 'SCHEMA_REF_ROUTING_ONLY');
      const name = match[1];
      if (!Object.hasOwn(definitions, name)) {
        definitions[name] = {}; // guard recursive definitions
        definitions[name] = rewrite(pointer(value.$ref));
      }
      return { ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref').map(([key, v]) => [key, rewrite(v)])),
        $ref: `#/$defs/${name}` };
    }
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, rewrite(v)]));
  }
  const routed = rewrite(schema);
  return ajv.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...routed, $defs: definitions });
}
const named = name => validator({ $ref: `#/components/schemas/${name}` });
function accepts(validate, fixture, expected = true) {
  const before = clone(fixture);
  assert.equal(validate(fixture), expected, JSON.stringify(validate.errors));
  assert.deepEqual(fixture, before, 'VALIDATION_MUST_NOT_COERCE_INSERT_DEFAULTS_OR_STRIP_FIELDS');
}
const body = () => ({ grantId: id(1), studyRefId: id(2) });
const receipt = () => ({ operationId: id(3), sessionId: id(4), studyRefId: id(2), sourceHospitalId: id(5),
  destinationHospitalId: id(6), integrityId: id(7), provenanceId: id(8), transferStatus: 'COMPLETED',
  destinationVerified: true, integrityStatus: 'VERIFIED', completionAuditRecorded: true, temporaryPayloadPurged: true });
const states = ['CREATED', 'PREFLIGHT_PASSED', 'STOW_STARTED', 'VERIFYING', 'DENIED', 'FAILED', 'PARTIAL', 'RESULT_UNKNOWN'];
const status = (state = 'CREATED') => ({ operationId: id(3), sessionId: id(4), operationState: state,
  completionConfirmed: state === 'COMPLETED', resendAllowed: false, updatedAt: '2026-10-04T00:00:00.000Z',
  ...(state === 'COMPLETED' ? { result: receipt() } : {}) });
const actionError = code => ({ code, message: 'PACS import request could not be completed.', correlationId: id(9) });
const notCompleted = (state, code) => ({ code, message: 'PACS import is not confirmed complete.', correlationId: id(9), operation: status(state) });
const codeFor = state => ({ DENIED: 'PACS_IMPORT_DENIED', FAILED: 'PACS_IMPORT_FAILED', PARTIAL: 'PACS_IMPORT_PARTIAL',
  RESULT_UNKNOWN: 'PACS_IMPORT_RESULT_UNKNOWN' })[state] ?? 'PACS_IMPORT_IN_PROGRESS';
const response = (operation, http) => resolved(operation.responses[String(http)]);
const responseSchema = (operation, http) => response(operation, http).content['application/json'].schema;

test('entire normative YAML unique-key parse, all local refs, real method/path/operation IDs and security bindings', () => {
  assert.equal(api.openapi, '3.1.0'); assert.equal(api.info.version, '1.3.0');
  let references = 0;
  walk(api, node => { if (node.$ref) { pointer(node.$ref); references++; } });
  assert.ok(references > 100);
  const operations = [];
  for (const [path, item] of Object.entries(api.paths)) {
    const methods = Object.keys(item).filter(key => httpMethods.includes(key));
    assert.ok(methods.length > 0, `ORPHAN_PATH:${path}`);
    assert.ok(Object.keys(item).every(key => httpMethods.includes(key) || ['summary', 'description', 'parameters', 'servers', '$ref'].includes(key) || key.startsWith('x-')));
    for (const method of methods) {
      const op = item[method]; operations.push(op.operationId);
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(resolved);
      const pathNames = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(params.filter(p => p.in === 'path').map(p => p.name).sort(), pathNames);
      assert.ok(params.filter(p => p.in === 'path').every(p => p.required === true));
      assert.equal(new Set(params.map(p => `${p.in}:${p.name}`)).size, params.length);
      const security = op.security ?? api.security;
      if (op.operationId.startsWith('getHealth')) assert.deepEqual(security, []);
      else assert.deepEqual(security, [{ bearerAuth: [] }]);
      for (const requirement of security) for (const name of Object.keys(requirement)) assert.ok(Object.hasOwn(api.components.securitySchemes, name));
    }
  }
  assert.equal(new Set(operations).size, operations.length);
  assert.deepEqual(operations.sort(), ['getHealthLiveness', 'getHealthReadiness', 'createExchangeSession', 'getExchangeSession',
    'validateDestinationPatientMapping', 'listExchangeStudies', 'requestConsent', 'approveConsent', 'withdrawConsent',
    'issueTransferGrant', 'revokeTransferGrant', 'authorizeViewerAccess', 'getViewerSession', 'closeViewerSession',
    'retrieveViewerDicomInstance', 'retrieveViewerFrame', 'downloadDicomStudy', 'importStudyToDestinationPacs',
    'getOwnedPacsImportStatus', 'getExchangeProvenance', 'getExchangeAuditEvents'].sort());
});

test('strict parse rejects duplicate-key corruption instead of silently keeping the last action', () => {
  const corrupted = parseDocument('paths:\n  /example:\n    get: {}\n  /example:\n    post: {}\n', { uniqueKeys: true });
  assert.ok(corrupted.errors.some(e => e.code === 'DUPLICATE_KEY'));
});

test('synchronous verified-only action and retained-key read-only status, no async202 or resend endpoint', () => {
  for (const op of [submit, lookup]) {
    const params = op.parameters.map(resolved);
    assert.equal(params.find(p => p.name === 'Idempotency-Key').required, true);
    assert.equal(params.find(p => p.name === 'X-Tenant-ID').required, true);
    assert.equal(params.find(p => p.name === 'sessionId').required, true);
    assert.equal(params.find(p => p.name === 'X-Correlation-ID').required, false);
    const key = validator(params.find(p => p.name === 'Idempotency-Key').schema);
    accepts(key, id(1)); accepts(key, id(1).toUpperCase());
    for (const v of [null, [id(1)], ` ${id(1)}`, `urn:uuid:${id(1)}`, 'x']) accepts(key, v, false);
    assert.equal(op.responses['202'], undefined);
    assert.equal(op['x-mediq-cache-control'], 'no-store');
    for (const [http, value] of Object.entries(op.responses)) {
      const headers = resolved(value).headers;
      const cache = resolved(headers['Cache-Control']);
      assert.equal(cache.required, true); accepts(validator(cache.schema), 'no-store');
      accepts(validator(cache.schema), 'public', false);
      if (headers['Idempotency-Replayed']) {
        assert.ok(op === submit && ['200', '409'].includes(http));
        const replay = validator(headers['Idempotency-Replayed'].schema);
        accepts(replay, 'true'); accepts(replay, true, false); accepts(replay, 'false', false);
      }
    }
  }
  assert.deepEqual(Object.keys(api.paths[`${path}/status`]), ['get']);
  assert.equal(lookup.requestBody, undefined);
  assert.ok(!Object.keys(api.paths).some(p => /pacs-import.*(?:retry|resend|reconcile)/.test(p)));
});

test('actual action schema permits only grant/study and omitted/literal true verification without default insertion', () => {
  const validate = validator(submit.requestBody.content['application/json'].schema);
  accepts(validate, body()); accepts(validate, { ...body(), verifyDestination: true });
  for (const v of [false, null, 1, 0, 'true', [], {}]) accepts(validate, { ...body(), verifyDestination: v }, false);
  for (const field of ['grantId', 'studyRefId']) {
    const absent = body(); delete absent[field]; accepts(validate, absent, false);
    for (const v of [null, 1, [], '', `urn:uuid:${id(1)}`, `${id(1)} `]) accepts(validate, { ...body(), [field]: v }, false);
  }
  for (const field of ['actorId', 'tenantId', 'consentId', 'action', 'endpoint', 'credential'])
    accepts(validate, { ...body(), [field]: 'TEST-ONLY' }, false);
});

test('actual200 result requires every final evidence ID/literal and rejects incomplete/failed/pending/secret projections', () => {
  const validate = validator(responseSchema(submit, 200)); accepts(validate, receipt());
  for (const field of Object.keys(receipt())) {
    const absent = receipt(); delete absent[field]; accepts(validate, absent, false);
    for (const v of [null, {}, []]) accepts(validate, { ...receipt(), [field]: v }, false);
  }
  for (const field of ['destinationVerified', 'completionAuditRecorded', 'temporaryPayloadPurged']) {
    accepts(validate, { ...receipt(), [field]: false }, false);
    accepts(validate, { ...receipt(), [field]: 'true' }, false);
  }
  for (const field of ['operationId', 'sessionId', 'studyRefId', 'sourceHospitalId', 'destinationHospitalId', 'integrityId', 'provenanceId']) {
    accepts(validate, { ...receipt(), [field]: id(99).toUpperCase() });
    for (const v of [`urn:uuid:${id(99)}`, `${id(99)} `, `${id(99)}\n`, id(99).replaceAll('-', '')])
      accepts(validate, { ...receipt(), [field]: v }, false);
  }
  for (const state of [...states, 'PENDING']) accepts(validate, { ...receipt(), transferStatus: state }, false);
  for (const integrity of ['PENDING', 'FAILED', 'NOT_APPLICABLE']) accepts(validate, { ...receipt(), integrityStatus: integrity }, false);
  for (const field of ['patientId', 'sopInstanceUid', 'digest', 'payload', 'endpoint', 'credential', 'rawReason'])
    accepts(validate, { ...receipt(), [field]: 'TEST-ONLY' }, false);
});

test('all durable states keep no-resend and separate noncompletion from verified completion', () => {
  const validate = validator(responseSchema(lookup, 200));
  for (const state of [...states, 'COMPLETED']) {
    const s = status(state); accepts(validate, s);
    for (const field of Object.keys(s)) { const absent = clone(s); delete absent[field]; accepts(validate, absent, false); }
    accepts(validate, { ...s, resendAllowed: true }, false);
    accepts(validate, { ...s, completionConfirmed: !s.completionConfirmed }, false);
    accepts(validate, { ...s, patientId: 'TEST-ONLY' }, false);
    if (state !== 'COMPLETED') accepts(validate, { ...s, result: receipt() }, false);
  }
  for (const value of ['UNKNOWN', 'EXPIRED', 'COMPLETE', null]) accepts(validate, { ...status(), operationState: value }, false);
  for (const field of ['operationId', 'sessionId'])
    accepts(validate, { ...status(), [field]: `urn:uuid:${id(99)}` }, false);
  for (const value of ['2026-02-30T00:00:00.000Z', '2026-10-04T24:00:00.000Z', '2026-10-04T00:00:00Z',
    '2026-10-04T00:00:00.000+00:00', 'bad']) accepts(validate, { ...status(), updatedAt: value }, false);
});

test('standard JSON Schema does not claim cross-field equality: compiled production validator must check binding', () => {
  const validate = named('PacsImportCompletedStatus');
  for (const field of ['operationId', 'sessionId']) {
    const foreign = status('COMPLETED'); foreign.result[field] = id(99);
    // Structural acceptance explicitly NOT full acceptance. Actual production rejection tested by Vitest.
    accepts(validate, foreign);
  }
  assert.match(api.components.schemas.PacsImportCompletedStatus.description, /application checks.*binding/);
});

test('every state/error-code pair validates only the corresponding noncompletion partition', () => {
  const validate = named('PacsImportNotCompleted');
  const codes = ['PACS_IMPORT_IN_PROGRESS', 'PACS_IMPORT_DENIED', 'PACS_IMPORT_FAILED', 'PACS_IMPORT_PARTIAL', 'PACS_IMPORT_RESULT_UNKNOWN'];
  for (const state of states) for (const code of codes) accepts(validate, notCompleted(state, code), code === codeFor(state));
  const good = notCompleted('RESULT_UNKNOWN', codeFor('RESULT_UNKNOWN'));
  for (const patch of [{ message: 'raw exception' }, { correlationId: 'bad' }, { details: 'secret' }, { operation: status('COMPLETED') }])
    accepts(validate, { ...good, ...patch }, false);
});

const errors = ['PACS_IMPORT_REQUEST_INVALID', 'AUTHENTICATION_REQUIRED', 'ACCESS_DENIED', 'NOT_FOUND',
  'IDEMPOTENCY_KEY_CONFLICT', 'PACS_IMPORT_OPERATION_CONFLICT', 'INVALID_SESSION_STATE', 'PATIENT_MAPPING_INVALID',
  'DESTINATION_MISMATCH', 'CONSENT_MISMATCH', 'DICOMWEB_FAILURE', 'SERVICE_UNAVAILABLE'];
const permitted = { 400: ['PACS_IMPORT_REQUEST_INVALID'], 401: ['AUTHENTICATION_REQUIRED'], 403: ['ACCESS_DENIED'],
  404: ['NOT_FOUND'], 409: errors.slice(4, 10), 502: ['DICOMWEB_FAILURE'], 503: ['SERVICE_UNAVAILABLE'] };
for (const [label, op] of [['submit', submit], ['status', lookup]]) {
  for (const http of Object.keys(op.responses).filter(code => code !== '200')) test(`${label} ${http} accepts exactly its safe HTTP error-code partition`, () => {
    const validate = validator(responseSchema(op, http));
    for (const code of errors) accepts(validate, actionError(code), permitted[http].includes(code));
    const example = actionError(permitted[http][0]);
    for (const patch of [{ message: 'raw exception' }, { details: 'secret' }, { correlationId: 'bad' }, { code: 'UNKNOWN_CODE' }])
      accepts(validate, { ...example, ...patch }, false);
    for (const state of states) accepts(validate, notCompleted(state, codeFor(state)), op === submit && http === '409');
  });
}

test('development validators are exactly pinned and production lock inventory remains the approved98 entries', () => {
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of Object.entries({ yaml: '2.9.1', ajv: '8.20.0', 'ajv-formats': '3.0.1' })) {
    assert.equal(pkg.devDependencies[name], version); assert.equal(lock.packages[''].devDependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
    assert.equal(pkg.dependencies?.[name], undefined, 'NO_NEW_DIRECT_RUNTIME_DEPENDENCY');
    if (name === 'yaml') assert.equal(lock.packages[`node_modules/${name}`].dev, true);
    else {
      // Existing Fastify transitive runtime entries are shared, not dev-only.
      assert.equal(lock.packages[`node_modules/${name}`].dev, undefined);
      assert.ok(Object.hasOwn(lock.packages['node_modules/@fastify/ajv-compiler'].dependencies, name));
    }
  }
  const tuples = Object.entries(lock.packages).filter(([path, p]) => path.startsWith('node_modules/') && p.dev !== true)
    .map(([path, p]) => [path, p.version, p.resolved, p.integrity]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.equal(tuples.length, 98);
  assert.equal(createHash('sha256').update(JSON.stringify(tuples)).digest('hex'), '4ba6a41afdda2504c4f269f75fed2e18fd3d1e0059ad66036d76362fd17cd704');
  assert.equal(pkg.scripts['test:pacs-import-contract'], 'node --test tests/contracts/pacs-import.openapi.test.mjs');
});

test('both real action contracts trace requirements/security/Acceptance and preserve documented UI separation', () => {
  const requirements = read('docs/REQUIREMENTS.md'), security = read('docs/SECURITY-REQUIREMENTS.md');
  const allAcceptance = read('docs/ACCEPTANCE-TESTS.md');
  const start = allAcceptance.indexOf('### DEC-021 PACS Import submission/replay/status contract');
  const end = allAcceptance.indexOf('### DEC-020-R3-B', start);
  assert.ok(start >= 0 && end > start, 'API_ACCEPTANCE_SECTION_REQUIRED');
  const acceptance = allAcceptance.slice(start, end);
  assert.ok(acceptance.includes('TC-PACS-001-API-*'), 'API_ROWS_MUST_NOT_BE_SATISFIED_BY_DESTBYTES_OR_OTHER_TABLE');
  for (const op of [submit, lookup]) {
    assert.ok(op['x-mediq-requirements'].length > 0 && op['x-mediq-security'].length > 0 && op['x-mediq-acceptance'].length > 0);
    for (const id of op['x-mediq-requirements']) assert.ok(requirements.includes(id), `REQ_TRACE:${id}`);
    for (const id of op['x-mediq-security']) assert.ok(security.includes(id), `SEC_TRACE:${id}`);
    for (const id of op['x-mediq-acceptance']) {
      assert.match(id, /^TC-PACS-001-API-00[1-7]$/);
      assert.match(acceptance, new RegExp(`\\| ${id.slice(-3)} \\|`));
    }
  }
  for (const file of ['docs/P0-WEB-UI-UX-SPEC.md', 'docs/SAAS-SCREEN-DESIGN-SPEC.md']) {
    const text = read(file);
    assert.match(text, /DEC-021\/021-A/); assert.match(text, /NOT IMPLEMENTED\/NOT RUN|NOT IMPLEMENTED/);
    assert.match(text, /resendAllowed=false/);
    assert.ok(/status.*200.*(?:아니라|아니|not)/.test(text), 'UI_STATUS_HTTP200_IS_NOT_TRANSFER_COMPLETION');
  }
});
