import { types } from "node:util";
import type { RetrieveInstanceStreamRequest } from "../application/dicom-gateway.port.js";
import { validateContext } from "./test-orthanc-endpoint-resolver.js";

function fields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || types.isProxy(input) || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error("DICOM_REQUEST_INVALID");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)) ||
    Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !keys.includes(key) ||
      !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) throw new Error("DICOM_REQUEST_INVALID");
  return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}

/** Strict data snapshot, not a principal, permission or endpoint resolver. */
export function snapshotDestinationVerificationRequest(input: unknown): RetrieveInstanceStreamRequest {
  try {
    const f = fields(input, ["context", "studyInstanceUid", "seriesInstanceUid", "sopInstanceUid"]);
    const c = fields(f.context, ["hospitalId", "correlationId", "signal"]);
    const signal = c.signal;
    if (typeof signal !== "object" || signal === null || types.isProxy(signal) || !(signal instanceof AbortSignal))
      throw new Error("DICOM_REQUEST_INVALID");
    if (Object.getPrototypeOf(signal) !== AbortSignal.prototype ||
      ["aborted", "reason", "throwIfAborted", "addEventListener", "removeEventListener", "dispatchEvent", "onabort"]
        .some(key => Object.hasOwn(signal, key))) throw new Error("DICOM_REQUEST_INVALID");
    Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(signal);
    const context = Object.freeze({ hospitalId: c.hospitalId as string, correlationId: c.correlationId as string, signal });
    validateContext(context);
    const uid = (value: unknown): string => {
      if (typeof value !== "string" || value.length < 1 || value.length > 64 ||
        !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(value)) throw new Error("DICOM_REQUEST_INVALID");
      return value;
    };
    return Object.freeze({ context, studyInstanceUid: uid(f.studyInstanceUid),
      seriesInstanceUid: uid(f.seriesInstanceUid), sopInstanceUid: uid(f.sopInstanceUid) });
  } catch { throw new Error("DICOM_REQUEST_INVALID"); }
}
