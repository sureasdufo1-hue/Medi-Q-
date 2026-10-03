import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { describe, expect, it, vi, onTestFailed } from "vitest";
import { Test } from "@nestjs/testing";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import {
  AuthorizationDeniedError,
  AuthorizationGatedOperationExecutor,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { AuthorizedSourceCaptureService } from "../../services/api/dist/integrity/application/authorized-source-capture.service.js";
import { EphemeralEncryptedTemporaryImagingStore } from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";
import { ActorTenantContextDeniedError, ActorTenantContextUnavailableError } from "../../services/api/dist/identity/identity-context.types.js";
import { PacsImportModule } from "../../services/api/dist/pacs/pacs-import.module.js";
import { pacsTransferOperationDigest } from "../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js";
import { DispatchedInstanceStreamFactory } from "../../services/api/dist/pacs/application/dispatched-instance-stream.factory.js";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import { TEMPORARY_IMAGING_ROOT } from "../../services/api/dist/imaging-storage/temporary-imaging-storage.module.js";
import { APP_CONFIG } from "../../services/api/dist/health/health.tokens.js";
import { OIDC_TOKEN_VERIFIER } from "../../services/api/dist/authentication/authentication.tokens.js";
import { RuntimeDatabaseService } from "../../services/api/dist/database/runtime-database.service.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { DICOM_GATEWAY } from "../../services/api/dist/dicom/application/dicom-gateway.port.js";
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
  let dispatchClaim = null;
  let dispatchChecks = 0;
  let currentIdentity = identity;
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
  let captureNow = new Date(now);
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
  const lifecycleEvents = [];
  let readChecks = 0;
  const observedPrincipals = [];
  const reservationExpiries = [];
  let committedPayload = options.existingPayload ? { ...options.existingPayload } : null;
  let committedQuota = 0;
  const dicomCalls = {
    metadata: 0,
    instances: 0,
    destinationWrites: 0,
    hospitalIds: [],
    instanceIdentities: [],
  };

  const actorTenantContext = {
    run: async (capturePrincipal, tenantCandidate, work) => {
      if (tenantCandidate !== ids.tenant) throw new Error("ACTOR_TENANT_CONTEXT_DENIED");
      observedPrincipals.push({ ...capturePrincipal });
      if (capturePrincipal.issuer !== issuer || capturePrincipal.subject !== subject) throw new ActorTenantContextDeniedError();
      if (!currentIdentity) throw new ActorTenantContextDeniedError();
      if (options.denyIdentityAfterReservation && committedPayload) throw new ActorTenantContextDeniedError();
      activeTransactions += 1;
      lifecycleEvents.push("transaction:begin");
      const txAudits = [];
      const txEvidence = [];
      let txPayload = committedPayload ? { ...committedPayload } : null;
      let txQuota = committedQuota;
      let didReserve = false;
      let didComplete = false;
      let committed = false;
      let readPhase = 0;
      const client = {
        query: async (statement, values = []) => {
          const sql = String(statement);
          if (sql.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [] };
          if (sql.includes("AS dispatch_read_claimed_at")) {
            dispatchChecks++;
            // Independent modeled ledger/provenance predicates, NOT SQL/RLS proof.
            const c = dispatchClaim;
            const good = c && c.actorId === values[2] && c.digest === values[5] && c.count === values[6] &&
              c.version === 2 && c.claimedAt instanceof Date && c.claimedAt <= values[7] && c.claimedAt < values[8] &&
              c.provenance && c.preflightAudit && c.dispatchAudit;
            expect(values.slice(0, 5)).toEqual([ids.operation, ids.tenant, ids.actor, ids.session, ids.studyRef]);
            expect(values.slice(9)).toEqual([ids.package, TEST_HOSPITAL_A_ID, TEST_HOSPITAL_B_ID]);
            if (options.failDispatchSql === dispatchChecks) throw new Error("TEST-DISPATCH-SQL");
            return { rowCount: good ? 1 : 0, rows: good ? [{ dispatch_read_claimed_at: c.claimedAt }] : [] };
          }
          if (sql.includes("SELECT 1 AS capture_read_available")) {
            readPhase = ++readChecks;
            const evidence = committedEvidence.find((item) => item.integrity_id === values[6]);
            expect(values.slice(0, 3)).toEqual([ids.studyRef, ids.package, TEST_HOSPITAL_A_ID]);
            expect(values[7]).toBe(ids.operation);
            expect(values[8]).toBe(ids.session);
            expect(values[12]).toBe(ids.tenant);
            if (options.failReadSql === readPhase) throw new Error("TEST_PRIVATE_READ_SQL_FAILURE");
            const valid = txPayload?.state === "AVAILABLE" && txPayload.storageRef === values[3] &&
              txPayload.expiresAt.getTime() === values[4].getTime() && txPayload.expiresAt > values[5] &&
              evidence?.status === "PENDING" && evidence.verified_at === null &&
              evidence.algorithm === values[9] && evidence.source_digest === values[10] &&
              evidence.source_object_count === values[11] && evidence.operation_id === values[7] &&
              evidence.exchange_session_id === values[8] && evidence.package_id === values[1] &&
              evidence.study_ref_id === values[0] && evidence.verification_stage === "SOURCE_CAPTURE";
            return { rowCount: valid ? 1 : 0, rows: valid ? [{ capture_read_available: 1 }] : [] };
          }
          // Transaction model for ordering/rollback, not PostgreSQL/RLS proof.
          // Handle UPDATEs before their nested FROM operation-graph predicates.
          if (sql.includes("UPDATE study_references AS sr")) {
            if (sql.includes("SET temporary_storage_ref = $1::uuid")) {
              if (options.failReservationSql) throw new Error("TEST_RESERVATION_SQL_FAILURE");
              if (txPayload && txPayload.state !== "PURGED") return { rowCount: 0, rows: [] };
              expect(values.slice(2)).toEqual([ids.studyRef, ids.package, ids.tenant, ids.operation, ids.session, TEST_HOSPITAL_A_ID]);
              txPayload = { storageRef: values[0], state: "STAGING", expiresAt: new Date(values[1]) };
              reservationExpiries.push(new Date(values[1]));
              didReserve = true;
              lifecycleEvents.push("metadata:reserve");
              return { rowCount: 1, rows: [] };
            }
            if (!txPayload || txPayload.storageRef !== values[3]) return { rowCount: 0, rows: [] };
            if (sql.includes("SET temporary_payload_state = 'AVAILABLE'")) {
              if (options.failCompletionSql) throw new Error("TEST_COMPLETION_SQL_FAILURE");
              if (txPayload.state !== "STAGING" || txPayload.expiresAt <= values[4]) return { rowCount: 0, rows: [] };
              expect(values[8]).toBeInstanceOf(Date);
              txPayload = { ...txPayload, state: "AVAILABLE", expiresAt: new Date(values[8]) };
              didComplete = true;
              lifecycleEvents.push("metadata:available");
              return { rowCount: 1, rows: [] };
            }
            if (sql.includes("SET temporary_payload_state = CASE")) {
              if (options.failPurgeAdmission) throw new Error("TEST_PURGE_ADMISSION_FAILURE");
              if (txPayload.state !== "PURGED") txPayload.state = "PURGE_PENDING";
              lifecycleEvents.push("metadata:purge-pending");
              return { rowCount: 1, rows: [] };
            }
            if (sql.includes("SET temporary_payload_state = 'PURGED'")) {
              if (txPayload.state !== "PURGE_PENDING") return { rowCount: 0, rows: [] };
              txPayload.state = "PURGED";
              lifecycleEvents.push("metadata:purged");
              return { rowCount: 1, rows: [{ study_ref_id: ids.studyRef }] };
            }
            throw new Error("TEST_UNKNOWN_METADATA_TRANSITION");
          }
          if (sql.includes("SELECT sr.temporary_payload_state")) {
            return { rows: txPayload?.storageRef === values[3] ? [{
              temporary_payload_state: txPayload.state, temporary_storage_ref: txPayload.storageRef,
            }] : [] };
          }
          if (sql.includes("reserve_temporary_payload_quota") || sql.includes("settle_temporary_payload_quota")) {
            if (options.failQuota) throw new Error("TEST_QUOTA_FAILURE");
            expect(txPayload?.state).toBe("STAGING");
            expect(values[0]).toBe(ids.studyRef);
            expect(values[1]).toBe(txPayload.storageRef);
            const reserve = sql.includes("reserve_temporary_payload_quota");
            if (!reserve) expect(txQuota).toBeGreaterThanOrEqual(values[3]);
            txQuota = reserve ? txQuota + values[3] : values[3];
            lifecycleEvents.push(reserve ? "quota:reserve" : "quota:settle");
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes("release_temporary_payload_quota")) {
            expect(txPayload?.state).toBe("PURGED");
            txQuota = 0;
            lifecycleEvents.push("quota:release");
            return { rowCount: 1, rows: [] };
          }
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
            if (action === "PACS_TEMPORARY_READ_AUTHORIZED" && options.failReadAudit === readPhase) {
              throw new Error("TEST_PRIVATE_READ_AUDIT_FAILURE");
            }
            if (options.failAuditAction === action) {
              throw new Error("synthetic Audit sink failure");
            }
            txAudits.push([...values]);
            lifecycleEvents.push(`audit:${action}`);
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes("INSERT INTO integrity_evidence")) {
            if (options.failEvidenceInsert === true) {
              throw new Error("synthetic evidence sink failure");
            }
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
            lifecycleEvents.push("evidence:insert");
            return { rowCount: 1, rows: [row] };
          }
          if (sql.includes("SELECT integrity_id, operation_id")) {
            return { rowCount: 0, rows: [] };
          }
          throw new Error(`UNEXPECTED_SYNTHETIC_QUERY:${sql.slice(0, 60)}`);
        },
      };

      try {
        const workIdentity = options.changeIdentityAfterReservation && committedPayload
          ? { ...identity, actorId: "02000000-0000-4000-8000-000000000099" } : currentIdentity;
        const result = await work(workIdentity, client);
        if (readPhase && options.failReadCommit === readPhase) throw new ActorTenantContextUnavailableError();
        if (didReserve && options.failReservationCommit) throw new Error("TEST_RESERVATION_COMMIT_FAILURE");
        if (
          options.failFinalCommit === true &&
          txAudits.some((values) => values[7] === "PACS_SOURCE_CAPTURED")
        ) {
          throw new Error("synthetic transaction commit failure");
        }
        committedAudits.push(...txAudits);
        committedEvidence.push(...txEvidence);
        committedPayload = txPayload;
        committedQuota = txQuota;
        committed = true;
        lifecycleEvents.push("transaction:commit");
        if (readPhase && options.loseReadCommitAck === readPhase) throw new ActorTenantContextUnavailableError();
        if (readPhase) options.afterReadCommit?.(readPhase);
        if ((didReserve && options.loseReservationCommitAck) || (didComplete && options.loseFinalCommitAck)) {
          throw new ActorTenantContextUnavailableError();
        }
        if (didComplete) options.afterCompletionCommit?.();
        return result;
      } catch (error) {
        rollbackReasons.push(error?.message ?? "UNKNOWN");
        lifecycleEvents.push(committed ? "transaction:ack-lost" : "transaction:rollback");
        throw error;
      } finally {
        activeTransactions -= 1;
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
      if (options.delayMetadataMilliseconds) captureNow = new Date(captureNow.getTime() + options.delayMetadataMilliseconds);
      options.afterMetadata?.();
      if (options.metadataFailure) throw new Error("private upstream response");
      const metadata = studyMetadata({ patientId: options.metadataPatientId });
      options.sourceMetadataMutate?.(metadata);
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
      dicomCalls.instanceIdentities.push({
        seriesInstanceUid: request.seriesInstanceUid,
        sopInstanceUid: request.sopInstanceUid,
      });
      const item = instanceFixture.find((entry) => entry.sopInstanceUid === request.sopInstanceUid);
      if (!item) throw new Error("SYNTHETIC_INSTANCE_NOT_FOUND");
      options.onInstanceStreamOpen?.(item, request);
      if (options.instanceStreamFactory) {
        return { transferSyntaxUid: "1.2.840.10008.1.2.1", ...await options.instanceStreamFactory(item, request) };
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
        transferSyntaxUid: "1.2.840.10008.1.2.1",
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
    () => new Date(captureNow),
    undefined,
    options.temporaryImagingStore,
  );

  return {
    service,
    executor,
    actorTenantContext,
    gateway,
    committedAudits,
    committedEvidence,
    rollbackReasons,
    lifecycleEvents,
    observedPrincipals,
    reservationExpiries,
    get payloadState() { return committedPayload; },
    get reservedBytes() { return committedQuota; },
    get captureTime() { return new Date(captureNow); },
    set captureTime(value) { captureNow = new Date(value); },
    dicomCalls,
    get activeTransactions() { return activeTransactions; },
    get authorizationCalls() { return authorizationCalls; },
    get readChecks() { return readChecks; },
    get dispatchChecks() { return dispatchChecks; },
    simulateCommittedDispatch(overrides = {}) {
      currentScope = { ...currentScope, operation_state: "STOW_STARTED" };
      dispatchClaim = { actorId: ids.actor, version: 2, count: 3, claimedAt: new Date(now),
        digest: pacsTransferOperationDigest({ tenantId: ids.tenant, actorId: ids.actor, exchangeSessionId: ids.session,
          studyRefId: ids.studyRef, consentId: ids.consent, grantId: ids.grant, action: "PACS_IMPORT" }),
        provenance: true, preflightAudit: true, dispatchAudit: true, ...overrides };
    },
    changeDispatch(value) { dispatchClaim = { ...dispatchClaim, ...value }; },
    changeScope(value) { currentScope = { ...currentScope, ...value }; },
    changeIdentity(value) { currentIdentity = value === null ? null : { ...currentIdentity, ...value }; },
    changeMapping(value) { currentMapping = { ...currentMapping, ...value }; },
    changeAuthorization(value) { currentAuthorization = { ...currentAuthorization, ...value }; },
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

function createLifecycleTimingDiagnostic(clock = () => performance.now()) {
  const phases = ['SETUP_ROOT','SETUP_STORE','CHECK','ALLOCATE','OPEN_INSTANCE','WRITE','SYNC','SEAL',
    'CAPTURE','READ','READ_VERIFY_ONE','READ_VERIFY_TWO','ASSERTIONS',
    'FIXTURE_PURGE','FIXTURE_LIST','FIXTURE_RM','FIXTURE_ABSENCE','DONE'];
  let phase = 'SETUP_ROOT', started = clock();
  return Object.freeze({
    mark(next) { phase = phases.includes(next) ? next : 'UNKNOWN'; started = clock(); },
    marker() {
      const current = clock();
      const elapsed = typeof current === 'number' && typeof started === 'number' ? current - started : NaN;
      const bucket = !Number.isFinite(elapsed) || elapsed < 0 ? 'UNKNOWN'
        : elapsed < 1000 ? 'LT1000MS' : elapsed < 4000 ? 'LT4000MS' : 'GTE4000MS';
      return `DEC017_API_LIFECYCLE_${phase}_${bucket}`;
    },
  });
}

async function withLifecycle(options, check) {
  const mark = stage => options.diagnostic?.mark(stage);
  mark('SETUP_ROOT');
  const root = await mkdtemp(join(tmpdir(), "mediq-source-lifecycle-"));
  mark('SETUP_STORE');
  const storageRoot = join(root, "ciphertext");
  let harness;
  const attempted = [];
  const store = new EphemeralEncryptedTemporaryImagingStore({
    rootDirectory: storageRoot,
    now: options.storeNow ?? (() => (harness?.captureTime.getTime() ?? now.getTime()) + (options.storeClockOffset ?? 0)),
    limits: options.storeTtlMilliseconds === undefined ? undefined : { packageTtlMilliseconds: options.storeTtlMilliseconds },
    ciphertextIo: {
      write: (file, bytes, offset, length, position) => {
        mark('WRITE');
        expect(harness.activeTransactions).toBe(0);
        expect(harness.reservedBytes).toBeGreaterThanOrEqual(length);
        harness.lifecycleEvents.push("physical:write");
        return file.write(bytes, offset, length, position);
      },
      sync: (file) => { mark('SYNC'); return file.sync(); },
    },
  });
  const port = {
    async beginReservedPackage(binding, ref, quota) {
      mark('ALLOCATE');
      attempted.push({ storageRef: ref, binding });
      expect(harness.activeTransactions).toBe(0);
      expect(harness.payloadState).toMatchObject({ state: "STAGING", storageRef: ref });
      expect(quota).toBeDefined();
      harness.lifecycleEvents.push("physical:allocate");
      const handle = await store.beginReservedPackage(binding, ref, quota);
      if (options.failAfterAllocation) throw new Error("TEST_AFTER_ALLOCATION_FAILURE");
      return handle;
    },
    beginInstance(input) {
      mark('OPEN_INSTANCE');
      expect(harness.activeTransactions).toBe(0);
      return store.beginInstance(input);
    },
    async sealPackage(input) {
      mark('SEAL');
      expect(harness.activeTransactions).toBe(0);
      const receipt = await store.sealPackage(input);
      if (options.afterSeal) await options.afterSeal(harness, receipt);
      return receipt;
    },
    async consumeInstance(input, verify, consume) {
      expect(harness.activeTransactions).toBe(0);
      let checks = 0;
      await store.consumeInstance(input, async (request, signal) => {
        checks += 1;
        mark(checks === 1 ? 'READ_VERIFY_ONE' : checks === 2 ? 'READ_VERIFY_TWO' : 'UNKNOWN');
        await options.beforeReadVerification?.(harness, checks);
        const result = await verify(request, signal);
        expect(harness.activeTransactions).toBe(0);
        await options.afterReadVerification?.(harness, checks);
        return result;
      }, async (plaintext, signal) => {
        expect(harness.activeTransactions).toBe(0);
        await consume(plaintext, signal);
      });
    },
    async purgeByReference(input) {
      expect(harness.activeTransactions).toBe(0);
      expect(["PURGE_PENDING", "PURGED"]).toContain(harness.payloadState?.state);
      expect(harness.payloadState.storageRef).toBe(input.storageRef);
      harness.lifecycleEvents.push("physical:purge");
      if (options.failPurgePhysical) throw new Error("TEST_PHYSICAL_PURGE_FAILURE");
      await store.purgeByReference(input);
      expect(await readdir(storageRoot)).toEqual([]);
    },
  };
  harness = makeHarness({ ...options, temporaryImagingStore: port });
  try {
    mark('CHECK');
    return await check(harness, store, storageRoot);
  } finally {
    // Fixture teardown only; it is not product DB/purge acceptance.
    mark('FIXTURE_PURGE');
    for (const input of attempted) await store.purgeByReference(input);
    mark('FIXTURE_LIST');
    expect(await readdir(storageRoot)).toEqual([]);
    expect(resolve(dirname(root))).toBe(resolve(tmpdir()));
    expect(basename(root).startsWith("mediq-source-lifecycle-")).toBe(true);
    mark('FIXTURE_RM');
    await rm(root, { recursive: true, force: true });
    mark('FIXTURE_ABSENCE');
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    mark('DONE');
  }
}

function readCommand(handoff, overrides = {}) {
  return { principal, tenantCandidate: ids.tenant, correlationId: ids.correlation,
    consentId: ids.consent, grantId: ids.grant, handoff,
    objectRef: handoff.temporaryPackage.instances[0].objectRef, ...overrides };
}

describe("DEC-017 R2 concrete read authorization (model DB, real engine/crypto)", () => {
  it("checks twice outside I/O, records admission not delivery, returns no bytes and zeroes borrowed memory", async () => {
    await withLifecycle({}, async (harness) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      let borrowed;
      const callback = vi.fn(async (bytes) => {
        borrowed = bytes;
        expect(harness.activeTransactions).toBe(0);
        expect([...bytes]).toEqual([...instanceFixture[0].bytes]);
        expect(harness.readChecks).toBe(2);
        expect(auditActions(harness).slice(-2)).toEqual([
          { action: "PACS_TEMPORARY_READ_AUTHORIZED", result: "ALLOW", reason: "BEFORE_DECRYPT" },
          { action: "PACS_TEMPORARY_READ_AUTHORIZED", result: "ALLOW", reason: "BEFORE_DELIVERY" },
        ]);
      });
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff), callback)).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalledOnce();
      expect(borrowed.every((byte) => byte === 0)).toBe(true);
      expect(harness.authorizationCalls).toBe(5);
      expect(harness.operationState).toBe("CREATED");
      expect(harness.dicomCalls.destinationWrites).toBe(0);
      expect(JSON.stringify(handoff)).not.toMatch(/TEST-PATIENT|localPatientId|patientRefId/);
    });
  });

  it.each([
    ["clone", (h) => ({ handoff: { ...h } })],
    ["unknown object", () => ({ objectRef: ids.patient })],
    ["caller verifier", () => ({ verifyAccess: async () => "VERIFIED" })],
    ["purpose override", () => ({ purpose: "VIEW" })],
    ["operation override", () => ({ operationId: ids.operation })],
    ["missing principal", () => ({ principal: null })],
  ])("denies %s before any read Authorization", async (_name, overrides) => {
    await withLifecycle({}, async (harness) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      const callback = vi.fn();
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff, overrides(handoff)), callback))
        .rejects.toMatchObject({ message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
      expect(harness.readChecks).toBe(0);
      expect(harness.authorizationCalls).toBe(3);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  it("rejects the issued handoff in another service instance", async () => {
    await withLifecycle({}, async (harness, store) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      const restarted = makeHarness({ temporaryImagingStore: store });
      const callback = vi.fn();
      await expect(restarted.service.consumeCapturedInstance(readCommand(handoff), callback)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(restarted.authorizationCalls).toBe(0);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  const changes = [
    ["inactive actor", h => h.changeIdentity(null)],
    ["actor changed", h => h.changeIdentity({ actorId: ids.mapping })],
    ["Hospital changed", h => h.changeIdentity({ hospitalId: TEST_HOSPITAL_A_ID })],
    ["Tenant changed", h => h.changeIdentity({ tenantId: ids.mapping })],
    ["expired Grant", h => h.changeAuthorization({ grantExpiresAt: new Date(now.getTime() - 1) })],
    ["Consent withdrawal", h => { h.consentStatus = "WITHDRAWN"; }],
    ["Grant revocation", h => h.changeAuthorization({ grantStatus: "REVOKED" })],
    ["mapping local ID", h => h.changeMapping({ local_patient_id: "TEST-CHANGED" })],
    ["mapping reference", h => h.changeMapping({ mapping_id: ids.patient })],
    ["mapping revocation", h => h.changeMapping({ status: "REVOKED" })],
    ["patient", h => h.changeScope({ patient_ref_id: ids.mapping })],
    ["package", h => h.changeScope({ package_id: ids.mapping })],
    ["Study", h => h.changeScope({ study_ref_id: ids.mapping })],
    ["source", h => h.changeScope({ source_hospital_id: TEST_HOSPITAL_B_ID })],
    ["destination", h => h.changeScope({ destination_hospital_id: TEST_HOSPITAL_A_ID })],
    ["Session", h => h.changeScope({ exchange_session_id: ids.mapping })],
    ["operation state", h => h.changeScope({ operation_state: "STOW_STARTED" })],
    ["pending purge", h => { h.payloadState.state = "PURGE_PENDING"; }],
    ["storage ref", h => { h.payloadState.storageRef = ids.mapping; }],
    ["metadata expiry", h => { h.payloadState.expiresAt = new Date(now.getTime() + 60_000); }],
    ["expired clock", h => { h.captureTime = new Date(now.getTime() + 30 * 60_000); }],
    ["evidence digest", h => { h.committedEvidence[0].source_digest = `sha256:${"0".repeat(64)}`; }],
    ["evidence count", h => { h.committedEvidence[0].source_object_count = 4; }],
    ["evidence stage", h => { h.committedEvidence[0].verification_stage = "DESTINATION"; }],
    ["evidence status", h => { h.committedEvidence[0].status = "VERIFIED"; }],
  ];
  it.each(changes.flatMap(([name, mutate]) => [1, 2].map(phase => [name, phase, mutate])))
    ("denies %s before read phase %s without callback", async (_name, phase, mutate) => {
      const diagnostic = createLifecycleTimingDiagnostic();
      onTestFailed(() => { console.error(diagnostic.marker()); });
      await withLifecycle({ diagnostic, beforeReadVerification: (h, n) => { if (n === phase) mutate(h); } }, async (harness) => {
        diagnostic.mark('CAPTURE');
        const { handoff } = await harness.service.captureForCoordinator(command());
        const callback = vi.fn();
        diagnostic.mark('READ');
        await expect(harness.service.consumeCapturedInstance(readCommand(handoff), callback)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        diagnostic.mark('ASSERTIONS');
        expect(callback).not.toHaveBeenCalled();
        expect(auditActions(harness).filter(e => e.action === "PACS_TEMPORARY_READ_AUTHORIZED")).toHaveLength(phase - 1);
        expect(harness.dicomCalls.instances).toBe(3);
      });
    });

  it.each(["failReadSql", "failReadAudit", "failReadCommit", "loseReadCommitAck"].flatMap(key => [1, 2].map(n => [key, n])))
    ("fails closed for %s at check %s", async (key, n) => {
      await withLifecycle({ [key]: n }, async (harness) => {
        const { handoff } = await harness.service.captureForCoordinator(command());
        const callback = vi.fn();
        await expect(harness.service.consumeCapturedInstance(readCommand(handoff), callback)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        expect(callback).not.toHaveBeenCalled();
        expect(harness.payloadState.state).toBe("AVAILABLE");
        expect(harness.operationState).toBe("CREATED");
      });
    });

  it("snapshots principal/selectors before awaits", async () => {
    const inputPrincipal = { ...principal };
    let input;
    await withLifecycle({ afterReadVerification: (_h, n) => {
      if (n === 1) { inputPrincipal.subject = "TEST-OTHER"; input.tenantCandidate = ids.mapping; input.objectRef = ids.mapping; }
    } }, async (harness) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      input = readCommand(handoff, { principal: inputPrincipal });
      const callback = vi.fn(async () => {});
      await harness.service.consumeCapturedInstance(input, callback);
      expect(callback).toHaveBeenCalledOnce();
      expect(harness.observedPrincipals.every(p => p.subject === subject)).toBe(true);
    });
  });

  it("rejects corrupted ciphertext without a callback or delivery admission", async () => {
    await withLifecycle({}, async (harness, _store, root) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      const pkg = handoff.temporaryPackage;
      const path = join(root, pkg.storageRef, `${pkg.instances[0].objectRef}.enc`);
      const bytes = await readFile(path); bytes[0] ^= 1; await writeFile(path, bytes);
      const callback = vi.fn();
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff), callback)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(callback).not.toHaveBeenCalled();
      expect(harness.readChecks).toBe(1);
    });
  });

  it("holds and zeroes borrowed plaintext after consumer rejection", async () => {
    await withLifecycle({}, async (harness) => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      let borrowed;
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff), async bytes => {
        borrowed = bytes; throw new Error("TEST_PRIVATE_CONSUMER_FAILURE");
      })).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(borrowed.every(byte => byte === 0)).toBe(true);
    });
  });

  it.each(["before", "between", "after-final-commit"])("denies cancellation %s without callback", async timing => {
    const abort = new AbortController();
    await withLifecycle({
      afterReadVerification: (_h, n) => { if (timing === "between" && n === 1) abort.abort(); },
      afterReadCommit: n => { if (timing === "after-final-commit" && n === 2) abort.abort(); },
    }, async harness => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      if (timing === "before") abort.abort();
      const callback = vi.fn();
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff, { signal: abort.signal }), callback))
        .rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  it("denies expiry during final commit before callback", async () => {
    let running;
    await withLifecycle({ afterReadCommit: n => {
      if (n === 2) running.captureTime = new Date(now.getTime() + 30 * 60_000);
    } }, async harness => {
      running = harness;
      const { handoff } = await harness.service.captureForCoordinator(command());
      const callback = vi.fn();
      await expect(harness.service.consumeCapturedInstance(readCommand(handoff), callback)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  it("rechecks replay without extending expiry or repeating source retrieval", async () => {
    await withLifecycle({}, async harness => {
      const { handoff } = await harness.service.captureForCoordinator(command());
      const expiry = harness.payloadState.expiresAt.getTime();
      await harness.service.consumeCapturedInstance(readCommand(handoff), async () => {});
      harness.captureTime = new Date(now.getTime() + 60_000);
      await harness.service.consumeCapturedInstance(readCommand(handoff), async () => {});
      expect(harness.readChecks).toBe(4);
      expect(harness.payloadState.expiresAt.getTime()).toBe(expiry);
      expect(harness.dicomCalls.instances).toBe(3);
    });
  });
});

describe("DEC-020 source transport metadata and committed read (modeled SQL; real crypto/engine)", () => {
  it("binds actual WADO syntax and metadata class without adding them to the ordinary result", async () => {
    const sourceMetadataMutate = metadata => { for (const item of metadata.series[0].instances) delete item.transferSyntaxUid; };
    await withLifecycle({ sourceMetadataMutate }, async h => {
      const { handoff } = await h.service.captureForCoordinator(command());
      for (const item of [...handoff.expectedInstances, ...handoff.temporaryPackage.instances]) {
        expect(item).toMatchObject({ sopClassUid: "1.2.840.10008.5.1.4.1.1.2", transferSyntaxUid: "1.2.840.10008.1.2.1" });
        expect(Object.isFrozen(item)).toBe(true);
      }
    });
    const result = await makeHarness().service.capture(command());
    expect(Object.keys(result).sort()).toEqual(["evidenceId", "kind", "objectCount", "status"]);
  });

  it.each(["class", "syntax"])("denies unsupported metadata %s before payload WADO", async variant => {
    const h = makeHarness({ sourceMetadataMutate: metadata => {
      metadata.series[0].instances[0][variant === "class" ? "sopClassUid" : "transferSyntaxUid"] = "2.25.999";
    } });
    expect(await h.service.captureForCoordinator(command())).toEqual({ kind: "DENIED", reason: "SOURCE_METADATA_INVALID" });
    expect(h.dicomCalls.instances).toBe(0); expect(h.committedEvidence).toHaveLength(0);
  });

  it.each([undefined, "2.25.999"])("denies missing/wrong actual WADO syntax=%s and closes input", async transferSyntaxUid => {
    const cancelled = vi.fn();
    const h = makeHarness({ instanceStreamFactory: item => ({ sopInstanceUid: item.sopInstanceUid, mediaType: "application/dicom", transferSyntaxUid,
      body: new ReadableStream({ pull() {}, cancel: cancelled }, { highWaterMark: 0 }) }) });
    await expect(h.service.captureForCoordinator(command())).rejects.toThrow("SOURCE_CAPTURE_UNAVAILABLE");
    expect(cancelled).toHaveBeenCalledOnce(); expect(h.committedEvidence).toHaveLength(0); expect(h.dicomCalls.instances).toBe(1);
  });

  it("requires a committed claim for every original object, rechecks twice and zeroes borrowed memory", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command());
      h.simulateCommittedDispatch();
      await expect(h.service.consumeCapturedInstance(readCommand(handoff), vi.fn())).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      for (const item of handoff.temporaryPackage.instances) {
        let borrowed;
        await h.service.consumeDispatchedInstance(readCommand(handoff, { objectRef: item.objectRef }), async plaintext => {
          expect(h.activeTransactions).toBe(0); borrowed = plaintext;
          expect(plaintext).toEqual(Buffer.from(instanceFixture.find(i => i.sopInstanceUid === item.sopInstanceUid).bytes));
        });
        expect(borrowed.every(byte => byte === 0)).toBe(true);
      }
      expect(h.dispatchChecks).toBe(6); expect(h.readChecks).toBe(6);
      expect(h.operationState).toBe("STOW_STARTED"); expect(h.dicomCalls.destinationWrites).toBe(0); expect(h.dicomCalls.instances).toBe(3);
    });
  });

  it.each(["CREATED", "PREFLIGHT_PASSED", "VERIFYING", "COMPLETED", "FAILED", "PARTIAL", "RESULT_UNKNOWN"])
    ("denies non-dispatch state %s without a delivery", async operation_state => {
      await withLifecycle({}, async h => {
        const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); h.changeScope({ operation_state });
        const delivered = vi.fn();
        await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        expect(delivered).not.toHaveBeenCalled(); expect(h.dispatchChecks).toBe(0);
      });
    });

  const claims = [["owner", { actorId: ids.mapping }], ["digest", { digest: "0".repeat(64) }], ["count", { count: 4 }],
    ["version", { version: 3 }], ["null timestamp", { claimedAt: null }], ["future timestamp", { claimedAt: new Date(now.getTime()+1) }],
    ["provenance", { provenance: false }], ["preflight Audit", { preflightAudit: false }], ["dispatch Audit", { dispatchAudit: false }]];
  it.each(claims.flatMap(([name, change]) => [1,2].map(phase => [name, phase, change])))
    ("denies %s at check %s without delivery", async (_name, phase, change) => {
      await withLifecycle({ beforeReadVerification: (h, current) => { if (current === phase) h.changeDispatch(change); } }, async h => {
        const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); const delivered = vi.fn();
        await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        expect(delivered).not.toHaveBeenCalled(); expect(h.dispatchChecks).toBe(phase);
      });
    });

  it.each([["withdrawn", h => h.changeAuthorization({ consentStatus: "WITHDRAWN" })],
    ["revoked", h => h.changeAuthorization({ grantStatus: "REVOKED" })], ["mapping", h => h.changeMapping({ local_patient_id: "TEST-OTHER" })],
    ["identity", h => h.changeIdentity({ actorId: ids.mapping })], ["purge", h => { h.payloadState.state = "PURGE_PENDING"; }],
    ["expiry", h => { h.captureTime = new Date(now.getTime()+30*60_000); }],
    ["claim epoch", h => { h.captureTime = new Date(now.getTime()+1000); h.changeDispatch({ claimedAt: new Date(now.getTime()+1) }); }]])
    ("rechecks %s between decrypt and delivery", async (_name, mutate) => {
      await withLifecycle({ beforeReadVerification: (h, phase) => { if (phase === 2) mutate(h); } }, async h => {
        const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); const delivered = vi.fn();
        await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        expect(delivered).not.toHaveBeenCalled();
      });
    });

  it.each(["failDispatchSql", "failReadAudit", "failReadCommit", "loseReadCommitAck"].flatMap(key => [1,2].map(n => [key,n])))
    ("fails closed on %s/%s", async (key, phase) => {
      await withLifecycle({ [key]: phase }, async h => {
        const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); const delivered = vi.fn();
        await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
        expect(delivered).not.toHaveBeenCalled();
      });
    });

  it.each(["clone", "claim", "verifier"])("rejects caller %s authority", async variant => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); const delivered = vi.fn();
      const overrides = variant === "clone" ? { handoff: { ...handoff } } : variant === "claim" ? { dispatchClaim: true } : { verifyAccess: async () => "VERIFIED" };
      await expect(h.service.consumeDispatchedInstance(readCommand(handoff, overrides), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(delivered).not.toHaveBeenCalled(); expect(h.dispatchChecks).toBe(0);
    });
  });

  it("never retries a dispatched object after consumer failure", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); let borrowed;
      await expect(h.service.consumeDispatchedInstance(readCommand(handoff), async bytes => {
        borrowed = bytes; throw new Error("TEST-PRIVATE-CONSUMER");
      })).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(borrowed.every(byte => byte === 0)).toBe(true); const delivered = vi.fn();
      await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(h.dispatchChecks).toBe(2); expect(delivered).not.toHaveBeenCalled();
    });
  });

  it.each(["failReadAudit", "failReadCommit", "loseReadCommitAck"])("first-check %s never restores a positively reserved attempt", async key => {
    await withLifecycle({ [key]: 1 }, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); const delivered = vi.fn();
      await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      await expect(h.service.consumeDispatchedInstance(readCommand(handoff), delivered)).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      expect(delivered).not.toHaveBeenCalled(); expect(h.dispatchChecks).toBe(1);
    });
  });

  it("serializes concurrent object attempts until consumer settles, then denies replay and zeroes", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch();
      let release, enter, borrowed;
      const started = new Promise(resolve => { enter = resolve; });
      const hold = new Promise(resolve => { release = resolve; });
      const first = h.service.consumeDispatchedInstance(readCommand(handoff), async bytes => { borrowed = bytes; enter(); await hold; });
      await started; const secondDelivered = vi.fn();
      const second = h.service.consumeDispatchedInstance(readCommand(handoff), secondDelivered);
      const denied = expect(second).rejects.toThrow("TEMPORARY_IMAGING_READ_UNAVAILABLE");
      try { expect(borrowed).toEqual(Buffer.from(instanceFixture[0].bytes)); }
      finally { release(); }
      await first; await denied; expect(secondDelivered).not.toHaveBeenCalled(); expect(borrowed.every(byte => byte === 0)).toBe(true);
      expect(h.dispatchChecks).toBe(2);
    });
  });

  it("lazily bridges original encrypted objects into a single Study multipart using stable owned chunks", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch();
      const factory = new DispatchedInstanceStreamFactory(h.service);
      const ownedChunks = [], borrows = [];
      const original = h.service.consumeDispatchedInstance.bind(h.service);
      const observed = vi.spyOn(h.service, "consumeDispatchedInstance").mockImplementation((input, callback) =>
        original(input, async (plaintext, signal) => { borrows.push(plaintext); await callback(plaintext, signal); }));
      const body = factory.open(readCommand(handoff));
      expect(observed).not.toHaveBeenCalled();

      let protocolFailure;
      const fetch = vi.fn(async (_url, init) => {
        try {
        const output = init.body.getReader();
        try {
          await output.read(); // first multipart prefix; owned body is still lazy
          expect(observed).not.toHaveBeenCalled();
          const first = (await output.read()).value; ownedChunks.push(first);
          expect(first.buffer).not.toBe(borrows[0].buffer);
          expect(borrows[0]).toEqual(Buffer.from(instanceFixture[0].bytes));
          await new Promise(resolve => setImmediate(resolve));
          expect(borrows[0]).toEqual(Buffer.from(instanceFixture[0].bytes));
          expect(Buffer.from((await output.read()).value)).toEqual(Buffer.from("\r\n")); // source EOF waits for zero
          expect(borrows[0].every(byte => byte === 0)).toBe(true);
          expect(first).toEqual(instanceFixture[0].bytes);
          while (true) { const part = await output.read(); if (part.done) break;
            if (part.value.byteLength < 10) ownedChunks.push(part.value); }
        } finally { output.releaseLock(); }
        return new Response(JSON.stringify({ "00081199": { vr: "SQ", Value: handoff.expectedInstances.map(item => ({
          "00081155": { vr: "UI", Value: [item.sopInstanceUid] },
        })) } }), { headers: { "content-type": "application/dicom+json" } });
        } catch (error) { protocolFailure = error; throw error; }
      });
      const gateway = new OrthancDicomwebAdapter({ resolve: () => ({ origin: new URL("https://orthanc-b:8042/dicom-web/"), authorization: "Basic TEST-SYNTHETIC" }) }, { fetch });
      const expected = handoff.expectedInstances;
      const outcome = await gateway.storeStudyStream({ context: { hospitalId: TEST_HOSPITAL_B_ID, correlationId: ids.correlation, signal: new AbortController().signal },
        studyInstanceUid: handoff.studyInstanceUid,
        instances: expected.map(({ seriesInstanceUid, sopInstanceUid, sopClassUid, transferSyntaxUid, byteLength }) => ({
          seriesInstanceUid, sopInstanceUid, sopClassUid, transferSyntaxUid, contentLength: byteLength })),
        openInstance: async (item, signal) => item.sopInstanceUid === expected[0].sopInstanceUid ? body : factory.open(readCommand(handoff, {
          objectRef: handoff.temporaryPackage.instances.find(i => i.sopInstanceUid === item.sopInstanceUid).objectRef, signal })),
      }).catch(error => { expect(protocolFailure).toBeUndefined(); throw error; });
      expect(outcome.storedSopInstanceUids).toEqual(expected.map(item => item.sopInstanceUid));
      expect(protocolFailure).toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce(); expect(borrows).toHaveLength(3);
      expect(borrows.every(b => b.every(byte => byte === 0))).toBe(true);
      for (const fixture of instanceFixture) expect(ownedChunks.some(chunk => Buffer.from(chunk).equals(Buffer.from(fixture.bytes)))).toBe(true);
      expect(h.dicomCalls.destinationWrites).toBe(0); expect(h.dicomCalls.instances).toBe(3); // adapter fetch is fake, no real STOW
    });
  });

  it("snapshots bridge input, holds borrow then cancels/zeros without permitting replay", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); let borrowed;
      const original = h.service.consumeDispatchedInstance.bind(h.service);
      vi.spyOn(h.service, "consumeDispatchedInstance").mockImplementation((input, callback) => original(input, async (p, s) => { borrowed = p; await callback(p,s); }));
      const inputPrincipal = { ...principal }, input = readCommand(handoff, { principal: inputPrincipal });
      const factory = new DispatchedInstanceStreamFactory(h.service), body = factory.open(input);
      inputPrincipal.subject = "TEST-MUTATED"; input.objectRef = ids.mapping; input.tenantCandidate = ids.mapping;
      const reader = body.getReader(), owned = (await reader.read()).value;
      expect(owned).toEqual(instanceFixture[0].bytes); expect(borrowed).toEqual(Buffer.from(instanceFixture[0].bytes));
      await reader.cancel(); reader.releaseLock(); expect(borrowed.every(byte => byte === 0)).toBe(true);
      expect(owned).toEqual(instanceFixture[0].bytes);
      const retry = factory.open(readCommand(handoff)).getReader();
      try { await expect(retry.read()).rejects.toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE"); } finally { retry.releaseLock(); }
    });
  });

  it("bridge parent abort errors delivery and settles/zeroes the real holding consumer", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch(); let borrowed, settled;
      const original = h.service.consumeDispatchedInstance.bind(h.service);
      vi.spyOn(h.service, "consumeDispatchedInstance").mockImplementation((input, callback) => {
        const work = original(input, async (p,s) => { borrowed = p; await callback(p,s); });
        settled = work.catch(() => undefined); return work;
      });
      const abort = new AbortController(), factory = new DispatchedInstanceStreamFactory(h.service);
      const reader = factory.open(readCommand(handoff, { signal: abort.signal })).getReader();
      await reader.read(); abort.abort();
      await expect(reader.read()).rejects.toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE");
      await settled; reader.releaseLock(); expect(borrowed.every(byte => byte === 0)).toBe(true);
    });
  });

  it.each(["purge", "ttl"])("bridge %s abort settles/zeroes the real holding consumer without recalling owned bytes or allowing replay", async cause => {
    const started = Date.now();
    const options = cause === "ttl" ? {
      storeTtlMilliseconds: 750, storeNow: () => now.getTime() + Date.now() - started,
    } : {};
    await withLifecycle(options, async (h, store) => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch();
      let borrowed, settled;
      const original = h.service.consumeDispatchedInstance.bind(h.service);
      vi.spyOn(h.service, "consumeDispatchedInstance").mockImplementation((input, callback) => {
        const work = original(input, async (p,s) => { borrowed = p; await callback(p,s); });
        settled = work.catch(() => undefined); return work;
      });
      const factory = new DispatchedInstanceStreamFactory(h.service), reader = factory.open(readCommand(handoff)).getReader();
      try {
        const owned = (await reader.read()).value;
        expect(borrowed).toEqual(Buffer.from(instanceFixture[0].bytes));
        if (cause === "purge") await store.purgeByReference({
          storageRef: handoff.temporaryPackage.storageRef, binding: {
            tenantId: handoff.tenantId, exchangeSessionId: handoff.exchangeSessionId,
            packageId: handoff.packageId, purpose: "PACS_IMPORT",
          },
        });
        // The small real TTL timer must signal while the borrowed consumer is held.
        await expect(reader.closed).rejects.toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE");
        await settled;
        expect(borrowed.every(byte => byte === 0)).toBe(true);
        expect(owned).toEqual(instanceFixture[0].bytes);
        await expect(reader.read()).rejects.toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE");
        const retry = factory.open(readCommand(handoff)).getReader();
        try { await expect(retry.read()).rejects.toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE"); }
        finally { retry.releaseLock(); }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      expect(h.dicomCalls.instances).toBe(3); expect(h.dicomCalls.destinationWrites).toBe(0);
    });
  });

  it("cancel before first bridge pull never starts authorized reading", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch();
      const read = vi.spyOn(h.service, "consumeDispatchedInstance");
      const body = new DispatchedInstanceStreamFactory(h.service).open(readCommand(handoff));
      await body.cancel();
      expect(read).not.toHaveBeenCalled(); expect(h.dispatchChecks).toBe(0);
    });
  });

  it("bridge rejects invalid/accessor/extra inputs without invoking getters or authorized reader", async () => {
    await withLifecycle({}, async h => {
      const { handoff } = await h.service.captureForCoordinator(command());
      const factory = new DispatchedInstanceStreamFactory(h.service), read = vi.spyOn(h.service, "consumeDispatchedInstance");
      const getter = vi.fn(() => ids.tenant), input = readCommand(handoff);
      Object.defineProperty(input, "tenantCandidate", { get: getter });
      for (const value of [null, [], input, readCommand(handoff, { endpoint: "https://example.invalid" }),
        readCommand(handoff, { objectRef: "NOT-A-UUID" }), readCommand(handoff, { signal: {} }),
        readCommand(handoff, { principal: { ...principal, verifier: () => true } })]) {
        expect(() => factory.open(value)).toThrow("PACS_DISPATCH_STREAM_UNAVAILABLE");
      }
      expect(getter).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    });
  });

  it("bridge splits a real encrypted object into independent at-most-64-KiB chunks and zeroes before EOF", async () => {
    const bytes = Uint8Array.from({ length: 2 * 64 * 1024 + 37 }, (_, i) => i % 251);
    await withLifecycle({ instanceStreamFactory: async (item, input) => ({
      mediaType: "application/dicom", sopInstanceUid: item.sopInstanceUid,
      contentLength: input.sopInstanceUid === instanceFixture[0].sopInstanceUid ? bytes.byteLength : item.bytes.byteLength,
      body: new ReadableStream({
      start(controller) { controller.enqueue(input.sopInstanceUid === instanceFixture[0].sopInstanceUid ? bytes :
        instanceFixture.find(item => item.sopInstanceUid === input.sopInstanceUid).bytes); controller.close(); },
    }) }) }, async h => {
      const { handoff } = await h.service.captureForCoordinator(command()); h.simulateCommittedDispatch();
      let borrowed;
      const original = h.service.consumeDispatchedInstance.bind(h.service);
      vi.spyOn(h.service, "consumeDispatchedInstance").mockImplementation((input, callback) =>
        original(input, async (p,s) => { borrowed = p; await callback(p,s); }));
      const reader = new DispatchedInstanceStreamFactory(h.service).open(readCommand(handoff)).getReader(), chunks = [];
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          expect(part.value.byteLength).toBeLessThanOrEqual(64 * 1024);
          expect(part.value.buffer).not.toBe(borrowed.buffer); chunks.push(part.value);
          expect(borrowed).toEqual(Buffer.from(bytes));
        }
        expect(chunks.map(chunk => chunk.byteLength)).toEqual([65536, 65536, 37]);
        expect(borrowed.every(byte => byte === 0)).toBe(true);
        expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
        expect(h.dispatchChecks).toBe(2); expect(h.dicomCalls.instances).toBe(3);
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    });
  });
});

