import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open as openFile,
  readdir,
  rm,
  rmdir,
  unlink,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES,
  type TemporaryPayloadQuotaReservationPort,
} from "./temporary-payload-quota.port.js";

export const TEMPORARY_IMAGING_LIMITS = Object.freeze({
  maximumInstanceBytes: 64 * 1024 * 1024,
  maximumPackageBytes: 2 * 1024 * 1024 * 1024,
  maximumEnvironmentBytes: 10 * 1024 * 1024 * 1024,
  maximumInstancesPerPackage: 2_000,
  packageTtlMilliseconds: 30 * 60 * 1000,
});

export interface TemporaryImagingPackageBinding {
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly packageId: string;
  readonly purpose: "PACS_IMPORT";
}

export interface TemporaryImagingInstanceBinding {
  readonly studyRefId: string;
  readonly seriesInstanceUid: string;
  readonly sopInstanceUid: string;
}

export interface TemporaryImagingStorageOptions {
  readonly rootDirectory: string;
  readonly now?: () => number;
  readonly sharedQuota?: TemporaryPayloadQuotaReservationPort;
  /** Test-only narrowing is allowed; production ceilings cannot be raised. */
  readonly limits?: Partial<typeof TEMPORARY_IMAGING_LIMITS>;
}

export interface TemporaryImagingPackageHandle {
  readonly storageRef: string;
  readonly packageId: string;
}

export interface TemporaryImagingInstanceReceipt {
  readonly objectRef: string;
  readonly studyRefId: string;
  readonly seriesInstanceUid: string;
  readonly sopInstanceUid: string;
  readonly byteLength: number;
  readonly sha256: `sha256:${string}`;
}

export interface TemporaryImagingPackageReceipt {
  readonly storageRef: string;
  readonly packageId: string;
  readonly objectCount: number;
  readonly totalBytes: number;
  readonly expiresAt: Date;
}

export interface TemporaryImagingPurgeReceipt {
  readonly storageRef: string;
  readonly packageId: string;
  readonly objectCount: number;
  readonly byteLength: number;
  readonly deletedAt: Date;
}

export interface TemporaryImagingInstanceWriter {
  /** Await each chunk before asking the source for its next chunk. */
  write(chunk: Uint8Array): Promise<void>;
  /** Seal only when independently computed source length and SHA-256 match. */
  complete(expected: {
    readonly byteLength: number;
    readonly sha256: `sha256:${string}`;
  }): Promise<TemporaryImagingInstanceReceipt>;
  abort(): Promise<void>;
}

export type TemporaryImagingStorageErrorCode =
  | "INVALID_INPUT"
  | "BINDING_MISMATCH"
  | "PACKAGE_NOT_FOUND"
  | "PACKAGE_NOT_SEALED"
  | "OBJECT_NOT_FOUND"
  | "EXPIRED"
  | "LIMIT_EXCEEDED"
  | "INTEGRITY_FAILED"
  | "QUOTA_UNAVAILABLE"
  | "RECOVERY_REQUIRED"
  | "STORAGE_UNAVAILABLE";

/** Deliberately contains no path, UID, payload, Tenant ID, or crypto detail. */
export class TemporaryImagingStorageError extends Error {
  constructor(readonly code: TemporaryImagingStorageErrorCode) {
    super("TEMPORARY_IMAGING_STORAGE_UNAVAILABLE");
    this.name = "TemporaryImagingStorageError";
  }
}

interface StoredObject {
  readonly receipt: TemporaryImagingInstanceReceipt;
  readonly binding: TemporaryImagingInstanceBinding;
  readonly filePath: string;
  readonly nonce: Buffer;
  readonly key: Buffer;
  authTag: Buffer | null;
}

interface StoredPackage {
  readonly handle: TemporaryImagingPackageHandle;
  readonly binding: TemporaryImagingPackageBinding;
  readonly directory: string;
  readonly objects: Map<string, StoredObject>;
  readonly activeSopInstanceUids: Set<string>;
  readonly abortController: AbortController;
  readonly idleWaiters: Array<() => void>;
  readonly quotaWriterId: string;
  readonly quotaRequired: boolean;
  quotaStudyRefId: string | null;
  sharedQuotaReservedBytes: number;
  quotaReservationTail: Promise<void>;
  quotaFinalizing: boolean;
  byteLength: number;
  activeStages: number;
  sealed: boolean;
  purgePending: boolean;
  expiresAt: number | null;
  purgePromise?: Promise<TemporaryImagingPurgeReceipt>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DICOM_UID_PATTERN = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const AAD_VERSION = "MEDIQ-TEMP-IMAGING-V1";
const MAX_PURGE_TOMBSTONES = 1_024;
const CIPHERTEXT_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i;

function storageError(code: TemporaryImagingStorageErrorCode): never {
  throw new TemporaryImagingStorageError(code);
}

function validateUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    DICOM_UID_PATTERN.test(value)
  );
}

