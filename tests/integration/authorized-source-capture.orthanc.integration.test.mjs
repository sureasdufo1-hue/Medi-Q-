import assert from "node:assert/strict";
import { assertRuntimePrivilegeCatalog } from "../fixtures/runtime-privilege-contract.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, readdir, rm, stat, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { temporaryCaptureLifecycleCases, allSourceLifecycleCases, privacyAssert, assertPublicCaptureProjection,
  assertPublicCaptureError } from "../fixtures/temporary-capture-lifecycle-fixture.mjs";
import { sourceMutationCases } from "../fixtures/source-capture-mutation-fixture.mjs";
import { coordinatorFaultCases } from "../fixtures/pacs-coordinator-fault-fixture.mjs";
import { RemoteJwksOidcTokenVerifier } from "../../services/api/dist/authentication/oidc-jwt.verifier.js";
import { EphemeralEncryptedTemporaryImagingStore } from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";
import { TemporaryPayloadPurgeCoordinator } from "../../services/api/dist/imaging-storage/application/temporary-payload-purge.coordinator.js";
import { PostgresTemporaryPayloadMetadataRepository } from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";
import { ConsentWithdrawalService } from "../../services/api/dist/consent/application/consent-withdrawal.service.js";
import { test } from "node:test";
import {
  safeDatabaseErrorClass,
  safeQueryDurationBucket,
} from "./safe-database-diagnostics.mjs";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PostgresSourceCaptureScopeRepository } from "../../services/api/dist/integrity/persistence/postgres-source-capture-scope.repository.js";
import {
  AuthorizationGatedOperationExecutor,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { parseAppConfig } from "../../services/api/dist/config/app-config.js";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
  TestOrthancEndpointResolver,
} from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";
import { RuntimeDatabaseService } from "../../services/api/dist/database/runtime-database.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { GrantRevocationService } from "../../services/api/dist/grant/application/grant-revocation.service.js";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import { PostgresProvenanceRepository } from "../../services/api/dist/provenance/persistence/postgres-provenance.repository.js";
import { DispatchedInstanceStreamFactory } from "../../services/api/dist/pacs/application/dispatched-instance-stream.factory.js";
import { PacsImportOperationAdmissionService } from "../../services/api/dist/pacs/application/pacs-import-operation-admission.service.js";
import { PacsImportSourcePreparationCoordinator } from "../../services/api/dist/pacs/application/pacs-import-source-preparation.coordinator.js";
import { PacsImportTransferDispatchCoordinator } from "../../services/api/dist/pacs/application/pacs-import-transfer-dispatch.coordinator.js";
import { pacsTransferOperationDigest } from "../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js";
import { dispatchedReadCases, dispatchedReadIds, dispatchedReadDigest } from "../fixtures/dispatched-source-read-fixture.mjs";
import { destinationVerificationCases, destinationFixtureKinds } from "../fixtures/destination-verification-fixture.mjs";
import {
  AuthorizedSourceCaptureService,
  AuthorizedSourceCaptureInvalidRequestError,
  AuthorizedSourceCaptureUnavailableError,
} from "../../services/api/dist/integrity/application/authorized-source-capture.service.js";

const manifestPath = process.env.MEDIQ_DICOM_TEST_MANIFEST;
assert.ok(manifestPath, "Synthetic Test Orthanc manifest is required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function expectedSourceManifestDigest(sourceManifest) {
  const instances = [...sourceManifest.instances].sort((left, right) =>
    left.sopInstanceUID < right.sopInstanceUID
      ? -1
      : left.sopInstanceUID > right.sopInstanceUID
        ? 1
        : 0,
  );
  const hash = createHash("sha256");
  hash.update(Buffer.from("MEDIQ-DICOM-MANIFEST\0V1\0", "ascii"));
  const count = Buffer.alloc(4);
  count.writeUInt32BE(instances.length);
  hash.update(count);
  for (const instance of instances) {
    const uid = Buffer.from(instance.sopInstanceUID, "ascii");
    const uidLength = Buffer.alloc(4);
    uidLength.writeUInt32BE(uid.byteLength);
    hash.update(uidLength);
    hash.update(uid);
    const byteLength = Buffer.alloc(8);
    byteLength.writeBigUInt64BE(BigInt(instance.sizeBytes));
    hash.update(byteLength);
    const digest = Buffer.from(instance.sha256, "hex");
    assert.equal(digest.byteLength, 32, "CAP007_FIXTURE_INSTANCE_DIGEST_LENGTH");
    hash.update(digest);
  }
  return `sha256:${hash.digest("hex")}`;
}

const fixture = Object.freeze({
  otherTenantId: "02000000-0000-4000-8000-000000000001",
  tenantId: "02000000-0000-4000-8000-000000000002",
  otherTenantActorId: "0a000000-0000-4000-8000-000000000002",
  otherTenantSubject: "synthetic-int001-cross-tenant-actor",
  actorId: "0a000000-0000-4000-8000-000000000001",
  subject: "synthetic-int001-source-capture-actor",
  patientRefId: "15000000-0000-4000-8000-000000000001",
  mappingId: "15000000-0000-4000-8000-000000000002",
  sessionId: "16000000-0000-4000-8000-000000000001",
  sessionInFlightRevocationId: "16000000-0000-4000-8000-000000000021",
  packageId: "17000000-0000-4000-8000-000000000001",
  studyRefId: "18000000-0000-4000-8000-000000000001",
  studyMissingCountId: "18000000-0000-4000-8000-000000000013",
  consentId: "19000000-0000-4000-8000-000000000001",
  consentInFlightRevocationId: "19000000-0000-4000-8000-000000000031",
  grantId: "1a000000-0000-4000-8000-000000000001",
  grantInFlightRevocationId: "1a000000-0000-4000-8000-000000000031",
  operationId: "1b000000-0000-4000-8000-000000000001",
  operationBindingMismatchId: "1b000000-0000-4000-8000-000000000011",
  operationSourceMismatchId: "1b000000-0000-4000-8000-000000000012",
  operationNotCreatedId: "1b000000-0000-4000-8000-000000000013",
  operationMissingCountId: "1b000000-0000-4000-8000-000000000014",
  operationInFlightRevocationId: "1b000000-0000-4000-8000-000000000015",
  cap012StartOperationId: "1b000000-0000-4000-8000-000000000021",
  cap012EvidenceOperationId: "1b000000-0000-4000-8000-000000000022",
  cap012SuccessAuditOperationId: "1b000000-0000-4000-8000-000000000023",
  correlationDenied: "1d000000-0000-4000-8000-000000000001",
  correlationFailure: "1d000000-0000-4000-8000-000000000002",
  correlationSuccess: "1d000000-0000-4000-8000-000000000003",
  correlationMissingConsent: "1d000000-0000-4000-8000-000000000004",
  correlationWithdrawnConsent: "1d000000-0000-4000-8000-000000000005",
  correlationExpiredConsent: "1d000000-0000-4000-8000-000000000006",
  correlationRevokedGrant: "1d000000-0000-4000-8000-000000000007",
  correlationExpiredGrant: "1d000000-0000-4000-8000-000000000008",
  correlationWrongScope: "1d000000-0000-4000-8000-000000000009",
  correlationCrossTenant: "1d000000-0000-4000-8000-000000000010",
  correlationUnavailable: "1d000000-0000-4000-8000-000000000011",
  correlationBindingMismatch: "1d000000-0000-4000-8000-000000000012",
  correlationSourceMismatch: "1d000000-0000-4000-8000-000000000013",
  correlationNotCreated: "1d000000-0000-4000-8000-000000000014",
  correlationFixtureStateTransition: "1d000000-0000-4000-8000-000000000015",
  correlationMissingCount: "1d000000-0000-4000-8000-000000000016",
  correlationMetadataEmpty: "1d000000-0000-4000-8000-000000000017",
  correlationMetadataCountMismatch: "1d000000-0000-4000-8000-000000000018",
  correlationMetadataSeriesMismatch: "1d000000-0000-4000-8000-000000000019",
  correlationMetadataWrongStudy: "1d000000-0000-4000-8000-000000000020",
  correlationMetadataDuplicate: "1d000000-0000-4000-8000-000000000021",
  correlationMetadataMalformed: "1d000000-0000-4000-8000-000000000022",
  correlationMetadataMissingTag: "1d000000-0000-4000-8000-000000000023",
  correlationMetadataOverLimit: "1d000000-0000-4000-8000-000000000024",
  correlationMetadataUnavailable: "1d000000-0000-4000-8000-000000000025",
  correlationPatientIdMismatch: "1d000000-0000-4000-8000-000000000026",
  correlationInFlightRevocation: "1d000000-0000-4000-8000-000000000027",
  correlationGrantRevocation: "1d000000-0000-4000-8000-000000000028",
  cap012StartCorrelation: "1d000000-0000-4000-8000-000000000029",
  cap012EvidenceCorrelation: "1d000000-0000-4000-8000-000000000030",
  cap012SuccessAuditCorrelation: "1d000000-0000-4000-8000-000000000031",
  coordinatorSessionId: "16000000-0000-4000-8000-000000000051",
  coordinatorPackageId: "17000000-0000-4000-8000-000000000051",
  coordinatorStudyRefId: "18000000-0000-4000-8000-000000000051",
  coordinatorConsentId: "19000000-0000-4000-8000-000000000051",
  coordinatorGrantId: "1a000000-0000-4000-8000-000000000051",
  coordinatorOperationId: "1b000000-0000-4000-8000-000000000051",
  coordinatorIdempotencyKey: "1b000000-0000-4000-8000-000000000052",
  coordinatorCorrelationId: "1d000000-0000-4000-8000-000000000051",
  transferDispatchSessionId: "16000000-0000-4000-8000-000000000075",
  transferDispatchPackageId: "17000000-0000-4000-8000-000000000075",
  transferDispatchStudyRefId: "18000000-0000-4000-8000-000000000075",
  transferDispatchConsentId: "19000000-0000-4000-8000-000000000075",
  transferDispatchGrantId: "1a000000-0000-4000-8000-000000000075",
  transferDispatchOperationId: "1b000000-0000-4000-8000-000000000075",
  transferDispatchIdempotencyKey: "1b000000-0000-4000-8000-000000000076",
  transferDispatchCorrelationId: "1d000000-0000-4000-8000-000000000090",
  studyOtherRefId: "18000000-0000-4000-8000-000000000011",
  coordinatorDenyMalformedCorrelationId: "1d000000-0000-4000-8000-000000000052",
  coordinatorDenyMissingGrantCorrelationId: "1d000000-0000-4000-8000-000000000053",
  coordinatorDenyRevokedGrantCorrelationId: "1d000000-0000-4000-8000-000000000054",
  coordinatorDenyExpiredGrantCorrelationId: "1d000000-0000-4000-8000-000000000055",
  coordinatorDenyWithdrawnConsentCorrelationId: "1d000000-0000-4000-8000-000000000056",
  coordinatorDenyWrongScopeCorrelationId: "1d000000-0000-4000-8000-000000000057",
  coordinatorDenyCrossSessionCorrelationId: "1d000000-0000-4000-8000-000000000058",
  coordinatorDenyCrossTenantCorrelationId: "1d000000-0000-4000-8000-000000000059",
  coordinatorDenyForeignStudyCorrelationId: "1d000000-0000-4000-8000-000000000060",
  coordinatorMappingSessionId: "16000000-0000-4000-8000-000000000052",
  coordinatorMappingStudyRefId: "18000000-0000-4000-8000-000000000052",
  coordinatorMappingGrantId: "1a000000-0000-4000-8000-000000000052",
  coordinatorMappingOperationId: "1b000000-0000-4000-8000-000000000080",
  coordinatorMappingIdempotencyKey: "1b000000-0000-4000-8000-000000000083",
  coordinatorMappingCorrelationId: "1d000000-0000-4000-8000-000000000061",
  coordinatorPatientIdSessionId: "16000000-0000-4000-8000-000000000053",
  coordinatorPatientIdStudyRefId: "18000000-0000-4000-8000-000000000053",
  coordinatorPatientIdGrantId: "1a000000-0000-4000-8000-000000000053",
  coordinatorPatientIdOperationId: "1b000000-0000-4000-8000-000000000081",
  coordinatorPatientIdIdempotencyKey: "1b000000-0000-4000-8000-000000000084",
  coordinatorPatientIdCorrelationId: "1d000000-0000-4000-8000-000000000062",
  coordinatorMetadataSessionId: "16000000-0000-4000-8000-000000000054",
  coordinatorMetadataStudyRefId: "18000000-0000-4000-8000-000000000054",
  coordinatorMetadataGrantId: "1a000000-0000-4000-8000-000000000054",
  coordinatorMetadataOperationId: "1b000000-0000-4000-8000-000000000082",
  coordinatorMetadataIdempotencyKey: "1b000000-0000-4000-8000-000000000085",
  coordinatorMetadataCorrelationId: "1d000000-0000-4000-8000-000000000063",
  withdrawnConsentId: "19000000-0000-4000-8000-000000000011",
  expiredConsentId: "19000000-0000-4000-8000-000000000012",
  revokedGrantId: "1a000000-0000-4000-8000-000000000011",
  expiredGrantId: "1a000000-0000-4000-8000-000000000012",
  wrongScopeGrantId: "1a000000-0000-4000-8000-000000000013",
  withdrawnConsentGrantId: "1a000000-0000-4000-8000-000000000014",
  expiredConsentGrantId: "1a000000-0000-4000-8000-000000000015",
  issuer: "https://synthetic-issuer.test",
});
const cap012Scenarios = Object.freeze([
  Object.freeze({
    name: "start Audit INSERT failure prevents all source WADO",
    operationId: fixture.cap012StartOperationId,
    correlationId: fixture.cap012StartCorrelation,
    consentId: "19000000-0000-4000-8000-000000000041",
    grantId: "1a000000-0000-4000-8000-000000000041",
    failingQuery: "AUDIT_INSERT_SQLSTATE_P0001_",
    expectedSourceRequests: [],
    expectedInstanceCount: 0,
  }),
  Object.freeze({
    name: "pending-evidence INSERT failure rolls back after consuming A streams",
    operationId: fixture.cap012EvidenceOperationId,
    correlationId: fixture.cap012EvidenceCorrelation,
    consentId: "19000000-0000-4000-8000-000000000042",
    grantId: "1a000000-0000-4000-8000-000000000042",
    failingQuery: "EVIDENCE_INSERT_SQLSTATE_P0001_",
    expectedSourceRequests: ["METADATA", "INSTANCE", "INSTANCE", "INSTANCE"],
    expectedInstanceCount: manifest.instanceCount,
  }),
  Object.freeze({
    name: "success Audit INSERT failure rolls back the pending-evidence INSERT",
    operationId: fixture.cap012SuccessAuditOperationId,
    correlationId: fixture.cap012SuccessAuditCorrelation,
    consentId: "19000000-0000-4000-8000-000000000043",
    grantId: "1a000000-0000-4000-8000-000000000043",
    failingQuery: "AUDIT_INSERT_SQLSTATE_P0001_",
    expectedSourceRequests: ["METADATA", "INSTANCE", "INSTANCE", "INSTANCE"],
    expectedInstanceCount: manifest.instanceCount,
  }),
]);
const principal = Object.freeze({
  issuer: fixture.issuer,
  subject: fixture.subject,
});
const otherTenantPrincipal = Object.freeze({
  issuer: fixture.issuer,
  subject: fixture.otherTenantSubject,
});

async function applyMetadataFault(response, fault) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  if (fault === "MALFORMED_JSON") {
    return new Response("{malformed synthetic DICOM JSON", {
      status: response.status,
      headers,
    });
  }
  if (fault === "MISSING_RESPONSE") {
    return new Response("synthetic upstream unavailable", {
      status: 503,
      headers,
    });
  }

  const rows = await response.json();
  switch (fault) {
    case "EMPTY":
      return new Response("[]", { status: response.status, headers });
    case "COUNT_MISMATCH":
      rows.pop();
      break;
    case "SERIES_COUNT_MISMATCH":
      rows[0]["0020000E"].Value = ["2.25.902"];
      break;
    case "WRONG_STUDY":
      rows[0]["0020000D"].Value = ["2.25.903"];
      break;
    case "DUPLICATE_SOP":
      rows.push(structuredClone(rows[0]));
      break;
    case "MISSING_REQUIRED_TAG":
      delete rows[0]["00080016"];
      break;
    case "PATIENT_ID_MISMATCH":
      rows[0]["00100020"].Value = ["TEST-PATIENT-OTHER"];
      break;
    case "OVER_LIMIT": {
      const row = structuredClone(rows[0]);
      while (rows.length <= 2_000) rows.push(structuredClone(row));
      break;
    }
    default:
      throw new Error("INT001_TEST_METADATA_FAULT_UNKNOWN");
  }
  return new Response(JSON.stringify(rows), { status: response.status, headers });
}

