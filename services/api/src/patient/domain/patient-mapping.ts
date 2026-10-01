import { randomUUID } from "node:crypto";
import { PatientReference } from "./patient-reference.js";

export const patientMappingStatuses = [
  "VALID",
  "UNVERIFIED",
  "AMBIGUOUS",
  "REVOKED",
] as const;
export type PatientMappingStatus = (typeof patientMappingStatuses)[number];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const syntheticLocalPatientIdPattern =
  /^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export interface PatientMappingState {
  mappingId: string;
  patientRefId: string;
  hospitalId: string;
  localPatientId: string;
  status: PatientMappingStatus;
  validatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidPatientMappingError extends Error {
  constructor() {
    super("PATIENT_MAPPING_INVALID");
    this.name = "InvalidPatientMappingError";
  }
}

export class PatientMapping {
  readonly mappingId: string;
  readonly patientRefId: string;
  readonly hospitalId: string;
  readonly localPatientId: string;
  readonly status: PatientMappingStatus;
  private readonly validatedAtValue: number | null;
  private readonly createdAtValue: number;
  private readonly updatedAtValue: number;

  private constructor(state: PatientMappingState) {
    if (
      !PatientMapping.isValidId(state.mappingId) ||
      !PatientMapping.isValidId(state.patientRefId) ||
      !PatientMapping.isValidId(state.hospitalId) ||
      !PatientMapping.isValidLocalPatientId(state.localPatientId) ||
      !patientMappingStatuses.includes(state.status)
    ) {
      throw new InvalidPatientMappingError();
    }

    const createdAtValue =
      state.createdAt instanceof Date ? state.createdAt.getTime() : Number.NaN;
    const updatedAtValue =
      state.updatedAt instanceof Date ? state.updatedAt.getTime() : Number.NaN;
    const validatedAtValue =
      state.validatedAt === null
        ? null
        : state.validatedAt instanceof Date
          ? state.validatedAt.getTime()
          : Number.NaN;

    if (
      !Number.isFinite(createdAtValue) ||
      !Number.isFinite(updatedAtValue) ||
      updatedAtValue < createdAtValue ||
      (validatedAtValue !== null && !Number.isFinite(validatedAtValue))
    ) {
      throw new InvalidPatientMappingError();
    }

    this.mappingId = state.mappingId.toLowerCase();
    this.patientRefId = state.patientRefId.toLowerCase();
    this.hospitalId = state.hospitalId.toLowerCase();
    this.localPatientId = state.localPatientId;
    this.status = state.status;
    this.validatedAtValue = validatedAtValue;
    this.createdAtValue = createdAtValue;
    this.updatedAtValue = updatedAtValue;
    Object.freeze(this);
  }

  static create(input: {
    patientReference: PatientReference;
    hospitalId: string;
    localPatientId: string;
    mappingId?: string;
    now?: Date;
  }): PatientMapping {
    if (
      !(input.patientReference instanceof PatientReference) ||
      input.patientReference.status !== "ACTIVE"
    ) {
      throw new InvalidPatientMappingError();
    }

    const now = input.now ?? new Date();
    return new PatientMapping({
      mappingId: input.mappingId ?? randomUUID(),
      patientRefId: input.patientReference.patientRefId,
      hospitalId: input.hospitalId,
      localPatientId: input.localPatientId,
      status: "UNVERIFIED",
      validatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(state: PatientMappingState): PatientMapping {
    return new PatientMapping(state);
  }

  static isValidId(value: string): boolean {
    return (
      typeof value === "string" &&
      value.length === 36 &&
      uuidPattern.test(value)
    );
  }

  static isValidLocalPatientId(value: string): boolean {
    return (
      typeof value === "string" &&
      value.length <= 128 &&
      value === value.trim() &&
      syntheticLocalPatientIdPattern.test(value)
    );
  }

  get validatedAt(): Date | null {
    return this.validatedAtValue === null
      ? null
      : new Date(this.validatedAtValue);
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtValue);
  }
}
