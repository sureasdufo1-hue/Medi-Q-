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
  GrantIssueConflictError,
  GrantIssueDeniedError,
  GrantIssueService,
  GrantIssueUnavailableError,
  InvalidGrantIssueRequestError,
} from "../application/grant-issue.service.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../identity/identity-context.types.js";
import { toGrantResponse } from "./grant-response.js";

@Controller("exchange-sessions/:sessionId/grants")
export class GrantIssueController {
  constructor(private readonly grantIssue: GrantIssueService) {}

  @Post("issue")
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Param("sessionId") sessionId: string,
    @Req() request: FastifyRequest,
    @Headers("x-tenant-id") tenantCandidate: string | string[] | undefined,
    @Headers("idempotency-key") idempotencyKey: string | string[] | undefined,
    @Headers("x-correlation-id") correlationId: string | string[] | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = request.query;
    const hasUnexpectedInput =
      (typeof query === "object" && query !== null && Object.keys(query).length > 0) ||
      request.headers["x-patient-ref-id"] !== undefined;
    try {
      const result = await this.grantIssue.issue({
        principal: request.authPrincipal,
        tenantCandidate,
        sessionId,
        idempotencyKey,
        correlationId,
        body: request.body,
        hasUnexpectedInput,
      });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Correlation-ID", result.correlationId);
      if (result.replayed) {
        reply.status(HttpStatus.OK);
        reply.header("Idempotency-Replayed", "true");
      }
      return toGrantResponse(result.grant);
    } catch (error) {
      if (error instanceof InvalidGrantIssueRequestError) throw new BadRequestException({ code: "GRANT_ISSUE_REQUEST_INVALID" });
      if (error instanceof GrantIssueConflictError) throw new ConflictException({ code: "GRANT_ISSUE_CONFLICT" });
      if (error instanceof GrantIssueDeniedError || error instanceof ActorTenantContextDeniedError) throw new ForbiddenException({ code: "ACCESS_DENIED" });
      if (error instanceof GrantIssueUnavailableError || error instanceof ActorTenantContextUnavailableError) throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
      throw new ServiceUnavailableException({ code: "SERVICE_UNAVAILABLE" });
    }
  }
}
