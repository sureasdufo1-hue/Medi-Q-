const baseUrl = process.env.ORTHANC_B_URL;
const username = process.env.ORTHANC_B_USERNAME;
const password = process.env.ORTHANC_B_PASSWORD;
if (!baseUrl || !username || !password) throw new Error("INT001_ORTHANC_B_PROBE_CONFIG_INVALID");
const response = await fetch(`${baseUrl}/studies`, {
  headers: {
    authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
  },
  signal: AbortSignal.timeout(5_000),
  redirect: "error",
});
if (!response.ok) {
  await response.body?.cancel().catch(() => undefined);
  throw new Error("INT001_ORTHANC_B_READ_ONLY_PROBE_FAILED");
}
const studies = await response.json();
if (!Array.isArray(studies) || studies.length !== 0) {
  throw new Error("INT001_ORTHANC_B_STORE_NOT_EMPTY");
}
console.log("int001_orthanc_b_store=EMPTY");
