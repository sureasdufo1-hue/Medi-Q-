import type { PoolClient } from "pg";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serializes database-only decisions and lifecycle changes for one ExchangeSession.
 * Callers must use it inside their verified Tenant transaction. Never hold the
 * transaction open for DICOM/network I/O.
 */
export async function acquireExchangeSessionFence(
  client: Pick<PoolClient, "query">,
  sessionId: string,
): Promise<void> {
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
    throw new Error("EXCHANGE_SESSION_FENCE_INVALID");
  }

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [sessionId.toLowerCase()],
  );
}
