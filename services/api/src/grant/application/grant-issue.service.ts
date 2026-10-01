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
import {
  ExchangeSessionPersistenceError,
  PostgresExchangeSessionRepository,
} from "../../exchange/persistence/postgres-exchange-session.repository.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../../exchange/persistence/postgres-exchange-session-audit.repository.js";
import { ConsentPersistenceError, PostgresConsentRepository } from "../../consent/persistence/postgres-consent.repository.js";
import { ConsentArtifact } from "../../consent/domain/consent-artifact.js";
import { TransferGrant, type P0TransferGrantScope } from "../domain/transfer-grant.js";
import {
  PostgresTransferGrantRepository,
  TransferGrantConflictError,
  TransferGrantPersistenceError,
} from "../persistence/postgres-transfer-grant.repository.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRANT_TTL_MS = 30 * 60 * 1000;
const REQUEST_FIELDS = new Set(["consentId", "imagingPackageId", "scopes"]);

const scopeToAction: Readonly<Record<P0TransferGrantScope, "VIEW" | "DOWNLOAD" | "PACS_IMPORT">> = Object.freeze({
  "study:view": "VIEW",
  "study:download": "DOWNLOAD",
  "study:pacs-transfer": "PACS_IMPORT",
});

interface GrantIssueCommand {
  readonly consentId: string;
  readonly imagingPackageId: string;
  readonly scopes: readonly P0TransferGrantScope[];
}

interface PackageEvidence {
  package_id: string;
  exchange_session_id: string;
  patient_ref_id: string;
  source_hospital_id: string;
  state: string;
  retention_expires_at: Date | null;
  deleted_at: Date | null;
}

export interface GrantIssueResult {
  readonly grant: TransferGrant;
  readonly replayed: boolean;
  readonly correlationId: string;
}

export class InvalidGrantIssueRequestError extends Error {
  constructor() { super("GRANT_ISSUE_REQUEST_INVALID"); this.name = "InvalidGrantIssueRequestError"; }
}
export class GrantIssueDeniedError extends Error {
  constructor() { super("GRANT_ISSUE_DENIED"); this.name = "GrantIssueDeniedError"; }
}
export class GrantIssueConflictError extends Error {
  constructor() { super("GRANT_ISSUE_CONFLICT"); this.name = "GrantIssueConflictError"; }
}
export class GrantIssueUnavailableError extends Error {
  constructor() { super("GRANT_ISSUE_UNAVAILABLE"); this.name = "GrantIssueUnavailableError"; }
}

function parseCommand(value: unknown): GrantIssueCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGrantIssueRequestError();
  }
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !REQUEST_FIELDS.has(key))) {
    throw new InvalidGrantIssueRequestError();
  }
  const consentId = candidate.consentId;
  const imagingPackageId = candidate.imagingPackageId;
  const scopes = candidate.scopes;
  const supportedScopes = new Set<string>([
    "study:view",
    "study:download",
    "study:pacs-transfer",
  ]);
  if (
    typeof consentId !== "string" || !UUID_PATTERN.test(consentId) ||
    typeof imagingPackageId !== "string" || !UUID_PATTERN.test(imagingPackageId) ||
    !Array.isArray(scopes) || scopes.length === 0 ||
    scopes.some((scope) => typeof scope !== "string" || !supportedScopes.has(scope)) ||
    new Set(scopes).size !== scopes.length
  ) {
    throw new InvalidGrantIssueRequestError();
  }
  return Object.freeze({
    consentId: consentId.toLowerCase(),
    imagingPackageId: imagingPackageId.toLowerCase(),
    scopes: Object.freeze([...(scopes as P0TransferGrantScope[])].sort()),
  });
}

function sameScopes(left: readonly P0TransferGrantScope[], right: readonly P0TransferGrantScope[]): boolean {
  return left.length === right.length && left.every((scope, index) => scope === right[index]);
}

function sameReplayBinding(
  existing: TransferGrant,
  input: {
    sessionId: string;
    consentId: string;
    tenantId: string;
    hospitalId: string;
    actorId: string;
    packageId: string;
    scopes: readonly P0TransferGrantScope[];
  },
): boolean {
  return existing.exchangeSessionId === input.sessionId &&
    existing.consentId === input.consentId &&
    existing.recipientTenantId === input.tenantId &&
    existing.recipientHospitalId === input.hospitalId &&
    existing.recipientActorId === input.actorId &&
    existing.imagingPackageId === input.packageId &&
    sameScopes(existing.scopes, input.scopes);
}

