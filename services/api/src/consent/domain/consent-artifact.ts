import { randomUUID } from "node:crypto";

export const consentArtifactStatuses = Object.freeze([
  "PENDING",
  "ACTIVE",
  "WITHDRAWN",
  "EXPIRED",
  "REJECTED",
] as const);

export type ConsentArtifactStatus = (typeof consentArtifactStatuses)[number];

export const p0ConsentActions = Object.freeze([
  "VIEW",
  "DOWNLOAD",
  "PACS_IMPORT",
] as const);

export type P0ConsentAction = (typeof p0ConsentActions)[number];

export interface ConsentArtifactSnapshot {
  consentId: string;
  exchangeSessionId: string;
  patientRefId: string;
  sourceHospitalId: string;
  destinationHospitalId: string;
  imagingPackageId: string | null;
  actions: readonly P0ConsentAction[];
  status: ConsentArtifactStatus;
  consentVersion: number;
  issuedAt: Date | null;
  expiresAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidConsentArtifactError extends Error {
  constructor() {
    super("CONSENT_ARTIFACT_INVALID");
    this.name = "InvalidConsentArtifactError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStatuses: ReadonlySet<string> = new Set(consentArtifactStatuses);
const allowedActions: ReadonlySet<string> = new Set(p0ConsentActions);

function validId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number.NaN;
}

function optionalTimestamp(value: unknown): number | null | undefined {
  if (value === null) return null;
  const time = timestamp(value);
  return Number.isFinite(time) ? time : undefined;
}

function validActionList(value: unknown): value is readonly P0ConsentAction[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (action) => typeof action === "string" && allowedActions.has(action),
    ) &&
    new Set(value).size === value.length
  );
}

/**
 * Immutable technical Consent evidence metadata. It is not an authorization
 * decision, proof of legal consent, or a Grant to use any protected resource.
 */
export class ConsentArtifact {
  readonly consentId: string;
  readonly exchangeSessionId: string;
  readonly patientRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly imagingPackageId: string | null;
  readonly actions: readonly P0ConsentAction[];
  readonly status: ConsentArtifactStatus;
  readonly consentVersion: number;
  private readonly issuedAtValue: number | null;
  private readonly expiresAtValue: number | null;
  private readonly withdrawnAtValue: number | null;
  private readonly createdAtValue: number;
  private readonly updatedAtValue: number;

  private constructor(snapshot: ConsentArtifactSnapshot) {
    const issuedAtValue = optionalTimestamp(snapshot.issuedAt);
    const expiresAtValue = optionalTimestamp(snapshot.expiresAt);
    const withdrawnAtValue = optionalTimestamp(snapshot.withdrawnAt);
    const createdAtValue = timestamp(snapshot.createdAt);
    const updatedAtValue = timestamp(snapshot.updatedAt);

    if (
      !validId(snapshot.consentId) ||
      !validId(snapshot.exchangeSessionId) ||
      !validId(snapshot.patientRefId) ||
      !validId(snapshot.sourceHospitalId) ||
      !validId(snapshot.destinationHospitalId) ||
      sameId(snapshot.sourceHospitalId, snapshot.destinationHospitalId) ||
      (snapshot.imagingPackageId !== null &&
        !validId(snapshot.imagingPackageId)) ||
      !validActionList(snapshot.actions) ||
      !allowedStatuses.has(snapshot.status) ||
      !Number.isSafeInteger(snapshot.consentVersion) ||
      snapshot.consentVersion <= 0 ||
      issuedAtValue === undefined ||
      expiresAtValue === undefined ||
      withdrawnAtValue === undefined ||
      !Number.isFinite(createdAtValue) ||
      !Number.isFinite(updatedAtValue) ||
      updatedAtValue < createdAtValue
    ) {
      throw new InvalidConsentArtifactError();
    }

    this.consentId = snapshot.consentId.toLowerCase();
    this.exchangeSessionId = snapshot.exchangeSessionId.toLowerCase();
    this.patientRefId = snapshot.patientRefId.toLowerCase();
    this.sourceHospitalId = snapshot.sourceHospitalId.toLowerCase();
    this.destinationHospitalId = snapshot.destinationHospitalId.toLowerCase();
    this.imagingPackageId = snapshot.imagingPackageId?.toLowerCase() ?? null;
    this.actions = Object.freeze([...snapshot.actions]);
    this.status = snapshot.status;
    this.consentVersion = snapshot.consentVersion;
    this.issuedAtValue = issuedAtValue;
    this.expiresAtValue = expiresAtValue;
    this.withdrawnAtValue = withdrawnAtValue;
    this.createdAtValue = createdAtValue;
    this.updatedAtValue = updatedAtValue;
    Object.freeze(this);
  }

