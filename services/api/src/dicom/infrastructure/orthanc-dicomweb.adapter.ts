import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { parseMultipartRelated } from "@ubercode/multipart-stream";
import type { StreamingMultipartPart } from "@ubercode/multipart-stream";
import type {
  CheckDicomCapabilityRequest,
  CheckDicomCapabilityResult,
  DicomFrameStream,
  DicomGateway,
  DicomGatewayOperation,
  DicomGatewayRequestContext,
  DicomInstanceMetadata,
  DicomInstanceStream,
  DicomSeriesMetadata,
  DicomStowFailureCode,
  DicomStowResult,
  DicomStudyMetadata,
  DicomStudySummary,
  QueryStudiesRequest,
  RetrieveFrameStreamRequest,
  RetrieveInstanceStreamRequest,
  RetrieveStudyMetadataRequest,
  StoreInstanceStreamRequest,
  StoreStudyStreamRequest,
  VerifyDestinationStudyRequest,
  VerifyDestinationStudyResult,
} from "../application/dicom-gateway.port.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
  validateContext,
} from "./test-orthanc-endpoint-resolver.js";
import type {
  DicomEndpointResolver,
  ResolvedDicomEndpoint,
} from "./test-orthanc-endpoint-resolver.js";
import { awaitStowSignal, makeStudyStowBody, snapshotStudyStowRequest } from "./study-stow-body.js";
import { snapshotDestinationVerificationRequest } from "./destination-verification-request.js";

const DICOMWEB_ROOT = "/dicom-web/";
const MAX_STUDIES = 100;
const MAX_SERIES = 64;
const MAX_INSTANCES = 2_000;
const QIDO_VERIFICATION_PAGE_SIZE = 100;
const MAX_INSTANCE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_QIDO_JSON_BYTES = 1024 * 1024;
const MAX_PENDING_OPERATIONS = 8;
const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";
const EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

export interface DicomAdapterDeadlines {
  readonly qidoHeadersMs: number;
  readonly qidoIdleMs: number;
  readonly qidoTotalMs: number;
  readonly destinationVerificationTotalMs: number;
  readonly wadoHeadersMs: number;
  readonly wadoIdleMs: number;
  readonly wadoTotalMs: number;
  readonly stowHeadersMs: number;
  readonly stowIdleMs: number;
  readonly stowTotalMs: number;
}

export interface OrthancDicomwebAdapterOptions {
  readonly fetch?: typeof fetch;
  readonly concurrency?: number;
  readonly deadlines?: Partial<DicomAdapterDeadlines>;
}

const DEFAULT_DEADLINES: DicomAdapterDeadlines = {
  qidoHeadersMs: 15_000,
  qidoIdleMs: 60_000,
  qidoTotalMs: 30_000,
  destinationVerificationTotalMs: 300_000,
  wadoHeadersMs: 30_000,
  wadoIdleMs: 60_000,
  wadoTotalMs: 120_000,
  stowHeadersMs: 30_000,
  stowIdleMs: 60_000,
  stowTotalMs: 180_000,
};

export class OrthancDicomwebAdapter implements DicomGateway {
  readonly #resolver: DicomEndpointResolver;
  readonly #fetch: typeof fetch;
  readonly #deadlines: DicomAdapterDeadlines;
  readonly #semaphore: Semaphore;

