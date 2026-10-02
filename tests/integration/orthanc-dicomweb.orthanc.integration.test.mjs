import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connect as tlsConnect } from "node:tls";
import test from "node:test";
import { OrthancDicomwebAdapter } from "../../services/api/dist/dicom/infrastructure/orthanc-dicomweb.adapter.js";
import {
  TEST_HOSPITAL_A_ID,
  TEST_HOSPITAL_B_ID,
  TestOrthancEndpointResolver,
} from "../../services/api/dist/dicom/infrastructure/test-orthanc-endpoint-resolver.js";

// This node:test suite runs only inside the isolated Compose test container,
// not as part of the local Vitest API unit-test glob.
const manifestPath = process.env.MEDIQ_DICOM_TEST_MANIFEST;
assert.ok(manifestPath, "synthetic fixture manifest path is required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const config = {
  runtimeProfile: "container",
  environment: process.env.MEDIQ_ENV,
  orthancAUrl: process.env.ORTHANC_A_URL,
  orthancAUsername: process.env.ORTHANC_A_USERNAME,
  orthancAPassword: process.env.ORTHANC_A_PASSWORD,
  orthancBUrl: process.env.ORTHANC_B_URL,
  orthancBUsername: process.env.ORTHANC_B_USERNAME,
  orthancBPassword: process.env.ORTHANC_B_PASSWORD,
};
const resolver = new TestOrthancEndpointResolver(config);
const adapter = new OrthancDicomwebAdapter(resolver);
const controller = new AbortController();
const aContext = { hospitalId: TEST_HOSPITAL_A_ID, correlationId: "dcm002-orthanc-readonly", signal: controller.signal };
const bContext = { hospitalId: TEST_HOSPITAL_B_ID, correlationId: "dcm002-orthanc-readonly", signal: controller.signal };

function tlsHandshake({ servername, ca }) {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: "orthanc-a",
      port: 8042,
      servername,
      ...(ca ? { ca } : {}),
      rejectUnauthorized: true,
      timeout: 3000,
    });
    socket.once("secureConnect", () => {
      const authorized = socket.authorized;
      socket.destroy();
      resolve(authorized ? "AUTHORIZED" : "UNEXPECTED_UNAUTHORIZED");
    });
    socket.once("error", (error) => resolve(error.code || error.name));
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("TLS_PROBE_TIMEOUT"));
    });
  });
}