  static create(input: {
    exchangeSessionId: string;
    patientRefId: string;
    sourceHospitalId: string;
    destinationHospitalId: string;
    imagingPackageId?: string | null;
    actions: readonly P0ConsentAction[];
    consentVersion: number;
    now?: Date;
    expiresAt?: Date | null;
  }): ConsentArtifact {
    const now = input.now ?? new Date();
    return new ConsentArtifact({
      consentId: randomUUID(),
      exchangeSessionId: input.exchangeSessionId,
      patientRefId: input.patientRefId,
      sourceHospitalId: input.sourceHospitalId,
      destinationHospitalId: input.destinationHospitalId,
      imagingPackageId: input.imagingPackageId ?? null,
      actions: input.actions,
      status: "PENDING",
      consentVersion: input.consentVersion,
      issuedAt: null,
      expiresAt: input.expiresAt ?? null,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(snapshot: ConsentArtifactSnapshot): ConsentArtifact {
    return new ConsentArtifact(snapshot);
  }

  approve(now: Date): ConsentArtifact {
    const approvedAt = timestamp(now);
    if (
      this.status !== "PENDING" ||
      !Number.isFinite(approvedAt) ||
      approvedAt < this.updatedAtValue ||
      (this.expiresAtValue !== null && this.expiresAtValue <= approvedAt)
    ) {
      throw new InvalidConsentArtifactError();
    }
    return new ConsentArtifact({
      consentId: this.consentId,
      exchangeSessionId: this.exchangeSessionId,
      patientRefId: this.patientRefId,
      sourceHospitalId: this.sourceHospitalId,
      destinationHospitalId: this.destinationHospitalId,
      imagingPackageId: this.imagingPackageId,
      actions: this.actions,
      status: "ACTIVE",
      consentVersion: this.consentVersion,
      issuedAt: now,
      expiresAt: this.expiresAt,
      withdrawnAt: this.withdrawnAt,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  withdraw(now: Date): ConsentArtifact {
    const withdrawnAt = timestamp(now);
    if (
      this.status !== "ACTIVE" ||
      this.issuedAtValue === null ||
      this.issuedAtValue < this.createdAtValue ||
      this.issuedAtValue > this.updatedAtValue ||
      this.issuedAtValue > withdrawnAt ||
      this.withdrawnAtValue !== null ||
      !Number.isFinite(withdrawnAt) ||
      withdrawnAt < this.updatedAtValue
    ) {
      throw new InvalidConsentArtifactError();
    }
    return new ConsentArtifact({
      consentId: this.consentId,
      exchangeSessionId: this.exchangeSessionId,
      patientRefId: this.patientRefId,
      sourceHospitalId: this.sourceHospitalId,
      destinationHospitalId: this.destinationHospitalId,
      imagingPackageId: this.imagingPackageId,
      actions: this.actions,
      status: "WITHDRAWN",
      consentVersion: this.consentVersion,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      withdrawnAt: now,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  static isValidId(value: unknown): value is string {
    return validId(value);
  }

  get issuedAt(): Date | null {
    return this.issuedAtValue === null ? null : new Date(this.issuedAtValue);
  }

  get expiresAt(): Date | null {
    return this.expiresAtValue === null ? null : new Date(this.expiresAtValue);
  }

  get withdrawnAt(): Date | null {
    return this.withdrawnAtValue === null
      ? null
      : new Date(this.withdrawnAtValue);
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtValue);
  }
}
