export const TEMPORARY_PAYLOAD_QUOTA_RESERVATION_BYTES = 16 * 1024 * 1024;

export interface TemporaryPayloadQuotaReservationInput {
  readonly tenantId: string;
  readonly studyRefId: string;
  readonly storageRef: string;
  readonly writerId: string;
}

export interface TemporaryPayloadQuotaReservationPort {
  /** Atomically reserve one bounded block before its ciphertext is written. */
  reserve(input: TemporaryPayloadQuotaReservationInput & {
    readonly deltaBytes: number;
  }): Promise<void>;

  /** Refund unused reservation only after the encrypted Study package is sealed. */
  settle(input: TemporaryPayloadQuotaReservationInput & {
    readonly actualBytes: number;
  }): Promise<void>;
}
