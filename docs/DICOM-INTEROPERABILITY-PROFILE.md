# MediQ DICOM Interoperability Profile

**Project:** MediQ  
**Product:** Patient-Controlled Medical Imaging Mobility SaaS  
**Document Type:** DICOM Interoperability Profile / Implementation Contract  
**Version:** v1.6 Local Test Orthanc HTTPS and Patient Identity Gate
**Baseline Date:** 2026-10-01
**Scope:** CAPSTONE-P0 / Synthetic·Test DICOM  
**Status:** APPROVED PROFILE — typed Port/internal Orthanc adapter and local API↔Test Orthanc HTTPS implemented; A QIDO/WADO/frame + read-only B baseline and TLS validation pass with synthetic data; live STOW, product Authorization/Preflight, global Client↔MediQ TLS and full workflow NOT RUN
**Standards Baseline:** DICOM PS3.4, PS3.5, PS3.6, PS3.18 current online edition reviewed 2026-09-20

---

# 1. Executive Summary

MediQ P0의 DICOM 상호운용성 목표는 다음 단일 Golden Path를 재현 가능하게 검증하는 것이다.

```text
Hospital A Test Orthanc
  → authorized QIDO-RS Study discovery
  → authorized WADO-RS metadata / instance retrieval
  → MediQ opaque binary streaming and integrity evidence
  → mandatory PACS Import preflight
  → STOW-RS to Hospital B Test Orthanc
  → destination QIDO-RS verification
  → integrity VERIFIED / provenance / audit
```

P0 최소 검증 조합은 Classic single-frame CT 또는 MR Image Storage와 Explicit VR Little Endian이다. 첫 고정 Fixture는 Classic CT + Explicit VR Little Endian을 권고한다. 다른 SOP Class와 Transfer Syntax는 각 조합의 QIDO, WADO, STOW, Destination Verification 및 Viewer 시험이 통과하기 전까지 지원한다고 주장하지 않는다.

MediQ Gateway는 P0에서 Pixel Data decoder, encoder 또는 transcoder가 아니다. DICOM Part 10 객체를 byte-preserving 방식으로 전달하고 Metadata/UID·크기·무결성만 필요한 범위에서 처리한다. Pixel decode/render는 OHIF/Cornerstone3D 또는 검증된 Source PACS rendered response가 담당한다.

2026-09-29 상태: ENV-005/006에서 digest-pinned Orthanc A/B readiness·인증·plugin·격리 subset을 확인했다. ENV-007에서는 결정론적 합성 CT fixture와 manifest를 생성·검증하고, DICOMweb STOW-RS로 A에만 seed했다. A QIDO는 1 Study/1 Series/3 Instance를 반환했고 재실행은 추가 STOW 없이 동일 set을 확인했으며 B는 seed 전후 비어 있었다. 이는 source fixture provisioning smoke이며 WADO payload, STOW to B, MediQ Adapter, Viewer, product authorization 또는 A→B transfer를 검증한 것이 아니다. 전체 Profile과 P0 Acceptance는 여전히 통과되지 않았다.

2026-10-01 amendment: `MEDIQ-DCM-001` defines the internal typed port and its synthetic compile-time conformance test. This does not implement a PACS client, make network calls, prove Orthanc behavior, or satisfy `AT-DICOM-001~004`. The older `MEDIQ-DICOM-001` streaming-spike reference is crosswalked to `MEDIQ-DCM-002`, the current plan's Orthanc adapter/compatibility ticket.

2026-10-01 DCM-002/PACS-001 amendment: `OrthancDicomwebAdapter` implements the internal QIDO/WADO/frame/STOW/destination-query Port with server-owned A/B endpoint resolution, streaming `multipart/related` parsing and bounded streams. Under `PACS-001-DEC-002`, WADO Study metadata also projects exactly one PatientID per instance into an internal-only typed result for the byte-preserving synthetic identity gate; it excludes unrelated patient fields and is not a public response or log value. Synthetic Orthanc A read-only integration confirms every instance PatientID matches the synthetic fixture mapping; no STOW was sent. Authorization/revocation fencing, full Mandatory Preflight, positive TLS, integrity/provenance/audit transaction, coordinator no-STOW proof and end-to-end acceptance remain open. DICOM PS3.18 specifies Explicit VR Little Endian as the default transfer syntax for `application/dicom` when none is specified; this adapter explicitly requests that syntax and rejects a conflicting response parameter. [PS3.18 §8.7.3.4](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_8.7.3.4.html), [§8.7.9](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_8.7.9.html).

---

# 2. Scope & Architecture Context

## 2.1 적용 경계

- 실제 환자정보가 없는 Synthetic/Test/De-identified DICOM만 사용한다.
- Hospital A는 Source of Record인 Test PACS다.
- Hospital B는 Destination Test PACS다.
- MediQ Cloud는 Permanent PACS나 장기 DICOM Archive가 아니다.
- Browser와 Mobile Client는 Orthanc/PACS를 직접 호출하지 않는다.
- QIDO/WADO/STOW는 MediQ Backend의 인증·인가·동의·Grant·Tenant 검증 뒤에만 실행한다.
- P0는 DICOMweb만 사용하며 DIMSE C-FIND/C-MOVE/C-STORE는 범위 밖이다.
- Azure는 POST-MVP Deployment Profile이며 P0 상호운용성 PASS의 전제조건이 아니다.

## 2.2 논리 구조

```text
Hospital User / Synthetic Patient
              │
              │ HTTPS + JWT + ViewerSession/Grant
              ▼
      MediQ API / Viewer Gateway
              │
              ├─ Authorization Policy
              ├─ DICOMweb Adapter
              ├─ Transfer Worker
              ├─ Integrity / Provenance
              └─ Audit
              │
       ┌──────┴──────┐
       │             │
       ▼             ▼
Hospital A         Hospital B
Test Orthanc       Test Orthanc
QIDO/WADO          STOW/QIDO verify
```

## 2.3 성공 판정

```text
HTTP success only                         ≠ PASS
Orthanc storage only                      ≠ Viewer PASS
Gateway pass-through only                 ≠ Decode/Render support
STOW response without instance review     ≠ Transfer complete
STOW success without destination verify   ≠ Exchange complete
Library capability                        ≠ MediQ support
```

---

# 3. Current Implementation Baseline

| 항목 | Repository Evidence | 상태 | 결론 |
|---|---|---|---|
| Docker Compose | `infra/docker-compose.yml`; PostgreSQL and Orthanc A/B running | ENV-004/005/006 runtime tested within ticket scopes | Fixture-backed A/B exchange not run |
| Orthanc image/version | Orthanc Team `26.9.1` digest pin; A/B `/system` report core `1.13.0` | A/B runtime tested | DICOM payload interoperability pending |
| DICOMweb plugin | A/B `/plugins` report `dicom-web`; authenticated QIDO/WADO responses observed | ENV-007 fixture provisioning and DCM-002 synthetic adapter integration | No destination-B STOW |
| Orthanc A/B config | Separate internal networks and volumes; healthchecks; no host-published ports | A/B readiness and boundary tested | Application integration pending |
| DICOM Gateway Port/adapter | Typed Port + `OrthancDicomwebAdapter`; server-owned A/B resolver; not registered as application route | `MEDIQ-DCM-001/002` scoped evidence | No Authorization wiring, Preflight or external product caller |
| Destination verification | Two complete B QIDO scans, exact Study→Series→SOP set comparison, duplicate/path/paging checks and five-minute cap | `MEDIQ-PACS-006` scoped unit + read-only B integration | No post-STOW verification, integrity, coordinator or completion claim |
| QIDO/WADO/frame | A fixture QIDO, minimal metadata, per-instance WADO hash/size, rendered JPEG | `MEDIQ-DCM-002` read-only Orthanc integration PASS | Synthetic fixture only; not a Viewer or Authorization claim |
| STOW/destination | STOW mock contract; B read-only baseline has 0 matching fixture instances | `MEDIQ-DCM-002` mocked STOW + B QIDO baseline | No live STOW or A→B transfer; Preflight remains mandatory |
| Multipart parser/proxy | `@ubercode/multipart-stream@1.1.0`, one-part streaming parser with byte/header/time caps | `MEDIQ-DCM-002` malformed/limit/Orthanc Acceptance | Single-maintainer dependency; source/lockfile reviewed, residual risk recorded |
| Viewer | OHIF 3.11 선택만 존재 | DOCUMENTED | 설치·연동 없음 |
| Synthetic DICOM fixture | Ignored `data/synthetic-ct-env007/`; 3 Classic CT instances, Explicit VR LE; A WADO stream matches manifest | ENV-007 + DCM-002 scoped PASS | No B transfer or Viewer integration |
| TLS/mTLS | `TLS-001-DEC-001`: Orthanc built-in HTTPS for local isolated Synthetic Test; CA/SAN validated, production topology separate | Scoped PASS — `MEDIQ-TLS-001` | Client↔MediQ ingress TLS, production PKI/proxy/cert lifecycle and mTLS remain NOT RUN |
| Integration test | Dedicated read-only container on internal A/B networks; A QIDO/WADO/frame and B baseline; no STOW | DCM-002 scoped PASS | No product Authorization or destination transfer |

