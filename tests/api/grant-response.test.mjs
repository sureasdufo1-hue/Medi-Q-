import { describe, expect, it, vi } from "vitest";
import { GrantIssueController } from "../../services/api/dist/grant/presentation/grant-issue.controller.js";
import { GrantRevocationController } from "../../services/api/dist/grant/presentation/grant-revocation.controller.js";
import { toGrantResponse } from "../../services/api/dist/grant/presentation/grant-response.js";
import { TransferGrant } from "../../services/api/dist/grant/domain/transfer-grant.js";

const ids = {
  session: "25000000-0000-4000-8000-000000000002",
  consent: "26000000-0000-4000-8000-000000000002",
  tenant: "01000000-0000-4000-8000-000000000002",
  hospital: "04000000-0000-4000-8000-000000000002",
  actor: "03000000-0000-4000-8000-000000000002",
  package: "29000000-0000-4000-8000-000000000002",
};

const now = new Date("2026-10-01T00:00:00.000Z");

function makeGrant(status = "ACTIVE") {
  const revokedAt = status === "REVOKED" ? new Date("2026-10-01T00:01:00.000Z") : null;
  return {
    grantId: "27000000-0000-4000-8000-000000000002",
    exchangeSessionId: ids.session,
    consentId: ids.consent,
    recipientTenantId: ids.tenant,
    recipientHospitalId: ids.hospital,
    recipientActorId: ids.actor,
    imagingPackageId: ids.package,
    scopes: ["study:view"],
    status,
    issuedAt: now,
    expiresAt: new Date("2026-10-01T00:30:00.000Z"),
    revokedAt,
    createdAt: now,
    dicomPayload: "synthetic-forbidden-field",
    dicomUid: "synthetic-forbidden-field",
    dek: "synthetic-forbidden-field",
    kek: "synthetic-forbidden-field",
    password: "synthetic-forbidden-field",
    privateKey: "synthetic-forbidden-field",
    longLivedSecret: "synthetic-forbidden-field",
    futureUnknownField: "synthetic-forbidden-field",
  };
}

const commonResponseFields = [
  "consentId",
  "expiresAt",
  "grantId",
  "imagingPackageId",
  "issuedAt",
  "recipientActorId",
  "recipientHospitalId",
  "recipientTenantId",
  "scopes",
  "sessionId",
  "status",
];

function replyStub() {
  return { header: vi.fn(), status: vi.fn() };
}

describe("MEDIQ-GRT-006 TransferGrant response allowlist", () => {
  it("TC-GRT-006-PAY-001 exposes only approved metadata in the immutable domain snapshot", () => {
    const grant = TransferGrant.issue({
      exchangeSessionId: ids.session,
      consentId: ids.consent,
      recipientTenantId: ids.tenant,
      recipientHospitalId: ids.hospital,
      recipientActorId: ids.actor,
      imagingPackageId: ids.package,
      scopes: ["study:view"],
      expiresAt: new Date("2026-10-01T00:30:00.000Z"),
      now,
    });
    expect(Object.keys(grant.toSnapshot()).sort()).toEqual([
      "consentId", "createdAt", "exchangeSessionId", "expiresAt", "grantId",
      "imagingPackageId", "issuedAt", "recipientActorId", "recipientHospitalId",
      "recipientTenantId", "revokedAt", "scopes", "status",
    ].sort());
  });

  it("TC-GRT-006-PAY-002 serializes issue output as metadata only", async () => {
    const grant = makeGrant("ACTIVE");
    const controller = new GrantIssueController({
      issue: vi.fn().mockResolvedValue({ grant, replayed: false, correlationId: "synthetic-correlation" }),
    });
    const reply = replyStub();
    const output = await controller.issue("session", { query: undefined, headers: {} }, ids.tenant, "synthetic-key", "synthetic-correlation", reply);

    expect(Object.keys(output).sort()).toEqual(commonResponseFields);
    expect(output).toEqual(toGrantResponse(grant));
    expect(output).not.toHaveProperty("dicomPayload");
    expect(output).not.toHaveProperty("dicomUid");
    expect(output).not.toHaveProperty("dek");
    expect(output).not.toHaveProperty("kek");
    expect(output).not.toHaveProperty("password");
    expect(output).not.toHaveProperty("privateKey");
    expect(output).not.toHaveProperty("longLivedSecret");
    expect(output).not.toHaveProperty("futureUnknownField");
  });

  it("TC-GRT-006-PAY-003 serializes revoke output with only approved metadata and revokedAt", async () => {
    const grant = makeGrant("REVOKED");
    const controller = new GrantRevocationController({
      revoke: vi.fn().mockResolvedValue({ grant, replayed: false, correlationId: "synthetic-correlation" }),
    });
    const reply = replyStub();
    const output = await controller.revoke("session", grant.grantId, { query: undefined, body: undefined, headers: {} }, ids.tenant, "synthetic-correlation", reply);

    expect(Object.keys(output).sort()).toEqual([...commonResponseFields, "revokedAt"].sort());
    expect(output).toEqual(toGrantResponse(grant));
    expect(output).not.toHaveProperty("dicomPayload");
    expect(output).not.toHaveProperty("dicomUid");
    expect(output).not.toHaveProperty("dek");
    expect(output).not.toHaveProperty("kek");
    expect(output).not.toHaveProperty("password");
    expect(output).not.toHaveProperty("privateKey");
    expect(output).not.toHaveProperty("longLivedSecret");
    expect(output).not.toHaveProperty("futureUnknownField");
  });

  it("TC-GRT-006-PAY-004 uses the same explicit response mapper for issue and revoke", () => {
    const source = makeGrant("REVOKED");
    const output = toGrantResponse(source);
    expect(Object.keys(output).sort()).toEqual([...commonResponseFields, "revokedAt"].sort());
    expect(output.scopes).not.toBe(source.scopes);
  });
});
