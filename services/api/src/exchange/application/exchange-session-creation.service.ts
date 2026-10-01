import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import { ExchangeSession } from "../domain/exchange-session.js";
import {
  ExchangeSessionConflictError,
  ExchangeSessionIdempotencyConflictError,
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../persistence/postgres-exchange-session.repository.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../persistence/postgres-exchange-session-audit.repository.js";
import {
  PatientReferencePersistenceError,
  PostgresPatientReferenceRepository,
} from "../../patient/persistence/postgres-patient-reference.repository.js";
import { PatientReference } from "../../patient/domain/patient-reference.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATE_FIELDS = new Set([
  "patientRefId",
  "sourceHospitalId",
  "destinationHospitalId",
  "purpose",
]);

export interface CreateExchangeSessionCommand {
  readonly patientRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly purpose: string;
}

export interface ExchangeSessionCreationResult {
  readonly session: ExchangeSession;
  readonly replayed: boolean;
  readonly correlationId: string;
}

export class InvalidExchangeSessionRequestError extends Error {
  constructor() {
    super("EXCHANGE_REQUEST_INVALID");
    this.name = "InvalidExchangeSessionRequestError";
  }
}

export class ExchangeSessionCreationDeniedError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_CREATION_DENIED");
    this.name = "ExchangeSessionCreationDeniedError";
  }
}

export class ExchangeSessionCreationUnavailableError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_CREATION_UNAVAILABLE");
    this.name = "ExchangeSessionCreationUnavailableError";
  }
}

function parseCommand(value: unknown): CreateExchangeSessionCommand {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !CREATE_FIELDS.has(key))
  ) {
    throw new InvalidExchangeSessionRequestError();
  }
  const candidate = value as Record<string, unknown>;
  const { patientRefId, sourceHospitalId, destinationHospitalId, purpose } =
    candidate;
  if (
    typeof patientRefId !== "string" ||
    !UUID_PATTERN.test(patientRefId) ||
    typeof sourceHospitalId !== "string" ||
    !UUID_PATTERN.test(sourceHospitalId) ||
    typeof destinationHospitalId !== "string" ||
    !UUID_PATTERN.test(destinationHospitalId) ||
    typeof purpose !== "string" ||
    purpose.trim().length === 0 ||
    Array.from(purpose).length > 255 ||
    sourceHospitalId.toLowerCase() === destinationHospitalId.toLowerCase()
  ) {
    throw new InvalidExchangeSessionRequestError();
  }
  return Object.freeze({
    patientRefId: patientRefId.toLowerCase(),
    sourceHospitalId: sourceHospitalId.toLowerCase(),
    destinationHospitalId: destinationHospitalId.toLowerCase(),
    purpose,
  });
}

function validateVerifiedDestination(
  context: VerifiedActorTenantContext,
  destinationHospitalId: string,
): void {
  if (
    context.actorType !== "USER" ||
    !context.hospitalId ||
    context.hospitalId.toLowerCase() !== destinationHospitalId
  ) {
    throw new ExchangeSessionCreationDeniedError();
  }
}

@Injectable()
export class ExchangeSessionCreationService {
  constructor(
    @Inject(ActorTenantContextService)
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
  ) {}

  async create(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    idempotencyKey: string | string[] | undefined;
    correlationId: string | string[] | undefined;
    body: unknown;
  }): Promise<ExchangeSessionCreationResult> {
    const command = parseCommand(input.body);
    const tenantCandidate =
      typeof input.tenantCandidate === "string" ? input.tenantCandidate : "";
    const idempotencyKey =
      typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
    const correlationId =
      typeof input.correlationId === "undefined"
        ? randomUUID()
        : typeof input.correlationId === "string"
          ? input.correlationId
          : "";
    if (
      !UUID_PATTERN.test(tenantCandidate) ||
      !UUID_PATTERN.test(idempotencyKey) ||
      !UUID_PATTERN.test(correlationId)
    ) {
      throw new InvalidExchangeSessionRequestError();
    }

    try {
      return await this.actorTenantContext.run(
        input.principal,
        tenantCandidate,
        async (context, client) => {
          validateVerifiedDestination(context, command.destinationHospitalId);
          const patientReference = await new PostgresPatientReferenceRepository(
            client,
          ).findById(command.patientRefId);
          if (
            !patientReference ||
            patientReference.status !== "ACTIVE" ||
            !PatientReference.isValidCode(patientReference.patientRefCode)
          ) {
            throw new InvalidExchangeSessionRequestError();
          }

          const session = ExchangeSession.create({
            ...command,
            requesterActorId: context.actorId,
          });
          const creation = await new PostgresExchangeSessionRepository(
            client,
          ).createIdempotently(session, idempotencyKey.toLowerCase());

          if (creation.created) {
            await new PostgresExchangeSessionAuditRepository(client).recordCreated({
              auditEventId: randomUUID(),
              occurredAt: session.createdAt,
              actorId: context.actorId,
              tenantId: context.tenantId,
              exchangeSessionId: session.sessionId,
              resourceId: session.sessionId,
              correlationId: correlationId.toLowerCase(),
              createdAt: session.createdAt,
            });
          }

          return Object.freeze({
            session: creation.session,
            replayed: !creation.created,
            correlationId: correlationId.toLowerCase(),
          });
        },
      );
    } catch (error) {
      if (
        error instanceof ActorTenantContextDeniedError ||
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ExchangeSessionCreationDeniedError ||
        error instanceof InvalidExchangeSessionRequestError ||
        error instanceof ExchangeSessionIdempotencyConflictError ||
        error instanceof ExchangeSessionConflictError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof ExchangeSessionAuditPersistenceError ||
        error instanceof PatientReferencePersistenceError
      ) {
        throw error;
      }
      throw new ExchangeSessionCreationUnavailableError();
    }
  }
}
