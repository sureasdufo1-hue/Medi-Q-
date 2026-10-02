import { describe, expect, it } from "vitest";
import {
  TemporaryPayloadPurgeCoordinator,
  TemporaryPayloadPurgeUnavailableError,
} from "../../services/api/dist/imaging-storage/application/temporary-payload-purge.coordinator.js";

const ids = Object.freeze({
  tenantId: "10000000-0000-4000-8000-000000000001",
  actorId: "11000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000001",
  packageId: "30000000-0000-4000-8000-000000000001",
  studyRefId: "40000000-0000-4000-8000-000000000001",
  sourceHospitalId: "50000000-0000-4000-8000-000000000001",
  operationId: "60000000-0000-4000-8000-000000000001",
  storageRef: "70000000-0000-4000-8000-000000000001",
  correlationId: "80000000-0000-4000-8000-000000000001",
});

const principal = Object.freeze({ issuer: "https://issuer.test", subject: "synthetic-service" });
const binding = Object.freeze({
  operationId: ids.operationId,
  tenantId: ids.tenantId,
  exchangeSessionId: ids.sessionId,
  packageId: ids.packageId,
  studyRefId: ids.studyRefId,
  sourceHospitalId: ids.sourceHospitalId,
});

function queryText(query) {
  return typeof query === "string" ? query : query.text;
}

function createRunner(options = {}) {
  const { events } = options;
  let state = "AVAILABLE";
  let auditCount = 0;
  let reservedBytes = 100;
  let runCount = 0;
  return {
    get state() { return state; },
    get auditCount() { return auditCount; },
    get reservedBytes() { return reservedBytes; },
    async run(_principal, tenantId, work) {
      runCount += 1;
      const beforeState = state;
      const beforeAuditCount = auditCount;
      const beforeReservedBytes = reservedBytes;
      events?.push(`transaction-${runCount}:begin`);
      const client = {
        async query(query) {
          const text = queryText(query);
          if (text.includes("UPDATE study_references AS sr") && text.includes("SET temporary_payload_state = CASE")) {
            events?.push("metadata:pending");
            if (options.failQuery === "pending") throw new Error("injected metadata failure");
            if (!["STAGING", "AVAILABLE", "PURGE_PENDING", "PURGED"].includes(state)) {
              return { rowCount: 0, rows: [] };
            }
            if (state !== "PURGED") state = "PURGE_PENDING";
            return { rowCount: 1, rows: [] };
          }
          if (text.includes("UPDATE study_references AS sr") && text.includes("SET temporary_payload_state = 'PURGED'")) {
            events?.push("metadata:purged");
            if (state !== "PURGE_PENDING") return { rowCount: 0, rows: [] };
            state = "PURGED";
            return { rowCount: 1, rows: [] };
          }
          if (text.includes("release_temporary_payload_quota")) {
            events?.push("quota:release");
            if (state !== "PURGED") throw new Error("quota release must follow PURGED metadata");
            reservedBytes = 0;
            return { rowCount: 1, rows: [{ release_temporary_payload_quota: 100 }] };
          }
          if (text.includes("SELECT sr.temporary_payload_state")) {
            return { rowCount: 1, rows: [{ temporary_payload_state: state, temporary_storage_ref: ids.storageRef }] };
          }
          if (text.includes("INSERT INTO audit_events")) {
            events?.push("audit:success");
            if (options.failQuery === "audit") throw new Error("injected audit failure");
            auditCount += 1;
            return { rowCount: 1, rows: [] };
          }
          throw new Error("unexpected test SQL");
        },
      };
      const context = {
        issuer: principal.issuer,
        subject: principal.subject,
        actorId: ids.actorId,
        tenantId,
        hospitalId: null,
        actorType: "SERVICE",
      };
      try {
        const result = await work(context, client);
        events?.push(`transaction-${runCount}:commit`);
        if (options.ambiguousFinalCommit && runCount === 2) {
          throw new Error("injected response loss after committed final transaction");
        }
        return result;
      } catch (error) {
        if (!(options.ambiguousFinalCommit && runCount === 2 && state === "PURGED" && auditCount > beforeAuditCount)) {
          state = beforeState;
          auditCount = beforeAuditCount;
          reservedBytes = beforeReservedBytes;
          events?.push(`transaction-${runCount}:rollback`);
        }
        throw error;
      }
    },
  };
}

function createStore(events, { failures = 0 } = {}) {
  let remainingFailures = failures;
  return {
    get calls() { return failures - remainingFailures; },
    async purgeByReference(input) {
      expect(input.storageRef).toBe(ids.storageRef);
      expect(input.binding).toEqual({
        tenantId: ids.tenantId,
        exchangeSessionId: ids.sessionId,
        packageId: ids.packageId,
        purpose: "PACS_IMPORT",
      });
      events?.push("filesystem:purge");
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("injected unlink failure");
      }
    },
  };
}

