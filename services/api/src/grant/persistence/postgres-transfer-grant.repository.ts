import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  InvalidTransferGrantError,
  p0TransferGrantScopes,
  TransferGrant,
  type P0TransferGrantScope,
  type TransferGrantStatus,
} from "../domain/transfer-grant.js";
import type { TransferGrantRepository } from "./transfer-grant.repository.js";

interface TransferGrantRow extends QueryResultRow {
  grant_id: string;
  exchange_session_id: string;
  consent_id: string;
  recipient_tenant_id: string;
  recipient_hospital_id: string;
  recipient_actor_id: string | null;
  imaging_package_id: string | null;
  status: TransferGrantStatus;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

interface TransferGrantScopeRow extends QueryResultRow {
  scope: string;
}

const grantColumns = `
  grant_id,
  exchange_session_id,
  consent_id,
  recipient_tenant_id,
  recipient_hospital_id,
  recipient_actor_id,
  imaging_package_id,
  status,
  issued_at,
  expires_at,
  revoked_at,
  created_at
`;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TransferGrantPersistenceError extends Error {
  constructor() {
    super("TRANSFER_GRANT_PERSISTENCE_FAILED");
    this.name = "TransferGrantPersistenceError";
  }
}

export class TransferGrantConflictError extends Error {
  constructor() {
    super("TRANSFER_GRANT_CONFLICT");
    this.name = "TransferGrantConflictError";
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function postgresErrorConstraint(error: unknown): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("constraint" in error)
  ) {
    return undefined;
  }
  return typeof error.constraint === "string" ? error.constraint : undefined;
}

function toDomain(
  row: TransferGrantRow,
  scopes: readonly P0TransferGrantScope[],
): TransferGrant {
  return TransferGrant.reconstitute({
    grantId: row.grant_id,
    exchangeSessionId: row.exchange_session_id,
    consentId: row.consent_id,
    recipientTenantId: row.recipient_tenant_id,
    recipientHospitalId: row.recipient_hospital_id,
    recipientActorId: row.recipient_actor_id,
    imagingPackageId: row.imaging_package_id,
    scopes,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  });
}

function isP0TransferGrantScope(value: string): value is P0TransferGrantScope {
  return (p0TransferGrantScopes as readonly string[]).includes(value);
}

export class PostgresTransferGrantRepository
  implements TransferGrantRepository
{
  constructor(private readonly database: Pick<PoolClient, "query">) {}

  async insert(grant: TransferGrant, idempotencyKey?: string): Promise<void> {
    if (
      !(grant instanceof TransferGrant) ||
      grant.status !== "ACTIVE" ||
      (typeof idempotencyKey !== "undefined" && !uuidPattern.test(idempotencyKey)) ||
      (typeof idempotencyKey !== "undefined" && grant.recipientActorId === null)
    ) {
      throw new InvalidTransferGrantError();
    }

    const savepointName = `mediq_grant_${randomUUID().replaceAll("-", "")}`;
    let savepointCreated = false;
    try {
      // The IAM-002 caller owns the outer verified Tenant transaction. The
      // savepoint makes the Grant and its scope rows atomic within that unit.
      await this.database.query(`SAVEPOINT ${savepointName}`);
      savepointCreated = true;

      const inserted = typeof idempotencyKey === "string"
        ? await this.database.query(
          `INSERT INTO transfer_grants
            (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
             recipient_hospital_id, recipient_actor_id, imaging_package_id,
             idempotency_key, status, issued_at, expires_at, revoked_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            grant.grantId,
            grant.exchangeSessionId,
            grant.consentId,
            grant.recipientTenantId,
            grant.recipientHospitalId,
            grant.recipientActorId,
            grant.imagingPackageId,
            idempotencyKey.toLowerCase(),
            grant.status,
            grant.issuedAt,
            grant.expiresAt,
            grant.revokedAt,
            grant.createdAt,
          ],
        )
        : await this.database.query(
          `INSERT INTO transfer_grants
            (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
             recipient_hospital_id, recipient_actor_id, imaging_package_id,
             status, issued_at, expires_at, revoked_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
          grant.grantId,
          grant.exchangeSessionId,
          grant.consentId,
          grant.recipientTenantId,
          grant.recipientHospitalId,
          grant.recipientActorId,
          grant.imagingPackageId,
          grant.status,
          grant.issuedAt,
          grant.expiresAt,
          grant.revokedAt,
          grant.createdAt,
          ],
        );
      if (inserted.rowCount !== 1) throw new TransferGrantPersistenceError();

      for (const scope of grant.scopes) {
        const insertedScope = await this.database.query(
          `INSERT INTO transfer_grant_scopes
            (grant_scope_id, grant_id, scope)
           VALUES ($1, $2, $3)`,
          [randomUUID(), grant.grantId, scope],
        );
        if (insertedScope.rowCount !== 1) {
          throw new TransferGrantPersistenceError();
        }
      }

      await this.database.query(`RELEASE SAVEPOINT ${savepointName}`);
      savepointCreated = false;
    } catch (error) {
      if (savepointCreated) {
        try {
          await this.database.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await this.database.query(`RELEASE SAVEPOINT ${savepointName}`);
        } catch {
          // The trusted outer transaction boundary must discard a client if
          // PostgreSQL cannot recover this savepoint.
        }
      }
      if (
        error instanceof TransferGrantPersistenceError ||
        error instanceof InvalidTransferGrantError
      ) {
        throw error;
      }
      if (
        postgresErrorCode(error) === "23505" &&
        (postgresErrorConstraint(error) === "transfer_grants_pkey" ||
          postgresErrorConstraint(error) === "transfer_grants_tenant_actor_idempotency_key_unique")
      ) {
        throw new TransferGrantConflictError();
      }
      throw new TransferGrantPersistenceError();
    }
  }

  async findById(grantId: string): Promise<TransferGrant | null> {
    if (typeof grantId !== "string" || !uuidPattern.test(grantId)) {
      throw new InvalidTransferGrantError();
    }
    const normalizedId = grantId.toLowerCase();

    try {
      const grantResult = await this.database.query<TransferGrantRow>(
        `SELECT ${grantColumns}
           FROM transfer_grants
          WHERE grant_id = $1
          LIMIT 2`,
        [normalizedId],
      );
      if (grantResult.rows.length === 0) return null;
      if (grantResult.rows.length !== 1) {
        throw new TransferGrantPersistenceError();
      }

      const scopeResult = await this.database.query<TransferGrantScopeRow>(
        `SELECT scope
           FROM transfer_grant_scopes
          WHERE grant_id = $1
          ORDER BY scope ASC`,
          [normalizedId],
      );
      const scopes = scopeResult.rows.map((row) => row.scope);
      if (!scopes.every(isP0TransferGrantScope)) {
        throw new TransferGrantPersistenceError();
      }
      return toDomain(
        grantResult.rows[0],
        scopes,
      );
    } catch (error) {
      if (error instanceof TransferGrantPersistenceError) throw error;
      if (error instanceof InvalidTransferGrantError) {
        throw new TransferGrantPersistenceError();
      }
      throw new TransferGrantPersistenceError();
    }
  }

  async findByIdForUpdate(grantId: string): Promise<TransferGrant | null> {
    if (typeof grantId !== "string" || !uuidPattern.test(grantId)) {
      throw new InvalidTransferGrantError();
    }
    const normalizedId = grantId.toLowerCase();

    try {
      const grantResult = await this.database.query<TransferGrantRow>(
        `SELECT ${grantColumns}
           FROM transfer_grants
          WHERE grant_id = $1
          LIMIT 2
          FOR UPDATE`,
        [normalizedId],
      );
      if (grantResult.rows.length === 0) return null;
      if (grantResult.rows.length !== 1) throw new TransferGrantPersistenceError();

      const scopeResult = await this.database.query<TransferGrantScopeRow>(
        `SELECT scope
           FROM transfer_grant_scopes
          WHERE grant_id = $1
          ORDER BY scope ASC`,
        [normalizedId],
      );
      const scopes = scopeResult.rows.map((row) => row.scope);
      if (!scopes.every(isP0TransferGrantScope)) throw new TransferGrantPersistenceError();
      return toDomain(grantResult.rows[0], scopes);
    } catch (error) {
      if (error instanceof TransferGrantPersistenceError) throw error;
      if (error instanceof InvalidTransferGrantError) throw new TransferGrantPersistenceError();
      throw new TransferGrantPersistenceError();
    }
  }

  async revokeActive(
    grant: TransferGrant,
    recipient: { tenantId: string; hospitalId: string; actorId: string },
  ): Promise<void> {
    if (
      !(grant instanceof TransferGrant) || grant.status !== "REVOKED" ||
      grant.revokedAt === null ||
      !uuidPattern.test(recipient.tenantId) ||
      !uuidPattern.test(recipient.hospitalId) ||
      !uuidPattern.test(recipient.actorId)
    ) throw new InvalidTransferGrantError();

    try {
      const result = await this.database.query(
        `UPDATE transfer_grants
            SET status = 'REVOKED', revoked_at = $6
          WHERE grant_id = $1
            AND exchange_session_id = $2
            AND recipient_tenant_id = $3
            AND recipient_hospital_id = $4
            AND recipient_actor_id = $5
            AND status = 'ACTIVE'`,
        [
          grant.grantId,
          grant.exchangeSessionId,
          recipient.tenantId.toLowerCase(),
          recipient.hospitalId.toLowerCase(),
          recipient.actorId.toLowerCase(),
          grant.revokedAt,
        ],
      );
      if (result.rowCount !== 1) throw new TransferGrantConflictError();
    } catch (error) {
      if (error instanceof TransferGrantConflictError || error instanceof InvalidTransferGrantError) throw error;
      throw new TransferGrantPersistenceError();
    }
  }

  async findByIdempotencyKey(input: {
    tenantId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<TransferGrant | null> {
    if (
      !uuidPattern.test(input.tenantId) ||
      !uuidPattern.test(input.actorId) ||
      !uuidPattern.test(input.idempotencyKey)
    ) {
      throw new InvalidTransferGrantError();
    }

    try {
      const result = await this.database.query<TransferGrantRow>(
        `SELECT ${grantColumns}
           FROM transfer_grants
          WHERE recipient_tenant_id = $1
            AND recipient_actor_id = $2
            AND idempotency_key = $3
          LIMIT 2`,
        [
          input.tenantId.toLowerCase(),
          input.actorId.toLowerCase(),
          input.idempotencyKey.toLowerCase(),
        ],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1) throw new TransferGrantPersistenceError();

      const scopeResult = await this.database.query<TransferGrantScopeRow>(
        `SELECT scope
           FROM transfer_grant_scopes
          WHERE grant_id = $1
          ORDER BY scope ASC`,
        [result.rows[0].grant_id],
      );
      const scopes = scopeResult.rows.map((row) => row.scope);
      if (!scopes.every(isP0TransferGrantScope)) {
        throw new TransferGrantPersistenceError();
      }
      return toDomain(result.rows[0], scopes);
    } catch (error) {
      if (error instanceof TransferGrantPersistenceError) throw error;
      if (error instanceof InvalidTransferGrantError) {
        throw new TransferGrantPersistenceError();
      }
      throw new TransferGrantPersistenceError();
    }
  }
}
