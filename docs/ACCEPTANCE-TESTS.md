# MediQ Acceptance Test Specification

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `ACCEPTANCE-TESTS.md`
**Version:** v1.7 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ P0 구현의 **최종 합격 기준**을 정의한다.

## 1.1 P1 편의·AI 질문자료 Acceptance 묶음

- `TC-PXE-CX-001~009`: Timeline, 최신성 구분, 쉬운 모드, 검색, 추세, 정정, 방문 꾸러미, 수동 일정, 응급카드 Gate.
- `TC-AIQ-001~008`: 합성 Allowlist, 식별자 제거, 실제 Record 거부, Copy 경고, 외부 네트워크 미호출, Watermark Capture, 고위험 Prompt 미생성, 응답 재수입 거부.
- 현재 결과는 모두 `NOT RUN`이다. HTML 정적 검사는 제품 Acceptance PASS를 의미하지 않는다.

## 1.2 Synthetic RAG Acceptance 묶음

`TC-RAG-001~020`은 합성 Marker, 식별정보 제거, Citation, 철회·충돌 Source, 금지 Intent, Prompt Injection, Timeout, 외부 Network 0건, 복사 고지와 P0 독립 실패경계를 검증한다. 현재 Runtime과 Test Harness가 없으므로 모두 `NOT RUN`이다.

지금까지 작성된:

```text
PROJECT-CHARTER.md
CAPSTONE-MVP-BOUNDARY.md
PRODUCT-BASELINE.md
REQUIREMENTS.md
SECURITY-REQUIREMENTS.md
DOMAIN-MODEL.md
SYSTEM-ARCHITECTURE.md
DATA-FLOW.md
DATA-MODEL.md
ERD.md
OPENAPI.yaml
THREAT-MODEL.md
```

의 내용을 실제 실행 가능한 Acceptance Test로 변환한다.

본 문서부터는 새로운 Architecture나 Product Scope를 설계하지 않는다.

---

# 2. Acceptance Contract

P0 Requirement는 다음 Traceability Chain을 가져야 한다.

```text
REQ-*
  ↓
SEC-*
  ↓
THR-*
  ↓
API / Domain Action
  ↓
AT-*
  ↓
PASS / FAIL
```

P0 `MUST` Requirement가 Acceptance Test 없이 남아 있으면:

```text
P0 BASELINE
→ PARTIAL
```

로 판단한다.

---

# 3. Test Categories

Acceptance Test를 세 그룹으로 구분한다.

## Category A — Functional Acceptance

정상 업무기능이 동작하는지 검증한다.

```text
AT-FUNC-*
```

---

## Category B — Security Negative Acceptance

잘못된 Context에서 반드시 차단되는지 검증한다.

```text
AT-SEC-*
```

---

## Category C — End-to-End Golden Path

전체 의료영상 Exchange가 실제로 완료되는지 검증한다.

```text
AT-E2E-*
```

---

# 4. Acceptance Test Format

모든 핵심 Test는 다음 형식을 따른다.

```text
Test ID:
AT-XXX-NNN

Objective:
...

Traceability:
REQ-...
SEC-...
THR-...
API ...

Given:
...

When:
...

Then:
...

Expected HTTP:
...

Expected Domain State:
...

Expected Audit:
...

Expected Evidence:
...

Result:
PASS / FAIL
```

---

# 5. P0 Test Environment

Acceptance Test는 다음 환경을 기준으로 한다.

```text
Browser / Test Client

MediQ Web

MediQ Backend API

PostgreSQL

Hospital A Test Orthanc

Hospital B Test Orthanc

Temporary Imaging Storage
```

권장 Deployment:

```text
Docker Compose
```

---

# 6. Synthetic Test Fixtures

실제 환자 데이터는 사용하지 않는다.

## Tenant / Hospital

```text
Tenant A
Hospital A
Source Hospital

Tenant B
Hospital B
Destination Hospital

Tenant C
Hospital C
Unauthorized Third Party
```

---

## Patient

```text
MediQ Patient Reference:
MQ-TEST-0001

Hospital A Local Patient ID:
TEST-A-001

Hospital B Local Patient ID:
TEST-B-982
```

---

## Test Imaging

최소 하나의:

```text
Synthetic CT Study
```

또는:

```text
Synthetic MRI Study
```

를 Hospital A Orthanc에 등록한다.

---

# 7. Test Identity Fixtures

최소 다음 Actor를 준비한다.

```text
ACTOR-A
Tenant A / Hospital A

ACTOR-B
Tenant B / Hospital B

ACTOR-C
Tenant C / Hospital C

SERVICE-MEDIQ
MediQ internal service context
```

---

# 8. Core Expected Audit Actions

Acceptance Test에서 확인 가능한 주요 Audit Event:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED
CONSENT_WITHDRAWN

AUTHENTICATION_FAILURE

AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED

GRANT_CREATED
GRANT_DENIED

VIEWER_OPENED

DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
DOWNLOAD_FAILED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
PACS_TRANSFER_FAILED

INTEGRITY_VERIFIED
INTEGRITY_FAILURE

ACCESS_DENIED