function partialDicomThenFail(response) {
  const outerContentType = response.headers.get("content-type") ?? "";
  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(outerContentType);
  assert.ok(boundaryMatch, "The synthetic A WADO response must contain a multipart boundary");
  const boundary = (boundaryMatch[1] ?? boundaryMatch[2]).trim();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const partHeader = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=1.2.840.10008.1.2.1\r\nContent-Length: 4096\r\n\r\n`,
  );
  const firstChunk = new Uint8Array(partHeader.byteLength + 4);
  firstChunk.set(partHeader);
  firstChunk.set([0x44, 0x49, 0x43, 0x4d], partHeader.byteLength);
  let emittedPartialBody = false;
  const body = new ReadableStream({
    pull(controller) {
      if (!emittedPartialBody) {
        emittedPartialBody = true;
        controller.enqueue(firstChunk);
        return;
      }
      controller.error(new Error("SYNTHETIC_WADO_STREAM_FAILURE"));
    },
  }, { highWaterMark: 0 });
  return new Response(body, { status: response.status, headers });
}

function createTransactionObservation() {
  const context = new AsyncLocalStorage();
  const active = new Set();
  return Object.freeze({
    async run(work) {
      const frame = { phase: 'BEFORE_BEGIN', parent: context.getStore() };
      active.add(frame);
      return context.run(frame, async () => {
        try { return await work(); }
        finally { active.delete(frame); }
      });
    },
    query(statement) {
      const frame = context.getStore();
      const pending = { BEGIN: 'BEGIN_PENDING', COMMIT: 'COMMIT_PENDING', ROLLBACK: 'ROLLBACK_PENDING' }[statement];
      if (!active.has(frame) || !pending) return () => undefined;
      frame.phase = pending;
      let settled = false;
      return succeeded => {
        if (settled) return;
        settled = true;
        frame.phase = !succeeded ? 'UNKNOWN' : statement === 'BEGIN' ? 'OPEN' : 'CLOSED';
      };
    },
    snapshot() {
      const own = context.getStore();
      const otherPhases = [...new Set([...active].filter(frame => frame !== own).map(frame => frame.phase))];
      return Object.freeze({ own: active.has(own) ? own.phase : 'NONE',
        other: otherPhases.length > 1 ? 'MULTIPLE' : otherPhases[0] ?? 'NONE' });
    },
    assertOutside() {
      // Check at the caller/effect boundary, not only in a stream's pull.
      // A completed inner run must not hide an active owning outer run.
      for (let frame = context.getStore(); frame; frame = frame.parent) {
        if (active.has(frame)) assert.fail('DEC017_IO_WITHIN_OWN_TRANSACTION');
      }
    },
  });
}

function observeStreamReads(stream, assertOutsideTransaction) {
  const getReader = stream.getReader.bind(stream);
  Object.defineProperty(stream, 'getReader', { value: (...options) => {
    const reader = getReader(...options);
    return new Proxy(reader, { get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'read') return async (...args) => {
        assertOutsideTransaction();
        return Reflect.apply(value, target, args);
      };
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  } });
  return stream;
}

async function startUnrelatedReadOnlyTransaction(harness, principal, tenantCandidate, signal) {
  if (signal?.aborted) throw new Error('DEC017_OVERLAP_ABORTED');
  let releaseHold, ready;
  const released = new Promise(resolve => { releaseHold = resolve; });
  const reached = new Promise(resolve => { ready = resolve; });
  const onAbort = () => releaseHold();
  signal?.addEventListener('abort', onAbort, { once: true });
  const held = harness.actorContext.run(principal, tenantCandidate, async (_identity, client) => {
    await client.query('SET TRANSACTION READ ONLY');
    const row = (await client.query("SELECT pg_backend_pid() AS pid, current_user AS role, current_setting('transaction_read_only') AS readonly")).rows[0];
    assert.equal(row.role, 'mediq_runtime'); assert.equal(row.readonly, 'on');
    ready(row.pid);
    if (signal?.aborted) releaseHold();
    await released;
    if (signal?.aborted) throw new Error('DEC017_OVERLAP_ABORTED');
  });
  // Attach a rejection handler immediately; setup still awaits the same result.
  void held.catch(() => undefined);
  let observer, closePromise;
  const counts = { SOURCE: 0, WRITE: 0, SYNC: 0, CONSUMER: 0, PURGE: 0 };
  try {
    const pid = await Promise.race([reached, held.then(() => { throw new Error('DEC017_OVERLAP_NOT_HELD'); })]);
    observer = await harness.database.connect();
    const activity = async () => {
      const result = await observer.query(`SELECT current_user AS observer_role, pg_backend_pid() AS observer_pid,
        pid,state,xact_start FROM pg_stat_activity WHERE pid=$1 AND usename=current_user`, [pid]);
      assert.equal(result.rowCount, 1); const row = result.rows[0];
      assert.equal(row.observer_role, 'mediq_runtime'); assert.notEqual(row.observer_pid, pid);
      assert.equal(row.pid, pid); return row;
    };
    return Object.freeze({
      async assertHeld(stage) {
        harness.assertOutsideTransaction();
        assert.ok(Object.hasOwn(counts, stage));
        const row = await activity();
        assert.equal(row.state, 'idle in transaction', 'DEC017_REAL_OTHER_TRANSACTION_OPEN');
        assert.ok(row.xact_start instanceof Date, 'DEC017_REAL_OTHER_TRANSACTION_STARTED');
        counts[stage]++;
      },
      counts: () => ({ ...counts }),
      close() {
        if (closePromise) return closePromise;
        closePromise = (async () => {
          releaseHold();
          try {
            await held;
            const row = await activity();
            assert.equal(row.state, 'idle'); assert.equal(row.xact_start, null);
            const returned = await harness.database.connect();
            try {
              const state = (await returned.query("SELECT pg_backend_pid() AS pid, current_setting('mediq.tenant_id',true) AS tenant, current_setting('transaction_read_only') AS readonly")).rows[0];
              assert.equal(state.pid, pid, 'DEC017_EXACT_RETURNED_HOLDER_CLIENT');
              assert.ok(['', null].includes(state.tenant)); assert.equal(state.readonly, 'off');
            } finally { returned.release(); }
          } catch { throw new Error('DEC017_OVERLAP_CLEANUP_FAILED'); }
          finally { observer.release(); signal?.removeEventListener('abort', onAbort); }
        })();
        return closePromise;
      },
    });
  } catch (error) {
    releaseHold(); await held.catch(() => undefined);
    observer?.release(); signal?.removeEventListener('abort', onAbort);
    throw error;
  }
}

function sourceFailureMarkers(failures) {
  const stages = ['FETCH','METADATA','INSTANCE_OPEN','HTTP_BODY','INSTANCE_BODY','FAILURE_AUDIT'];
  const codes = ['ASSERTION','ABORT','TIMEOUT','NETWORK','GENERIC',
    'SOURCE_READ_FAILED','SOURCE_CAPTURE_CANCELLED','SOURCE_CAPTURE_DEADLINE','SOURCE_CAPTURE_PERSISTENCE_FAILED'];
  if (!Array.isArray(failures)) return [];
  const phases = ['NONE','BEFORE_BEGIN','BEGIN_PENDING','OPEN','COMMIT_PENDING','ROLLBACK_PENDING','CLOSED','UNKNOWN','MULTIPLE'];
  return [...new Set(failures.slice(0, 16).filter(item => item && stages.includes(item.stage) &&
    codes.includes(item.code) && typeof item.transactionActive === 'boolean')
    .flatMap(item => [
      `DEC017_STAGE_${item.stage}_${item.code}_TX_${item.transactionActive ? 'ACTIVE' : 'CLOSED'}`,
      ...(phases.includes(item.transactionContext?.own) && phases.includes(item.transactionContext?.other)
        ? [`DEC017_CONTEXT_${item.stage}_OWN_${item.transactionContext.own}_OTHER_${item.transactionContext.other}`] : []),
    ]))].slice(0, 8);
}

function createHarness({
  failFirstInstance = false,
  databaseUrl,
  metadataFault,
  observeInstanceStreams = false,
  revokeGrantAfterInstanceBytes = false,
  oidcAuthentication,
  temporaryImagingStore,
  afterMetadata,
  beforeSourceRequest,
  dispatchReadCommitAckLoss = false,
  destinationVerification = false,
  destinationCommitAckLoss = false,
  allowStudyStow = false,
  beforeStow,
  afterDestinationBytes,
} = {}) {
  const parsedConfig = parseAppConfig(process.env);
  const config = Object.freeze({ ...parsedConfig,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(oidcAuthentication ? { oidcAuthentication } : {}),
  });
  const database = new RuntimeDatabaseService(config);
  let quotaReservations = 0;
  let dispatchClaimQueries = 0, dispatchClaimMatches = 0, lostCommitAcknowledgements = 0;
  const databaseFailures = [];
  const sourceFailures = [];
  const transactionObservation = createTransactionObservation();
  const assertOutsideTransaction = transactionObservation.assertOutside;
  const recordSourceFailure = (stage, error) => {
    const code = error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : error?.name === 'AbortError' ? 'ABORT'
      : error?.name === 'TimeoutError' ? 'TIMEOUT' : ['ECONNRESET','ECONNREFUSED','EPIPE'].includes(error?.code) ? 'NETWORK' : 'GENERIC';
    if (sourceFailures.length < 16) sourceFailures.push({stage,code,transactionActive:activeTenantTransactions > 0,
      transactionContext: transactionObservation.snapshot()});
  };
  const databaseForContext = Object.freeze({
    connect: async () => {
      let client;
      try {
        client = await database.connect();
      } catch (error) {
        databaseFailures.push(`CONNECT_${safeDatabaseErrorClass(error)}`);
        throw error;
      }
      let recordedCaptureStart = false;
      let recordedBeforeDecrypt = false;
      let recordedDestinationAdmission = false;
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") {
            return (...args) => {
              const statement = typeof args[0] === "string" ? args[0] : args[0]?.text ?? "";
              const dispatchSelect = statement.includes("AS dispatch_read_claimed_at");
              const destinationSelect = statement.includes("AS destination_verify_claimed_at");
              if (dispatchSelect) dispatchClaimQueries++;
              if (destinationSelect) destinationClaimQueries++;
              const queryLabel = statement.includes("FROM actors AS a")
                ? "ACTOR_LOOKUP"
                : statement.includes("pg_advisory_xact_lock")
                  ? "SESSION_FENCE"
                    : statement.includes("JOIN consents AS c")
                      ? "AUTHORIZATION_READ"
                      : statement.includes("INSERT INTO integrity_evidence")
                        ? "EVIDENCE_INSERT"
                        : statement.startsWith("UPDATE provenance_records AS pr")
                          ? "PROVENANCE_LINK"
                          : statement.includes("INSERT INTO audit_events")
                            ? "AUDIT_INSERT"
                            : statement.includes("FROM pacs_transfer_operations AS op")
                              ? "SOURCE_SCOPE"
                        : statement.startsWith("RESET ")
                        ? "TENANT_RESET"
                          : statement === "BEGIN"
                            ? "BEGIN"
                            : statement === "COMMIT"
                              ? "COMMIT"
                              : statement === "ROLLBACK"
                                ? "ROLLBACK"
                            : statement.includes("set_config('mediq.tenant_id'")
                              ? "TENANT_SETUP"
                              : "OTHER_QUERY";
              const queryStartedAt = performance.now();
              const querySettled = transactionObservation.query(statement);
              let queryResult;
              try { queryResult = Reflect.apply(target.query, target, args); }
              catch (error) { querySettled(false); throw error; }
              return queryResult.then((result) => {
                querySettled(true);
                if (dispatchSelect) dispatchClaimMatches += result.rowCount;
                if (destinationSelect) destinationClaimMatches += result.rowCount;
                if (statement === 'BEGIN' || statement === 'ROLLBACK') recordedDestinationAdmission = false;
                if (statement.includes('INSERT INTO audit_events') && args[1]?.[7] === 'PACS_DESTINATION_VERIFY_AUTHORIZED' &&
                  args[1]?.[9] === 'BEFORE_IDENTITY' && result.rowCount === 1) recordedDestinationAdmission = true;
                if (statement === 'COMMIT' && recordedDestinationAdmission && destinationCommitAckLoss && lostCommitAcknowledgements === 0) {
                  recordedDestinationAdmission = false; lostCommitAcknowledgements++;
                  throw new Error('DESTVERIFY_TEST_COMMIT_ACK_LOST');
                }
                if (statement === "BEGIN" || statement === "ROLLBACK") recordedBeforeDecrypt = false;
                if (statement.includes("INSERT INTO audit_events") && args[1]?.[7] === "PACS_TEMPORARY_READ_AUTHORIZED" &&
                  args[1]?.[9] === "BEFORE_DECRYPT" && result.rowCount === 1) recordedBeforeDecrypt = true;
                // Test-only acknowledgement fault AFTER the actual database COMMIT.
                // Never replace query results or grant authority using this hook.
                if (statement === "COMMIT" && recordedBeforeDecrypt && dispatchReadCommitAckLoss && lostCommitAcknowledgements === 0) {
                  recordedBeforeDecrypt = false; lostCommitAcknowledgements++;
                  throw new Error("DISPREAD_COMMIT_ACK_LOST");
                }
                if (statement.includes('INSERT INTO audit_events') && args[1]?.[7] === 'PACS_SOURCE_CAPTURE_FAILED' &&
                    ['SOURCE_READ_FAILED','SOURCE_CAPTURE_CANCELLED','SOURCE_CAPTURE_DEADLINE','SOURCE_CAPTURE_PERSISTENCE_FAILED'].includes(args[1]?.[9]) && sourceFailures.length < 16) {
                  // Statement returned, not proof of commit. Only fixed reason enums.
                  sourceFailures.push({stage:'FAILURE_AUDIT',code:args[1][9],transactionActive:activeTenantTransactions > 0,
                    transactionContext: transactionObservation.snapshot()});
                }
                if (statement.includes("reserve_temporary_payload_quota")) quotaReservations += 1;
                if (statement === "BEGIN" || statement === "ROLLBACK") recordedCaptureStart = false;
                if (statement.includes("INSERT INTO audit_events") && args[1]?.[7] === "PACS_SOURCE_CAPTURE_STARTED" && result.rowCount === 1) {
                  recordedCaptureStart = true;
                }
                if (statement === "COMMIT" && recordedCaptureStart) {
                  initialAuthorizationCommitted = true;
                  recordedCaptureStart = false;
                }
                return result;
              }).catch((error) => {
                querySettled(false);
                const failureClass = safeDatabaseErrorClass(error);
                const durationBucket = safeQueryDurationBucket(performance.now() - queryStartedAt);
                databaseFailures.push(`${queryLabel}_${failureClass}_${durationBucket}`);
                throw error;
              });
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  });
  const rawActorContext = new ActorTenantContextService(
    config,
    databaseForContext,
    new ActorRegistryRepository(),
  );
  let tenantContextRuns = 0;
  let activeTenantTransactions = 0;
  let initialAuthorizationCommitted = false;
  let pendingFailure = failFirstInstance;
  let forbiddenEndpointAttempts = 0;
  let stowCalls = 0;
  let bStowRequests = 0;
  let destinationVerificationCalls = 0;
  let destinationClaimQueries = 0, destinationClaimMatches = 0, destinationByteCalls = 0;
  const destinationObserved = [];
  let metadataCalls = 0;
  let instanceCalls = 0;
  let activeInstanceStreams = 0;
  let maximumActiveInstanceStreams = 0;
  const tenantContextFailures = [];
  const sourceRequests = [];
  const sourcePaths = [];
  const sourceRequestObservations = [];
  const instanceStreamOpenOrder = [];
  const instanceStreamCompletionOrder = [];
  const observedInstanceStreams = [];
  const configuredAAuthorization = `Basic ${Buffer.from(
    `${config.orthancAUsername}:${config.orthancAPassword}`,
    "utf8",
  ).toString("base64")}`;

  const actorContext = Object.freeze({
    run: async (...args) => {
      tenantContextRuns += 1;
      activeTenantTransactions += 1;
      let committed = false;
      try {
        const result = await transactionObservation.run(() => rawActorContext.run(...args));
        committed = true;
        return result;
      } catch (error) {
        const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
          ? error.code
          : typeof error?.message === "string" && /^[A-Z0-9_:-]{1,96}$/.test(error.message)
            ? error.message
            : error instanceof Error && /^[A-Za-z]+$/.test(error.name)
              ? error.name.toUpperCase()
              : "UNKNOWN";
        tenantContextFailures.push(safeCode);
        throw error;
      } finally {
        activeTenantTransactions -= 1;
        // A metadata observer or failed cross-Tenant attempt can also commit.
        // Only the per-client start-Audit + successful COMMIT observer above
        // establishes the initial source-admission checkpoint.
      }
    },
  });
  const grantRevocationService = new GrantRevocationService(actorContext);
  let grantRevocationCompleted = false;
  let grantRevocationStatus = null;

  const adapter = new OrthancDicomwebAdapter(
    new TestOrthancEndpointResolver(config),
    {
      fetch: async (input, init) => {
        const url = input instanceof URL
          ? input
          : new URL(typeof input === "string" ? input : input.url);
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (destinationVerification && url.protocol === 'https:' && url.hostname === 'orthanc-b' && url.port === '8042' &&
          !url.username && !url.password && !url.hash && url.pathname.startsWith('/dicom-web/') && method === 'GET') {
          assertOutsideTransaction();
          assert.equal(init?.redirect,'error','DESTVERIFY_B_REDIRECT');
          const configured = `Basic ${Buffer.from(`${config.orthancBUsername}:${config.orthancBPassword}`).toString('base64')}`;
          assert.equal(new Headers(init.headers).get('authorization'),configured,'DESTVERIFY_B_SERVER_CREDENTIAL');
          return globalThis.fetch(input,init);
        }
        if (allowStudyStow && url.protocol === "https:" && url.hostname === "orthanc-b" && url.port === "8042" &&
          !url.username && !url.password && !url.hash && !url.search &&
          url.pathname === `/dicom-web/studies/${manifest.studyInstanceUID}` && method === "POST") {
          assertOutsideTransaction();
          assert.equal(init?.redirect, "error", "DISPATCH_B_REDIRECT");
          const configured = `Basic ${Buffer.from(`${config.orthancBUsername}:${config.orthancBPassword}`).toString("base64")}`;
          assert.equal(new Headers(init?.headers).get("authorization"), configured, "DISPATCH_B_SERVER_CREDENTIAL");
          await beforeStow?.();
          assertOutsideTransaction();
          bStowRequests += 1;
          return globalThis.fetch(input, init);
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "orthanc-a" ||
          url.port !== "8042" ||
          url.username ||
          url.password
        ) {
          forbiddenEndpointAttempts += 1;
          throw new Error("SOURCE_CAPTURE_TEST_NETWORK_BOUNDARY");
        }
        assert.ok(url.pathname.startsWith("/dicom-web/"));
        assert.equal(url.hash, "");
        assert.equal(url.search, "");
        assert.equal(method, "GET", "The source-capture adapter must not write to A");
        assert.equal(init?.redirect, "error", "Upstream redirects must not change the configured origin");
        const authorization = new Headers(init?.headers).get("authorization");
        assert.ok(authorization === configuredAAuthorization, "The source request must use the configured A Authorization header");
        assertOutsideTransaction();
        assert.equal(initialAuthorizationCommitted, true, "A WADO must follow committed initial authorization");
        if (beforeSourceRequest) await beforeSourceRequest();
        sourceRequestObservations.push(Object.freeze({
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          pathname: url.pathname,
          method,
          redirect: init?.redirect,
          configuredAAuthorization: authorization === configuredAAuthorization,
        }));
        sourceRequests.push(url.pathname.includes("/metadata") ? "METADATA" : "INSTANCE");
        sourcePaths.push(url.pathname);
        let response;
        try { response = await globalThis.fetch(input, init); }
        catch (error) { recordSourceFailure('FETCH', error); throw error; }
        if (metadataFault && url.pathname.endsWith("/metadata")) {
          return applyMetadataFault(response, metadataFault);
        }
        if (pendingFailure && url.pathname.includes("/instances/")) {
          pendingFailure = false;
          // Keep the real authorized A request, but inject a deterministic
          // mid-body failure after a tiny synthetic DICOM prefix. The stored
          // Orthanc object is never modified or partially copied to B.
          void response.body?.cancel().catch(() => undefined);
          return partialDicomThenFail(response);
        }
        if (response.body) {
          const reader = response.body.getReader();
          const monitored = new ReadableStream({
            async pull(controller) {
              try {
                assertOutsideTransaction();
                assert.equal(initialAuthorizationCommitted, true);
                const part = await reader.read();
                if (part.done) controller.close();
                else controller.enqueue(part.value);
              } catch (error) {
                recordSourceFailure('HTTP_BODY', error);
                controller.error(error);
              }
            },
            async cancel(reason) {
              await reader.cancel(reason).catch(() => undefined);
            },
          }, { highWaterMark: 0 });
          return new Response(observeStreamReads(monitored, assertOutsideTransaction), {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      },
    },
  );

  const dicomGateway = Object.freeze({
    retrieveStudyMetadata: async (request) => {
      metadataCalls += 1;
      let metadata;
      try { metadata = await adapter.retrieveStudyMetadata(request); }
      catch (error) { recordSourceFailure('METADATA', error); throw error; }
      if (afterMetadata) await afterMetadata();
      return metadata;
    },
    retrieveInstanceStream: async (request) => {
      instanceCalls += 1;
      if (!observeInstanceStreams) {
        const stream = await adapter.retrieveInstanceStream(request);
        return Object.freeze({ ...stream, body: observeStreamReads(stream.body, assertOutsideTransaction) });
      }

      instanceStreamOpenOrder.push(request.sopInstanceUid);
      activeInstanceStreams += 1;
      maximumActiveInstanceStreams = Math.max(
        maximumActiveInstanceStreams,
        activeInstanceStreams,
      );
      let source;
      try {
        source = await adapter.retrieveInstanceStream(request);
      } catch (error) {
        recordSourceFailure('INSTANCE_OPEN', error);
        activeInstanceStreams -= 1;
        throw error;
      }

      const reader = source.body.getReader();
      const digest = createHash("sha256");
      let byteLength = 0;
      let chunkCount = 0;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        activeInstanceStreams -= 1;
      };
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              observedInstanceStreams.push(Object.freeze({
                sopInstanceUid: request.sopInstanceUid,
                byteLength,
                chunkCount,
                sha256: digest.digest("hex"),
              }));
              instanceStreamCompletionOrder.push(request.sopInstanceUid);
              settle();
              if (
                revokeGrantAfterInstanceBytes &&
                instanceStreamCompletionOrder.length === manifest.instanceCount
              ) {
                const revocation = await grantRevocationService.revoke({
                  principal,
                  tenantCandidate: fixture.tenantId,
                  sessionId: fixture.sessionInFlightRevocationId,
                  grantId: fixture.grantInFlightRevocationId,
                  correlationId: fixture.correlationGrantRevocation,
                  hasUnexpectedInput: false,
                });
                grantRevocationCompleted = true;
                grantRevocationStatus = revocation.grant.status;
              }
              controller.close();
              return;
            }
            byteLength += next.value.byteLength;
            chunkCount += 1;
            digest.update(next.value);
            controller.enqueue(next.value);
          } catch (error) {
            recordSourceFailure('INSTANCE_BODY', error);
            settle();
            controller.error(error);
          }
        },
        async cancel(reason) {
          await reader.cancel(reason).catch(() => undefined);
          settle();
        },
      }, { highWaterMark: 0 });
      return Object.freeze({ ...source, body: observeStreamReads(body, assertOutsideTransaction) });
    },
    storeInstanceStream: async () => {
      stowCalls += 1;
      throw new Error("SOURCE_CAPTURE_TEST_STOW_FORBIDDEN");
    },
    validateEndpoint: (context, operation) => adapter.validateEndpoint(context, operation),
    storeStudyStream: async request => {
      if (!allowStudyStow) throw new Error("SOURCE_CAPTURE_TEST_STUDY_STOW_FORBIDDEN");
      assertOutsideTransaction();
      stowCalls += 1;
      return adapter.storeStudyStream(request);
    },
    retrieveDestinationVerificationInstanceStream: async request => {
      if (!destinationVerification) throw new Error('SOURCE_CAPTURE_TEST_DESTINATION_BYTES_FORBIDDEN');
      assertOutsideTransaction(); destinationByteCalls++;
      const source = await adapter.retrieveDestinationVerificationInstanceStream(request);
      const reader = source.body.getReader(), hash = createHash('sha256'); let bytes = 0;
      const body = new ReadableStream({ async pull(controller) {
        assertOutsideTransaction();
        try {
          const next = await reader.read();
          if (next.done) {
            destinationObserved.push({ sop:request.sopInstanceUid,bytes,sha256:hash.digest('hex') });
            reader.releaseLock(); await afterDestinationBytes?.(destinationByteCalls); controller.close();
          } else { bytes += next.value.length; hash.update(next.value); controller.enqueue(next.value); }
        } catch (error) { controller.error(error); }
      }, async cancel(reason) { await reader.cancel(reason).catch(() => {}); try { reader.releaseLock(); } catch {} } },{highWaterMark:0});
      return Object.freeze({ ...source,body:observeStreamReads(body,assertOutsideTransaction) });
    },
    verifyDestinationStudy: async request => {
      destinationVerificationCalls += 1;
      if (destinationVerification) { assertOutsideTransaction(); return adapter.verifyDestinationStudy(request); }
      throw new Error("SOURCE_CAPTURE_TEST_DESTINATION_VERIFY_FORBIDDEN");
    },
  });
  const executor = new AuthorizationGatedOperationExecutor(
    actorContext,
    new AuthorizationEngine(
      new ResolvedObjectAuthorizationPolicy(
        new PostgresAuthorizationEvidenceReader(),
      ),
    ),
  );
  const service = new AuthorizedSourceCaptureService(
    executor,
    actorContext,
    dicomGateway,
    undefined,
    undefined,
    temporaryImagingStore,
  );

  const publicProjectionCheckedService = new Proxy(service, { get(target, property) {
    if (property === "capture") return async input => {
      let result;
      try { result = await target.capture(input); }
      catch (error) { assertPublicCaptureError(error); throw error; }
      assertPublicCaptureProjection(result);
      return result;
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return Object.freeze({
    service: publicProjectionCheckedService,
    database,
    actorContext,
    executor,
    dicomGateway,
    assertOutsideTransaction,
    counters: () => Object.freeze({
      tenantContextRuns,
      quotaReservations,
      dispatchClaimQueries, dispatchClaimMatches, lostCommitAcknowledgements,
      destinationClaimQueries,destinationClaimMatches,destinationByteCalls,destinationObserved:[...destinationObserved],
      activeTenantTransactions,
      initialAuthorizationCommitted,
      sourceRequests: [...sourceRequests],
      sourcePaths: [...sourcePaths],
      sourceRequestObservations: [...sourceRequestObservations],
      instanceStreamOpenOrder: [...instanceStreamOpenOrder],
      instanceStreamCompletionOrder: [...instanceStreamCompletionOrder],
      observedInstanceStreams: [...observedInstanceStreams],
      activeInstanceStreams,
      maximumActiveInstanceStreams,
      forbiddenEndpointAttempts,
      stowCalls,
      bStowRequests,
      destinationVerificationCalls,
      grantRevocationCompleted,
      grantRevocationStatus,
      metadataCalls,
      instanceCalls,
      tenantContextFailures: [...tenantContextFailures],
      databaseFailures: [...databaseFailures],
      sourceFailures: sourceFailures.map(item => ({...item})),
    }),
  });
}

async function readOperationState(harness, operationId = fixture.operationId) {
  return harness.actorContext.run(principal, fixture.tenantId, async (_identity, client) => {
    const operation = await client.query(
      `SELECT state FROM pacs_transfer_operations WHERE operation_id = $1::uuid`,
      [operationId],
    );
    const evidence = await client.query(
      `SELECT verification_stage, status, algorithm, source_digest, source_object_count
         FROM integrity_evidence
        WHERE operation_id = $1::uuid`,
      [operationId],
    );
    return Object.freeze({
      operationState: operation.rows[0]?.state ?? null,
      evidence: evidence.rows.map((row) => ({
        stage: row.verification_stage,
        status: row.status,
        algorithm: row.algorithm,
        sourceDigest: row.source_digest,
        objectCount: row.source_object_count,
      })),
    });
  });
}

async function readTemporaryPayloadState(harness, studyRefId) {
  return harness.actorContext.run(principal, fixture.tenantId, async (_identity, client) => {
    const result = await client.query(
      `SELECT temporary_storage_ref::text, temporary_payload_state,
              temporary_payload_expires_at, temporary_payload_purged_at
         FROM study_references WHERE study_ref_id = $1::uuid`,
      [studyRefId],
    );
    assert.equal(result.rowCount, 1, "COORD004_SOURCE_STUDY_EXISTS");
    return result.rows[0];
  });
}

function captureCommand(
  correlationId,
  operationId = fixture.operationId,
  authorization = {},
) {
  return Object.freeze({
    principal,
    tenantCandidate: fixture.tenantId,
    correlationId,
    operationId,
    consentId: authorization.consentId ?? fixture.consentId,
    grantId: authorization.grantId ?? fixture.grantId,
  });
}

async function observePrivacy(scenario, phase, signal) {
  const endpoint = new URL(process.env.MEDIQ_TEST_OBSERVATION_URL);
  privacyAssert(endpoint.protocol === "http:" && endpoint.port === "8791" && endpoint.pathname === "/" &&
    !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash &&
    /^mediq-int001-capture-[0-9a-f]{12}-privacy-observer$/.test(endpoint.hostname), "OBSERVER_ADDRESS");
  const token = process.env.MEDIQ_TEST_OBSERVATION_TOKEN;
  privacyAssert(typeof token === "string" && /^[0-9a-f]{64}$/.test(token), "OBSERVER_TOKEN");
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(new URL("/probe", endpoint), { method: "POST",
    headers: { "content-type": "application/json", "x-mediq-test-observation": token },
    body: JSON.stringify({ scenario: scenario.name, phase }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  let raw = "", size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    privacyAssert(size <= 512, "OBSERVER_RESPONSE_BOUND");
    raw += Buffer.from(chunk).toString("utf8");
  }
  const result = JSON.parse(raw);
  if (!response.ok || result.status !== "OK") {
    const code = /^DEC017_PRIVACY_[A-Z_]{1,80}$/.test(result.code ?? "") ? result.code : "DEC017_PRIVACY_OBSERVER_REJECTED";
    const diagnosticPhase = ["RESERVED", "QUOTA", "AVAILABLE", "READ_RESULT", "PHYSICAL_ABSENT", "FINAL", "MUTATED", "DENIED", "RESTORED", "WITHDRAWN"].includes(phase) ? phase : "UNKNOWN";
    console.error(`DEC017_PRIVACY_PROBE_${diagnosticPhase}_${code}`);
    throw new Error(code);
  }
}

async function observeCoordinatorFaultPending() {
  const endpoint = new URL(process.env.MEDIQ_TEST_OBSERVATION_URL);
  privacyAssert(endpoint.protocol === "http:" && endpoint.port === "8791" && endpoint.pathname === "/" &&
    !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash &&
    /^mediq-int001-capture-[0-9a-f]{12}-privacy-observer$/.test(endpoint.hostname), "OBSERVER_ADDRESS");
  const token = process.env.MEDIQ_TEST_OBSERVATION_TOKEN;
  privacyAssert(typeof token === "string" && /^[0-9a-f]{64}$/.test(token), "OBSERVER_TOKEN");
  const response = await fetch(new URL("/fault-pending", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json", "x-mediq-test-observation": token },
    body: JSON.stringify({ scenario: "purge-unresolved" }),
    signal: AbortSignal.timeout(10_000),
  });
  let raw = "", size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    privacyAssert(size <= 512, "OBSERVER_RESPONSE_BOUND");
    raw += Buffer.from(chunk).toString("utf8");
  }
  const result = JSON.parse(raw);
  if (!response.ok || result.status !== "OK") {
    const code = /^DEC017_PRIVACY_[A-Z_]{1,80}$/.test(result.code ?? "")
      ? result.code : "DEC017_PRIVACY_COORD004_FAULT_PENDING_REJECTED";
    throw new Error(code);
  }
}

async function controlMutation(scenario, transition, signal) {
  try {
    const endpoint = new URL(process.env.MEDIQ_TEST_MUTATION_URL);
    assert.ok(endpoint.protocol === 'http:' && endpoint.port === '8792' && endpoint.pathname === '/' &&
      !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash &&
      /^mediq-int001-capture-[0-9a-f]{12}-fixture-mutator$/.test(endpoint.hostname));
    const token = process.env.MEDIQ_TEST_MUTATION_TOKEN;
    assert.ok(typeof token === 'string' && /^[0-9a-f]{64}$/.test(token));
    assert.ok(sourceMutationCases.includes(scenario) && ['APPLY','ASSERT_AND_RESTORE'].includes(transition));
    const timeout = AbortSignal.timeout(10_000);
    const response = await fetch(new URL('transition', endpoint), { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mediq-test-mutation': token },
      body: JSON.stringify({ scenario: scenario.name, transition }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; assert.ok(size <= 1024); chunks.push(chunk); }
    const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok || reply.status !== 'OK') throw new Error(/^DEC017_MUTATION_[A-Z_]{1,60}$/.test(reply.code ?? '') ? reply.code : 'DEC017_MUTATION_REJECTED');
    assert.deepEqual(reply, { status: 'OK' });
  } catch (error) {
    throw new Error(/^DEC017_MUTATION_[A-Z_]{1,60}$/.test(error?.message ?? '') ? error.message : 'DEC017_MUTATION_CLIENT_UNAVAILABLE');
  }
}

// Run the already-copied test module as a separate replica, never as a second
// test suite. Await close (also after kill/error) before parent-owned teardown.
async function runReplicaProcess(input, signal) {
  const serialized = JSON.stringify(input);
  assert.ok(Buffer.byteLength(serialized) <= 65_536, "DEC017_REPLICA_INPUT_BOUND");
  if (signal?.aborted) throw new Error("DEC017_REPLICA_CANCELLED");
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_OPTIONS;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--mediq-recovery-child"], {
    env: childEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  assert.notEqual(child.pid, process.pid, "DEC017_REPLICA_DISTINCT_PID");
  let stdout = "", stderr = "", outputBytes = 0, failed = false;
  const stop = () => { failed = true; child.kill("SIGKILL"); };
  const timer = setTimeout(stop, 60_000);
  child.on("error", () => { failed = true; });
  child.stdin.on("error", () => { failed = true; });
  child.stdout.setEncoding("utf8").on("data", text => {
    outputBytes += Buffer.byteLength(text);
    if (outputBytes > 4096) stop(); else stdout += text;
  });
  child.stderr.setEncoding("utf8").on("data", text => {
    outputBytes += Buffer.byteLength(text);
    if (outputBytes > 4096) stop(); else stderr += text;
  });
  const closed = new Promise(resolveClose => child.once("close", (code, signal) => resolveClose({ code, signal })));
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  child.stdin.end(serialized);
  const outcome = await closed.finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  });
  const marker = /^DEC017_REPLICA_FAILED_[A-Z0-9_]+\n$/.test(stdout) ? stdout.trim() : "DEC017_REPLICA_FAILED";
  if (failed || outcome.code !== 0 || outcome.signal !== null || stderr !== "") throw new Error(marker);
  if (stdout !== "DEC017_REPLICA_RECOVERY_PASS\n") throw new Error("DEC017_REPLICA_PROTOCOL");
}

async function runRecoveryReplica() {
  let harness;
  try {
    let serialized = "", size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      assert.ok(size <= 65_536, "DEC017_REPLICA_INPUT_BOUND");
      serialized += chunk.toString("utf8");
    }
    const { root, auth, signedToken, crossToken, handoff } = JSON.parse(serialized);
    const scenario = temporaryCaptureLifecycleCases.find(item => item.name === "replica_recovery");
    assert.equal(resolve(dirname(root)), resolve(tmpdir()));
    assert.ok(/^mediq-orthanc-lifecycle-[A-Za-z0-9]+$/.test(basename(root)));
    assert.ok((await lstat(root)).isDirectory());
    const storageRoot = join(root, "ciphertext");
    assert.ok((await lstat(storageRoot)).isDirectory());
    assert.equal(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, undefined);
    assert.equal(process.env.MEDIQ_MIGRATION_DATABASE_URL, undefined);
    const verifier = new RemoteJwksOidcTokenVerifier(auth);
    const signedPrincipal = await verifier.verify(signedToken);
    const crossPrincipal = await verifier.verify(crossToken);
    const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
    harness = createHarness({ temporaryImagingStore: store, oidcAuthentication: auth });
    const temporary = handoff.temporaryPackage, instance = temporary.instances[0];
    const binding = { operationId: scenario.operationId, tenantId: fixture.tenantId,
      exchangeSessionId: scenario.sessionId, packageId: scenario.packageId,
      studyRefId: scenario.studyRefId, sourceHospitalId: TEST_HOSPITAL_A_ID };
    let callbacks = 0, verifiedChecks = 0, physicalPurges = 0;
    const consume = async () => { callbacks++; };
    const currentMetadata = () => harness.actorContext.run(signedPrincipal, fixture.tenantId, async (_identity, client) => {
      const result = await client.query(`SELECT temporary_storage_ref::text,temporary_payload_state,
        temporary_payload_expires_at,temporary_payload_purged_at FROM study_references WHERE study_ref_id=$1`, [scenario.studyRefId]);
      assert.equal(result.rowCount, 1);
      return result.rows[0];
    });
    const before = await currentMetadata();
    assert.equal(before.temporary_storage_ref, temporary.storageRef);
    assert.equal(before.temporary_payload_state, "AVAILABLE");
    assert.equal(before.temporary_payload_expires_at.toISOString(), temporary.expiresAt);
    await assert.rejects(harness.service.consumeCapturedInstance({ principal: signedPrincipal,
      tenantCandidate: fixture.tenantId, correlationId: scenario.correlationId, consentId: scenario.consentId,
      grantId: scenario.grantId, handoff, objectRef: instance.objectRef }, consume),
    { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });

    // Primitive key-loss proof only: real authorization, not a default-allow
    // hook or a replacement for the concrete product consumer's two checks.
    await assert.rejects(store.consumeInstance({ storageRef: temporary.storageRef, objectRef: instance.objectRef,
      packageBinding: { tenantId: fixture.tenantId, exchangeSessionId: scenario.sessionId,
        packageId: scenario.packageId, purpose: "PACS_IMPORT" },
      instanceBinding: { studyRefId: scenario.studyRefId, seriesInstanceUid: instance.seriesInstanceUid,
        sopInstanceUid: instance.sopInstanceUid }, expectedByteLength: instance.byteLength, expectedSha256: instance.sha256,
    }, async () => {
      await harness.executor.executeWithResolvedSessionFence(signedPrincipal, fixture.tenantId,
        async (identity, client) => {
          const scope = await new PostgresSourceCaptureScopeRepository(client).findByOperationId(scenario.operationId, identity.tenantId);
          assert.ok(scope);
          for (const [field, value] of Object.entries(binding)) assert.equal(scope[field], value);
          assert.equal(scope.patientRefId, fixture.patientRefId);
          assert.equal(scope.operationState, "CREATED");
          return AuthorizationContext.create({ identity, exchangeSessionId: scope.exchangeSessionId,
            resource: { kind: "STUDY", id: scope.studyRefId }, action: "PACS_IMPORT",
            consentId: scenario.consentId, grantId: scenario.grantId });
        }, async (_context, client) => {
          const allowed = await client.query(`SELECT 1 FROM study_references sr JOIN integrity_evidence ie
            ON ie.study_ref_id=sr.study_ref_id AND ie.package_id=sr.package_id
            WHERE sr.study_ref_id=$1 AND sr.temporary_storage_ref=$2 AND sr.temporary_payload_state='AVAILABLE'
              AND sr.temporary_payload_purged_at IS NULL AND sr.temporary_payload_expires_at=$3
              AND sr.temporary_payload_expires_at>now() AND ie.integrity_id=$4 AND ie.operation_id=$5
              AND ie.exchange_session_id=$6 AND ie.status='PENDING' AND ie.verification_stage='SOURCE_CAPTURE'
              AND ie.verified_at IS NULL AND ie.algorithm=$7 AND ie.source_digest=$8 AND ie.source_object_count=$9`,
          [scenario.studyRefId, temporary.storageRef, temporary.expiresAt, handoff.sourceEvidence.evidenceId,
            scenario.operationId, scenario.sessionId, handoff.sourceEvidence.algorithm,
            handoff.sourceEvidence.aggregateDigest, handoff.sourceEvidence.objectCount]);
          assert.equal(allowed.rowCount, 1, "DEC017_REPLICA_CURRENT_AUTHORITY");
        });
      verifiedChecks++;
      assert.equal(harness.counters().activeTenantTransactions, 0);
      return "VERIFIED";
    }, consume), { name: "TemporaryImagingStorageError", code: "RECOVERY_REQUIRED" });
    assert.equal(verifiedChecks, 1, "DEC017_REPLICA_REAL_AUTHORIZATION_COMPLETED");
    assert.equal(callbacks, 0);

    const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, { async purgeByReference(input) {
      physicalPurges++;
      assert.equal(harness.counters().activeTenantTransactions, 0);
      const state = await currentMetadata();
      assert.ok(["PURGE_PENDING", "PURGED"].includes(state.temporary_payload_state));
      assert.equal(state.temporary_storage_ref, input.storageRef);
      await store.purgeByReference(input);
      assert.deepEqual(await readdir(storageRoot), [], "DEC017_REPLICA_ABSENT_BEFORE_FINALIZE");
      await observePrivacy(scenario, "PHYSICAL_ABSENT");
    } });
    const command = { principal: signedPrincipal, tenantCandidate: fixture.tenantId, binding,
      storageRef: temporary.storageRef, correlationId: scenario.correlationId, reason: "PROCESS_RESTART" };
    const ciphertextSnapshot = async () => {
      const names = (await readdir(join(storageRoot, temporary.storageRef))).sort();
      return Promise.all(names.map(async name => [name, createHash("sha256")
        .update(await readFile(join(storageRoot, temporary.storageRef, name))).digest("hex")]));
    };
    const ciphertextBefore = await ciphertextSnapshot();
    assert.equal(ciphertextBefore.length, 3);
    await assert.rejects(purge.purge({ ...command, principal: null }), { message: "TEMPORARY_PAYLOAD_PURGE_UNAVAILABLE" });
    await assert.rejects(purge.purge({ ...command, principal: crossPrincipal }), { message: "TEMPORARY_PAYLOAD_PURGE_UNAVAILABLE" });
    assert.equal(physicalPurges, 0, "DEC017_REPLICA_UNAUTHORIZED_NO_PHYSICAL_EFFECT");
    assert.deepEqual(await currentMetadata(), before);
    assert.ok(JSON.stringify(await ciphertextSnapshot()) === JSON.stringify(ciphertextBefore));
    assert.deepEqual(await purge.purge(command), { kind: "PURGED" });
    assert.deepEqual(await purge.purge(command), { kind: "ALREADY_PURGED" });
    assert.equal((await currentMetadata()).temporary_payload_state, "PURGED");
    const counts = harness.counters();
    assert.equal(counts.instanceCalls + counts.sourceRequests.length + counts.stowCalls + counts.destinationVerificationCalls, 0);
    assert.equal(counts.activeTenantTransactions, 0);
    process.stdout.write("DEC017_REPLICA_RECOVERY_PASS\n");
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : "SUPPRESSED";
    const line = /authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):/.exec(error?.stack ?? "")?.[1] ?? "0";
    process.stdout.write(`DEC017_REPLICA_FAILED_${code}_LINE_${line}\n`);
    process.exitCode = 1;
  } finally {
    await harness?.database.onModuleDestroy().catch(() => {
      process.stdout.write("DEC017_REPLICA_FAILED_DATABASE_CLOSE\n");
      process.exitCode = 1;
    });
  }
}

async function runTemporaryLifecycleCase(scenario, signal) {
  const keys = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = { ...await exportJWK(keys.publicKey), kid: "TEST-LIFECYCLE", alg: "RS256", use: "sig" };
  let jwksRequests = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") return response.writeHead(404).end();
    jwksRequests += 1;
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
  });
  let root, store, harness, signedPrincipal, overlapObserver;
  const verifyOverlap = async stage => {
    harness.assertOutsideTransaction();
    if (overlapObserver) await overlapObserver.assertHeld(stage);
  };
  const attempted = [];
  const observedQuotaRefs = new Set();
  let callbacks = 0;
  let releaseReservation, reservationEntered;
  const heldReservation = new Promise(resolve => { releaseReservation = resolve; });
  const reservationReached = new Promise(resolve => { reservationEntered = resolve; });
  let winner;
  let physicalPurgeCalls = 0;
  const noAllocation = scenario.boundary === 'METADATA';
  const actorCapture = scenario.boundary === 'RESERVED';
  const children = async path => readdir(path).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const applyMutation = async () => {
    assert.equal(harness.counters().activeTenantTransactions, 0);
    await controlMutation(scenario, 'APPLY', signal);
    await observePrivacy(scenario, 'MUTATED', signal);
  };
  const captureFailure = ["completion_audit_failure", "capture_write_failure", "capture_fsync_failure", "capture_evidence_failure"].includes(scenario.name);
  const operationBinding = { operationId: scenario.operationId, tenantId: fixture.tenantId,
    exchangeSessionId: scenario.sessionId, packageId: scenario.packageId,
    studyRefId: scenario.studyRefId, sourceHospitalId: TEST_HOSPITAL_A_ID };
  try {
    await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
    const auth = { issuer: fixture.issuer, audience: "TEST-SOURCE-LIFECYCLE",
      jwksUri: `http://127.0.0.1:${server.address().port}/jwks` };
    const verifier = new RemoteJwksOidcTokenVerifier(auth);
    const token = (subject, audience = auth.audience, claims = {}) => new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid, typ: "at+jwt" })
      .setIssuer(auth.issuer).setAudience(audience).setSubject(subject)
      .setNotBefore(Math.floor(Date.now() / 1000) - 1).setExpirationTime("5m").sign(keys.privateKey);
    await assert.rejects(verifier.verify(await token(fixture.subject, "TEST-WRONG-AUDIENCE")), { message: "AUTHENTICATION_TOKEN_INVALID" });
    const signedToken = await token(fixture.subject);
    const invalidSignature = signedToken.split(".");
    invalidSignature[2] = (invalidSignature[2][0] === "A" ? "B" : "A") + invalidSignature[2].slice(1);
    await assert.rejects(verifier.verify(invalidSignature.join(".")), { message: "AUTHENTICATION_TOKEN_INVALID" });
    signedPrincipal = await verifier.verify(signedToken);
    const crossPrincipal = await verifier.verify(await token(fixture.otherTenantSubject));
    const patientPrincipal = await verifier.verify(await token("synthetic-int001-patient-actor",
      auth.audience, { mediq_patient_ref_id: fixture.patientRefId }));
    assert.ok(jwksRequests > 0, "DEC017_REAL_JWKS_FETCH");

    root = await mkdtemp(join(tmpdir(), "mediq-orthanc-lifecycle-"));
    const storageRoot = join(root, "ciphertext");
    const currentMetadata = () => harness.actorContext.run(signedPrincipal, fixture.tenantId, async (_identity, client) => {
      const result = await client.query(`SELECT temporary_storage_ref::text, temporary_payload_state,
        temporary_payload_expires_at, temporary_payload_purged_at FROM study_references WHERE study_ref_id=$1`, [scenario.studyRefId]);
      assert.equal(result.rowCount, 1, "DEC017_METADATA_VISIBLE");
      return result.rows[0];
    });
    store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, ciphertextIo: {
      async write(file, buffer, offset, length, position) {
        await verifyOverlap('WRITE');
        assert.ok(harness.counters().quotaReservations > 0, "DEC017_COMMITTED_QUOTA_BEFORE_WRITE");
        const ref = attempted.at(-1).storageRef;
        if (!observedQuotaRefs.has(ref)) {
          await observePrivacy(scenario, "QUOTA", signal);
          observedQuotaRefs.add(ref);
        }
        if (scenario.name === "capture_write_failure") throw new Error("DEC017_SYNTHETIC_WRITE_FAILURE");
        return file.write(buffer, offset, length, position);
      },
      sync: async file => {
        await verifyOverlap('SYNC');
        if (scenario.name === "capture_fsync_failure") throw new Error("DEC017_SYNTHETIC_FSYNC_FAILURE");
        return file.sync();
      },
    } });
    const port = {
      async beginReservedPackage(binding, ref, quota) {
        harness.assertOutsideTransaction();
        const state = await currentMetadata();
        assert.equal(state.temporary_payload_state, "STAGING", "DEC017_RESERVED_BEFORE_ALLOCATION");
        assert.equal(state.temporary_storage_ref, ref);
        await observePrivacy(scenario, "RESERVED", signal);
        attempted.push({ storageRef: ref, binding });
        if (actorCapture) await applyMutation();
        if (scenario.name === "concurrent_capture" && attempted.length === 1) {
          reservationEntered();
          await heldReservation;
        }
        return store.beginReservedPackage(binding, ref, quota);
      },
      beginInstance: input => store.beginInstance(input),
      sealPackage: input => store.sealPackage(input),
      async purgeByReference(input) {
        physicalPurgeCalls += 1;
        await verifyOverlap('PURGE');
        const state = await currentMetadata();
        assert.ok(["PURGE_PENDING", "PURGED"].includes(state.temporary_payload_state));
        assert.equal(state.temporary_storage_ref, input.storageRef);
        await store.purgeByReference(input);
        assert.deepEqual(await readdir(storageRoot), [], "DEC017_PHYSICAL_PURGE_BEFORE_FINALIZE");
        await observePrivacy(scenario, "PHYSICAL_ABSENT", signal);
      },
      async consumeInstance(input, verify, consume) {
        let phase = 0;
        await store.consumeInstance(input, async (...args) => {
          const result = await verify(...args);
          harness.assertOutsideTransaction();
          phase += 1;
          if (phase === 1 && scenario.mutation && scenario.boundary === 'BETWEEN') await applyMutation();
          if (phase === 1 && scenario.name === "read_revoked") {
            const outcome = await new GrantRevocationService(harness.actorContext).revoke({
              principal: signedPrincipal, tenantCandidate: fixture.tenantId, sessionId: scenario.sessionId,
              grantId: scenario.grantId, correlationId: scenario.revokeCorrelationId, hasUnexpectedInput: false,
            });
            assert.equal(outcome.grant.status, "REVOKED", "DEC017_REAL_REVOCATION_COMMITTED");
          }
          if (phase === 1 && scenario.name === "read_withdrawn") {
            const outcome = await new ConsentWithdrawalService(harness.actorContext).withdraw({
              principal: patientPrincipal, tenantCandidate: fixture.tenantId, sessionId: scenario.sessionId,
              consentId: scenario.consentId, correlationId: scenario.revokeCorrelationId, hasUnexpectedInput: false,
            });
            assert.equal(outcome.consent.status, "WITHDRAWN", "DEC017_REAL_WITHDRAWAL_COMMITTED");
          }
          if (phase === 1 && ["read_purge_pending", "read_expired_metadata"].includes(scenario.name)) {
            await harness.actorContext.run(signedPrincipal, fixture.tenantId, async (_identity, client) => {
              if (scenario.name === "read_purge_pending") {
                await new PostgresTemporaryPayloadMetadataRepository(client).markPurgePending({
                  binding: operationBinding, storageRef: input.storageRef });
              } else {
                // Test-only change to an already granted metadata column under real RLS.
                // No clock/verification substitution or privileged test connection.
                assert.equal((await client.query(`UPDATE study_references SET temporary_payload_expires_at=now()-interval '1 second'
                  WHERE study_ref_id=$1 AND temporary_storage_ref=$2 AND temporary_payload_state='AVAILABLE'`,
                [scenario.studyRefId, input.storageRef])).rowCount, 1);
              }
            });
          }
          return result;
        }, consume);
      },
    };
    const withdrawAfterMetadata = async () => {
      assert.equal(harness.counters().activeTenantTransactions, 0);
      const outcome = await new ConsentWithdrawalService(harness.actorContext).withdraw({
        principal: patientPrincipal, tenantCandidate: fixture.tenantId, sessionId: scenario.sessionId,
        consentId: scenario.consentId, correlationId: scenario.revokeCorrelationId, hasUnexpectedInput: false,
      });
      assert.equal(outcome.consent.status, 'WITHDRAWN', 'DEC017_CAPTURE_CONSENT_WITHDRAWAL_COMMITTED');
      assert.equal(outcome.replayed, false);
      assert.equal(harness.counters().activeTenantTransactions, 0);
      await observePrivacy(scenario, 'WITHDRAWN', signal);
    };
    harness = createHarness({ temporaryImagingStore: port, oidcAuthentication: auth, observeInstanceStreams: true,
      beforeSourceRequest: () => verifyOverlap('SOURCE'),
      ...(noAllocation ? { afterMetadata: scenario.consentWithdrawal ? withdrawAfterMetadata : applyMutation } : {}) });
    const runtime = await harness.database.connect();
    try {
      const role = await runtime.query("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
      assert.deepEqual(role.rows[0], { current_user: "mediq_runtime", rolsuper: false, rolbypassrls: false });
      await assertRuntimePrivilegeCatalog(runtime);
      assert.deepEqual((await runtime.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='study_references'::regclass")).rows[0], { relrowsecurity: true, relforcerowsecurity: true });
      assert.equal((await runtime.query("SELECT study_ref_id FROM study_references WHERE study_ref_id=$1", [scenario.studyRefId])).rowCount, 0, "DEC017_NO_CONTEXT_DENIED");
      await assert.rejects(runtime.query("SELECT reserved_bytes FROM temporary_payload_quota_state"), error => error?.code === "42501");
    } finally { runtime.release(); }
    const input = { ...captureCommand(scenario.correlationId, scenario.operationId, scenario), principal: signedPrincipal };
    // Bilateral Study visibility is not ownership of the Tenant-B operation.
    const cross = await harness.service.captureForCoordinator({ ...input, principal: crossPrincipal, tenantCandidate: fixture.otherTenantId });
    assert.equal(cross.kind, "DENIED");
    assert.equal(harness.counters().instanceCalls, 0);

    if (scenario.name === 'roundtrip') {
      let forbiddenReads = 0;
      const precreated = observeStreamReads(new ReadableStream({
        pull(controller) { forbiddenReads++; controller.close(); },
      }, { highWaterMark: 0 }), harness.assertOutsideTransaction).getReader();
      try {
        await harness.actorContext.run(signedPrincipal, fixture.tenantId, async (_identity, client) => {
          await client.query('SET TRANSACTION READ ONLY');
          await assert.rejects(precreated.read(), error => error?.code === 'ERR_ASSERTION' && error.message === 'DEC017_IO_WITHIN_OWN_TRANSACTION');
          assert.equal(forbiddenReads, 0, 'DEC017_REAL_OWN_TRANSACTION_NO_PHYSICAL_READ');
        });
      } finally { await precreated.cancel().catch(() => undefined); precreated.releaseLock(); }
      overlapObserver = await startUnrelatedReadOnlyTransaction(harness, signedPrincipal, fixture.tenantId, signal);
    }

    const restoreAfterDenial = async storageRef => {
      assert.equal(callbacks, 0, 'DEC017_MUTATION_NO_CALLBACK');
      await observePrivacy(scenario, 'DENIED', signal);
      if (scenario.mutation === 'ACTOR_INACTIVE') {
        const before = await children(storageRoot);
        const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, port);
        await assert.rejects(purge.purge({ principal: signedPrincipal, tenantCandidate: fixture.tenantId,
          binding: operationBinding, storageRef, correlationId: scenario.correlationId, reason: 'EXPLICIT_CLOSE' }),
        error => error?.message === 'TEMPORARY_PAYLOAD_PURGE_UNAVAILABLE' && error.phase === 'MARK_PENDING');
        assert.equal(physicalPurgeCalls, 0, 'DEC017_INACTIVE_ACTOR_NO_PHYSICAL_PURGE');
        assert.deepEqual(await children(storageRoot), before, 'DEC017_INACTIVE_ACTOR_FILES_RETAINED');
      }
      await controlMutation(scenario, 'ASSERT_AND_RESTORE', signal);
      await observePrivacy(scenario, 'RESTORED', signal);
    };
    if (noAllocation) {
      const denied = await harness.service.captureForCoordinator(input);
      assert.deepEqual(denied, { kind: 'DENIED', reason: scenario.consentWithdrawal ? 'AUTHORIZATION_DENIED' : 'PATIENT_MAPPING_INVALID' });
      assertPublicCaptureProjection(denied);
      assert.equal(attempted.length, 0); assert.equal(harness.counters().instanceCalls, 0);
      assert.equal(harness.counters().quotaReservations, 0); assert.deepEqual(await children(storageRoot), []);
      assert.equal(physicalPurgeCalls, 0); assert.equal(callbacks, 0);
      if (scenario.consentWithdrawal) await observePrivacy(scenario, 'DENIED', signal);
      else await restoreAfterDenial();
    } else if (actorCapture) {
      await assert.rejects(harness.service.captureForCoordinator(input), { message: 'SOURCE_CAPTURE_UNAVAILABLE' });
      assert.equal(attempted.length, 1); assert.equal(harness.counters().quotaReservations, 0);
      assert.deepEqual(await children(join(storageRoot, attempted[0].storageRef)), [], 'DEC017_ACTOR_LOSS_NO_CIPHERTEXT_WRITE');
      await restoreAfterDenial(attempted[0].storageRef);
      const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, port);
      assert.deepEqual(await purge.purge({ principal: signedPrincipal, tenantCandidate: fixture.tenantId,
        binding: operationBinding, storageRef: attempted[0].storageRef, correlationId: scenario.correlationId, reason: 'EXPLICIT_CLOSE' }), { kind: 'PURGED' });
    } else if (captureFailure) {
      await assert.rejects(harness.service.captureForCoordinator(input), { message: "SOURCE_CAPTURE_UNAVAILABLE" });
    } else {
      let result;
      if (scenario.name === "concurrent_capture") {
        winner = harness.service.captureForCoordinator(input);
        // Await either the deterministic hold or an early winner termination.
        // No timer/sleep and no unhandled rejection if setup fails.
        await Promise.race([reservationReached, winner.then(() => { throw new Error("DEC017_RESERVATION_NOT_HELD"); })]);
        try {
          const before = await currentMetadata();
          assert.equal(before.temporary_payload_state, "STAGING");
          await assert.rejects(harness.service.captureForCoordinator(input), { message: "SOURCE_CAPTURE_UNAVAILABLE" });
          assert.deepEqual(await currentMetadata(), before, "DEC017_LOSER_PRESERVES_WINNER");
          assert.equal(attempted.length, 1, "DEC017_LOSER_NO_ALLOCATION");
          assert.equal(harness.counters().instanceCalls, 0, "DEC017_LOSER_NO_INSTANCE_BYTES");
        } finally { releaseReservation(); }
        result = await winner;
      } else result = await harness.service.captureForCoordinator(input);
      assert.equal(result.kind, "CAPTURED_FOR_COORDINATOR", "DEC017_CAPTURE_SUCCEEDED");
      const { handoff } = result, temporary = handoff.temporaryPackage;
      assert.ok(temporary);
      await observePrivacy(scenario, "AVAILABLE", signal);
      const state = await currentMetadata();
      assert.equal(state.temporary_payload_state, "AVAILABLE");
      assert.equal(state.temporary_payload_expires_at.toISOString(), temporary.expiresAt, "DEC017_EXACT_EXPIRY");
      assert.equal(handoff.sourceEvidence.aggregateDigest, expectedSourceManifestDigest(manifest));
      assert.equal(handoff.expectedInstances.length, manifest.instanceCount, "DEC020_EXPECTED_METADATA_COUNT");
      assert.equal(temporary.instances.length, manifest.instanceCount, "DEC020_TEMP_METADATA_COUNT");
      for (const instance of [...handoff.expectedInstances, ...temporary.instances]) {
        assert.equal(instance.sopClassUid, manifest.sopClassUID, "DEC020_VALIDATED_CT_CLASS");
        assert.equal(instance.transferSyntaxUid, manifest.transferSyntaxUID, "DEC020_ACTUAL_WADO_SYNTAX");
        assert.ok(Object.isFrozen(instance), "DEC020_IMMUTABLE_TRANSPORT_METADATA");
      }
      const readInput = objectRef => ({ principal: signedPrincipal, tenantCandidate: fixture.tenantId,
        correlationId: scenario.correlationId, consentId: scenario.consentId, grantId: scenario.grantId, handoff, objectRef });
      const consume = async bytes => { await verifyOverlap('CONSUMER'); callbacks += 1; };
      if (scenario.boundary === 'BEFORE') await applyMutation();
      const verifyExactRead = async (selectedHandoff, instance) => {
        const known = manifest.instances.find(item => item.sopInstanceUID === instance.sopInstanceUid);
        assert.ok(known);
        assert.equal(basename(known.file), known.file, "DEC017_FIXTURE_PATH_BOUNDED");
        const expected = await readFile(join(dirname(manifestPath), known.file));
        let borrowed;
        await harness.service.consumeCapturedInstance({ ...readInput(instance.objectRef), handoff: selectedHandoff }, async bytes => {
          await consume(bytes); borrowed = bytes;
          assert.ok(bytes.equals(expected), "DEC017_EXACT_KNOWN_DICOM_BYTES");
          assert.equal(createHash("sha256").update(bytes).digest("hex"), known.sha256);
        });
        assert.ok(borrowed.every(byte => byte === 0), "DEC017_BORROWED_ZEROED");
      };
      if (["roundtrip", "concurrent_capture", "replay_refetch", "replica_recovery"].includes(scenario.name)) {
        for (const instance of temporary.instances) {
          const known = manifest.instances.find(item => item.sopInstanceUID === instance.sopInstanceUid);
          assert.ok(known);
          assert.equal(basename(known.file), known.file, "DEC017_FIXTURE_PATH_BOUNDED");
          const expected = await readFile(join(dirname(manifestPath), known.file));
          const encrypted = await readFile(join(storageRoot, temporary.storageRef, `${instance.objectRef}.enc`));
          assert.equal(encrypted.equals(expected), false, "DEC017_NOT_PLAINTEXT_ON_DISK");
          assert.equal(encrypted.byteLength, expected.byteLength);
          await verifyExactRead(handoff, instance);
        }
        assert.equal(callbacks, manifest.instanceCount);
        // Clone rejection must not turn handoff data into a capability.
        await assert.rejects(harness.service.consumeCapturedInstance({ ...readInput(temporary.instances[0].objectRef), handoff: { ...handoff } }, consume), { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
        await assert.rejects(harness.service.consumeCapturedInstance({ ...readInput(temporary.instances[0].objectRef), principal: crossPrincipal, tenantCandidate: fixture.otherTenantId }, consume), { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
        assert.equal(callbacks, manifest.instanceCount);
        if (scenario.name === "replica_recovery") {
          await runReplicaProcess({ root, auth, signedToken, crossToken: await token(fixture.otherTenantSubject), handoff }, signal);
          await assert.rejects(harness.service.consumeCapturedInstance(readInput(temporary.instances[0].objectRef), consume),
            { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
          assert.equal(callbacks, manifest.instanceCount, "DEC017_REPLICA_OLD_PARENT_HANDOFF_DENIED");
        }
      } else {
        if (scenario.name.startsWith("ciphertext_")) {
          const target = join(storageRoot, temporary.storageRef, `${temporary.instances[0].objectRef}.enc`);
          let changed = await readFile(target);
          if (scenario.name === "ciphertext_tampered") changed[0] ^= 1;
          if (scenario.name === "ciphertext_truncated") changed = changed.subarray(0, changed.length - 1);
          if (scenario.name === "ciphertext_swapped") changed = await readFile(join(storageRoot,
            temporary.storageRef, `${temporary.instances[1].objectRef}.enc`));
          await writeFile(target, changed);
        }
        await assert.rejects(harness.service.consumeCapturedInstance(readInput(temporary.instances[0].objectRef), consume), { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
        assert.equal(callbacks, 0, "DEC017_DENIED_BEFORE_CALLBACK");
        if (scenario.mutation) await restoreAfterDenial(temporary.storageRef);
      }
      await observePrivacy(scenario, "READ_RESULT", signal);
      const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, port);
      const purgeInput = { principal: signedPrincipal, tenantCandidate: fixture.tenantId,
        binding: operationBinding,
        storageRef: temporary.storageRef, correlationId: scenario.correlationId, reason: "EXPLICIT_CLOSE" };
      if (scenario.name === "replay_refetch") {
        const before = await currentMetadata();
        await assert.rejects(harness.service.captureForCoordinator(input), { message: "SOURCE_CAPTURE_UNAVAILABLE" });
        assert.deepEqual(await currentMetadata(), before, "DEC017_REPLAY_PRESERVES_TTL_REF");
        assert.equal(attempted.length, 1); assert.equal(harness.counters().instanceCalls, 3);
      }
      assert.deepEqual(await purge.purge(purgeInput), { kind: scenario.name === "replica_recovery" ? "ALREADY_PURGED" : "PURGED" });
      assert.deepEqual(await purge.purge(purgeInput), { kind: "ALREADY_PURGED" });
      if (scenario.name === "replay_refetch") {
        const replacement = await harness.service.captureForCoordinator(input);
        assert.equal(replacement.kind, "CAPTURED_FOR_COORDINATOR");
        const newTemporary = replacement.handoff.temporaryPackage;
        await observePrivacy(scenario, "AVAILABLE", signal);
        assert.notEqual(newTemporary.storageRef, temporary.storageRef);
        assert.equal(replacement.handoff.sourceEvidence.evidenceId, handoff.sourceEvidence.evidenceId,
          "DEC017_REUSES_ONLY_MATCHING_PENDING_EVIDENCE");
        await assert.rejects(harness.service.consumeCapturedInstance(readInput(temporary.instances[0].objectRef), consume),
          { message: "TEMPORARY_IMAGING_READ_UNAVAILABLE" });
        assert.equal(callbacks, 3);
        for (const instance of newTemporary.instances) await verifyExactRead(replacement.handoff, instance);
        assert.equal(callbacks, 6);
        assert.equal((await currentMetadata()).temporary_storage_ref, newTemporary.storageRef);
        await purge.purge({ ...purgeInput, storageRef: newTemporary.storageRef });
        assert.equal(attempted.length, 2);
      }
    }
    const finalState = await currentMetadata();
    assert.equal(finalState.temporary_payload_state, noAllocation ? null : "PURGED", "DEC017_FINAL_PURGED");
    if (noAllocation) assert.ok(Object.values(finalState).every(value => value === null));
    else assert.ok(finalState.temporary_payload_purged_at instanceof Date);
    assert.deepEqual(await children(storageRoot), []);
    await observePrivacy(scenario, "FINAL", signal);
    if (overlapObserver) {
      assert.ok(overlapObserver.counts().SOURCE >= 4);
      assert.ok(overlapObserver.counts().WRITE >= 3);
      assert.equal(overlapObserver.counts().SYNC, 3);
      assert.equal(overlapObserver.counts().CONSUMER, 3);
      assert.equal(overlapObserver.counts().PURGE, 2);
      await overlapObserver.close();
    }
    const counts = harness.counters();
    const expectedInstances = noAllocation ? 0 : actorCapture || ["capture_write_failure", "capture_fsync_failure"].includes(scenario.name) ? 1
      : scenario.name === "replay_refetch" ? 6 : 3;
    assert.equal(counts.instanceCalls, expectedInstances);
    assert.equal(counts.activeTenantTransactions, 0);
    assert.equal(counts.stowCalls, 0);
    assert.equal(counts.forbiddenEndpointAttempts, 0);
    assert.equal(counts.destinationVerificationCalls, 0);
    assert.equal(counts.maximumActiveInstanceStreams, noAllocation ? 0 : 1);
    // Write failure may cancel before the prefetching monitor observes EOF.
    // No second instance may open; fsync failure occurs after complete input.
    if (scenario.name === "capture_write_failure" || actorCapture) assert.ok(counts.observedInstanceStreams.length <= 1);
    else assert.equal(counts.observedInstanceStreams.length, expectedInstances);
    assert.equal(counts.activeInstanceStreams, 0, "DEC017_NO_DANGLING_SOURCE_STREAM");
    const checkedOut = await harness.database.connect();
    try { assert.ok(["", null].includes((await checkedOut.query("SELECT current_setting('mediq.tenant_id',true) AS tenant")).rows[0].tenant)); }
    finally { checkedOut.release(); }
  } catch (error) {
    const fixed = value => typeof value === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(value) ? value : "SUPPRESSED";
    const line = /authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):/.exec(error?.stack ?? "")?.[1] ?? "0";
    const markers = [`DEC017_CASE_${scenario.name.toUpperCase()}`,
      `DEC017_ERROR_${fixed(error?.code ?? error?.message)}`, `DEC017_ORIGIN_LINE_${line}`];
    const counts = harness?.counters();
    markers.push(...sourceFailureMarkers(counts?.sourceFailures));
    for (const item of counts?.databaseFailures ?? []) {
      if (/^[A-Z0-9_]{1,120}$/.test(item)) markers.push(`DEC017_QUERY_${item}`);
    }
    // Never serialize assertions' actual/expected values, SQL parameters or tokens.
    throw new Error([...new Set(markers)].join(" "));
  } finally {
    // Fixture teardown cannot count as product purge. The assertions above
    // run first; failures remain failures even when owned scratch data is removed.
    try {
      let overlapCleanupFailed = false;
      if (overlapObserver) await overlapObserver.close().catch(() => { overlapCleanupFailed = true; });
      releaseReservation();
      if (winner) await winner.catch(() => undefined);
      if (store) for (const target of attempted) await store.purgeByReference(target);
      if (root) {
        assert.equal(resolve(dirname(root)), resolve(tmpdir()));
        assert.ok(basename(root).startsWith("mediq-orthanc-lifecycle-"));
        await rm(root, { recursive: true, force: true });
        await assert.rejects(stat(root), { code: "ENOENT" });
      }
      if (overlapCleanupFailed) throw new Error('DEC017_OVERLAP_CLEANUP_FAILED');
    } finally {
      await harness?.database.onModuleDestroy();
      server.closeAllConnections();
      await new Promise(done => server.close(done));
    }
  }
}

function dispatchedReadFailureMarkers(error) {
  const checks = ['DISPREAD_ACTUAL_SELECT_COUNT','DISPREAD_ACTUAL_SELECT_MATCHES',
    'DISPREAD_REAL_COMMIT_ACK_FAULT','DISPREAD_VERIFIER_COMMITS','DISPREAD_DENIED_DELIVERY',
    'DISPREAD_NO_RETRY_QUERY','DISPREAD_NO_RETRY_AUTHORITY','DISPREAD_AUDITED_PURGE',
    'DISPREAD_ACTUAL_SOURCE_CAPTURE','DISPREAD_EXACT_ORIGINAL_BYTES','DISPREAD_ZERO_BEFORE_EOF'];
  const check = error?.code === 'ERR_ASSERTION'
    ? checks.find(value => error.message === value || error.message?.startsWith(`${value}\n`)) ?? 'SUPPRESSED'
    : 'SUPPRESSED';
  const code = ['ERR_ASSERTION','TEMPORARY_IMAGING_READ_UNAVAILABLE','DISPREAD_COMMIT_ACK_LOST'].includes(error?.code ?? error?.message)
    ? error.code ?? error.message : 'SUPPRESSED';
  const line = /authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):/.exec(error?.stack ?? '')?.[1] ?? '0';
  return Object.freeze({ code, check, line });
}

async function dispatchTestTransition(harness, signedPrincipal, scenario, nextState, omitAudit = false) {
  // Test setup only: a ledger state is not full Preflight or permission to STOW.
  return harness.actorContext.run(signedPrincipal, fixture.tenantId, async (_identity, client) => {
    const selected = await client.query(`SELECT operation_id,tenant_id,exchange_session_id,study_ref_id,actor_id,
      idempotency_key,request_digest,state,version,reason_code,source_object_count,destination_object_count,
      created_at,updated_at,stow_started_at FROM pacs_transfer_operations WHERE operation_id=$1`, [scenario.operationId]);
    assert.equal(selected.rowCount, 1, 'DISPREAD_TRANSITION_VISIBLE');
    const row = selected.rows[0];
    const current = PacsTransferOperation.reconstitute({ operationId: row.operation_id, tenantId: row.tenant_id,
      exchangeSessionId: row.exchange_session_id, studyRefId: row.study_ref_id, actorId: row.actor_id,
      idempotencyKey: row.idempotency_key, requestDigest: row.request_digest, state: row.state,
      version: row.version, reasonCode: row.reason_code, sourceObjectCount: row.source_object_count,
      destinationObjectCount: row.destination_object_count, createdAt: row.created_at, updatedAt: row.updated_at,
      stowStartedAt: row.stow_started_at });
    const timestamp = new Date(Math.max(Date.now(), current.snapshot.updatedAt.getTime()) +
      (scenario.name === 'future_dispatch' && nextState === 'STOW_STARTED' ? 300_000 : 0));
    const next = current.transitionTo({ nextState, now: timestamp, sourceObjectCount: scenario.count });
    if (!omitAudit) return new PostgresPacsTransferOperationRepository(client).transition({ current, next,
      correlationId: scenario.correlationId });
    // Deliberately incomplete test claim: legal trigger/CAS update WITHOUT an
    // audit, using already-granted runtime columns. Product must reject it.
    const changed = await client.query(`UPDATE pacs_transfer_operations SET state=$1,version=$2,
      source_object_count=$3,updated_at=$4,stow_started_at=$5
      WHERE operation_id=$6 AND tenant_id=$7 AND actor_id=$8 AND state=$9 AND version=$10`,
    [next.snapshot.state,next.snapshot.version,next.snapshot.sourceObjectCount,next.snapshot.updatedAt,next.snapshot.stowStartedAt,
      scenario.operationId,fixture.tenantId,current.snapshot.actorId,current.snapshot.state,current.snapshot.version]);
    assert.equal(changed.rowCount, 1, 'DISPREAD_MISSING_AUDIT_FIXTURE_CAS');
    return next;
  });
}

async function runDispatchedReadCase(scenario, principals, auth, signal) {
  let root, store, harness, handoff;
  const attempted = [], borrows = [];
  let delivered = 0, observedReadChecks = 0;
  try {
    assert.equal(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, undefined, 'DISPREAD_NO_OWNER_URL');
    assert.equal(process.env.MEDIQ_MIGRATION_DATABASE_URL, undefined, 'DISPREAD_NO_MIGRATOR_URL');
    root = await mkdtemp(join(tmpdir(), 'mediq-dispatched-read-'));
    const storageRoot = join(root, 'ciphertext');
    store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, ciphertextIo: {
      async write(file, bytes, offset, length, position) {
        harness.assertOutsideTransaction(); return file.write(bytes, offset, length, position);
      }, async sync(file) { harness.assertOutsideTransaction(); return file.sync(); },
    } });
    const port = {
      async beginReservedPackage(binding, ref, quota) {
        harness.assertOutsideTransaction(); attempted.push({ storageRef: ref, binding });
        return store.beginReservedPackage(binding, ref, quota);
      },
      beginInstance: input => store.beginInstance(input), sealPackage: input => store.sealPackage(input),
      async purgeByReference(input) { harness.assertOutsideTransaction(); await store.purgeByReference(input); },
      async consumeInstance(input, verify, consume) {
        harness.assertOutsideTransaction();
        let phase = 0;
        await store.consumeInstance(input, async (...args) => {
          const verified = await verify(...args);
          harness.assertOutsideTransaction(); phase++; observedReadChecks++;
          if (phase === 1 && scenario.name === 'revoked_between') {
            const outcome = await new GrantRevocationService(harness.actorContext).revoke({
              principal: principals.clinician, tenantCandidate: fixture.tenantId, sessionId: scenario.sessionId,
              grantId: scenario.grantId, correlationId: scenario.revokeCorrelationId, hasUnexpectedInput: false,
            });
            assert.equal(outcome.grant.status, 'REVOKED', 'DISPREAD_GRANT_COMMITTED');
          }
          if (phase === 1 && scenario.name === 'withdrawn_between') {
            const outcome = await new ConsentWithdrawalService(harness.actorContext).withdraw({
              principal: principals.patient, tenantCandidate: fixture.tenantId, sessionId: scenario.sessionId,
              consentId: scenario.consentId, correlationId: scenario.revokeCorrelationId, hasUnexpectedInput: false,
            });
            assert.equal(outcome.consent.status, 'WITHDRAWN', 'DISPREAD_CONSENT_COMMITTED');
          }
          if (phase === 1 && scenario.name === 'state_changed_between') {
            await dispatchTestTransition(harness, principals.clinician, scenario, 'VERIFYING');
          }
          return verified;
        }, async (bytes, consumerSignal) => {
          harness.assertOutsideTransaction(); delivered++; borrows.push(bytes);
          await consume(bytes, consumerSignal);
        });
      },
    };
    harness = createHarness({ temporaryImagingStore: port, oidcAuthentication: auth, observeInstanceStreams: true,
      dispatchReadCommitAckLoss: scenario.name === 'commit_ack_lost' });
    const runtime = await harness.database.connect();
    try {
      const role = await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
      assert.deepEqual(role.rows[0], { role: 'mediq_runtime', rolsuper: false, rolbypassrls: false });
      await assertRuntimePrivilegeCatalog(runtime);
      for (const table of ['pacs_transfer_operations','provenance_records','study_references']) {
        assert.deepEqual((await runtime.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [table])).rows[0],
          { relrowsecurity: true, relforcerowsecurity: true });
      }
      assert.equal((await runtime.query('SELECT operation_id FROM pacs_transfer_operations WHERE operation_id=$1', [scenario.operationId])).rowCount, 0, 'DISPREAD_NO_CONTEXT_OPERATION');
      assert.equal((await runtime.query('SELECT study_ref_id FROM study_references WHERE study_ref_id=$1', [scenario.studyRefId])).rowCount, 0, 'DISPREAD_NO_CONTEXT_SOURCE');
      assert.equal((await runtime.query('SELECT provenance_id FROM provenance_records WHERE operation_id=$1', [scenario.operationId])).rowCount, 0, 'DISPREAD_NO_CONTEXT_PROVENANCE');
    } finally { runtime.release(); }
    await harness.actorContext.run(principals.cross, fixture.otherTenantId, async (_identity, client) => {
      assert.equal((await client.query('SELECT operation_id FROM pacs_transfer_operations WHERE operation_id=$1', [scenario.operationId])).rowCount, 0, 'DISPREAD_CROSS_TENANT_OWNERSHIP');
    });
    const capture = await harness.service.captureForCoordinator({ principal: principals.clinician,
      tenantCandidate: fixture.tenantId, correlationId: scenario.correlationId, operationId: scenario.operationId,
      consentId: scenario.consentId, grantId: scenario.grantId, signal });
    assert.equal(capture.kind, 'CAPTURED_FOR_COORDINATOR', 'DISPREAD_ACTUAL_SOURCE_CAPTURE');
    handoff = capture.handoff;
    assert.ok(handoff.temporaryPackage, 'DISPREAD_ACTUAL_ENCRYPTED_PACKAGE');
    if (!['no_provenance','wrong_provenance'].includes(scenario.name)) {
      await harness.actorContext.run(principals.clinician, fixture.tenantId, async (_identity, client) => {
        const pending = await new PostgresProvenanceRepository(client).createPendingForPacsImport({
          operationId: scenario.operationId, now: new Date(),
        });
        assert.equal(pending.created, true, 'DISPREAD_REPOSITORY_PENDING_PROVENANCE');
      });
    }
    await dispatchTestTransition(harness, principals.clinician, scenario, 'PREFLIGHT_PASSED', scenario.name === 'missing_preflight_audit');
    if (scenario.name !== 'not_dispatched') {
      await dispatchTestTransition(harness, principals.clinician, scenario, 'STOW_STARTED', scenario.name === 'missing_dispatch_audit');
    }
    const request = { principal: principals.clinician, tenantCandidate: fixture.tenantId, correlationId: scenario.correlationId,
      consentId: scenario.consentId, grantId: scenario.grantId, handoff, objectRef: handoff.temporaryPackage.instances[0].objectRef, signal };
    if (scenario.name === 'valid') {
      const before = harness.counters();
      await assert.rejects(harness.service.consumeCapturedInstance(request, async () => { throw new Error('DISPREAD_FORBIDDEN_OLD_READ'); }),
        { message: 'TEMPORARY_IMAGING_READ_UNAVAILABLE' });
      await assert.rejects(harness.service.consumeDispatchedInstance({ ...request, handoff: structuredClone(handoff) }, async () => {}),
        { message: 'TEMPORARY_IMAGING_READ_UNAVAILABLE' });
      assert.equal(harness.counters().dispatchClaimQueries, before.dispatchClaimQueries, 'DISPREAD_CLONE_NO_QUERY');
      const factory = new DispatchedInstanceStreamFactory(harness.service);
      for (const instance of handoff.temporaryPackage.instances) {
        const known = manifest.instances.find(item => item.sopInstanceUID === instance.sopInstanceUid);
        assert.ok(known, 'DISPREAD_KNOWN_INSTANCE');
        assert.equal(instance.sopClassUid, manifest.sopClassUID, 'DISPREAD_CT_CLASS');
        assert.equal(instance.transferSyntaxUid, manifest.transferSyntaxUID, 'DISPREAD_ACTUAL_SYNTAX');
        assert.equal(basename(known.file), known.file, 'DISPREAD_KNOWN_FILE');
        const expected = await readFile(join(dirname(manifestPath), known.file));
        const reader = factory.open({ ...request, objectRef: instance.objectRef }).getReader(), chunks = [];
        try {
          while (true) {
            const item = await reader.read(); if (item.done) break;
            assert.ok(item.value.byteLength > 0 && item.value.byteLength <= 65536, 'DISPREAD_BOUNDED_OWNED_CHUNK');
            assert.notEqual(item.value.buffer, borrows.at(-1).buffer, 'DISPREAD_NO_BORROW_ALIAS');
            chunks.push(item.value);
          }
          assert.ok(borrows.at(-1).every(byte => byte === 0), 'DISPREAD_ZERO_BEFORE_EOF');
          const actual = Buffer.concat(chunks);
          assert.ok(actual.equals(expected), 'DISPREAD_EXACT_ORIGINAL_BYTES');
          assert.equal(createHash('sha256').update(actual).digest('hex'), known.sha256, 'DISPREAD_EXACT_HASH');
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        await assert.rejects(harness.service.consumeDispatchedInstance({ ...request, objectRef: instance.objectRef }, async () => {}),
          { message: 'TEMPORARY_IMAGING_READ_UNAVAILABLE' });
      }
      assert.equal(delivered, 3, 'DISPREAD_ONE_CONSUMER_PER_OBJECT');
    } else {
      const read = scenario.name === 'cross_tenant' ? { ...request, principal: principals.cross, tenantCandidate: fixture.otherTenantId } : request;
      await assert.rejects(harness.service.consumeDispatchedInstance(read, async () => {
        if (scenario.name === 'consumer_failure') throw new Error('DISPREAD_TEST_CONSUMER_FAILURE');
        throw new Error('DISPREAD_FORBIDDEN_DELIVERY');
      }), { message: 'TEMPORARY_IMAGING_READ_UNAVAILABLE' });
      assert.equal(delivered, scenario.name === 'consumer_failure' ? 1 : 0, 'DISPREAD_DENIED_DELIVERY');
      if (['consumer_failure','commit_ack_lost','read_audit_failure'].includes(scenario.name)) {
        const beforeRetry = harness.counters();
        await assert.rejects(harness.service.consumeDispatchedInstance(request, async () => { throw new Error('DISPREAD_FORBIDDEN_RETRY'); }),
          { message: 'TEMPORARY_IMAGING_READ_UNAVAILABLE' });
        assert.equal(harness.counters().dispatchClaimQueries, beforeRetry.dispatchClaimQueries, 'DISPREAD_NO_RETRY_QUERY');
        assert.equal(harness.counters().tenantContextRuns, beforeRetry.tenantContextRuns, 'DISPREAD_NO_RETRY_AUTHORITY');
      }
    }
    assert.ok(borrows.every(buffer => buffer.every(byte => byte === 0)), 'DISPREAD_ALL_BORROWS_ZEROED');
    const counts = harness.counters();
    assert.equal(counts.dispatchClaimQueries, scenario.claimQueries, 'DISPREAD_ACTUAL_SELECT_COUNT');
    assert.equal(counts.dispatchClaimMatches, scenario.claimMatches, 'DISPREAD_ACTUAL_SELECT_MATCHES');
    assert.equal(counts.lostCommitAcknowledgements, scenario.name === 'commit_ack_lost' ? 1 : 0, 'DISPREAD_REAL_COMMIT_ACK_FAULT');
    assert.equal(observedReadChecks, scenario.name === 'commit_ack_lost' ? 0 : scenario.beforeDecrypt + scenario.beforeDelivery, 'DISPREAD_VERIFIER_COMMITS');
    assert.equal(counts.instanceCalls, 3, 'DISPREAD_NO_SOURCE_REFETCH');
    assert.equal(counts.sourceRequests.length, 4, 'DISPREAD_INITIAL_WADO_ONLY');
    assert.equal(counts.stowCalls + counts.destinationVerificationCalls + counts.forbiddenEndpointAttempts, 0, 'DISPREAD_NO_B_EFFECT');
    assert.equal(counts.activeTenantTransactions, 0, 'DISPREAD_NO_OPEN_OWN_TRANSACTION');
    const binding = { operationId: scenario.operationId, tenantId: fixture.tenantId, exchangeSessionId: scenario.sessionId,
      packageId: scenario.packageId, studyRefId: scenario.studyRefId, sourceHospitalId: TEST_HOSPITAL_A_ID };
    const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, port);
    const closed = await purge.purge({ principal: principals.clinician, tenantCandidate: fixture.tenantId, binding,
      storageRef: handoff.temporaryPackage.storageRef, correlationId: scenario.correlationId, reason: 'EXPLICIT_CLOSE' });
    assert.equal(closed.kind, 'PURGED', 'DISPREAD_AUDITED_PURGE');
    assert.deepEqual(await readdir(storageRoot), [], 'DISPREAD_PHYSICAL_ABSENCE');
    await harness.actorContext.run(principals.clinician, fixture.tenantId, async (_identity, client) => {
      const rows = await client.query(`SELECT temporary_payload_state,temporary_payload_purged_at FROM study_references WHERE study_ref_id=$1`, [scenario.studyRefId]);
      assert.equal(rows.rows[0].temporary_payload_state, 'PURGED', 'DISPREAD_METADATA_PURGED');
      assert.ok(rows.rows[0].temporary_payload_purged_at instanceof Date, 'DISPREAD_PURGE_EVIDENCE');
      const op = (await client.query('SELECT state,version,source_object_count,request_digest FROM pacs_transfer_operations WHERE operation_id=$1', [scenario.operationId])).rows[0];
      assert.equal(op.state, scenario.state, 'DISPREAD_NOT_COMPLETED'); assert.equal(op.version, scenario.version);
      assert.equal(op.source_object_count, scenario.count); assert.equal(op.request_digest, dispatchedReadDigest(scenario));
    });
  } catch (error) {
    const { code, check, line } = dispatchedReadFailureMarkers(error);
    const database = (harness?.counters().databaseFailures ?? []).filter(value => /^[A-Z0-9_]{1,100}$/.test(value)).slice(-3);
    throw new Error(`DISPREAD_CASE_${scenario.name.toUpperCase()} DISPREAD_ERROR_${code} DISPREAD_CHECK_${check} DISPREAD_ORIGIN_${line} ${database.map(value => `DISPREAD_QUERY_${value}`).join(' ')}`);
  } finally {
    try { for (const input of attempted) await store?.purgeByReference(input); }
    finally {
      try { await harness?.database.onModuleDestroy(); }
      finally {
        if (root) {
          assert.equal(resolve(dirname(root)), resolve(tmpdir()), 'DISPREAD_OWNED_ROOT');
          assert.ok(basename(root).startsWith('mediq-dispatched-read-'), 'DISPREAD_OWNED_PREFIX');
          await rm(root, { recursive: true, force: true });
          await assert.rejects(stat(root), error => error.code === 'ENOENT');
        }
      }
    }
  }
}

async function runActualDispatchedReadMatrix(t) {
  const keys = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'TEST-DISPATCH-READ', alg: 'RS256', use: 'sig' };
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url !== '/jwks') return response.writeHead(404).end();
    requests++; response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  try {
    await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
    const auth = { issuer: fixture.issuer, audience: 'TEST-DISPATCH-READ', jwksUri: `http://127.0.0.1:${server.address().port}/jwks` };
    const verifier = new RemoteJwksOidcTokenVerifier(auth);
    const sign = (subject, claims = {}, audience = auth.audience) => new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'at+jwt' }).setIssuer(auth.issuer).setAudience(audience)
      .setSubject(subject).setNotBefore(Math.floor(Date.now()/1000)-1).setExpirationTime('5m').sign(keys.privateKey);
    await assert.rejects(verifier.verify(await sign(fixture.subject, {}, 'TEST-WRONG')), { message: 'AUTHENTICATION_TOKEN_INVALID' });
    const principals = { clinician: await verifier.verify(await sign(fixture.subject)),
      cross: await verifier.verify(await sign(fixture.otherTenantSubject)),
      patient: await verifier.verify(await sign('synthetic-int001-patient-actor', { mediq_patient_ref_id: fixture.patientRefId })) };
    assert.ok(requests > 0, 'DISPREAD_REAL_JWKS');
    assert.equal(fixture.tenantId, dispatchedReadIds.tenant); assert.equal(fixture.actorId, dispatchedReadIds.actor);
    for (const scenario of dispatchedReadCases) {
      await t.test(`DISPREAD actual ${scenario.name}`, { timeout: 30_000 }, child => runDispatchedReadCase(scenario, principals, auth, child.signal));
    }
  } finally {
    server.closeAllConnections();
    await new Promise((done, fail) => server.close(error => error ? fail(error) : done()));
  }
}

