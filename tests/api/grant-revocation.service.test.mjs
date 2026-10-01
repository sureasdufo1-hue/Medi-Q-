import { describe, expect, it } from "vitest";
import { GrantRevocationService } from "../../services/api/dist/grant/application/grant-revocation.service.js";
import {
  GrantRevocationConflictError,
  GrantRevocationDeniedError,
  GrantRevocationUnavailableError,
  InvalidGrantRevocationRequestError,
} from "../../services/api/dist/grant/application/grant-revocation.service.js";

const ids = Object.freeze({
  session: "72000000-0000-4000-8000-000000000001",
  patient: "72000000-0000-4000-8000-000000000002",
  source: "72000000-0000-4000-8000-000000000003",
  destination: "72000000-0000-4000-8000-000000000004",
  tenant: "72000000-0000-4000-8000-000000000005",
  actor: "72000000-0000-4000-8000-000000000006",
  consent: "72000000-0000-4000-8000-000000000007",
  package: "72000000-0000-4000-8000-000000000008",
  grant: "72000000-0000-4000-8000-000000000009",
  correlation: "72000000-0000-4000-8000-000000000010",
});

function makeHarness(overrides = {}) {
  const now = new Date();
  const actorContext = {
    issuer: "https://identity.example.test/issuer",
    subject: "synthetic-grant-recipient",
    actorId: ids.actor,
    tenantId: ids.tenant,
    hospitalId: ids.destination,
    actorType: "USER",
    ...overrides.context,
  };
  const session = {
    session_id: ids.session,
    patient_ref_id: ids.patient,
    source_hospital_id: ids.source,
    destination_hospital_id: ids.destination,
    requester_actor_id: ids.actor,
    purpose: "Synthetic Grant revocation",
    state: "EXPIRED",
    created_at: new Date(now.getTime() - 60_000),
    updated_at: new Date(now.getTime() - 30_000),
    expires_at: new Date(now.getTime() - 1_000),
    completed_at: null,
    idempotency_key: "72000000-0000-4000-8000-000000000011",
    ...overrides.session,
  };
  const grant = {
    grant_id: ids.grant,
    exchange_session_id: ids.session,
    consent_id: ids.consent,
    recipient_tenant_id: ids.tenant,
    recipient_hospital_id: ids.destination,
    recipient_actor_id: ids.actor,
    imaging_package_id: ids.package,
    status: overrides.status ?? "ACTIVE",
    issued_at: new Date(now.getTime() - 60_000),
    expires_at: new Date(now.getTime() - 1_000),
    revoked_at: null,
    created_at: new Date(now.getTime() - 60_000),
  };
  const audits = [];
  let auditFailure = false;
  const database = {
    async query(statement, values = []) {
      if (statement.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: null };
      if (statement.includes("FROM exchange_sessions")) {
        return { rows: overrides.missingSession ? [] : [session], rowCount: overrides.missingSession ? 0 : 1 };
      }
      if (statement.includes("FROM transfer_grants")) {
        const row = values[0]?.toLowerCase() === ids.grant ? grant : null;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (statement.includes("FROM transfer_grant_scopes")) {
        return { rows: [{ scope: "study:view" }], rowCount: 1 };
      }
      if (statement.includes("UPDATE transfer_grants")) {
        if (overrides.failUpdate) throw new Error("synthetic update failure");
        grant.status = "REVOKED";
        grant.revoked_at = values[5];
        return { rows: [], rowCount: 1 };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        const action = values[7];
        if (action === "GRANT_REVOKED" && auditFailure) throw new Error("synthetic audit failure");
        audits.push({ action, result: action === "GRANT_REVOKED" ? "SUCCESS" : "DENY", values });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    },
  };
  const contextService = {
    async run(_principal, _tenantId, work) {
      const beforeGrant = { ...grant };
      const beforeAudits = audits.length;
      try {
        return await work(actorContext, database);
      } catch (error) {
        Object.assign(grant, beforeGrant);
        audits.length = beforeAudits;
        throw error;
      }
    },
  };
  const service = new GrantRevocationService(contextService);
  const request = (extra = {}) => service.revoke({
    principal: { issuer: actorContext.issuer, subject: actorContext.subject },
    tenantCandidate: ids.tenant,
    sessionId: ids.session,
    grantId: ids.grant,
    correlationId: ids.correlation,
    hasUnexpectedInput: false,
    ...extra,
  });
  return { request, grant, audits, setAuditFailure: (value) => { auditFailure = value; } };
}

describe("GrantRevocationService", () => {
  it("revokes an expired-by-time ACTIVE Grant even when the Session is terminal, then replays without another audit", async () => {
    const h = makeHarness();
    const first = await h.request();
    expect(first.grant.status).toBe("REVOKED");
    expect(first.grant.revokedAt).toBeInstanceOf(Date);
    expect(first.replayed).toBe(false);
    expect(h.audits.map((event) => event.action)).toEqual(["GRANT_REVOKED"]);
    const replay = await h.request();
    expect(replay.replayed).toBe(true);
    expect(replay.grant.revokedAt).toEqual(first.grant.revokedAt);
    expect(h.audits).toHaveLength(1);
  });

  it.each([
    ["another actor", { context: { actorId: "72000000-0000-4000-8000-000000000099" } }],
    ["wrong tenant", { context: { tenantId: "72000000-0000-4000-8000-000000000099" } }],
    ["wrong hospital", { context: { hospitalId: ids.source } }],
    ["service actor", { context: { actorType: "SERVICE" } }],
    ["tenant-level actor", { context: { hospitalId: null } }],
    ["wrong route Session", { session: { session_id: "72000000-0000-4000-8000-000000000099" } }],
  ])("denies %s without changing the Grant", async (_name, overrides) => {
    const h = makeHarness(overrides);
    await expect(h.request()).rejects.toBeInstanceOf(GrantRevocationDeniedError);
    expect(h.grant.status).toBe("ACTIVE");
    expect(h.audits.map((event) => event.action)).toEqual(["AUTHORIZATION_DENIED", "GRANT_DENIED"]);
  });

  it.each(["EXPIRED", "CONSUMED"])("returns conflict for terminal Grant status %s", async (status) => {
    const h = makeHarness({ status });
    await expect(h.request()).rejects.toBeInstanceOf(GrantRevocationConflictError);
    expect(h.grant.status).toBe(status);
    expect(h.audits).toEqual([]);
  });

  it("rejects unexpected client inputs before opening a transaction", async () => {
    const h = makeHarness();
    await expect(h.request({ hasUnexpectedInput: true })).rejects.toBeInstanceOf(InvalidGrantRevocationRequestError);
    await expect(h.request({ grantId: "not-a-uuid" })).rejects.toBeInstanceOf(InvalidGrantRevocationRequestError);
    expect(h.grant.status).toBe("ACTIVE");
    expect(h.audits).toEqual([]);
  });

  it("rolls back the state transition if the success Audit cannot be written", async () => {
    const h = makeHarness();
    h.setAuditFailure(true);
    await expect(h.request()).rejects.toBeInstanceOf(GrantRevocationUnavailableError);
    expect(h.grant.status).toBe("ACTIVE");
    expect(h.grant.revoked_at).toBeNull();
    expect(h.audits).toEqual([]);
  });
});
