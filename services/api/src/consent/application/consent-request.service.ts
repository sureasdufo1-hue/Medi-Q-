import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import type { ExchangeSession } from "../../exchange/domain/exchange-session.js";
import {
  ExchangeSessionConflictError,
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../exchange/persistence/postgres-exchange-session.repository.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../../exchange/persistence/postgres-exchange-session-audit.repository.js";
import { ConsentArtifact, p0ConsentActions, type P0ConsentAction } from "../domain/consent-artifact.js";
import {
  ConsentContextDeniedError,
  ConsentPersistenceError,
  ConsentVersionConflictError,
  PostgresConsentRepository,
} from "../persistence/postgres-consent.repository.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;
const BODY_FIELDS = new Set(["allowedActions", "imagingPackageId", "expiresAt"]);

export interface ConsentRequestCommand {
  readonly actions: readonly P0ConsentAction[];
  readonly imagingPackageId: string | null;
  readonly expiresAt: Date | null;
}

export interface ConsentRequestResult {
  readonly consent: ConsentArtifact;
  readonly replayed: boolean;
  readonly correlationId: string;
}

export class InvalidConsentRequestError extends Error {
  constructor() { super("CONSENT_REQUEST_INVALID"); this.name = "InvalidConsentRequestError"; }
}
export class ConsentRequestDeniedError extends Error {
  constructor() { super("CONSENT_REQUEST_DENIED"); this.name = "ConsentRequestDeniedError"; }
}
export class ConsentRequestConflictError extends Error {
  constructor() { super("CONSENT_REQUEST_CONFLICT"); this.name = "ConsentRequestConflictError"; }
}
export class ConsentRequestUnavailableError extends Error {
  constructor() { super("CONSENT_REQUEST_UNAVAILABLE"); this.name = "ConsentRequestUnavailableError"; }
}

function parseCommand(value: unknown): ConsentRequestCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidConsentRequestError();
  }
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !BODY_FIELDS.has(key))) throw new InvalidConsentRequestError();
  const actions = candidate.allowedActions;
  if (!Array.isArray(actions) || actions.length === 0 ||
      actions.some((action) => typeof action !== "string" || !(p0ConsentActions as readonly string[]).includes(action)) ||
      new Set(actions).size !== actions.length) {
    throw new InvalidConsentRequestError();
  }
  const imagingPackageId = candidate.imagingPackageId;
  if (typeof imagingPackageId !== "undefined" &&
      (typeof imagingPackageId !== "string" || !UUID_PATTERN.test(imagingPackageId))) {
    throw new InvalidConsentRequestError();
  }
  const expiresValue = candidate.expiresAt;
  let expiresAt: Date | null = null;
  if (typeof expiresValue !== "undefined") {
    if (typeof expiresValue !== "string") throw new InvalidConsentRequestError();
    const match = ISO_DATE_TIME_PATTERN.exec(expiresValue);
    if (!match) throw new InvalidConsentRequestError();
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, , offsetHourText, offsetMinuteText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const offsetHour = offsetHourText ? Number(offsetHourText) : 0;
    const offsetMinute = offsetMinuteText ? Number(offsetMinuteText) : 0;
    const dateProbe = new Date(0);
    dateProbe.setUTCFullYear(year, month, 0);
    const daysInMonth = dateProbe.getUTCDate();
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth ||
        hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 ||
        (zone !== "Z" && offsetHour === 14 && offsetMinute !== 0)) {
      throw new InvalidConsentRequestError();
    }
    const parsed = new Date(expiresValue);
    if (!Number.isFinite(parsed.getTime())) throw new InvalidConsentRequestError();
    expiresAt = parsed;
  }
  return Object.freeze({
    actions: Object.freeze([...(actions as P0ConsentAction[])].sort()),
    imagingPackageId: typeof imagingPackageId === "string" ? imagingPackageId.toLowerCase() : null,
    expiresAt,
  });
}

function validateDestinationActor(context: VerifiedActorTenantContext, session: ExchangeSession): void {
  if (context.actorType !== "USER" || !context.hospitalId ||
      context.hospitalId.toLowerCase() !== session.destinationHospitalId ||
      context.actorId.toLowerCase() !== session.requesterActorId) {
    throw new ConsentRequestDeniedError();
  }
}

function sameRequest(
  existing: ConsentArtifact,
  session: ExchangeSession,
  command: ConsentRequestCommand,
): boolean {
  return existing.status === "PENDING" &&
    existing.exchangeSessionId === session.sessionId &&
    existing.patientRefId === session.patientRefId &&
    existing.sourceHospitalId === session.sourceHospitalId &&
    existing.destinationHospitalId === session.destinationHospitalId &&
    existing.imagingPackageId === command.imagingPackageId &&
    existing.expiresAt?.getTime() === command.expiresAt?.getTime() &&
    existing.actions.length === command.actions.length &&
    existing.actions.every((action, index) => action === command.actions[index]);
}

