import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { OrthancDicomwebAdapter } from '../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js';
import { snapshotStudyStowRequest } from '../../services/api/dist/dicom/infrastructure/study-stow-body.js';
import { TEST_HOSPITAL_A_ID, TEST_HOSPITAL_B_ID, TestOrthancEndpointResolver } from '../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js';

const STUDY = '2.25.81', SERIES = '2.25.82', CLASS = '1.2.840.10008.5.1.4.1.1.2', TS = '1.2.840.10008.1.2.1';
const metadata = n => ({ seriesInstanceUid: SERIES, sopInstanceUid: `2.25.${90 + n}`,
  sopClassUid: CLASS, transferSyntaxUid: TS, contentLength: 3 });
const config = { runtimeProfile: 'container', environment: 'test',
  orthancAUrl: 'https://orthanc-a:8042', orthancAUsername: 'TEST-A', orthancAPassword: 'TEST-A-SYNTHETIC',
  orthancBUrl: 'https://orthanc-b:8042', orthancBUsername: 'TEST-B', orthancBPassword: 'TEST-B-SYNTHETIC' };
const bytes = n => Uint8Array.from([n, 0, 255]);
function body(value, cancelled = () => {}) {
  let sent = false;
  return new ReadableStream({ pull(c) { if (sent) c.close(); else { sent = true; c.enqueue(value); } }, cancel: cancelled }, { highWaterMark: 0 });
}
function command(overrides = {}) {
  return { context: { hospitalId: TEST_HOSPITAL_B_ID, correlationId: 'TEST-DEC019', signal: new AbortController().signal },
    studyInstanceUid: STUDY, instances: [metadata(1), metadata(2)],
    openInstance: vi.fn(async item => body(bytes(Number(item.sopInstanceUid.split('.').at(-1))))), ...overrides };
}
const tag = (vr, ...Value) => ({ vr, Value });
const success = ids => ({ '00081199': tag('SQ', ...ids.map(uid => ({ '00081155': tag('UI', uid) }))) });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/dicom+json' } });
function adapter(fetch, options = {}) {
  return new OrthancDicomwebAdapter(new TestOrthancEndpointResolver(config), { fetch, concurrency: 1,
    deadlines: { stowTotalMs: 600, stowIdleMs: 100, stowHeadersMs: 100 }, ...options });
}
async function consume(stream, inspect = () => {}) {
  const reader = stream.getReader();
  try { while (true) { const item = await reader.read(); if (item.done) break; inspect(item.value); } }
  finally { reader.releaseLock(); }
}
const happyFetch = request => vi.fn(async (_url, init) => { await consume(init.body); return response(success(request.instances.map(i => i.sopInstanceUid))); });