test("A/B Orthanc HTTPS listeners serve valid names and preserve authentication", async () => {
  for (const [base, expectedName] of [
    [process.env.ORTHANC_A_URL, "Hospital A Test Orthanc"],
    [process.env.ORTHANC_B_URL, "Hospital B Test Orthanc"],
  ]) {
    const response = await fetch(`${base}/system`, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 401);
    const authenticated = await fetch(`${base}/system`, {
      headers: {
        authorization: `Basic ${Buffer.from(
          `${base.includes("orthanc-a") ? process.env.ORTHANC_A_USERNAME : process.env.ORTHANC_B_USERNAME}:${base.includes("orthanc-a") ? process.env.ORTHANC_A_PASSWORD : process.env.ORTHANC_B_PASSWORD}`,
        ).toString("base64")}`,
      },
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(authenticated.status, 200);
    const system = await authenticated.json();
    assert.equal(system.Name, expectedName);
  }
});

test("TLS rejects an untrusted CA, a mismatched DNS identity, and plaintext downgrade", async () => {
  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  assert.ok(caPath, "the local Test CA path is required for TLS Acceptance");
  const ca = await readFile(caPath);

  const trusted = await tlsHandshake({ servername: "orthanc-a", ca });
  assert.equal(trusted, "AUTHORIZED");

  const untrusted = await tlsHandshake({ servername: "orthanc-a", ca: [] });
  assert.notEqual(untrusted, "AUTHORIZED");
  assert.notEqual(untrusted, "UNEXPECTED_UNAUTHORIZED");

  const wrongName = await tlsHandshake({ servername: "wrong-name.invalid", ca });
  assert.equal(wrongName, "ERR_TLS_CERT_ALTNAME_INVALID");

  const malformedCa = Buffer.from(ca);
  malformedCa[0] ^= 0xff;
  const malformedTrust = await tlsHandshake({ servername: "orthanc-a", ca: malformedCa });
  assert.notEqual(malformedTrust, "AUTHORIZED");
  assert.notEqual(malformedTrust, "UNEXPECTED_UNAUTHORIZED");

  await assert.rejects(
    fetch("http://orthanc-a:8042/system", { signal: AbortSignal.timeout(3000) }),
  );
});

test("A Orthanc QIDO resolves exactly the synthetic CT Study summary", async () => {
  const result = await adapter.queryStudies({
    context: aContext,
    localPatientId: manifest.patient.patientId,
    studyInstanceUid: manifest.studyInstanceUID,
    limit: 10,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].studyInstanceUid, manifest.studyInstanceUID);
  assert.equal(result[0].studyDate, manifest.studyDate);
  assert.deepEqual(result[0].modalitiesInStudy, [manifest.modality]);
  assert.equal(result[0].numberOfStudyRelatedInstances, manifest.instanceCount);
});

test("A Orthanc WADO metadata preserves the expected Study/Series/Instance UID hierarchy", async () => {
  const result = await adapter.retrieveStudyMetadata({
    context: aContext,
    studyInstanceUid: manifest.studyInstanceUID,
    maximumItems: manifest.instanceCount,
  });
  assert.equal(result.studyInstanceUid, manifest.studyInstanceUID);
  assert.equal(result.series.length, 1);
  assert.equal(result.series[0].seriesInstanceUid, manifest.seriesInstanceUID);
  assert.equal(result.series[0].modality, manifest.modality);
  assert.deepEqual(
    result.series[0].instances.map((instance) => instance.sopInstanceUid).sort(),
    manifest.instances.map((instance) => instance.sopInstanceUID).sort(),
  );
  assert.ok(result.series[0].instances.every((instance) => instance.sopClassUid === manifest.sopClassUID));
  assert.ok(result.series[0].instances.every((instance) => instance.patientId === manifest.patient.patientId));
});

test("A Orthanc multipart WADO streams each synthetic instance and matches manifest SHA-256", async () => {
  for (const expected of manifest.instances) {
    const result = await adapter.retrieveInstanceStream({
      context: aContext,
      studyInstanceUid: manifest.studyInstanceUID,
      seriesInstanceUid: manifest.seriesInstanceUID,
      sopInstanceUid: expected.sopInstanceUID,
    });
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of result.body) {
      hash.update(chunk);
      bytes += chunk.byteLength;
    }
    assert.equal(bytes, expected.sizeBytes);
    assert.equal(hash.digest("hex"), expected.sha256);
  }
});

test("A Orthanc can render one synthetic CT frame as bounded JPEG", async () => {
  const result = await adapter.retrieveFrameStream({
    context: aContext,
    studyInstanceUid: manifest.studyInstanceUID,
    seriesInstanceUid: manifest.seriesInstanceUID,
    sopInstanceUid: manifest.instances[0].sopInstanceUID,
    frameNumber: 1,
  });
  assert.equal(result.mediaType, "image/jpeg");
  let bytes = 0;
  for await (const chunk of result.body) bytes += chunk.byteLength;
  assert.ok(bytes > 4);
  assert.ok(bytes <= 64 * 1024 * 1024);
});

test("B Orthanc destination Study baseline is read-only and repeatable", async () => {
  const request = {
    context: bContext,
    studyInstanceUid: manifest.studyInstanceUID,
    expectedInstances: manifest.instances.map((instance) => ({
      seriesInstanceUid: manifest.seriesInstanceUID,
      sopInstanceUid: instance.sopInstanceUID,
    })),
    maximumItems: 2_000,
  };
  const before = await adapter.verifyDestinationStudy(request);
  const after = await adapter.verifyDestinationStudy(request);
  assert.deepEqual(after.actualSopInstanceUids, before.actualSopInstanceUids);
  assert.deepEqual(after.actualSeriesInstanceUids, before.actualSeriesInstanceUids);
  assert.equal(before.matchesExpected, false);
  assert.equal(after.matchesExpected, false);
  // This is only a read-only baseline. Existing B data, including a matching
  // synthetic Study, is not overwritten and is not interpreted as a transfer.
  console.log(`B destination baseline: ${before.actualSopInstanceUids.length} instance UID(s), exact match=${before.matchesExpected}; no writes performed.`);
});
