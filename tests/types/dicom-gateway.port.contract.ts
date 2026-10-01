import type {
  CheckDicomCapabilityRequest,
  CheckDicomCapabilityResult,
  DicomFrameStream,
  DicomGateway,
  DicomInstanceStream,
  DicomStowResult,
  DicomStudyMetadata,
  DicomStudySummary,
  QueryStudiesRequest,
  RetrieveFrameStreamRequest,
  RetrieveInstanceStreamRequest,
  RetrieveStudyMetadataRequest,
  StoreInstanceStreamRequest,
  VerifyDestinationStudyRequest,
  VerifyDestinationStudyResult,
} from "../../services/api/src/dicom/application/dicom-gateway.port.js";

const emptyStream = () => new ReadableStream<Uint8Array>({ start() {} });

class SyntheticConformingDicomGateway implements DicomGateway {
  async checkCapability(
    _request: CheckDicomCapabilityRequest,
  ): Promise<CheckDicomCapabilityResult> {
    return { operations: ["QIDO_STUDIES"] };
  }

  async queryStudies(_request: QueryStudiesRequest): Promise<readonly DicomStudySummary[]> {
    return [{ studyInstanceUid: "1.2.840.10008.1.2.3", modalitiesInStudy: ["CT"] }];
  }

  async retrieveStudyMetadata(
    request: RetrieveStudyMetadataRequest,
  ): Promise<DicomStudyMetadata> {
    return { studyInstanceUid: request.studyInstanceUid, series: [] };
  }

  async retrieveInstanceStream(
    request: RetrieveInstanceStreamRequest,
  ): Promise<DicomInstanceStream> {
    return {
      body: emptyStream(),
      mediaType: "application/dicom",
      sopInstanceUid: request.sopInstanceUid,
    };
  }

  async retrieveFrameStream(
    request: RetrieveFrameStreamRequest,
  ): Promise<DicomFrameStream> {
    return {
      body: emptyStream(),
      mediaType: "image/jpeg",
      sopInstanceUid: request.sopInstanceUid,
      frameNumber: request.frameNumber,
    };
  }

  async storeInstanceStream(
    request: StoreInstanceStreamRequest,
  ): Promise<DicomStowResult> {
    return {
      httpStatus: 200,
      storedSopInstanceUids: [request.sopInstanceUid],
      warningSopInstanceUids: [],
      failedInstances: [],
    };
  }

  async verifyDestinationStudy(
    request: VerifyDestinationStudyRequest,
  ): Promise<VerifyDestinationStudyResult> {
    return {
      studyInstanceUid: request.studyInstanceUid,
      actualSopInstanceUids: [...request.expectedSopInstanceUids],
    };
  }
}

const gateway: DicomGateway = new SyntheticConformingDicomGateway();
void gateway;

const context = {
  hospitalId: "04000000-0000-4000-8000-000000000001",
  correlationId: "09000000-0000-4000-8000-000000000001",
  signal: new AbortController().signal,
};

const validQuery: QueryStudiesRequest = {
  context,
  localPatientId: "TEST-PATIENT-001",
  limit: 20,
};
void validQuery;

// @ts-expect-error raw PACS endpoints are resolved from server-owned registry state
const queryWithCallerUrl: QueryStudiesRequest = { context, localPatientId: "TEST-PATIENT-001", limit: 20, endpointUrl: "http://untrusted.invalid" };
void queryWithCallerUrl;

// @ts-expect-error PACS credentials are never supplied through the application port
const queryWithCredential: QueryStudiesRequest = { context, localPatientId: "TEST-PATIENT-001", limit: 20, username: "synthetic", password: "synthetic" };
void queryWithCredential;

const validStore: StoreInstanceStreamRequest = {
  context,
  studyInstanceUid: "1.2.840.10008.1.2.3",
  seriesInstanceUid: "1.2.840.10008.1.2.3.1",
  sopInstanceUid: "1.2.840.10008.1.2.3.1.1",
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  body: emptyStream(),
};
void validStore;

// @ts-expect-error a whole-object Buffer bypasses streaming, cancellation and backpressure
const storeWithBuffer: StoreInstanceStreamRequest = { ...validStore, body: new Uint8Array([1, 2, 3]) };
void storeWithBuffer;
