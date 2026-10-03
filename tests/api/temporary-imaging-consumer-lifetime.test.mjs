import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EphemeralEncryptedTemporaryImagingStore } from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";

const fixtures = [];
const outstanding = new Set();
const releases = [];
// Deliberately no authority: fixtures are isolated synthetic bytes, no runtime.
const syntheticVerifier = async () => "VERIFIED";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

function consume(fixture, consumer, { request = fixture.request, verify = syntheticVerifier } = {}) {
  const task = fixture.store.consumeInstance(request, verify, consumer);
  outstanding.add(task);
  task.then(() => outstanding.delete(task), () => outstanding.delete(task));
  return task;
}

async function setup(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "mediq-borrowed-instance-"));
  const storageRoot = join(root, "ciphertext");
  const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, ...options });
  const packageBinding = {
    tenantId: randomUUID(), exchangeSessionId: randomUUID(), packageId: randomUUID(), purpose: "PACS_IMPORT",
  };
  const instanceBinding = { studyRefId: randomUUID(), seriesInstanceUid: "2.25.10", sopInstanceUid: "2.25.20" };
  const handle = await store.beginPackage(packageBinding);
  const fixture = { root, storageRoot, store, packageBinding, instanceBinding, handle };
  fixtures.push(fixture);
  const bytes = Buffer.from("SYNTHETIC-BORROWED-INSTANCE-NOT-PHI-007");
  const receipt = await store.stageInstance({
    storageRef: handle.storageRef, packageBinding, instanceBinding,
    source: (async function* () { yield bytes; })(),
  });
  const sealed = await store.sealPackage({ storageRef: handle.storageRef, binding: packageBinding });
  return Object.assign(fixture, {
    bytes, receipt, sealed,
    request: {
      storageRef: handle.storageRef, objectRef: receipt.objectRef, packageBinding, instanceBinding,
      expectedByteLength: bytes.byteLength,
      expectedSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    },
  });
}

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.allSettled([...outstanding]);
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) {
    await fixture.store.purgePackage({ storageRef: fixture.handle.storageRef, binding: fixture.packageBinding });
    expect(await readdir(fixture.storageRoot)).toEqual([]);
    await rmdir(fixture.storageRoot);
    await rmdir(fixture.root);
  }
}, 30_000);

