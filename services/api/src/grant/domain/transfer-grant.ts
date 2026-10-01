import { randomUUID } from "node:crypto";

export const transferGrantStatuses = Object.freeze([
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "CONSUMED",
] as const);

export type TransferGrantStatus = (typeof transferGrantStatuses)[number];

export const p0TransferGrantScopes = Object.freeze([
  "study:view",
  "study:download",
  "study:pacs-transfer",
] as const);

export type P0TransferGrantScope = (typeof p0TransferGrantScopes)[number];

export interface TransferGrantSnapshot {
  grantId: string;
  exchangeSessionId: string;
  consentId: string;
  recipientTenantId: string;
  recipientHospitalId: string;
  recipientActorId: string | null;
  imagingPackageId: string | null;
  scopes: readonly P0TransferGrantScope[];
  status: TransferGrantStatus;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class InvalidTransferGrantError extends Error {
  constructor() {
    super("TRANSFER_GRANT_INVALID");
    this.name = "InvalidTransferGrantError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStatuses: ReadonlySet<string> = new Set(transferGrantStatuses);
const allowedScopes: ReadonlySet<string> = new Set(p0TransferGrantScopes);

function validId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number.NaN;
}

function validScopeList(value: unknown): value is readonly P0TransferGrantScope[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (scope) => typeof scope === "string" && allowedScopes.has(scope),
    ) &&
    new Set(value).size === value.length
  );
}

function freezeSnapshot(snapshot: TransferGrantSnapshot): TransferGrantSnapshot {
  return Object.freeze({
    ...snapshot,
    scopes: Object.freeze([...snapshot.scopes]),
    issuedAt: new Date(snapshot.issuedAt.getTime()),
    expiresAt: new Date(snapshot.expiresAt.getTime()),
    revokedAt:
      snapshot.revokedAt === null
        ? null
        : new Date(snapshot.revokedAt.getTime()),
    createdAt: new Date(snapshot.createdAt.getTime()),
  });
}

/**
 * Immutable P0 Grant metadata. This entity does not decide Authorization,
 * verify Consent/recipient bindings, persist a Grant, or authorize a resource.
 */
export class TransferGrant {
  readonly grantId: string;
  readonly exchangeSessionId: string;
  readonly consentId: string;
  readonly recipientTenantId: string;
  readonly recipientHospitalId: string;
  readonly recipientActorId: string | null;
  readonly imagingPackageId: string | null;
  readonly scopes: readonly P0TransferGrantScope[];
  readonly status: TransferGrantStatus;
  private readonly issuedAtValue: number;
  private readonly expiresAtValue: number;
  private readonly revokedAtValue: number | null;
  private readonly createdAtValue: number;

  private constructor(snapshot: TransferGrantSnapshot) {
    const issuedAtValue = timestamp(snapshot.issuedAt);
    const expiresAtValue = timestamp(snapshot.expiresAt);
    const revokedAtValue =
      snapshot.revokedAt === null ? null : timestamp(snapshot.revokedAt);
    const createdAtValue = timestamp(snapshot.createdAt);

    if (
      !validId(snapshot.grantId) ||
      !validId(snapshot.exchangeSessionId) ||
      !validId(snapshot.consentId) ||
      !validId(snapshot.recipientTenantId) ||
      !validId(snapshot.recipientHospitalId) ||
      (snapshot.recipientActorId !== null &&
        !validId(snapshot.recipientActorId)) ||
      (snapshot.imagingPackageId !== null &&
        !validId(snapshot.imagingPackageId)) ||
      !validScopeList(snapshot.scopes) ||
      !allowedStatuses.has(snapshot.status) ||
      !Number.isFinite(issuedAtValue) ||
      !Number.isFinite(expiresAtValue) ||
      expiresAtValue <= issuedAtValue ||
      !Number.isFinite(createdAtValue) ||
      (revokedAtValue !== null && !Number.isFinite(revokedAtValue)) ||
      (snapshot.status === "REVOKED" &&
        (revokedAtValue === null || revokedAtValue < issuedAtValue)) ||
      (snapshot.status !== "REVOKED" && revokedAtValue !== null)
    ) {
      throw new InvalidTransferGrantError();
    }

    this.grantId = snapshot.grantId.toLowerCase();
    this.exchangeSessionId = snapshot.exchangeSessionId.toLowerCase();
    this.consentId = snapshot.consentId.toLowerCase();
    this.recipientTenantId = snapshot.recipientTenantId.toLowerCase();
    this.recipientHospitalId = snapshot.recipientHospitalId.toLowerCase();
    this.recipientActorId = snapshot.recipientActorId?.toLowerCase() ?? null;
    this.imagingPackageId = snapshot.imagingPackageId?.toLowerCase() ?? null;
    this.scopes = Object.freeze([...snapshot.scopes]);
    this.status = snapshot.status;
    this.issuedAtValue = issuedAtValue;
    this.expiresAtValue = expiresAtValue;
    this.revokedAtValue = revokedAtValue;
    this.createdAtValue = createdAtValue;
    Object.freeze(this);
  }

