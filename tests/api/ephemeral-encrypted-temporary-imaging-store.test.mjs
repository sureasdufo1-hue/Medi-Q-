import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EphemeralEncryptedTemporaryImagingStore,
} from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";

const roots = [];
const packageBinding = Object.freeze({
  tenantId: "10000000-0000-4000-8000-000000000001",
  exchangeSessionId: "20000000-0000-4000-8000-000000000001",
  packageId: "30000000-0000-4000-8000-000000000001",
  purpose: "PACS_IMPORT",
});
const instanceBinding = Object.freeze({
  studyRefId: "40000000-0000-4000-8000-000000000001",
  seriesInstanceUid: "2.25.10",
  sopInstanceUid: "2.25.20",
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "mediq-temp-imaging-"));
  roots.push(root);
  const storageRoot = join(root, "private-store");
  const store = new EphemeralEncryptedTemporaryImagingStore({
    rootDirectory: storageRoot,
    ...options,
  });
  const handle = await store.beginPackage(packageBinding);
  return { root, storageRoot, store, handle };
}

async function* chunks(bytes, chunkSize = 3) {
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    yield bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
  }
}

function stage(store, handle, bytes, binding = instanceBinding) {
  return store.stageInstance({
    storageRef: handle.storageRef,
    packageBinding,
    instanceBinding: binding,
    source: chunks(bytes),
  });
}

function read(store, handle, receipt, overrides = {}) {
  return store.readInstance({
    storageRef: handle.storageRef,
    objectRef: receipt.objectRef,
    packageBinding,
    instanceBinding,
    expectedByteLength: receipt.byteLength,
    expectedSha256: receipt.sha256,
    ...overrides,
  });
}

