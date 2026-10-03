import { describe, expect, it, vi } from "vitest";
import { TemporaryPayloadExpiryRunner } from "../../services/api/dist/imaging-storage/application/temporary-payload-expiry.runner.js";
import { TemporaryPayloadPurgeCoordinator } from "../../services/api/dist/imaging-storage/application/temporary-payload-purge.coordinator.js";
import { PostgresTemporaryPayloadMetadataRepository } from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";

const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const principal = Object.freeze({ issuer: "https://synthetic.test", subject: "TEST-CLEANUP" });
const now = new Date("2026-10-03T01:00:00Z");
const command = (extra = {}) => ({ principal, tenantCandidate: uuid(1), correlationId: uuid(2), ...extra });
function row(n = 10, extra = {}) {
  return {
    operation_id: uuid(n), tenant_id: uuid(1), exchange_session_id: uuid(3),
    package_id: uuid(4), study_ref_id: uuid(n + 100), source_hospital_id: uuid(5),
    temporary_storage_ref: uuid(n + 200), temporary_payload_state: "AVAILABLE",
    temporary_payload_expires_at: new Date(now.getTime() - 1000), ...extra,
  };
}
function purgeCommand(candidate, extra = {}) {
  return { ...command(), reason: "TTL_EXPIRED", storageRef: candidate.temporary_storage_ref,
    binding: { operationId: candidate.operation_id, tenantId: candidate.tenant_id,
      exchangeSessionId: candidate.exchange_session_id, packageId: candidate.package_id,
      studyRefId: candidate.study_ref_id, sourceHospitalId: candidate.source_hospital_id }, ...extra };
}

