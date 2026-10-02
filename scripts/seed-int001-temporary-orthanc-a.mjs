import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = process.env.MEDIQ_DICOM_TEST_MANIFEST;
const baseUrl = process.env.ORTHANC_A_URL;
const username = process.env.ORTHANC_A_USERNAME;
const password = process.env.ORTHANC_A_PASSWORD;
if (!manifestPath || !baseUrl || !username || !password) {
  throw new Error("INT001_ORTHANC_A_SEED_CONFIG_INVALID");
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.fixtureId !== "MEDIQ-ENV-007-SYNTHETIC-CT-V1") {
  throw new Error("INT001_ORTHANC_A_FIXTURE_NOT_APPROVED");
}
const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
const headers = { authorization };
const studiesResponse = await fetch(`${baseUrl}/studies`, {
  headers,
  signal: AbortSignal.timeout(5_000),
  redirect: "error",
});
if (!studiesResponse.ok) throw new Error("INT001_ORTHANC_A_PREFLIGHT_FAILED");
const existingStudies = await studiesResponse.json();
if (!Array.isArray(existingStudies) || existingStudies.length !== 0) {
  throw new Error("INT001_ORTHANC_A_TEMPORARY_STORE_NOT_EMPTY");
}

for (const instance of manifest.instances) {
  const bytes = await readFile(path.join(path.dirname(manifestPath), instance.file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== instance.sizeBytes || digest !== instance.sha256) {
    throw new Error("INT001_ORTHANC_A_SYNTHETIC_FIXTURE_INTEGRITY_FAILED");
  }
  const response = await fetch(`${baseUrl}/instances`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/dicom" },
    body: bytes,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (response.status !== 200 && response.status !== 201) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("INT001_ORTHANC_A_SYNTHETIC_SETUP_FAILED");
  }
  await response.body?.cancel().catch(() => undefined);
}

const seededResponse = await fetch(`${baseUrl}/studies`, {
  headers,
  signal: AbortSignal.timeout(5_000),
  redirect: "error",
});
const seededStudies = seededResponse.ok ? await seededResponse.json() : null;
if (!Array.isArray(seededStudies) || seededStudies.length !== 1) {
  throw new Error("INT001_ORTHANC_A_SYNTHETIC_SETUP_VERIFY_FAILED");
}
console.log(`int001_orthanc_a_seed=PASS synthetic_instances=${manifest.instances.length}`);
