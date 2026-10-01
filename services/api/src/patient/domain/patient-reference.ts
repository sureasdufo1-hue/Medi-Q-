import { randomUUID } from "node:crypto";

export const patientReferenceStatuses = ["ACTIVE", "INACTIVE"] as const;
export type PatientReferenceStatus = (typeof patientReferenceStatuses)[number];

const patientReferenceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const syntheticPatientReferenceCodePattern =
  /^MQ-TEST-[A-Z0-9][A-Z0-9-]{0,55}$/;

export interface PatientReferenceState {
  patientRefId: string;
  patientRefCode: string;
  status: PatientReferenceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidPatientReferenceError extends Error {
  constructor() {
    super("PATIENT_REFERENCE_INVALID");
    this.name = "InvalidPatientReferenceError";
  }
}

export class PatientReference {
  readonly patientRefId: string;
  readonly patientRefCode: string;
  readonly status: PatientReferenceStatus;
  private readonly createdAtValue: number;
  private readonly updatedAtValue: number;

  private constructor(state: PatientReferenceState) {
    if (!PatientReference.isValidId(state.patientRefId)) {
      throw new InvalidPatientReferenceError();
    }
    if (!PatientReference.isValidCode(state.patientRefCode)) {
      throw new InvalidPatientReferenceError();
    }
    if (!patientReferenceStatuses.includes(state.status)) {
      throw new InvalidPatientReferenceError();
    }

    const createdAtValue =
      state.createdAt instanceof Date ? state.createdAt.getTime() : Number.NaN;
    const updatedAtValue =
      state.updatedAt instanceof Date ? state.updatedAt.getTime() : Number.NaN;
    if (
      !Number.isFinite(createdAtValue) ||
      !Number.isFinite(updatedAtValue) ||
      updatedAtValue < createdAtValue
    ) {
      throw new InvalidPatientReferenceError();
    }

    this.patientRefId = state.patientRefId.toLowerCase();
    this.patientRefCode = state.patientRefCode;
    this.status = state.status;
    this.createdAtValue = createdAtValue;
    this.updatedAtValue = updatedAtValue;
    Object.freeze(this);
  }

  static create(input: {
    patientRefCode: string;
    patientRefId?: string;
    now?: Date;
  }): PatientReference {
    const now = input.now ?? new Date();
    return new PatientReference({
      patientRefId: input.patientRefId ?? randomUUID(),
      patientRefCode: input.patientRefCode,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(state: PatientReferenceState): PatientReference {
    return new PatientReference(state);
  }

  static isValidId(value: string): boolean {
    return typeof value === "string" && patientReferenceIdPattern.test(value);
  }

  static isValidCode(value: string): boolean {
    return (
      typeof value === "string" &&
      syntheticPatientReferenceCodePattern.test(value)
    );
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtValue);
  }
}