describe("DEC-013 borrowed authenticated instance lifetime", () => {
  it("requires two verifier decisions, returns void and zeroes borrowed bytes after success", async () => {
    const fixture = await setup();
    const order = [];
    let borrowed;
    const result = await consume(fixture, async (bytes, signal) => {
      order.push("consume");
      expect(signal.aborted).toBe(false);
      expect(bytes).toEqual(fixture.bytes);
      borrowed = bytes;
      return bytes; // Even a JS consumer's non-void result must never escape.
    }, { verify: async (request) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.packageBinding)).toBe(true);
      expect(Object.isFrozen(request.instanceBinding)).toBe(true);
      order.push("verify");
      return "VERIFIED";
    } });
    expect(result).toBeUndefined();
    expect(order).toEqual(["verify", "verify", "consume"]);
    expect(borrowed.every((value) => value === 0)).toBe(true);
    expect(fixture.store.readInstance).toBeUndefined();
    expect(fixture.store.readAuthenticatedInstance).toBeUndefined();
    expect(fixture.store.assertReadableInstance).toBeUndefined();
  });

  it("holds one lifetime across distinct store instances and zeroes before the next verifier", async () => {
    const first = await setup();
    const second = await setup();
    const entered = deferred();
    const release = deferred();
    let borrowed;
    const firstTask = consume(first, async (bytes) => { borrowed = bytes; entered.resolve(); await release.promise; });
    await entered.promise;
    const secondVerifier = vi.fn(async () => {
      expect(borrowed.every((value) => value === 0)).toBe(true);
      return "VERIFIED";
    });
    const secondConsumer = vi.fn(async () => {});
    const secondTask = consume(second, secondConsumer, { verify: secondVerifier });
    await nextTurn();
    expect(secondVerifier).not.toHaveBeenCalled(); // No second decrypt is admitted.
    expect(secondConsumer).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([firstTask, secondTask]);
    expect(secondVerifier).toHaveBeenCalledTimes(2);
    expect(secondConsumer).toHaveBeenCalledOnce();
  });

  it("bounds eight queued requests and cancels them before access checks/decrypt", async () => {
    const fixture = await setup();
    const entered = deferred();
    const release = deferred();
    const active = consume(fixture, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const queuedVerifier = vi.fn(syntheticVerifier);
    const queuedConsumer = vi.fn(async () => {});
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    const queue = controllers.map((controller) => consume(fixture, queuedConsumer, {
      request: { ...fixture.request, signal: controller.signal }, verify: queuedVerifier,
    }));
    await expect(consume(fixture, queuedConsumer, { verify: queuedVerifier }))
      .rejects.toMatchObject({ code: "CAPACITY_EXCEEDED", message: "TEMPORARY_IMAGING_STORAGE_UNAVAILABLE" });
    expect(queuedVerifier).not.toHaveBeenCalled();
    for (const controller of controllers) controller.abort();
    const results = await Promise.allSettled(queue);
    expect(results.every((result) => result.status === "rejected" && result.reason.code === "ABORTED")).toBe(true);
    expect(queuedConsumer).not.toHaveBeenCalled();
    release.resolve();
    await active;
    await consume(fixture, async () => {});
  });

  it("rejects a pre-aborted request without calling its verifier or consumer", async () => {
    const fixture = await setup();
    const verify = vi.fn(syntheticVerifier);
    const consumer = vi.fn(async () => {});
    await expect(consume(fixture, consumer, {
      request: { ...fixture.request, signal: AbortSignal.abort() }, verify,
    })).rejects.toMatchObject({ code: "ABORTED" });
    expect(verify).not.toHaveBeenCalled();
    expect(consumer).not.toHaveBeenCalled();
  });

  it.each(["verifier", "consumer"])("fails closed when the required %s is absent", async (missing) => {
    const fixture = await setup();
    await expect(fixture.store.consumeInstance(
      fixture.request, missing === "verifier" ? undefined : syntheticVerifier,
      missing === "consumer" ? undefined : async () => {},
    )).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it.each([1, 2])("sanitizes access denial at verifier boundary %i without delivering bytes", async (denyAt) => {
    const fixture = await setup();
    let calls = 0;
    const consumer = vi.fn(async () => {});
    // Inspect only the primitive's fixed-size owned allocation, without a new production seam.
    const allocated = [];
    const originalAllocate = Buffer.allocUnsafe;
    const allocationSpy = vi.spyOn(Buffer, "allocUnsafe").mockImplementation((size) => {
      const buffer = originalAllocate(size);
      if (size === fixture.bytes.byteLength) allocated.push(buffer);
      return buffer;
    });
    await expect(consume(fixture, consumer, { verify: async () => {
      if (++calls === denyAt) throw new Error("raw verifier details must not escape");
      return "VERIFIED";
    } })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED", message: "TEMPORARY_IMAGING_STORAGE_UNAVAILABLE" });
    allocationSpy.mockRestore();
    expect(calls).toBe(denyAt);
    expect(consumer).not.toHaveBeenCalled();
    if (denyAt === 1) expect(allocated).toHaveLength(0);
    else {
      expect(allocated).toHaveLength(1);
      expect(allocated[0].every((value) => value === 0)).toBe(true);
    }
  });

  it.each(["expiry", "purge"])("rechecks %s after the final verifier", async (change) => {
    let now = Date.now();
    const fixture = await setup({ now: () => now });
    let checks = 0;
    const consumer = vi.fn(async () => {});
    await expect(consume(fixture, consumer, { verify: async () => {
      if (++checks !== 2) return "VERIFIED";
      if (change === "expiry") now = fixture.sealed.expiresAt.getTime();
      else await fixture.store.purgePackage({ storageRef: fixture.handle.storageRef, binding: fixture.packageBinding });
      return "VERIFIED";
    } })).rejects.toMatchObject({ code: change === "expiry" ? "EXPIRED" : "PACKAGE_NOT_FOUND" });
    expect(consumer).not.toHaveBeenCalled();
  });

  it("sanitizes consumer failure, zeroes the buffer and permits subsequent work", async () => {
    const fixture = await setup();
    let borrowed;
    await expect(consume(fixture, async (bytes) => {
      borrowed = bytes;
      throw new Error("raw consumer endpoint/payload must not escape");
    })).rejects.toMatchObject({ code: "CONSUMER_FAILED", message: "TEMPORARY_IMAGING_STORAGE_UNAVAILABLE" });
    expect(borrowed.every((value) => value === 0)).toBe(true);
    await consume(fixture, async () => {});
  });

  it("does not release admission on abort until an ignoring consumer actually settles", async () => {
    const fixture = await setup();
    const controller = new AbortController();
    const entered = deferred();
    const release = deferred();
    let borrowed;
    let settled = false;
    const first = consume(fixture, async (bytes, signal) => {
      borrowed = bytes;
      expect(signal).toBe(controller.signal);
      entered.resolve();
      await release.promise;
    }, { request: { ...fixture.request, signal: controller.signal } });
    first.then(() => { settled = true; }, () => { settled = true; });
    await entered.promise;
    controller.abort();
    const secondVerifier = vi.fn(syntheticVerifier);
    const second = consume(fixture, async () => {}, { verify: secondVerifier });
    await nextTurn();
    expect(settled).toBe(false);
    expect(secondVerifier).not.toHaveBeenCalled();
    release.resolve();
    await expect(first).rejects.toMatchObject({ code: "ABORTED" });
    await second;
    expect(borrowed.every((value) => value === 0)).toBe(true);
  });

  it("snapshots selectors before queuing so caller mutation cannot substitute scope", async () => {
    const fixture = await setup();
    const entered = deferred();
    const release = deferred();
    const first = consume(fixture, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const mutable = {
      ...fixture.request, packageBinding: { ...fixture.packageBinding }, instanceBinding: { ...fixture.instanceBinding },
    };
    const verifier = vi.fn(async (request) => {
      expect(request.packageBinding.tenantId).toBe(fixture.packageBinding.tenantId);
      expect(request.objectRef).toBe(fixture.request.objectRef);
      return "VERIFIED";
    });
    const second = consume(fixture, async (bytes) => { expect(bytes).toEqual(fixture.bytes); }, { request: mutable, verify: verifier });
    mutable.objectRef = randomUUID();
    mutable.packageBinding.tenantId = randomUUID();
    mutable.instanceBinding.sopInstanceUid = "2.25.999";
    mutable.expectedSha256 = `sha256:${"0".repeat(64)}`;
    release.resolve();
    await Promise.all([first, second]);
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it("never calls the consumer for tampered ciphertext and releases the admission", async () => {
    const fixture = await setup();
    await writeFile(join(fixture.storageRoot, fixture.handle.storageRef, `${fixture.receipt.objectRef}.enc`), Buffer.alloc(fixture.bytes.byteLength));
    const consumer = vi.fn(async () => {});
    await expect(consume(fixture, consumer)).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    expect(consumer).not.toHaveBeenCalled();
    const healthy = await setup();
    await consume(healthy, async () => {});
  });

  it.each([undefined, false, "DENIED", "VERIFIED_ELSE", { kind: "VERIFIED" }])(
    "does not treat verifier result %j as explicit verification",
    async (result) => {
      const fixture = await setup();
      const consumer = vi.fn(async () => {});
      await expect(consume(fixture, consumer, { verify: async () => result }))
        .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect(consumer).not.toHaveBeenCalled();
    },
  );

  it.each(["expiry", "purge"])("rejects a queued instance after %s without delivering plaintext", async (change) => {
    let now = Date.now();
    const holder = await setup();
    const queuedFixture = await setup({ now: () => now });
    const entered = deferred();
    const release = deferred();
    const first = consume(holder, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const consumer = vi.fn(async () => {});
    const queued = consume(queuedFixture, consumer);
    if (change === "expiry") now = queuedFixture.sealed.expiresAt.getTime();
    else await queuedFixture.store.purgePackage({
      storageRef: queuedFixture.handle.storageRef, binding: queuedFixture.packageBinding,
    });
    release.resolve();
    await first;
    await expect(queued).rejects.toMatchObject({ code: change === "expiry" ? "EXPIRED" : "PACKAGE_NOT_FOUND" });
    expect(consumer).not.toHaveBeenCalled();
  });
});
