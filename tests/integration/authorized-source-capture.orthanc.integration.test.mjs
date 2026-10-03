import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, readdir, rm, stat, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { temporaryCaptureLifecycleCases, privacyAssert, assertPublicCaptureProjection,
  assertPublicCaptureError } from "../fixtures/temporary-capture-lifecycle-fixture.mjs";
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

function createHarness({
  failFirstInstance = false,
  databaseUrl,
  metadataFault,
  observeInstanceStreams = false,
  revokeGrantAfterInstanceBytes = false,
  oidcAuthentication,
  temporaryImagingStore,
} = {}) {
  const parsedConfig = parseAppConfig(process.env);
  const config = Object.freeze({ ...parsedConfig,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(oidcAuthentication ? { oidcAuthentication } : {}),
  });
  const database = new RuntimeDatabaseService(config);
  let quotaReservations = 0;
  const databaseFailures = [];
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
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") {
            return (...args) => {
              const statement = typeof args[0] === "string" ? args[0] : args[0]?.text ?? "";
              const queryLabel = statement.includes("FROM actors AS a")
                ? "ACTOR_LOOKUP"
                : statement.includes("pg_advisory_xact_lock")
                  ? "SESSION_FENCE"
                  : statement.includes("JOIN consents AS c")
                    ? "AUTHORIZATION_READ"
                    : statement.includes("FROM pacs_transfer_operations AS op")
                      ? "SOURCE_SCOPE"
                      : statement.includes("INSERT INTO audit_events")
                        ? "AUDIT_INSERT"
                        : statement.includes("INSERT INTO integrity_evidence")
                          ? "EVIDENCE_INSERT"
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
              return Reflect.apply(target.query, target, args).then((result) => {
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
  let destinationVerificationCalls = 0;
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
        const result = await rawActorContext.run(...args);
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
        assert.equal(activeTenantTransactions, 0, "No verified-Tenant transaction may span WADO");
        assert.equal(initialAuthorizationCommitted, true, "A WADO must follow committed initial authorization");
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
        const response = await globalThis.fetch(input, init);
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
              assert.equal(activeTenantTransactions, 0, "No transaction may span DICOM stream consumption");
              assert.equal(initialAuthorizationCommitted, true);
              try {
                const part = await reader.read();
                if (part.done) controller.close();
                else controller.enqueue(part.value);
              } catch (error) {
                controller.error(error);
              }
            },
            async cancel(reason) {
              await reader.cancel(reason).catch(() => undefined);
            },
          });
          return new Response(monitored, {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      },
    },
  );

  const dicomGateway = Object.freeze({
    retrieveStudyMetadata: (request) => {
      metadataCalls += 1;
      return adapter.retrieveStudyMetadata(request);
    },
    retrieveInstanceStream: async (request) => {
      instanceCalls += 1;
      if (!observeInstanceStreams) return adapter.retrieveInstanceStream(request);

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
            settle();
            controller.error(error);
          }
        },
        async cancel(reason) {
          await reader.cancel(reason).catch(() => undefined);
          settle();
        },
      }, { highWaterMark: 0 });
      return Object.freeze({ ...source, body });
    },
    storeInstanceStream: async () => {
      stowCalls += 1;
      throw new Error("SOURCE_CAPTURE_TEST_STOW_FORBIDDEN");
    },
    verifyDestinationStudy: async () => {
      destinationVerificationCalls += 1;
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
    counters: () => Object.freeze({
      tenantContextRuns,
      quotaReservations,
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
      destinationVerificationCalls,
      grantRevocationCompleted,
      grantRevocationStatus,
      metadataCalls,
      instanceCalls,
      tenantContextFailures: [...tenantContextFailures],
      databaseFailures: [...databaseFailures],
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
    const diagnosticPhase = ["RESERVED", "QUOTA", "AVAILABLE", "READ_RESULT", "PHYSICAL_ABSENT", "FINAL"].includes(phase) ? phase : "UNKNOWN";
    console.error(`DEC017_PRIVACY_PROBE_${diagnosticPhase}_${code}`);
    throw new Error(code);
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
  let root, store, harness, signedPrincipal;
  const attempted = [];
  const observedQuotaRefs = new Set();
  let callbacks = 0;
  let releaseReservation, reservationEntered;
  const heldReservation = new Promise(resolve => { releaseReservation = resolve; });
  const reservationReached = new Promise(resolve => { reservationEntered = resolve; });
  let winner;
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
        assert.equal(harness.counters().activeTenantTransactions, 0, "DEC017_WRITE_OUTSIDE_OWN_TRANSACTION");
        assert.ok(harness.counters().quotaReservations > 0, "DEC017_COMMITTED_QUOTA_BEFORE_WRITE");
        const ref = attempted.at(-1).storageRef;
        if (!observedQuotaRefs.has(ref)) {
          await observePrivacy(scenario, "QUOTA", signal);
          observedQuotaRefs.add(ref);
        }
        if (scenario.name === "capture_write_failure") throw new Error("DEC017_SYNTHETIC_WRITE_FAILURE");
        return file.write(buffer, offset, length, position);
      },
      sync: file => {
        if (scenario.name === "capture_fsync_failure") throw new Error("DEC017_SYNTHETIC_FSYNC_FAILURE");
        return file.sync();
      },
    } });
    const port = {
      async beginReservedPackage(binding, ref, quota) {
        assert.equal(harness.counters().activeTenantTransactions, 0);
        const state = await currentMetadata();
        assert.equal(state.temporary_payload_state, "STAGING", "DEC017_RESERVED_BEFORE_ALLOCATION");
        assert.equal(state.temporary_storage_ref, ref);
        await observePrivacy(scenario, "RESERVED", signal);
        attempted.push({ storageRef: ref, binding });
        if (scenario.name === "concurrent_capture" && attempted.length === 1) {
          reservationEntered();
          await heldReservation;
        }
        return store.beginReservedPackage(binding, ref, quota);
      },
      beginInstance: input => store.beginInstance(input),
      sealPackage: input => store.sealPackage(input),
      async purgeByReference(input) {
        assert.equal(harness.counters().activeTenantTransactions, 0);
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
          assert.equal(harness.counters().activeTenantTransactions, 0);
          phase += 1;
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
    harness = createHarness({ temporaryImagingStore: port, oidcAuthentication: auth, observeInstanceStreams: true });
    const runtime = await harness.database.connect();
    try {
      const role = await runtime.query("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
      assert.deepEqual(role.rows[0], { current_user: "mediq_runtime", rolsuper: false, rolbypassrls: false });
      assert.equal((await runtime.query("SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public'")).rows[0].n, 244);
      assert.deepEqual((await runtime.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='study_references'::regclass")).rows[0], { relrowsecurity: true, relforcerowsecurity: true });
      assert.equal((await runtime.query("SELECT study_ref_id FROM study_references WHERE study_ref_id=$1", [scenario.studyRefId])).rowCount, 0, "DEC017_NO_CONTEXT_DENIED");
      await assert.rejects(runtime.query("SELECT reserved_bytes FROM temporary_payload_quota_state"), error => error?.code === "42501");
    } finally { runtime.release(); }
    const input = { ...captureCommand(scenario.correlationId, scenario.operationId, scenario), principal: signedPrincipal };
    // Bilateral Study visibility is not ownership of the Tenant-B operation.
    const cross = await harness.service.captureForCoordinator({ ...input, principal: crossPrincipal, tenantCandidate: fixture.otherTenantId });
    assert.equal(cross.kind, "DENIED");
    assert.equal(harness.counters().instanceCalls, 0);

    if (captureFailure) {
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
      const readInput = objectRef => ({ principal: signedPrincipal, tenantCandidate: fixture.tenantId,
        correlationId: scenario.correlationId, consentId: scenario.consentId, grantId: scenario.grantId, handoff, objectRef });
      const consume = async bytes => { callbacks += 1; assert.equal(harness.counters().activeTenantTransactions, 0); };
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
    assert.equal(finalState.temporary_payload_state, "PURGED", "DEC017_FINAL_PURGED");
    assert.ok(finalState.temporary_payload_purged_at instanceof Date);
    assert.deepEqual(await readdir(storageRoot), []);
    await observePrivacy(scenario, "FINAL", signal);
    const counts = harness.counters();
    const expectedInstances = ["capture_write_failure", "capture_fsync_failure"].includes(scenario.name) ? 1
      : scenario.name === "replay_refetch" ? 6 : 3;
    assert.equal(counts.instanceCalls, expectedInstances);
    assert.equal(counts.activeTenantTransactions, 0);
    assert.equal(counts.stowCalls, 0);
    assert.equal(counts.forbiddenEndpointAttempts, 0);
    assert.equal(counts.destinationVerificationCalls, 0);
    assert.equal(counts.maximumActiveInstanceStreams, 1);
    // Write failure may cancel before the prefetching monitor observes EOF.
    // No second instance may open; fsync failure occurs after complete input.
    if (scenario.name === "capture_write_failure") assert.ok(counts.observedInstanceStreams.length <= 1);
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
    for (const item of counts?.databaseFailures ?? []) {
      if (/^[A-Z0-9_]{1,120}$/.test(item)) markers.push(`DEC017_QUERY_${item}`);
    }
    // Never serialize assertions' actual/expected values, SQL parameters or tokens.
    throw new Error([...new Set(markers)].join(" "));
  } finally {
    // Fixture teardown cannot count as product purge. The assertions above
    // run first; failures remain failures even when owned scratch data is removed.
    try {
      releaseReservation();
      if (winner) await winner.catch(() => undefined);
      if (store) for (const target of attempted) await store.purgeByReference(target);
      if (root) {
        assert.equal(resolve(dirname(root)), resolve(tmpdir()));
        assert.ok(basename(root).startsWith("mediq-orthanc-lifecycle-"));
        await rm(root, { recursive: true, force: true });
        await assert.rejects(stat(root), { code: "ENOENT" });
      }
    } finally {
      await harness?.database.onModuleDestroy();
      server.closeAllConnections();
      await new Promise(done => server.close(done));
    }
  }
}

if (process.argv.includes("--mediq-recovery-child")) {
  await runRecoveryReplica();
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

  for (const scenario of temporaryCaptureLifecycleCases) {
    await t.test(`DEC017 signed lifecycle ${scenario.name}`, { timeout: 120_000 }, childTest => runTemporaryLifecycleCase(scenario, childTest.signal));
  }

  assert.equal(TEST_HOSPITAL_A_ID, "04000000-0000-4000-8000-000000000001");
  assert.equal(TEST_HOSPITAL_B_ID, "04000000-0000-4000-8000-000000000002");
});
