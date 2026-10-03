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
  buildSourceIntegrityCapture,
  type SourceIntegrityCapture,
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
import { pacsTransferOperationDigest } from "../../pacs/domain/pacs-transfer-operation-digest.js";
import { AuditEvent } from "../../audit/domain/audit-event.js";
import { PostgresAuditEventWriter } from "../../audit/persistence/postgres-audit-event-writer.js";
import type {
  EphemeralEncryptedTemporaryImagingStore,
  TemporaryImagingInstanceBinding,
  TemporaryImagingInstanceReceipt,
  TemporaryImagingPackageBinding,
  TemporaryImagingPackageReceipt,
  TemporaryImagingInstanceConsumer,
} from "../../imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";
import {
  PostgresTemporaryPayloadMetadataRepository,
  type TemporaryPayloadOperationBinding,
} from "../../imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";
import { PostgresTemporaryPayloadQuotaRepository } from "../../imaging-storage/persistence/postgres-temporary-payload-quota.repository.js";
import { TemporaryPayloadPurgeCoordinator } from "../../imaging-storage/application/temporary-payload-purge.coordinator.js";

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

export class AuthorizedTemporaryImagingReadUnavailableError extends Error {
  constructor() {
    super("TEMPORARY_IMAGING_READ_UNAVAILABLE");
    this.name = "AuthorizedTemporaryImagingReadUnavailableError";
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
    sopClassUid: string;
    transferSyntaxUid: string;
    byteLength: number;
    sha256: `sha256:${string}`;
  }>[];
  readonly temporaryPackage?: Readonly<{
    storageRef: string;
    packageId: string;
    expiresAt: string;
    objectCount: number;
    totalBytes: number;
    instances: readonly Readonly<{
      objectRef: string;
      seriesInstanceUid: string;
      sopInstanceUid: string;
      sopClassUid: string;
      transferSyntaxUid: string;
      byteLength: number;
      sha256: `sha256:${string}`;
    }>[];
  }>;
}

type TemporaryImagingCaptureStore = Pick<
  EphemeralEncryptedTemporaryImagingStore,
  "beginReservedPackage" | "beginInstance" | "sealPackage" | "purgeByReference"
> & Partial<Pick<EphemeralEncryptedTemporaryImagingStore, "consumeInstance">>;

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
  readonly sopClassUid: string;
  readonly transferSyntaxUid?: string;
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
  readonly expiresAtMilliseconds: number;
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
  const principalFields = candidate.principal && typeof candidate.principal === "object"
    ? Object.getOwnPropertyDescriptors(candidate.principal) : {};
  const issuer = principalFields.issuer?.value;
  const subject = principalFields.subject?.value;
  if (
    !candidate.principal ||
    typeof candidate.principal !== "object" ||
    typeof issuer !== "string" || issuer.length === 0 ||
    typeof subject !== "string" || subject.length === 0 || subject.length > 255 ||
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
    principal: Object.freeze({ issuer, subject }),
    tenantCandidate: (candidate.tenantCandidate as string).toLowerCase(),
    correlationId: (candidate.correlationId as string).toLowerCase(),
    operationId: (candidate.operationId as string).toLowerCase(),
    consentId: (candidate.consentId as string).toLowerCase(),
    grantId: (candidate.grantId as string).toLowerCase(),
    ...(candidate.signal === undefined ? {} : { signal: candidate.signal as AbortSignal }),
  });
}

function captureDeadline(clock: () => Date, inputSignal?: AbortSignal): CaptureDeadline {
  let startedAt: number;
  try {
    startedAt = clock().getTime();
    if (!Number.isFinite(startedAt) ||
      !Number.isFinite(new Date(startedAt + TOTAL_CAPTURE_DEADLINE_MS).getTime())) {
      throw new Error("INVALID_CAPTURE_TIME");
    }
  } catch {
    throw new AuthorizedSourceCaptureUnavailableError();
  }
  const expiresAtMilliseconds = startedAt + TOTAL_CAPTURE_DEADLINE_MS;
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
    expiresAtMilliseconds,
    timedOut: () => {
      if (!expired) {
        try {
          const now = clock().getTime();
          expired = !Number.isFinite(now) || now >= expiresAtMilliseconds;
        } catch { expired = true; }
        if (expired) controller.abort(new Error("SOURCE_CAPTURE_DEADLINE"));
      }
      return expired;
    },
    callerCancelled: () => callerCancelled,
    dispose: () => {
      clearTimeout(timer);
      inputSignal?.removeEventListener("abort", abortForCaller);
    },
  };
}

function assertNotAborted(deadline: CaptureDeadline): void {
  if (deadline.timedOut() || deadline.signal.aborted) throw new Error("SOURCE_CAPTURE_ABORTED");
}

