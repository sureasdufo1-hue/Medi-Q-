import { describe, expect, it, vi } from "vitest";
import {
  SourceIntegrityEvidenceConflictError,
  SourceIntegrityEvidencePersistenceError,
  SourceIntegrityEvidenceUnavailableError,
} from "../../services/api/dist/integrity/persistence/source-integrity-evidence.repository.js";
import { PostgresSourceIntegrityEvidenceRepository } from "../../services/api/dist/integrity/persistence/postgres-source-integrity-evidence.repository.js";

const ids = Object.freeze({
  integrity: "10000000-0000-4000-8000-000000000001",
  operation: "20000000-0000-4000-8000-000000000002",
  session: "30000000-0000-4000-8000-000000000003",
  package: "40000000-0000-4000-8000-000000000004",
  study: "50000000-0000-4000-8000-000000000005",
});
const now = new Date("2026-10-02T00:00:00.000Z");
const manifest = Object.freeze({
  algorithm: "SHA256-MANIFEST-V1",
  aggregateDigest: `sha256:${"a".repeat(64)}`,
  objectCount: 3,
  totalBytes: 1200,
});

function row(overrides = {}) {
  return {
    integrity_id: ids.integrity,
    operation_id: ids.operation,
    exchange_session_id: ids.session,
    package_id: ids.package,
    study_ref_id: ids.study,
    verification_stage: "SOURCE_CAPTURE",
    algorithm: manifest.algorithm,
    source_digest: manifest.aggregateDigest,
    source_object_count: manifest.objectCount,
    status: "PENDING",
    verified_at: null,
    created_at: now,
    ...overrides,
  };
}

describe("PostgresSourceIntegrityEvidenceRepository", () => {
  it("derives persisted scope and inserts only a PENDING source baseline", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row()], rowCount: 1 });
    const result = await new PostgresSourceIntegrityEvidenceRepository(
      { query },
      () => ids.integrity,
    ).createPendingSourceCapture({ operationId: ids.operation, manifest, now });

    expect(result).toEqual({
      created: true,
      record: {
        integrityId: ids.integrity,
        operationId: ids.operation,
        exchangeSessionId: ids.session,
        packageId: ids.package,
        studyRefId: ids.study,
        verificationStage: "SOURCE_CAPTURE",
        algorithm: manifest.algorithm,
        sourceDigest: manifest.aggregateDigest,
        sourceObjectCount: manifest.objectCount,
        status: "PENDING",
        verifiedAt: null,
        createdAt: now,
      },
    });

    const [statement, parameters] = query.mock.calls[0];
    expect(statement).toContain("FROM pacs_transfer_operations op");
    expect(statement).toContain("JOIN exchange_sessions e");
    expect(statement).toContain("JOIN study_references s");
    expect(statement).toContain("JOIN imaging_packages p");
    expect(statement).toContain("op.state = 'CREATED'");
    expect(statement).toContain("current_setting('mediq.tenant_id', true)");
    expect(statement).toContain("'SOURCE_CAPTURE'");
    expect(statement).toContain("'PENDING'");
    expect(statement).toContain("'PENDING', NULL, $5");
    expect(statement).not.toContain("destination_digest");
    expect(statement).not.toContain("destination_object_count");
    expect(statement).toContain("ON CONFLICT (operation_id, verification_stage)");
    expect(statement).not.toContain("UPDATE ");
    expect(statement).not.toContain("STOW");
    expect(parameters).toEqual([
      ids.integrity,
      manifest.algorithm,
      manifest.aggregateDigest,
      manifest.objectCount,
      now,
      ids.operation,
    ]);
  });

  it("returns the same immutable PENDING row on exact replay", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    const result = await new PostgresSourceIntegrityEvidenceRepository(
      { query },
      () => ids.integrity,
    ).createPendingSourceCapture({ operationId: ids.operation, manifest, now });

    expect(result.created).toBe(false);
    expect(result.record.integrityId).toBe(ids.integrity);
    expect(result.record.status).toBe("PENDING");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("FROM integrity_evidence");
    expect(query.mock.calls[1][0]).toContain("WHERE operation_id = $1");
    expect(query.mock.calls[1][1]).toEqual([ids.operation]);
  });

  it("does not replace an existing row when the replay manifest differs", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row({ source_object_count: 4 })], rowCount: 1 });
    await expect(
      new PostgresSourceIntegrityEvidenceRepository({ query }, () => ids.integrity)
        .createPendingSourceCapture({ operationId: ids.operation, manifest, now }),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidenceConflictError);
  });

  it("fails closed for a missing, ineligible, or Tenant-invisible operation", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      new PostgresSourceIntegrityEvidenceRepository({ query }, () => ids.integrity)
        .createPendingSourceCapture({ operationId: ids.operation, manifest, now }),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidenceUnavailableError);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("validates exact data-only inputs before issuing SQL", async () => {
    const query = vi.fn();
    const repository = new PostgresSourceIntegrityEvidenceRepository(
      { query },
      () => ids.integrity,
    );
    const invalidManifest = { ...manifest, aggregateDigest: "sha256:bad" };
    await expect(
      repository.createPendingSourceCapture({
        operationId: ids.operation,
        manifest: invalidManifest,
        now,
      }),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidencePersistenceError);

    const extra = { operationId: ids.operation, manifest, now, tenantId: ids.session };
    await expect(
      repository.createPendingSourceCapture(extra),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidencePersistenceError);

    const accessor = { manifest, now };
    Object.defineProperty(accessor, "operationId", {
      enumerable: true,
      get: () => ids.operation,
    });
    await expect(
      repository.createPendingSourceCapture(accessor),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidencePersistenceError);
    expect(query).not.toHaveBeenCalled();
  });

  it("sanitizes database errors and rejects malformed returned rows", async () => {
    const failedQuery = vi.fn().mockRejectedValue(new Error("sensitive detail"));
    await expect(
      new PostgresSourceIntegrityEvidenceRepository(
        { query: failedQuery },
        () => ids.integrity,
      ).createPendingSourceCapture({ operationId: ids.operation, manifest, now }),
    ).rejects.toMatchObject({ message: "SOURCE_INTEGRITY_EVIDENCE_PERSISTENCE_FAILED" });

    const malformedQuery = vi.fn().mockResolvedValue({
      rows: [row({ status: "VERIFIED" })],
      rowCount: 1,
    });
    await expect(
      new PostgresSourceIntegrityEvidenceRepository(
        { query: malformedQuery },
        () => ids.integrity,
      ).createPendingSourceCapture({ operationId: ids.operation, manifest, now }),
    ).rejects.toBeInstanceOf(SourceIntegrityEvidenceConflictError);
  });
});
