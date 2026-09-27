# Test Layout

- `contract/`: DICOMweb 및 외부 adapter contract
- `integration/`: API·DB·Orthanc 통합 테스트

DICOM 조합별 Contract/E2E 기준과 Evidence 형식은 [`../docs/DICOM-INTEROPERABILITY-PROFILE.md`](../docs/DICOM-INTEROPERABILITY-PROFILE.md)를 따른다.
- `security/`: consent, grant, tenant isolation, audit 테스트
- `e2e/`: Hospital A → MediQ → Hospital B acceptance 테스트
