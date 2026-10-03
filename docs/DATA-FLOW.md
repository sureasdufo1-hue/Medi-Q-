# MediQ Data Flow Specification

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `DATA-FLOW.md`
**Version:** v1.5 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ의 주요 의료영상 이동 경로를 **End-to-End Data Flow 및 Sequence 수준으로 정의**한다.

상위 Architecture에서 정의한:

```text
Control Plane
Imaging Plane
Security Plane
Edge Plane
```

을 실제 사용자·시스템 간 데이터 이동 순서로 변환한다.

본 문서에서 확정하는 P0 Flow는 다음 세 가지다.

## 1.1 합성 AI 질문자료 Local Flow

```text
TEST/SYNTHETIC 검사 Record
  → Local Allowlist Selection
  → Identifier 제외
  → 질문 Text Preview
  → 사용자 확인
  → Local Clipboard Copy
  → MediQ Flow 종료
```

외부 LLM 열기·붙여넣기·전송은 MediQ 데이터 흐름이 아니다. MVP에는 외부 LLM Endpoint, Deep Link, 자동 Upload 또는 응답 수신 경로가 없다. 실제 건강정보 입력은 Gate 미충족 시 시작 단계에서 거부한다.

## 1.2 합성 환자 설명 RAG Flow

```text
Synthetic Record + Allowed Intent
  → TEST/SYNTHETIC/MOCK Gate
  → Allowlist Context
  → Active Manifest·Hash 검증
  → Local Retrieval
  → 근거 충분성·충돌 검사
  → Mock/Local Experimental Generation
  → Citation·Safety·PII Validator
  ├─ PASS: 근거·질문·한계 Projection
  └─ FAIL: ABSTAINED
  → Buffer 제거 + 내용 없는 Audit
```

금지 Flow는 `RAG → Internet`, `RAG → External LLM`, `RAG Answer → Medical Record`, `RAG → Consent/Auth/Grant/Preflight`다.

```text
FLOW-01
Hospital A → MediQ → Web Viewer

FLOW-02
Hospital A → MediQ → DICOM Download

FLOW-03
Hospital A → MediQ → Hospital B PACS
```

P1 확장:

```text
FLOW-04
Hospital A → MediQ → Mobile Secure Vault
```

---

# 2. Normative Inputs

본 문서는 다음 Baseline을 따른다.

```text
PROJECT-CHARTER.md
        ↓
CAPSTONE-MVP-BOUNDARY.md
        ↓
PRODUCT-BASELINE.md
        ↓
REQUIREMENTS.md
        ↓
SECURITY-REQUIREMENTS.md
        ↓
DOMAIN-MODEL.md
        ↓
SYSTEM-ARCHITECTURE.md
        ↓
DATA-FLOW.md
```

본 문서에서 새로운 Product Scope를 추가하지 않는다.

---

# 3. Data Flow Principles

## Principle 1 — Data와 Control 분리

다음을 구분한다.

```text
CONTROL DATA

Patient Reference
Patient Mapping
Exchange Session
Consent
Authorization
Transfer Grant
Audit
Provenance
```

```text
IMAGING DATA

DICOM Study
Series
SOP Instance
Imaging Package
```

---

## Principle 2 — Consent와 Authorization 분리

```text
Consent
≠
Authorization
≠
Transfer Grant
```

Flow 상에서도 각 단계를 분리한다.

---

## Principle 3 — Backend Enforcement

UI 또는 Viewer만으로 접근통제를 수행하지 않는다.

```text
User Request
   ↓
Backend Authorization
   ↓
Imaging Access
```

---

## Principle 4 — Source of Record 유지

```text
Hospital A PACS
=
SOURCE OF RECORD
```

MediQ:

```text
TEMPORARY EXCHANGE COPY / BROKER
```

Hospital B:

```text
DESTINATION IMPORTED COPY
```

---

## Principle 5 — Fail Closed

다음 중 하나라도 필수 검증에 실패하면 Flow를 중단한다.

```text
Authentication
Authorization
Consent
Grant
Tenant
Patient Mapping
Destination
Integrity
```

---

# 4. Main Actors and Components

## Edge Plane

```text
Synthetic Patient
Hospital A Test Orthanc
Hospital B Test Orthanc
User / Browser
Web Viewer
```

## MediQ Control Plane

```text
Patient Module
Exchange Module
Consent Module
Authorization Module
Grant Module
Hospital / Tenant Registry
```

## MediQ Imaging Plane

```text
Imaging Module
DICOMweb Adapter
Viewer Gateway
Download Handler
Transfer Module
Temporary Imaging Storage
```

## MediQ Security Plane

```text
Authentication
Tenant Resolution
Authorization Enforcement
Grant Validation
Integrity Verification
Audit
```

## Data Stores

```text
PostgreSQL
Temporary Imaging Storage
```

---

# 5. Common Precondition Flow

세 P0 Flow는 공통적으로 다음 사전조건을 가진다.

```text
Synthetic Patient
      ↓
PatientReference

Hospital A Local Patient ID
      ↓
PatientMapping

Hospital B Local Patient ID
      ↓
PatientMapping

Hospital A
      ↓
Source Hospital Registration

Hospital B
      ↓
Destination Hospital Registration
```

---

# 6. Common Exchange Creation Flow

모든 주요 Access Flow는 Exchange Session을 기반으로 한다.

