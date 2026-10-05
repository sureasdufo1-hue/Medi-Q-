import type {
  AuthorizedSourceCaptureCoordinatorHandoff,
  AuthorizedSourceCaptureService,
} from "../../integrity/application/authorized-source-capture.service.js";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import type { TemporaryPayloadPurgeCoordinator } from "../../imaging-storage/application/temporary-payload-purge.coordinator.js";
import type { PacsTransferOperationState } from "../domain/pacs-transfer-operation.js";
import type { PacsImportOperationAdmissionService } from "./pacs-import-operation-admission.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DICOM_UID = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,63}$/;

export type PacsImportSourcePreparationResult = Readonly<{
  operationId: string;
  operationState: PacsTransferOperationState;
  preparation: "SOURCE_CAPTURED" | "DENIED" | "REPLAYED";
  reason?: string;
}>;

export class PacsImportSourcePreparationUnavailableError extends Error {
  constructor() {
    super("PACS_IMPORT_SOURCE_PREPARATION_UNAVAILABLE");
    this.name = "PacsImportSourcePreparationUnavailableError";
  }
}

interface PreparedSource {
  readonly principal: VerifiedAuthenticationPrincipal;
  readonly tenantCandidate: string;
  readonly correlationId: string;
  readonly consentId: string;
  readonly grantId: string;
  readonly operationId: string;
  readonly handoff: AuthorizedSourceCaptureCoordinatorHandoff;
}

function isBoundHandoff(
  value: unknown,
  expected: {
    operationId: string;
    tenantId: string;
    actorId: string;
    exchangeSessionId: string;
    studyRefId: string;
  },
): value is PreparedSource["handoff"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const handoff = value as PreparedSource["handoff"];
  const temporary = handoff.temporaryPackage;
  const instances = handoff.expectedInstances;
  if (
    handoff.operationId !== expected.operationId ||
    handoff.tenantId !== expected.tenantId ||
    handoff.actorId !== expected.actorId ||
    handoff.exchangeSessionId !== expected.exchangeSessionId ||
    handoff.studyRefId !== expected.studyRefId ||
    !UUID.test(handoff.packageId) ||
    !UUID.test(handoff.sourceHospitalId) ||
    !UUID.test(handoff.destinationHospitalId) ||
    handoff.sourceEvidence?.status !== "PENDING" ||
    !UUID.test(handoff.sourceEvidence.evidenceId) ||
    !temporary ||
    temporary.packageId !== handoff.packageId ||
    !UUID.test(temporary.storageRef) ||
    !Number.isSafeInteger(temporary.objectCount) ||
    temporary.objectCount < 1 ||
    !Number.isSafeInteger(temporary.totalBytes) ||
    temporary.totalBytes < 1 ||
    !Array.isArray(instances) ||
    !Array.isArray(temporary.instances) ||
    instances.length !== handoff.sourceEvidence.objectCount ||
    instances.length !== temporary.objectCount ||
    temporary.instances.length !== instances.length
  ) {
    return false;
  }

  const temporaryByIdentity = new Map(temporary.instances.map((instance) =>
    [`${instance.seriesInstanceUid}/${instance.sopInstanceUid}`, instance]));
  if (temporaryByIdentity.size !== instances.length) return false;
  let totalBytes = 0;
  for (const instance of instances) {
    if (
      !DICOM_UID.test(instance.seriesInstanceUid) || instance.seriesInstanceUid.length > 64 ||
      !DICOM_UID.test(instance.sopInstanceUid) || instance.sopInstanceUid.length > 64 ||
      !DICOM_UID.test(instance.sopClassUid) || instance.sopClassUid.length > 64 ||
      !DICOM_UID.test(instance.transferSyntaxUid) || instance.transferSyntaxUid.length > 64 ||
      !Number.isSafeInteger(instance.byteLength) ||
      instance.byteLength < 1 ||
      !/^sha256:[0-9a-f]{64}$/.test(instance.sha256)
    ) return false;
    const staged = temporaryByIdentity.get(`${instance.seriesInstanceUid}/${instance.sopInstanceUid}`);
    if (
      !staged ||
      staged.sopClassUid !== instance.sopClassUid ||
      staged.transferSyntaxUid !== instance.transferSyntaxUid ||
      staged.byteLength !== instance.byteLength ||
      staged.sha256 !== instance.sha256
    ) return false;
    totalBytes += instance.byteLength;
  }
  return totalBytes === handoff.sourceEvidence.totalBytes &&
    totalBytes === temporary.totalBytes &&
    Number.isFinite(Date.parse(temporary.expiresAt));
}

function extractPurgeInput(value: unknown): {
  readonly storageRef: string;
  readonly binding: Readonly<{
    operationId: string;
    tenantId: string;
    exchangeSessionId: string;
    packageId: string;
    studyRefId: string;
    sourceHospitalId: string;
  }>;
} | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const fields = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(fields).some((key) => typeof key !== "string" ||
      !Object.hasOwn(fields[key]!, "value"))) return null;
    const handoff = value as Partial<AuthorizedSourceCaptureCoordinatorHandoff>;
    const temporary = handoff.temporaryPackage;
    const operationId = handoff.operationId;
    const tenantId = handoff.tenantId;
    const exchangeSessionId = handoff.exchangeSessionId;
    const packageId = handoff.packageId;
    const studyRefId = handoff.studyRefId;
    const sourceHospitalId = handoff.sourceHospitalId;
    if (!temporary || !UUID.test(temporary.storageRef) ||
      typeof operationId !== "string" || !UUID.test(operationId) ||
      typeof tenantId !== "string" || !UUID.test(tenantId) ||
      typeof exchangeSessionId !== "string" || !UUID.test(exchangeSessionId) ||
      typeof packageId !== "string" || !UUID.test(packageId) ||
      typeof studyRefId !== "string" || !UUID.test(studyRefId) ||
      typeof sourceHospitalId !== "string" || !UUID.test(sourceHospitalId)) return null;
    return Object.freeze({
      storageRef: temporary.storageRef,
      binding: Object.freeze({ operationId, tenantId, exchangeSessionId, packageId, studyRefId, sourceHospitalId }),
    });
  } catch {
    return null;
  }
}