async function verifyPackage(
  client: PoolClient,
  session: ExchangeSession,
  command: ConsentRequestCommand,
  now: Date,
): Promise<void> {
  if (!command.imagingPackageId) return;
  try {
    const result = await client.query<{
      package_id: string; exchange_session_id: string; patient_ref_id: string;
      source_hospital_id: string; state: string; retention_expires_at: Date | null;
      deleted_at: Date | null;
    }>(
      `SELECT package_id, exchange_session_id, patient_ref_id, source_hospital_id,
              state, retention_expires_at, deleted_at
         FROM imaging_packages
        WHERE package_id = $1`,
      [command.imagingPackageId],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row ||
        row.exchange_session_id.toLowerCase() !== session.sessionId ||
        row.patient_ref_id.toLowerCase() !== session.patientRefId ||
        row.source_hospital_id.toLowerCase() !== session.sourceHospitalId ||
        row.state !== "AVAILABLE" || row.deleted_at !== null ||
        (row.retention_expires_at !== null && row.retention_expires_at.getTime() <= now.getTime())) {
      throw new ConsentRequestConflictError();
    }
  } catch (error) {
    if (error instanceof ConsentRequestConflictError) throw error;
    throw new ConsentRequestUnavailableError();
  }
}

function validateExpiry(command: ConsentRequestCommand, session: ExchangeSession, now: Date): void {
  if (command.expiresAt && (command.expiresAt.getTime() <= now.getTime() ||
      (session.expiresAt && command.expiresAt.getTime() > session.expiresAt.getTime()))) {
    throw new ConsentRequestConflictError();
  }
  if (session.expiresAt && session.expiresAt.getTime() <= now.getTime()) throw new ConsentRequestConflictError();
}

@Injectable()
export class ConsentRequestService {
  constructor(@Inject(ActorTenantContextService) private readonly actorTenantContext: Pick<ActorTenantContextService, "run">) {}

  async request(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    sessionId: string;
    correlationId: string | string[] | undefined;
    body: unknown;
  }): Promise<ConsentRequestResult> {
    if (!UUID_PATTERN.test(input.sessionId)) throw new InvalidConsentRequestError();
    const tenantId = typeof input.tenantCandidate === "string" ? input.tenantCandidate : "";
    const correlationId = typeof input.correlationId === "undefined"
      ? randomUUID()
      : typeof input.correlationId === "string" ? input.correlationId : "";
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(correlationId)) throw new InvalidConsentRequestError();
    const command = parseCommand(input.body);
    try {
      return await this.actorTenantContext.run(input.principal, tenantId, async (context, client) => {
        await acquireExchangeSessionFence(client, input.sessionId);
        const now = new Date();
        const sessionRepository = new PostgresExchangeSessionRepository(client);
        const session = await sessionRepository.findById(input.sessionId);
        if (!session) throw new ConsentRequestDeniedError();
        validateDestinationActor(context, session);
        validateExpiry(command, session, now);
        await verifyPackage(client, session, command, now);

        const consentRepository = new PostgresConsentRepository(client);
        const pending = await consentRepository.findPendingBySession(session.sessionId);
        if (session.state === "CONSENT_PENDING") {
          if (pending.length !== 1 || !sameRequest(pending[0], session, command)) throw new ConsentRequestConflictError();
          return Object.freeze({ consent: pending[0], replayed: true, correlationId: correlationId.toLowerCase() });
        }
        if (session.state !== "REQUESTED") throw new ConsentRequestConflictError();
        if (pending.length !== 0) throw new ConsentRequestConflictError();

        const consent = await consentRepository.createPending({
          exchangeSessionId: session.sessionId,
          patientRefId: session.patientRefId,
          sourceHospitalId: session.sourceHospitalId,
          destinationHospitalId: session.destinationHospitalId,
          imagingPackageId: command.imagingPackageId,
          actions: command.actions,
          expiresAt: command.expiresAt,
          now,
        });
        await sessionRepository.transitionRequestedToConsentPending(session, now);
        await new PostgresExchangeSessionAuditRepository(client).recordConsentRequested({
          auditEventId: randomUUID(),
          occurredAt: now,
          actorId: context.actorId,
          tenantId: context.tenantId,
          exchangeSessionId: session.sessionId,
          consentId: consent.consentId,
          correlationId: correlationId.toLowerCase(),
          createdAt: now,
        });
        return Object.freeze({ consent, replayed: false, correlationId: correlationId.toLowerCase() });
      });
    } catch (error) {
      if (error instanceof ActorTenantContextDeniedError || error instanceof ActorTenantContextUnavailableError ||
          error instanceof ConsentRequestDeniedError || error instanceof ConsentRequestConflictError ||
          error instanceof InvalidConsentRequestError || error instanceof ConsentContextDeniedError ||
          error instanceof ConsentVersionConflictError || error instanceof ExchangeSessionConflictError ||
          error instanceof ExchangeSessionPersistenceError || error instanceof ConsentPersistenceError ||
          error instanceof ExchangeSessionAuditPersistenceError || error instanceof ConsentRequestUnavailableError) {
        throw error;
      }
      throw new ConsentRequestUnavailableError();
    }
  }
}