  constructor(
    resolver: DicomEndpointResolver,
    options: OrthancDicomwebAdapterOptions = {},
  ) {
    this.#resolver = resolver;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#deadlines = { ...DEFAULT_DEADLINES, ...options.deadlines };
    this.#semaphore = new Semaphore(options.concurrency ?? 2, MAX_PENDING_OPERATIONS);
    for (const deadline of Object.values(this.#deadlines)) {
      if (!Number.isSafeInteger(deadline) || deadline < 1) {
        throw new Error("DICOM_CONFIGURATION_INVALID");
      }
    }
  }

  validateEndpoint(
    context: DicomGatewayRequestContext,
    operation: DicomGatewayOperation,
  ): void {
    validateContext(context);
    // Resolve against the server-owned allowlist without making a network call
    // or returning the configured Authorization value to the caller.
    this.#resolve(context, operation);
  }

  async checkCapability(
    request: CheckDicomCapabilityRequest,
  ): Promise<CheckDicomCapabilityResult> {
    validateContext(request.context);
    const candidates: readonly DicomGatewayOperation[] =
      request.context.hospitalId === TEST_HOSPITAL_A_ID
        ? ["QIDO_STUDIES", "WADO_STUDY_METADATA", "WADO_INSTANCE", "WADO_FRAME"]
        : request.context.hospitalId === TEST_HOSPITAL_B_ID
          ? ["QIDO_STUDIES", "STOW_INSTANCE", "STOW_STUDY", "VERIFY_STUDY", "VERIFY_INSTANCE_BYTES"]
          : [];
    const operations = candidates.filter((operation) => {
      try {
        this.#resolve(request.context, operation);
        return true;
      } catch {
        return false;
      }
    });
    return { operations };
  }

  async queryStudies(request: QueryStudiesRequest): Promise<readonly DicomStudySummary[]> {
    validateContext(request.context);
    validatePatientId(request.localPatientId);
    const limit = boundedInteger(request.limit, 1, MAX_STUDIES, "DICOM_REQUEST_INVALID");
    const offset = boundedInteger(request.offset ?? 0, 0, Number.MAX_SAFE_INTEGER, "DICOM_REQUEST_INVALID");
    if (request.studyInstanceUid) validateUid(request.studyInstanceUid);

    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(
      request.context.signal,
      this.#deadlines.qidoHeadersMs,
      this.#deadlines.qidoTotalMs,
    );
    try {
      const endpoint = this.#resolve(request.context, "QIDO_STUDIES");
      const url = endpointUrl(endpoint, "studies");
      url.searchParams.set("PatientID", request.localPatientId);
      if (request.studyInstanceUid) {
        url.searchParams.set("StudyInstanceUID", request.studyInstanceUid);
      }
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      url.searchParams.append("includefield", "00080020");
      url.searchParams.append("includefield", "00080061");
      url.searchParams.append("includefield", "00201208");
      const response = await this.#fetchHeaders(
        url,
        endpoint,
        "application/dicom+json",
        scope,
      );
      requireStatus(response, 200);
      requireMediaType(response, "application/dicom+json");
      const rows = await readJsonArray(response, MAX_QIDO_JSON_BYTES, scope, this.#deadlines.qidoIdleMs);
      if (rows.length > limit || rows.length > MAX_STUDIES) {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      return rows.map(projectStudySummary);
    } catch (error) {
      scope.abort();
      throw sanitizeError(error, "DICOM_QIDO_FAILED");
    } finally {
      scope.dispose();
      release();
    }
  }

  async retrieveStudyMetadata(
    request: RetrieveStudyMetadataRequest,
  ): Promise<DicomStudyMetadata> {
    validateContext(request.context);
    validateUid(request.studyInstanceUid);
    boundedInteger(request.maximumItems, 1, MAX_INSTANCES, "DICOM_REQUEST_INVALID");
    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(
      request.context.signal,
      this.#deadlines.wadoHeadersMs,
      this.#deadlines.wadoTotalMs,
    );
    try {
      const endpoint = this.#resolve(request.context, "WADO_STUDY_METADATA");
      const url = endpointUrl(endpoint, `studies/${segment(request.studyInstanceUid)}/metadata`);
      const response = await this.#fetchHeaders(url, endpoint, "application/dicom+json", scope);
      requireStatus(response, 200);
      requireMediaType(response, "application/dicom+json");
      const rows = await readJsonArray(response, MAX_JSON_BYTES, scope, this.#deadlines.wadoIdleMs);
      if (rows.length > MAX_INSTANCES || rows.length > request.maximumItems) {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      return projectStudyMetadata(request.studyInstanceUid, rows);
    } catch (error) {
      scope.abort();
      throw sanitizeError(error, "DICOM_WADO_FAILED");
    } finally {
      scope.dispose();
      release();
    }
  }

  async retrieveInstanceStream(
    request: RetrieveInstanceStreamRequest,
  ): Promise<DicomInstanceStream> {
    validateInstanceIdentity(request.studyInstanceUid, request.seriesInstanceUid, request.sopInstanceUid);
    return this.#retrieveMultipartInstance(request);
  }

  async retrieveDestinationVerificationInstanceStream(
    input: RetrieveInstanceStreamRequest,
  ): Promise<DicomInstanceStream> {
    const request = snapshotDestinationVerificationRequest(input);
    if (request.context.hospitalId !== TEST_HOSPITAL_B_ID) throw new Error("DICOM_ENDPOINT_DENIED");
    this.#resolve(request.context, "VERIFY_INSTANCE_BYTES");
    return this.#retrieveMultipartInstance(request, "VERIFY_INSTANCE_BYTES");
  }

  async retrieveFrameStream(
    request: RetrieveFrameStreamRequest,
  ): Promise<DicomFrameStream> {
    validateContext(request.context);
    validateInstanceIdentity(request.studyInstanceUid, request.seriesInstanceUid, request.sopInstanceUid);
    const frameNumber = boundedInteger(request.frameNumber, 1, Number.MAX_SAFE_INTEGER, "DICOM_REQUEST_INVALID");
    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(
      request.context.signal,
      this.#deadlines.wadoHeadersMs,
      this.#deadlines.wadoTotalMs,
    );
    try {
      const endpoint = this.#resolve(request.context, "WADO_FRAME");
      const url = endpointUrl(
        endpoint,
        `studies/${segment(request.studyInstanceUid)}/series/${segment(request.seriesInstanceUid)}/instances/${segment(request.sopInstanceUid)}/frames/${frameNumber}/rendered`,
      );
      const response = await this.#fetchHeaders(url, endpoint, "image/jpeg", scope);
      requireStatus(response, 200);
      requireMediaType(response, "image/jpeg");
      const body = boundedWebStream(response.body, MAX_INSTANCE_BYTES, scope, release, this.#deadlines.wadoIdleMs);
      const contentLength = parseContentLength(response.headers.get("content-length"));
      return {
        body,
        mediaType: "image/jpeg",
        ...(contentLength === undefined ? {} : { contentLength }),
        sopInstanceUid: request.sopInstanceUid,
        frameNumber,
      };
    } catch (error) {
      scope.abort();
      scope.dispose();
      release();
      throw sanitizeError(error, "DICOM_WADO_FAILED");
    }
  }

  async storeInstanceStream(
    request: StoreInstanceStreamRequest,
  ): Promise<DicomStowResult> {
    validateContext(request.context);
    validateInstanceIdentity(request.studyInstanceUid, request.seriesInstanceUid, request.sopInstanceUid);
    validateUid(request.sopClassUid);
    validateUid(request.transferSyntaxUid);
    if (
      request.context.hospitalId !== TEST_HOSPITAL_B_ID ||
      request.sopClassUid !== CT_IMAGE_STORAGE ||
      request.transferSyntaxUid !== EXPLICIT_VR_LITTLE_ENDIAN ||
      (request.contentLength !== undefined &&
        (!Number.isSafeInteger(request.contentLength) ||
          request.contentLength < 1 ||
          request.contentLength > MAX_INSTANCE_BYTES))
    ) {
      throw new Error("DICOM_STOW_DENIED");
    }
    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(
      request.context.signal,
      this.#deadlines.stowHeadersMs,
      this.#deadlines.stowTotalMs,
    );
    const boundary = `mediq-${randomUUID()}`;
    const multipart = makeStowBody(
      request.body,
      boundary,
      request.transferSyntaxUid,
      scope,
      request.contentLength,
      this.#deadlines.stowIdleMs,
    );
    let requestStarted = false;
    try {
      const endpoint = this.#resolve(request.context, "STOW_INSTANCE");
      const url = endpointUrl(endpoint, `studies/${segment(request.studyInstanceUid)}`);
      const headers = requestHeaders(endpoint, "application/dicom+json");
      headers.set(
        "content-type",
        `multipart/related; type="application/dicom"; boundary="${boundary}"`,
      );
      const init = {
        method: "POST",
        headers,
        body: multipart,
        signal: scope.signal,
        redirect: "error",
        cache: "no-store",
        duplex: "half",
      } as RequestInit & { duplex: "half" };
      requestStarted = true;
      const responsePromise = this.#fetch(url, init);
      const response = await responsePromise;
      scope.clearHeaderTimer();
      if (response.status !== 200 && response.status !== 202) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("DICOM_STOW_OUTCOME_UNKNOWN");
      }
      requireMediaType(response, "application/dicom+json");
      const rows = await readJsonObject(response, 1024 * 1024, scope, this.#deadlines.stowIdleMs);
      return projectStowResult(request.sopInstanceUid, response.status as 200 | 202, rows);
    } catch (error) {
      scope.abort();
      await multipart.cancel().catch(() => undefined);
      scope.clearHeaderTimer();
      if (requestStarted || isAbortError(error) || isNetworkLikeError(error)) {
        throw new Error("DICOM_STOW_OUTCOME_UNKNOWN");
      }
      throw sanitizeError(error, "DICOM_STOW_FAILED");
    } finally {
      scope.dispose();
      release();
    }
  }

  async storeStudyStream(input: StoreStudyStreamRequest): Promise<DicomStowResult> {
    const request = snapshotStudyStowRequest(input);
    // Resolve/check target before acquiring bodies or initiating the effect.
    const endpoint = this.#resolve(request.context, "STOW_STUDY");
    const url = endpointUrl(endpoint, `studies/${segment(request.studyInstanceUid)}`);
    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(request.context.signal, this.#deadlines.stowHeadersMs, this.#deadlines.stowTotalMs);
    const boundary = `mediq-${randomUUID()}`;
    const multipart = makeStudyStowBody(request, boundary, scope, this.#deadlines.stowIdleMs);
    let started = false;
    let activeResponse: Response | undefined;
    try {
      const headers = requestHeaders(endpoint, "application/dicom+json");
      headers.set("content-type", `multipart/related; type="application/dicom"; boundary="${boundary}"`);
      if (scope.signal.aborted) throw new Error("DICOM_STOW_CANCELLED");
      started = true;
      const fetching = this.#fetch(url, { method: "POST", headers, body: multipart.body,
        signal: scope.signal, redirect: "error", cache: "no-store", duplex: "half" } as RequestInit & { duplex: "half" });
      void fetching.then(response => {
        if (scope.signal.aborted) void response.body?.cancel().catch(() => undefined);
      }, () => undefined);
      const response = await awaitStowSignal(fetching, scope.signal);
      activeResponse = response;
      scope.clearHeaderTimer();
      if (!multipart.isComplete() || (response.status !== 200 && response.status !== 202)) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error("DICOM_STOW_OUTCOME_UNKNOWN");
      }
      requireMediaType(response, "application/dicom+json");
      const rows = await readJsonObject(response, 1024 * 1024, scope, this.#deadlines.stowIdleMs);
      return projectStudyStowResult(request.instances.map(item => item.sopInstanceUid), response.status as 200 | 202, rows);
    } catch (error) {
      scope.abort();
      if (activeResponse?.body && !activeResponse.body.locked) void activeResponse.body.cancel().catch(() => undefined);
      if (started) throw new Error("DICOM_STOW_OUTCOME_UNKNOWN");
      throw sanitizeError(error, "DICOM_STOW_FAILED");
    } finally {
      multipart.close(); scope.dispose(); release();
    }
  }

  async verifyDestinationStudy(
    request: VerifyDestinationStudyRequest,
  ): Promise<VerifyDestinationStudyResult> {
    validateContext(request.context);
    this.#resolve(request.context, "VERIFY_STUDY");
    validateUid(request.studyInstanceUid);
    boundedInteger(request.maximumItems, 1, MAX_INSTANCES, "DICOM_REQUEST_INVALID");
    if (
      !Array.isArray(request.expectedInstances) ||
      request.expectedInstances.length === 0 ||
      request.expectedInstances.length > request.maximumItems
    ) {
      throw new Error("DICOM_REQUEST_INVALID");
    }
    const expectedBySeries = new Map<string, Set<string>>();
    const expectedSops = new Set<string>();
    for (const identity of request.expectedInstances) {
      if (!identity || typeof identity !== "object") {
        throw new Error("DICOM_REQUEST_INVALID");
      }
      validateUid(identity.seriesInstanceUid);
      validateUid(identity.sopInstanceUid);
      if (expectedSops.has(identity.sopInstanceUid)) {
        throw new Error("DICOM_REQUEST_INVALID");
      }
      expectedSops.add(identity.sopInstanceUid);
      let seriesSops = expectedBySeries.get(identity.seriesInstanceUid);
      if (!seriesSops) {
        seriesSops = new Set<string>();
        expectedBySeries.set(identity.seriesInstanceUid, seriesSops);
      }
      seriesSops.add(identity.sopInstanceUid);
    }
    if (expectedBySeries.size > MAX_SERIES) {
      throw new Error("DICOM_REQUEST_INVALID");
    }

    const verificationScope = createRequestScope(
      request.context.signal,
      this.#deadlines.destinationVerificationTotalMs,
      this.#deadlines.destinationVerificationTotalMs,
    );
    const verificationContext = { ...request.context, signal: verificationScope.signal };
    try {
      const expectedSeriesInstanceUids = [...expectedBySeries.keys()].sort();
      const expectedIdentityKeys = [...expectedBySeries].flatMap(([seriesUid, sopUids]) =>
        [...sopUids].map((sopUid) => `${seriesUid}\u0000${sopUid}`),
      ).sort();
      const scanDestination = async () => {
        const seriesRows = await this.#qidoAll(
          verificationContext,
          `studies/${segment(request.studyInstanceUid)}/series`,
          [["includefield", "0020000E"]],
          MAX_SERIES,
        );
        const seenSeries = new Set<string>();
        const seriesUids = seriesRows.map((row) => requiredTagString(row, "0020000E", "UI"));
        for (const seriesUid of seriesUids) {
          if (seenSeries.has(seriesUid)) throw new Error("DICOM_UPSTREAM_INVALID");
          seenSeries.add(seriesUid);
        }
        const actualBySeries = new Map<string, Set<string>>();
        const actualSops = new Set<string>();
        for (const seriesUid of seriesUids) {
          const remainingItems = request.maximumItems - actualSops.size;
          const instanceRows = await this.#qidoAll(
            verificationContext,
            `studies/${segment(request.studyInstanceUid)}/series/${segment(seriesUid)}/instances`,
            [
              ["includefield", "00080018"],
              ["includefield", "0020000D"],
              ["includefield", "0020000E"],
            ],
            remainingItems,
          );
          const seriesSops = new Set<string>();
          for (const instance of instanceRows) {
            const actualStudyUid = requiredTagString(instance, "0020000D", "UI");
            const actualSeriesUid = requiredTagString(instance, "0020000E", "UI");
            const sopUid = requiredTagString(instance, "00080018", "UI");
            if (actualStudyUid !== request.studyInstanceUid || actualSeriesUid !== seriesUid) {
              throw new Error("DICOM_UPSTREAM_INVALID");
            }
            if (actualSops.has(sopUid)) throw new Error("DICOM_UPSTREAM_INVALID");
            actualSops.add(sopUid);
            seriesSops.add(sopUid);
          }
          actualBySeries.set(seriesUid, seriesSops);
        }
        const actualSeriesInstanceUids = [...actualBySeries.keys()].sort();
        const actualSopInstanceUids = [...actualSops].sort();
        const actualIdentityKeys = [...actualBySeries].flatMap(([seriesUid, sopUids]) =>
          [...sopUids].map((sopUid) => `${seriesUid}\u0000${sopUid}`),
        ).sort();
        return {
          actualSeriesInstanceUids,
          actualSopInstanceUids,
          actualIdentityKeys,
          exact: sameStrings(actualSeriesInstanceUids, expectedSeriesInstanceUids) &&
            sameStrings(actualIdentityKeys, expectedIdentityKeys),
        };
      };
      const first = await scanDestination();
      if (!first.exact) {
        return {
          studyInstanceUid: request.studyInstanceUid,
          actualSeriesInstanceUids: first.actualSeriesInstanceUids,
          actualSopInstanceUids: first.actualSopInstanceUids,
          matchesExpected: false,
        };
      }
      const second = await scanDestination();
      const stable =
        sameStrings(first.actualSeriesInstanceUids, second.actualSeriesInstanceUids) &&
        sameStrings(first.actualIdentityKeys, second.actualIdentityKeys);
      return {
        studyInstanceUid: request.studyInstanceUid,
        actualSeriesInstanceUids: second.actualSeriesInstanceUids,
        actualSopInstanceUids: second.actualSopInstanceUids,
        matchesExpected: stable && second.exact,
      };
    } catch (error) {
      verificationScope.abort();
      throw sanitizeError(error, "DICOM_VERIFICATION_UNAVAILABLE");
    } finally {
      verificationScope.dispose();
    }
  }

  async #retrieveMultipartInstance(
    request: RetrieveInstanceStreamRequest,
    operation: "WADO_INSTANCE" | "VERIFY_INSTANCE_BYTES" = "WADO_INSTANCE",
  ): Promise<DicomInstanceStream> {
    validateContext(request.context);
    const release = await this.#semaphore.acquire(request.context.signal);
    const scope = createRequestScope(
      request.context.signal,
      this.#deadlines.wadoHeadersMs,
      this.#deadlines.wadoTotalMs,
    );
    let iterator: AsyncGenerator<StreamingMultipartPart, void, void> | undefined;
    try {
      const endpoint = this.#resolve(request.context, operation);
      const url = endpointUrl(
        endpoint,
        `studies/${segment(request.studyInstanceUid)}/series/${segment(request.seriesInstanceUid)}/instances/${segment(request.sopInstanceUid)}`,
      );
      const response = await this.#fetchHeaders(
        url,
        endpoint,
        `multipart/related; type="application/dicom"; transfer-syntax=${EXPLICIT_VR_LITTLE_ENDIAN}`,
        scope,
      );
      requireStatus(response, 200);
      const outerType = response.headers.get("content-type") ?? "";
      if (!/^multipart\/related\s*;/i.test(outerType) || !/\btype\s*=\s*"?application\/dicom"?/i.test(outerType)) {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      const transferSyntax = contentTypeParameter(outerType, "transfer-syntax");
      if (transferSyntax && transferSyntax !== EXPLICIT_VR_LITTLE_ENDIAN) {
        throw new Error("DICOM_UNSUPPORTED_TRANSFER_SYNTAX");
      }
      if (!response.body) throw new Error("DICOM_UPSTREAM_INVALID");
      iterator = parseMultipartRelated(response, {
        signal: scope.signal,
        idleTimeoutMs: this.#deadlines.wadoIdleMs,
        totalTimeoutMs: this.#deadlines.wadoTotalMs,
        // DEC-014: the parser's optional maxPartBytes counter ignores write
        // backpressure. Enforce the same cap in our awaited body read below.
        maxParts: 1,
        maxHeadersPerPart: 16,
        maxHeaderBytesPerPart: 16 * 1024,
        logger: () => undefined,
      });
      const first = await iterator.next();
      if (first.done || first.value.contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/dicom") {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      const partTransferSyntax = contentTypeParameter(first.value.contentType, "transfer-syntax");
      const effectiveTransferSyntax = partTransferSyntax ?? transferSyntax ?? EXPLICIT_VR_LITTLE_ENDIAN;
      if (effectiveTransferSyntax && effectiveTransferSyntax !== EXPLICIT_VR_LITTLE_ENDIAN) {
        first.value.body.destroy();
        throw new Error("DICOM_UNSUPPORTED_TRANSFER_SYNTAX");
      }
      const body = nodeReadableToWebStream(first.value.body, iterator, scope, release);
      const contentLength =
        first.value.contentLength !== undefined &&
        first.value.contentLength >= 0 &&
        first.value.contentLength <= MAX_INSTANCE_BYTES
          ? first.value.contentLength
          : undefined;
      return {
        body,
        mediaType: "application/dicom",
        ...(contentLength === undefined ? {} : { contentLength }),
        sopInstanceUid: request.sopInstanceUid,
        ...(effectiveTransferSyntax === undefined ? {} : { transferSyntaxUid: effectiveTransferSyntax }),
      };
    } catch (error) {
      scope.abort();
      if (iterator) await iterator.return().catch(() => undefined);
      scope.dispose();
      release();
      throw sanitizeError(error, "DICOM_WADO_FAILED");
    }
  }

  async #qidoArray(
    context: QueryStudiesRequest["context"],
    path: string,
    fields: readonly (readonly [string, string])[],
    limit: number,
    offset: number,
  ): Promise<{
    readonly rows: readonly Record<string, unknown>[];
    readonly remainingResults?: number;
  }> {
    const release = await this.#semaphore.acquire(context.signal);
    const scope = createRequestScope(context.signal, this.#deadlines.qidoHeadersMs, this.#deadlines.qidoTotalMs);
    try {
      const endpoint = this.#resolve(context, "QIDO_STUDIES");
      const url = endpointUrl(endpoint, path);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      for (const [name, value] of fields) url.searchParams.append(name, value);
      const response = await this.#fetchHeaders(url, endpoint, "application/dicom+json", scope);
      requireStatus(response, 200);
      requireMediaType(response, "application/dicom+json");
      const rows = await readJsonArray(response, MAX_QIDO_JSON_BYTES, scope, this.#deadlines.qidoIdleMs);
      if (rows.length > limit) throw new Error("DICOM_UPSTREAM_INVALID");
      const remainingResults = qidoRemainingResults(response.headers.get("warning"));
      return {
        rows,
        ...(remainingResults === undefined ? {} : { remainingResults }),
      };
    } catch (error) {
      scope.abort();
      throw sanitizeError(error, "DICOM_QIDO_FAILED");
    } finally {
      scope.dispose();
      release();
    }
  }

  async #qidoAll(
    context: QueryStudiesRequest["context"],
    path: string,
    fields: readonly (readonly [string, string])[],
    maximumItems: number,
  ): Promise<readonly Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    let expectedRemainingBeforePage: number | undefined;
    while (true) {
      const remaining = maximumItems - rows.length;
      const limit = Math.min(QIDO_VERIFICATION_PAGE_SIZE, remaining + 1);
      const page = await this.#qidoArray(context, path, fields, limit, offset);
      const remainingResults = page.remainingResults ?? 0;
      if (
        expectedRemainingBeforePage !== undefined &&
        page.rows.length + remainingResults !== expectedRemainingBeforePage
      ) {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      if (page.rows.length > remaining) throw new Error("DICOM_UPSTREAM_INVALID");
      rows.push(...page.rows);

      if (remainingResults === 0 && page.rows.length < limit) return rows;
      if (page.rows.length === 0) throw new Error("DICOM_UPSTREAM_INVALID");
      offset += page.rows.length;
      if (!Number.isSafeInteger(offset) || offset > MAX_INSTANCES + 1) {
        throw new Error("DICOM_UPSTREAM_INVALID");
      }
      expectedRemainingBeforePage = remainingResults;
    }
  }

  #resolve(
    context: QueryStudiesRequest["context"],
    operation: DicomGatewayOperation,
  ): ResolvedDicomEndpoint {
    return this.#resolver.resolve(context, operation);
  }

  async #fetchHeaders(
    url: URL,
    endpoint: ResolvedDicomEndpoint,
    accept: string,
    scope: RequestScope,
  ): Promise<Response> {
    const responsePromise = this.#fetch(url, {
      method: "GET",
      headers: requestHeaders(endpoint, accept),
      signal: scope.signal,
      redirect: "error",
      cache: "no-store",
    });
    scope.setHeaderTimer(scope.headerTimeoutMs);
    const response = await responsePromise;
    scope.clearHeaderTimer();
    return response;
  }
}

