import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationGatedOperationExecutor,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { ActorTenantContextDeniedError } from "../../services/api/dist/identity/identity-context.types.js";
import {
  PacsImportMappingGateInvalidRequestError,
  PacsImportMappingGateService,
  PacsImportMappingGateUnavailableError,
} from "../../services/api/dist/pacs/application/pacs-import-mapping-gate.service.js";

const ids = Object.freeze({
  tenant: "10000000-0000-4000-8000-000000000001",
  actor: "20000000-0000-4000-8000-000000000002",
  sourceHospital: "30000000-0000-4000-8000-000000000003",
  destinationHospital: "40000000-0000-4000-8000-000000000004",
  session: "50000000-0000-4000-8000-000000000005",
  patientRef: "60000000-0000-4000-8000-000000000006",
  studyRef: "70000000-0000-4000-8000-000000000007",
  consent: "80000000-0000-4000-8000-000000000008",
  grant: "90000000-0000-4000-8000-000000000009",
  mapping: "a0000000-0000-4000-8000-00000000000a",
  correlation: "b0000000-0000-4000-8000-00000000000b",
  otherHospital: "e0000000-0000-4000-8000-00000000000e",
});

const now = new Date("2026-10-01T02:00:00.000Z");
const principal = Object.freeze({
  issuer: "https://synthetic-issuer.test",
  subject: "synthetic-destination-user",
});
const identity = Object.freeze({
  issuer: principal.issuer,
  subject: principal.subject,
  actorId: ids.actor,
  tenantId: ids.tenant,
  hospitalId: ids.destinationHospital,
  actorType: "USER",
});

function command(overrides = {}) {
  return {
    exchangeSessionId: ids.session,
    studyRefId: ids.studyRef,
    consentId: ids.consent,
    grantId: ids.grant,
    ...overrides,
  };
}

function sessionRow(overrides = {}) {
  return {
    session_id: ids.session,
    patient_ref_id: ids.patientRef,
    source_hospital_id: ids.sourceHospital,
    destination_hospital_id: ids.destinationHospital,
    requester_actor_id: ids.actor,
    purpose: "Synthetic referral",
    state: "ACTIVE",
    created_at: now,
    updated_at: now,
    expires_at: null,
    completed_at: null,
    idempotency_key: "c0000000-0000-4000-8000-00000000000c",
    ...overrides,
  };
}

