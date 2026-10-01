import { Module } from "@nestjs/common";
import { AuthenticationModule } from "./authentication/authentication.module.js";
import { HealthModule } from "./health/health.module.js";
import { IdentityContextModule } from "./identity/identity-context.module.js";
import { ExchangeModule } from "./exchange/exchange.module.js";
import { ConsentModule } from "./consent/consent.module.js";
import { PacsImportModule } from "./pacs/pacs-import.module.js";

@Module({ imports: [AuthenticationModule, HealthModule, IdentityContextModule, ExchangeModule, ConsentModule, PacsImportModule] })
export class AppModule {}