SESSION_COMPLETED
```

---

# 9. Functional Acceptance — Exchange

## AT-FUNC-001 — Exchange Session 생성

**Objective**

정상적인 의료영상 Exchange Session을 생성한다.

**Traceability**

```text
REQ-EXC-001
REQ-EXC-002
REQ-SYS-001
```

API:

```text
POST /exchange-sessions
```

### Given

* 인증된 ACTOR-B
* `MQ-TEST-0001` 존재
* Hospital A 존재
* Hospital B 존재
* Source와 Destination이 서로 다름

### When

정상적인 Exchange 생성 요청을 전송한다.

### Then

새로운 고유 `sessionId`가 생성되어야 한다.

### Expected HTTP

```text
201 Created
```

### Expected State

```text
REQUESTED
```

### Expected Audit

```text
SESSION_CREATED
result = SUCCESS
```

### PASS

* `session_id` 고유
* PatientReference 일치
* Source Hospital A
* Destination Hospital B
* requester = 인증된 Actor Context

---

# 10. AT-FUNC-002 — Exchange Session 조회

**Traceability**

```text
REQ-EXC-001
SEC-API-002
THR-002
```

API:

```text
GET /exchange-sessions/{sessionId}
```

### Given

ACTOR-B가 접근할 권한을 가진 Session.

### When

Session을 조회한다.

### Then

해당 Session Metadata를 반환해야 한다.

### Expected HTTP

```text
200 OK
```

### Expected State

기존 State 유지.

### Audit

읽기 Audit 정책을 구현한 경우 조회 Event 기록 가능.

---

# 11. Functional Acceptance — Patient Mapping

## AT-FUNC-003 — Valid Destination Mapping

**Traceability**

```text
REQ-PAT-003
REQ-PAT-004
SEC-IAM-007
THR-018
```

API:

```text
POST /exchange-sessions/{sessionId}/patient-mapping/validate
```

### Given

```text
MQ-TEST-0001
→ Hospital B
→ TEST-B-982
→ status VALID
```

### When

Destination Mapping 검증을 요청한다.

### Then

### Expected HTTP

```text
200 OK
```

### Expected Response

```text
status = VALID
pacsImportAllowed = true
```

---

# 12. AT-FUNC-004 — Study 목록 조회

**Traceability**

```text
REQ-DICOM-001
SEC-DICOM-001
```

API:

```text
GET /exchange-sessions/{sessionId}/studies
```

### Given

* 유효한 Session
* Hospital A Orthanc에 Test Study 존재
* Actor 권한 유효

### When

Study 목록을 요청한다.

### Then

QIDO-RS 결과를 MediQ StudyReference 형식으로 반환한다.

### Expected HTTP

```text
200 OK
```

### Expected Data

```text
studyRefId
studyInstanceUID
sourceHospitalId
modality
```

---

# 13. Functional Acceptance — Consent

## AT-FUNC-005 — Consent Request 생성

**Traceability**

```text
REQ-CON-001
REQ-CON-002
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/request
```

### Given

Session:

```text
REQUESTED
```

### When

Allowed Action:

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

중 하나 이상으로 Consent Request 생성.

### Then

Consent Artifact가 생성된다.

### Expected HTTP

```text
201 Created
```

### Expected Consent State

```text
PENDING
```

### Expected Session State

```text
CONSENT_PENDING
```

### Expected Audit

```text
CONSENT_REQUESTED
```

---

# 14. AT-FUNC-006 — Consent 승인

**Traceability**

```text
REQ-CON-003
SEC-CONSENT-001
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/{consentId}/approve
```

### Given

```text
Consent = PENDING
```

### When

Synthetic Patient Consent Approval을 수행한다.

### Then

### Expected HTTP

```text
200 OK
```

### Consent State

```text
ACTIVE
```

### Session State

```text
CONSENTED
```

### Audit

```text
CONSENT_APPROVED
```

---

# 15. AT-FUNC-007 — Consent 철회

**Traceability**

```text
REQ-CON-004
SEC-CONSENT-002
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/{consentId}/withdraw
```

### Given

```text
Consent ACTIVE
```

### When

Consent Withdrawal 실행.

### Then

### HTTP

```text
200 OK
```

### State

```text
Consent = WITHDRAWN
```

### Audit

```text
CONSENT_WITHDRAWN
```

---

# 16. Functional Acceptance — Grant

## AT-FUNC-008 — View Grant 발급

**Traceability**

```text
REQ-GRT-001
REQ-GRT-002
SEC-GRANT-001
```

API:

```text
POST /exchange-sessions/{sessionId}/grants/issue
```

### Given

```text
Consent ACTIVE
Consent allows VIEW
Correct Tenant
Correct Hospital
```

### When

```text
scope = study:view
```

Grant 발급 요청.

### Then

### HTTP

```text
201 Created
```

### Grant State

```text
ACTIVE
```

### Expected Scope

```text
study:view
```

### Audit

```text
AUTHORIZATION_GRANTED
GRANT_CREATED
```

---

# 17. AT-FUNC-009 — Grant 철회

**Traceability**

```text
REQ-GRT-005
SEC-GRANT-002
```

API:

```text
POST /exchange-sessions/{sessionId}/grants/{grantId}/revoke
```

### Given

```text
Grant ACTIVE
```

### When

Grant를 Revocation한다.

### Then

```text
Grant = REVOKED
```

### HTTP

```text
200 OK
```

---

# 18. Functional Acceptance — Viewer

## AT-FUNC-010 — Viewer 정상 접근

**Traceability**

```text
REQ-VIEW-001
REQ-VIEW-003

SEC-AUTHZ-006
SEC-DICOM-002

THR-009
THR-012
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/view
```

### Given

```text
Authenticated ACTOR-B
Valid Tenant B
Valid Session
ACTIVE Consent
ACTIVE Grant
study:view
Correct Study
```

### When

Viewer Action을 실행한다.

### Then

Authorization된 Viewer Access를 반환한다.

### HTTP

```text
200 OK
```

### Expected Response

```text
viewerUrl
expiresAt
studyRefId
```

### Expected Audit

```text
AUTHORIZATION_GRANTED
VIEWER_OPENED
```

### Expected Imaging

CT/MRI Study가 Viewer에서 정상 Render된다.

---

# 19. Functional Acceptance — Download

## AT-FUNC-011 — DICOM Download 정상 수행

**Traceability**

```text
REQ-DWN-001
SEC-AUTHZ-008
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/download
```

### Given

```text
Authenticated
Valid Session
ACTIVE Consent
ACTIVE Grant
study:download
Correct Resource
```

### When

DICOM Download 실행.

### Then

### HTTP

```text
200 OK
```

### Content Type

```text
application/zip
```

또는 승인된 DICOM Package Download 형식.

### Audit

```text
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
```

---

# 20. Functional Acceptance — PACS Import

## AT-FUNC-012 — PACS Import 정상 수행

**Traceability**

```text
REQ-PACS-001
REQ-PACS-002
REQ-PACS-003
REQ-PACS-005

SEC-DICOM-004
SEC-DICOM-005

THR-017
THR-018
THR-019
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/pacs-import
```

### Given

```text
Authenticated Actor
Valid Tenant
Valid ExchangeSession
ACTIVE Consent
ACTIVE Grant
study:pacs-transfer
Correct Destination Hospital B
VALID PatientMapping
Hospital B STOW-RS available
```

### When

PACS Import Action을 실행한다.

### Then

Flow:

```text
Hospital A
→ WADO-RS
→ MediQ
→ STOW-RS
→ Hospital B
```

가 성공해야 한다.

### HTTP

```text
200 OK
```

### Expected Result

```text
transferStatus = COMPLETED
destinationVerified = true
integrityStatus = VERIFIED
```

### Expected Audit

```text
AUTHORIZATION_GRANTED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
INTEGRITY_VERIFIED
```

### Expected Provenance

```text
Hospital A
→ MediQ
→ Hospital B
```

---

# 21. AT-FUNC-013 — Destination Study Verification

**Traceability**

```text
REQ-PACS-005
THR-020
```

### Given

PACS Import API 성공.

### When

Hospital B Orthanc에 QIDO 또는 동등한 확인을 수행한다.

### Then

대상 StudyInstanceUID가 존재해야 한다.

### Expected

```text
Study exists = true
```

---

# 22. AT-FUNC-014 — Integrity 정상 검증

**Traceability**

```text
REQ-INT-001
SEC-INT-001
```

### Given

Bit-preserving Transfer.

### When

Source/Destination Integrity Evidence 비교.

### Then

```text
Integrity = VERIFIED
```

### Audit

```text
INTEGRITY_VERIFIED
```

---

# 23. AT-FUNC-015 — Provenance 조회

**Traceability**

```text
REQ-PROV-002
SEC-INT-003
```

API:

```text
GET /exchange-sessions/{sessionId}/provenance
```

### Then

최소 다음을 확인할 수 있어야 한다.

```text
Source Hospital
Study
Exchange Session
Destination Hospital
Transfer Status
Integrity
```

### HTTP

```text
200 OK
```

---

# 24. AT-FUNC-016 — Audit Trail 조회

**Traceability**

```text
REQ-AUD-001
SEC-AUD-001
SEC-AUD-002
THR-039
```

API:

```text
GET /exchange-sessions/{sessionId}/audit-events
```

### Then

Session의 주요 Lifecycle을 시간순으로 추적할 수 있어야 한다.

예:

```text
SESSION_CREATED
CONSENT_REQUESTED
CONSENT_APPROVED
GRANT_CREATED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
INTEGRITY_VERIFIED
SESSION_COMPLETED
```

---

# 25. Security Negative Acceptance

---

# 26. AT-SEC-001 — Unauthenticated Access

**Traceability**

```text
SEC-IAM-004
THR-001
```

### Given

Authorization Header 없음.

### When

```text
GET /exchange-sessions/{sessionId}
```

### Then

### HTTP

```text
401 Unauthorized
```

### Audit

```text
AUTHENTICATION_FAILURE
```

### Requirement

보호 Resource가 반환되지 않아야 한다.

---

# 27. AT-SEC-002 — Invalid Credential

**Traceability**

```text
SEC-IAM-005
```

### Given

위조 또는 Invalid Credential.

### When

보호 Endpoint 접근.

### Expected

```text
401 Unauthorized
```

---

# 28. AT-SEC-003 — Session BOLA / IDOR

**Traceability**

```text
SEC-API-002
THR-002
```

### Given

ACTOR-C가 Hospital A→B Session UUID를 알고 있음.

### When

```text
GET /exchange-sessions/{sessionId}
```

### Then

### HTTP

```text
403 Forbidden
```

또는 Resource Enumeration을 방지하는 정책일 경우:

```text
404 Not Found
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 29. AT-SEC-004 — Wrong Tenant

