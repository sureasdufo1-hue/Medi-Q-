import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import {
  PacsTransferTerminalizationDeniedError,
  PostgresPacsTransferTerminalizationRepository,
} from "../../services/api/dist/pacs/persistence/pacs-transfer-terminalization.repository.js";

const ids = Object.freeze({
  operation: "b0000000-0000-4000-8000-000000000001",
  actor: "b0000000-0000-4000-8000-000000000002",
  tenant: "b0000000-0000-4000-8000-000000000003",
  hospital: "b0000000-0000-4000-8000-000000000004",
  session: "b0000000-0000-4000-8000-000000000005",
  study: "b0000000-0000-4000-8000-000000000006",
  consent: "b0000000-0000-4000-8000-000000000007",
  grant: "b0000000-0000-4000-8000-000000000008",
  correlation: "b0000000-0000-4000-8000-000000000009",
});

function context(action = "PACS_IMPORT", resourceKind = "STUDY") {
  return AuthorizationContext.create({
    identity: {
      issuer: "https://issuer.test.invalid",
      subject: "synthetic-terminalization-user",
      actorId: ids.actor,
      tenantId: ids.tenant,
      hospitalId: ids.hospital,
      actorType: "USER",
    },
    exchangeSessionId: ids.session,
    resource: { kind: resourceKind, id: ids.study },
    action,
    consentId: ids.consent,
    grantId: ids.grant,
  });
}

function repository() {
  const query = vi.fn();
  return { repo: new PostgresPacsTransferTerminalizationRepository({ query }), query };
}

describe("PostgresPacsTransferTerminalizationRepository", () => {
  it("binds one normalized transaction-local correlation before terminal Audit writes", async () => {
    const source = await readFile(
      new URL("../../services/api/src/pacs/persistence/pacs-transfer-terminalization.repository.ts", import.meta.url),
      "utf8",
    );
    const savepointAt = source.indexOf('SAVEPOINT mediq_pacs_terminalization');
    const bindingAt = source.indexOf("SELECT set_config('mediq.terminal_correlation_id', $1, true)");
    const auditWriterAt = source.indexOf("this.auditWriter.record(terminalAudit");
    const operationAuditAt = source.indexOf("INSERT INTO audit_events");

    expect(source.match(/set_config\('mediq\.terminal_correlation_id'/g)).toHaveLength(1);
    expect(source).toMatch(/const terminalCorrelationId = correlationId\.toLowerCase\(\)/);
    expect(savepointAt).toBeGreaterThanOrEqual(0);
    expect(bindingAt).toBeGreaterThan(savepointAt);
    expect(auditWriterAt).toBeGreaterThan(bindingAt);
    expect(operationAuditAt).toBeGreaterThan(bindingAt);
    expect(source).toMatch(/correlationId: terminalCorrelationId/);
    expect(source).toMatch(/operation\.operation_id, terminalCorrelationId\]/);
  });

  it("keeps terminal SQL away from the excluded Audit correlation SELECT column", async () => {
    const migration = await readFile(
      new URL("../../services/api/src/database/migrations/0029_terminal_audit_correlation_context.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("audit_events_terminal_correlation_guard");
    expect(migration).toContain("NEW.correlation_id::text IS DISTINCT FROM lower(expected_correlation_setting)");
    expect(migration).toContain("current_setting('mediq.terminal_correlation_id', true)");
    expect(migration).not.toMatch(/(?:transfer_audit|integrity_audit|operation_audit|session_audit|a)\.correlation_id/);
    expect(migration).toContain("p_correlation_id::text = lower(NULLIF(current_setting('mediq.terminal_correlation_id', true), ''))");
  });

  it("rejects caller-built JSON instead of an issued AuthorizationContext before SQL", async () => {
    const { repo, query } = repository();
    await expect(repo.finalize({
      operationId: ids.operation,
      correlationId: ids.correlation,
      context: {
        action: "PACS_IMPORT",
        resource: { kind: "STUDY", id: ids.study },
        exchangeSessionId: ids.session,
        tenantId: ids.tenant,
        actorId: ids.actor,
      },
    })).rejects.toBeInstanceOf(PacsTransferTerminalizationDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["VIEW is not PACS_IMPORT", context("VIEW", "STUDY")],
    ["Series scope is not a Study operation", context("PACS_IMPORT", "SERIES")],
  ])("denies %s before database work", async (_name, authorizationContext) => {
    const { repo, query } = repository();
    await expect(repo.finalize({
      operationId: ids.operation,
      correlationId: ids.correlation,
      context: authorizationContext,
    })).rejects.toBeInstanceOf(PacsTransferTerminalizationDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects accessors and proxies without evaluating caller-controlled properties", async () => {
    const { repo, query } = repository();
    let getterCalls = 0;
    const accessorInput = {
      correlationId: ids.correlation,
      context: context(),
      get operationId() {
        getterCalls += 1;
        return ids.operation;
      },
    };
    await expect(repo.finalize(accessorInput))
      .rejects.toBeInstanceOf(PacsTransferTerminalizationDeniedError);
    expect(getterCalls).toBe(0);

    const proxyInput = new Proxy({
      operationId: ids.operation,
      correlationId: ids.correlation,
      context: context(),
    }, {
      getPrototypeOf() { throw new Error("must not escape"); },
    });
    await expect(repo.finalize(proxyInput))
      .rejects.toBeInstanceOf(PacsTransferTerminalizationDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("uses a tenant-, actor-, Session- and Study-bound initial read", async () => {
    const { repo, query } = repository();
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repo.finalize({
      operationId: ids.operation,
      correlationId: ids.correlation,
      context: context(),
    })).rejects.toBeInstanceOf(PacsTransferTerminalizationDeniedError);
    expect(query).toHaveBeenCalledOnce();
    const [statement, values] = query.mock.calls[0];
    expect(statement).toMatch(/tenant_id\s*=\s*NULLIF\(current_setting\('mediq\.tenant_id'/i);
    expect(statement).toMatch(/actor_id\s*=\s*\$3/i);
    expect(statement).toMatch(/exchange_session_id\s*=\s*\$4/i);
    expect(statement).toMatch(/study_ref_id\s*=\s*\$5/i);
    expect(values).toEqual([
      ids.operation,
      ids.tenant,
      ids.actor,
      ids.session,
      ids.study,
    ]);
  });
});
