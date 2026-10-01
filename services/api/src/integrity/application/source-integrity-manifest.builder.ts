import { createHash, type Hash } from "node:crypto";

export const SOURCE_INTEGRITY_ALGORITHM = "SHA256-MANIFEST-V1" as const;

export interface SourceIntegrityLimits {
  readonly maximumInstances: number;
  readonly maximumInstanceBytes: number;
  readonly maximumStudyBytes: number;
}

export const SOURCE_INTEGRITY_LIMITS: SourceIntegrityLimits = Object.freeze({
  maximumInstances: 2_000,
  maximumInstanceBytes: 64 * 1024 * 1024,
  maximumStudyBytes: 2 * 1024 * 1024 * 1024,
});

const DOMAIN_SEPARATOR = Buffer.from("MEDIQ-DICOM-MANIFEST\0V1\0", "ascii");
const SHA256_BYTES = 32;
const DICOM_UID_PATTERN = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/;

export type SourceIntegrityInputErrorCode =
  | "INVALID_INPUT"
  | "INVALID_UID"
  | "DUPLICATE_UID"
  | "INSTANCE_COUNT_MISMATCH"
  | "EMPTY_INSTANCE"
  | "INSTANCE_TOO_LARGE"
  | "STUDY_TOO_LARGE"
  | "MEDIA_TYPE_UNSUPPORTED"
  | "UID_MISMATCH"
  | "CONTENT_LENGTH_INVALID"
  | "CONTENT_LENGTH_MISMATCH"
  | "STREAM_FAILED"
  | "ABORTED";

/** Sanitized error: it intentionally contains no UID, payload, or upstream detail. */
export class SourceIntegrityInputError extends Error {
  constructor(readonly code: SourceIntegrityInputErrorCode) {
    super("SOURCE_INTEGRITY_INPUT_REJECTED");
    this.name = "SourceIntegrityInputError";
  }
}

export interface SourceIntegrityDicomStream {
  readonly sopInstanceUid: string;
  readonly mediaType: string;
  readonly contentLength?: number;
  readonly body: ReadableStream<Uint8Array>;
}

export interface SourceIntegrityInstanceDescriptor {
  readonly sopInstanceUid: string;
  /** Invoked sequentially, only after earlier instance streams are closed. */
  readonly openStream: (
    signal?: AbortSignal,
  ) => Promise<SourceIntegrityDicomStream>;
}

export interface SourceIntegrityManifestInput {
  readonly expectedInstanceCount: number;
  readonly instances: readonly SourceIntegrityInstanceDescriptor[];
  readonly signal?: AbortSignal;
  /** May only narrow fixed P0 ceilings; it cannot raise any of them. */
  readonly limits?: Partial<SourceIntegrityLimits>;
}

export interface SourceIntegrityManifest {
  readonly algorithm: typeof SOURCE_INTEGRITY_ALGORITHM;
  readonly aggregateDigest: `sha256:${string}`;
  readonly objectCount: number;
  readonly totalBytes: number;
}

interface HashedInstance {
  readonly uidBytes: Buffer;
  readonly byteLength: number;
  readonly digest: Buffer;
}

function reject(code: SourceIntegrityInputErrorCode): never {
  throw new SourceIntegrityInputError(code);
}

function isValidUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    DICOM_UID_PATTERN.test(value)
  );
}

function resolveLimits(
  input: SourceIntegrityManifestInput,
): SourceIntegrityLimits {
  const supplied = input?.limits;
  if (supplied === undefined) return SOURCE_INTEGRITY_LIMITS;
  if (typeof supplied !== "object" || supplied === null) reject("INVALID_INPUT");

  const limits = { ...SOURCE_INTEGRITY_LIMITS };
  for (const key of Object.keys(supplied) as (keyof typeof limits)[]) {
    if (!Object.prototype.hasOwnProperty.call(SOURCE_INTEGRITY_LIMITS, key)) {
      reject("INVALID_INPUT");
    }
    const value = supplied[key];
    if (
      !Number.isSafeInteger(value) ||
      value === undefined ||
      value < 1 ||
      value > SOURCE_INTEGRITY_LIMITS[key]
    ) {
      reject("INVALID_INPUT");
    }
    limits[key] = value;
  }
  return Object.freeze(limits);
}

function validateInput(
  input: SourceIntegrityManifestInput,
  limits: SourceIntegrityLimits,
): void {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray(input.instances) ||
    !Number.isSafeInteger(input.expectedInstanceCount) ||
    input.expectedInstanceCount < 1 ||
    input.expectedInstanceCount > limits.maximumInstances ||
    input.instances.length !== input.expectedInstanceCount
  ) {
    reject(
      Array.isArray(input?.instances) &&
        input.instances.length !== input.expectedInstanceCount
        ? "INSTANCE_COUNT_MISMATCH"
        : "INVALID_INPUT",
    );
  }

  const seen = new Set<string>();
  for (const instance of input.instances) {
    if (
      typeof instance !== "object" ||
      instance === null ||
      !isValidUid(instance.sopInstanceUid) ||
      typeof instance.openStream !== "function"
    ) {
      reject("INVALID_UID");
    }
    if (seen.has(instance.sopInstanceUid)) reject("DUPLICATE_UID");
    seen.add(instance.sopInstanceUid);
  }
}