  /**
   * Builds an in-memory ACTIVE metadata entity. Callers must first complete
   * server-side Authorization; this pure factory does not establish that fact.
   */
  static issue(input: {
    exchangeSessionId: string;
    consentId: string;
    recipientTenantId: string;
    recipientHospitalId: string;
    recipientActorId?: string | null;
    imagingPackageId?: string | null;
    scopes: readonly P0TransferGrantScope[];
    expiresAt: Date;
    now?: Date;
  }): TransferGrant {
    const now = input.now ?? new Date();
    return new TransferGrant({
      grantId: randomUUID(),
      exchangeSessionId: input.exchangeSessionId,
      consentId: input.consentId,
      recipientTenantId: input.recipientTenantId,
      recipientHospitalId: input.recipientHospitalId,
      recipientActorId: input.recipientActorId ?? null,
      imagingPackageId: input.imagingPackageId ?? null,
      scopes: input.scopes,
      status: "ACTIVE",
      issuedAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: now,
    });
  }

  static reconstitute(snapshot: TransferGrantSnapshot): TransferGrant {
    return new TransferGrant(snapshot);
  }

  /**
   * Checks only stored lifecycle status and time bounds. This is not access
   * authorization; recipient, resource, Consent and action scopes are separate.
   */
  isTemporallyActiveAt(now: Date): boolean {
    const currentTime = timestamp(now);
    return (
      Number.isFinite(currentTime) &&
      this.status === "ACTIVE" &&
      this.revokedAtValue === null &&
      this.issuedAtValue <= currentTime &&
      currentTime < this.expiresAtValue
    );
  }

  revoke(now: Date): TransferGrant {
    const revokedAtValue = timestamp(now);
    if (
      this.status !== "ACTIVE" ||
      !Number.isFinite(revokedAtValue) ||
      revokedAtValue < this.issuedAtValue ||
      this.revokedAtValue !== null
    ) {
      throw new InvalidTransferGrantError();
    }

    return new TransferGrant({
      ...this.toSnapshot(),
      status: "REVOKED",
      revokedAt: now,
    });
  }

  toSnapshot(): TransferGrantSnapshot {
    return freezeSnapshot({
      grantId: this.grantId,
      exchangeSessionId: this.exchangeSessionId,
      consentId: this.consentId,
      recipientTenantId: this.recipientTenantId,
      recipientHospitalId: this.recipientHospitalId,
      recipientActorId: this.recipientActorId,
      imagingPackageId: this.imagingPackageId,
      scopes: this.scopes,
      status: this.status,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      createdAt: this.createdAt,
    });
  }

  get issuedAt(): Date {
    return new Date(this.issuedAtValue);
  }

  get expiresAt(): Date {
    return new Date(this.expiresAtValue);
  }

  get revokedAt(): Date | null {
    return this.revokedAtValue === null
      ? null
      : new Date(this.revokedAtValue);
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue);
  }
}
