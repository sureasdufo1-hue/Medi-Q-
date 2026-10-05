import { describe, expect, it, vi } from "vitest";
import {
  PacsImportSourcePreparationCoordinator,
  PacsImportSourcePreparationUnavailableError,
} from "../../services/api/dist/pacs/application/pacs-import-source-preparation.coordinator.js";

const ids = Object.freeze({
  tenant: "10000000-0000-4000-8000-000000000001",
  actor: "20000000-0000-4000-8000-000000000002",
  session: "40000000-0000-4000-8000-000000000004",
  study: "50000000-0000-4000-8000-000000000005",
  package: "60000000-0000-4000-8000-000000000006",
  correlation: "a0000000-0000-4000-8000-00000000000a",
  operation: "b0000000-0000-4000-8000-00000000000b",
  storage: "c0000000-0000-4000-8000-00000000000c",
  object: "d0000000-0000-4000-8000-00000000000d",
  evidence: "e0000000-0000-4000-8000-00000000000e",
  hospitalA: "04000000-0000-4000-8000-000000000001",
  hospitalB: "04000000-0000-4000-8000-000000000002",
});

const principal = Object.freeze({ issuer: "https://synthetic.test/issuer", subject: "coord-user" });
const sha = `sha256:${"a".repeat(64)}`;
const instance = Object.freeze({
  seriesInstanceUid: "1.2.840.10008.1",
  sopInstanceUid: "1.2.3.4",
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  byteLength: 1024,
  sha256: sha,
});

function context({ created = true, state = "CREATED" } = {}) {
  return Object.freeze({
    admission: Object.freeze({
      created,
      operation: Object.freeze({
        operationId: ids.operation,
        tenantId: ids.tenant,
        actorId: ids.actor,
        exchangeSessionId: ids.session,
        studyRefId: ids.study,
        state,
      }),
    }),
    sourceCaptureCommand: Object.freeze({
      principal,
      tenantCandidate: ids.tenant,
      correlationId: ids.correlation,
      operationId: ids.operation,
      consentId: "70000000-0000-4000-8000-000000000007",
      grantId: "80000000-0000-4000-8000-000000000008",
    }),
  });
}

function handoff(overrides = {}) {
  const temporaryInstance = Object.freeze({ objectRef: ids.object, ...instance });
  return Object.freeze({
    operationId: ids.operation,
    tenantId: ids.tenant,
    actorId: ids.actor,
    exchangeSessionId: ids.session,
    packageId: ids.package,
    studyRefId: ids.study,
    studyInstanceUid: "1.2.3",
    sourceHospitalId: ids.hospitalA,
    destinationHospitalId: ids.hospitalB,
    sourceEvidence: Object.freeze({
      evidenceId: ids.evidence,
      status: "PENDING",
      algorithm: "SHA256-MANIFEST-V1",
      aggregateDigest: sha,
      objectCount: 1,
      totalBytes: instance.byteLength,
    }),
    expectedInstances: Object.freeze([instance]),
    temporaryPackage: Object.freeze({
      storageRef: ids.storage,
      packageId: ids.package,
      expiresAt: "2026-10-05T04:00:00.000Z",
      objectCount: 1,
      totalBytes: instance.byteLength,
      instances: Object.freeze([temporaryInstance]),
    }),
    ...overrides,
  });
}

function createHarness({ admissionContext = context(), captureResult, sourceHandoff = handoff() } = {}) {
  const sourceCapture = {
    captureForCoordinator: vi.fn(async () => captureResult ?? ({
      kind: "CAPTURED_FOR_COORDINATOR",
      handoff: sourceHandoff,
    })),
  };
  const admission = {
    admitForCoordinator: vi.fn(async (_input, continuation) => continuation(admissionContext)),
  };
  const purge = vi.fn(async () => Object.freeze({ kind: "PURGED" }));
  const coordinator = new PacsImportSourcePreparationCoordinator(admission, sourceCapture, { purge });
  return { coordinator, admission, sourceCapture, purge };
}

