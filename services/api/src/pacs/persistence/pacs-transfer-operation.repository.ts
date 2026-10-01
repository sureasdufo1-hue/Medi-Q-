import type { PacsTransferOperation } from "../domain/pacs-transfer-operation.js";

export interface PacsTransferOperationCreateResult {
  readonly operation: PacsTransferOperation;
  readonly created: boolean;
}

export interface PacsTransferOperationRepository {
  createIdempotently(input: {
    readonly operation: PacsTransferOperation;
    readonly correlationId: string;
  }): Promise<PacsTransferOperationCreateResult>;

  transition(input: {
    readonly current: PacsTransferOperation;
    readonly next: PacsTransferOperation;
    readonly correlationId: string;
  }): Promise<PacsTransferOperation>;
}

export class PacsTransferOperationConflictError extends Error {
  constructor() {
    super("PACS_TRANSFER_OPERATION_CONFLICT");
    this.name = "PacsTransferOperationConflictError";
  }
}

export class PacsTransferOperationPersistenceError extends Error {
  constructor() {
    super("PACS_TRANSFER_OPERATION_PERSISTENCE_FAILED");
    this.name = "PacsTransferOperationPersistenceError";
  }
}

export class PacsTransferOperationConcurrencyError extends Error {
  constructor() {
    super("PACS_TRANSFER_OPERATION_CONCURRENCY_CONFLICT");
    this.name = "PacsTransferOperationConcurrencyError";
  }
}
