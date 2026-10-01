import { describe, expect, it, vi } from "vitest";
import { ExchangeSessionCreationService } from "../../services/api/dist/exchange/application/exchange-session-creation.service.js";
import {
  ExchangeSessionCreationDeniedError,
  InvalidExchangeSessionRequestError,
} from "../../services/api/dist/exchange/application/exchange-session-creation.service.js";
import { ExchangeSessionAuditPersistenceError } from "../../services/api/dist/exchange/persistence/postgres-exchange-session-audit.repository.js";

const ids = {
  patient: "22000000-0000-4000-8000-000000000001",
  source: "04000000-0000-4000-8000-000000000001",
  destination: "04000000-0000-4000-8000-000000000002",
  actor: "03000000-0000-4000-8000-000000000001",
  tenant: "01000000-0000-4000-8000-000000000002",
  key: "26000000-0000-4000-8000-000000000001",
  correlation: "26000000-0000-4000-8000-000000000002",
};
const principal = Object.freeze({
  issuer: "https://identity.example.test/issuer",
  subject: "synthetic-user-b",
});
const command = Object.freeze({
  patientRefId: ids.patient,
  sourceHospitalId: ids.source,
  destinationHospitalId: ids.destination,
  purpose: "Referral imaging review",
});

function harness({ actorType = "USER", hospitalId = ids.destination, patientStatus = "ACTIVE", failAudit = false } = {}) {
  const sessions = new Map();
  const audits = [];
  const queries = [];
  const client = {
    async query(statement, parameters = []) {
      queries.push({ statement, parameters });
      if (statement.includes("FROM patient_refs")) {
        return {
          rows: [{
            patient_ref_id: ids.patient,
            patient_ref_code: "MQ-TEST-0001",
            status: patientStatus,
            created_at: new Date("2026-09-30T00:00:00Z"),
            updated_at: new Date("2026-09-30T00:00:00Z"),
          }],
          rowCount: 1,
        };
      }
      if (statement.includes("INSERT INTO exchange_sessions")) {
        const p = parameters;
        const k = `${p[4]}:${p[11]}`;
        if (sessions.has(k)) return { rows: [], rowCount: 0 };
        const row = {
          session_id: p[0], patient_ref_id: p[1], source_hospital_id: p[2],
          destination_hospital_id: p[3], requester_actor_id: p[4], purpose: p[5],
          state: p[6], created_at: p[7], updated_at: p[8], expires_at: p[9],
          completed_at: p[10], idempotency_key: p[11],
        };
        sessions.set(k, row);
        return { rows: [row], rowCount: 1 };
      }
      if (statement.includes("FROM exchange_sessions")) {
        const row = sessions.get(`${parameters[0]}:${parameters[1]}`);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        if (failAudit) throw new Error("synthetic audit failure contains private driver detail");
        audits.push(parameters);
        return { rows: [], rowCount: 1 };
      }
      throw new Error("unexpected query");
    },
  };
  const actorTenantContext = {
    run: vi.fn(async (_principal, tenantCandidate, work) => {
      if (tenantCandidate !== ids.tenant) throw new Error("unexpected tenant");
      const context = Object.freeze({
        issuer: principal.issuer,
        subject: principal.subject,
        actorId: ids.actor,
        tenantId: ids.tenant,
        hospitalId,
        actorType,
      });
      const snapshot = new Map(sessions);
      const auditCount = audits.length;
      try {
        return await work(context, client);
      } catch (error) {
        sessions.clear();
        for (const [key, value] of snapshot) sessions.set(key, value);
        audits.length = auditCount;
        throw error;
      }
    }),
  };
  return {
    service: new ExchangeSessionCreationService(actorTenantContext),
    actorTenantContext,
    sessions,
    audits,
    queries,
    client,
  };
}

function input(overrides = {}) {
  return {
    principal,
    tenantCandidate: ids.tenant,
    idempotencyKey: ids.key,
    correlationId: ids.correlation,
    body: { ...command, ...overrides },
  };
}

