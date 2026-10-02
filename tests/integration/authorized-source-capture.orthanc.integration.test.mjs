import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
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
  packageId: "17000000-0000-4000-8000-000000000001",
  studyRefId: "18000000-0000-4000-8000-000000000001",
  studyMissingCountId: "18000000-0000-4000-8000-000000000013",
  consentId: "19000000-0000-4000-8000-000000000001",
  grantId: "1a000000-0000-4000-8000-000000000001",
  operationId: "1b000000-0000-4000-8000-000000000001",
  operationBindingMismatchId: "1b000000-0000-4000-8000-000000000011",
  operationSourceMismatchId: "1b000000-0000-4000-8000-000000000012",
  operationNotCreatedId: "1b000000-0000-4000-8000-000000000013",
  operationMissingCountId: "1b000000-0000-4000-8000-000000000014",
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
  withdrawnConsentId: "19000000-0000-4000-8000-000000000011",
  expiredConsentId: "19000000-0000-4000-8000-000000000012",
  revokedGrantId: "1a000000-0000-4000-8000-000000000011",
  expiredGrantId: "1a000000-0000-4000-8000-000000000012",
  wrongScopeGrantId: "1a000000-0000-4000-8000-000000000013",
  withdrawnConsentGrantId: "1a000000-0000-4000-8000-000000000014",
  expiredConsentGrantId: "1a000000-0000-4000-8000-000000000015",
  issuer: "https://synthetic-issuer.test",
});
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

function createHarness({
  failFirstInstance = false,
  databaseUrl,
  metadataFault,
  observeInstanceStreams = false,
} = {}) {
  const parsedConfig = parseAppConfig(process.env);
  const config = databaseUrl
    ? Object.freeze({ ...parsedConfig, databaseUrl })
    : parsedConfig;
  const database = new RuntimeDatabaseService(config);
  const databaseFailures = [];
  const databaseForContext = Object.freeze({
    connect: async () => {
      let client;
      try {
        client = await database.connect();
      } catch (error) {
        const sqlState = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
          ? error.code
          : "ERROR";
        databaseFailures.push(`CONNECT_${sqlState}`);
        throw error;
      }
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
              return Reflect.apply(target.query, target, args).catch((error) => {
                const sqlState = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
                  ? error.code
                  : error instanceof Error && /^[A-Za-z]+$/.test(error.name)
                    ? error.name.toUpperCase()
                    : "ERROR";
                databaseFailures.push(`${queryLabel}_${sqlState}`);
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
        // Capture can make more than one scoped Tenant transaction during a
        // single call (for example, a fail-closed audit path). Before the
        // first upstream request, any completed transaction in this fresh
        // harness can only be the shared Session fence, PACS_IMPORT decision,
        // and start-Audit transaction.
        if (committed) initialAuthorizationCommitted = true;
      }
    },
  });

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
          // Keep the real upstream request and headers, but fail the response
          // body at the transport boundary. Partially consuming Orthanc's
          // multipart parser here can block parser shutdown and makes the
          // test depend on third-party iterator cancellation semantics.
          void response.body?.cancel().catch(() => undefined);
          const failedBody = new ReadableStream({
            start(controller) {
              controller.error(new Error("SYNTHETIC_WADO_STREAM_FAILURE"));
            },
          });
          return new Response(failedBody, {
            status: response.status,
            headers: response.headers,
          });
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
  );

  return Object.freeze({
    service,
    database,
    actorContext,
    counters: () => Object.freeze({
      tenantContextRuns,
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

function captureCommand(correlationId, operationId = fixture.operationId) {
  return Object.freeze({
    principal,
    tenantCandidate: fixture.tenantId,
    correlationId,
    operationId,
    consentId: fixture.consentId,
    grantId: fixture.grantId,
  });
}

test("authorized source capture uses only A WADO after database-backed authorization and never writes B", async (t) => {
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
    const harness = createHarness({ failFirstInstance: true });
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

  await t.test("valid source capture records one pending baseline while operation remains CREATED", async () => {
    const harness = createHarness({ observeInstanceStreams: true });
    try {
      const result = await harness.service.capture({
        principal,
        tenantCandidate: fixture.tenantId,
        correlationId: fixture.correlationSuccess,
        operationId: fixture.operationId,
        consentId: fixture.consentId,
        grantId: fixture.grantId,
      });
      assert.equal(result.kind, "CAPTURED");
      if (result.kind !== "CAPTURED") return;
      assert.equal(result.status, "PENDING");
      assert.equal(result.objectCount, manifest.instanceCount);
      assert.deepEqual(Object.keys(result).sort(), ["evidenceId", "kind", "objectCount", "status"]);
      assert.equal(JSON.stringify(result).includes(manifest.studyInstanceUID), false);
      assert.equal(JSON.stringify(result).includes(manifest.patient.patientId), false);
      const expectedInstances = [...manifest.instances].sort((left, right) =>
        left.sopInstanceUID < right.sopInstanceUID
          ? -1
          : left.sopInstanceUID > right.sopInstanceUID
            ? 1
            : 0,
      );
      const expectedUids = expectedInstances.map((instance) => instance.sopInstanceUID);
      const expectedDigest = expectedSourceManifestDigest(manifest);
      const captureCounters = harness.counters();
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
      assert.equal(JSON.stringify(result).includes(expectedDigest), false, "CAP007_NO_DIGEST_IN_RESPONSE");
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

  assert.equal(TEST_HOSPITAL_A_ID, "04000000-0000-4000-8000-000000000001");
  assert.equal(TEST_HOSPITAL_B_ID, "04000000-0000-4000-8000-000000000002");
});