async function exactActivePackage(
  client: PoolClient,
  command: GrantIssueCommand,
  session: {
    sessionId: string;
    patientRefId: string;
    sourceHospitalId: string;
  },
  consent: ConsentArtifact,
  now: Date,
): Promise<boolean> {
  const packageResult = await client.query<PackageEvidence>(
    `SELECT package_id, exchange_session_id, patient_ref_id,
            source_hospital_id, state, retention_expires_at, deleted_at
       FROM imaging_packages
      WHERE package_id = $1
      LIMIT 2`,
    [command.imagingPackageId],
  );
  if (packageResult.rows.length !== 1) return false;
  const pkg = packageResult.rows[0];
  if (
    pkg.package_id.toLowerCase() !== command.imagingPackageId ||
    pkg.exchange_session_id.toLowerCase() !== session.sessionId ||
    pkg.patient_ref_id.toLowerCase() !== session.patientRefId ||
    pkg.source_hospital_id.toLowerCase() !== session.sourceHospitalId ||
    (pkg.state !== "AVAILABLE" && pkg.state !== "IN_EXCHANGE") ||
    pkg.deleted_at !== null ||
    (pkg.retention_expires_at !== null && pkg.retention_expires_at.getTime() <= now.getTime()) ||
    (consent.imagingPackageId !== null && consent.imagingPackageId !== command.imagingPackageId)
  ) return false;

  const studies = await client.query<{ study_count: number; mismatched_source_count: number }>(
    `SELECT count(*)::int AS study_count,
            count(*) FILTER (WHERE source_hospital_id <> $2::uuid)::int AS mismatched_source_count
       FROM study_references
      WHERE package_id = $1`,
    [command.imagingPackageId, session.sourceHospitalId],
  );
  return studies.rows.length === 1 &&
    studies.rows[0].study_count > 0 &&
    studies.rows[0].mismatched_source_count === 0;
}

function expiryBound(
  now: Date,
  sessionExpiresAt: Date | null,
  consentExpiresAt: Date | null,
): Date {
  const bound = Math.min(
    now.getTime() + GRANT_TTL_MS,
    sessionExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
    consentExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(bound) || bound <= now.getTime()) {
    throw new GrantIssueDeniedError();
  }
  return new Date(bound);
}

function issuerMatches(context: VerifiedActorTenantContext, session: {
  requesterActorId: string;
  destinationHospitalId: string;
}): boolean {
  return context.actorType === "USER" &&
    context.hospitalId !== null &&
    context.hospitalId === session.destinationHospitalId &&
    context.actorId === session.requesterActorId;
}

@Injectable()
export class GrantIssueService {
  constructor(
    @Inject(ActorTenantContextService)
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
  ) {}

  async issue(input: {
    principal: VerifiedAuthenticationPrincipal | null | undefined;
    tenantCandidate: string | string[] | undefined;
    sessionId: string;
    idempotencyKey: string | string[] | undefined;
    correlationId: string | string[] | undefined;
    body: unknown;
    hasUnexpectedInput: boolean;
  }): Promise<GrantIssueResult> {
    if (
      !UUID_PATTERN.test(input.sessionId) ||
      typeof input.idempotencyKey !== "string" || !UUID_PATTERN.test(input.idempotencyKey) ||
      input.hasUnexpectedInput
    ) throw new InvalidGrantIssueRequestError();
    const command = parseCommand(input.body);
    const tenantId = typeof input.tenantCandidate === "string" ? input.tenantCandidate : "";
    const normalizedIdempotencyKey = input.idempotencyKey.toLowerCase();
    const correlationId = typeof input.correlationId === "undefined"
      ? randomUUID()
      : typeof input.correlationId === "string" ? input.correlationId : "";
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(correlationId)) {
      throw new InvalidGrantIssueRequestError();
    }

