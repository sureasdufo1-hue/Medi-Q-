import { randomUUID } from "node:crypto";

export const exchangeSessionStates = [
  "REQUESTED",
  "CONSENT_PENDING",
  "CONSENTED",
  "AUTHORIZED",
  "READY",
  "ACTIVE",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "FAILED",
  "CANCELLED",
] as const;

export type ExchangeSessionState = (typeof exchangeSessionStates)[number];

export interface ExchangeSessionSnapshot {
  sessionId: string;
  patientRefId: string;
  sourceHospitalId: string;
  destinationHospitalId: string;
  requesterActorId: string;
  purpose: string;
  state: ExchangeSessionState;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  completedAt: Date | null;
}

export class InvalidExchangeSessionError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_INVALID");
    this.name = "InvalidExchangeSessionError";
  }
}

export class InvalidExchangeSessionTransitionError extends Error {
  constructor() {
    super("EXCHANGE_SESSION_TRANSITION_INVALID");
    this.name = "InvalidExchangeSessionTransitionError";
  }
}

const terminalSessionStates = new Set<ExchangeSessionState>([
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "FAILED",
  "CANCELLED",
]);

const allowedTransitions = {
  REQUESTED: ["CONSENT_PENDING", "REJECTED", "EXPIRED", "FAILED", "CANCELLED"],
  CONSENT_PENDING: ["CONSENTED", "REJECTED", "EXPIRED", "FAILED", "CANCELLED"],
  CONSENTED: ["AUTHORIZED", "EXPIRED", "REVOKED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["READY", "EXPIRED", "REVOKED", "FAILED", "CANCELLED"],
  READY: ["ACTIVE", "EXPIRED", "REVOKED", "FAILED", "CANCELLED"],
  ACTIVE: ["COMPLETED", "EXPIRED", "REVOKED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  EXPIRED: [],
  REVOKED: [],
  FAILED: [],
  CANCELLED: [],
} as const satisfies Record<ExchangeSessionState, readonly ExchangeSessionState[]>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number.NaN;
}

function optionalTimestamp(value: unknown): number | null {
  if (value === null) return null;
  return timestamp(value);
}

export class ExchangeSession {
  readonly sessionId: string;
  readonly patientRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly requesterActorId: string;
  readonly purpose: string;
  readonly state: ExchangeSessionState;
  private readonly createdAtValue: number;
  private readonly updatedAtValue: number;
  private readonly expiresAtValue: number | null;
  private readonly completedAtValue: number | null;

  private constructor(snapshot: ExchangeSessionSnapshot) {
    const purposeLength =
      typeof snapshot.purpose === "string"
        ? Array.from(snapshot.purpose).length
        : Number.NaN;
    const createdAtValue = timestamp(snapshot.createdAt);
    const updatedAtValue = timestamp(snapshot.updatedAt);
    const expiresAtValue = optionalTimestamp(snapshot.expiresAt);
    const completedAtValue = optionalTimestamp(snapshot.completedAt);

    if (
      !ExchangeSession.isValidId(snapshot.sessionId) ||
      !ExchangeSession.isValidId(snapshot.patientRefId) ||
      !ExchangeSession.isValidId(snapshot.sourceHospitalId) ||
      !ExchangeSession.isValidId(snapshot.destinationHospitalId) ||
      !ExchangeSession.isValidId(snapshot.requesterActorId) ||
      snapshot.sourceHospitalId.toLowerCase() ===
        snapshot.destinationHospitalId.toLowerCase() ||
      typeof snapshot.purpose !== "string" ||
      snapshot.purpose.trim().length === 0 ||
      purposeLength > 255 ||
      !exchangeSessionStates.includes(snapshot.state) ||
      !Number.isFinite(createdAtValue) ||
      !Number.isFinite(updatedAtValue) ||
      updatedAtValue < createdAtValue ||
      (expiresAtValue !== null && !Number.isFinite(expiresAtValue)) ||
      (completedAtValue !== null && !Number.isFinite(completedAtValue))
    ) {
      throw new InvalidExchangeSessionError();
    }

    this.sessionId = snapshot.sessionId.toLowerCase();
    this.patientRefId = snapshot.patientRefId.toLowerCase();
    this.sourceHospitalId = snapshot.sourceHospitalId.toLowerCase();
    this.destinationHospitalId = snapshot.destinationHospitalId.toLowerCase();
    this.requesterActorId = snapshot.requesterActorId.toLowerCase();
    this.purpose = snapshot.purpose;
    this.state = snapshot.state;
    this.createdAtValue = createdAtValue;
    this.updatedAtValue = updatedAtValue;
    this.expiresAtValue = expiresAtValue;
    this.completedAtValue = completedAtValue;
    Object.freeze(this);
  }

  static create(input: {
    patientRefId: string;
    sourceHospitalId: string;
    destinationHospitalId: string;
    requesterActorId: string;
    purpose: string;
    now?: Date;
    expiresAt?: Date | null;
  }): ExchangeSession {
    const now = input.now ?? new Date();
    return new ExchangeSession({
      sessionId: randomUUID(),
      patientRefId: input.patientRefId,
      sourceHospitalId: input.sourceHospitalId,
      destinationHospitalId: input.destinationHospitalId,
      requesterActorId: input.requesterActorId,
      purpose: input.purpose,
      state: "REQUESTED",
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
      completedAt: null,
    });
  }

  static reconstitute(snapshot: ExchangeSessionSnapshot): ExchangeSession {
    return new ExchangeSession(snapshot);
  }

  transitionTo(
    nextState: ExchangeSessionState,
    now: Date,
  ): ExchangeSession {
    const transitionAt = timestamp(now);
    if (
      !exchangeSessionStates.includes(nextState) ||
      terminalSessionStates.has(this.state) ||
      !(allowedTransitions[this.state] as readonly ExchangeSessionState[]).includes(
        nextState,
      ) ||
      !Number.isFinite(transitionAt) ||
      transitionAt < this.updatedAtValue ||
      (nextState !== "COMPLETED" && this.completedAtValue !== null)
    ) {
      throw new InvalidExchangeSessionTransitionError();
    }

    return new ExchangeSession({
      sessionId: this.sessionId,
      patientRefId: this.patientRefId,
      sourceHospitalId: this.sourceHospitalId,
      destinationHospitalId: this.destinationHospitalId,
      requesterActorId: this.requesterActorId,
      purpose: this.purpose,
      state: nextState,
      createdAt: this.createdAt,
      updatedAt: now,
      expiresAt: this.expiresAt,
      completedAt: nextState === "COMPLETED" ? now : null,
    });
  }

  static isValidId(value: string): boolean {
    return (
      typeof value === "string" &&
      value.length === 36 &&
      uuidPattern.test(value)
    );
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtValue);
  }

  get expiresAt(): Date | null {
    return this.expiresAtValue === null
      ? null
      : new Date(this.expiresAtValue);
  }

  get completedAt(): Date | null {
    return this.completedAtValue === null
      ? null
      : new Date(this.completedAtValue);
  }
}