async function runDestinationVerificationCase(scenario, principals, auth, signal) {
  let root, store, harness;
  const attempted = [];
  try {
    assert.equal(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, undefined, 'DESTVERIFY_NO_OWNER_URL');
    assert.equal(process.env.MEDIQ_MIGRATION_DATABASE_URL, undefined, 'DESTVERIFY_NO_MIGRATOR_URL');
    root = await mkdtemp(join(tmpdir(), 'mediq-destination-verify-'));
    const storageRoot = join(root, 'ciphertext');
    store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, ciphertextIo: {
      async write(file, bytes, offset, length, position) {
        harness.assertOutsideTransaction(); return file.write(bytes,offset,length,position);
      }, async sync(file) { harness.assertOutsideTransaction(); return file.sync(); },
    } });
    const port = {
      async beginReservedPackage(binding, ref, quota) {
        harness.assertOutsideTransaction(); attempted.push({ storageRef:ref,binding });
        return store.beginReservedPackage(binding,ref,quota);
      },
      beginInstance: input => store.beginInstance(input), sealPackage: input => store.sealPackage(input),
      async purgeByReference(input) { harness.assertOutsideTransaction(); await store.purgeByReference(input); },
      consumeInstance: (...args) => store.consumeInstance(...args),
    };
    harness = createHarness({ temporaryImagingStore:port,oidcAuthentication:auth,observeInstanceStreams:true,
      destinationVerification:true,destinationCommitAckLoss:scenario.name === 'commit_ack_lost',
      async afterDestinationBytes(count) {
        if (['revoked_between','withdrawn_between'].includes(scenario.name)) assert.equal(count,1,'DESTVERIFY_REVOKE_FIRST_INSTANCE');
        if (scenario.name === 'revoked_between') {
          const result = await new GrantRevocationService(harness.actorContext).revoke({
            principal:principals.clinician,tenantCandidate:fixture.tenantId,sessionId:scenario.sessionId,
            grantId:scenario.grantId,correlationId:scenario.revokeCorrelationId,hasUnexpectedInput:false });
          assert.equal(result.grant.status,'REVOKED','DESTVERIFY_GRANT_COMMITTED');
        } else if (scenario.name === 'withdrawn_between') {
          const result = await new ConsentWithdrawalService(harness.actorContext).withdraw({
            principal:principals.patient,tenantCandidate:fixture.tenantId,sessionId:scenario.sessionId,
            consentId:scenario.consentId,correlationId:scenario.revokeCorrelationId,hasUnexpectedInput:false });
          assert.equal(result.consent.status,'WITHDRAWN','DESTVERIFY_CONSENT_COMMITTED');
        }
      },
    });
    const runtime = await harness.database.connect();
    try {
      assert.deepEqual((await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],
        { role:'mediq_runtime',rolsuper:false,rolbypassrls:false });
      await assertRuntimePrivilegeCatalog(runtime);
      for (const table of ['pacs_transfer_operations','provenance_records','study_references','integrity_evidence','audit_events']) {
        assert.deepEqual((await runtime.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[table])).rows[0],
          { relrowsecurity:true,relforcerowsecurity:true });
      }
      for (const [sql,id] of [['SELECT operation_id FROM pacs_transfer_operations WHERE operation_id=$1',scenario.operationId],
        ['SELECT study_ref_id FROM study_references WHERE study_ref_id=$1',scenario.studyRefId],
        ['SELECT provenance_id FROM provenance_records WHERE operation_id=$1',scenario.operationId]]) {
        assert.equal((await runtime.query(sql,[id])).rowCount,0,'DESTVERIFY_NO_CONTEXT_GRAPH');
      }
    } finally { runtime.release(); }
    await harness.actorContext.run(principals.cross,fixture.otherTenantId,async (_identity,client) => {
      assert.equal((await client.query('SELECT operation_id FROM pacs_transfer_operations WHERE operation_id=$1',[scenario.operationId])).rowCount,
        0,'DESTVERIFY_CROSS_TENANT_GRAPH');
    });
    const captured = await harness.service.captureForCoordinator({ principal:principals.clinician,tenantCandidate:fixture.tenantId,
      correlationId:scenario.correlationId,operationId:scenario.operationId,consentId:scenario.consentId,grantId:scenario.grantId,signal });
    assert.equal(captured.kind,'CAPTURED_FOR_COORDINATOR','DESTVERIFY_ACTUAL_SOURCE_CAPTURE');
    const handoff = captured.handoff;
    assert.ok(handoff.temporaryPackage,'DESTVERIFY_ACTUAL_ENCRYPTED_PACKAGE');
    assert.equal(handoff.sourceEvidence.aggregateDigest,expectedSourceManifestDigest(manifest),'DESTVERIFY_KNOWN_SOURCE_HASH');
    if (scenario.name !== 'no_provenance') await harness.actorContext.run(principals.clinician,fixture.tenantId,async (_identity,client) => {
      assert.equal((await new PostgresProvenanceRepository(client).createPendingForPacsImport({operationId:scenario.operationId,now:new Date()})).created,
        true,'DESTVERIFY_PENDING_PROVENANCE');
    });
    // Legal synthetic state fixture only; not a real Preflight or STOW invocation.
    for (const [state,missing] of [['PREFLIGHT_PASSED','missing_preflight_audit'],['STOW_STARTED','missing_dispatch_audit'],['VERIFYING','missing_verifying_audit']]) {
      await dispatchTestTransition(harness,principals.clinician,scenario,state,scenario.name === missing);
    }
    const request = { principal:principals.clinician,tenantCandidate:fixture.tenantId,correlationId:scenario.correlationId,
      consentId:scenario.consentId,grantId:scenario.grantId,handoff,signal };
    if (scenario.name === 'valid') {
      const proof = await harness.service.verifyDestinationIntegrity(request);
      assert.deepEqual(proof,{ operationId:scenario.operationId,exchangeSessionId:scenario.sessionId,packageId:scenario.packageId,
        studyRefId:scenario.studyRefId,sourceEvidenceId:handoff.sourceEvidence.evidenceId,algorithm:'SHA256-MANIFEST-V1',
        aggregateDigest:expectedSourceManifestDigest(manifest),objectCount:3,totalBytes:manifest.instances.reduce((n,item) => n+item.sizeBytes,0),
        comparedAt:proof.comparedAt },'DESTVERIFY_EXACT_PROOF');
      assert.ok(Object.isFrozen(proof) && Number.isFinite(Date.parse(proof.comparedAt)),'DESTVERIFY_FROZEN_PROOF');
    } else {
      const selected = scenario.name === 'cross_tenant' ? { ...request,principal:principals.cross,tenantCandidate:fixture.otherTenantId } : request;
      await assert.rejects(harness.service.verifyDestinationIntegrity(selected),{message:'DESTINATION_INTEGRITY_UNAVAILABLE'});
    }
    if (['valid','commit_ack_lost','verify_audit_failure'].includes(scenario.name)) {
      const before = harness.counters();
      await assert.rejects(harness.service.verifyDestinationIntegrity(request),{message:'DESTINATION_INTEGRITY_UNAVAILABLE'});
      const after = harness.counters();
      assert.equal(after.destinationClaimQueries,before.destinationClaimQueries,'DESTVERIFY_NO_RETRY_QUERY');
      assert.equal(after.tenantContextRuns,before.tenantContextRuns,'DESTVERIFY_NO_RETRY_AUTHORITY');
      assert.equal(after.destinationVerificationCalls,before.destinationVerificationCalls,'DESTVERIFY_NO_RETRY_READ');
    }
    const counts = harness.counters();
    assert.equal(counts.destinationVerificationCalls,scenario.identityCalls,'DESTVERIFY_IDENTITY_CALL_COUNT');
    assert.equal(counts.destinationByteCalls,scenario.byteCalls,'DESTVERIFY_BYTE_CALL_COUNT');
    const expectedQueries = scenario.name === 'cross_tenant' ? 0 : scenario.name === 'valid' ? 11 : scenario.byteCalls ? 3 : 1;
    const expectedMatches = ['valid','revoked_between','withdrawn_between','tampered','missing','extra','commit_ack_lost','verify_audit_failure'].includes(scenario.name) ? expectedQueries : 0;
    assert.equal(counts.destinationClaimQueries,expectedQueries,'DESTVERIFY_ACTUAL_SELECT_COUNT');
    assert.equal(counts.destinationClaimMatches,expectedMatches,'DESTVERIFY_ACTUAL_SELECT_MATCHES');
    assert.equal(counts.lostCommitAcknowledgements,scenario.name === 'commit_ack_lost' ? 1 : 0,'DESTVERIFY_REAL_COMMIT_ACK_FAULT');
    assert.equal(counts.destinationObserved.length,scenario.byteCalls,'DESTVERIFY_ACTUAL_BYTE_OBSERVATIONS');
    for (const observed of counts.destinationObserved) {
      const known = manifest.instances.find(item => item.sopInstanceUID === observed.sop);
      assert.ok(known,'DESTVERIFY_KNOWN_SOP'); assert.equal(observed.bytes,known.sizeBytes,'DESTVERIFY_ORIGINAL_LENGTH');
      if (scenario.name === 'tampered') assert.notEqual(observed.sha256,known.sha256,'DESTVERIFY_SAME_LENGTH_TAMPER');
      else assert.equal(observed.sha256,known.sha256,'DESTVERIFY_ORIGINAL_HASH');
    }
    assert.equal(counts.instanceCalls,3,'DESTVERIFY_NO_SOURCE_REFETCH');
    assert.equal(counts.sourceRequests.length,4,'DESTVERIFY_SOURCE_WADO_ONLY');
    assert.equal(counts.stowCalls + counts.forbiddenEndpointAttempts,0,'DESTVERIFY_NO_B_WRITE');
    assert.equal(counts.activeTenantTransactions,0,'DESTVERIFY_NO_OPEN_TRANSACTION');
    const binding = {operationId:scenario.operationId,tenantId:fixture.tenantId,exchangeSessionId:scenario.sessionId,
      packageId:scenario.packageId,studyRefId:scenario.studyRefId,sourceHospitalId:TEST_HOSPITAL_A_ID};
    assert.equal((await new TemporaryPayloadPurgeCoordinator(harness.actorContext,port).purge({principal:principals.clinician,
      tenantCandidate:fixture.tenantId,binding,storageRef:handoff.temporaryPackage.storageRef,correlationId:scenario.correlationId,
      reason:'EXPLICIT_CLOSE'})).kind,'PURGED','DESTVERIFY_AUDITED_PURGE');
    assert.deepEqual(await readdir(storageRoot),[],'DESTVERIFY_PHYSICAL_ABSENCE');
    if (scenario.name === 'valid') {
      assert.deepEqual(await harness.service.persistVerifiedDestinationIntegrity(request),{kind:'RECORDED'},'DESTVERIFY_PERSISTED_PROOF');
      await assert.rejects(harness.service.persistVerifiedDestinationIntegrity(request),
        {message:'DESTINATION_INTEGRITY_PERSISTENCE_UNAVAILABLE'},'DESTVERIFY_PERSIST_NO_REPLAY');
    }
    await harness.actorContext.run(principals.clinician,fixture.tenantId,async (_identity,client) => {
      const row = (await client.query('SELECT temporary_payload_state,temporary_payload_purged_at FROM study_references WHERE study_ref_id=$1',[scenario.studyRefId])).rows[0];
      assert.equal(row.temporary_payload_state,'PURGED','DESTVERIFY_METADATA_PURGED');
      assert.ok(row.temporary_payload_purged_at instanceof Date,'DESTVERIFY_PURGE_EVIDENCE');
      const op = (await client.query('SELECT state,version,source_object_count,request_digest FROM pacs_transfer_operations WHERE operation_id=$1',[scenario.operationId])).rows[0];
      assert.equal(op.state,'VERIFYING','DESTVERIFY_NOT_COMPLETED'); assert.equal(op.version,3);
      assert.equal(op.source_object_count,scenario.count); assert.equal(op.request_digest,dispatchedReadDigest(scenario));
      const evidence = (await client.query('SELECT integrity_id,verification_stage,status,source_digest,destination_digest,source_object_count,destination_object_count,verified_at FROM integrity_evidence WHERE operation_id=$1 ORDER BY verification_stage',[scenario.operationId])).rows;
      assert.equal(evidence.length,scenario.name === 'valid' ? 2 : 1,'DESTVERIFY_EVIDENCE_COUNT');
      const source = evidence.find(row => row.verification_stage === 'SOURCE_CAPTURE');
      assert.ok(source,'DESTVERIFY_SOURCE_EVIDENCE_EXISTS');
      assert.equal(source.status,'PENDING','DESTVERIFY_SOURCE_REMAINS_PENDING');
      assert.equal(source.verified_at,null,'DESTVERIFY_SOURCE_NOT_PROMOTED');
      const destination = evidence.find(row => row.verification_stage === 'DESTINATION_VERIFY');
      if (scenario.name === 'valid') {
        assert.ok(destination,'DESTVERIFY_DESTINATION_EVIDENCE_EXISTS');
        assert.equal(destination.status,'VERIFIED');
        assert.equal(destination.source_digest,expectedSourceManifestDigest(manifest));
        assert.equal(destination.destination_digest,expectedSourceManifestDigest(manifest));
        assert.equal(destination.source_object_count,3);
        assert.equal(destination.destination_object_count,3);
        assert.ok(destination.verified_at instanceof Date);
      } else assert.equal(destination,undefined,'DESTVERIFY_NO_FALSE_DESTINATION_EVIDENCE');
      const provenance = (await client.query('SELECT integrity_id,transfer_status,ingested_at,transferred_at FROM provenance_records WHERE operation_id=$1',[scenario.operationId])).rows;
      if (scenario.name === 'valid') {
        assert.equal(provenance.length,1);
        assert.equal(provenance[0].integrity_id,destination.integrity_id);
        assert.equal(provenance[0].transfer_status,'PENDING');
        assert.equal(provenance[0].ingested_at,null);
        assert.equal(provenance[0].transferred_at,null);
      } else if (provenance.length) assert.equal(provenance[0].integrity_id,null,'DESTVERIFY_NO_PREMATURE_PROVENANCE_LINK');
    });
  } catch (error) {
    const safe = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(value) ? value : 'SUPPRESSED';
    const assertion = error?.code === 'ERR_ASSERTION' ? /^DESTVERIFY_[A-Z0-9_]{1,100}/.exec(error.message ?? '')?.[0] : undefined;
    const line = /authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):/.exec(error?.stack ?? '')?.[1] ?? '0';
    const database = (harness?.counters().databaseFailures ?? []).filter(value => /^[A-Z0-9_]{1,100}$/.test(value)).slice(-3);
    throw new Error(`DESTVERIFY_CASE_${scenario.name.toUpperCase()} DESTVERIFY_ERROR_${safe(error?.code ?? error?.message)} DESTVERIFY_CHECK_${safe(assertion)} DESTVERIFY_ORIGIN_${line} ${database.map(value => `DESTVERIFY_QUERY_${value}`).join(' ')}`);
  } finally {
    try { for (const item of attempted) await store?.purgeByReference(item); }
    finally {
      try { await harness?.database.onModuleDestroy(); }
      finally {
        if (root) {
          assert.equal(resolve(dirname(root)),resolve(tmpdir()),'DESTVERIFY_OWNED_ROOT');
          assert.ok(basename(root).startsWith('mediq-destination-verify-'),'DESTVERIFY_OWNED_PREFIX');
          await rm(root,{recursive:true,force:true}); await assert.rejects(stat(root),error => error.code === 'ENOENT');
        }
      }
    }
  }
}

