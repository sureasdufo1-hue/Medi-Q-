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
  ExchangeSessionConflictError,
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../exchange/persistence/postgres-exchange-session.repository.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../../exchange/persistence/postgres-exchange-session-audit.repository.js";
import {
  ConsentArtifact,
} from "../domain/consent-artifact.js";
import {
  ConsentApprovalConflictError as ConsentRepositoryConflictError,
  ConsentPersistenceError,
  PostgresConsentRepository,
} from "../persistence/postgres-consent.repository.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConsentApprovalResult {
  readonly consent: ConsentArtifact;
  readonly replayed: boolean;
  readonly correlationId: string;
}

export class InvalidConsentApprovalRequestError extends Error {
  constructor() {
    super("CONSENT_APPROVAL_REQUEST_INVALID");
    this.name = "InvalidConsentApprovalRequestError";
  }
}

export class ConsentApprovalDeniedError extends Error {
  constructor() {
    super("CONSENT_APPROVAL_DENIED");
    this.name = "ConsentApprovalDeniedError";
  }
}

export class ConsentApprovalConflictError extends Error {
  constructor() {
    super("CONSENT_APPROVAL_CONFLICT");
    this.name = "ConsentApprovalConflictError";
  }
}

export class ConsentApprovalUnavailableError extends Error {
  constructor() {
    super("CONSENT_APPROVAL_UNAVAILABLE");
    this.name = "ConsentApprovalUnavailableError";
  }
}

function eligiblePatientActor(
  context: VerifiedActorTenantContext,
  requesterActorId: string,
): boolean {
  return context.actorType === "USER" &&
    context.hospitalId === null &&
    context.actorId.toLowerCase() !== requesterActorId.toLowerCase();
}

function exactConsentBinding(
  consent: ConsentArtifact,
  input: {
    sessionId: string;
    patientRefId: string;
    sourceHospitalId: string;
    destinationHospitalId: string;
  },
): boolean {
  return consent.exchangeSessionId === input.sessionId &&
    consent.patientRefId === input.patientRefId &&
    consent.sourceHospitalId === input.sourceHospitalId &&
    consent.destinationHospitalId === input.destinationHospitalId;
}

@Injectable()
export class ConsentApprovalService {
  constructor(
    @Inject(ActorTenantContextService)
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
  ) {}

  async approve(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    sessionId: string;
    consentId: string;
    correlationId: string | string[] | undefined;
    hasUnexpectedInput: boolean;
  }): Promise<ConsentApprovalResult> {
    if (
      !UUID_PATTERN.test(input.sessionId) ||
      !UUID_PATTERN.test(input.consentId) ||
      input.hasUnexpectedInput
    ) {
      throw new InvalidConsentApprovalRequestError();
    }
    const patientRefId = input.principal?.patientRefId;
    if (typeof patientRefId !== "string" || !UUID_PATTERN.test(patientRefId)) {
      throw new ConsentApprovalDeniedError();
    }
    const tenantId = typeof input.tenantCandidate === "string"
      ? input.tenantCandidate
      : "";
    const correlationId = typeof input.correlationId === "undefined"
      ? randomUUID()
      : typeof input.correlationId === "string"
        ? input.correlationId
        : "";
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(correlationId)) {
      throw new InvalidConsentApprovalRequestError();
    }

    try {
      return await this.actorTenantContext.run(
        input.principal,
        tenantId,
        async (context, client) => {
          if (context.actorType !== "USER" || context.hospitalId !== null) {
            throw new ConsentApprovalDeniedError();
          }
          await acquireExchangeSessionFence(client, input.sessionId);
          const now = new Date();
          const sessionRepository = new PostgresExchangeSessionRepository(client);
          const session = await sessionRepository.findById(input.sessionId);
          if (!session) throw new ConsentApprovalDeniedError();
          if (!eligiblePatientActor(context, session.requesterActorId)) {
            throw new ConsentApprovalDeniedError();
          }

          const consentRepository = new PostgresConsentRepository(client);
          const consent = await consentRepository.findById(input.consentId);
          if (!consent || !exactConsentBinding(consent, {
            sessionId: session.sessionId,
            patientRefId: patientRefId.toLowerCase(),
            sourceHospitalId: session.sourceHospitalId,
            destinationHospitalId: session.destinationHospitalId,
          })) {
            throw new ConsentApprovalDeniedError();
          }

          const pending = await consentRepository.findPendingBySession(session.sessionId);
          if (session.state === "CONSENTED" && consent.status === "ACTIVE") {
            if (pending.length !== 0 || consent.issuedAt === null) {
              throw new ConsentApprovalConflictError();
            }
            return Object.freeze({
              consent,
              replayed: true,
              correlationId: correlationId.toLowerCase(),
            });
          }

          if (
            session.state !== "CONSENT_PENDING" ||
            consent.status !== "PENDING" ||
            pending.length !== 1 ||
            pending[0].consentId !== consent.consentId ||
            (session.expiresAt !== null && session.expiresAt.getTime() <= now.getTime()) ||
            (consent.expiresAt !== null && consent.expiresAt.getTime() <= now.getTime())
          ) {
            throw new ConsentApprovalConflictError();
          }

          const approvedConsent = await consentRepository.approvePending({ consent, now });
          await sessionRepository.transitionConsentPendingToConsented(session, now);
          await new PostgresExchangeSessionAuditRepository(client).recordConsentApproved({
            auditEventId: randomUUID(),
            occurredAt: now,
            actorId: context.actorId,
            tenantId: context.tenantId,
            exchangeSessionId: session.sessionId,
            consentId: approvedConsent.consentId,
            correlationId: correlationId.toLowerCase(),
            createdAt: now,
          });
          return Object.freeze({
            consent: approvedConsent,
            replayed: false,
            correlationId: correlationId.toLowerCase(),
          });
        },
      );
    } catch (error) {
      if (
        error instanceof ActorTenantContextDeniedError ||
        error instanceof ConsentApprovalDeniedError ||
        error instanceof ConsentApprovalConflictError ||
        error instanceof ConsentRepositoryConflictError ||
        error instanceof ExchangeSessionConflictError ||
        error instanceof InvalidConsentApprovalRequestError
      ) {
        throw error;
      }
      if (
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ConsentPersistenceError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof ExchangeSessionAuditPersistenceError
      ) {
        throw new ConsentApprovalUnavailableError();
      }
      throw new ConsentApprovalUnavailableError();
    }
  }
}