```text
Requester
   ↓
Create Exchange Request
   ↓
MediQ API
   ↓
Authentication
   ↓
Tenant Resolution
   ↓
PatientReference Resolution
   ↓
Source Hospital Resolution
   ↓
Destination Resolution
   ↓
ExchangeSession Create
   ↓
State = REQUESTED
   ↓
Audit: SESSION_CREATED
```

---

# 7. Common Consent Flow

```text
ExchangeSession
      ↓
State = CONSENT_PENDING
      ↓
Consent Request
      ↓
Synthetic Patient Approval
      ↓
ConsentArtifact Created
      ↓
Consent.status = ACTIVE
      ↓
Session = CONSENTED
      ↓
Audit: CONSENT_APPROVED
```

실패:

```text
Rejected Consent
→ REJECTED / DENY
```

```text
Expired Consent
→ DENY
```

```text
Withdrawn Consent
→ New Grant DENY
```

---

# 8. Common Authorization Flow

```text
Access Request
      ↓
Authentication
      ↓
Actor Resolution
      ↓
Tenant Resolution
      ↓
ExchangeSession Validation
      ↓
Consent Validation
      ↓
Resource Validation
      ↓
Requested Action
      ↓
Authorization Policy
      ↓
ALLOW / DENY
```

`ALLOW`인 경우 필요한 Scope의 Transfer Grant를 발급하거나 기존 Grant를 검증한다.

---

# 9. Transfer Grant Flow

```text
Authorization = ALLOW
      ↓
Grant Request
      ↓
Create TransferGrant
      ↓
Bind:
- ExchangeSession
- Tenant
- Recipient
- Resource
- Scope
- Expiration
      ↓
Grant = ACTIVE
      ↓
Audit: GRANT_CREATED
```

P0 Scope:

```text
study:view
study:download
study:pacs-transfer
```

---

# 10. FLOW-01 — Hospital A → MediQ → Web Viewer

## Objective

Hospital A Test Orthanc에 존재하는 CT/MRI Study를 승인된 Hospital B 사용자가 Web Viewer에서 조회한다.

---

# 11. FLOW-01 Preconditions

다음 조건이 모두 충족되어야 한다.

```text
Actor authenticated
ExchangeSession valid
Consent ACTIVE
Grant ACTIVE
Grant scope = study:view
Tenant allowed
Study belongs to approved resource
```

---

# 12. FLOW-01 Sequence

```text
User / Hospital B
        │
        │ 1. Viewer Access Request
        ▼
MediQ Web
        │
        │ 2. Request with Session / Resource Context
        ▼
MediQ API
        │
        │ 3. Authenticate Actor
        ▼
Authentication
        │
        │ PASS
        ▼
Tenant Resolution
        │
        │ 4. Validate Tenant
        ▼
Exchange Module
        │
        │ 5. Load ExchangeSession
        ▼
Consent Module
        │
        │ 6. Validate ACTIVE Consent
        ▼
Authorization Module
        │
        │ 7. Validate study:view Grant
        │
        │ 8. Resource / Recipient Check
        ▼
Viewer Gateway
        │
        │ 9. Request Study
        ▼
DICOMweb Adapter
        │
        │ 10. WADO-RS
        ▼
Hospital A Orthanc
        │
        │ 11. Imaging Data
        ▼
DICOMweb Adapter
        │
        ▼
Viewer Gateway
        │
        │ 12. Authorized Imaging Stream
        ▼
Web Viewer
        │
        │ 13. Render CT/MRI
        ▼
User
```

---

# 13. FLOW-01 Data

Control Data:

```text
actor_ref
tenant_id
session_id
consent_id
grant_id
study_reference
requested_action = VIEW
```

Imaging Data:

```text
Study
Series
SOP Instances
```

---

# 14. FLOW-01 Security Controls

## Authentication

```text
Unauthenticated
→ DENY
```

## Consent

```text
No ACTIVE Consent
→ DENY
```

## Grant

```text
Missing study:view
→ DENY
```

## Tenant

```text
Wrong Tenant
→ DENY
```

## Direct URL

```text
Known Study UID / Viewer URL
+
No Authorization

→ DENY
```

---

# 15. FLOW-01 Encryption

```text
Browser ↔ MediQ
HTTPS / TLS
```

```text
MediQ ↔ Hospital A Orthanc
HTTPS / TLS
```

---

# 16. FLOW-01 Audit

최소:

```text
VIEWER_ACCESS_REQUESTED
AUTHORIZATION_GRANTED / DENIED
VIEWER_OPENED
ACCESS_DENIED
```

Audit Context:

```text
timestamp
actor_ref
tenant_id
session_id
study_ref
result
```

---

# 17. FLOW-01 Provenance

Viewer 조회는 Data Transfer와 다르지만 다음 조회 출처를 추적 가능하게 한다.

```text
Hospital A
→ Study
→ ExchangeSession
→ Viewer Access
```

---

# 18. FLOW-01 Integrity

Viewer 경로에서는 원본 Study Reference와 실제 제공 Resource가 일치하는지 검증한다.

P0에서는 PACS Import 경로보다 Integrity 검증 강도를 낮출 수 있으나 잘못된 Study를 반환해서는 안 된다.

---

# 19. FLOW-01 Failure Cases

