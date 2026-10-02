import { describe, expect, it } from "vitest";
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
  return {
    session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: TEST_HOSPITAL_A_ID,
    destination_hospital_id: TEST_HOSPITAL_B_ID,
    session_state: "ACTIVE",
    session_expires_at: null,
    consent_id: ids.consent,
    consent_session_id: ids.session,
    consent_patient_ref_id: ids.patient,
    consent_source_hospital_id: TEST_HOSPITAL_A_ID,
    consent_destination_hospital_id: TEST_HOSPITAL_B_ID,
    consent_package_id: null,
    consent_status: options.consentStatus ?? "ACTIVE",
    consent_issued_at: new Date("2026-10-01T00:00:00.000Z"),
    consent_expires_at: null,
    consent_withdrawn_at: null,
    allowed_actions: ["PACS_IMPORT"],
    grant_id: ids.grant,
    grant_session_id: ids.session,
    grant_consent_id: ids.consent,
    recipient_tenant_id: ids.tenant,
    recipient_hospital_id: TEST_HOSPITAL_B_ID,
    recipient_actor_id: ids.actor,
    grant_package_id: ids.package,
    grant_status: "ACTIVE",
    grant_issued_at: new Date("2026-10-01T00:00:00.000Z"),
    grant_expires_at: new Date("2099-01-01T00:00:00.000Z"),
    grant_revoked_at: null,
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
  let currentScope = operationScope({ operation_state: options.operationState ?? "CREATED" });
  let currentMapping = mappingRow();
  let currentConsentStatus = options.consentStatus ?? "ACTIVE";
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
              rows: [authorizationRow({ consentStatus: currentConsentStatus })],
            };
          }
          if (sql.includes("FROM patient_mappings")) {
            return { rowCount: 1, rows: [{ ...currentMapping }] };
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
      () => now,
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
      if (options.revokeAfterMetadata) currentConsentStatus = "WITHDRAWN";
      if (options.metadataFailure) throw new Error("private upstream response");
      const metadata = studyMetadata({ patientId: options.metadataPatientId });
      if (options.wrongStudy) metadata.studyInstanceUid = "2.25.999";
      if (options.metadataCountMismatch) metadata.series[0].instances.pop();
      return metadata;
    },
    retrieveInstanceStream: async (request) => {
      expect(activeTransactions).toBe(0);
      dicomCalls.instances += 1;
      dicomCalls.hospitalIds.push(request.context.hospitalId);
      const item = instanceFixture.find((entry) => entry.sopInstanceUid === request.sopInstanceUid);
      if (!item) throw new Error("SYNTHETIC_INSTANCE_NOT_FOUND");
      if (options.revokeAfterStreams && dicomCalls.instances === instanceFixture.length) {
        currentConsentStatus = "WITHDRAWN";
      }
      if (options.changeMappingAfterStreams && dicomCalls.instances === instanceFixture.length) {
        currentMapping = mappingRow({ local_patient_id: "TEST-PATIENT-CHANGED" });
      }
      if (options.changeOperationAfterStreams && dicomCalls.instances === instanceFixture.length) {
        currentScope = operationScope({ operation_state: "FAILED" });
      }
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(item.bytes);
          controller.close();
        },
      });
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
    set consentStatus(value) { currentConsentStatus = value; },
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

  it("TC-INT-001-CAP-005 rejects incomplete metadata before opening payload streams", async () => {
    const harness = makeHarness({ metadataCountMismatch: true });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "SOURCE_METADATA_INVALID" });
    expect(harness.dicomCalls.metadata).toBe(1);
    expect(harness.dicomCalls.instances).toBe(0);
    expect(harness.committedEvidence).toHaveLength(0);
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

  it("TC-INT-001-CAP-009 reauthorizes after WADO and does not persist evidence after Consent withdrawal", async () => {
    const harness = makeHarness({ revokeAfterStreams: true });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
    expect(harness.authorizationCalls).toBe(2);
    expect(harness.dicomCalls.instances).toBe(3);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toContainEqual({
      action: "PACS_SOURCE_CAPTURE_DENIED",
      result: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
  });

  it("TC-INT-001-CAP-009 rejects destination mapping change after WADO", async () => {
    const harness = makeHarness({ changeMappingAfterStreams: true });
    const result = await harness.service.capture(command());

    expect(result).toEqual({ kind: "DENIED", reason: "PATIENT_MAPPING_INVALID" });
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.dicomCalls.instances).toBe(3);
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
