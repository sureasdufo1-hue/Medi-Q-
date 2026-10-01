import type { PoolClient } from "pg";

export type RegistryActorType = "USER" | "SERVICE";

export interface VerifiedActorTenantContext {
  readonly issuer: string;
  readonly subject: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly hospitalId: string | null;
  readonly actorType: RegistryActorType;
}

export type ActorTenantWork<T> = (
  context: VerifiedActorTenantContext,
  client: PoolClient,
) => Promise<T>;

export interface ActiveActorMembership {
  actorId: string;
  tenantId: string;
  hospitalId: string | null;
  actorType: RegistryActorType;
}

export class ActorTenantContextDeniedError extends Error {
  constructor() {
    super("ACTOR_TENANT_CONTEXT_DENIED");
    this.name = "ActorTenantContextDeniedError";
  }
}

export class ActorTenantContextUnavailableError extends Error {
  constructor() {
    super("ACTOR_TENANT_CONTEXT_UNAVAILABLE");
    this.name = "ActorTenantContextUnavailableError";
  }
}