/**
 * Internal source-preparation composition only. It keeps the verified source
 * handoff in a WeakMap for a later coordinator phase and has no DICOM write or
 * HTTP/module registration. This class is deliberately not wired into Nest.
 */
export class PacsImportSourcePreparationCoordinator {
  readonly #prepared = new WeakMap<PacsImportSourcePreparationResult, PreparedSource>();
  readonly #dispatchAttempts = new WeakSet<PacsImportSourcePreparationResult>();

  constructor(
    private readonly admission: Pick<PacsImportOperationAdmissionService, "admitForCoordinator">,
    private readonly sourceCapture: Pick<AuthorizedSourceCaptureService, "captureForCoordinator">,
    private readonly purgeCoordinator: Pick<TemporaryPayloadPurgeCoordinator, "purge">,
  ) {}

  async prepare(input: {
    readonly principal: Parameters<PacsImportOperationAdmissionService["admitForCoordinator"]>[0]["principal"];
    readonly request: unknown;
  }): Promise<PacsImportSourcePreparationResult> {
    try {
      return await this.admission.admitForCoordinator(input, async ({ admission, sourceCaptureCommand }) => {
        const operation = admission.operation;
        if (!admission.created) {
          return Object.freeze({
            operationId: operation.operationId,
            operationState: operation.state,
            preparation: "REPLAYED",
          });
        }
        if (operation.state !== "CREATED") throw new PacsImportSourcePreparationUnavailableError();

        const captured = await this.sourceCapture.captureForCoordinator(sourceCaptureCommand);
        if (captured.kind === "DENIED") {
          return Object.freeze({
            operationId: operation.operationId,
            operationState: "CREATED",
            preparation: "DENIED",
            reason: captured.reason,
          });
        }

        const candidate: unknown = captured.handoff;
        if (!isBoundHandoff(candidate, {
          operationId: operation.operationId,
          tenantId: operation.tenantId,
          actorId: operation.actorId,
          exchangeSessionId: operation.exchangeSessionId,
          studyRefId: operation.studyRefId,
        })) {
          const purgeInput = extractPurgeInput(candidate);
          if (purgeInput) {
            await this.purgeCoordinator.purge({
              principal: sourceCaptureCommand.principal,
              tenantCandidate: sourceCaptureCommand.tenantCandidate,
              correlationId: sourceCaptureCommand.correlationId,
              reason: "EXPLICIT_CLOSE",
              storageRef: purgeInput.storageRef,
              binding: purgeInput.binding,
            });
          }
          throw new PacsImportSourcePreparationUnavailableError();
        }

        const result = Object.freeze({
          operationId: operation.operationId,
          operationState: "CREATED" as const,
          preparation: "SOURCE_CAPTURED" as const,
        });
        this.#prepared.set(result, Object.freeze({
          principal: sourceCaptureCommand.principal,
          tenantCandidate: sourceCaptureCommand.tenantCandidate,
          correlationId: sourceCaptureCommand.correlationId,
          consentId: sourceCaptureCommand.consentId,
          grantId: sourceCaptureCommand.grantId,
          operationId: operation.operationId,
          handoff: candidate,
        }));
        return result;
      });
    } catch {
      throw new PacsImportSourcePreparationUnavailableError();
    }
  }

  /** Internal continuation for one dispatch attempt; the handoff never leaves this callback. */
  async withPreparedSource<T>(
    result: PacsImportSourcePreparationResult,
    continuation: (prepared: PreparedSource) => Promise<T>,
  ): Promise<T> {
    const prepared = this.#prepared.get(result);
    if (!prepared || this.#dispatchAttempts.has(result) || typeof continuation !== "function") {
      throw new PacsImportSourcePreparationUnavailableError();
    }
    this.#dispatchAttempts.add(result);
    return continuation(prepared);
  }

  /** Retires the in-process source capability after a durable dispatch claim or an ambiguous claim outcome. */
  consumePreparedSource(result: PacsImportSourcePreparationResult): void {
    if (!this.#dispatchAttempts.has(result) || !this.#prepared.delete(result)) {
      throw new PacsImportSourcePreparationUnavailableError();
    }
  }

  /** Test/recovery boundary: exact opaque result only; purge remains audited. */
  async discardPrepared(result: PacsImportSourcePreparationResult): Promise<void> {
    const prepared = this.#prepared.get(result);
    if (!prepared) throw new PacsImportSourcePreparationUnavailableError();
    this.#prepared.delete(result);
    const temporary = prepared.handoff.temporaryPackage;
    if (!temporary) throw new PacsImportSourcePreparationUnavailableError();
    try {
      await this.purgeCoordinator.purge({
        principal: prepared.principal,
        tenantCandidate: prepared.tenantCandidate,
        correlationId: prepared.correlationId,
        reason: "EXPLICIT_CLOSE",
        storageRef: temporary.storageRef,
        binding: {
          operationId: prepared.handoff.operationId,
          tenantId: prepared.handoff.tenantId,
          exchangeSessionId: prepared.handoff.exchangeSessionId,
          packageId: prepared.handoff.packageId,
          studyRefId: prepared.handoff.studyRefId,
          sourceHospitalId: prepared.handoff.sourceHospitalId,
        },
      });
    } catch {
      throw new PacsImportSourcePreparationUnavailableError();
    }
  }
}
