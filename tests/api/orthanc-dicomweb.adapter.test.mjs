import { describe, expect, it, vi } from "vitest";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
  TestOrthancEndpointResolver,
} from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";

const STUDY = "2.25.139413224574575433810421680499794275977";
const SERIES = "2.25.292708517942326725925199680158042783549";
const SOP = "2.25.58285762708309761298233122140892576399";
const SOP_2 = "2.25.174938644979598695786464657171608142542";
const SOP_CLASS = "1.2.840.10008.5.1.4.1.1.2";
const TS = "1.2.840.10008.1.2.1";

function context(hospitalId = TEST_HOSPITAL_A_ID, signal = new AbortController().signal) {
  return { hospitalId, correlationId: "dcm-002-test", signal };
}

function resolver() {
  return {
    resolve: vi.fn((ctx, operation) => {
      const a = ctx.hospitalId === TEST_HOSPITAL_A_ID;
      const allowed = a
        ? ["QIDO_STUDIES", "WADO_STUDY_METADATA", "WADO_INSTANCE", "WADO_FRAME"]
        : ["QIDO_STUDIES", "STOW_INSTANCE", "VERIFY_STUDY"];
      if (!allowed.includes(operation)) throw new Error("DICOM_ENDPOINT_DENIED");
      return {
        origin: new URL(`https://${a ? "orthanc-a" : "orthanc-b"}:8042/dicom-web/`),
        authorization: "Basic synthetic-test-credential",
      };
    }),
  };
}

function testConfig(overrides = {}) {
  return {
    runtimeProfile: "container",
    environment: "test",
    orthancAUrl: "https://orthanc-a:8042",
    orthancAUsername: "synthetic-a-user",
    orthancAPassword: "synthetic-a-password",
    orthancBUrl: "https://orthanc-b:8042",
    orthancBUsername: "synthetic-b-user",
    orthancBPassword: "synthetic-b-password",
    ...overrides,
  };
}

function adapter(fetchImpl, options = {}) {
  return new OrthancDicomwebAdapter(resolver(), {
    fetch: fetchImpl,
    deadlines: {
      qidoHeadersMs: 200,
      qidoTotalMs: 500,
      wadoHeadersMs: 200,
      wadoIdleMs: 200,
      wadoTotalMs: 500,
      stowHeadersMs: 200,
      stowIdleMs: 200,
      stowTotalMs: 500,
    },
    ...options,
  });
}

function dicomJson(data, type = "application/dicom+json", extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": type, ...extraHeaders },
  });
}

function tag(vr, ...values) {
  return { vr, Value: values };
}

function expectedInstance(sopInstanceUid, seriesInstanceUid = SERIES) {
  return { seriesInstanceUid, sopInstanceUid };
}

function destinationInstanceRow(sopInstanceUid, seriesInstanceUid = SERIES, studyInstanceUid = STUDY) {
  return {
    "00080018": tag("UI", sopInstanceUid),
    "0020000D": tag("UI", studyInstanceUid),
    "0020000E": tag("UI", seriesInstanceUid),
  };
}

function wadoMetadataRow(sopInstanceUid, patientId = "TEST-PATIENT-007") {
  return {
    "0020000D": tag("UI", STUDY),
    "0020000E": tag("UI", SERIES),
    "00080018": tag("UI", sopInstanceUid),
    "00080016": tag("UI", SOP_CLASS),
    "00080060": tag("CS", "CT"),
    "00100020": tag("LO", patientId),
    "00100010": tag("PN", "SYNTHETIC^DO-NOT-PROJECT"),
  };
}

function multipart(parts, { boundary = "test-boundary", close = true, outerType = "application/dicom" } = {}) {
  const encoder = new TextEncoder();
  const chunks = [];
  for (const part of parts) {
    chunks.push(encoder.encode(`--${boundary}\r\nContent-Type: ${part.type ?? "application/dicom"}; transfer-syntax=${TS}\r\n\r\n`));
    chunks.push(part.bytes ?? new Uint8Array([1, 2, 3, 4]));
    chunks.push(encoder.encode("\r\n"));
  }
  if (close) chunks.push(encoder.encode(`--${boundary}--\r\n`));
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": `multipart/related; type="${outerType}"; boundary="${boundary}"` },
  });
}