`TLS-001-DEC-001` selects local Test CA certificates and `https://orthanc-a:8042`, `https://orthanc-b:8042`. Current source Compose/runtime is HTTPS-only, A/B remain on isolated internal networks without host-published ports, and the Test CA is mounted read-only into API/test clients for strict chain and hostname validation. Historical HTTP/basic-auth probes remain historical evidence only and do not count as TLS Acceptance.

---

# 4. Status Taxonomy

| 상태 | 의미 |
|---|---|
| `IMPLEMENTED` | 실제 데이터 경로에 코드와 설정이 존재함 |
| `TESTED` | 지정 조합과 실패경로가 실제 환경에서 통과함 |
| `DOCUMENTED` | 본 문서 또는 승인 기준에만 정의됨 |
| `PLANNED` | 후속 범위에 구현 예정 |
| `UNSUPPORTED` | 명시적으로 처리하지 않음 |
| `UNKNOWN` | 설치·구성·시험 증거가 없어 확인 불가 |

MediQ의 외부 지원 주장은 `TESTED` 조합에만 허용한다. `DOCUMENTED`는 구현 약속이지 현재 capability가 아니다.

---

# 5. DICOM Standards & References

| 문서 | 적용 내용 |
|---|---|
| DICOM PS3.4 | Storage SOP Class와 Service Class |
| DICOM PS3.5 | Data Encoding과 Transfer Syntax |
| DICOM PS3.6 | SOP Class/Transfer Syntax UID Registry |
| DICOM PS3.10 | DICOM File Format / Part 10 |
| DICOM PS3.11 | Media Storage Application Profiles |
| DICOM PS3.18 | QIDO-RS, WADO-RS, STOW-RS, Media Type, Multipart |
| DICOM PS3.2 | 향후 정식 DICOM Conformance Statement 구조 |
| IHE RAD PDI | Portable Media의 DICOM·Web Content·Basic Viewer 참고 구조 |

본 문서는 학생 MVP의 구현 프로파일이며 상용 제품의 정식 DICOM Conformance Statement를 대체하지 않는다. 표준의 `current` URL은 변경될 수 있으므로 구현 시 사용한 edition을 테스트 Evidence에 고정한다.

## 5.1 Legacy Portable Media Reference

사용자가 제공한 의료영상 CD 예시는 `DICOMDIR`, 무확장자 DICOM 객체 저장영역, JPEG/HTML Web Content, Windows 내장 Viewer와 AutoRun 구성요소를 함께 포함한다. 비식별 구조 조사 결과와 MediQ 적용 경계는 `references/MEDICAL-IMAGE-CD-MEDIA-REFERENCE.md`에 기록한다.

이 자료는 외부 참고자료이며 다음을 의미하지 않는다.

- MediQ P0가 CD/DVD/USB Import를 지원한다는 주장
- 해당 매체의 DICOM PS3.10 또는 IHE PDI Conformance 승인
- 실제 환자 DICOM을 Synthetic/Test Fixture로 사용할 수 있다는 승인
- 레거시 Viewer, AutoRun, HTA, ActiveX, EXE, DLL 또는 OCX의 재사용 승인

P0의 규범 경로는 계속 QIDO-RS, WADO-RS, STOW-RS와 Destination Verification이다. Portable Media Import는 별도 Scope Decision과 Synthetic Fixture, Patient Reconciliation, Malware Handling, DICOM Validation 시험 없이는 구현하지 않는다.

---

# 6. SOP Class Support Profile

## 6.1 P0 Core Profile

| SOP Class | UID | Frame | QIDO | WADO | STOW | Viewer | Project State |
|---|---|---|---|---|---|---|---|
| CT Image Storage | `1.2.840.10008.5.1.4.1.1.2` | Classic single-frame | Required | Required | Required | Required fixture | DOCUMENTED |
| MR Image Storage | `1.2.840.10008.5.1.4.1.1.4` | Classic single-frame | Required candidate | Required candidate | Required candidate | Required candidate | DOCUMENTED |

P0 Release Gate는 최소 Classic CT 또는 MR 한 Study의 전체 Golden Path다. 범위를 명확히 하기 위해 첫 Fixture는 CT를 권고한다. MR까지 “지원”이라고 표시하려면 MR 조합을 별도로 통과해야 한다.

## 6.2 Expansion Profile

| SOP Class | UID | 특성 | 목표 범위 | 상태 |
|---|---|---|---|---|
| Enhanced CT Image Storage | `1.2.840.10008.5.1.4.1.1.2.1` | Multi-frame | P1 | PLANNED |
| Enhanced MR Image Storage | `1.2.840.10008.5.1.4.1.1.4.1` | Multi-frame | P1 | PLANNED |
| Computed Radiography Image Storage | `1.2.840.10008.5.1.4.1.1.1` | Single-frame | P1 candidate | PLANNED |
| Digital X-Ray Image Storage — For Presentation | `1.2.840.10008.5.1.4.1.1.1.1` | Single-frame | P1 candidate | PLANNED |
| Ultrasound Image Storage | `1.2.840.10008.5.1.4.1.1.6.1` | Single-frame | P1 candidate | PLANNED |
| Secondary Capture Image Storage | `1.2.840.10008.5.1.4.1.1.7` | Single-frame | P1 candidate | PLANNED |

다음 capability는 서로 독립적으로 판정한다.

```text
Orthanc accepts object
Gateway retrieves object without corruption
Destination Orthanc stores object
Viewer decodes and renders object
```

Enhanced/Multi-frame, Presentation State, Structured Report, Segmentation, Video, Whole Slide Imaging은 P0에서 지원하지 않는다.

---

# 7. Transfer Syntax Profile

## 7.1 용어

| 용어 | 의미 |
|---|---|
| `PASS-THROUGH` | Pixel Data를 해석하지 않고 동일 byte representation을 전달 |
| `DECODE` | 압축/encapsulated Pixel Data를 raw pixel로 해석 |
| `ENCODE` | raw pixel을 특정 Transfer Syntax로 생성 |
| `TRANSCODE` | 한 Transfer Syntax에서 다른 Syntax로 변환 |
| `VIEWER-RENDER` | Viewer가 해당 Syntax를 화면에 표시 |
| `UNSUPPORTED` | 요청·전달·표시를 지원하지 않음 |

## 7.2 Transfer Syntax Matrix

