import { describe, expect, it } from "vitest";
import {
  InvalidTransferGrantError,
  TransferGrant,
  p0TransferGrantScopes,
  transferGrantStatuses,
} from "../../services/api/dist/grant/domain/transfer-grant.js";

const grantId = "60000000-0000-4000-8000-000000000001";
const sessionId = "60000000-0000-4000-8000-000000000002";
const consentId = "60000000-0000-4000-8000-000000000003";
const tenantId = "60000000-0000-4000-8000-000000000004";
const hospitalId = "60000000-0000-4000-8000-000000000005";
const actorId = "60000000-0000-4000-8000-000000000006";
const packageId = "60000000-0000-4000-8000-000000000007";
const issuedAt = new Date("2026-10-01T00:00:00.000Z");
const expiresAt = new Date("2026-10-01T01:00:00.000Z");

function snapshot(overrides = {}) {
  return {
    grantId,
    exchangeSessionId: sessionId,
    consentId,
    recipientTenantId: tenantId,
    recipientHospitalId: hospitalId,
    recipientActorId: actorId,
    imagingPackageId: packageId,
    scopes: ["study:view"],
    status: "ACTIVE",
    issuedAt,
    expiresAt,
    revokedAt: null,
    createdAt: issuedAt,
    ...overrides,
  };
}

function reconstitute(overrides = {}) {
  return TransferGrant.reconstitute(snapshot(overrides));
}

function issue(overrides = {}) {
  return TransferGrant.issue({
    exchangeSessionId: sessionId,
    consentId,
    recipientTenantId: tenantId,
    recipientHospitalId: hospitalId,
    recipientActorId: actorId,
    imagingPackageId: packageId,
    scopes: ["study:view"],
    expiresAt,
    now: issuedAt,
    ...overrides,
  });
}

