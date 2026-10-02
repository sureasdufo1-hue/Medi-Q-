import { EphemeralEncryptedTemporaryImagingStore } from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";

const raw = process.env.MEDIQ_TEMP_PAYLOAD_CHILD_FIXTURE;
if (!raw) throw new Error("TEMP_PAYLOAD_CHILD_FIXTURE_MISSING");
const fixture = JSON.parse(raw);
if (
  typeof fixture.rootDirectory !== "string" ||
  typeof fixture.storageRef !== "string" ||
  typeof fixture.packageBinding !== "object" ||
  typeof fixture.instanceBinding !== "object"
) {
  throw new Error("TEMP_PAYLOAD_CHILD_FIXTURE_INVALID");
}

const store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: fixture.rootDirectory });
await store.beginReservedPackage(fixture.packageBinding, fixture.storageRef);
const payload = Buffer.from("SYNTHETIC-PURGE-FIXTURE-NOT-REAL-DICOM-OR-PHI", "utf8");
async function* source() {
  yield payload;
}
await store.stageInstance({
  storageRef: fixture.storageRef,
  packageBinding: fixture.packageBinding,
  instanceBinding: fixture.instanceBinding,
  source: source(),
});
await store.sealPackage({
  storageRef: fixture.storageRef,
  binding: fixture.packageBinding,
});
