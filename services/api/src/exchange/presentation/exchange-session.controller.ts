import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ExchangeSession } from "../domain/exchange-session.js";
import {
  ExchangeSessionConflictError,
  ExchangeSessionIdempotencyConflictError,
  ExchangeSessionPersistenceError,
} from "../persistence/postgres-exchange-session.repository.js";
import { ExchangeSessionAuditPersistenceError } from "../persistence/postgres-exchange-session-audit.repository.js";
import {
  ExchangeSessionCreationDeniedError,
  ExchangeSessionCreationService,
  ExchangeSessionCreationUnavailableError,
  InvalidExchangeSessionRequestError,
} from "../application/exchange-session-creation.service.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../identity/identity-context.types.js";
import { PatientReferencePersistenceError } from "../../patient/persistence/postgres-patient-reference.repository.js";
import { InvalidExchangeSessionError } from "../domain/exchange-session.js";

function toResponse(session: ExchangeSession) {
  return {
    sessionId: session.sessionId,
    patientRefId: session.patientRefId,
    sourceHospitalId: session.sourceHospitalId,
    destinationHospitalId: session.destinationHospitalId,
    purpose: session.purpose,
    state: session.state,
    createdAt: session.createdAt.toISOString(),
    ...(session.expiresAt
      ? { expiresAt: session.expiresAt.toISOString() }
      : {}),
    ...(session.completedAt
      ? { completedAt: session.completedAt.toISOString() }
      : {}),
  };
}

@Controller("exchange-sessions")
export class ExchangeSessionController {
  constructor(
    private readonly creationService: ExchangeSessionCreationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("idempotency-key") idempotencyKey: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      const result = await this.creationService.create({
        principal: request.authPrincipal,
        tenantCandidate,
        idempotencyKey,
        correlationId,
        body: request.body,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return toResponse(result.session);
    } catch (error) {
      if (
        error instanceof InvalidExchangeSessionRequestError ||
        error instanceof InvalidExchangeSessionError
      ) {
        throw new BadRequestException({ code: "EXCHANGE_REQUEST_INVALID" });
      }
      if (error instanceof ExchangeSessionIdempotencyConflictError) {
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      }
      if (error instanceof ExchangeSessionConflictError) {
        throw new ConflictException({ code: "EXCHANGE_SESSION_CONFLICT" });
      }
      if (
        error instanceof ActorTenantContextDeniedError ||
        error instanceof ExchangeSessionCreationDeniedError
      ) {
        throw new ForbiddenException({ code: "ACCESS_DENIED" });
      }
      if (
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ExchangeSessionCreationUnavailableError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof ExchangeSessionAuditPersistenceError ||
        error instanceof PatientReferencePersistenceError
      ) {
        throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      }
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }
}