function packageBindingEqual(
  left: TemporaryImagingPackageBinding,
  right: TemporaryImagingPackageBinding,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.exchangeSessionId === right.exchangeSessionId &&
    left.packageId === right.packageId &&
    left.purpose === right.purpose
  );
}

function packageBindingFingerprint(binding: TemporaryImagingPackageBinding): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        binding.tenantId,
        binding.exchangeSessionId,
        binding.packageId,
        binding.purpose,
      ]),
    )
    .digest("hex");
}

function instanceBindingEqual(
  left: TemporaryImagingInstanceBinding,
  right: TemporaryImagingInstanceBinding,
): boolean {
  return (
    left.studyRefId === right.studyRefId &&
    left.seriesInstanceUid === right.seriesInstanceUid &&
    left.sopInstanceUid === right.sopInstanceUid
  );
}

function aadFor(
  packageBinding: TemporaryImagingPackageBinding,
  instanceBinding: TemporaryImagingInstanceBinding,
  storageRef: string,
  objectRef: string,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      AAD_VERSION,
      packageBinding.tenantId,
      packageBinding.exchangeSessionId,
      packageBinding.packageId,
      packageBinding.purpose,
      instanceBinding.studyRefId,
      instanceBinding.seriesInstanceUid,
      instanceBinding.sopInstanceUid,
      storageRef,
      objectRef,
    ]),
    "utf8",
  );
}

function resolveLimits(
  supplied: TemporaryImagingStorageOptions["limits"],
): typeof TEMPORARY_IMAGING_LIMITS {
  const limits = { ...TEMPORARY_IMAGING_LIMITS, ...supplied };
  if (
    !Number.isSafeInteger(limits.maximumInstanceBytes) ||
    limits.maximumInstanceBytes < 1 ||
    limits.maximumInstanceBytes > TEMPORARY_IMAGING_LIMITS.maximumInstanceBytes ||
    !Number.isSafeInteger(limits.maximumPackageBytes) ||
    limits.maximumPackageBytes < limits.maximumInstanceBytes ||
    limits.maximumPackageBytes > TEMPORARY_IMAGING_LIMITS.maximumPackageBytes ||
    !Number.isSafeInteger(limits.maximumEnvironmentBytes) ||
    limits.maximumEnvironmentBytes < limits.maximumPackageBytes ||
    limits.maximumEnvironmentBytes > TEMPORARY_IMAGING_LIMITS.maximumEnvironmentBytes ||
    !Number.isSafeInteger(limits.maximumInstancesPerPackage) ||
    limits.maximumInstancesPerPackage < 1 ||
    limits.maximumInstancesPerPackage > TEMPORARY_IMAGING_LIMITS.maximumInstancesPerPackage ||
    !Number.isSafeInteger(limits.packageTtlMilliseconds) ||
    limits.packageTtlMilliseconds < 1 ||
    limits.packageTtlMilliseconds > TEMPORARY_IMAGING_LIMITS.packageTtlMilliseconds
  ) {
    return storageError("INVALID_INPUT");
  }
  return Object.freeze(limits);
}

/**
 * Internal single-process P0 encrypted spool primitive. It has no authority:
 * callers must complete Consent/Authorization/Grant/RLS checks before reads.
 * DEKs exist only in this process. A restart cannot decrypt existing files.
 * Reserved packages require a shared database quota adapter. The store remains
 * unregistered until Tenant metadata, cleanup and purge Audit gates pass.
 */
export class EphemeralEncryptedTemporaryImagingStore {
  private readonly rootDirectory: string;
  private readonly now: () => number;
  private readonly limits: typeof TEMPORARY_IMAGING_LIMITS;
  private readonly sharedQuota: TemporaryPayloadQuotaReservationPort | undefined;
  private readonly packages = new Map<string, StoredPackage>();
  private readonly ready: Promise<void>;
  private environmentBytes = 0;
  private readonly purgedPackages = new Map<
    string,
    { readonly bindingFingerprint: string; readonly receipt: TemporaryImagingPurgeReceipt }
  >();
  private readonly recoveryRequiredRefs = new Set<string>();
  private hasUnexpectedRecoveryEntries = false;

  constructor(options: TemporaryImagingStorageOptions) {
    if (!options || typeof options.rootDirectory !== "string" || !isAbsolute(options.rootDirectory)) {
      storageError("INVALID_INPUT");
    }
    this.rootDirectory = resolve(options.rootDirectory);
    this.now = options.now ?? Date.now;
    this.limits = resolveLimits(options.limits);
    this.sharedQuota = options.sharedQuota;
    this.ready = this.initialize();
  }

