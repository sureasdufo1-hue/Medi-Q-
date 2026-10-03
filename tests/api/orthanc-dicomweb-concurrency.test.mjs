import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import { TEST_HOSPITAL_A_ID } from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";
import { buildSourceIntegrityCapture } from "../../services/api/dist/integrity/application/source-integrity-manifest.builder.js";

function setup() {
  const fetch = vi.fn(async () => new Response([
    "--synthetic\r\nContent-Type: application/dicom; transfer-syntax=1.2.840.10008.1.2.1\r\n\r\n",
    "SYNTHETIC-BYTES-NOT-PHI\r\n--synthetic--\r\n",
  ].join(""), {
    headers: { "content-type": 'multipart/related; type="application/dicom"; boundary="synthetic"' },
  }));
  const adapter = new OrthancDicomwebAdapter({
    resolve: () => ({
      // Accepted test origin; every request is intercepted by the responder.
      origin: new URL("https://orthanc-a:8042/dicom-web/"),
      authorization: "Basic synthetic-test-only",
    }),
  }, { fetch, deadlines: { wadoHeadersMs: 5000, wadoIdleMs: 5000, wadoTotalMs: 10000 } });
  const open = (signal = new AbortController().signal) => adapter.retrieveInstanceStream({
    context: { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "synthetic-concurrency", signal },
    studyInstanceUid: "2.25.1", seriesInstanceUid: "2.25.2", sopInstanceUid: "2.25.3",
  });
  return { fetch, open };
}

async function consume(body) {
  const reader = body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return bytes;
      bytes += next.value.byteLength;
    }
  } finally { reader.releaseLock(); }
}

