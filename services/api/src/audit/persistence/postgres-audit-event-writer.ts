import type { PoolClient } from "pg";
import { AuditEvent } from "../domain/audit-event.js";

export class AuditEventPersistenceError extends Error {
  constructor() {
    super("AUDIT_EVENT_PERSISTENCE_FAILED");
    this.name = "AuditEventPersistenceError";
  }
}

export class PostgresAuditEventWriter {
  constructor(private readonly database: Pick<PoolClient, "query">) {}

  async record(event: AuditEvent): Promise<void> {
    if (!(event instanceof AuditEvent)) throw new AuditEventPersistenceError();

    try {
      const row = event.snapshot();
      const result = await this.database.query(
        `INSERT INTO audit_events
          (audit_event_id, occurred_at, actor_id, tenant_id,
           exchange_session_id, resource_type, resource_id, action,
           result, reason_code, correlation_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.auditEventId,
          row.occurredAt,
          row.actorId,
          row.tenantId,
          row.exchangeSessionId,
          row.resourceType,
          row.resourceId,
          row.action,
          row.result,
          row.reasonCode,
          row.correlationId,
          row.createdAt,
        ],
      );
      if (result.rowCount !== 1) throw new Error("AUDIT_ROW_COUNT_INVALID");
    } catch {
      throw new AuditEventPersistenceError();
    }
  }
}
