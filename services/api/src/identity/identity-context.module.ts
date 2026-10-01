import { Module } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../database/runtime-database.module.js";
import { ActorTenantContextService } from "./application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "./persistence/actor-registry.repository.js";

@Module({
  imports: [RuntimeDatabaseModule],
  providers: [ActorRegistryRepository, ActorTenantContextService],
  exports: [ActorTenantContextService],
})
export class IdentityContextModule {}