| Transfer Syntax | UID | Gateway P0 | Viewer P0 | Scope | 상태 |
|---|---|---|---|---|---|
| Implicit VR Little Endian | `1.2.840.10008.1.2` | PASS-THROUGH candidate | Validation required | P0 compatibility | DOCUMENTED |
| Explicit VR Little Endian | `1.2.840.10008.1.2.1` | PASS-THROUGH core | Required fixture | P0 core | DOCUMENTED |
| Deflated Explicit VR Little Endian | `1.2.840.10008.1.2.1.99` | No claim | No claim | P1 decision | PLANNED |
| JPEG Baseline Process 1 | `1.2.840.10008.1.2.4.50` | PASS-THROUGH candidate | Decoder validation | P1 | PLANNED |
| JPEG Lossless SV1 | `1.2.840.10008.1.2.4.70` | PASS-THROUGH candidate | Decoder validation | P1 | PLANNED |
| JPEG 2000 Lossless | `1.2.840.10008.1.2.4.90` | PASS-THROUGH candidate | Decoder validation | P1 | PLANNED |
| JPEG 2000 | `1.2.840.10008.1.2.4.91` | PASS-THROUGH candidate | Decoder validation | P1 | PLANNED |
| RLE Lossless | `1.2.840.10008.1.2.5` | PASS-THROUGH candidate | Decoder validation | P1 | PLANNED |

## 7.3 P0 결정

- Gateway는 `DECODE`, `ENCODE`, `TRANSCODE` 지원을 주장하지 않는다.
- P0 Fixture는 Explicit VR Little Endian을 사용한다.
- Implicit VR Little Endian은 별도 Contract Test를 통과한 뒤 P0 compatibility로 승격한다.
- WADO `Accept`와 반환 Part의 `transfer-syntax`를 기록·검증하되 raw token이나 Patient Metadata는 로그에 남기지 않는다.
- Source와 Destination 사이에 Transcoding이 발생하면 원본 hash와 전송 object hash를 구분하고, 변환 정책·SOP Instance UID 처리 규칙이 승인되기 전에는 완료 처리하지 않는다.
- P0 기본 경로는 Source representation 보존이다.

---

# 8. QIDO-RS Profile

## 8.1 표준 Upstream 경로

| Operation | Method | Relative URI | P0 |
|---|---|---|---|
| Search for Studies | GET | `/studies` | Required |
| Search for Study Series | GET | `/studies/{StudyInstanceUID}/series` | Viewer Gate |
| Search for Series Instances | GET | `/studies/{StudyInstanceUID}/series/{SeriesInstanceUID}/instances` | Viewer Gate |

P0 응답은 `Accept: application/dicom+json`을 우선한다. XML Multipart는 P1 compatibility candidate다.

## 8.2 검색 Key 정책

| Key | P0 사용 | 제한 |
|---|---|---|
| `StudyInstanceUID` | Required | Exchange에 결합된 UID만 |
| `PatientID` | Internal only | QIDO filter uses server-resolved Hospital mapping; WADO metadata supplies the per-instance identity for exact destination comparison; never projected publicly or rewritten |
| `StudyDate` | Optional | Exchange 범위 내 보조 필터 |
| `Modality` / `ModalitiesInStudy` | Optional | allowlisted 값 |
| `AccessionNumber` | Not exposed | P1 결정 전 UI/API 금지 |
| `StudyDescription` | Display only | 로그·검색 최소화 |
| `SeriesInstanceUID` | Viewer internal | Session/Study binding 필수 |
| `SOPInstanceUID` | Viewer/verification internal | 단독 권한 아님 |

PatientName, 주민번호 또는 전체 병원 PatientID로 Tenant 간 검색하는 API는 만들지 않는다.

## 8.3 Query Behavior

- `limit`은 Study page당 최대 100, `offset`은 non-negative safe integer로 adapter 제한한다. Metadata 최대 2,000 instance, Study 최대 64 Series다 (`DCM-002-DEC-001`).
- Fuzzy Matching은 P0에서 `UNSUPPORTED`다.
- `includefield`는 Gateway allowlist로 제한한다.
- Empty Result는 정상 `200` 빈 목록으로 처리하고 PACS 장애와 구분한다.
- 응답 크기·항목 수가 정책 한도를 넘으면 fail closed하고 축소 query를 요구한다.
- Character Set은 DICOM Specific Character Set을 존중하고 내부 JSON은 UTF-8로 처리한다. 비ASCII fixture로 별도 시험한다.
- Browser가 raw QIDO endpoint를 호출하지 않는다. MediQ의 `GET /exchange-sessions/{sessionId}/studies`가 승인된 Projection만 반환한다.

---

# 9. WADO-RS Profile

## 9.1 Upstream Operation

| Operation | Method | Relative URI | Accept | P0 |
|---|---|---|---|---|
| Retrieve Study | GET | `/studies/{study}` | `multipart/related; type=application/dicom` | Transfer candidate |
| Retrieve Series | GET | `/studies/{study}/series/{series}` | `multipart/related; type=application/dicom` | Viewer candidate |
| Retrieve Instance | GET | `/studies/{study}/series/{series}/instances/{instance}` | `multipart/related; type=application/dicom` | Required |
| Retrieve Study Metadata | GET | `/studies/{study}/metadata` | `application/dicom+json` | Viewer required |
| Retrieve Series Metadata | GET | `/studies/{study}/series/{series}/metadata` | `application/dicom+json` | Viewer required |
| Retrieve Instance Metadata | GET | `/studies/{study}/series/{series}/instances/{instance}/metadata` | `application/dicom+json` | Optional |
| Retrieve Frames | GET | `.../instances/{instance}/frames/{frameList}` | `multipart/related; type=application/octet-stream` | Validation Gate |
| Retrieve Rendered Frame | GET | `.../frames/{frameList}/rendered` | `image/jpeg` or negotiated image type | Fallback candidate |

## 9.2 MediQ External Contract

현재 `OPENAPI.yaml`은 다음 MediQ-controlled path만 정의한다.

```text
GET /exchange-sessions/{sessionId}/studies
GET /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}
GET /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}/frames/{frameNumber}
```

이 경로는 DICOMweb 표준 endpoint 자체가 아니라 authorization-protected application projection이다. Instance 응답은 단일 `application/dicom`, frame 응답은 `image/jpeg`로 정규화한다. OHIF가 요구하는 Study/Series/Instance metadata facade는 현재 OpenAPI에 완전하지 않으므로 구현 전에 계약을 보완해야 한다.

## 9.3 Retrieval Rules

- PACS endpoint와 credential은 Backend에서만 주입한다.
- ViewerSession, Actor, Tenant, PatientReference, Source Hospital, Study, Grant, Consent, expiry를 매 요청 검증한다.
- Study/Series 전체를 메모리에 적재하지 않고 Instance 또는 bounded chunk 단위로 streaming한다.
- upstream `Content-Type`, boundary, DICOM UID, payload length 한도와 hash를 검증한다.
- 취소 signal과 backpressure를 upstream까지 전달한다.
- Source PACS 장애 시 Cloud 영구 Copy로 우회하지 않는다.
- Partial WADO response는 완전한 성공으로 처리하지 않는다.

---

# 10. STOW-RS Profile

## 10.1 Request

| 항목 | P0 규칙 |
|---|---|
| Method | `POST` |
| Target | Hospital B allowlisted DICOMweb `/studies` 또는 `/studies/{StudyInstanceUID}` |
| Content-Type | `multipart/related; type="application/dicom"; boundary=...` |
| Part Content-Type | `application/dicom` |
| Payload | 승인된 Study의 Part 10 Instance |
| Batch | bounded instance count/bytes; 값은 Size Policy 적용 |

## 10.2 Mandatory Preflight

```text
Authentication PASS
Tenant Isolation PASS
ExchangeSession valid
Consent ACTIVE and PACS_IMPORT allowed
TransferGrant ACTIVE and study:pacs-transfer
Recipient/Destination binding PASS
Destination PatientMapping VALID
Study/Package/Source binding PASS
Destination endpoint allowlisted
TLS certificate validation PASS
Integrity/provenance context created
```

하나라도 실패하면 STOW-RS를 호출하지 않는다.

`PACS-001-DEC-001`의 P0 identity binding은 추가 필수 조건이다. 모든 source instance의 PatientID가 하나의 유효한 값으로 확인되고, server-resolved destination mapping의 `localPatientId`와 정확히 일치해야 한다. 값이 없거나, malformed/inconsistent/mismatched이면 STOW 전에 거부한다. P0 payload는 byte-preserving이며 PatientID 또는 다른 DICOM attribute를 수정하지 않는다. 이 합성 exact-match 규칙은 실제 환자 신원 증명을 의미하지 않는다.

