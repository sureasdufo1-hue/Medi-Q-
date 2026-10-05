import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import type {
  DicomGateway,
  DicomStowResult,
  StoreStudyStreamRequest,
} from "../../dicom/application/dicom-gateway.port.js";
import type { VerifiedActorTenantContext } from "../../identity/identity-context.types.js";
import type { AuthorizedSourceCaptureService } from "../../integrity/application/authorized-source-capture.service.js";
import { PacsImportOperationAdmissionService } from "./pacs-import-operation-admission.service.js";
import {
  PacsImportSourcePreparationCoordinator,
  type PacsImportSourcePreparationResult,
} from "./pacs-import-source-preparation.coordinator.js";
import { DispatchedInstanceStreamFactory } from "./dispatched-instance-stream.factory.js";
import { PacsTransferOperation } from "../domain/pacs-transfer-operation.js";
import { pacsTransferOperationDigest } from "../domain/pacs-transfer-operation-digest.js";
import { PostgresPacsTransferOperationRepository } from "../persistence/postgres-pacs-transfer-operation.repository.js";
import { PostgresProvenanceRepository } from "../../provenance/persistence/postgres-provenance.repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DICOM_UID = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,63}$/;

export type PacsImportTransferDispatchResult = Readonly<{
  operationId: string;
  operationState: string | "UNRESOLVED";
  dispatch: "DENIED" | "REPLAYED" | "VERIFYING" | "PARTIAL" | "FAILED" | "RESULT_UNKNOWN";
}>;

export class PacsImportTransferDispatchUnavailableError extends Error {
  constructor() {
    super("PACS_IMPORT_TRANSFER_DISPATCH_UNAVAILABLE");
    this.name = "PacsImportTransferDispatchUnavailableError";
  }
}

function verifiedIdentity(context: {
  issuer: string;
  subject: string;
  actorId: string;
  tenantId: string;
  hospitalId: string | null;
  actorType: VerifiedActorTenantContext["actorType"];
}): VerifiedActorTenantContext {
  return Object.freeze({
    issuer: context.issuer,
    subject: context.subject,
    actorId: context.actorId,
    tenantId: context.tenantId,
    hospitalId: context.hospitalId,
    actorType: context.actorType,
  });
}

function classifyStowResult(
  value: unknown,
  expected: readonly string[],
): { state: "VERIFYING" | "PARTIAL" | "FAILED" | "RESULT_UNKNOWN"; destinationCount: number | null } {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error();
    }
    const fields = Object.getOwnPropertyDescriptors(value);
    const keys = ["httpStatus", "storedSopInstanceUids", "warningSopInstanceUids", "failedInstances"];
    if (Reflect.ownKeys(fields).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(fields, key) || !Object.hasOwn(fields[key]!, "value"))) {
      throw new Error();
    }
    const result = value as DicomStowResult;
    if ((result.httpStatus !== 200 && result.httpStatus !== 202) ||
      !Array.isArray(result.storedSopInstanceUids) ||
      !Array.isArray(result.warningSopInstanceUids) ||
      !Array.isArray(result.failedInstances)) throw new Error();

    const expectedSet = new Set(expected);
    const seen = new Set<string>();
    const record = (uid: unknown): void => {
      if (typeof uid !== "string" || !DICOM_UID.test(uid) || uid.length > 64 ||
        !expectedSet.has(uid) || seen.has(uid)) throw new Error();
      seen.add(uid);
    };
    result.storedSopInstanceUids.forEach(record);
    result.warningSopInstanceUids.forEach(record);
    for (const failure of result.failedInstances) {
      if (!failure || typeof failure !== "object" || Array.isArray(failure) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(failure))) throw new Error();
      const failureFields = Object.getOwnPropertyDescriptors(failure);
      if (Reflect.ownKeys(failureFields).length !== 2 ||
        !Object.hasOwn(failureFields, "sopInstanceUid") ||
        !Object.hasOwn(failureFields, "code") ||
        !Object.hasOwn(failureFields.sopInstanceUid!, "value") ||
        !Object.hasOwn(failureFields.code!, "value") ||
        !["PROCESSING_FAILURE", "INVALID_INSTANCE", "UNSUPPORTED_TRANSFER_SYNTAX", "DUPLICATE_INSTANCE", "UNKNOWN"]
          .includes(failure.code)) throw new Error();
      record(failure.sopInstanceUid);
    }
    if (seen.size !== expectedSet.size || [...expectedSet].some((uid) => !seen.has(uid))) throw new Error();

    if (result.failedInstances.length === 0 && result.warningSopInstanceUids.length === 0 &&
      result.storedSopInstanceUids.length === expectedSet.size) {
      return { state: "VERIFYING", destinationCount: null };
    }
    if (result.storedSopInstanceUids.length + result.warningSopInstanceUids.length > 0) {
      return {
        state: "PARTIAL",
        destinationCount: result.storedSopInstanceUids.length + result.warningSopInstanceUids.length,
      };
    }
    return { state: "FAILED", destinationCount: 0 };
  } catch {
    return { state: "RESULT_UNKNOWN", destinationCount: null };
  }
}

