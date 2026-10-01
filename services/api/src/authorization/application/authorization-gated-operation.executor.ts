import type { PoolClient } from "pg";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import type { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationEngine } from "./authorization-engine.js";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("AUTHORIZATION_DENIED");
    this.name = "AuthorizationDeniedError";
  }
}

export class ProtectedOperationUnavailableError extends Error {
  constructor() {
    super("PROTECTED_OPERATION_UNAVAILABLE");
    this.name = "ProtectedOperationUnavailableError";
  }
}

export type AuthorizationContextFactory = (
  identity: VerifiedActorTenantContext,
) => unknown;

export type ResolvedAuthorizationContextFactory = (
  identity: VerifiedActorTenantContext,
  transactionClient: PoolClient,
) => unknown;

export type ProtectedOperation<T> = (
  context: AuthorizationContext,
  transactionClient: PoolClient,
) => Promise<T>;

function matchesVerifiedIdentity(
  context: AuthorizationContext,
  identity: VerifiedActorTenantContext,
): boolean {
  return (
    context.issuer === identity.issuer &&
    context.subject === identity.subject &&
    context.actorId === identity.actorId.toLowerCase() &&
    context.tenantId === identity.tenantId.toLowerCase() &&
    context.hospitalId === (identity.hospitalId?.toLowerCase() ?? null) &&
    context.actorType === identity.actorType
  );
}

/**
 * Internal fail-closed orchestration boundary. It has no HTTP route; PACS
 * callers must use server-resolved scope and a separately accepted effect gate.
 */
export class AuthorizationGatedOperationExecutor {
  constructor(
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
    private readonly authorizationEngine: Pick<AuthorizationEngine, "evaluate">,
  ) {}

  async execute<T>(
    principal: VerifiedAuthenticationPrincipal,
    tenantCandidate: string,
    createContext: AuthorizationContextFactory,
    operation: ProtectedOperation<T>,
  ): Promise<T> {
    return this.executeInternal(
      principal,
      tenantCandidate,
      (identity) => createContext(identity),
      operation,
      false,
    );
  }

  /** Revalidates Consent/Grant evidence after the shared Session fence is held. */
  async executeWithSessionFence<T>(
    principal: VerifiedAuthenticationPrincipal,
    tenantCandidate: string,
    createContext: AuthorizationContextFactory,
    operation: ProtectedOperation<T>,
  ): Promise<T> {
    return this.executeInternal(
      principal,
      tenantCandidate,
      (identity) => createContext(identity),
      operation,
      true,
    );
  }

  /** Resolves persisted resource scope in the same verified Tenant transaction before fencing. */
  async executeWithResolvedSessionFence<T>(
    principal: VerifiedAuthenticationPrincipal,
    tenantCandidate: string,
    createContext: ResolvedAuthorizationContextFactory,
    operation: ProtectedOperation<T>,
  ): Promise<T> {
    return this.executeInternal(
      principal,
      tenantCandidate,
      createContext,
      operation,
      true,
    );
  }

  private async executeInternal<T>(
    principal: VerifiedAuthenticationPrincipal,
    tenantCandidate: string,
    createContext: ResolvedAuthorizationContextFactory,
    operation: ProtectedOperation<T>,
    useSessionFence: boolean,
  ): Promise<T> {
    if (typeof createContext !== "function" || typeof operation !== "function") {
      throw new AuthorizationDeniedError();
    }

    try {
      return await this.actorTenantContext.run(
        principal,
        tenantCandidate,
        async (identity, transactionClient) => {
          let candidate: unknown;
          try {
            candidate = await createContext(identity, transactionClient);
          } catch (error) {
            if (error instanceof ProtectedOperationUnavailableError) throw error;
            throw new AuthorizationDeniedError();
          }

          if (
            !AuthorizationContext.is(candidate) ||
            !matchesVerifiedIdentity(candidate, identity)
          ) {
            throw new AuthorizationDeniedError();
          }

          if (useSessionFence) {
            try {
              await acquireExchangeSessionFence(
                transactionClient,
                candidate.exchangeSessionId,
              );
            } catch {
              throw new ProtectedOperationUnavailableError();
            }
          }

          let effect: unknown;
          try {
            effect = await this.authorizationEngine.evaluate(candidate, {
              transactionClient,
            });
          } catch {
            throw new ProtectedOperationUnavailableError();
          }

          if (effect !== "ALLOW") throw new AuthorizationDeniedError();

          try {
            return await operation(candidate, transactionClient);
          } catch {
            throw new ProtectedOperationUnavailableError();
          }
        },
      );
    } catch (error) {
      if (
        error instanceof AuthorizationDeniedError ||
        error instanceof ProtectedOperationUnavailableError ||
        error instanceof ActorTenantContextDeniedError ||
        error instanceof ActorTenantContextUnavailableError
      ) {
        throw error;
      }
      throw new ProtectedOperationUnavailableError();
    }
  }
}