STOW 실행 전에는 durable per-study transfer operation/idempotency claim도 저장되어야 한다. POST가 시작된 뒤 결과가 불명확하면 `RESULT_UNKNOWN`으로 보존하고 read-only destination reconciliation 전에는 blind retry하지 않는다.

## 10.3 Response and Completion

| Response | 처리 |
|---|---|
| `200 OK` | 전체 저장 후보. Response Module과 Destination Verification 후에만 완료 |
| `202 Accepted` | 일부 Instance warning/failure 가능. Partial로 처리하고 상세 파싱·검증 |
| `400 Bad Request` | 요청 형식 실패, 자동 retry 금지 |
| `409 Conflict` | UID/SOP/상태 충돌 가능, 자동 retry 금지 |
| `415 Unsupported Media Type` | Syntax/Media Type 불일치, 자동 retry 금지 |
| timeout/connection loss | 결과 불명. Destination Verification 전 blind retry 금지 |

STOW HTTP 응답만으로 `COMPLETED`를 반환하지 않는다. 다음 조건을 모두 만족해야 한다.

```text
Expected Instance set == Destination verified Instance set
Integrity status == VERIFIED
Provenance status == COMPLETED
Audit contains PACS_TRANSFER_COMPLETED
```

### 10.3.1 Exact destination hierarchy and QIDO completeness

Destination verification compares the authoritative expected `StudyInstanceUID → SeriesInstanceUID → SOPInstanceUID` hierarchy with the complete observed Hospital B hierarchy. Study existence or equal object counts alone are insufficient. The expected inventory must be non-empty, server-resolved, unique, valid and within the P0 limits (64 Series / 2,000 Instances). Destination QIDO rows must be checked against the requested Study/Series path; duplicate Series or SOP Instance UIDs, missing/extra identities and wrong hierarchy are rejected or reported as a mismatch.

QIDO-RS `limit` and `offset` pagination is used for bounded enumeration. The adapter follows the DICOM PS3.18 Warning 299 indication for additional results, advances offsets safely, rejects non-progress/inconsistent or over-limit results, and does not call a capped first page a complete inventory. The normative pagination semantics and the warning for remaining results are specified in [DICOM PS3.18 §8.3.4.4](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_8.3.4.4.html). PS3.18 also warns that offset results may be inconsistent if the origin's contents change during pagination. The internal verifier therefore requires two identical complete scans and caps the total at five minutes; this reduces but does not eliminate concurrent-change risk. QIDO remains a time-bounded observation, not an atomic PACS snapshot; an inconsistent or unavailable scan cannot complete an Exchange.

An exact UID hierarchy match still does not prove byte integrity. `COMPLETED` additionally requires source↔destination content integrity, completed Provenance and the required completion Audit to be persisted atomically with the legal operation transition. The internal PACS-006 verifier alone does not authorize access, perform STOW or transition an operation to `COMPLETED`.

---

# 11. Rendered Frame Profile

## 11.1 Path Comparison

| 항목 | Path A: PACS Rendered Image | Path B: Original DICOM + Viewer Decode |
|---|---|---|
| CPU | PACS/Server 사용 | Browser/Viewer 사용 |
| Network | 보통 작음 | 원본 크기 |
| 원본 보존 | 화면 결과만 전달 | 원본 representation 전달 |
| Window/Level | server parameter 의존 | Viewer interactive 처리 |
| 압축 호환성 | PACS decoder 의존 | Viewer decoder 의존 |
| Multi-frame | PACS 구현 의존 | Viewer 구현 의존 |
| Cache 위험 | rendered PHI image | DICOM object/metadata |
| P0 역할 | fallback/thin-client candidate | OHIF primary candidate |

## 11.2 P0 결정

- OHIF의 기본 방향은 Path B다.
- MediQ frame endpoint의 `image/jpeg` Path A는 fallback/validation 대상이다.
- Rendered JPEG를 원본 DICOM 또는 진단 품질과 동일하다고 주장하지 않는다.
- Window Center/Width, frame list, output media type은 allowlist와 numeric bound를 적용한다.
- Frame Number는 1-based DICOMweb 의미를 유지하고 존재하지 않는 frame은 `404`/safe error로 처리한다.
- Multi-frame 객체는 P1이며 P0 support claim에서 제외한다.

---

# 12. Multipart HTTP Rules

## 12.1 적용 위치

| 흐름 | Multipart |
|---|---|
| QIDO JSON response | 사용하지 않음 |
| QIDO XML response | `multipart/related` 가능, P0 비사용 |
| WADO Study/Series/Instance set | `multipart/related; type="application/dicom"` |
| WADO Frames | `multipart/related; type="application/octet-stream"` 또는 negotiated compressed type |
| STOW request | `multipart/related; type="application/dicom"` |
| MediQ normalized single Instance response | 단일 `application/dicom` |
| MediQ rendered frame response | 단일 `image/jpeg` |

## 12.2 Parser/Writer Invariants

- Header parameter에서 boundary를 엄격히 추출하고 body와 일치시키며 길이 상한을 둔다.
- DICOM binary를 문자열로 변환하지 않는다.
- 각 Part의 `Content-Type`을 검증한다.
- CRLF, closing boundary, truncated body, missing part를 검증한다.
- Part ordering에 권한 또는 성공 판정을 의존하지 않고 SOP Instance UID로 추적한다.
- `Content-Length`가 있으면 실제 byte 수와 비교한다. 없으면 bounded chunked streaming을 허용한다.
- parser error, unexpected media type, 초과 크기에서 즉시 중단하고 부분 객체를 삭제한다.
- 전체 body buffering 대신 streaming parser/serializer를 우선한다.
- Framework helper를 사용하더라도 binary integrity와 backpressure를 Contract Test한다.

직접 만든 ad-hoc 문자열 split parser는 금지한다. 사용할 library가 대용량 stream과 malformed multipart를 안전하게 처리하지 못하면 검증된 streaming parser 또는 bounded temporary file pipeline을 선택한다.

---

# 13. Timeout Policy

현재 구현값은 모두 `UNKNOWN`이다. 아래 값은 작은 Synthetic P0 환경의 초기 `PROPOSED VALUE`이며 benchmark와 장애주입 후에만 `VALIDATED VALUE`로 승격한다.

| 구간 | Timeout Type | Current | Proposed | 근거/실패 처리 |
|---|---|---:|---:|---|
| Browser → MediQ metadata API | Total | UNKNOWN | 30 s | 취소 후 safe error |
| Browser → Viewer Instance | Response idle | UNKNOWN | 60 s | 해당 Instance 실패, Session 유지 여부 재검증 |
| MediQ → Orthanc A/B | Connection | UNKNOWN | 5 s | upstream unavailable |
| MediQ → Orthanc A/B | TLS handshake | UNKNOWN | 10 s | certificate/TLS failure, no retry by default |
| QIDO | Response header | UNKNOWN | 15 s | bounded GET retry 가능 |
| QIDO | Total | UNKNOWN | 30 s | failure Audit |
| WADO Instance | Response header | UNKNOWN | 30 s | body 시작 전 retry 판단 |
| WADO Instance | Read idle | UNKNOWN | 60 s | partial object 폐기 |
| WADO Instance | Total per instance | UNKNOWN | 120 s | hash incomplete, retry policy 적용 |
| STOW batch | Response header | UNKNOWN | 30 s | 결과 불명 상태 구분 |
| STOW batch | Write/Read idle | UNKNOWN | 60 s | destination verify before retry |
| STOW batch | Total | UNKNOWN | 180 s | operation FAILED/UNKNOWN, not complete |
| Transfer Worker | Total job | UNKNOWN | 15 min | cancel/verification/purge |
| PostgreSQL statement | Statement | UNKNOWN | 10 s | DB error, external transfer와 분리 |
| PostgreSQL transaction | Transaction | UNKNOWN | 30 s | long DB transaction 금지 |
| Azure ingress | Platform limit | N/A | OPEN DECISION | POST-MVP profile에서 검증 |

