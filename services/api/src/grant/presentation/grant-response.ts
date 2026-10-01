import type { TransferGrant } from "../domain/transfer-grant.js";

/**
 * Public TransferGrant metadata allowlist shared by issue and revoke routes.
 * Do not spread entity/snapshot properties here; Grants never carry DICOM or keys.
 */
export function toGrantResponse(grant: TransferGrant) {
  return {
    grantId: grant.grantId,
    sessionId: grant.exchangeSessionId,
    consentId: grant.consentId,
    recipientTenantId: grant.recipientTenantId,
    recipientHospitalId: grant.recipientHospitalId,
    recipientActorId: grant.recipientActorId,
    imagingPackageId: grant.imagingPackageId,
    scopes: [...grant.scopes],
    status: grant.status,
    issuedAt: grant.issuedAt.toISOString(),
    expiresAt: grant.expiresAt.toISOString(),
    ...(grant.revokedAt ? { revokedAt: grant.revokedAt.toISOString() } : {}),
  };
}
