import { Module } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../database/runtime-database.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [RuntimeDatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
