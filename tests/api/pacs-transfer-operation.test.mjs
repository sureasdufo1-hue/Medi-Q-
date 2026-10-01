import { describe, expect, it, vi } from "vitest";
import {
  InvalidPacsTransferOperationError,
  InvalidPacsTransferOperationTransitionError,
  PacsTransferOperation,
} from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { pacsTransferOperationDigest } from "../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js";
import {
  PacsTransferOperationConcurrencyError,
  PacsTransferOperationConflictError,
  PacsTransferOperationPersistenceError,
} from "../../services/api/dist/pacs/persistence/pacs-transfer-operation.repository.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";

const ids = Object.freeze({
  operation: "10000000-0000-4000-8000-000000000001",
  tenant: "20000000-0000-4000-8000-000000000002",
  session: "30000000-0000-4000-8000-000000000003",
  study: "40000000-0000-4000-8000-000000000004",
  actor: "50000000-0000-4000-8000-000000000005",
  key: "60000000-0000-4000-8000-000000000006",
  consent: "70000000-0000-4000-8000-000000000007",
  grant: "80000000-0000-4000-8000-000000000008",
  correlation: "90000000-0000-4000-8000-000000000009",
  audit: "a0000000-0000-4000-8000-00000000000a",
});
const createdAt = new Date("2026-10-01T00:00:00.000Z");
function createOperation(overrides = {}) {
  const semantics = overrides.semantics ?? {
    tenantId: ids.tenant,
    actorId: ids.actor,
    exchangeSessionId: ids.session,
    studyRefId: ids.study,
    consentId: ids.consent,
    grantId: ids.grant,
    action: "PACS_IMPORT",
  };
  return PacsTransferOperation.create({
    operationId: overrides.operationId ?? ids.operation,
    semantics,
    idempotencyKey: ids.key,
    now: createdAt,
    ...(overrides.idempotencyKey ? { idempotencyKey: overrides.idempotencyKey } : {}),
  });
}

function operationRow(operation = createOperation(), overrides = {}) {
  const value = operation.snapshot;
  return {
    operation_id: value.operationId,
    tenant_id: value.tenantId,
    exchange_session_id: value.exchangeSessionId,
    study_ref_id: value.studyRefId,
    actor_id: value.actorId,
    idempotency_key: value.idempotencyKey,
    request_digest: value.requestDigest,
    state: value.state,
    version: value.version,
    reason_code: value.reasonCode,
    source_object_count: value.sourceObjectCount,
    destination_object_count: value.destinationObjectCount,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    stow_started_at: value.stowStartedAt,
    ...overrides,
  };
}

function dbHarness({ insertRows = [], updatedRows = [], auditFailure = false } = {}) {
  const queries = [];
  const client = {
    query: vi.fn(async (statement, values = []) => {
      queries.push({ statement, values });
      if (statement.includes("INSERT INTO pacs_transfer_operations")) {
        return { rows: insertRows, rowCount: insertRows.length };
      }
      if (statement.includes("FROM pacs_transfer_operations")) {
        return { rows: insertRows, rowCount: insertRows.length };
      }
      if (statement.includes("UPDATE pacs_transfer_operations")) {
        return { rows: updatedRows, rowCount: updatedRows.length };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        if (auditFailure) throw new Error("synthetic audit failure");
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: null };
    }),
  };
  return { client, queries };
}

