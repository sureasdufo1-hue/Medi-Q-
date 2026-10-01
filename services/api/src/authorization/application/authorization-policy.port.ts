import type { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationEffect } from "../domain/authorization-effect.js";
import type { PoolClient } from "pg";

/**
 * A request-scoped transaction supplied by the IAM-002 verified-context
 * callback. A PoolClient by itself is not identity proof.
 */
export interface AuthorizationEvaluationScope {
  readonly transactionClient: PoolClient;
}

/** Internal policy contract. A policy must return an explicit effect. */
export interface AuthorizationPolicyPort {
  evaluate(
    context: AuthorizationContext,
    scope?: AuthorizationEvaluationScope,
  ): AuthorizationEffect | Promise<AuthorizationEffect>;
}
