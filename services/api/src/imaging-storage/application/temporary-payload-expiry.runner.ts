import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import type { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import { PostgresTemporaryPayloadMetadataRepository } from "../persistence/postgres-temporary-payload-metadata.repository.js";
import type { EphemeralEncryptedTemporaryImagingStore } from "./ephemeral-encrypted-temporary-imaging-store.js";
import { TemporaryPayloadPurgeCoordinator } from "./temporary-payload-purge.coordinator.js";
import { assertCleanupServiceContext, snapshotCleanupPrincipal, snapshotCleanupTime } from "./temporary-payload-service-context.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TemporaryPayloadExpiryUnavailableError extends Error {
  constructor(readonly phase: "VALIDATION" | "DISCOVERY") {
    super("TEMPORARY_PAYLOAD_EXPIRY_UNAVAILABLE");
    this.name = "TemporaryPayloadExpiryUnavailableError";
  }
}

export interface TemporaryPayloadExpiryCommand {
  readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
  readonly tenantCandidate: string;
  readonly correlationId: string;
  readonly batchLimit?: number;
}

export interface TemporaryPayloadExpiryResult {
  readonly attempted: number;
  readonly purged: number;
  readonly alreadyPurged: number;
  readonly retryable: number;
  readonly hasMore: boolean;
}

/** Internal one-shot batch, not a registered worker, timer or auth endpoint. */
export class TemporaryPayloadExpiryRunner {
  private readonly purge: TemporaryPayloadPurgeCoordinator;

  constructor(
    private readonly tenantRunner: Pick<ActorTenantContextService, "run">,
    store: Pick<EphemeralEncryptedTemporaryImagingStore, "purgeByReference">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.purge = new TemporaryPayloadPurgeCoordinator(tenantRunner, store, clock);
  }

  async run(input: TemporaryPayloadExpiryCommand): Promise<Readonly<TemporaryPayloadExpiryResult>> {
    if (!input || typeof input.tenantCandidate !== "string" || !UUID.test(input.tenantCandidate) ||
      typeof input.correlationId !== "string" || !UUID.test(input.correlationId)) {
      throw new TemporaryPayloadExpiryUnavailableError("VALIDATION");
    }
    const tenantId = input.tenantCandidate.toLowerCase();
    const correlationId = input.correlationId.toLowerCase();
    const limit = input.batchLimit === undefined ? 50 : input.batchLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TemporaryPayloadExpiryUnavailableError("VALIDATION");
    }
    let principal: VerifiedAuthenticationPrincipal;
    try {
      principal = snapshotCleanupPrincipal(input.principal);
    } catch {
      throw new TemporaryPayloadExpiryUnavailableError("VALIDATION");
    }

    const candidates = await this.tenantRunner.run(principal, tenantId, async (context, transaction) => {
      assertCleanupServiceContext(context, tenantId, principal);
      return new PostgresTemporaryPayloadMetadataRepository(transaction).findExpired({
        tenantId, now: snapshotCleanupTime(this.clock), limit: limit + 1,
      });
    }).catch(() => { throw new TemporaryPayloadExpiryUnavailableError("DISCOVERY"); });

    let purged = 0;
    let alreadyPurged = 0;
    let retryable = 0;
    const batch = candidates.slice(0, limit);
    // Discovery has committed before any physical effects. Each purge resolves
    // current SERVICE membership again in its two independent transactions.
    for (const candidate of batch) {
      try {
        const result = await this.purge.purge({
          principal, tenantCandidate: tenantId, correlationId,
          binding: candidate.binding, storageRef: candidate.storageRef, reason: "TTL_EXPIRED",
        });
        if (result.kind === "PURGED") purged += 1;
        else alreadyPurged += 1;
      } catch {
        retryable += 1;
      }
    }
    return Object.freeze({ attempted: batch.length, purged, alreadyPurged, retryable, hasMore: candidates.length > limit });
  }
}
