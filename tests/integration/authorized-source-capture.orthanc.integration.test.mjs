import assert from "node:assert/strict";
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
import {
  AuthorizedSourceCaptureService,
  AuthorizedSourceCaptureInvalidRequestError,
  AuthorizedSourceCaptureUnavailableError,
} from "../../services/api/dist/integrity/application/authorized-source-capture.service.js";

const manifestPath = process.env.MEDIQ_DICOM_TEST_MANIFEST;
assert.ok(manifestPath, "Synthetic Test Orthanc manifest is required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const fixture = Object.freeze({
  tenantId: "02000000-0000-4000-8000-000000000002",
  actorId: "0a000000-0000-4000-8000-000000000001",
  subject: "synthetic-int001-source-capture-actor",
  patientRefId: "15000000-0000-4000-8000-000000000001",
  mappingId: "15000000-0000-4000-8000-000000000002",
  sessionId: "16000000-0000-4000-8000-000000000001",
  packageId: "17000000-0000-4000-8000-000000000001",
  studyRefId: "18000000-0000-4000-8000-000000000001",
  consentId: "19000000-0000-4000-8000-000000000001",
  grantId: "1a000000-0000-4000-8000-000000000001",
  operationId: "1b000000-0000-4000-8000-000000000001",
  correlationDenied: "1d000000-0000-4000-8000-000000000001",
  correlationFailure: "1d000000-0000-4000-8000-000000000002",
  correlationSuccess: "1d000000-0000-4000-8000-000000000003",
  issuer: "https://synthetic-issuer.test",
});
const principal = Object.freeze({
  issuer: fixture.issuer,
  subject: fixture.subject,
});

function createHarness({ failFirstInstance = false } = {}) {
  const config = parseAppConfig(process.env);
  const database = new RuntimeDatabaseService(config);
  const rawActorContext = new ActorTenantContextService(
    config,
    database,
    new ActorRegistryRepository(),
  );
  let tenantContextRuns = 0;
  let activeTenantTransactions = 0;
  let initialAuthorizationCommitted = false;
  let pendingFailure = failFirstInstance;
  let bNetworkAttempts = 0;
  let stowCalls = 0;
  let destinationVerificationCalls = 0;
  const sourceRequests = [];
  const sourcePaths = [];

  const actorContext = Object.freeze({
    run: async (...args) => {
      tenantContextRuns += 1;
      activeTenantTransactions += 1;
      let committed = false;
      try {
        const result = await rawActorContext.run(...args);
        committed = true;
        return result;
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
        if (url.hostname !== "orthanc-a") {
          bNetworkAttempts += 1;
          throw new Error("SOURCE_CAPTURE_TEST_NETWORK_BOUNDARY");
        }
        assert.equal(method, "GET", "The source-capture adapter must not write to A");
        assert.equal(activeTenantTransactions, 0, "No verified-Tenant transaction may span WADO");
        assert.equal(initialAuthorizationCommitted, true, "A WADO must follow committed initial authorization");
        sourceRequests.push(url.pathname.includes("/metadata") ? "METADATA" : "INSTANCE");
        sourcePaths.push(url.pathname);
        const response = await globalThis.fetch(input, init);
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
    retrieveStudyMetadata: (request) => adapter.retrieveStudyMetadata(request),
    retrieveInstanceStream: (request) => adapter.retrieveInstanceStream(request),
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
      bNetworkAttempts,
      stowCalls,
      destinationVerificationCalls,
    }),
  });
}

async function readOperationState(harness) {
  return harness.actorContext.run(principal, fixture.tenantId, async (_identity, client) => {
    const operation = await client.query(
      `SELECT state FROM pacs_transfer_operations WHERE operation_id = $1::uuid`,
      [fixture.operationId],
    );
    const evidence = await client.query(
      `SELECT verification_stage, status, source_object_count
         FROM integrity_evidence
        WHERE operation_id = $1::uuid`,
      [fixture.operationId],
    );
    return Object.freeze({
      operationState: operation.rows[0]?.state ?? null,
      evidence: evidence.rows.map((row) => ({
        stage: row.verification_stage,
        status: row.status,
        objectCount: row.source_object_count,
      })),
    });
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
      assert.equal(counters.bNetworkAttempts, 0);
      assert.equal(counters.stowCalls, 0);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  await t.test("an invalid Grant is denied before any A WADO request", async () => {
    const harness = createHarness();
    try {
      const result = await harness.service.capture({
        principal,
        tenantCandidate: fixture.tenantId,
        correlationId: fixture.correlationDenied,
        operationId: fixture.operationId,
        consentId: fixture.consentId,
        grantId: "1a000000-0000-4000-8000-000000000099",
      });
      assert.deepEqual(result, { kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
      assert.deepEqual(harness.counters().sourceRequests, []);
      assert.equal(harness.counters().bNetworkAttempts, 0);
      assert.equal(harness.counters().stowCalls, 0);
      assert.equal(harness.counters().destinationVerificationCalls, 0);
      assert.equal(harness.counters().activeTenantTransactions, 0);
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
      assert.equal(counters.bNetworkAttempts, 0);
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
    const harness = createHarness();
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
      assert.equal(harness.counters().bNetworkAttempts, 0);
      assert.equal(harness.counters().stowCalls, 0);
      assert.equal(harness.counters().destinationVerificationCalls, 0);
      const state = await readOperationState(harness);
      assert.equal(state.operationState, "CREATED");
      assert.deepEqual(state.evidence, [{
        stage: "SOURCE_CAPTURE",
        status: "PENDING",
        objectCount: manifest.instanceCount,
      }]);
    } finally {
      await harness.database.onModuleDestroy();
    }
  });

  assert.equal(TEST_HOSPITAL_A_ID, "04000000-0000-4000-8000-000000000001");
  assert.equal(TEST_HOSPITAL_B_ID, "04000000-0000-4000-8000-000000000002");
});
