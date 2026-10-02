import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import {
  AuthorizationDeniedError,
  AuthorizationGatedOperationExecutor,
  ProtectedOperationUnavailableError,
} from "../../authorization/application/authorization-gated-operation.executor.js";
import { AuthorizationContext } from "../../authorization/domain/authorization-context.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import type { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import type {
  DicomGateway,
  DicomGatewayRequestContext,
  DicomStudyMetadata,
} from "../../dicom/application/dicom-gateway.port.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
} from "../../dicom/infrastructure/test-orthanc-endpoint-resolver.js";
import {
  SOURCE_INTEGRITY_LIMITS,
  SOURCE_INTEGRITY_ALGORITHM,
  SourceIntegrityInputError,
  buildSourceIntegrityManifest,
  type SourceIntegrityManifest,
} from "./source-integrity-manifest.builder.js";
import {
  PostgresSourceIntegrityEvidenceRepository,
} from "../persistence/postgres-source-integrity-evidence.repository.js";
import type { SourceIntegrityEvidenceRecord } from "../persistence/source-integrity-evidence.repository.js";
import {
  PostgresSourceCaptureScopeRepository,
  SourceCaptureScopePersistenceError,
  sameSourceCaptureBinding,
  type SourceCaptureScope,
} from "../persistence/postgres-source-capture-scope.repository.js";
import { PostgresPatientMappingRepository } from "../../patient/persistence/postgres-patient-mapping.repository.js";
import { validateDestinationPatientMapping } from "../../patient/domain/patient-mapping-validation.js";
import { validatePacsPatientIdBinding } from "../../pacs/domain/pacs-patient-id-binding.js";
import { AuditEvent } from "../../audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../audit/persistence/postgres-audit-event-writer.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DICOM_UID_PATTERN = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/;
const TOTAL_CAPTURE_DEADLINE_MS = 30 * 60 * 1000;
const IMPORTABLE_SESSION_STATES = new Set(["AUTHORIZED", "READY", "ACTIVE"]);
const IMPORTABLE_OPERATION_STATE = "CREATED";

const COMMAND_FIELDS = new Set([
  "principal",
  "tenantCandidate",
  "correlationId",
  "operationId",
  "consentId",
  "grantId",
  "signal",
]);

export class AuthorizedSourceCaptureInvalidRequestError extends Error {
  constructor() {
    super("SOURCE_CAPTURE_REQUEST_INVALID");
    this.name = "AuthorizedSourceCaptureInvalidRequestError";
  }
}

export class AuthorizedSourceCaptureUnavailableError extends Error {
  constructor() {
    super("SOURCE_CAPTURE_UNAVAILABLE");
    this.name = "AuthorizedSourceCaptureUnavailableError";
  }
}

type SourceCaptureDicomPort = Pick<
  DicomGateway,
  "retrieveStudyMetadata" | "retrieveInstanceStream"
>;

export type AuthorizedSourceCaptureResult =
  | Readonly<{
      kind: "CAPTURED";
      evidenceId: string;
      status: "PENDING";
      objectCount: number;
    }>
  | Readonly<{
      kind: "DENIED";
      reason:
        | "AUTHORIZATION_DENIED"
        | "OPERATION_NOT_CAPTUREABLE"
        | "PATIENT_MAPPING_INVALID"
        | "SOURCE_PATIENT_ID_MISMATCH"
        | "SOURCE_METADATA_INVALID";
    }>;

export interface AuthorizedSourceCaptureCoordinatorHandoff {
  readonly operationId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly exchangeSessionId: string;
  readonly packageId: string;
  readonly studyRefId: string;
  readonly studyInstanceUid: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly sourceEvidence: Readonly<{
    evidenceId: string;
    status: "PENDING";
    algorithm: typeof SOURCE_INTEGRITY_ALGORITHM;
    aggregateDigest: `sha256:${string}`;
    objectCount: number;
    totalBytes: number;
  }>;
  readonly expectedInstances: readonly Readonly<{
    seriesInstanceUid: string;
    sopInstanceUid: string;
  }>[];
}

