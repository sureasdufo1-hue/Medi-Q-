export interface PacsImportProvenanceRecord {
  readonly provenanceId: string;
  readonly operationId: string;
  readonly exchangeSessionId: string;
  readonly packageId: string;
  readonly studyRefId: string;
  readonly sourceHospitalId: string;
  readonly destinationHospitalId: string;
  readonly transferType: "PACS_IMPORT";
  readonly transferStatus: "PENDING";
  readonly createdAt: Date;
}

export interface ProvenanceRepository {
  createPendingForPacsImport(input: {
    readonly operationId: string;
    readonly now: Date;
  }): Promise<{
    readonly record: PacsImportProvenanceRecord;
    readonly created: boolean;
  }>;
}

export class ProvenancePersistenceError extends Error {
  constructor() {
    super("PROVENANCE_PERSISTENCE_FAILED");
    this.name = "ProvenancePersistenceError";
  }
}

export class ProvenanceUnavailableError extends Error {
  constructor() {
    super("PROVENANCE_OPERATION_UNAVAILABLE");
    this.name = "ProvenanceUnavailableError";
  }
}

export class ProvenanceConflictError extends Error {
  constructor() {
    super("PROVENANCE_OPERATION_BINDING_CONFLICT");
    this.name = "ProvenanceConflictError";
  }
}