describe("ExchangeSessionCreationService", () => {
  it("creates a destination-bound REQUESTED Session and one success Audit", async () => {
    const h = harness();
    const result = await h.service.create(input());

    expect(result).toMatchObject({
      replayed: false,
      session: {
        patientRefId: ids.patient,
        sourceHospitalId: ids.source,
        destinationHospitalId: ids.destination,
        requesterActorId: ids.actor,
        purpose: command.purpose,
        state: "REQUESTED",
      },
      correlationId: ids.correlation,
    });
    expect(h.sessions.size).toBe(1);
    expect(h.audits).toHaveLength(1);
    expect(h.queries.filter((q) => q.statement.includes("INSERT INTO audit_events"))).toHaveLength(1);
    const auditInsert = h.queries.find((q) => q.statement.includes("INSERT INTO audit_events"));
    expect(auditInsert.statement).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12\)/);
    expect(h.audits[0][2]).toBe(ids.actor);
    expect(h.audits[0][3]).toBe(ids.tenant);
    expect(h.audits[0][7]).toBe("SESSION_CREATED");
    expect(h.audits[0][8]).toBe("SUCCESS");
    expect(h.audits[0][10]).toBe(ids.correlation);
  });

  it("returns the same Session on an exact retry without duplicating Audit", async () => {
    const h = harness();
    const first = await h.service.create(input());
    const second = await h.service.create(input());

    expect(second.replayed).toBe(true);
    expect(second.session.sessionId).toBe(first.session.sessionId);
    expect(h.sessions.size).toBe(1);
    expect(h.audits).toHaveLength(1);
  });

  it("rejects changed data on a reused Actor-scoped idempotency key", async () => {
    const h = harness();
    await h.service.create(input());

    await expect(h.service.create(input({ purpose: "Different purpose" })))
      .rejects.toMatchObject({ message: "EXCHANGE_SESSION_IDEMPOTENCY_CONFLICT" });
    expect(h.sessions.size).toBe(1);
    expect(h.audits).toHaveLength(1);
  });

  it.each([
    ["SERVICE actor", { actorType: "SERVICE" }],
    ["tenant-only actor", { hospitalId: null }],
    ["wrong Hospital", { hospitalId: ids.source }],
  ])("denies %s before reading PatientReference or writing", async (_label, options) => {
    const h = harness(options);
    await expect(h.service.create(input())).rejects.toBeInstanceOf(ExchangeSessionCreationDeniedError);
    expect(h.queries).toHaveLength(0);
    expect(h.sessions.size).toBe(0);
    expect(h.audits).toHaveLength(0);
  });

  it("rejects inactive patient references without creating Session or Audit", async () => {
    const h = harness({ patientStatus: "INACTIVE" });
    await expect(h.service.create(input())).rejects.toBeInstanceOf(InvalidExchangeSessionRequestError);
    expect(h.sessions.size).toBe(0);
    expect(h.audits).toHaveLength(0);
  });

  it("rejects unsupported fields, malformed headers and invalid input before DB access", async () => {
    const h = harness();
    await expect(h.service.create(input({ requestedStudyInstanceUIDs: ["1.2.3"] })))
      .rejects.toBeInstanceOf(InvalidExchangeSessionRequestError);
    await expect(h.service.create({ ...input(), idempotencyKey: "bad" }))
      .rejects.toBeInstanceOf(InvalidExchangeSessionRequestError);
    await expect(h.service.create(input({ purpose: "  " })))
      .rejects.toBeInstanceOf(InvalidExchangeSessionRequestError);
    expect(h.queries).toHaveLength(0);
  });

  it("rolls back Session state when success Audit persistence fails", async () => {
    const h = harness({ failAudit: true });
    await expect(h.service.create(input())).rejects.toBeInstanceOf(ExchangeSessionAuditPersistenceError);
    expect(h.sessions.size).toBe(0);
    expect(h.audits).toHaveLength(0);
  });
});
