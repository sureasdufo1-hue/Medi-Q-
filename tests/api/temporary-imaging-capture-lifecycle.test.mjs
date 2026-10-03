import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EphemeralEncryptedTemporaryImagingStore,
  TEMPORARY_IMAGING_LIMITS,
} from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";

// DEC-017 LIFECYCLE-002/004 test-first contracts. Quota is modeled here:
// these tests do not prove OIDC, registry membership, Authorization or DB/RLS.
// Keep new contracts RED until implemented; never skip or mark expected-failure.
const fixtures = [];
const bytes = Buffer.from("TEST-SYNTHETIC-LIFECYCLE-BYTES-NOT-DICOM");
const binding = (tenant = randomUUID()) => Object.freeze({
  tenantId: tenant, exchangeSessionId: randomUUID(), packageId: randomUUID(), purpose: "PACS_IMPORT",
});
function quotaPort() {
  const port = {
    reserve: vi.fn(async function () { expect(this).toBe(port); }),
    settle: vi.fn(async function () { expect(this).toBe(port); }),
  };
  return port;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "mediq-capture-lifecycle-"));
  const storageRoot = join(root, "ciphertext");
  await mkdir(storageRoot, { mode: 0o700 });
  const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, ...options });
  const fixture = { root, storageRoot, store, attempted: [] };
  fixtures.push(fixture);
  return fixture;
}

async function reserve(fixture, packageBinding, ...quota) {
  const storageRef = randomUUID();
  // Track the attempted ref before the await, including rejected allocation.
  fixture.attempted.push({ storageRef, binding: packageBinding });
  return fixture.store.beginReservedPackage(packageBinding, storageRef, ...quota);
}

async function stage(fixture, handle, packageBinding) {
  return fixture.store.stageInstance({
    storageRef: handle.storageRef, packageBinding,
    instanceBinding: { studyRefId: randomUUID(), seriesInstanceUid: "2.25.77001", sopInstanceUid: "2.25.77002" },
    source: (async function* () { yield bytes; })(),
  });
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    try {
      for (const ref of fixture.attempted) await fixture.store.purgeByReference(ref);
      expect(await readdir(fixture.storageRoot)).toEqual([]);
    } finally {
      // Fresh test-owned directory only; never a repository or runtime root.
      assert.equal(resolve(dirname(fixture.root)), resolve(tmpdir()));
      assert.ok(basename(fixture.root).startsWith("mediq-capture-lifecycle-"));
      await rm(fixture.root, { recursive: true, force: true });
      await assert.rejects(stat(fixture.root), { code: "ENOENT" });
    }
  }
});

describe("DEC-017 explicit capture quota and completion TTL (unit contract)", () => {
  it("uses an explicit per-package quota without requiring a constructor-level adapter", async () => {
    const fixture = await setup();
    const packageBinding = binding();
    const quota = quotaPort();
    const handle = await reserve(fixture, packageBinding, quota);
    await stage(fixture, handle, packageBinding);
    const sealed = await fixture.store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    expect(sealed.totalBytes).toBe(bytes.length);
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.settle).toHaveBeenCalledOnce();
    expect(quota.reserve.mock.calls[0][0]).toMatchObject({ tenantId: packageBinding.tenantId, storageRef: handle.storageRef });
    expect(quota.settle.mock.calls[0][0]).toMatchObject({ tenantId: packageBinding.tenantId, storageRef: handle.storageRef, actualBytes: bytes.length });
  });

  it("keeps two packages' explicit quota methods separate and snapshots them before awaits", async () => {
    const fallback = quotaPort();
    const fixture = await setup({ sharedQuota: fallback });
    const a = binding();
    const b = binding();
    const quotaA = quotaPort();
    const quotaB = quotaPort();
    const reserveA = quotaA.reserve;
    const settleA = quotaA.settle;
    const pendingA = reserve(fixture, a, quotaA);
    // Mutate before awaiting allocation, not merely after it has completed.
    quotaA.reserve = vi.fn(async () => { throw new Error("TEST_MUTATED_QUOTA"); });
    quotaA.settle = vi.fn(async () => { throw new Error("TEST_MUTATED_QUOTA"); });
    const handleA = await pendingA;
    const handleB = await reserve(fixture, b, quotaB);
    await Promise.all([stage(fixture, handleA, a), stage(fixture, handleB, b)]);
    await fixture.store.sealPackage({ storageRef: handleA.storageRef, binding: a });
    await fixture.store.sealPackage({ storageRef: handleB.storageRef, binding: b });
    expect(fallback.reserve).not.toHaveBeenCalled();
    expect(fallback.settle).not.toHaveBeenCalled();
    expect(reserveA).toHaveBeenCalledOnce();
    expect(settleA).toHaveBeenCalledOnce();
    expect(quotaA.reserve).not.toHaveBeenCalled();
    expect(quotaA.settle).not.toHaveBeenCalled();
    expect(quotaB.reserve).toHaveBeenCalledOnce();
    expect(quotaB.settle).toHaveBeenCalledOnce();
    expect(reserveA.mock.calls[0][0].tenantId).toBe(a.tenantId);
    expect(quotaB.reserve.mock.calls[0][0].tenantId).toBe(b.tenantId);
    expect(settleA.mock.calls[0][0].storageRef).toBe(handleA.storageRef);
    expect(quotaB.settle.mock.calls[0][0].storageRef).toBe(handleB.storageRef);
  });

  it.each([["null", null], ["missing methods", {}], ["missing settle", { reserve: async () => {} }]])("rejects malformed explicit quota (%s) without falling back or allocating a package", async (_label, quota) => {
    const fallback = quotaPort();
    const fixture = await setup({ sharedQuota: fallback });
    await expect(reserve(fixture, binding(), quota)).rejects.toMatchObject({ code: "QUOTA_UNAVAILABLE" });
    expect(await readdir(fixture.storageRoot)).toEqual([]);
    expect(fallback.reserve).not.toHaveBeenCalled();
    expect(fallback.settle).not.toHaveBeenCalled();
  });

  it("starts the completed-copy TTL after delayed quota settlement, not before it", async () => {
    let now = Date.parse("2026-10-03T05:00:00Z");
    const entered = deferred();
    const release = deferred();
    const quota = quotaPort();
    quota.settle.mockImplementation(async () => { entered.resolve(); await release.promise; });
    // Constructor adapter isolates the timestamp defect from the new argument.
    const fixture = await setup({ sharedQuota: quota, now: () => now });
    const packageBinding = binding();
    const handle = await reserve(fixture, packageBinding);
    await stage(fixture, handle, packageBinding);
    const sealing = fixture.store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    try {
      await entered.promise;
      now += 5 * 60_000;
      release.resolve();
      const sealed = await sealing;
      expect(sealed.expiresAt.getTime()).toBe(now + TEMPORARY_IMAGING_LIMITS.packageTtlMilliseconds);
      expect(sealed.objectCount).toBe(1);
      expect(sealed.totalBytes).toBe(bytes.length);
    } finally {
      release.resolve();
      await sealing.catch(() => {});
    }
  });

  it("preserves constructor-only reserved-package quota compatibility", async () => {
    const quota = quotaPort();
    const fixture = await setup({ sharedQuota: quota });
    const packageBinding = binding();
    const handle = await reserve(fixture, packageBinding);
    await stage(fixture, handle, packageBinding);
    await fixture.store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.settle).toHaveBeenCalledOnce();
  });
});