```text
Invalid Session
→ DENY

Expired Grant
→ DENY

Wrong Scope
→ DENY

Wrong Tenant
→ DENY

Wrong Resource
→ DENY

WADO-RS Failure
→ VIEW FAILED

Authorization Error
→ FAIL CLOSED
```

---

# 20. FLOW-01 Success Condition

```text
Valid Identity
+
Valid Tenant
+
Valid Session
+
ACTIVE Consent
+
study:view Grant
+
Correct Resource
+
Successful WADO-RS

→ VIEW PASS
```

---

# 21. FLOW-02 — Hospital A → MediQ → DICOM Download

## Objective

승인된 Actor가 Hospital A의 의료영상을 DICOM 형태로 다운로드한다.

---

# 22. FLOW-02 Preconditions

```text
Authenticated Actor
Valid ExchangeSession
ACTIVE Consent
Valid TransferGrant
Scope = study:download
Correct Tenant
Correct Resource
```

---

# 23. FLOW-02 Sequence

```text
User
 │
 │ 1. Download Request
 ▼
MediQ Web
 │
 ▼
MediQ API
 │
 │ 2. Authentication
 ▼
Security Middleware
 │
 │ 3. Tenant Validation
 ▼
Exchange Module
 │
 │ 4. Session Validation
 ▼
Consent Module
 │
 │ 5. Consent Validation
 ▼
Authorization Module
 │
 │ 6. Grant Scope Validation
 │    study:download
 ▼
Imaging Module
 │
 │ 7. Resolve ImagingPackage / Study
 ▼
DICOMweb Adapter
 │
 │ 8. Retrieve Study
 │    WADO-RS
 ▼
Hospital A Orthanc
 │
 │ 9. DICOM Payload
 ▼
MediQ
 │
 │ 10. Optional Temporary Packaging
 ▼
Download Handler
 │
 │ 11. Authorized Response
 ▼
User
```

---

# 24. FLOW-02 Access Separation

핵심 Rule:

```text
study:view
≠
study:download
```

따라서:

```text
View-only Grant
→ Download Request
→ DENY
```

---

# 25. FLOW-02 Data

Control Data:

```text
actor_ref
tenant_id
session_id
grant_id
resource_ref
action = DOWNLOAD
```

Payload:

```text
DICOM Study / Package
```

---

# 26. FLOW-02 Encryption

```text
MediQ ↔ Hospital A
HTTPS / TLS
```

```text
MediQ ↔ User
HTTPS / TLS
```

Temporary File이 생성되는 경우 보호된 Storage를 사용한다.

---

# 27. FLOW-02 Audit

최소:

```text
DOWNLOAD_REQUESTED
AUTHORIZATION_GRANTED
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
```

실패:

```text
DOWNLOAD_DENIED
DOWNLOAD_FAILED
```

---

# 28. FLOW-02 Provenance

```text
Source Hospital
      ↓
Source Study
      ↓
ImagingPackage
      ↓
ExchangeSession
      ↓
Download Action
```

다운로드가 Source Original 자체의 소유권 이전을 의미하지 않는다.

---

# 29. FLOW-02 Failure Cases

```text
No Consent
→ DENY

View-only Grant
→ DENY

Expired Grant
→ DENY

Wrong Tenant
→ DENY

Wrong Recipient
→ DENY

Study Retrieval Failure
→ FAIL

Temporary Packaging Failure
→ FAIL
```

---

# 30. FLOW-02 Success Condition

```text
Authenticated
+
Authorized
+
ACTIVE Consent
+
study:download
+
Correct Tenant
+
Correct Resource

→ DOWNLOAD PASS
```

---

# 31. FLOW-03 — Hospital A → MediQ → Hospital B PACS

## Objective

Hospital A Test Orthanc의 승인된 CT/MRI Study를 MediQ를 통해 Hospital B Test Orthanc로 STOW-RS 방식으로 전송한다.

이 Flow는 MediQ P0의 가장 중요한 E2E 의료영상 이동 경로다.

---

# 32. FLOW-03 Preconditions

모든 조건이 충족되어야 한다.

```text
Authenticated Actor

Valid ExchangeSession

ACTIVE Consent

Valid study:pacs-transfer Grant

Correct Source Hospital

Correct Destination Hospital

Valid Destination Patient Mapping

Valid ImagingPackage

Destination STOW-RS Available
```

---

# 33. FLOW-03 High-Level Sequence

```text
Hospital B / Requester
        │
        │ 1. PACS Import Request
        ▼
MediQ API
        │
        │ 2. Authentication
        ▼
Security Middleware
        │
        │ 3. Tenant Validation
        ▼
Exchange Module
        │
        │ 4. Session Validation
        ▼
Consent Module
        │
        │ 5. Consent Validation
        ▼
Authorization Module
        │
        │ 6. Validate Grant
        │    study:pacs-transfer
        ▼
Patient Module
        │
        │ 7. Destination Mapping Validation
        ▼
Transfer Module
        │
        │ 8. Destination Validation
        ▼
Imaging Module
        │
        │ 9. Resolve ImagingPackage
        ▼
DICOMweb Adapter
        │
        │ 10. Retrieve Study
        │     WADO-RS
        ▼
Hospital A Orthanc
        │
        │ 11. DICOM Study
        ▼
MediQ
        │
        │ 12. Source Integrity Evidence
        ▼
Transfer Module
        │
        │ 13. STOW-RS
        ▼
Hospital B Orthanc
        │
        │ 14. Store Result
        ▼
Transfer Module
        │
        │ 15. Verify Destination
        ▼
Integrity Component
        │
        │ 16. Compare Integrity
        ▼
Provenance Module
        │
        │ 17. Record Source → Destination
        ▼
Audit Module
        │
        │ 18. PACS_TRANSFER_COMPLETED
        ▼
Exchange Module
        │
        │ 19. Update Session
        ▼
COMPLETED
```

