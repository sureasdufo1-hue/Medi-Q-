import {
  pacsTransferOperationDigest,
  type PacsTransferOperationSemantics,
} from "./pacs-transfer-operation-digest.js";

export const pacsTransferOperationStates = [
  "CREATED",
  "PREFLIGHT_PASSED",
  "STOW_STARTED",
  "VERIFYING",
  "COMPLETED",
  "DENIED",
  "FAILED",
  "PARTIAL",
  "RESULT_UNKNOWN",
] as const;

export type PacsTransferOperationState =
  (typeof pacsTransferOperationStates)[number];

export interface PacsTransferOperationSnapshot {
  readonly operationId: string;
  readonly tenantId: string;
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
  readonly state: PacsTransferOperationState;
  readonly version: number;
  readonly reasonCode: string | null;
  readonly sourceObjectCount: number | null;
  readonly destinationObjectCount: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stowStartedAt: Date | null;
}

export class InvalidPacsTransferOperationError extends Error {
  constructor() {
    super("PACS_TRANSFER_OPERATION_INVALID");
    this.name = "InvalidPacsTransferOperationError";
  }
}

export class InvalidPacsTransferOperationTransitionError extends Error {
  constructor() {
    super("PACS_TRANSFER_OPERATION_TRANSITION_INVALID");
    this.name = "InvalidPacsTransferOperationTransitionError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;
const reasonPattern = /^[A-Z0-9_]{1,64}$/;
const transitions = {
  CREATED: ["PREFLIGHT_PASSED", "DENIED", "FAILED"],
  PREFLIGHT_PASSED: ["STOW_STARTED", "DENIED", "FAILED"],
  STOW_STARTED: ["VERIFYING", "FAILED", "PARTIAL", "RESULT_UNKNOWN"],
  VERIFYING: ["COMPLETED", "FAILED", "PARTIAL", "RESULT_UNKNOWN"],
  COMPLETED: [],
  DENIED: [],
  FAILED: [],
  PARTIAL: [],
  RESULT_UNKNOWN: [],
} as const satisfies Record<
  PacsTransferOperationState,
  readonly PacsTransferOperationState[]
>;

function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validCount(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

export class PacsTransferOperation {
  private readonly value: PacsTransferOperationSnapshot;

  private constructor(snapshot: PacsTransferOperationSnapshot) {
    const ids = [
      snapshot.operationId,
      snapshot.tenantId,
      snapshot.exchangeSessionId,
      snapshot.studyRefId,
      snapshot.actorId,
      snapshot.idempotencyKey,
    ];
    const dispatchStates: readonly PacsTransferOperationState[] = [
      "STOW_STARTED",
      "VERIFYING",
      "COMPLETED",
      "PARTIAL",
      "RESULT_UNKNOWN",
    ];
    const dispatchTimestampValid =
      snapshot.state === "FAILED" ||
      dispatchStates.includes(snapshot.state) ===
        (snapshot.stowStartedAt !== null);
    if (
      ids.some((value) => typeof value !== "string" || !uuidPattern.test(value)) ||
      !digestPattern.test(snapshot.requestDigest) ||
      !pacsTransferOperationStates.includes(snapshot.state) ||
      !Number.isSafeInteger(snapshot.version) ||
      snapshot.version < 0 ||
      (snapshot.reasonCode !== null && !reasonPattern.test(snapshot.reasonCode)) ||
      !validCount(snapshot.sourceObjectCount) ||
      !validCount(snapshot.destinationObjectCount) ||
      (snapshot.state === "COMPLETED" &&
        (snapshot.sourceObjectCount === null ||
          snapshot.sourceObjectCount < 1 ||
          snapshot.destinationObjectCount !== snapshot.sourceObjectCount)) ||
      !isDate(snapshot.createdAt) ||
      !isDate(snapshot.updatedAt) ||
      snapshot.updatedAt < snapshot.createdAt ||
      (snapshot.stowStartedAt !== null &&
        (!isDate(snapshot.stowStartedAt) ||
          snapshot.stowStartedAt < snapshot.createdAt ||
          snapshot.stowStartedAt > snapshot.updatedAt)) ||
      !dispatchTimestampValid
    ) {
      throw new InvalidPacsTransferOperationError();
    }

    this.value = Object.freeze({
      ...snapshot,
      operationId: snapshot.operationId.toLowerCase(),
      tenantId: snapshot.tenantId.toLowerCase(),
      exchangeSessionId: snapshot.exchangeSessionId.toLowerCase(),
      studyRefId: snapshot.studyRefId.toLowerCase(),
      actorId: snapshot.actorId.toLowerCase(),
      idempotencyKey: snapshot.idempotencyKey.toLowerCase(),
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
      stowStartedAt:
        snapshot.stowStartedAt === null
          ? null
          : new Date(snapshot.stowStartedAt),
    });
  }

  get snapshot(): PacsTransferOperationSnapshot {
    return Object.freeze({
      ...this.value,
      createdAt: new Date(this.value.createdAt),
      updatedAt: new Date(this.value.updatedAt),
      stowStartedAt:
        this.value.stowStartedAt === null
          ? null
          : new Date(this.value.stowStartedAt),
    });
  }

  static create(input: {
    readonly operationId: string;
    readonly semantics: PacsTransferOperationSemantics;
    readonly idempotencyKey: string;
    readonly now: Date;
  }): PacsTransferOperation {
    const requestDigest = pacsTransferOperationDigest(input.semantics);
    return new PacsTransferOperation({
      operationId: input.operationId,
      tenantId: input.semantics.tenantId,
      exchangeSessionId: input.semantics.exchangeSessionId,
      studyRefId: input.semantics.studyRefId,
      actorId: input.semantics.actorId,
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      state: "CREATED",
      version: 0,
      reasonCode: null,
      sourceObjectCount: null,
      destinationObjectCount: null,
      createdAt: input.now,
      updatedAt: input.now,
      stowStartedAt: null,
    });
  }

  static reconstitute(
    snapshot: PacsTransferOperationSnapshot,
  ): PacsTransferOperation {
    return new PacsTransferOperation(snapshot);
  }

  transitionTo(input: {
    readonly nextState: PacsTransferOperationState;
    readonly now: Date;
    readonly reasonCode?: string | null;
    readonly sourceObjectCount?: number | null;
    readonly destinationObjectCount?: number | null;
  }): PacsTransferOperation {
    const { nextState, now } = input;
    if (
      !pacsTransferOperationStates.includes(nextState) ||
      !(transitions[this.value.state] as readonly PacsTransferOperationState[])
        .includes(nextState) ||
      !isDate(now) ||
      now < this.value.updatedAt ||
      (input.reasonCode !== undefined &&
        input.reasonCode !== null &&
        !reasonPattern.test(input.reasonCode)) ||
      !validCount(input.sourceObjectCount ?? null) ||
      !validCount(input.destinationObjectCount ?? null)
    ) {
      throw new InvalidPacsTransferOperationTransitionError();
    }

    const nextSourceCount =
      input.sourceObjectCount ?? this.value.sourceObjectCount;
    const nextDestinationCount =
      input.destinationObjectCount ?? this.value.destinationObjectCount;
    if (
      nextState === "COMPLETED" &&
      (nextSourceCount === null ||
        nextSourceCount < 1 ||
        nextDestinationCount !== nextSourceCount)
    ) {
      throw new InvalidPacsTransferOperationTransitionError();
    }

    const stowStartedAt = nextState === "STOW_STARTED"
      ? now
      : this.value.stowStartedAt;
    const snapshot = Object.freeze({
      ...this.value,
      state: nextState,
      version: this.value.version + 1,
      reasonCode: input.reasonCode ?? null,
      sourceObjectCount:
        nextSourceCount,
      destinationObjectCount:
        nextDestinationCount,
      updatedAt: now,
      stowStartedAt,
    });

    return new PacsTransferOperation(snapshot);
  }
}
