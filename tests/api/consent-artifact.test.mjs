import { describe, expect, it } from "vitest";
import {
  ConsentArtifact,
  consentArtifactStatuses,
  InvalidConsentArtifactError,
  p0ConsentActions,
} from "../../services/api/dist/consent/domain/consent-artifact.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const consentId = "26000000-0000-4000-8000-000000000001";
const sessionId = "25000000-0000-4000-8000-000000000001";
const patientRefId = "22000000-0000-4000-8000-000000000001";
const sourceHospitalId = "04000000-0000-4000-8000-000000000001";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const packageId = "27000000-0000-4000-8000-000000000001";

function createConsent(overrides = {}) {
  return ConsentArtifact.create({
    exchangeSessionId: sessionId,
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    actions: ["VIEW"],
    consentVersion: 1,
    now: fixedNow,
    ...overrides,
  });
}

function snapshot(overrides = {}) {
  return {
    consentId,
    exchangeSessionId: sessionId,
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    imagingPackageId: null,
    actions: ["VIEW"],
    status: "PENDING",
    consentVersion: 1,
    issuedAt: null,
    expiresAt: null,
    withdrawnAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

describe("ConsentArtifact domain", () => {
  it("creates a fresh PENDING artifact without issuing consent or permission", () => {
    const first = createConsent();
    const second = createConsent();

    expect(ConsentArtifact.isValidId(first.consentId)).toBe(true);
    expect(first.consentId).not.toBe(second.consentId);
    expect(first.status).toBe("PENDING");
    expect(first.issuedAt).toBeNull();
    expect(first.withdrawnAt).toBeNull();
    expect(first.consentVersion).toBe(1);
    expect(first.actions).toEqual(["VIEW"]);
    expect(typeof first.approve).toBe("function");
    expect(typeof first.authorize).toBe("undefined");
  });

  it("preserves exact context and normalized UUIDs", () => {
    const consent = createConsent({
      exchangeSessionId: sessionId.toUpperCase(),
      patientRefId: patientRefId.toUpperCase(),
      sourceHospitalId: sourceHospitalId.toUpperCase(),
      destinationHospitalId: destinationHospitalId.toUpperCase(),
      imagingPackageId: packageId.toUpperCase(),
      actions: ["PACS_IMPORT", "VIEW"],
      consentVersion: 7,
    });

    expect(consent.exchangeSessionId).toBe(sessionId);
    expect(consent.patientRefId).toBe(patientRefId);
    expect(consent.sourceHospitalId).toBe(sourceHospitalId);
    expect(consent.destinationHospitalId).toBe(destinationHospitalId);
    expect(consent.imagingPackageId).toBe(packageId);
    expect(consent.actions).toEqual(["PACS_IMPORT", "VIEW"]);
    expect(consent.consentVersion).toBe(7);
  });

  it("approves only an unexpired PENDING artifact as an immutable technical transition", () => {
    const pending = createConsent({ expiresAt: new Date(fixedNow.getTime() + 60_000) });
    const approvalTime = new Date(fixedNow.getTime() + 1_000);
    const approved = pending.approve(approvalTime);

    expect(approved.status).toBe("ACTIVE");
    expect(approved.issuedAt?.toISOString()).toBe(approvalTime.toISOString());
    expect(approved.updatedAt.toISOString()).toBe(approvalTime.toISOString());
    expect(pending.status).toBe("PENDING");
    expect(pending.issuedAt).toBeNull();
    expect(approved).not.toBe(pending);
  });

  it.each([
    ["already active", { status: "ACTIVE", issuedAt: fixedNow }],
    ["expired", { expiresAt: new Date(fixedNow.getTime() - 1) }],
  ])("rejects technical approval when the artifact is %s", (_label, changes) => {
    const consent = ConsentArtifact.reconstitute(snapshot(changes));
    expect(() => consent.approve(fixedNow)).toThrow(InvalidConsentArtifactError);
  });

  it("withdraws ACTIVE Consent immutably even after expiry", () => {
    const issuedAt = new Date(fixedNow.getTime() - 60_000);
    const expiredAt = new Date(fixedNow.getTime() - 1_000);
    const active = ConsentArtifact.reconstitute(snapshot({
      status: "ACTIVE",
      issuedAt,
      expiresAt: expiredAt,
      createdAt: new Date(fixedNow.getTime() - 120_000),
    }));
    const withdrawalTime = new Date(fixedNow.getTime() + 1_000);
    const withdrawn = active.withdraw(withdrawalTime);

    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.issuedAt?.toISOString()).toBe(issuedAt.toISOString());
    expect(withdrawn.withdrawnAt?.toISOString()).toBe(withdrawalTime.toISOString());
    expect(withdrawn.updatedAt.toISOString()).toBe(withdrawalTime.toISOString());
    expect(active.status).toBe("ACTIVE");
    expect(active.withdrawnAt).toBeNull();
  });

  it.each([
    ["pending", { status: "PENDING", issuedAt: null }],
    ["withdrawn", { status: "WITHDRAWN", issuedAt: fixedNow, withdrawnAt: fixedNow }],
    ["expired", { status: "EXPIRED", issuedAt: fixedNow }],
    ["rejected", { status: "REJECTED", issuedAt: null }],
    ["missing issuance", { status: "ACTIVE", issuedAt: null }],
    ["already timestamped", { status: "ACTIVE", issuedAt: fixedNow, withdrawnAt: fixedNow }],
    ["future issuance", { status: "ACTIVE", issuedAt: new Date(fixedNow.getTime() + 1) }],
  ])("rejects withdrawal for %s state", (_label, changes) => {
    const consent = ConsentArtifact.reconstitute(snapshot(changes));
    expect(() => consent.withdraw(fixedNow)).toThrow(InvalidConsentArtifactError);
  });

  it("accepts the full declared P0 action set", () => {
    const consent = createConsent({
      actions: ["VIEW", "DOWNLOAD", "PACS_IMPORT"],
    });

    expect(consent.actions).toEqual(["VIEW", "DOWNLOAD", "PACS_IMPORT"]);
  });

  it("exports frozen P0 action and persisted-status allowlists", () => {
    expect(Object.isFrozen(p0ConsentActions)).toBe(true);
    expect(Object.isFrozen(consentArtifactStatuses)).toBe(true);
  });

  it("accepts null session-level package scope without converting it into access", () => {
    const consent = createConsent({ imagingPackageId: null });

    expect(consent.imagingPackageId).toBeNull();
    expect(consent.status).toBe("PENDING");
    expect(typeof consent.authorize).toBe("undefined");
  });

  it("preserves optional expiry without adding an unapproved chronology rule", () => {
    const expiresAt = new Date("2026-09-29T00:00:00.000Z");
    const consent = createConsent({ expiresAt });

    expect(consent.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });

  it.each(consentArtifactStatuses)("reconstitutes declared status %s", (status) => {
    const consent = ConsentArtifact.reconstitute(snapshot({ status }));

    expect(consent.status).toBe(status);
  });

  it.each([
    ["consentId", "not-a-uuid"],
    ["exchangeSessionId", "not-a-uuid"],
    ["patientRefId", "not-a-uuid"],
    ["sourceHospitalId", "not-a-uuid"],
    ["destinationHospitalId", "not-a-uuid"],
    ["imagingPackageId", "not-a-uuid"],
  ])("rejects malformed %s", (field, value) => {
    expect(() =>
      ConsentArtifact.reconstitute(snapshot({ [field]: value })),
    ).toThrow(InvalidConsentArtifactError);
  });

  it("rejects identical source and destination hospitals", () => {
    expect(() =>
      ConsentArtifact.reconstitute(
        snapshot({ destinationHospitalId: sourceHospitalId }),
      ),
    ).toThrow("CONSENT_ARTIFACT_INVALID");
  });

  it.each([[], null, "VIEW", ["VIEW", "VIEW"], ["READ"], ["MOBILE_EXPORT"]])(
    "rejects invalid P0 action set %#",
    (actions) => {
      expect(() => ConsentArtifact.reconstitute(snapshot({ actions }))).toThrow(
        "CONSENT_ARTIFACT_INVALID",
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid Consent version %#",
    (consentVersion) => {
      expect(() =>
        ConsentArtifact.reconstitute(snapshot({ consentVersion })),
      ).toThrow("CONSENT_ARTIFACT_INVALID");
    },
  );

  it.each(["unknown", null, undefined])("rejects unsupported status %#", (status) => {
    expect(() =>
      ConsentArtifact.reconstitute(snapshot({ status })),
    ).toThrow("CONSENT_ARTIFACT_INVALID");
  });

  it("rejects invalid optional and required timestamps", () => {
    for (const changes of [
      { createdAt: "2026-09-30T00:00:00Z" },
      { updatedAt: new Date(Number.NaN) },
      { issuedAt: "2026-09-30T00:00:00Z" },
      { expiresAt: new Date(Number.NaN) },
      { withdrawnAt: 10 },
    ]) {
      expect(() => ConsentArtifact.reconstitute(snapshot(changes))).toThrow(
        "CONSENT_ARTIFACT_INVALID",
      );
    }
  });

  it("rejects updatedAt before createdAt", () => {
    expect(() =>
      ConsentArtifact.reconstitute(
        snapshot({ updatedAt: new Date("2026-09-29T23:59:59.999Z") }),
      ),
    ).toThrow("CONSENT_ARTIFACT_INVALID");
  });

  it("detaches input dates/actions and returns defensive timestamp copies", () => {
    const createdAt = new Date(fixedNow);
    const updatedAt = new Date(fixedNow);
    const issuedAt = new Date(fixedNow);
    const actions = ["VIEW"];
    const consent = ConsentArtifact.reconstitute(
      snapshot({ createdAt, updatedAt, issuedAt, actions }),
    );

    createdAt.setUTCFullYear(2030);
    updatedAt.setUTCFullYear(2030);
    issuedAt.setUTCFullYear(2030);
    actions.push("DOWNLOAD");
    const returnedCreatedAt = consent.createdAt;
    returnedCreatedAt.setUTCFullYear(2040);

    expect(consent.createdAt.toISOString()).toBe(fixedNow.toISOString());
    expect(consent.updatedAt.toISOString()).toBe(fixedNow.toISOString());
    expect(consent.issuedAt?.toISOString()).toBe(fixedNow.toISOString());
    expect(consent.actions).toEqual(["VIEW"]);
    expect(Object.isFrozen(consent)).toBe(true);
    expect(Object.isFrozen(consent.actions)).toBe(true);
  });
});
