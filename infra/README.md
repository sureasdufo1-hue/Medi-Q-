# Local Infrastructure

이 디렉터리는 Hospital A/B Test Orthanc와 로컬 개발 의존 서비스를 둔다.

예정 파일:

- `docker-compose.yml`
- `orthanc/a-config.json`
- `orthanc/b-config.json`
- `seed/` Synthetic DICOM 적재 스크립트

실제 PACS 주소·Credential·운영 데이터는 저장하지 않는다.

DICOMweb endpoint, Orthanc capability, TLS, size 및 retry 기준은 [`../docs/DICOM-INTEROPERABILITY-PROFILE.md`](../docs/DICOM-INTEROPERABILITY-PROFILE.md)를 따른다.