**Traceability**

```text
REQ-TEN-002
SEC-TEN-001
THR-003
```

### Given

Tenant C Actor.

### When

A→B Exchange Resource 접근.

### Then

```text
403 Forbidden
```

### Audit

```text
ACCESS_DENIED
reason = TENANT_MISMATCH
```

---

# 30. AT-SEC-005 — No Consent Grant Request

**Traceability**

```text
REQ-CON-003
SEC-CONSENT-001
THR-004
```

### Given

Session 존재.

Consent 없음.

### When

```text
POST /exchange-sessions/{sessionId}/grants/issue
```

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 31. AT-SEC-006 — Withdrawn Consent Grant Request

**Traceability**

```text
SEC-CONSENT-002
THR-004
```

### Given

```text
Consent = WITHDRAWN
```

### When

Grant 발급 시도.

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 32. AT-SEC-007 — Consent Scope Escalation

**Traceability**

```text
SEC-GRANT-005
THR-005
```

### Given

Consent:

```text
VIEW
```

만 허용.

### When

Grant:

```text
study:download
```

요청.

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 33. AT-SEC-008 — Expired Grant

**Traceability**

```text
SEC-GRANT-002
THR-007
```

### Given

```text
Grant = EXPIRED
```

### When

Viewer/Download/PACS Action 요청.

### Then

```text
403 Forbidden
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 34. AT-SEC-009 — Wrong Recipient

**Traceability**

```text
SEC-GRANT-003
THR-008
```

### Given

Grant Recipient:

```text
Hospital B
```

Requester:

```text
Hospital C
```

### When

Grant 사용.

### Then

```text
403 Forbidden
```

---

# 35. AT-SEC-010 — View-only Grant Download

**Traceability**

```text
SEC-GRANT-005
SEC-AUTHZ-009
THR-006
```

### Given

```text
scope = study:view
```

### When

```text
POST /actions/download
```

### Then

```text
403 Forbidden
```

### Audit

```text
AUTHORIZATION_DENIED
DOWNLOAD_FAILED or ACCESS_DENIED
```

---

# 36. AT-SEC-011 — View-only Grant PACS Import

### Given

```text
scope = study:view
```

### When

```text
POST /actions/pacs-import
```

### Then

```text
403 Forbidden
```

---

# 37. AT-SEC-012 — Invalid Patient Mapping

**Traceability**

```text
REQ-PAT-004
SEC-IAM-007
THR-018
```

### Given

Hospital B PatientMapping:

```text
UNVERIFIED
```

또는:

```text
AMBIGUOUS
REVOKED
NOT_FOUND
```

### When

PACS Import 수행.

### Then

```text
409 Conflict
```

또는 Authorization 정책상:

```text
403 Forbidden
```

### Required Result

```text
No STOW-RS request
```

### Audit

```text
PACS_TRANSFER_FAILED
reason = PATIENT_MAPPING_INVALID
```

---

# 38. AT-SEC-013 — Wrong Destination

**Traceability**

```text
SEC-DICOM-005
THR-017
```

### Given

Session Destination:

```text
Hospital B
```

하지만 Grant/Request Target:

```text
Hospital C
```

### When

PACS Import.

### Then

```text
409 Conflict
```

또는:

```text
403 Forbidden
```

### Required

Hospital C에 STOW-RS 요청이 발생해서는 안 된다.

---

# 39. AT-SEC-014 — Invalid Session State

**Traceability**

```text
SEC-AUTHZ-004
THR-029
```

각 상태를 테스트한다.

```text
EXPIRED
REVOKED
FAILED
REJECTED
CANCELLED
```

### When

보호 Imaging Action 수행.

### Then

```text
403 Forbidden
```

또는 Domain State Conflict:

```text
409 Conflict
```

### Required

Imaging Access 없음.

---

# 40. AT-SEC-015 — Study UID Direct Access

**Traceability**

```text
SEC-AUTHZ-007
THR-009
```

### Given

공격자가 StudyInstanceUID를 알고 있음.

유효한 Session/Grant 없음.

### When

Viewer 또는 Imaging Retrieval 시도.

### Then

```text
DENY
```

Study UID 자체는 접근권한이 아니다.

---

# 41. AT-SEC-016 — Unauthorized Study Listing

**Traceability**

```text
SEC-DICOM-001
THR-011
```

### Given

권한 없는 Tenant.

### When

```text
GET /exchange-sessions/{sessionId}/studies
```

### Then

```text
403 Forbidden
```

Study Metadata가 반환되지 않아야 한다.

---

# 42. AT-SEC-017 — Authorization Engine Failure

**Traceability**

```text
SEC-AUTHZ-003
SEC-ERR-003
THR-030
```

### Given

Authorization Policy Evaluation에서 의도적인 오류 발생.

### When

보호 Action 요청.

### Then

```text
DENY
```

### Required

다음 동작 금지:

```text
Security Error
→ Continue
```

### HTTP

권장:

```text
403
```

또는 안전한:

```text
5xx
```

단 어떠한 경우에도 Resource는 반환하지 않는다.

---

# 43. AT-SEC-018 — Integrity Mismatch

**Traceability**

```text
SEC-INT-002
THR-021
```

### Given

Destination Payload 검증값을 의도적으로 불일치하게 구성.

### When

PACS Import Integrity Verification.

### Then

```text
integrityStatus = FAILED
transferStatus = FAILED
```

### Required

```text
transferStatus = COMPLETED
```

가 되어서는 안 된다.

### Audit

```text
INTEGRITY_FAILURE
PACS_TRANSFER_FAILED
```

---

# 44. AT-SEC-019 — Sensitive Information in Error

**Traceability**

```text
SEC-ERR-001
THR-010
```

### Given

의도적인 Backend Error.

### When

API 호출.

### Then

Response에 다음이 포함되어서는 안 된다.

```text
DB password
Raw token
Private key
Filesystem credential
Stack secret
```

---

# 45. AT-SEC-020 — Sensitive Information in Log

**Traceability**

```text
SEC-LOG-001
THR-034
```

### When

Authentication/Download/PACS Action을 실행한다.

### Then

Application Log / Audit Log에 다음이 존재해서는 안 된다.

```text
Password
Raw bearer token
Private key
Raw DICOM binary
DEK
KEK
```

---

# 46. AT-SEC-021 — Direct Temporary Storage Access

**Traceability**

```text
SEC-DATA-001
THR-023
```

### Given

Internal `storage_ref`가 존재.

### When

사용자가 직접 Storage Path로 접근을 시도.

### Then

```text
DENY
```

또는 External Route 자체가 존재하지 않아야 한다.

---

# 47. AT-SEC-022 — TLS Required

**Traceability**

```text
SEC-TLS-001
THR-014
THR-022
```

### Verify

```text
Browser ↔ MediQ
MediQ ↔ Orthanc A
MediQ ↔ Orthanc B
```

보호 통신은 HTTPS/TLS여야 한다.

### PASS

평문 보호통신 Endpoint가 P0 정상경로에 존재하지 않는다.

---

# 48. AT-SEC-023 — Certificate Validation

**Traceability**

```text
SEC-TLS-002
```

### Given

Invalid/Untrusted Certificate 또는 Test Certificate Failure 조건.

### Then

기본 Client 동작은 연결 실패여야 한다.

Production-like 경로에서:

```text
verify=false
```

와 같은 우회 설정을 허용해서는 안 된다.

---

# 49. AT-SEC-024 — Token Expiration

**Traceability**

```text
SEC-TOK-002
THR-036
```

### Given

Expired Token.

### Then

```text
401 Unauthorized
```

---

# 50. AT-SEC-025 — Wrong Audience Token

**Traceability**

```text
SEC-TOK-003
THR-037
```

### Given

다른 Audience용 Token.

### Then

```text
401 Unauthorized
```

---

# 51. AT-SEC-026 — Client Tenant Spoofing

**Traceability**

```text
THR-028
SEC-TEN-001
```

### Given

ACTOR-C 인증 Token.

Request Body/Header에:

```text
tenantId = Tenant B
```

조작.

### Then

Server는 인증 Context의 Tenant C를 사용해야 한다.

### Expected

```text
DENY
```

---

# 52. E2E Golden Path Tests

---

# 53. AT-E2E-001 — Viewer Golden Path

### Objective

Hospital A의 CT/MRI를 정상적인 Patient-Controlled Flow를 거쳐 Hospital B 사용자가 Viewer에서 조회한다.

### Given

```text
Hospital A Test Orthanc
→ Synthetic Study exists

