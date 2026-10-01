import {
  authorizationActions,
  AuthorizationContext,
  authorizationResourceKinds,
} from "./authorization-context.js";
import type { AuthorizationEffect } from "./authorization-effect.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedSessionStates = new Set(["AUTHORIZED", "READY", "ACTIVE"]);
const allowedPackageStates = new Set(["AVAILABLE", "IN_EXCHANGE"]);
const allowedResourceKindValues: ReadonlySet<string> = new Set(
  authorizationResourceKinds,
);
const allowedConsentActions: ReadonlySet<string> = new Set(authorizationActions);
const scopeForAction: Readonly<Record<string, string>> = {
  VIEW: "study:view",
  DOWNLOAD: "study:download",
  PACS_IMPORT: "study:pacs-transfer",
};
const actionForScope = new Map(
  Object.entries(scopeForAction).map(([action, scope]) => [scope, action]),
);
const allowedGrantScopes = new Set(actionForScope.keys());

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function sameId(left: unknown, right: unknown): boolean {
  return uuid(left) && uuid(right) && left.toLowerCase() === right.toLowerCase();
}

function dateMillis(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number.NaN;
}

function optionalDateMillis(value: unknown): number | null | undefined {
  if (value === null) return null;
  const timestamp = dateMillis(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isUniqueAllowedStringList(
  value: unknown,
  allowed: ReadonlySet<string>,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && allowed.has(item)) &&
    new Set(value).size === value.length
  );
}

/**
 * Pure P0 authorization rule set. It never loads records or performs an action.
 * Unknown, incomplete or contradictory evidence always returns DENY.
 */
export function decideObjectAuthorization(
  contextValue: unknown,
  evidenceValue: unknown,
  nowValue: unknown,
): AuthorizationEffect {
  if (!AuthorizationContext.is(contextValue)) return "DENY";
  const context = contextValue;
  const evidence = record(evidenceValue);
  const now = dateMillis(nowValue);
  if (!evidence || !Number.isFinite(now)) return "DENY";

  const session = record(evidence.exchangeSession);
  const consent = record(evidence.consent);
  const grant = record(evidence.transferGrant);
  const resource = record(evidence.resourceBinding);
  if (!session || !consent || !grant || !resource) return "DENY";

  const action = context.action;
  const requiredScope = scopeForAction[action];
  if (!authorizationActions.includes(action) || !requiredScope) return "DENY";

  const sessionExpiry = optionalDateMillis(session.expiresAt);
  if (
    !sameId(session.sessionId, context.exchangeSessionId) ||
    !sameId(session.sessionId, consent.exchangeSessionId) ||
    !sameId(session.sessionId, grant.exchangeSessionId) ||
    !sameId(session.sessionId, resource.exchangeSessionId) ||
    !sameId(session.patientRefId, consent.patientRefId) ||
    !sameId(session.patientRefId, resource.patientRefId) ||
    !sameId(session.sourceHospitalId, consent.sourceHospitalId) ||
    !sameId(session.sourceHospitalId, resource.sourceHospitalId) ||
    !sameId(session.destinationHospitalId, consent.destinationHospitalId) ||
    !sameId(session.destinationHospitalId, context.hospitalId) ||
    typeof session.state !== "string" ||
    !allowedSessionStates.has(session.state) ||
    sessionExpiry === undefined ||
    (sessionExpiry !== null && sessionExpiry <= now)
  ) {
    return "DENY";
  }

  const consentIssuedAt = dateMillis(consent.issuedAt);
  const consentExpiry = optionalDateMillis(consent.expiresAt);
  const consentActions = consent.allowedActions;
  if (
    !sameId(consent.consentId, context.consentId) ||
    typeof consent.status !== "string" ||
    consent.status !== "ACTIVE" ||
    !sameId(consent.exchangeSessionId, session.sessionId) ||
    !sameId(consent.patientRefId, session.patientRefId) ||
    !sameId(consent.sourceHospitalId, session.sourceHospitalId) ||
    !sameId(consent.destinationHospitalId, session.destinationHospitalId) ||
    !Number.isFinite(consentIssuedAt) ||
    consentIssuedAt > now ||
    consent.withdrawnAt !== null ||
    consentExpiry === undefined ||
    (consentExpiry !== null && consentExpiry <= now) ||
    !isUniqueAllowedStringList(consentActions, allowedConsentActions) ||
    !consentActions.includes(action) ||
    (consent.imagingPackageId !== null &&
      !sameId(consent.imagingPackageId, resource.imagingPackageId))
  ) {
    return "DENY";
  }

  const grantIssuedAt = dateMillis(grant.issuedAt);
  const grantExpiry = dateMillis(grant.expiresAt);
  const scopes = grant.scopes;
  if (
    !sameId(grant.grantId, context.grantId) ||
    typeof grant.status !== "string" ||
    grant.status !== "ACTIVE" ||
    !sameId(grant.exchangeSessionId, session.sessionId) ||
    !sameId(grant.consentId, consent.consentId) ||
    !sameId(grant.recipientTenantId, context.tenantId) ||
    !sameId(grant.recipientHospitalId, session.destinationHospitalId) ||
    !sameId(grant.recipientHospitalId, context.hospitalId) ||
    (grant.recipientActorId !== null &&
      !sameId(grant.recipientActorId, context.actorId)) ||
    !sameId(grant.imagingPackageId, resource.imagingPackageId) ||
    !Number.isFinite(grantIssuedAt) ||
    !Number.isFinite(grantExpiry) ||
    grantIssuedAt > now ||
    grantExpiry <= now ||
    grantExpiry <= grantIssuedAt ||
    grant.revokedAt !== null ||
    !isUniqueAllowedStringList(scopes, allowedGrantScopes) ||
    !scopes.includes(requiredScope) ||
    !scopes.every((scope) => {
      const scopeAction = actionForScope.get(scope);
      return scopeAction !== undefined && consentActions.includes(scopeAction);
    })
  ) {
    return "DENY";
  }

  const resourceKind = resource.kind;
  const resourceId = resource.resourceId;
  const studyRefId = resource.studyRefId;
  const resourceRetentionExpiry = optionalDateMillis(
    resource.retentionExpiresAt,
  );
  if (
    typeof resourceKind !== "string" ||
    !allowedResourceKindValues.has(resourceKind) ||
    resourceKind !== context.resource.kind ||
    !sameId(resourceId, context.resource.id) ||
    !uuid(studyRefId) ||
    (resourceKind === "STUDY" && !sameId(resourceId, studyRefId)) ||
    !sameId(resource.exchangeSessionId, session.sessionId) ||
    !sameId(resource.patientRefId, session.patientRefId) ||
    !sameId(resource.sourceHospitalId, session.sourceHospitalId) ||
    typeof resource.packageState !== "string" ||
    !allowedPackageStates.has(resource.packageState) ||
    resource.deletedAt !== null ||
    resourceRetentionExpiry === undefined ||
    (resourceRetentionExpiry !== null && resourceRetentionExpiry <= now)
  ) {
    return "DENY";
  }

  return "ALLOW";
}