// Narrow transaction model, not PostgreSQL/RLS proof. The real DB suite is separate.
function harness(initial = [row()], options = {}) {
  let rows = structuredClone(initial);
  let open = false;
  let runs = 0;
  const audits = [];
  const events = [];
  const query = vi.fn(async (sql, args) => {
    if (sql.startsWith("SELECT candidate.*")) {
      expect(sql).toContain("op.tenant_id = $1::uuid");
      expect(sql).toContain("p.patient_ref_id");
      expect(sql).toContain("e.source_hospital_id = sr.source_hospital_id");
      expect(sql).toContain("current_setting('mediq.tenant_id', true)");
      expect(sql).toContain("ORDER BY candidate.temporary_payload_expires_at, candidate.study_ref_id");
      expect(sql).toContain("LIMIT $3");
      const candidates = rows.filter((r) => r.tenant_id === args[0] && r.temporary_storage_ref &&
        ["STAGING", "AVAILABLE", "PURGE_PENDING"].includes(r.temporary_payload_state) &&
        r.temporary_payload_expires_at && r.temporary_payload_expires_at <= args[1])
        .sort((a, b) => a.temporary_payload_expires_at - b.temporary_payload_expires_at || a.study_ref_id.localeCompare(b.study_ref_id));
      return { rows: structuredClone(candidates.slice(0, args[2])) };
    }
    if (sql.includes("SET temporary_payload_state = CASE")) {
      expect(sql).toContain("sr.temporary_payload_expires_at <= $8::timestamptz");
      expect(args[7]).toBeInstanceOf(Date);
      const match = rows.find((r) => r.study_ref_id === args[0] && r.temporary_storage_ref === args[3] &&
        r.tenant_id === args[4] && r.temporary_payload_expires_at <= args[7]);
      if (!match) return { rowCount: 0 };
      if (match.temporary_payload_state !== "PURGED") match.temporary_payload_state = "PURGE_PENDING";
      return { rowCount: 1 };
    }
    if (sql.includes("SET temporary_payload_state = 'PURGED'")) {
      const match = rows.find((r) => r.study_ref_id === args[0] && r.temporary_payload_state === "PURGE_PENDING");
      if (!match) return { rowCount: 0 };
      match.temporary_payload_state = "PURGED";
      return { rowCount: 1 };
    }
    if (sql.includes("release_temporary_payload_quota")) return { rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events")) { audits.push(args); return { rowCount: 1 }; }
    if (sql.includes("SELECT sr.temporary_payload_state")) {
      return { rows: rows.filter((r) => r.study_ref_id === args[0]) };
    }
    throw new Error("UNEXPECTED_TEST_QUERY");
  });
  const tenantRunner = { run: vi.fn(async (p, tenant, work) => {
    const run = ++runs;
    expect(open).toBe(false);
    await options.beforeRun?.(run, rows, p);
    const prior = structuredClone(rows);
    const priorAudits = audits.length;
    open = true;
    events.push("begin");
    try {
      const context = { ...p, actorId: uuid(6), tenantId: tenant, actorType: "SERVICE", hospitalId: null,
        ...options.context?.(run) };
      const result = await work(context, { query });
      open = false;
      events.push("commit");
      await options.afterCommit?.(run, rows);
      return result;
    } catch (error) {
      rows = prior;
      audits.length = priorAudits;
      open = false;
      events.push("rollback");
      throw error;
    }
  }) };
  const store = { purgeByReference: vi.fn(async (input) => {
    expect(open).toBe(false);
    events.push("physical");
    await options.physical?.(input, rows);
  }) };
  const clock = options.clock ?? (() => now);
  return { runner: new TemporaryPayloadExpiryRunner(tenantRunner, store, clock),
    purge: new TemporaryPayloadPurgeCoordinator(tenantRunner, store, clock), tenantRunner,
    query, store, events, audits, get rows() { return rows; } };
}

describe("DEC-016 verified SERVICE expiry batch (unit/model only)", () => {
  it("selects only expired eligible rows for its Tenant, preserves siblings and returns aggregate-only results", async () => {
    const h = harness([row(10, { temporary_payload_state: "STAGING" }), row(11),
      row(12, { temporary_payload_state: "PURGE_PENDING" }),
      row(13, { tenant_id: uuid(9) }), row(14, { temporary_payload_expires_at: new Date(now.getTime() + 1) }),
      row(15, { temporary_payload_state: "PURGED" }), row(16, { temporary_storage_ref: null })]);
    expect(await h.runner.run(command())).toEqual({ attempted: 3, purged: 3, alreadyPurged: 0, retryable: 0, hasMore: false });
    expect(h.store.purgeByReference).toHaveBeenCalledTimes(3);
    expect(h.audits).toHaveLength(3);
    expect(h.rows[3].temporary_payload_state).toBe("AVAILABLE");
    expect(h.rows[4].temporary_payload_state).toBe("AVAILABLE");
    expect(h.events.slice(0, 7)).toEqual(["begin", "commit", "begin", "commit", "physical", "begin", "commit"]);
    expect(h.query.mock.calls[0][1][2]).toBe(51);
    expect(await h.runner.run(command())).toEqual({ attempted: 0, purged: 0, alreadyPurged: 0, retryable: 0, hasMore: false });
  });

  it.each([0, -1, 101, 1.5, NaN, Infinity, null, "1"])("rejects invalid batch limit %s before transaction", async (batchLimit) => {
    const h = harness();
    await expect(h.runner.run(command({ batchLimit }))).rejects.toMatchObject({ phase: "VALIDATION" });
    expect(h.tenantRunner.run).not.toHaveBeenCalled();
  });

  it.each([1, 100])("bounds discovery and attempted effects at limit %s", async (batchLimit) => {
    const h = harness(Array.from({ length: batchLimit + 1 }, (_, i) => row(i + 10)));
    const result = await h.runner.run(command({ batchLimit }));
    expect(result.attempted).toBe(batchLimit);
    expect(result.hasMore).toBe(true);
    expect(h.query.mock.calls[0][1][2]).toBe(batchLimit + 1);
    expect(h.store.purgeByReference).toHaveBeenCalledTimes(batchLimit);
  });

  it.each([null, undefined, {}, { issuer: principal.issuer, subject: "" }])("rejects missing/invalid identity before transaction", async (p) => {
    const h = harness();
    await expect(h.runner.run(command({ principal: p }))).rejects.toMatchObject({ phase: "VALIDATION" });
    expect(h.query).not.toHaveBeenCalled();
  });

  it.each([{ actorType: "USER" }, { hospitalId: uuid(5) }, { tenantId: uuid(9) },
    { subject: "WRONG" }, { issuer: "https://wrong.test" }, { actorId: "bad" }])("denies invalid verified context before candidate SQL", async (context) => {
    const h = harness(undefined, { context: () => context });
    await expect(h.runner.run(command())).rejects.toMatchObject({ phase: "DISCOVERY", message: "TEMPORARY_PAYLOAD_EXPIRY_UNAVAILABLE" });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
  });

  it("does not disguise identity/DB discovery failure as empty success", async () => {
    const h = harness(undefined, { beforeRun: () => { throw new Error("SENSITIVE_DIAGNOSTIC"); } });
    await expect(h.runner.run(command())).rejects.toMatchObject({ phase: "DISCOVERY", message: "TEMPORARY_PAYLOAD_EXPIRY_UNAVAILABLE" });
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
  });

  it.each(["ref", "expiry"])("rejects stale %s after discovery before filesystem", async (change) => {
    const h = harness(undefined, { afterCommit(run, rows) {
      if (run !== 1) return;
      if (change === "ref") rows[0].temporary_storage_ref = uuid(999);
      else rows[0].temporary_payload_expires_at = new Date(now.getTime() + 1);
    } });
    expect((await h.runner.run(command())).retryable).toBe(1);
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
    expect(h.audits).toHaveLength(0);
  });

  it("checks SERVICE again before deletion and does not allow direct TTL bypass", async () => {
    const h = harness(undefined, { context: (run) => run > 1 ? { actorType: "USER" } : {} });
    expect((await h.runner.run(command())).retryable).toBe(1);
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
    await expect(h.purge.purge(purgeCommand(row()))).rejects.toMatchObject({ phase: "MARK_PENDING" });
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
  });

  it("keeps post-unlink identity loss retryable without fabricated Audit", async () => {
    let revoked = false;
    const h = harness(undefined, { context: () => revoked ? { actorType: "USER" } : {}, physical: () => { revoked = true; } });
    expect((await h.runner.run(command())).retryable).toBe(1);
    expect(h.rows[0].temporary_payload_state).toBe("PURGE_PENDING");
    expect(h.audits).toHaveLength(0);
    revoked = false;
    // Remove the fault so recovery can complete.
    h.store.purgeByReference.mockImplementationOnce(async () => {});
    expect((await h.runner.run(command())).purged).toBe(1);
    expect(h.audits).toHaveLength(1);
  });

  it("continues healthy work after partial failure and converges on retry", async () => {
    let fail = true;
    const h = harness([row(10), row(11)], { physical: (input) => {
      if (fail && input.storageRef === row(10).temporary_storage_ref) throw new Error("SENSITIVE_PATH");
    } });
    expect(await h.runner.run(command())).toEqual({ attempted: 2, purged: 1, alreadyPurged: 0, retryable: 1, hasMore: false });
    expect(h.rows[0].temporary_payload_state).toBe("PURGE_PENDING");
    fail = false;
    expect((await h.runner.run(command())).purged).toBe(1);
    expect(h.audits).toHaveLength(2);
    expect(await h.purge.purge(purgeCommand(row(10)))).toEqual({ kind: "ALREADY_PURGED" });
    expect(h.audits).toHaveLength(2);
  });

  it("snapshots principal, Tenant, correlation, limit, reason and binding across awaits", async () => {
    const mutable = command({ principal: { ...principal }, batchLimit: 1 });
    const h = harness(undefined, { beforeRun(run, _rows, p) {
      expect(p).toEqual(principal);
      if (run === 1) { mutable.principal.subject = "CHANGED"; mutable.tenantCandidate = uuid(9); mutable.correlationId = uuid(999); mutable.batchLimit = 100; }
    } });
    expect((await h.runner.run(mutable)).purged).toBe(1);
    expect(h.query.mock.calls[0][1][2]).toBe(2);
    const direct = purgeCommand(row(), { principal: { ...principal } });
    const h2 = harness(undefined, { afterCommit(run) {
      if (run !== 1) return;
      direct.reason = "EXPLICIT_CLOSE"; direct.principal.subject = "CHANGED";
      direct.binding.tenantId = uuid(9); direct.storageRef = uuid(999);
    } });
    await expect(h2.purge.purge(direct)).resolves.toEqual({ kind: "PURGED" });
    expect(h2.audits[0]).toContain("TTL_EXPIRED");
  });

  it.each([new Date(NaN), null, "2026-10-03"])("denies invalid clock before query/physical effects", async (time) => {
    const h = harness(undefined, { clock: () => time });
    await expect(h.runner.run(command())).rejects.toMatchObject({ phase: "DISCOVERY" });
    await expect(h.purge.purge(purgeCommand(row()))).rejects.toMatchObject({ phase: "MARK_PENDING" });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.store.purgeByReference).not.toHaveBeenCalled();
  });

  it("rejects malformed or cross-Tenant database candidates with fixed errors", async () => {
    for (const bad of [row(10, { tenant_id: uuid(9) }), row(10, { temporary_storage_ref: "SENSITIVE_PATH" })]) {
      const repo = new PostgresTemporaryPayloadMetadataRepository({ query: async () => ({ rows: [bad] }) });
      await expect(repo.findExpired({ tenantId: uuid(1), now, limit: 1 })).rejects.toThrow("TEMPORARY_PAYLOAD_METADATA_UNAVAILABLE");
    }
  });
});
