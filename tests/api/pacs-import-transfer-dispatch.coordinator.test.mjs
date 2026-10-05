import { describe, expect, it } from "vitest";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PacsImportTransferDispatchCoordinator } from "../../services/api/dist/pacs/application/pacs-import-transfer-dispatch.coordinator.js";
import { pacsTransferOperationDigest } from "../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js";

const ids = Object.freeze({
  tenant: "02000000-0000-4000-8000-000000000002",
  actor: "0a000000-0000-4000-8000-000000000001",
  patient: "15000000-0000-4000-8000-000000000001",
  session: "16000000-0000-4000-8000-000000000091",
  package: "17000000-0000-4000-8000-000000000091",
  study: "18000000-0000-4000-8000-000000000091",
  consent: "19000000-0000-4000-8000-000000000091",
  grant: "1a000000-0000-4000-8000-000000000091",
  operation: "1b000000-0000-4000-8000-000000000091",
  idempotency: "1c000000-0000-4000-8000-000000000091",
  correlation: "1d000000-0000-4000-8000-000000000091",
  evidence: "1e000000-0000-4000-8000-000000000091",
  source: "04000000-0000-4000-8000-000000000001",
  destination: "04000000-0000-4000-8000-000000000002",
});

const principal = Object.freeze({ issuer: "https://issuer.synthetic.test", subject: "dispatch-actor" });
const instanceDescriptors = Object.freeze([
  Object.freeze({
    seriesInstanceUid: "1.2.840.10008.9.1",
    sopInstanceUid: "1.2.840.10008.9.1.1",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    byteLength: 3,
    sha256: `sha256:${"1".repeat(64)}`,
  }),
  Object.freeze({
    seriesInstanceUid: "1.2.840.10008.9.1",
    sopInstanceUid: "1.2.840.10008.9.1.2",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    byteLength: 3,
    sha256: `sha256:${"2".repeat(64)}`,
  }),
  Object.freeze({
    seriesInstanceUid: "1.2.840.10008.9.1",
    sopInstanceUid: "1.2.840.10008.9.1.3",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    byteLength: 3,
    sha256: `sha256:${"3".repeat(64)}`,
  }),
]);

function operationRow(operation) {
  const value = operation.snapshot;
  return {
    operation_id: value.operationId,
    tenant_id: value.tenantId,
    exchange_session_id: value.exchangeSessionId,
    study_ref_id: value.studyRefId,
    actor_id: value.actorId,
    idempotency_key: value.idempotencyKey,
    request_digest: value.requestDigest,
    state: value.state,
    version: value.version,
    reason_code: value.reasonCode,
    source_object_count: value.sourceObjectCount,
    destination_object_count: value.destinationObjectCount,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    stow_started_at: value.stowStartedAt,
  };
}