---

# 34. FLOW-03 Patient Mapping

전송 전 반드시 다음 관계를 확인한다.

```text
MediQ Patient Reference
MQ-TEST-0001
       │
       ├─ Hospital A
       │  TEST-A-001
       │
       └─ Hospital B
          TEST-B-982
```

Missing:

```text
No Hospital B Mapping
→ DENY
```

Ambiguous:

```text
Multiple Hospital B Candidates
→ DENY
```

---

# 35. FLOW-03 Authorization

Authorization Context:

```text
Actor
Tenant
ExchangeSession
Consent
Grant
Resource
Destination
Action = PACS_IMPORT
```

Grant:

```text
study:pacs-transfer
```

없으면:

```text
DENY
```

---

# 36. FLOW-03 Destination Validation

Transfer Module은 최소 다음을 확인한다.

```text
Destination Hospital exists?

Destination matches ExchangeSession?

Destination matches Consent?

Destination matches Grant?

STOW-RS endpoint registered?

Patient Mapping valid?
```

불일치:

```text
NO TRANSFER
```

---

# 37. FLOW-03 Imaging Retrieval

Source Hospital A에서:

```text
QIDO-RS
```

를 통해 Study 존재 여부를 확인할 수 있다.

실제 Payload는:

```text
WADO-RS
```

를 통해 Retrieve한다.

---

# 38. FLOW-03 Integrity — Source

Retrieval 이후 Source Integrity Evidence를 생성한다.

예:

```text
Study / Instance Identifier

Object Count

Hash / Digest
```

구체 알고리즘은 후속 구현문서에서 결정한다.

---

# 39. FLOW-03 STOW-RS

전송:

```text
MediQ Transfer Module
      ↓
DICOMweb Adapter
      ↓
STOW-RS
      ↓
Hospital B Orthanc
```

STOW-RS 실패는 성공으로 처리하지 않는다.

---

# 40. FLOW-03 Destination Verification

STOW-RS 응답만으로 모든 검증을 종료하지 않는다.

가능한 경우:

```text
STOW-RS Success
      ↓
Destination QIDO-RS
      ↓
Study Exists?
```

를 추가 검증한다.

P0에서는 최소:

```text
Hospital B Orthanc에 대상 Study 존재
```

를 성공기준으로 한다.

---

# 41. FLOW-03 Integrity — Destination

Bit-preserving P0 Scenario:

```text
Source Evidence
      ↓
Destination Evidence
      ↓
Compare
```

결과:

```text
MATCH
→ VERIFIED

MISMATCH
→ FAILED
```

---

# 42. FLOW-03 Integrity Failure

다음은 금지한다.

```text
STOW-RS Success
+
Integrity FAILED

→ Transfer COMPLETED
```

정상:

```text
Integrity FAILED
→ Transfer FAILED
```

---

# 43. FLOW-03 Provenance

최소 기록:

```text
source_hospital

source_study

patient_ref

exchange_session

imaging_package

destination_hospital

transferred_at

integrity_status
```

목적:

```text
어떤 Study가
어디서 시작되어
어떤 Session을 통해
어디로 전달되었는가
```

를 추적하는 것이다.

---

# 44. FLOW-03 Audit

최소 Event:

```text
PACS_TRANSFER_REQUESTED

AUTHORIZATION_GRANTED / DENIED

PACS_TRANSFER_STARTED

STOW_RS_COMPLETED / FAILED

DESTINATION_VERIFIED

INTEGRITY_VERIFIED / FAILED

PACS_TRANSFER_COMPLETED / FAILED
```

---

# 45. FLOW-03 Failure Cases

```text
Authentication Failure
→ DENY

No Consent
→ DENY

Expired Grant
→ DENY

Wrong Scope
→ DENY

Wrong Tenant
→ DENY

Wrong Destination
→ DENY

Invalid Patient Mapping
→ DENY

WADO-RS Failure
→ FAIL

STOW-RS Failure
→ FAIL

Destination Verification Failure
→ FAIL

Integrity Failure
→ FAIL
```

---

# 46. FLOW-03 Success Condition

모두 충족해야 한다.

```text
Valid Authentication

Valid Tenant

Valid ExchangeSession

ACTIVE Consent

Valid study:pacs-transfer Grant

Correct Destination

Valid Patient Mapping

Successful Source Retrieval

Successful STOW-RS

Destination Study Verified

Integrity VERIFIED
```

결과:

```text
PACS_IMPORT PASS
```

---

# 47. FLOW-03 Final State

정상 완료:

```text
ExchangeSession
→ COMPLETED
```

실패:

```text
ExchangeSession
→ FAILED
```

단일 실패가 전체 Session 실패인지 Action 실패인지에 대한 세부 State Model은 이후 구현설계에서 정교화할 수 있다.

---

# 48. Cross-Flow Authorization Matrix

