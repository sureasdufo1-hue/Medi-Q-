import { Module } from "@nestjs/common";
import { IdentityContextModule } from "../identity/identity-context.module.js";
import { ExchangeSessionCreationService } from "./application/exchange-session-creation.service.js";
import { ExchangeSessionController } from "./presentation/exchange-session.controller.js";

@Module({
  imports: [IdentityContextModule],
  controllers: [ExchangeSessionController],
  providers: [ExchangeSessionCreationService],
})
export class ExchangeModule {}
