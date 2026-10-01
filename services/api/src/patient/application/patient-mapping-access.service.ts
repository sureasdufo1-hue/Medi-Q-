import type { PoolClient } from "pg";
import type { VerifiedAuthenticationPrincipal } from "../../authentication/authentication.types.js";
import {
  ActorTenantContextDeniedError,
  ActorTenantContextUnavailableError,
  type VerifiedActorTenantContext,
} from "../../identity/identity-context.types.js";
import type { ActorTenantContextService } from "../../identity/application/actor-tenant-context.service.js";
import { PatientMapping } from "../domain/patient-mapping.js";
import type { PatientMappingRepository } from "./patient-mapping.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PatientMappingAccessDeniedError extends Error {
  constructor() {
    super("PATIENT_MAPPING_ACCESS_DENIED");
    this.name = "PatientMappingAccessDeniedError";
  }
}

export class PatientMappingAccessUnavailableError extends Error {
  constructor() {
    super("PATIENT_MAPPING_ACCESS_UNAVAILABLE");
    this.name = "PatientMappingAccessUnavailableError";
  }
}

export type PatientMappingRepositoryFactory = (
  client: PoolClient,
) => Pick<PatientMappingRepository, "findByIdForHospital">;

function canReadForHospital(
  identity: VerifiedActorTenantContext,
  requestedHospitalId: string,
): boolean {
  return Boolean(
    identity &&
      identity.actorType === "USER" &&
      UUID_PATTERN.test(identity.actorId) &&
      UUID_PATTERN.test(identity.tenantId) &&
      typeof identity.issuer === "string" &&
      identity.issuer.length > 0 &&
      typeof identity.subject === "string" &&
      identity.subject.length > 0 &&
      identity.hospitalId !== null &&
      UUID_PATTERN.test(identity.hospitalId) &&
      UUID_PATTERN.test(requestedHospitalId) &&
      identity.hospitalId.toLowerCase() === requestedHospitalId.toLowerCase(),
  );
}

/**
 * Internal read-only access boundary for synthetic PatientMappings.
 * The caller-provided Hospital is only a candidate: policy checks it against
 * IAM-002's verified membership before constructing the repository, and the
 * query always uses the Hospital from that verified context.
 */
export class PatientMappingAccessService {
  constructor(
    private readonly actorTenantContext: Pick<ActorTenantContextService, "run">,
    private readonly repositoryFactory: PatientMappingRepositoryFactory,
  ) {}

  async findById(
    principal: VerifiedAuthenticationPrincipal | null | undefined,
    tenantCandidate: string,
    requestedHospitalId: string,
    mappingId: string,
  ): Promise<PatientMapping | null> {
    if (
      !PatientMapping.isValidId(requestedHospitalId) ||
      !PatientMapping.isValidId(mappingId)
    ) {
      throw new PatientMappingAccessDeniedError();
    }

    try {
      return await this.actorTenantContext.run(
        principal,
        tenantCandidate,
        async (identity, client) => {
          if (!canReadForHospital(identity, requestedHospitalId)) {
            throw new PatientMappingAccessDeniedError();
          }

          const repository = this.repositoryFactory(client);
          return repository.findByIdForHospital(
            identity.hospitalId!,
            mappingId,
          );
        },
      );
    } catch (error) {
      if (error instanceof PatientMappingAccessDeniedError) throw error;
      if (error instanceof ActorTenantContextDeniedError) {
        throw new PatientMappingAccessDeniedError();
      }
      if (error instanceof ActorTenantContextUnavailableError) {
        throw new PatientMappingAccessUnavailableError();
      }
      throw new PatientMappingAccessUnavailableError();
    }
  }
}