Timeout은 환경변수로 설정하되 무제한 또는 0을 허용하지 않는다. `Total`만 두지 않고 connection, header, idle, operation deadline을 구분한다.

---

# 14. Retry & Idempotency Policy

| Operation | Retry | Proposed Policy | Retryable | Non-retryable |
|---|---|---|---|---|
| QIDO GET | 제한적 허용 | 총 2회, 250 ms base full-jitter, 2 s cap | connect reset, timeout, 408, 429, 502, 503, 504 | 400, 401, 403, 404 |
| WADO GET | 조건부 허용 | body byte 수신 전 1회; partial body는 폐기 후 Instance 단위 재시작 | transient network/5xx | auth, scope, UID mismatch, media type error |
| STOW POST | blind retry 금지 | timeout/응답 유실 시 Destination QIDO verify 후 missing Instance만 판단 | 검증된 미수신 Instance | 400, 409, 415, auth/mapping/destination failure |

## 14.1 STOW Lost Response

```text
STOW request sent
  → response lost
  → mark outcome UNKNOWN, never COMPLETED
  → revalidate Consent/Grant/expiry/destination
  → Destination QIDO verification by expected SOP Instance UID set
  → all present: verify integrity/provenance, no resend
  → subset missing: retry missing set only under same Transfer Operation context
  → cannot verify: fail closed and require operator decision
```

## 14.2 Idempotency Invariants

- Transfer Operation ID와 request fingerprint를 Session/Grant/Study/Destination에 binding한다.
- 같은 idempotency key에 다른 payload나 destination이 오면 거부한다.
- Authorization retry와 network retry를 분리한다.
- 만료/취소된 Grant를 retry 명목으로 재사용하지 않는다.
- Token reissue는 새 Authorization Decision이며 자동 전송 재개가 아니다.
- Duplicate Instance를 무조건 성공으로 간주하지 않고 destination의 SOP UID와 integrity evidence를 확인한다.

제시된 횟수와 backoff는 `PROPOSED`이며 장애주입 시험 전에는 확정 운영값이 아니다.

---

# 15. Maximum Object & Transfer Size

DCM-002 adapter의 즉시 적용되는 P0 guardrail은 아래 표처럼 확정했다. `MEDIQ-INT-001`은 해시 입력의 안전한 경계를 위해 2 GiB manifest-builder cap만 추가로 채택한다. 이 값은 Study 전체의 PACS retrieval/transfer/temporary-storage 한도를 확정하지 않으며, 해당 동작은 별도 transfer-orchestration ticket 전까지 구현 범위가 아니다.

| 항목 | Proposed P0 Limit | 상태 | 초과 시 |
|---|---:|---|---|
| Maximum DICOM Instance Size | 64 MiB | DCM-002 INITIAL GUARDRAIL | retrieval/store fail closed |
| Maximum Study Size | 2 GiB | INT-001 manifest builder only; end-to-end transfer DEFERRED | builder는 fail closed; 전체 transfer 제한은 미확정 |
| Maximum Series Count | 64 | DCM-002 INITIAL GUARDRAIL | bounded error |
| Maximum Instance Count | 2,000 | DCM-002 INITIAL GUARDRAIL | bounded error |
| Maximum STOW Multipart Batch | 100 instances 또는 256 MiB 중 먼저 도달 | OPEN DECISION | 다음 batch 분할 |
| Maximum Concurrent DICOM Operations | 2 | DCM-002 INITIAL GUARDRAIL | bounded queue/backpressure |
| Destination Verification Total Time | 5 min | PACS-006 INITIAL GUARDRAIL | abort and remain non-complete |
| Temporary Storage per Package/Exchange | 2 GiB | PACS-001-DEC-007 P0 recommendation; Acceptance NOT RUN | fail closed/purge |
| Temporary Storage per Environment | 10 GiB | PACS-001-DEC-007 P0 recommendation; Acceptance NOT RUN | atomic admission control |
| Maximum Transfer Phase after successful source capture | 15 min | PACS-001-DEC-007 P0 recommendation; Acceptance NOT RUN (separate from existing 30-minute source-capture deadline) | cancel/verify/purge |

이 값은 DICOM 표준 제한이 아니라 MediQ P0의 단계별 guardrail이다. DCM-002 tests verified page/metadata, multipart-header and per-instance stream caps. INT-001 tests the 2 GiB aggregate ceiling through a narrowed test cap; it does not process a 2 GiB fixture. Production memory high-water, throughput, study-wide retrieval and disk-spill benchmarks remain NOT RUN; those require a later workload-specific recommendation and test.

## 15.1 Memory/Storage Rules

- Study 전체를 Buffer/Blob 한 개로 메모리에 적재하지 않는다.
- Node Web Streams와 backpressure를 사용한다.
- PACS-001-DEC-014/015의 WADO 경로는 pull 기반 multipart part 소비와 adapter 소유의 enqueue 전 64 MiB 검사를 사용한다. 설치된 multipart-stream 1.1.0의 optional counter/backpressured EOF 결함을 실제 시험으로 재현했으며, MIT 원본 출처·해시·라이선스를 보존한 `vendor/multipart-stream` 패치를 사용한다. 정상 EOF는 parser의 closing-boundary 검사와 part drain으로 확인하며, source/parser 오류·truncation·idle/total deadline·abort를 성공으로 변환하지 않는다. 최대 2 GiB/2,000-object 통합 시험은 생성된 합성 byte workload이며 임상 DICOM 적합성 또는 실제 PACS 전송 성공을 뜻하지 않는다.
- 임시 저장 정책은 `PACS-001-DEC-007/008`을 따른다. 구현에는 optional internal same-stream AES-GCM seam이 있으나 Nest/Compose runtime에는 등록되지 않았다. Metadata/purge/quota 및 단일 프로세스 streaming sub-gate의 scoped 증거는 PACS-001 evidence §§26–30에 기록되어 있다. DEC-016은 세 회차와 wrapper 최종 종료·정리까지 통과하여 STAGE-010 scoped PASS다(§34). 이후 DEC-017은 quota snapshot·완료 후 TTL·seal 경합 방지와 source→재인가 예약/주체 결속 quota→AVAILABLE/evidence/Audit→실패 정리를 연결했다(§§35–36). 단위/모형 시험은 통과했으나 실제 열람 인가 구현과 변경 후 서명 OIDC·PostgreSQL/RLS·Orthanc 검증은 남았다. STAGE-002/003/004/011/012 통합시험은 미실행이다. 별도의 30분 source deadline과 완료 후 30분 TTL을 보존하며 DB/store/receipt 만료를 일치시켜야 한다. 이 결과나 설계는 persistent runtime activation 또는 dispatch permission이 아니다.
- Study/Package 전체를 memory에 적재하지 않는다. 객체마다 새 DEK의 AES-256-GCM으로 암호화하고, synthetic 단일 프로세스 P0에서는 DEK를 process memory에만 둔다. Restart 또는 다른 replica에서는 복호화하지 않고 fail closed/purge 처리한다. Tenant/Session/Package/StudyReference/operation/고정 purpose/object reference/예상 길이·digest에 결속한다.
- 구현 시 가드레일은 객체 64 MiB, Package/Exchange 2 GiB·2,000 객체, Environment 10 GiB, 전송 최대 15분, 성공한 source capture 후 TTL 30분이다. 어느 한도든 넘으면 fail closed하고 부분 staging을 폐기한다.
- 완전한 GCM tag 및 예상 SHA-256/길이 검증 전에는 평문을 downstream에 한 byte도 제공하지 않는다. 일시 평문 메모리는 단일 객체(최대 64 MiB)로 제한하고 DICOM 동시 작업은 최대 2개다.
- 만료 시점부터 읽기를 즉시 거부한다. Terminal transfer 결과·취소·명시적 종료·TTL 만료 시 ciphertext와 unwrap capability를 삭제하며 Tenant별 `SERVICE` Actor/RLS 경계에서 purge Audit 증거를 기록한다. 파일시스템과 DB 사이의 실패는 idempotent retry로 수렴시킨다.
- PostgreSQL에 DICOM binary를 저장하지 않는다.
- Transfer 완료·실패·취소·TTL 만료 시 임시 객체를 제거한다.