class Semaphore {
  readonly #limit: number;
  readonly #maxPending: number;
  #active = 0;
  readonly #queue: Array<{
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    onAbort: () => void;
  }> = [];

  constructor(limit: number, maxPending: number) {
    this.#limit = boundedInteger(limit, 1, 2, "DICOM_CONFIGURATION_INVALID");
    this.#maxPending = maxPending;
  }

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new Error("DICOM_OPERATION_ABORTED"));
    if (this.#active < this.#limit) {
      this.#active += 1;
      return Promise.resolve(this.#makeRelease());
    }
    if (this.#queue.length >= this.#maxPending) {
      return Promise.reject(new Error("DICOM_CAPACITY_EXCEEDED"));
    }
    return new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.#queue.indexOf(item);
          if (index >= 0) this.#queue.splice(index, 1);
          reject(new Error("DICOM_OPERATION_ABORTED"));
        },
      };
      signal.addEventListener("abort", item.onAbort, { once: true });
      this.#queue.push(item);
    });
  }

  #makeRelease(): () => void {
    let used = false;
    return () => {
      if (used) return;
      used = true;
      const next = this.#queue.shift();
      if (!next) {
        this.#active -= 1;
        return;
      }
      next.signal.removeEventListener("abort", next.onAbort);
      if (next.signal.aborted) {
        next.reject(new Error("DICOM_OPERATION_ABORTED"));
        this.#makeRelease()();
        return;
      }
      next.resolve(this.#makeRelease());
    };
  }
}

