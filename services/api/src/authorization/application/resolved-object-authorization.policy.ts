import type {
  AuthorizationEvaluationScope,
  AuthorizationPolicyPort,
} from "./authorization-policy.port.js";
import type { AuthorizationEvidenceReader } from "./authorization-evidence.reader.js";
import { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationEffect } from "../domain/authorization-effect.js";
import { decideObjectAuthorization } from "../domain/object-authorization-policy.js";

/**
 * Object-level policy adapter over an internal evidence reader.
 * Deliberately not registered in the API module until persistence and HTTP
 * acceptance gates are complete.
 */
export class ResolvedObjectAuthorizationPolicy implements AuthorizationPolicyPort {
  constructor(
    private readonly evidenceReader: AuthorizationEvidenceReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async evaluate(
    context: AuthorizationContext,
    scope?: AuthorizationEvaluationScope,
  ): Promise<AuthorizationEffect> {
    if (!AuthorizationContext.is(context)) return "DENY";

    try {
      const transactionClient = scope?.transactionClient;
      if (!transactionClient || typeof transactionClient.query !== "function") {
        return "DENY";
      }
      const evidence = await this.evidenceReader.resolve(
        context,
        transactionClient,
      );
      return decideObjectAuthorization(context, evidence, this.clock());
    } catch {
      return "DENY";
    }
  }
}