---

# 16. Orthanc Configuration

## 16.1 Current vs Target

| 항목 | Current | P0 Target |
|---|---|---|
| Orthanc Version | A/B `/system`: core `1.13.0` | Orthanc Team `26.9.1` image digest pin; fixture compatibility remains |
| Docker Image | A/B image started and digest inspected | Same pin for both; separate runtime evidence |
| DICOMweb Plugin | A/B `/plugins`: `dicom-web`; authenticated QIDO returns DICOM JSON | Empty-store capability only; fixture-backed compatibility required |
| DICOMweb Root | A/B QIDO uses `/dicom-web/studies` | `/dicom-web/` |
| Hospital A | AET `MEDIQA`; authenticated fixture-backed QIDO returns 1 Study; 1 Series; 3 Instances; no host port | QIDO/WADO source role, app access over `hospital-a` network |
| Hospital B | AET `MEDIQB`; authenticated empty-store QIDO returns 200; no host port | STOW destination + QIDO verify role |
| HTTP Auth | A/B valid credentials accepted; missing/invalid rejected (401) | Server-side test secrets, no browser exposure |
| TLS | 없음 | reverse proxy 또는 Orthanc-supported TLS boundary |
| mTLS | 없음 | P0 SHOULD / Production recommended |
| Storage | 없음 | disposable test volume + quota |

## 16.2 Required DICOMweb Section

```json
{
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/"
  }
}
```

이는 목표의 최소 예시다. exact image/plugin에서 schema를 검증한 뒤 사용한다.

## 16.3 Security/Deployment Rules

- Orthanc HTTP interface를 공용 인터넷 또는 Browser에 노출하지 않는다.
- `RemoteAccessAllowed`가 필요하면 isolated Compose network와 인증 경계 안에서만 사용한다.
- Hospital A/B credential은 각각 분리하고 `.env` 또는 secret store에서 주입한다.
- 기본 `orthanc/orthanc` credential은 Acceptance profile에서 금지한다.
- DICOMweb server가 Orthanc HTTP server의 authentication/HTTPS 설정을 공유한다는 점을 구성 시험으로 확인한다.
- TLS termination 위치가 Reverse Proxy라면 proxy→Orthanc 구간과 forwarded header trust를 명시한다.
- Source/Destination endpoint는 Registry allowlist에서만 선택한다.
- Test storage는 재생성 가능해야 하며 운영 데이터가 섞이지 않아야 한다.

---

# 17. Orthanc Capability Matrix

ENV-005~007에서 확인한 것은 Test Orthanc의 readiness·인증·QIDO와 A fixture provisioning 범위다. 이는 MediQ Adapter capability 또는 제품 지원 판정이 아니다. 괄호는 목표 역할이며 지원 판정이 아니다.

| Capability | Hospital A | Hospital B | MediQ Gateway | Viewer |
|---|---|---|---|---|
| QIDO-RS | TESTED: fixture inventory (1/1/3) | TESTED: empty-store QIDO (0 Study) | UNKNOWN (target proxy/project) | UNKNOWN |
| WADO-RS | NOT TESTED (target source) | UNKNOWN (not required) | UNKNOWN (target stream) | UNKNOWN |
| STOW-RS | TESTED: local fixture seed only | NOT TESTED (target destination) | UNKNOWN (target client) | UNSUPPORTED |
| Retrieve Metadata | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Retrieve Frames | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Rendered Frame | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Multipart | UNKNOWN | UNKNOWN | UNKNOWN | UNSUPPORTED as parser |
| JPEG | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| JPEG 2000 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Multi-frame | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Orthanc 공식 plugin 기능과 특정 image/config의 활성 capability는 다르다. Compose 기동 후 endpoint별 Contract Test로 이 표를 갱신한다.

---

# 18. Viewer Compatibility

## 18.1 Selected Viewer

```text
Viewer: OHIF 3.11
Rendering: Cornerstone3D through OHIF
Data Source: MediQ Viewer Gateway only
Direct Orthanc/PACS URL: prohibited
Fallback: custom Cornerstone3D viewer after failed spike
```

## 18.2 Compatibility Matrix

| Capability | OHIF Requirement/Use | MediQ Current Contract | 상태 |
|---|---|---|---|
| Study List | QIDO or application projection | Exchange study list 있음 | DOCUMENTED |
| Series List | QIDO/metadata | public facade 불완전 | OPEN DECISION |
| Instance List/Metadata | DICOMweb metadata | public facade 불완전 | OPEN DECISION |
| Original Instance | WADO-RS style retrieval | normalized `application/dicom` endpoint | DOCUMENTED |
| Frame | frame retrieval | normalized `image/jpeg` endpoint | DOCUMENTED |
| Explicit VR LE CT | decoder/render | fixture 없음 | UNKNOWN |
| Explicit VR LE MR | decoder/render | fixture 없음 | UNKNOWN |
| Compressed Syntax | codec dependent | 시험 없음 | UNKNOWN |
| Multi-frame | viewer/data source dependent | P1 | PLANNED |
| Window/Level | metadata + pixel decode | OHIF target | DOCUMENTED |

OHIF가 DICOMweb을 공식 지원한다는 사실만으로 MediQ Viewer가 동작한다고 간주하지 않는다. ViewerSession header injection, metadata facade, token refresh, CORS, no-store, progressive retrieval 및 revoke/expiry를 실제 Browser E2E로 검증해야 한다.

---

# 19. Security Interoperability

## 19.1 Request Chain

```text
Authentication
  → Tenant/Actor binding
  → ExchangeSession validation
  → PatientReference/Study binding
  → Consent validation
  → Authorization Decision
  → Action-specific Grant validation
  → Hospital/Destination allowlist
  → TLS certificate validation
  → DICOMweb operation
  → Integrity / Provenance / Audit
```

## 19.2 Required Controls

- `study:view`, `study:download`, `study:pacs-transfer`를 독립 검증한다.
- QIDO 결과는 요청 Exchange와 PatientReference 범위로 제한한다.
- ViewerSession ID, URL, DICOM UID는 단독 credential이 아니다.
- Browser→Orthanc, Viewer→unprotected PACS, Hospital B→Hospital A direct access를 금지한다.
- Endpoint URL은 user input을 직접 사용하지 않고 Hospital Registry allowlist로 resolve한다.
- DNS rebinding, private address substitution, redirect를 제한해 SSRF를 방지한다.
- TLS 인증서 검증을 우회하지 않는다. P0 mTLS는 SHOULD이며 미적용만으로 전체 P0를 실패시키지 않는다.
- PACS Basic credential 또는 client certificate는 server-side secret로만 관리한다.
- 로그와 Audit에 Pixel Data, multipart body, raw token, password, private key를 남기지 않는다.
- DICOM metadata는 Synthetic이라도 최소 수집·표시하며 production PHI와 같은 경로 보호를 적용한다.
- 임시 객체와 response는 `Cache-Control: private, no-store` 정책을 적용한다.

## 19.3 Local TLS Decision and Gap

