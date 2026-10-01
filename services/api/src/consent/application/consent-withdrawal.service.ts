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
import { ConsentArtifact } from "../domain/consent-artifact.js";
import {
  ConsentContextDeniedError,
  ConsentPersistenceError,
  ConsentWithdrawalConflictError as ConsentRepositoryConflictError,
  PostgresConsentRepository,
} from "../persistence/postgres-consent.repository.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConsentWithdrawalResult {
  readonly consent: ConsentArtifact;
  readonly replayed: boolean;
  readonly correlationId: string;
}

export class InvalidConsentWithdrawalRequestError extends Error {
  constructor() {
    super("CONSENT_WITHDRAWAL_REQUEST_INVALID");
    this.name = "InvalidConsentWithdrawalRequestError";
  }
}

export class ConsentWithdrawalDeniedError extends Error {
  constructor() {
    super("CONSENT_WITHDRAWAL_DENIED");
    this.name = "ConsentWithdrawalDeniedError";
  }
}

export class ConsentWithdrawalConflictError extends Error {
  constructor() {
    super("CONSENT_WITHDRAWAL_CONFLICT");
    this.name = "ConsentWithdrawalConflictError";
  }
}

export class ConsentWithdrawalUnavailableError extends Error {
  constructor() {
    super("CONSENT_WITHDRAWAL_UNAVAILABLE");
    this.name = "ConsentWithdrawalUnavailableError";
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
export class ConsentWithdrawalService {
  constructor(
    @Inject(ActorTenantContextService)
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
  ) {}

  async withdraw(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    sessionId: string;
    consentId: string;
    correlationId: string | string[] | undefined;
    hasUnexpectedInput: boolean;
  }): Promise<ConsentWithdrawalResult> {
    if (
      !UUID_PATTERN.test(input.sessionId) ||
      !UUID_PATTERN.test(input.consentId) ||
      input.hasUnexpectedInput
    ) {
      throw new InvalidConsentWithdrawalRequestError();
    }
    const patientRefId = input.principal?.patientRefId;
    if (typeof patientRefId !== "string" || !UUID_PATTERN.test(patientRefId)) {
      throw new ConsentWithdrawalDeniedError();
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
      throw new InvalidConsentWithdrawalRequestError();
    }

    try {
      return await this.actorTenantContext.run(
        input.principal,
        tenantId,
        async (context, client) => {
          if (context.actorType !== "USER" || context.hospitalId !== null) {
            throw new ConsentWithdrawalDeniedError();
          }
          await acquireExchangeSessionFence(client, input.sessionId);
          const now = new Date();
          const sessionRepository = new PostgresExchangeSessionRepository(client);
          const session = await sessionRepository.findById(input.sessionId);
          if (!session || !eligiblePatientActor(context, session.requesterActorId)) {
            throw new ConsentWithdrawalDeniedError();
          }

          const consentRepository = new PostgresConsentRepository(client);
          const consent = await consentRepository.findById(input.consentId);
          if (!consent || !exactConsentBinding(consent, {
            sessionId: session.sessionId,
            patientRefId: patientRefId.toLowerCase(),
            sourceHospitalId: session.sourceHospitalId,
            destinationHospitalId: session.destinationHospitalId,
          })) {
            throw new ConsentWithdrawalDeniedError();
          }

          if (consent.status === "WITHDRAWN") {
            if (
              consent.withdrawnAt === null ||
              consent.issuedAt === null ||
              consent.issuedAt.getTime() < consent.createdAt.getTime() ||
              consent.withdrawnAt.getTime() < consent.issuedAt.getTime() ||
              consent.updatedAt.getTime() < consent.withdrawnAt.getTime()
            ) {
              throw new ConsentWithdrawalConflictError();
            }
            return Object.freeze({
              consent,
              replayed: true,
              correlationId: correlationId.toLowerCase(),
            });
          }
          if (
            consent.status !== "ACTIVE" ||
            consent.issuedAt === null ||
            consent.issuedAt.getTime() < consent.createdAt.getTime() ||
            consent.issuedAt.getTime() > consent.updatedAt.getTime() ||
            consent.withdrawnAt !== null
          ) {
            throw new ConsentWithdrawalConflictError();
          }

          const withdrawnConsent = await consentRepository.withdrawActive({ consent, now });
          await new PostgresExchangeSessionAuditRepository(client).recordConsentWithdrawn({
            auditEventId: randomUUID(),
            occurredAt: now,
            actorId: context.actorId,
            tenantId: context.tenantId,
            exchangeSessionId: session.sessionId,
            consentId: withdrawnConsent.consentId,
            correlationId: correlationId.toLowerCase(),
            createdAt: now,
          });
          return Object.freeze({
            consent: withdrawnConsent,
            replayed: false,
            correlationId: correlationId.toLowerCase(),
          });
        },
      );
    } catch (error) {
      if (
        error instanceof ActorTenantContextDeniedError ||
        error instanceof ConsentWithdrawalDeniedError ||
        error instanceof ConsentWithdrawalConflictError ||
        error instanceof ConsentRepositoryConflictError ||
        error instanceof ConsentContextDeniedError ||
        error instanceof InvalidConsentWithdrawalRequestError
      ) {
        throw error;
      }
      if (
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ConsentPersistenceError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof ExchangeSessionAuditPersistenceError
      ) {
        throw new ConsentWithdrawalUnavailableError();
      }
      throw new ConsentWithdrawalUnavailableError();
    }
  }
}
