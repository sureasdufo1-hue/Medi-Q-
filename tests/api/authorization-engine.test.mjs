import { describe, expect, it, vi } from "vitest";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";

function context() {
  return AuthorizationContext.create({
    identity: {
      issuer: "https://issuer.synthetic.test",
      subject: "synthetic-user-002",
      actorId: "03000000-0000-4000-8000-000000000002",
      tenantId: "01000000-0000-4000-8000-000000000002",
      hospitalId: "04000000-0000-4000-8000-000000000002",
      actorType: "USER",
    },
    exchangeSessionId: "25000000-0000-4000-8000-000000000002",
    resource: {
      kind: "STUDY",
      id: "28000000-0000-4000-8000-000000000002",
    },
    action: "VIEW",
    consentId: "26000000-0000-4000-8000-000000000002",
    grantId: "27000000-0000-4000-8000-000000000002",
  });
}

describe("AuthorizationEngine default-deny contract", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty object", {}],
    ["structural copy", { ...context() }],
    ["prototype-forged instance", Object.create(AuthorizationContext.prototype)],
  ])("denies %s before policy invocation", async (_label, candidate) => {
    const evaluate = vi.fn().mockResolvedValue("ALLOW");
    const engine = new AuthorizationEngine({ evaluate });

    await expect(engine.evaluate(candidate)).resolves.toBe("DENY");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("denies when no policy is configured", async () => {
    const engine = new AuthorizationEngine();

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
  });

  it("denies when a configured policy has no evaluator", async () => {
    const engine = new AuthorizationEngine({});

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
  });

  it("preserves an explicit policy DENY", async () => {
    const evaluate = vi.fn().mockResolvedValue("DENY");
    const engine = new AuthorizationEngine({ evaluate });

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("returns ALLOW only for the exact explicit policy result", async () => {
    const evaluate = vi.fn().mockResolvedValue("ALLOW");
    const engine = new AuthorizationEngine({ evaluate });

    await expect(engine.evaluate(context())).resolves.toBe("ALLOW");
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it.each([true, false, null, undefined, "allow", "ALLOW ", "PERMIT", {}])(
    "denies unsupported policy result %j",
    async (result) => {
      const evaluate = vi.fn().mockResolvedValue(result);
      const engine = new AuthorizationEngine({ evaluate });

      await expect(engine.evaluate(context())).resolves.toBe("DENY");
    },
  );

  it("converts a synchronous policy exception to DENY without returning its message", async () => {
    const evaluate = vi.fn(() => {
      throw new Error("synthetic internal policy detail");
    });
    const engine = new AuthorizationEngine({ evaluate });

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
  });

  it("converts an asynchronous policy rejection to DENY", async () => {
    const evaluate = vi.fn().mockRejectedValue(new Error("synthetic policy error"));
    const engine = new AuthorizationEngine({ evaluate });

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
  });

  it("converts an exception while resolving the policy method to DENY", async () => {
    const policy = Object.defineProperty({}, "evaluate", {
      get() {
        throw new Error("synthetic policy configuration detail");
      },
    });
    const engine = new AuthorizationEngine(policy);

    await expect(engine.evaluate(context())).resolves.toBe("DENY");
  });
});