function command(overrides = {}) {
  return {
    principal,
    tenantCandidate: ids.tenantId,
    binding,
    storageRef: ids.storageRef,
    correlationId: ids.correlationId,
    reason: "TTL_EXPIRED",
    ...overrides,
  };
}

describe("PACS-001 DEC-009 temporary payload purge coordinator", () => {
  it("commits PURGE_PENDING before physical purge and commits PURGED with one Audit afterward", async () => {
    const events = [];
    const runner = createRunner({ events });
    const store = createStore(events);
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, store);

    await expect(coordinator.purge(command())).resolves.toEqual({ kind: "PURGED" });

    expect(events).toEqual([
      "transaction-1:begin",
      "metadata:pending",
      "transaction-1:commit",
      "filesystem:purge",
      "transaction-2:begin",
      "metadata:purged",
      "quota:release",
      "audit:success",
      "transaction-2:commit",
    ]);
    expect(runner.state).toBe("PURGED");
    expect(runner.auditCount).toBe(1);
    expect(runner.reservedBytes).toBe(0);
  });

  it("does not touch storage if the pending metadata transaction fails", async () => {
    const events = [];
    const runner = createRunner({ events, failQuery: "pending" });
    const store = createStore(events);
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, store);

    await expect(coordinator.purge(command())).rejects.toMatchObject({
      name: "TemporaryPayloadPurgeUnavailableError",
      phase: "MARK_PENDING",
    });
    expect(events).not.toContain("filesystem:purge");
    expect(runner.state).toBe("AVAILABLE");
    expect(runner.auditCount).toBe(0);
  });

  it("retains PURGE_PENDING after unlink failure and converges on retry", async () => {
    const events = [];
    const runner = createRunner({ events });
    const store = createStore(events, { failures: 1 });
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, store);

    await expect(coordinator.purge(command())).rejects.toMatchObject({
      name: "TemporaryPayloadPurgeUnavailableError",
      phase: "PHYSICAL_PURGE",
    });
    expect(runner.state).toBe("PURGE_PENDING");
    expect(runner.auditCount).toBe(0);
    await expect(coordinator.purge(command())).resolves.toEqual({ kind: "PURGED" });
    expect(runner.state).toBe("PURGED");
    expect(runner.auditCount).toBe(1);
  });

  it("rolls back metadata when Audit fails and retries without losing the purge reference", async () => {
    const events = [];
    let failAudit = true;
    const runner = createRunner({ events, get failQuery() { return failAudit ? "audit" : undefined; } });
    const store = createStore(events);
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, store);

    await expect(coordinator.purge(command())).rejects.toMatchObject({
      name: "TemporaryPayloadPurgeUnavailableError",
      phase: "FINALIZE_AUDIT",
    });
    expect(runner.state).toBe("PURGE_PENDING");
    expect(runner.auditCount).toBe(0);
    expect(runner.reservedBytes).toBe(100);
    failAudit = false;
    await expect(coordinator.purge(command())).resolves.toEqual({ kind: "PURGED" });
    expect(runner.state).toBe("PURGED");
    expect(runner.auditCount).toBe(1);
    expect(runner.reservedBytes).toBe(0);
  });

  it("does not duplicate Audit after an ambiguous final commit and a retry", async () => {
    const events = [];
    let ambiguous = true;
    const runner = createRunner({ events, get ambiguousFinalCommit() { return ambiguous; } });
    const store = createStore(events);
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, store);

    await expect(coordinator.purge(command())).rejects.toMatchObject({
      name: "TemporaryPayloadPurgeUnavailableError",
      phase: "FINALIZE_AUDIT",
    });
    expect(runner.state).toBe("PURGED");
    expect(runner.auditCount).toBe(1);
    expect(runner.reservedBytes).toBe(0);
    ambiguous = false;
    await expect(coordinator.purge(command())).resolves.toEqual({ kind: "ALREADY_PURGED" });
    expect(runner.auditCount).toBe(1);
  });

  it("rejects cross-Tenant operation binding before opening a Tenant transaction", async () => {
    const events = [];
    const runner = createRunner({ events });
    const coordinator = new TemporaryPayloadPurgeCoordinator(runner, createStore(events));

    await expect(coordinator.purge(command({
      binding: { ...binding, tenantId: "10000000-0000-4000-8000-000000000002" },
    }))).rejects.toBeInstanceOf(TemporaryPayloadPurgeUnavailableError);
    expect(events).toEqual([]);
  });
});
