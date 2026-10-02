import { describe, expect, it, vi } from "vitest";
import {
  buildSourceIntegrityManifest,
  SOURCE_INTEGRITY_ALGORITHM,
  SOURCE_INTEGRITY_LIMITS,
  SourceIntegrityInputError,
} from "../../services/api/dist/integrity/application/source-integrity-manifest.builder.js";

function readable(chunks, onCancel = () => {}) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
    cancel() {
      onCancel();
    },
  });
}

function instance(uid, bytes, overrides = {}) {
  const content = Uint8Array.from(bytes);
  const openStream = vi.fn(async () => ({
    sopInstanceUid: overrides.returnedUid ?? uid,
    mediaType: overrides.mediaType ?? "application/dicom",
    contentLength: overrides.contentLength ?? content.byteLength,
    body: readable(overrides.chunks ?? [content], overrides.onCancel),
  }));
  return { descriptor: { sopInstanceUid: uid, openStream }, openStream };
}

function expectCode(promise, code) {
  return expect(promise).rejects.toMatchObject({
    name: "SourceIntegrityInputError",
    code,
    message: "SOURCE_INTEGRITY_INPUT_REJECTED",
  });
}

describe("P0 bounded source integrity manifest", () => {
  it("emits the fixed SHA256-MANIFEST-V1 known vector", async () => {
    const a = instance("1.2.3", [0x01, 0x02, 0x03]);
    const b = instance("1.2.4", [0x10, 0x20]);

    await expect(
      buildSourceIntegrityManifest({
        expectedInstanceCount: 2,
        instances: [a.descriptor, b.descriptor],
      }),
    ).resolves.toEqual({
      algorithm: SOURCE_INTEGRITY_ALGORITHM,
      aggregateDigest: "sha256:855de908102c02a22d8d8c3f86e0096864689848ec77ba64c538878b4d1c0cca",
      objectCount: 2,
      totalBytes: 5,
    });
  });

  it("canonicalizes enumeration order and opens one object stream at a time", async () => {
    const opened = [];
    const completed = [];
    const lifecycle = [];
    let active = 0;
    let maximumActive = 0;
    const make = (uid, byte) => ({
      sopInstanceUid: uid,
      openStream: async () => {
        expect(active).toBe(0);
        opened.push(uid);
        lifecycle.push(`OPEN:${uid}`);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        let emitted = 0;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          active -= 1;
          completed.push(uid);
          lifecycle.push(`CLOSE:${uid}`);
        };
        return {
          sopInstanceUid: uid,
          mediaType: "application/dicom",
          contentLength: 4,
          body: new ReadableStream({
            pull(controller) {
              if (emitted === 2) {
                controller.close();
                release();
                return;
              }
              lifecycle.push(`CHUNK:${uid}:${emitted}`);
              controller.enqueue(Uint8Array.of(byte, emitted));
              emitted += 1;
            },
            cancel: release,
          }, { highWaterMark: 0 }),
        };
      },
    });
    const first = [make("1.2.4", 4), make("1.2.3", 3)];
    const second = [...first].reverse();

    const left = await buildSourceIntegrityManifest({
      expectedInstanceCount: 2,
      instances: first,
    });
    const right = await buildSourceIntegrityManifest({
      expectedInstanceCount: 2,
      instances: second,
    });

    expect(left.aggregateDigest).toBe(right.aggregateDigest);
    expect(opened).toEqual(["1.2.3", "1.2.4", "1.2.3", "1.2.4"]);
    expect(maximumActive).toBe(1);
    expect(completed).toEqual(opened);
    expect(active).toBe(0);
    expect(lifecycle.slice(0, 4)).toEqual([
      "OPEN:1.2.3",
      "CHUNK:1.2.3:0",
      "CHUNK:1.2.3:1",
      "CLOSE:1.2.3",
    ]);
    expect(lifecycle.indexOf("OPEN:1.2.4")).toBeGreaterThan(
      lifecycle.indexOf("CLOSE:1.2.3"),
    );
    expect(first.map(({ sopInstanceUid }) => sopInstanceUid)).toEqual([
      "1.2.4",
      "1.2.3",
    ]);
  });

  it("changes the aggregate when exact bytes or object identity changes", async () => {
    const calculate = (uid, bytes) =>
      buildSourceIntegrityManifest({
        expectedInstanceCount: 1,
        instances: [instance(uid, bytes).descriptor],
      });

    const baseline = await calculate("1.2.3", [1, 2, 3]);
    const changedByte = await calculate("1.2.3", [1, 2, 4]);
    const changedUid = await calculate("1.2.4", [1, 2, 3]);
    expect(changedByte.aggregateDigest).not.toBe(baseline.aggregateDigest);
    expect(changedUid.aggregateDigest).not.toBe(baseline.aggregateDigest);
  });

  it.each([
    ["no instances", { expectedInstanceCount: 0, instances: [] }, "INVALID_INPUT"],
    ["missing instance", { expectedInstanceCount: 2, instances: [instance("1.2.3", [1]).descriptor] }, "INSTANCE_COUNT_MISMATCH"],
    ["invalid UID", { expectedInstanceCount: 1, instances: [instance("1.02.3", [1]).descriptor] }, "INVALID_UID"],
    ["duplicate UID", { expectedInstanceCount: 2, instances: [instance("1.2.3", [1]).descriptor, instance("1.2.3", [2]).descriptor] }, "DUPLICATE_UID"],
  ])("rejects incomplete or invalid metadata: %s", async (_label, input, code) => {
    await expectCode(buildSourceIntegrityManifest(input), code);
  });

  it("rejects instance counts above the fixed P0 ceiling before opening streams", async () => {
    const openStream = vi.fn();
    const instances = Array.from({ length: 2_001 }, (_, index) => ({
      sopInstanceUid: `1.2.${index + 1}`,
      openStream,
    }));
    await expectCode(
      buildSourceIntegrityManifest({
        expectedInstanceCount: instances.length,
        instances,
      }),
      "INVALID_INPUT",
    );
    expect(openStream).not.toHaveBeenCalled();
  });

  it("rejects empty objects and unsupported media types without a partial manifest", async () => {
    const empty = instance("1.2.3", []);
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [empty.descriptor] }),
      "EMPTY_INSTANCE",
    );

    const unsupported = instance("1.2.3", [1], { mediaType: "application/octet-stream" });
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [unsupported.descriptor] }),
      "MEDIA_TYPE_UNSUPPORTED",
    );
  });

  it("rejects response UID and Content-Length mismatches", async () => {
    const wrongUid = instance("1.2.3", [1], { returnedUid: "1.2.4" });
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [wrongUid.descriptor] }),
      "UID_MISMATCH",
    );

    const shortBody = instance("1.2.3", [1, 2], { contentLength: 3 });
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [shortBody.descriptor] }),
      "CONTENT_LENGTH_MISMATCH",
    );

    const invalidLength = instance("1.2.3", [1], { contentLength: -1 });
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [invalidLength.descriptor] }),
      "CONTENT_LENGTH_INVALID",
    );

    const declaredOverLimit = instance("1.2.3", [1], {
      contentLength: SOURCE_INTEGRITY_LIMITS.maximumInstanceBytes + 1,
    });
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [declaredOverLimit.descriptor] }),
      "INSTANCE_TOO_LARGE",
    );
  });

  it("enforces immutable upper ceilings and lower-only per-call caps", async () => {
    expect(SOURCE_INTEGRITY_LIMITS).toEqual({
      maximumInstances: 2_000,
      maximumInstanceBytes: 64 * 1024 * 1024,
      maximumStudyBytes: 2 * 1024 * 1024 * 1024,
    });

    const cancelled = vi.fn();
    const tooLarge = {
      sopInstanceUid: "1.2.3",
      openStream: async () => ({
        sopInstanceUid: "1.2.3",
        mediaType: "application/dicom",
        body: new ReadableStream({
          pull(controller) {
            controller.enqueue(Uint8Array.of(1, 2, 3, 4));
          },
          cancel: cancelled,
        }),
      }),
    };
    await expectCode(
      buildSourceIntegrityManifest({
        expectedInstanceCount: 1,
        instances: [tooLarge],
        limits: { maximumInstanceBytes: 3 },
      }),
      "INSTANCE_TOO_LARGE",
    );
    expect(cancelled).toHaveBeenCalledOnce();

    const a = instance("1.2.3", [1, 2, 3, 4]);
    const b = instance("1.2.4", [5, 6, 7, 8]);
    await expectCode(
      buildSourceIntegrityManifest({
        expectedInstanceCount: 2,
        instances: [a.descriptor, b.descriptor],
        limits: { maximumInstanceBytes: 4, maximumStudyBytes: 6 },
      }),
      "STUDY_TOO_LARGE",
    );
    await expectCode(
      buildSourceIntegrityManifest({
        expectedInstanceCount: 1,
        instances: [instance("1.2.3", [1]).descriptor],
        limits: { maximumStudyBytes: 2 * 1024 * 1024 * 1024 + 1 },
      }),
      "INVALID_INPUT",
    );

    await expectCode(
      buildSourceIntegrityManifest({
        expectedInstanceCount: 1,
        instances: [instance("1.2.3", [1]).descriptor],
        limits: { unrecognizedLimit: 1 },
      }),
      "INVALID_INPUT",
    );
  });

  it("sanitizes stream failures and aborts the active reader", async () => {
    const failed = {
      sopInstanceUid: "1.2.3",
      openStream: async () => {
        throw new Error("synthetic upstream body with uid 1.2.3");
      },
    };
    await expectCode(
      buildSourceIntegrityManifest({ expectedInstanceCount: 1, instances: [failed] }),
      "STREAM_FAILED",
    );

    const abortController = new AbortController();
    const cancelled = vi.fn();
    let resolvePullStarted;
    const pullStarted = new Promise((resolve) => {
      resolvePullStarted = resolve;
    });
    const waiting = {
      sopInstanceUid: "1.2.3",
      openStream: async () => ({
        sopInstanceUid: "1.2.3",
        mediaType: "application/dicom",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(Uint8Array.of(1));
          },
          pull() {
            resolvePullStarted();
            return new Promise((resolve) => {
              if (abortController.signal.aborted) resolve();
              else abortController.signal.addEventListener("abort", resolve, { once: true });
            });
          },
          cancel: cancelled,
        }),
      }),
    };
    const pending = buildSourceIntegrityManifest({
      expectedInstanceCount: 1,
      instances: [waiting],
      signal: abortController.signal,
    });
    await pullStarted;
    abortController.abort();
    await expectCode(pending, "ABORTED");
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