| Action        | Required Scope        |  P0 |
| ------------- | --------------------- | --: |
| Viewer        | `study:view`          | YES |
| Download      | `study:download`      | YES |
| PACS Import   | `study:pacs-transfer` | YES |
| Mobile Export | `study:mobile-export` |  P1 |

---

# 49. Cross-Flow Security Matrix

| Control            |              Viewer |           Download |              PACS Import |
| ------------------ | ------------------: | -----------------: | -----------------------: |
| Authentication     |            Required |           Required |                 Required |
| Tenant Validation  |            Required |           Required |                 Required |
| Session Validation |            Required |           Required |                 Required |
| Consent            |            Required |           Required |                 Required |
| Transfer Grant     |            Required |           Required |                 Required |
| Resource Scope     |            Required |           Required |                 Required |
| Patient Mapping    |      Source Context |     Source Context | **Destination Required** |
| TLS                |            Required |           Required |                 Required |
| Audit              |            Required |           Required |                 Required |
| Provenance         |               Basic |              Basic |                 **Full** |
| Integrity          | Resource validation | Payload validation |   **Source→Destination** |

---

# 50. Trust Boundary Crossings

## TB-01 Browser → MediQ

Data:

```text
Authentication Context
Session Request
Consent Action
Viewer / Download Request
```

Protection:

```text
TLS
Authentication
Authorization
```

---

## TB-02 MediQ → Hospital A

Data:

```text
QIDO Request
WADO Request
DICOM Study
```

Protection:

```text
TLS
Registered Endpoint
Service Context
```

---

## TB-03 MediQ → Hospital B

Data:

```text
STOW-RS
DICOM Study
```

Protection:

```text
TLS
Destination Validation
Grant
Patient Mapping
```

---

## TB-04 MediQ → Temporary Storage

Data:

```text
Temporary Imaging Payload
```

Protection:

```text
Application-controlled access; no direct client/PACS access
Per-instance AES-256-GCM; random DEK exists in process memory only
Tenant/Session/Package/StudyReference/PACS_IMPORT binding
64 MiB/object; 2 GiB/package; 10 GiB/environment; 30-minute post-capture TTL
Immediate expiry denial; Tenant-RLS purge Audit and idempotent cleanup
```

Normative recommendation: `PACS-001-DEC-007/008`. The API source-capture service contains an optional, unregistered same-WADO-chunk encrypted staging seam; only `STAGE-001` passes in a synthetic unit harness. `study_references` is the approved Study-scoped location for temporary storage reference/state/expiry/purge metadata; the schema and repository Acceptance are not yet implemented. The Nest module/Compose runtime does not inject a store. Metadata/RLS lifecycle, shared quota, SERVICE cleanup/purge Audit and `STAGE-002~013` remain NOT RUN. Do not activate a persistent DICOM staging path before the full lifecycle and isolated Orthanc no-STOW gates pass. PostgreSQL stores metadata references only, never DICOM payload or raw key material.

---

# 51. Metadata Flow

Metadata 흐름:

```text
PatientReference
      ↓
PatientMapping
      ↓
ExchangeSession
      ↓
ConsentArtifact
      ↓
TransferGrant
      ↓
ImagingPackage Metadata
      ↓
Provenance
      ↓
Audit
```

저장:

```text
PostgreSQL
```

---

# 52. Imaging Payload Flow

```text
Hospital A PACS
      ↓
WADO-RS
      ↓
MediQ
      ↓
Temporary Processing / Storage
      ↓
VIEW
DOWNLOAD
or
STOW-RS
      ↓
Hospital B PACS
```

Imaging Payload는 업무 Metadata DB와 분리한다.

---

# 53. Audit Flow

각 주요 Component는 Audit Event를 생성한다.

```text
Exchange Module
        ↓
Audit

Consent Module
        ↓
Audit

Authorization Module
        ↓
Audit

Viewer / Download
        ↓
Audit

Transfer Module
        ↓
Audit

Integrity
        ↓
Audit
```

P0에서 별도 Event Bus는 필수가 아니다.

---

# 54. Provenance vs Audit

둘을 혼동하지 않는다.

```text
PROVENANCE
=
Data movement evidence
```

예:

```text
Hospital A
→ MediQ
→ Hospital B
```

```text
AUDIT
=
Actor / Action evidence
```

예:

```text
User X
→ PACS_TRANSFER requested
→ ALLOW
```

---

# 55. Fail-Closed Flow

공통 Error Path:

```text
Request
   ↓
Security Check
   ↓
Unknown / Failure
   ↓
DENY
   ↓
Audit
```

금지:

```text
Security Error
→ Skip Validation
→ Continue
```

---

# 56. FLOW-04 — P1 Mobile Secure Vault

P1 참고 Flow:

```text
Hospital A
      ↓
MediQ
      ↓
Valid ExchangeSession
      ↓
Valid Consent
      ↓
study:mobile-export
      ↓
Secure Medical Capsule
      ↓
Device Binding
      ↓
Mobile Secure Vault
```

P1은 P0 완료를 차단하지 않는다.

---

# 57. FLOW-04 QR Role

향후 QR은:

```text
Transfer Request Bootstrap
```

역할만 수행한다.

QR에 저장하지 않는다.

```text
DICOM
PHI
DEK
KEK
Password
Long-lived Token
```

---

# 58. Data Flow Invariants

## DF-INV-001

```text
No Consent
→ No Protected Imaging Access
```

## DF-INV-002