interface RequestScope {
  readonly signal: AbortSignal;
  readonly headerTimeoutMs: number;
  abort(): void;
  setHeaderTimer(timeoutMs: number): void;
  clearHeaderTimer(): void;
  dispose(): void;
}

function createRequestScope(
  parent: AbortSignal,
  headerTimeoutMs: number,
  totalTimeoutMs: number,
): RequestScope {
  const controller = new AbortController();
  let headerTimer: ReturnType<typeof setTimeout> | undefined;
  const totalTimer = setTimeout(() => controller.abort(new Error("deadline")), totalTimeoutMs);
  const onAbort = () => controller.abort(new Error("cancelled"));
  if (parent.aborted) onAbort();
  else parent.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    headerTimeoutMs,
    abort: () => controller.abort(new Error("cancelled")),
    setHeaderTimer(timeoutMs) {
      if (headerTimer) clearTimeout(headerTimer);
      headerTimer = setTimeout(() => controller.abort(new Error("header-deadline")), timeoutMs);
    },
    clearHeaderTimer() {
      if (headerTimer) clearTimeout(headerTimer);
      headerTimer = undefined;
    },
    dispose() {
      clearTimeout(totalTimer);
      if (headerTimer) clearTimeout(headerTimer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

function requestHeaders(endpoint: ResolvedDicomEndpoint, accept: string): Headers {
  return new Headers({
    accept,
    authorization: endpoint.authorization,
  });
}

function endpointUrl(endpoint: ResolvedDicomEndpoint, path: string): URL {
  const base = endpoint.origin;
  if (
    base.protocol !== "https:" ||
    !["orthanc-a", "orthanc-b"].includes(base.hostname) ||
    base.port !== "8042" ||
    base.pathname !== DICOMWEB_ROOT ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("DICOM_CONFIGURATION_INVALID");
  }
  return new URL(path.replace(/^\/+/, ""), base);
}

function segment(uid: string): string {
  validateUid(uid);
  return encodeURIComponent(uid);
}

function validateUid(uid: string): void {
  if (
    typeof uid !== "string" ||
    !isValidUid(uid)
  ) {
    throw new Error("DICOM_REQUEST_INVALID");
  }
}

function isValidUid(uid: string): boolean {
  return (
    uid.length <= 64 &&
    /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/.test(uid)
  );
}

function qidoRemainingResults(warningHeader: string | null): number | undefined {
  if (warningHeader === null || warningHeader.trim() === "") return undefined;
  const warnings = warningHeader.trim().split(/,\s*(?=299\s)/i);
  let remaining: number | undefined;
  for (const warning of warnings) {
    const match = /^299\s+.*?:\s*There are\s+([1-9][0-9]*)\s+additional results that can be requested\s*$/i.exec(warning.trim());
    if (!match) throw new Error("DICOM_UPSTREAM_INVALID");
    const parsed = Number(match[1]);
    if (!Number.isSafeInteger(parsed) || (remaining !== undefined && remaining !== parsed)) {
      throw new Error("DICOM_UPSTREAM_INVALID");
    }
    remaining = parsed;
  }
  return remaining;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validatePatientId(value: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("DICOM_REQUEST_INVALID");
  }
}

function validateInstanceIdentity(studyUid: string, seriesUid: string, sopUid: string): void {
  validateUid(studyUid);
  validateUid(seriesUid);
  validateUid(sopUid);
}

function boundedInteger(value: number, min: number, max: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

function requireStatus(response: Response, allowed: number | readonly number[]): void {
  const statuses = typeof allowed === "number" ? [allowed] : allowed;
  if (!statuses.includes(response.status)) throw new Error("DICOM_UPSTREAM_STATUS");
}

function requireMediaType(response: Response, expected: string): void {
  const actual = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (actual !== expected.toLowerCase()) throw new Error("DICOM_UPSTREAM_MEDIA_TYPE");
}

async function readJsonArray(
  response: Response,
  maxBytes: number,
  scope: RequestScope,
  idleTimeoutMs: number,
): Promise<readonly Record<string, unknown>[]> {
  const value = await readJson(response, maxBytes, scope, idleTimeoutMs);
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error("DICOM_UPSTREAM_INVALID");
  }
  return value as readonly Record<string, unknown>[];
}

async function readJsonObject(
  response: Response,
  maxBytes: number,
  scope: RequestScope,
  idleTimeoutMs: number,
): Promise<Record<string, unknown>> {
  const value = await readJson(response, maxBytes, scope, idleTimeoutMs);
  if (!isRecord(value)) throw new Error("DICOM_UPSTREAM_INVALID");
  return value;
}

async function readJson(
  response: Response,
  maxBytes: number,
  scope: RequestScope,
  idleTimeoutMs: number,
): Promise<unknown> {
  if (!response.body) throw new Error("DICOM_UPSTREAM_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abortReader = () => void reader.cancel().catch(() => undefined);
  scope.signal.addEventListener("abort", abortReader, { once: true });
  try {
    while (true) {
      if (scope.signal.aborted) throw new Error("DICOM_OPERATION_ABORTED");
      const result = await readWithIdle(reader, scope, idleTimeoutMs);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("DICOM_UPSTREAM_TOO_LARGE");
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error("DICOM_UPSTREAM_INVALID");
  } finally {
    scope.signal.removeEventListener("abort", abortReader);
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tag(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function readWithIdle<T>(
  reader: { read(): Promise<T> },
  scope: RequestScope,
  idleTimeoutMs: number,
): Promise<T> {
  if (scope.signal.aborted) return Promise.reject(new Error("DICOM_OPERATION_ABORTED"));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      scope.signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("DICOM_OPERATION_ABORTED"));
    };
    const timer = setTimeout(() => {
      cleanup();
      scope.abort();
      reject(new Error("DICOM_UPSTREAM_TIMEOUT"));
    }, idleTimeoutMs);
    scope.signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (value) => {
        cleanup();
        resolve(value);
      },
      () => {
        cleanup();
        reject(new Error("DICOM_UPSTREAM_INVALID"));
      },
    );
  });
}

function requiredTagString(record: Record<string, unknown>, key: string, vr: string): string {
  const item = tag(record, key);
  if (!item || item.vr !== vr || !Array.isArray(item.Value) || item.Value.length !== 1 || typeof item.Value[0] !== "string") {
    throw new Error("DICOM_UPSTREAM_INVALID");
  }
  const value = item.Value[0];
    if (vr === "UI" && !isValidUid(value)) throw new Error("DICOM_UPSTREAM_INVALID");
  else if (value.length > 64 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("DICOM_UPSTREAM_INVALID");
  return value;
}

function projectStudySummary(record: Record<string, unknown>): DicomStudySummary {
  const studyInstanceUid = requiredTagString(record, "0020000D", "UI");
  const result: {
    studyInstanceUid: string;
    studyDate?: string;
    modalitiesInStudy: readonly string[];
    numberOfStudyRelatedInstances?: number;
  } = {
    studyInstanceUid,
    modalitiesInStudy: [],
  };
  const date = tag(record, "00080020");
  if (date !== undefined) {
    if (date.vr !== "DA" || !Array.isArray(date.Value) || date.Value.length !== 1 || typeof date.Value[0] !== "string" || !/^\d{8}$/.test(date.Value[0])) {
      throw new Error("DICOM_UPSTREAM_INVALID");
    }
    result.studyDate = date.Value[0];
  }
  const modalities = tag(record, "00080061");
  if (modalities !== undefined) {
    if (modalities.vr !== "CS" || !Array.isArray(modalities.Value) || modalities.Value.length > 32 || modalities.Value.some((v) => typeof v !== "string" || !/^[A-Z0-9_]{1,16}$/.test(v))) {
      throw new Error("DICOM_UPSTREAM_INVALID");
    }
    result.modalitiesInStudy = [...new Set(modalities.Value as string[])];
  }
  const count = tag(record, "00201208");
  if (count !== undefined) {
    if (count.vr !== "IS" || !Array.isArray(count.Value) || count.Value.length !== 1) throw new Error("DICOM_UPSTREAM_INVALID");
    if (typeof count.Value[0] === "string" && !/^\d+$/.test(count.Value[0])) throw new Error("DICOM_UPSTREAM_INVALID");
    const parsed = typeof count.Value[0] === "number" ? count.Value[0] : Number(count.Value[0]);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_INSTANCES) throw new Error("DICOM_UPSTREAM_INVALID");
    result.numberOfStudyRelatedInstances = parsed;
  }
  return result;
}

function projectStudyMetadata(studyUid: string, rows: readonly Record<string, unknown>[]): DicomStudyMetadata {
  const series = new Map<string, { modality?: string; instances: DicomInstanceMetadata[] }>();
  const seenSop = new Set<string>();
  for (const row of rows) {
    const rowStudyUid = requiredTagString(row, "0020000D", "UI");
    const seriesUid = requiredTagString(row, "0020000E", "UI");
    const sopUid = requiredTagString(row, "00080018", "UI");
    const sopClassUid = requiredTagString(row, "00080016", "UI");
    if (rowStudyUid !== studyUid || seenSop.has(sopUid)) {
      throw new Error("DICOM_UPSTREAM_INVALID");
    }
    seenSop.add(sopUid);
    let group = series.get(seriesUid);
    if (!group) {
      group = { instances: [] };
      const modality = tag(row, "00080060");
      if (modality !== undefined) {
        if (modality.vr !== "CS" || !Array.isArray(modality.Value) || modality.Value.length !== 1 || typeof modality.Value[0] !== "string" || !/^[A-Z0-9_]{1,16}$/.test(modality.Value[0])) {
          throw new Error("DICOM_UPSTREAM_INVALID");
        }
        group.modality = modality.Value[0];
      }
      series.set(seriesUid, group);
      if (series.size > MAX_SERIES) throw new Error("DICOM_UPSTREAM_INVALID");
    }
    const instance: { sopInstanceUid: string; sopClassUid: string; patientId: string; transferSyntaxUid?: string } = {
      sopInstanceUid: sopUid,
      sopClassUid,
      patientId: requiredTagString(row, "00100020", "LO"),
    };
    const syntax = tag(row, "00020010");
    if (syntax !== undefined) instance.transferSyntaxUid = requiredTagString(row, "00020010", "UI");
    group.instances.push(instance);
  }
  const resultSeries: DicomSeriesMetadata[] = [...series.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seriesInstanceUid, value]) => ({
      seriesInstanceUid,
      ...(value.modality === undefined ? {} : { modality: value.modality }),
      instances: value.instances.sort((a, b) => a.sopInstanceUid.localeCompare(b.sopInstanceUid)),
    }));
  return { studyInstanceUid: studyUid, series: resultSeries };
}

function contentTypeParameter(value: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, "i").exec(value);
  return (match?.[1] ?? match?.[2])?.trim();
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_INSTANCE_BYTES ? parsed : undefined;
}