async function runActualDestinationVerificationMatrix(t) {
  const kind = process.env.MEDIQ_TEST_DESTINATION_FIXTURE_KIND;
  assert.ok(destinationFixtureKinds.includes(kind),'DESTVERIFY_FIXTURE_KIND');
  const keys = await generateKeyPair('RS256',{modulusLength:2048});
  const jwk = {...await exportJWK(keys.publicKey),kid:'TEST-DESTVERIFY',alg:'RS256',use:'sig'};
  let requests = 0;
  const server = createServer((request,response) => {
    if (request.url !== '/jwks') return response.writeHead(404).end();
    requests++; response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({keys:[jwk]}));
  });
  try {
    await new Promise((done,fail) => {server.once('error',fail);server.listen(0,'127.0.0.1',done);});
    const auth = {issuer:fixture.issuer,audience:'TEST-DESTVERIFY',jwksUri:`http://127.0.0.1:${server.address().port}/jwks`};
    const verifier = new RemoteJwksOidcTokenVerifier(auth);
    const sign = (subject,claims={},audience=auth.audience) => new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:jwk.kid,typ:'at+jwt'})
      .setIssuer(auth.issuer).setAudience(audience).setSubject(subject).setNotBefore(Math.floor(Date.now()/1000)-1).setExpirationTime('5m').sign(keys.privateKey);
    await assert.rejects(verifier.verify(await sign(fixture.subject,{},'TEST-WRONG')),{message:'AUTHENTICATION_TOKEN_INVALID'});
    const principals = {clinician:await verifier.verify(await sign(fixture.subject)),cross:await verifier.verify(await sign(fixture.otherTenantSubject)),
      patient:await verifier.verify(await sign('synthetic-int001-patient-actor',{mediq_patient_ref_id:fixture.patientRefId}))};
    assert.ok(requests > 0,'DESTVERIFY_REAL_JWKS');
    for (const scenario of destinationVerificationCases.filter(item => item.fixtureKind === kind)) {
      await t.test(`DESTVERIFY actual ${scenario.name}`,{timeout:30_000},child => runDestinationVerificationCase(scenario,principals,auth,child.signal));
    }
  } finally {server.closeAllConnections();await new Promise((done,fail) => server.close(error => error ? fail(error) : done()));}
}