function validateContentLength(
  value: number | undefined,
  limits: SourceIntegrityLimits,
): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    reject("CONTENT_LENGTH_INVALID");
  }
  if (value > limits.maximumInstanceBytes) {
    reject("INSTANCE_TOO_LARGE");
  }
}

async function cancelStream(
  stream: ReadableStream<Uint8Array>,
  reader?: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    if (reader) await reader.cancel();
    else await stream.cancel();
  } catch {
    // Cancellation is best-effort; never replace the sanitized primary error.
  }
}

function updateUint32(hash: Hash, value: number): void {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value);
  hash.update(bytes);
}

function updateUint64(hash: Hash, value: number): void {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  hash.update(bytes);
}

async function hashInstance(
  descriptor: SourceIntegrityInstanceDescriptor,
  signal: AbortSignal | undefined,
  currentStudyBytes: number,
  limits: SourceIntegrityLimits,
): Promise<HashedInstance> {
  if (signal?.aborted) reject("ABORTED");

  let stream: SourceIntegrityDicomStream | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  let instanceBytes = 0;
  const instanceHash = createHash("sha256");
  const abortCurrentRead = () => {
    if (stream) void cancelStream(stream.body, reader);
  };

  try {
    stream = await descriptor.openStream(signal);
    if (
      typeof stream !== "object" ||
      stream === null ||
      !(stream.body instanceof ReadableStream)
    ) {
      reject("STREAM_FAILED");
    }
    reader = stream.body.getReader();
    signal?.addEventListener("abort", abortCurrentRead, { once: true });

    if (signal?.aborted) reject("ABORTED");
    if (stream.mediaType !== "application/dicom") {
      reject("MEDIA_TYPE_UNSUPPORTED");
    }
    if (stream.sopInstanceUid !== descriptor.sopInstanceUid) {
      reject("UID_MISMATCH");
    }
    validateContentLength(stream.contentLength, limits);

    while (true) {
      if (signal?.aborted) reject("ABORTED");
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) reject("STREAM_FAILED");

      const chunkBytes = next.value.byteLength;
      if (chunkBytes > limits.maximumInstanceBytes - instanceBytes) {
        reject("INSTANCE_TOO_LARGE");
      }
      if (
        chunkBytes >
        limits.maximumStudyBytes - currentStudyBytes - instanceBytes
      ) {
        reject("STUDY_TOO_LARGE");
      }
      instanceBytes += chunkBytes;
      instanceHash.update(next.value);
    }

    completed = true;
    if (signal?.aborted) reject("ABORTED");
    if (instanceBytes === 0) reject("EMPTY_INSTANCE");
    if (
      stream.contentLength !== undefined &&
      stream.contentLength !== instanceBytes
    ) {
      reject("CONTENT_LENGTH_MISMATCH");
    }

    return Object.freeze({
      uidBytes: Buffer.from(descriptor.sopInstanceUid, "ascii"),
      byteLength: instanceBytes,
      digest: instanceHash.digest(),
    });
  } catch (error) {
    if (error instanceof SourceIntegrityInputError) throw error;
    throw new SourceIntegrityInputError(
      signal?.aborted ? "ABORTED" : "STREAM_FAILED",
    );
  } finally {
    signal?.removeEventListener("abort", abortCurrentRead);
    if (stream && !completed) await cancelStream(stream.body, reader);
    reader?.releaseLock();
  }
}

/**
 * Builds a deterministic digest over exact DICOM instance bytes. It does not
 * contact PACS itself; the caller supplies a lazy stream opener. One object is
 * consumed at a time, and a failure never returns a partial manifest.
 */
export async function buildSourceIntegrityManifest(
  input: SourceIntegrityManifestInput,
): Promise<SourceIntegrityManifest> {
  const limits = resolveLimits(input);
  validateInput(input, limits);
  if (input.signal?.aborted) reject("ABORTED");

  const descriptors = [...input.instances].sort((left, right) =>
    left.sopInstanceUid < right.sopInstanceUid
      ? -1
      : left.sopInstanceUid > right.sopInstanceUid
        ? 1
        : 0,
  );
  const hashedInstances: HashedInstance[] = [];
  let totalBytes = 0;

  for (const descriptor of descriptors) {
    const hashed = await hashInstance(
      descriptor,
      input.signal,
      totalBytes,
      limits,
    );
    totalBytes += hashed.byteLength;
    hashedInstances.push(hashed);
  }

  if (input.signal?.aborted) reject("ABORTED");

  const manifestHash = createHash("sha256");
  manifestHash.update(DOMAIN_SEPARATOR);
  updateUint32(manifestHash, hashedInstances.length);
  for (const instance of hashedInstances) {
    updateUint32(manifestHash, instance.uidBytes.byteLength);
    manifestHash.update(instance.uidBytes);
    updateUint64(manifestHash, instance.byteLength);
    if (instance.digest.byteLength !== SHA256_BYTES) reject("STREAM_FAILED");
    manifestHash.update(instance.digest);
  }

  return Object.freeze({
    algorithm: SOURCE_INTEGRITY_ALGORITHM,
    aggregateDigest: `sha256:${manifestHash.digest("hex")}`,
    objectCount: hashedInstances.length,
    totalBytes,
  });
}
