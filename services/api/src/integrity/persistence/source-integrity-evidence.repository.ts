import {
  SOURCE_INTEGRITY_ALGORITHM,
  SOURCE_INTEGRITY_LIMITS,
  type SourceIntegrityManifest,
} from "../application/source-integrity-manifest.builder.js";

export interface SourceIntegrityEvidenceRecord {
  readonly integrityId: string;
  readonly operationId: string;
  readonly exchangeSessionId: string;
  readonly packageId: string;
  readonly studyRefId: string;
  readonly verificationStage: "SOURCE_CAPTURE";
  readonly algorithm: typeof SOURCE_INTEGRITY_ALGORITHM;
  readonly sourceDigest: `sha256:${string}`;
  readonly sourceObjectCount: number;
  readonly status: "PENDING";
  readonly verifiedAt: null;
  readonly createdAt: Date;
}

export interface SourceIntegrityEvidenceRepository {
  createPendingSourceCapture(input: {
    readonly operationId: string;
    readonly manifest: SourceIntegrityManifest;
    readonly now: Date;
  }): Promise<{
    readonly record: SourceIntegrityEvidenceRecord;
    readonly created: boolean;
  }>;
}

export class SourceIntegrityEvidencePersistenceError extends Error {
  constructor() {
    super("SOURCE_INTEGRITY_EVIDENCE_PERSISTENCE_FAILED");
    this.name = "SourceIntegrityEvidencePersistenceError";
  }
}

export class SourceIntegrityEvidenceUnavailableError extends Error {
  constructor() {
    super("SOURCE_INTEGRITY_EVIDENCE_UNAVAILABLE");
    this.name = "SourceIntegrityEvidenceUnavailableError";
  }
}

export class SourceIntegrityEvidenceConflictError extends Error {
  constructor() {
    super("SOURCE_INTEGRITY_EVIDENCE_CONFLICT");
    this.name = "SourceIntegrityEvidenceConflictError";
  }
}

export function isSourceIntegrityManifest(
  value: unknown,
): value is SourceIntegrityManifest {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const required = ["algorithm", "aggregateDigest", "objectCount", "totalBytes"];
  if (
    keys.length !== required.length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !required.includes(key) ||
        !descriptors[key]?.enumerable ||
        !Object.hasOwn(descriptors[key] ?? {}, "value"),
    )
  ) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.algorithm === SOURCE_INTEGRITY_ALGORITHM &&
    typeof candidate.aggregateDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(candidate.aggregateDigest) &&
    Number.isSafeInteger(candidate.objectCount) &&
    (candidate.objectCount as number) >= 1 &&
    (candidate.objectCount as number) <= SOURCE_INTEGRITY_LIMITS.maximumInstances &&
    Number.isSafeInteger(candidate.totalBytes) &&
    (candidate.totalBytes as number) >= 1 &&
    (candidate.totalBytes as number) <= SOURCE_INTEGRITY_LIMITS.maximumStudyBytes
  );
}