describe("DEC-017 source lifecycle wiring (real store/AuthorizationEngine, modeled DB)", () => {
  it("DEC-018 actual Nest source provider captures and reads through its shared runtime store", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediq-runtime-source-"));
    const harness = makeHarness();
    let moduleRef, handoff, store;
    try {
      moduleRef = await Test.createTestingModule({ imports: [PacsImportModule] })
        .overrideProvider(APP_CONFIG).useValue({ oidcAuthentication: null })
        .overrideProvider(RuntimeDatabaseService).useValue({})
        .overrideProvider(OIDC_TOKEN_VERIFIER).useValue(null)
        .overrideProvider(ActorTenantContextService).useValue(harness.actorTenantContext)
        .overrideProvider(AuthorizationGatedOperationExecutor).useValue(harness.executor)
        .overrideProvider(DICOM_GATEWAY).useValue(harness.gateway)
        .overrideProvider(TEMPORARY_IMAGING_ROOT).useValue(join(root, "ciphertext"))
        .compile();
      const service = moduleRef.get(AuthorizedSourceCaptureService);
      store = moduleRef.get(EphemeralEncryptedTemporaryImagingStore);
      expect(service.temporaryImagingStore).toBe(store);
      ({ handoff } = await service.captureForCoordinator(command()));
      expect(handoff.temporaryPackage.objectCount).toBe(3);
      expect(harness.payloadState.state).toBe("AVAILABLE");
      for (const item of handoff.temporaryPackage.instances) {
        await service.consumeCapturedInstance(readCommand(handoff, { objectRef: item.objectRef }), async bytes => {
          expect(bytes).toEqual(Buffer.from(instanceFixture.find(f => f.sopInstanceUid === item.sopInstanceUid).bytes));
        });
      }
      expect(harness.dicomCalls.destinationWrites).toBe(0);
      expect(harness.readChecks).toBe(6);
    } finally {
      if (handoff) await store.purgeByReference({ storageRef: handoff.temporaryPackage.storageRef,
        binding: { tenantId: handoff.tenantId, exchangeSessionId: handoff.exchangeSessionId,
          packageId: handoff.packageId, purpose: "PACS_IMPORT" } });
      await moduleRef?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("commits reservation before allocation, quota before writes, and AVAILABLE with evidence/Audit", async () => {
    await withLifecycle({}, async (harness) => {
      const result = await harness.service.captureForCoordinator(command());
      expect(result.kind).toBe("CAPTURED_FOR_COORDINATOR");
      expect(harness.payloadState).toMatchObject({ state: "AVAILABLE", storageRef: result.handoff.temporaryPackage.storageRef });
      expect(harness.payloadState.expiresAt.toISOString()).toBe(result.handoff.temporaryPackage.expiresAt);
      expect(harness.reservedBytes).toBe(12);
      expect(harness.committedEvidence).toHaveLength(1);
      expect(harness.authorizationCalls).toBe(3);
      const events = harness.lifecycleEvents;
      const allocation = events.indexOf("physical:allocate");
      expect(events[allocation - 1]).toBe("transaction:commit");
      expect(events.indexOf("metadata:reserve")).toBeLessThan(allocation);
      expect(events.indexOf("quota:reserve")).toBeLessThan(events.indexOf("physical:write"));
      expect(events.indexOf("metadata:available")).toBeLessThan(events.indexOf("evidence:insert"));
      expect(events.slice(-4)).toEqual(["metadata:available", "evidence:insert", "audit:PACS_SOURCE_CAPTURED", "transaction:commit"]);
      expect(events).not.toContain("physical:purge");
      expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
      expect(harness.activeTransactions).toBe(0);
    });
  });

  it("snapshots command identity before metadata awaits and every quota transaction", async () => {
    const mutablePrincipal = { ...principal };
    const input = command({ principal: mutablePrincipal });
    await withLifecycle({ afterMetadata: () => { mutablePrincipal.subject = "TEST-OTHER-SUBJECT"; input.tenantCandidate = "01000000-0000-4000-8000-000000000099"; } }, async (harness) => {
      expect((await harness.service.captureForCoordinator(input)).kind).toBe("CAPTURED_FOR_COORDINATOR");
      expect(harness.observedPrincipals.length).toBeGreaterThanOrEqual(5);
      expect(harness.observedPrincipals.every((value) => value.issuer === issuer && value.subject === subject)).toBe(true);
    });
  });

  it("keeps the invocation deadline when metadata takes time", async () => {
    await withLifecycle({ delayMetadataMilliseconds: 5 * 60_000 }, async (harness) => {
      const result = await harness.service.captureForCoordinator(command());
      expect(Date.parse(result.handoff.temporaryPackage.expiresAt)).toBe(now.getTime() + 35 * 60_000);
      // Reservation uses the original invocation deadline, not the later
      // metadata completion time or the completed-copy expiry.
      expect(harness.reservationExpiries.map((value) => value.getTime())).toEqual([now.getTime() + 30 * 60_000]);
    });
  });

  it("denies before reservation or instance I/O if the original deadline elapsed in metadata", async () => {
    await withLifecycle({ delayMetadataMilliseconds: 30 * 60_000 }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState).toBeNull();
      expect(harness.dicomCalls.instances).toBe(0);
      expect(harness.lifecycleEvents).not.toContain("physical:allocate");
    });
  });

  it("revalidates Consent after metadata before reservation/allocation/WADO instances", async () => {
    await withLifecycle({ revokeAfterMetadata: true }, async (harness) => {
      expect(await harness.service.captureForCoordinator(command())).toEqual({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
      expect(harness.payloadState).toBeNull();
      expect(harness.dicomCalls.instances).toBe(0);
    });
  });

  it.each([
    ["reservation SQL", { failReservationSql: true }],
    ["reservation commit rollback", { failReservationCommit: true }],
  ])("does not touch physical storage after %s failure", async (_name, options) => {
    await withLifecycle(options, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState).toBeNull();
      expect(harness.lifecycleEvents).not.toContain("physical:allocate");
      expect(harness.lifecycleEvents).not.toContain("physical:purge");
      expect(harness.dicomCalls.instances).toBe(0);
      expect(auditActions(harness)).toContainEqual({
        action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_CAPTURE_PERSISTENCE_FAILED",
      });
    });
  });

  it.each([
    ["reservation acknowledgement loss", { loseReservationCommitAck: true }, 0],
    ["allocation before handle return", { failAfterAllocation: true }, 0],
    ["quota reserve", { failQuota: true }, null],
    ["completion SQL", { failCompletionSql: true }, 3],
    ["evidence insert", { failEvidenceInsert: true }, 3],
    ["success Audit", { failAuditAction: "PACS_SOURCE_CAPTURED" }, 3],
    ["final commit rollback", { failFinalCommit: true }, 3],
    ["mismatched clocks", { storeClockOffset: 24 * 60 * 60_000 }, 3],
    ["staging expiry before final CAS", { afterSeal: (harness) => { harness.payloadState.expiresAt = new Date(now.getTime() - 1); } }, 3],
  ])("retains the exact ref and purges through the saga after %s failure", async (_name, options, instanceCount) => {
    await withLifecycle(options, async (harness, _store, root) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState.state).toBe("PURGED");
      expect(harness.reservedBytes).toBe(0);
      expect(await readdir(root)).toEqual([]);
      expect(harness.committedEvidence).toHaveLength(0);
      expect(harness.committedAudits.filter((values) => values[7] === "PACS_SOURCE_CAPTURED")).toHaveLength(0);
      expect(harness.committedAudits.filter((values) => values[7] === "PACS_TEMPORARY_OBJECT_PURGED")).toHaveLength(1);
      const events = harness.lifecycleEvents;
      expect(events.indexOf("metadata:purge-pending")).toBeLessThan(events.indexOf("physical:purge"));
      expect(events.indexOf("physical:purge")).toBeLessThan(events.indexOf("metadata:purged"));
      expect(events[events.indexOf("physical:purge") - 1]).toBe("transaction:commit");
      if (instanceCount !== null) expect(harness.dicomCalls.instances).toBe(instanceCount);
      expect(harness.dicomCalls.destinationWrites).toBe(0);
    });
  });

  it("does not release a handoff on lost final commit acknowledgement or re-fetch", async () => {
    await withLifecycle({ loseFinalCommitAck: true }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.committedEvidence).toHaveLength(1); // Commit happened; never pretend rollback.
      expect(harness.payloadState.state).toBe("PURGED");
      expect(harness.reservedBytes).toBe(0);
      expect(harness.dicomCalls.instances).toBe(3);
    });
  });

  it("does not release a handoff if cancellation arrives after completion commit", async () => {
    const abort = new AbortController();
    await withLifecycle({ afterCompletionCommit: () => abort.abort() }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command({ signal: abort.signal }))).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.committedEvidence).toHaveLength(1);
      expect(harness.payloadState.state).toBe("PURGED");
      expect(harness.dicomCalls.instances).toBe(3);
    });
  });

  it("does not release a handoff when completion commit returns after the invocation deadline", async () => {
    let running;
    await withLifecycle({ afterCompletionCommit: () => { running.captureTime = new Date(now.getTime() + 30 * 60_000); } }, async (harness) => {
      running = harness;
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.committedEvidence).toHaveLength(1);
      expect(harness.payloadState.state).toBe("PURGED");
      expect(harness.dicomCalls.instances).toBe(3);
      expect(harness.committedAudits.some((values) => values[9] === "SOURCE_CAPTURE_DEADLINE")).toBe(true);
    });
  });

  it.each([
    ["purge admission", { failPurgeAdmission: true }, "STAGING", false],
    ["physical purge", { failPurgePhysical: true }, "PURGE_PENDING", false],
    ["purge Audit", { failAuditAction: "PACS_TEMPORARY_OBJECT_PURGED" }, "PURGE_PENDING", true],
  ])("retains exact recovery metadata and quota after %s failure", async (_label, options, state, physicallyAbsent) => {
    await withLifecycle({ ...options, failCompletionSql: true }, async (harness, _store, root) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState.state).toBe(state);
      expect(harness.reservedBytes).toBe(12);
      expect((await readdir(root)).length === 0).toBe(physicallyAbsent);
      expect(harness.committedEvidence).toHaveLength(0);
      expect(harness.committedAudits.some((values) => values[7] === "PACS_TEMPORARY_OBJECT_PURGED")).toBe(false);
    });
  });

  it("denies changed registry actor before quota use, without elevating cleanup identity", async () => {
    await withLifecycle({ changeIdentityAfterReservation: true }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.lifecycleEvents).not.toContain("quota:reserve");
      expect(harness.lifecycleEvents).not.toContain("physical:write");
      expect(harness.payloadState.state).toBe("PURGED");
      expect(harness.reservedBytes).toBe(0);
    });
  });

  it("retains recovery metadata if registry identity disappears after reservation", async () => {
    await withLifecycle({ denyIdentityAfterReservation: true }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState.state).toBe("STAGING");
      expect(harness.lifecycleEvents).not.toContain("quota:reserve");
      expect(harness.lifecycleEvents).not.toContain("physical:purge");
      expect(harness.committedAudits.some((values) => values[7] === "PACS_TEMPORARY_OBJECT_PURGED")).toBe(false);
    });
  });

  it("does not delete a different winning ref when a reservation loses", async () => {
    const winner = { state: "AVAILABLE", storageRef: "07000000-0000-4000-8000-000000000099", expiresAt: new Date(now.getTime() + 600_000) };
    await withLifecycle({ existingPayload: winner }, async (harness) => {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
      expect(harness.payloadState).toEqual(winner);
      expect(harness.lifecycleEvents).not.toContain("physical:allocate");
      expect(harness.lifecycleEvents).not.toContain("physical:purge");
      expect(harness.dicomCalls.instances).toBe(0);
    });
  });

  it.each([null, { beginPackage: vi.fn(), purgePackage: vi.fn() }])("fails closed for a malformed lifecycle seam before I/O (%s)", async (store) => {
    const harness = makeHarness({ temporaryImagingStore: store });
    await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({ message: "SOURCE_CAPTURE_UNAVAILABLE" });
    expect(harness.authorizationCalls).toBe(0);
    expect(harness.dicomCalls).toMatchObject({ metadata: 0, instances: 0, destinationWrites: 0 });
  });
});

