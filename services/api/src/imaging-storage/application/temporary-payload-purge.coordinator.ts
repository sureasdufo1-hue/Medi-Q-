import { randomUUID } from "node:crypto";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import type { VerifiedActorTenantContext } from "../../identity/identity-context.types.js";
import type { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import {
  PostgresTemporaryPayloadMetadataRepository,
  TemporaryPayloadMetadataPersistenceError,
  type TemporaryPayloadOperationBinding,
  type TemporaryPayloadPurgeReason,
} from "../persistence/postgres-temporary-payload-metadata.repository.js";
import type { EphemeralEncryptedTemporaryImagingStore } from "./ephemeral-encrypted-temporary-imaging-store.js";
import { assertCleanupServiceContext, snapshotCleanupPrincipal, snapshotCleanupTime } from "./temporary-payload-service-context.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURGE_REASONS = new Set<TemporaryPayloadPurgeReason>([
  "CAPTURE_FAILURE",
  "EXPLICIT_CLOSE",
  "TRANSFER_TERMINAL",
  "TTL_EXPIRED",
  "PROCESS_RESTART",
]);

export class TemporaryPayloadPurgeUnavailableError extends Error {
  constructor(readonly phase: "VALIDATION" | "MARK_PENDING" | "PHYSICAL_PURGE" | "FINALIZE_AUDIT") {
    super("TEMPORARY_PAYLOAD_PURGE_UNAVAILABLE");
    this.name = "TemporaryPayloadPurgeUnavailableError";
  }
}

export interface TemporaryPayloadPurgeCommand {
  readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
  readonly tenantCandidate: string;
  readonly binding: TemporaryPayloadOperationBinding;
  readonly storageRef: string;
  readonly correlationId: string;
  readonly reason: TemporaryPayloadPurgeReason;
}

export type TemporaryPayloadPurgeResult = Readonly<{
  kind: "PURGED" | "ALREADY_PURGED";
}>;

type TenantRunner = Pick<ActorTenantContextService, "run">;
type PurgeStore = Pick<EphemeralEncryptedTemporaryImagingStore, "purgeByReference">;

function validBinding(value: unknown): value is TemporaryPayloadOperationBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return [
    binding.operationId,
    binding.tenantId,
    binding.exchangeSessionId,
    binding.packageId,
    binding.studyRefId,
    binding.sourceHospitalId,
  ].every((id) => typeof id === "string" && UUID_PATTERN.test(id));
}

/**
 * Internal, non-route-registered physical purge orchestration. The caller
 * supplies a verified principal and a server-resolved operation binding;
 * database binding/RLS remains authoritative. It never reads DICOM bytes.
 */
export class TemporaryPayloadPurgeCoordinator {
  constructor(
    private readonly tenantRunner: TenantRunner,
    private readonly store: PurgeStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async purge(input: TemporaryPayloadPurgeCommand): Promise<TemporaryPayloadPurgeResult> {
    if (
      !input ||
      typeof input.tenantCandidate !== "string" ||
      !UUID_PATTERN.test(input.tenantCandidate) ||
      !validBinding(input.binding) ||
      input.binding.tenantId.toLowerCase() !== input.tenantCandidate.toLowerCase() ||
      typeof input.storageRef !== "string" ||
      !UUID_PATTERN.test(input.storageRef) ||
      typeof input.correlationId !== "string" ||
      !UUID_PATTERN.test(input.correlationId) ||
      !PURGE_REASONS.has(input.reason)
    ) {
      throw new TemporaryPayloadPurgeUnavailableError("VALIDATION");
    }

    const binding = Object.freeze({
      operationId: input.binding.operationId.toLowerCase(),
      tenantId: input.binding.tenantId.toLowerCase(),
      exchangeSessionId: input.binding.exchangeSessionId.toLowerCase(),
      packageId: input.binding.packageId.toLowerCase(),
      studyRefId: input.binding.studyRefId.toLowerCase(),
      sourceHospitalId: input.binding.sourceHospitalId.toLowerCase(),
    });
    const storageRef = input.storageRef.toLowerCase();
    const correlationId = input.correlationId.toLowerCase();
    const tenantId = input.tenantCandidate.toLowerCase();
    const reason = input.reason;
    let principal: VerifiedAuthenticationPrincipal;
    try {
      principal = snapshotCleanupPrincipal(input.principal);
    } catch {
      throw new TemporaryPayloadPurgeUnavailableError("VALIDATION");
    }

    try {
      await this.tenantRunner.run(principal, tenantId, async (context, transaction) => {
        this.assertTenant(context, tenantId);
        if (reason === "TTL_EXPIRED") assertCleanupServiceContext(context, tenantId, principal);
        await new PostgresTemporaryPayloadMetadataRepository(transaction).markPurgePending({
          binding,
          storageRef,
          ...(reason === "TTL_EXPIRED" ? { expiredAt: snapshotCleanupTime(this.clock) } : {}),
        });
      });
    } catch {
      // No filesystem or key effect is permitted unless this transaction commits.
      throw new TemporaryPayloadPurgeUnavailableError("MARK_PENDING");
    }

    try {
      await this.store.purgeByReference({
        storageRef,
        binding: Object.freeze({
          tenantId: binding.tenantId,
          exchangeSessionId: binding.exchangeSessionId,
          packageId: binding.packageId,
          purpose: "PACS_IMPORT" as const,
        }),
      });
    } catch {
      // Keep PURGE_PENDING and its only recovery reference for a later retry.
      throw new TemporaryPayloadPurgeUnavailableError("PHYSICAL_PURGE");
    }

    try {
      const outcome = await this.tenantRunner.run(
        principal,
        tenantId,
        async (context, transaction) => {
          this.assertTenant(context, tenantId);
          if (reason === "TTL_EXPIRED") assertCleanupServiceContext(context, tenantId, principal);
          return new PostgresTemporaryPayloadMetadataRepository(transaction).finalizePurgeAndAudit({
            binding,
            storageRef,
            actorId: context.actorId,
            correlationId,
            auditEventId: this.createId(),
            reason,
            now: snapshotCleanupTime(this.clock),
          });
        },
      );
      if (outcome === "NOT_ELIGIBLE") throw new TemporaryPayloadMetadataPersistenceError();
      return Object.freeze({ kind: outcome });
    } catch {
      // Unlink may have succeeded; the ref remains retryable and purge-only.
      throw new TemporaryPayloadPurgeUnavailableError("FINALIZE_AUDIT");
    }
  }

  private assertTenant(context: VerifiedActorTenantContext, tenantId: string): void {
    if (context.tenantId.toLowerCase() !== tenantId) {
      throw new TemporaryPayloadPurgeUnavailableError("VALIDATION");
    }
  }
}
