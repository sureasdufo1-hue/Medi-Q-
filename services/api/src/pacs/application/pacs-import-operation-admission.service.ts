import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import {
  AuthorizationDeniedError,
  ProtectedOperationUnavailableError,
  type AuthorizationGatedOperationExecutor,
} from "../../authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationContext } from "../../authorization/domain/authorization-context.js";
import { PostgresTransferGrantRepository } from "../../grant/persistence/postgres-transfer-grant.repository.js";
import {
  PacsTransferOperation,
  type PacsTransferOperationSnapshot,
} from "../domain/pacs-transfer-operation.js";
import { parsePacsImportSubmission } from "./pacs-import-request.parser.js";
import {
  PacsTransferOperationConflictError,
} from "../persistence/pacs-transfer-operation.repository.js";
import { PostgresPacsTransferOperationRepository } from "../persistence/postgres-pacs-transfer-operation.repository.js";

export interface PacsImportOperationAdmissionResult {
  readonly created: boolean;
  readonly operation: PacsTransferOperationSnapshot;
}

export interface PacsImportCoordinatorAdmissionContext {
  readonly admission: PacsImportOperationAdmissionResult;
  /** Server-derived continuation input; never part of the ordinary result. */
  readonly sourceCaptureCommand: Readonly<{
    principal: VerifiedAuthenticationPrincipal;
    tenantCandidate: string;
    correlationId: string;
    operationId: string;
    consentId: string;
    grantId: string;
  }>;
}

export interface PacsImportAuthorizedTransaction {
  readonly context: AuthorizationContext;
  readonly transactionClient: PoolClient;
}

type PersistOutcome =
  | Readonly<{ kind: "PERSISTED"; created: boolean; operation: PacsTransferOperation }>
  | Readonly<{ kind: "CONFLICT" }>;

/**
 * DICOM-free admission boundary. A successful result means only that a
 * Study-scoped PACS_IMPORT operation was durably created or replayed as
 * CREATED. It is not Preflight approval, transfer authorization at dispatch,
 * a PACS call, or evidence that any image moved.
 */
