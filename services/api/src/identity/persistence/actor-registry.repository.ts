import type { PoolClient, QueryResultRow } from "pg";
import type { ActiveActorMembership, RegistryActorType } from "../identity-context.types.js";

interface ActorMembershipRow extends QueryResultRow {
  actor_id: string;
  tenant_id: string;
  hospital_id: string | null;
  actor_type: RegistryActorType;
}

export class ActorRegistryRepository {
  async findActiveMembership(
    client: PoolClient,
    tenantId: string,
    subject: string,
  ): Promise<ActiveActorMembership | null> {
    const result = await client.query<ActorMembershipRow>(
      `SELECT a.actor_id, a.tenant_id, a.hospital_id, a.actor_type
         FROM actors AS a
         JOIN tenants AS t
           ON t.tenant_id = a.tenant_id
          AND t.status = 'ACTIVE'
         LEFT JOIN hospitals AS h
           ON h.hospital_id = a.hospital_id
          AND h.tenant_id = a.tenant_id
          AND h.status = 'ACTIVE'
        WHERE a.tenant_id = $1::uuid
          AND a.external_subject = $2
          AND a.status = 'ACTIVE'
          AND (a.hospital_id IS NULL OR h.hospital_id IS NOT NULL)
        LIMIT 1`,
      [tenantId, subject],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.actor_type !== "USER" && row.actor_type !== "SERVICE") return null;
    return {
      actorId: row.actor_id,
      tenantId: row.tenant_id,
      hospitalId: row.hospital_id,
      actorType: row.actor_type,
    };
  }
}
