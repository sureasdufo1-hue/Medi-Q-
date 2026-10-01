import { randomUUID } from "node:crypto";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import {
  AuthorizationDeniedError,
  ProtectedOperationUnavailableError,
  type AuthorizationGatedOperationExecutor,
} from "../../authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationContext } from "../../authorization/domain/authorization-context.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
} from "../../identity/identity-context.types.js";
import { ExchangeSession } from "../../exchange/domain/exchange-session.js";
import {
  ExchangeSessionAuditPersistenceError,
  PostgresExchangeSessionAuditRepository,
} from "../../exchange/persistence/postgres-exchange-session-audit.repository.js";
import { PostgresExchangeSessionRepository } from "../../exchange/persistence/postgres-exchange-session.repository.js";
import { PostgresPatientMappingRepository } from "../../patient/persistence/postgres-patient-mapping.repository.js";
import { validateDestinationPatientMapping } from "../../patient/domain/patient-mapping-validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMAND_FIELDS = new Set([
  "exchangeSessionId",
  "studyRefId",
  "consentId",
  "grantId",
]);
const IMPORTABLE_SESSION_STATES = new Set(["AUTHORIZED", "READY", "ACTIVE"]);

export class PacsImportMappingGateInvalidRequestError extends Error {
  constructor() {
    super("PACS_IMPORT_REQUEST_INVALID");
    this.name = "PacsImportMappingGateInvalidRequestError";
  }
}

export class PacsImportMappingGateUnavailableError extends Error {
  constructor() {
    super("PACS_IMPORT_PRECHECK_UNAVAILABLE");
    this.name = "PacsImportMappingGateUnavailableError";
  }
}

export type PacsImportMappingGateResult =
  | Readonly<{ kind: "DENY"; reason: "AUTHORIZATION_DENIED" }>
  | Readonly<{ kind: "DENY"; reason: "PATIENT_MAPPING_INVALID" }>
  | Readonly<{ kind: "MAPPING_VALIDATED"; mappingId: string }>;

interface PacsImportMappingGateCommand {
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly consentId: string;
  readonly grantId: string;
}

function parseCommand(value: unknown): PacsImportMappingGateCommand {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((field) => !COMMAND_FIELDS.has(field))
  ) {
    throw new PacsImportMappingGateInvalidRequestError();
  }

  const candidate = value as Record<string, unknown>;
  const ids = [
    candidate.exchangeSessionId,
    candidate.studyRefId,
    candidate.consentId,
    candidate.grantId,
  ];
  if (ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw new PacsImportMappingGateInvalidRequestError();
  }

  return Object.freeze({
    exchangeSessionId: (candidate.exchangeSessionId as string).toLowerCase(),
    studyRefId: (candidate.studyRefId as string).toLowerCase(),
    consentId: (candidate.consentId as string).toLowerCase(),
    grantId: (candidate.grantId as string).toLowerCase(),
  });
}

/**
 * Internal PACS Import mapping gate. This class deliberately has no DICOM
 * Gateway dependency: a validated mapping is not a complete Mandatory
 * Preflight result and must never be used as permission to perform STOW-RS.
 */
export class PacsImportMappingGateService {
  constructor(
    private readonly operationExecutor: Pick<
      AuthorizationGatedOperationExecutor,
      "executeWithSessionFence"
    >,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async validate(input: {
    readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
    readonly tenantCandidate: unknown;
    readonly correlationId: unknown;
    readonly body: unknown;
  }): Promise<PacsImportMappingGateResult> {
    const command = parseCommand(input.body);
    if (
      typeof input.tenantCandidate !== "string" ||
      !UUID_PATTERN.test(input.tenantCandidate) ||
      typeof input.correlationId !== "string" ||
      !UUID_PATTERN.test(input.correlationId)
    ) {
      throw new PacsImportMappingGateInvalidRequestError();
    }
    const tenantCandidate = input.tenantCandidate.toLowerCase();
    const correlationId = input.correlationId.toLowerCase();
    if (!input.principal) {
      return Object.freeze({
        kind: "DENY",
        reason: "AUTHORIZATION_DENIED",
      });
    }

    try {
      return await this.operationExecutor.executeWithSessionFence(
        input.principal,
        tenantCandidate,
        (identity) =>
          AuthorizationContext.create({
            identity,
            exchangeSessionId: command.exchangeSessionId,
            resource: { kind: "STUDY", id: command.studyRefId },
            action: "PACS_IMPORT",
            consentId: command.consentId,
            grantId: command.grantId,
          }),
        async (context, transactionClient) => {
          const session = await new PostgresExchangeSessionRepository(
            transactionClient,
          ).findById(context.exchangeSessionId);

          if (
            !session ||
            !IMPORTABLE_SESSION_STATES.has(session.state) ||
            context.hospitalId === null ||
            session.destinationHospitalId !== context.hospitalId
          ) {
            return Object.freeze({
              kind: "DENY",
              reason: "AUTHORIZATION_DENIED",
            } as const);
          }

          const mapping = await new PostgresPatientMappingRepository(
            transactionClient,
          ).findByPatientReference(
            context.hospitalId,
            session.patientRefId,
          );
          const decision = validateDestinationPatientMapping({
            patientRefId: session.patientRefId,
            destinationHospitalId: session.destinationHospitalId,
            candidates: mapping ? [mapping] : [],
          });

          if (decision.kind === "DENY") {
            const now = this.clock();
            await new PostgresExchangeSessionAuditRepository(
              transactionClient,
            ).recordPacsTransferMappingDenied({
              auditEventId: this.createId(),
              occurredAt: now,
              actorId: context.actorId,
              tenantId: context.tenantId,
              exchangeSessionId: context.exchangeSessionId,
              studyRefId: context.resource.id,
              correlationId,
              createdAt: now,
            });
            return Object.freeze({
              kind: "DENY",
              reason: "PATIENT_MAPPING_INVALID",
            } as const);
          }

          return Object.freeze({
            kind: "MAPPING_VALIDATED",
            mappingId: decision.mappingId,
          } as const);
        },
      );
    } catch (error) {
      if (
        error instanceof PacsImportMappingGateInvalidRequestError ||
        error instanceof PacsImportMappingGateUnavailableError
      ) {
        throw error;
      }
      if (
        error instanceof AuthorizationDeniedError ||
        error instanceof ActorTenantContextDeniedError
      ) {
        return Object.freeze({
          kind: "DENY",
          reason: "AUTHORIZATION_DENIED",
        });
      }
      if (
        error instanceof ProtectedOperationUnavailableError ||
        error instanceof ActorTenantContextUnavailableError ||
        error instanceof ExchangeSessionAuditPersistenceError
      ) {
        throw new PacsImportMappingGateUnavailableError();
      }
      // Never expose Authorization, repository, SQL or upstream details.
      throw new PacsImportMappingGateUnavailableError();
    }
  }
}
