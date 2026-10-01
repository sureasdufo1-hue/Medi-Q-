import type { VerifiedActorTenantContext } from "../../identity/identity-context.types.js";

export const authorizationActions = [
  "VIEW",
  "DOWNLOAD",
  "PACS_IMPORT",
] as const;

export type AuthorizationAction = (typeof authorizationActions)[number];

export const authorizationResourceKinds = [
  "STUDY",
  "SERIES",
  "INSTANCE",
] as const;

export type AuthorizationResourceKind =
  (typeof authorizationResourceKinds)[number];

export interface AuthorizationResourceReference {
  readonly kind: AuthorizationResourceKind;
  /** MediQ internal UUID. DICOM UIDs and hospital-local IDs are not accepted. */
  readonly id: string;
}

export interface AuthorizationContextInput {
  readonly identity: VerifiedActorTenantContext;
  readonly exchangeSessionId: string;
  readonly resource: AuthorizationResourceReference;
  readonly action: AuthorizationAction;
  /** Internal reference resolved by the server; not proof of active consent. */
  readonly consentId: string;
  /** Internal reference resolved by the server; not proof of an active grant. */
  readonly grantId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issuedContexts = new WeakSet<object>();

export class InvalidAuthorizationContextError extends Error {
  constructor() {
    super("AUTHORIZATION_CONTEXT_INVALID");
    this.name = "InvalidAuthorizationContextError";
  }
}

/**
 * A complete, non-persistent input envelope for a future policy evaluator.
 * Constructing it never authorizes access and does not verify referenced rows.
 */
export class AuthorizationContext {
  readonly issuer: string;
  readonly subject: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly hospitalId: string | null;
  readonly actorType: VerifiedActorTenantContext["actorType"];
  readonly exchangeSessionId: string;
  readonly resource: AuthorizationResourceReference;
  readonly action: AuthorizationAction;
  readonly consentId: string;
  readonly grantId: string;

  private constructor(input: AuthorizationContextInput) {
    if (!input || typeof input !== "object") {
      throw new InvalidAuthorizationContextError();
    }
    const identity = input.identity;
    if (
      !identity ||
      typeof identity.issuer !== "string" ||
      identity.issuer.length === 0 ||
      identity.issuer.length > 2048 ||
      typeof identity.subject !== "string" ||
      identity.subject.length === 0 ||
      identity.subject.length > 255 ||
      !UUID_PATTERN.test(identity.actorId) ||
      !UUID_PATTERN.test(identity.tenantId) ||
      (identity.hospitalId !== null && !UUID_PATTERN.test(identity.hospitalId)) ||
      (identity.actorType !== "USER" && identity.actorType !== "SERVICE") ||
      !UUID_PATTERN.test(input.exchangeSessionId) ||
      !input.resource ||
      !authorizationResourceKinds.includes(input.resource.kind) ||
      !UUID_PATTERN.test(input.resource.id) ||
      !authorizationActions.includes(input.action) ||
      !UUID_PATTERN.test(input.consentId) ||
      !UUID_PATTERN.test(input.grantId)
    ) {
      throw new InvalidAuthorizationContextError();
    }

    this.issuer = identity.issuer;
    this.subject = identity.subject;
    this.actorId = identity.actorId.toLowerCase();
    this.tenantId = identity.tenantId.toLowerCase();
    this.hospitalId = identity.hospitalId?.toLowerCase() ?? null;
    this.actorType = identity.actorType;
    this.exchangeSessionId = input.exchangeSessionId.toLowerCase();
    this.resource = Object.freeze({
      kind: input.resource.kind,
      id: input.resource.id.toLowerCase(),
    });
    this.action = input.action;
    this.consentId = input.consentId.toLowerCase();
    this.grantId = input.grantId.toLowerCase();
    Object.freeze(this);
    issuedContexts.add(this);
  }

  static create(input: AuthorizationContextInput): AuthorizationContext {
    return new AuthorizationContext(input);
  }

  static is(value: unknown): value is AuthorizationContext {
    return typeof value === "object" && value !== null && issuedContexts.has(value);
  }
}