```text
Invalid Grant
→ No Imaging Access
```

## DF-INV-003

```text
Wrong Scope
→ DENY
```

## DF-INV-004

```text
Wrong Tenant
→ DENY
```

## DF-INV-005

```text
PACS_IMPORT
+
Invalid Patient Mapping
→ DENY
```

## DF-INV-006

```text
PACS_IMPORT
+
Wrong Destination
→ DENY
```

## DF-INV-007

```text
Integrity FAILED
→ Transfer cannot be COMPLETED
```

## DF-INV-008

```text
Viewer Permission
≠
Download Permission
```

## DF-INV-009

```text
Session ID
≠
Authorization Credential
```

## DF-INV-010

모든 주요 Access 또는 Transfer 결과는 Audit 가능해야 한다.

---

# 59. P0 Flow Test Gate

## FLOW-GATE-01 — Viewer

```text
Valid context
→ Viewer PASS

Invalid context
→ DENY
```

## FLOW-GATE-02 — Download

```text
study:download
→ PASS

study:view only
→ DENY
```

## FLOW-GATE-03 — PACS Import

```text
Valid Grant
+
Valid Mapping
+
Correct Destination
+
STOW-RS
+
Integrity

→ PASS
```

## FLOW-GATE-04 — Tenant

```text
Wrong Tenant
→ DENY
```

## FLOW-GATE-05 — Provenance

```text
Source
→ Destination

Traceable
```

## FLOW-GATE-06 — Audit

```text
Major Action
→ Audit Event
```

---

# 60. P0 End-to-End Golden Path

최종 Golden Path:

```text
Synthetic Patient
        ↓
Hospital A Test Patient
        ↓
Patient Mapping
        ↓
Hospital A CT Study
        ↓
Exchange Request
        ↓
ExchangeSession
        ↓
Consent ACTIVE
        ↓
Authorization
        ↓
Scoped TransferGrant
        ↓
ImagingPackage
        ↓
        ├───────────────┬─────────────────┐
        │               │                 │
        ▼               ▼                 ▼
      VIEW           DOWNLOAD         PACS_IMPORT
        │               │                 │
      PASS            PASS              STOW-RS
                                          │
                                          ▼
                                  Hospital B Orthanc
                                          │
                                   Study Verification
                                          │
                                   Integrity VERIFIED
                                          │
                                     Provenance
                                          │
                                        Audit
                                          │
                                    Session Complete
```

---

# 61. Negative Golden Paths

## NGP-01

```text
No Consent
→ DENY
```

## NGP-02

```text
Expired Grant
→ DENY
```

## NGP-03

```text
View-only Grant
→ Download
→ DENY
```

## NGP-04

```text
Hospital C
→ Hospital A→B Exchange
→ DENY
```

## NGP-05

```text
No Destination Patient Mapping
→ PACS_IMPORT
→ DENY
```

## NGP-06

```text
Integrity Mismatch
→ FAILED
```

---

# 62. Data Flow Decision

```text
PROJECT:
MediQ

DATA FLOW VERSION:
v1.1 Viewer Architecture Amendment

FLOW-01:
Hospital A → MediQ → Viewer
DEFINED

FLOW-02:
Hospital A → MediQ → Download
DEFINED

FLOW-03:
Hospital A → MediQ → Hospital B PACS
DEFINED

FLOW-04:
Mobile Secure Vault
P1 DEFINED

AUTHENTICATION:
REQUIRED

CONSENT:
REQUIRED

AUTHORIZATION:
REQUIRED

GRANT:
SCOPE-BASED

TENANT ISOLATION:
REQUIRED

TRANSPORT:
TLS

PATIENT MAPPING:
MANDATORY FOR PACS_IMPORT

PROVENANCE:
MANDATORY FOR TRANSFER

INTEGRITY:
MANDATORY FOR PACS_IMPORT

AUDIT:
MANDATORY

FAILURE POLICY:
FAIL CLOSED

DATA FLOW STATUS:
APPROVED BASELINE
```

---

# 63. Data Flow Review

```text
Viewer Flow:
PASS

Download Flow:
PASS

PACS Import Flow:
PASS

Authentication Placement:
PASS

Consent Placement:
PASS

Authorization Placement:
PASS

Grant Enforcement:
PASS

Tenant Validation:
PASS

Patient Mapping:
PASS

DICOMweb Flow:
PASS

TLS Boundary:
PASS

Audit:
PASS

Provenance:
PASS

Integrity:
PASS

P0/P1 Separation:
PASS

DATA FLOW READY:
YES
```

---

# 64. Next Documents

본 Data Flow 승인 후 다음 순서로 진행한다.

```text
DATA-MODEL.md
      ↓
ERD.md
      ↓
OPENAPI.yaml
      ↓
THREAT-MODEL.md
      ↓
ACCEPTANCE-TESTS.md
```

`DATA-MODEL.md`에서는 본 문서에서 이동한 **Control Metadata를 실제 저장 구조로 변환**한다.

핵심 Entity:

```text
organizations

tenants

hospitals

users / actors

patient_refs

patient_mappings

exchange_sessions

consents

transfer_grants

imaging_packages

study_references

integrity_evidence

provenance_records

audit_events
```

특히 다음 관계를 DB 수준에서도 유지해야 한다.