export type AuthorizedSourceCaptureCoordinatorResult =
  | Readonly<{
      kind: "CAPTURED_FOR_COORDINATOR";
      handoff: AuthorizedSourceCaptureCoordinatorHandoff;
    }>
  | Extract<AuthorizedSourceCaptureResult, { kind: "DENIED" }>;

interface CaptureCommand {
  readonly principal: VerifiedAuthenticationPrincipal;
  readonly tenantCandidate: string;
  readonly correlationId: string;
  readonly operationId: string;
  readonly consentId: string;
  readonly grantId: string;
  readonly signal?: AbortSignal;
}

interface DestinationMappingBinding {
  readonly mappingId: string;
  readonly localPatientId: string;
}

interface ValidatedSourceInstance {
  readonly sopInstanceUid: string;
  readonly seriesInstanceUid: string;
  readonly patientId: string;
}

type StartDecision =
  | Readonly<{
      kind: "STARTED";
      scope: SourceCaptureScope;
      mapping: DestinationMappingBinding;
    }>
  | Readonly<{
      kind: "DENIED";
      reason: Extract<AuthorizedSourceCaptureResult, { kind: "DENIED" }>["reason"];
    }>;

interface CaptureDeadline {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  callerCancelled(): boolean;
  dispose(): void;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function exactCommand(value: unknown): CaptureCommand {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new AuthorizedSourceCaptureInvalidRequestError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !COMMAND_FIELDS.has(key) ||
        descriptors[key]?.enumerable !== true ||
        !Object.hasOwn(descriptors[key] ?? {}, "value"),
    ) ||
    ["principal", "tenantCandidate", "correlationId", "operationId", "consentId", "grantId"].some(
      (key) => !Object.hasOwn(descriptors, key),
    )
  ) {
    throw new AuthorizedSourceCaptureInvalidRequestError();
  }

  const candidate = value as Record<string, unknown>;
  if (
    !candidate.principal ||
    typeof candidate.principal !== "object" ||
    typeof (candidate.principal as VerifiedAuthenticationPrincipal).issuer !== "string" ||
    typeof (candidate.principal as VerifiedAuthenticationPrincipal).subject !== "string" ||
    !validUuid(candidate.tenantCandidate) ||
    !validUuid(candidate.correlationId) ||
    !validUuid(candidate.operationId) ||
    !validUuid(candidate.consentId) ||
    !validUuid(candidate.grantId) ||
    (Object.hasOwn(descriptors, "signal") &&
      candidate.signal !== undefined &&
      !(candidate.signal instanceof AbortSignal))
  ) {
    throw new AuthorizedSourceCaptureInvalidRequestError();
  }

  return Object.freeze({
    principal: candidate.principal as VerifiedAuthenticationPrincipal,
    tenantCandidate: (candidate.tenantCandidate as string).toLowerCase(),
    correlationId: (candidate.correlationId as string).toLowerCase(),
    operationId: (candidate.operationId as string).toLowerCase(),
    consentId: (candidate.consentId as string).toLowerCase(),
    grantId: (candidate.grantId as string).toLowerCase(),
    ...(candidate.signal === undefined ? {} : { signal: candidate.signal as AbortSignal }),
  });
}

function captureDeadline(inputSignal?: AbortSignal): CaptureDeadline {
  const controller = new AbortController();
  let expired = false;
  let callerCancelled = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort(new Error("SOURCE_CAPTURE_DEADLINE"));
  }, TOTAL_CAPTURE_DEADLINE_MS);
  timer.unref?.();
  const abortForCaller = () => {
    callerCancelled = true;
    controller.abort(new Error("SOURCE_CAPTURE_CANCELLED"));
  };
  if (inputSignal?.aborted) abortForCaller();
  else inputSignal?.addEventListener("abort", abortForCaller, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => expired,
    callerCancelled: () => callerCancelled,
    dispose: () => {
      clearTimeout(timer);
      inputSignal?.removeEventListener("abort", abortForCaller);
    },
  };
}

