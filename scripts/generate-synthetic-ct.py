#!/usr/bin/env python3
"""Generate a deterministic, non-diagnostic CT phantom for MediQ ENV-007."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import struct
import tempfile
from pathlib import Path

import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, UID


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "synthetic-ct-env007"
FIXTURE_ID = "MEDIQ-ENV-007-SYNTHETIC-CT-V1"
PATIENT_ID = "TEST-PATIENT-007"
PATIENT_NAME = "SYNTHETIC^TEST"
STUDY_DATE = "20200101"
STUDY_TIME = "120000"
ROWS = 128
COLUMNS = 128
INSTANCE_COUNT = 3
SOP_CLASS_UID = str(CTImageStorage)
TRANSFER_SYNTAX_UID = str(ExplicitVRLittleEndian)
STUDY_UID = None
SERIES_UID = None
FRAME_UID = None
IMPLEMENTATION_UID = None


def stable_uid(label: str) -> str:
    """Return a deterministic DICOM UID under the UUID-derived 2.25 root."""
    digest = hashlib.sha256(f"{FIXTURE_ID}:{label}".encode("ascii")).digest()[:16]
    return f"2.25.{int.from_bytes(digest, byteorder='big', signed=False)}"


STUDY_UID = stable_uid("study")
SERIES_UID = stable_uid("series")
FRAME_UID = stable_uid("frame-of-reference")
IMPLEMENTATION_UID = stable_uid("implementation")


def synthetic_pixels(slice_index: int) -> tuple[bytes, int, int]:
    """Build a small geometric phantom; values are synthetic and non-diagnostic."""
    pixel_values: list[int] = []
    center_x = (COLUMNS - 1) / 2
    center_y = (ROWS - 1) / 2
    for y in range(ROWS):
        for x in range(COLUMNS):
            dx = x - center_x
            dy = y - center_y
            if (dx / 46) ** 2 + (dy / 57) ** 2 > 1:
                value = -1000
            elif (
                ((x - (center_x - 20)) / 13) ** 2 + ((y - (center_y - 1)) / 27) ** 2 < 1
                or ((x - (center_x + 20)) / 13) ** 2 + ((y - (center_y - 1)) / 27) ** 2 < 1
            ):
                value = -850
            elif ((dx - (slice_index - 1)) / 7) ** 2 + ((dy - 29) / 9) ** 2 < 1:
                value = 650
            elif any(
                (dx - rib_x) ** 2 + (dy - rib_y) ** 2 < 3.5**2
                for rib_x, rib_y in (
                    (-31, -28), (-37, -12), (-39, 7), (-33, 25),
                    (31, -28), (37, -12), (39, 7), (33, 25),
                )
            ):
                value = 320
            else:
                value = 35
            pixel_values.append(value)

    pixel_bytes = struct.pack(f"<{len(pixel_values)}h", *pixel_values)
    return pixel_bytes, min(pixel_values), max(pixel_values)


def build_dicom(instance_number: int) -> tuple[bytes, str, int, int]:
    sop_uid = stable_uid(f"instance-{instance_number:03d}")
    file_meta = FileMetaDataset()
    file_meta.FileMetaInformationVersion = b"\x00\x01"
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = UID(sop_uid)
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = UID(IMPLEMENTATION_UID)
    file_meta.ImplementationVersionName = "MEDIQENV007V1"

    dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\x00" * 128)
    dataset.SpecificCharacterSet = "ISO_IR 192"
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = UID(sop_uid)
    dataset.PatientName = PATIENT_NAME
    dataset.PatientID = PATIENT_ID
    dataset.PatientSex = "O"
    dataset.StudyInstanceUID = UID(STUDY_UID)
    dataset.StudyDate = STUDY_DATE
    dataset.StudyTime = STUDY_TIME
    dataset.AccessionNumber = "TESTACC-ENV007"
    dataset.ReferringPhysicianName = "SYNTHETIC^PHYSICIAN"
    dataset.StudyID = "ENV007"
    dataset.StudyDescription = "SYNTHETIC NON-DIAGNOSTIC CT PHANTOM"
    dataset.Modality = "CT"
    dataset.SeriesInstanceUID = UID(SERIES_UID)
    dataset.SeriesNumber = 1
    dataset.SeriesDescription = "SYNTHETIC AXIAL PHANTOM"
    dataset.BodyPartExamined = "CHEST"
    dataset.PatientPosition = "HFS"
    dataset.Manufacturer = "MediQ Synthetic"
    dataset.InstitutionName = "MediQ Test Lab"
    dataset.ManufacturerModelName = "Synthetic CT Generator"
    dataset.SoftwareVersions = "ENV007V1"
    dataset.FrameOfReferenceUID = UID(FRAME_UID)
    dataset.ImageType = ["ORIGINAL", "PRIMARY", "AXIAL"]
    dataset.InstanceNumber = instance_number
    dataset.AcquisitionNumber = 1
    dataset.AcquisitionDate = STUDY_DATE
    dataset.AcquisitionTime = STUDY_TIME
    dataset.ContentDate = STUDY_DATE
    dataset.ContentTime = STUDY_TIME
    dataset.ImagePositionPatient = [0, 0, instance_number - 2]
    dataset.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    dataset.SliceThickness = 1
    dataset.SpacingBetweenSlices = 1
    dataset.PixelSpacing = [0.7, 0.7]
    dataset.KVP = 120
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.Rows = ROWS
    dataset.Columns = COLUMNS
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 1
    dataset.RescaleIntercept = 0
    dataset.RescaleSlope = 1
    dataset.RescaleType = "HU"
    pixel_bytes, pixel_min, pixel_max = synthetic_pixels(instance_number)
    dataset.PixelData = pixel_bytes

    buffer = io.BytesIO()
    pydicom.dcmwrite(buffer, dataset, enforce_file_format=True)
    return buffer.getvalue(), sop_uid, pixel_min, pixel_max


def expected_artifacts() -> dict[str, bytes]:
    artifacts: dict[str, bytes] = {}
    instances = []
    total_bytes = 0
    for number in range(1, INSTANCE_COUNT + 1):
        filename = f"instance-{number:03d}.dcm"
        content, sop_uid, pixel_min, pixel_max = build_dicom(number)
        artifacts[filename] = content
        total_bytes += len(content)
        instances.append(
            {
                "file": filename,
                "sopInstanceUID": sop_uid,
                "instanceNumber": number,
                "rows": ROWS,
                "columns": COLUMNS,
                "pixelValueMin": pixel_min,
                "pixelValueMax": pixel_max,
                "sizeBytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )

    manifest = {
        "schemaVersion": 1,
        "fixtureId": FIXTURE_ID,
        "description": "Deterministic synthetic geometric CT phantom; non-diagnostic; not derived from patient data.",
        "generator": "scripts/generate-synthetic-ct.py",
        "pydicomVersion": pydicom.__version__,
        "patient": {"patientId": PATIENT_ID, "patientName": PATIENT_NAME},
        "modality": "CT",
        "sopClassUID": SOP_CLASS_UID,
        "transferSyntaxUID": TRANSFER_SYNTAX_UID,
        "studyInstanceUID": STUDY_UID,
        "seriesInstanceUID": SERIES_UID,
        "frameOfReferenceUID": FRAME_UID,
        "studyDate": STUDY_DATE,
        "rows": ROWS,
        "columns": COLUMNS,
        "instanceCount": INSTANCE_COUNT,
        "totalBytes": total_bytes,
        "instances": instances,
    }
    artifacts["manifest.json"] = (json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")
    return artifacts


def publish_or_verify(output: Path, artifacts: dict[str, bytes]) -> None:
    if output.exists():
        if not output.is_dir():
            raise SystemExit(f"Refusing to replace non-directory fixture target: {output}")
        actual_names = {item.name for item in output.iterdir()}
        if actual_names != set(artifacts):
            raise SystemExit("Fixture target already exists with an unexpected file set; no files were changed.")
        for name, expected in artifacts.items():
            if not (output / name).is_file() or (output / name).read_bytes() != expected:
                raise SystemExit("Fixture target differs from deterministic output; no files were changed.")
        print("fixture_generation=unchanged; deterministic output matches existing files")
        return

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".env007-ct-", dir=output.parent) as temporary:
        staging = Path(temporary)
        for name, content in artifacts.items():
            (staging / name).write_bytes(content)
        os.rename(staging, output)
    print("fixture_generation=created")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    if output != DEFAULT_OUTPUT.resolve():
        raise SystemExit("ENV-007 fixture output must remain at data/synthetic-ct-env007.")
    if pydicom.__version__ != "3.0.2":
        raise SystemExit(f"Expected pinned pydicom 3.0.2, found {pydicom.__version__}.")

    artifacts = expected_artifacts()
    publish_or_verify(output, artifacts)
    manifest = json.loads(artifacts["manifest.json"])
    print(f"fixture_id={FIXTURE_ID}")
    print(f"study_uid={STUDY_UID}")
    print(f"series_uid={SERIES_UID}")
    print(f"instance_count={INSTANCE_COUNT} total_bytes={manifest['totalBytes']}")
    print(f"manifest_sha256={hashlib.sha256(artifacts['manifest.json']).hexdigest()}")
    for item in manifest["instances"]:
        print(f"{item['file']} size={item['sizeBytes']} sha256={item['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