`TLS-001-DEC-001` selects Orthanc built-in HTTPS for the isolated local Synthetic Test profile only. A local Test CA issues distinct leaf certificates for A and B with exact service DNS SANs; API and integration clients trust that CA and still perform normal chain and hostname validation. Test private keys and CA material are generated outside Git under ignored local runtime data. The local configuration must reject HTTP origins and contain no `verify=false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, or permissive healthcheck.

**Implementation status (2026-10-01): PASS — local API↔Test Orthanc only.** Eight Ticket Acceptance cases pass, including exact HTTPS origin validation, trusted HTTPS, no HTTP fallback, untrusted/malformed trust rejection, DNS SAN mismatch, validated healthchecks and read-only DICOM hash/size compatibility. Named A/B Orthanc data volumes remained attached during service recreation; no STOW was executed. This does not complete Client↔MediQ ingress TLS or global `SEC-TLS-001/002`.

Production deployment architecture remains separate. Orthanc documentation generally recommends a production-grade reverse proxy and permits its built-in HTTPS for simple/intranet setups; therefore this local choice is not a production architecture decision. Production must separately determine TLS termination, upstream protection, certificate issuance/rotation, secret custody, and mTLS policy. A trusted CA installation with unknown scope or any verification bypass is never acceptance evidence.

---

# 20. Error Handling

| Failure | Gateway Result | Retry | Audit/State |
|---|---|---|---|
| QIDO empty | 정상 empty list | 불필요 | success/empty |
| QIDO timeout/5xx | `DICOMWEB_FAILURE` | bounded GET retry | failure + correlation |
| WADO wrong Content-Type | upstream protocol error | no | partial 삭제, failure |
| WADO truncated multipart | integrity/protocol failure | Instance policy | incomplete, not success |
| Unsupported SOP Class | explicit unsupported | no | failure |
| Unsupported Transfer Syntax | explicit unsupported | no blind transcode | failure |
| STOW 202 partial | partial outcome | verify missing only | not complete |
| STOW 409/415 | conflict/media type | no | failed |
| STOW timeout | unknown outcome | destination verify first | unknown/not complete |
| Destination verify mismatch | verification failure | policy decision | failed |
| Integrity mismatch | `INTEGRITY_FAILURE` | no automatic complete | failed |
| Invalid certificate | TLS failure | no insecure fallback | security Audit |
| Wrong Tenant/Scope/Destination | authorization denied | no | DENY, no upstream call |

Client에는 safe error code와 Correlation ID만 제공한다. Orthanc URL, credential, raw response body와 stack trace는 반환하지 않는다.

---

# 21. Interoperability Test Matrix

아래는 DICOM 상호운용성/제품 Acceptance 행렬이다. ENV-007의 A-only fixture provisioning STOW와 QIDO smoke는 이 행렬의 승인된 MediQ authorization·WADO·B destination·Viewer 조건을 대체하지 않으므로 관련 product tests는 `NOT RUN`으로 유지한다. 모든 테스트는 Synthetic DICOM만 사용한다.

| Test ID | SOP Class | Transfer Syntax | Operation | Expected Result | Status |
|---|---|---|---|---|---|
| DICOM-INT-001 | CT Image Storage | Explicit VR LE | QIDO Study | authorized Study 발견 | NOT RUN |
| DICOM-INT-002 | CT Image Storage | Explicit VR LE | WADO Metadata | DICOM JSON/UID 일치 | NOT RUN |
| DICOM-INT-003 | CT Image Storage | Explicit VR LE | WADO Instance | binary/hash/Content-Type PASS | NOT RUN |
| DICOM-INT-004 | CT Image Storage | Explicit VR LE | OHIF Render | Window/Level, scroll render | NOT RUN |
| DICOM-INT-005 | CT Image Storage | Explicit VR LE | STOW Hospital B | all Instance response 확인 | NOT RUN |
| DICOM-INT-006 | CT Image Storage | Explicit VR LE | Destination QIDO | complete paginated Study→Series→SOP hierarchy exactly equals the server-resolved expected set; integrity/provenance/Audit required for terminal completion | NOT RUN — no protected post-STOW coordinator |
| DICOM-INT-007 | CT Image Storage | Explicit VR LE | End-to-end | Integrity/Provenance/Audit PASS | NOT RUN |
| DICOM-INT-008 | MR Image Storage | Explicit VR LE | Full path | 별도 지원 판정 | NOT RUN |
| DICOM-INT-009 | CT Image Storage | Implicit VR LE | Full path | compatibility 판정 | NOT RUN |
| DICOM-INT-010 | Enhanced CT | Explicit VR LE | Multi-frame | P1 expected deferred | NOT RUN |
| DICOM-INT-011 | CT | JPEG Baseline | WADO/View/STOW | P1 decoder/pass-through 판정 | NOT RUN |
| DICOM-INT-012 | CT | JPEG 2000 Lossless | WADO/View/STOW | P1 decoder/pass-through 판정 | NOT RUN |
| DICOM-MP-001 | CT | Explicit VR LE | Valid multipart | 모든 Part byte-identical | NOT RUN |
| DICOM-MP-002 | CT | Explicit VR LE | Invalid boundary | reject, no partial success | NOT RUN |
| DICOM-MP-003 | CT | Explicit VR LE | Missing/truncated part | reject, cleanup | NOT RUN |
| DICOM-MP-004 | CT | Explicit VR LE | Unexpected Content-Type | reject | NOT RUN |
| DICOM-RES-001 | CT | Explicit VR LE | QIDO timeout | bounded retry then fail | NOT RUN |
| DICOM-RES-002 | CT | Explicit VR LE | WADO interruption | incomplete object discarded | NOT RUN |
| DICOM-RES-003 | CT | Explicit VR LE | STOW response loss | verify before retry, no duplicate | NOT RUN |
| DICOM-RES-004 | CT | Explicit VR LE | STOW partial success | missing set identified, not complete | NOT RUN |
| DICOM-SEC-001 | CT | Explicit VR LE | Invalid/expired certificate | DENY, no insecure fallback | NOT RUN |
| DICOM-SEC-002 | CT | Explicit VR LE | Wrong Hospital/Tenant | no QIDO/WADO/STOW call | NOT RUN |
| DICOM-SEC-003 | CT | Explicit VR LE | Wrong/expired Scope | DENY + Audit | NOT RUN |
| DICOM-SEC-004 | CT | Explicit VR LE | Consent revoked | subsequent retrieval/transfer DENY | NOT RUN |
| DICOM-PERF-001 | CT | Explicit VR LE | 2 GiB boundary fixture | memory ceiling/backpressure verified | NOT RUN |

## 21.1 Evidence Required

- Orthanc A/B image tag, digest, plugin version과 effective configuration
- Fixture manifest: SOP Class UID, Transfer Syntax UID, Study/Series/Instance count, size, hash
- Request/response headers with secrets and PHI redacted
- Per-instance STOW response interpretation
- Destination expected/actual UID set
- Source/transfer/destination hash evidence
- Viewer screenshot/trace without PACS endpoint leakage
- memory high-water mark, duration, retry count
- Audit and Provenance correlation

---

# 22. P0 / P1 / P2 Scope

## 22.1 P0 — MVP Required

- Orthanc A/B pinned containers and DICOMweb plugin
- Classic single-frame CT or MR fixture; first fixture CT 권고
- Explicit VR Little Endian
- authorized QIDO Study
- WADO Metadata/Instance streaming
- OHIF render for the selected fixture
- STOW multipart store to Hospital B
- partial response parsing, destination verification, integrity, provenance, audit
- bounded timeout, safe retry, duplicate prevention
- TLS and certificate validation

## 22.2 P1 — Expanded Interoperability

- CT/MR 둘 다 지원 claim
- Implicit VR LE full matrix
- JPEG/JPEG Lossless/JPEG 2000/RLE
- Enhanced CT/MR와 Multi-frame
- CR/DX/US/Secondary Capture
- rendered frame parameter profile와 broader OHIF codec validation

## 22.3 P2 / Productionization

- 이종 PACS Vendor별 Conformance Statement 대조
- 기관별 Capability Negotiation
- DIMSE bridge가 필요한 기관 지원
- 대규모 Transfer tuning, resume protocol, queue scaling
- mTLS/VPN/Private Link deployment profile
- 정식 DICOM Conformance Statement와 규제 검토

---

# 23. Open Decisions

| ID | 결정 항목 | 권고 | 차단 범위 |
|---|---|---|---|
| DICOM-DEC-001 | Exact Orthanc image/plugin tag+digest | 1.13 계열의 검증 가능한 official image pin | 환경 전체 |
| DICOM-DEC-002 | 첫 P0 Fixture | Classic CT + Explicit VR LE | Golden Path |
| DICOM-DEC-003 | MR을 같은 P0 Gate에 포함할지 | CT PASS 후 일정/평가 기준으로 결정 | 지원 claim |
| DICOM-DEC-004 | OHIF metadata facade | MediQ-controlled DICOMweb projection 추가 | Viewer |
| DICOM-DEC-005 | Path A/B Viewer | Path B primary, rendered Path A fallback | Viewer |
| DICOM-DEC-006 | Timeout values | 제안값으로 fault injection 후 확정 | Reliability |
| DICOM-DEC-007 | Size/concurrency limits | 64 MiB/instance, 2,000 instances adapter guardrails; 2 GiB applies to INT manifest builder only; end-to-end transfer/storage limits require workload benchmark | Transfer/Performance |
| DICOM-DEC-008 | STOW batch/idempotency contract | operation ID + expected Instance manifest | Transfer retry |
| DICOM-DEC-009 | Local TLS termination | reverse proxy profile 우선 검토 | Security PASS |
| DICOM-DEC-010 | Compressed Syntax | P1 조합별 decoder/pass-through 시험 | Expanded support |

---

# 24. Acceptance Criteria

다음 조건을 모두 충족해야 P0 DICOM Interoperability를 PASS로 판정한다.

1. Orthanc A/B와 DICOMweb plugin의 exact version/config가 재현된다.
2. Synthetic Fixture manifest가 SOP Class/Transfer Syntax/UID/count/hash를 가진다.
3. QIDO 결과가 Exchange/Tenant/Patient 범위를 벗어나지 않는다.
4. WADO는 전체 Study buffering 없이 선택 Instance를 온디맨드 전달한다.
5. Multipart valid/invalid/truncated 시험이 모두 기대대로 동작한다.
6. 선택 Fixture를 OHIF가 MediQ Gateway 경유로 렌더링한다.
7. Browser network trace에 PACS endpoint/credential이 없다.
8. PACS Import preflight 실패 시 STOW 요청이 0건이다.
9. STOW partial/timeout/duplicate 시나리오에서 잘못된 완료가 없다.
10. Hospital B의 expected Instance set과 실제 수신 set이 일치한다.
11. Integrity VERIFIED, Provenance COMPLETED, Audit correlation이 연결된다.
12. timeout, size, concurrency와 memory ceiling의 검증값이 기록된다.
13. TLS/certificate validation과 Wrong Tenant/Scope/Consent negative test가 PASS한다.
14. 각 SOP Class × Transfer Syntax 조합은 자체 Test가 PASS한 경우에만 지원으로 표시된다.

현재 모든 조건은 `NOT RUN`이며 문서 작성만으로 PASS 상태가 되지 않는다.

---

# 25. Final Decision Table

| 항목 | P0 지원 범위 | 구현 상태 | 검증 상태 | 비고 |
|---|---|---|---|---|
| SOP Class | Classic CT 또는 MR single-frame; first CT 권고 | DOCUMENTED | NOT RUN | 조합별 지원 claim |
| Transfer Syntax | Explicit VR Little Endian core | DOCUMENTED | NOT RUN | Implicit VR LE는 compatibility test |
| QIDO-RS | Study required; Series/Instance Viewer Gate | DOCUMENTED | NOT RUN | Browser raw QIDO 금지 |
| WADO-RS | Metadata + Instance stream; Frame gate | DOCUMENTED | NOT RUN | no full-study memory buffer |
| STOW-RS | bounded multipart to Hospital B | DOCUMENTED | NOT RUN | 200/202/partial 파싱 |
| Rendered Frame | JPEG fallback candidate | DOCUMENTED | NOT RUN | Path B OHIF primary |
| Multipart | streaming parse/write | DOCUMENTED | NOT RUN | malformed negative tests 필수 |
| Timeout | 계층별 proposed values | OPEN DECISION | NOT RUN | fault injection 후 확정 |
| Retry | QIDO/WADO bounded; STOW verify-before-retry | DOCUMENTED | NOT RUN | blind STOW retry 금지 |
| Maximum Size | 64 MiB instance / 2 GiB study proposal | OPEN DECISION | NOT RUN | benchmark 후 확정 |
| Orthanc | A/B 1.13-family + DICOMweb plugin target | DOCUMENTED | NOT RUN | exact image/plugin 미정 |
| Viewer | OHIF 3.11 via MediQ Gateway | DOCUMENTED | NOT RUN | metadata facade gap |

---

# 26. References

## 26.1 Project Baseline

- `PROJECT-CHARTER.md`
- `CAPSTONE-MVP-BOUNDARY.md`
- `PRODUCT-BASELINE.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `DOMAIN-MODEL.md`
- `SYSTEM-ARCHITECTURE.md`
- `TECH-STACK-DECISION.md`
- `DATA-FLOW.md`
- `OPENAPI.yaml`
- `THREAT-MODEL.md`
- `ACCEPTANCE-TESTS.md`
- `IMPLEMENTATION-PLAN.md`
- `P0-WEB-UI-UX-SPEC.md`
- `REPOSITORY-BASELINE-AUDIT.md`
- `references/MEDICAL-IMAGE-CD-MEDIA-REFERENCE.md`