function assertNotAborted(deadline: CaptureDeadline): void {
  if (deadline.signal.aborted) throw new Error("SOURCE_CAPTURE_ABORTED");
}

function sameIdentityHospital(
  identity: VerifiedActorTenantContext,
  scope: SourceCaptureScope,
): boolean {
  return (
    identity.hospitalId !== null &&
    identity.hospitalId.toLowerCase() === scope.destinationHospitalId
  );
}

function sourceContext(
  scope: SourceCaptureScope,
  correlationId: string,
  signal: AbortSignal,
): DicomGatewayRequestContext {
  return Object.freeze({
    hospitalId: scope.sourceHospitalId,
    correlationId,
    signal,
  });
}

function mappingBinding(
  scope: SourceCaptureScope,
  transactionClient: PoolClient,
): Promise<DestinationMappingBinding | null> {
  return (async () => {
    const mapping = await new PostgresPatientMappingRepository(
      transactionClient,
    ).findByPatientReference(scope.destinationHospitalId, scope.patientRefId);
    const decision = validateDestinationPatientMapping({
      patientRefId: scope.patientRefId,
      destinationHospitalId: scope.destinationHospitalId,
      candidates: mapping ? [mapping] : [],
    });
    if (decision.kind !== "VALID" || !mapping) return null;
    return Object.freeze({
      mappingId: decision.mappingId,
      localPatientId: mapping.localPatientId,
    });
  })();
}

function validateMetadata(
  metadata: DicomStudyMetadata,
  scope: SourceCaptureScope,
): readonly ValidatedSourceInstance[] | null {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    metadata.studyInstanceUid !== scope.studyInstanceUid ||
    !Array.isArray(metadata.series) ||
    metadata.series.length < 1 ||
    metadata.series.length > 64 ||
    scope.instanceCount === null ||
    !Number.isSafeInteger(scope.instanceCount) ||
    scope.instanceCount < 1 ||
    scope.instanceCount > SOURCE_INTEGRITY_LIMITS.maximumInstances ||
    (scope.seriesCount !== null &&
      (!Number.isSafeInteger(scope.seriesCount) ||
        scope.seriesCount < 1 ||
        scope.seriesCount !== metadata.series.length))
  ) {
    return null;
  }

  const seenSeries = new Set<string>();
  const seenInstances = new Set<string>();
  const descriptors: ValidatedSourceInstance[] = [];
  for (const series of metadata.series) {
    if (
      !series ||
      typeof series !== "object" ||
      typeof series.seriesInstanceUid !== "string" ||
      series.seriesInstanceUid.length > 64 ||
      !DICOM_UID_PATTERN.test(series.seriesInstanceUid) ||
      seenSeries.has(series.seriesInstanceUid) ||
      !Array.isArray(series.instances) ||
      series.instances.length < 1
    ) {
      return null;
    }
    seenSeries.add(series.seriesInstanceUid);

    for (const instance of series.instances) {
      if (
        !instance ||
        typeof instance !== "object" ||
        typeof instance.sopInstanceUid !== "string" ||
        instance.sopInstanceUid.length > 64 ||
        !DICOM_UID_PATTERN.test(instance.sopInstanceUid) ||
        typeof instance.sopClassUid !== "string" ||
        instance.sopClassUid.length > 64 ||
        !DICOM_UID_PATTERN.test(instance.sopClassUid) ||
        (instance.transferSyntaxUid !== undefined &&
          (typeof instance.transferSyntaxUid !== "string" ||
            instance.transferSyntaxUid.length > 64 ||
            !DICOM_UID_PATTERN.test(instance.transferSyntaxUid))) ||
        typeof instance.patientId !== "string" ||
        seenInstances.has(instance.sopInstanceUid)
      ) {
        return null;
      }
      seenInstances.add(instance.sopInstanceUid);
      descriptors.push(Object.freeze({
        sopInstanceUid: instance.sopInstanceUid,
        seriesInstanceUid: series.seriesInstanceUid,
        patientId: instance.patientId,
      }));
    }
  }

  if (descriptors.length !== scope.instanceCount) return null;
  if (seenSeries.size !== metadata.series.length) return null;
  return Object.freeze(descriptors);
}

