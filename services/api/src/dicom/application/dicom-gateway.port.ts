/** Internal injection token for a server-side DICOMweb adapter. */
export const DICOM_GATEWAY = Symbol("DICOM_GATEWAY");

export type DicomGatewayOperation =
  | "QIDO_STUDIES"
  | "WADO_STUDY_METADATA"
  | "WADO_INSTANCE"
  | "WADO_FRAME"
  | "STOW_INSTANCE"
  | "VERIFY_STUDY";

/**
 * The application must resolve hospitalId from trusted Session/Authorization
 * evidence before calling this port. Endpoint URLs and PACS credentials are
 * deliberately absent; adapters resolve them from server-owned configuration.
 */
export interface DicomGatewayRequestContext {
  readonly hospitalId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
}

export interface QueryStudiesRequest {
  readonly context: DicomGatewayRequestContext;
  /** Hospital-local identifier resolved by the server-side PatientMapping. */
  readonly localPatientId: string;
  readonly studyInstanceUid?: string;
  readonly limit: number;
  readonly offset?: number;
}

export interface DicomStudySummary {
  readonly studyInstanceUid: string;
  readonly studyDate?: string;
  readonly modalitiesInStudy: readonly string[];
  readonly numberOfStudyRelatedInstances?: number;
}

export interface RetrieveStudyMetadataRequest {
  readonly context: DicomGatewayRequestContext;
  readonly studyInstanceUid: string;
  /** Adapter enforces its configured response ceiling; values are not authority. */
  readonly maximumItems: number;
}

export interface DicomInstanceMetadata {
  readonly sopInstanceUid: string;
  readonly sopClassUid: string;
  /** Internal-only PatientID used for the P0 byte-preserving destination gate. */
  readonly patientId: string;
  readonly transferSyntaxUid?: string;
}

export interface DicomSeriesMetadata {
  readonly seriesInstanceUid: string;
  readonly modality?: string;
  readonly instances: readonly DicomInstanceMetadata[];
}

export interface DicomStudyMetadata {
  readonly studyInstanceUid: string;
  readonly series: readonly DicomSeriesMetadata[];
}

export interface RetrieveInstanceStreamRequest {
  readonly context: DicomGatewayRequestContext;
  readonly studyInstanceUid: string;
  readonly seriesInstanceUid: string;
  readonly sopInstanceUid: string;
}

export interface RetrieveFrameStreamRequest extends RetrieveInstanceStreamRequest {
  /** DICOMweb frame numbering is one-based. */
  readonly frameNumber: number;
}

export interface DicomInstanceStream {
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaType: "application/dicom";
  readonly contentLength?: number;
  readonly sopInstanceUid: string;
  readonly transferSyntaxUid?: string;
}

export interface DicomFrameStream {
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaType: "image/jpeg";
  readonly contentLength?: number;
  readonly sopInstanceUid: string;
  /** DICOMweb frame numbering is one-based. */
  readonly frameNumber: number;
}

export interface StoreInstanceStreamRequest {
  readonly context: DicomGatewayRequestContext;
  readonly studyInstanceUid: string;
  readonly seriesInstanceUid: string;
  readonly sopInstanceUid: string;
  readonly sopClassUid: string;
  readonly transferSyntaxUid: string;
  readonly body: ReadableStream<Uint8Array>;
  readonly contentLength?: number;
}

export type DicomStowFailureCode =
  | "PROCESSING_FAILURE"
  | "INVALID_INSTANCE"
  | "UNSUPPORTED_TRANSFER_SYNTAX"
  | "DUPLICATE_INSTANCE"
  | "UNKNOWN";

export interface DicomStowInstanceFailure {
  readonly sopInstanceUid: string;
  readonly code: DicomStowFailureCode;
}

/** Parsed, minimized STOW outcome; raw upstream body and headers are excluded. */
export interface DicomStowResult {
  readonly httpStatus: 200 | 202;
  readonly storedSopInstanceUids: readonly string[];
  readonly warningSopInstanceUids: readonly string[];
  readonly failedInstances: readonly DicomStowInstanceFailure[];
}

export interface VerifyDestinationStudyRequest {
  readonly context: DicomGatewayRequestContext;
  readonly studyInstanceUid: string;
  readonly expectedSopInstanceUids: readonly string[];
  /** Adapter enforces its configured response ceiling. */
  readonly maximumItems: number;
}

export interface VerifyDestinationStudyResult {
  readonly studyInstanceUid: string;
  readonly actualSopInstanceUids: readonly string[];
}

export interface CheckDicomCapabilityRequest {
  readonly context: DicomGatewayRequestContext;
}

export interface CheckDicomCapabilityResult {
  readonly operations: readonly DicomGatewayOperation[];
}

/**
 * Internal transport port only. Callers must authorize each operation before
 * reaching this boundary; implementing this interface does not grant access.
 * Large DICOM objects cross the port as a single-instance stream, never as a
 * study-sized Buffer collection. Adapter conformance is separately tested
 * against the configured Test Orthanc services.
 */
export interface DicomGateway {
  checkCapability(
    request: CheckDicomCapabilityRequest,
  ): Promise<CheckDicomCapabilityResult>;
  queryStudies(request: QueryStudiesRequest): Promise<readonly DicomStudySummary[]>;
  retrieveStudyMetadata(
    request: RetrieveStudyMetadataRequest,
  ): Promise<DicomStudyMetadata>;
  retrieveInstanceStream(
    request: RetrieveInstanceStreamRequest,
  ): Promise<DicomInstanceStream>;
  retrieveFrameStream(
    request: RetrieveFrameStreamRequest,
  ): Promise<DicomFrameStream>;
  storeInstanceStream(request: StoreInstanceStreamRequest): Promise<DicomStowResult>;
  verifyDestinationStudy(
    request: VerifyDestinationStudyRequest,
  ): Promise<VerifyDestinationStudyResult>;
}
