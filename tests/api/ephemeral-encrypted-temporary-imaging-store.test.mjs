import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  it("does not decrypt old ciphertext after process restart and refuses to initialize over orphan files", async () => {
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
  });
});
