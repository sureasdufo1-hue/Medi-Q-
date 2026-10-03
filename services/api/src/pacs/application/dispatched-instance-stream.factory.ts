import type { AuthorizedSourceCaptureService } from "../../integrity/application/authorized-source-capture.service.js";

const CHUNK_BYTES = 64 * 1024;
const ERROR = "PACS_DISPATCH_STREAM_UNAVAILABLE";

function data(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(ERROR);
  const fields = Object.getOwnPropertyDescriptors(value);
  if (required.some(key => !Object.hasOwn(fields, key)) || Reflect.ownKeys(fields).some(key =>
    typeof key !== "string" || (!required.includes(key) && !optional.includes(key)) ||
    !Object.hasOwn(fields[key]!, "value"))) throw new Error(ERROR);
  return Object.fromEntries(Object.keys(fields).map(key => [key, fields[key]!.value])) as Record<string, unknown>;
}

/**
 * Internal owned-byte bridge, not authorization/Preflight or a network effect.
 * Returned chunks are independent copies. Borrowed bytes stay held until the
 * consumer settles; EOF waits for the real store's zero/release finally block.
 */
export class DispatchedInstanceStreamFactory {
  constructor(private readonly source: Pick<AuthorizedSourceCaptureService, "consumeDispatchedInstance">) {}

  open(input: unknown): ReadableStream<Uint8Array> {
    let snapshot: Record<string, unknown>;
    try {
      snapshot = data(input, ["principal", "tenantCandidate", "correlationId", "consentId", "grantId", "handoff", "objectRef"], ["signal"]);
      snapshot.principal = Object.freeze(data(snapshot.principal, ["issuer", "subject"]));
      for (const field of ["tenantCandidate", "correlationId", "consentId", "grantId", "objectRef"]) {
        if (typeof snapshot[field] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshot[field])) throw new Error();
      }
      if (snapshot.signal !== undefined && !(snapshot.signal instanceof AbortSignal)) throw new Error();
      if (typeof (snapshot.principal as Record<string, unknown>).issuer !== "string" ||
        typeof (snapshot.principal as Record<string, unknown>).subject !== "string") throw new Error();
      snapshot = Object.freeze(snapshot);
    } catch { throw new Error(ERROR); }

    const controller = new AbortController();
    const parent = snapshot.signal as AbortSignal | undefined;
    let output: ReadableStreamDefaultController<Uint8Array>;
    let borrowed: Buffer | undefined, borrowedSignal: AbortSignal | undefined, offset = 0;
    let stopped = false, started = false, finished = false;
    let work: Promise<void> | undefined;
    let readyResolve!: () => void, readyReject!: (error: Error) => void, settleHold!: () => void;
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // Cancellation may occur before the first pull: prevent unhandled rejection.
    void ready.catch(() => undefined);
    const holding = new Promise<void>(resolve => { settleHold = resolve; });
    const cleanup = () => { parent?.removeEventListener("abort", stop); borrowedSignal?.removeEventListener("abort", stop); };
    const stop = () => {
      if (finished || stopped) return;
      stopped = true; controller.abort(); settleHold(); readyReject(new Error(ERROR));
      output.error(new Error(ERROR)); cleanup();
    };
    const begin = () => {
      if (started || stopped) return;
      started = true;
      work = this.source.consumeDispatchedInstance({ ...snapshot, signal: controller.signal }, async (plaintext, signal) => {
        if (stopped || signal.aborted) throw new Error(ERROR);
        borrowed = plaintext; borrowedSignal = signal;
        signal.addEventListener("abort", stop, { once: true });
        readyResolve();
        await holding;
      });
      void work.catch(() => { stop(); readyReject(new Error(ERROR)); });
    };
    return new ReadableStream<Uint8Array>({
      start(c) {
        output = c;
        if (parent?.aborted) stop(); else parent?.addEventListener("abort", stop, { once: true });
      },
      async pull(c) {
        try {
          begin(); await ready;
          if (stopped || controller.signal.aborted || borrowedSignal?.aborted || !borrowed) throw new Error(ERROR);
          if (offset < borrowed.byteLength) {
            const end = Math.min(offset + CHUNK_BYTES, borrowed.byteLength);
            // Never enqueue a view that the store's finally block will zero.
            const owned = Uint8Array.from(borrowed.subarray(offset, end));
            offset = end; c.enqueue(owned); return;
          }
          settleHold(); await work;
          if (stopped || controller.signal.aborted) throw new Error(ERROR);
          borrowed = undefined; finished = true; cleanup(); c.close();
        } catch { stop(); c.error(new Error(ERROR)); }
      },
      async cancel() { stop(); settleHold(); await work?.catch(() => undefined); borrowed = undefined; },
    }, { highWaterMark: 0 });
  }
}
