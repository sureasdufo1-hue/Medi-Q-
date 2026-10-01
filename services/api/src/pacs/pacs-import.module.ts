import { Module } from "@nestjs/common";
import {
  AuthorizationGatedOperationExecutor,
} from "../authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../authorization/application/authorization-engine.js";
import { PostgresAuthorizationEvidenceReader } from "../authorization/persistence/postgres-authorization-evidence.reader.js";
import { ResolvedObjectAuthorizationPolicy } from "../authorization/application/resolved-object-authorization.policy.js";
import { ActorTenantContextService } from "../identity/application/actor-tenant-context.service.js";
import { IdentityContextModule } from "../identity/identity-context.module.js";
import { PacsImportMappingGateService } from "./application/pacs-import-mapping-gate.service.js";

const PACS_MAPPING_GATE_EXECUTOR = Symbol("PACS_MAPPING_GATE_EXECUTOR");

@Module({
  imports: [IdentityContextModule],
  providers: [
    {
      provide: PACS_MAPPING_GATE_EXECUTOR,
      inject: [ActorTenantContextService],
      useFactory: (actorTenantContext: ActorTenantContextService) => {
        const policy = new ResolvedObjectAuthorizationPolicy(
          new PostgresAuthorizationEvidenceReader(),
        );
        return new AuthorizationGatedOperationExecutor(
          actorTenantContext,
          new AuthorizationEngine(policy),
        );
      },
    },
    {
      provide: PacsImportMappingGateService,
      inject: [PACS_MAPPING_GATE_EXECUTOR],
      useFactory: (executor: AuthorizationGatedOperationExecutor) =>
        new PacsImportMappingGateService(executor),
    },
  ],
  exports: [PacsImportMappingGateService],
})
export class PacsImportModule {}