describe("STAGE-009 adapter-only operation admission", () => {
  it.each([true, false])("waits for a slow consumer but still validates closing boundary: complete=%s", async (complete) => {
    let index = -1;
    const instance = new OrthancDicomwebAdapter({
      resolve: () => ({ origin: new URL("https://orthanc-a:8042/dicom-web/"), authorization: "Basic synthetic-test-only" }),
    }, {
      fetch: async () => new Response(new ReadableStream({
        pull(controller) {
          if (index++ === -1) controller.enqueue(Buffer.from("--slow\r\nContent-Type: application/dicom\r\n\r\n"));
          else if (index <= 16) controller.enqueue(new Uint8Array(64 * 1024));
          else {
            if (complete) controller.enqueue(Buffer.from("\r\n--slow--\r\n"));
            controller.close();
          }
        },
      }, { highWaterMark: 0 }), {
        headers: { "content-type": 'multipart/related; type="application/dicom"; boundary=slow' },
      }),
    });
    const captured = buildSourceIntegrityCapture({
      expectedInstanceCount: 1,
      instances: [{
        sopInstanceUid: "2.25.3",
        async openStream() {
          return {
            ...await instance.retrieveInstanceStream({
              context: { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "synthetic-slow-reader", signal: new AbortController().signal },
              studyInstanceUid: "2.25.1", seriesInstanceUid: "2.25.2", sopInstanceUid: "2.25.3",
            }),
            observer: { writeChunk: async () => { await delay(5); }, complete: async () => {}, abort: async () => {} },
          };
        },
      }],
    });
    if (complete) expect((await captured).manifest.totalBytes).toBe(1024 * 1024);
    else await expect(captured).rejects.toMatchObject({ code: "STREAM_FAILED" });
  });

  it("accepts exactly 64 MiB, rejects one extra byte without a manifest, and recovers its permit", async () => {
    const cap = 64 * 1024 * 1024;
    let calls = 0;
    let overflowCancelled = false;
    const instance = new OrthancDicomwebAdapter({
      resolve: () => ({ origin: new URL("https://orthanc-a:8042/dicom-web/"), authorization: "Basic synthetic-test-only" }),
    }, {
      concurrency: 1,
      fetch: async () => {
        const call = ++calls;
        const length = call === 1 ? cap : call === 2 ? cap + 1 : 32;
        let prefixed = false;
        let suffixed = false;
        let sent = 0;
        return new Response(new ReadableStream({
          pull(controller) {
            if (!prefixed) {
              prefixed = true;
              controller.enqueue(Buffer.from("--exact-cap\r\nContent-Type: application/dicom\r\n\r\n"));
            } else if (sent < length) {
              const size = Math.min(64 * 1024, length - sent);
              sent += size;
              controller.enqueue(new Uint8Array(size));
            } else if (!suffixed) {
              suffixed = true;
              controller.enqueue(Buffer.from("\r\n--exact-cap--\r\n"));
              // Leave the overflowing HTTP source open to prove cancellation.
              if (call !== 2) controller.close();
            }
          },
          cancel() { if (call === 2) overflowCancelled = true; },
        }, { highWaterMark: 0 }), {
          headers: { "content-type": 'multipart/related; type="application/dicom"; boundary=exact-cap' },
        });
      },
    });
    const open = () => instance.retrieveInstanceStream({
      context: { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "synthetic-exact-cap", signal: new AbortController().signal },
      studyInstanceUid: "2.25.1", seriesInstanceUid: "2.25.2", sopInstanceUid: "2.25.3",
    });
    expect(await consume((await open()).body)).toBe(cap);
    const overflowing = await open();
    const recoveredPromise = open();
    const observer = { writeChunk: vi.fn(async () => {}), complete: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    try {
      expect(calls).toBe(2);
      await expect(buildSourceIntegrityCapture({
        expectedInstanceCount: 1,
        instances: [{ sopInstanceUid: "2.25.3", openStream: async () => ({ ...overflowing, observer }) }],
      })).rejects.toMatchObject({ code: "STREAM_FAILED" });
      expect(observer.complete).not.toHaveBeenCalled();
      expect(observer.abort).toHaveBeenCalledOnce();
      expect(overflowCancelled).toBe(true);
      expect(await consume((await recoveredPromise).body)).toBe(32);
      expect(calls).toBe(3);
    } finally {
      await overflowing.body.cancel().catch(() => undefined);
      await (await recoveredPromise).body.cancel().catch(() => undefined);
    }
  }, 20_000);

  it.each(["abort", "idle", "total"])("closes a started stalled multipart body on %s without a late enqueue", async (mode) => {
    const controller = new AbortController();
    let cancelled = false;
    let prefixed = false;
    const instance = new OrthancDicomwebAdapter({
      resolve: () => ({ origin: new URL("https://orthanc-a:8042/dicom-web/"), authorization: "Basic synthetic-test-only" }),
    }, {
      fetch: async () => new Response(new ReadableStream({
        pull(target) {
          if (!prefixed) {
            prefixed = true;
            target.enqueue(Buffer.from("--stall\r\nContent-Type: application/dicom\r\n\r\nSYNTHETIC-ONLY"));
          }
        },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 }), {
        headers: { "content-type": 'multipart/related; type="application/dicom"; boundary=stall' },
      }),
      deadlines: { wadoHeadersMs: 5000, wadoIdleMs: mode === "idle" ? 50 : 5000, wadoTotalMs: mode === "total" ? 50 : 5000 },
    });
    const result = await instance.retrieveInstanceStream({
      context: { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "synthetic-started-cancel", signal: controller.signal },
      studyInstanceUid: "2.25.1", seriesInstanceUid: "2.25.2", sopInstanceUid: "2.25.3",
    });
    const rejected = expect(consume(result.body)).rejects.toThrow("DICOM_WADO_STREAM_FAILED");
    if (mode === "abort") controller.abort();
    await rejected;
    await nextTurn();
    expect(cancelled).toBe(true);
  });

  it("preserves bounded upstream prefetch when a multipart instance consumer is stalled", async () => {
    const boundary = "synthetic-backpressure";
    const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    let prefixed = false;
    let produced = 0;
    let cancelled = false;
    const source = new ReadableStream({
      pull(controller) {
        if (!prefixed) { prefixed = true; controller.enqueue(prefix); return; }
        if (produced < 8 * 1024 * 1024) {
          produced += 64 * 1024;
          controller.enqueue(new Uint8Array(64 * 1024));
          return;
        }
        controller.enqueue(suffix);
        controller.close();
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const instance = new OrthancDicomwebAdapter({
      resolve: () => ({ origin: new URL("https://orthanc-a:8042/dicom-web/"), authorization: "Basic synthetic-test-only" }),
    }, {
      fetch: async () => new Response(source, {
        headers: { "content-type": `multipart/related; type="application/dicom"; boundary=${boundary}` },
      }),
      deadlines: { wadoHeadersMs: 5000, wadoIdleMs: 5000, wadoTotalMs: 10000 },
    });
    const result = await instance.retrieveInstanceStream({
      context: { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "synthetic-backpressure", signal: new AbortController().signal },
      studyInstanceUid: "2.25.1", seriesInstanceUid: "2.25.2", sopInstanceUid: "2.25.3",
    });
    try {
      for (let turn = 0; turn < 3; turn += 1) await nextTurn();
      expect(produced).toBeGreaterThan(0);
      expect(produced).toBeLessThanOrEqual(512 * 1024);
    } finally { await result.body.cancel(); }
    expect(cancelled).toBe(true);
  });

  it.each(["EOF", "cancel"])("retains both permits until body %s, then admits the third WADO", async (releaseBy) => {
    const { fetch, open } = setup();
    const bodies = [];
    try {
      const first = await open();
      const second = await open();
      bodies.push(first.body, second.body);
      let thirdResolved = false;
      const thirdPromise = open().then((result) => {
        thirdResolved = true;
        bodies.push(result.body);
        return result;
      });
      await nextTurn();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(thirdResolved).toBe(false);
      if (releaseBy === "EOF") expect(await consume(first.body)).toBeGreaterThan(0);
      else await first.body.cancel();
      const third = await thirdPromise;
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(await consume(second.body)).toBeGreaterThan(0);
      expect(await consume(third.body)).toBeGreaterThan(0);
    } finally {
      await Promise.all(bodies.map((body) => body.cancel().catch(() => undefined)));
    }
  });

  it("bounds the pending queue, removes aborted waiters and leaks no permits", async () => {
    const { fetch, open } = setup();
    const bodies = [];
    const queuedControllers = Array.from({ length: 8 }, () => new AbortController());
    try {
      const first = await open();
      const second = await open();
      bodies.push(first.body, second.body);
      // Attach rejection observers immediately, before aborting any waiter.
      const queued = queuedControllers.map((controller) => open(controller.signal).then(
        (result) => { bodies.push(result.body); return "UNEXPECTED_ADMISSION"; },
        (error) => error.message,
      ));
      await expect(open()).rejects.toThrow("DICOM_CAPACITY_EXCEEDED");
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const controller of queuedControllers) controller.abort();
      expect(await Promise.all(queued)).toEqual(Array(8).fill("DICOM_OPERATION_ABORTED"));
      expect(fetch).toHaveBeenCalledTimes(2);
      await first.body.cancel();
      await second.body.cancel();
      const recovered = await open();
      bodies.push(recovered.body);
      expect(await consume(recovered.body)).toBeGreaterThan(0);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      for (const controller of queuedControllers) controller.abort();
      await Promise.all(bodies.map((body) => body.cancel().catch(() => undefined)));
    }
  });
});