Patient Mapping
→ A mapping VALID
→ B mapping VALID

ACTOR-B authenticated
```

### When

순서대로 실행한다.

```text
1. POST /exchange-sessions

2. POST /consents/request

3. POST /consents/{id}/approve

4. POST /grants/issue
   scope = study:view

5. POST /actions/view
```

### Then

```text
Viewer renders Study
```

### Expected HTTP Sequence

```text
201
201
200
201
200
```

### Expected Audit

```text
SESSION_CREATED
CONSENT_REQUESTED
CONSENT_APPROVED
AUTHORIZATION_GRANTED
GRANT_CREATED
VIEWER_OPENED
```

### Result

```text
PASS
```

---

# 54. AT-E2E-002 — Download Golden Path

### Flow

```text
Create Exchange
→ Consent
→ Grant study:download
→ DICOM Download
```

### Expected

```text
HTTP 200
Valid DICOM package
```

### Audit

```text
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
```

---

# 55. AT-E2E-003 — PACS Import Golden Path

P0의 가장 중요한 Acceptance Test다.

### Given

```text
Hospital A Orthanc:
Synthetic CT/MRI exists

Hospital B Orthanc:
Available

PatientMapping:
Hospital A = VALID
Hospital B = VALID

Destination:
Hospital B
```

### When

```text
1. Create Exchange
2. Request Consent
3. Approve Consent
4. Issue study:pacs-transfer Grant
5. Validate Patient Mapping
6. Execute PACS Import
7. Verify Destination
8. Verify Integrity
9. Read Provenance
10. Read Audit
```

### Then

다음 전체 흐름이 성공해야 한다.

```text
Hospital A Orthanc
      ↓ WADO-RS
MediQ
      ↓ STOW-RS
Hospital B Orthanc
```

### Expected API Result

```text
transferStatus = COMPLETED

destinationVerified = true

integrityStatus = VERIFIED
```

### Destination

Hospital B Orthanc에서 대상 Study가 실제 존재한다.

### Provenance

```text
Source:
Hospital A

Destination:
Hospital B

Transfer:
PACS_IMPORT

Status:
COMPLETED

Integrity:
VERIFIED
```

### Audit

최소:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED

AUTHORIZATION_GRANTED
GRANT_CREATED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED

INTEGRITY_VERIFIED

SESSION_COMPLETED
```

### Final State

```text
ExchangeSession = COMPLETED
```

### Result

```text
PASS
```

---

# 56. AT-E2E-004 — Wrong Tenant Negative Golden Path

### Given

정상 A→B Exchange.

### When

Hospital C Actor가 동일 Session에 접근.

### Then

```text
DENY
```

### Required

```text
No Study Data
No Download
No STOW
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 57. AT-E2E-005 — Consent Withdrawal Negative Golden Path

### Given

정상 Session과 ACTIVE Consent.

### When

Consent 철회 후 신규 Grant 발급 시도.

### Then

```text
DENY
```

### Required

철회 후 신규 Viewer/Download/PACS Grant가 발급되지 않아야 한다.

---

# 58. AT-E2E-006 — Mapping Failure Negative Golden Path

### Given

정상 Session, Consent, Grant.

Hospital B Mapping:

```text
AMBIGUOUS
```

### When

PACS Import.

### Then

```text
DENY / FAIL
```

### Required

Hospital B Orthanc에 Study가 저장되지 않아야 한다.

---

# 59. AT-E2E-007 — Integrity Failure Negative Golden Path

### Given

STOW 동작은 성공.

Integrity Evidence 불일치.

### Then

```text
PACS Import = FAILED
```

### Required

```text
Session COMPLETED
```

처리를 해서는 안 된다.

### Provenance

```text
transferStatus = FAILED
```

### Audit

```text
INTEGRITY_FAILURE
PACS_TRANSFER_FAILED
```

---

# 60. DICOMweb Adapter Acceptance

## AT-DICOM-001 — QIDO-RS

Hospital A Test Orthanc에서 Study Query가 성공해야 한다.

```text
Expected:
StudyInstanceUID discovered
```

---

## AT-DICOM-002 — WADO-RS

선택된 Study Payload를 정상 조회할 수 있어야 한다.

---

## AT-DICOM-003 — STOW-RS

Hospital B Orthanc로 Test Study를 정상 저장할 수 있어야 한다.

---

## AT-DICOM-004 — Upstream Failure

Orthanc A 또는 B를 의도적으로 중단한다.

### Expected

```text
502 Upstream Failure
```

또는 정의된 안전한 Failure.

### Required

성공 상태로 기록하지 않는다.

---

# 61. Audit Acceptance

## AT-AUD-001 — Audit Context

Audit Event는 최소:

```text
timestamp
actor_reference
tenant_context
session_reference
action
result
```

을 제공해야 한다.

---

## AT-AUD-002 — Correlation

동일 API Action의 로그와 Audit Event를:

```text
correlation_id
```

등으로 연결 가능해야 한다.

---

## AT-AUD-003 — Audit Minimization

Audit에:

```text
DICOM binary
Raw token
Password
Private key
```

가 존재하지 않아야 한다.

---

# 62. Provenance Acceptance

## AT-PROV-001

PACS Import 완료 시 다음 관계를 재구성할 수 있어야 한다.

```text
PatientReference
        ↓
