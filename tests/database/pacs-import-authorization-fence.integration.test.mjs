import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { AuthorizationDeniedError, AuthorizationGatedOperationExecutor, ProtectedOperationUnavailableError } from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { GrantRevocationService } from "../../services/api/dist/grant/application/grant-revocation.service.js";
import { ActorTenantContextDeniedError, ActorTenantContextUnavailableError } from "../../services/api/dist/identity/identity-context.types.js";
import { PacsImportOperationAdmissionService } from "../../services/api/dist/pacs/application/pacs-import-operation-admission.service.js";
import { PacsTransferOperationConflictError } from "../../services/api/dist/pacs/persistence/pacs-transfer-operation.repository.js";

const { Pool } = pg;
const ISSUER = "https://identity.example.test/issuer";

function fixture() {
  const raw = process.env.MEDIQ_PACS001_FENCE_FIXTURE;
  assert.ok(raw, "PACS001_FENCE_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = ["subject", "tenantId", "otherTenantId", "sessionId", "studyRefId", "siblingStudyRefId", "consentId", "grantId", "wrongRecipientTenantGrantId", "insufficientScopeGrantId", "expiredGrantId", "otherSubject", "withdrawnSessionId", "withdrawnStudyRefId", "withdrawnConsentId", "withdrawnGrantId", "auditFailureCorrelationId", "commitFailureCorrelationId"];
  assert.ok(required.every((key) => typeof value[key] === "string"), "PACS001_FENCE_FIXTURE_INVALID");
  return value;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("PACS-001 session fence serializes fresh authorization against recipient Grant revocation", {
  timeout: 20_000,
}, async () => {
  const connectionString = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(connectionString, "PACS001_FENCE_DATABASE_URL_MISSING");
  const ids = fixture();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5_000 });
  const config = {
    oidcAuthentication: {
      issuer: ISSUER,
      audience: "mediq-pacs-fence-test",
      jwksUri: "https://identity.example.test/jwks",
    },
  };
  const actorTenantContext = new ActorTenantContextService(
    config,
    { connect: () => pool.connect() },
    new ActorRegistryRepository(),
  );
  const policy = new ResolvedObjectAuthorizationPolicy(
    new PostgresAuthorizationEvidenceReader(),
  );
  const executor = new AuthorizationGatedOperationExecutor(
    actorTenantContext,
    new AuthorizationEngine(policy),
  );
  const revoker = new GrantRevocationService(actorTenantContext);
  const admission = new PacsImportOperationAdmissionService(executor);
  const principal = Object.freeze({ issuer: ISSUER, subject: ids.subject });
  const makeContext = (identity) => AuthorizationContext.create({
    identity,
    exchangeSessionId: ids.sessionId,
    resource: { kind: "STUDY", id: ids.studyRefId },
    action: "PACS_IMPORT",
    consentId: ids.consentId,
    grantId: ids.grantId,
  });
  const enteredCallback = deferred();
  const releaseCallback = deferred();
  let callbackCount = 0;
  let operationPromise;
  let revocationPromise;
  let currentStage = "FENCE_BASELINE";

  const operationCount = async (sessionId = ids.sessionId) => actorTenantContext.run(
    principal,
    ids.tenantId,
    async (_identity, client) => {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM pacs_transfer_operations WHERE exchange_session_id=$1",
        [sessionId],
      );
      return result.rows[0].count;
    },
  );
  const operationAuditCount = async (sessionId = ids.sessionId) => actorTenantContext.run(
    principal,
    ids.tenantId,
    async (_identity, client) => {
      const result = await client.query(
        `SELECT count(*)::int AS count
           FROM audit_events
          WHERE tenant_id = $1
            AND exchange_session_id = $2
            AND resource_type = 'PACS_TRANSFER_OPERATION'
            AND action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED'`,
        [ids.tenantId, sessionId],
      );
      return result.rows[0].count;
    },
  );

  const admissionRequest = (studyRefId, idempotencyKey, correlationId = randomUUID(), bindings = {}) => ({
    sessionId: bindings.sessionId ?? ids.sessionId,
    tenantCandidate: bindings.tenantCandidate ?? ids.tenantId,
    idempotencyKey,
    correlationId,
    body: { grantId: bindings.grantId ?? ids.grantId, studyRefId },
  });
  const denyAdmissionWithoutWrites = async ({
    principal: candidatePrincipal = principal,
    request,
    expectedError = AuthorizationDeniedError,
  }) => {
    const sessionId = request.sessionId;
    const beforeOperations = await operationCount(sessionId);
    const beforeAudits = await operationAuditCount(sessionId);
    await assert.rejects(
      admission.admit({ principal: candidatePrincipal, request }),
      expectedError,
    );
    assert.equal(await operationCount(sessionId), beforeOperations,
      "denied admission must not insert or mutate an operation");
    assert.equal(await operationAuditCount(sessionId), beforeAudits,
      "denied admission must not emit a state Audit");
  };

  try {
    currentStage = "FENCE_BASELINE_OPERATION_COUNT";
    const initialOperationCount = await operationCount();
    currentStage = "FENCE_BASELINE_AUDIT_COUNT";
    const initialAuditCount = await operationAuditCount();

    currentStage = "ADMISSION_MISSING_GRANT_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.studyRefId, randomUUID(), randomUUID(), { grantId: randomUUID() }),
    });

    currentStage = "ADMISSION_WRONG_TENANT_CANDIDATE_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.studyRefId, randomUUID(), randomUUID(), { tenantCandidate: ids.otherTenantId }),
      expectedError: ActorTenantContextDeniedError,
    });

    currentStage = "ADMISSION_WRONG_RECIPIENT_TENANT_GRANT_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.studyRefId, randomUUID(), randomUUID(), { grantId: ids.wrongRecipientTenantGrantId }),
    });

    currentStage = "ADMISSION_WRONG_SESSION_GRANT_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.studyRefId, randomUUID(), randomUUID(), { grantId: ids.expiredGrantId }),
    });

    const recipientServicePrincipal = Object.freeze({ issuer: ISSUER, subject: ids.otherSubject });
    currentStage = "ADMISSION_EXPIRED_GRANT_DENIAL";
    await denyAdmissionWithoutWrites({
      principal: recipientServicePrincipal,
      request: admissionRequest(
        ids.withdrawnStudyRefId,
        randomUUID(),
        randomUUID(),
        { sessionId: ids.withdrawnSessionId, grantId: ids.expiredGrantId },
      ),
    });

    currentStage = "ADMISSION_FOREIGN_STUDY_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.withdrawnStudyRefId, randomUUID()),
    });

    currentStage = "ADMISSION_INSUFFICIENT_SCOPE_DENIAL";
    await denyAdmissionWithoutWrites({
      request: admissionRequest(ids.studyRefId, randomUUID(), randomUUID(), { grantId: ids.insufficientScopeGrantId }),
    });

    currentStage = "ADMISSION_AUDIT_FAILURE_ROLLBACK";
    await assert.rejects(
      admission.admit({
        principal,
        request: admissionRequest(ids.siblingStudyRefId, randomUUID(), ids.auditFailureCorrelationId),
      }),
      ProtectedOperationUnavailableError,
      "Audit failure must be sanitized and deny operation admission",
    );
    assert.equal(await operationCount(), initialOperationCount);
    assert.equal(await operationAuditCount(), initialAuditCount);

    currentStage = "ADMISSION_COMMIT_FAILURE_ROLLBACK";
    await assert.rejects(
      admission.admit({
        principal,
        request: admissionRequest(ids.studyRefId, randomUUID(), ids.commitFailureCorrelationId),
      }),
      ActorTenantContextUnavailableError,
      "deferred commit failure must not report a durable admission",
    );
    assert.equal(await operationCount(), initialOperationCount);
    assert.equal(await operationAuditCount(), initialAuditCount);

    const idempotencyKey = randomUUID();
    const firstClaim = admissionRequest(ids.studyRefId, idempotencyKey);
    currentStage = "ADMISSION_CONCURRENT_CLAIM";
    const [claimA, claimB] = await Promise.all([
      admission.admit({ principal, request: firstClaim }),
      admission.admit({
        principal,
        request: admissionRequest(ids.studyRefId, idempotencyKey),
      }),
    ]);
    assert.deepEqual([claimA.created, claimB.created].sort(), [false, true]);
    assert.equal(claimA.operation.operationId, claimB.operation.operationId);
    assert.equal(claimA.operation.state, "CREATED");
    assert.equal(claimA.operation.stowStartedAt, null);

    currentStage = "ADMISSION_EXACTLY_ONE_OPERATION_AND_AUDIT";
    assert.equal(await operationCount(), initialOperationCount + 1,
      "simultaneous claims must persist exactly one operation");
    assert.equal(await operationAuditCount(), initialAuditCount + 1,
      "simultaneous claims must persist exactly one initial state Audit");

    currentStage = "ADMISSION_EXACT_REPLAY";
    const replay = await admission.admit({ principal, request: firstClaim });
    assert.equal(replay.created, false);
    assert.equal(replay.operation.operationId, claimA.operation.operationId);
    currentStage = "ADMISSION_CHANGED_STUDY_CONFLICT";
    await assert.rejects(
      admission.admit({
        principal,
        request: admissionRequest(ids.siblingStudyRefId, idempotencyKey),
      }),
      PacsTransferOperationConflictError,
      "same key bound to another authorized Study must conflict without inserting",
    );
    assert.equal(await operationCount(), initialOperationCount + 1);
    assert.equal(await operationAuditCount(), initialAuditCount + 1);

    currentStage = "REVOCATION_FENCE_START";
    const operationsBefore = await operationCount();
    operationPromise = executor.executeWithSessionFence(
      principal,
      ids.tenantId,
      makeContext,
      async (_context, transactionClient) => {
        callbackCount += 1;
        assert.equal(typeof transactionClient.query, "function");
        enteredCallback.resolve();
        await releaseCallback.promise;
        return "INTERNAL_ELIGIBILITY_ONLY";
      },
    );

    await enteredCallback.promise;
    let revokeSettled = false;
    revocationPromise = revoker.revoke({
      principal,
      tenantCandidate: ids.tenantId,
      sessionId: ids.sessionId,
      grantId: ids.grantId,
      correlationId: randomUUID(),
      hasUnexpectedInput: false,
    }).then((result) => {
      revokeSettled = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(revokeSettled, false, "recipient revocation must wait on the PACS Session fence");

    releaseCallback.resolve();
    assert.equal(await operationPromise, "INTERNAL_ELIGIBILITY_ONLY");
    const revoked = await revocationPromise;
    assert.equal(revoked.grant.status, "REVOKED");
    assert.equal(callbackCount, 1);

    currentStage = "POST_REVOCATION_ADMISSION_DENIAL";
    await denyAdmissionWithoutWrites({
      request: firstClaim,
      expectedError: AuthorizationDeniedError,
    });

    await assert.rejects(
      executor.executeWithSessionFence(
        principal,
        ids.tenantId,
        makeContext,
        async () => {
          callbackCount += 1;
          return "MUST_NOT_RUN";
        },
      ),
      AuthorizationDeniedError,
    );
    assert.equal(callbackCount, 1, "post-revocation Authorization must deny before the callback");

    currentStage = "WITHDRAWN_CONSENT_DENIAL";
    const withdrawnPrincipal = recipientServicePrincipal;
    await assert.rejects(
      executor.executeWithSessionFence(
        withdrawnPrincipal,
        ids.tenantId,
        (identity) => AuthorizationContext.create({
          identity,
          exchangeSessionId: ids.withdrawnSessionId,
          resource: { kind: "STUDY", id: ids.withdrawnStudyRefId },
          action: "PACS_IMPORT",
          consentId: ids.withdrawnConsentId,
          grantId: ids.withdrawnGrantId,
        }),
        async () => {
          callbackCount += 1;
          return "MUST_NOT_RUN";
        },
      ),
      AuthorizationDeniedError,
    );
    await denyAdmissionWithoutWrites({
      principal: withdrawnPrincipal,
      request: admissionRequest(
        ids.withdrawnStudyRefId,
        randomUUID(),
        randomUUID(),
        { sessionId: ids.withdrawnSessionId, grantId: ids.withdrawnGrantId },
      ),
    });
    currentStage = "FINAL_NO_SIDE_EFFECT_ASSERTIONS";
    assert.equal(callbackCount, 1, "persisted withdrawn Consent must deny after the fence");
    assert.equal(await operationCount(), operationsBefore, "the no-side-effect fence does not create/advance an operation");
    console.log("pacs001_admission_denials=PASS cases=missing_grant,wrong_tenant_candidate,wrong_recipient_tenant_grant,wrong_session_grant,expired_grant,withdrawn_consent,foreign_study,insufficient_scope,revoked_grant no_operation_or_audit=true");
  } catch (error) {
    const safeName = ["AssertionError", "AuthorizationDeniedError", "ProtectedOperationUnavailableError", "ActorTenantContextDeniedError", "ActorTenantContextUnavailableError", "TypeError", "ReferenceError", "RangeError"].includes(error?.name)
      ? error.name
      : "OTHER_ERROR";
    const fixedMessages = new Set([
      "PACS_TRANSFER_OPERATION_INVALID",
      "PACS_TRANSFER_OPERATION_PERSISTENCE_FAILED",
      "PACS_TRANSFER_OPERATION_CONFLICT",
      "TRANSFER_GRANT_INVALID",
      "TRANSFER_GRANT_PERSISTENCE_FAILED",
      "PROTECTED_OPERATION_UNAVAILABLE",
      "AUTHORIZATION_DENIED",
    ]);
    const safeCode = typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : fixedMessages.has(error?.message) ? error.message : "NONE";
    console.log(`PACS001_FENCE_FAILURE_STAGE=${currentStage};ERROR=${safeName};CODE=${safeCode}`);
    throw error;
  } finally {
    releaseCallback.resolve();
    await Promise.allSettled([operationPromise, revocationPromise].filter(Boolean));
    await pool.end();
  }
});
