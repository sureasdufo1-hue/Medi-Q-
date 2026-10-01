import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { AppConfig } from "../../config/app-config.js";
import { APP_CONFIG } from "../../health/health.tokens.js";
import { RuntimeDatabaseService } from "../../database/runtime-database.service.js";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import { ActorRegistryRepository } from "../persistence/actor-registry.repository.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type ActorTenantWork,
  type VerifiedActorTenantContext,
} from "../identity-context.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPrincipal(
  principal: VerifiedAuthenticationPrincipal | null | undefined,
  configuredIssuer: string | undefined,
): principal is VerifiedAuthenticationPrincipal {
  return Boolean(
    principal &&
      configuredIssuer &&
      principal.issuer === configuredIssuer &&
      typeof principal.subject === "string" &&
      principal.subject.length > 0 &&
      principal.subject.length <= 255,
  );
}

@Injectable()
export class ActorTenantContextService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: RuntimeDatabaseService,
    private readonly actorRegistry: ActorRegistryRepository,
  ) {}

  async run<T>(
    principal: VerifiedAuthenticationPrincipal | null | undefined,
    tenantCandidate: string,
    work: ActorTenantWork<T>,
  ): Promise<T> {
    const configuredIssuer = this.config.oidcAuthentication?.issuer;
    if (!validPrincipal(principal, configuredIssuer) || !UUID_PATTERN.test(tenantCandidate)) {
      throw new ActorTenantContextDeniedError();
    }
    const tenantId = tenantCandidate.toLowerCase();

    let client: PoolClient;
    try {
      client = await this.database.connect();
    } catch {
      throw new ActorTenantContextUnavailableError();
    }

    let transactionOpen = false;
    let discardClient = false;
    try {
      try {
        await client.query("RESET mediq.tenant_id");
        await client.query("BEGIN");
        transactionOpen = true;
        await client.query("SELECT set_config('mediq.tenant_id', $1, true)", [tenantId]);
      } catch {
        discardClient = true;
        throw new ActorTenantContextUnavailableError();
      }

      let membership;
      try {
        membership = await this.actorRegistry.findActiveMembership(
          client,
          tenantId,
          principal.subject,
        );
      } catch {
        discardClient = true;
        throw new ActorTenantContextUnavailableError();
      }
      if (!membership) throw new ActorTenantContextDeniedError();
      if (
        membership.tenantId !== tenantId ||
        !UUID_PATTERN.test(membership.actorId) ||
        (membership.hospitalId !== null && !UUID_PATTERN.test(membership.hospitalId)) ||
        (membership.actorType !== "USER" && membership.actorType !== "SERVICE")
      ) {
        discardClient = true;
        throw new ActorTenantContextUnavailableError();
      }

      const context: VerifiedActorTenantContext = Object.freeze({
        issuer: principal.issuer,
        subject: principal.subject,
        actorId: membership.actorId,
        tenantId: membership.tenantId,
        hospitalId: membership.hospitalId,
        actorType: membership.actorType,
      });

      let result: T;
      try {
        result = await work(context, client);
      } catch (error) {
        throw error;
      }

      try {
        await client.query("COMMIT");
        transactionOpen = false;
      } catch {
        discardClient = true;
        throw new ActorTenantContextUnavailableError();
      }
      return result;
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
          transactionOpen = false;
        } catch {
          discardClient = true;
        }
      }
      throw error;
    } finally {
      if (!discardClient) {
        try {
          await client.query("RESET mediq.tenant_id");
        } catch {
          discardClient = true;
        }
      }
      client.release(discardClient ? new Error("MEDIQ_DATABASE_CLIENT_DISCARDED") : undefined);
    }
  }
}