ExchangeSession
        ↓
ImagingPackage
        ↓
StudyReference
        ↓
Hospital A
        ↓
Hospital B
        ↓
Integrity Result
```

---

# 63. State Transition Acceptance

다음 정상 State Flow를 지원해야 한다.

```text
REQUESTED
→ CONSENT_PENDING
→ CONSENTED
→ AUTHORIZED
→ READY / ACTIVE
→ COMPLETED
```

실패:

```text
FAILED
REJECTED
EXPIRED
REVOKED
CANCELLED
```

에서 보호 Action이 실행되지 않아야 한다.

---

# 64. Requirement Traceability Matrix

| Acceptance Test | Requirement              |
| --------------- | ------------------------ |
| AT-FUNC-001     | REQ-EXC-001, REQ-EXC-002 |
| AT-FUNC-003     | REQ-PAT-003, REQ-PAT-004 |
| AT-FUNC-005     | REQ-CON-001, REQ-CON-002 |
| AT-FUNC-006     | REQ-CON-003              |
| AT-FUNC-008     | REQ-GRT-001, REQ-GRT-002 |
| AT-FUNC-010     | REQ-VIEW-001             |
| AT-FUNC-011     | REQ-DWN-001              |
| AT-FUNC-012     | REQ-PACS-001~005         |
| AT-FUNC-014     | REQ-INT-001              |
| AT-FUNC-015     | REQ-PROV-002             |
| AT-FUNC-016     | REQ-AUD-001              |
| AT-SEC-004      | REQ-TEN-002              |
| AT-SEC-005      | REQ-CON-003              |
| AT-SEC-010      | REQ-GRT-004              |
| AT-SEC-012      | REQ-PAT-004              |
| AT-SEC-018      | REQ-INT-001, REQ-INT-002 |
| AT-E2E-003      | P0 Core E2E              |

---

# 65. Security Traceability Matrix

| Test       | Security Requirement |
| ---------- | -------------------- |
| AT-SEC-001 | SEC-IAM-004          |
| AT-SEC-003 | SEC-API-002          |
| AT-SEC-004 | SEC-TEN-001          |
| AT-SEC-005 | SEC-CONSENT-001      |
| AT-SEC-006 | SEC-CONSENT-002      |
| AT-SEC-007 | SEC-GRANT-005        |
| AT-SEC-008 | SEC-GRANT-002        |
| AT-SEC-009 | SEC-GRANT-003        |
| AT-SEC-010 | SEC-AUTHZ-009        |
| AT-SEC-012 | SEC-IAM-007          |
| AT-SEC-013 | SEC-DICOM-005        |
| AT-SEC-014 | SEC-AUTHZ-004        |
| AT-SEC-015 | SEC-AUTHZ-007        |
| AT-SEC-017 | SEC-ERR-003          |
| AT-SEC-018 | SEC-INT-002          |
| AT-SEC-019 | SEC-ERR-001          |
| AT-SEC-020 | SEC-LOG-001          |
| AT-SEC-021 | SEC-DATA-001         |
| AT-SEC-022 | SEC-TLS-001          |

---

# 66. Threat Traceability Matrix

| Threat                         | Acceptance      |
| ------------------------------ | --------------- |
| THR-001 Unauthenticated Access | AT-SEC-001      |
| THR-002 BOLA                   | AT-SEC-003      |
| THR-003 Cross Tenant           | AT-SEC-004      |
| THR-004 Consent Bypass         | AT-SEC-005, 006 |
| THR-005 Scope Escalation       | AT-SEC-007      |
| THR-006 Grant Scope Abuse      | AT-SEC-010, 011 |
| THR-007 Expired Grant          | AT-SEC-008      |
| THR-008 Wrong Recipient        | AT-SEC-009      |
| THR-009 Viewer URL Bypass      | AT-SEC-015      |
| THR-011 Unauthorized QIDO      | AT-SEC-016      |
| THR-017 Wrong Destination      | AT-SEC-013      |
| THR-018 Invalid Mapping        | AT-SEC-012      |
| THR-019 Unauthorized STOW      | AT-SEC-011      |
| THR-021 Integrity Ignored      | AT-SEC-018      |
| THR-023 Direct Storage Access  | AT-SEC-021      |
| THR-028 Tenant Spoofing        | AT-SEC-026      |
| THR-030 Security Check Failure | AT-SEC-017      |
| THR-034 Sensitive Log          | AT-SEC-020      |

---

# 67. API Coverage Matrix

| API                              | Acceptance                  |
| -------------------------------- | --------------------------- |
| POST `/exchange-sessions`        | AT-FUNC-001                 |
| GET `/exchange-sessions/{id}`    | AT-FUNC-002, AT-SEC-003     |
| POST `/patient-mapping/validate` | AT-FUNC-003, AT-SEC-012     |
| GET `/studies`                   | AT-FUNC-004, AT-SEC-016     |
| POST `/consents/request`         | AT-FUNC-005                 |
| POST `/consents/{id}/approve`    | AT-FUNC-006                 |
| POST `/consents/{id}/withdraw`   | AT-FUNC-007                 |
| POST `/grants/issue`             | AT-FUNC-008, AT-SEC-005~009 |
| POST `/grants/{id}/revoke`       | AT-FUNC-009                 |
| POST `/actions/view`             | AT-FUNC-010                 |
| POST `/actions/download`         | AT-FUNC-011, AT-SEC-010     |
| POST `/actions/pacs-import`      | AT-FUNC-012, AT-SEC-011~013 |
| GET `/provenance`                | AT-FUNC-015                 |
| GET `/audit-events`              | AT-FUNC-016                 |

---

# 68. P0 Mandatory Gate

다음 Test는 모두 `PASS`해야 한다.

```text
GATE-AT-01
Exchange Creation
AT-FUNC-001

GATE-AT-02
Patient Mapping
AT-FUNC-003

GATE-AT-03
Consent Workflow
AT-FUNC-005
AT-FUNC-006

GATE-AT-04
Grant
AT-FUNC-008

GATE-AT-05
Viewer
AT-FUNC-010

GATE-AT-06
Download
AT-FUNC-011

GATE-AT-07
PACS Import
AT-FUNC-012
AT-FUNC-013

GATE-AT-08
Integrity
AT-FUNC-014

GATE-AT-09
Tenant Isolation
AT-SEC-004

GATE-AT-10
Consent Enforcement
AT-SEC-005
AT-SEC-006

GATE-AT-11
Scope Enforcement
AT-SEC-010
AT-SEC-011

GATE-AT-12
Patient Mapping Security
AT-SEC-012

GATE-AT-13
Destination Binding
AT-SEC-013

GATE-AT-14
Fail Closed
AT-SEC-017

GATE-AT-15
Integrity Failure
AT-SEC-018

GATE-AT-16
Golden Viewer
AT-E2E-001

GATE-AT-17
Golden Download
AT-E2E-002

