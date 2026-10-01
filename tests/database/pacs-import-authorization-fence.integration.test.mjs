import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { AuthorizationDeniedError, AuthorizationGatedOperationExecutor } from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { GrantRevocationService } from "../../services/api/dist/grant/application/grant-revocation.service.js";

const { Pool } = pg;
const ISSUER = "https://identity.example.test/issuer";

function fixture() {
  const raw = process.env.MEDIQ_PACS001_FENCE_FIXTURE;
  assert.ok(raw, "PACS001_FENCE_FIXTURE_MISSING");
  const value = JSON.parse(raw);
  const required = ["subject", "tenantId", "sessionId", "studyRefId", "consentId", "grantId", "otherSubject", "withdrawnSessionId", "withdrawnStudyRefId", "withdrawnConsentId", "withdrawnGrantId"];
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

  const operationCount = async () => actorTenantContext.run(
    principal,
    ids.tenantId,
    async (_identity, client) => {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM pacs_transfer_operations WHERE exchange_session_id=$1",
        [ids.sessionId],
      );
      return result.rows[0].count;
    },
  );

  try {
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

    const withdrawnPrincipal = Object.freeze({ issuer: ISSUER, subject: ids.otherSubject });
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
    assert.equal(callbackCount, 1, "persisted withdrawn Consent must deny after the fence");
    assert.equal(await operationCount(), operationsBefore, "the no-side-effect fence does not create/advance an operation");
  } finally {
    releaseCallback.resolve();
    await Promise.allSettled([operationPromise, revocationPromise].filter(Boolean));
    await pool.end();
  }
});
