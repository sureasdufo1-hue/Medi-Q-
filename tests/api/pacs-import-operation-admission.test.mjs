import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  AuthorizationGatedOperationExecutor,
  ProtectedOperationUnavailableError,
} from "../../services/api/dist/authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationEngine } from "../../services/api/dist/authorization/application/authorization-engine.js";
import { ActorTenantContextDeniedError } from "../../services/api/dist/identity/identity-context.types.js";
import {
  PacsImportRequestInvalidError,
} from "../../services/api/dist/pacs/application/pacs-import-request.parser.js";
import {
  PacsImportOperationAdmissionService,
} from "../../services/api/dist/pacs/application/pacs-import-operation-admission.service.js";

const ids = Object.freeze({
  tenant: "10000000-0000-4000-8000-000000000001",
  actor: "20000000-0000-4000-8000-000000000002",
  hospital: "30000000-0000-4000-8000-000000000003",
  session: "40000000-0000-4000-8000-000000000004",
  study: "50000000-0000-4000-8000-000000000005",
  package: "60000000-0000-4000-8000-000000000006",
  consent: "70000000-0000-4000-8000-000000000007",
  grant: "80000000-0000-4000-8000-000000000008",
  idempotency: "90000000-0000-4000-8000-000000000009",
  correlation: "a0000000-0000-4000-8000-00000000000a",
  operation: "b0000000-0000-4000-8000-00000000000b",
});

const now = new Date("2026-10-05T03:00:00.000Z");
const principal = Object.freeze({ issuer: "https://synthetic.test/issuer", subject: "coord-user" });
const identity = Object.freeze({
  issuer: principal.issuer,
  subject: principal.subject,
  actorId: ids.actor,
  tenantId: ids.tenant,
  hospitalId: ids.hospital,
  actorType: "USER",
});

function request(overrides = {}) {
  return {
    sessionId: ids.session,
    tenantCandidate: ids.tenant,
    idempotencyKey: ids.idempotency,
    correlationId: ids.correlation,
    body: { grantId: ids.grant, studyRefId: ids.study },
    ...overrides,
  };
}

function createHarness({ effect = "ALLOW", grantOverrides = {}, auditFailure = false } = {}) {
  const events = [];
  const auditRows = [];
  const grantRow = {
    grant_id: ids.grant,
    exchange_session_id: ids.session,
    consent_id: ids.consent,
    recipient_tenant_id: ids.tenant,
    recipient_hospital_id: ids.hospital,
    recipient_actor_id: ids.actor,
    imaging_package_id: ids.package,
    status: "ACTIVE",
    issued_at: new Date(now.getTime() - 60_000),
    expires_at: new Date(now.getTime() + 60_000),
    revoked_at: null,
    created_at: new Date(now.getTime() - 60_000),
    ...grantOverrides,
  };
  const transactionClient = {
    async query(statement, parameters = []) {
      const sql = typeof statement === "string" ? statement : statement.text;
      if (sql.includes("FROM transfer_grants")) {
        events.push("grant-read");
        return { rows: [grantRow], rowCount: 1 };
      }
      if (sql.includes("FROM transfer_grant_scopes")) {
        events.push("grant-scopes-read");
        return { rows: [{ scope: "study:pacs-transfer" }], rowCount: 1 };
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        events.push("session-fence");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO pacs_transfer_operations")) {
        events.push("operation-insert");
        const [operationId, tenantId, sessionId, studyRefId, actorId, key, digest, createdAt] = parameters;
        return {
          rowCount: 1,
          rows: [{
            operation_id: operationId,
            tenant_id: tenantId,
            exchange_session_id: sessionId,
            study_ref_id: studyRefId,
            actor_id: actorId,
            idempotency_key: key,
            request_digest: digest,
            state: "CREATED",
            version: 0,
            reason_code: null,
            source_object_count: null,
            destination_object_count: null,
            created_at: createdAt,
            updated_at: createdAt,
            stow_started_at: null,
          }],
        };
      }
      if (sql.includes("INSERT INTO audit_events")) {
        events.push("audit-insert");
        if (auditFailure) throw new Error("SENSITIVE_TEST_DATABASE_DETAIL");
        auditRows.push(parameters);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("ROLLBACK TO SAVEPOINT")) {
        events.push("savepoint-rollback");
        return { rows: [], rowCount: null };
      }
      if (sql.includes("RELEASE SAVEPOINT")) {
        events.push("savepoint-release");
        return { rows: [], rowCount: null };
      }
      if (sql.includes("SAVEPOINT mediq_pacs_operation_write")) {
        events.push("savepoint");
        return { rows: [], rowCount: null };
      }
      throw new Error("UNEXPECTED_TEST_QUERY");
    },
  };
  const transaction = { committed: 0, rolledBack: 0 };
  const actorTenantContext = {
    async run(suppliedPrincipal, tenantCandidate, work) {
      events.push("tenant-transaction");
      if (!suppliedPrincipal || tenantCandidate !== ids.tenant) {
        throw new ActorTenantContextDeniedError();
      }
      try {
        const result = await work(identity, transactionClient);
        transaction.committed += 1;
        events.push("commit");
        return result;
      } catch (error) {
        transaction.rolledBack += 1;
        events.push("rollback");
        throw error;
      }
    },
  };
  const policy = {
    async evaluate() {
      events.push("authorization");
      return effect;
    },
  };
  const executor = new AuthorizationGatedOperationExecutor(
    actorTenantContext,
    new AuthorizationEngine(policy),
  );
  const service = new PacsImportOperationAdmissionService(
    executor,
    () => new Date(now),
    () => ids.operation,
  );
  return { service, events, auditRows, transaction };
}