export class PacsImportOperationAdmissionService {
  constructor(
    private readonly operationExecutor: Pick<
      AuthorizationGatedOperationExecutor,
      "executeWithResolvedSessionFence"
    >,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async admit(input: {
    readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
    readonly request: unknown;
  }): Promise<PacsImportOperationAdmissionResult> {
    return (await this.admitInternal(input)).admission;
  }

  /**
   * Internal continuation for the trusted coordinator. It keeps Grant-derived
   * Consent out of the normal admission result and passes it only to an
   * in-process continuation after the admission transaction commits.
   */
  async admitForCoordinator<T>(
    input: {
      readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
      readonly request: unknown;
    },
    continuation: (context: PacsImportCoordinatorAdmissionContext) => Promise<T>,
  ): Promise<T> {
    if (typeof continuation !== "function") {
      throw new AuthorizationDeniedError();
    }
    const admitted = await this.admitInternal(input);
    return continuation(admitted);
  }

  /**
   * Re-resolves the Grant-derived Consent and runs current PACS_IMPORT policy
   * after the shared Session fence. The callback is transaction-only; callers
   * must perform network effects only after this method has committed/returned.
   */
  async executeWithCurrentImportAuthorization<T>(input: {
    readonly principal: VerifiedAuthenticationPrincipal;
    readonly tenantCandidate: string;
    readonly exchangeSessionId: string;
    readonly studyRefId: string;
    readonly consentId: string;
    readonly grantId: string;
    readonly work: (authorized: PacsImportAuthorizedTransaction) => Promise<T>;
  }): Promise<T> {
    const ids = [input.tenantCandidate, input.exchangeSessionId, input.studyRefId,
      input.consentId, input.grantId];
    if (ids.some((id) => typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      typeof input.work !== "function") {
      throw new AuthorizationDeniedError();
    }
    const principal = Object.freeze({
      issuer: input.principal.issuer,
      subject: input.principal.subject,
      ...(input.principal.patientRefId === undefined
        ? {}
        : { patientRefId: input.principal.patientRefId }),
    });
    return this.operationExecutor.executeWithResolvedSessionFence(
      principal,
      input.tenantCandidate.toLowerCase(),
      async (identity, transactionClient) => {
        let grant;
        try {
          grant = await new PostgresTransferGrantRepository(
            transactionClient,
          ).findById(input.grantId);
        } catch {
          throw new ProtectedOperationUnavailableError();
        }
        if (!grant ||
          grant.exchangeSessionId !== input.exchangeSessionId.toLowerCase() ||
          grant.consentId !== input.consentId.toLowerCase() ||
          grant.recipientTenantId !== identity.tenantId) {
          throw new AuthorizationDeniedError();
        }
        return AuthorizationContext.create({
          identity,
          exchangeSessionId: input.exchangeSessionId,
          resource: { kind: "STUDY", id: input.studyRefId },
          action: "PACS_IMPORT",
          consentId: grant.consentId,
          grantId: grant.grantId,
        });
      },
      async (context, transactionClient) => input.work({
        context,
        transactionClient,
      }),
    );
  }

  private async admitInternal(input: {
    readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
    readonly request: unknown;
  }): Promise<PacsImportCoordinatorAdmissionContext> {
    const request = parsePacsImportSubmission(input.request);
    if (!input.principal) throw new AuthorizationDeniedError();
    const principal = Object.freeze({
      issuer: input.principal.issuer,
      subject: input.principal.subject,
      ...(input.principal.patientRefId === undefined
        ? {}
        : { patientRefId: input.principal.patientRefId }),
    });
    let resolvedConsentId: string | undefined;

    const persisted = await this.operationExecutor.executeWithResolvedSessionFence(
      principal,
      request.tenantCandidate,
      async (identity, transactionClient) => {
        let grant;
        try {
          grant = await new PostgresTransferGrantRepository(
            transactionClient,
          ).findById(request.grantId);
        } catch {
          throw new ProtectedOperationUnavailableError();
        }

        if (
          !grant ||
          grant.exchangeSessionId !== request.exchangeSessionId ||
          grant.recipientTenantId !== identity.tenantId
        ) {
          throw new AuthorizationDeniedError();
        }
        resolvedConsentId = grant.consentId;

        return AuthorizationContext.create({
          identity,
          exchangeSessionId: request.exchangeSessionId,
          resource: { kind: "STUDY", id: request.studyRefId },
          action: "PACS_IMPORT",
          // Consent authority is server-derived from the persisted Grant.
          consentId: grant.consentId,
          grantId: grant.grantId,
        });
      },
      async (context, transactionClient): Promise<PersistOutcome> => {
        const operation = PacsTransferOperation.create({
          operationId: this.createId(),
          semantics: {
            tenantId: context.tenantId,
            actorId: context.actorId,
            exchangeSessionId: context.exchangeSessionId,
            studyRefId: context.resource.id,
            consentId: context.consentId,
            grantId: context.grantId,
            action: "PACS_IMPORT",
          },
          idempotencyKey: request.idempotencyKey,
          now: this.clock(),
        });

        try {
          const result = await new PostgresPacsTransferOperationRepository(
            transactionClient,
          ).createIdempotently({
            operation,
            correlationId: request.correlationId,
          });
          return Object.freeze({
            kind: "PERSISTED",
            created: result.created,
            operation: result.operation,
          });
        } catch (error) {
          // The executor deliberately sanitizes callback errors. Preserve only
          // this expected semantic conflict as a typed, non-sensitive result.
          if (error instanceof PacsTransferOperationConflictError) {
            return Object.freeze({ kind: "CONFLICT" });
          }
          throw error;
        }
      },
    );

    if (persisted.kind === "CONFLICT") {
      throw new PacsTransferOperationConflictError();
    }

    if (!resolvedConsentId) throw new ProtectedOperationUnavailableError();
    const admission = Object.freeze({
      created: persisted.created,
      operation: persisted.operation.snapshot,
    });
    return Object.freeze({
      admission,
      sourceCaptureCommand: Object.freeze({
        principal,
        tenantCandidate: request.tenantCandidate,
        correlationId: request.correlationId,
        operationId: admission.operation.operationId,
        consentId: resolvedConsentId,
        grantId: request.grantId,
      }),
    });
  }
}
