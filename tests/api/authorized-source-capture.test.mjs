import { describe, expect, it, vi } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import {
  AuthorizationDeniedError,
  AuthorizationGatedOperationExecutor,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { AuthorizedSourceCaptureService } from "../../services/api/dist/integrity/application/authorized-source-capture.service.js";
import { PacsImportModule } from "../../services/api/dist/pacs/pacs-import.module.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
} from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";

const ids = Object.freeze({
  tenant: "01000000-0000-4000-8000-000000000001",
  actor: "02000000-0000-4000-8000-000000000001",
  session: "03000000-0000-4000-8000-000000000001",
  operation: "04000000-0000-4000-8000-000000000001",
  patient: "05000000-0000-4000-8000-000000000001",
  package: "06000000-0000-4000-8000-000000000001",
  studyRef: "07000000-0000-4000-8000-000000000001",
  consent: "08000000-0000-4000-8000-000000000001",
  grant: "09000000-0000-4000-8000-000000000001",
  mapping: "0a000000-0000-4000-8000-000000000001",
  correlation: "0b000000-0000-4000-8000-000000000001",
});
const issuer = "https://synthetic-issuer.test";
const subject = "synthetic-source-capture-actor";
const principal = Object.freeze({ issuer, subject });
const identity = Object.freeze({
  issuer,
  subject,
  actorId: ids.actor,
  tenantId: ids.tenant,
  hospitalId: TEST_HOSPITAL_B_ID,
  actorType: "USER",
});
const now = new Date("2026-10-02T00:00:00.000Z");
const instanceFixture = [
  { sopInstanceUid: "2.25.111", bytes: new Uint8Array([1, 2, 3, 4]) },
  { sopInstanceUid: "2.25.112", bytes: new Uint8Array([5, 6, 7]) },
  { sopInstanceUid: "2.25.113", bytes: new Uint8Array([8, 9, 10, 11, 12]) },
];

function operationScope(overrides = {}) {
  return {
    operation_id: ids.operation,
    tenant_id: ids.tenant,
    exchange_session_id: ids.session,
    study_ref_id: ids.studyRef,
    operation_state: "CREATED",
    patient_ref_id: ids.patient,
    source_hospital_id: TEST_HOSPITAL_A_ID,
    destination_hospital_id: TEST_HOSPITAL_B_ID,
    session_state: "ACTIVE",
    package_id: ids.package,
    study_instance_uid: "2.25.100",
    series_count: 1,
    instance_count: 3,
    ...overrides,
  };
}

function authorizationRow(options = {}) {
  const value = (key, fallback) => Object.hasOwn(options, key) ? options[key] : fallback;
  return {
    session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: TEST_HOSPITAL_A_ID,
    destination_hospital_id: TEST_HOSPITAL_B_ID,
    session_state: value("sessionState", "ACTIVE"),
    session_expires_at: value("sessionExpiresAt", null),
    consent_id: ids.consent,
    consent_session_id: ids.session,
    consent_patient_ref_id: ids.patient,
    consent_source_hospital_id: TEST_HOSPITAL_A_ID,
    consent_destination_hospital_id: TEST_HOSPITAL_B_ID,
    consent_package_id: null,
    consent_status: value("consentStatus", "ACTIVE"),
    consent_issued_at: new Date("2026-10-01T00:00:00.000Z"),
    consent_expires_at: value("consentExpiresAt", null),
    consent_withdrawn_at: value("consentWithdrawnAt", null),
    allowed_actions: ["PACS_IMPORT"],
    grant_id: ids.grant,
    grant_session_id: ids.session,
    grant_consent_id: ids.consent,
    recipient_tenant_id: ids.tenant,
    recipient_hospital_id: TEST_HOSPITAL_B_ID,
    recipient_actor_id: ids.actor,
    grant_package_id: ids.package,
    grant_status: value("grantStatus", "ACTIVE"),
    grant_issued_at: new Date("2026-10-01T00:00:00.000Z"),
    grant_expires_at: value("grantExpiresAt", new Date("2099-01-01T00:00:00.000Z")),
    grant_revoked_at: value("grantRevokedAt", null),
    grant_scopes: ["study:pacs-transfer"],
    study_ref_id: ids.studyRef,
    package_id: ids.package,
    package_session_id: ids.session,
    package_patient_ref_id: ids.patient,
    package_source_hospital_id: TEST_HOSPITAL_A_ID,
    package_state: "AVAILABLE",
    retention_expires_at: null,
    package_deleted_at: null,
  };
}

