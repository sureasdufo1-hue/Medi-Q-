import { describe, expect, it, vi } from "vitest";
import { AuthorizationContext } from "../../services/api/dist/authorization/domain/authorization-context.js";
import { PostgresAuthorizationEvidenceReader } from "../../services/api/dist/authorization/persistence/postgres-authorization-evidence.reader.js";

const ids = {
  actor: "03000000-0000-4000-8000-000000000002",
  tenant: "02000000-0000-4000-8000-000000000002",
  hospital: "04000000-0000-4000-8000-000000000002",
  session: "25000000-0000-4000-8000-000000000002",
  consent: "26000000-0000-4000-8000-000000000002",
  grant: "27000000-0000-4000-8000-000000000002",
  study: "28000000-0000-4000-8000-000000000002",
};

function context(kind = "STUDY") {
  return AuthorizationContext.create({
    identity: {
      issuer: "https://identity.synthetic.test",
      subject: "synthetic-aut005-user",
      actorId: ids.actor,
      tenantId: ids.tenant,
      hospitalId: ids.hospital,
      actorType: "USER",
    },
    exchangeSessionId: ids.session,
    resource: { kind, id: ids.study },
    action: "VIEW",
    consentId: ids.consent,
    grantId: ids.grant,
  });
}

function row() {
  return {
    session_id: ids.session,
    patient_ref_id: "29000000-0000-4000-8000-000000000002",
    source_hospital_id: "04000000-0000-4000-8000-000000000001",
    destination_hospital_id: ids.hospital,
    session_state: "AUTHORIZED",
    session_expires_at: null,
    consent_id: ids.consent,
    consent_session_id: ids.session,
    consent_patient_ref_id: "29000000-0000-4000-8000-000000000002",
    consent_source_hospital_id: "04000000-0000-4000-8000-000000000001",
    consent_destination_hospital_id: ids.hospital,
    consent_package_id: null,
    consent_status: "ACTIVE",
    consent_issued_at: new Date("2026-09-29T00:00:00.000Z"),
    consent_expires_at: null,
    consent_withdrawn_at: null,
    allowed_actions: ["VIEW"],
    grant_id: ids.grant,
    grant_session_id: ids.session,
    grant_consent_id: ids.consent,
    recipient_tenant_id: ids.tenant,
    recipient_hospital_id: ids.hospital,
    recipient_actor_id: null,
    grant_package_id: "2a000000-0000-4000-8000-000000000002",
    grant_status: "ACTIVE",
    grant_issued_at: new Date("2026-09-29T00:00:00.000Z"),
    grant_expires_at: new Date("2026-10-01T00:00:00.000Z"),
    grant_revoked_at: null,
    grant_scopes: ["study:view"],
    study_ref_id: ids.study,
    package_id: "2a000000-0000-4000-8000-000000000002",
    package_session_id: ids.session,
    package_patient_ref_id: "29000000-0000-4000-8000-000000000002",
    package_source_hospital_id: "04000000-0000-4000-8000-000000000001",
    package_state: "AVAILABLE",
    retention_expires_at: null,
    package_deleted_at: null,
  };
}

describe("PostgresAuthorizationEvidenceReader", () => {
  it("binds only internal identifiers and maps complete server evidence", async () => {
    const transactionClient = { query: vi.fn().mockResolvedValue({ rows: [row()] }) };
    const reader = new PostgresAuthorizationEvidenceReader();

    const facts = await reader.resolve(context(), transactionClient);

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(transactionClient.query.mock.calls[0][1]).toEqual([
      ids.session,
      ids.consent,
      ids.grant,
      ids.study,
    ]);
    expect(facts.exchangeSession.sessionId).toBe(ids.session);
    expect(facts.consent.allowedActions).toEqual(["VIEW"]);
    expect(facts.transferGrant.scopes).toEqual(["study:view"]);
    expect(facts.resourceBinding).toMatchObject({
      kind: "STUDY",
      resourceId: ids.study,
      studyRefId: ids.study,
      imagingPackageId: row().package_id,
    });
    expect(transactionClient.query.mock.calls[0][0]).not.toMatch(/study_instance_uid|storage_ref|local_patient_id|SELECT\s+\*/i);
  });

  it.each(["SERIES", "INSTANCE"])
    ("refuses unsupported %s resource without querying persistence", async (kind) => {
      const transactionClient = { query: vi.fn() };
      const reader = new PostgresAuthorizationEvidenceReader();

      await expect(reader.resolve(context(kind), transactionClient)).resolves.toBeNull();
      expect(transactionClient.query).not.toHaveBeenCalled();
    });

  it("returns no evidence for absent or ambiguous joined rows", async () => {
    const reader = new PostgresAuthorizationEvidenceReader();
    const absentClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const ambiguousClient = { query: vi.fn().mockResolvedValue({ rows: [row(), row()] }) };

    await expect(reader.resolve(context(), absentClient)).resolves.toBeNull();
    await expect(reader.resolve(context(), ambiguousClient)).resolves.toBeNull();
  });

  it("lets persistence failures propagate only to the fail-closed policy boundary", async () => {
    const transactionClient = { query: vi.fn().mockRejectedValue(new Error("synthetic-db-failure")) };
    const reader = new PostgresAuthorizationEvidenceReader();

    await expect(reader.resolve(context(), transactionClient)).rejects.toThrow("synthetic-db-failure");
  });
});
