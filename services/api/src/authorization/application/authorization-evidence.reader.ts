import type { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationPolicyFacts } from "../domain/authorization-facts.js";
import type { PoolClient } from "pg";

/**
 * Internal resolver boundary. A production adapter must read every fact from
 * trusted persistence using the same verified Tenant transaction; no HTTP
 * request body or caller-provided evidence may implement this port.
 */
export interface AuthorizationEvidenceReader {
  resolve(
    context: AuthorizationContext,
    transactionClient: PoolClient,
  ): Promise<AuthorizationPolicyFacts | null>;
}
