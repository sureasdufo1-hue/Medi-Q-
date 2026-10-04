import { describe, expect, it, vi } from "vitest";
import { AuditEvent, InvalidAuditEventError } from "../../services/api/dist/audit/domain/audit-event.js";
import {
  AuditEventPersistenceError,
  PostgresAuditEventWriter,
} from "../../services/api/dist/audit/persistence/postgres-audit-event-writer.js";

const ids = Object.freeze({
  audit: "a0000000-0000-4000-8000-000000000001",
  actor: "a0000000-0000-4000-8000-000000000002",
  tenant: "a0000000-0000-4000-8000-000000000003",
  session: "a0000000-0000-4000-8000-000000000004",
  resource: "a0000000-0000-4000-8000-000000000005",
  correlation: "a0000000-0000-4000-8000-000000000006",
});

const knownAt = new Date("2026-10-01T00:00:00.000Z");

function input(overrides = {}) {
  return {
    auditEventId: ids.audit,
    occurredAt: knownAt,
    actorId: ids.actor,
    tenantId: ids.tenant,
    exchangeSessionId: ids.session,
    resourceType: "EXCHANGE_SESSION",
    resourceId: ids.session,
    action: "SESSION_CREATED",
    result: "SUCCESS",
    reasonCode: null,
    correlationId: ids.correlation,
    createdAt: knownAt,
    ...overrides,
  };
}

