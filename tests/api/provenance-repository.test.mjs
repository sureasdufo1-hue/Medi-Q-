import { describe, expect, it, vi } from "vitest";
import {
  ProvenanceConflictError,
  ProvenancePersistenceError,
  ProvenanceUnavailableError,
} from "../../services/api/dist/provenance/persistence/provenance.repository.js";
import { PostgresProvenanceRepository } from "../../services/api/dist/provenance/persistence/postgres-provenance.repository.js";

const ids = Object.freeze({
  provenance: "10000000-0000-4000-8000-000000000001",
  operation: "20000000-0000-4000-8000-000000000002",
  session: "30000000-0000-4000-8000-000000000003",
  package: "40000000-0000-4000-8000-000000000004",
  study: "50000000-0000-4000-8000-000000000005",
  source: "60000000-0000-4000-8000-000000000006",
  destination: "70000000-0000-4000-8000-000000000007",
});
const now = new Date("2026-10-01T00:00:00.000Z");

function row(overrides = {}) {
  return {
    provenance_id: ids.provenance,
    operation_id: ids.operation,
    exchange_session_id: ids.session,
    package_id: ids.package,
    study_ref_id: ids.study,
    source_hospital_id: ids.source,
    destination_hospital_id: ids.destination,
    transfer_type: "PACS_IMPORT",
    transfer_status: "PENDING",
    created_at: now,
    ...overrides,
  };
}

describe("PostgresProvenanceRepository", () => {
  it("derives PACS binding in SQL and writes only PENDING using the operation reference", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const repository = new PostgresProvenanceRepository(
      { query },
      () => ids.provenance,
    );

    const result = await repository.createPendingForPacsImport({
      operationId: ids.operation,
      now,
    });

    expect(result).toEqual({
      created: true,
      record: {
        provenanceId: ids.provenance,
        operationId: ids.operation,
        exchangeSessionId: ids.session,
        packageId: ids.package,
        studyRefId: ids.study,
        sourceHospitalId: ids.source,
        destinationHospitalId: ids.destination,
        transferType: "PACS_IMPORT",
        transferStatus: "PENDING",
        createdAt: now,
      },
    });
    const [statement, parameters] = query.mock.calls[0];
    expect(statement).toContain("FROM pacs_transfer_operations op");
    expect(statement).toContain("JOIN exchange_sessions e");
    expect(statement).toContain("JOIN study_references s");
    expect(statement).toContain("JOIN imaging_packages p");
    expect(statement).toContain("op.state IN ('CREATED', 'PREFLIGHT_PASSED')");
    expect(statement).toContain("'PACS_IMPORT', 'PENDING'");
    expect(statement).not.toContain("'COMPLETED'");
    expect(statement).not.toContain("UPDATE ");
    expect(statement).not.toContain("STOW");
    expect(parameters).toEqual([ids.provenance, now, ids.operation]);
  });

  it("returns the same immutable PENDING row on replay without a second insert", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    const result = await new PostgresProvenanceRepository(
      { query },
      () => ids.provenance,
    ).createPendingForPacsImport({ operationId: ids.operation, now });

    expect(result.created).toBe(false);
    expect(result.record.provenanceId).toBe(ids.provenance);
    expect(result.record.transferStatus).toBe("PENDING");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("FROM provenance_records");
    expect(query.mock.calls[1][0]).toContain("WHERE operation_id = $1");
    expect(query.mock.calls[1][1]).toEqual([ids.operation]);
  });

  it("does not reveal a missing, non-eligible, or Tenant-invisible operation", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      new PostgresProvenanceRepository({ query }, () => ids.provenance)
        .createPendingForPacsImport({ operationId: ids.operation, now }),
    ).rejects.toBeInstanceOf(ProvenanceUnavailableError);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects a persisted non-PENDING or malformed binding instead of promoting it", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [row({ transfer_status: "COMPLETED" })],
      rowCount: 1,
    });
    await expect(
      new PostgresProvenanceRepository({ query }, () => ids.provenance)
        .createPendingForPacsImport({ operationId: ids.operation, now }),
    ).rejects.toBeInstanceOf(ProvenanceConflictError);
  });

  it("sanitizes database errors and validates identifiers before querying", async () => {
    const query = vi.fn().mockRejectedValue(new Error("sensitive database detail"));
    const repository = new PostgresProvenanceRepository(
      { query },
      () => ids.provenance,
    );
    await expect(
      repository.createPendingForPacsImport({ operationId: "bad-id", now }),
    ).rejects.toBeInstanceOf(ProvenancePersistenceError);
    expect(query).not.toHaveBeenCalled();

    await expect(
      repository.createPendingForPacsImport({ operationId: ids.operation, now }),
    ).rejects.toMatchObject({ message: "PROVENANCE_PERSISTENCE_FAILED" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.results[0].type).toBe("return");
  });
});
