import { describe, expect, it, vi } from "vitest";
import { GrantIssueService } from "../../services/api/dist/grant/application/grant-issue.service.js";
import {
  GrantIssueConflictError,
  GrantIssueDeniedError,
  GrantIssueUnavailableError,
  InvalidGrantIssueRequestError,
} from "../../services/api/dist/grant/application/grant-issue.service.js";

const ids = Object.freeze({
  session: "71000000-0000-4000-8000-000000000001",
  patient: "71000000-0000-4000-8000-000000000002",
  hospitalA: "71000000-0000-4000-8000-000000000003",
  hospitalB: "71000000-0000-4000-8000-000000000004",
  tenantB: "71000000-0000-4000-8000-000000000005",
  actorB: "71000000-0000-4000-8000-000000000006",
  consent: "71000000-0000-4000-8000-000000000007",
  package: "71000000-0000-4000-8000-000000000008",
  key: "71000000-0000-4000-8000-000000000009",
  correlation: "71000000-0000-4000-8000-000000000010",
});

function makeHarness(overrides = {}) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const context = {
    issuer: "https://identity.example.test/issuer",
    subject: "synthetic-grant-requester",
    actorId: ids.actorB,
    tenantId: ids.tenantB,
    hospitalId: ids.hospitalB,
    actorType: "USER",
    ...overrides.context,
  };
  const session = {
    session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: ids.hospitalA,
    destination_hospital_id: ids.hospitalB,
    requester_actor_id: ids.actorB,
    purpose: "Synthetic P0 grant issue",
    state: "CONSENTED",
    created_at: new Date(now.getTime() - 10_000),
    updated_at: new Date(now.getTime() - 5_000),
    expires_at: expiry,
    completed_at: null,
    idempotency_key: "71000000-0000-4000-8000-000000000011",
    ...overrides.session,
  };
  const consent = {
    consent_id: ids.consent,
    exchange_session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: ids.hospitalA,
    destination_hospital_id: ids.hospitalB,
    imaging_package_id: ids.package,
    status: "ACTIVE",
    consent_version: 1,
    issued_at: new Date(now.getTime() - 1_000),
    expires_at: expiry,
    withdrawn_at: null,
    created_at: new Date(now.getTime() - 10_000),
    updated_at: new Date(now.getTime() - 1_000),
    ...overrides.consent,
  };
  const actions = overrides.actions ?? ["VIEW", "DOWNLOAD", "PACS_IMPORT"];
  const pkg = {
    package_id: ids.package,
    exchange_session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: ids.hospitalA,
    state: "AVAILABLE",
    retention_expires_at: expiry,
    deleted_at: null,
    ...overrides.package,
  };
  const stored = new Map();
  const scopes = new Map();
  const audits = [];
  let failAuditAt = overrides.failAuditAt ?? 0;
  let auditCount = 0;

  const database = {
    async query(statement, values = []) {
      if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\s/i.test(statement)) return { rows: [], rowCount: null };
      if (statement.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: null };
      if (statement.includes("FROM exchange_sessions") && statement.includes("WHERE session_id = $1")) {
        return { rows: overrides.missingSession ? [] : [session], rowCount: overrides.missingSession ? 0 : 1 };
      }
      if (statement.includes("FROM consents") && statement.includes("WHERE consent_id = $1")) {
        const found = values[0]?.toLowerCase() === consent.consent_id.toLowerCase();
        return { rows: found && !overrides.missingConsent ? [consent] : [], rowCount: found && !overrides.missingConsent ? 1 : 0 };
      }
      if (statement.includes("FROM consent_actions")) {
        return { rows: actions.map((action, index) => ({ consent_action_id: `71000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`, action })), rowCount: actions.length };
      }
      if (statement.includes("FROM imaging_packages")) {
        return { rows: overrides.missingPackage ? [] : [pkg], rowCount: overrides.missingPackage ? 0 : 1 };
      }
      if (statement.includes("FROM study_references")) {
        return { rows: [{ study_count: overrides.studyCount ?? 1, mismatched_source_count: overrides.mismatchedStudySource ? 1 : 0 }], rowCount: 1 };
      }
      if (statement.includes("FROM transfer_grants") && statement.includes("idempotency_key = $3")) {
        const key = `${values[0]}:${values[1]}:${values[2]}`;
        const row = stored.get(key);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (statement.includes("INSERT INTO transfer_grants")) {
        const row = {
          grant_id: values[0], exchange_session_id: values[1], consent_id: values[2],
          recipient_tenant_id: values[3], recipient_hospital_id: values[4],
          recipient_actor_id: values[5], imaging_package_id: values[6], status: values[8],
          issued_at: values[9], expires_at: values[10], revoked_at: values[11], created_at: values[12],
        };
        stored.set(`${values[3]}:${values[5]}:${values[7]}`, row);
        scopes.set(row.grant_id, []);
        return { rows: [], rowCount: 1 };
      }
      if (statement.includes("INSERT INTO transfer_grant_scopes")) {
        const [scopeId, grantId, scope] = values;
        void scopeId;
        scopes.get(grantId)?.push({ scope });
        return { rows: [], rowCount: 1 };
      }
      if (statement.includes("FROM transfer_grant_scopes")) {
        return { rows: scopes.get(values[0]) ?? [], rowCount: (scopes.get(values[0]) ?? []).length };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        auditCount += 1;
        if (failAuditAt === auditCount) throw new Error("synthetic audit write failure");
        audits.push({ action: values[7], result: values[8], values });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    },
  };

  const actorTenantContext = {
    async run(_principal, _tenantId, work) {
      const storedBefore = new Map(stored);
      const scopesBefore = new Map([...scopes].map(([key, value]) => [key, [...value]]));
      const auditsBefore = audits.length;
      try {
        return await work(context, database);
      } catch (error) {
        stored.clear();
        for (const [key, value] of storedBefore) stored.set(key, value);
        scopes.clear();
        for (const [key, value] of scopesBefore) scopes.set(key, value);
        audits.length = auditsBefore;
        throw error;
      }
    },
  };
  const service = new GrantIssueService(actorTenantContext);
  const request = (body = { consentId: ids.consent, imagingPackageId: ids.package, scopes: ["study:view"] }, extra = {}) => service.issue({
    principal: { issuer: context.issuer, subject: context.subject },
    tenantCandidate: ids.tenantB,
    sessionId: ids.session,
    idempotencyKey: ids.key,
    correlationId: ids.correlation,
    body,
    hasUnexpectedInput: false,
    ...extra,
  });
  return { service, request, context, stored, scopes, audits, now };
}

