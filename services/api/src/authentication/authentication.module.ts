import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { parseAppConfig } from "../config/app-config.js";
import { BearerAuthenticationGuard } from "./bearer-authentication.guard.js";
import { OIDC_TOKEN_VERIFIER } from "./authentication.tokens.js";
import { RemoteJwksOidcTokenVerifier } from "./oidc-jwt.verifier.js";

@Module({
  providers: [
    {
      provide: OIDC_TOKEN_VERIFIER,
      useFactory: () => {
        const config = parseAppConfig(process.env).oidcAuthentication;
        return config ? new RemoteJwksOidcTokenVerifier(config) : null;
      },
    },
    { provide: APP_GUARD, useClass: BearerAuthenticationGuard },
  ],
  exports: [OIDC_TOKEN_VERIFIER],
})
export class AuthenticationModule {}
