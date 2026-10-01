import { describe, expect, it, vi } from "vitest";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { ResolvedObjectAuthorizationPolicy } from "../../services/api/dist/authorization/application/resolved-object-authorization.policy.js";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";

const NOW = new Date("2026-09-30T03:00:00.000Z");
const IDS = {
  actor: "03000000-0000-4000-8000-000000000002",
  tenant: "01000000-0000-4000-8000-000000000002",
  hospitalSource: "04000000-0000-4000-8000-000000000001",
  hospitalDestination: "04000000-0000-4000-8000-000000000002",
  session: "25000000-0000-4000-8000-000000000002",
  patient: "02000000-0000-4000-8000-000000000002",
  consent: "26000000-0000-4000-8000-000000000002",
  grant: "27000000-0000-4000-8000-000000000002",
  package: "29000000-0000-4000-8000-000000000002",
  study: "28000000-0000-4000-8000-000000000002",
  other: "2a000000-0000-4000-8000-000000000002",
};

function context({ action = "VIEW", resourceKind = "STUDY", resourceId = IDS.study, ...identity } = {}) {
  return AuthorizationContext.create({
    identity: {
      issuer: "https://issuer.synthetic.test",
      subject: "synthetic-destination-user",
      actorId: IDS.actor,
      tenantId: IDS.tenant,
      hospitalId: IDS.hospitalDestination,
      actorType: "USER",
      ...identity,
    },
    exchangeSessionId: IDS.session,
    resource: { kind: resourceKind, id: resourceId },
    action,
    consentId: IDS.consent,
    grantId: IDS.grant,
  });
}