function createCoordinatorHandoff(input: {
  readonly identity: VerifiedActorTenantContext;
  readonly scope: SourceCaptureScope;
  readonly evidence: SourceIntegrityEvidenceRecord;
  readonly manifest: SourceIntegrityManifest;
  readonly descriptors: readonly ValidatedSourceInstance[];
}): AuthorizedSourceCaptureCoordinatorHandoff {
  const { identity, scope, evidence, manifest, descriptors } = input;
  if (
    identity.tenantId.toLowerCase() !== scope.tenantId ||
    evidence.operationId !== scope.operationId ||
    evidence.exchangeSessionId !== scope.exchangeSessionId ||
    evidence.packageId !== scope.packageId ||
    evidence.studyRefId !== scope.studyRefId ||
    evidence.verificationStage !== "SOURCE_CAPTURE" ||
    evidence.algorithm !== manifest.algorithm ||
    evidence.sourceDigest !== manifest.aggregateDigest ||
    evidence.sourceObjectCount !== manifest.objectCount ||
    evidence.status !== "PENDING" ||
    descriptors.length !== manifest.objectCount
  ) {
    throw new AuthorizedSourceCaptureUnavailableError();
  }

  const expectedInstances = Object.freeze(
    [...descriptors]
      .sort((left, right) =>
        left.seriesInstanceUid < right.seriesInstanceUid
          ? -1
          : left.seriesInstanceUid > right.seriesInstanceUid
            ? 1
            : left.sopInstanceUid < right.sopInstanceUid
              ? -1
              : left.sopInstanceUid > right.sopInstanceUid
                ? 1
                : 0,
      )
      .map((descriptor) =>
        Object.freeze({
          seriesInstanceUid: descriptor.seriesInstanceUid,
          sopInstanceUid: descriptor.sopInstanceUid,
        }),
      ),
  );

  return Object.freeze({
    operationId: scope.operationId,
    tenantId: identity.tenantId.toLowerCase(),
    actorId: identity.actorId.toLowerCase(),
    exchangeSessionId: scope.exchangeSessionId,
    packageId: scope.packageId,
    studyRefId: scope.studyRefId,
    studyInstanceUid: scope.studyInstanceUid,
    sourceHospitalId: scope.sourceHospitalId,
    destinationHospitalId: scope.destinationHospitalId,
    sourceEvidence: Object.freeze({
      evidenceId: evidence.integrityId,
      status: evidence.status,
      algorithm: evidence.algorithm,
      aggregateDigest: evidence.sourceDigest,
      objectCount: evidence.sourceObjectCount,
      totalBytes: manifest.totalBytes,
    }),
    expectedInstances,
  });
}

function createAudit(input: {
  readonly actorId: string;
  readonly tenantId: string;
  readonly scope: SourceCaptureScope;
  readonly correlationId: string;
  readonly action:
    | "PACS_SOURCE_CAPTURE_STARTED"
    | "PACS_SOURCE_CAPTURED"
    | "PACS_SOURCE_CAPTURE_DENIED"
    | "PACS_SOURCE_CAPTURE_FAILED";
  readonly result: "ALLOW" | "SUCCESS" | "DENY" | "FAILURE";
  readonly reasonCode: string | null;
  readonly now: Date;
  readonly createId: () => string;
}): AuditEvent {
  return AuditEvent.create({
    auditEventId: input.createId(),
    occurredAt: input.now,
    actorId: input.actorId,
    tenantId: input.tenantId,
    exchangeSessionId: input.scope.exchangeSessionId,
    resourceType: "STUDY",
    resourceId: input.scope.studyRefId,
    action: input.action,
    result: input.result,
    reasonCode: input.reasonCode,
    correlationId: input.correlationId,
    createdAt: input.now,
  });
}

function recordAudit(
  transactionClient: PoolClient,
  input: Parameters<typeof createAudit>[0],
): Promise<void> {
  return new PostgresAuditEventWriter(transactionClient).record(createAudit(input));
}