describe("PacsImportSourcePreparationCoordinator", () => {
  it("keeps handoff private, binds it to the admitted operation, and supports only audited discard", async () => {
    const h = createHarness();
    const result = await h.coordinator.prepare({ principal, request: { synthetic: true } });

    expect(result).toEqual({
      operationId: ids.operation,
      operationState: "CREATED",
      preparation: "SOURCE_CAPTURED",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ids.evidence);
    expect(serialized).not.toContain(ids.storage);
    expect(serialized).not.toContain(instance.sopInstanceUid);
    expect(serialized).not.toContain(instance.sha256);
    expect(h.sourceCapture.captureForCoordinator).toHaveBeenCalledWith(context().sourceCaptureCommand);

    await h.coordinator.discardPrepared(result);
    expect(h.purge).toHaveBeenCalledWith(expect.objectContaining({
      principal,
      tenantCandidate: ids.tenant,
      correlationId: ids.correlation,
      reason: "EXPLICIT_CLOSE",
      storageRef: ids.storage,
      binding: expect.objectContaining({
        operationId: ids.operation,
        tenantId: ids.tenant,
        exchangeSessionId: ids.session,
        packageId: ids.package,
        studyRefId: ids.study,
        sourceHospitalId: ids.hospitalA,
      }),
    }));
    await expect(h.coordinator.discardPrepared(result))
      .rejects.toBeInstanceOf(PacsImportSourcePreparationUnavailableError);
  });

  it("does not recapture an exact replay or an operation outside CREATED", async () => {
    const replay = createHarness({ admissionContext: context({ created: false }) });
    await expect(replay.coordinator.prepare({ principal, request: {} })).resolves.toMatchObject({
      operationId: ids.operation,
      preparation: "REPLAYED",
    });
    expect(replay.sourceCapture.captureForCoordinator).not.toHaveBeenCalled();

    const advanced = createHarness({ admissionContext: context({ created: true, state: "STOW_STARTED" }) });
    await expect(advanced.coordinator.prepare({ principal, request: {} }))
      .rejects.toBeInstanceOf(PacsImportSourcePreparationUnavailableError);
    expect(advanced.sourceCapture.captureForCoordinator).not.toHaveBeenCalled();
  });

  it("returns no usable preparation on a source denial", async () => {
    const h = createHarness({ captureResult: Object.freeze({
      kind: "DENIED",
      reason: "PATIENT_MAPPING_INVALID",
    }) });
    await expect(h.coordinator.prepare({ principal, request: {} })).resolves.toMatchObject({
      operationId: ids.operation,
      operationState: "CREATED",
      preparation: "DENIED",
      reason: "PATIENT_MAPPING_INVALID",
    });
    expect(h.purge).not.toHaveBeenCalled();
  });

  it("purges a mismatched service handoff and fails closed", async () => {
    const invalid = handoff({ actorId: "f0000000-0000-4000-8000-00000000000f" });
    const h = createHarness({ sourceHandoff: invalid });
    await expect(h.coordinator.prepare({ principal, request: {} }))
      .rejects.toBeInstanceOf(PacsImportSourcePreparationUnavailableError);
    expect(h.purge).toHaveBeenCalledTimes(1);
  });

  it("rejects a temporary package whose per-instance digest differs from the source manifest", async () => {
    const invalid = handoff({
      temporaryPackage: Object.freeze({
        ...handoff().temporaryPackage,
        instances: Object.freeze([Object.freeze({
          objectRef: ids.object,
          ...instance,
          sha256: `sha256:${"b".repeat(64)}`,
        })]),
      }),
    });
    const h = createHarness({ sourceHandoff: invalid });
    await expect(h.coordinator.prepare({ principal, request: {} }))
      .rejects.toBeInstanceOf(PacsImportSourcePreparationUnavailableError);
    expect(h.purge).toHaveBeenCalledTimes(1);
  });
});