describe("TransferGrant domain", () => {
  it("TC-GRT-001-DOM-001 creates fresh ACTIVE metadata without authorizing access", () => {
    const first = issue();
    const second = issue();

    expect(first.grantId).not.toBe(second.grantId);
    expect(first.status).toBe("ACTIVE");
    expect(first.exchangeSessionId).toBe(sessionId);
    expect(first.consentId).toBe(consentId);
    expect(first.recipientTenantId).toBe(tenantId);
    expect(first.recipientHospitalId).toBe(hospitalId);
    expect(first.recipientActorId).toBe(actorId);
    expect(first.imagingPackageId).toBe(packageId);
    expect(first.scopes).toEqual(["study:view"]);
    expect(first.issuedAt).toEqual(issuedAt);
    expect(first.expiresAt).toEqual(expiresAt);
    expect(first.revokedAt).toBeNull();
    expect(first.createdAt).toEqual(issuedAt);
    expect(first.toSnapshot().status).toBe("ACTIVE");
    expect(typeof first.authorize).toBe("undefined");
  });

  it("TC-GRT-001-DOM-002 preserves optional bindings and canonicalizes UUIDs", () => {
    const grant = reconstitute({
      grantId: grantId.toUpperCase(),
      exchangeSessionId: sessionId.toUpperCase(),
      consentId: consentId.toUpperCase(),
      recipientTenantId: tenantId.toUpperCase(),
      recipientHospitalId: hospitalId.toUpperCase(),
      recipientActorId: null,
      imagingPackageId: null,
    });

    expect(grant.grantId).toBe(grantId);
    expect(grant.exchangeSessionId).toBe(sessionId);
    expect(grant.consentId).toBe(consentId);
    expect(grant.recipientTenantId).toBe(tenantId);
    expect(grant.recipientHospitalId).toBe(hospitalId);
    expect(grant.recipientActorId).toBeNull();
    expect(grant.imagingPackageId).toBeNull();
    expect(grant.toSnapshot().recipientActorId).toBeNull();
    expect(grant.toSnapshot().imagingPackageId).toBeNull();
  });

  it.each(transferGrantStatuses)(
    "TC-GRT-001-DOM-003 recognizes persisted status %s without promoting it to access",
    (status) => {
      const revokedAt =
        status === "REVOKED"
          ? new Date(issuedAt.getTime() + 1_000)
          : null;
      const grant = reconstitute({ status, revokedAt });

      expect(grant.status).toBe(status);
      expect(grant.isTemporallyActiveAt(new Date(issuedAt.getTime() + 2_000)))
        .toBe(status === "ACTIVE");
    },
  );

  it.each([
    ["grantId", "not-a-uuid"],
    ["exchangeSessionId", "not-a-uuid"],
    ["consentId", "not-a-uuid"],
    ["recipientTenantId", "not-a-uuid"],
    ["recipientHospitalId", "not-a-uuid"],
    ["recipientActorId", "not-a-uuid"],
    ["imagingPackageId", "not-a-uuid"],
  ])("TC-GRT-001-DOM-004 rejects malformed %s", (field, value) => {
    expect(() => reconstitute({ [field]: value })).toThrow(
      InvalidTransferGrantError,
    );
  });

  it("TC-GRT-001-DOM-005 accepts only a non-empty unique P0 scope set", () => {
    const grant = reconstitute({
      scopes: ["study:download", "study:pacs-transfer", "study:view"],
    });
    expect(grant.scopes).toEqual([
      "study:download",
      "study:pacs-transfer",
      "study:view",
    ]);
    expect(Object.isFrozen(p0TransferGrantScopes)).toBe(true);

    for (const scopes of [
      [],
      ["study:view", "study:view"],
      ["study:unknown"],
      ["study:mobile-export"],
    ]) {
      expect(() => reconstitute({ scopes })).toThrow(InvalidTransferGrantError);
    }
  });

  it("TC-GRT-001-DOM-006 rejects invalid timestamps and non-positive lifetimes", () => {
    expect(() => reconstitute({ issuedAt: "2026-10-01" })).toThrow(
      InvalidTransferGrantError,
    );
    expect(() => reconstitute({ issuedAt: new Date(Number.NaN) })).toThrow(
      InvalidTransferGrantError,
    );
    expect(() => reconstitute({ createdAt: new Date(Number.NaN) })).toThrow(
      InvalidTransferGrantError,
    );
    expect(() => reconstitute({ expiresAt: issuedAt })).toThrow(
      InvalidTransferGrantError,
    );
    expect(
      () => reconstitute({ expiresAt: new Date(issuedAt.getTime() - 1) }),
    ).toThrow(InvalidTransferGrantError);
  });

  it("TC-GRT-001-DOM-007 enforces revokedAt/status consistency", () => {
    expect(() => reconstitute({ status: "REVOKED", revokedAt: null })).toThrow(
      InvalidTransferGrantError,
    );
    expect(
      () =>
        reconstitute({
          status: "REVOKED",
          revokedAt: new Date(issuedAt.getTime() - 1),
        }),
    ).toThrow(InvalidTransferGrantError);
    expect(
      () =>
        reconstitute({
          status: "ACTIVE",
          revokedAt: new Date(issuedAt.getTime() + 1),
        }),
    ).toThrow(InvalidTransferGrantError);
    expect(() => reconstitute({ status: "EXPIRED", revokedAt: issuedAt }))
      .toThrow(InvalidTransferGrantError);
    expect(() => reconstitute({ status: "PENDING" })).toThrow(
      InvalidTransferGrantError,
    );
  });

  it("TC-GRT-001-DOM-008 uses an inclusive issue and exclusive expiry bound", () => {
    const grant = reconstitute();

    expect(grant.isTemporallyActiveAt(issuedAt)).toBe(true);
    expect(
      grant.isTemporallyActiveAt(new Date(issuedAt.getTime() - 1)),
    ).toBe(false);
    expect(grant.isTemporallyActiveAt(expiresAt)).toBe(false);
    expect(
      grant.isTemporallyActiveAt(new Date(expiresAt.getTime() + 1)),
    ).toBe(false);
    expect(grant.isTemporallyActiveAt(new Date(Number.NaN))).toBe(false);
  });

  it("TC-GRT-001-DOM-009 revokes ACTIVE immutably and rejects invalid transitions", () => {
    const active = reconstitute();
    const revokedAt = new Date(issuedAt.getTime() + 2_000);
    const revoked = active.revoke(revokedAt);

    expect(revoked).not.toBe(active);
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).toEqual(revokedAt);
    expect(revoked.grantId).toBe(active.grantId);
    expect(revoked.scopes).toEqual(active.scopes);
    expect(active.status).toBe("ACTIVE");
    expect(active.revokedAt).toBeNull();

    expect(() => active.revoke(new Date(issuedAt.getTime() - 1))).toThrow(
      InvalidTransferGrantError,
    );
    expect(() => active.revoke(new Date(Number.NaN))).toThrow(
      InvalidTransferGrantError,
    );
    for (const status of ["EXPIRED", "REVOKED", "CONSUMED"]) {
      const revokedTime =
        status === "REVOKED" ? new Date(issuedAt.getTime() + 1) : null;
      expect(() => reconstitute({ status, revokedAt: revokedTime }).revoke(revokedAt))
        .toThrow(InvalidTransferGrantError);
    }
  });

  it("TC-GRT-001-DOM-010 exposes only approved metadata and defensive copies", () => {
    const grant = reconstitute();
    const exposed = grant.toSnapshot();

    expect(Object.keys(exposed).sort()).toEqual([
      "consentId",
      "createdAt",
      "exchangeSessionId",
      "expiresAt",
      "grantId",
      "imagingPackageId",
      "issuedAt",
      "recipientActorId",
      "recipientHospitalId",
      "recipientTenantId",
      "revokedAt",
      "scopes",
      "status",
    ]);
    expect(Object.isFrozen(grant)).toBe(true);
    expect(Object.isFrozen(grant.scopes)).toBe(true);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(Object.isFrozen(exposed.scopes)).toBe(true);

    exposed.issuedAt.setUTCFullYear(2000);
    exposed.expiresAt.setUTCFullYear(2000);
    exposed.createdAt.setUTCFullYear(2000);
    expect(grant.issuedAt).toEqual(issuedAt);
    expect(grant.expiresAt).toEqual(expiresAt);
    expect(grant.createdAt).toEqual(issuedAt);
    expect(exposed).not.toHaveProperty("dicomPayload");
    expect(exposed).not.toHaveProperty("dek");
    expect(exposed).not.toHaveProperty("kek");
    expect(exposed).not.toHaveProperty("password");
    expect(exposed).not.toHaveProperty("privateKey");
    expect(exposed).not.toHaveProperty("secret");
  });
});
