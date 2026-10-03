import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { OrthancDicomwebAdapter } from '../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js';
import { TEST_HOSPITAL_A_ID as A, TEST_HOSPITAL_B_ID as B, TestOrthancEndpointResolver } from '../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js';
import { snapshotDestinationVerificationRequest } from '../../services/api/dist/dicom/infrastructure/destination-verification-request.js';
import { buildSourceIntegrityCapture } from '../../services/api/dist/integrity/application/source-integrity-manifest.builder.js';

const TS = '1.2.840.10008.1.2.1';
const config = (patch = {}) => ({ runtimeProfile: 'container', environment: 'test', orthancAUrl: 'https://orthanc-a:8042',
  orthancBUrl: 'https://orthanc-b:8042', orthancAUsername: 'synthetic-test-a', orthancAPassword: 'synthetic-test-only-a',
  orthancBUsername: 'synthetic-test-b', orthancBPassword: 'synthetic-test-only-b', ...patch });
const request = (hospitalId = B, signal = new AbortController().signal) => ({ context: { hospitalId, signal,
  correlationId: 'destbytes-test' }, studyInstanceUid: '2.25.1', seriesInstanceUid: '2.25.2', sopInstanceUid: '2.25.3' });
function multipart(bytes = Buffer.from('SYNTHETIC-RAW-BYTES'), { syntax = TS, type = 'application/dicom', close = true, extra = false } = {}) {
  const part = Buffer.concat([Buffer.from(`--test\r\nContent-Type: ${type}; transfer-syntax=${syntax}\r\nContent-Length: ${bytes.length}\r\n\r\n`), bytes,
    Buffer.from(`\r\n${extra ? '--test\r\nContent-Type: application/dicom\r\n\r\nEXTRA\r\n' : ''}${close ? '--test--\r\n' : ''}`)]);
  return new Response(part, { headers: { 'content-type': 'multipart/related; type="application/dicom"; boundary="test"' } });
}
function setup(reply = () => multipart(), patch = {}) {
  const fetch = vi.fn(reply), resolver = new TestOrthancEndpointResolver(config(patch));
  return { fetch, resolver, adapter: new OrthancDicomwebAdapter(resolver, { fetch, concurrency: 1,
    deadlines: { wadoHeadersMs: 1000, wadoIdleMs: 1000, wadoTotalMs: 3000 } }) };
}
async function consume(body) {
  const reader = body.getReader(); const chunks = [];
  try { while (true) { const next = await reader.read(); if (next.done) break; chunks.push(Buffer.from(next.value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks); // Tiny synthetic unit fixture only, never a production Study buffer.
}

it('distinct real resolver capability is B-only and does not open generic B WADO/Viewer or A STOW', async () => {
  const { resolver, adapter, fetch } = setup();
  expect(resolver.resolve(request().context, 'VERIFY_INSTANCE_BYTES').origin.hostname).toBe('orthanc-b');
  expect(() => resolver.resolve(request(A).context, 'VERIFY_INSTANCE_BYTES')).toThrow('DICOM_ENDPOINT_DENIED');
  for (const op of ['WADO_INSTANCE', 'WADO_FRAME', 'WADO_STUDY_METADATA'])
    expect(() => resolver.resolve(request().context, op)).toThrow('DICOM_ENDPOINT_DENIED');
  await expect(adapter.retrieveInstanceStream(request())).rejects.toThrow('DICOM_ENDPOINT_DENIED');
  await expect(adapter.retrieveDestinationVerificationInstanceStream(request(A))).rejects.toThrow('DICOM_ENDPOINT_DENIED');
  const caps = await adapter.checkCapability({ context: request().context });
  expect(caps.operations).toEqual(['QIDO_STUDIES', 'STOW_INSTANCE', 'STOW_STUDY', 'VERIFY_STUDY', 'VERIFY_INSTANCE_BYTES']);
  expect((await adapter.checkCapability({ context: request(A).context })).operations).not.toContain('VERIFY_INSTANCE_BYTES');
  expect(fetch).not.toHaveBeenCalled();
});

it('B-only multipart bytes are exact, safe projected and feed the existing canonical streaming hash builder', async () => {
  const bytes = Buffer.from('SYNTHETIC-RAW-BYTES');
  const { adapter, fetch } = setup(() => multipart(bytes));
  const capture = await buildSourceIntegrityCapture({ expectedInstanceCount: 1, instances: [{ sopInstanceUid: '2.25.3',
    openStream: () => adapter.retrieveDestinationVerificationInstanceStream(request()) }] });
  expect(capture.instances[0]).toEqual({ sopInstanceUid: '2.25.3', byteLength: bytes.length,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
  expect(capture.manifest.objectCount).toBe(1); expect(capture.manifest.totalBytes).toBe(bytes.length);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0].href).toBe('https://orthanc-b:8042/dicom-web/studies/2.25.1/series/2.25.2/instances/2.25.3');
  expect(fetch.mock.calls[0][1].method ?? 'GET').toBe('GET');
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
  const stream = await adapter.retrieveDestinationVerificationInstanceStream(request());
  expect(Object.keys(stream).sort()).toEqual(['body', 'contentLength', 'mediaType', 'sopInstanceUid', 'transferSyntaxUid'].sort());
  expect(await consume(stream.body)).toEqual(bytes);
  // No actual Orthanc, identity check, current authorization or product completion inferred.
});

it('snapshots exact fields/context before async admission, preserving the original cancellation owner', async () => {
  const { adapter, fetch } = setup(); const r = request();
  const snapshot = snapshotDestinationVerificationRequest(r);
  expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(snapshot.context)).toBe(true);
  const pending = adapter.retrieveDestinationVerificationInstanceStream(r);
  r.context.hospitalId = A; r.context.correlationId = 'CHANGED'; r.studyInstanceUid = '2.25.999';
  const stream = await pending; await consume(stream.body);
  expect(fetch.mock.calls[0][0].hostname).toBe('orthanc-b'); expect(fetch.mock.calls[0][0].pathname).toContain('/studies/2.25.1/');
  expect(snapshot.context.hospitalId).toBe(B);
});

for (const field of ['studyInstanceUid', 'seriesInstanceUid', 'sopInstanceUid']) it(`rejects invalid ${field} without fetch`, async () => {
  const { adapter, fetch } = setup();
  for (const value of [null, undefined, 1, [], '02.25.1', '2.025.1', '2/../1', '2.25.1 ', '9'.repeat(65)])
    await expect(adapter.retrieveDestinationVerificationInstanceStream({ ...request(), [field]: value })).rejects.toThrow('DICOM_REQUEST_INVALID');
  expect(fetch).not.toHaveBeenCalled();
});

for (const layer of ['request', 'context']) it(`denies forged/unknown/accessor/nonenumerable/symbol/Proxy ${layer} without execution`, async () => {
  const { adapter, fetch } = setup(); let calls = 0;
  for (const decorate of [obj => Object.assign(obj, { endpoint: 'https://untrusted.invalid' }),
    obj => Object.assign(obj, { credential: 'SYNTHETIC_SENTINEL' }), obj => Object.assign(obj, { permit: true }),
    obj => Object.defineProperty(obj, Object.keys(obj)[0], { get() { calls++; throw new Error('SYNTHETIC_SENTINEL'); }, enumerable: true }),
    obj => Object.defineProperty(obj, 'hidden', { value: true, enumerable: false }), obj => Object.assign(obj, { [Symbol('key')]: true }),
    obj => new Proxy(obj, { ownKeys() { calls++; throw new Error('SYNTHETIC_SENTINEL'); }, getPrototypeOf() { calls++; throw new Error('SYNTHETIC_SENTINEL'); } })]) {
    const r = request(); const obj = layer === 'request' ? r : r.context; const changed = decorate(obj) ?? obj;
    await expect(adapter.retrieveDestinationVerificationInstanceStream(layer === 'request' ? changed : { ...r, context: changed })).rejects.toThrow('DICOM_REQUEST_INVALID');
  }
  const r = request(); const revoked = Proxy.revocable(layer === 'request' ? r : r.context, {}); revoked.revoke();
  await expect(adapter.retrieveDestinationVerificationInstanceStream(layer === 'request' ? revoked.proxy : { ...r, context: revoked.proxy })).rejects.toThrow('DICOM_REQUEST_INVALID');
  expect(calls).toBe(0); expect(fetch).not.toHaveBeenCalled();
});

it('rejects unbranded/proxy signal and unknown source/caller target with no network effect', async () => {
  const { adapter, fetch } = setup();
  for (const signal of [null, {}, Object.create(AbortSignal.prototype), new Proxy(new AbortController().signal, {})])
    await expect(adapter.retrieveDestinationVerificationInstanceStream(request(B, signal))).rejects.toThrow('DICOM_REQUEST_INVALID');
  await expect(adapter.retrieveDestinationVerificationInstanceStream(request('unknown-hospital'))).rejects.toThrow('DICOM_ENDPOINT_DENIED');
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects native signal method/property shadows without invoking caller getters', async () => {
  const { adapter, fetch } = setup(); let calls = 0;
  for (const key of ['aborted', 'reason', 'addEventListener', 'removeEventListener', 'throwIfAborted', 'dispatchEvent', 'onabort']) {
    const signal = new AbortController().signal;
    Object.defineProperty(signal, key, { get() { calls++; throw new Error('SYNTHETIC_SENTINEL'); } });
    await expect(adapter.retrieveDestinationVerificationInstanceStream(request(B, signal))).rejects.toThrow('DICOM_REQUEST_INVALID');
  }
  expect(calls).toBe(0); expect(fetch).not.toHaveBeenCalled();
});

for (const origin of ['http://orthanc-b:8042', 'https://untrusted.invalid:8042', 'https://orthanc-b:8443', 'https://user@orthanc-b:8042'])
  it(`refuses unsafe configured B origin ${origin} without credential/URL forwarding`, async () => {
    const { adapter, fetch } = setup(undefined, { orthancBUrl: origin });
    await expect(adapter.retrieveDestinationVerificationInstanceStream(request())).rejects.toThrow('DICOM_CONFIGURATION_INVALID');
    expect(fetch).not.toHaveBeenCalled();
  });

for (const [name, reply] of [
  ['upstream401', () => new Response('SYNTHETIC_SENTINEL', { status: 401 })],
  ['wrong syntax', () => multipart(undefined, { syntax: '1.2.840.10008.1.2.2' })],
  ['wrong MIME', () => multipart(undefined, { type: 'application/octet-stream' })],
  ['truncated boundary', () => multipart(undefined, { close: false })],
  ['extra part', () => multipart(undefined, { extra: true })],
]) it(`rejects ${name} and releases the shared stream admission without automatic retry`, async () => {
  const replies = [reply, () => multipart()]; const { adapter, fetch } = setup(() => replies.shift()());
  await expect((async () => { const stream = await adapter.retrieveDestinationVerificationInstanceStream(request()); await consume(stream.body); })())
    .rejects.toThrow(/DICOM_/);
  expect(fetch).toHaveBeenCalledTimes(1);
  const next = await adapter.retrieveDestinationVerificationInstanceStream(request()); await consume(next.body);
  expect(fetch).toHaveBeenCalledTimes(2); // Separate explicit unit invocation, not internal retry.
});

it('pre-aborted requests have no fetch; explicit cancel releases B admission for a distinct read', async () => {
  const { adapter, fetch } = setup(); const abort = new AbortController(); abort.abort();
  await expect(adapter.retrieveDestinationVerificationInstanceStream(request(B, abort.signal))).rejects.toThrow('DICOM_OPERATION_ABORTED');
  expect(fetch).not.toHaveBeenCalled();
  const first = await adapter.retrieveDestinationVerificationInstanceStream(request()); await first.body.cancel();
  const second = await adapter.retrieveDestinationVerificationInstanceStream(request()); await consume(second.body);
  expect(fetch).toHaveBeenCalledTimes(2);
});