GATE-AT-18
Golden PACS Transfer
AT-E2E-003
```

---

# 69. Critical Fail Conditions

다음 중 하나라도 발생하면:

```text
CAPSTONE P0 SECURITY ACCEPTANCE
→ FAIL
```

한다.

### Critical Failure 1

```text
No Consent
→ Access ALLOW
```

### Critical Failure 2

```text
Wrong Tenant
→ Resource ALLOW
```

### Critical Failure 3

```text
View-only Grant
→ Download/PACS Import ALLOW
```

### Critical Failure 4

```text
Invalid Patient Mapping
→ PACS Import executes
```

### Critical Failure 5

```text
Wrong Destination
→ STOW executes
```

### Critical Failure 6

```text
Integrity FAILED
→ Transfer COMPLETED
```

### Critical Failure 7

```text
Unknown Authorization
→ ALLOW
```

---

# 70. Capstone MVP Definition of Done

MediQ P0는 다음 조건을 모두 충족해야 한다.

```text
Hospital A Test Orthanc
PASS

Hospital B Test Orthanc
PASS

Synthetic DICOM
PASS

PatientReference
PASS

PatientMapping
PASS

ExchangeSession
PASS

Consent Workflow
PASS

Authorization
PASS

TransferGrant
PASS

Viewer
PASS

Download
PASS

STOW-RS PACS Import
PASS

Tenant Isolation
PASS

Integrity
PASS

Provenance
PASS

Audit
PASS

Negative Security Tests
PASS

Golden E2E
PASS
```

---

# 71. Readiness Decision Model

테스트 결과는 다음과 같이 판정한다.

## PASS

모든 P0 Mandatory Gate 통과.

## PARTIAL

핵심 E2E는 동작하지만 일부 비핵심 P0 Acceptance가 미완료.

## BLOCKED

환경·인프라 문제로 핵심 Acceptance 실행 자체가 불가능.

## FAIL

실행했지만 Requirement를 만족하지 못함.

---

# 72. Technical vs Production Readiness

Acceptance Result는 반드시 분리해서 보고한다.

```text
CAPSTONE TECHNICAL READINESS

Functional:
PASS / PARTIAL / BLOCKED / FAIL

Security:
PASS / PARTIAL / BLOCKED / FAIL

E2E:
PASS / PARTIAL / BLOCKED / FAIL

CAPSTONE MVP READY:
YES / NO
```

별도로:

```text
PRODUCTION READINESS

Real Patient Data:
NOT APPROVED

Real Patient Identity:
NOT VALIDATED

Legal Review:
FUTURE

Privacy Compliance:
FUTURE

Clinical Deployment:
NOT READY

Production Hospital Integration:
FUTURE

PRODUCTION READY:
NO / NOT ASSESSED
```

---

# 73. Acceptance Baseline Decision

```text
PROJECT:
MediQ

ACCEPTANCE TEST VERSION:
v1.1 Viewer Architecture Amendment

FUNCTIONAL ACCEPTANCE:
DEFINED

SECURITY NEGATIVE ACCEPTANCE:
DEFINED

E2E GOLDEN PATH:
DEFINED

VIEWER GOLDEN PATH:
DEFINED

DOWNLOAD GOLDEN PATH:
DEFINED

PACS IMPORT GOLDEN PATH:
DEFINED

TENANT ISOLATION:
DEFINED

CONSENT ENFORCEMENT:
DEFINED

GRANT SCOPE ENFORCEMENT:
DEFINED

PATIENT MAPPING SECURITY:
DEFINED

DESTINATION BINDING:
DEFINED

INTEGRITY:
DEFINED

PROVENANCE:
DEFINED

AUDIT:
DEFINED

FAIL CLOSED:
DEFINED

P1 MOBILE:
NOT REQUIRED FOR P0

PRODUCTION VALIDATION:
SEPARATED

ACCEPTANCE BASELINE READY:
YES
```

---

# 74. Next Phase

`ACCEPTANCE-TESTS.md` 이후에는 더 이상 상위 설계문서를 크게 추가하기보다 실제 구현계획으로 내려간다.

다음 공식 산출물:

```text
IMPLEMENTATION-PLAN.md
```

권장 구현 순서:

```text
Phase 0
Repository / Docker / Orthanc / PostgreSQL

        ↓

Phase 1
Tenant / Hospital / PatientReference / Mapping

        ↓

Phase 2
ExchangeSession

        ↓

Phase 3
Consent

        ↓

Phase 4
Authorization / TransferGrant

        ↓

Phase 5
QIDO / WADO / ImagingPackage

        ↓

Phase 6
Viewer

        ↓

Phase 7
Download

        ↓

Phase 8
STOW-RS PACS Import

        ↓

Phase 9
Integrity / Provenance / Audit

        ↓

Phase 10
Security Negative Tests

        ↓

Phase 11
E2E Golden Path

        ↓

