import { describe, expect, it, vi } from "vitest";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../services/api/dist/identity/identity-context.types.js";

const issuer = "https://identity.example.test/issuer";
const tenantA = "ab000000-0000-4000-8000-000000000001";
const tenantAUppercase = tenantA.toUpperCase();
const principal = Object.freeze({ issuer, subject: "synthetic-subject-iam002" });
const membership = {
  actorId: "03000000-0000-4000-8000-000000000001",
  tenantId: tenantA,
  hospitalId: "04000000-0000-4000-8000-000000000001",
  actorType: "USER",
};

function harness({ membershipResult = membership, queryFailureAt, resetFailureAt, registryFailure = false } = {}) {
  const queries = [];
  let transactionNumber = 0;
  let resets = 0;
  const client = {
    query: vi.fn(async (queryConfig, values) => {
      const text = typeof queryConfig === "string" ? queryConfig : queryConfig.text;
      queries.push({ text, values, queryConfig });
      if (text === "BEGIN") transactionNumber += 1;
      if (text === "RESET mediq.tenant_id") {
        resets += 1;
        if (resets === resetFailureAt) throw new Error("reset failure");
      }
      if (queryFailureAt?.(text, transactionNumber)) throw new Error("database detail");
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const database = { connect: vi.fn(async () => client) };
  const registry = {
    findActiveMembership: vi.fn(async (receivedClient, tenantId, subject) => {
      expect(receivedClient).toBe(client);
      expect(subject).toBe(principal.subject);
      if (registryFailure) throw new Error("database detail");
      return membershipResult ? { ...membershipResult, tenantId } : null;
    }),
  };
  const config = { oidcAuthentication: { issuer, audience: "mediq-api-test", jwksUri: "https://identity.example.test/jwks" } };
  return {
    service: new ActorTenantContextService(config, database, registry),
    client,
    database,
    registry,
    queries,
  };
}

describe("ActorTenantContextService", () => {
  it("denies malformed Tenant selectors or a principal from another issuer before acquiring a connection", async () => {
    const state = harness();
    const work = vi.fn();
    await expect(state.service.run(principal, "not-a-uuid", work)).rejects.toBeInstanceOf(
      ActorTenantContextDeniedError,
    );
    await expect(
      state.service.run({ ...principal, issuer: "https://attacker.example" }, tenantA, work),
    ).rejects.toBeInstanceOf(ActorTenantContextDeniedError);
    expect(state.database.connect).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("resolves registry identity and invokes work only after membership on the same transaction client", async () => {
    const state = harness();
    const work = vi.fn(async (context, client) => {
      expect(client).toBe(state.client);
      expect(Object.isFrozen(context)).toBe(true);
      return `${context.tenantId}:${context.actorId}`;
    });

    const result = await state.service.run(principal, tenantAUppercase, work);

    expect(result).toBe(`${tenantA}:${membership.actorId}`);
    expect(state.registry.findActiveMembership).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
    expect(state.queries.map(({ text }) => text)).toEqual([
      "RESET mediq.tenant_id",
      "BEGIN",
      "SELECT set_config('mediq.tenant_id', $1, true)",
      "COMMIT",
      "RESET mediq.tenant_id",
    ]);
    expect(state.queries[2].values).toEqual([tenantA]);
    const commitQueries = state.queries.filter(({ text }) => text === "COMMIT");
    expect(commitQueries).toHaveLength(1);
    expect(commitQueries[0].queryConfig).toEqual({ text: "COMMIT", query_timeout: 5_000 });
    expect(
      state.queries
        .filter(({ text }) => text !== "COMMIT")
        .every(({ queryConfig }) => typeof queryConfig === "string"),
    ).toBe(true);
    expect(state.client.release).toHaveBeenCalledWith(undefined);
  });

  it("denies unknown or inactive membership without invoking protected work", async () => {
    const state = harness({ membershipResult: null });
    const work = vi.fn();
    await expect(state.service.run(principal, tenantA, work)).rejects.toBeInstanceOf(
      ActorTenantContextDeniedError,
    );
    expect(work).not.toHaveBeenCalled();
    expect(state.queries.map(({ text }) => text)).toContain("ROLLBACK");
    expect(state.client.release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back callback errors and clears transaction-local Tenant state", async () => {
    const state = harness();
    const applicationError = new Error("application failure");
    await expect(
      state.service.run(principal, tenantA, async () => {
        throw applicationError;
      }),
    ).rejects.toBe(applicationError);
    expect(state.queries.map(({ text }) => text)).toContain("ROLLBACK");
    expect(state.queries.at(-1).text).toBe("RESET mediq.tenant_id");
    expect(state.client.release).toHaveBeenCalledWith(undefined);
  });

  it("maps registry database errors to a generic unavailable error and discards the client", async () => {
    const state = harness({ registryFailure: true });
    await expect(state.service.run(principal, tenantA, async () => undefined)).rejects.toMatchObject({
      constructor: ActorTenantContextUnavailableError,
      message: "ACTOR_TENANT_CONTEXT_UNAVAILABLE",
    });
    expect(state.client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("fails closed on COMMIT timeout, attempts rollback where possible, discards the client, and never retries", async () => {
    const state = harness({ queryFailureAt: (text) => text === "COMMIT" });
    const work = vi.fn(async () => "work-result-must-not-escape");

    await expect(state.service.run(principal, tenantA, work)).rejects.toMatchObject({
      constructor: ActorTenantContextUnavailableError,
      message: "ACTOR_TENANT_CONTEXT_UNAVAILABLE",
    });

    expect(work).toHaveBeenCalledOnce();
    expect(state.database.connect).toHaveBeenCalledOnce();
    expect(state.queries.filter(({ text }) => text === "COMMIT")).toHaveLength(1);
    expect(state.queries.map(({ text }) => text)).toEqual([
      "RESET mediq.tenant_id",
      "BEGIN",
      "SELECT set_config('mediq.tenant_id', $1, true)",
      "COMMIT",
      "ROLLBACK",
    ]);
    expect(state.client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("discards a client when transaction setup fails", async () => {
    const state = harness({ queryFailureAt: (text) => text.startsWith("SELECT set_config") });
    const work = vi.fn();
    await expect(state.service.run(principal, tenantA, work)).rejects.toBeInstanceOf(
      ActorTenantContextUnavailableError,
    );
    expect(work).not.toHaveBeenCalled();
    expect(state.client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("discards a client when rollback fails", async () => {
    const state = harness({ queryFailureAt: (text) => text === "ROLLBACK" });
    await expect(
      state.service.run(principal, tenantA, async () => {
        throw new Error("application failure");
      }),
    ).rejects.toThrow("application failure");
    expect(state.client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("discards a client if post-transaction reset fails", async () => {
    const state = harness({ resetFailureAt: 2 });
    await state.service.run(principal, tenantA, async () => "ok");
    expect(state.client.release).toHaveBeenCalledWith(expect.any(Error));
  });
});