describe('DEC-019 single Study dispatch boundary', () => {
  it('sends one exact multipart request in canonical order; opens one stream at a time on demand', async () => {
    const input = command({ instances: [metadata(2), metadata(1)] });
    let active = 0, peak = 0;
    const opened = [], chunks = [];
    input.openInstance = vi.fn(async item => {
      opened.push(item.sopInstanceUid); active++; peak = Math.max(peak, active);
      let sent = false;
      return new ReadableStream({ pull(c) {
        if (sent) { active--; c.close(); } else { sent = true; c.enqueue(bytes(Number(item.sopInstanceUid.split('.').at(-1)))); }
      } }, { highWaterMark: 0 });
    });
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`https://orthanc-b:8042/dicom-web/studies/${STUDY}`);
      expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', duplex: 'half' });
      expect(new Headers(init.headers).get('authorization')).toBe('Basic '+Buffer.from('TEST-B:TEST-B-SYNTHETIC').toString('base64'));
      expect(opened).toEqual([]); // highWaterMark 0, construction must not open bytes
      const reader = init.body.getReader();
      chunks.push((await reader.read()).value); // first prefix opens only first body
      expect(opened).toEqual([metadata(1).sopInstanceUid]);
      await new Promise(resolve => setImmediate(resolve));
      expect(opened).toHaveLength(1);
      chunks.push((await reader.read()).value);
      expect(opened).toHaveLength(1); // second object not opened to prefetch
      while (true) { const item = await reader.read(); if (item.done) break; chunks.push(item.value); }
      reader.releaseLock();
      const contentType = new Headers(init.headers).get('content-type');
      const boundary = /boundary="([^"]+)"/.exec(contentType)[1];
      const expected = [];
      for (const n of [1, 2]) {
        expected.push(Buffer.from(`--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=${TS}\r\nContent-Transfer-Encoding: binary\r\n\r\n`), Buffer.from(bytes(90+n)), Buffer.from('\r\n'));
      }
      expected.push(Buffer.from(`--${boundary}--\r\n`));
      expect(Buffer.concat(chunks)).toEqual(Buffer.concat(expected)); // tiny fixture only
      return response(success([metadata(1).sopInstanceUid, metadata(2).sopInstanceUid]));
    });
    expect(await adapter(fetch).storeStudyStream(input)).toEqual({ httpStatus: 200,
      storedSopInstanceUids: [metadata(1).sopInstanceUid, metadata(2).sopInstanceUid], warningSopInstanceUids: [], failedInstances: [] });
    expect(fetch).toHaveBeenCalledOnce(); expect(peak).toBe(1); expect(active).toBe(0);
  });

  it.each(['A', 'duplicate', 'no-instances', 'count', 'length', 'instance-cap', 'study-cap', 'series-cap', 'class', 'syntax', 'uid', 'url', 'getter', 'sparse', 'indexed-getter', 'array-symbol', 'array-map'])
  ('denies %s before fetch or opener', async variant => {
    const input = command(), originalOpen = input.openInstance;
    if (variant === 'A') input.context.hospitalId = TEST_HOSPITAL_A_ID;
    if (variant === 'duplicate') input.instances[1] = { ...input.instances[0] };
    if (variant === 'no-instances') input.instances = [];
    if (variant === 'count') input.instances = Array.from({ length: 2001 }, (_, n) => metadata(n));
    if (variant === 'length') input.instances[0].contentLength = 0;
    if (variant === 'instance-cap') input.instances[0].contentLength = 64 * 1024 * 1024 + 1;
    if (variant === 'study-cap') input.instances = Array.from({ length: 33 }, (_, n) => ({ ...metadata(n), contentLength: 64 * 1024 * 1024 }));
    if (variant === 'series-cap') input.instances = Array.from({ length: 65 }, (_, n) => ({ ...metadata(n), seriesInstanceUid: `2.25.${n+500}` }));
    if (variant === 'class') input.instances[0].sopClassUid = '2.25.123';
    if (variant === 'syntax') input.instances[0].transferSyntaxUid = '1.2.840.10008.1.2.4.50';
    if (variant === 'uid') input.instances[0].sopInstanceUid = 'BAD/UID';
    if (variant === 'url') input.endpointUrl = 'https://untrusted.invalid';
    let accessed = false;
    if (variant === 'getter') Object.defineProperty(input.instances[0], 'contentLength', { get() { accessed = true; return 3; } });
    if (variant === 'sparse') delete input.instances[0];
    if (variant === 'indexed-getter') Object.defineProperty(input.instances, '0', { get() { accessed = true; return metadata(1); } });
    if (variant === 'array-symbol') input.instances[Symbol('TEST-EXTRA')] = metadata(1);
    if (variant === 'array-map') input.instances.map = () => { accessed = true; return []; };
    const fetch = vi.fn();
    await expect(adapter(fetch).storeStudyStream(input)).rejects.toThrow('DICOM_STOW_DENIED');
    expect(fetch).not.toHaveBeenCalled(); expect(originalOpen).not.toHaveBeenCalled(); expect(accessed).toBe(false);
  });

  it('accepts exact metadata ceilings without allocating or opening a 2-GiB Study', () => {
    const twoGiB = command({ instances: Array.from({ length: 32 }, (_, n) => ({ ...metadata(n), contentLength: 64*1024*1024 })) });
    expect(snapshotStudyStowRequest(twoGiB).instances).toHaveLength(32);
    expect(twoGiB.openInstance).not.toHaveBeenCalled();
    expect(snapshotStudyStowRequest(command({ instances: Array.from({ length: 2000 }, (_, n) => metadata(n)) })).instances).toHaveLength(2000);
  });

  it('uses immutable selectors/opener after the caller mutates input before network demand', async () => {
    const input = command(), opener = input.openInstance;
    const fetch = vi.fn(async (url, init) => {
      input.context.hospitalId = TEST_HOSPITAL_A_ID; input.studyInstanceUid = '2.25.999';
      input.instances[0].sopInstanceUid = '2.25.998'; input.instances[1].contentLength = 99;
      input.openInstance = vi.fn(async () => { throw new Error('TEST-MUTATED-OPENER'); });
      expect(String(url)).toContain(STUDY);
      await consume(init.body);
      return response(success([metadata(1).sopInstanceUid, metadata(2).sopInstanceUid]));
    });
    await expect(adapter(fetch).storeStudyStream(input)).resolves.toMatchObject({ httpStatus: 200 });
    expect(opener).toHaveBeenCalledTimes(2); expect(opener.mock.calls[0][0]).toEqual(metadata(1));
    expect(Object.isFrozen(opener.mock.calls[0][0])).toBe(true);
    expect(input.openInstance).not.toHaveBeenCalled();
  });

  it('retains complete 202 warning/failure partition without inventing completion', async () => {
    const input = command();
    const fetch = vi.fn(async (_, init) => { await consume(init.body); return response({
      '00081199': tag('SQ', { '00081155': tag('UI', metadata(1).sopInstanceUid), '00081196': tag('US', 0xB000) }),
      '00081198': tag('SQ', { '00081155': tag('UI', metadata(2).sopInstanceUid), '00081197': tag('US', 0x0110) }),
      'TEST-RAW-IGNORED': 'TEST-NOT-RETURNED' }, 202); });
    expect(await adapter(fetch).storeStudyStream(input)).toEqual({ httpStatus: 202, storedSopInstanceUids: [],
      warningSopInstanceUids: [metadata(1).sopInstanceUid], failedInstances: [{ sopInstanceUid: metadata(2).sopInstanceUid, code: 'PROCESSING_FAILURE' }] });
  });

  it.each(['missing', 'duplicate', 'foreign', 'overlap', 'empty', 'bad-json', 'status', 'early'])
  ('treats %s response as unknown with one attempt', async variant => {
    const input = command();
    const fetch = vi.fn(async (_, init) => {
      if (variant !== 'early') await consume(init.body);
      if (variant === 'status') return new Response('TEST-RAW', { status: 503 });
      if (variant === 'bad-json') return new Response('{', { headers: { 'content-type': 'application/dicom+json' } });
      const ids = variant === 'missing' ? [metadata(1).sopInstanceUid] : variant === 'duplicate' ? [metadata(1).sopInstanceUid, metadata(1).sopInstanceUid]
        : variant === 'foreign' ? [metadata(1).sopInstanceUid, '2.25.999'] : variant === 'empty' ? [] : input.instances.map(i => i.sopInstanceUid);
      const value = success(ids);
      if (variant === 'overlap') value['00081198'] = tag('SQ', { '00081155': tag('UI', ids[0]) });
      return response(value);
    });
    await expect(adapter(fetch).storeStudyStream(input)).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(fetch).toHaveBeenCalledOnce();
    if (variant === 'early') expect(input.openInstance).not.toHaveBeenCalled();
  });

  it.each(['short', 'long', 'empty-chunk', 'not-bytes', 'body-error', 'opener-error', 'locked'])
  ('closes the active %s source, leaves later instances unopened and never retries', async variant => {
    const input = command(); let cancelled = 0; let heldReader;
    input.openInstance = vi.fn(async () => {
      if (variant === 'opener-error') throw new Error('TEST-RAW-PATIENT-SOURCE-ERROR');
      if (variant === 'body-error') return new ReadableStream({ pull(c) { c.error(new Error('TEST-RAW-BODY')); } }, { highWaterMark: 0 });
      const stream = body(variant === 'short' ? Uint8Array.of(1) : variant === 'long' ? Uint8Array.of(1,2,3,4)
        : variant === 'empty-chunk' ? new Uint8Array() : variant === 'not-bytes' ? 'TEST-NOT-BYTES' : bytes(1), () => { cancelled++; });
      if (variant === 'locked') heldReader = stream.getReader();
      return stream;
    });
    const fetch = vi.fn(async (_, init) => { await consume(init.body); return response(success([])); });
    try {
      await expect(adapter(fetch).storeStudyStream(input)).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
      expect(fetch).toHaveBeenCalledOnce(); expect(input.openInstance).toHaveBeenCalledOnce();
      if (['long', 'empty-chunk', 'not-bytes'].includes(variant)) expect(cancelled).toBe(1);
    } finally { await heldReader?.cancel(); heldReader?.releaseLock(); }
  });

  it('abort during stalled reader cancels/releases it and frees semaphore for a follow-up', async () => {
    const controller = new AbortController(), cancelled = vi.fn();
    let signal;
    const input = command({ context: { hospitalId: TEST_HOSPITAL_B_ID, correlationId: 'TEST-ABORT', signal: controller.signal } });
    const source = new ReadableStream({ pull() { controller.abort(); }, cancel: cancelled }, { highWaterMark: 0 });
    input.openInstance = vi.fn(async (_, passedSignal) => { signal = passedSignal; return source; });
    const fetch = vi.fn(async (_, init) => { await consume(init.body); return response(success(command().instances.map(i => i.sopInstanceUid))); });
    const instance = adapter(fetch);
    await expect(instance.storeStudyStream(input)).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(cancelled).toHaveBeenCalledOnce(); expect(source.locked).toBe(false); expect(signal.aborted).toBe(true);
    expect(input.openInstance).toHaveBeenCalledOnce();
    await expect(instance.storeStudyStream(command())).resolves.toMatchObject({ httpStatus: 200 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['idle-reader', 'late-opener', 'ignoring-fetch'])('bounds %s and cancels late resources without re-dispatch', async variant => {
    const input = command(), cancelled = vi.fn(); let resolveOpen;
    if (variant === 'idle-reader') input.openInstance = vi.fn(async () => new ReadableStream({ pull() {}, cancel: cancelled }, { highWaterMark: 0 }));
    if (variant === 'late-opener') input.openInstance = vi.fn(() => new Promise(resolve => { resolveOpen = resolve; }));
    const fetch = vi.fn(async (_, init) => {
      if (variant === 'ignoring-fetch') return new Promise(() => {});
      await consume(init.body); return response(success([]));
    });
    const instance = adapter(fetch, { deadlines: { stowTotalMs: 60, stowIdleMs: 25 } });
    await expect(instance.storeStudyStream(input)).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(fetch).toHaveBeenCalledOnce();
    if (variant === 'late-opener') { resolveOpen(body(bytes(1), cancelled)); await new Promise(resolve => setImmediate(resolve)); }
    if (variant !== 'ignoring-fetch') expect(cancelled).toHaveBeenCalledOnce();
  });

  it('rejects pre-aborted input before fetch/open', async () => {
    const input = command(), fetch = vi.fn();
    input.context.signal = AbortSignal.abort();
    await expect(adapter(fetch).storeStudyStream(input)).rejects.toThrow('DICOM_OPERATION_ABORTED');
    expect(fetch).not.toHaveBeenCalled(); expect(input.openInstance).not.toHaveBeenCalled();
  });

  it('lost response is unknown and never retried or exposed', async () => {
    const input = command();
    const fetch = vi.fn(async (_, init) => { await consume(init.body); throw new TypeError('TEST-RAW-CREDENTIAL'); });
    await expect(adapter(fetch).storeStudyStream(input)).rejects.toThrow(/^DICOM_STOW_OUTCOME_UNKNOWN$/);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('bounds a signal-ignoring response wait after all multipart bytes are read', async () => {
    const fetch = vi.fn(async (_, init) => { await consume(init.body); return new Promise(() => {}); });
    await expect(adapter(fetch, { deadlines: { stowTotalMs: 1000, stowHeadersMs: 25 } })
      .storeStudyStream(command())).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('cancels a malformed-media response instead of leaking its unread body', async () => {
    const cancelled = vi.fn();
    const fetch = vi.fn(async (_, init) => { await consume(init.body);
      return new Response(new ReadableStream({ pull() {}, cancel: cancelled }, { highWaterMark: 0 }),
        { headers: { 'content-type': 'text/plain' } }); });
    await expect(adapter(fetch).storeStudyStream(command())).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('terminates even an unread multipart body when a custom fetch ignores its signal', async () => {
    let outputReader, closedResult;
    const input = command();
    const fetch = vi.fn(async (_, init) => {
      outputReader = init.body.getReader();
      closedResult = outputReader.closed.then(() => 'CLOSED', () => 'ERRORED');
      return new Promise(() => {});
    });
    await expect(adapter(fetch, { deadlines: { stowTotalMs: 25 } }).storeStudyStream(input))
      .rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    // Observe termination without invoking read(), which could hide a merely flagged stream.
    expect(await closedResult).toBe('ERRORED'); outputReader.releaseLock();
    expect(input.openInstance).not.toHaveBeenCalled();
  });

  it('a stalled input cancel hook cannot retain the adapter semaphore or reader lock', async () => {
    const controller = new AbortController(), cancelled = vi.fn(() => new Promise(() => {}));
    const input = command({ context: { hospitalId: TEST_HOSPITAL_B_ID, correlationId: 'TEST-CANCEL-HOOK', signal: controller.signal } });
    const source = new ReadableStream({ pull() { controller.abort(); }, cancel: cancelled }, { highWaterMark: 0 });
    input.openInstance = vi.fn(async () => source);
    const fetch = vi.fn(async (_, init) => { await consume(init.body); return response(success(command().instances.map(i => i.sopInstanceUid))); });
    const instance = adapter(fetch);
    await expect(instance.storeStudyStream(input)).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
    expect(cancelled).toHaveBeenCalledOnce(); expect(source.locked).toBe(false);
    await expect(instance.storeStudyStream(command())).resolves.toMatchObject({ httpStatus: 200 });
  });

  it('validates selectors before waiting and a cancelled queued call never dispatches', async () => {
    let resume, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { resume = resolve; });
    const fetch = vi.fn(async (_, init) => { entered(); await blocked; await consume(init.body);
      return response(success(command().instances.map(i => i.sopInstanceUid))); });
    const instance = adapter(fetch);
    const first = instance.storeStudyStream(command()); await started;
    const secondInput = command(), controller = new AbortController(); secondInput.context.signal = controller.signal;
    const second = instance.storeStudyStream(secondInput); controller.abort();
    await expect(second).rejects.toThrow('DICOM_OPERATION_ABORTED');
    expect(secondInput.openInstance).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
    resume(); await expect(first).resolves.toMatchObject({ httpStatus: 200 });
  });

  it('streams exactly 2 GiB across 32 sequential capped instances without retaining the Study (counter fixture only)', async () => {
    const fixedChunk = new Uint8Array(1024*1024); // Immutable, reused synthetic bytes; not a performance/OS-memory claim.
    const input = command({ instances: Array.from({ length: 32 }, (_, n) => ({ ...metadata(n), contentLength: 64*1024*1024 })) });
    let active = 0, peak = 0, transmitted = 0;
    input.openInstance = vi.fn(async () => {
      active++; peak = Math.max(peak, active); let chunks = 0;
      return new ReadableStream({ pull(c) {
        if (chunks++ < 64) c.enqueue(fixedChunk); else { active--; c.close(); }
      } }, { highWaterMark: 0 });
    });
    const fetch = vi.fn(async (_, init) => { await consume(init.body, value => { if (value === fixedChunk) transmitted += value.byteLength; });
      return response(success(input.instances.map(i => i.sopInstanceUid))); });
    await expect(adapter(fetch, { deadlines: { stowTotalMs: 5000, stowIdleMs: 2000 } }).storeStudyStream(input)).resolves.toMatchObject({ httpStatus: 200 });
    expect(transmitted).toBe(2*1024*1024*1024); expect(peak).toBe(1); expect(active).toBe(0);
    expect(fetch).toHaveBeenCalledOnce(); expect(input.openInstance).toHaveBeenCalledTimes(32);
  });

  it.each(['success', 'response-loss'])('native fetch/loopback HTTP %s uses one real request and cleans its listener', async variant => {
    // Isolated protocol peer, not Orthanc/PACS, no TLS/RLS/Preflight claim.
    // No Authorization is forwarded to the loopback fixture server.
    let requests = 0, observed, serverError;
    const server = createServer(async (incoming, outgoing) => {
      requests++;
      try {
        expect(incoming.method).toBe('POST'); expect(incoming.url).toBe(`/dicom-web/studies/${STUDY}`);
        expect(incoming.headers.authorization).toBeUndefined();
        const contentType = incoming.headers['content-type'];
        const boundary = /boundary="([^"]+)"/.exec(contentType)[1];
        const fixtureChunks = []; let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length; if (size > 4096) throw new Error('TEST-PEER-FIXTURE-CAP');
          fixtureChunks.push(chunk);
        }
        const prefix = n => Buffer.from(`--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=${TS}\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
        observed = Buffer.concat(fixtureChunks);
        expect(observed).toEqual(Buffer.concat([prefix(1), Buffer.from(bytes(91)), Buffer.from('\r\n'),
          prefix(2), Buffer.from(bytes(92)), Buffer.from(`\r\n--${boundary}--\r\n`)]));
        if (variant === 'response-loss') { incoming.socket.destroy(); return; }
        outgoing.writeHead(200, { 'content-type': 'application/dicom+json' });
        outgoing.end(JSON.stringify(success(command().instances.map(i => i.sopInstanceUid))));
      } catch (error) { serverError = error; outgoing.destroy(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const native = globalThis.fetch;
    const transport = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`https://orthanc-b:8042/dicom-web/studies/${STUDY}`);
      const headers = new Headers(init.headers); headers.delete('authorization');
      return native(`http://127.0.0.1:${port}/dicom-web/studies/${STUDY}`, { ...init, headers });
    });
    try {
      const work = adapter(transport, { deadlines: { stowTotalMs: 3000, stowIdleMs: 1000, stowHeadersMs: 1000 } }).storeStudyStream(command());
      if (variant === 'success') await expect(work).resolves.toMatchObject({ httpStatus: 200 });
      else await expect(work).rejects.toThrow('DICOM_STOW_OUTCOME_UNKNOWN');
      expect(requests).toBe(1); expect(transport).toHaveBeenCalledOnce(); expect(serverError).toBeUndefined(); expect(observed).toBeDefined();
    } finally {
      await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    }
    expect(server.listening).toBe(false);
  });
});
