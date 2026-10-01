import type { PatientReference } from "../domain/patient-reference.js";

export interface PatientReferenceRepository {
  create(reference: PatientReference): Promise<PatientReference>;
  findById(patientRefId: string): Promise<PatientReference | null>;
  findByCode(patientRefCode: string): Promise<PatientReference | null>;
}