function mappingRow(overrides = {}) {
  return {
    mapping_id: ids.mapping,
    patient_ref_id: ids.patient,
    hospital_id: TEST_HOSPITAL_B_ID,
    local_patient_id: "TEST-PATIENT-007",
    status: "VALID",
    validated_at: new Date("2026-10-01T00:00:00.000Z"),
    created_at: new Date("2026-10-01T00:00:00.000Z"),
    updated_at: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function studyMetadata(options = {}) {
  return {
    studyInstanceUid: "2.25.100",
    series: [
      {
        seriesInstanceUid: "2.25.101",
        modality: "CT",
        instances: instanceFixture.map((instance) => ({
          sopInstanceUid: instance.sopInstanceUid,
          sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
          patientId: options.patientId ?? "TEST-PATIENT-007",
          transferSyntaxUid: "1.2.840.10008.1.2.1",
        })),
      },
    ],
  };
}

function makeHarness(options = {}) {
  let activeTransactions = 0;
  let authorizationCalls = 0;
  let currentScope = operationScope({
    operation_state: options.operationState ?? "CREATED",
    instance_count: Object.hasOwn(options, "instanceCount") ? options.instanceCount : 3,
    series_count: Object.hasOwn(options, "seriesCount") ? options.seriesCount : 1,
  });
  let currentMapping = options.mapping === null
    ? null
    : mappingRow({
      status: options.mappingStatus ?? "VALID",
      validated_at: Object.hasOwn(options, "mappingValidatedAt")
        ? options.mappingValidatedAt
        : new Date("2026-10-01T00:00:00.000Z"),
      ...(options.mappingOverrides ?? {}),
    });
  let authorizationNow = new Date(now);
  let currentAuthorization = {
    consentStatus: options.consentStatus ?? "ACTIVE",
    ...(options.authorizationInitial ?? {}),
  };
  const applyAfterWadoMutation = () => {
    if (options.revokeAfterStreams) {
      currentAuthorization = { ...currentAuthorization, consentStatus: "WITHDRAWN" };
    }
    if (options.authorizationAfterStreams) {
      currentAuthorization = { ...currentAuthorization, ...options.authorizationAfterStreams };
    }
    if (options.authorizationNowAfterStreams) {
      authorizationNow = new Date(options.authorizationNowAfterStreams);
    }
    if (options.changeMappingAfterStreams) {
      currentMapping = mappingRow({ local_patient_id: "TEST-PATIENT-CHANGED" });
    }
    if (options.changeOperationAfterStreams) {
      currentScope = operationScope({ operation_state: "FAILED" });
    }
  };
  const committedAudits = [];
  const committedEvidence = [];
  const rollbackReasons = [];
  const dicomCalls = { metadata: 0, instances: 0, destinationWrites: 0, hospitalIds: [] };

  const actorTenantContext = {
    run: async (_principal, tenantCandidate, work) => {
      if (tenantCandidate !== ids.tenant) throw new Error("ACTOR_TENANT_CONTEXT_DENIED");
      activeTransactions += 1;
      const txAudits = [];
      const txEvidence = [];
      const client = {
        query: async (statement, values = []) => {
          const sql = String(statement);
          if (sql.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [] };
          if (sql.includes("FROM pacs_transfer_operations AS op")) {
            return { rowCount: 1, rows: [{ ...currentScope }] };
          }
          if (sql.includes("JOIN consents AS c")) {
            authorizationCalls += 1;
            return {
              rowCount: 1,
              rows: [authorizationRow(currentAuthorization)],
            };
          }
          if (sql.includes("FROM patient_mappings")) {
            return currentMapping
              ? { rowCount: 1, rows: [{ ...currentMapping }] }
              : { rowCount: 0, rows: [] };
          }
          if (sql.includes("INSERT INTO audit_events")) {
            const action = values[7];
            if (options.failAuditAction === action) {
              throw new Error("synthetic Audit sink failure");
            }
            txAudits.push([...values]);
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes("INSERT INTO integrity_evidence")) {
            const row = {
              integrity_id: values[0],
              operation_id: values[5],
              exchange_session_id: ids.session,
              package_id: ids.package,
              study_ref_id: ids.studyRef,
              verification_stage: "SOURCE_CAPTURE",
              algorithm: values[1],
              source_digest: values[2],
              source_object_count: values[3],
              status: "PENDING",
              verified_at: null,
              created_at: values[4],
            };
            txEvidence.push(row);
            return { rowCount: 1, rows: [row] };
          }
          if (sql.includes("SELECT integrity_id, operation_id")) {
            return { rowCount: 0, rows: [] };
          }
          throw new Error(`UNEXPECTED_SYNTHETIC_QUERY:${sql.slice(0, 60)}`);
        },
      };

      try {
        const result = await work(identity, client);
        committedAudits.push(...txAudits);
        committedEvidence.push(...txEvidence);
        activeTransactions -= 1;
        return result;
      } catch (error) {
        rollbackReasons.push(error?.message ?? "UNKNOWN");
        activeTransactions -= 1;
        throw error;
      }
    },
  };

  const engine = new AuthorizationEngine(
    new ResolvedObjectAuthorizationPolicy(
      new PostgresAuthorizationEvidenceReader(),
      () => authorizationNow,
    ),
  );
  const executor = new AuthorizationGatedOperationExecutor(actorTenantContext, engine);
  const gateway = {
    retrieveStudyMetadata: async (request) => {
      expect(activeTransactions).toBe(0);
      dicomCalls.metadata += 1;
      dicomCalls.hospitalIds.push(request.context.hospitalId);
      expect(request.studyInstanceUid).toBe("2.25.100");
      expect(request.context.signal).toBeInstanceOf(AbortSignal);
      if (options.revokeAfterMetadata) {
        currentAuthorization = { ...currentAuthorization, consentStatus: "WITHDRAWN" };
      }
      if (options.metadataFailure) throw new Error("private upstream response");
      const metadata = studyMetadata({ patientId: options.metadataPatientId });
      switch (options.metadataShape) {
        case "EMPTY":
          metadata.series = [];
          break;
        case "WRONG_STUDY":
          metadata.studyInstanceUid = "2.25.999";
          break;
        case "COUNT_MISMATCH":
          metadata.series[0].instances.pop();
          break;
        case "SERIES_COUNT_MISMATCH": {
          const moved = metadata.series[0].instances.pop();
          metadata.series.push({
            seriesInstanceUid: "2.25.102",
            instances: [moved],
          });
          break;
        }
        case "DUPLICATE_SOP":
          metadata.series[0].instances[1].sopInstanceUid =
            metadata.series[0].instances[0].sopInstanceUid;
          break;
        case "MALFORMED_IDENTITY":
          metadata.series[0].instances[0].sopClassUid = "not-a-dicom-uid";
          break;
        case "ONE_PATIENT_ID_MISMATCH":
          metadata.series[0].instances[0].patientId = "TEST-PATIENT-OTHER";
          break;
      }
      return metadata;
    },
    retrieveInstanceStream: async (request) => {
      expect(activeTransactions).toBe(0);
      dicomCalls.instances += 1;
      dicomCalls.hospitalIds.push(request.context.hospitalId);
      const item = instanceFixture.find((entry) => entry.sopInstanceUid === request.sopInstanceUid);
      if (!item) throw new Error("SYNTHETIC_INSTANCE_NOT_FOUND");
      options.onInstanceStreamOpen?.(item, request);
      if (options.instanceStreamFactory) {
        return options.instanceStreamFactory(item, request);
      }
      const body = new ReadableStream({
        pull(controller) {
          controller.enqueue(item.bytes);
          controller.close();
          if (dicomCalls.instances === instanceFixture.length) applyAfterWadoMutation();
        },
      }, { highWaterMark: 0 });
      return {
        body,
        mediaType: "application/dicom",
        contentLength: item.bytes.byteLength,
        sopInstanceUid: item.sopInstanceUid,
      };
    },
    storeInstanceStream: async () => {
      dicomCalls.destinationWrites += 1;
      throw new Error("DESTINATION_WRITE_FORBIDDEN_IN_SOURCE_CAPTURE");
    },
  };
  const service = new AuthorizedSourceCaptureService(
    executor,
    actorTenantContext,
    gateway,
    () => new Date(now),
  );

  return {
    service,
    actorTenantContext,
    gateway,
    committedAudits,
    committedEvidence,
    rollbackReasons,
    dicomCalls,
    get activeTransactions() { return activeTransactions; },
    get authorizationCalls() { return authorizationCalls; },
    get operationState() { return currentScope.operation_state; },
    set consentStatus(value) { currentAuthorization = { ...currentAuthorization, consentStatus: value }; },
  };
}

function command(overrides = {}) {
  return {
    principal,
    tenantCandidate: ids.tenant,
    correlationId: ids.correlation,
    operationId: ids.operation,
    consentId: ids.consent,
    grantId: ids.grant,
    ...overrides,
  };
}

function auditActions(harness) {
  return harness.committedAudits.map((values) => ({
    action: values[7],
    result: values[8],
    reason: values[9],
  }));
}

describe("AuthorizedSourceCaptureService", () => {
  it("TC-INT-001-CAP-001/004/007/010/014 captures only A bytes after fenced authorization and commits pending evidence with success Audit", async () => {
    const harness = makeHarness();
    const result = await harness.service.capture(command());

    expect(result).toMatchObject({ kind: "CAPTURED", status: "PENDING", objectCount: 3 });
    expect(Object.keys(result).sort()).toEqual(["evidenceId", "kind", "objectCount", "status"]);
    expect(harness.committedEvidence).toHaveLength(1);
    expect(harness.committedEvidence[0]).toMatchObject({
      verification_stage: "SOURCE_CAPTURE",
      status: "PENDING",
      verified_at: null,
      source_object_count: 3,
    });
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURED", result: "SUCCESS", reason: null },
    ]);
    expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
    expect(harness.dicomCalls.hospitalIds.every((hospitalId) => hospitalId === TEST_HOSPITAL_A_ID)).toBe(true);
    expect(harness.authorizationCalls).toBe(2);
    expect(harness.activeTransactions).toBe(0);
    const persistedAudit = JSON.stringify(harness.committedAudits);
    expect(persistedAudit).not.toMatch(/TEST-PATIENT|2\.25\.(100|101|111|112|113)|password|credential/i);
    expect(JSON.stringify(result)).not.toMatch(/TEST-PATIENT|2\.25\./);
  });

  it("TC-INT-001-CAP-002 denies a withdrawn Consent before any DICOM call", async () => {
    const harness = makeHarness({ consentStatus: "WITHDRAWN" });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
    expect(harness.dicomCalls.metadata).toBe(0);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toContainEqual({
      action: "PACS_SOURCE_CAPTURE_DENIED",
      result: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
  });

  it("TC-INT-001-CAP-003 rejects a changed operation state before source I/O", async () => {
    const harness = makeHarness({ operationState: "FAILED" });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
    expect(harness.dicomCalls.metadata).toBe(0);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
  });

  it.each([
    { name: "missing persisted instance_count", options: { instanceCount: null }, metadataCalls: 0 },
    { name: "zero persisted instance_count", options: { instanceCount: 0 }, metadataCalls: 0 },
    { name: "over-limit persisted instance_count", options: { instanceCount: 2_001 }, metadataCalls: 0 },
    { name: "empty metadata", options: { metadataShape: "EMPTY" }, metadataCalls: 1 },
    { name: "wrong Study identity", options: { metadataShape: "WRONG_STUDY" }, metadataCalls: 1 },
    { name: "instance count mismatch", options: { metadataShape: "COUNT_MISMATCH" }, metadataCalls: 1 },
    { name: "persisted series count mismatch", options: { metadataShape: "SERIES_COUNT_MISMATCH" }, metadataCalls: 1 },
    { name: "duplicate SOP identity", options: { metadataShape: "DUPLICATE_SOP" }, metadataCalls: 1 },
    { name: "malformed SOP Class identity", options: { metadataShape: "MALFORMED_IDENTITY" }, metadataCalls: 1 },
  ])("TC-INT-001-CAP-005 rejects $name before opening payload streams", async ({ options, metadataCalls }) => {
    const harness = makeHarness(options);
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "SOURCE_METADATA_INVALID" });
    expect(harness.dicomCalls.metadata).toBe(metadataCalls);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).not.toContainEqual({
      action: "PACS_SOURCE_CAPTURED",
      result: "SUCCESS",
      reason: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/TEST-PATIENT|2\.25\./);
    expect(JSON.stringify(auditActions(harness))).not.toMatch(/TEST-PATIENT|2\.25\./);
  });

  it("TC-INT-001-CAP-006 rejects a source PatientID mismatch before instance WADO", async () => {
    const harness = makeHarness({ metadataPatientId: "TEST-PATIENT-OTHER" });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "SOURCE_PATIENT_ID_MISMATCH" });
    expect(harness.dicomCalls.metadata).toBe(1);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(JSON.stringify(auditActions(harness))).not.toContain("TEST-PATIENT-OTHER");
  });

  it.each([
    { name: "missing mapping", options: { mapping: null } },
    { name: "ambiguous mapping", options: { mappingStatus: "AMBIGUOUS" } },
    { name: "unverified mapping", options: { mappingStatus: "UNVERIFIED" } },
    { name: "revoked mapping", options: { mappingStatus: "REVOKED" } },
    { name: "missing mapping validation evidence", options: { mappingValidatedAt: null } },
    { name: "mapping patient binding mismatch", options: { mappingOverrides: { patient_ref_id: "05000000-0000-4000-8000-000000000099" } } },
  ])("TC-INT-001-CAP-006 denies $name before metadata WADO", async ({ options }) => {
    const harness = makeHarness(options);
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "PATIENT_MAPPING_INVALID" });
    expect(harness.dicomCalls.metadata).toBe(0);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_DENIED", result: "DENY", reason: "PATIENT_MAPPING_INVALID" },
    ]);
    expect(JSON.stringify(auditActions(harness))).not.toMatch(/TEST-PATIENT|2\.25\./);
  });

  it("TC-INT-001-CAP-006 denies one mismatched source PatientID before any payload WADO", async () => {
    const harness = makeHarness({ metadataShape: "ONE_PATIENT_ID_MISMATCH" });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "SOURCE_PATIENT_ID_MISMATCH" });
    expect(harness.dicomCalls.metadata).toBe(1);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_DENIED", result: "DENY", reason: "SOURCE_PATIENT_ID_MISMATCH" },
    ]);
    expect(JSON.stringify(auditActions(harness))).not.toMatch(/TEST-PATIENT|2\.25\./);
    expect(JSON.stringify(result)).not.toMatch(/TEST-PATIENT|2\.25\./);
  });

  it("TC-INT-001-CAP-008 records a fixed failure and no evidence when A metadata retrieval fails", async () => {
    const harness = makeHarness({ metadataFailure: true });
    await expect(harness.service.capture(command())).rejects.toMatchObject({
      message: "SOURCE_CAPTURE_UNAVAILABLE",
    });
    expect(harness.dicomCalls.metadata).toBe(1);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toContainEqual({
      action: "PACS_SOURCE_CAPTURE_FAILED",
      result: "FAILURE",
      reason: "SOURCE_READ_FAILED",
    });
  });

  it.each([
    {
      name: "instance body read error",
      createStream: (item) => ({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(item.bytes.subarray(0, Math.min(8, item.bytes.byteLength)));
            controller.error(new Error("private synthetic upstream detail"));
          },
        }),
        mediaType: "application/dicom",
        contentLength: item.bytes.byteLength,
        sopInstanceUid: item.sopInstanceUid,
      }),
    },
    {
      name: "wrong media type",
      createStream: (item) => ({
        body: new ReadableStream({ start(controller) { controller.close(); } }),
        mediaType: "application/octet-stream",
        contentLength: item.bytes.byteLength,
        sopInstanceUid: item.sopInstanceUid,
      }),
    },
    {
      name: "wrong SOP Instance UID",
      createStream: (item) => ({
        body: new ReadableStream({
          start(controller) { controller.enqueue(item.bytes); controller.close(); },
        }),
        mediaType: "application/dicom",
        contentLength: item.bytes.byteLength,
        sopInstanceUid: "2.25.999999",
      }),
    },
    {
      name: "declared Content-Length mismatch",
      createStream: (item) => ({
        body: new ReadableStream({
          start(controller) { controller.enqueue(item.bytes); controller.close(); },
        }),
        mediaType: "application/dicom",
        contentLength: item.bytes.byteLength + 1,
        sopInstanceUid: item.sopInstanceUid,
      }),
    },
    {
      name: "declared instance size exceeds hard cap",
      createStream: (item) => ({
        body: new ReadableStream({ start(controller) { controller.close(); } }),
        mediaType: "application/dicom",
        contentLength: 64 * 1024 * 1024 + 1,
        sopInstanceUid: item.sopInstanceUid,
      }),
    },
  ])("TC-INT-001-CAP-008 fails closed for $name with no partial evidence", async ({ createStream }) => {
    const harness = makeHarness({ instanceStreamFactory: createStream });

    await expect(harness.service.capture(command())).rejects.toMatchObject({
      message: "SOURCE_CAPTURE_UNAVAILABLE",
    });

    expect(harness.dicomCalls.metadata).toBe(1);
    expect(harness.dicomCalls.instances).toBe(1);
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.operationState).toBe("CREATED");
    expect(harness.activeTransactions).toBe(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_READ_FAILED" },
    ]);
    expect(JSON.stringify(auditActions(harness))).not.toMatch(/private|TEST-PATIENT|2\.25\./);
  });

  it("TC-INT-001-CAP-008 distinguishes caller cancellation and records no partial evidence", async () => {
    let markStreamOpen;
    let markReadStarted;
    const streamOpen = new Promise((resolve) => { markStreamOpen = resolve; });
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    const controller = new AbortController();
    const cancelled = vi.fn();
    const harness = makeHarness({
      onInstanceStreamOpen: markStreamOpen,
      instanceStreamFactory: (_item, request) => ({
        body: new ReadableStream({
          pull() {
            markReadStarted();
            return new Promise((resolve) => {
              request.context.signal.addEventListener("abort", resolve, { once: true });
            });
          },
          cancel: cancelled,
        }, { highWaterMark: 0 }),
        mediaType: "application/dicom",
        contentLength: undefined,
        sopInstanceUid: _item.sopInstanceUid,
      }),
    });
    const pending = harness.service.capture(command({ signal: controller.signal }));
    const pendingOutcome = pending.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await streamOpen;
    await readStarted;
    controller.abort();

    const outcome = await pendingOutcome;
    expect(outcome).toHaveProperty("error");
    expect(outcome.error).toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.operationState).toBe("CREATED");
    expect(harness.dicomCalls.instances).toBe(1);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_CAPTURE_CANCELLED" },
    ]);
  });

  it("TC-INT-001-CAP-008 enforces the fixed 30-minute capture deadline with fake timers", async () => {
    let markStreamOpen;
    let markReadStarted;
    const streamOpen = new Promise((resolve) => { markStreamOpen = resolve; });
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    const cancelled = vi.fn();
    const harness = makeHarness({
      onInstanceStreamOpen: markStreamOpen,
      instanceStreamFactory: (_item, request) => ({
        body: new ReadableStream({
          pull() {
            markReadStarted();
            return new Promise((resolve) => {
              request.context.signal.addEventListener("abort", resolve, { once: true });
            });
          },
          cancel: cancelled,
        }, { highWaterMark: 0 }),
        mediaType: "application/dicom",
        contentLength: undefined,
        sopInstanceUid: _item.sopInstanceUid,
      }),
    });

    vi.useFakeTimers();
    try {
      const pending = harness.service.capture(command());
      const pendingOutcome = pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await streamOpen;
      await readStarted;
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      const outcome = await pendingOutcome;
      expect(outcome).toHaveProperty("error");
      expect(outcome.error).toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
    } finally {
      vi.useRealTimers();
    }

    expect(cancelled).toHaveBeenCalledOnce();
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.operationState).toBe("CREATED");
    expect(harness.dicomCalls.instances).toBe(1);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_CAPTURE_DEADLINE" },
    ]);
  });

  it.each([
    {
      name: "Consent withdrawal",
      harnessOptions: { revokeAfterStreams: true },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "Consent expiry",
      harnessOptions: {
        authorizationInitial: { consentExpiresAt: new Date(now.getTime() + 30_000) },
        authorizationNowAfterStreams: new Date(now.getTime() + 60_000),
      },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "Grant revocation",
      harnessOptions: {
        authorizationAfterStreams: {
          grantStatus: "REVOKED",
          grantRevokedAt: new Date(now.getTime() + 10_000),
        },
      },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "Grant expiry",
      harnessOptions: {
        authorizationInitial: { grantExpiresAt: new Date(now.getTime() + 30_000) },
        authorizationNowAfterStreams: new Date(now.getTime() + 60_000),
      },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "Session expiry",
      harnessOptions: {
        authorizationInitial: { sessionExpiresAt: new Date(now.getTime() + 30_000) },
        authorizationNowAfterStreams: new Date(now.getTime() + 60_000),
      },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "Session state change",
      harnessOptions: { authorizationAfterStreams: { sessionState: "CANCELLED" } },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "CREATED",
    },
    {
      name: "operation state change",
      harnessOptions: { changeOperationAfterStreams: true },
      expectedReason: "AUTHORIZATION_DENIED",
      expectedOperationState: "FAILED",
      expectedAuthorizationCalls: 1,
    },
    {
      name: "destination mapping change",
      harnessOptions: { changeMappingAfterStreams: true },
      expectedReason: "PATIENT_MAPPING_INVALID",
      expectedOperationState: "CREATED",
    },
  ])("TC-INT-001-CAP-009 denies after WADO when $name changes", async ({
    harnessOptions,
    expectedReason,
    expectedOperationState,
    expectedAuthorizationCalls = 2,
  }) => {
    const harness = makeHarness(harnessOptions);
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: expectedReason });
    expect(harness.authorizationCalls).toBe(expectedAuthorizationCalls);
    expect(harness.dicomCalls.instances).toBe(3);
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.operationState).toBe(expectedOperationState);
    const actions = auditActions(harness);
    expect(actions).toContainEqual({
      action: "PACS_SOURCE_CAPTURE_DENIED",
      result: "DENY",
      reason: expectedReason,
    });
    expect(actions).not.toContainEqual({
      action: "PACS_SOURCE_CAPTURED",
      result: "SUCCESS",
      reason: null,
    });
  });

  it("TC-INT-001-CAP-012 rolls back evidence if the final success Audit fails", async () => {
    const harness = makeHarness({ failAuditAction: "PACS_SOURCE_CAPTURED" });
    await expect(harness.service.capture(command())).rejects.toMatchObject({
      message: "SOURCE_CAPTURE_UNAVAILABLE",
    });

    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_CAPTURE_PERSISTENCE_FAILED" },
    ]);
    expect(harness.rollbackReasons.length).toBeGreaterThan(0);
  });

  it("TC-INT-001-CAP-001/004 rejects caller-supplied scope, endpoint and credentials before authorization; no browser controller", async () => {
    const harness = makeHarness();
    for (const override of [
      { studyInstanceUid: "2.25.100" },
      { endpointUrl: "http://attacker.invalid/dicom-web/" },
      { sourceUrl: "https://other.invalid/dicom-web/" },
      { username: "caller-controlled" },
      { password: "caller-controlled" },
      { authorization: "Bearer caller-controlled" },
    ]) {
      await expect(
        harness.service.capture(command(override)),
      ).rejects.toMatchObject({ message: "SOURCE_CAPTURE_REQUEST_INVALID" });
    }
    expect(harness.authorizationCalls).toBe(0);
    expect(harness.dicomCalls.metadata).toBe(0);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PacsImportModule) ?? []).toEqual([]);
  });
});
