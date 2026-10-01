import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ConsentApprovalConflictError,
  ConsentApprovalDeniedError,
  ConsentApprovalService,
  ConsentApprovalUnavailableError,
  InvalidConsentApprovalRequestError,
} from "../application/consent-approval.service.js";
import {
  ConsentWithdrawalConflictError,
  ConsentWithdrawalDeniedError,
  ConsentWithdrawalService,
  ConsentWithdrawalUnavailableError,
  InvalidConsentWithdrawalRequestError,
} from "../application/consent-withdrawal.service.js";
import {
  ConsentRequestConflictError,
  ConsentRequestDeniedError,
  ConsentRequestService,
  ConsentRequestUnavailableError,
  InvalidConsentRequestError,
} from "../application/consent-request.service.js";
import {
  ExchangeSessionConflictError,
} from "../../exchange/persistence/postgres-exchange-session.repository.js";
import {
  ConsentVersionConflictError,
} from "../persistence/postgres-consent.repository.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../identity/identity-context.types.js";

function toResponse(consent: {
  consentId: string; exchangeSessionId: string; patientRefId: string;
  sourceHospitalId: string; destinationHospitalId: string; imagingPackageId: string | null;
  actions: readonly string[]; status: string; consentVersion: number;
  issuedAt: Date | null; expiresAt: Date | null; withdrawnAt: Date | null;
}) {
  return {
    consentId: consent.consentId,
    sessionId: consent.exchangeSessionId,
    patientRefId: consent.patientRefId,
    sourceHospitalId: consent.sourceHospitalId,
    destinationHospitalId: consent.destinationHospitalId,
    ...(consent.imagingPackageId ? { imagingPackageId: consent.imagingPackageId } : {}),
    allowedActions: [...consent.actions],
    status: consent.status,
    consentVersion: consent.consentVersion,
    ...(consent.issuedAt ? { issuedAt: consent.issuedAt.toISOString() } : {}),
    ...(consent.expiresAt ? { expiresAt: consent.expiresAt.toISOString() } : {}),
    ...(consent.withdrawnAt ? { withdrawnAt: consent.withdrawnAt.toISOString() } : {}),
  };
}

@Controller("exchange-sessions/:sessionId/consents")
export class ConsentRequestController {
  constructor(
    private readonly consentRequest: ConsentRequestService,
    private readonly consentApproval: ConsentApprovalService,
    private readonly consentWithdrawal: ConsentWithdrawalService,
  ) {}

  @Post("request")
  @HttpCode(HttpStatus.CREATED)
  async request(
    @Param("sessionId") sessionId: string,
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      const result = await this.consentRequest.request({
        principal: request.authPrincipal,
        tenantCandidate,
        sessionId,
        correlationId,
        body: request.body,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return toResponse(result.consent);
    } catch (error) {
      if (error instanceof InvalidConsentRequestError) throw new BadRequestException({ code: "CONSENT_REQUEST_INVALID" });
      if (error instanceof ConsentRequestConflictError || error instanceof ExchangeSessionConflictError || error instanceof ConsentVersionConflictError) throw new ConflictException({ code: "CONSENT_REQUEST_CONFLICT" });
      if (error instanceof ConsentRequestDeniedError || error instanceof ActorTenantContextDeniedError) throw new ForbiddenException({ code: "ACCESS_DENIED" });
      if (error instanceof ConsentRequestUnavailableError || error instanceof ActorTenantContextUnavailableError) throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }

  @Post(":consentId/approve")
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param("sessionId") sessionId: string,
    @Param("consentId") consentId: string,
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = request.query;
    const hasUnexpectedInput = request.body !== undefined ||
      (typeof query === "object" && query !== null && Object.keys(query).length > 0) ||
      request.headers["x-patient-ref-id"] !== undefined;
    try {
      const result = await this.consentApproval.approve({
        principal: request.authPrincipal,
        tenantCandidate,
        sessionId,
        consentId,
        correlationId,
        hasUnexpectedInput,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return toResponse(result.consent);
    } catch (error) {
      if (error instanceof InvalidConsentApprovalRequestError) throw new BadRequestException({ code: "CONSENT_APPROVAL_REQUEST_INVALID" });
      if (error instanceof ConsentApprovalConflictError) throw new ConflictException({ code: "CONSENT_APPROVAL_CONFLICT" });
      if (error instanceof ConsentApprovalDeniedError || error instanceof ActorTenantContextDeniedError) throw new ForbiddenException({ code: "ACCESS_DENIED" });
      if (error instanceof ConsentApprovalUnavailableError || error instanceof ActorTenantContextUnavailableError) throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }

  @Post(":consentId/withdraw")
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Param("sessionId") sessionId: string,
    @Param("consentId") consentId: string,
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = request.query;
    const hasUnexpectedInput = request.body !== undefined ||
      (typeof query === "object" && query !== null && Object.keys(query).length > 0) ||
      request.headers["x-patient-ref-id"] !== undefined;
    try {
      const result = await this.consentWithdrawal.withdraw({
        principal: request.authPrincipal,
        tenantCandidate,
        sessionId,
        consentId,
        correlationId,
        hasUnexpectedInput,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return toResponse(result.consent);
    } catch (error) {
      if (error instanceof InvalidConsentWithdrawalRequestError) throw new BadRequestException({ code: "CONSENT_WITHDRAWAL_REQUEST_INVALID" });
      if (error instanceof ConsentWithdrawalConflictError) throw new ConflictException({ code: "CONSENT_WITHDRAWAL_CONFLICT" });
      if (error instanceof ConsentWithdrawalDeniedError || error instanceof ActorTenantContextDeniedError) throw new ForbiddenException({ code: "ACCESS_DENIED" });
      if (error instanceof ConsentWithdrawalUnavailableError || error instanceof ActorTenantContextUnavailableError) throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }
}