function setup({
  stowResult = {
    httpStatus: 200,
    storedSopInstanceUids: instanceDescriptors.map((item) => item.sopInstanceUid),
    warningSopInstanceUids: [],
    failedInstances: [],
  },
  stowError,
  endpointError,
  claimError,
  commitError,
  sourceReadyError,
  provenanceInsertError,
  preparation = "SOURCE_CAPTURED",
} = {}) {
  const start = new Date("2026-10-05T00:00:00.000Z");
  let current = PacsTransferOperation.create({
    operationId: ids.operation,
    semantics: {
      tenantId: ids.tenant,
      actorId: ids.actor,
      exchangeSessionId: ids.session,
      studyRefId: ids.study,
      consentId: ids.consent,
      grantId: ids.grant,
      action: "PACS_IMPORT",
    },
    idempotencyKey: ids.idempotency,
    now: start,
  });
  const auditReasons = [];
  let inTransaction = false;
  let committedTransactions = 0;
  let pendingProvenance = null;
  const events = [];
  const transactionClient = {
    async query(statement, values = []) {
      if (statement.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
      if (statement.includes("FROM pacs_transfer_operations") && statement.trimStart().startsWith("SELECT")) {
        return { rows: [operationRow(current)], rowCount: 1 };
      }
      if (statement.startsWith("UPDATE pacs_transfer_operations")) {
        const [state, version, reasonCode, sourceCount, destinationCount, updatedAt, stowStartedAt,
          operationId, tenantId, actorId, sessionId, studyRefId, digest, expectedState, expectedVersion] = values;
        const old = current.snapshot;
        if (old.operationId !== operationId || old.tenantId !== tenantId || old.actorId !== actorId ||
          old.exchangeSessionId !== sessionId || old.studyRefId !== studyRefId || old.requestDigest !== digest ||
          old.state !== expectedState || old.version !== expectedVersion) return { rows: [], rowCount: 0 };
        current = PacsTransferOperation.reconstitute({
          ...old,
          state,
          version,
          reasonCode,
          sourceObjectCount: sourceCount,
          destinationObjectCount: destinationCount,
          updatedAt,
          stowStartedAt,
        });
        return { rows: [operationRow(current)], rowCount: 1 };
      }
      if (statement.includes("INSERT INTO provenance_records")) {
        if (provenanceInsertError) throw provenanceInsertError;
        pendingProvenance = {
          provenance_id: values[0],
          operation_id: ids.operation,
          exchange_session_id: ids.session,
          package_id: ids.package,
          study_ref_id: ids.study,
          source_hospital_id: ids.source,
          destination_hospital_id: ids.destination,
          transfer_type: "PACS_IMPORT",
          transfer_status: "PENDING",
          created_at: values[1],
        };
        events.push("PROVENANCE_CREATED");
        return { rows: [pendingProvenance], rowCount: 1 };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        auditReasons.push(values[7]);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const handoff = Object.freeze({
    operationId: ids.operation,
    tenantId: ids.tenant,
    actorId: ids.actor,
    exchangeSessionId: ids.session,
    packageId: ids.package,
    studyRefId: ids.study,
    studyInstanceUid: "1.2.840.10008.9",
    sourceHospitalId: ids.source,
    destinationHospitalId: ids.destination,
    sourceEvidence: Object.freeze({
      evidenceId: ids.evidence,
      status: "PENDING",
      algorithm: "SHA256-MANIFEST-V1",
      aggregateDigest: `sha256:${"a".repeat(64)}`,
      objectCount: instanceDescriptors.length,
      totalBytes: 9,
    }),
    expectedInstances: instanceDescriptors,
    temporaryPackage: Object.freeze({
      storageRef: "1f000000-0000-4000-8000-000000000091",
      packageId: ids.package,
      expiresAt: "2026-10-06T00:00:00.000Z",
      objectCount: instanceDescriptors.length,
      totalBytes: 9,
      instances: Object.freeze(instanceDescriptors.map((instance, index) => Object.freeze({
        objectRef: `2${index}000000-0000-4000-8000-000000000091`,
        ...instance,
      }))),
    }),
  });
  const prepared = Object.freeze({
    principal,
    tenantCandidate: ids.tenant,
    correlationId: ids.correlation,
    consentId: ids.consent,
    grantId: ids.grant,
    operationId: ids.operation,
    handoff,
  });
  const preparedResult = Object.freeze({
    operationId: ids.operation,
    operationState: "CREATED",
    preparation,
  });
  let consumed = false;
  let discarded = false;
  const sourcePreparation = {
    prepare: async () => preparedResult,
    withPreparedSource: async (result, continuation) => {
      if (result !== preparedResult || consumed || discarded) throw new Error("PREPARED_UNAVAILABLE");
      return continuation(prepared);
    },
    consumePreparedSource: (result) => {
      if (result !== preparedResult) throw new Error("PREPARED_UNAVAILABLE");
      consumed = true;
    },
    discardPrepared: async (result) => {
      if (result !== preparedResult) throw new Error("PREPARED_UNAVAILABLE");
      discarded = true;
    },
  };
  const identity = Object.freeze({
    issuer: principal.issuer,
    subject: principal.subject,
    actorId: ids.actor,
    tenantId: ids.tenant,
    hospitalId: ids.destination,
    actorType: "USER",
  });
  const admission = {
    executeWithCurrentImportAuthorization: async (input) => {
      if (claimError && !events.includes("CLAIM_COMMITTED")) throw claimError;
      const context = AuthorizationContext.create({
        identity,
        exchangeSessionId: ids.session,
        resource: { kind: "STUDY", id: ids.study },
        action: "PACS_IMPORT",
        consentId: ids.consent,
        grantId: ids.grant,
      });
      const priorOperation = current;
      const priorProvenance = pendingProvenance;
      const priorAuditCount = auditReasons.length;
      inTransaction = true;
      let result;
      try {
        result = await input.work({ context, transactionClient });
      } catch (error) {
        current = priorOperation;
        pendingProvenance = priorProvenance;
        auditReasons.length = priorAuditCount;
        throw error;
      } finally {
        inTransaction = false;
      }
      if (commitError && !events.includes("CLAIM_COMMITTED")) {
        current = priorOperation;
        pendingProvenance = priorProvenance;
        auditReasons.length = priorAuditCount;
        throw commitError;
      }
      committedTransactions += 1;
      events.push(committedTransactions === 1 ? "CLAIM_COMMITTED" : "OUTCOME_COMMITTED");
      return result;
    },
  };
  const sourceCapture = {
    assertDispatchReadyInVerifiedTransaction: async (input) => {
      expect(input.identity.actorId).toBe(ids.actor);
      expect(input.handoff).toBe(handoff);
      if (sourceReadyError) throw sourceReadyError;
    },
    consumeCapturedInstance: async (input, consume) => {
      expect(input.handoff).toBe(handoff);
      events.push("PAYLOAD_VERIFIED");
      await consume(Buffer.from("synthetic"), input.signal);
    },
  };
  const dicomGateway = {
    validateEndpoint: () => {
      events.push("ENDPOINT_VALIDATED");
      if (endpointError) throw endpointError;
    },
    storeStudyStream: async (request) => {
      expect(inTransaction).toBe(false);
      expect(events).toContain("CLAIM_COMMITTED");
      events.push("STOW_CALLED");
      for (const descriptor of request.instances) {
        const stream = await request.openInstance(descriptor, request.context.signal);
        const reader = stream.getReader();
        while (!(await reader.read()).done) {}
      }
      if (stowError) throw stowError;
      return stowResult;
    },
  };
  const openedObjects = [];
  const dispatchedStreams = {
    open: (input) => {
      openedObjects.push(input.objectRef);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0x44, 0x49, 0x43]));
          controller.close();
        },
      });
    },
  };
  const coordinator = new PacsImportTransferDispatchCoordinator(
    sourcePreparation,
    admission,
    sourceCapture,
    dicomGateway,
    dispatchedStreams,
    () => new Date("2026-10-05T00:00:01.000Z"),
  );
  return {
    coordinator,
    current: () => current,
    auditReasons,
    events,
    openedObjects,
    committedTransactions: () => committedTransactions,
    consumed: () => consumed,
    discarded: () => discarded,
  };
}

