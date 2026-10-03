import type { DicomStowStudyInstance, StoreStudyStreamRequest } from "../application/dicom-gateway.port.js";
import { TEST_HOSPITAL_B_ID, validateContext } from "./test-orthanc-endpoint-resolver.js";

const UID = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;
const MAX_INSTANCE = 64 * 1024 * 1024;
const MAX_STUDY = 2 * 1024 * 1024 * 1024;

function dataFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key =>
    !Object.hasOwn(fields, key) || !Object.hasOwn(fields[key]!, "value"))) throw new Error();
  return Object.fromEntries(keys.map(key => [key, fields[key]!.value]));
}

/** Copy selectors/callback synchronously, before semaphore or network awaits. */
export function snapshotStudyStowRequest(input: StoreStudyStreamRequest): StoreStudyStreamRequest {
  try {
    const fields = dataFields(input, ["context", "studyInstanceUid", "instances", "openInstance"]);
    const context = dataFields(fields.context, ["hospitalId", "correlationId", "signal"]);
    const copiedContext = Object.freeze({ hospitalId: context.hospitalId as string,
      correlationId: context.correlationId as string, signal: context.signal as AbortSignal });
    validateContext(copiedContext);
    if (copiedContext.hospitalId !== TEST_HOSPITAL_B_ID) throw new Error();
    const study = fields.studyInstanceUid;
    if (typeof study !== "string" || study.length > 64 || !UID.test(study) ||
      typeof fields.openInstance !== "function" || !Array.isArray(fields.instances) ||
      fields.instances.length < 1 || fields.instances.length > 2_000) throw new Error();
    const inventoryFields = Object.getOwnPropertyDescriptors(fields.instances);
    const count = fields.instances.length;
    // Array.map silently skips holes and invokes indexed getters. Neither is a
    // complete trusted inventory; reject before any effect or getter execution.
    if (Reflect.ownKeys(inventoryFields).length !== count + 1) throw new Error();
    const inventory = Array.from({ length: count }, (_, index) => {
      const descriptor = inventoryFields[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error();
      return descriptor.value as unknown;
    });
    const seen = new Set<string>(), series = new Set<string>();
    let bytes = 0;
    const instances = inventory.map(value => {
      const item = dataFields(value, ["seriesInstanceUid", "sopInstanceUid", "sopClassUid", "transferSyntaxUid", "contentLength"]);
      for (const key of ["seriesInstanceUid", "sopInstanceUid", "sopClassUid", "transferSyntaxUid"]) {
        if (typeof item[key] !== "string" || item[key].length > 64 || !UID.test(item[key])) throw new Error();
      }
      if (item.sopClassUid !== "1.2.840.10008.5.1.4.1.1.2" || item.transferSyntaxUid !== "1.2.840.10008.1.2.1" ||
        typeof item.contentLength !== "number" || !Number.isSafeInteger(item.contentLength) ||
        item.contentLength < 1 || item.contentLength > MAX_INSTANCE || seen.has(item.sopInstanceUid as string)) throw new Error();
      seen.add(item.sopInstanceUid as string); series.add(item.seriesInstanceUid as string);
      bytes += item.contentLength;
      if (bytes > MAX_STUDY || series.size > 64) throw new Error();
      return Object.freeze(item) as unknown as Readonly<DicomStowStudyInstance>;
    });
    instances.sort((a, b) => a.seriesInstanceUid < b.seriesInstanceUid ? -1 : a.seriesInstanceUid > b.seriesInstanceUid ? 1
      : a.sopInstanceUid < b.sopInstanceUid ? -1 : a.sopInstanceUid > b.sopInstanceUid ? 1 : 0);
    return Object.freeze({ context: copiedContext, studyInstanceUid: study,
      instances: Object.freeze(instances), openInstance: fields.openInstance as StoreStudyStreamRequest["openInstance"] });
  } catch {
    throw new Error("DICOM_STOW_DENIED");
  }
}

/** Bound async dependencies even if a custom fetch/opener ignores AbortSignal. */
export function awaitStowSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new Error("DICOM_STOW_CANCELLED")); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function makeStudyStowBody(request: StoreStudyStreamRequest, boundary: string, scope: {
  readonly signal: AbortSignal;
  readonly headerTimeoutMs: number;
  setHeaderTimer(ms: number): void;
  abort(): void;
}, idleMs: number) {
  const encoder = new TextEncoder();
  let outputController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let index = 0, size = 0, state: "prefix" | "content" | "separator" | "end" | "done" = "prefix";
  let complete = false, closed = false;
  const close = () => {
    closed = true;
    scope.signal.removeEventListener("abort", close);
    if (!complete) outputController?.error(new Error("DICOM_STOW_CANCELLED"));
    if (reader) {
      const active = reader; reader = undefined;
      // Do not wait indefinitely for an untrusted underlying cancel hook.
      void active.cancel().catch(() => undefined);
      try { active.releaseLock(); } catch { /* A pending read is cancelled above. */ }
    }
  };
  scope.signal.addEventListener("abort", close, { once: true });
  async function idle<T>(work: Promise<T>): Promise<T> {
    const timer = setTimeout(() => scope.abort(), idleMs);
    try { return await awaitStowSignal(work, scope.signal); }
    finally { clearTimeout(timer); }
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { outputController = controller; },
    async pull(controller) {
      try {
        if (closed || scope.signal.aborted) throw new Error("DICOM_STOW_CANCELLED");
        if (state === "prefix") {
          const descriptor = request.instances[index]!;
          const opening = Promise.resolve().then(() => request.openInstance(descriptor, scope.signal));
          // Late completion after abort must not leak an input stream.
          void opening.then(stream => {
            if (closed && stream instanceof ReadableStream && !stream.locked) void stream.cancel().catch(() => undefined);
          }, () => undefined);
          const stream = await idle(opening);
          if (!(stream instanceof ReadableStream) || stream.locked || closed) throw new Error("DICOM_STOW_BODY_INVALID");
          reader = stream.getReader(); size = 0; state = "content";
          controller.enqueue(encoder.encode(`--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=${descriptor.transferSyntaxUid}\r\nContent-Transfer-Encoding: binary\r\n\r\n`));
          return;
        }
        if (state === "content") {
          const part = await idle(reader!.read());
          if (part.done) {
            if (size !== request.instances[index]!.contentLength) throw new Error("DICOM_STOW_BODY_INVALID");
            reader!.releaseLock(); reader = undefined; state = "separator";
          } else {
            if (!(part.value instanceof Uint8Array) || part.value.byteLength < 1) throw new Error("DICOM_STOW_BODY_INVALID");
            size += part.value.byteLength;
            if (size > request.instances[index]!.contentLength) throw new Error("DICOM_STOW_BODY_INVALID");
            controller.enqueue(part.value); return;
          }
        }
        if (state === "separator") {
          index++; state = index === request.instances.length ? "end" : "prefix";
          controller.enqueue(encoder.encode("\r\n")); return;
        }
        if (state === "end") {
          state = "done"; controller.enqueue(encoder.encode(`--${boundary}--\r\n`)); return;
        }
        complete = true;
        scope.setHeaderTimer(scope.headerTimeoutMs);
        controller.close(); close();
      } catch {
        scope.abort(); close(); controller.error(new Error("DICOM_STOW_BODY_INVALID"));
      }
    },
    cancel() { scope.abort(); close(); },
  }, { highWaterMark: 0 });
  return { body, close, isComplete: () => complete };
}
