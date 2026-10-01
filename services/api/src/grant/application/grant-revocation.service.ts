import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import {
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../exchange/persistence/postgres-exchange-session.repository.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../../exchange/persistence/postgres-exchange-session-audit.repository.js";
import {
  PostgresTransferGrantRepository,
  TransferGrantConflictError,
  TransferGrantPersistenceError,
} from "../persistence/postgres-transfer-grant.repository.js";
import { TransferGrant } from "../domain/transfer-grant.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidGrantRevocationRequestError extends Error {
  constructor() { super("GRANT_REVOCATION_REQUEST_INVALID"); this.name = "InvalidGrantRevocationRequestError"; }
}
export class GrantRevocationDeniedError extends Error {
  constructor() { super("GRANT_REVOCATION_DENIED"); this.name = "GrantRevocationDeniedError"; }
}
export class GrantRevocationConflictError extends Error {
  constructor() { super("GRANT_REVOCATION_CONFLICT"); this.name = "GrantRevocationConflictError"; }
}
export class GrantRevocationUnavailableError extends Error {
  constructor() { super("GRANT_REVOCATION_UNAVAILABLE"); this.name = "GrantRevocationUnavailableError"; }
}

function exactRecipient(
  context: VerifiedActorTenantContext,
  session: { requesterActorId: string; destinationHospitalId: string },
  grant: TransferGrant,
): boolean {
  return context.actorType === "USER" &&
    context.hospitalId !== null &&
    context.actorId === session.requesterActorId &&
    context.actorId === grant.recipientActorId &&
    context.tenantId === grant.recipientTenantId &&
    context.hospitalId === session.destinationHospitalId &&
    context.hospitalId === grant.recipientHospitalId;
}

@Injectable()
export class GrantRevocationService {
  constructor(
    @Inject(ActorTenantContextService)
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
  ) {}

  async revoke(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    sessionId: string;
    grantId: string;
    correlationId: string | string[] | undefined;
    hasUnexpectedInput: boolean;
  }): Promise<{ grant: TransferGrant; replayed: boolean; correlationId: string }> {
    if (
      !UUID_PATTERN.test(input.sessionId) ||
      !UUID_PATTERN.test(input.grantId) ||
      input.hasUnexpectedInput
    ) throw new InvalidGrantRevocationRequestError();

    const tenantId = typeof input.tenantCandidate === "string" ? input.tenantCandidate : "";
    const correlationId = typeof input.correlationId === "undefined"
      ? randomUUID()
      : typeof input.correlationId === "string" ? input.correlationId : "";
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(correlationId)) {
      throw new InvalidGrantRevocationRequestError();
    }

    try {
      const outcome = await this.actorTenantContext.run(
        input.principal,
        tenantId,
        async (context, client) => {
          const sessionId = input.sessionId.toLowerCase();
          const grantId = input.grantId.toLowerCase();
          const correlation = correlationId.toLowerCase();
          const audit = new PostgresExchangeSessionAuditRepository(client);
          const deny = async (visibleSessionId: string | null) => {
            const now = new Date();
            await audit.recordGrantRevocationDenied({
              auditEventId: randomUUID(),
              occurredAt: now,
              actorId: context.actorId,
              tenantId: context.tenantId,
              exchangeSessionId: visibleSessionId,
              correlationId: correlation,
              createdAt: now,
            });
            return { kind: "DENIED" as const };
          };

          const sessions = new PostgresExchangeSessionRepository(client);
          const initialSession = await sessions.findById(sessionId);
          if (!initialSession ||
              context.actorType !== "USER" ||
              context.hospitalId === null ||
              context.actorId !== initialSession.requesterActorId ||
              context.hospitalId !== initialSession.destinationHospitalId) {
            return deny(initialSession?.sessionId ?? null);
          }

          // Share the issuance/Consent transition lock order, then refresh the immutable
          // requester/destination facts before taking the Grant row lock.
          await acquireExchangeSessionFence(client, sessionId);
          const session = await sessions.findById(sessionId);
          if (!session ||
              context.actorId !== session.requesterActorId ||
              context.hospitalId !== session.destinationHospitalId) {
            return deny(session?.sessionId ?? initialSession.sessionId);
          }

          const grants = new PostgresTransferGrantRepository(client);
          const grant = await grants.findByIdForUpdate(grantId);
          if (!grant ||
              grant.exchangeSessionId !== session.sessionId ||
              !exactRecipient(context, session, grant)) {
            return deny(session.sessionId);
          }

          if (grant.status === "REVOKED") {
            return { kind: "REVOKED" as const, grant, replayed: true };
          }
          if (grant.status !== "ACTIVE") return { kind: "CONFLICT" as const };

          const now = new Date();
          const revoked = grant.revoke(now);
          await grants.revokeActive(revoked, {
            tenantId: context.tenantId,
            hospitalId: context.hospitalId!,
            actorId: context.actorId,
          });
          await audit.recordGrantRevoked({
            auditEventId: randomUUID(),
            occurredAt: now,
            actorId: context.actorId,
            tenantId: context.tenantId,
            exchangeSessionId: session.sessionId,
            grantId: grant.grantId,
            correlationId: correlation,
            createdAt: now,
          });
          return { kind: "REVOKED" as const, grant: revoked, replayed: false };
        },
      );

      if (outcome.kind === "DENIED") throw new GrantRevocationDeniedError();
      if (outcome.kind === "CONFLICT") throw new GrantRevocationConflictError();
      return Object.freeze({
        grant: outcome.grant,
        replayed: outcome.replayed,
        correlationId: correlationId.toLowerCase(),
      });
    } catch (error) {
      if (
        error instanceof InvalidGrantRevocationRequestError ||
        error instanceof GrantRevocationDeniedError ||
        error instanceof GrantRevocationConflictError ||
        error instanceof ActorTenantContextDeniedError
      ) throw error;
      if (
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof TransferGrantPersistenceError ||
        error instanceof TransferGrantConflictError ||
        error instanceof ExchangeSessionAuditPersistenceError
      ) {
        if (error instanceof TransferGrantConflictError) throw new GrantRevocationConflictError();
        throw new GrantRevocationUnavailableError();
      }
      throw new GrantRevocationUnavailableError();
    }
  }
}
