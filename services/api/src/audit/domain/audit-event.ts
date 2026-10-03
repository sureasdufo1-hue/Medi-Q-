export const auditResourceTypes = [
  "EXCHANGE_SESSION",
  "CONSENT",
  "TRANSFER_GRANT",
  "STUDY",
] as const;

export type AuditResourceType = (typeof auditResourceTypes)[number];
export type AuditResult = "SUCCESS" | "FAILURE" | "ALLOW" | "DENY";

export interface AuditEventState {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string | null;
  readonly resourceType: AuditResourceType;
  readonly resourceId: string | null;
  readonly action: string;
  readonly result: AuditResult;
  readonly reasonCode: string | null;
  readonly correlationId: string;
  readonly createdAt: Date;
}

type EventRule = Readonly<{
  resourceType: AuditResourceType;
  result: AuditResult;
  sessionRequired: boolean;
  resourceRequired: boolean;
  reasonCodes: readonly (string | null)[];
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_RULES: Readonly<Record<string, EventRule>> = Object.freeze({
  SESSION_CREATED: {
    resourceType: "EXCHANGE_SESSION",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  CONSENT_REQUESTED: {
    resourceType: "CONSENT",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  CONSENT_APPROVED: {
    resourceType: "CONSENT",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  CONSENT_WITHDRAWN: {
    resourceType: "CONSENT",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  AUTHORIZATION_GRANTED: {
    resourceType: "TRANSFER_GRANT",
    result: "ALLOW",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  AUTHORIZATION_DENIED: {
    resourceType: "EXCHANGE_SESSION",
    result: "DENY",
    sessionRequired: false,
    resourceRequired: false,
    reasonCodes: ["GRANT_ISSUE_DENIED", "GRANT_REVOKE_DENIED"],
  },
  GRANT_DENIED: {
    resourceType: "EXCHANGE_SESSION",
    result: "DENY",
    sessionRequired: false,
    resourceRequired: false,
    reasonCodes: ["GRANT_ISSUE_DENIED", "GRANT_REVOKE_DENIED"],
  },
  GRANT_CREATED: {
    resourceType: "TRANSFER_GRANT",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  GRANT_REVOKED: {
    resourceType: "TRANSFER_GRANT",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  PACS_TRANSFER_FAILED: {
    resourceType: "STUDY",
    result: "FAILURE",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: ["PATIENT_MAPPING_INVALID"],
  },
  PACS_SOURCE_CAPTURE_STARTED: {
    resourceType: "STUDY",
    result: "ALLOW",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  PACS_SOURCE_CAPTURED: {
    resourceType: "STUDY",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [null],
  },
  PACS_SOURCE_CAPTURE_DENIED: {
    resourceType: "STUDY",
    result: "DENY",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [
      "AUTHORIZATION_DENIED",
      "OPERATION_NOT_CAPTUREABLE",
      "PATIENT_MAPPING_INVALID",
      "SOURCE_PATIENT_ID_MISMATCH",
      "SOURCE_METADATA_INVALID",
    ],
  },
  PACS_SOURCE_CAPTURE_FAILED: {
    resourceType: "STUDY",
    result: "FAILURE",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [
      "SOURCE_READ_FAILED",
      "SOURCE_CAPTURE_CANCELLED",
      "SOURCE_CAPTURE_DEADLINE",
      "SOURCE_CAPTURE_PERSISTENCE_FAILED",
    ],
  },
  PACS_TEMPORARY_OBJECT_PURGED: {
    resourceType: "STUDY",
    result: "SUCCESS",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: [
      "CAPTURE_FAILURE",
      "EXPLICIT_CLOSE",
      "TRANSFER_TERMINAL",
      "TTL_EXPIRED",
      "PROCESS_RESTART",
    ],
  },
  PACS_TEMPORARY_READ_AUTHORIZED: {
    resourceType: "STUDY",
    result: "ALLOW",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: ["BEFORE_DECRYPT", "BEFORE_DELIVERY"],
  },
  PACS_TEMPORARY_READ_FAILED: {
    resourceType: "STUDY",
    result: "FAILURE",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: ["TEMPORARY_READ_FAILED"],
  },
  PACS_DESTINATION_VERIFY_AUTHORIZED: {
    resourceType: "STUDY",
    result: "ALLOW",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: ["BEFORE_IDENTITY", "AFTER_IDENTITY", "BEFORE_BYTES", "AFTER_BYTES", "FINAL"],
  },
  PACS_DESTINATION_VERIFY_FAILED: {
    resourceType: "STUDY",
    result: "FAILURE",
    sessionRequired: true,
    resourceRequired: true,
    reasonCodes: ["DESTINATION_VERIFY_FAILED"],
  },
});

const ALLOWED_KEYS = new Set([
  "auditEventId",
  "occurredAt",
  "actorId",
  "tenantId",
  "exchangeSessionId",
  "resourceType",
  "resourceId",
  "action",
  "result",
  "reasonCode",
  "correlationId",
  "createdAt",
]);

export class InvalidAuditEventError extends Error {
  constructor() {
    super("AUDIT_EVENT_INVALID");
    this.name = "InvalidAuditEventError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export class AuditEvent {
  readonly auditEventId: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string | null;
  readonly resourceType: AuditResourceType;
  readonly resourceId: string | null;
  readonly action: string;
  readonly result: AuditResult;
  readonly reasonCode: string | null;
  readonly correlationId: string;
  private readonly occurredAtMillis: number;
  private readonly createdAtMillis: number;

  private constructor(state: AuditEventState) {
    this.auditEventId = state.auditEventId.toLowerCase();
    this.occurredAtMillis = state.occurredAt.getTime();
    this.actorId = state.actorId.toLowerCase();
    this.tenantId = state.tenantId.toLowerCase();
    this.exchangeSessionId = state.exchangeSessionId?.toLowerCase() ?? null;
    this.resourceType = state.resourceType;
    this.resourceId = state.resourceId?.toLowerCase() ?? null;
    this.action = state.action;
    this.result = state.result;
    this.reasonCode = state.reasonCode;
    this.correlationId = state.correlationId.toLowerCase();
    this.createdAtMillis = state.createdAt.getTime();
    Object.freeze(this);
  }

  get occurredAt(): Date {
    return new Date(this.occurredAtMillis);
  }

  get createdAt(): Date {
    return new Date(this.createdAtMillis);
  }

  static create(input: unknown): AuditEvent {
    if (!isPlainRecord(input)) throw new InvalidAuditEventError();
    const ownKeys = Reflect.ownKeys(input);
    if (
      ownKeys.length !== ALLOWED_KEYS.size ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          !ALLOWED_KEYS.has(key) ||
          !Object.getOwnPropertyDescriptor(input, key)?.enumerable ||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"),
      )
    ) {
      throw new InvalidAuditEventError();
    }

    const rule =
      typeof input.action === "string" ? EVENT_RULES[input.action] : undefined;
    if (
      !rule ||
      !validUuid(input.auditEventId) ||
      !validUuid(input.actorId) ||
      !validUuid(input.tenantId) ||
      !validUuid(input.correlationId) ||
      (input.exchangeSessionId !== null &&
        !validUuid(input.exchangeSessionId)) ||
      (input.resourceId !== null && !validUuid(input.resourceId)) ||
      !validDate(input.occurredAt) ||
      !validDate(input.createdAt) ||
      input.resourceType !== rule.resourceType ||
      input.result !== rule.result ||
      typeof input.reasonCode !== "string" && input.reasonCode !== null ||
      !rule.reasonCodes.includes(input.reasonCode as string | null) ||
      (rule.sessionRequired && input.exchangeSessionId === null) ||
      (rule.resourceRequired && input.resourceId === null) ||
      ((input.action === "AUTHORIZATION_DENIED" ||
        input.action === "GRANT_DENIED") &&
        input.resourceId !== input.exchangeSessionId)
    ) {
      throw new InvalidAuditEventError();
    }

    return new AuditEvent(input as unknown as AuditEventState);
  }

  snapshot(): AuditEventState {
    return Object.freeze({
      auditEventId: this.auditEventId,
      occurredAt: new Date(this.occurredAt.getTime()),
      actorId: this.actorId,
      tenantId: this.tenantId,
      exchangeSessionId: this.exchangeSessionId,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      action: this.action,
      result: this.result,
      reasonCode: this.reasonCode,
      correlationId: this.correlationId,
      createdAt: new Date(this.createdAt.getTime()),
    });
  }
}
