import type { PatientMapping } from "../domain/patient-mapping.js";

/**
 * Internal persistence port only. Callers must first enforce object/action
 * authorization and run on the checked-out transaction carrying a
 * server-resolved Tenant context. This interface is not a security boundary.
 */
export interface PatientMappingRepository {
  create(mapping: PatientMapping): Promise<PatientMapping>;
  findByIdForHospital(
    hospitalId: string,
    mappingId: string,
  ): Promise<PatientMapping | null>;
  findByLocalPatientId(
    hospitalId: string,
    localPatientId: string,
  ): Promise<PatientMapping | null>;
  findByPatientReference(
    hospitalId: string,
    patientRefId: string,
  ): Promise<PatientMapping | null>;
}