export class AuthorizedSourceCaptureService {
  constructor(
    private readonly operationExecutor: Pick<
      AuthorizationGatedOperationExecutor,
      "executeWithResolvedSessionFence"
    >,
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
    private readonly dicomGateway: SourceCaptureDicomPort,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  capture(input: unknown): Promise<AuthorizedSourceCaptureResult> {
    return this.captureInternal(input, false);
  }

  captureForCoordinator(input: unknown): Promise<AuthorizedSourceCaptureCoordinatorResult> {
    return this.captureInternal(input, true);
  }

  private captureInternal(
    input: unknown,
    coordinatorHandoff: false,
  ): Promise<AuthorizedSourceCaptureResult>;
  private captureInternal(
    input: unknown,
    coordinatorHandoff: true,
  ): Promise<AuthorizedSourceCaptureCoordinatorResult>;
  private async captureInternal(
    input: unknown,
    coordinatorHandoff: boolean,
  ): Promise<AuthorizedSourceCaptureResult | AuthorizedSourceCaptureCoordinatorResult> {
    const command = exactCommand(input);
    const deadline = captureDeadline(command.signal);
    let started = false;
    let initialScope: SourceCaptureScope | undefined;
    let initialMapping: DestinationMappingBinding | undefined;

    try {
      assertNotAborted(deadline);
      let start: StartDecision;
      try {
        start = await this.operationExecutor.executeWithResolvedSessionFence(
          command.principal,
          command.tenantCandidate,
          async (identity, transactionClient) => {
            const scope = await this.resolveScope(
              transactionClient,
              command.operationId,
              identity.tenantId,
            );
            initialScope = scope;
            if (!this.isSupportedScope(identity, scope)) {
              throw new AuthorizationDeniedError();
            }
            return AuthorizationContext.create({
              identity,
              exchangeSessionId: scope.exchangeSessionId,
              resource: { kind: "STUDY", id: scope.studyRefId },
              action: "PACS_IMPORT",
              consentId: command.consentId,
              grantId: command.grantId,
            });
          },
          async (context, transactionClient) => {
            assertNotAborted(deadline);
            const current = await this.resolveScope(
              transactionClient,
              command.operationId,
              context.tenantId,
            );
            if (
              !sameSourceCaptureBinding(initialScope!, current) ||
              current.operationState !== IMPORTABLE_OPERATION_STATE ||
              !IMPORTABLE_SESSION_STATES.has(current.sessionState)
            ) {
              await recordAudit(transactionClient, {
                actorId: context.actorId,
                tenantId: context.tenantId,
                scope: current,
                correlationId: command.correlationId,
                action: "PACS_SOURCE_CAPTURE_DENIED",
                result: "DENY",
                reasonCode: "OPERATION_NOT_CAPTUREABLE",
                now: this.clock(),
                createId: this.createId,
              });
              return Object.freeze({
                kind: "DENIED",
                reason: "OPERATION_NOT_CAPTUREABLE",
              } as const);
            }

            const mapping = await mappingBinding(current, transactionClient);
            if (!mapping) {
              await recordAudit(transactionClient, {
                actorId: context.actorId,
                tenantId: context.tenantId,
                scope: current,
                correlationId: command.correlationId,
                action: "PACS_SOURCE_CAPTURE_DENIED",
                result: "DENY",
                reasonCode: "PATIENT_MAPPING_INVALID",
                now: this.clock(),
                createId: this.createId,
              });
              return Object.freeze({
                kind: "DENIED",
                reason: "PATIENT_MAPPING_INVALID",
              } as const);
            }

            if (
              current.instanceCount === null ||
              !Number.isSafeInteger(current.instanceCount) ||
              current.instanceCount < 1 ||
              current.instanceCount > SOURCE_INTEGRITY_LIMITS.maximumInstances ||
              (current.seriesCount !== null &&
                (!Number.isSafeInteger(current.seriesCount) ||
                  current.seriesCount < 1 || current.seriesCount > 64))
            ) {
              await recordAudit(transactionClient, {
                actorId: context.actorId,
                tenantId: context.tenantId,
                scope: current,
                correlationId: command.correlationId,
                action: "PACS_SOURCE_CAPTURE_DENIED",
                result: "DENY",
                reasonCode: "SOURCE_METADATA_INVALID",
                now: this.clock(),
                createId: this.createId,
              });
              return Object.freeze({
                kind: "DENIED",
                reason: "SOURCE_METADATA_INVALID",
              } as const);
            }

            await recordAudit(transactionClient, {
              actorId: context.actorId,
              tenantId: context.tenantId,
              scope: current,
              correlationId: command.correlationId,
              action: "PACS_SOURCE_CAPTURE_STARTED",
              result: "ALLOW",
              reasonCode: null,
              now: this.clock(),
              createId: this.createId,
            });
            initialScope = current;
            initialMapping = mapping;
            return Object.freeze({ kind: "STARTED", scope: current, mapping });
          },
        );
      } catch (error) {
        if (error instanceof AuthorizationDeniedError) {
          await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "AUTHORIZATION_DENIED");
          return Object.freeze({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
        }
        if (
          error instanceof ProtectedOperationUnavailableError ||
          error instanceof ActorTenantContextUnavailableError ||
          error instanceof SourceCaptureScopePersistenceError
        ) {
          throw new AuthorizedSourceCaptureUnavailableError();
        }
        if (error instanceof ActorTenantContextDeniedError) {
          return Object.freeze({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
        }
        throw new AuthorizedSourceCaptureUnavailableError();
      }

      if (start.kind === "DENIED") return start;
      started = true;
      initialScope = start.scope;
      initialMapping = start.mapping;

      const context = sourceContext(start.scope, command.correlationId, deadline.signal);
      assertNotAborted(deadline);
      const metadata = await this.dicomGateway.retrieveStudyMetadata({
        context,
        studyInstanceUid: start.scope.studyInstanceUid,
        maximumItems: SOURCE_INTEGRITY_LIMITS.maximumInstances,
      });
      const descriptors = validateMetadata(metadata, start.scope);
      if (!descriptors) {
        await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "SOURCE_METADATA_INVALID");
        return Object.freeze({ kind: "DENIED", reason: "SOURCE_METADATA_INVALID" });
      }

      const patientIds = descriptors.map((descriptor) => descriptor.patientId);
      const patientBinding = validatePacsPatientIdBinding({
        destinationLocalPatientId: start.mapping.localPatientId,
        sourceInstancePatientIds: patientIds,
      });
      if (patientBinding.kind !== "IDENTITY_MATCHED") {
        await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "SOURCE_PATIENT_ID_MISMATCH");
        return Object.freeze({ kind: "DENIED", reason: "SOURCE_PATIENT_ID_MISMATCH" });
      }

      const instanceDescriptors = descriptors.map((descriptor) => {
        return Object.freeze({
          sopInstanceUid: descriptor.sopInstanceUid,
          openStream: async (signal?: AbortSignal) => {
            if (!signal) throw new Error("SOURCE_CAPTURE_ABORTED");
            return this.dicomGateway.retrieveInstanceStream({
              context: Object.freeze({ ...context, signal }),
              studyInstanceUid: start.scope.studyInstanceUid,
              seriesInstanceUid: descriptor.seriesInstanceUid,
              sopInstanceUid: descriptor.sopInstanceUid,
            });
          },
        });
      });

      let manifest: SourceIntegrityManifest;
      try {
        manifest = await buildSourceIntegrityManifest({
          expectedInstanceCount: start.scope.instanceCount as number,
          instances: instanceDescriptors,
          signal: deadline.signal,
        });
      } catch (error) {
        const reasonCode = deadline.timedOut()
          ? "SOURCE_CAPTURE_DEADLINE"
          : deadline.callerCancelled() ||
              (error instanceof SourceIntegrityInputError && error.code === "ABORTED")
            ? "SOURCE_CAPTURE_CANCELLED"
            : "SOURCE_READ_FAILED";
        await this.bestEffortAudit(
          command,
          "PACS_SOURCE_CAPTURE_FAILED",
          "FAILURE",
          reasonCode,
        );
        throw new AuthorizedSourceCaptureUnavailableError();
      }

      assertNotAborted(deadline);
      let completion: AuthorizedSourceCaptureResult | AuthorizedSourceCaptureCoordinatorResult;
      try {
        completion = await this.operationExecutor.executeWithResolvedSessionFence(
          command.principal,
          command.tenantCandidate,
          async (identity, transactionClient) => {
            const scope = await this.resolveScope(
              transactionClient,
              command.operationId,
              identity.tenantId,
            );
            if (!this.isSupportedScope(identity, scope)) {
              throw new AuthorizationDeniedError();
            }
            return AuthorizationContext.create({
              identity,
              exchangeSessionId: scope.exchangeSessionId,
              resource: { kind: "STUDY", id: scope.studyRefId },
              action: "PACS_IMPORT",
              consentId: command.consentId,
              grantId: command.grantId,
            });
          },
          async (authorizationContext, transactionClient) => {
            assertNotAborted(deadline);
            const current = await this.resolveScope(
              transactionClient,
              command.operationId,
              authorizationContext.tenantId,
            );
            if (
              !sameSourceCaptureBinding(start.scope, current) ||
              current.operationState !== IMPORTABLE_OPERATION_STATE ||
              !IMPORTABLE_SESSION_STATES.has(current.sessionState)
            ) {
              await recordAudit(transactionClient, {
                actorId: authorizationContext.actorId,
                tenantId: authorizationContext.tenantId,
                scope: current,
                correlationId: command.correlationId,
                action: "PACS_SOURCE_CAPTURE_DENIED",
                result: "DENY",
                reasonCode: "OPERATION_NOT_CAPTUREABLE",
                now: this.clock(),
                createId: this.createId,
              });
              return Object.freeze({
                kind: "DENIED",
                reason: "OPERATION_NOT_CAPTUREABLE",
              } as const);
            }

            const mapping = await mappingBinding(current, transactionClient);
            if (
              !mapping ||
              mapping.mappingId !== initialMapping!.mappingId ||
              mapping.localPatientId !== initialMapping!.localPatientId
            ) {
              await recordAudit(transactionClient, {
                actorId: authorizationContext.actorId,
                tenantId: authorizationContext.tenantId,
                scope: current,
                correlationId: command.correlationId,
                action: "PACS_SOURCE_CAPTURE_DENIED",
                result: "DENY",
                reasonCode: "PATIENT_MAPPING_INVALID",
                now: this.clock(),
                createId: this.createId,
              });
              return Object.freeze({
                kind: "DENIED",
                reason: "PATIENT_MAPPING_INVALID",
              } as const);
            }

            const evidence = await new PostgresSourceIntegrityEvidenceRepository(
              transactionClient,
              this.createId,
            ).createPendingSourceCapture({
              operationId: command.operationId,
              manifest,
              now: this.clock(),
            });
            await recordAudit(transactionClient, {
              actorId: authorizationContext.actorId,
              tenantId: authorizationContext.tenantId,
              scope: current,
              correlationId: command.correlationId,
              action: "PACS_SOURCE_CAPTURED",
              result: "SUCCESS",
              reasonCode: null,
              now: this.clock(),
              createId: this.createId,
            });
            if (coordinatorHandoff) {
              return Object.freeze({
                kind: "CAPTURED_FOR_COORDINATOR",
                handoff: createCoordinatorHandoff({
                  identity: authorizationContext,
                  scope: current,
                  evidence: evidence.record,
                  manifest,
                  descriptors,
                }),
              } as const);
            }
            return Object.freeze({
              kind: "CAPTURED",
              evidenceId: evidence.record.integrityId,
              status: "PENDING",
              objectCount: manifest.objectCount,
            } as const);
          },
        );
      } catch (error) {
        if (error instanceof AuthorizationDeniedError) {
          await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "AUTHORIZATION_DENIED");
          return Object.freeze({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
        }
        if (
          error instanceof ProtectedOperationUnavailableError ||
          error instanceof ActorTenantContextUnavailableError ||
          error instanceof SourceCaptureScopePersistenceError
        ) {
          const reasonCode = deadline.timedOut()
            ? "SOURCE_CAPTURE_DEADLINE"
            : deadline.callerCancelled()
              ? "SOURCE_CAPTURE_CANCELLED"
              : "SOURCE_CAPTURE_PERSISTENCE_FAILED";
          await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_FAILED", "FAILURE", reasonCode);
          throw new AuthorizedSourceCaptureUnavailableError();
        }
        if (error instanceof ActorTenantContextDeniedError) {
          await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "AUTHORIZATION_DENIED");
          return Object.freeze({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
        }
        await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_FAILED", "FAILURE", "SOURCE_CAPTURE_PERSISTENCE_FAILED");
        throw new AuthorizedSourceCaptureUnavailableError();
      }

      if (completion.kind === "DENIED") return completion;
      return completion;
    } catch (error) {
      if (
        error instanceof AuthorizedSourceCaptureInvalidRequestError ||
        error instanceof AuthorizedSourceCaptureUnavailableError
      ) {
        throw error;
      }
      if (started) {
        const reasonCode = deadline.timedOut()
          ? "SOURCE_CAPTURE_DEADLINE"
          : deadline.callerCancelled() ||
              (error instanceof SourceIntegrityInputError && error.code === "ABORTED")
            ? "SOURCE_CAPTURE_CANCELLED"
            : "SOURCE_READ_FAILED";
        await this.bestEffortAudit(
          command,
          "PACS_SOURCE_CAPTURE_FAILED",
          "FAILURE",
          reasonCode,
        );
      }
      throw new AuthorizedSourceCaptureUnavailableError();
    } finally {
      deadline.dispose();
    }
  }

  private async resolveScope(
    transactionClient: PoolClient,
    operationId: string,
    tenantId: string,
  ): Promise<SourceCaptureScope> {
    let scope: SourceCaptureScope | null;
    try {
      scope = await new PostgresSourceCaptureScopeRepository(
        transactionClient,
      ).findByOperationId(operationId, tenantId);
    } catch {
      throw new ProtectedOperationUnavailableError();
    }
    if (!scope) throw new AuthorizationDeniedError();
    return scope;
  }

  private isSupportedScope(
    identity: VerifiedActorTenantContext,
    scope: SourceCaptureScope,
  ): boolean {
    return (
      this.isTestBinding(identity, scope) &&
      scope.operationState === IMPORTABLE_OPERATION_STATE
    );
  }

  private isTestBinding(
    identity: VerifiedActorTenantContext,
    scope: SourceCaptureScope,
  ): boolean {
    return (
      scope.tenantId === identity.tenantId.toLowerCase() &&
      sameIdentityHospital(identity, scope) &&
      scope.sourceHospitalId === TEST_HOSPITAL_A_ID &&
      scope.destinationHospitalId === TEST_HOSPITAL_B_ID
    );
  }

  private async bestEffortAudit(
    command: CaptureCommand,
    action:
      | "PACS_SOURCE_CAPTURE_DENIED"
      | "PACS_SOURCE_CAPTURE_FAILED",
    result: "DENY" | "FAILURE",
    reasonCode: string,
  ): Promise<void> {
    try {
      await this.actorTenantContext.run(
        command.principal,
        command.tenantCandidate,
        async (identity, transactionClient) => {
          const scope = await new PostgresSourceCaptureScopeRepository(
            transactionClient,
          ).findByOperationId(command.operationId, identity.tenantId);
          if (!scope || !this.isTestBinding(identity, scope)) return;
          await recordAudit(transactionClient, {
            actorId: identity.actorId,
            tenantId: identity.tenantId,
            scope,
            correlationId: command.correlationId,
            action,
            result,
            reasonCode,
            now: this.clock(),
            createId: this.createId,
          });
        },
      );
    } catch {
      // A secondary, metadata-only Audit attempt must not replace the fixed
      // denial/failure result or leak database details.
    }
  }
}
