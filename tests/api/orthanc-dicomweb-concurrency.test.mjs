import { setImmediate as nextTurn } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import { TEST_HOSPITAL_A_ID } from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";

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