describe("PACS transfer operation domain and repository", () => {
  it("creates immutable metadata-only operation state and enforces the legal dispatch path", () => {
    const created = createOperation();
    const preflight = created.transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(createdAt.getTime() + 1),
    });
    const started = preflight.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(createdAt.getTime() + 2),
    });
    const unknown = started.transitionTo({
      nextState: "RESULT_UNKNOWN",
      now: new Date(createdAt.getTime() + 3),
      reasonCode: "UPSTREAM_RESPONSE_UNKNOWN",
    });

    expect(created.snapshot.state).toBe("CREATED");
    expect(started.snapshot.stowStartedAt).toEqual(
      new Date(createdAt.getTime() + 2),
    );
    expect(unknown.snapshot.state).toBe("RESULT_UNKNOWN");
    expect(unknown.snapshot.version).toBe(3);
    expect(() =>
      unknown.transitionTo({
        nextState: "STOW_STARTED",
        now: new Date(createdAt.getTime() + 4),
      }),
    ).toThrow(InvalidPacsTransferOperationTransitionError);
    expect(() =>
      unknown.transitionTo({
        nextState: "VERIFYING",
        now: new Date(createdAt.getTime() + 4),
      }),
    ).toThrow(InvalidPacsTransferOperationTransitionError);
  });

  it("rejects malformed snapshots, counts, timestamps, and preflight-to-STOW skips", () => {
    expect(() =>
      createOperation({
        semantics: {
          tenantId: ids.tenant,
          actorId: ids.actor,
          exchangeSessionId: ids.session,
          studyRefId: ids.study,
          consentId: ids.consent,
          grantId: "invalid",
          action: "PACS_IMPORT",
        },
      }),
    ).toThrow(/PACS_TRANSFER_OPERATION_SEMANTICS_INVALID/);
    expect(() => createOperation({ operationId: "invalid" })).toThrow(
      InvalidPacsTransferOperationError,
    );
    expect(() =>
      createOperation().transitionTo({
        nextState: "STOW_STARTED",
        now: new Date(createdAt.getTime() + 1),
      }),
    ).toThrow(InvalidPacsTransferOperationTransitionError);
    expect(() =>
      createOperation().transitionTo({
        nextState: "FAILED",
        now: new Date(createdAt.getTime() + 1),
        sourceObjectCount: -1,
      }),
    ).toThrow(InvalidPacsTransferOperationTransitionError);
  });

  it("canonicalizes request semantics and changes the digest when scope changes", () => {
    const semantics = {
      tenantId: ids.tenant,
      actorId: ids.actor,
      exchangeSessionId: ids.session,
      studyRefId: ids.study,
      consentId: ids.consent,
      grantId: ids.grant,
      action: "PACS_IMPORT",
    };
    const digest = pacsTransferOperationDigest(semantics);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      pacsTransferOperationDigest({
        ...semantics,
        tenantId: ids.tenant.toUpperCase(),
      }),
    ).toBe(digest);
    expect(
      pacsTransferOperationDigest({ ...semantics, grantId: ids.key }),
    ).not.toBe(digest);
  });

  it("uses parameterized Tenant-session-locked insert and writes metadata Audit", async () => {
    const created = createOperation();
    const { client, queries } = dbHarness({ insertRows: [operationRow(created)] });
    const repository = new PostgresPacsTransferOperationRepository(
      client,
      () => ids.audit,
    );
    const result = await repository.createIdempotently({
      operation: created,
      correlationId: ids.correlation,
    });

    expect(result.created).toBe(true);
    expect(result.operation.snapshot.state).toBe("CREATED");
    expect(queries[0].statement).toContain("pg_advisory_xact_lock");
    expect(queries[0].values).toEqual([ids.session]);
    const insert = queries.find((query) =>
      query.statement.includes("INSERT INTO pacs_transfer_operations"),
    );
    expect(insert.statement).toContain("ON CONFLICT DO NOTHING");
    expect(insert.statement).not.toContain(ids.study);
    const audit = queries.find((query) =>
      query.statement.includes("INSERT INTO audit_events"),
    );
    expect(audit.statement).toContain("PACS_TRANSFER_OPERATION_STATE_CHANGED");
    expect(audit.values).not.toContain(ids.study);
  });

  it("returns exact same-key semantic replay without a duplicate Audit", async () => {
    const existing = createOperation();
    const { client, queries } = dbHarness({ insertRows: [operationRow(existing)] });
    // Simulate a unique conflict: the INSERT returns no rows; the follow-up read returns the record.
    client.query.mockImplementation(async (statement, values = []) => {
      queries.push({ statement, values });
      if (statement.includes("INSERT INTO pacs_transfer_operations")) {
        return { rows: [], rowCount: 0 };
      }
      if (statement.includes("FROM pacs_transfer_operations")) {
        return { rows: [operationRow(existing)], rowCount: 1 };
      }
      return { rows: [], rowCount: null };
    });
    const result = await new PostgresPacsTransferOperationRepository(
      client,
      () => ids.audit,
    ).createIdempotently({
      operation: existing,
      correlationId: ids.correlation,
    });

    expect(result.created).toBe(false);
    expect(result.operation.snapshot.operationId).toBe(ids.operation);
    expect(queries.some((query) => query.statement.includes("INSERT INTO audit_events"))).toBe(false);
  });

  it("rejects same-key or same-study reuse with changed request semantics", async () => {
    const existing = createOperation();
    const candidate = createOperation({
      semantics: {
        tenantId: ids.tenant,
        actorId: ids.actor,
        exchangeSessionId: ids.session,
        studyRefId: ids.study,
        consentId: ids.consent,
        grantId: ids.key,
        action: "PACS_IMPORT",
      },
    });
    const { client } = dbHarness({ insertRows: [operationRow(existing)] });
    client.query.mockImplementation(async (statement) => {
      if (statement.includes("INSERT INTO pacs_transfer_operations")) {
        return { rows: [], rowCount: 0 };
      }
      if (statement.includes("FROM pacs_transfer_operations")) {
        return { rows: [operationRow(existing)], rowCount: 1 };
      }
      return { rows: [], rowCount: null };
    });
    await expect(
      new PostgresPacsTransferOperationRepository(client).createIdempotently({
        operation: candidate,
        correlationId: ids.correlation,
      }),
    ).rejects.toBeInstanceOf(PacsTransferOperationConflictError);
  });

  it("rolls a state mutation back to its savepoint when Audit fails", async () => {
    const current = createOperation().transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(createdAt.getTime() + 1),
    });
    const next = current.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(createdAt.getTime() + 2),
    });
    const { client, queries } = dbHarness({
      updatedRows: [operationRow(next)],
      auditFailure: true,
    });
    const repository = new PostgresPacsTransferOperationRepository(client);

    await expect(
      repository.transition({
        current,
        next,
        correlationId: ids.correlation,
      }),
    ).rejects.toBeInstanceOf(PacsTransferOperationPersistenceError);
    expect(queries.some((query) => query.statement.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });

  it("rejects stale compare-and-set state versions", async () => {
    const current = createOperation().transitionTo({
      nextState: "PREFLIGHT_PASSED",
      now: new Date(createdAt.getTime() + 1),
    });
    const next = current.transitionTo({
      nextState: "STOW_STARTED",
      now: new Date(createdAt.getTime() + 2),
    });
    const { client } = dbHarness();

    await expect(
      new PostgresPacsTransferOperationRepository(client).transition({
        current,
        next,
        correlationId: ids.correlation,
      }),
    ).rejects.toBeInstanceOf(PacsTransferOperationConcurrencyError);
  });
});
