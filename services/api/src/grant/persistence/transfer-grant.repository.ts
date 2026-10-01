import type { TransferGrant } from "../domain/transfer-grant.js";

/**
 * Internal persistence port. Callers must use the same IAM-002 verified
 * tenant PoolClient transaction. Persistence does not establish Authorization,
 * validate cross-entity bindings, or make a Grant usable for a resource.
 */
export interface TransferGrantRepository {
  insert(grant: TransferGrant, idempotencyKey?: string): Promise<void>;
  findById(grantId: string): Promise<TransferGrant | null>;
  findByIdForUpdate(grantId: string): Promise<TransferGrant | null>;
  revokeActive(grant: TransferGrant, recipient: {
    tenantId: string;
    hospitalId: string;
    actorId: string;
  }): Promise<void>;
  findByIdempotencyKey(input: {
    tenantId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<TransferGrant | null>;
}