function nodeReadableToWebStream(
  nodeStream: Readable,
  iterator: AsyncGenerator<StreamingMultipartPart, void, void>,
  scope: RequestScope,
  release: () => void,
): ReadableStream<Uint8Array> {
  // Pull directly: a flowing toWeb bridge can enqueue after parser cancellation
  // closes its controller. Async iteration also preserves parser backpressure.
  const source = nodeStream[Symbol.asyncIterator]();
  let receivedBytes = 0;
  const iteratorAdvance = iterator.next().then((extra) => {
    if (!extra.done) {
      extra.value.body.destroy();
      throw new Error("DICOM_UPSTREAM_INVALID");
    }
    return extra;
  });
  // The multipart parser reports failures from the outer WADO response through
  // its iterator. A part stream can remain open while that happens, so race
  // each body read against the iterator's terminal failure instead of waiting
  // indefinitely for the part stream to close.
  const iteratorFailure = iteratorAdvance.then(
    () => new Promise<never>(() => undefined),
    (error: unknown) => Promise.reject(error),
  );
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    scope.dispose();
    release();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (scope.signal.aborted) throw new Error("DICOM_OPERATION_ABORTED");
        const next = await Promise.race([
          source.next().then((result) => ({ kind: "body" as const, result })),
          iteratorFailure,
        ]);
        if (!next.result.done) {
          receivedBytes += next.result.value!.byteLength;
          if (receivedBytes > MAX_INSTANCE_BYTES) throw new Error("DICOM_UPSTREAM_TOO_LARGE");
          controller.enqueue(next.result.value!);
          return;
        }
        await iteratorAdvance;
        finish();
        controller.close();
      } catch {
        scope.abort();
        nodeStream.destroy();
        await source.return?.().catch(() => undefined);
        await iterator.return().catch(() => undefined);
        finish();
        controller.error(new Error("DICOM_WADO_STREAM_FAILED"));
      }
    },
    async cancel() {
      scope.abort();
      nodeStream.destroy();
      await source.return?.().catch(() => undefined);
      await iterator.return().catch(() => undefined);
      finish();
    },
  });
}

