import type { AuthorizationResourceKind } from "./authorization-context.js";

/**
 * Server-resolved facts required by the P0 object authorization policy.
 * These are read models, not client request DTOs or authorization credentials.
 */
export interface AuthorizationPolicyFacts {
  readonly exchangeSession: {
    readonly sessionId: string;
    readonly patientRefId: string;
    readonly sourceHospitalId: string;
    readonly destinationHospitalId: string;
    readonly state: string;
    readonly expiresAt: Date | null;
  };
  readonly consent: {
    readonly consentId: string;
    readonly exchangeSessionId: string;
    readonly patientRefId: string;
    readonly sourceHospitalId: string;
    readonly destinationHospitalId: string;
    readonly imagingPackageId: string | null;
    readonly status: string;
    readonly issuedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly withdrawnAt: Date | null;
    readonly allowedActions: readonly string[];
  };
  readonly transferGrant: {
    readonly grantId: string;
    readonly exchangeSessionId: string;
    readonly consentId: string;
    readonly recipientTenantId: string;
    readonly recipientHospitalId: string;
    readonly recipientActorId: string | null;
    readonly imagingPackageId: string | null;
    readonly status: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
    readonly revokedAt: Date | null;
    readonly scopes: readonly string[];
  };
  readonly resourceBinding: {
    readonly kind: AuthorizationResourceKind;
    readonly resourceId: string;
    /** Parent Study reference proved by the server-side resolver. */
    readonly studyRefId: string;
    readonly exchangeSessionId: string;
    readonly patientRefId: string;
    readonly sourceHospitalId: string;
    readonly imagingPackageId: string;
    readonly packageState: string;
    readonly retentionExpiresAt: Date | null;
    readonly deletedAt: Date | null;
  };
}
