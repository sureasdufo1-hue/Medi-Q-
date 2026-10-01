import { describe, expect, it, vi } from "vitest";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";

describe("ActorRegistryRepository", () => {
  it("queries only exact active Tenant membership with active Tenant and optional active Hospital", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          actor_id: "03000000-0000-4000-8000-000000000001",
          tenant_id: "02000000-0000-4000-8000-000000000001",
          hospital_id: null,
          actor_type: "SERVICE",
        }],
      })),
    };
    const repository = new ActorRegistryRepository();

    const result = await repository.findActiveMembership(
      client,
      "02000000-0000-4000-8000-000000000001",
      "synthetic-subject",
    );

    expect(result).toEqual({
      actorId: "03000000-0000-4000-8000-000000000001",
      tenantId: "02000000-0000-4000-8000-000000000001",
      hospitalId: null,
      actorType: "SERVICE",
    });
    const [sql, parameters] = client.query.mock.calls[0];
    expect(sql).toContain("a.external_subject = $2");
    expect(sql).toContain("a.status = 'ACTIVE'");
    expect(sql).toContain("t.status = 'ACTIVE'");
    expect(sql).toContain("h.status = 'ACTIVE'");
    expect(sql).toContain("a.tenant_id = $1::uuid");
    expect(parameters).toEqual([
      "02000000-0000-4000-8000-000000000001",
      "synthetic-subject",
    ]);
  });

  it("does not return unexpected actor types", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{ actor_id: "x", tenant_id: "y", hospital_id: null, actor_type: "ADMIN" }],
      })),
    };
    await expect(
      new ActorRegistryRepository().findActiveMembership(client, "tenant", "subject"),
    ).resolves.toBeNull();
  });
});