function pacsImportDispatchFailureDiagnostic({ stowHookObserved, dispatchReturned, operationState,
  sourceReads, gatewayStows, bPosts, destinationChecks, error }) {
  const states = new Set(["CREATED", "PREFLIGHT_PASSED", "STOW_STARTED", "VERIFYING", "PARTIAL",
    "FAILED", "RESULT_UNKNOWN", "UNRESOLVED"]);
  const state = states.has(operationState) ? operationState : "UNKNOWN";
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100 ? String(value) : "OVER_LIMIT";
  const errorCategory = error?.name === "PacsImportTransferDispatchUnavailableError" ? "DISPATCH_UNAVAILABLE"
    : error?.name === "AssertionError" || error?.code === "ERR_ASSERTION" ? "ASSERTION_FAILURE" : "OTHER";
  return `pacs_dispatch_diagnostic=FAIL hook=${stowHookObserved ? "PASSED" : "NOT_REACHED"}` +
    ` returned=${dispatchReturned ? "yes" : "no"} operation_state=${state}` +
    ` source_reads=${count(sourceReads)} gateway_stow=${count(gatewayStows)}` +
    ` b_posts=${count(bPosts)} destination_checks=${count(destinationChecks)} error=${errorCategory}`;
}

if (process.argv.includes("--mediq-recovery-child")) {
  await runRecoveryReplica();
} else if (process.env.MEDIQ_TEST_DISPATCH_READ_MODE === 'true') {
  test('DEC-020 actual committed-read PostgreSQL/RLS/crypto gate (no STOW or complete Preflight)', { timeout: 120_000 }, runActualDispatchedReadMatrix);
} else if (process.env.MEDIQ_TEST_DESTINATION_VERIFY_MODE === 'true') {
  test('DEC-022 actual authorized destination PostgreSQL/RLS/HTTPS comparison gate (fixture only, no application STOW)',{timeout:120_000},runActualDestinationVerificationMatrix);
} else test("authorized source capture uses only A WADO after database-backed authorization and never writes B", async (t) => {
  assert.equal(manifest.fixtureId, "MEDIQ-ENV-007-SYNTHETIC-CT-V1");
  assert.equal(manifest.instanceCount, 3);
  assert.equal(manifest.patient.patientId, "TEST-PATIENT-007");
  const baselineHarness = createHarness();
  try {
    const initialState = await readOperationState(baselineHarness);
    assert.equal(initialState.operationState, "CREATED");
    assert.deepEqual(initialState.evidence, []);
  } finally {
    await baselineHarness.database.onModuleDestroy();
  }

  await t.test("CAP-001 rejects caller-supplied Study scope before DB or A WADO", async () => {
    const harness = createHarness();
    try {
      await assert.rejects(
        harness.service.capture({
          principal,
          tenantCandidate: fixture.tenantId,
          correlationId: fixture.correlationDenied,
          operationId: fixture.operationId,
          consentId: fixture.consentId,
          grantId: fixture.grantId,
          studyInstanceUid: "2.25.999",
        }),
        (error) => error instanceof AuthorizedSourceCaptureInvalidRequestError,
      );
      const counters = harness.counters();
      assert.equal(counters.tenantContextRuns, 0);
      assert.deepEqual(counters.sourceRequests, []);
      assert.deepEqual(counters.sourcePaths, []);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("CAP-004 rejects caller-supplied PACS endpoint and credential selectors before DB or network", async () => {
    const harness = createHarness();
    try {
      await assert.rejects(
        harness.service.capture({
          principal,
          tenantCandidate: fixture.tenantId,
          correlationId: fixture.correlationDenied,
          operationId: fixture.operationId,
          consentId: fixture.consentId,
          grantId: fixture.grantId,
          endpointUrl: "http://attacker.invalid:8042/dicom-web/",
          sourceUrl: "https://other.invalid/dicom-web/",
          username: "caller-controlled",
          password: "caller-controlled",
          authorization: "Bearer caller-controlled",
        }),
        (error) => error instanceof AuthorizedSourceCaptureInvalidRequestError,
      );
      const counters = harness.counters();
      assert.equal(counters.tenantContextRuns, 0);
      assert.equal(counters.metadataCalls, 0);
      assert.equal(counters.instanceCalls, 0);
      assert.deepEqual(counters.sourceRequests, []);
      assert.deepEqual(counters.sourceRequestObservations, []);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
      assert.equal(counters.destinationVerificationCalls, 0);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("CAP-005 rejects a missing persisted expected instance count before WADO", async () => {
    const harness = createHarness();
    try {
      let result;
      try {
        result = await harness.service.capture(captureCommand(
          fixture.correlationMissingCount,
          fixture.operationMissingCountId,
        ));
      } catch (error) {
        const safeType = error instanceof AuthorizedSourceCaptureUnavailableError
          ? "UNAVAILABLE"
          : error instanceof Error && /^[A-Za-z]+$/.test(error.name)
            ? error.name.toUpperCase()
            : "UNKNOWN";
        const counters = harness.counters();
        throw new Error(`CAP005_MISSING_COUNT_UNEXPECTED_${safeType}_M${counters.metadataCalls}_I${counters.instanceCalls}_C${counters.tenantContextFailures.join("_") || "NONE"}_DB${counters.databaseFailures.join("_") || "NONE"}`);
      }
      assert.deepEqual(
        result,
        { kind: "DENIED", reason: "SOURCE_METADATA_INVALID" },
        "CAP005_MISSING_COUNT_OUTCOME",
      );
      const counters = harness.counters();
      assert.equal(counters.metadataCalls, 0, "CAP005_MISSING_COUNT_NO_METADATA");
      assert.equal(counters.instanceCalls, 0, "CAP005_MISSING_COUNT_NO_INSTANCE");
      assert.deepEqual(counters.sourceRequests, [], "CAP005_MISSING_COUNT_NO_REQUEST");
      assert.equal(counters.stowCalls, 0, "CAP005_MISSING_COUNT_NO_STOW");
      assert.equal(counters.destinationVerificationCalls, 0, "CAP005_MISSING_COUNT_NO_VERIFY");
      const state = await readOperationState(harness, fixture.operationMissingCountId);
      assert.equal(state.operationState, "CREATED", "CAP005_MISSING_COUNT_STATE");
      assert.deepEqual(state.evidence, [], "CAP005_MISSING_COUNT_NO_EVIDENCE");
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("CAP-005 rejects invalid source metadata before any instance payload WADO", async (matrix) => {
    const cases = [
      { name: "empty valid metadata", fault: "EMPTY", correlationId: fixture.correlationMetadataEmpty, outcome: "DENIED" },
      { name: "instance count mismatch", fault: "COUNT_MISMATCH", correlationId: fixture.correlationMetadataCountMismatch, outcome: "DENIED" },
      { name: "persisted series count mismatch", fault: "SERIES_COUNT_MISMATCH", correlationId: fixture.correlationMetadataSeriesMismatch, outcome: "DENIED" },
      { name: "wrong Study UID", fault: "WRONG_STUDY", correlationId: fixture.correlationMetadataWrongStudy, outcome: "UNAVAILABLE" },
      { name: "duplicate SOP identity", fault: "DUPLICATE_SOP", correlationId: fixture.correlationMetadataDuplicate, outcome: "UNAVAILABLE" },
      { name: "malformed DICOM JSON", fault: "MALFORMED_JSON", correlationId: fixture.correlationMetadataMalformed, outcome: "UNAVAILABLE" },
      { name: "missing required identity tag", fault: "MISSING_REQUIRED_TAG", correlationId: fixture.correlationMetadataMissingTag, outcome: "UNAVAILABLE" },
      { name: "metadata over 2,000-instance ceiling", fault: "OVER_LIMIT", correlationId: fixture.correlationMetadataOverLimit, outcome: "UNAVAILABLE" },
      { name: "metadata endpoint unavailable", fault: "MISSING_RESPONSE", correlationId: fixture.correlationMetadataUnavailable, outcome: "UNAVAILABLE" },
    ];

    for (const scenario of cases) {
      await matrix.test(scenario.name, async () => {
        const harness = createHarness({ metadataFault: scenario.fault });
        try {
          if (scenario.outcome === "DENIED") {
            let result;
            try {
              result = await harness.service.capture(captureCommand(scenario.correlationId));
            } catch (error) {
              const safeType = error instanceof AuthorizedSourceCaptureUnavailableError
                ? "UNAVAILABLE"
                : error instanceof Error && /^[A-Za-z]+$/.test(error.name)
                  ? error.name.toUpperCase()
                  : "UNKNOWN";
              const counters = harness.counters();
              const requestKinds = counters.sourceRequests.join("_") || "NONE";
              throw new Error(`CAP005_${scenario.fault}_UNEXPECTED_${safeType}_M${counters.metadataCalls}_I${counters.instanceCalls}_R${requestKinds}_C${counters.tenantContextFailures.join("_") || "NONE"}_DB${counters.databaseFailures.join("_") || "NONE"}`);
            }
            assert.deepEqual(
              result,
              { kind: "DENIED", reason: "SOURCE_METADATA_INVALID" },
              `CAP005_${scenario.fault}_OUTCOME`,
            );
            assert.doesNotMatch(
              JSON.stringify(result),
              /TEST-PATIENT|2\.25\.|SYNTHETIC/,
              `CAP005_${scenario.fault}_NO_IDENTIFIER_LEAK`,
            );
          } else {
            await assert.rejects(
              harness.service.capture(captureCommand(scenario.correlationId)),
              (error) => {
                assert.ok(error instanceof AuthorizedSourceCaptureUnavailableError);
                assert.equal(error.message, "SOURCE_CAPTURE_UNAVAILABLE", `CAP005_${scenario.fault}_FIXED_ERROR`);
                assert.doesNotMatch(error.message, /TEST-PATIENT|2\.25\.|SYNTHETIC|DICOM_UPSTREAM/, `CAP005_${scenario.fault}_NO_UPSTREAM_DETAIL`);
                return true;
              },
              `CAP005_${scenario.fault}_EXPECTED_FAILURE`,
            );
          }

          const counters = harness.counters();
          assert.equal(counters.metadataCalls, 1, `CAP005_${scenario.fault}_METADATA_ONCE`);
          assert.equal(counters.instanceCalls, 0, `CAP005_${scenario.fault}_NO_INSTANCE`);
          assert.deepEqual(counters.sourceRequests, ["METADATA"], `CAP005_${scenario.fault}_METADATA_ONLY`);
          assert.equal(counters.sourcePaths.length, 1, `CAP005_${scenario.fault}_ONE_PATH`);
          assert.ok(counters.sourcePaths[0].endsWith("/metadata"), `CAP005_${scenario.fault}_METADATA_PATH`);
          assert.equal(counters.sourceRequestObservations.length, 1, `CAP005_${scenario.fault}_ONE_OBSERVATION`);
          assert.deepEqual(counters.sourceRequestObservations[0], {
            protocol: "https:",
            hostname: "orthanc-a",
            port: "8042",
            pathname: counters.sourcePaths[0],
            method: "GET",
            redirect: "error",
            configuredAAuthorization: true,
          }, `CAP005_${scenario.fault}_EXACT_A_REQUEST`);
          assert.equal(counters.forbiddenEndpointAttempts, 0, `CAP005_${scenario.fault}_NO_FORBIDDEN_ENDPOINT`);
          assert.equal(counters.stowCalls, 0, `CAP005_${scenario.fault}_NO_STOW`);
          assert.equal(counters.destinationVerificationCalls, 0, `CAP005_${scenario.fault}_NO_DESTINATION_VERIFY`);
          const state = await readOperationState(harness);
          assert.equal(state.operationState, "CREATED", `CAP005_${scenario.fault}_STATE`);
          assert.deepEqual(state.evidence, [], `CAP005_${scenario.fault}_NO_EVIDENCE`);
        } finally {
          await harness.database.onModuleDestroy();
        }
      });
    }
  });

  await t.test("CAP-006 denies a source PatientID mismatch before any instance payload WADO", async () => {
    const harness = createHarness({ metadataFault: "PATIENT_ID_MISMATCH" });
    try {
      const result = await harness.service.capture(captureCommand(fixture.correlationPatientIdMismatch));
      assert.deepEqual(result, { kind: "DENIED", reason: "SOURCE_PATIENT_ID_MISMATCH" });
      const counters = harness.counters();
      assert.equal(counters.metadataCalls, 1, "CAP006_METADATA_ONCE");
      assert.equal(counters.instanceCalls, 0, "CAP006_NO_INSTANCE_WADO");
      assert.deepEqual(counters.sourceRequests, ["METADATA"], "CAP006_METADATA_ONLY");
      assert.equal(counters.stowCalls, 0, "CAP006_NO_STOW");
      assert.equal(counters.destinationVerificationCalls, 0, "CAP006_NO_DESTINATION_VERIFY");
      assert.equal(counters.forbiddenEndpointAttempts, 0, "CAP006_NO_FORBIDDEN_ENDPOINT");
      assert.doesNotMatch(JSON.stringify(result), /TEST-PATIENT|2\.25\.|SYNTHETIC/);
      const state = await readOperationState(harness);
      assert.equal(state.operationState, "CREATED", "CAP006_STATE_UNCHANGED");
      assert.deepEqual(state.evidence, [], "CAP006_NO_EVIDENCE");
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("CAP-002 denies missing, withdrawn, expired, revoked and wrong-scope authorization before DICOM", async (matrix) => {
    const cases = [
      {
        name: "missing Consent",
        correlationId: fixture.correlationMissingConsent,
        consentId: "19000000-0000-4000-8000-000000000099",
        grantId: fixture.grantId,
      },
      {
        name: "missing Grant",
        correlationId: fixture.correlationDenied,
        consentId: fixture.consentId,
        grantId: "1a000000-0000-4000-8000-000000000099",
      },
      {
        name: "withdrawn Consent with matching active Grant",
        correlationId: fixture.correlationWithdrawnConsent,
        consentId: fixture.withdrawnConsentId,
        grantId: fixture.withdrawnConsentGrantId,
      },
      {
        name: "expired Consent with matching active Grant",
        correlationId: fixture.correlationExpiredConsent,
        consentId: fixture.expiredConsentId,
        grantId: fixture.expiredConsentGrantId,
      },
      {
        name: "revoked Grant",
        correlationId: fixture.correlationRevokedGrant,
        consentId: fixture.consentId,
        grantId: fixture.revokedGrantId,
      },
      {
        name: "expired Grant",
        correlationId: fixture.correlationExpiredGrant,
        consentId: fixture.consentId,
        grantId: fixture.expiredGrantId,
      },
      {
        name: "wrong Grant scope",
        correlationId: fixture.correlationWrongScope,
        consentId: fixture.consentId,
        grantId: fixture.wrongScopeGrantId,
      },
    ];

    for (const scenario of cases) {
      await matrix.test(scenario.name, async () => {
        const harness = createHarness();
        try {
          const result = await harness.service.capture({
            principal,
            tenantCandidate: fixture.tenantId,
            correlationId: scenario.correlationId,
            operationId: fixture.operationId,
            consentId: scenario.consentId,
            grantId: scenario.grantId,
          });
          assert.deepEqual(result, { kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
          const counters = harness.counters();
          assert.equal(counters.metadataCalls, 0);
          assert.equal(counters.instanceCalls, 0);
          assert.deepEqual(counters.sourceRequests, []);
          assert.deepEqual(counters.sourcePaths, []);
          assert.equal(counters.forbiddenEndpointAttempts, 0);
          assert.equal(counters.stowCalls, 0);
          assert.equal(counters.destinationVerificationCalls, 0);
          assert.equal(counters.activeTenantTransactions, 0);
          const state = await readOperationState(harness);
          assert.equal(state.operationState, "CREATED");
          assert.deepEqual(state.evidence, []);
        } finally {
          await harness.database.onModuleDestroy();
        }
      });
    }
  });

  await t.test("CAP-003 denies mismatched persisted bindings and non-CREATED operations before DICOM", async (matrix) => {
    const transitionHarness = createHarness();
    try {
      await transitionHarness.actorContext.run(
        principal,
        fixture.tenantId,
        async (_identity, client) => {
          const selected = await client.query(
            `SELECT operation_id, tenant_id, exchange_session_id, study_ref_id,
                    actor_id, idempotency_key, request_digest, state, version,
                    reason_code, source_object_count, destination_object_count,
                    created_at, updated_at, stow_started_at
               FROM pacs_transfer_operations
              WHERE operation_id = $1::uuid`,
            [fixture.operationNotCreatedId],
          );
          assert.equal(selected.rowCount, 1);
          const row = selected.rows[0];
          const current = PacsTransferOperation.reconstitute({
            operationId: row.operation_id,
            tenantId: row.tenant_id,
            exchangeSessionId: row.exchange_session_id,
            studyRefId: row.study_ref_id,
            actorId: row.actor_id,
            idempotencyKey: row.idempotency_key,
            requestDigest: row.request_digest,
            state: row.state,
            version: row.version,
            reasonCode: row.reason_code,
            sourceObjectCount: row.source_object_count,
            destinationObjectCount: row.destination_object_count,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            stowStartedAt: row.stow_started_at,
          });
          assert.equal(current.snapshot.state, "CREATED");
          const failed = current.transitionTo({
            nextState: "FAILED",
            now: new Date(current.snapshot.updatedAt.getTime() + 1_000),
            reasonCode: "SYNTHETIC_SETUP_FAILURE",
          });
          await new PostgresPacsTransferOperationRepository(client).transition({
            current,
            next: failed,
            correlationId: fixture.correlationFixtureStateTransition,
          });
        },
      );
    } finally {
      await transitionHarness.database.onModuleDestroy();
    }

    const cases = [
      {
        name: "operation Session does not bind the referenced Study package",
        operationId: fixture.operationBindingMismatchId,
        correlationId: fixture.correlationBindingMismatch,
        expectedState: "CREATED",
      },
      {
        name: "Study source Hospital differs from the operation Session",
        operationId: fixture.operationSourceMismatchId,
        correlationId: fixture.correlationSourceMismatch,
        expectedState: "CREATED",
      },
      {
        name: "fully bound operation outside CREATED state is denied",
        operationId: fixture.operationNotCreatedId,
        correlationId: fixture.correlationNotCreated,
        expectedState: "FAILED",
      },
    ];

    for (const scenario of cases) {
      await matrix.test(scenario.name, async () => {
        const harness = createHarness();
        try {
          const result = await harness.service.capture({
            principal,
            tenantCandidate: fixture.tenantId,
            correlationId: scenario.correlationId,
            operationId: scenario.operationId,
            consentId: fixture.consentId,
            grantId: fixture.grantId,
          });
          assert.deepEqual(result, { kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
          const counters = harness.counters();
          assert.equal(counters.metadataCalls, 0);
          assert.equal(counters.instanceCalls, 0);
          assert.deepEqual(counters.sourceRequests, []);
          assert.deepEqual(counters.sourcePaths, []);
          assert.equal(counters.forbiddenEndpointAttempts, 0);
          assert.equal(counters.stowCalls, 0);
          assert.equal(counters.destinationVerificationCalls, 0);
          assert.equal(counters.activeTenantTransactions, 0);
          const state = await readOperationState(harness, scenario.operationId);
          assert.equal(state.operationState, scenario.expectedState);
          assert.deepEqual(state.evidence, []);
        } finally {
          await harness.database.onModuleDestroy();
        }
      });
    }
  });

  await t.test("CAP-002 denies a Tenant-A actor resolving the Tenant-B operation without Audit disclosure", async () => {
    const harness = createHarness();
    try {
      const result = await harness.service.capture({
        principal: otherTenantPrincipal,
        tenantCandidate: fixture.otherTenantId,
        correlationId: fixture.correlationCrossTenant,
        operationId: fixture.operationId,
        consentId: fixture.consentId,
        grantId: fixture.grantId,
      });
      assert.deepEqual(result, { kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
      const counters = harness.counters();
      assert.equal(counters.metadataCalls, 0);
      assert.equal(counters.instanceCalls, 0);
      assert.deepEqual(counters.sourceRequests, []);
      assert.deepEqual(counters.sourcePaths, []);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
      assert.equal(counters.destinationVerificationCalls, 0);
      const state = await readOperationState(harness);
      assert.equal(state.operationState, "CREATED");
      assert.deepEqual(state.evidence, []);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("CAP-002 maps database connection failure to fixed unavailable without DICOM or Audit", async () => {
    const harness = createHarness({
      databaseUrl: "postgresql://mediq_runtime:synthetic-unavailable@127.0.0.1:1/mediq",
    });
    try {
      await assert.rejects(
        harness.service.capture({
          principal,
          tenantCandidate: fixture.tenantId,
          correlationId: fixture.correlationUnavailable,
          operationId: fixture.operationId,
          consentId: fixture.consentId,
          grantId: fixture.grantId,
        }),
        (error) => error instanceof AuthorizedSourceCaptureUnavailableError,
      );
      const counters = harness.counters();
      assert.equal(counters.metadataCalls, 0);
      assert.equal(counters.instanceCalls, 0);
      assert.deepEqual(counters.sourceRequests, []);
      assert.deepEqual(counters.sourcePaths, []);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
      assert.equal(counters.destinationVerificationCalls, 0);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("authorized interrupted WADO fails without evidence or operation transition", async () => {
    const harness = createHarness({ failFirstInstance: true, observeInstanceStreams: true });
    try {
      await assert.rejects(
        harness.service.capture({
          principal,
          tenantCandidate: fixture.tenantId,
          correlationId: fixture.correlationFailure,
          operationId: fixture.operationId,
          consentId: fixture.consentId,
          grantId: fixture.grantId,
        }),
        (error) => error instanceof AuthorizedSourceCaptureUnavailableError,
      );
      const counters = harness.counters();
      assert.equal(counters.initialAuthorizationCommitted, true);
      assert.equal(counters.activeTenantTransactions, 0);
      assert.deepEqual(counters.sourceRequests, ["METADATA", "INSTANCE"]);
      assert.equal(counters.instanceCalls, 1);
      assert.equal(counters.maximumActiveInstanceStreams, 1);
      assert.equal(counters.activeInstanceStreams, 0, "CAP008_ACTIVE_STREAM_CLOSED");
      assert.equal(counters.instanceStreamOpenOrder.length, 1);
      assert.deepEqual(counters.instanceStreamCompletionOrder, []);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
      assert.equal(counters.destinationVerificationCalls, 0);
      const state = await readOperationState(harness);
      assert.equal(state.operationState, "CREATED");
      assert.deepEqual(state.evidence, []);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  for (const scenario of cap012Scenarios) {
    await t.test(`TC-INT-001-CAP-012 ${scenario.name}`, async () => {
      const postWado = scenario.expectedInstanceCount > 0;
      const harness = createHarness({ observeInstanceStreams: postWado });
      try {
        await assert.rejects(
          harness.service.captureForCoordinator(captureCommand(
            scenario.correlationId,
            scenario.operationId,
            { consentId: scenario.consentId, grantId: scenario.grantId },
          )),
          (error) => {
            assert.ok(error instanceof AuthorizedSourceCaptureUnavailableError);
            assert.equal(error.message, "SOURCE_CAPTURE_UNAVAILABLE");
            assert.doesNotMatch(error.message, /P0001|INT001|PostgreSQL|audit_events|integrity_evidence/i);
            return true;
          },
        );

        const counters = harness.counters();
        assert.deepEqual(counters.sourceRequests, scenario.expectedSourceRequests);
        assert.equal(counters.metadataCalls, postWado ? 1 : 0);
        assert.equal(counters.instanceCalls, scenario.expectedInstanceCount);
        assert.equal(counters.activeTenantTransactions, 0);
        assert.equal(counters.activeInstanceStreams, 0, "CAP012_ALL_SOURCE_STREAMS_CLOSED");
        assert.equal(counters.stowCalls, 0);
        assert.equal(counters.destinationVerificationCalls, 0);
        assert.equal(counters.forbiddenEndpointAttempts, 0);
        assert.ok(
          counters.databaseFailures.some((failure) => failure.startsWith(scenario.failingQuery)),
          "CAP012_EXPECTED_OPERATION_BOUND_TEST_TRIGGER_FIRED",
        );
        if (postWado) {
          assert.equal(counters.initialAuthorizationCommitted, true);
          assert.equal(counters.instanceStreamCompletionOrder.length, manifest.instanceCount);
          assert.equal(counters.maximumActiveInstanceStreams, 1);
        } else {
          assert.equal(counters.initialAuthorizationCommitted, false);
        }

        const state = await readOperationState(harness, scenario.operationId);
        assert.equal(state.operationState, "CREATED", "CAP012_OPERATION_STATE_UNCHANGED");
        assert.deepEqual(state.evidence, [], "CAP012_NO_PENDING_EVIDENCE_AFTER_FAILURE");
      } finally {
        await harness.database.onModuleDestroy();
      }
    });
  }

  await t.test("TC-INT-001-CAP-010/014 and TC-PACS-001-HANDOFF-001/005/006 plus DIGEST-003/005/006 commit exact A byte evidence without writing B", async () => {
    const harness = createHarness({ observeInstanceStreams: true });
    try {
      const result = await harness.service.captureForCoordinator({
        principal,
        tenantCandidate: fixture.tenantId,
        correlationId: fixture.correlationSuccess,
        operationId: fixture.operationId,
        consentId: fixture.consentId,
        grantId: fixture.grantId,
      });
      assert.equal(result.kind, "CAPTURED_FOR_COORDINATOR");
      if (result.kind !== "CAPTURED_FOR_COORDINATOR") return;
      const { handoff } = result;
      const expectedInstances = [...manifest.instances].sort((left, right) =>
        left.sopInstanceUID < right.sopInstanceUID
          ? -1
          : left.sopInstanceUID > right.sopInstanceUID
            ? 1
            : 0,
      );
      const expectedUids = expectedInstances.map((instance) => instance.sopInstanceUID);
      const expectedDigest = expectedSourceManifestDigest(manifest);
      assert.deepEqual(handoff.expectedInstances, expectedInstances.map((instance) => ({
        seriesInstanceUid: manifest.seriesInstanceUID,
        sopInstanceUid: instance.sopInstanceUID,
        sopClassUid: manifest.sopClassUID,
        transferSyntaxUid: manifest.transferSyntaxUID,
        byteLength: instance.sizeBytes,
        sha256: `sha256:${instance.sha256}`,
      })));
      assert.deepEqual(handoff, {
        operationId: fixture.operationId,
        tenantId: fixture.tenantId,
        actorId: fixture.actorId,
        exchangeSessionId: fixture.sessionId,
        packageId: fixture.packageId,
        studyRefId: fixture.studyRefId,
        studyInstanceUid: manifest.studyInstanceUID,
        sourceHospitalId: TEST_HOSPITAL_A_ID,
        destinationHospitalId: TEST_HOSPITAL_B_ID,
        sourceEvidence: {
          evidenceId: handoff.sourceEvidence.evidenceId,
          status: "PENDING",
          algorithm: "SHA256-MANIFEST-V1",
          aggregateDigest: expectedDigest,
          objectCount: manifest.instanceCount,
          totalBytes: manifest.totalBytes,
        },
        expectedInstances: expectedInstances.map((instance) => ({
          seriesInstanceUid: manifest.seriesInstanceUID,
          sopInstanceUid: instance.sopInstanceUID,
          sopClassUid: manifest.sopClassUID,
          transferSyntaxUid: manifest.transferSyntaxUID,
          byteLength: instance.sizeBytes,
          sha256: `sha256:${instance.sha256}`,
        })),
      });
      assert.match(handoff.sourceEvidence.evidenceId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      assert.equal(JSON.stringify(handoff).includes(manifest.patient.patientId), false);
      assert.equal(Object.isFrozen(result), true);
      assert.equal(Object.isFrozen(handoff), true);
      assert.equal(Object.isFrozen(handoff.sourceEvidence), true);
      assert.equal(Object.isFrozen(handoff.expectedInstances), true);
      assert.ok(handoff.expectedInstances.every(Object.isFrozen));
      const captureCounters = harness.counters();
      assert.equal(captureCounters.tenantContextRuns, 2, "CAP010_INITIAL_AND_FINAL_FENCED_TRANSACTIONS");
      assert.equal(harness.counters().initialAuthorizationCommitted, true);
      assert.equal(harness.counters().activeTenantTransactions, 0);
      assert.deepEqual(harness.counters().sourceRequests, [
        "METADATA",
        "INSTANCE",
        "INSTANCE",
        "INSTANCE",
      ]);
      assert.equal(harness.counters().sourcePaths.length, manifest.instanceCount + 1);
      assert.ok(harness.counters().sourcePaths.every((path) =>
        path.startsWith(`/dicom-web/studies/${manifest.studyInstanceUID}/`),
      ));
      const instancePaths = captureCounters.sourcePaths.filter((path) => path.includes("/instances/"));
      assert.deepEqual(
        instancePaths.map((path) => decodeURIComponent(path.slice(path.lastIndexOf("/") + 1))),
        expectedUids,
        "CAP007_OPERATION_BOUND_CANONICAL_INSTANCE_REQUESTS",
      );
      assert.deepEqual(captureCounters.instanceStreamOpenOrder, expectedUids, "CAP007_STREAM_OPEN_ORDER");
      assert.deepEqual(captureCounters.instanceStreamCompletionOrder, expectedUids, "CAP007_STREAM_COMPLETION_ORDER");
      assert.equal(captureCounters.maximumActiveInstanceStreams, 1, "CAP007_ONE_ACTIVE_STREAM");
      assert.equal(captureCounters.activeInstanceStreams, 0, "CAP007_ALL_STREAMS_CLOSED");
      assert.deepEqual(
        captureCounters.observedInstanceStreams.map(({ sopInstanceUid, byteLength, sha256 }) => ({
          sopInstanceUid,
          byteLength,
          sha256,
        })),
        expectedInstances.map((instance) => ({
          sopInstanceUid: instance.sopInstanceUID,
          byteLength: instance.sizeBytes,
          sha256: instance.sha256,
        })),
        "CAP007_EXACT_FIXTURE_BYTES",
      );
      assert.ok(captureCounters.observedInstanceStreams.every((stream) => stream.chunkCount > 0));
      assert.equal(
        captureCounters.observedInstanceStreams.reduce((total, stream) => total + stream.byteLength, 0),
        manifest.totalBytes,
        "CAP007_TOTAL_FIXTURE_BYTES",
      );
      assert.equal(handoff.sourceEvidence.aggregateDigest, expectedDigest, "HANDOFF_PENDING_EVIDENCE_DIGEST_MATCHES_HASHED_SOURCE");
      assert.equal(harness.counters().forbiddenEndpointAttempts, 0);
      const observations = harness.counters().sourceRequestObservations;
      assert.equal(observations.length, manifest.instanceCount + 1);
      assert.ok(observations.every((request) =>
        request.protocol === "https:" &&
        request.hostname === "orthanc-a" &&
        request.port === "8042" &&
        request.pathname.startsWith(`/dicom-web/studies/${manifest.studyInstanceUID}/`) &&
        request.method === "GET" &&
        request.redirect === "error" &&
        request.configuredAAuthorization === true,
      ));
      assert.equal(harness.counters().stowCalls, 0);
      assert.equal(harness.counters().destinationVerificationCalls, 0);
      const state = await readOperationState(harness);
      assert.equal(state.operationState, "CREATED");
      assert.deepEqual(state.evidence, [{
        stage: "SOURCE_CAPTURE",
        status: "PENDING",
        algorithm: "SHA256-MANIFEST-V1",
        sourceDigest: expectedDigest,
        objectCount: manifest.instanceCount,
      }]);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("TC-PACS-001-COORD-004 composes admitted operation with encrypted A capture and audited cleanup", { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "mediq-pacs-coordinator-"));
    const storageRoot = join(root, "ciphertext");
    const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
    const harness = createHarness({ temporaryImagingStore: store, observeInstanceStreams: true });
    let coordinator;
    let preparedResult;
    let purgeAttempted = false;
    let stage = "SETUP";
    try {
      const admission = new PacsImportOperationAdmissionService(
        harness.executor,
        () => new Date(),
        () => fixture.coordinatorOperationId,
      );
      const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, store);
      coordinator = new PacsImportSourcePreparationCoordinator(admission, harness.service, purge);
      const request = Object.freeze({
        sessionId: fixture.coordinatorSessionId,
        tenantCandidate: fixture.tenantId,
        idempotencyKey: fixture.coordinatorIdempotencyKey,
        correlationId: fixture.coordinatorCorrelationId,
        body: Object.freeze({ grantId: fixture.coordinatorGrantId, studyRefId: fixture.coordinatorStudyRefId }),
      });

      stage = "ADMISSION_AND_SOURCE_CAPTURE";
      preparedResult = await coordinator.prepare({ principal, request });
      assert.deepEqual(preparedResult, {
        operationId: fixture.coordinatorOperationId,
        operationState: "CREATED",
        preparation: "SOURCE_CAPTURED",
      });
      stage = "PUBLIC_RESULT";
      const publicResult = JSON.stringify(preparedResult);
      for (const restricted of [manifest.patient.patientId, manifest.studyInstanceUID,
        manifest.seriesInstanceUID, ...manifest.instances.map(instance => instance.sopInstanceUID)]) {
        assert.equal(publicResult.includes(restricted), false, "COORD004_MINIMAL_PUBLIC_RESULT");
      }

      stage = "EXPECTED_DIGEST";
      const expectedDigest = pacsTransferOperationDigest({
        tenantId: fixture.tenantId,
        actorId: fixture.actorId,
        exchangeSessionId: fixture.coordinatorSessionId,
        studyRefId: fixture.coordinatorStudyRefId,
        consentId: fixture.coordinatorConsentId,
        grantId: fixture.coordinatorGrantId,
        action: "PACS_IMPORT",
      });
      stage = "RUNTIME_FACTS_QUERY";
      const facts = await harness.actorContext.run(principal, fixture.tenantId, async (_identity, client) => {
        stage = "OPERATION_QUERY";
        const operation = (await client.query(`SELECT operation_id::text,tenant_id::text,actor_id::text,
          exchange_session_id::text,study_ref_id::text,request_digest,state,version,stow_started_at
          FROM pacs_transfer_operations WHERE operation_id=$1::uuid`, [fixture.coordinatorOperationId])).rows[0];
        stage = "EVIDENCE_QUERY";
        const evidence = (await client.query(`SELECT verification_stage,status,algorithm,source_digest,
          source_object_count,verified_at FROM integrity_evidence WHERE operation_id=$1::uuid`,
        [fixture.coordinatorOperationId])).rows;
        stage = "PROVENANCE_QUERY";
        const provenance = (await client.query(`SELECT provenance_id::text,exchange_session_id::text,
          package_id::text,study_ref_id::text,source_hospital_id::text,destination_hospital_id::text,
          integrity_id::text,transfer_type,transfer_status,ingested_at,transferred_at
          FROM provenance_records WHERE operation_id=$1::uuid`, [fixture.coordinatorOperationId])).rows;
        stage = "PAYLOAD_QUERY";
        const payload = (await client.query(`SELECT temporary_storage_ref::text,temporary_payload_state,
          temporary_payload_expires_at,temporary_payload_purged_at FROM study_references
          WHERE study_ref_id=$1::uuid`, [fixture.coordinatorStudyRefId])).rows[0];
        return { operation, evidence, provenance, payload };
      });
      stage = "OPERATION_BINDING";
      const expectedOperation = {
        operation_id: fixture.coordinatorOperationId,
        tenant_id: fixture.tenantId,
        actor_id: fixture.actorId,
        exchange_session_id: fixture.coordinatorSessionId,
        study_ref_id: fixture.coordinatorStudyRefId,
        request_digest: expectedDigest,
        state: "CREATED",
        version: 0,
        stow_started_at: null,
      };
      const operationMismatches = Object.keys(expectedOperation).filter(key =>
        facts.operation?.[key] !== expectedOperation[key]);
      assert.deepEqual(operationMismatches, [],
        `COORD004_OPERATION_BINDING_MISMATCH_${operationMismatches.join("_") || "MISSING"}`);
      stage = "INTEGRITY_EVIDENCE";
      assert.equal(facts.evidence.length, 1, "COORD004_SINGLE_PENDING_INTEGRITY_EVIDENCE");
      assert.deepEqual(facts.evidence[0], {
        verification_stage: "SOURCE_CAPTURE",
        status: "PENDING",
        algorithm: "SHA256-MANIFEST-V1",
        source_digest: expectedSourceManifestDigest(manifest),
        source_object_count: manifest.instanceCount,
        verified_at: null,
      }, "COORD004_PENDING_SOURCE_INTEGRITY");
      stage = "PROVENANCE";
      assert.deepEqual(facts.provenance, [], "COORD004_NO_PROVENANCE_BEFORE_DISPATCH");
      stage = "TEMPORARY_PACKAGE";
      assert.ok(facts.payload.temporary_storage_ref, "COORD004_TEMP_STORAGE_REFERENCE");
      assert.equal(facts.payload.temporary_payload_state, "AVAILABLE");
      assert.ok(facts.payload.temporary_payload_expires_at instanceof Date);
      assert.equal(facts.payload.temporary_payload_purged_at, null);
      stage = "ENCRYPTED_OBJECTS";
      const encryptedFiles = await readdir(join(storageRoot, facts.payload.temporary_storage_ref));
      assert.equal(encryptedFiles.length, manifest.instanceCount);
      assert.ok(encryptedFiles.every(name => /^[0-9a-f-]{36}\.enc$/.test(name)), "COORD004_ENCRYPTED_TEMPORARY_OBJECTS");
      stage = "IDEMPOTENT_REPLAY";
      const beforeReplay = harness.counters();
      const replay = await coordinator.prepare({ principal, request });
      assert.deepEqual(replay, {
        operationId: fixture.coordinatorOperationId,
        operationState: "CREATED",
        preparation: "REPLAYED",
      });
      assert.deepEqual(harness.counters().sourceRequests, beforeReplay.sourceRequests,
        "COORD004_IDEMPOTENT_REPLAY_NO_SOURCE_READ");

      stage = "AUDITED_PURGE";
      purgeAttempted = true;
      await coordinator.discardPrepared(preparedResult);
      assert.deepEqual(await readdir(storageRoot), [], "COORD004_PURGE_PHYSICAL_CIPHERTEXT");
      stage = "POST_PURGE_OBSERVATION";
      const afterPurge = await harness.actorContext.run(principal, fixture.tenantId, async (_identity, client) => {
        const payload = (await client.query(`SELECT temporary_storage_ref::text,temporary_payload_state,
          temporary_payload_expires_at,temporary_payload_purged_at FROM study_references
          WHERE study_ref_id=$1::uuid`, [fixture.coordinatorStudyRefId])).rows[0];
        return { payload };
      });
      assert.match(afterPurge.payload.temporary_storage_ref, /^[0-9a-f-]{36}$/i,
        "COORD004_PURGE_BINDING_REFERENCE_RETAINED_FOR_AUDIT");
      assert.equal(afterPurge.payload.temporary_payload_state, "PURGED");
      assert.ok(afterPurge.payload.temporary_payload_purged_at instanceof Date);
      stage = "NO_DESTINATION_SIDE_EFFECTS";
      const counters = harness.counters();
      assert.equal(counters.sourceRequests.length, manifest.instanceCount + 1);
      assert.equal(counters.maximumActiveInstanceStreams, 1);
      assert.equal(counters.stowCalls, 0, "COORD004_NO_STOW");
      assert.equal(counters.destinationVerificationCalls, 0, "COORD004_NO_DESTINATION_VERIFY");
      assert.equal(counters.destinationByteCalls, 0, "COORD004_NO_DESTINATION_READ");
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.activeTenantTransactions, 0);
      console.log("pacs_import_coordinator=PASS real_runtime_rls=true test_orthanc_a=true encrypted_capture=true replay_no_refetch=true b_stow=0 operation=CREATED audited_purge=true");
    } catch (error) {
      const safeFailure = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
        ? error.code
        : typeof error?.message === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(error.message)
          ? error.message
          : error?.name === "AssertionError" ? "ASSERTION" : "UNCLASSIFIED";
      console.log(`COORD004_FAILURE_STAGE_${stage}_${safeFailure}`);
      throw error;
    } finally {
      try {
        if (preparedResult?.preparation === "SOURCE_CAPTURED" && !purgeAttempted && coordinator) {
          purgeAttempted = true;
          await coordinator.discardPrepared(preparedResult);
        }
      } finally {
        try {
          await harness.database.onModuleDestroy();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    }
  });

  await t.test("TC-PACS-001-COORD-004-DENY AUTH rejects before operation creation or source retrieval", async () => {
    const cases = [
      {
        name: "malformed request attempts to supply Consent authority",
        correlationId: fixture.coordinatorDenyMalformedCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000061",
        idempotencyKey: "1b000000-0000-4000-8000-000000000071",
        grantId: fixture.grantId,
        extraBody: { consentId: fixture.consentId },
        malformed: true,
      },
      {
        name: "missing persisted Grant",
        correlationId: fixture.coordinatorDenyMissingGrantCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000062",
        idempotencyKey: "1b000000-0000-4000-8000-000000000072",
        grantId: "1a000000-0000-4000-8000-000000000099",
      },
      {
        name: "revoked Grant",
        correlationId: fixture.coordinatorDenyRevokedGrantCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000063",
        idempotencyKey: "1b000000-0000-4000-8000-000000000073",
        grantId: fixture.revokedGrantId,
      },
      {
        name: "expired Grant",
        correlationId: fixture.coordinatorDenyExpiredGrantCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000064",
        idempotencyKey: "1b000000-0000-4000-8000-000000000074",
        grantId: fixture.expiredGrantId,
      },
      {
        name: "active Grant bound to withdrawn Consent",
        correlationId: fixture.coordinatorDenyWithdrawnConsentCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000065",
        idempotencyKey: "1b000000-0000-4000-8000-000000000075",
        grantId: fixture.withdrawnConsentGrantId,
      },
      {
        name: "Grant without PACS_IMPORT scope",
        correlationId: fixture.coordinatorDenyWrongScopeCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000066",
        idempotencyKey: "1b000000-0000-4000-8000-000000000076",
        grantId: fixture.wrongScopeGrantId,
      },
      {
        name: "Grant belongs to another Exchange Session",
        correlationId: fixture.coordinatorDenyCrossSessionCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000067",
        idempotencyKey: "1b000000-0000-4000-8000-000000000077",
        grantId: fixture.grantInFlightRevocationId,
      },
      {
        name: "request tenant does not match verified actor tenant",
        correlationId: fixture.coordinatorDenyCrossTenantCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000068",
        idempotencyKey: "1b000000-0000-4000-8000-000000000078",
        grantId: fixture.grantId,
        tenantCandidate: fixture.otherTenantId,
      },
      {
        name: "Study is outside the persisted Grant package",
        correlationId: fixture.coordinatorDenyForeignStudyCorrelationId,
        operationId: "1b000000-0000-4000-8000-000000000069",
        idempotencyKey: "1b000000-0000-4000-8000-000000000079",
        grantId: fixture.grantId,
        studyRefId: fixture.studyOtherRefId,
      },
    ];

    for (const scenario of cases) {
      const harness = createHarness();
      let createIdCalls = 0;
      try {
        const admission = new PacsImportOperationAdmissionService(
          harness.executor,
          () => new Date(),
          () => {
            createIdCalls += 1;
            return scenario.operationId;
          },
        );
        const coordinator = new PacsImportSourcePreparationCoordinator(
          admission,
          harness.service,
          { purge: async () => { throw new Error("UNEXPECTED_COORDINATOR_PURGE"); } },
        );
        const body = {
          grantId: scenario.grantId,
          studyRefId: scenario.studyRefId ?? fixture.studyRefId,
          ...scenario.extraBody,
        };
        const request = Object.freeze({
          sessionId: fixture.sessionId,
          tenantCandidate: scenario.tenantCandidate ?? fixture.tenantId,
          idempotencyKey: scenario.idempotencyKey,
          correlationId: scenario.correlationId,
          body: Object.freeze(body),
        });

        await assert.rejects(
          coordinator.prepare({ principal, request }),
          error => error?.message === "PACS_IMPORT_SOURCE_PREPARATION_UNAVAILABLE",
          `COORD004_AUTH_${scenario.name.replaceAll(" ", "_")}_FIXED_DENIAL`,
        );
        assert.equal(createIdCalls, 0, `COORD004_AUTH_${scenario.name}_NO_OPERATION_ID`);
        const counters = harness.counters();
        assert.deepEqual(counters.sourceRequests, [], `COORD004_AUTH_${scenario.name}_NO_SOURCE_REQUEST`);
        assert.deepEqual(counters.sourcePaths, [], `COORD004_AUTH_${scenario.name}_NO_SOURCE_PATH`);
        assert.equal(counters.metadataCalls, 0, `COORD004_AUTH_${scenario.name}_NO_METADATA`);
        assert.equal(counters.instanceCalls, 0, `COORD004_AUTH_${scenario.name}_NO_INSTANCE`);
        assert.equal(counters.stowCalls, 0, `COORD004_AUTH_${scenario.name}_NO_STOW`);
        assert.equal(counters.destinationVerificationCalls, 0, `COORD004_AUTH_${scenario.name}_NO_DESTINATION_VERIFY`);
        assert.equal(counters.activeTenantTransactions, 0, `COORD004_AUTH_${scenario.name}_TRANSACTIONS_CLOSED`);
        const state = await readOperationState(harness, scenario.operationId);
        assert.equal(state.operationState, null, `COORD004_AUTH_${scenario.name}_NO_OPERATION`);
        assert.deepEqual(state.evidence, [], `COORD004_AUTH_${scenario.name}_NO_INTEGRITY`);
        if (scenario.malformed) {
          assert.equal(counters.tenantContextRuns, 0, "COORD004_AUTH_MALFORMED_NO_DATABASE_CONTEXT");
        }
      } finally {
        await harness.database.onModuleDestroy();
      }
    }
    console.log("pacs_import_coordinator_auth_denials=PASS cases=9 operation_created=0 source_requests=0 destination_calls=0");
  });

  await t.test("TC-PACS-001-COORD-004-DENY SOURCE denies after valid admission without payload or handoff", async () => {
    const cases = [
      {
        name: "valid authorization but destination PatientMapping is REVOKED",
        sessionId: "16000000-0000-4000-8000-000000000052",
        studyRefId: "18000000-0000-4000-8000-000000000052",
        grantId: "1a000000-0000-4000-8000-000000000052",
        operationId: "1b000000-0000-4000-8000-000000000080",
        idempotencyKey: "1b000000-0000-4000-8000-000000000083",
        correlationId: "1d000000-0000-4000-8000-000000000061",
        expectedPreparation: "DENIED",
        expectedReason: "PATIENT_MAPPING_INVALID",
        expectedRequests: [],
      },
      {
        name: "valid mapping but DICOM PatientID differs from the mapped patient",
        sessionId: "16000000-0000-4000-8000-000000000053",
        studyRefId: "18000000-0000-4000-8000-000000000053",
        grantId: "1a000000-0000-4000-8000-000000000053",
        operationId: "1b000000-0000-4000-8000-000000000081",
        idempotencyKey: "1b000000-0000-4000-8000-000000000084",
        correlationId: "1d000000-0000-4000-8000-000000000062",
        metadataFault: "PATIENT_ID_MISMATCH",
        expectedPreparation: "DENIED",
        expectedReason: "SOURCE_PATIENT_ID_MISMATCH",
        expectedRequests: ["METADATA"],
      },
      {
        name: "malformed synthetic source DICOM JSON metadata",
        sessionId: "16000000-0000-4000-8000-000000000054",
        studyRefId: "18000000-0000-4000-8000-000000000054",
        grantId: "1a000000-0000-4000-8000-000000000054",
        operationId: "1b000000-0000-4000-8000-000000000082",
        idempotencyKey: "1b000000-0000-4000-8000-000000000085",
        correlationId: "1d000000-0000-4000-8000-000000000063",
        metadataFault: "MALFORMED_JSON",
        expectedError: "PACS_IMPORT_SOURCE_PREPARATION_UNAVAILABLE",
        expectedRequests: ["METADATA"],
      },
    ];

    for (const scenario of cases) {
      const root = await mkdtemp(join(tmpdir(), "mediq-coord-source-deny-"));
      const storageRoot = join(root, "ciphertext");
      const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
      const harness = createHarness({ temporaryImagingStore: store, metadataFault: scenario.metadataFault });
      try {
        let operationIdIssued = false;
        const admission = new PacsImportOperationAdmissionService(
          harness.executor,
          () => new Date(),
          () => {
            if (!operationIdIssued) {
              operationIdIssued = true;
              return scenario.operationId;
            }
            return randomUUID();
          },
        );
        const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, store);
        const coordinator = new PacsImportSourcePreparationCoordinator(admission, harness.service, purge);
        const request = Object.freeze({
          sessionId: scenario.sessionId,
          tenantCandidate: fixture.tenantId,
          idempotencyKey: scenario.idempotencyKey,
          correlationId: scenario.correlationId,
          body: Object.freeze({ grantId: scenario.grantId, studyRefId: scenario.studyRefId }),
        });
        const beforePayload = await readTemporaryPayloadState(harness, scenario.studyRefId);
        assert.deepEqual(beforePayload, {
          temporary_storage_ref: null,
          temporary_payload_state: null,
          temporary_payload_expires_at: null,
          temporary_payload_purged_at: null,
        }, "COORD004_SOURCE_FIXTURE_HAS_NO_PRIOR_TEMPORARY_STATE");

        if (scenario.expectedError) {
          await assert.rejects(
            coordinator.prepare({ principal, request }),
            error => error?.message === scenario.expectedError,
            "COORD004_SOURCE_FIXED_UNAVAILABLE",
          );
        } else {
          assert.deepEqual(await coordinator.prepare({ principal, request }), {
            operationId: scenario.operationId,
            operationState: "CREATED",
            preparation: scenario.expectedPreparation,
            reason: scenario.expectedReason,
          }, "COORD004_SOURCE_MINIMIZED_DENIAL");
        }

        const operation = await readOperationState(harness, scenario.operationId);
        assert.equal(operation.operationState, "CREATED", "COORD004_SOURCE_OPERATION_REMAINS_CREATED");
        assert.deepEqual(operation.evidence, [], "COORD004_SOURCE_NO_INTEGRITY");
        assert.deepEqual(await readTemporaryPayloadState(harness, scenario.studyRefId), beforePayload,
          "COORD004_SOURCE_NO_TEMPORARY_PAYLOAD_ALLOCATION");

        const counters = harness.counters();
        assert.deepEqual(counters.sourceRequests, scenario.expectedRequests, "COORD004_SOURCE_EXACT_REQUEST_BOUND");
        assert.equal(counters.metadataCalls, scenario.expectedRequests.includes("METADATA") ? 1 : 0);
        assert.equal(counters.instanceCalls, 0, "COORD004_SOURCE_NO_INSTANCE_BYTES");
        assert.equal(counters.stowCalls, 0, "COORD004_SOURCE_NO_STOW");
        assert.equal(counters.destinationVerificationCalls, 0, "COORD004_SOURCE_NO_DESTINATION_VERIFY");
        assert.equal(counters.destinationByteCalls, 0, "COORD004_SOURCE_NO_DESTINATION_READ");
        assert.equal(counters.forbiddenEndpointAttempts, 0);
        assert.equal(counters.activeTenantTransactions, 0, "COORD004_SOURCE_TRANSACTIONS_CLOSED");
        assert.deepEqual(await readdir(storageRoot).catch(error => error?.code === "ENOENT" ? [] : Promise.reject(error)), [],
          "COORD004_SOURCE_NO_CIPHERTEXT_OBJECTS");
      } finally {
        await harness.database.onModuleDestroy();
        await rm(root, { recursive: true, force: true });
      }
    }
    console.log("pacs_import_coordinator_source_denials=PASS cases=3 admitted_created=3 no_handoff=true no_payload=true");
  });

  const runCoordinatorFaultMatrix = async matrix => {
    for (const scenario of coordinatorFaultCases) {
      await matrix.test(`FAULT-${scenario.name}`, async () => {
        const root = await mkdtemp(join(tmpdir(), "mediq-coord-fault-"));
        const storageRoot = join(root, "ciphertext");
        const ioFault = scenario.fault === "CIPHERTEXT_WRITE" ? {
          async write() { throw new Error("SYNTHETIC_CIPHERTEXT_WRITE_FAILURE"); },
          async sync(file) { return file.sync(); },
        } : undefined;
        const store = new EphemeralEncryptedTemporaryImagingStore({
          rootDirectory: storageRoot,
          ...(ioFault ? { ciphertextIo: ioFault } : {}),
        });
        const temporaryStore = Object.freeze({
          beginReservedPackage: (...args) => store.beginReservedPackage(...args),
          beginInstance: input => store.beginInstance(input),
          sealPackage: input => scenario.fault === "CIPHERTEXT_SEAL"
            ? Promise.reject(new Error("SYNTHETIC_CIPHERTEXT_SEAL_FAILURE"))
            : store.sealPackage(input),
          purgeByReference: input => scenario.fault === "PURGE_FAILURE"
            ? Promise.reject(new Error("SYNTHETIC_PHYSICAL_PURGE_FAILURE"))
            : store.purgeByReference(input),
        });
        const harness = createHarness({
          failFirstInstance: scenario.fault === "PARTIAL_WADO",
          observeInstanceStreams: true,
          temporaryImagingStore: temporaryStore,
        });
        const filePaths = async directory => {
          const entries = await readdir(directory, { withFileTypes: true }).catch(error =>
            error?.code === "ENOENT" ? [] : Promise.reject(error));
          const nested = await Promise.all(entries.map(entry => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? filePaths(path) : entry.isFile() ? [path] : [];
          }));
          return nested.flat();
        };
        try {
          let operationIdIssued = false;
          const admission = new PacsImportOperationAdmissionService(
            harness.executor,
            () => new Date(),
            () => {
              if (!operationIdIssued) {
                operationIdIssued = true;
                return scenario.operationId;
              }
              return randomUUID();
            },
          );
          const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, temporaryStore);
          const coordinator = new PacsImportSourcePreparationCoordinator(admission, harness.service, purge);
          const request = Object.freeze({
            sessionId: scenario.sessionId,
            tenantCandidate: fixture.tenantId,
            idempotencyKey: scenario.idempotencyKey,
            correlationId: scenario.correlationId,
            body: Object.freeze({ grantId: scenario.grantId, studyRefId: scenario.studyRefId }),
          });
          assert.deepEqual(await readTemporaryPayloadState(harness, scenario.studyRefId), {
            temporary_storage_ref: null,
            temporary_payload_state: null,
            temporary_payload_expires_at: null,
            temporary_payload_purged_at: null,
          }, "COORD004_FAULT_FIXTURE_NO_PRIOR_TEMPORARY_STATE");
          await assert.rejects(
            coordinator.prepare({ principal, request }),
            error => error?.message === "PACS_IMPORT_SOURCE_PREPARATION_UNAVAILABLE",
            "COORD004_FAULT_FIXED_UNAVAILABLE_NO_HANDOFF",
          );

          const operation = await readOperationState(harness, scenario.operationId);
          assert.equal(operation.operationState, "CREATED", "COORD004_FAULT_OPERATION_NONTERMINAL");
          assert.deepEqual(operation.evidence, [], "COORD004_FAULT_NO_INTEGRITY_EVIDENCE");
          const counters = harness.counters();
          assert.deepEqual(counters.sourceRequests, scenario.sourceRequests, "COORD004_FAULT_EXACT_SOURCE_BOUND");
          assert.equal(counters.metadataCalls, scenario.sourceRequests.includes("METADATA") ? 1 : 0);
          assert.equal(counters.instanceCalls, scenario.instanceCalls);
          assert.equal(counters.instanceStreamCompletionOrder.length, scenario.completedStreams);
          assert.equal(counters.activeInstanceStreams, 0, "COORD004_FAULT_ALL_STREAMS_CLOSED");
          assert.equal(counters.activeTenantTransactions, 0, "COORD004_FAULT_ALL_TRANSACTIONS_CLOSED");
          assert.equal(counters.stowCalls, 0, "COORD004_FAULT_ZERO_STOW");
          assert.equal(counters.destinationVerificationCalls, 0, "COORD004_FAULT_ZERO_DESTINATION_VERIFY");
          assert.equal(counters.destinationByteCalls, 0, "COORD004_FAULT_ZERO_DESTINATION_READ");
          assert.equal(counters.forbiddenEndpointAttempts, 0);

          const temporaryState = await readTemporaryPayloadState(harness, scenario.studyRefId);
          const paths = await filePaths(storageRoot);
          assert.equal(paths.length, scenario.physicalFiles, "COORD004_FAULT_EXACT_PHYSICAL_FILE_COUNT");
          if (scenario.temporaryState === "NONE") {
            assert.deepEqual(temporaryState, {
              temporary_storage_ref: null,
              temporary_payload_state: null,
              temporary_payload_expires_at: null,
              temporary_payload_purged_at: null,
            }, "COORD004_FAULT_NO_TEMPORARY_ALLOCATION");
          } else {
            assert.match(temporaryState.temporary_storage_ref, /^[0-9a-f-]{36}$/i);
            assert.equal(temporaryState.temporary_payload_state, scenario.temporaryState);
            assert.ok(temporaryState.temporary_payload_expires_at instanceof Date);
            if (scenario.temporaryState === "PURGED") {
              assert.ok(temporaryState.temporary_payload_purged_at instanceof Date);
            } else {
              assert.equal(temporaryState.temporary_payload_purged_at, null,
                "COORD004_FAULT_UNRESOLVED_PURGE_HAS_NO_PURGED_TIMESTAMP");
              for (const path of paths) {
                assert.match(basename(path), /^[0-9a-f-]{36}\.enc$/i,
                  "COORD004_FAULT_RETAINED_OBJECT_IS_OPAQUE_CIPHERTEXT");
                const bytes = await readFile(path);
                assert.ok(bytes.length > 32);
                assert.equal(bytes.includes(Buffer.from("DICM")), false,
                  "COORD004_FAULT_RETAINED_BYTES_ARE_NOT_DICOM_PLAINTEXT");
                assert.equal(bytes.includes(Buffer.from(manifest.patient.patientId)), false,
                  "COORD004_FAULT_RETAINED_BYTES_EXCLUDE_SYNTHETIC_PATIENT_IDENTIFIER");
              }
            }
          }
          if (scenario.name === "purge-unresolved") await observeCoordinatorFaultPending();
        } finally {
          await harness.database.onModuleDestroy();
          await rm(root, { recursive: true, force: true });
        }
      });
    }
    console.log("pacs_import_coordinator_faults=PASS cases=8 fixed_unavailable=true nonterminal=true destination=0 unresolved_purge_explicit=true");
  };

  await t.test("TC-INT-001-CAP-009 final fenced reauthorization denies after live Grant revocation during WADO", async () => {
    const harness = createHarness({
      observeInstanceStreams: true,
      revokeGrantAfterInstanceBytes: true,
    });
    try {
      const result = await harness.service.capture(captureCommand(
        fixture.correlationInFlightRevocation,
        fixture.operationInFlightRevocationId,
        {
          consentId: fixture.consentInFlightRevocationId,
          grantId: fixture.grantInFlightRevocationId,
        },
      ));
      assert.deepEqual(result, { kind: "DENIED", reason: "AUTHORIZATION_DENIED" });

      const counters = harness.counters();
      assert.equal(counters.grantRevocationCompleted, true, "CAP009_REAL_GRANT_REVOCATION_COMMITTED");
      assert.equal(counters.grantRevocationStatus, "REVOKED", "CAP009_GRANT_STATUS_REVOKED");
      assert.equal(counters.initialAuthorizationCommitted, true);
      assert.equal(counters.activeTenantTransactions, 0);
      assert.equal(counters.activeInstanceStreams, 0, "CAP009_ALL_RECEIVED_STREAMS_CLOSED");
      assert.equal(counters.instanceCalls, manifest.instanceCount);
      assert.equal(counters.instanceStreamCompletionOrder.length, manifest.instanceCount);
      assert.equal(counters.maximumActiveInstanceStreams, 1);
      assert.equal(counters.forbiddenEndpointAttempts, 0);
      assert.equal(counters.stowCalls, 0);
      assert.equal(counters.destinationVerificationCalls, 0);
      const state = await readOperationState(harness, fixture.operationInFlightRevocationId);
      assert.equal(state.operationState, "CREATED");
      assert.deepEqual(state.evidence, []);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  for (const scenario of allSourceLifecycleCases) {
    await t.test(`DEC017 signed lifecycle ${scenario.name}`, { timeout: 120_000 }, childTest => runTemporaryLifecycleCase(scenario, childTest.signal));
  }

  await t.test("TC-PACS-001-COORD-004-DENY FAULT fails closed and preserves unresolved purge evidence", runCoordinatorFaultMatrix);

  if (process.env.MEDIQ_TEST_TRANSFER_DISPATCH_MODE === "true") {
    await t.test("TC-PACS-001-DISPATCH-001-006 performs one committed synthetic Study STOW to Test Orthanc B", {
      timeout: 120_000,
    }, async () => {
      const root = await mkdtemp(join(tmpdir(), "mediq-pacs-dispatch-"));
      const storageRoot = join(root, "ciphertext");
      const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot });
      let harness;
      let stowBoundaryObserved = false;
      let dispatchReturned = false;
      const beforeStow = async () => {
        assert.equal(harness.counters().activeTenantTransactions, 0, "DISPATCH_NO_OPEN_TENANT_TRANSACTION");
        const facts = await harness.actorContext.run(principal, fixture.tenantId, async (identity, client) => {
          assert.equal(identity.actorId, fixture.actorId, "DISPATCH_OBSERVER_VERIFIED_ACTOR");
          const operation = (await client.query(`SELECT operation_id::text,state,version,reason_code,
            source_object_count,destination_object_count,stow_started_at
            FROM pacs_transfer_operations WHERE operation_id=$1::uuid`, [fixture.transferDispatchOperationId])).rows;
          const provenance = (await client.query(`SELECT operation_id::text,exchange_session_id::text,
            package_id::text,study_ref_id::text,source_hospital_id::text,destination_hospital_id::text,
            transfer_type,transfer_status,integrity_id,ingested_at,transferred_at
            FROM provenance_records WHERE operation_id=$1::uuid`, [fixture.transferDispatchOperationId])).rows;
          return { operation, provenance };
        });
        assert.equal(harness.counters().activeTenantTransactions, 0, "DISPATCH_OBSERVER_TRANSACTION_SETTLED");
        assert.equal(facts.operation.length, 1, "DISPATCH_INDEPENDENT_OPERATION_VISIBLE");
        assert.equal(facts.operation[0].state, "STOW_STARTED", "DISPATCH_CLAIM_COMMITTED_BEFORE_POST");
        assert.equal(facts.operation[0].version, 2);
        assert.equal(facts.operation[0].source_object_count, manifest.instanceCount);
        assert.equal(facts.operation[0].destination_object_count, null);
        assert.ok(facts.operation[0].stow_started_at instanceof Date);
        assert.equal(facts.provenance.length, 1, "DISPATCH_PENDING_PROVENANCE_COMMITTED_BEFORE_POST");
        assert.deepEqual(facts.provenance[0], {
          operation_id: fixture.transferDispatchOperationId,
          exchange_session_id: fixture.transferDispatchSessionId,
          package_id: fixture.transferDispatchPackageId,
          study_ref_id: fixture.transferDispatchStudyRefId,
          source_hospital_id: TEST_HOSPITAL_A_ID,
          destination_hospital_id: TEST_HOSPITAL_B_ID,
          transfer_type: "PACS_IMPORT",
          transfer_status: "PENDING",
          integrity_id: null,
          ingested_at: null,
          transferred_at: null,
        });
        stowBoundaryObserved = true;
      };
      harness = createHarness({ temporaryImagingStore: store, observeInstanceStreams: true,
        allowStudyStow: true, beforeStow });
      try {
        const admission = new PacsImportOperationAdmissionService(
          harness.executor,
          () => new Date(),
          () => fixture.transferDispatchOperationId,
        );
        const purge = new TemporaryPayloadPurgeCoordinator(harness.actorContext, store);
        const preparation = new PacsImportSourcePreparationCoordinator(admission, harness.service, purge);
        const dispatcher = new PacsImportTransferDispatchCoordinator(
          preparation,
          admission,
          harness.service,
          harness.dicomGateway,
          new DispatchedInstanceStreamFactory(harness.service),
        );
        const request = Object.freeze({
          sessionId: fixture.transferDispatchSessionId,
          tenantCandidate: fixture.tenantId,
          idempotencyKey: fixture.transferDispatchIdempotencyKey,
          correlationId: fixture.transferDispatchCorrelationId,
          body: Object.freeze({
            grantId: fixture.transferDispatchGrantId,
            studyRefId: fixture.transferDispatchStudyRefId,
          }),
        });
        const result = await dispatcher.transfer({ principal, request });
        dispatchReturned = true;
        assert.deepEqual(result, {
          operationId: fixture.transferDispatchOperationId,
          operationState: "VERIFYING",
          dispatch: "VERIFYING",
        });
        assert.equal(stowBoundaryObserved, true, "DISPATCH_BEFORE_EFFECT_OBSERVER_RAN");
        const state = await readOperationState(harness, fixture.transferDispatchOperationId);
        assert.equal(state.operationState, "VERIFYING");
        assert.deepEqual(state.evidence.map(item => ({ stage: item.stage, status: item.status })), [
          { stage: "SOURCE_CAPTURE", status: "PENDING" },
        ]);
        const counters = harness.counters();
        assert.equal(counters.sourceRequests.length, manifest.instanceCount + 1);
        assert.equal(counters.maximumActiveInstanceStreams, 1);
        assert.equal(counters.stowCalls, 1, "DISPATCH_SINGLE_GATEWAY_STOW");
        assert.equal(counters.bStowRequests, 1, "DISPATCH_SINGLE_HTTPS_B_POST");
        assert.equal(counters.destinationVerificationCalls, 0, "DISPATCH_NO_PRODUCT_DESTINATION_VERIFY_YET");
        assert.equal(counters.destinationByteCalls, 0);
        assert.equal(counters.activeTenantTransactions, 0);
        console.log("pacs_import_dispatch=PASS commit_before_effect=true b_stow=1 operation=VERIFYING provenance=PENDING destination_verification=NOT_RUN payload_retained_for_next_gate=true");
      } catch (error) {
        let counters = {};
        try { counters = harness?.counters() ?? {}; } catch { /* diagnostic remains bounded and optional */ }
        let operationState = "UNKNOWN";
        try {
          operationState = (await readOperationState(harness, fixture.transferDispatchOperationId)).operationState;
        } catch { /* never expose the observer error */ }
        console.log(pacsImportDispatchFailureDiagnostic({
          stowHookObserved: stowBoundaryObserved,
          dispatchReturned,
          operationState,
          sourceReads: counters.sourceRequests?.length,
          gatewayStows: counters.stowCalls,
          bPosts: counters.bStowRequests,
          destinationChecks: counters.destinationVerificationCalls,
          error,
        }));
        throw error;
      } finally {
        try {
          await harness.database.onModuleDestroy();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    });
  }

  assert.equal(TEST_HOSPITAL_A_ID, "04000000-0000-4000-8000-000000000001");
  assert.equal(TEST_HOSPITAL_B_ID, "04000000-0000-4000-8000-000000000002");
});
