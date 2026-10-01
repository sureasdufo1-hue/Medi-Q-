import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  AuditEvent,
  type AuditEventState,
} from "../../audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../audit/persistence/postgres-audit-event-writer.js";

export interface ExchangeSessionCreatedAudit {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly resourceId: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface ConsentRequestedAudit {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly consentId: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface ConsentApprovedAudit extends ConsentRequestedAudit {}
export interface ConsentWithdrawnAudit extends ConsentRequestedAudit {}

export interface GrantIssueAudit {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly grantId: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface GrantIssueDeniedAudit {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string | null;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface PacsTransferMappingDeniedAudit {
  readonly auditEventId: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface GrantRevocationAudit extends GrantIssueAudit {}
export interface GrantRevocationDeniedAudit extends GrantIssueDeniedAudit {}

export class ExchangeSessionAuditPersistenceError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_AUDIT_PERSISTENCE_FAILED");
    this.name = "ExchangeSessionAuditPersistenceError";
  }
}

export class PostgresExchangeSessionAuditRepository {
  private readonly writer: PostgresAuditEventWriter;

  constructor(private readonly database: Pick<PoolClient, "query">) {
    this.writer = new PostgresAuditEventWriter(database);
  }

  async recordCreated(event: ExchangeSessionCreatedAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "EXCHANGE_SESSION",
      resourceId: event.resourceId,
      action: "SESSION_CREATED",
      result: "SUCCESS",
      reasonCode: null,
    });
  }

  async recordConsentRequested(event: ConsentRequestedAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "CONSENT",
      resourceId: event.consentId,
      action: "CONSENT_REQUESTED",
      result: "SUCCESS",
      reasonCode: null,
    });
  }

  async recordConsentApproved(event: ConsentApprovedAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "CONSENT",
      resourceId: event.consentId,
      action: "CONSENT_APPROVED",
      result: "SUCCESS",
      reasonCode: null,
    });
  }

  async recordConsentWithdrawn(event: ConsentWithdrawnAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "CONSENT",
      resourceId: event.consentId,
      action: "CONSENT_WITHDRAWN",
      result: "SUCCESS",
      reasonCode: null,
    });
  }

  async recordGrantIssued(event: GrantIssueAudit): Promise<void> {
    try {
      await this.persist({
        ...this.base(event),
        resourceType: "TRANSFER_GRANT",
        resourceId: event.grantId,
        action: "AUTHORIZATION_GRANTED",
        result: "ALLOW",
        reasonCode: null,
      });
      await this.persist({
        ...this.base(event),
        auditEventId: randomUUID(),
        resourceType: "TRANSFER_GRANT",
        resourceId: event.grantId,
        action: "GRANT_CREATED",
        result: "SUCCESS",
        reasonCode: null,
      });
    } catch {
      throw new ExchangeSessionAuditPersistenceError();
    }
  }

  async recordGrantIssueDenied(event: GrantIssueDeniedAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "EXCHANGE_SESSION",
      resourceId: event.exchangeSessionId,
      action: "AUTHORIZATION_DENIED",
      result: "DENY",
      reasonCode: "GRANT_ISSUE_DENIED",
    });
    await this.persist({
      ...this.base({ ...event, auditEventId: randomUUID() }),
      resourceType: "EXCHANGE_SESSION",
      resourceId: event.exchangeSessionId,
      action: "GRANT_DENIED",
      result: "DENY",
      reasonCode: "GRANT_ISSUE_DENIED",
    });
  }

  async recordGrantRevoked(event: GrantRevocationAudit): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "TRANSFER_GRANT",
      resourceId: event.grantId,
      action: "GRANT_REVOKED",
      result: "SUCCESS",
      reasonCode: null,
    });
  }

  async recordGrantRevocationDenied(
    event: GrantRevocationDeniedAudit,
  ): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "EXCHANGE_SESSION",
      resourceId: event.exchangeSessionId,
      action: "AUTHORIZATION_DENIED",
      result: "DENY",
      reasonCode: "GRANT_REVOKE_DENIED",
    });
    await this.persist({
      ...this.base({ ...event, auditEventId: randomUUID() }),
      resourceType: "EXCHANGE_SESSION",
      resourceId: event.exchangeSessionId,
      action: "GRANT_DENIED",
      result: "DENY",
      reasonCode: "GRANT_REVOKE_DENIED",
    });
  }

  async recordPacsTransferMappingDenied(
    event: PacsTransferMappingDeniedAudit,
  ): Promise<void> {
    await this.persist({
      ...this.base(event),
      resourceType: "STUDY",
      resourceId: event.studyRefId,
      action: "PACS_TRANSFER_FAILED",
      result: "FAILURE",
      reasonCode: "PATIENT_MAPPING_INVALID",
    });
  }

  private base(event: {
    readonly auditEventId: string;
    readonly occurredAt: Date;
    readonly actorId: string;
    readonly tenantId: string;
    readonly exchangeSessionId: string | null;
    readonly correlationId: string;
    readonly createdAt: Date;
  }) {
    return {
      auditEventId: event.auditEventId,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      tenantId: event.tenantId,
      exchangeSessionId: event.exchangeSessionId,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    } as const;
  }

  private async persist(event: AuditEventState): Promise<void> {
    try {
      await this.writer.record(AuditEvent.create(event));
    } catch {
      throw new ExchangeSessionAuditPersistenceError();
    }
  }
}