```text
PatientReference
→ PatientMapping

PatientReference
→ ExchangeSession

ExchangeSession
→ ConsentArtifact

ExchangeSession
→ TransferGrant

ExchangeSession
→ ImagingPackage

ImagingPackage
→ StudyReference

ExchangeSession / ImagingPackage
→ Provenance

ExchangeSession
→ Audit
```

---

# FINAL DATA FLOW POLICY

> **MediQ P0의 모든 의료영상 Access는 `Authentication → Tenant → ExchangeSession → Consent → Authorization → TransferGrant` 검증을 거쳐야 한다.**

> **Viewer, Download, PACS Import는 서로 다른 Access Action이며 각각 독립 Scope를 가진다.**

> **PACS Import는 추가로 Destination Hospital과 Patient Mapping을 검증하고, STOW-RS 수신 확인 및 Integrity Verification 후에만 완료 처리한다.**

> **Provenance는 의료영상의 이동경로를, Audit는 Actor와 Action을 기록하며 두 증적은 분리하여 관리한다.**

> **어떤 보안 검증 단계에서도 판단이 불가능하거나 검증이 실패하면 Fail Closed를 적용한다.**

---

# Viewer Data Flow Amendment — 2026-09-15

## Hospital Cloud Viewer — P0

```text
Hospital User
  → MediQ Authentication
  → Tenant / Organization Validation
  → ExchangeSession / PatientMapping Validation
  → Consent / Authorization / study:view Grant Validation
  → Short-Lived ViewerSession
  → MediQ DICOMweb Gateway
  → Hospital A PACS WADO-RS
  → Required Series / Instance / Frame
  → Encrypted Memory Buffer or TTL Cache
  → Progressive Cloud Viewer Delivery
  → Viewer Access Audit / Provenance
```

## Synthetic Patient Cloud Viewer — P0

```text
Synthetic Patient
  → Patient Authentication Context
  → PatientReference Binding
  → Consent / Purpose / Scope Validation
  → Short-Lived study:view Grant
  → ViewerSession
  → Backend WADO-RS Retrieval from Source PACS
  → Cloud Web Viewer
  → Audit / Provenance
```

Patient Viewer와 Hospital Viewer는 같은 DICOMweb Gateway를 사용할 수 있지만 Actor, Tenant, PatientReference 및 Recipient Binding 검증은 구분한다.

## Temporary Cache Lifecycle — P0

```text
On-Demand Retrieval
  → Encrypted Temporary Object
  → Bind to Tenant + Session + Study + Purpose
  → Viewer Delivery
  → Session Close / TTL Expiry / Policy Trigger
  → Purge
  → Purge Audit Evidence
```

Browser, CDN, reverse proxy 또는 service worker를 장기 영상 저장소로 사용하지 않는다. Source PACS가 unavailable이면 영구 Cloud Copy로 우회하지 않고 `UPSTREAM_UNAVAILABLE`로 Fail Closed한다.

## Patient Mobile Vault Viewer — P1

```text
study:mobile-export Grant
  → Secure Medical Capsule
  → Device Binding
  → Encrypted Mobile Vault Local Storage
  → Patient Device Authentication
  → Local Mobile Viewer
  → Local Access Event
```

Mobile Viewer는 Cloud Viewer의 WADO-RS 요청 경로가 아니라 Mobile Vault에 저장된 암호화 Copy의 로컬 열람 경로다.

**공통 기준:** Hospital PACS는 Source of Record이고 MediQ Cloud에는 Permanent PACS 또는 장기 영상 Archive를 두지 않는다.

---

# P1 Mobile Security Flow Amendment — 2026-09-15

## Device Admission and Export

```text
Android Device Registration
  → Generate non-exportable Device Key in OS Keystore
  → Verify Attestation and Key Security Level
  ├── STRONGBOX: ALLOW, preferred
  ├── TRUSTED_ENVIRONMENT: ALLOW
  └── SOFTWARE / UNKNOWN / verification failure
         → DENY Persistent Vault
         → Offer Cloud Viewer

Valid Patient Identity
  → Valid Consent
  → Valid Authorization
  → Valid study:mobile-export Grant
  → Retrieve from Source PACS
  → Encrypt DICOM Instance/Chunk with per-Capsule AES-256-GCM DEK
  → Wrap DEK to verified Device Key using versioned Wrap Slot
  → Store encrypted Capsule in app-private Vault
  → Set offline_expires_at = issuance/policy verification + 30 days
  → Audit issuance
```

## Local Open and Background

```text
Open Capsule
  → Verify Device Binding + Capsule status + local Lease
  → Device Authentication
  → Authorize DEK for short Viewer Session
  → Progressive in-memory decrypt/render

App Background/Inactive
  → Show Privacy Screen immediately
  → Stop rendering and clear decrypted Pixel Buffer
  → Start 60-second reauthentication grace
  ├── Resume within 60 seconds + device remained unlocked: resume
  └── Otherwise: destroy local session and require authentication
```

30일 Lease가 만료된 상태에서 네트워크를 사용할 수 없으면 복호화는 거부한다. 연결 가능 시 Consent, Grant, Account 및 Device 상태를 재검증한 뒤에만 Lease를 갱신한다.

## Lost Device and Reissue

```text
Patient reports Device lost/replaced
  → Mark old Device LOST/REVOKED
  → Deny future Lease refresh
  → New Device registration and hardware security verification
  → Re-check current Consent + Authorization + study:mobile-export
  ├── valid: retrieve again from Source PACS and issue new Capsule
  └── invalid/expired: require new approval
```

