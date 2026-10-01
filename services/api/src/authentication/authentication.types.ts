export interface VerifiedAuthenticationPrincipal {
  readonly issuer: string;
  readonly subject: string;
  /** Synthetic patient binding asserted by the configured, verified OIDC issuer. */
  readonly patientRefId?: string;
}

export interface OidcTokenVerifier {
  verify(token: string): Promise<VerifiedAuthenticationPrincipal>;
}

declare module "fastify" {
  interface FastifyRequest {
    authPrincipal?: VerifiedAuthenticationPrincipal;
  }
}
