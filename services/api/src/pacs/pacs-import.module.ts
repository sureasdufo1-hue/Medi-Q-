import { Module } from "@nestjs/common";
import type { AppConfig } from "../config/app-config.js";
import { RuntimeDatabaseModule } from "../database/runtime-database.module.js";
import { APP_CONFIG } from "../health/health.tokens.js";
import {
  AuthorizationGatedOperationExecutor,
} from "../authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../authorization/application/authorization-engine.js";
import { PostgresAuthorizationEvidenceReader } from "../authorization/persistence/postgres-authorization-evidence.reader.js";
import { ResolvedObjectAuthorizationPolicy } from "../authorization/application/resolved-object-authorization.policy.js";
import { ActorTenantContextService } from "../identity/application/actor-tenant-context.service.js";
import { IdentityContextModule } from "../identity/identity-context.module.js";
import { PacsImportMappingGateService } from "./application/pacs-import-mapping-gate.service.js";
import { DICOM_GATEWAY, type DicomGateway } from "../dicom/application/dicom-gateway.port.js";
import { OrthancDicomwebAdapter } from "../dicom/infrastructure/orthanc-dicomweb.adapter.js";
import { TestOrthancEndpointResolver } from "../dicom/infrastructure/test-orthanc-endpoint-resolver.js";
import { AuthorizedSourceCaptureService } from "../integrity/application/authorized-source-capture.service.js";

@Module({
  imports: [IdentityContextModule, RuntimeDatabaseModule],
  providers: [
    {
      provide: DICOM_GATEWAY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new OrthancDicomwebAdapter(new TestOrthancEndpointResolver(config)),
    },
    {
      provide: AuthorizationGatedOperationExecutor,
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
      inject: [AuthorizationGatedOperationExecutor],
      useFactory: (executor: AuthorizationGatedOperationExecutor) =>
        new PacsImportMappingGateService(executor),
    },
    {
      provide: AuthorizedSourceCaptureService,
      inject: [
        AuthorizationGatedOperationExecutor,
        ActorTenantContextService,
        DICOM_GATEWAY,
      ],
      useFactory: (
        executor: AuthorizationGatedOperationExecutor,
        actorTenantContext: ActorTenantContextService,
        dicomGateway: DicomGateway,
      ) => new AuthorizedSourceCaptureService(executor, actorTenantContext, dicomGateway),
    },
  ],
  exports: [PacsImportMappingGateService, AuthorizedSourceCaptureService],
})
export class PacsImportModule {}
