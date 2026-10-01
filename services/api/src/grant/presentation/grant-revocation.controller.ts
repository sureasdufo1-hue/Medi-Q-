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
  GrantRevocationConflictError,
  GrantRevocationDeniedError,
  GrantRevocationService,
  GrantRevocationUnavailableError,
  InvalidGrantRevocationRequestError,
} from "../application/grant-revocation.service.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../identity/identity-context.types.js";
import { toGrantResponse } from "./grant-response.js";

@Controller("exchange-sessions/:sessionId/grants")
export class GrantRevocationController {
  constructor(private readonly grantRevocation: GrantRevocationService) {}

  @Post(":grantId/revoke")
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param("sessionId") sessionId: string,
    @Param("grantId") grantId: string,
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = request.query;
    const hasUnexpectedInput =
      request.body !== undefined ||
      (typeof query === "object" && query !== null && Object.keys(query).length > 0) ||
      request.headers["x-patient-ref-id"] !== undefined ||
      request.headers["idempotency-key"] !== undefined;
    try {
      const result = await this.grantRevocation.revoke({
        principal: request.authPrincipal,
        tenantCandidate,
        sessionId,
        grantId,
        correlationId,
        hasUnexpectedInput,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return toGrantResponse(result.grant);
    } catch (error) {
      if (error instanceof InvalidGrantRevocationRequestError) {
        throw new BadRequestException({ code: "GRANT_REVOCATION_REQUEST_INVALID" });
      }
      if (error instanceof GrantRevocationConflictError) {
        throw new ConflictException({ code: "GRANT_REVOCATION_CONFLICT" });
      }
      if (error instanceof GrantRevocationDeniedError || error instanceof ActorTenantContextDeniedError) {
        throw new ForbiddenException({ code: "ACCESS_DENIED" });
      }
      if (error instanceof GrantRevocationUnavailableError || error instanceof ActorTenantContextUnavailableError) {
        throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      }
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }
}
