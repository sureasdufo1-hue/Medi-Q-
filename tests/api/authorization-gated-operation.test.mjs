import { describe, expect, it, vi } from "vitest";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import {
  AuthorizationDeniedError,
  AuthorizationGatedOperationExecutor,
  ProtectedOperationUnavailableError,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../services/api/dist/identity/identity-context.types.js";

const principal = Object.freeze({
  issuer: "https://issuer.synthetic.test",
  subject: "synthetic-user-002",
});

const identity = Object.freeze({
  issuer: principal.issuer,
  subject: principal.subject,
  actorId: "03000000-0000-4000-8000-000000000002",
  tenantId: "01000000-0000-4000-8000-000000000002",
  hospitalId: "04000000-0000-4000-8000-000000000002",
  actorType: "USER",
});

function makeContext(overrides = {}) {
  return AuthorizationContext.create({
    identity: { ...identity, ...overrides.identity },
    exchangeSessionId: "25000000-0000-4000-8000-000000000002",
    resource: {
      kind: "STUDY",
      id: "28000000-0000-4000-8000-000000000002",
    },
    action: "VIEW",
    consentId: "26000000-0000-4000-8000-000000000002",
    grantId: "27000000-0000-4000-8000-000000000002",
    ...overrides,
  });
}

function contextFor(verifiedIdentity, overrides = {}) {
  return AuthorizationContext.create({
    identity: verifiedIdentity,
    exchangeSessionId: "25000000-0000-4000-8000-000000000002",
    resource: {
      kind: "STUDY",
      id: "28000000-0000-4000-8000-000000000002",
    },
    action: "VIEW",
    consentId: "26000000-0000-4000-8000-000000000002",
    grantId: "27000000-0000-4000-8000-000000000002",
    ...overrides,
  });
}

function setup(options = {}) {
  const { context = makeContext(), run, engine } = options;
  const effect = Object.hasOwn(options, "effect") ? options.effect : "ALLOW";
  const transactionClient = { query: vi.fn() };
  const runVerified = run ?? vi.fn(async (_principal, _tenantId, work) =>
    work(identity, transactionClient),
  );
  const policy = { evaluate: vi.fn().mockResolvedValue(effect) };
  const authorizationEngine = engine ?? new AuthorizationEngine(policy);
  const executor = new AuthorizationGatedOperationExecutor(
    { run: runVerified },
    authorizationEngine,
  );
  return { executor, transactionClient, runVerified, policy, context };
}

describe("AuthorizationGatedOperationExecutor", () => {
  it("runs one protected callback only after exact ALLOW on the same IAM transaction", async () => {
    const { executor, transactionClient, policy, context } = setup();
    const operation = vi.fn(async (_context, _client) => "synthetic-result");

    await expect(
      executor.execute(principal, identity.tenantId, () => context, operation),
    ).resolves.toBe("synthetic-result");

    expect(policy.evaluate).toHaveBeenCalledOnce();
    expect(policy.evaluate).toHaveBeenCalledWith(context, { transactionClient });
    expect(operation).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(context, transactionClient);
    expect(policy.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0],
    );
  });

  it("TC-PACS-001-FENCE-001 acquires the Session fence before evaluating current authorization", async () => {
    const { executor, transactionClient, policy, context } = setup();
    const operation = vi.fn(async () => "synthetic-eligibility-only");

    await expect(
      executor.executeWithSessionFence(
        principal,
        identity.tenantId,
        () => context,
        operation,
      ),
    ).resolves.toBe("synthetic-eligibility-only");

    expect(transactionClient.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [context.exchangeSessionId],
    );
    expect(transactionClient.query.mock.invocationCallOrder[0]).toBeLessThan(
      policy.evaluate.mock.invocationCallOrder[0],
    );
    expect(policy.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0],
    );
  });

  it("TC-PACS-001-FENCE-004 fails closed when the Session fence cannot be acquired", async () => {
    const { executor, transactionClient, policy } = setup();
    transactionClient.query.mockRejectedValueOnce(new Error("private lock detail"));
    const operation = vi.fn();

    await expect(
      executor.executeWithSessionFence(
        principal,
        identity.tenantId,
        contextFor,
        operation,
      ),
    ).rejects.toMatchObject({
      name: "ProtectedOperationUnavailableError",
      message: "PROTECTED_OPERATION_UNAVAILABLE",
    });
    expect(policy.evaluate).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("TC-PACS-001-FENCE-004 fails closed when the policy dependency throws after the fence", async () => {
    const policyDependency = {
      evaluate: vi.fn().mockRejectedValue(new Error("private policy detail")),
    };
    const { executor, transactionClient } = setup({ engine: policyDependency });
    const operation = vi.fn();

    await expect(
      executor.executeWithSessionFence(
        principal,
        identity.tenantId,
        contextFor,
        operation,
      ),
    ).rejects.toMatchObject({
      name: "ProtectedOperationUnavailableError",
      message: "PROTECTED_OPERATION_UNAVAILABLE",
    });
    expect(transactionClient.query).toHaveBeenCalledOnce();
    expect(policyDependency.evaluate).toHaveBeenCalledOnce();
    expect(operation).not.toHaveBeenCalled();
  });

  it.each(["DENY", "ALLOW ", "PERMIT", null, undefined, true])(
    "does not invoke the protected callback for non-exact decision %j",
    async (effect) => {
      const { executor } = setup({ effect });
      const operation = vi.fn();

      await expect(
        executor.execute(principal, identity.tenantId, contextFor, operation),
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it("denies when the engine has no configured policy", async () => {
    const { executor } = setup({ engine: new AuthorizationEngine() });
    const operation = vi.fn();

    await expect(
      executor.execute(principal, identity.tenantId, contextFor, operation),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    ["missing context", () => null],
    ["structural context copy", (verified) => ({ ...contextFor(verified) })],
    ["context with another issuer", (verified) =>
      contextFor({ ...verified, issuer: "https://other.synthetic.test" })],
    ["context with another subject", (verified) =>
      contextFor({ ...verified, subject: "another-synthetic-user" })],
    ["context with another actor", (verified) =>
      contextFor({ ...verified, actorId: "03000000-0000-4000-8000-000000000003" })],
    ["context with another tenant", (verified) =>
      contextFor({ ...verified, tenantId: "01000000-0000-4000-8000-000000000003" })],
    ["context with another hospital", (verified) =>
      contextFor({ ...verified, hospitalId: "04000000-0000-4000-8000-000000000003" })],
    ["context with another actor type", (verified) =>
      contextFor({ ...verified, actorType: "SERVICE" })],
    ["throwing context factory", () => {
      throw new Error("synthetic context detail");
    }],
  ])("denies %s before policy or protected callback", async (_label, factory) => {
    const { executor, policy } = setup();
    const operation = vi.fn();

    await expect(
      executor.execute(principal, identity.tenantId, factory, operation),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.evaluate).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("does not invoke the protected callback when policy evaluation rejects", async () => {
    const engine = { evaluate: vi.fn().mockRejectedValue(new Error("private policy detail")) };
    const { executor } = setup({ engine });
    const operation = vi.fn();

    await expect(
      executor.execute(principal, identity.tenantId, contextFor, operation),
    ).rejects.toBeInstanceOf(ProtectedOperationUnavailableError);
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps operation exceptions to a fixed safe error without returning internal detail", async () => {
    const { executor } = setup();
    const operation = vi.fn(async () => {
      throw new Error("synthetic database credential detail");
    });

    await expect(
      executor.execute(principal, identity.tenantId, contextFor, operation),
    ).rejects.toMatchObject({
      name: "ProtectedOperationUnavailableError",
      message: "PROTECTED_OPERATION_UNAVAILABLE",
    });
  });

  it("preserves IAM-002's fixed denial and unavailable errors", async () => {
    for (const error of [
      new ActorTenantContextDeniedError(),
      new ActorTenantContextUnavailableError(),
    ]) {
      const run = vi.fn(async () => {
        throw error;
      });
      const { executor } = setup({ run });

      await expect(
        executor.execute(principal, identity.tenantId, contextFor, vi.fn()),
      ).rejects.toBe(error);
    }
  });

  it("normalizes unexpected identity dependency errors and never invokes the callback", async () => {
    const run = vi.fn(async () => {
      throw new Error("synthetic issuer database detail");
    });
    const { executor } = setup({ run });
    const operation = vi.fn();

    await expect(
      executor.execute(principal, identity.tenantId, contextFor, operation),
    ).rejects.toMatchObject({ message: "PROTECTED_OPERATION_UNAVAILABLE" });
    expect(operation).not.toHaveBeenCalled();
  });
});