function mappingRow(overrides = {}) {
  return {
    mapping_id: ids.mapping,
    patient_ref_id: ids.patientRef,
    hospital_id: ids.destinationHospital,
    local_patient_id: "TEST-LOCAL-001",
    status: "VALID",
    validated_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createHarness({
  effect = "ALLOW",
  session = sessionRow(),
  mappings = [mappingRow()],
  auditFailure = false,
} = {}) {
  const calls = [];
  const auditRows = [];
  const policy = {
    evaluate: vi.fn(async (context) => {
      calls.push({ type: "authorization", context });
      return effect;
    }),
  };
  const client = {
    async query(statement, parameters = []) {
      if (statement.includes("pg_advisory_xact_lock")) {
        calls.push({ type: "session-fence", parameters });
        return { rows: [] };
      }
      if (statement.includes("FROM exchange_sessions")) {
        calls.push({ type: "session-query", parameters });
        return { rows: session ? [session] : [] };
      }
      if (statement.includes("FROM patient_mappings")) {
        calls.push({ type: "mapping-query", parameters });
        return { rows: mappings };
      }
      if (statement.includes("INSERT INTO audit_events")) {
        calls.push({ type: "audit-query", statement, parameters });
        if (auditFailure) throw new Error("synthetic audit storage failure");
        auditRows.push({ statement, parameters });
        return { rowCount: 1 };
      }
      throw new Error("unexpected SQL in PACS mapping gate test");
    },
  };
  const actorTenantContext = {
    async run(suppliedPrincipal, tenantCandidate, work) {
      calls.push({ type: "tenant-run", suppliedPrincipal, tenantCandidate });
      if (
        !suppliedPrincipal ||
        suppliedPrincipal.issuer !== principal.issuer ||
        suppliedPrincipal.subject !== principal.subject ||
        tenantCandidate !== ids.tenant
      ) {
        throw new ActorTenantContextDeniedError();
      }
      try {
        const result = await work(identity, client);
        calls.push({ type: "transaction-commit" });
        return result;
      } catch (error) {
        calls.push({ type: "transaction-rollback" });
        throw error;
      }
    },
  };
  const executor = new AuthorizationGatedOperationExecutor(
    actorTenantContext,
    new AuthorizationEngine(policy),
  );
  const service = new PacsImportMappingGateService(
    executor,
    () => now,
    () => "d0000000-0000-4000-8000-00000000000d",
  );
  const invoke = (body = command(), authPrincipal = principal) =>
    service.validate({
      principal: authPrincipal,
      tenantCandidate: ids.tenant,
      correlationId: ids.correlation,
      body,
    });

  return { service, invoke, policy, calls, auditRows };
}

describe("PacsImportMappingGateService", () => {
  it("TC-PACS-004-REQ-001 rejects patient/destination/endpoint facts before authentication or database work", async () => {
    const h = createHarness();
    await expect(
      h.invoke({ ...command(), localPatientId: "TEST-CALLER-CONTROLLED" }),
    ).rejects.toBeInstanceOf(PacsImportMappingGateInvalidRequestError);
    expect(h.calls).toEqual([]);
    expect(h.auditRows).toHaveLength(0);
  });

  it("TC-PACS-004-AUTH-001 constructs exact PACS_IMPORT context and requires exact ALLOW", async () => {
    const denied = createHarness({ effect: "DENY" });
    await expect(denied.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
    expect(denied.policy.evaluate).toHaveBeenCalledOnce();
    expect(denied.calls.findIndex((call) => call.type === "session-fence")).toBeLessThan(
      denied.calls.findIndex((call) => call.type === "authorization"),
    );
    expect(denied.policy.evaluate.mock.calls[0][0]).toMatchObject({
      exchangeSessionId: ids.session,
      resource: { kind: "STUDY", id: ids.studyRef },
      action: "PACS_IMPORT",
      consentId: ids.consent,
      grantId: ids.grant,
    });
    expect(denied.calls.some((call) => call.type === "session-query")).toBe(false);
    expect(denied.calls.some((call) => call.type === "mapping-query")).toBe(false);
    expect(denied.auditRows).toHaveLength(0);
  });

  it("TC-PACS-004-AUTH-001 denies missing verified principal before evidence lookup", async () => {
    const h = createHarness();
    await expect(h.invoke(command(), null)).resolves.toEqual({
      kind: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
    expect(h.calls.some((call) => call.type === "session-query")).toBe(false);
    expect(h.calls.some((call) => call.type === "mapping-query")).toBe(false);
    expect(h.auditRows).toHaveLength(0);
  });

  it("TC-PACS-004-BIND-001 rechecks persisted Session destination before mapping access", async () => {
    const h = createHarness({
      session: sessionRow({ destination_hospital_id: ids.otherHospital }),
    });
    await expect(h.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
    expect(h.calls.some((call) => call.type === "mapping-query")).toBe(false);
    expect(h.auditRows).toHaveLength(0);
  });

  it("TC-PACS-004-DB-001 reads destination mapping with verified Hospital and Session PatientReference on the same client", async () => {
    const h = createHarness();
    await expect(h.invoke()).resolves.toEqual({
      kind: "MAPPING_VALIDATED",
      mappingId: ids.mapping,
    });
    const sessionQuery = h.calls.find((call) => call.type === "session-query");
    const mappingQuery = h.calls.find((call) => call.type === "mapping-query");
    expect(sessionQuery.parameters).toEqual([ids.session]);
    expect(mappingQuery.parameters).toEqual([
      ids.destinationHospital,
      ids.patientRef,
    ]);
    expect(h.calls.filter((call) => call.type === "tenant-run")).toHaveLength(1);
  });

  it("TC-PACS-004-MAP-001 denies a missing mapping and atomically writes the minimized failure Audit", async () => {
    const h = createHarness({ mappings: [] });
    await expect(h.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "PATIENT_MAPPING_INVALID",
    });
    expect(h.auditRows).toHaveLength(1);
    const audit = h.auditRows[0];
    expect(audit.statement).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12\)/);
    expect(audit.parameters).toEqual([
      "d0000000-0000-4000-8000-00000000000d",
      now,
      ids.actor,
      ids.tenant,
      ids.session,
      "STUDY",
      ids.studyRef,
      "PACS_TRANSFER_FAILED",
      "FAILURE",
      "PATIENT_MAPPING_INVALID",
      ids.correlation,
      now,
    ]);
    expect(JSON.stringify(audit)).not.toContain("TEST-LOCAL-001");
  });

  it.each([
    ["AMBIGUOUS", now],
    ["UNVERIFIED", null],
    ["REVOKED", now],
    ["VALID", null],
  ])("TC-PACS-004-MAP-002 denies mapping status %s with invalid evidence", async (status, validatedAt) => {
    const h = createHarness({ mappings: [mappingRow({ status, validated_at: validatedAt })] });
    await expect(h.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "PATIENT_MAPPING_INVALID",
    });
    expect(h.auditRows).toHaveLength(1);
  });

  it("TC-PACS-004-MAP-002 denies a PatientReference/Hospital binding mismatch", async () => {
    const h = createHarness({
      mappings: [mappingRow({ patient_ref_id: ids.sourceHospital })],
    });
    await expect(h.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "PATIENT_MAPPING_INVALID",
    });
    expect(h.auditRows).toHaveLength(1);
  });

  it("TC-PACS-004-MAP-003 returns mapping eligibility only, without Patient ID or PACS permission", async () => {
    const h = createHarness();
    const result = await h.invoke();
    expect(result).toEqual({
      kind: "MAPPING_VALIDATED",
      mappingId: ids.mapping,
    });
    expect(JSON.stringify(result)).not.toContain("TEST-LOCAL-001");
    expect(JSON.stringify(result)).not.toContain("pacsImportAllowed");
    expect(h.auditRows).toHaveLength(0);
    // The production gate receives no DICOM Gateway or STOW callback.
  });

  it("TC-PACS-004-DB-001 fails closed for duplicate persistence rows", async () => {
    const h = createHarness({ mappings: [mappingRow(), mappingRow()] });
    await expect(h.invoke()).rejects.toBeInstanceOf(
      PacsImportMappingGateUnavailableError,
    );
    expect(h.auditRows).toHaveLength(0);
    expect(h.calls.some((call) => call.type === "transaction-rollback")).toBe(true);
  });

  it("TC-PACS-004-AUD-002 rolls back and fails closed if denial Audit persistence fails", async () => {
    const h = createHarness({ mappings: [], auditFailure: true });
    await expect(h.invoke()).rejects.toBeInstanceOf(
      PacsImportMappingGateUnavailableError,
    );
    expect(h.auditRows).toHaveLength(0);
    expect(h.calls.some((call) => call.type === "transaction-rollback")).toBe(true);
    expect(h.calls.some((call) => call.type === "transaction-commit")).toBe(false);
  });

  it("TC-PACS-004-AUTH-001 turns policy exceptions into default DENY without lookup", async () => {
    const h = createHarness({ effect: "THROWS" });
    h.policy.evaluate.mockRejectedValueOnce(new Error("synthetic policy failure"));
    await expect(h.invoke()).resolves.toEqual({
      kind: "DENY",
      reason: "AUTHORIZATION_DENIED",
    });
    expect(h.calls.some((call) => call.type === "mapping-query")).toBe(false);
  });

  it("keeps authorization denial distinct from a mapping denial", async () => {
    const h = createHarness({ effect: "DENY" });
    const result = await h.invoke();
    expect(result.reason).toBe("AUTHORIZATION_DENIED");
    expect(result.reason).not.toBe("PATIENT_MAPPING_INVALID");
  });
});