describe("AuditEvent", () => {
  it("TC-INT-001-CAP-011 accepts only fixed event/resource/result/reason combinations", () => {
    const allowed = [
      ["SESSION_CREATED", "EXCHANGE_SESSION", "SUCCESS", null],
      ["CONSENT_REQUESTED", "CONSENT", "SUCCESS", null],
      ["CONSENT_APPROVED", "CONSENT", "SUCCESS", null],
      ["CONSENT_WITHDRAWN", "CONSENT", "SUCCESS", null],
      ["AUTHORIZATION_GRANTED", "TRANSFER_GRANT", "ALLOW", null],
      ["AUTHORIZATION_DENIED", "EXCHANGE_SESSION", "DENY", "GRANT_ISSUE_DENIED"],
      ["AUTHORIZATION_DENIED", "EXCHANGE_SESSION", "DENY", "GRANT_REVOKE_DENIED"],
      ["GRANT_DENIED", "EXCHANGE_SESSION", "DENY", "GRANT_ISSUE_DENIED"],
      ["GRANT_DENIED", "EXCHANGE_SESSION", "DENY", "GRANT_REVOKE_DENIED"],
      ["GRANT_CREATED", "TRANSFER_GRANT", "SUCCESS", null],
      ["GRANT_REVOKED", "TRANSFER_GRANT", "SUCCESS", null],
      ["PACS_TRANSFER_FAILED", "STUDY", "FAILURE", "PATIENT_MAPPING_INVALID"],
      ["PACS_SOURCE_CAPTURE_STARTED", "STUDY", "ALLOW", null],
      ["PACS_SOURCE_CAPTURED", "STUDY", "SUCCESS", null],
      ["PACS_SOURCE_CAPTURE_DENIED", "STUDY", "DENY", "AUTHORIZATION_DENIED"],
      ["PACS_SOURCE_CAPTURE_DENIED", "STUDY", "DENY", "OPERATION_NOT_CAPTUREABLE"],
      ["PACS_SOURCE_CAPTURE_DENIED", "STUDY", "DENY", "PATIENT_MAPPING_INVALID"],
      ["PACS_SOURCE_CAPTURE_DENIED", "STUDY", "DENY", "SOURCE_PATIENT_ID_MISMATCH"],
      ["PACS_SOURCE_CAPTURE_DENIED", "STUDY", "DENY", "SOURCE_METADATA_INVALID"],
      ["PACS_SOURCE_CAPTURE_FAILED", "STUDY", "FAILURE", "SOURCE_READ_FAILED"],
      ["PACS_SOURCE_CAPTURE_FAILED", "STUDY", "FAILURE", "SOURCE_CAPTURE_CANCELLED"],
      ["PACS_SOURCE_CAPTURE_FAILED", "STUDY", "FAILURE", "SOURCE_CAPTURE_DEADLINE"],
      ["PACS_SOURCE_CAPTURE_FAILED", "STUDY", "FAILURE", "SOURCE_CAPTURE_PERSISTENCE_FAILED"],
      ["PACS_TEMPORARY_READ_AUTHORIZED", "STUDY", "ALLOW", "BEFORE_DECRYPT"],
      ["PACS_TEMPORARY_READ_AUTHORIZED", "STUDY", "ALLOW", "BEFORE_DELIVERY"],
      ["PACS_TEMPORARY_READ_FAILED", "STUDY", "FAILURE", "TEMPORARY_READ_FAILED"],
      ...["BEFORE_IDENTITY", "AFTER_IDENTITY", "BEFORE_BYTES", "AFTER_BYTES", "FINAL"]
        .map(phase => ["PACS_DESTINATION_VERIFY_AUTHORIZED", "STUDY", "ALLOW", phase]),
      ["PACS_DESTINATION_VERIFY_FAILED", "STUDY", "FAILURE", "DESTINATION_VERIFY_FAILED"],
      ["PACS_TRANSFER_COMPLETED", "STUDY", "SUCCESS", null],
      ["INTEGRITY_VERIFIED", "STUDY", "SUCCESS", null],
      ["SESSION_COMPLETED", "EXCHANGE_SESSION", "SUCCESS", null],
    ];

    for (const [action, resourceType, result, reasonCode] of allowed) {
      expect(() => AuditEvent.create(input({ action, resourceType, result, reasonCode }))).not.toThrow();
    }
  });

  it.each([
    ["unknown action", { action: "VIEWER_OPENED" }],
    ["destination admission is not completion", { action: "PACS_DESTINATION_VERIFY_AUTHORIZED", resourceType: "STUDY", result: "SUCCESS", reasonCode: "FINAL" }],
    ["destination admission missing phase", { action: "PACS_DESTINATION_VERIFY_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: null }],
    ["destination admission missing Session", { action: "PACS_DESTINATION_VERIFY_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: "BEFORE_BYTES", exchangeSessionId: null }],
    ["destination admission missing resource", { action: "PACS_DESTINATION_VERIFY_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: "AFTER_BYTES", resourceId: null }],
    ["destination admission wrong resource type", { action: "PACS_DESTINATION_VERIFY_AUTHORIZED", result: "ALLOW", reasonCode: "BEFORE_IDENTITY" }],
    ["destination failed reason excludes upstream details", { action: "PACS_DESTINATION_VERIFY_FAILED", resourceType: "STUDY", result: "FAILURE", reasonCode: "PRIVATE_PACS_RESPONSE" }],
    ["destination failure cannot be success", { action: "PACS_DESTINATION_VERIFY_FAILED", resourceType: "STUDY", result: "SUCCESS", reasonCode: "DESTINATION_VERIFY_FAILED" }],
    ["destination failure requires bound Session", { action: "PACS_DESTINATION_VERIFY_FAILED", resourceType: "STUDY", result: "FAILURE", reasonCode: "DESTINATION_VERIFY_FAILED", exchangeSessionId: null }],
    ["transfer completion cannot report failure", { action: "PACS_TRANSFER_COMPLETED", resourceType: "STUDY", result: "FAILURE", reasonCode: null }],
    ["integrity verification cannot report failure", { action: "INTEGRITY_VERIFIED", resourceType: "STUDY", result: "FAILURE", reasonCode: null }],
    ["session completion requires Session resource binding", { action: "SESSION_COMPLETED", resourceType: "EXCHANGE_SESSION", result: "SUCCESS", reasonCode: null, resourceId: ids.resource }],
    ["read admission is not delivery", { action: "PACS_TEMPORARY_READ_AUTHORIZED", resourceType: "STUDY", result: "SUCCESS", reasonCode: "BEFORE_DELIVERY" }],
    ["read reason cannot contain identifiers", { action: "PACS_TEMPORARY_READ_FAILED", resourceType: "STUDY", result: "FAILURE", reasonCode: "TEST-PRIVATE-PATIENT" }],
    ["read admission requires phase", { action: "PACS_TEMPORARY_READ_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: null }],
    ["read admission requires Session", { action: "PACS_TEMPORARY_READ_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: "BEFORE_DECRYPT", exchangeSessionId: null }],
    ["read admission requires resource", { action: "PACS_TEMPORARY_READ_AUTHORIZED", resourceType: "STUDY", result: "ALLOW", reasonCode: "BEFORE_DECRYPT", resourceId: null }],
    ["action/result mismatch", { action: "SESSION_CREATED", result: "ALLOW" }],
    ["GRANT_DENIED result mismatch", { action: "GRANT_DENIED", result: "FAILURE", reasonCode: "GRANT_ISSUE_DENIED" }],
    ["resource mismatch", { action: "CONSENT_APPROVED", resourceType: "EXCHANGE_SESSION" }],
    ["GRANT_DENIED resource mismatch", { action: "GRANT_DENIED", resourceType: "TRANSFER_GRANT", result: "DENY", reasonCode: "GRANT_ISSUE_DENIED" }],
    ["unknown reason", { action: "PACS_TRANSFER_FAILED", resourceType: "STUDY", result: "FAILURE", reasonCode: "free text" }],
    ["source capture free-form failure reason", { action: "PACS_SOURCE_CAPTURE_FAILED", resourceType: "STUDY", result: "FAILURE", reasonCode: "upstream patient TEST-PHI" }],
    ["source capture wrong result", { action: "PACS_SOURCE_CAPTURE_STARTED", resourceType: "STUDY", result: "SUCCESS", reasonCode: null }],
    ["source capture wrong resource", { action: "PACS_SOURCE_CAPTURED", resourceType: "EXCHANGE_SESSION", result: "SUCCESS", reasonCode: null }],
    ["source capture denial wrong result", { action: "PACS_SOURCE_CAPTURE_DENIED", resourceType: "STUDY", result: "SUCCESS", reasonCode: "AUTHORIZATION_DENIED" }],
    ["source capture failure wrong result", { action: "PACS_SOURCE_CAPTURE_FAILED", resourceType: "STUDY", result: "DENY", reasonCode: "SOURCE_READ_FAILED" }],
    ["GRANT_DENIED free-form reason", { action: "GRANT_DENIED", result: "DENY", reasonCode: "policy detail" }],
    ["missing required session", { exchangeSessionId: null }],
    ["source capture missing session", { action: "PACS_SOURCE_CAPTURE_STARTED", resourceType: "STUDY", result: "ALLOW", exchangeSessionId: null }],
    ["source capture missing Study reference", { action: "PACS_SOURCE_CAPTURED", resourceType: "STUDY", result: "SUCCESS", resourceId: null }],
    ["non-UUID Audit event id", { auditEventId: "TEST-AUDIT" }],
    ["non-UUID actor", { actorId: "TEST-ACTOR" }],
    ["non-UUID Tenant", { tenantId: "TEST-TENANT" }],
    ["non-UUID Session", { exchangeSessionId: "TEST-SESSION" }],
    ["non-UUID Study reference", { action: "PACS_SOURCE_CAPTURED", resourceType: "STUDY", result: "SUCCESS", resourceId: "2.25.12345" }],
    ["non-UUID correlation", { correlationId: "TEST-CORRELATION" }],
    ["invalid date", { occurredAt: new Date(Number.NaN) }],
    ["invalid created timestamp", { createdAt: new Date(Number.NaN) }],
    ["DICOM Study UID field", { studyInstanceUid: "2.25.12345" }],
    ["DICOM Series UID field", { seriesInstanceUid: "2.25.12346" }],
    ["DICOM SOP Instance UID field", { sopInstanceUid: "2.25.12347" }],
    ["local PatientID field", { patientId: "TEST-PATIENT-007" }],
    ["DICOM payload field", { payload: "SYNTHETIC-DICOM-BYTES" }],
    ["credential field", { credential: "TEST-ONLY-CREDENTIAL" }],
    ["token field", { token: "TEST-ONLY-TOKEN" }],
    ["key field", { key: "TEST-ONLY-KEY" }],
    ["free-text diagnostic field", { errorMessage: "Synthetic upstream detail" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => AuditEvent.create(input(overrides))).toThrow(InvalidAuditEventError);
  });

  it.each(["AUTHORIZATION_DENIED", "GRANT_DENIED"])("allows a missing session only for the %s denial shape", (action) => {
    expect(() => AuditEvent.create(input({
      exchangeSessionId: null,
      resourceId: null,
      action,
      resourceType: "EXCHANGE_SESSION",
      result: "DENY",
      reasonCode: "GRANT_ISSUE_DENIED",
    }))).not.toThrow();
  });

  it("rejects non-enumerable and symbol-backed extra fields", () => {
    const hidden = input();
    Object.defineProperty(hidden, "hiddenPayload", { value: "TEST-PHI" });
    const symbol = input();
    symbol[Symbol("payload")] = "TEST-PHI";
    expect(() => AuditEvent.create(hidden)).toThrow(InvalidAuditEventError);
    expect(() => AuditEvent.create(symbol)).toThrow(InvalidAuditEventError);
  });

  it("keeps timestamps immutable through copies", () => {
    const sourceDate = new Date(knownAt);
    const event = AuditEvent.create(input({ occurredAt: sourceDate }));
    sourceDate.setUTCFullYear(2030);
    const exposed = event.occurredAt;
    exposed.setUTCFullYear(2040);
    expect(event.snapshot().occurredAt.toISOString()).toBe(knownAt.toISOString());
  });
});

describe("PostgresAuditEventWriter", () => {
  it("uses only the exact 12-column parameterized INSERT contract", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const writer = new PostgresAuditEventWriter({ query });
    const event = AuditEvent.create(input());
    await writer.record(event);

    expect(query).toHaveBeenCalledOnce();
    const [statement, values] = query.mock.calls[0];
    expect(statement).toMatch(/INSERT INTO audit_events/i);
    expect(statement).toMatch(/\(audit_event_id, occurred_at, actor_id, tenant_id,\s*exchange_session_id, resource_type, resource_id, action,\s*result, reason_code, correlation_id, created_at\)/i);
    expect(statement).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12\)/i);
    expect(values).toEqual([
      ids.audit,
      knownAt,
      ids.actor,
      ids.tenant,
      ids.session,
      "EXCHANGE_SESSION",
      ids.session,
      "SESSION_CREATED",
      "SUCCESS",
      null,
      ids.correlation,
      knownAt,
    ]);
    expect(JSON.stringify(values)).not.toMatch(/DICOM|TOKEN|PASSWORD|PRIVATE KEY|TEST-PATIENT/i);
  });

  it("rejects forged non-domain values before issuing SQL", async () => {
    const query = vi.fn();
    const writer = new PostgresAuditEventWriter({ query });
    await expect(writer.record({})).rejects.toThrow(AuditEventPersistenceError);
    expect(query).not.toHaveBeenCalled();
  });

  it("maps driver errors and unexpected row counts to a fixed error", async () => {
    for (const query of [
      vi.fn().mockRejectedValue(new Error("private driver details")),
      vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    ]) {
      const writer = new PostgresAuditEventWriter({ query });
      await expect(writer.record(AuditEvent.create(input())))
        .rejects.toMatchObject({ message: "AUDIT_EVENT_PERSISTENCE_FAILED" });
    }
  });
});
