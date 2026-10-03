import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import type { VerifiedActorTenantContext } from "../../identity/identity-context.types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copies an already verified identity, never authenticates a caller object. */
export function snapshotCleanupPrincipal(
  principal: VerifiedAuthenticationPrincipal | null | undefined,
): VerifiedAuthenticationPrincipal {
  if (!principal || typeof principal.issuer !== "string" || !principal.issuer ||
    typeof principal.subject !== "string" || !principal.subject || principal.subject.length > 255) {
    throw new Error("TEMPORARY_PAYLOAD_SERVICE_CONTEXT_DENIED");
  }
  return Object.freeze({ issuer: principal.issuer, subject: principal.subject });
}

/** Active membership is resolved by ActorTenantContextService on each run. */
export function assertCleanupServiceContext(
  context: VerifiedActorTenantContext,
  tenantId: string,
  principal: VerifiedAuthenticationPrincipal,
): void {
  if (!context || context.tenantId !== tenantId ||
    typeof context.actorId !== "string" || !UUID.test(context.actorId) ||
    context.issuer !== principal.issuer || context.subject !== principal.subject ||
    context.actorType !== "SERVICE" || context.hospitalId !== null) {
    throw new Error("TEMPORARY_PAYLOAD_SERVICE_CONTEXT_DENIED");
  }
}

export function snapshotCleanupTime(clock: () => Date): Date {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("TEMPORARY_PAYLOAD_CLEANUP_CLOCK_INVALID");
  }
  return new Date(now.getTime());
}