## 26.2 Official Technical Sources

- [DICOM PS3.4 — Service Class Specifications](https://dicom.nema.org/medical/dicom/current/output/html/part04.html)
- [DICOM PS3.5 — Data Structures and Encoding](https://dicom.nema.org/medical/dicom/current/output/html/part05.html)
- [DICOM PS3.6 — Registry of DICOM UIDs](https://dicom.nema.org/medical/dicom/current/output/chtml/part06/chapter_a.html)
- [DICOM PS3.10 — Media Storage and File Format for Media Interchange](https://dicom.nema.org/medical/dicom/current/output/html/part10.html)
- [DICOM PS3.11 — Media Storage Application Profiles](https://dicom.nema.org/medical/dicom/current/output/html/part11.html)
- [DICOM PS3.18 — Web Services](https://dicom.nema.org/medical/dicom/current/output/html/part18.html)
- [IHE Radiology Technical Framework Volume 1 — Portable Data for Imaging](https://www.ihe.net/uploadedFiles/Documents/Radiology/IHE_RAD_TF_Vol1.pdf)
- [Orthanc DICOMweb Plugin](https://orthanc.uclouvain.be/book/plugins/dicomweb.html)
- [Orthanc Official Docker Images](https://orthanc.uclouvain.be/book/users/docker-orthancteam.html)
- [OHIF 3.11 DICOMweb Data Source](https://docs.ohif.org/3.11/configuration/datasources/dicom-web/)

# Hospital Prior Comparison P1 Interoperability Amendment — 2026-09-27

관련 과거 영상 비교는 기존 DICOMweb 경계를 다음과 같이 재사용한다.

- 후보 Metadata 검색은 Backend QIDO-RS Adapter가 수행하며 Browser가 PACS Endpoint를 직접 호출하지 않는다.
- 검색 범위는 Tenant, Hospital, MediQ Patient Reference, Exchange/Source Scope에 binding한다.
- 같은 Patient Reference의 모든 Study를 자동 허용하지 않고 후보·선택·Open 단계에서 Study별 `study:view`를 재검증한다.
- 비교 Pixel은 허용 Study 집합에 binding된 Short-lived Comparison Viewer Session을 통해 WADO-RS로 온디맨드 전달한다.
- Transfer Syntax/Codec 지원은 기존 Capability Matrix를 따르며 지원되지 않는 조합은 안전하게 실패한다.
- Side-by-side 표시는 임상적 동일성·진단·변화 판정을 의미하지 않는다.
- 비교 기능은 STOW-RS, PACS Import 상태 또는 Source of Record를 변경하지 않는다.

현재 QIDO Projection과 Multi-study Viewer Session API는 GAP이며 `MEDIQ-HCW-PR-001~002` Ticket 전에는 구현 완료로 간주하지 않는다.
