import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { OIDC_TOKEN_VERIFIER, PUBLIC_ROUTE_METADATA } from "./authentication.tokens.js";
import type { OidcTokenVerifier } from "./authentication.types.js";
import { AuthenticationProviderUnavailableError } from "./oidc-jwt.verifier.js";

const MAX_AUTHORIZATION_HEADER_BYTES = 8 * 1024 + 16;

export function parseBearerToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_AUTHORIZATION_HEADER_BYTES) {
    return null;
  }
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(value);
  if (!match || Buffer.byteLength(match[1], "utf8") > 8 * 1024) return null;
  return match[1];
}

@Injectable()
export class BearerAuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OIDC_TOKEN_VERIFIER)
    private readonly tokenVerifier: OidcTokenVerifier | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    if (context.getType() !== "http") {
      throw new UnauthorizedException({ code: "AUTHENTICATION_REQUIRED" });
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    reply.header("WWW-Authenticate", 'Bearer realm="mediq-api"');

    if (!this.tokenVerifier) {
      throw new ServiceUnavailableException({ code: "AUTHENTICATION_UNAVAILABLE" });
    }

    const token = parseBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException({ code: "AUTHENTICATION_REQUIRED" });

    try {
      request.authPrincipal = await this.tokenVerifier.verify(token);
      return true;
    } catch (error) {
      if (error instanceof AuthenticationProviderUnavailableError) {
        throw new ServiceUnavailableException({ code: "AUTHENTICATION_UNAVAILABLE" });
      }
      throw new UnauthorizedException({ code: "AUTHENTICATION_REQUIRED" });
    }
  }
}