CAPSTONE MVP RELEASE
```

---

# FINAL ACCEPTANCE POLICY

> **MediQ P0의 성공은 기능이 단순히 실행되는 것으로 판단하지 않는다. 정상 요청은 PASS하고, 비정상 요청은 반드시 DENY하며, 그 결과를 Audit·Provenance·Integrity Evidence로 확인할 수 있어야 한다.**

> **특히 `No Consent`, `Wrong Tenant`, `Wrong Scope`, `Invalid Patient Mapping`, `Wrong Destination`, `Integrity Failure`, `Unknown Authorization` 중 하나라도 실제 접근 또는 전송으로 이어지면 P0 Security Acceptance는 FAIL이다.**

> **최종 P0 Golden Path는 `Hospital A Test Orthanc → MediQ → Consent/Grant → STOW-RS → Hospital B Test Orthanc → Destination Verification → Integrity VERIFIED → Provenance → Audit` 전체가 재현 가능하게 PASS하는 것이다.**

---

# Viewer and Storage Acceptance Amendment — 2026-09-15

아래 항목은 계획된 테스트다. 실제 자동화와 실행 증거가 없으므로 현재 상태는 모두 `PLANNED / NOT RUN`이다.

| Test ID | Scenario | Expected | Scope | Current |
|---|---|---|---|---|
| TC-VIEW-004 | Hospital User + valid Tenant/Consent/`study:view` | Cloud Viewer Session PASS | P0 | NOT RUN |
| TC-VIEW-005 | Synthetic Patient + matching PatientReference + valid Grant | Cloud Viewer Session PASS | P0 | NOT RUN |
| TC-VIEW-006 | Viewer requests Series/Instance/Frame | Source PACS WADO-RS on-demand delivery PASS | P0 | NOT RUN |
| TC-VIEW-007 | Expired/revoked Viewer Session reused | DENY + Audit | P0 | NOT RUN |
| TC-VIEW-008 | Direct DICOM UID, raw PACS URL 또는 leaked Viewer URL | DENY; no credential/endpoint leakage | P0 | NOT RUN |
| TC-VIEW-009 | Source PACS unavailable | Fail Closed + explicit error + Audit | P0 | NOT RUN |
| TC-SEC-VIEW-001 | Cross-Tenant Hospital/Patient Viewer request | DENY | P0 | NOT RUN |
| TC-SEC-VIEW-002 | Consent revoked during active Viewer Session | subsequent retrieval DENY | P0 | NOT RUN |
| TC-SEC-VIEW-003 | Unallowlisted/forged source endpoint | no upstream call + DENY | P0 | NOT RUN |
| TC-DATA-004 | Browser/proxy response and cloud storage inspection | no permanent copy/no sensitive intermediary cache | P0 | NOT RUN |
| TC-DATA-005 | Temporary object TTL/session expiry | purge + purge Audit PASS | P0 | NOT RUN |
| TC-SCOPE-004 | VIEW-only Grant attempts Download/PACS Import/Mobile Export | all non-VIEW actions DENY | P0 | NOT RUN |
| TC-MOB-007 | Authorized Patient opens exported Vault image | Mobile Viewer PASS | P1 | NOT RUN |
| TC-MOB-008 | Lost/unbound device or failed local auth | Vault decryption DENY | P1 | NOT RUN |
| TC-MOB-009 | Expired/revoked/offline capsule policy | 30-day boundary enforcement result + Audit | P1 | NOT RUN |

## P0 Viewer Golden Path

```text
Hospital A Test Orthanc
→ MediQ Authentication / Patient Mapping / Consent / Authorization
→ Short-Lived study:view Grant
→ ViewerSession
→ WADO-RS Series/Instance/Frame Retrieval
→ Progressive Cloud Viewer Delivery
→ No Permanent Cloud Copy
→ Audit / Provenance
```

P0 E2E 완료에는 기존 PACS Import Golden Path와 함께 Hospital Viewer 및 Synthetic Patient Cloud Viewer의 PASS/DENY 증거가 필요하다. P1 Mobile 테스트 실패 또는 미완료는 P0 완료를 무효화하지 않는다.

**공통 기준:** Hospital PACS가 Source of Record이고 MediQ Cloud는 Permanent PACS/장기 Archive가 아니다. P0 Viewer는 Source PACS On-Demand DICOMweb Retrieval을 증명해야 한다.

---

# P1 Mobile Security Policy Acceptance Amendment — 2026-09-15

아래 항목은 계획된 P1 시험이다. 구현과 실행 증거가 없으므로 모두 `PLANNED / NOT RUN`이다.

| Test ID | Scenario | Expected | Scope | Current |
|---|---|---|---|---|
| TC-MOB-010 | Android Native Vault와 iOS MVP 경로 확인 | Android Native Vault가 우선되고 iOS는 Cloud Viewer 경로를 사용; 공유 Capsule/Protocol은 플랫폼 독립적 | P1 | NOT RUN |
| TC-MOB-011-A | Verified `STRONGBOX` Device 등록 | Persistent Vault ALLOW, 실제 Security Level 기록 | P1 | NOT RUN |
| TC-MOB-011-B | Verified `TRUSTED_ENVIRONMENT` Device 등록 | Persistent Vault ALLOW, 실제 Security Level 기록 | P1 | NOT RUN |
| TC-MOB-011-C | `SOFTWARE`, `UNKNOWN`, Attestation 실패 또는 속성 불일치 | Mobile Export/Persistent Vault DENY, Cloud Viewer 안내, Silent Downgrade 없음 | P1 | NOT RUN |
| TC-MOB-012-A | 대형 DICOM Capsule 저장·점진 조회 | AES-256-GCM 인증 검증과 Instance/Chunk 점진 복호화 PASS; 평문 파일 없음 | P1 | NOT RUN |
| TC-MOB-012-B | Capsule 또는 Ciphertext 변조 | 인증 실패, Viewer DENY, 오류/Audit | P1 | NOT RUN |
| TC-MOB-012-C | 동일 Device용 복수 승인 Wrap Slot을 Capsule 발급 시 함께 생성 | Payload는 한 번만 암호화되고 각 승인 Slot에서 동일 DEK 복원 PASS; 새 Device/Cross-device Slot은 없음 | P1 | NOT RUN |
| TC-MOB-013-A | 발급/온라인 검증 후 30일 이내 Offline Open | Device Authentication 후 PASS | P1 | NOT RUN |
| TC-MOB-013-B | 30일 만료 상태에서 Offline Open | 복호화 DENY | P1 | NOT RUN |
| TC-MOB-013-C | Online Lease 갱신 시 Consent/Grant/Device Revoke | 무효 상태면 갱신 DENY + Audit | P1 | NOT RUN |
| TC-MOB-014-A | Viewer 표시 중 Background 전환 | 즉시 Privacy Screen, Render 중단, Pixel Buffer 제거 | P1 | NOT RUN |
| TC-MOB-014-B | 잠금 없는 동일 기기에서 60초 이내 복귀 | 민감 화면은 Background 동안 비노출; 정책상 재인증 생략 가능 | P1 | NOT RUN |
| TC-MOB-014-C | 60초 초과, OS 잠금 또는 상태 변경 후 복귀 | 재인증 전 Viewer DENY | P1 | NOT RUN |
| TC-MOB-015-A | Android Screenshot/Recording/비보안 Display 시도 | Secure Window 정책 적용, 지원 범위에서 영상 비노출 | P1 | NOT RUN |
| TC-MOB-015-B | iOS 후속 구현의 Recording/Mirroring/App Switcher | Viewer 가림/중단; Screenshot 한계와 잔여 위험 문서화 | P1 | NOT RUN |
| TC-MOB-016-A | 분실 Device Revoke 후 Online Refresh | Lease 갱신 DENY, Key/Session 제거 시도, Audit | P1 | NOT RUN |
| TC-MOB-016-B | 새 Device + 기존 유효 Consent/Grant | Source PACS 재조회 후 새 Device-bound Capsule 재발급 PASS | P1 | NOT RUN |
| TC-MOB-016-C | 새 Device + 만료/철회 Consent 또는 Grant | 자동 재발급 DENY, 새 승인 요구 | P1 | NOT RUN |
| TC-MOB-017 | Logout/Revoke/Secure Delete 후 Local Key 제거 | 기존 Capsule 복호화 DENY + lifecycle Audit | P1 | NOT RUN |
| TC-MOB-018-A | Backend Writer와 Android Reader가 v1 Golden Capsule 상호운용 | Header/Deterministic CBOR/Nonce/AAD/Tag/COSE/HPKE 결과 byte-for-byte 일치 | P1 | NOT RUN |
| TC-MOB-018-B | Missing/Duplicate/Reordered/Replaced/Truncated/Mixed/Extra Record 변조 Corpus | 모두 DENY; 정상 Viewer 노출 없음; Integrity/Security Event | P1 | NOT RUN |
| TC-MOB-018-C | Range Download 중단 후 동일 ETag 재개, 이후 ETag 변경 | 동일 ETag는 검증 Record 재사용; 변경 시 Staging 전체 Reset, 혼합 없음 | P1 | NOT RUN |
| TC-MOB-018-D | DOWNLOADING/VERIFYING/READY_TO_COMMIT에서 Process Kill·Storage Full·Rename 실패 | Partial Capsule 비노출; Recovery 후 COMMITTED 또는 안전 제거 | P1 | NOT RUN |
| TC-MOB-018-E | StrongBox/TEE P-256 HPKE Device Wrap 상호운용과 Wrong Device | 승인 Device는 동일 DEK 복원; Wrong Device는 DENY; Software fallback 없음 | P1 | NOT RUN |
| TC-MOB-018-F | Unknown Major/Critical Flag/Suite/Wrap Profile 및 미승인 PQC Slot | Allowlist 정책에 따라 Fail Closed; 지원 Slot 병행 시 지원 Slot만 선택 | P1 | NOT RUN |
| TC-MOB-019-A | Authorization Code + PKCE S256 Mobile Login Contract | Implicit/Password Grant 없음; 사용자 Token 발급·검증 계약 일치 | P1 | NOT RUN |
| TC-MOB-019-B | 등록 후 민감 API에 Bearer만 사용하거나 DPoP `jti/htm/htu/ath/cnf.jkt` 변조 | 모두 DENY; Replay Cache/Audit 확인 | P1 | NOT RUN |
| TC-MOB-019-C | Attestation Challenge 재사용·만료·Purpose/Key 치환 | Device Registration/Reassessment DENY | P1 | NOT RUN |
| TC-MOB-019-D | 다른 Patient/Tenant/Device의 Operation·Capsule·Lease ID 접근 | 404 또는 정책상 안전한 DENY; 존재 정보 비노출 | P1 | NOT RUN |
| TC-MOB-019-E | Capsule-scoped Download Token을 다른 Capsule에 사용하거나 ETag 변경 중 Resume | DENY 또는 전체 Reset; 서로 다른 Record 혼합 없음 | P1 | NOT RUN |
| TC-MOB-019-F | Offline Lease Proof 변조·Version Rollback·30일 초과 | Local/API 모두 DENY | P1 | NOT RUN |
| TC-MOB-019-G | Device Revoke/Server Capsule Delete 응답 검증 | 신규 Export/Session/Renewal 차단; Offline 삭제 상태는 확인 전 UNKNOWN | P1 | NOT RUN |
| TC-MOB-019-H | Mobile Audit Duplicate/Offline Sync/Forged Device Reference/Sequence Gap | Dedup, Client-reported 표시, 위조 거부, Gap Detection | P1 | NOT RUN |

모든 Mobile 시험은 Synthetic/Test/De-identified DICOM과 Test Identity만 사용한다. 위 시험 미실행은 P1 정책의 구현 또는 보안 PASS를 의미하지 않는다.

---

# Synthetic Health Data Preview Acceptance — 2026-09-26

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-HHP-001` | 소개·선택·동의·목록·상세·오류·초기화 화면 | 모든 화면에 DEMO MODE와 실제 연계 미완료 표시 | P1 | NOT RUN |
| `TC-HHP-002` | 정상 Preview | 승인된 Synthetic Fixture 목록·상세 표시 | P1 | NOT RUN |
| `TC-HHP-003` | `sourceMode`/`providerMode` 누락·변조 | Fail Closed, Record 미표시, DEMO security event | P1 | NOT RUN |
| `TC-HHP-004` | 실제 형태 Patient ID 또는 PHI 문자열 Fixture | Fixture 거부 | P1 | NOT RUN |
| `TC-HHP-005` | 전체 Preview Network Capture | 실제 건강정보 기관으로 Outbound Call 없음 | P1 | NOT RUN |
| `TC-HHP-006` | Mock Consent 완료·철회 | 실제 Consent/Authorization/Grant 변화 없음 | P1 | NOT RUN |
| `TC-HHP-007` | Preview Reset | Session·Cache 제거 및 Reset Audit | P1 | NOT RUN |
| `TC-HHP-008` | 공유·PACS Import·의료진 전달 시도 | Action 미제공 또는 명시적 DENY | P1 | NOT RUN |
| `TC-HHP-009` | Screenshot·발표 Viewport | DEMO Banner가 가려지거나 잘리지 않음 | P1 | NOT RUN |
| `TC-HHP-010` | Preview Disabled/Failure 상태에서 P0 E2E | P0가 독립 실행되고 결과가 변하지 않음 | P1/P0 Regression | NOT RUN |
| `TC-HHP-011` | 건강검진·일반혈액·항체 Fixture 목록 | 세 유형 구분과 Card별 SYNTHETIC 표시 | P1 | NOT RUN |
| `TC-HHP-012` | 항체검사 상세 | 값·단위·출처 참고범위·합성 원문 판정·비진단 고지 | P1 | NOT RUN |
| `TC-HHP-013` | 단위·참고범위 누락 Fixture | 추정 없이 `제공되지 않음` 표시 | P1 | NOT RUN |
| `TC-HHP-014` | 합성 영상·검사 관련 보기 | 명시 Link만 표시, 진단·인과 문구 없음 | P1 | NOT RUN |
| `TC-HHP-015` | 검사 공유·PACS Import·실제 기관 Route | Action 부재 또는 DENY, 외부 호출 없음 | P1 | NOT RUN |