/**
 * Internal-only PACS import boundary. It does not register an HTTP route or
 * worker. The DB claim commits before the single Study STOW call; the parsed
 * STOW response is never treated as destination verification/completion.
 */
export class PacsImportTransferDispatchCoordinator {
  constructor(
    private readonly preparation: PacsImportSourcePreparationCoordinator,
    private readonly admission: Pick<
      PacsImportOperationAdmissionService,
      "executeWithCurrentImportAuthorization"
    >,
    private readonly sourceCapture: Pick<
      AuthorizedSourceCaptureService,
      "assertDispatchReadyInVerifiedTransaction" | "consumeCapturedInstance"
    >,
    private readonly dicomGateway: Pick<DicomGateway, "validateEndpoint" | "storeStudyStream">,
    private readonly dispatchedStreams: Pick<DispatchedInstanceStreamFactory, "open">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async transfer(input: {
    readonly principal: VerifiedAuthenticationPrincipal | null | undefined;
    readonly request: unknown;
  }): Promise<PacsImportTransferDispatchResult> {
    let preparedResult: PacsImportSourcePreparationResult;
    try {
      preparedResult = await this.preparation.prepare(input);
    } catch {
      throw new PacsImportTransferDispatchUnavailableError();
    }
    if (preparedResult.preparation === "DENIED") {
      return Object.freeze({
        operationId: preparedResult.operationId,
        operationState: preparedResult.operationState,
        dispatch: "DENIED",
      });
    }
    if (preparedResult.preparation === "REPLAYED") {
      return Object.freeze({
        operationId: preparedResult.operationId,
        operationState: preparedResult.operationState,
        dispatch: "REPLAYED",
      });
    }

    try {
      return await this.preparation.withPreparedSource(preparedResult, async (prepared) => {
        const handoff = prepared.handoff;
        const signal = new AbortController().signal;
        const context = Object.freeze({
          hospitalId: handoff.destinationHospitalId,
          correlationId: prepared.correlationId,
          signal,
        });

        try {
          // Resolver-only validation; no network call and no credential return.
          this.dicomGateway.validateEndpoint(context, "STOW_STUDY");
        } catch {
          await this.preparation.discardPrepared(preparedResult).catch(() => undefined);
          throw new PacsImportTransferDispatchUnavailableError();
        }

        try {
          // Validate each already-captured encrypted object before any B
          // request. Plaintext is borrowed only inside the storage service,
          // re-authorized, hashed and zeroed; no bytes leave this callback.
          for (const instance of handoff.temporaryPackage?.instances ?? []) {
            await this.sourceCapture.consumeCapturedInstance({
              principal: prepared.principal,
              tenantCandidate: prepared.tenantCandidate,
              correlationId: prepared.correlationId,
              consentId: prepared.consentId,
              grantId: prepared.grantId,
              handoff,
              objectRef: instance.objectRef,
              signal: context.signal,
            }, async () => undefined);
          }
          if (!handoff.temporaryPackage || handoff.temporaryPackage.instances.length < 1) {
            throw new Error("PACS_DISPATCH_STAGING_EMPTY");
          }
        } catch {
          await this.preparation.discardPrepared(preparedResult).catch(() => undefined);
          throw new PacsImportTransferDispatchUnavailableError();
        }

        let claimed: PacsTransferOperation;
        try {
          claimed = await this.admission.executeWithCurrentImportAuthorization({
            principal: prepared.principal,
            tenantCandidate: prepared.tenantCandidate,
            exchangeSessionId: handoff.exchangeSessionId,
            studyRefId: handoff.studyRefId,
            consentId: prepared.consentId,
            grantId: prepared.grantId,
            work: async ({ context: authorization, transactionClient }) => {
              const now = this.clock();
              const repository = new PostgresPacsTransferOperationRepository(transactionClient);
              const current = await repository.findById({
                operationId: handoff.operationId,
                tenantId: authorization.tenantId,
              });
              if (!current) throw new Error("PACS_DISPATCH_OPERATION_UNAVAILABLE");
              const snapshot = current.snapshot;
              const expectedDigest = pacsTransferOperationDigest({
                tenantId: authorization.tenantId,
                actorId: authorization.actorId,
                exchangeSessionId: handoff.exchangeSessionId,
                studyRefId: handoff.studyRefId,
                consentId: prepared.consentId,
                grantId: prepared.grantId,
                action: "PACS_IMPORT",
              });
              if (snapshot.operationId !== handoff.operationId ||
                snapshot.tenantId !== authorization.tenantId ||
                snapshot.actorId !== authorization.actorId ||
                snapshot.exchangeSessionId !== handoff.exchangeSessionId ||
                snapshot.studyRefId !== handoff.studyRefId ||
                snapshot.requestDigest !== expectedDigest ||
                snapshot.state !== "CREATED" || snapshot.version !== 0 ||
                snapshot.stowStartedAt !== null) {
                throw new Error("PACS_DISPATCH_OPERATION_BINDING_INVALID");
              }

              // Source preparation deliberately creates no Provenance. Create
              // its immutable PENDING row here, in the same fenced transaction
              // as Preflight and STOW_STARTED, so no orphan can be committed.
              const provenance = await new PostgresProvenanceRepository(transactionClient)
                .createPendingForPacsImport({ operationId: handoff.operationId, now });
              const provenanceRecord = provenance.record;
              if (provenanceRecord.operationId !== handoff.operationId ||
                provenanceRecord.exchangeSessionId !== handoff.exchangeSessionId ||
                provenanceRecord.packageId !== handoff.packageId ||
                provenanceRecord.studyRefId !== handoff.studyRefId ||
                provenanceRecord.sourceHospitalId !== handoff.sourceHospitalId ||
                provenanceRecord.destinationHospitalId !== handoff.destinationHospitalId ||
                provenanceRecord.transferType !== "PACS_IMPORT" ||
                provenanceRecord.transferStatus !== "PENDING") {
                throw new Error("PACS_DISPATCH_PROVENANCE_BINDING_INVALID");
              }
              await this.sourceCapture.assertDispatchReadyInVerifiedTransaction({
                identity: verifiedIdentity(authorization),
                transactionClient,
                handoff,
                now,
              });

              const preflightTime = this.nextTimestamp(snapshot.updatedAt);
              const preflight = current.transitionTo({
                nextState: "PREFLIGHT_PASSED",
                now: preflightTime,
                reasonCode: "PREFLIGHT_PASSED",
              });
              const savedPreflight = await repository.transition({
                current,
                next: preflight,
                correlationId: prepared.correlationId,
              });
              const stowTime = this.nextTimestamp(savedPreflight.snapshot.updatedAt);
              const stowStarted = savedPreflight.transitionTo({
                nextState: "STOW_STARTED",
                now: stowTime,
                reasonCode: "STOW_STARTED",
                sourceObjectCount: handoff.expectedInstances.length,
              });
              return repository.transition({
                current: savedPreflight,
                next: stowStarted,
                correlationId: prepared.correlationId,
              });
            },
          });
        } catch {
          // COMMIT acknowledgement may be ambiguous. Retire this in-memory
          // capability and never attempt STOW or a second claim in-process.
          this.preparation.consumePreparedSource(preparedResult);
          throw new PacsImportTransferDispatchUnavailableError();
        }

        // executeWithCurrentImportAuthorization resolves only after the
        // verified Tenant transaction's COMMIT has returned successfully.
        this.preparation.consumePreparedSource(preparedResult);
        let outcome: ReturnType<typeof classifyStowResult>;
        try {
          const stowRequest: StoreStudyStreamRequest = Object.freeze({
            context,
            studyInstanceUid: handoff.studyInstanceUid,
            instances: Object.freeze(handoff.expectedInstances.map((instance) => Object.freeze({
              seriesInstanceUid: instance.seriesInstanceUid,
              sopInstanceUid: instance.sopInstanceUid,
              sopClassUid: instance.sopClassUid,
              transferSyntaxUid: instance.transferSyntaxUid,
              contentLength: instance.byteLength,
            }))),
            openInstance: async (
              instance: Parameters<StoreStudyStreamRequest["openInstance"]>[0],
              streamSignal: AbortSignal,
            ) => {
              const staged = handoff.temporaryPackage?.instances.find((candidate) =>
                candidate.seriesInstanceUid === instance.seriesInstanceUid &&
                candidate.sopInstanceUid === instance.sopInstanceUid);
              if (!staged || staged.byteLength !== instance.contentLength ||
                staged.sopClassUid !== instance.sopClassUid ||
                staged.transferSyntaxUid !== instance.transferSyntaxUid) {
                throw new Error("PACS_DISPATCH_INSTANCE_BINDING_INVALID");
              }
              return this.dispatchedStreams.open({
                principal: prepared.principal,
                tenantCandidate: prepared.tenantCandidate,
                correlationId: prepared.correlationId,
                consentId: prepared.consentId,
                grantId: prepared.grantId,
                handoff,
                objectRef: staged.objectRef,
                signal: streamSignal,
              });
            },
          });
          const response = await this.dicomGateway.storeStudyStream(stowRequest);
          outcome = classifyStowResult(response, handoff.expectedInstances.map((item) => item.sopInstanceUid));
        } catch {
          outcome = { state: "RESULT_UNKNOWN", destinationCount: null };
        }

        let finalState = "STOW_STARTED";
        try {
          const updated: PacsTransferOperation = await this.admission.executeWithCurrentImportAuthorization({
            principal: prepared.principal,
            tenantCandidate: prepared.tenantCandidate,
            exchangeSessionId: handoff.exchangeSessionId,
            studyRefId: handoff.studyRefId,
            consentId: prepared.consentId,
            grantId: prepared.grantId,
            work: async ({ context: authorization, transactionClient }) => {
              const repository = new PostgresPacsTransferOperationRepository(transactionClient);
              const current = await repository.findById({
                operationId: handoff.operationId,
                tenantId: authorization.tenantId,
              });
              if (!current || current.snapshot.state !== "STOW_STARTED" ||
                current.snapshot.version !== claimed.snapshot.version) {
                throw new Error("PACS_DISPATCH_RESULT_BINDING_INVALID");
              }
              const now = this.nextTimestamp(current.snapshot.updatedAt);
              const transitioned = current.transitionTo({
                nextState: outcome.state,
                now,
                reasonCode: outcome.state === "VERIFYING" ? "STOW_ACKNOWLEDGED"
                  : outcome.state === "PARTIAL" ? "STOW_PARTIAL"
                    : outcome.state === "FAILED" ? "STOW_REJECTED"
                      : "STOW_RESULT_UNKNOWN",
                ...(outcome.state === "PARTIAL" || outcome.state === "FAILED"
                  ? { destinationObjectCount: outcome.destinationCount }
                  : {}),
              });
              return repository.transition({
                current,
                next: transitioned,
                correlationId: prepared.correlationId,
              });
            },
          });
          finalState = updated.snapshot.state;
        } catch {
          // The durable STOW_STARTED claim remains non-replayable if the
          // response or its state-commit acknowledgement is uncertain.
          finalState = "UNRESOLVED";
          outcome = { state: "RESULT_UNKNOWN", destinationCount: null };
        }
        return Object.freeze({
          operationId: handoff.operationId,
          operationState: finalState,
          dispatch: outcome.state,
        });
      });
    } catch (error) {
      if (error instanceof PacsImportTransferDispatchUnavailableError) throw error;
      throw new PacsImportTransferDispatchUnavailableError();
    }
  }

  private nextTimestamp(previous: Date): Date {
    const candidate = this.clock();
    if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime())) {
      throw new PacsImportTransferDispatchUnavailableError();
    }
    return candidate < previous ? new Date(previous) : candidate;
  }
}
