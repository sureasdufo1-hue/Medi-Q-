import { Module } from "@nestjs/common";
import type { OidcTokenVerifier } from "../authentication/authentication.types.js";
import { AuthenticationModule } from "../authentication/authentication.module.js";
import { OIDC_TOKEN_VERIFIER } from "../authentication/authentication.tokens.js";
import { IdentityContextModule } from "../identity/identity-context.module.js";
import { ActorTenantContextService } from "../identity/application/actor-tenant-context.service.js";
import { EphemeralEncryptedTemporaryImagingStore } from "./application/ephemeral-encrypted-temporary-imaging-store.js";
import { TemporaryPayloadExpiryRunner } from "./application/temporary-payload-expiry.runner.js";
import { TemporaryPayloadMaintenanceService } from "./application/temporary-payload-maintenance.service.js";

/** Private server configuration, not an HTTP/environment path selector. */
export const TEMPORARY_IMAGING_ROOT = Symbol("TEMPORARY_IMAGING_ROOT");
export const TEMPORARY_IMAGING_CONTAINER_DIRECTORY = "/var/lib/mediq/temporary-imaging";

@Module({
  imports: [IdentityContextModule, AuthenticationModule],
  providers: [
    { provide: TEMPORARY_IMAGING_ROOT, useValue: TEMPORARY_IMAGING_CONTAINER_DIRECTORY },
    {
      provide: EphemeralEncryptedTemporaryImagingStore,
      inject: [TEMPORARY_IMAGING_ROOT],
      useFactory: async (rootDirectory: string) => {
        const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory });
        await store.initializeForRuntime();
        return store;
      },
    },
    {
      provide: TemporaryPayloadExpiryRunner,
      inject: [ActorTenantContextService, EphemeralEncryptedTemporaryImagingStore],
      useFactory: (context: ActorTenantContextService, store: EphemeralEncryptedTemporaryImagingStore) =>
        new TemporaryPayloadExpiryRunner(context, store),
    },
    {
      provide: TemporaryPayloadMaintenanceService,
      inject: [OIDC_TOKEN_VERIFIER, TemporaryPayloadExpiryRunner],
      useFactory: (verifier: OidcTokenVerifier | null, expiry: TemporaryPayloadExpiryRunner) =>
        new TemporaryPayloadMaintenanceService(verifier, expiry),
    },
  ],
  exports: [EphemeralEncryptedTemporaryImagingStore, TemporaryPayloadMaintenanceService],
})
export class TemporaryImagingStorageModule {}