async function streamBytes(stream) {
  const reader = stream.getReader();
  const chunks = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

describe("OrthancDicomwebAdapter DCM-002 synthetic transport contract", () => {
  it("limits the endpoint resolver to exact development/test A/B authorities and roles", () => {
    const endpointResolver = new TestOrthancEndpointResolver(testConfig());
    expect(endpointResolver.resolve(context(TEST_HOSPITAL_A_ID), "QIDO_STUDIES").origin.href).toBe("https://orthanc-a:8042/dicom-web/");
    expect(endpointResolver.resolve(context(TEST_HOSPITAL_B_ID), "STOW_INSTANCE").origin.href).toBe("https://orthanc-b:8042/dicom-web/");
    expect(() => endpointResolver.resolve(context(TEST_HOSPITAL_A_ID), "STOW_INSTANCE")).toThrow("DICOM_ENDPOINT_DENIED");
    expect(() => new TestOrthancEndpointResolver(testConfig({ environment: "production" }))).toThrow("DICOM_CONFIGURATION_DENIED");
    const invalidResolver = new TestOrthancEndpointResolver(testConfig({ orthancAUrl: "https://127.0.0.1:8042" }));
    expect(() => invalidResolver.resolve(context(TEST_HOSPITAL_A_ID), "QIDO_STUDIES")).toThrow("DICOM_CONFIGURATION_INVALID");
  });

  it("rejects unsafe source origins before any upstream fetch", async () => {
    for (const origin of [
      "http://orthanc-a:8042",
      "https://untrusted.invalid:8042",
      "https://orthanc-a:8443",
      "https://user@orthanc-a:8042",
      "https://orthanc-a:8042/dicom-web",
      "https://orthanc-a:8042?target=other",
      "https://orthanc-a:8042#fragment",
    ]) {
      const fetchImpl = vi.fn();
      const gateway = new OrthancDicomwebAdapter(
        new TestOrthancEndpointResolver(testConfig({ orthancAUrl: origin })),
        { fetch: fetchImpl },
      );
      await expect(gateway.retrieveStudyMetadata({
        context: context(TEST_HOSPITAL_A_ID),
        studyInstanceUid: STUDY,
        maximumItems: 1,
      })).rejects.toThrow();
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("resolves QIDO/WADO only for A and STOW/verification only for B", async () => {
    const fetchImpl = vi.fn();
    const instance = adapter(fetchImpl);
    await expect(instance.retrieveStudyMetadata({ context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, maximumItems: 1 })).rejects.toThrow("DICOM_ENDPOINT_DENIED");
    await expect(instance.storeInstanceStream({
      context: context(TEST_HOSPITAL_A_ID), studyInstanceUid: STUDY, seriesInstanceUid: SERIES,
      sopInstanceUid: SOP, sopClassUid: SOP_CLASS, transferSyntaxUid: TS,
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }),
    })).rejects.toThrow("DICOM_STOW_DENIED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a minimal QIDO projection and refuses redirect/alternate URL behavior", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toContain("https://orthanc-a:8042/dicom-web/studies?");
      expect(new Headers(init.headers).get("authorization")).toBe("Basic synthetic-test-credential");
      expect(new Headers(init.headers).get("accept")).toBe("application/dicom+json");
      expect(init.redirect).toBe("error");
      return dicomJson([{
        "0020000D": tag("UI", STUDY),
        "00080020": tag("DA", "20200101"),
        "00080061": tag("CS", "CT"),
        "00201208": tag("IS", "3"),
        "00100010": tag("PN", "SYNTHETIC^TEST"),
        "00080050": tag("SH", "DO-NOT-RETURN"),
      }]);
    });
    const result = await adapter(fetchImpl).queryStudies({
      context: context(), localPatientId: "TEST-PATIENT-007", limit: 10,
    });
    expect(result).toEqual([{
      studyInstanceUid: STUDY,
      studyDate: "20200101",
      modalitiesInStudy: ["CT"],
      numberOfStudyRelatedInstances: 3,
    }]);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC^TEST");
    expect(JSON.stringify(result)).not.toContain("DO-NOT-RETURN");
  });

  it("rejects malformed QIDO JSON and results beyond the requested page", async () => {
    const malformed = adapter(async () => new Response("{}", { headers: { "content-type": "application/dicom+json" } }));
    await expect(malformed.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow("DICOM_UPSTREAM_INVALID");
    const excessive = adapter(async () => dicomJson([
      { "0020000D": tag("UI", STUDY) }, { "0020000D": tag("UI", SOP_2) },
    ]));
    await expect(excessive.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow("DICOM_UPSTREAM_INVALID");
    const oversizedBody = adapter(async () => new Response(`[]${" ".repeat(1024 * 1024)}`, { headers: { "content-type": "application/dicom+json" } }));
    await expect(oversizedBody.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow("DICOM_UPSTREAM_INVALID");
  });

  it("rejects wrong QIDO media type and enforces a body deadline", async () => {
    const wrongType = adapter(async () => dicomJson([], "text/plain"));
    await expect(wrongType.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow("DICOM_UPSTREAM_MEDIA_TYPE");
    const unauthorized = adapter(async () => new Response("synthetic denied", { status: 401, headers: { "content-type": "application/dicom+json" } }));
    await expect(unauthorized.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow("DICOM_UPSTREAM_STATUS");
    const neverFinishes = adapter(async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/dicom+json" } }), {
      deadlines: { qidoIdleMs: 20, qidoTotalMs: 80 },
    });
    await expect(neverFinishes.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 1 })).rejects.toThrow();
  });

  it("projects one internal PatientID per Study instance and excludes unrelated patient fields", async () => {
    const fetchImpl = vi.fn(async () => dicomJson([
      wadoMetadataRow(SOP),
      wadoMetadataRow(SOP_2),
    ]));
    const result = await adapter(fetchImpl).retrieveStudyMetadata({
      context: context(), studyInstanceUid: STUDY, maximumItems: 2,
    });
    expect(result.series).toEqual([{
      seriesInstanceUid: SERIES,
      modality: "CT",
      instances: [
        { sopInstanceUid: SOP, sopClassUid: SOP_CLASS, patientId: "TEST-PATIENT-007" },
        { sopInstanceUid: SOP_2, sopClassUid: SOP_CLASS, patientId: "TEST-PATIENT-007" },
      ].sort((left, right) => left.sopInstanceUid.localeCompare(right.sopInstanceUid)),
    }]);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC^DO-NOT-PROJECT");
  });

  it("rejects duplicate SOP Instance UIDs in one source Study metadata response", async () => {
    const duplicate = wadoMetadataRow(SOP);
    const instance = adapter(async () => dicomJson([duplicate, structuredClone(duplicate)]));
    await expect(instance.retrieveStudyMetadata({
      context: context(), studyInstanceUid: STUDY, maximumItems: 2,
    })).rejects.toThrow("DICOM_UPSTREAM_INVALID");
  });

  it.each([
    ["missing", undefined],
    ["multi-valued", tag("LO", "TEST-PATIENT-007", "TEST-PATIENT-008")],
    ["wrong VR", tag("PN", "TEST-PATIENT-007")],
  ])("rejects %s PatientID metadata with a sanitized error", async (_name, value) => {
    const row = wadoMetadataRow(SOP);
    if (value === undefined) delete row["00100020"];
    else row["00100020"] = value;
    const instance = adapter(async () => dicomJson([row]));
    await expect(instance.retrieveStudyMetadata({
      context: context(), studyInstanceUid: STUDY, maximumItems: 1,
    })).rejects.toThrow("DICOM_UPSTREAM_INVALID");
  });

  it("streams one WADO instance byte-for-byte and validates the terminal multipart boundary", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
    const instance = adapter(async () => multipart([{ bytes }]));
    const result = await instance.retrieveInstanceStream({
      context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP,
    });
    expect(result.mediaType).toBe("application/dicom");
    expect(result.transferSyntaxUid).toBe(TS);
    expect(await streamBytes(result.body)).toEqual(Buffer.from(bytes));
  });

  it("fails closed on truncated, multi-part and unexpected-media WADO responses", async () => {
    const truncated = adapter(async () => multipart([{ bytes: new Uint8Array([1, 2]) }], { close: false }));
    const truncatedResult = await truncated.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP });
    await expect(streamBytes(truncatedResult.body)).rejects.toThrow("DICOM_WADO_STREAM_FAILED");

    const multi = adapter(async () => multipart([{ bytes: new Uint8Array([1]) }, { bytes: new Uint8Array([2]) }]));
    const multiResult = await multi.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP });
    await expect(streamBytes(multiResult.body)).rejects.toThrow("DICOM_WADO_STREAM_FAILED");

    const wrongType = adapter(async () => multipart([{ bytes: new Uint8Array([1]) }], { outerType: "application/octet-stream" }));
    await expect(wrongType.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP })).rejects.toThrow("DICOM_UPSTREAM_INVALID");

    const noBoundary = adapter(async () => new Response("--missing-boundary", {
      headers: { "content-type": 'multipart/related; type="application/dicom"' },
    }));
    await expect(noBoundary.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP })).rejects.toThrow("DICOM_WADO_FAILED");

    const boundary = "large-headers";
    const largeHeader = new Response(new TextEncoder().encode(`--${boundary}\r\n${"X-Padding: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\r\n".repeat(170)}Content-Type: application/dicom\r\n\r\n1\r\n--${boundary}--\r\n`), {
      headers: { "content-type": `multipart/related; type="application/dicom"; boundary=${boundary}` },
    });
    const headerLimit = adapter(async () => largeHeader);
    await expect(headerLimit.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP })).rejects.toThrow("DICOM_WADO_FAILED");

    const abortingController = new AbortController();
    const pending = adapter(async () => new Response(new ReadableStream({ start() {} }), {
      headers: { "content-type": "multipart/related; type=\"application/dicom\"; boundary=wait" },
    }), { deadlines: { wadoIdleMs: 200, wadoTotalMs: 300 } });
    setTimeout(() => abortingController.abort(), 10);
    await expect(pending.retrieveInstanceStream({ context: context(TEST_HOSPITAL_A_ID, abortingController.signal), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP })).rejects.toThrow("DICOM_WADO_FAILED");
  });

  it("propagates an outer WADO failure that occurs after a DICOM part has started", async () => {
    const boundary = "mid-body-failure";
    const header = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=${TS}\r\nContent-Length: 4096\r\n\r\n`,
    );
    const prefix = new Uint8Array(header.byteLength + 4);
    prefix.set(header);
    prefix.set([0x44, 0x49, 0x43, 0x4d], header.byteLength);
    let emitted = false;
    const response = new Response(new ReadableStream({
      pull(controller) {
        if (!emitted) {
          emitted = true;
          controller.enqueue(prefix);
          return;
        }
        controller.error(new Error("SYNTHETIC_WADO_STREAM_FAILURE"));
      },
    }, { highWaterMark: 0 }), {
      status: 200,
      headers: { "content-type": `multipart/related; type=application/dicom; boundary=${boundary}` },
    });
    const instance = adapter(async () => response);
    const result = await instance.retrieveInstanceStream({
      context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP,
    });

    await expect(streamBytes(result.body)).rejects.toThrow("DICOM_WADO_STREAM_FAILED");
  });

  it("enforces the 64 MiB WADO part cap while the body is streamed", async () => {
    const boundary = "over-cap";
    const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`);
    const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    let chunksLeft = 65;
    let state = "prefix";
    const response = new Response(new ReadableStream({
      pull(controller) {
        if (state === "prefix") {
          state = "content";
          controller.enqueue(prefix);
          return;
        }
        if (chunksLeft > 0) {
          chunksLeft -= 1;
          controller.enqueue(new Uint8Array(1024 * 1024));
          return;
        }
        state = "suffix";
        controller.enqueue(suffix);
        controller.close();
      },
    }), { headers: { "content-type": `multipart/related; type="application/dicom"; boundary=${boundary}` } });
    const instance = adapter(async () => response);
    const result = await instance.retrieveInstanceStream({ context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP });
    await expect(streamBytes(result.body)).rejects.toThrow("DICOM_WADO_STREAM_FAILED");
  }, 20_000);

  it("retrieves only a bounded rendered JPEG frame", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toContain(`/frames/1/rendered`);
      expect(new Headers(init.headers).get("accept")).toBe("image/jpeg");
      return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "content-type": "image/jpeg" } });
    });
    const result = await adapter(fetchImpl).retrieveFrameStream({
      context: context(), studyInstanceUid: STUDY, seriesInstanceUid: SERIES, sopInstanceUid: SOP, frameNumber: 1,
    });
    expect(result.mediaType).toBe("image/jpeg");
    expect(await streamBytes(result.body)).toEqual(Buffer.from([255, 216, 255, 217]));
  });

  it("sends one byte-preserving multipart STOW stream to B and parses the per-instance result", async () => {
    const payload = new Uint8Array([0, 17, 34, 51, 255]);
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`https://orthanc-b:8042/dicom-web/studies/${STUDY}`);
      expect(init.method).toBe("POST");
      expect(init.duplex).toBe("half");
      expect(new Headers(init.headers).get("authorization")).toBe("Basic synthetic-test-credential");
      const body = Buffer.from(await streamBytes(init.body));
      expect(body.includes(Buffer.from(payload))).toBe(true);
      expect(body.toString("latin1")).toMatch(/Content-Type: application\/dicom; transfer-syntax=1\.2\.840\.10008\.1\.2\.1/);
      return dicomJson({ "00081199": { vr: "SQ", Value: [{ "00081155": tag("UI", SOP) }] } });
    });
    const result = await adapter(fetchImpl).storeInstanceStream({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, seriesInstanceUid: SERIES,
      sopInstanceUid: SOP, sopClassUid: SOP_CLASS, transferSyntaxUid: TS,
      body: new ReadableStream({ start(controller) { controller.enqueue(payload); controller.close(); } }),
      contentLength: payload.byteLength,
    });
    expect(result).toEqual({ httpStatus: 200, storedSopInstanceUids: [SOP], warningSopInstanceUids: [], failedInstances: [] });
  });

  it("reports outcome UNKNOWN after a started STOW loses its response and never retries", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      await streamBytes(init.body);
      throw new TypeError("synthetic connection reset");
    });
    await expect(adapter(fetchImpl).storeInstanceStream({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, seriesInstanceUid: SERIES,
      sopInstanceUid: SOP, sopClassUid: SOP_CLASS, transferSyntaxUid: TS,
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close(); } }),
      contentLength: 2,
    })).rejects.toThrow("DICOM_STOW_OUTCOME_UNKNOWN");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("retains a partial STOW result without treating 202 as complete", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      await streamBytes(init.body);
      return new Response(JSON.stringify({
        "00081198": { vr: "SQ", Value: [{
          "00081155": tag("UI", SOP),
          "00081197": tag("US", 0x0110),
        }] },
      }), { status: 202, headers: { "content-type": "application/dicom+json" } });
    });
    const result = await adapter(fetchImpl).storeInstanceStream({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, seriesInstanceUid: SERIES,
      sopInstanceUid: SOP, sopClassUid: SOP_CLASS, transferSyntaxUid: TS,
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close(); } }),
      contentLength: 2,
    });
    expect(result).toEqual({
      httpStatus: 202,
      storedSopInstanceUids: [],
      warningSopInstanceUids: [],
      failedInstances: [{ sopInstanceUid: SOP, code: "PROCESSING_FAILURE" }],
    });
  });

  it("requires the B verification operation and projects only destination UIDs", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url).includes("/instances")
        ? [destinationInstanceRow(SOP), destinationInstanceRow(SOP_2)]
        : [{ "0020000E": tag("UI", SERIES) }];
      return dicomJson(value);
    });
    const result = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP), expectedInstance(SOP_2)], maximumItems: 10,
    });
    expect(result).toEqual({
      studyInstanceUid: STUDY,
      actualSeriesInstanceUids: [SERIES],
      actualSopInstanceUids: [SOP, SOP_2].sort(),
      matchesExpected: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    await expect(adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_A_ID), studyInstanceUid: STUDY,
      expectedInstances: [], maximumItems: 10,
    })).rejects.toThrow("DICOM_ENDPOINT_DENIED");
  });

  it("rejects an empty, duplicate, malformed, or over-limit expected inventory before QIDO", async () => {
    const fetchImpl = vi.fn();
    const verify = adapter(fetchImpl);
    const base = { context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, maximumItems: 1 };
    await expect(verify.verifyDestinationStudy({ ...base, expectedInstances: [] })).rejects.toThrow("DICOM_REQUEST_INVALID");
    await expect(verify.verifyDestinationStudy({
      ...base,
      expectedInstances: [expectedInstance(SOP), expectedInstance(SOP)],
    })).rejects.toThrow("DICOM_REQUEST_INVALID");
    await expect(verify.verifyDestinationStudy({
      ...base,
      expectedInstances: [expectedInstance("1.02")],
    })).rejects.toThrow("DICOM_REQUEST_INVALID");
    await expect(verify.verifyDestinationStudy({
      ...base,
      expectedInstances: [expectedInstance(SOP), expectedInstance(SOP_2)],
    })).rejects.toThrow("DICOM_REQUEST_INVALID");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports missing instances and unexpected Series as non-matching, even when counts can appear plausible", async () => {
    const fetchImpl = vi.fn(async (url) => dicomJson(
      String(url).includes("/instances")
        ? [destinationInstanceRow(SOP)]
        : [{ "0020000E": tag("UI", SERIES) }],
    ));
    const missing = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP), expectedInstance(SOP_2)], maximumItems: 10,
    });
    expect(missing.matchesExpected).toBe(false);

    const wrongSeries = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP, SOP_CLASS)], maximumItems: 10,
    });
    expect(wrongSeries.matchesExpected).toBe(false);

    const extraSeries = await adapter(vi.fn(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/series")) {
        return dicomJson([
          { "0020000E": tag("UI", SERIES) },
          { "0020000E": tag("UI", SOP_CLASS) },
        ]);
      }
      return path.includes(`/series/${encodeURIComponent(SERIES)}/`)
        ? dicomJson([destinationInstanceRow(SOP)])
        : dicomJson([]);
    })).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    });
    expect(extraSeries.matchesExpected).toBe(false);
  });

  it("rejects duplicate destination Series and SOP identities", async () => {
    const duplicateSeriesFetch = vi.fn(async () => dicomJson([
      { "0020000E": tag("UI", SERIES) },
      { "0020000E": tag("UI", SERIES) },
    ]));
    const duplicateSeries = adapter(duplicateSeriesFetch);
    await expect(duplicateSeries.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();
    expect(duplicateSeriesFetch).toHaveBeenCalledOnce();

    const duplicateSop = adapter(vi.fn(async (url) => dicomJson(
      String(url).includes("/instances")
        ? [destinationInstanceRow(SOP), destinationInstanceRow(SOP)]
        : [{ "0020000E": tag("UI", SERIES) }],
    )));
    await expect(duplicateSop.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();
  });

  it("rejects an instance whose response Study or Series contradicts the QIDO path", async () => {
    const fetchImpl = vi.fn(async (url) => dicomJson(
      String(url).includes("/instances")
        ? [destinationInstanceRow(SOP, SERIES, SOP_CLASS)]
        : [{ "0020000E": tag("UI", SERIES) }],
    ));
    await expect(adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();
  });

  it("follows Warning 299 pagination and verifies every bounded instance page", async () => {
    const identities = Array.from({ length: 101 }, (_, index) =>
      `1.2.840.10008.9999.${index + 1}`,
    );
    const calls = [];
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      calls.push({ path: parsed.pathname, offset: Number(parsed.searchParams.get("offset")), limit: Number(parsed.searchParams.get("limit")) });
      if (!parsed.pathname.includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      const offset = Number(parsed.searchParams.get("offset"));
      const limit = Number(parsed.searchParams.get("limit"));
      const page = identities.slice(offset, offset + limit).map((uid) => destinationInstanceRow(uid));
      const remaining = identities.length - offset - page.length;
      return dicomJson(page, "application/dicom+json", remaining > 0
        ? { warning: `299 orthanc: There are ${remaining} additional results that can be requested` }
        : {});
    });
    const result = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: identities.map((uid) => expectedInstance(uid)), maximumItems: 101,
    });
    expect(result.matchesExpected).toBe(true);
    expect(result.actualSopInstanceUids).toHaveLength(101);
    expect(calls.filter((call) => call.path.includes("/instances")).map(({ offset }) => offset)).toEqual([0, 100, 0, 100]);
  });

  it("supports an origin page ceiling smaller than the requested limit and rejects inconsistent Warning counts", async () => {
    const identities = Array.from({ length: 45 }, (_, index) => `1.2.840.10008.8888.${index + 1}`);
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      const offset = Number(parsed.searchParams.get("offset"));
      const page = identities.slice(offset, offset + 20).map((uid) => destinationInstanceRow(uid));
      const remaining = identities.length - offset - page.length;
      return dicomJson(page, "application/dicom+json", remaining > 0
        ? { warning: `299 orthanc: There are ${remaining} additional results that can be requested` }
        : {});
    });
    const result = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: identities.map((uid) => expectedInstance(uid)), maximumItems: 45,
    });
    expect(result.matchesExpected).toBe(true);
    expect(fetchImpl.mock.calls
      .filter(([url]) => new URL(String(url)).pathname.includes("/instances"))
      .map(([url]) => new URL(String(url)).searchParams.get("offset")))
      .toEqual(["0", "20", "40", "0", "20", "40"]);

    const inconsistent = adapter(vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      const offset = Number(parsed.searchParams.get("offset"));
      return offset === 0
        ? dicomJson([destinationInstanceRow(identities[0])], "application/dicom+json", { warning: "299 orthanc: There are 5 additional results that can be requested" })
        : dicomJson([destinationInstanceRow(identities[1])]);
    }));
    await expect(inconsistent.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: identities.slice(0, 6).map((uid) => expectedInstance(uid)), maximumItems: 10,
    })).rejects.toThrow();
  });

  it("rejects duplicate SOP identities repeated on a later QIDO page and Series overflow", async () => {
    const identities = Array.from({ length: 101 }, (_, index) => `1.2.840.10008.7777.${index + 1}`);
    const repeatedPage = adapter(vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      const offset = Number(parsed.searchParams.get("offset"));
      if (offset === 0) {
        return dicomJson(identities.slice(0, 100).map((uid) => destinationInstanceRow(uid)), "application/dicom+json", {
          warning: "299 orthanc: There are 1 additional results that can be requested",
        });
      }
      return dicomJson([destinationInstanceRow(identities[99])]);
    }));
    await expect(repeatedPage.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: identities.map((uid) => expectedInstance(uid)), maximumItems: 101,
    })).rejects.toThrow();

    const seriesOverflow = adapter(vi.fn(async () => dicomJson(
      Array.from({ length: 65 }, (_, index) => ({ "0020000E": tag("UI", `1.2.840.10008.6666.${index + 1}`) })),
    )));
    await expect(seriesOverflow.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();
  });

  it("fails closed on malformed pagination warnings and global instance overflow", async () => {
    const malformedWarning = adapter(vi.fn(async (url) => {
      const parsed = new URL(String(url));
      return parsed.pathname.includes("/instances")
        ? dicomJson([destinationInstanceRow(SOP)], "application/dicom+json", { warning: "299 orthanc: partial results" })
        : dicomJson([{ "0020000E": tag("UI", SERIES) }]);
    }));
    await expect(malformedWarning.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();

    const overflow = adapter(vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      return dicomJson([destinationInstanceRow(SOP), destinationInstanceRow(SOP_2)]);
    }));
    await expect(overflow.verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 1,
    })).rejects.toThrow();
  });

  it("requires two consecutive complete destination scans to have the same exact hierarchy", async () => {
    let instanceScan = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (!String(url).includes("/instances")) return dicomJson([{ "0020000E": tag("UI", SERIES) }]);
      instanceScan += 1;
      return dicomJson(instanceScan === 1
        ? [destinationInstanceRow(SOP), destinationInstanceRow(SOP_2)]
        : [destinationInstanceRow(SOP), destinationInstanceRow("1.2.840.10008.9999.3")]);
    });
    const result = await adapter(fetchImpl).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP), expectedInstance(SOP_2)], maximumItems: 10,
    });
    expect(result.actualSopInstanceUids).toHaveLength(2);
    expect(result.matchesExpected).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("aborts the complete destination scan at its configured total deadline", async () => {
    let upstreamAborted = false;
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        upstreamAborted = true;
        reject(new Error("synthetic abort"));
      }, { once: true });
    }));
    await expect(adapter(fetchImpl, {
      deadlines: { destinationVerificationTotalMs: 40 },
    }).verifyDestinationStudy({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY,
      expectedInstances: [expectedInstance(SOP)], maximumItems: 10,
    })).rejects.toThrow();
    expect(upstreamAborted).toBe(true);
  });

  it("rejects oversized instance declarations and invalid query bounds before network I/O", async () => {
    const fetchImpl = vi.fn();
    const instance = adapter(fetchImpl);
    await expect(instance.queryStudies({ context: context(), localPatientId: "TEST-PATIENT-007", limit: 101 })).rejects.toThrow("DICOM_REQUEST_INVALID");
    await expect(instance.storeInstanceStream({
      context: context(TEST_HOSPITAL_B_ID), studyInstanceUid: STUDY, seriesInstanceUid: SERIES,
      sopInstanceUid: SOP, sopClassUid: SOP_CLASS, transferSyntaxUid: TS,
      body: new ReadableStream(), contentLength: 64 * 1024 * 1024 + 1,
    })).rejects.toThrow("DICOM_STOW_DENIED");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => adapter(fetchImpl, { concurrency: 3 })).toThrow("DICOM_CONFIGURATION_INVALID");
  });
});