describe("PacsImportTransferDispatchCoordinator", () => {
  it("commits fenced preflight and STOW claim before one streamed Study request; never claims completion", async () => {
    const state = setup();
    const result = await state.coordinator.transfer({ principal, request: Object.freeze({}) });
    expect(result).toEqual({ operationId: ids.operation, operationState: "VERIFYING", dispatch: "VERIFYING" });
    expect(state.events).toEqual([
      "ENDPOINT_VALIDATED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED",
      "PROVENANCE_CREATED", "CLAIM_COMMITTED", "STOW_CALLED", "OUTCOME_COMMITTED",
    ]);
    expect(state.auditReasons).toEqual(["PREFLIGHT_PASSED", "STOW_STARTED", "STOW_ACKNOWLEDGED"]);
    expect(state.current().snapshot.state).toBe("VERIFYING");
    expect(state.current().snapshot.version).toBe(3);
    expect(state.current().snapshot.sourceObjectCount).toBe(3);
    expect(state.current().snapshot.destinationObjectCount).toBeNull();
    expect(state.current().snapshot.stowStartedAt).toBeInstanceOf(Date);
    expect(state.openedObjects).toEqual(handoffObjects());
    expect(state.consumed()).toBe(true);
  });

  it("records a valid partial response as PARTIAL and never treats acknowledged count as verification", async () => {
    const state = setup({ stowResult: {
      httpStatus: 202,
      storedSopInstanceUids: [instanceDescriptors[0].sopInstanceUid],
      warningSopInstanceUids: [instanceDescriptors[1].sopInstanceUid],
      failedInstances: [{ sopInstanceUid: instanceDescriptors[2].sopInstanceUid, code: "PROCESSING_FAILURE" }],
    } });
    const result = await state.coordinator.transfer({ principal, request: {} });
    expect(result.dispatch).toBe("PARTIAL");
    expect(result.operationState).toBe("PARTIAL");
    expect(state.current().snapshot.destinationObjectCount).toBe(2);
    expect(state.current().snapshot.state).not.toBe("COMPLETED");
  });

  it("records a definitive all-instance STOW rejection as FAILED without retry", async () => {
    const state = setup({ stowResult: {
      httpStatus: 200,
      storedSopInstanceUids: [],
      warningSopInstanceUids: [],
      failedInstances: instanceDescriptors.map((instance) => ({
        sopInstanceUid: instance.sopInstanceUid,
        code: "INVALID_INSTANCE",
      })),
    } });
    const result = await state.coordinator.transfer({ principal, request: {} });
    expect(result.dispatch).toBe("FAILED");
    expect(state.current().snapshot.state).toBe("FAILED");
    expect(state.current().snapshot.destinationObjectCount).toBe(0);
  });

  it("keeps an ambiguous post-claim transport failure non-replayable as RESULT_UNKNOWN", async () => {
    const state = setup({ stowError: new Error("synthetic-upstream-detail") });
    const result = await state.coordinator.transfer({ principal, request: {} });
    expect(result.dispatch).toBe("RESULT_UNKNOWN");
    expect(state.current().snapshot.state).toBe("RESULT_UNKNOWN");
    expect(state.auditReasons.at(-1)).toBe("STOW_RESULT_UNKNOWN");
    expect(JSON.stringify(result)).not.toContain("synthetic-upstream-detail");
  });

  it("treats a malformed gateway response as RESULT_UNKNOWN, not success", async () => {
    const state = setup({ stowResult: {
      httpStatus: 200,
      storedSopInstanceUids: [instanceDescriptors[0].sopInstanceUid],
      warningSopInstanceUids: [],
      failedInstances: [],
    } });
    const result = await state.coordinator.transfer({ principal, request: {} });
    expect(result.dispatch).toBe("RESULT_UNKNOWN");
    expect(state.current().snapshot.state).toBe("RESULT_UNKNOWN");
  });

  it("rejects destination endpoint policy before claim and attempts audited source cleanup", async () => {
    const state = setup({ endpointError: new Error("secret endpoint detail") });
    await expect(state.coordinator.transfer({ principal, request: {} })).rejects.toThrow(
      "PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE",
    );
    expect(state.events).toEqual(["ENDPOINT_VALIDATED"]);
    expect(state.current().snapshot.state).toBe("CREATED");
    expect(state.discarded()).toBe(true);
  });

  it("does not call STOW when final preflight or operation persistence is denied", async () => {
    const preflight = setup({ sourceReadyError: new Error("hidden source preflight detail") });
    await expect(preflight.coordinator.transfer({ principal, request: {} })).rejects.toThrow(
      "PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE",
    );
    expect(preflight.events).toEqual([
      "ENDPOINT_VALIDATED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED",
      "PROVENANCE_CREATED",
    ]);
    expect(preflight.current().snapshot.state).toBe("CREATED");
    expect(preflight.consumed()).toBe(true);

    const auth = setup({ claimError: new Error("hidden policy detail") });
    await expect(auth.coordinator.transfer({ principal, request: {} })).rejects.toThrow(
      "PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE",
    );
    expect(auth.events).toEqual([
      "ENDPOINT_VALIDATED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED",
    ]);
    expect(auth.current().snapshot.state).toBe("CREATED");
  });

  it("does not call STOW when commit acknowledgement fails", async () => {
    const state = setup({ commitError: new Error("commit acknowledgement lost") });
    await expect(state.coordinator.transfer({ principal, request: {} })).rejects.toThrow(
      "PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE",
    );
    expect(state.events).toEqual([
      "ENDPOINT_VALIDATED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED",
      "PROVENANCE_CREATED",
    ]);
    expect(state.consumed()).toBe(true);
    expect(state.current().snapshot.state).toBe("CREATED");
  });

  it("fails closed and rolls back when PENDING Provenance cannot be inserted", async () => {
    const state = setup({ provenanceInsertError: new Error("hidden provenance persistence detail") });
    await expect(state.coordinator.transfer({ principal, request: {} })).rejects.toThrow(
      "PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE",
    );
    expect(state.events).toEqual([
      "ENDPOINT_VALIDATED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED", "PAYLOAD_VERIFIED",
    ]);
    expect(state.current().snapshot.state).toBe("CREATED");
    expect(state.auditReasons).toEqual([]);
    expect(state.consumed()).toBe(true);
  });

  it("does not dispatch an exact admission replay", async () => {
    const state = setup({ preparation: "REPLAYED" });
    const result = await state.coordinator.transfer({ principal, request: {} });
    expect(result.dispatch).toBe("REPLAYED");
    expect(state.events).toEqual([]);
    expect(state.current().snapshot.state).toBe("CREATED");
  });
});

function handoffObjects() {
  return [
    "20000000-0000-4000-8000-000000000091",
    "21000000-0000-4000-8000-000000000091",
    "22000000-0000-4000-8000-000000000091",
  ];
}