    try {
      const outcome = await this.actorTenantContext.run(
        input.principal,
        tenantId,
        async (context, client) => {
          const sessionId = input.sessionId.toLowerCase();
          const normalizedKey = normalizedIdempotencyKey;
          await acquireExchangeSessionFence(client, sessionId);
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
            [`grant-issue:${context.tenantId}:${context.actorId}:${normalizedKey}`],
          );

          const now = new Date();
          const session = await new PostgresExchangeSessionRepository(client).findById(sessionId);
          const audit = new PostgresExchangeSessionAuditRepository(client);
          const deny = async (conflict = false) => {
            await audit.recordGrantIssueDenied({
              auditEventId: randomUUID(),
              occurredAt: now,
              actorId: context.actorId,
              tenantId: context.tenantId,
              exchangeSessionId: session?.sessionId ?? null,
              correlationId: correlationId.toLowerCase(),
              createdAt: now,
            });
            if (conflict) return { kind: "CONFLICT" as const };
            return { kind: "DENIED" as const };
          };

          if (!session || !issuerMatches(context, session) ||
              session.state !== "CONSENTED" ||
              (session.expiresAt !== null && session.expiresAt.getTime() <= now.getTime())) {
            return deny();
          }

          const consent = await new PostgresConsentRepository(client).findById(command.consentId);
          if (
            !consent || consent.exchangeSessionId !== session.sessionId ||
            consent.patientRefId !== session.patientRefId ||
            consent.sourceHospitalId !== session.sourceHospitalId ||
            consent.destinationHospitalId !== session.destinationHospitalId ||
            consent.status !== "ACTIVE" || consent.issuedAt === null ||
            consent.issuedAt.getTime() > now.getTime() || consent.withdrawnAt !== null ||
            (consent.expiresAt !== null && consent.expiresAt.getTime() <= now.getTime())
          ) return deny();

          const packageMatches = await exactActivePackage(client, command, session, consent, now);
          if (!packageMatches) return deny();

          const repository = new PostgresTransferGrantRepository(client);
          const existing = await repository.findByIdempotencyKey({
            tenantId: context.tenantId,
            actorId: context.actorId,
            idempotencyKey: normalizedKey,
          });
          if (existing) {
            const exactReplay = sameReplayBinding(existing, {
              sessionId: session.sessionId,
              consentId: consent.consentId,
              tenantId: context.tenantId,
              hospitalId: session.destinationHospitalId,
              actorId: context.actorId,
              packageId: command.imagingPackageId,
              scopes: command.scopes,
            });
            if (!exactReplay) return deny(true);
            return { kind: "ISSUED" as const, grant: existing, replayed: true };
          }

          const requestedActions = command.scopes.map((scope) => scopeToAction[scope]);
          if (!requestedActions.every((action) => consent.actions.includes(action))) return deny();

          const expiresAt = expiryBound(now, session.expiresAt, consent.expiresAt);
          const grant = TransferGrant.issue({
            exchangeSessionId: session.sessionId,
            consentId: consent.consentId,
            recipientTenantId: context.tenantId,
            recipientHospitalId: session.destinationHospitalId,
            recipientActorId: context.actorId,
            imagingPackageId: command.imagingPackageId,
            scopes: command.scopes,
            expiresAt,
            now,
          });
          await repository.insert(grant, normalizedKey);
          await audit.recordGrantIssued({
            auditEventId: randomUUID(),
            occurredAt: now,
            actorId: context.actorId,
            tenantId: context.tenantId,
            exchangeSessionId: session.sessionId,
            grantId: grant.grantId,
            correlationId: correlationId.toLowerCase(),
            createdAt: now,
          });
          return { kind: "ISSUED" as const, grant, replayed: false };
        },
      );

      if (outcome.kind === "DENIED") throw new GrantIssueDeniedError();
      if (outcome.kind === "CONFLICT") throw new GrantIssueConflictError();
      return Object.freeze({
        grant: outcome.grant,
        replayed: outcome.replayed,
        correlationId: correlationId.toLowerCase(),
      });
    } catch (error) {
      if (
        error instanceof InvalidGrantIssueRequestError ||
        error instanceof GrantIssueDeniedError ||
        error instanceof GrantIssueConflictError ||
        error instanceof ActorTenantContextDeniedError
      ) throw error;
      if (
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ExchangeSessionPersistenceError ||
        error instanceof ConsentPersistenceError ||
        error instanceof TransferGrantPersistenceError ||
        error instanceof TransferGrantConflictError ||
        error instanceof ExchangeSessionAuditPersistenceError
      ) {
        if (error instanceof TransferGrantConflictError) throw new GrantIssueConflictError();
        throw new GrantIssueUnavailableError();
      }
      throw new GrantIssueUnavailableError();
    }
  }
}
