#!/usr/bin/env python3
"""Fail-closed validator for the ignored ENV-007 DICOM fixture and manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

import pydicom
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "data" / "synthetic-ct-env007"
EXPECTED_PATIENT_ID = "TEST-PATIENT-007"
EXPECTED_PATIENT_NAME = "SYNTHETIC^TEST"
EXPECTED_DESCRIPTION = "SYNTHETIC NON-DIAGNOSTIC CT PHANTOM"
UID_RE = re.compile(r"^2\.25\.[0-9]+$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"INVALID SYNTHETIC CT FIXTURE: {message}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_FIXTURE)
    args = parser.parse_args()
    directory = args.directory.resolve()
    require(directory == DEFAULT_FIXTURE.resolve(), "fixture directory is not the approved ENV-007 target")
    require(directory.is_dir(), "fixture directory is missing")
    manifest_path = directory / "manifest.json"
    require(manifest_path.is_file(), "manifest.json is missing")

    raw_manifest = manifest_path.read_bytes()
    manifest = json.loads(raw_manifest)
    require(manifest.get("schemaVersion") == 1, "unsupported manifest schema")
    require(manifest.get("fixtureId") == "MEDIQ-ENV-007-SYNTHETIC-CT-V1", "unexpected fixture ID")
    require(manifest.get("pydicomVersion") == "3.0.2" == pydicom.__version__, "pydicom version mismatch")
    require(manifest.get("modality") == "CT", "fixture modality is not CT")
    require(manifest.get("sopClassUID") == str(CTImageStorage), "fixture SOP Class is not CT Image Storage")
    require(manifest.get("transferSyntaxUID") == str(ExplicitVRLittleEndian), "fixture Transfer Syntax is not Explicit VR Little Endian")
    require(manifest.get("patient") == {"patientId": EXPECTED_PATIENT_ID, "patientName": EXPECTED_PATIENT_NAME}, "synthetic Patient identity allowlist mismatch")
    require(manifest.get("description", "").startswith("Deterministic synthetic") and "non-diagnostic" in manifest.get("description", ""), "fixture is not disclosed as synthetic/non-diagnostic")

    instances = manifest.get("instances")
    require(isinstance(instances, list) and len(instances) == 3, "expected exactly three single-frame CT instances")
    expected_files = {"manifest.json"} | {entry.get("file") for entry in instances}
    actual_files = {item.name for item in directory.iterdir()}
    require(actual_files == expected_files, "unexpected or missing files in fixture directory")
    expected_sops = set()

    for index, entry in enumerate(instances, start=1):
        path = directory / entry["file"]
        payload = path.read_bytes()
        require(entry.get("instanceNumber") == index, "instance ordering/number mismatch")
        require(entry.get("sizeBytes") == len(payload), f"size mismatch for {path.name}")
        require(entry.get("sha256") == hashlib.sha256(payload).hexdigest(), f"SHA-256 mismatch for {path.name}")
        require(payload[128:132] == b"DICM", f"missing DICOM Part 10 preamble in {path.name}")

        dataset = pydicom.dcmread(path, force=False)
        require(str(dataset.file_meta.TransferSyntaxUID) == str(ExplicitVRLittleEndian), f"Transfer Syntax mismatch in {path.name}")
        require(str(dataset.file_meta.MediaStorageSOPClassUID) == str(CTImageStorage), f"File Meta SOP Class mismatch in {path.name}")
        require(str(dataset.SOPClassUID) == str(CTImageStorage), f"SOP Class mismatch in {path.name}")
        require(str(dataset.SOPInstanceUID) == entry.get("sopInstanceUID"), f"SOP Instance UID mismatch in {path.name}")
        require(UID_RE.fullmatch(str(dataset.StudyInstanceUID)) is not None, "Study UID is outside synthetic 2.25 namespace")
        require(UID_RE.fullmatch(str(dataset.SeriesInstanceUID)) is not None, "Series UID is outside synthetic 2.25 namespace")
        require(UID_RE.fullmatch(str(dataset.FrameOfReferenceUID)) is not None, "Frame UID is outside synthetic 2.25 namespace")
        require(str(dataset.StudyInstanceUID) == manifest.get("studyInstanceUID"), "Study UID differs from manifest")
        require(str(dataset.SeriesInstanceUID) == manifest.get("seriesInstanceUID"), "Series UID differs from manifest")
        require(str(dataset.FrameOfReferenceUID) == manifest.get("frameOfReferenceUID"), "Frame of Reference UID differs from manifest")
        require(dataset.Modality == "CT", f"Modality mismatch in {path.name}")
        require(dataset.PatientID == EXPECTED_PATIENT_ID and str(dataset.PatientName) == EXPECTED_PATIENT_NAME, "DICOM Patient identity is not the synthetic allowlist")
        require(dataset.StudyDescription == EXPECTED_DESCRIPTION, "missing non-diagnostic Study Description")
        require("PatientBirthDate" not in dataset and "PatientAddress" not in dataset and "OtherPatientIDs" not in dataset, "unexpected patient-identifying attributes")
        require(not any(element.tag.is_private for element in dataset.iterall()), "private DICOM elements are not allowed")
        require(dataset.Rows == 128 and dataset.Columns == 128, f"pixel dimensions mismatch in {path.name}")
        require(dataset.SamplesPerPixel == 1 and dataset.PhotometricInterpretation == "MONOCHROME2", f"pixel interpretation mismatch in {path.name}")
        require(dataset.BitsAllocated == 16 and dataset.BitsStored == 16 and dataset.HighBit == 15 and dataset.PixelRepresentation == 1, f"pixel encoding mismatch in {path.name}")
        require(int(getattr(dataset, "NumberOfFrames", 1)) == 1, f"multi-frame data is outside this fixture profile: {path.name}")
        require(len(dataset.PixelData) == dataset.Rows * dataset.Columns * 2, f"Pixel Data length mismatch in {path.name}")
        values = (value[0] for value in struct.iter_unpack("<h", dataset.PixelData))
        pixels = list(values)
        require(min(pixels) == entry.get("pixelValueMin") and max(pixels) == entry.get("pixelValueMax"), f"pixel value range mismatch in {path.name}")
        expected_sops.add(str(dataset.SOPInstanceUID))

    require(len(expected_sops) == len(instances), "SOP Instance UIDs are not unique")
    require(manifest.get("instanceCount") == len(instances), "manifest instance count mismatch")
    require(manifest.get("totalBytes") == sum(entry["sizeBytes"] for entry in instances), "manifest total byte count mismatch")

    print("fixture_validation=PASS")
    print(f"fixture_id={manifest['fixtureId']} modality=CT sop_class={manifest['sopClassUID']}")
    print(f"transfer_syntax={manifest['transferSyntaxUID']} studies=1 series=1 instances={len(instances)}")
    print(f"manifest_sha256={hashlib.sha256(raw_manifest).hexdigest()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
