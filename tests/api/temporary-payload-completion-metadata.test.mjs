import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresTemporaryPayloadMetadataRepository,
  TemporaryPayloadMetadataPersistenceError,
} from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";

// Repository/SQL parameter contracts only, not a substitute for PostgreSQL,
// RLS, Authorization or atomic source-evidence/Audit integration acceptance.
const binding = Object.freeze({
  operationId: randomUUID(), tenantId: randomUUID(), exchangeSessionId: randomUUID(),
  packageId: randomUUID(), studyRefId: randomUUID(), sourceHospitalId: randomUUID(),
});
const storageRef = randomUUID();
const now = new Date("2026-10-03T06:00:00Z");
const expiresAt = new Date(now.getTime() + 30 * 60_000);
const request = () => ({ binding, storageRef, now: new Date(now), expiresAt: new Date(expiresAt) });
function setup(result = { rowCount: 1 }) {
  const query = vi.fn(async () => result);
  return { query, repository: new PostgresTemporaryPayloadMetadataRepository({ query }) };
}

describe("DEC-017 exact receipt-expiry metadata completion (SQL contract)", () => {
  it("sets AVAILABLE and the supplied receipt expiry in the same exact scoped CAS", async () => {
    const { query, repository } = setup();
    const input = request();
    await repository.completeStaging(input);
    expect(query).toHaveBeenCalledOnce();
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual([
      binding.studyRefId, binding.packageId, binding.sourceHospitalId, storageRef,
      now, binding.tenantId, binding.operationId, binding.exchangeSessionId, expiresAt,
    ]);
    expect(parameters[4]).not.toBe(input.now);
    expect(parameters[8]).not.toBe(input.expiresAt);
    expect(sql).toContain("SET temporary_payload_state = 'AVAILABLE'");
    expect(sql).toContain("temporary_payload_expires_at = COALESCE($9::timestamptz, sr.temporary_payload_expires_at)");
    for (const predicate of [
      "sr.temporary_payload_state = 'STAGING'", "sr.temporary_storage_ref = $4::uuid",
      "sr.temporary_payload_expires_at > $5", "current_setting('mediq.tenant_id', true)",
      "op.state = 'CREATED'", "op.tenant_id = $6::uuid", "op.study_ref_id = sr.study_ref_id",
      "p.patient_ref_id = e.patient_ref_id", "sr.source_hospital_id = e.source_hospital_id",
    ]) expect(sql).toContain(predicate);
  });

  it("uses a receipt completed earlier without resetting its remaining TTL", async () => {
    const { query, repository } = setup();
    const receiptExpiry = new Date(now.getTime() + 29 * 60_000);
    await repository.completeStaging({ ...request(), expiresAt: receiptExpiry });
    expect(query.mock.calls[0][1][8].getTime()).toBe(receiptExpiry.getTime());
  });

  it.each([
    ["missing", undefined], ["null", null], ["invalid", new Date(NaN)],
    ["expired", new Date(now.getTime() - 1)], ["at expiry", now],
    ["over 30 minutes", new Date(expiresAt.getTime() + 1)],
  ])("rejects %s receipt expiry before SQL", async (_label, expiry) => {
    const { query, repository } = setup();
    await expect(repository.completeStaging({ ...request(), expiresAt: expiry }))
      .rejects.toBeInstanceOf(TemporaryPayloadMetadataPersistenceError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([undefined, new Date(NaN)])("rejects invalid completion time before SQL (%s)", async (invalidNow) => {
    const { query, repository } = setup();
    await expect(repository.completeStaging({ ...request(), now: invalidNow }))
      .rejects.toBeInstanceOf(TemporaryPayloadMetadataPersistenceError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([0, 2])("rejects a non-exact CAS row count (%s) with a fixed error", async (rowCount) => {
    const { query, repository } = setup({ rowCount });
    await expect(repository.completeStaging(request())).rejects.toMatchObject({
      name: "TemporaryPayloadMetadataPersistenceError", message: "TEMPORARY_PAYLOAD_METADATA_UNAVAILABLE",
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not expose raw SQL failure details", async () => {
    const { query, repository } = setup();
    query.mockRejectedValue(new Error("TEST-PRIVATE-DIAGNOSTIC-NOT-FOR-OUTPUT"));
    await expect(repository.completeStaging(request())).rejects.toMatchObject({
      name: "TemporaryPayloadMetadataPersistenceError", message: "TEMPORARY_PAYLOAD_METADATA_UNAVAILABLE",
    });
  });

  it("preserves the old-expiry contract of legacy markAvailable callers", async () => {
    const { query, repository } = setup();
    await repository.markAvailable({ binding, storageRef, now });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1][8]).toBeNull();
  });
});
