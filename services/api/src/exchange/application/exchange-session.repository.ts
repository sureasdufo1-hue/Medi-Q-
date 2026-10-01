import type { ExchangeSession } from "../domain/exchange-session.js";

/**
 * Internal persistence port only. The caller must authorize the exact
 * operation and pass a checked-out client on the transaction carrying the
 * server-resolved Tenant context. This interface is not an authorization
 * boundary and must not be exposed directly to an HTTP controller.
 */
export interface ExchangeSessionRepository {
  create(session: ExchangeSession): Promise<ExchangeSession>;
  createIdempotently(
    session: ExchangeSession,
    idempotencyKey: string,
  ): Promise<{ session: ExchangeSession; created: boolean }>;
  findById(sessionId: string): Promise<ExchangeSession | null>;
  transitionRequestedToConsentPending(
    session: ExchangeSession,
    now: Date,
  ): Promise<ExchangeSession>;
  transitionConsentPendingToConsented(
    session: ExchangeSession,
    now: Date,
  ): Promise<ExchangeSession>;
}
