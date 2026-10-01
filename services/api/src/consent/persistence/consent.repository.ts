import type { ConsentArtifact } from "../domain/consent-artifact.js";
import type { P0ConsentAction } from "../domain/consent-artifact.js";

export interface CreatePendingConsentInput {
  readonly exchangeSessionId: string;
  readonly patientRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly imagingPackageId?: string | null;
  readonly actions: readonly P0ConsentAction[];
  readonly expiresAt?: Date | null;
  readonly now?: Date;
}

/**
 * Internal persistence port. Callers must use the same IAM-002 verified
 * tenant PoolClient transaction; this port does not grant business authority.
 */
export interface ConsentRepository {
  createPending(input: CreatePendingConsentInput): Promise<ConsentArtifact>;
  findById(consentId: string): Promise<ConsentArtifact | null>;
  findPendingBySession(exchangeSessionId: string): Promise<readonly ConsentArtifact[]>;
  approvePending(input: {
    consent: ConsentArtifact;
    now: Date;
  }): Promise<ConsentArtifact>;
  withdrawActive(input: {
    consent: ConsentArtifact;
    now: Date;
  }): Promise<ConsentArtifact>;
}