describe("GrantIssueService", () => {
  it("TC-GRT-007-EXP-008 caps issue expiry at the earliest Session/Consent bound", async () => {
    const start = Date.now();
    const sessionExpiry = new Date(start + 10 * 60 * 1000);
    const consentExpiry = new Date(start + 5 * 60 * 1000);
    const h = makeHarness({
      session: { expires_at: sessionExpiry },
      consent: { expires_at: consentExpiry },
    });
    const result = await h.request();
    expect(result.grant.expiresAt.getTime()).toBe(consentExpiry.getTime());
    expect(result.grant.expiresAt.getTime() - result.grant.issuedAt.getTime()).toBeLessThan(30 * 60 * 1000);
  });

  it("issues an exact actor/package-bound Grant and caps expiry at 30 minutes", async () => {
    const h = makeHarness();
    const result = await h.request();
    expect(result.replayed).toBe(false);
    expect(result.grant.status).toBe("ACTIVE");
    expect(result.grant.recipientTenantId).toBe(ids.tenantB);
    expect(result.grant.recipientHospitalId).toBe(ids.hospitalB);
    expect(result.grant.recipientActorId).toBe(ids.actorB);
    expect(result.grant.imagingPackageId).toBe(ids.package);
    expect(result.grant.scopes).toEqual(["study:view"]);
    expect(result.grant.expiresAt.getTime() - result.grant.issuedAt.getTime()).toBe(30 * 60 * 1000);
    expect(h.audits.map((event) => event.action)).toEqual(["AUTHORIZATION_GRANTED", "GRANT_CREATED"]);
  });

  it.each([
    ["wrong actor", { context: { actorId: "71000000-0000-4000-8000-000000000099" } }],
    ["wrong hospital", { context: { hospitalId: ids.hospitalA } }],
    ["service actor", { context: { actorType: "SERVICE" } }],
    ["tenant-level membership", { context: { hospitalId: null } }],
    ["missing Session", { missingSession: true }],
    ["wrong Session state", { session: { state: "REQUESTED" } }],
    ["expired Session", { session: { expires_at: new Date(Date.now() - 1) } }],
    ["Consent bound to another Session", { consent: { exchange_session_id: "71000000-0000-4000-8000-000000000099" } }],
    ["Consent bound to another Patient", { consent: { patient_ref_id: "71000000-0000-4000-8000-000000000099" } }],
    ["Consent bound to another Source", { consent: { source_hospital_id: "71000000-0000-4000-8000-000000000099" } }],
    ["Consent bound to another Destination", { consent: { destination_hospital_id: "71000000-0000-4000-8000-000000000099" } }],
    ["Consent bound to another Package", { consent: { imaging_package_id: "71000000-0000-4000-8000-000000000099" } }],
    ["missing Consent", { missingConsent: true }],
    ["pending Consent", { consent: { status: "PENDING", issued_at: null } }],
    ["withdrawn Consent", { consent: { status: "WITHDRAWN", withdrawn_at: new Date() } }],
    ["future-issued Consent", { consent: { issued_at: new Date(Date.now() + 60_000) } }],
    ["inactive package", { package: { state: "DELETED" } }],
    ["missing package", { missingPackage: true }],
    ["package bound to another Session", { package: { exchange_session_id: "71000000-0000-4000-8000-000000000099" } }],
    ["package bound to another Patient", { package: { patient_ref_id: "71000000-0000-4000-8000-000000000099" } }],
    ["package from another Source", { package: { source_hospital_id: "71000000-0000-4000-8000-000000000099" } }],
    ["deleted package", { package: { deleted_at: new Date() } }],
    ["expired package retention", { package: { retention_expires_at: new Date(Date.now() - 1) } }],
    ["missing studies", { studyCount: 0 }],
    ["Study from another Source", { mismatchedStudySource: true }],
    ["expired Consent", { consent: { expires_at: new Date(Date.now() - 1) } }],
  ])("denies %s without creating a Grant", async (_name, overrides) => {
    const h = makeHarness(overrides);
    await expect(h.request()).rejects.toBeInstanceOf(GrantIssueDeniedError);
    expect(h.stored.size).toBe(0);
    expect(h.audits.map((event) => event.action)).toEqual(["AUTHORIZATION_DENIED", "GRANT_DENIED"]);
  });

  it("rejects a scope not covered by the Consent without partial writes", async () => {
    const h = makeHarness({ actions: ["VIEW"] });
    await expect(h.request({ consentId: ids.consent, imagingPackageId: ids.package, scopes: ["study:pacs-transfer"] }))
      .rejects.toBeInstanceOf(GrantIssueDeniedError);
    expect(h.stored.size).toBe(0);
    expect(h.audits.map((event) => event.action)).toEqual(["AUTHORIZATION_DENIED", "GRANT_DENIED"]);
  });

  it.each([
    ["VIEW", "study:view"],
    ["DOWNLOAD", "study:download"],
    ["PACS_IMPORT", "study:pacs-transfer"],
  ])("maps Consent action %s only to scope %s", async (action, scope) => {
    const h = makeHarness({ actions: [action] });
    const result = await h.request({ consentId: ids.consent, imagingPackageId: ids.package, scopes: [scope] });
    expect(result.grant.scopes).toEqual([scope]);
  });

  it.each([
    ["empty action snapshot", []],
    ["duplicate action snapshot", ["VIEW", "VIEW"]],
    ["unknown action snapshot", ["UNKNOWN"]],
    ["unsupported P1 action snapshot", ["MOBILE_EXPORT"]],
  ])("fails closed for %s", async (_name, actions) => {
    const h = makeHarness({ actions });
    await expect(h.request()).rejects.toBeInstanceOf(GrantIssueUnavailableError);
    expect(h.stored.size).toBe(0);
    expect(h.audits).toEqual([]);
  });

  it.each([
    ["Session", { session: { expires_at: new Date(Date.now() + 60_000) } }],
    ["Consent", { consent: { expires_at: new Date(Date.now() + 60_000) } }],
  ])("caps Grant expiry at the earlier %s expiry", async (_name, overrides) => {
    const h = makeHarness(overrides);
    const upperBound = overrides.session?.expires_at ?? overrides.consent?.expires_at;
    const result = await h.request();
    expect(result.grant.expiresAt.getTime()).toBe(upperBound.getTime());
  });

  it("replays the same key and rejects reuse for a different request", async () => {
    const h = makeHarness();
    const first = await h.request();
    const replay = await h.request();
    expect(replay.replayed).toBe(true);
    expect(replay.grant.grantId).toBe(first.grant.grantId);
    await expect(h.request({ consentId: ids.consent, imagingPackageId: ids.package, scopes: ["study:download"] }))
      .rejects.toBeInstanceOf(GrantIssueConflictError);
    expect(h.stored.size).toBe(1);
    expect(h.audits.map((event) => event.action)).toEqual([
      "AUTHORIZATION_GRANTED", "GRANT_CREATED", "AUTHORIZATION_DENIED", "GRANT_DENIED",
    ]);
  });

  it("returns an idempotency conflict before evaluating an expanded new scope", async () => {
    const h = makeHarness({ actions: ["VIEW"] });
    await h.request();
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:pacs-transfer"],
    })).rejects.toBeInstanceOf(GrantIssueConflictError);
    expect(h.stored.size).toBe(1);
    expect(h.audits.map((event) => event.action)).toEqual([
      "AUTHORIZATION_GRANTED", "GRANT_CREATED", "AUTHORIZATION_DENIED", "GRANT_DENIED",
    ]);
  });

  it("rejects client-supplied recipient/expiry fields and malformed keys", async () => {
    const h = makeHarness();
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:view"],
      recipientHospitalId: ids.hospitalA,
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:view"],
      expiresAt: new Date().toISOString(),
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:view", "study:view"],
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: [],
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:admin"],
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request({
      consentId: ids.consent,
      imagingPackageId: ids.package,
      scopes: ["study:mobile-export"],
    })).rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request(undefined, { idempotencyKey: "not-a-uuid" }))
      .rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    await expect(h.request(undefined, { correlationId: "not-a-uuid" }))
      .rejects.toBeInstanceOf(InvalidGrantIssueRequestError);
    expect(h.stored.size).toBe(0);
  });

  it("fails closed and rolls back a Grant when Audit writing fails", async () => {
    const h = makeHarness({ failAuditAt: 2 });
    await expect(h.request()).rejects.toBeInstanceOf(GrantIssueUnavailableError);
    expect(h.stored.size).toBe(0);
    expect(h.scopes.size).toBe(0);
    expect(h.audits).toEqual([]);
  });
});