function facts({ action = "VIEW", scope = "study:view" } = {}) {
  return {
    exchangeSession: {
      sessionId: IDS.session,
      patientRefId: IDS.patient,
      sourceHospitalId: IDS.hospitalSource,
      destinationHospitalId: IDS.hospitalDestination,
      state: "AUTHORIZED",
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    consent: {
      consentId: IDS.consent,
      exchangeSessionId: IDS.session,
      patientRefId: IDS.patient,
      sourceHospitalId: IDS.hospitalSource,
      destinationHospitalId: IDS.hospitalDestination,
      imagingPackageId: null,
      status: "ACTIVE",
      issuedAt: new Date("2026-09-29T00:00:00.000Z"),
      expiresAt: null,
      withdrawnAt: null,
      allowedActions: [action],
    },
    transferGrant: {
      grantId: IDS.grant,
      exchangeSessionId: IDS.session,
      consentId: IDS.consent,
      recipientTenantId: IDS.tenant,
      recipientHospitalId: IDS.hospitalDestination,
      recipientActorId: null,
      imagingPackageId: IDS.package,
      status: "ACTIVE",
      issuedAt: new Date("2026-09-29T00:00:00.000Z"),
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      revokedAt: null,
      scopes: [scope],
    },
    resourceBinding: {
      kind: "STUDY",
      resourceId: IDS.study,
      studyRefId: IDS.study,
      exchangeSessionId: IDS.session,
      patientRefId: IDS.patient,
      sourceHospitalId: IDS.hospitalSource,
      imagingPackageId: IDS.package,
      packageState: "AVAILABLE",
      retentionExpiresAt: null,
      deletedAt: null,
    },
  };
}

async function evaluate(evidence, requestContext = context(), options = {}) {
  const reader = options.reader ?? {
    resolve: vi.fn().mockResolvedValue(evidence),
  };
  const transactionClient = options.transactionClient ?? { query: vi.fn() };
  const policy = new ResolvedObjectAuthorizationPolicy(
    reader,
    options.clock ?? (() => new Date(NOW)),
  );
  const engine = new AuthorizationEngine(policy);
  return {
    result: await engine.evaluate(requestContext, { transactionClient }),
    reader,
    transactionClient,
  };
}

describe("P0 object-level authorization policy", () => {
  it.each([
    ["VIEW", "study:view"],
    ["DOWNLOAD", "study:download"],
    ["PACS_IMPORT", "study:pacs-transfer"],
  ])("allows only the exact %s action/scope pair", async (action, scope) => {
    const request = context({ action });
    const result = await evaluate(facts({ action, scope }), request);
    expect(result.result).toBe("ALLOW");
    expect(result.reader.resolve).toHaveBeenCalledExactlyOnceWith(
      request,
      result.transactionClient,
    );
  });

  it.each([null, undefined, {}, { exchangeSession: facts().exchangeSession }])(
    "denies absent or incomplete evidence %#",
    async (evidence) => {
      await expect(evaluate(evidence)).resolves.toMatchObject({ result: "DENY" });
    },
  );

  it("does not resolve evidence for a forged or structural Context", async () => {
    const reader = { resolve: vi.fn().mockResolvedValue(facts()) };
    const invalidContext = { ...context() };
    const result = await evaluate(facts(), invalidContext, { reader });
    expect(result.result).toBe("DENY");
    expect(reader.resolve).not.toHaveBeenCalled();
  });

  it("denies without a request-scoped database transaction", async () => {
    const reader = { resolve: vi.fn().mockResolvedValue(facts()) };
    const policy = new ResolvedObjectAuthorizationPolicy(reader, () => new Date(NOW));
    await expect(policy.evaluate(context())).resolves.toBe("DENY");
    expect(reader.resolve).not.toHaveBeenCalled();
  });

  it("denies if transaction scope access throws", async () => {
    const reader = { resolve: vi.fn().mockResolvedValue(facts()) };
    const policy = new ResolvedObjectAuthorizationPolicy(reader, () => new Date(NOW));
    const throwingScope = Object.defineProperty({}, "transactionClient", {
      get() {
        throw new Error("synthetic transaction scope detail");
      },
    });
    await expect(policy.evaluate(context(), throwingScope)).resolves.toBe("DENY");
    expect(reader.resolve).not.toHaveBeenCalled();
  });

  it("denies when the evidence reader returns no record", async () => {
    const result = await evaluate(null);
    expect(result.result).toBe("DENY");
  });

  it("denies if the reader rejects or evidence access throws", async () => {
    const rejectingReader = {
      resolve: vi.fn().mockRejectedValue(new Error("synthetic database detail")),
    };
    await expect(
      evaluate(facts(), context(), { reader: rejectingReader }),
    ).resolves.toMatchObject({ result: "DENY" });

    const throwingEvidence = Object.defineProperty(facts(), "consent", {
      get() {
        throw new Error("synthetic evidence detail");
      },
    });
    await expect(evaluate(throwingEvidence)).resolves.toMatchObject({ result: "DENY" });
  });

  it.each([
    ["context Session", (f) => { f.exchangeSession.sessionId = IDS.other; }],
    ["consent Session", (f) => { f.consent.exchangeSessionId = IDS.other; }],
    ["grant Session", (f) => { f.transferGrant.exchangeSessionId = IDS.other; }],
    ["resource Session", (f) => { f.resourceBinding.exchangeSessionId = IDS.other; }],
    ["consent patient", (f) => { f.consent.patientRefId = IDS.other; }],
    ["resource patient", (f) => { f.resourceBinding.patientRefId = IDS.other; }],
    ["consent source hospital", (f) => { f.consent.sourceHospitalId = IDS.other; }],
    ["resource source hospital", (f) => { f.resourceBinding.sourceHospitalId = IDS.other; }],
    ["consent destination", (f) => { f.consent.destinationHospitalId = IDS.other; }],
    ["context destination", (f) => { f.exchangeSession.destinationHospitalId = IDS.other; }],
  ])("denies a Session/Patient/Hospital binding mismatch: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    const result = await evaluate(evidence);
    expect(result.result).toBe("DENY");
  });

  it.each(["REQUESTED", "CONSENT_PENDING", "CONSENTED", "COMPLETED", "REVOKED", "UNKNOWN"])(
    "denies Session state %s",
    async (state) => {
      const evidence = facts();
      evidence.exchangeSession.state = state;
      expect((await evaluate(evidence)).result).toBe("DENY");
    },
  );

  it.each([
    ["expired", new Date("2026-09-30T02:59:59.999Z")],
    ["malformed", "not-a-date"],
    ["missing", undefined],
  ])("denies Session expiry %s", async (_label, expiresAt) => {
    const evidence = facts();
    evidence.exchangeSession.expiresAt = expiresAt;
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it.each([
    ["wrong ID", (f) => { f.consent.consentId = IDS.other; }],
    ["inactive status", (f) => { f.consent.status = "PENDING"; }],
    ["missing issuedAt", (f) => { f.consent.issuedAt = null; }],
    ["future issuedAt", (f) => { f.consent.issuedAt = new Date("2026-10-01T00:00:00.000Z"); }],
    ["withdrawn", (f) => { f.consent.withdrawnAt = new Date("2026-09-30T02:00:00.000Z"); }],
    ["expired", (f) => { f.consent.expiresAt = new Date("2026-09-30T02:59:59.999Z"); }],
    ["malformed expiry", (f) => { f.consent.expiresAt = "unknown"; }],
  ])("denies invalid Consent: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("accepts an ACTIVE Consent with no scheduled expiry only while unwithdrawn", async () => {
    expect((await evaluate(facts())).result).toBe("ALLOW");
  });

  it.each([
    ["no requested action", (f) => { f.consent.allowedActions = []; }],
    ["unsupported action value", (f) => { f.consent.allowedActions = ["VIEW", "ADMIN"]; }],
    ["P1 MOBILE_EXPORT mixed with a requested P0 action", (f) => { f.consent.allowedActions = ["VIEW", "MOBILE_EXPORT"]; }],
    ["duplicate action", (f) => { f.consent.allowedActions = ["VIEW", "VIEW"]; }],
    ["wrong package", (f) => { f.consent.imagingPackageId = IDS.other; }],
  ])("denies Consent Action/Package mismatch: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it.each([
    ["wrong ID", (f) => { f.transferGrant.grantId = IDS.other; }],
    ["wrong Consent", (f) => { f.transferGrant.consentId = IDS.other; }],
    ["inactive status", (f) => { f.transferGrant.status = "REVOKED"; }],
    ["revoked timestamp", (f) => { f.transferGrant.revokedAt = new Date("2026-09-30T02:00:00.000Z"); }],
    ["future issuedAt", (f) => { f.transferGrant.issuedAt = new Date("2026-10-01T00:00:00.000Z"); }],
    ["missing issuedAt", (f) => { f.transferGrant.issuedAt = null; }],
    ["expired at boundary", (f) => { f.transferGrant.expiresAt = new Date(NOW); }],
    ["expiry before issue", (f) => { f.transferGrant.expiresAt = new Date("2026-09-28T00:00:00.000Z"); }],
    ["malformed expiry", (f) => { f.transferGrant.expiresAt = "unknown"; }],
  ])("denies invalid TransferGrant: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it.each([
    ["wrong Tenant", (f) => { f.transferGrant.recipientTenantId = IDS.other; }],
    ["wrong Hospital", (f) => { f.transferGrant.recipientHospitalId = IDS.other; }],
    ["wrong specific Actor", (f) => { f.transferGrant.recipientActorId = IDS.other; }],
  ])("denies recipient mismatch: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence, context())).result).toBe("DENY");
  });

  it.each([
    ["wrong Tenant", { tenantId: IDS.other }],
    ["wrong Hospital", { hospitalId: IDS.hospitalSource }],
    ["missing Hospital", { hospitalId: null }],
  ])("denies verified-context recipient mismatch: %s", async (_label, identity) => {
    expect((await evaluate(facts(), context(identity))).result).toBe("DENY");
  });

  it("allows a hospital-scoped grant only to a member of its exact Hospital", async () => {
    expect((await evaluate(facts(), context())).result).toBe("ALLOW");
    const request = context({ hospitalId: IDS.hospitalSource });
    expect((await evaluate(facts(), request)).result).toBe("DENY");
  });

  it.each([
    ["wrong action scope", "study:download"],
    ["P1 mobile scope", "study:mobile-export"],
    ["unknown scope", "study:admin"],
  ])("denies absent or unsupported Grant scope: %s", async (_label, scope) => {
    const evidence = facts();
    evidence.transferGrant.scopes = [scope];
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("requires every Grant scope to be contained in Consent actions", async () => {
    const evidence = facts();
    evidence.transferGrant.scopes = ["study:view", "study:download"];
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("denies duplicate Grant scopes", async () => {
    const evidence = facts();
    evidence.transferGrant.scopes = ["study:view", "study:view"];
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it.each([
    ["VIEW", "study:view"],
    ["DOWNLOAD", "study:download"],
    ["PACS_IMPORT", "study:pacs-transfer"],
  ])("enforces the Consent Action for %s", async (action, scope) => {
    const evidence = facts({ action, scope });
    const request = context({ action });
    evidence.consent.allowedActions = [];
    expect((await evaluate(evidence, request)).result).toBe("DENY");
  });

  it.each([
    ["resource ID", (f) => { f.resourceBinding.resourceId = IDS.other; }],
    ["resource kind", (f) => { f.resourceBinding.kind = "SERIES"; }],
    ["study ID for Study", (f) => { f.resourceBinding.studyRefId = IDS.other; }],
    ["unresolved parent", (f) => { f.resourceBinding.studyRefId = "invalid"; }],
    ["package ID", (f) => { f.resourceBinding.imagingPackageId = IDS.other; }],
  ])("denies unbound Resource: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it.each(["REGISTERED", "SESSION_COMPLETE", "RETENTION_PENDING", "DELETED", "FAILED", "UNKNOWN"])(
    "denies Package state %s",
    async (packageState) => {
      const evidence = facts();
      evidence.resourceBinding.packageState = packageState;
      expect((await evaluate(evidence)).result).toBe("DENY");
    },
  );

  it.each([
    ["deleted", (f) => { f.resourceBinding.deletedAt = new Date(NOW); }],
    ["retention expired", (f) => { f.resourceBinding.retentionExpiresAt = new Date(NOW); }],
    ["malformed retention", (f) => { f.resourceBinding.retentionExpiresAt = "unknown"; }],
  ])("denies unavailable Package lifecycle: %s", async (_label, mutate) => {
    const evidence = structuredClone(facts());
    mutate(evidence);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("allows a SERIES or INSTANCE only when its exact parent Study is resolved", async () => {
    for (const kind of ["SERIES", "INSTANCE"]) {
      const resourceId = IDS.other;
      const request = context({ resourceKind: kind, resourceId });
      const evidence = facts();
      evidence.resourceBinding.kind = kind;
      evidence.resourceBinding.resourceId = resourceId;
      evidence.resourceBinding.studyRefId = IDS.study;
      expect((await evaluate(evidence, request)).result).toBe("ALLOW");
    }
  });

  it("denies a null or mismatched package-scoped Grant", async () => {
    const unscoped = facts();
    unscoped.transferGrant.imagingPackageId = null;
    expect((await evaluate(unscoped)).result).toBe("DENY");

    const wrongPackage = facts();
    wrongPackage.transferGrant.imagingPackageId = IDS.other;
    expect((await evaluate(wrongPackage)).result).toBe("DENY");
  });

  it("allows session-level Consent only when the Grant narrows to the exact Package", async () => {
    const evidence = facts();
    evidence.consent.imagingPackageId = null;
    evidence.transferGrant.imagingPackageId = IDS.package;
    expect((await evaluate(evidence)).result).toBe("ALLOW");
  });

  it("allows a Package-specific Consent only for that exact Package", async () => {
    const evidence = facts();
    evidence.consent.imagingPackageId = IDS.package;
    expect((await evaluate(evidence)).result).toBe("ALLOW");

    evidence.consent.imagingPackageId = IDS.other;
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("keeps P1 MOBILE_EXPORT outside the P0 Authorization Context actions", () => {
    expect(() => context({ action: "MOBILE_EXPORT" })).toThrow(
      "AUTHORIZATION_CONTEXT_INVALID",
    );
  });

  it("denies if the authorization clock is invalid", async () => {
    const result = await evaluate(facts(), context(), { clock: () => new Date(Number.NaN) });
    expect(result.result).toBe("DENY");
  });
});

describe("MEDIQ-GRT-005 Grant scope enforcement Acceptance", () => {
  it("TC-GRT-005-AUTH-001 allows only the exact VIEW/study:view pair", async () => {
    expect((await evaluate(facts({ action: "VIEW", scope: "study:view" }), context({ action: "VIEW" }))).result).toBe("ALLOW");
  });

  it("TC-GRT-005-AUTH-002 allows only the exact DOWNLOAD/study:download pair", async () => {
    expect((await evaluate(facts({ action: "DOWNLOAD", scope: "study:download" }), context({ action: "DOWNLOAD" }))).result).toBe("ALLOW");
  });

  it("TC-GRT-005-AUTH-003 allows only the exact PACS_IMPORT/study:pacs-transfer pair without invoking an import", async () => {
    const result = await evaluate(facts({ action: "PACS_IMPORT", scope: "study:pacs-transfer" }), context({ action: "PACS_IMPORT" }));
    expect(result.result).toBe("ALLOW");
    expect(result.reader.resolve).toHaveBeenCalledOnce();
  });

  it("TC-GRT-005-AUTH-004 denies cross-action scope coercion", async () => {
    for (const [action, scope] of [["DOWNLOAD", "study:view"], ["PACS_IMPORT", "study:view"], ["VIEW", "study:download"]]) {
      expect((await evaluate(facts({ action, scope }), context({ action }))).result).toBe("DENY");
    }
  });

  it("TC-GRT-005-AUTH-005 denies when the required action scope is absent", async () => {
    for (const action of ["VIEW", "DOWNLOAD", "PACS_IMPORT"]) {
      const evidence = facts({ action });
      evidence.transferGrant.scopes = [];
      expect((await evaluate(evidence, context({ action }))).result).toBe("DENY");
    }
  });

  it("TC-GRT-005-AUTH-006 denies duplicate, unsupported, unknown and P1 scopes", async () => {
    for (const scopes of [["study:view", "study:view"], ["study:admin"], ["study:mobile-export"], ["study:view", "study:admin"]]) {
      const evidence = facts();
      evidence.transferGrant.scopes = scopes;
      expect((await evaluate(evidence)).result).toBe("DENY");
    }
  });

  it("TC-GRT-005-AUTH-007 denies Grant expansion beyond Consent and missing requested Consent action", async () => {
    const expanded = facts();
    expanded.transferGrant.scopes = ["study:view", "study:download"];
    expect((await evaluate(expanded)).result).toBe("DENY");

    const missingAction = facts({ action: "DOWNLOAD", scope: "study:download" });
    missingAction.consent.allowedActions = ["VIEW"];
    expect((await evaluate(missingAction, context({ action: "DOWNLOAD" }))).result).toBe("DENY");
  });

  it("TC-GRT-005-AUTH-008 fails closed on malformed/missing scope evidence and resolver errors", async () => {
    const malformed = facts();
    malformed.transferGrant.scopes = null;
    expect((await evaluate(malformed)).result).toBe("DENY");
    expect((await evaluate({ ...facts(), transferGrant: null })).result).toBe("DENY");

    const reader = { resolve: vi.fn().mockRejectedValue(new Error("synthetic resolver failure")) };
    expect((await evaluate(facts(), context(), { reader })).result).toBe("DENY");
  });
});

describe("MEDIQ-GRT-007 TransferGrant expiration Acceptance", () => {
  it("TC-GRT-007-EXP-001 allows the inclusive issuedAt boundary", async () => {
    const evidence = facts();
    evidence.transferGrant.issuedAt = new Date(NOW);
    expect((await evaluate(evidence)).result).toBe("ALLOW");
  });

  it("TC-GRT-007-EXP-002 denies a Grant issued in the future", async () => {
    const evidence = facts();
    evidence.transferGrant.issuedAt = new Date(NOW.getTime() + 1);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("TC-GRT-007-EXP-003 denies at the exact exclusive expiresAt boundary", async () => {
    const evidence = facts();
    evidence.transferGrant.expiresAt = new Date(NOW);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("TC-GRT-007-EXP-004 denies an expired Grant even if persisted status is ACTIVE", async () => {
    const evidence = facts();
    evidence.transferGrant.expiresAt = new Date(NOW.getTime() - 1);
    expect((await evaluate(evidence)).result).toBe("DENY");
  });

  it("TC-GRT-007-EXP-005 denies missing, malformed and non-positive intervals", async () => {
    const missingIssue = facts();
    missingIssue.transferGrant.issuedAt = null;
    const missingExpiry = facts();
    missingExpiry.transferGrant.expiresAt = null;
    const invalidDate = facts();
    invalidDate.transferGrant.expiresAt = new Date(Number.NaN);
    const nonPositiveInterval = facts();
    nonPositiveInterval.transferGrant.issuedAt = new Date(NOW);
    nonPositiveInterval.transferGrant.expiresAt = new Date(NOW);

    for (const evidence of [missingIssue, missingExpiry, invalidDate, nonPositiveInterval]) {
      expect((await evaluate(evidence)).result).toBe("DENY");
    }
  });

  it("TC-GRT-007-EXP-006 denies terminal or revoked Grant status despite future expiry", async () => {
    for (const status of ["EXPIRED", "REVOKED", "CONSUMED"]) {
      const evidence = facts();
      evidence.transferGrant.status = status;
      if (status === "REVOKED") evidence.transferGrant.revokedAt = new Date(NOW.getTime() - 1);
      expect((await evaluate(evidence)).result).toBe("DENY");
    }
  });

  it("TC-GRT-007-EXP-007 denies expired/terminal Consent or Session with a future Grant expiry", async () => {
    const mutations = [
      (evidence) => { evidence.exchangeSession.expiresAt = new Date(NOW); },
      (evidence) => { evidence.exchangeSession.state = "COMPLETED"; },
      (evidence) => { evidence.consent.expiresAt = new Date(NOW); },
      (evidence) => { evidence.consent.status = "WITHDRAWN"; },
    ];
    for (const mutate of mutations) {
      const evidence = facts();
      mutate(evidence);
      expect((await evaluate(evidence)).result).toBe("DENY");
    }
  });
});