  async beginPackage(
    binding: TemporaryImagingPackageBinding,
  ): Promise<TemporaryImagingPackageHandle> {
    return this.createPackage(binding, randomUUID(), false);
  }

  /**
   * Starts storage only after the caller has durably reserved this opaque ref
   * in its verified Tenant transaction. Product orchestration must use this
   * entry point; beginPackage() is retained for isolated primitive tests.
   */
  async beginReservedPackage(
    binding: TemporaryImagingPackageBinding,
    storageRef: string,
  ): Promise<TemporaryImagingPackageHandle> {
    if (!this.sharedQuota) storageError("QUOTA_UNAVAILABLE");
    return this.createPackage(binding, storageRef, true);
  }

  private async createPackage(
    binding: TemporaryImagingPackageBinding,
    storageRef: string,
    quotaRequired: boolean,
  ): Promise<TemporaryImagingPackageHandle> {
    await this.ready;
    this.assertRecoveryComplete();
    this.prunePurgedPackages();
    if (
      !binding ||
      !validateUuid(binding.tenantId) ||
      !validateUuid(binding.exchangeSessionId) ||
      !validateUuid(binding.packageId) ||
      binding.purpose !== "PACS_IMPORT"
    ) {
      storageError("INVALID_INPUT");
    }
    if (!validateUuid(storageRef)) storageError("INVALID_INPUT");
    storageRef = storageRef.toLowerCase();
    if (this.packages.has(storageRef) || this.purgedPackages.has(storageRef)) {
      storageError("BINDING_MISMATCH");
    }
    const handle = Object.freeze({ storageRef, packageId: binding.packageId });
    const directory = this.packageDirectory(storageRef);
    try {
      await mkdir(directory, { mode: 0o700 });
      const directoryInfo = await lstat(directory);
      if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
        storageError("STORAGE_UNAVAILABLE");
      }
      await chmod(directory, 0o700);
    } catch (error) {
      if (error instanceof TemporaryImagingStorageError) throw error;
      storageError("STORAGE_UNAVAILABLE");
    }
    this.packages.set(storageRef, {
      handle,
      binding: Object.freeze({ ...binding }),
      directory,
      objects: new Map(),
      activeSopInstanceUids: new Set(),
      abortController: new AbortController(),
      idleWaiters: [],
      quotaWriterId: randomUUID(),
      quotaRequired,
      quotaStudyRefId: null,
      sharedQuotaReservedBytes: 0,
      quotaReservationTail: Promise.resolve(),
      quotaFinalizing: false,
      byteLength: 0,
      activeStages: 0,
      sealed: false,
      purgePending: false,
      expiresAt: null,
    });
    return handle;
  }

  async stageInstance(input: {
    readonly storageRef: string;
    readonly packageBinding: TemporaryImagingPackageBinding;
    readonly instanceBinding: TemporaryImagingInstanceBinding;
    readonly source: AsyncIterable<Uint8Array>;
  }): Promise<TemporaryImagingInstanceReceipt> {
    if (!input.source || typeof input.source[Symbol.asyncIterator] !== "function") {
      storageError("INVALID_INPUT");
    }
    const writer = await this.beginInstance(input);
    try {
      let sourceBytes = 0;
      const sourceDigest = createHash("sha256");
      for await (const chunk of input.source) {
        if (!(chunk instanceof Uint8Array)) storageError("INVALID_INPUT");
        await writer.write(chunk);
        sourceBytes += chunk.byteLength;
        sourceDigest.update(chunk);
      }
      return await writer.complete({
        byteLength: sourceBytes,
        sha256: `sha256:${sourceDigest.digest("hex")}`,
      });
    } catch (error) {
      await writer.abort();
      if (error instanceof TemporaryImagingStorageError) throw error;
      throw new TemporaryImagingStorageError("STORAGE_UNAVAILABLE");
    }
  }

  async beginInstance(input: {
    readonly storageRef: string;
    readonly packageBinding: TemporaryImagingPackageBinding;
    readonly instanceBinding: TemporaryImagingInstanceBinding;
  }): Promise<TemporaryImagingInstanceWriter> {
    await this.ready;
    const storedPackage = this.getPackage(input.storageRef);
    this.assertPackageBinding(storedPackage, input.packageBinding);
    if (
      storedPackage.sealed ||
      storedPackage.purgePending ||
      storedPackage.quotaFinalizing
    ) storageError("BINDING_MISMATCH");
    if (
      !input.instanceBinding ||
      !validateUuid(input.instanceBinding.studyRefId) ||
      !validateUid(input.instanceBinding.seriesInstanceUid) ||
      !validateUid(input.instanceBinding.sopInstanceUid)
    ) {
      storageError("INVALID_INPUT");
    }
    if (storedPackage.objects.size + storedPackage.activeStages >= this.limits.maximumInstancesPerPackage) {
      storageError("LIMIT_EXCEEDED");
    }
    if (
      storedPackage.activeSopInstanceUids.has(input.instanceBinding.sopInstanceUid) ||
      [...storedPackage.objects.values()].some(
        (object) => object.binding.sopInstanceUid === input.instanceBinding.sopInstanceUid,
      )
    ) {
      storageError("BINDING_MISMATCH");
    }
    if (storedPackage.quotaRequired) {
      const studyRefId = input.instanceBinding.studyRefId.toLowerCase();
      if (storedPackage.quotaStudyRefId && storedPackage.quotaStudyRefId !== studyRefId) {
        storageError("BINDING_MISMATCH");
      }
      storedPackage.quotaStudyRefId = studyRefId;
    }

    const objectRef = randomUUID();
    const filePath = join(storedPackage.directory, `${objectRef}.enc`);
    const key = randomBytes(KEY_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(aadFor(input.packageBinding, input.instanceBinding, input.storageRef, objectRef));
    const digest = createHash("sha256");
    let fileHandle: Awaited<ReturnType<typeof openFile>> | null = null;
    storedPackage.activeStages += 1;
    storedPackage.activeSopInstanceUids.add(input.instanceBinding.sopInstanceUid);
    try {
      fileHandle = await openFile(filePath, "wx", 0o600);
      if (storedPackage.purgePending || storedPackage.abortController.signal.aborted) {
        storageError("STORAGE_UNAVAILABLE");
      }
    } catch (error) {
      key.fill(0);
      nonce.fill(0);
      if (fileHandle) {
        try {
          await fileHandle.close();
        } catch {
          // Attempt path cleanup even when close reports an error.
        }
        try {
          await rm(filePath, { force: true });
        } catch {
          storedPackage.purgePending = true;
        }
      }
      storedPackage.activeStages -= 1;
      storedPackage.activeSopInstanceUids.delete(input.instanceBinding.sopInstanceUid);
      if (storedPackage.activeStages === 0) {
        for (const resolveIdle of storedPackage.idleWaiters.splice(0)) resolveIdle();
      }
      if (error instanceof TemporaryImagingStorageError) throw error;
      storageError("STORAGE_UNAVAILABLE");
    }

    let byteLength = 0;
    let filePosition = 0;
    let settled = false;
    let writing = false;
    let cleanupPromise: Promise<void> | undefined;
    const finishActiveStage = () => {
      storedPackage.activeStages -= 1;
      storedPackage.activeSopInstanceUids.delete(input.instanceBinding.sopInstanceUid);
      if (storedPackage.activeStages === 0) {
        for (const resolveIdle of storedPackage.idleWaiters.splice(0)) resolveIdle();
      }
    };
    const writeCiphertext = async (bytes: Buffer) => {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const result = await fileHandle!.write(
          bytes,
          offset,
          bytes.byteLength - offset,
          filePosition + offset,
        );
        if (result.bytesWritten < 1) storageError("STORAGE_UNAVAILABLE");
        offset += result.bytesWritten;
      }
      filePosition += bytes.byteLength;
    };
    const cleanup = (): Promise<void> => {
      if (cleanupPromise) return cleanupPromise;
      if (settled) return Promise.resolve();
      settled = true;
      cleanupPromise = (async () => {
        key.fill(0);
        nonce.fill(0);
        try {
          await fileHandle?.close();
        } catch {
          // Removal below remains the authoritative cleanup attempt.
        }
        try {
          await rm(filePath, { force: true });
          storedPackage.byteLength -= byteLength;
          this.environmentBytes -= byteLength;
        } catch {
          storedPackage.purgePending = true;
        }
        finishActiveStage();
      })();
      return cleanupPromise;
    };
    const runWrite = async (chunk: Uint8Array): Promise<void> => {
      if (settled || writing || !(chunk instanceof Uint8Array)) storageError("INVALID_INPUT");
      if (storedPackage.purgePending || storedPackage.abortController.signal.aborted) {
        storageError("STORAGE_UNAVAILABLE");
      }
      if (chunk.byteLength === 0) return;
      const nextLength = byteLength + chunk.byteLength;
      const nextPackageBytes = storedPackage.byteLength + chunk.byteLength;
      const nextEnvironmentBytes = this.environmentBytes + chunk.byteLength;
      if (
        nextLength > this.limits.maximumInstanceBytes ||
        nextPackageBytes > this.limits.maximumPackageBytes ||
        nextEnvironmentBytes > this.limits.maximumEnvironmentBytes
      ) {
        storageError("LIMIT_EXCEEDED");
      }
      writing = true;
      try {
        const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        // Reserve synchronously before the first await so concurrent package
        // writers cannot all observe the same environment quota remainder.
        byteLength = nextLength;
        storedPackage.byteLength = nextPackageBytes;
        this.environmentBytes = nextEnvironmentBytes;
        await this.reserveSharedQuota(
          storedPackage,
          input.instanceBinding.studyRefId,
          nextPackageBytes,
        );
        digest.update(bytes);
        const encrypted = cipher.update(bytes);
        await writeCiphertext(encrypted);
        if (storedPackage.purgePending || storedPackage.abortController.signal.aborted) {
          storageError("STORAGE_UNAVAILABLE");
        }
      } catch (error) {
        await cleanup();
        if (error instanceof TemporaryImagingStorageError) throw error;
        throw new TemporaryImagingStorageError("STORAGE_UNAVAILABLE");
      } finally {
        writing = false;
      }
    };
    const complete = async (expected: {
      readonly byteLength: number;
      readonly sha256: `sha256:${string}`;
    }): Promise<TemporaryImagingInstanceReceipt> => {
      if (settled || writing || storedPackage.purgePending || storedPackage.abortController.signal.aborted) {
        await cleanup();
        storageError("STORAGE_UNAVAILABLE");
      }
      try {
        if (
          byteLength < 1 ||
          !Number.isSafeInteger(expected?.byteLength) ||
          expected.byteLength !== byteLength ||
          !/^sha256:[0-9a-f]{64}$/.test(expected?.sha256 ?? "")
        ) {
          storageError("INTEGRITY_FAILED");
        }
        const finalBytes = cipher.final();
        await writeCiphertext(finalBytes);
        const sha256 = `sha256:${digest.digest("hex")}` as const;
        if (sha256 !== expected.sha256) storageError("INTEGRITY_FAILED");
        const authTag = cipher.getAuthTag();
        await fileHandle!.sync();
        if (storedPackage.purgePending || storedPackage.abortController.signal.aborted) {
          storageError("STORAGE_UNAVAILABLE");
        }
        await fileHandle!.close();
        const receipt = Object.freeze({
          objectRef,
          studyRefId: input.instanceBinding.studyRefId,
          seriesInstanceUid: input.instanceBinding.seriesInstanceUid,
          sopInstanceUid: input.instanceBinding.sopInstanceUid,
          byteLength,
          sha256,
        });
        storedPackage.objects.set(objectRef, {
          receipt,
          binding: Object.freeze({ ...input.instanceBinding }),
          filePath,
          nonce,
          key,
          authTag,
        });
        settled = true;
        finishActiveStage();
        return receipt;
      } catch (error) {
        await cleanup();
        if (error instanceof TemporaryImagingStorageError) throw error;
        throw new TemporaryImagingStorageError("STORAGE_UNAVAILABLE");
      }
    };

    return Object.freeze({
      write: runWrite,
      complete,
      abort: cleanup,
    });
  }

  async sealPackage(input: {
    readonly storageRef: string;
    readonly binding: TemporaryImagingPackageBinding;
  }): Promise<TemporaryImagingPackageReceipt> {
    await this.ready;
    const storedPackage = this.getPackage(input.storageRef);
    this.assertPackageBinding(storedPackage, input.binding);
    if (storedPackage.sealed || storedPackage.purgePending || storedPackage.activeStages > 0 || storedPackage.objects.size < 1) {
      storageError("BINDING_MISMATCH");
    }
    const expiresAt = this.now() + this.limits.packageTtlMilliseconds;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.now()) storageError("INVALID_INPUT");
    if (storedPackage.quotaRequired) {
      const studyRefId = storedPackage.quotaStudyRefId;
      if (
        !this.sharedQuota ||
        !studyRefId ||
        storedPackage.sharedQuotaReservedBytes < storedPackage.byteLength
      ) {
        storageError("QUOTA_UNAVAILABLE");
      }
      // Freeze the package before awaiting settlement. If the DB commit is
      // ambiguous, the safe recovery is retrying this seal or purging it.
      storedPackage.quotaFinalizing = true;
      try {
        await this.sharedQuota.settle({
          tenantId: storedPackage.binding.tenantId,
          studyRefId,
          storageRef: storedPackage.handle.storageRef,
          writerId: storedPackage.quotaWriterId,
          actualBytes: storedPackage.byteLength,
        });
      } catch {
        storageError("QUOTA_UNAVAILABLE");
      }
    }
    storedPackage.sealed = true;
    storedPackage.expiresAt = expiresAt;
    return Object.freeze({
      storageRef: input.storageRef,
      packageId: storedPackage.handle.packageId,
      objectCount: storedPackage.objects.size,
      totalBytes: storedPackage.byteLength,
      expiresAt: new Date(expiresAt),
    });
  }

  async readInstance(input: {
    readonly storageRef: string;
    readonly objectRef: string;
    readonly packageBinding: TemporaryImagingPackageBinding;
    readonly instanceBinding: TemporaryImagingInstanceBinding;
    readonly expectedByteLength: number;
    readonly expectedSha256: `sha256:${string}`;
  }): Promise<Buffer> {
    await this.ready;
    const storedPackage = this.getPackage(input.storageRef);
    this.assertPackageBinding(storedPackage, input.packageBinding);
    if (!storedPackage.sealed || storedPackage.expiresAt === null) storageError("PACKAGE_NOT_SEALED");
    if (storedPackage.purgePending) storageError("STORAGE_UNAVAILABLE");
    if (this.now() >= storedPackage.expiresAt) storageError("EXPIRED");
    if (!validateUuid(input.objectRef) || !validateUuid(input.instanceBinding.studyRefId)) {
      storageError("INVALID_INPUT");
    }
    const storedObject = storedPackage.objects.get(input.objectRef);
    if (!storedObject) storageError("OBJECT_NOT_FOUND");
    if (!instanceBindingEqual(storedObject.binding, input.instanceBinding)) {
      storageError("BINDING_MISMATCH");
    }
    if (
      !Number.isSafeInteger(input.expectedByteLength) ||
      input.expectedByteLength !== storedObject.receipt.byteLength ||
      input.expectedSha256 !== storedObject.receipt.sha256
    ) {
      storageError("INTEGRITY_FAILED");
    }
    const fileInfo = await lstat(storedObject.filePath).catch(() => null);
    if (!fileInfo || fileInfo.isSymbolicLink() || !fileInfo.isFile() || fileInfo.size !== storedObject.receipt.byteLength) {
      storageError("INTEGRITY_FAILED");
    }

    const key = Buffer.from(storedObject.key);
    const nonce = Buffer.from(storedObject.nonce);
    const authTag = storedObject.authTag && Buffer.from(storedObject.authTag);
    let plaintext: Buffer | null = null;
    try {
      if (!authTag) storageError("INTEGRITY_FAILED");
      const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
      decipher.setAAD(aadFor(input.packageBinding, input.instanceBinding, input.storageRef, input.objectRef));
      decipher.setAuthTag(authTag);
      plaintext = Buffer.allocUnsafe(storedObject.receipt.byteLength);
      const plaintextBuffer = plaintext;
      let decryptedBytes = 0;
      const collector = new Writable({
        write: (chunk: Buffer | Uint8Array, _encoding, callback) => {
          const bytes = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          const nextBytes = decryptedBytes + bytes.byteLength;
          if (nextBytes > plaintextBuffer.byteLength) {
            callback(new TemporaryImagingStorageError("LIMIT_EXCEEDED"));
            return;
          }
          bytes.copy(plaintextBuffer, decryptedBytes);
          decryptedBytes = nextBytes;
          callback();
        },
      });
      await pipeline(createReadStream(storedObject.filePath), decipher, collector);
      if (decryptedBytes !== storedObject.receipt.byteLength) {
        storageError("INTEGRITY_FAILED");
      }
      const digest = createHash("sha256").update(plaintextBuffer).digest("hex");
      if (
        plaintextBuffer.byteLength !== storedObject.receipt.byteLength ||
        `sha256:${digest}` !== storedObject.receipt.sha256
      ) {
        storageError("INTEGRITY_FAILED");
      }
      if (this.now() >= storedPackage.expiresAt || storedPackage.purgePending) {
        storageError(storedPackage.purgePending ? "STORAGE_UNAVAILABLE" : "EXPIRED");
      }
      return plaintextBuffer;
    } catch (error) {
      plaintext?.fill(0);
      if (error instanceof TemporaryImagingStorageError) throw error;
      throw new TemporaryImagingStorageError("INTEGRITY_FAILED");
    } finally {
      key.fill(0);
      nonce.fill(0);
      authTag?.fill(0);
    }
  }

  async purgePackage(input: {
    readonly storageRef: string;
    readonly binding: TemporaryImagingPackageBinding;
  }): Promise<TemporaryImagingPurgeReceipt> {
    await this.ready;
    this.prunePurgedPackages();
    if (
      !input.binding ||
      !validateUuid(input.storageRef) ||
      !validateUuid(input.binding.tenantId) ||
      !validateUuid(input.binding.exchangeSessionId) ||
      !validateUuid(input.binding.packageId) ||
      input.binding.purpose !== "PACS_IMPORT"
    ) {
      storageError("BINDING_MISMATCH");
    }
    const storageRef = input.storageRef.toLowerCase();
    const storedPackage = this.packages.get(storageRef);
    if (!storedPackage) {
      const priorPurge = this.purgedPackages.get(storageRef);
      if (!priorPurge) storageError("PACKAGE_NOT_FOUND");
      if (priorPurge.bindingFingerprint !== packageBindingFingerprint(input.binding)) {
        storageError("BINDING_MISMATCH");
      }
      return priorPurge.receipt;
    }
    this.assertPackageBinding(storedPackage, input.binding);
    if (storedPackage.purgePromise) return storedPackage.purgePromise;

    const purgePromise = this.purgeStoredPackage(storageRef, storedPackage);
    storedPackage.purgePromise = purgePromise;
    try {
      return await purgePromise;
    } catch (error) {
      if (storedPackage.purgePromise === purgePromise) storedPackage.purgePromise = undefined;
      throw error;
    }
  }

  /**
   * Removes a package after its StudyReference/operation binding has already
   * been validated in a verified Tenant transaction. This method cannot read
   * or decrypt data and never accepts a caller-supplied filesystem path.
   */
  async purgeByReference(input: {
    readonly storageRef: string;
    readonly binding: TemporaryImagingPackageBinding;
  }): Promise<void> {
    await this.ready;
    if (
      !input?.binding ||
      !validateUuid(input.binding.tenantId) ||
      !validateUuid(input.binding.exchangeSessionId) ||
      !validateUuid(input.binding.packageId) ||
      input.binding.purpose !== "PACS_IMPORT"
    ) {
      storageError("BINDING_MISMATCH");
    }
    const storageRef = input.storageRef?.toLowerCase();
    if (!validateUuid(storageRef)) storageError("INVALID_INPUT");
    if (this.packages.has(storageRef) || this.purgedPackages.has(storageRef)) {
      await this.purgePackage({ storageRef, binding: input.binding });
      return;
    }
    await this.purgeOrphan(storageRef);
  }

  /** Purge-only restart recovery for an opaque ref resolved under Tenant RLS. */
  async purgeOrphan(storageRefInput: string): Promise<void> {
    await this.ready;
    if (!validateUuid(storageRefInput)) storageError("INVALID_INPUT");
    const storageRef = storageRefInput.toLowerCase();
    if (!this.recoveryRequiredRefs.has(storageRef)) {
      const unexpected = await lstat(this.packageDirectory(storageRef)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          return storageError("STORAGE_UNAVAILABLE");
        },
      );
      if (unexpected) storageError("RECOVERY_REQUIRED");
    }
    try {
      await this.removePackageDirectory(storageRef);
      this.recoveryRequiredRefs.delete(storageRef);
      const remaining = await readdir(this.rootDirectory);
      if (remaining.length === 0) {
        this.recoveryRequiredRefs.clear();
        this.hasUnexpectedRecoveryEntries = false;
      }
    } catch (error) {
      if (error instanceof TemporaryImagingStorageError) throw error;
      storageError("STORAGE_UNAVAILABLE");
    }
  }

  private async purgeStoredPackage(
    storageRef: string,
    storedPackage: StoredPackage,
  ): Promise<TemporaryImagingPurgeReceipt> {
    storedPackage.purgePending = true;
    storedPackage.abortController.abort();
    if (storedPackage.activeStages > 0) {
      await new Promise<void>((resolveIdle) => storedPackage.idleWaiters.push(resolveIdle));
    }
    for (const object of storedPackage.objects.values()) {
      object.key.fill(0);
      object.nonce.fill(0);
      object.authTag?.fill(0);
      object.authTag = null;
    }
    try {
      await this.removePackageDirectory(storageRef);
    } catch {
      storageError("STORAGE_UNAVAILABLE");
    }
    const receipt = Object.freeze({
      storageRef,
      packageId: storedPackage.handle.packageId,
      objectCount: storedPackage.objects.size,
      byteLength: storedPackage.byteLength,
      deletedAt: new Date(this.now()),
    });
    this.environmentBytes -= storedPackage.byteLength;
    this.packages.delete(storageRef);
    this.recoveryRequiredRefs.delete(storageRef);
    this.purgedPackages.set(storageRef, {
      bindingFingerprint: packageBindingFingerprint(storedPackage.binding),
      receipt,
    });
    this.prunePurgedPackages();
    return receipt;
  }

  private async removePackageDirectory(storageRef: string): Promise<void> {
    const directory = this.packageDirectory(storageRef);
    const directoryInfo = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      return storageError("STORAGE_UNAVAILABLE");
    });
    if (!directoryInfo) return;
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
      storageError("STORAGE_UNAVAILABLE");
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        return storageError("STORAGE_UNAVAILABLE");
      },
    );
    if (!entries) return;
    for (const entry of entries) {
      if (!CIPHERTEXT_FILE_PATTERN.test(entry.name) || !entry.isFile()) {
        storageError("STORAGE_UNAVAILABLE");
      }
      const filePath = join(directory, entry.name);
      const fileInfo = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        return storageError("STORAGE_UNAVAILABLE");
      });
      if (!fileInfo) continue;
      if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
        storageError("STORAGE_UNAVAILABLE");
      }
      try {
        await unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          storageError("STORAGE_UNAVAILABLE");
        }
      }
    }
    try {
      await rmdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        storageError("STORAGE_UNAVAILABLE");
      }
    }
  }

  private async initialize(): Promise<void> {
    try {
      await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
      const rootInfo = await lstat(this.rootDirectory);
      if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) storageError("STORAGE_UNAVAILABLE");
      await chmod(this.rootDirectory, 0o700);
      const entries = await readdir(this.rootDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (validateUuid(entry.name)) this.recoveryRequiredRefs.add(entry.name.toLowerCase());
        else this.hasUnexpectedRecoveryEntries = true;
      }
    } catch (error) {
      if (error instanceof TemporaryImagingStorageError) throw error;
      storageError("STORAGE_UNAVAILABLE");
    }
  }

  private packageDirectory(storageRef: string): string {
    if (!validateUuid(storageRef)) storageError("INVALID_INPUT");
    return join(this.rootDirectory, storageRef);
  }

  private async reserveSharedQuota(
    storedPackage: StoredPackage,
    studyRefIdInput: string,
    requiredBytes: number,
  ): Promise<void> {
    if (!storedPackage.quotaRequired) return;
    const quota = this.sharedQuota;
    const studyRefId = studyRefIdInput.toLowerCase();
    if (
      !quota ||
      storedPackage.quotaStudyRefId !== studyRefId ||
      storedPackage.quotaFinalizing
    ) {
      storageError("QUOTA_UNAVAILABLE");
    }

    const previousReservation = storedPackage.quotaReservationTail;
    let releaseReservation!: () => void;
    storedPackage.quotaReservationTail = new Promise<void>((resolve) => {
      releaseReservation = resolve;
    });
    await previousReservation;
    try {
      while (storedPackage.sharedQuotaReservedBytes < requiredBytes) {
        await quota.reserve({
          tenantId: storedPackage.binding.tenantId,
          studyRefId,
          storageRef: storedPackage.handle.storageRef,
          writerId: storedPackage.quotaWriterId,
          deltaBytes: TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES,
        });
        storedPackage.sharedQuotaReservedBytes += TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES;
      }
    } catch {
      storageError("QUOTA_UNAVAILABLE");
    } finally {
      releaseReservation();
    }
  }

  private prunePurgedPackages(): void {
    const expiredBefore = this.now() - this.limits.packageTtlMilliseconds;
    for (const [storageRef, entry] of this.purgedPackages) {
      if (entry.receipt.deletedAt.getTime() < expiredBefore) {
        this.purgedPackages.delete(storageRef);
      }
    }
    while (this.purgedPackages.size > MAX_PURGE_TOMBSTONES) {
      const oldest = this.purgedPackages.keys().next().value;
      if (!oldest) break;
      this.purgedPackages.delete(oldest);
    }
  }

  private getPackage(storageRef: string): StoredPackage {
    if (!validateUuid(storageRef)) storageError("INVALID_INPUT");
    const storedPackage = this.packages.get(storageRef);
    if (!storedPackage) {
      if (this.recoveryRequiredRefs.size > 0 || this.hasUnexpectedRecoveryEntries) {
        storageError("RECOVERY_REQUIRED");
      }
      storageError("PACKAGE_NOT_FOUND");
    }
    return storedPackage;
  }

  private assertRecoveryComplete(): void {
    if (this.recoveryRequiredRefs.size > 0 || this.hasUnexpectedRecoveryEntries) {
      storageError("RECOVERY_REQUIRED");
    }
  }

  private assertPackageBinding(
    storedPackage: StoredPackage,
    binding: TemporaryImagingPackageBinding,
  ): void {
    if (
      !binding ||
      !validateUuid(binding.tenantId) ||
      !validateUuid(binding.exchangeSessionId) ||
      !validateUuid(binding.packageId) ||
      binding.purpose !== "PACS_IMPORT" ||
      !packageBindingEqual(storedPackage.binding, binding)
    ) {
      storageError("BINDING_MISMATCH");
    }
  }
}
