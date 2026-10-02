import type { PoolClient } from "pg";
import type {
  TemporaryPayloadQuotaReservationInput,
  TemporaryPayloadQuotaReservationPort,
} from "../application/temporary-payload-quota.port.js";
import { TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES } from "../application/temporary-payload-quota.port.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface VerifiedTenantQuotaTransactionRunner {
  /** The callback must run inside a transaction with transaction-local Tenant RLS context. */
  withTenant<T>(
    tenantId: string,
    work: (transaction: Pick<PoolClient, "query">) => Promise<T>,
  ): Promise<T>;
}

export class TemporaryPayloadQuotaPersistenceError extends Error {
  constructor() {
    super("TEMPORARY_PAYLOAD_QUOTA_UNAVAILABLE");
    this.name = "TemporaryPayloadQuotaPersistenceError";
  }
}

function validBinding(value: unknown): value is TemporaryPayloadQuotaReservationInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return [binding.tenantId, binding.studyRefId, binding.storageRef, binding.writerId]
    .every((value) => typeof value === "string" && UUID_PATTERN.test(value));
}

function validBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

/**
 * Calls only the fixed database quota functions. The caller supplies a verified
 * Tenant transaction runner; this adapter never receives direct ledger grants.
 */
export class PostgresTemporaryPayloadQuotaRepository
implements TemporaryPayloadQuotaReservationPort {
  constructor(private readonly transactions: VerifiedTenantQuotaTransactionRunner) {}

  async reserve(input: TemporaryPayloadQuotaReservationInput & {
    readonly deltaBytes: number;
  }): Promise<void> {
    if (
      !this.transactions ||
      !validBinding(input) ||
      !validBoundedInteger(
        input.deltaBytes,
        1,
        TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES,
      ) ||
      input.deltaBytes % TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES !== 0
    ) {
      throw new TemporaryPayloadQuotaPersistenceError();
    }
    try {
      await this.transactions.withTenant(input.tenantId, async (transaction) => {
        await transaction.query(
          "SELECT public.reserve_temporary_payload_quota($1::uuid, $2::uuid, $3::uuid, $4::bigint)",
          [input.studyRefId, input.storageRef, input.writerId, input.deltaBytes],
        );
      });
    } catch {
      throw new TemporaryPayloadQuotaPersistenceError();
    }
  }

  async settle(input: TemporaryPayloadQuotaReservationInput & {
    readonly actualBytes: number;
  }): Promise<void> {
    if (
      !this.transactions ||
      !validBinding(input) ||
      !validBoundedInteger(input.actualBytes, 1, 2 * 1024 * 1024 * 1024)
    ) {
      throw new TemporaryPayloadQuotaPersistenceError();
    }
    try {
      await this.transactions.withTenant(input.tenantId, async (transaction) => {
        await transaction.query(
          "SELECT public.settle_temporary_payload_quota($1::uuid, $2::uuid, $3::uuid, $4::bigint)",
          [input.studyRefId, input.storageRef, input.writerId, input.actualBytes],
        );
      });
    } catch {
      throw new TemporaryPayloadQuotaPersistenceError();
    }
  }
}
