import { sql, type SQL } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

export const currentTenantContext = sql`
  NULLIF(current_setting('mediq.tenant_id', true), '')::uuid
`;

export function tenantRlsPolicies(
  tableName: string,
  tenantPredicate: SQL,
) {
  return [
    pgPolicy(`${tableName}_tenant_scope`, {
      to: "mediq_runtime",
      for: "all",
      using: tenantPredicate,
      withCheck: tenantPredicate,
    }),
    pgPolicy(`${tableName}_migration_access`, {
      to: "mediq_migrator",
      for: "all",
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ];
}