describe("PacsImportOperationAdmissionService", () => {
  it("rejects caller authority fields before opening a verified Tenant transaction", async () => {
    const h = createHarness();
    await expect(h.service.admit({
      principal,
      request: request({ body: { grantId: ids.grant, studyRefId: ids.study, consentId: ids.consent } }),
    })).rejects.toBeInstanceOf(PacsImportRequestInvalidError);
    expect(h.events).toEqual([]);
    expect(h.auditRows).toHaveLength(0);
  });

  it("requires a verified principal before any Tenant lookup or write", async () => {
    const h = createHarness();
    await expect(h.service.admit({ principal: null, request: request() }))
      .rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(h.events).toEqual([]);
    expect(h.auditRows).toHaveLength(0);
  });

  it("creates CREATED and its Audit only after resolved Grant, shared fence, and exact Authorization", async () => {
    const h = createHarness();
    const result = await h.service.admit({ principal, request: request() });

    expect(result).toMatchObject({
      created: true,
      operation: {
        tenantId: ids.tenant,
        actorId: ids.actor,
        exchangeSessionId: ids.session,
        studyRefId: ids.study,
        state: "CREATED",
        version: 0,
        stowStartedAt: null,
      },
    });
    expect(h.events.indexOf("grant-read")).toBeLessThan(h.events.indexOf("session-fence"));
    expect(h.events.indexOf("session-fence")).toBeLessThan(h.events.indexOf("authorization"));
    expect(h.events.indexOf("authorization")).toBeLessThan(h.events.indexOf("operation-insert"));
    expect(h.events.indexOf("operation-insert")).toBeLessThan(h.events.indexOf("audit-insert"));
    expect(h.auditRows).toHaveLength(1);
    expect(h.transaction).toEqual({ committed: 1, rolledBack: 0 });
  });

  it("passes Grant-derived Consent only to an internal continuation after commit", async () => {
    const h = createHarness();
    let continuationContext;
    const result = await h.service.admitForCoordinator(
      { principal, request: request() },
      async (context) => {
        continuationContext = context;
        h.events.push("coordinator-continuation");
        return context.admission;
      },
    );

    expect(continuationContext.sourceCaptureCommand).toMatchObject({
      principal,
      tenantCandidate: ids.tenant,
      correlationId: ids.correlation,
      operationId: ids.operation,
      consentId: ids.consent,
      grantId: ids.grant,
    });
    expect(Object.keys(result).sort()).toEqual(["created", "operation"]);
    expect(JSON.stringify(result)).not.toContain(ids.consent);
    expect(h.events.indexOf("commit")).toBeLessThan(h.events.indexOf("coordinator-continuation"));
  });

  it("denies mismatched Grant Session and policy DENY before operation or Audit writes", async () => {
    const wrongSession = createHarness({ grantOverrides: {
      exchange_session_id: "c0000000-0000-4000-8000-00000000000c",
    } });
    await expect(wrongSession.service.admit({ principal, request: request() }))
      .rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(wrongSession.events).not.toContain("session-fence");
    expect(wrongSession.events).not.toContain("operation-insert");
    expect(wrongSession.auditRows).toHaveLength(0);

    const denied = createHarness({ effect: "DENY" });
    await expect(denied.service.admit({ principal, request: request() }))
      .rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denied.events).toContain("session-fence");
    expect(denied.events).toContain("authorization");
    expect(denied.events).not.toContain("operation-insert");
    expect(denied.auditRows).toHaveLength(0);
  });

  it("sanitizes Audit failure and rolls back the operation savepoint and Tenant transaction", async () => {
    const h = createHarness({ auditFailure: true });
    await expect(h.service.admit({ principal, request: request() }))
      .rejects.toMatchObject({
        constructor: ProtectedOperationUnavailableError,
        message: "PROTECTED_OPERATION_UNAVAILABLE",
      });
    expect(h.events).toContain("savepoint-rollback");
    expect(h.events).toContain("rollback");
    expect(h.events).not.toContain("commit");
    expect(h.events).not.toContain("SENSITIVE_TEST_DATABASE_DETAIL");
    expect(h.auditRows).toHaveLength(0);
    expect(h.transaction).toEqual({ committed: 0, rolledBack: 1 });
  });
});