function sameCaptureIdentity(left: VerifiedActorTenantContext, right: VerifiedActorTenantContext): boolean {
  return left.issuer === right.issuer && left.subject === right.subject &&
    left.actorId === right.actorId && left.tenantId === right.tenantId &&
    left.hospitalId === right.hospitalId && left.actorType === right.actorType;
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
        instance.sopClassUid !== "1.2.840.10008.5.1.4.1.1.2" ||
        instance.sopClassUid.length > 64 ||
        !DICOM_UID_PATTERN.test(instance.sopClassUid) ||
        (instance.transferSyntaxUid !== undefined &&
          (typeof instance.transferSyntaxUid !== "string" ||
            instance.transferSyntaxUid !== "1.2.840.10008.1.2.1" ||
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
        sopClassUid: instance.sopClassUid,
        ...(instance.transferSyntaxUid === undefined ? {} : { transferSyntaxUid: instance.transferSyntaxUid }),
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
  readonly capture: SourceIntegrityCapture;
  readonly descriptors: readonly ValidatedSourceInstance[];
  readonly observedSyntaxes: ReadonlyMap<string, string>;
  readonly temporaryPackage?: AuthorizedSourceCaptureCoordinatorHandoff["temporaryPackage"];
}): AuthorizedSourceCaptureCoordinatorHandoff {
  const { identity, scope, evidence, capture, descriptors, observedSyntaxes } = input;
  const { manifest } = capture;
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
    descriptors.length !== manifest.objectCount ||
    capture.instances.length !== manifest.objectCount
  ) {
    throw new AuthorizedSourceCaptureUnavailableError();
  }

  const perInstance = new Map(
    capture.instances.map((instance) => [instance.sopInstanceUid, instance]),
  );
  const descriptorUids = new Set(
    descriptors.map((descriptor) => descriptor.sopInstanceUid),
  );
  if (
    perInstance.size !== manifest.objectCount ||
    descriptorUids.size !== descriptors.length ||
    descriptorUids.size !== perInstance.size ||
    [...perInstance.keys()].some((sopInstanceUid) => !descriptorUids.has(sopInstanceUid)) ||
    capture.instances.reduce((sum, instance) => sum + instance.byteLength, 0) !==
      manifest.totalBytes
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
      .map((descriptor) => {
        const integrity = perInstance.get(descriptor.sopInstanceUid);
        if (
          !integrity || observedSyntaxes.get(descriptor.sopInstanceUid) !== "1.2.840.10008.1.2.1" ||
          !/^sha256:[0-9a-f]{64}$/.test(integrity.sha256) ||
          !Number.isSafeInteger(integrity.byteLength) ||
          integrity.byteLength < 1
        ) {
          throw new AuthorizedSourceCaptureUnavailableError();
        }
        return Object.freeze({
          seriesInstanceUid: descriptor.seriesInstanceUid,
          sopInstanceUid: descriptor.sopInstanceUid,
          sopClassUid: descriptor.sopClassUid,
          transferSyntaxUid: observedSyntaxes.get(descriptor.sopInstanceUid)!,
          byteLength: integrity.byteLength,
          sha256: integrity.sha256,
        });
      }),
  );
  if (expectedInstances.length !== perInstance.size) {
    throw new AuthorizedSourceCaptureUnavailableError();
  }

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
    ...(input.temporaryPackage
      ? { temporaryPackage: input.temporaryPackage }
      : {}),
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
    | "PACS_SOURCE_CAPTURE_FAILED"
    | "PACS_TEMPORARY_READ_AUTHORIZED"
    | "PACS_TEMPORARY_READ_FAILED";
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
  // Provenance only, never an Authorization capability. No PatientID is added
  // to the serializable handoff; clones/restarted services have no binding.
  readonly #captureBindings = new WeakMap<AuthorizedSourceCaptureCoordinatorHandoff, Readonly<{
    identity: VerifiedActorTenantContext;
    scope: SourceCaptureScope;
    mapping: DestinationMappingBinding;
  }>>();
  readonly #dispatchReads = new WeakMap<AuthorizedSourceCaptureCoordinatorHandoff, {
    readonly claimedAt: string;
    readonly attempts: Set<string>;
  }>();

  constructor(
    private readonly operationExecutor: Pick<
      AuthorizationGatedOperationExecutor,
      "executeWithResolvedSessionFence"
    >,
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
    private readonly dicomGateway: SourceCaptureDicomPort,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly temporaryImagingStore?: TemporaryImagingCaptureStore,
  ) {}

  capture(input: unknown): Promise<AuthorizedSourceCaptureResult> {
    return this.captureInternal(input, false);
  }

  captureForCoordinator(input: unknown): Promise<AuthorizedSourceCaptureCoordinatorResult> {
    return this.captureInternal(input, true);
  }

  /** Internal pre-dispatch borrowed read; never accepts a caller access verifier. */
  async consumeCapturedInstance(input: unknown, consume: TemporaryImagingInstanceConsumer): Promise<void> {
    return this.consumeInstanceInternal("CAPTURE", input, consume);
  }

  /** Read-only prerequisite, never a dispatch capability or caller verifier. */
  async consumeDispatchedInstance(input: unknown, consume: TemporaryImagingInstanceConsumer): Promise<void> {
    return this.consumeInstanceInternal("DISPATCH", input, consume);
  }

  private async consumeInstanceInternal(mode: "CAPTURE" | "DISPATCH", input: unknown,
    consume: TemporaryImagingInstanceConsumer): Promise<void> {
    let command: CaptureCommand | undefined;
    try {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
        typeof consume !== "function" || typeof this.temporaryImagingStore?.consumeInstance !== "function") {
        throw new Error("INVALID_READ_INPUT");
      }
      const fields = Object.getOwnPropertyDescriptors(input);
      const required = ["principal", "tenantCandidate", "correlationId", "consentId", "grantId", "handoff", "objectRef"];
      if (required.some((name) => !Object.hasOwn(fields, name)) ||
        Reflect.ownKeys(fields).some((key) => typeof key !== "string" ||
          (!required.includes(key) && key !== "signal") ||
          !Object.hasOwn(fields[key]!, "value") || !fields[key]!.enumerable)) {
        throw new Error("INVALID_READ_INPUT");
      }
      const handoff = fields.handoff!.value as AuthorizedSourceCaptureCoordinatorHandoff;
      const binding = this.#captureBindings.get(handoff);
      if (!binding) throw new Error("UNKNOWN_CAPTURE");
      const temporary = handoff.temporaryPackage;
      const objectRef = fields.objectRef!.value;
      if (!temporary || !validUuid(objectRef)) throw new Error("UNKNOWN_CAPTURE");
      const instance = temporary.instances.find((item) => item.objectRef === objectRef.toLowerCase());
      if (!instance) throw new Error("UNKNOWN_OBJECT");
      if (mode === "DISPATCH" && this.#dispatchReads.get(handoff)?.attempts.has(instance.objectRef)) throw new Error("DISPATCH_READ_REPLAY");
      command = exactCommand({
        principal: fields.principal!.value, tenantCandidate: fields.tenantCandidate!.value,
        correlationId: fields.correlationId!.value, consentId: fields.consentId!.value,
        grantId: fields.grantId!.value, operationId: binding.scope.operationId,
        ...(fields.signal ? { signal: fields.signal.value } : {}),
      });
      const readCommand = command;
      const expiresAt = new Date(temporary.expiresAt);
      const assertLive = () => {
        const now = this.clock().getTime();
        if (readCommand.signal?.aborted || !Number.isFinite(now) ||
          !Number.isFinite(expiresAt.getTime()) || now >= expiresAt.getTime()) throw new Error("READ_EXPIRED");
      };
      let phase = 0;
      let claimedAt: string | undefined;
      await this.temporaryImagingStore.consumeInstance({
        storageRef: temporary.storageRef, objectRef: instance.objectRef,
        packageBinding: Object.freeze({ tenantId: handoff.tenantId,
          exchangeSessionId: handoff.exchangeSessionId, packageId: handoff.packageId, purpose: "PACS_IMPORT" }),
        instanceBinding: Object.freeze({ studyRefId: handoff.studyRefId,
          seriesInstanceUid: instance.seriesInstanceUid, sopInstanceUid: instance.sopInstanceUid }),
        expectedByteLength: instance.byteLength, expectedSha256: instance.sha256,
        ...(readCommand.signal ? { signal: readCommand.signal } : {}),
      }, async () => {
        assertLive();
        phase += 1;
        if (phase > 2) throw new Error("INVALID_READ_PHASE");
        if (mode === "DISPATCH" && phase === 1 && this.#dispatchReads.get(handoff)?.attempts.has(instance.objectRef)) {
          throw new Error("DISPATCH_READ_REPLAY");
        }
        await this.operationExecutor.executeWithResolvedSessionFence(
          readCommand.principal, readCommand.tenantCandidate,
          async (identity, transaction) => {
            const scope = await this.resolveScope(transaction, readCommand.operationId, identity.tenantId);
            if (!sameCaptureIdentity(identity, binding.identity) || !this.isTestBinding(identity, scope) ||
              scope.operationState !== (mode === "CAPTURE" ? "CREATED" : "STOW_STARTED") ||
              !sameSourceCaptureBinding(binding.scope, scope)) throw new AuthorizationDeniedError();
            return AuthorizationContext.create({ identity, exchangeSessionId: scope.exchangeSessionId,
              resource: { kind: "STUDY", id: scope.studyRefId }, action: "PACS_IMPORT",
              consentId: readCommand.consentId, grantId: readCommand.grantId });
          },
          async (identity, transaction) => {
            assertLive();
            const scope = await this.resolveScope(transaction, readCommand.operationId, identity.tenantId);
            if (!sameSourceCaptureBinding(binding.scope, scope) ||
              scope.operationState !== (mode === "CAPTURE" ? "CREATED" : "STOW_STARTED") || !IMPORTABLE_SESSION_STATES.has(scope.sessionState)) {
              throw new Error("READ_GRAPH_CHANGED");
            }
            const mapping = await mappingBinding(scope, transaction);
            if (!mapping || mapping.mappingId !== binding.mapping.mappingId ||
              mapping.localPatientId !== binding.mapping.localPatientId) throw new Error("READ_MAPPING_CHANGED");
            const available = await transaction.query(
              `SELECT 1 AS capture_read_available
                 FROM study_references AS sr
                 JOIN integrity_evidence AS ie ON ie.study_ref_id = sr.study_ref_id
                WHERE sr.study_ref_id = $1::uuid AND sr.package_id = $2::uuid
                  AND sr.source_hospital_id = $3::uuid
                  AND sr.temporary_storage_ref = $4::uuid
                  AND sr.temporary_payload_state = 'AVAILABLE'
                  AND sr.temporary_payload_purged_at IS NULL
                  AND sr.temporary_payload_expires_at = $5::timestamptz
                  AND sr.temporary_payload_expires_at > $6::timestamptz
                  AND ie.integrity_id = $7::uuid AND ie.operation_id = $8::uuid
                  AND ie.exchange_session_id = $9::uuid AND ie.package_id = sr.package_id
                  AND ie.verification_stage = 'SOURCE_CAPTURE' AND ie.status = 'PENDING'
                  AND ie.verified_at IS NULL AND ie.algorithm = $10
                  AND ie.source_digest = $11 AND ie.source_object_count = $12
                  AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = $13::uuid`,
              [scope.studyRefId, scope.packageId, scope.sourceHospitalId, temporary.storageRef,
                expiresAt, this.clock(), handoff.sourceEvidence.evidenceId, scope.operationId,
                scope.exchangeSessionId, handoff.sourceEvidence.algorithm,
                handoff.sourceEvidence.aggregateDigest, handoff.sourceEvidence.objectCount, scope.tenantId],
            );
            if (available.rowCount !== 1 || available.rows.length !== 1) throw new Error("READ_METADATA_CHANGED");
            if (mode === "DISPATCH") {
              const digest = pacsTransferOperationDigest({ tenantId: identity.tenantId,
                actorId: identity.actorId, exchangeSessionId: scope.exchangeSessionId, studyRefId: scope.studyRefId,
                consentId: readCommand.consentId, grantId: readCommand.grantId, action: "PACS_IMPORT" });
              const claim = await transaction.query(
                `SELECT op.stow_started_at AS dispatch_read_claimed_at
                   FROM pacs_transfer_operations AS op
                   JOIN provenance_records AS pr ON pr.operation_id = op.operation_id
                  WHERE op.operation_id = $1::uuid AND op.tenant_id = $2::uuid AND op.actor_id = $3::uuid
                    AND op.exchange_session_id = $4::uuid AND op.study_ref_id = $5::uuid
                    AND op.request_digest = $6 AND op.state = 'STOW_STARTED' AND op.version = 2
                    AND op.source_object_count = $7 AND op.stow_started_at IS NOT NULL
                    AND op.stow_started_at >= op.created_at AND op.stow_started_at <= op.updated_at
                    AND op.stow_started_at <= $8::timestamptz AND op.stow_started_at < $9::timestamptz
                    AND pr.exchange_session_id = op.exchange_session_id AND pr.package_id = $10::uuid
                    AND pr.study_ref_id = op.study_ref_id AND pr.source_hospital_id = $11::uuid
                    AND pr.destination_hospital_id = $12::uuid AND pr.transfer_type = 'PACS_IMPORT'
                    AND pr.transfer_status = 'PENDING' AND pr.integrity_id IS NULL
                    AND pr.ingested_at IS NULL AND pr.transferred_at IS NULL
                    AND pr.created_at <= op.stow_started_at
                    AND EXISTS (SELECT 1 FROM audit_events AS ae WHERE ae.resource_id = op.operation_id
                      AND ae.resource_type = 'PACS_TRANSFER_OPERATION' AND ae.exchange_session_id = op.exchange_session_id
                      AND ae.actor_id = op.actor_id AND ae.tenant_id = op.tenant_id
                      AND ae.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED' AND ae.result = 'SUCCESS'
                      AND ae.reason_code = 'PREFLIGHT_PASSED' AND ae.occurred_at <= op.stow_started_at)
                    AND EXISTS (SELECT 1 FROM audit_events AS ae WHERE ae.resource_id = op.operation_id
                      AND ae.resource_type = 'PACS_TRANSFER_OPERATION' AND ae.exchange_session_id = op.exchange_session_id
                      AND ae.actor_id = op.actor_id AND ae.tenant_id = op.tenant_id
                      AND ae.action = 'PACS_TRANSFER_OPERATION_STATE_CHANGED' AND ae.result = 'SUCCESS'
                      AND ae.reason_code = 'STOW_STARTED' AND ae.occurred_at = op.stow_started_at)
                    AND NULLIF(current_setting('mediq.tenant_id', true), '')::uuid = op.tenant_id`,
                [scope.operationId, scope.tenantId, identity.actorId, scope.exchangeSessionId, scope.studyRefId,
                  digest, handoff.sourceEvidence.objectCount, this.clock(), expiresAt, scope.packageId,
                  scope.sourceHospitalId, scope.destinationHospitalId],
              );
              const timestamp = claim.rows[0]?.dispatch_read_claimed_at;
              if (claim.rowCount !== 1 || claim.rows.length !== 1 || !(timestamp instanceof Date) ||
                !Number.isFinite(timestamp.getTime()) || timestamp > this.clock() || timestamp >= expiresAt ||
                (claimedAt !== undefined && claimedAt !== timestamp.toISOString()) ||
                (this.#dispatchReads.get(handoff) && this.#dispatchReads.get(handoff)!.claimedAt !== timestamp.toISOString())) {
                throw new Error("DISPATCH_CLAIM_CHANGED");
              }
              claimedAt = timestamp.toISOString();
              if (phase === 1) {
                // Reserve after positive fresh ownership/authorization, before
                // Audit/COMMIT acknowledgement. A lost acknowledgement cannot
                // turn this process's attempted read into a retry capability.
                const previous = this.#dispatchReads.get(handoff);
                if (previous?.attempts.has(instance.objectRef)) throw new Error("DISPATCH_READ_REPLAY");
                const ledger = previous ?? { claimedAt, attempts: new Set<string>() };
                ledger.attempts.add(instance.objectRef); this.#dispatchReads.set(handoff, ledger);
              }
            }
            await recordAudit(transaction, { actorId: identity.actorId, tenantId: identity.tenantId, scope,
              correlationId: readCommand.correlationId, action: "PACS_TEMPORARY_READ_AUTHORIZED", result: "ALLOW",
              reasonCode: phase === 1 ? "BEFORE_DECRYPT" : "BEFORE_DELIVERY", now: this.clock(), createId: this.createId });
          },
        );
        if (mode === "DISPATCH" && phase === 1) {
          if (!claimedAt || !this.#dispatchReads.get(handoff)?.attempts.has(instance.objectRef)) throw new Error("DISPATCH_CLAIM_MISSING");
        }
        assertLive();
        return "VERIFIED";
      }, async (plaintext, signal) => {
        if (phase !== 2) throw new Error("READ_NOT_AUTHORIZED");
        assertLive();
        await consume(plaintext, signal);
      });
    } catch {
      if (command) await this.bestEffortAudit(command, "PACS_TEMPORARY_READ_FAILED", "FAILURE", "TEMPORARY_READ_FAILED");
      throw new AuthorizedTemporaryImagingReadUnavailableError();
    }
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
    const deadline = captureDeadline(this.clock, command.signal);
    let started = false;
    let initialScope: SourceCaptureScope | undefined;
    let initialMapping: DestinationMappingBinding | undefined;
    let initialIdentity: VerifiedActorTenantContext | undefined;
    let temporaryPackageBinding: TemporaryImagingPackageBinding | undefined;
    let temporaryOperationBinding: TemporaryPayloadOperationBinding | undefined;
    let attemptedStorageRef: string | undefined;
    let temporaryPackageHandle: Awaited<
      ReturnType<TemporaryImagingCaptureStore["beginReservedPackage"]>
    > | undefined;
    let temporaryPackageReceipt: TemporaryImagingPackageReceipt | undefined;
    let temporaryPackageHandoff: AuthorizedSourceCaptureCoordinatorHandoff["temporaryPackage"];
    let keepTemporaryPackage = false;
    const stagedInstances = new Map<string, TemporaryImagingInstanceReceipt>();

    try {
      assertNotAborted(deadline);
      if (coordinatorHandoff && this.temporaryImagingStore !== undefined &&
        (!this.temporaryImagingStore || ["beginReservedPackage", "beginInstance", "sealPackage", "purgeByReference"].some(
          (method) => typeof this.temporaryImagingStore![method as keyof TemporaryImagingCaptureStore] !== "function",
        ))) throw new AuthorizedSourceCaptureUnavailableError();
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
            initialIdentity = Object.freeze({
              issuer: context.issuer, subject: context.subject, actorId: context.actorId,
              tenantId: context.tenantId, hospitalId: context.hospitalId, actorType: context.actorType,
            });
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

      if (coordinatorHandoff && this.temporaryImagingStore) {
        let reservationDenial: Extract<AuthorizedSourceCaptureResult, { kind: "DENIED" }> | null;
        try {
          reservationDenial = await this.operationExecutor.executeWithResolvedSessionFence(
            command.principal,
            command.tenantCandidate,
            async (identity, transactionClient) => {
              const scope = await this.resolveScope(transactionClient, command.operationId, identity.tenantId);
              if (!this.isSupportedScope(identity, scope) || !sameCaptureIdentity(identity, initialIdentity!)) {
                throw new AuthorizationDeniedError();
              }
              return AuthorizationContext.create({
                identity, exchangeSessionId: scope.exchangeSessionId,
                resource: { kind: "STUDY", id: scope.studyRefId }, action: "PACS_IMPORT",
                consentId: command.consentId, grantId: command.grantId,
              });
            },
            async (identity, transactionClient) => {
              assertNotAborted(deadline);
              const current = await this.resolveScope(transactionClient, command.operationId, identity.tenantId);
              if (!sameSourceCaptureBinding(start.scope, current) ||
                current.operationState !== IMPORTABLE_OPERATION_STATE ||
                !IMPORTABLE_SESSION_STATES.has(current.sessionState)) {
                return Object.freeze({ kind: "DENIED", reason: "OPERATION_NOT_CAPTUREABLE" } as const);
              }
              const mapping = await mappingBinding(current, transactionClient);
              if (!mapping || mapping.mappingId !== start.mapping.mappingId ||
                mapping.localPatientId !== start.mapping.localPatientId) {
                return Object.freeze({ kind: "DENIED", reason: "PATIENT_MAPPING_INVALID" } as const);
              }
              temporaryOperationBinding = Object.freeze({
                operationId: current.operationId, tenantId: current.tenantId,
                exchangeSessionId: current.exchangeSessionId, packageId: current.packageId,
                studyRefId: current.studyRefId, sourceHospitalId: current.sourceHospitalId,
              });
              // Retain the exact attempted ref even if SQL/COMMIT acknowledgement
              // fails. A losing attempt can never purge the winner's different ref.
              attemptedStorageRef = randomUUID();
              await new PostgresTemporaryPayloadMetadataRepository(transactionClient).reserveStaging({
                binding: temporaryOperationBinding,
                storageRef: attemptedStorageRef,
                expiresAt: new Date(deadline.expiresAtMilliseconds),
              });
              return null;
            },
          );
        } catch (error) {
          if (error instanceof AuthorizationDeniedError || error instanceof ActorTenantContextDeniedError) {
            await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", "AUTHORIZATION_DENIED");
            return Object.freeze({ kind: "DENIED", reason: "AUTHORIZATION_DENIED" });
          }
          await this.bestEffortAudit(
            command, "PACS_SOURCE_CAPTURE_FAILED", "FAILURE",
            deadline.timedOut() ? "SOURCE_CAPTURE_DEADLINE" : deadline.callerCancelled()
              ? "SOURCE_CAPTURE_CANCELLED" : "SOURCE_CAPTURE_PERSISTENCE_FAILED",
          );
          throw new AuthorizedSourceCaptureUnavailableError();
        }
        if (reservationDenial) {
          await this.bestEffortAudit(command, "PACS_SOURCE_CAPTURE_DENIED", "DENY", reservationDenial.reason);
          return reservationDenial;
        }
        assertNotAborted(deadline);
        if (!temporaryOperationBinding || !attemptedStorageRef || !initialIdentity) {
          throw new AuthorizedSourceCaptureUnavailableError();
        }
        const quotaIdentity = initialIdentity;
        const quotaPrincipal = command.principal;
        const quotaTenant = start.scope.tenantId;
        const quota = new PostgresTemporaryPayloadQuotaRepository(Object.freeze({
          withTenant: <T>(tenantId: string, work: (transaction: Pick<PoolClient, "query">) => Promise<T>) => {
            if (tenantId !== quotaTenant) throw new ActorTenantContextDeniedError();
            assertNotAborted(deadline);
            return this.actorTenantContext.run(quotaPrincipal, quotaTenant, async (identity, transaction) => {
              if (!sameCaptureIdentity(identity, quotaIdentity)) throw new ActorTenantContextDeniedError();
              assertNotAborted(deadline);
              return work(transaction);
            });
          },
        }));
        temporaryPackageBinding = Object.freeze({
          tenantId: start.scope.tenantId,
          exchangeSessionId: start.scope.exchangeSessionId,
          packageId: start.scope.packageId,
          purpose: "PACS_IMPORT",
        });
        temporaryPackageHandle = await this.temporaryImagingStore.beginReservedPackage(
          temporaryPackageBinding, attemptedStorageRef, quota,
        );
        if (!temporaryPackageHandle || temporaryPackageHandle.storageRef !== attemptedStorageRef ||
          temporaryPackageHandle.packageId !== start.scope.packageId) {
          throw new AuthorizedSourceCaptureUnavailableError();
        }
      }

      const observedSyntaxes = new Map<string, string>();
      const instanceDescriptors = descriptors.map((descriptor) => {
        return Object.freeze({
          sopInstanceUid: descriptor.sopInstanceUid,
          openStream: async (signal?: AbortSignal) => {
            assertNotAborted(deadline);
            if (!signal) throw new Error("SOURCE_CAPTURE_ABORTED");
            const sourceStream = await this.dicomGateway.retrieveInstanceStream({
              context: Object.freeze({ ...context, signal }),
              studyInstanceUid: start.scope.studyInstanceUid,
              seriesInstanceUid: descriptor.seriesInstanceUid,
              sopInstanceUid: descriptor.sopInstanceUid,
            });
            if (sourceStream.transferSyntaxUid !== "1.2.840.10008.1.2.1" ||
              (descriptor.transferSyntaxUid !== undefined && descriptor.transferSyntaxUid !== sourceStream.transferSyntaxUid)) {
              await sourceStream.body.cancel().catch(() => undefined);
              throw new AuthorizedSourceCaptureUnavailableError();
            }
            observedSyntaxes.set(descriptor.sopInstanceUid, sourceStream.transferSyntaxUid);
            if (
              !temporaryPackageBinding ||
              !temporaryPackageHandle ||
              !this.temporaryImagingStore
            ) {
              return sourceStream;
            }

            const instanceBinding: TemporaryImagingInstanceBinding = Object.freeze({
              studyRefId: start.scope.studyRefId,
              seriesInstanceUid: descriptor.seriesInstanceUid,
              sopInstanceUid: descriptor.sopInstanceUid,
            });
            let writer: Awaited<
              ReturnType<TemporaryImagingCaptureStore["beginInstance"]>
            >;
            try {
              writer = await this.temporaryImagingStore.beginInstance({
                storageRef: temporaryPackageHandle.storageRef,
                packageBinding: temporaryPackageBinding,
                instanceBinding,
              });
            } catch (error) {
              try {
                await sourceStream.body.cancel();
              } catch {
                // Preserve the sanitized source-capture failure.
              }
              throw error;
            }
            return Object.freeze({
              ...sourceStream,
              observer: Object.freeze({
                writeChunk: (chunk: Uint8Array) => writer.write(chunk),
                complete: async (expected: {
                  readonly sopInstanceUid: string;
                  readonly byteLength: number;
                  readonly sha256: `sha256:${string}`;
                }) => {
                  const receipt = await writer.complete(expected);
                  if (
                    receipt.studyRefId !== instanceBinding.studyRefId ||
                    receipt.seriesInstanceUid !== instanceBinding.seriesInstanceUid ||
                    receipt.sopInstanceUid !== expected.sopInstanceUid ||
                    receipt.byteLength !== expected.byteLength ||
                    receipt.sha256 !== expected.sha256 ||
                    stagedInstances.has(receipt.sopInstanceUid)
                  ) {
                    throw new Error("TEMPORARY_SOURCE_BINDING_MISMATCH");
                  }
                  stagedInstances.set(receipt.sopInstanceUid, receipt);
                },
                abort: () => writer.abort(),
              }),
            });
          },
        });
      });

      let capture: SourceIntegrityCapture;
      try {
        capture = await buildSourceIntegrityCapture({
          expectedInstanceCount: start.scope.instanceCount as number,
          instances: instanceDescriptors,
          signal: deadline.signal,
        });
        if (
          temporaryPackageBinding &&
          temporaryPackageHandle &&
          this.temporaryImagingStore
        ) {
          const descriptorsBySop = new Map(
            descriptors.map((descriptor) => [descriptor.sopInstanceUid, descriptor]),
          );
          const temporaryInstances = capture.instances.map((expected) => {
            const descriptor = descriptorsBySop.get(expected.sopInstanceUid);
            const receipt = stagedInstances.get(expected.sopInstanceUid);
            if (
              !descriptor ||
              !receipt ||
              receipt.seriesInstanceUid !== descriptor.seriesInstanceUid ||
              receipt.byteLength !== expected.byteLength ||
              receipt.sha256 !== expected.sha256
            ) {
              throw new AuthorizedSourceCaptureUnavailableError();
            }
            return Object.freeze({
              objectRef: receipt.objectRef,
              seriesInstanceUid: receipt.seriesInstanceUid,
              sopInstanceUid: receipt.sopInstanceUid,
              sopClassUid: descriptor.sopClassUid,
              transferSyntaxUid: observedSyntaxes.get(receipt.sopInstanceUid)!,
              byteLength: receipt.byteLength,
              sha256: receipt.sha256,
            });
          });
          if (temporaryInstances.length !== capture.manifest.objectCount) {
            throw new AuthorizedSourceCaptureUnavailableError();
          }
          temporaryPackageReceipt = await this.temporaryImagingStore.sealPackage({
            storageRef: temporaryPackageHandle.storageRef,
            binding: temporaryPackageBinding,
          });
          if (
            temporaryPackageReceipt.objectCount !== capture.manifest.objectCount ||
            temporaryPackageReceipt.totalBytes !== capture.manifest.totalBytes ||
            temporaryPackageReceipt.packageId !== start.scope.packageId ||
            temporaryPackageReceipt.storageRef !== temporaryPackageHandle.storageRef
          ) {
            throw new AuthorizedSourceCaptureUnavailableError();
          }
          temporaryPackageHandoff = Object.freeze({
            storageRef: temporaryPackageReceipt.storageRef,
            packageId: temporaryPackageReceipt.packageId,
            expiresAt: temporaryPackageReceipt.expiresAt.toISOString(),
            objectCount: temporaryPackageReceipt.objectCount,
            totalBytes: temporaryPackageReceipt.totalBytes,
            instances: Object.freeze(temporaryInstances),
          });
        }
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
      const manifest: SourceIntegrityManifest = capture.manifest;

      assertNotAborted(deadline);
      if (coordinatorHandoff && this.temporaryImagingStore &&
        (!temporaryOperationBinding || !attemptedStorageRef || !temporaryPackageReceipt || !temporaryPackageHandoff)) {
        throw new AuthorizedSourceCaptureUnavailableError();
      }
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
            if (!this.isSupportedScope(identity, scope) ||
              (temporaryOperationBinding && !sameCaptureIdentity(identity, initialIdentity!))) {
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

            if (temporaryOperationBinding && attemptedStorageRef && temporaryPackageHandoff) {
              await new PostgresTemporaryPayloadMetadataRepository(transactionClient).completeStaging({
                binding: temporaryOperationBinding, storageRef: attemptedStorageRef,
                now: this.clock(), expiresAt: new Date(temporaryPackageHandoff.expiresAt),
              });
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
                  capture,
                  descriptors,
                  observedSyntaxes,
                  temporaryPackage: temporaryPackageHandoff,
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
      // COMMIT returning late or cancellation after it is never a usable handoff.
      assertNotAborted(deadline);
      if (
        completion.kind === "CAPTURED_FOR_COORDINATOR" &&
        temporaryPackageReceipt
      ) {
        if (!initialIdentity || !initialScope || !initialMapping) throw new AuthorizedSourceCaptureUnavailableError();
        this.#captureBindings.set(completion.handoff, Object.freeze({
          identity: initialIdentity, scope: initialScope, mapping: initialMapping,
        }));
        keepTemporaryPackage = true;
      }
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
      try {
        if (
          temporaryOperationBinding &&
          attemptedStorageRef &&
          this.temporaryImagingStore &&
          !keepTemporaryPackage
        ) {
          await new TemporaryPayloadPurgeCoordinator(
            this.actorTenantContext, this.temporaryImagingStore, this.clock, this.createId,
          ).purge({
            principal: command.principal, tenantCandidate: command.tenantCandidate,
            storageRef: attemptedStorageRef, binding: temporaryOperationBinding,
            correlationId: command.correlationId, reason: "CAPTURE_FAILURE",
          });
        }
      } catch {
        throw new AuthorizedSourceCaptureUnavailableError();
      } finally {
        deadline.dispose();
      }
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
      | "PACS_SOURCE_CAPTURE_FAILED"
      | "PACS_TEMPORARY_READ_FAILED",
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
