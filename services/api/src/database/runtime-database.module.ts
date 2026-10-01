import { Module } from "@nestjs/common";
import { parseAppConfig } from "../config/app-config.js";
import { APP_CONFIG } from "../health/health.tokens.js";
import { RuntimeDatabaseService } from "./runtime-database.service.js";

@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => parseAppConfig(process.env),
    },
    RuntimeDatabaseService,
  ],
  exports: [APP_CONFIG, RuntimeDatabaseService],
})
export class RuntimeDatabaseModule {}