function expectSourceCaptureAuditMetadata(harness, expectedEvents) {
  const records = harness.committedAudits.map((values) => ({
    auditEventId: values[0],
    occurredAt: values[1],
    actorId: values[2],
    tenantId: values[3],
    exchangeSessionId: values[4],
    resourceType: values[5],
    resourceId: values[6],
    action: values[7],
    result: values[8],
    reasonCode: values[9],
    correlationId: values[10],
    createdAt: values[11],
  }));
  const expectedKeys = [
    "action",
    "actorId",
    "auditEventId",
    "correlationId",
    "createdAt",
    "exchangeSessionId",
    "occurredAt",
    "reasonCode",
    "resourceId",
    "resourceType",
    "result",
    "tenantId",
  ];

  expect(records.map(({ action, result, reasonCode }) => ({ action, result, reasonCode })))
    .toEqual(expectedEvents);
  for (const record of records) {
    expect(Object.keys(record).sort()).toEqual(expectedKeys);
    expect(record.auditEventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(record.actorId).toBe(ids.actor);
    expect(record.tenantId).toBe(ids.tenant);
    expect(record.exchangeSessionId).toBe(ids.session);
    expect(record.resourceType).toBe("STUDY");
    expect(record.resourceId).toBe(ids.studyRef);
    expect(record.correlationId).toBe(ids.correlation);
    expect(record.occurredAt).toBeInstanceOf(Date);
    expect(Number.isFinite(record.occurredAt.getTime())).toBe(true);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(Number.isFinite(record.createdAt.getTime())).toBe(true);
    expect(record.createdAt.getTime()).toBe(record.occurredAt.getTime());
  }
  expect(JSON.stringify(records)).not.toMatch(/TEST-PATIENT|2\.25\.|SYNTHETIC-DICOM-BYTES|CREDENTIAL|TOKEN|TEST-ONLY-KEY|errorMessage/i);
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
    expectSourceCaptureAuditMetadata(harness, [
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reasonCode: null },
      { action: "PACS_SOURCE_CAPTURED", result: "SUCCESS", reasonCode: null },
    ]);
    expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
    expect(harness.dicomCalls.hospitalIds.every((hospitalId) => hospitalId === TEST_HOSPITAL_A_ID)).toBe(true);
    expect(harness.authorizationCalls).toBe(2);
    expect(harness.activeTransactions).toBe(0);
    const persistedAudit = JSON.stringify(harness.committedAudits);
    expect(persistedAudit).not.toMatch(/TEST-PATIENT|2\.25\.(100|101|111|112|113)|password|credential/i);
    expect(JSON.stringify(result)).not.toMatch(/TEST-PATIENT|2\.25\./);
    expect(JSON.stringify(result)).not.toMatch(/sha256:/i);
  });

  it("TC-PACS-001-HANDOFF-001/004/006 and DIGEST-003/005/006 emit only committed source byte evidence on the internal path", async () => {
    const harness = makeHarness();
    const result = await harness.service.captureForCoordinator(command());

    expect(result.kind).toBe("CAPTURED_FOR_COORDINATOR");
    if (result.kind !== "CAPTURED_FOR_COORDINATOR") return;
    const { handoff } = result;
    expect(handoff).toMatchObject({
      operationId: ids.operation,
      tenantId: ids.tenant,
      actorId: ids.actor,
      exchangeSessionId: ids.session,
      packageId: ids.package,
      studyRefId: ids.studyRef,
      studyInstanceUid: "2.25.100",
      sourceHospitalId: TEST_HOSPITAL_A_ID,
      destinationHospitalId: TEST_HOSPITAL_B_ID,
      sourceEvidence: {
        evidenceId: harness.committedEvidence[0]?.integrity_id,
        status: "PENDING",
        algorithm: "SHA256-MANIFEST-V1",
        objectCount: 3,
        totalBytes: 12,
      },
      expectedInstances: [
        ...instanceFixture.map(({ sopInstanceUid, bytes }) => ({
          seriesInstanceUid: "2.25.101",
          sopInstanceUid,
          byteLength: bytes.byteLength,
          sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        })),
      ],
    });
    expect(handoff.sourceEvidence.aggregateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(harness.committedEvidence[0]?.source_digest).toBe(handoff.sourceEvidence.aggregateDigest);
    expect(harness.dicomCalls.instanceIdentities).toEqual(
      handoff.expectedInstances.map(({ seriesInstanceUid, sopInstanceUid }) => ({
        seriesInstanceUid,
        sopInstanceUid,
      })),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff.sourceEvidence)).toBe(true);
    expect(Object.isFrozen(handoff.expectedInstances)).toBe(true);
    expect(handoff.expectedInstances.every(Object.isFrozen)).toBe(true);
    expect(handoff.expectedInstances.reduce((sum, instance) => sum + instance.byteLength, 0)).toBe(
      handoff.sourceEvidence.totalBytes,
    );
    expect(JSON.stringify(handoff)).not.toMatch(/TEST-PATIENT|LOCAL-PATIENT|patientId|localPatientId|password|credential/i);
    expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
    expect(harness.operationState).toBe("CREATED");
    expect(harness.activeTransactions).toBe(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURED", result: "SUCCESS", reason: null },
    ]);
  });

  it("TC-PACS-001-STAGE-001 stages the exact authorized WADO bytes that produced the source digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediq-authorized-source-spool-"));
    try {
      const storageRoot = join(root, "private-spool");
      const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, now: () => now.getTime() });
      const harness = makeHarness({ temporaryImagingStore: store });
      const result = await harness.service.captureForCoordinator(command());

      expect(result.kind).toBe("CAPTURED_FOR_COORDINATOR");
      if (result.kind !== "CAPTURED_FOR_COORDINATOR") return;
      const { handoff } = result;
      const temporaryPackage = handoff.temporaryPackage;
      expect(temporaryPackage).toMatchObject({
        packageId: ids.package,
        objectCount: instanceFixture.length,
        totalBytes: instanceFixture.reduce((sum, instance) => sum + instance.bytes.byteLength, 0),
      });
      expect(Date.parse(temporaryPackage?.expiresAt ?? "")).not.toBeNaN();
      expect(temporaryPackage?.instances).toHaveLength(instanceFixture.length);

      const binding = {
        tenantId: ids.tenant,
        exchangeSessionId: ids.session,
        packageId: ids.package,
        purpose: "PACS_IMPORT",
      };
      for (const expected of handoff.expectedInstances) {
        const stored = temporaryPackage?.instances.find(
          (instance) => instance.sopInstanceUid === expected.sopInstanceUid,
        );
        const source = instanceFixture.find(
          (instance) => instance.sopInstanceUid === expected.sopInstanceUid,
        );
        expect(stored).toMatchObject({
          seriesInstanceUid: expected.seriesInstanceUid,
          sopInstanceUid: expected.sopInstanceUid,
          byteLength: expected.byteLength,
          sha256: expected.sha256,
        });
        expect(stored).toBeDefined();
        expect(source).toBeDefined();
        await store.consumeInstance({
          storageRef: temporaryPackage.storageRef,
          objectRef: stored.objectRef,
          packageBinding: binding,
          instanceBinding: {
            studyRefId: ids.studyRef,
            seriesInstanceUid: expected.seriesInstanceUid,
            sopInstanceUid: expected.sopInstanceUid,
          },
          expectedByteLength: expected.byteLength,
          expectedSha256: expected.sha256,
        }, async () => "VERIFIED", async (bytes) => {
          // Synthetic capture harness only, not a production access verifier.
          expect(bytes).toEqual(Buffer.from(source.bytes));
        });
      }

      expect(handoff.sourceEvidence.totalBytes).toBe(temporaryPackage.totalBytes);
      expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
      expect(harness.operationState).toBe("CREATED");
      expect(JSON.stringify(handoff)).not.toMatch(/TEST-PATIENT|LOCAL-PATIENT|patientId|localPatientId/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("purges staged ciphertext when operation-time Authorization is revoked after source reads", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediq-authorized-source-spool-deny-"));
    try {
      const storageRoot = join(root, "private-spool");
      const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, now: () => now.getTime() });
      const harness = makeHarness({ temporaryImagingStore: store, revokeAfterStreams: true });

      const result = await harness.service.captureForCoordinator(command());
      expect(result).toEqual({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
      expect(await readdir(storageRoot)).toEqual([]);
      expect(harness.committedEvidence).toHaveLength(0);
      expect(harness.operationState).toBe("CREATED");
      expect(harness.dicomCalls.destinationWrites).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("TC-PACS-001-HANDOFF-002 and DIGEST-004/006 reject caller-provided inventory or authority bindings before I/O", async () => {
    const harness = makeHarness();
    for (const override of [
      { expectedInstances: [{ seriesInstanceUid: "2.25.101", sopInstanceUid: "2.25.111" }] },
      { patientId: "TEST-PATIENT-007" },
      { sourceHospitalId: TEST_HOSPITAL_A_ID },
      { destinationHospitalId: TEST_HOSPITAL_B_ID },
      { aggregateDigest: `sha256:${"a".repeat(64)}` },
      { mappingId: ids.mapping },
      { authorizationEvidence: true },
      { endpointUrl: "https://caller.invalid/dicom-web/" },
      { password: "caller-controlled" },
    ]) {
      await expect(harness.service.captureForCoordinator(command(override))).rejects.toMatchObject({
        message: "SOURCE_CAPTURE_REQUEST_INVALID",
      });
    }
    expect(harness.authorizationCalls).toBe(0);
    expect(harness.dicomCalls).toMatchObject({ metadata: 0, instances: 0, destinationWrites: 0 });
    expect(harness.committedEvidence).toHaveLength(0);
  });

  it.each([
    { name: "withdrawn Consent", options: { consentStatus: "WITHDRAWN" }, mode: "denied", expectedState: "CREATED" },
    { name: "revoked Grant", options: { authorizationInitial: { grantStatus: "REVOKED" } }, mode: "denied", expectedState: "CREATED" },
    { name: "Consent withdrawn during source reads", options: { revokeAfterStreams: true }, mode: "denied", expectedState: "CREATED" },
    { name: "invalid destination PatientMapping", options: { mapping: null }, mode: "denied", expectedState: "CREATED" },
    { name: "source PatientID mismatch", options: { metadataPatientId: "TEST-PATIENT-OTHER" }, mode: "denied", expectedState: "CREATED" },
    { name: "malformed source metadata", options: { metadataShape: "DUPLICATE_SOP" }, mode: "denied", expectedState: "CREATED" },
    {
      name: "source stream/hash failure",
      options: { instanceStreamFactory: async () => { throw new Error("synthetic source read failure"); } },
      mode: "unavailable",
    },
    { name: "changed mapping after WADO", options: { changeMappingAfterStreams: true }, mode: "denied", expectedState: "CREATED" },
    { name: "changed operation after WADO", options: { changeOperationAfterStreams: true }, mode: "denied", expectedState: "FAILED" },
    { name: "evidence persistence failure", options: { failEvidenceInsert: true }, mode: "unavailable", expectRollback: true },
    { name: "success Audit failure", options: { failAuditAction: "PACS_SOURCE_CAPTURED" }, mode: "unavailable", expectRollback: true },
    { name: "final transaction commit failure", options: { failFinalCommit: true }, mode: "unavailable", expectRollback: true },
  ])("TC-PACS-001-HANDOFF-003/007 and DIGEST-004 return no partial evidence for $name", async ({ options, mode, expectedState = "CREATED", expectRollback = false }) => {
    const harness = makeHarness(options);
    if (mode === "denied") {
      const result = await harness.service.captureForCoordinator(command());
      expect(result.kind).toBe("DENIED");
    } else {
      await expect(harness.service.captureForCoordinator(command())).rejects.toMatchObject({
        message: "SOURCE_CAPTURE_UNAVAILABLE",
      });
    }
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).not.toContainEqual({
      action: "PACS_SOURCE_CAPTURED",
      result: "SUCCESS",
      reason: null,
    });
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.operationState).toBe(expectedState);
    expect(harness.activeTransactions).toBe(0);
    if (expectRollback) {
      expect(harness.rollbackReasons.length).toBeGreaterThan(0);
    }
  });

  it("TC-PACS-001-HANDOFF-005 keeps the handoff retrieval-only, internal and non-transitioning", async () => {
    const harness = makeHarness();
    const result = await harness.service.captureForCoordinator(command());
    expect(result.kind).toBe("CAPTURED_FOR_COORDINATOR");
    expect(harness.dicomCalls.destinationWrites).toBe(0);
    expect(harness.operationState).toBe("CREATED");
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PacsImportModule) ?? []).toEqual([]);
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
    expectSourceCaptureAuditMetadata(harness, [
      { action: "PACS_SOURCE_CAPTURE_DENIED", result: "DENY", reasonCode: "AUTHORIZATION_DENIED" },
    ]);
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
    expectSourceCaptureAuditMetadata(harness, [
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reasonCode: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reasonCode: "SOURCE_READ_FAILED" },
    ]);
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

  it("TC-INT-001-CAP-012 start Audit failure returns fixed unavailable and prevents all WADO", async () => {
    const harness = makeHarness({ failAuditAction: "PACS_SOURCE_CAPTURE_STARTED" });
    await expect(harness.service.capture(command())).rejects.toMatchObject({
      message: "SOURCE_CAPTURE_UNAVAILABLE",
    });

    expect(harness.dicomCalls).toMatchObject({ metadata: 0, instances: 0, destinationWrites: 0 });
    expect(harness.committedAudits).toHaveLength(0);
    expect(harness.committedEvidence).toHaveLength(0);
    expect(harness.operationState).toBe("CREATED");
  });

  it("TC-INT-001-CAP-012 evidence INSERT failure leaves no evidence or success Audit", async () => {
    const harness = makeHarness({ failEvidenceInsert: true });
    await expect(harness.service.capture(command())).rejects.toMatchObject({
      message: "SOURCE_CAPTURE_UNAVAILABLE",
    });

    expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
    expect(harness.committedEvidence).toHaveLength(0);
    expect(auditActions(harness)).toEqual([
      { action: "PACS_SOURCE_CAPTURE_STARTED", result: "ALLOW", reason: null },
      { action: "PACS_SOURCE_CAPTURE_FAILED", result: "FAILURE", reason: "SOURCE_CAPTURE_PERSISTENCE_FAILED" },
    ]);
    expect(harness.operationState).toBe("CREATED");
    expect(harness.rollbackReasons.length).toBeGreaterThan(0);
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
    expect(harness.dicomCalls).toMatchObject({ metadata: 1, instances: 3, destinationWrites: 0 });
    expect(harness.operationState).toBe("CREATED");
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
