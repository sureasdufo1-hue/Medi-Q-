import type {
  AuthorizationEvaluationScope,
  AuthorizationPolicyPort,
} from "./authorization-policy.port.js";
import { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationEffect } from "../domain/authorization-effect.js";

/**
 * Pure default-deny boundary. It is intentionally not registered as an API
 * provider until a separately accepted business policy is available.
 */
export class AuthorizationEngine {
  constructor(private readonly policy?: AuthorizationPolicyPort | null) {}

  async evaluate(
    context: unknown,
    scope?: AuthorizationEvaluationScope,
  ): Promise<AuthorizationEffect> {
    if (!AuthorizationContext.is(context)) return "DENY";

    try {
      const evaluatePolicy = this.policy?.evaluate;
      if (typeof evaluatePolicy !== "function") return "DENY";
      const result: unknown = await evaluatePolicy.call(
        this.policy,
        context,
        scope,
      );
      return result === "ALLOW" ? "ALLOW" : "DENY";
    } catch {
      return "DENY";
    }
  }
}