위 Test가 실행되기 전 Preview 기능은 `DONE` 또는 실제 연계 `PASS`로 표시할 수 없다. 실제 지정심사·테스트베드·API 시험은 Productionization Acceptance에 속한다.

# Patient Experience Feature Pack Acceptance — 2026-09-26

| 기능 | Test Range | 분류 | 현재 상태 |
|---|---|---|---|
| 행동센터 | `TC-PXE-AC-001~006` | P1 | NOT RUN |
| 접근이력·영수증 | `TC-PXE-AR-001~006` | P1 | NOT RUN |
| 개인정보 최소 알림 | `TC-PXE-NT-001~006` | P1 | NOT RUN |
| 병원 방문 모드 | `TC-PXE-VM-001~007` | P1 | NOT RUN |
| 쉬운 영상 카드 | `TC-PXE-IC-001~006` | P1 | NOT RUN |
| 저장공간·만료 | `TC-PXE-SE-001~007` | P1 | NOT RUN |
| 오류 복구 | `TC-PXE-ER-001~007` | P1 | NOT RUN |
| 판독문·의뢰서 | `TC-PXE-RR-001~007` | POST-MVP | NOT RUN |
| 보호자·가족 위임 | `TC-PXE-GD-001~007` | POST-MVP | NOT RUN |

59개 상세 시나리오의 Given/When/Then 기대결과는 각 Feature Spec에 정의되어 있다. 구현 Ticket은 이를 자동·수동 시험 Case로 구체화하고 성공·실패·거부·오프라인·접근성 결과를 실제 명령과 함께 기록해야 한다. 현재 문서 정적 검증 외 기능 시험은 실행되지 않았다.

# Hospital Clinical Workflow P1 Acceptance — 2026-09-27

| 기능 | Test Range | 분류 | 현재 상태 |
|---|---|---|---|
| 관련 과거 영상 | `TC-HCW-PR-001~007` | P1 | NOT RUN |
| 진료 인계 패킷 | `TC-HCW-HP-001~008` | P1 | NOT RUN |
| 팀 배정·인계 | `TC-HCW-AS-001~008` | P1 | NOT RUN |
| 병원 알림함 | `TC-HCW-NT-001~007` | P1 | NOT RUN |
| 감사·출처 타임라인 | `TC-HCW-AT-001~007` | P1 | NOT RUN |

상세 Given/When/Then과 Expected Result는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`를 따른다. 필수 Negative Path는 다음을 포함한다.

- Cross-tenant, wrong Hospital, wrong Patient와 unauthorized Study
- Comparison Session 허용 집합 밖 UID
- Assignment를 이용한 권한 상승
- 영상 Grant를 이용한 판독문·의뢰서 접근
- 철회·만료 후 Notification Deep Link
- 중복·역순 Event와 Lost Update
- `RESULT_UNKNOWN`의 완료 오표시
- Role을 넘는 Audit Detail과 Export
- P1 장애 시 P0 Golden Path/Security Regression

모든 Test는 Synthetic/Test/De-identified DICOM과 Test Identity만 사용한다. 구현과 실제 실행 증거가 없으므로 PASS를 선언하지 않는다.
