import { describe, expect, it, vi } from "vitest";
import {
  InvalidTransferGrantError,
  TransferGrant,
} from "../../services/api/dist/grant/domain/transfer-grant.js";
import {
  PostgresTransferGrantRepository,
  TransferGrantConflictError,
  TransferGrantPersistenceError,
} from "../../services/api/dist/grant/persistence/postgres-transfer-grant.repository.js";

const fixedNow = new Date("2026-10-01T00:00:00.000Z");
const ids = {
  grantId: "60000000-0000-4000-8000-000000000001",
  sessionId: "60000000-0000-4000-8000-000000000002",
  consentId: "60000000-0000-4000-8000-000000000003",
  tenantId: "60000000-0000-4000-8000-000000000004",
  hospitalId: "60000000-0000-4000-8000-000000000005",
  actorId: "60000000-0000-4000-8000-000000000006",
  packageId: "60000000-0000-4000-8000-000000000007",
};

function grant(overrides = {}) {
  return TransferGrant.reconstitute({
    grantId: ids.grantId,
    exchangeSessionId: ids.sessionId,
    consentId: ids.consentId,
    recipientTenantId: ids.tenantId,
    recipientHospitalId: ids.hospitalId,
    recipientActorId: ids.actorId,
    imagingPackageId: ids.packageId,
    scopes: ["study:view", "study:pacs-transfer"],
    status: "ACTIVE",
    issuedAt: fixedNow,
    expiresAt: new Date("2026-10-02T00:00:00.000Z"),
    revokedAt: null,
    createdAt: fixedNow,
    ...overrides,
  });
}

function createDatabase(options = {}) {
  const query = vi.fn(async (statement, parameters = []) => {
    if (
      statement.startsWith("SAVEPOINT ") ||
      statement.startsWith("RELEASE SAVEPOINT ") ||
      statement.startsWith("ROLLBACK TO SAVEPOINT ")
    ) {
      return { rows: [], rowCount: null };
    }
    if (statement.includes("INSERT INTO transfer_grants")) {
      if (options.grantInsertError) throw options.grantInsertError;
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes("INSERT INTO transfer_grant_scopes")) {
      if (options.scopeInsertErrorAt === options.scopeInsertCount + 1) {
        throw options.scopeInsertError ?? new Error("sensitive driver detail");
      }
      options.scopeInsertCount = (options.scopeInsertCount ?? 0) + 1;
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes("FROM transfer_grants")) {
      return { rows: options.grantRows ?? [], rowCount: (options.grantRows ?? []).length };
    }
    if (statement.includes("FROM transfer_grant_scopes")) {
      return { rows: options.scopeRows ?? [], rowCount: (options.scopeRows ?? []).length };
    }
    throw new Error(`Unexpected SQL in test double: ${statement} ${parameters.length}`);
  });
  return { query };
}

function persistedRow(overrides = {}) {
  return {
    grant_id: ids.grantId,
    exchange_session_id: ids.sessionId,
    consent_id: ids.consentId,
    recipient_tenant_id: ids.tenantId,
    recipient_hospital_id: ids.hospitalId,
    recipient_actor_id: ids.actorId,
    imaging_package_id: ids.packageId,
    status: "ACTIVE",
    issued_at: fixedNow,
    expires_at: new Date("2026-10-02T00:00:00.000Z"),
    revoked_at: null,
    created_at: fixedNow,
    ...overrides,
  };
}