function boundedWebStream(
  source: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  scope: RequestScope,
  release: () => void,
  idleTimeoutMs: number,
): ReadableStream<Uint8Array> {
  if (!source) throw new Error("DICOM_UPSTREAM_INVALID");
  const reader = source.getReader();
  let size = 0;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    scope.dispose();
    release();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (scope.signal.aborted) throw new Error("DICOM_OPERATION_ABORTED");
        const item = await readWithIdle(reader, scope, idleTimeoutMs);
        if (item.done) {
          finish();
          controller.close();
          return;
        }
        size += item.value.byteLength;
        if (size > maximumBytes) throw new Error("DICOM_UPSTREAM_TOO_LARGE");
        controller.enqueue(item.value);
      } catch {
        scope.abort();
        await reader.cancel().catch(() => undefined);
        finish();
        controller.error(new Error("DICOM_WADO_STREAM_FAILED"));
      }
    },
    async cancel() {
      scope.abort();
      await reader.cancel().catch(() => undefined);
      finish();
    },
  });
}

function makeStowBody(
  input: ReadableStream<Uint8Array>,
  boundary: string,
  transferSyntax: string,
  scope: RequestScope,
  contentLength: number | undefined,
  idleTimeoutMs: number,
): ReadableStream<Uint8Array> {
  const reader = input.getReader();
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=${transferSyntax}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  let state: "prefix" | "content" | "suffix" | "done" = "prefix";
  let size = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (scope.signal.aborted) {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error("DICOM_STOW_CANCELLED"));
        return;
      }
      if (state === "prefix") {
        state = "content";
        controller.enqueue(prefix);
        return;
      }
      if (state === "content") {
        const item = await readWithIdle(reader, scope, idleTimeoutMs);
        if (item.done) {
          if (size < 1 || (contentLength !== undefined && size !== contentLength)) {
            controller.error(new Error("DICOM_STOW_BODY_INVALID"));
            return;
          }
          state = "suffix";
        } else {
          size += item.value.byteLength;
          if (size > MAX_INSTANCE_BYTES || (contentLength !== undefined && size > contentLength)) {
            await reader.cancel().catch(() => undefined);
            controller.error(new Error("DICOM_STOW_BODY_INVALID"));
            return;
          }
          controller.enqueue(item.value);
          return;
        }
      }
      if (state === "suffix") {
        state = "done";
        controller.enqueue(suffix);
        return;
      }
      scope.setHeaderTimer(scope.headerTimeoutMs);
      controller.close();
    },
    async cancel(reason) {
      scope.abort();
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

function projectStowResult(
  expectedSopUid: string,
  httpStatus: 200 | 202,
  response: Record<string, unknown>,
): DicomStowResult {
  const succeeded = sequenceSopUids(response, "00081199");
  const failedSequence = sequenceItems(response, "00081198");
  const failedInstances = failedSequence.map((item) => ({
    sopInstanceUid: requiredTagString(item, "00081155", "UI"),
    code: mapStowFailure(item) as DicomStowFailureCode,
  }));
  if (
    succeeded.some((uid) => uid !== expectedSopUid) ||
    failedInstances.some((entry) => entry.sopInstanceUid !== expectedSopUid)
  ) {
    throw new Error("DICOM_UPSTREAM_INVALID");
  }
  if (succeeded.includes(expectedSopUid) && failedInstances.some((entry) => entry.sopInstanceUid === expectedSopUid)) {
    throw new Error("DICOM_UPSTREAM_INVALID");
  }
  if (succeeded.length === 0 && failedInstances.length === 0) throw new Error("DICOM_UPSTREAM_INVALID");
  const warnings = succeeded.filter((uid) => sequenceItemHasTag(response, "00081199", uid, "00081196"));
  const stored = succeeded.filter((uid) => uid === expectedSopUid && !warnings.includes(uid));
  return {
    httpStatus,
    storedSopInstanceUids: stored,
    warningSopInstanceUids: warnings.filter((uid) => uid === expectedSopUid),
    failedInstances: failedInstances.filter((entry) => entry.sopInstanceUid === expectedSopUid),
  };
}

function projectStudyStowResult(expected: readonly string[], status: 200 | 202,
  response: Record<string, unknown>): DicomStowResult {
  const succeeded = sequenceItems(response, "00081199");
  const failed = sequenceItems(response, "00081198");
  const expectedSet = new Set(expected), seen = new Set<string>();
  const stored: string[] = [], warning: string[] = [];
  const failedInstances: { sopInstanceUid: string; code: DicomStowFailureCode }[] = [];
  for (const item of [...succeeded, ...failed]) {
    const uid = requiredTagString(item, "00081155", "UI");
    if (!expectedSet.has(uid) || seen.has(uid)) throw new Error("DICOM_UPSTREAM_INVALID");
    seen.add(uid);
  }
  if (seen.size !== expectedSet.size) throw new Error("DICOM_UPSTREAM_INVALID");
  for (const item of succeeded) {
    const uid = requiredTagString(item, "00081155", "UI");
    (tag(item, "00081196") === undefined ? stored : warning).push(uid);
  }
  for (const item of failed) failedInstances.push({ sopInstanceUid: requiredTagString(item, "00081155", "UI"), code: mapStowFailure(item) });
  return { httpStatus: status, storedSopInstanceUids: stored, warningSopInstanceUids: warning, failedInstances };
}

function sequenceItems(record: Record<string, unknown>, key: string): readonly Record<string, unknown>[] {
  const item = tag(record, key);
  if (!item) return [];
  if (item.vr !== "SQ" || !Array.isArray(item.Value) || item.Value.some((child) => !isRecord(child))) {
    throw new Error("DICOM_UPSTREAM_INVALID");
  }
  return item.Value as readonly Record<string, unknown>[];
}

function sequenceSopUids(record: Record<string, unknown>, key: string): readonly string[] {
  return sequenceItems(record, key).map((item) => requiredTagString(item, "00081155", "UI"));
}

function sequenceItemHasTag(
  record: Record<string, unknown>,
  sequenceKey: string,
  sopUid: string,
  targetTag: string,
): boolean {
  const item = sequenceItems(record, sequenceKey).find((entry) => {
    try {
      return requiredTagString(entry, "00081155", "UI") === sopUid;
    } catch {
      return false;
    }
  });
  return item !== undefined && tag(item, targetTag) !== undefined;
}

function mapStowFailure(item: Record<string, unknown>): DicomStowFailureCode {
  const reasonTag = tag(item, "00081197");
  const reason = reasonTag?.Value;
  if (!Array.isArray(reason) || reason.length !== 1) return "UNKNOWN";
  const value = Number(reason[0]);
  if (value === 0x0111) return "DUPLICATE_INSTANCE";
  if (value === 0x0122) return "UNSUPPORTED_TRANSFER_SYNTAX";
  if (value === 0x0110) return "PROCESSING_FAILURE";
  if (Number.isSafeInteger(value)) return "INVALID_INSTANCE";
  return "UNKNOWN";
}

function sanitizeError(error: unknown, fallback: string): Error {
  if (error instanceof Error && /^DICOM_[A-Z0-9_]+$/.test(error.message)) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new Error("DICOM_OPERATION_ABORTED");
  return new Error(fallback);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNetworkLikeError(error: unknown): boolean {
  return !(error instanceof Error && /^DICOM_[A-Z0-9_]+$/.test(error.message));
}