Cloud Key Escrow, Cross-device Device Key 복구 및 복구용 Permanent DICOM Copy는 사용하지 않는다. 오프라인 상태의 분실 기기는 30일 Lease 만료 전 즉시 Revoke를 강제할 수 없다는 한계를 Audit/Risk로 유지한다.

---

# Synthetic Health Data Preview Flow — 2026-09-26

```text
Patient opens Preview
  → App displays persistent DEMO MODE disclosure
  → Validate Capstone profile uses MockHealthDataProvider
  → Confirm TEST-* Patient Reference
  → Patient selects synthetic categories and period
  → Patient confirms Mock Consent
  → Load versioned Synthetic Fixture
  → Validate sourceMode=SYNTHETIC and providerMode=MOCK
  ├── valid: show synthetic list/detail + DEMO audit
  └── invalid: fail closed, no record display
  → Patient resets Preview Session and Cache
```

Prohibited flow:

```text
Mobile → Actual Health Institution API
Mock Consent → Real Consent/Grant
Synthetic Record → Clinician Share/PACS Import
Capstone Build → Production Credential
```

이 Flow는 DICOM Source Retrieval, Viewer, Download, STOW-RS와 독립이며 P0 E2E를 변경하지 않는다.

# Hospital Clinical Workflow P1 Data Flow Amendment — 2026-09-27

## Authorized Prior Comparison

```text
Hospital User → Prior Finder
→ Authenticate + Tenant/Hospital/Patient/Exchange Scope
→ Backend QIDO-RS Metadata Query
→ Study별 Consent/Authorization/VIEW Scope Filter
→ Minimal Candidate Projection
→ User Selects Studies
→ Reauthorize every Study
→ Short-lived Comparison Viewer Session
→ WADO-RS On-demand Pixels
→ Viewer Close/Expiry/Revoke + Audit
```

## Clinical Handoff and Assignment

```text
Authorized User → Create Handoff Packet
→ Bind Exchange/Patient/Purpose
→ Add Resource References with separate Scopes
→ Assign same-Hospital User/Role Queue
→ Assignee opens Work Item
→ Reauthorize target Resources
→ Accept/Hold/Handover/Close
→ Audit every state change
```

## Privacy-safe Notification

```text
P0/P1 Domain Event
→ Minimal Event Projection
→ Deduplicate by Event ID/Version
→ Hospital Inbox
→ User opens Notification
→ Authenticate + Object Reauthorization
→ Authorized Target or Safe Denial
```

## Explainable Timeline

```text
Audit + Provenance + Integrity Read
→ Exchange/Correlation Binding
→ Role-based Redaction
→ Ordered Human-readable Stages
→ Technical Detail only for authorized Role
```

Prohibited flows include Patient ID-only global PACS search, Assignment-to-Grant conversion, Notification-to-access conversion, Pixel/Document copy into Handoff Packet and Browser-to-PACS direct access.

# P0 Source Capture / Temporary Lifecycle Integration — DEC-017

**Status:** Approved design; implementation NOT STARTED; `TC-PACS-001-LIFECYCLE-001~014` NOT RUN. This is a pre-dispatch prerequisite, not the A→B transfer itself. Preserve the original P0 E2E success condition.

```text
Authenticated caller + strict internal operation/Consent/Grant refs
  → Snapshot identity and one source-capture deadline
  → Tenant registry/RLS + Session-fenced Authorization + mapping
  → A-only metadata retrieval and exact PatientID/Study validation
  → Fresh fenced Authorization + exact STAGING ref reservation [commit]
  → beginReservedPackage with explicit principal/Tenant-bound quota
  → A WADO chunks → same-byte hash + quota-before-write + AES-GCM/fsync
  → Quota settlement → one seal-completion timestamp/expiry
  → Fresh fenced Authorization + AVAILABLE/evidence/Audit [commit]
  → Known commit + deadline/cancellation check → internal handoff
  → Concrete fresh Authorization + metadata/evidence check [commit]
  → Authenticate/decrypt one bounded instance
  → Concrete fresh Authorization + metadata/evidence check [commit]
  → Borrowed internal consumer → zero buffer after callback settles
```

Reservation/finalization failure or uncertain commit never produces a successful handoff. Preserve the attempted server-generated ref; exact-ref PURGE_PENDING commit precedes physical cleanup and atomic PURGED/quota/Audit finalization. If caller identity is no longer active, do not substitute elevated authority: retain recovery metadata for the separately verified Tenant SERVICE expiry path. A competing attempt may not clean another attempt's ref. No transaction is held across the depicted source, crypto/filesystem or consumer I/O.

Staging ends no later than the original invocation+30-minute deadline; completed payload expiry is seal completion+30 minutes, identical in DB/receipt/store. Reads do not extend it. Existing approved Study UID/PatientMapping values remain unchanged; new temporary metadata and outputs must not duplicate those identifiers or expose keys, paths or payload. Ordinary capture output retains its existing allowlist.

This path does not call B, STOW or destination verification, and cannot set PREFLIGHT_PASSED/STOW_STARTED/COMPLETED. Isolated validation must prove B EMPTY independently, retain the existing no-destination network boundary and clean only test-owned resources. Later transfer still requires full Mandatory Preflight and independent destination integrity/provenance/Audit evidence.