describe("PostgresTransferGrantRepository", () => {
  it("inserts an ACTIVE Grant and its scopes atomically with parameterized values", async () => {
    const database = createDatabase();
    const repository = new PostgresTransferGrantRepository(database);

    await expect(repository.insert(grant())).resolves.toBeUndefined();

    const insert = database.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO transfer_grants"),
    );
    expect(insert[0]).not.toContain(ids.grantId);
    expect(insert[1]).toEqual([
      ids.grantId,
      ids.sessionId,
      ids.consentId,
      ids.tenantId,
      ids.hospitalId,
      ids.actorId,
      ids.packageId,
      "ACTIVE",
      fixedNow,
      new Date("2026-10-02T00:00:00.000Z"),
      null,
      fixedNow,
    ]);
    const scopeWrites = database.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO transfer_grant_scopes"),
    );
    expect(scopeWrites).toHaveLength(2);
    expect(scopeWrites.map(([, values]) => values.slice(1))).toEqual([
      [ids.grantId, "study:view"],
      [ids.grantId, "study:pacs-transfer"],
    ]);
    expect(database.query.mock.calls[0][0]).toMatch(/^SAVEPOINT mediq_grant_[a-f0-9]+$/);
    expect(database.query.mock.calls.at(-1)[0]).toMatch(/^RELEASE SAVEPOINT mediq_grant_[a-f0-9]+$/);
    expect(database.query.mock.calls.some(([sql]) => /\b(UPDATE|DELETE|TRUNCATE)\b/i.test(sql))).toBe(false);
  });

  it("stores an actor-scoped idempotency key only when the verified issue path supplies one", async () => {
    const database = createDatabase();
    const repository = new PostgresTransferGrantRepository(database);
    const key = "61000000-0000-4000-8000-000000000099";

    await expect(repository.insert(grant(), key)).resolves.toBeUndefined();

    const insert = database.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO transfer_grants"),
    );
    expect(insert[0]).toContain("idempotency_key");
    expect(insert[1]).toEqual([
      ids.grantId, ids.sessionId, ids.consentId, ids.tenantId, ids.hospitalId,
      ids.actorId, ids.packageId, key, "ACTIVE", fixedNow,
      new Date("2026-10-02T00:00:00.000Z"), null, fixedNow,
    ]);
  });

  it("reconstitutes persisted metadata and ordered scopes without authorizing it", async () => {
    const database = createDatabase({
      grantRows: [persistedRow()],
      scopeRows: [
        { grant_scope_id: "61000000-0000-4000-8000-000000000002", scope: "study:view" },
        { grant_scope_id: "61000000-0000-4000-8000-000000000001", scope: "study:pacs-transfer" },
      ],
    });
    const repository = new PostgresTransferGrantRepository(database);

    const restored = await repository.findById(ids.grantId.toUpperCase());

    expect(restored).toBeInstanceOf(TransferGrant);
    expect(restored.toSnapshot()).toEqual(grant().toSnapshot());
    expect(database.query.mock.calls[0][1]).toEqual([ids.grantId]);
    expect(database.query.mock.calls[0][0]).toContain("LIMIT 2");
    expect(database.query.mock.calls[1][1]).toEqual([ids.grantId]);
  });

  it("returns null for an RLS-hidden or missing Grant and rejects malformed IDs before querying", async () => {
    const database = createDatabase();
    const repository = new PostgresTransferGrantRepository(database);

    await expect(repository.findById(ids.grantId)).resolves.toBeNull();
    await expect(repository.findById("not-a-uuid")).rejects.toBeInstanceOf(
      InvalidTransferGrantError,
    );
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it("looks up an exact Tenant/Actor/idempotency key and reconstitutes its scopes", async () => {
    const database = createDatabase({
      grantRows: [persistedRow()],
      scopeRows: [{ grant_scope_id: "61000000-0000-4000-8000-000000000001", scope: "study:view" }],
    });
    const repository = new PostgresTransferGrantRepository(database);
    const key = "61000000-0000-4000-8000-000000000099";

    const restored = await repository.findByIdempotencyKey({
      tenantId: ids.tenantId,
      actorId: ids.actorId,
      idempotencyKey: key,
    });

    expect(restored).toBeInstanceOf(TransferGrant);
    expect(restored.grantId).toBe(ids.grantId);
    expect(database.query.mock.calls[0][1]).toEqual([ids.tenantId, ids.actorId, key]);
    expect(database.query.mock.calls[0][0]).toContain("recipient_tenant_id = $1");
    expect(database.query.mock.calls[0][0]).toContain("recipient_actor_id = $2");
    expect(database.query.mock.calls[0][0]).toContain("idempotency_key = $3");
  });

  it("rejects non-domain and terminal Grant insertion before opening a savepoint", async () => {
    const database = createDatabase();
    const repository = new PostgresTransferGrantRepository(database);
    const revoked = grant({
      status: "REVOKED",
      revokedAt: new Date("2026-10-01T00:01:00.000Z"),
    });

    await expect(repository.insert({})).rejects.toBeInstanceOf(InvalidTransferGrantError);
    await expect(repository.insert(revoked)).rejects.toBeInstanceOf(InvalidTransferGrantError);
    expect(database.query).not.toHaveBeenCalled();
  });

  it("rolls back the whole Grant when a scope insert fails and hides database detail", async () => {
    const database = createDatabase({ scopeInsertErrorAt: 2 });
    const repository = new PostgresTransferGrantRepository(database);

    await expect(repository.insert(grant())).rejects.toBeInstanceOf(
      TransferGrantPersistenceError,
    );
    expect(database.query.mock.calls.some(([sql]) => sql.startsWith("ROLLBACK TO SAVEPOINT "))).toBe(true);
    expect(database.query.mock.calls.at(-1)[0]).toMatch(/^RELEASE SAVEPOINT /);
  });

  it("maps only a Grant primary-key collision to a stable conflict", async () => {
    const database = createDatabase({
      grantInsertError: Object.assign(new Error("sensitive driver detail"), {
        code: "23505",
        constraint: "transfer_grants_pkey",
      }),
    });
    const repository = new PostgresTransferGrantRepository(database);

    await expect(repository.insert(grant())).rejects.toBeInstanceOf(
      TransferGrantConflictError,
    );
    expect(database.query.mock.calls.some(([sql]) => sql.startsWith("ROLLBACK TO SAVEPOINT "))).toBe(true);
  });

  it("fails closed when persisted scopes cannot be represented by the P0 domain", async () => {
    const database = createDatabase({
      grantRows: [persistedRow()],
      scopeRows: [{ grant_scope_id: "61000000-0000-4000-8000-000000000001", scope: "study:mobile-export" }],
    });
    const repository = new PostgresTransferGrantRepository(database);

    await expect(repository.findById(ids.grantId)).rejects.toBeInstanceOf(
      TransferGrantPersistenceError,
    );
  });
});