describe("P0 ephemeral AES-256-GCM temporary imaging spool primitive", () => {
  it("stages ciphertext only and returns exact bytes after full authentication and digest verification", async () => {
    const { storageRoot, store, handle } = await setup();
    const sourceBytes = Buffer.from("SYNTHETIC-DICOM-PIXEL-DATA\0NOT-REAL-PHI");
    const receipt = await stage(store, handle, sourceBytes);

    expect(receipt).toMatchObject({
      studyRefId: instanceBinding.studyRefId,
      seriesInstanceUid: instanceBinding.seriesInstanceUid,
      sopInstanceUid: instanceBinding.sopInstanceUid,
      byteLength: sourceBytes.byteLength,
      sha256: `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`,
    });
    expect(Object.keys(await readdir(join(storageRoot, handle.storageRef)))).toHaveLength(1);
    const ciphertext = await readFile(join(storageRoot, handle.storageRef, `${receipt.objectRef}.enc`));
    expect(ciphertext).not.toEqual(sourceBytes);
    expect(ciphertext.includes(sourceBytes)).toBe(false);

    await expect(read(store, handle, receipt)).rejects.toMatchObject({
      code: "PACKAGE_NOT_SEALED",
    });
    const sealed = await store.sealPackage({
      storageRef: handle.storageRef,
      binding: packageBinding,
    });
    expect(sealed.totalBytes).toBe(sourceBytes.byteLength);
    expect(await read(store, handle, receipt)).toEqual(sourceBytes);
  });

  it("rejects a cross-tenant binding and wrong Study/Series/SOP binding before releasing plaintext", async () => {
    const { store, handle } = await setup();
    const sourceBytes = Buffer.from("synthetic-instance");
    const receipt = await stage(store, handle, sourceBytes);
    await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });

    await expect(
      store.readInstance({
        storageRef: handle.storageRef,
        objectRef: receipt.objectRef,
        packageBinding: { ...packageBinding, tenantId: "10000000-0000-4000-8000-000000000002" },
        instanceBinding,
        expectedByteLength: receipt.byteLength,
        expectedSha256: receipt.sha256,
      }),
    ).rejects.toMatchObject({ code: "BINDING_MISMATCH" });
    await expect(
      read(store, handle, receipt, {
        instanceBinding: { ...instanceBinding, studyRefId: "40000000-0000-4000-8000-000000000002" },
      }),
    ).rejects.toMatchObject({ code: "BINDING_MISMATCH" });
  });

  it("rejects tampered ciphertext without returning buffered plaintext", async () => {
    const { storageRoot, store, handle } = await setup();
    const sourceBytes = Buffer.from("tamper-detection-fixture");
    const receipt = await stage(store, handle, sourceBytes);
    await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    const objectPath = join(storageRoot, handle.storageRef, `${receipt.objectRef}.enc`);
    const ciphertext = await readFile(objectPath);
    ciphertext[0] ^= 0x40;
    await writeFile(objectPath, ciphertext);

    await expect(read(store, handle, receipt)).rejects.toMatchObject({
      code: "INTEGRITY_FAILED",
      message: "TEMPORARY_IMAGING_STORAGE_UNAVAILABLE",
    });
  });

  it("denies at TTL and purges idempotently without exposing the storage path", async () => {
    let now = 1000;
    const { storageRoot, store, handle } = await setup({
      now: () => now,
      limits: { packageTtlMilliseconds: 100 },
    });
    const receipt = await stage(store, handle, Buffer.from("short-lived"));
    const sealed = await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    now = sealed.expiresAt.getTime();

    await expect(read(store, handle, receipt)).rejects.toMatchObject({ code: "EXPIRED" });
    const first = await store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding });
    const second = await store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding });
    expect(second).toEqual(first);
    expect(await readdir(storageRoot)).toEqual([]);
    expect(JSON.stringify(first)).not.toMatch(/Users|private-store|2\.25\./);
  });

  it("serializes concurrent purge calls and returns one physical purge receipt", async () => {
    const { storageRoot, store, handle } = await setup();
    await stage(store, handle, Buffer.from("concurrent-purge"));

    const results = await Promise.all([
      store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding }),
      store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding }),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(await readdir(storageRoot)).toEqual([]);
  });

  it("fails closed on unexpected package entries and permits an idempotent retry after operator cleanup", async () => {
    const { storageRoot, store, handle } = await setup();
    await stage(store, handle, Buffer.from("unexpected-entry"));
    await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    const unexpected = join(storageRoot, handle.storageRef, "unexpected");
    await mkdir(unexpected);

    await expect(
      store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    await expect(read(store, handle, { objectRef: "00000000-0000-4000-8000-000000000000" }))
      .rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });

    await rm(unexpected, { recursive: true });
    await store.purgePackage({ storageRef: handle.storageRef, binding: packageBinding });
    expect(await readdir(storageRoot)).toEqual([]);
  });

  it("fails closed on configured byte ceilings and removes the partial object", async () => {
    const { storageRoot, store, handle } = await setup({
      limits: {
        maximumInstanceBytes: 4,
        maximumPackageBytes: 8,
        maximumEnvironmentBytes: 8,
      },
    });
    await expect(stage(store, handle, Buffer.from("12345"))).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    expect(await readdir(join(storageRoot, handle.storageRef))).toEqual([]);
  });

  it("reserves the in-process environment quota before concurrent file writes", async () => {
    const { store, handle } = await setup({
      limits: {
        maximumInstanceBytes: 4,
        maximumPackageBytes: 8,
        maximumEnvironmentBytes: 8,
      },
    });
    const bindingB = {
      ...packageBinding,
      exchangeSessionId: "20000000-0000-4000-8000-000000000002",
      packageId: "30000000-0000-4000-8000-000000000002",
    };
    const bindingC = {
      ...packageBinding,
      exchangeSessionId: "20000000-0000-4000-8000-000000000003",
      packageId: "30000000-0000-4000-8000-000000000003",
    };
    const handleB = await store.beginPackage(bindingB);
    const handleC = await store.beginPackage(bindingC);
    const requests = [
      { handle, binding: packageBinding, sopInstanceUid: "2.25.201" },
      { handle: handleB, binding: bindingB, sopInstanceUid: "2.25.202" },
      { handle: handleC, binding: bindingC, sopInstanceUid: "2.25.203" },
    ];
    const writers = await Promise.all(requests.map((request) => store.beginInstance({
      storageRef: request.handle.storageRef,
      packageBinding: request.binding,
      instanceBinding: {
        studyRefId: instanceBinding.studyRefId,
        seriesInstanceUid: instanceBinding.seriesInstanceUid,
        sopInstanceUid: request.sopInstanceUid,
      },
    })));

    const firstWrites = await Promise.allSettled(
      writers.map((writer) => writer.write(Buffer.alloc(4, 0x2a))),
    );
    expect(firstWrites.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(firstWrites.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = firstWrites.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({ code: "LIMIT_EXCEEDED" });
    await Promise.all(writers.map((writer) => writer.abort()));

    const retryWriters = await Promise.all(requests.slice(0, 2).map((request) => store.beginInstance({
      storageRef: request.handle.storageRef,
      packageBinding: request.binding,
      instanceBinding: {
        studyRefId: instanceBinding.studyRefId,
        seriesInstanceUid: instanceBinding.seriesInstanceUid,
        sopInstanceUid: request.sopInstanceUid,
      },
    })));
    await Promise.all(retryWriters.map((writer) => writer.write(Buffer.alloc(4, 0x2b))));
    await Promise.all(retryWriters.map((writer) => writer.abort()));
  });

  it("requires shared quota for a reserved package and reserves database blocks before ciphertext writes", async () => {
    const { store } = await setup();
    await expect(store.beginReservedPackage(packageBinding, randomUUID())).rejects.toMatchObject({
      code: "QUOTA_UNAVAILABLE",
    });

    let releaseReservation;
    let notifyReserve;
    const reserveStarted = new Promise((resolve) => { notifyReserve = resolve; });
    const calls = [];
    const sharedQuota = {
      reserve: async (input) => {
        calls.push({ kind: "reserve", ...input });
        notifyReserve();
        await new Promise((resolve) => { releaseReservation = resolve; });
      },
      settle: async (input) => calls.push({ kind: "settle", ...input }),
    };
    const root = await mkdtemp(join(tmpdir(), "mediq-shared-quota-"));
    roots.push(root);
    const storageRoot = join(root, "private-store");
    const reservedStore = new EphemeralEncryptedTemporaryImagingStore({
      rootDirectory: storageRoot,
      sharedQuota,
    });
    const storageRef = randomUUID();
    const handle = await reservedStore.beginReservedPackage(packageBinding, storageRef);
    const writer = await reservedStore.beginInstance({
      storageRef,
      packageBinding,
      instanceBinding,
    });
    const bytes = Buffer.from("SYNTHETIC-QUOTA-BLOCK");
    const pendingWrite = writer.write(bytes);
    await reserveStarted;
    const [objectFile] = await readdir(join(storageRoot, storageRef));
    expect((await stat(join(storageRoot, storageRef, objectFile))).size).toBe(0);
    expect(calls[0]).toMatchObject({
      kind: "reserve",
      tenantId: packageBinding.tenantId,
      studyRefId: instanceBinding.studyRefId,
      storageRef,
      deltaBytes: 16 * 1024 * 1024,
    });

    releaseReservation();
    await pendingWrite;
    const receipt = await writer.complete({
      byteLength: bytes.byteLength,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
    await reservedStore.sealPackage({ storageRef, binding: packageBinding });
    expect(calls.at(-1)).toMatchObject({
      kind: "settle",
      storageRef,
      actualBytes: bytes.byteLength,
    });
    expect(await reservedStore.readInstance({
      storageRef,
      objectRef: receipt.objectRef,
      packageBinding,
      instanceBinding,
      expectedByteLength: receipt.byteLength,
      expectedSha256: receipt.sha256,
    })).toEqual(bytes);
  });

  it("reserves additional 16 MiB blocks and fails closed if quota admission fails", async () => {
    const reservations = [];
    let settleInput;
    const sharedQuota = {
      reserve: async (input) => reservations.push(input),
      settle: async (input) => { settleInput = input; },
    };
    const root = await mkdtemp(join(tmpdir(), "mediq-shared-quota-blocks-"));
    roots.push(root);
    const storageRoot = join(root, "private-store");
    const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, sharedQuota });
    const storageRef = randomUUID();
    const handle = await store.beginReservedPackage(packageBinding, storageRef);
    const bytes = Buffer.alloc(16 * 1024 * 1024 + 1, 0x61);
    const writer = await store.beginInstance({
      storageRef,
      packageBinding,
      instanceBinding,
    });
    await writer.write(bytes);
    const receipt = await writer.complete({
      byteLength: bytes.byteLength,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
    expect(reservations.map((reservation) => reservation.deltaBytes)).toEqual([
      16 * 1024 * 1024,
      16 * 1024 * 1024,
    ]);
    await store.sealPackage({ storageRef, binding: packageBinding });
    expect(settleInput).toMatchObject({ storageRef, actualBytes: bytes.byteLength });
    expect(receipt.byteLength).toBe(bytes.byteLength);

    const failingRoot = await mkdtemp(join(tmpdir(), "mediq-shared-quota-deny-"));
    roots.push(failingRoot);
    const failingStore = new EphemeralEncryptedTemporaryImagingStore({
      rootDirectory: join(failingRoot, "private-store"),
      sharedQuota: {
        reserve: async () => { throw new Error("database details must not escape"); },
        settle: async () => { throw new Error("not expected"); },
      },
    });
    const failedRef = randomUUID();
    const failedHandle = await failingStore.beginReservedPackage(packageBinding, failedRef);
    await expect(stage(failingStore, failedHandle, Buffer.from("deny-before-write"))).rejects.toMatchObject({
      code: "QUOTA_UNAVAILABLE",
    });
    expect(await readdir(join(failingRoot, "private-store", failedRef))).toEqual([]);
  }, 20_000);

  it("does not allow another StudyReference in one reserved package", async () => {
    const sharedQuota = { reserve: async () => {}, settle: async () => {} };
    const root = await mkdtemp(join(tmpdir(), "mediq-shared-quota-study-"));
    roots.push(root);
    const store = new EphemeralEncryptedTemporaryImagingStore({
      rootDirectory: join(root, "private-store"),
      sharedQuota,
    });
    const storageRef = randomUUID();
    await store.beginReservedPackage(packageBinding, storageRef);
    await store.beginInstance({
      storageRef,
      packageBinding,
      instanceBinding: { ...instanceBinding, studyRefId: randomUUID() },
    });
    await expect(store.beginInstance({
      storageRef,
      packageBinding,
      instanceBinding: { ...instanceBinding, sopInstanceUid: "2.25.21" },
    })).rejects.toMatchObject({ code: "BINDING_MISMATCH" });
  });

  it("does not decrypt after restart and permits only purge-only recovery by opaque ref", async () => {
    const { storageRoot, store, handle } = await setup();
    const receipt = await stage(store, handle, Buffer.from("restart-boundary"));
    await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });

    const restarted = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
    await expect(restarted.beginPackage(packageBinding)).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
    await expect(read(restarted, handle, receipt)).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
    await restarted.purgeOrphan(handle.storageRef);
    expect(await readdir(storageRoot)).toEqual([]);
    const nextHandle = await restarted.beginPackage(packageBinding);
    expect(nextHandle.packageId).toBe(packageBinding.packageId);
  });
});
