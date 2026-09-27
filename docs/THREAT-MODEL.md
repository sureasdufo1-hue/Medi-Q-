# MediQ Threat Model

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `THREAT-MODEL.md`
**Version:** v1.7 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Method:** STRIDE-informed Asset / Trust Boundary Threat Analysis
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ P0 Architecture에서 발생 가능한 핵심 위협을 식별하고 다음 관계를 추적 가능하게 정의한다.

## 1.1 외부 AI 질문자료 위협 추가

| 위협 | 영향 | MVP 통제 |
|---|---|---|
| 질문문에 식별자·희귀 조합 포함 | 재식별·제3자 노출 | Synthetic-only, Allowlist, Preview, 익명화 완료 표현 금지 |
| Clipboard를 다른 앱이 읽음 | 의도하지 않은 노출 | 합성 자료만 복사, 직전 경고, 자동 Paste 없음 |
| 외부 LLM 저장·학습·국외처리 | 통제권 상실 | Provider 연동 없음, 설정 확인 고지, 실제자료 Production Gate |
| LLM 오답을 진단으로 사용 | 건강 위해 | 상담 준비형 Prompt, 비진단 고지, 응답 재수입 금지 |
| Prompt가 로그·URL에 남음 | 장기 노출 | URL/Analytics/Crash/일반 로그 기록 금지 |

세부 검증은 `TC-AIQ-001~008`을 따른다.

## 1.2 Synthetic RAG Threats

| 위협 | 영향 | 통제 |
|---|---|---|
| 사용자·Knowledge Prompt Injection | 정책 우회·Secret 요청 | Instruction/Data 분리, 고정 Policy, Injection Test |
| Source·Citation Hallucination | 거짓 근거와 오신뢰 | Manifest Membership·문장별 Citation Validator |
| 철회·구버전 자료 검색 | 낡은 설명 | Active Version만 Index, Cache 무효화 |
| Unsupported Medical Claim | 진단·치료 오인 | Grounding 검사, 금지 Intent, 전체 답변 폐기 |
| 실제 Record·식별자 입력 | 민감정보 노출 | Synthetic Gate, Allowlist Minimizer, Leakage Validator |
| 외부 Egress·Telemetry | 데이터 제3자 전송 | Network 차단, Egress Test, 외부 Provider 없음 |
| Model·Knowledge 변경 회귀 | 안전성 저하 | Version Pin, Golden Set 재평가, Release Gate |
| RAG 장애가 P0에 전파 | 의료영상 이용 방해 | 독립 실패경계, 보류 응답, P0 의존성 금지 |

상세 Red-team과 Release Gate는 `docs/ai/RAG-EVALUATION-AND-SAFETY-PLAN.md`를 따른다.

```text
Asset
  ↓
Threat
  ↓
Trust Boundary
  ↓
Attack / Misuse Scenario
  ↓
Existing Control
  ↓
Residual Risk
  ↓
Security Requirement
  ↓
Security Test
```

본 문서의 목적은:

> **MediQ의 의료영상 Exchange 과정에서 어떤 보안 위협을 차단해야 하며, 각 위협에 대해 어떤 통제와 테스트가 존재하는지를 명확하게 연결하는 것**

이다.

---

# 2. Scope

P0 Threat Model 대상:

```text
Browser / User
       ↓
     MediQ
       ↓
Hospital A Orthanc
       ↓
Temporary Imaging Handling
       ↓
Hospital B Orthanc
```

세부 P0 Workflow:

```text
Create Exchange
      ↓
Consent
      ↓
Authorization
      ↓
Transfer Grant
      ↓
VIEW
DOWNLOAD
PACS_IMPORT
```

---

# 3. Out of Scope

현재 Threat Model의 P0 Gate에 포함하지 않는다.

```text
실제 환자 본인확인 공격

실제 병원 AD / SSO 침해

Production KMS/HSM 공격

Production Cloud Account Compromise

24x7 SOC 운영위협

Multi-region 장애

FHIR 전체 보안모델

Mobile Secure Vault 공격 — P1

실제 의료기관 내부자 위협의 전체 모델링

국가 기반 Advanced Persistent Threat 전체 대응
```

이들은 향후 Productionization 또는 P1 Threat Model에서 확장한다.

---

# 4. Threat Modeling Principles

## Principle 1 — Deny by Default

```text
Unknown
→ DENY
```

명시적으로 허용되지 않은 접근은 거부한다.

---

## Principle 2 — Fail Closed

```text
Security Validation Error
→ DENY
```

보안통제 자체의 실패가 접근 허용으로 이어져서는 안 된다.

---

## Principle 3 — Explicit Authorization

의료영상 Resource 접근은 다음을 평가한다.

```text
Actor
Tenant
ExchangeSession
Consent
TransferGrant
Resource
Action
```

---

## Principle 4 — Least Privilege

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

는 독립적인 권한이다.

---

## Principle 5 — Synthetic/Test Data Only

현재 Threat Model에서 보호하는 의료영상은 Synthetic/Test Dataset이다.

그러나 Architecture는 실제 의료영상과 유사한 보안경계를 적용한다.

---

# 5. STRIDE Categories

위협 분류에는 STRIDE 개념을 활용한다.

| Category | Meaning                | MediQ Example           |
| -------- | ---------------------- | ----------------------- |
| S        | Spoofing               | 다른 Actor 또는 Tenant로 위장  |
| T        | Tampering              | DICOM 또는 Grant 변조       |
| R        | Repudiation            | PACS 전송 사실 부인           |
| I        | Information Disclosure | 다른 환자의 영상 조회            |
| D        | Denial of Service      | DICOMweb Endpoint 장애    |
| E        | Elevation of Privilege | view Grant로 download 수행 |

STRIDE는 위협 발견을 위한 분류도구이며 별도 제품기능을 의미하지 않는다.

---

# 6. Protected Assets

## ASSET-01 — Medical Imaging Payload

```text
DICOM Study
Series
SOP Instance
CT / MRI Payload
```

보안목표:

```text
Confidentiality
Integrity
Authorized Access
Traceability
```

---

## ASSET-02 — Patient Reference / Mapping

```text
PatientReference
Hospital-local Patient Mapping
```

핵심 위험:

> 잘못된 Mapping으로 다른 환자의 PACS에 영상이 저장되는 것

---

## ASSET-03 — ExchangeSession

의료영상 Exchange의 Workflow Context.

위험:

```text
Session hijacking
State manipulation
Unauthorized reuse
```

---

## ASSET-04 — ConsentArtifact

위험:

```text
Consent forgery
Withdrawn consent reuse
Scope expansion
Destination mismatch
```

---

## ASSET-05 — TransferGrant

위험:

```text
Grant theft
Replay
Scope escalation
Recipient substitution
Expired grant reuse
```

---

## ASSET-06 — Tenant Boundary

위험:

```text
Cross-tenant information disclosure
Cross-tenant grant reuse
Unauthorized session access
```

---

## ASSET-07 — DICOMweb Endpoint

```text
QIDO-RS
WADO-RS
STOW-RS
```

위험:

```text
Unauthorized query
Unauthorized retrieval
Unauthorized store
Endpoint substitution
```

---

## ASSET-08 — Integrity Evidence

영상 변조 여부 검증 결과.

---

## ASSET-09 — Provenance

의료영상 이동 경로 증적.

---

## ASSET-10 — Audit

사용자 및 시스템 Action 증적.

---

## ASSET-11 — Secrets / Credentials

```text
API Credentials
DB Password
Private Key
Service Credential
Access Token
```

---

# 7. Trust Boundaries

P0에서는 다음 Trust Boundary를 고정한다.

```text
TB-01
Browser / User
        ↕
MediQ

TB-02
MediQ
        ↕
Hospital A Orthanc

TB-03
MediQ
        ↕
Hospital B Orthanc

TB-04
MediQ
        ↕
Temporary Imaging Storage
```

추가 내부 논리 Boundary:

```text
TB-05
API Layer
        ↕
Application / Domain

TB-06
MediQ
        ↕
PostgreSQL
```

---

# 8. High-Level Threat Surface

```text
                    ┌────────────────────┐
                    │      Browser       │
                    │  User / Requester  │
                    └─────────┬──────────┘
                              │
                         TB-01│
                              ▼
                 ┌─────────────────────────┐
                 │          MediQ          │
                 │                         │
                 │ Authentication          │
                 │ Tenant Isolation        │
                 │ Exchange Session        │
                 │ Consent                 │
                 │ Authorization           │
                 │ Grant                   │
                 │ Imaging                 │
                 │ Audit / Provenance      │
                 └─────┬────────┬──────────┘
                       │        │
                 TB-02 │        │ TB-03
                       ▼        ▼
              ┌────────────┐ ┌────────────┐
              │ Orthanc A  │ │ Orthanc B  │
              │   Source   │ │Destination │
              └────────────┘ └────────────┘

                       │
                       │ TB-04
                       ▼
              ┌────────────────┐
              │ Temporary      │
              │ Imaging Storage│
              └────────────────┘
```

---

# 9. Risk Rating Model

P0에서는 단순한 3단계 평가를 사용한다.

## Likelihood

```text
LOW
MEDIUM
HIGH
```

## Impact

```text
LOW
MEDIUM
HIGH
```

## Risk

| Likelihood | Impact | Risk     |
| ---------- | ------ | -------- |
| LOW        | LOW    | LOW      |
| LOW        | HIGH   | MEDIUM   |
| MEDIUM     | MEDIUM | MEDIUM   |
| MEDIUM     | HIGH   | HIGH     |
| HIGH       | HIGH   | CRITICAL |

캡스톤에서는 정교한 정량 Risk 계산보다:

> **P0 의료영상 Exchange가 잘못된 Actor·Patient·Hospital로 수행될 가능성**

을 우선 평가한다.

---

# 10. TB-01 — Browser → MediQ

---

## THR-001 — Unauthenticated Access

**STRIDE:** Spoofing / Information Disclosure
**Asset:** Medical Imaging, ExchangeSession
**Likelihood:** HIGH
**Impact:** HIGH
**Initial Risk:** CRITICAL

### Scenario

공격자가 인증정보 없이:

```text
GET /exchange-sessions/{id}
```

또는 Viewer/Download Endpoint에 접근한다.

### Expected Attack Result

```text
Unauthenticated
→ DENY
```

### Existing Controls

```text
Bearer Authentication
Backend Authentication Middleware
Default Deny
```

### Security Requirements

```text
SEC-IAM-001
SEC-IAM-004
SEC-API-001
```

### Test

```text
STC-IAM-004
STC-NEG-007
```

### Residual Risk

```text
LOW
```

---

# 11. THR-002 — Session ID Enumeration / BOLA

**STRIDE:** Information Disclosure / Elevation of Privilege
**Asset:** ExchangeSession
**Initial Risk:** HIGH

### Scenario

공격자가 자신에게 속하지 않은:

```text
/exchange-sessions/{sessionId}
```

의 UUID를 획득하거나 추측하고 조회한다.

### Threat

```text
Known Session ID
→ Unauthorized Session Access
```

### Control

```text
Object-level Authorization
Tenant Context
Actor Context
```

### Requirement

```text
SEC-API-002
SEC-AUTHZ-005
SEC-TEN-001
```

### Test

```text
STC-API-002
STC-NEG-013
```

### Residual Risk

LOW

---

# 12. THR-003 — Cross-Tenant Resource Access

**STRIDE:** Information Disclosure / Elevation of Privilege
**Asset:** Tenant Boundary, DICOM

**Initial Risk:** CRITICAL

### Scenario

Hospital C 사용자가 Hospital A→B Exchange의 Resource에 접근한다.

```text
Hospital C
→ A→B Grant
```

### Expected

```text
DENY
```

### Controls

```text
Tenant Isolation
Recipient Binding
Explicit Exchange Authorization
```

### Requirements

```text
SEC-TEN-001
SEC-TEN-002
SEC-TEN-003
SEC-GRANT-004
```

### Test

```text
STC-TEN-001
STC-TEN-003
STC-NEG-005
```

### Residual Risk

LOW

---

# 13. THR-004 — Consent Bypass

**STRIDE:** Elevation of Privilege
**Asset:** ConsentArtifact / Imaging Payload
**Initial Risk:** CRITICAL

### Scenario

Consent가:

```text
PENDING
WITHDRAWN
EXPIRED
REJECTED
```

상태임에도 Grant 발급을 요청한다.

### Expected

```text
New Grant
→ DENY
```

### Controls

```text
Consent State Validation
Grant issuance policy
```

### Requirements

```text
SEC-CONSENT-001
SEC-CONSENT-002
```

### Tests

```text
STC-CONSENT-001
STC-CONSENT-002
STC-NEG-001
```

### Residual Risk

LOW

---

# 14. THR-005 — Consent Scope Escalation

**STRIDE:** Elevation of Privilege
**Asset:** Consent / Grant

### Scenario

Consent가:

```text
VIEW
```

만 허용했지만:

```text
study:download
```

Grant를 발급하려 한다.

### Expected

```text
DENY
```

### Control

```text
Grant Scope ⊆ Consent Action
```

### Requirements

```text
SEC-GRANT-005
SEC-CONSENT-003
```

### Test

```text
STC-GRANT-005
```

### Residual Risk

LOW

---

# 15. THR-006 — Grant Scope Escalation

**STRIDE:** Elevation of Privilege
**Asset:** TransferGrant

### Scenario

공격자가 `study:view` Grant로 Download 또는 PACS Import를 시도한다.

### Expected

```text
VIEW
→ PASS

DOWNLOAD
→ DENY

PACS_IMPORT
→ DENY
```

### Controls

```text
Independent Scope Validation
```

### Requirements

```text
SEC-GRANT-005
SEC-AUTHZ-008
SEC-AUTHZ-009
```

### Tests

```text
STC-GRANT-005
STC-DWN-002
STC-NEG-003
STC-NEG-009
```

---

# 16. THR-007 — Expired Grant Reuse

**STRIDE:** Elevation of Privilege / Replay
**Asset:** TransferGrant

### Scenario

유효기간이 지난 Grant를 다시 사용한다.

### Expected

```text
EXPIRED
→ DENY
```

### Requirements

```text
SEC-GRANT-002
SEC-TOK-002
```

### Test

```text
STC-GRANT-002
STC-NEG-002
```

### Residual Risk

LOW

---

# 17. THR-008 — Wrong Recipient Grant Use

**STRIDE:** Spoofing / Elevation of Privilege
**Asset:** Grant / Tenant Boundary

### Scenario

Hospital B용 Grant를 Hospital C가 사용한다.

### Expected

```text
DENY
```

### Control

```text
Recipient Binding
Tenant Binding
```

### Requirements

```text
SEC-GRANT-003
SEC-GRANT-004
```

### Test

```text
STC-GRANT-003
STC-NEG-004
```

---

# 18. THR-009 — Viewer URL Bypass

**STRIDE:** Information Disclosure
**Asset:** Medical Imaging

### Scenario

공격자가 Viewer URL 또는 Study UID를 직접 입수하여 Backend Authorization을 우회한다.

### Expected

```text
Known URL
+
No Authorization

→ DENY
```

### Controls

```text
Application-controlled viewer entry
Short-lived viewer access
Backend Authorization
```

### Requirements

```text
SEC-AUTHZ-006
SEC-AUTHZ-007
SEC-DICOM-002
```

### Test

```text
STC-VIEW-002
STC-NEG-008
```

### Residual Risk

MEDIUM

### Reason

브라우저 환경에서는:

```text
Screen Capture
Authorized User Copy
Browser-side leakage
```

를 P0에서 완전히 제거할 수 없다.

---

# 19. THR-010 — Sensitive Information in Error Responses

**STRIDE:** Information Disclosure
**Asset:** Secrets / Architecture Metadata

### Scenario

Internal Stack Trace나 Credential이 API Response에 노출된다.

### Controls

```text
Safe Error Response
Internal / External Error Separation
```

### Requirements

```text
SEC-ERR-001
SEC-ERR-002
```

### Test

```text
STC-ERR-001
```

### Residual Risk

LOW

---

# 20. TB-02 — MediQ → Hospital A Orthanc

Hospital A는 Source PACS 역할이다.

---

# 21. THR-011 — Unauthorized QIDO-RS Query

**STRIDE:** Information Disclosure
**Asset:** Study Metadata

### Scenario

허가되지 않은 Actor가 Source Orthanc의 Study 목록을 검색한다.

### Expected

```text
Unauthorized Study Discovery
→ DENY
```

### Control

```text
MediQ-side Authorization
Registered Endpoint
```

### Requirement

```text
SEC-DICOM-001
```

### Test

```text
STC-DICOM-001
```

---

# 22. THR-012 — Unauthorized WADO-RS Retrieval

**STRIDE:** Information Disclosure
**Asset:** DICOM Payload

### Scenario

유효한 Viewer/Download/PACS 권한 없이 WADO-RS를 통해 Payload를 조회한다.

### Expected

```text
DENY
```

### Controls

```text
Authorization before retrieval
Resource Binding
Grant Scope
```

### Requirements

```text
SEC-DICOM-002
SEC-AUTHZ-001
```

### Test

```text
STC-DICOM-002
```

---

# 23. THR-013 — Source Endpoint Substitution

**STRIDE:** Spoofing / Tampering
**Asset:** DICOM Source

### Scenario

공격자가 Source Endpoint 설정을 변조하여 공격자 서버에서 DICOM을 가져오게 한다.

### Risk

```text
Fake Source
Wrong Imaging Data
Credential leakage
```

### Existing Controls

```text
Registered hospital endpoint
TLS
Certificate validation
Controlled configuration
```

### Requirements

```text
SEC-TLS-001
SEC-TLS-002
SEC-DICOM-001
```

### Residual Risk

MEDIUM

### Future Hardening

```text
mTLS
Hospital Connector
Stronger Endpoint Registry Governance
```

은 Productionization/P1 이후 검토한다.

---

# 24. THR-014 — MITM on Source Retrieval

**STRIDE:** Tampering / Information Disclosure
**Asset:** Imaging Payload

### Scenario

MediQ ↔ Orthanc A 통신을 가로채 DICOM을 열람하거나 변조한다.

### Control

```text
HTTPS / TLS
Certificate Validation
```

### Requirements

```text
SEC-TLS-001
SEC-TLS-002
```

### Test

```text
STC-TLS-001
STC-TLS-002
```

### Residual Risk

LOW/MEDIUM

Test 환경 Certificate 관리 수준에 따라 달라진다.

---

# 25. THR-015 — Source Imaging Substitution

**STRIDE:** Tampering
**Asset:** StudyReference / ImagingPackage

### Scenario

요청된 Study와 다른 Study가 반환되거나 Package에 연결된다.

### Control

```text
StudyReference Validation
Package / Session Patient Context
Source Hospital Binding
```

### Relevant Invariants

```text
Package.patient_ref
=
Session.patient_ref
```

```text
Package.source_hospital
=
Session.source_hospital
```

### Requirements

```text
SEC-AUTHZ-001
SEC-DICOM-002
SEC-INT-001
```

### Residual Risk

MEDIUM

---

# 26. THR-016 — Source DICOMweb Availability Failure

**STRIDE:** Denial of Service
**Asset:** Medical Imaging Exchange

### Scenario

QIDO/WADO Endpoint가 응답하지 않는다.

### Expected

```text
No Response
→ Operation FAIL
```

성공으로 처리하지 않는다.

### Control

```text
Timeout
Error normalization
Observability
Explicit failure state
```

### Requirements

```text
REQ-DICOM-004
SEC-OBS-001
SEC-ERR-003
```

### Residual Risk

MEDIUM

P0는 High Availability를 목표로 하지 않는다.

---

# 27. TB-03 — MediQ → Hospital B Orthanc

Hospital B는 Destination PACS 역할이다.

---

# 28. THR-017 — Wrong Destination PACS

**STRIDE:** Information Disclosure / Tampering
**Asset:** Medical Imaging

### Scenario

Hospital B용 영상이 Hospital C 또는 다른 Endpoint로 전달된다.

### Initial Risk

CRITICAL

### Required Matching

```text
ExchangeSession.destination
=
Consent.destination
=
Grant.recipient
=
STOW Target
```

### Controls

```text
Destination Binding
Registered Endpoint
Transfer Precondition
```

### Requirements

```text
SEC-CONSENT-004
SEC-GRANT-003
SEC-DICOM-004
SEC-DICOM-005
```

### Tests

```text
STC-CONSENT-004
STC-PACS-002
STC-NEG-010
```

### Residual Risk

LOW

---

# 29. THR-018 — Invalid Patient Mapping

**STRIDE:** Tampering / Information Disclosure
**Asset:** PatientMapping / Medical Imaging

### Scenario

잘못된 Hospital B Local Patient ID로 영상이 저장된다.

### Initial Risk

CRITICAL

### Expected

```text
Mapping != VALID
→ PACS_IMPORT DENY
```

### Controls

```text
Destination Patient Mapping Validation
No automatic ambiguous selection
```

### Requirements

```text
SEC-IAM-007
SEC-IAM-008
SEC-IAM-009
```

### Tests

```text
STC-IAM-007
STC-NEG-006
```

### Residual Risk

LOW in Capstone Synthetic Mapping

Production에서는 Real Patient Matching이 별도 고위험 영역이다.

---

# 30. THR-019 — Unauthorized STOW-RS

**STRIDE:** Elevation of Privilege
**Asset:** Destination PACS

### Scenario

`study:pacs-transfer` 권한이 없는 요청이 STOW-RS를 실행한다.

### Expected

```text
Missing Scope
→ DENY
```

### Controls

```text
Grant Scope Validation
Destination Validation
```

### Requirements

```text
SEC-DICOM-003
SEC-DICOM-004
```

### Test

```text
STC-DICOM-003
STC-NEG-010
```

---

# 31. THR-020 — STOW Success but Wrong Study

**STRIDE:** Tampering
**Asset:** Medical Imaging / Provenance

### Scenario

STOW-RS가 성공했지만 Destination에 저장된 Study가 기대한 Study와 다르다.

### Controls

```text
Destination Verification
StudyInstanceUID validation
Integrity Verification
```

### Requirements

```text
REQ-PACS-005
SEC-INT-001
SEC-INT-002
```

### Test

```text
STC-PACS-001
STC-INT-001
```

### Residual Risk

LOW/MEDIUM

---

# 32. THR-021 — Integrity Failure Ignored

**STRIDE:** Tampering
**Asset:** Imaging Payload / Evidence

### Scenario

전송 완료 후 Source와 Destination 무결성이 일치하지 않지만:

```text
Transfer = COMPLETED
```

로 기록한다.

### Expected

```text
Integrity FAILED
→ Transfer FAILED
```

### Requirement

```text
SEC-INT-002
```

### Test

```text
STC-INT-002
STC-NEG-011
```

### Residual Risk

LOW

---

# 33. THR-022 — Destination MITM

**STRIDE:** Tampering / Information Disclosure

### Scenario

MediQ ↔ Orthanc B 구간을 가로채 DICOM을 열람하거나 변조한다.

### Controls

```text
TLS
Certificate Validation
Integrity Verification
```

### Requirements

```text
SEC-TLS-001
SEC-TLS-002
SEC-INT-001
```

### Residual Risk

LOW/MEDIUM

---

# 34. TB-04 — MediQ → Temporary Imaging Storage

---

# 35. THR-023 — Unauthorized Direct Payload Access

**STRIDE:** Information Disclosure
**Asset:** Temporary DICOM Payload

### Scenario

사용자가 Application Authorization을 우회하여 Storage Path 또는 URL로 직접 접근한다.

### Expected

```text
Direct Storage Access
→ DENY
```

### Controls

```text
Application-controlled access
Non-public storage reference
Authorization Gateway
```

### Requirements

```text
SEC-DATA-001
SEC-AUTHZ-001
```

### Test

```text
STC-DATA-001
```

### Residual Risk

LOW

---

# 36. THR-024 — storage_ref Leakage

**STRIDE:** Information Disclosure

### Scenario

내부 파일경로 또는 Object Storage Location이:

```text
API Response
Audit
Error
```

에 노출된다.

### Controls

```text
Internal-only storage_ref
Response DTO separation
Audit minimization
```

### Requirements

```text
SEC-DATA-001
SEC-AUD-003
SEC-ERR-001
```

### Residual Risk

LOW

---

# 37. THR-025 — Temporary Payload Not Deleted

**STRIDE:** Information Disclosure
**Asset:** Temporary Imaging Copy

### Scenario

Exchange 완료 후 Temporary Copy가 무기한 남는다.

### Controls

```text
Payload Lifecycle
RETENTION_PENDING
DELETED state
```

### Requirements

```text
SEC-DATA-002
```

### Residual Risk

MEDIUM

이유:

P0에서는 구체적인 Production Retention 기간을 고정하지 않기 때문이다.

---

# 38. THR-026 — Imaging Payload at Rest Disclosure

**STRIDE:** Information Disclosure

### Scenario

개발 Host의 Storage에 접근한 공격자가 Temporary DICOM을 읽는다.

### Controls

```text
Host access control
Application access control
At-rest protection where implemented
```

### Requirement

```text
SEC-DATA-003
```

### Residual Risk

MEDIUM

P0에서 Enterprise KMS/HSM을 요구하지 않으므로 완전한 Production 수준 통제는 아니다.

---

# 39. TB-05 — API → Application / Domain

---

# 40. THR-027 — Input Manipulation

**STRIDE:** Tampering

### Scenario

공격자가 Request Body의:

```text
destinationHospitalId
grantId
studyRefId
patientRefId
```

를 변조한다.

### Controls

```text
Input Validation
Object-level Authorization
Server-side Context Resolution
```

### Requirements

```text
SEC-API-003
SEC-API-004
```

### Test

```text
STC-API-003
STC-API-004
```

---

# 41. THR-028 — Client-Controlled Tenant Spoofing

**STRIDE:** Spoofing / Elevation of Privilege

### Scenario

공격자가 Request Body/Header에:

```text
tenant_id = target tenant
```

를 임의로 넣는다.

### Control

Tenant는 인증된 Security Context에서 결정한다.

```text
Client supplied tenant
≠
Trusted tenant context
```

### Requirements

```text
SEC-TEN-001
SEC-AUTHZ-001
```

### Residual Risk

LOW

---

# 42. THR-029 — Invalid Session State Use

**STRIDE:** Elevation of Privilege

### Scenario

다음 상태의 Session을 이용한다.

```text
EXPIRED
REVOKED
FAILED
REJECTED
CANCELLED
```

### Expected

```text
DENY
```

### Requirement

```text
SEC-AUTHZ-004
```

### Test

```text
STC-AUTHZ-004
STC-NEG-007
```

---

# 43. THR-030 — Security Check Failure Bypass

**STRIDE:** Elevation of Privilege

### Scenario

Authorization Engine 오류 시 Application이:

```text
catch(error)
→ allow
```

처리한다.

### Expected

```text
Security Error
→ DENY
```

### Requirement

```text
SEC-AUTHZ-003
SEC-ERR-003
```

### Test

```text
STC-AUTHZ-003
STC-ERR-003
STC-NEG-012
```

---

# 44. TB-06 — MediQ → PostgreSQL

---

# 45. THR-031 — Secret Leakage in Database

**STRIDE:** Information Disclosure

### Scenario

Database에:

```text
Raw Token
Password
Private Key
DEK
KEK
```

가 저장된다.

### Control

```text
No raw credential storage
Secrets outside application metadata
```

### Requirements

```text
SEC-SEC-001
SEC-AUD-003
SEC-LOG-001
```

### Residual Risk

LOW

---

# 46. THR-032 — Audit Tampering / Loss

**STRIDE:** Tampering / Repudiation
**Asset:** Audit Evidence

### Scenario

중요 Security Event가 기록되지 않거나 Business Entity 삭제와 함께 Audit가 제거된다.

### Controls

```text
Audit Events
No cascade delete
Evidence lifecycle separation
```

### Requirements

```text
SEC-AUD-001
SEC-AUD-002
```

### Related Data Model

```text
audit_events
ON DELETE RESTRICT
```

### Residual Risk

MEDIUM

P0에서는 Append-only/WORM Log까지 구현하지 않는다.

---

# 47. THR-033 — Provenance Manipulation

**STRIDE:** Tampering / Repudiation

### Scenario

실제 Source/Destination과 다른 Provenance가 기록된다.

### Control

```text
Session Source/Destination Binding
Integrity Link
Transfer Module-generated Provenance
```

### Requirement

```text
SEC-INT-003
```

### Residual Risk

MEDIUM

---

# 48. THR-034 — Sensitive Data in Logs

**STRIDE:** Information Disclosure

### Scenario

Debug/Application Log에:

```text
Raw Token
Password
DICOM Payload
Private Key
```

등이 기록된다.

### Controls

```text
Log minimization
Structured logging
```

### Requirements

```text
SEC-LOG-001
SEC-AUD-003
```

### Test

```text
STC-LOG-001
```

---

# 49. Grant Replay Threat

## THR-035 — Grant Replay

**STRIDE:** Replay / Elevation of Privilege
**Initial Risk:** MEDIUM

### Scenario

정상 Grant가 탈취되어 유효기간 내 여러 차례 재사용된다.

### Current Controls

```text
Expiration
Status
Recipient Binding
Scope Binding
```

### Additional P0/P1 Candidate

```text
jti
nonce
CONSUMED status
```

### Requirement

```text
SEC-RPL-001
```

### Residual Risk

MEDIUM

P0에서 모든 Grant를 일회성으로 만들지는 않는다.

---

# 50. Token Threats

## THR-036 — Expired Token

Expected:

```text
Expired Token
→ DENY
```

Requirement:

```text
SEC-TOK-002
```

---

## THR-037 — Wrong Audience Token

Expected:

```text
Wrong aud
→ DENY
```

Requirement:

```text
SEC-TOK-003
```

---

## THR-038 — Missing Scope Token

Expected:

```text
Required Scope Missing
→ DENY
```

Requirement:

```text
SEC-TOK-004
```

---

# 51. Audit / Repudiation Threat

## THR-039 — Actor Denies PACS Transfer

**STRIDE:** Repudiation

### Scenario

사용자가:

> “나는 이 영상을 전송하지 않았다.”

고 주장한다.

### Required Evidence

```text
actor
tenant
session
action
result
timestamp
correlation_id
```

### Controls

```text
AuditEvent
ProvenanceRecord
```

### Requirements

```text
SEC-AUD-001
SEC-AUD-002
SEC-INT-003
```

### Residual Risk

LOW/MEDIUM

P0 Audit가 법적 부인방지 서명체계까지 제공하는 것은 아니다.

---

# 52. Denial of Service Threats

## THR-040 — Repeated Imaging Request

**STRIDE:** Denial of Service

### Scenario

공격자가 반복적으로:

```text
Viewer
Download
WADO
STOW
```

요청을 발생시킨다.

### Current P0 Controls

```text
Authentication
Authorization
Operation failure handling
Basic application limits where implemented
```

### Residual Risk

MEDIUM/HIGH

### Classification

```text
POST-MVP / PRODUCTIONIZATION hardening
```

P0에서는 Enterprise Rate Limiter/WAF를 필수 Gate로 하지 않는다.

---

# 53. Critical Threats

다음 위협은 P0에서 가장 중요한 Threat로 분류한다.

```text
CRITICAL-01
Cross-Tenant Imaging Access

CRITICAL-02
No Consent Access

CRITICAL-03
Wrong Patient Mapping

CRITICAL-04
Wrong Destination PACS

CRITICAL-05
Grant Scope Escalation

CRITICAL-06
Unauthorized DICOM Retrieval

CRITICAL-07
Integrity Failure Ignored
```

이 항목의 Acceptance Test 실패 시:

```text
CAPSTONE SECURITY VALIDATION
→ FAIL
```

로 판단한다.

---

# 54. Threat-to-Control Matrix

| Threat                           | Primary Control      | Requirement     | Test            |
| -------------------------------- | -------------------- | --------------- | --------------- |
| THR-001 Unauthenticated Access   | Authentication       | SEC-IAM-004     | STC-IAM-004     |
| THR-002 BOLA                     | Object Authorization | SEC-API-002     | STC-API-002     |
| THR-003 Cross Tenant             | Tenant Isolation     | SEC-TEN-001     | STC-TEN-001     |
| THR-004 Consent Bypass           | Consent Enforcement  | SEC-CONSENT-001 | STC-CONSENT-001 |
| THR-005 Consent Scope Escalation | Scope containment    | SEC-GRANT-005   | STC-GRANT-005   |
| THR-006 Grant Escalation         | Scope Enforcement    | SEC-GRANT-005   | STC-GRANT-005   |
| THR-007 Expired Grant            | Expiration           | SEC-GRANT-002   | STC-GRANT-002   |
| THR-008 Wrong Recipient          | Recipient Binding    | SEC-GRANT-003   | STC-GRANT-003   |
| THR-009 Viewer Bypass            | Viewer Authorization | SEC-AUTHZ-007   | STC-VIEW-002    |
| THR-011 Unauthorized QIDO        | DICOM Authorization  | SEC-DICOM-001   | STC-DICOM-001   |
| THR-012 Unauthorized WADO        | DICOM Authorization  | SEC-DICOM-002   | STC-DICOM-002   |
| THR-017 Wrong Destination        | Destination Binding  | SEC-DICOM-005   | STC-PACS-002    |
| THR-018 Wrong Mapping            | Mapping Validation   | SEC-IAM-007     | STC-IAM-007     |
| THR-019 Unauthorized STOW        | Scope Validation     | SEC-DICOM-003   | STC-DICOM-003   |
| THR-021 Integrity Ignored        | Integrity Gate       | SEC-INT-002     | STC-INT-002     |
| THR-023 Direct Storage Access    | Storage Protection   | SEC-DATA-001    | STC-DATA-001    |
| THR-027 Input Manipulation       | Input Validation     | SEC-API-003     | STC-API-003     |
| THR-030 Security Failure Bypass  | Fail Closed          | SEC-ERR-003     | STC-ERR-003     |
| THR-034 Sensitive Logs           | Log Minimization     | SEC-LOG-001     | STC-LOG-001     |

---

# 55. Asset-to-Threat Matrix

| Asset           | Main Threats                                |
| --------------- | ------------------------------------------- |
| Medical Imaging | Unauthorized View, Download, PACS Transfer  |
| Patient Mapping | Wrong Patient Association                   |
| ExchangeSession | Session Hijacking / Invalid State           |
| Consent         | Bypass / Scope Expansion                    |
| Grant           | Replay / Scope Escalation / Recipient Abuse |
| Tenant          | Cross-Tenant Access                         |
| DICOMweb        | Unauthorized QIDO/WADO/STOW                 |
| Storage         | Direct Access / Data Remanence              |
| Integrity       | Tampering                                   |
| Provenance      | False Movement Record                       |
| Audit           | Deletion / Repudiation                      |
| Secrets         | Credential Disclosure                       |

---

# 56. Trust-Boundary Summary

## TB-01 Browser → MediQ

Primary threats:

```text
Authentication bypass
BOLA
Cross-tenant access
Consent bypass
Grant abuse
Viewer/download abuse
```

---

## TB-02 MediQ → Orthanc A

Primary threats:

```text
Unauthorized QIDO
Unauthorized WADO
Source spoofing
MITM
Source substitution
Availability failure
```

---

## TB-03 MediQ → Orthanc B

Primary threats:

```text
Wrong destination
Wrong patient
Unauthorized STOW
Payload tampering
Destination verification failure
```

---

## TB-04 MediQ → Temporary Storage

Primary threats:

```text
Direct payload access
Storage reference leakage
Residual data
At-rest disclosure
```

---

# 57. Threat Acceptance Philosophy

위협을 다음 두 그룹으로 구분한다.

## P0 Must Mitigate

```text
Unauthorized Access
Tenant Bypass
Consent Bypass
Grant Scope Bypass
Wrong Patient Mapping
Wrong Destination
Unauthorized DICOMweb
Integrity Failure
Sensitive Secret Leakage
```

---

## P0 Residual / Future Hardening

```text
Large-scale DoS
Advanced Insider Threat
Compromised Host OS
Full Tamper-proof Audit
Production HSM
Production PKI
Advanced mTLS Governance
Enterprise WAF
24x7 Detection
```

---

# 58. Residual Risk Register

| Risk                                 | Residual | Decision           |
| ------------------------------------ | -------- | ------------------ |
| Browser screenshot                   | MEDIUM   | ACCEPT P0          |
| Authorized user local copy           | MEDIUM   | ACCEPT P0          |
| Temporary storage host compromise    | MEDIUM   | HARDEN POST-MVP    |
| Audit DB administrator tampering     | MEDIUM   | HARDEN PRODUCTION  |
| High-volume DoS                      | HIGH     | PRODUCTIONIZATION  |
| Test certificate governance          | MEDIUM   | P0 SHOULD HARDEN   |
| Replay inside valid grant period     | MEDIUM   | POST-MVP/P1        |
| Production patient misidentification | HIGH     | OUTSIDE CURRENT P0 |

---

# 59. Mandatory Security Tests

다음 Negative Test를 Threat Model의 Minimum Gate로 사용한다.

```text
TM-T01
Unauthenticated access
→ DENY

TM-T02
Wrong tenant
→ DENY

TM-T03
No consent
→ DENY

TM-T04
Withdrawn consent
→ New Grant DENY

TM-T05
Expired grant
→ DENY

TM-T06
Wrong recipient
→ DENY

TM-T07
View-only grant → Download
→ DENY

TM-T08
View-only grant → PACS Import
→ DENY

TM-T09
Invalid patient mapping
→ DENY

TM-T10
Wrong destination hospital
→ DENY

TM-T11
Unauthorized WADO
→ DENY

TM-T12
Unauthorized STOW
→ DENY

TM-T13
Integrity mismatch
→ FAILED

TM-T14
Known session UUID without permission
→ DENY

TM-T15
Known Study UID without permission
→ DENY
```

---

# 60. Mandatory Positive Tests

```text
TM-P01
Valid session
+
Valid consent
+
study:view
→ Viewer PASS
```

```text
TM-P02
Valid session
+
Valid consent
+
study:download
→ Download PASS
```

```text
TM-P03
Valid session
+
Valid consent
+
study:pacs-transfer
+
VALID patient mapping
+
Correct destination
+
Integrity VERIFIED

→ PACS_IMPORT PASS
```

---

# 61. Threat Model Traceability

Threat Model은 다음 흐름으로 연결되어야 한다.

```text
Threat
  ↓
SEC-* Requirement
  ↓
API / Domain Enforcement
  ↓
STC-* / TM-* Test
  ↓
Acceptance Result
```

예:

```text
Wrong Tenant
    ↓
SEC-TEN-001
    ↓
Authorization Middleware
    ↓
STC-TEN-001
    ↓
DENY
```

---

# 62. Security Gate

```text
GATE-TM-01
Unauthenticated Access
MITIGATED

GATE-TM-02
BOLA / IDOR
MITIGATED

GATE-TM-03
Tenant Isolation
MITIGATED

GATE-TM-04
Consent Bypass
MITIGATED

GATE-TM-05
Grant Escalation
MITIGATED

GATE-TM-06
Wrong Patient Mapping
MITIGATED

GATE-TM-07
Wrong Destination
MITIGATED

GATE-TM-08
Unauthorized DICOMweb
MITIGATED

GATE-TM-09
Transport Tampering
CONTROL DEFINED

GATE-TM-10
Temporary Storage Exposure
CONTROL DEFINED

GATE-TM-11
Integrity Failure
MITIGATED

GATE-TM-12
Audit / Repudiation
CONTROL DEFINED

GATE-TM-13
Secret Leakage
CONTROL DEFINED

GATE-TM-14
Fail Closed
MITIGATED
```

---

# 63. Threat Model Decision

```text
PROJECT:
MediQ

THREAT MODEL VERSION:
v1.1 Viewer Architecture Amendment

METHOD:
STRIDE-informed Trust Boundary Analysis

PRIMARY TRUST BOUNDARIES:
Browser → MediQ
MediQ → Orthanc A
MediQ → Orthanc B
MediQ → Temporary Storage

CRITICAL ASSETS:
Medical Imaging
Patient Mapping
ExchangeSession
Consent
TransferGrant
Tenant Boundary
Integrity
Provenance
Audit

CRITICAL P0 THREATS:
Cross-Tenant Access
Consent Bypass
Grant Scope Escalation
Wrong Patient Mapping
Wrong Destination PACS
Unauthorized DICOM Retrieval
Integrity Failure

DEFAULT POLICY:
DENY BY DEFAULT

FAILURE POLICY:
FAIL CLOSED

P1 MOBILE THREATS:
DEFERRED

PRODUCTION THREATS:
SEPARATED

THREAT MODEL STATUS:
APPROVED BASELINE
```

---

# 64. Threat Model Review

```text
Assets:
PASS

Trust Boundaries:
PASS

Browser Threats:
PASS

Source PACS Threats:
PASS

Destination PACS Threats:
PASS

Storage Threats:
PASS

Tenant Isolation:
PASS

Consent Threats:
PASS

Grant Threats:
PASS

Patient Mapping Threats:
PASS

DICOMweb Threats:
PASS

Integrity Threats:
PASS

Audit / Provenance:
PASS

Residual Risks:
DEFINED

Security Requirement Traceability:
PASS

Test Traceability:
PASS

P0 / P1 Separation:
PASS

Productionization Separation:
PASS

THREAT MODEL READY:
YES
```

---

# 65. Next Document

다음 공식 문서는:

```text
ACCEPTANCE-TESTS.md
```

이다.

지금까지:

```text
REQUIREMENTS
       ↓
SECURITY REQUIREMENTS
       ↓
DOMAIN MODEL
       ↓
SYSTEM ARCHITECTURE
       ↓
DATA FLOW
       ↓
DATA MODEL / ERD
       ↓
OPENAPI
       ↓
THREAT MODEL
```

까지 정의되었으므로 이제 Acceptance Test에서는 더 이상 Architecture를 설계하지 않는다.

다음 세 종류의 Test로 고정한다.

```text
1. Functional Acceptance

2. Security Negative Acceptance

3. E2E Golden Path Acceptance
```

최종 테스트 흐름:

```text
Hospital A Test Orthanc
        ↓
MediQ
        ↓
Consent / Grant
        ↓
VIEW / DOWNLOAD / PACS_IMPORT
        ↓
Hospital B Test Orthanc
        ↓
Integrity / Provenance / Audit
```

---

# FINAL THREAT MODEL POLICY

> **MediQ의 가장 중요한 보안위협은 단순한 외부 해킹만이 아니라 `잘못된 Actor`, `잘못된 Tenant`, `잘못된 Consent`, `잘못된 Grant Scope`, `잘못된 Patient Mapping`, `잘못된 Destination`으로 인해 의료영상이 허가되지 않은 대상에게 노출되거나 전달되는 것이다.**

> **따라서 P0 Threat Model은 네트워크 암호화만으로 보안을 판단하지 않고, Identity → Tenant → Session → Consent → Grant → Resource → Action의 전체 Authorization Chain을 보호대상으로 취급한다.**

> **PACS Import는 최종적으로 Destination Patient Mapping, STOW-RS 수신확인, Integrity Verification, Provenance, Audit이 모두 연결되어야 성공한 Exchange로 간주한다.**

---

# Viewer and Mobile Threat Amendment — 2026-09-15

| ID | Threat | Boundary | Required control | Acceptance |
|---|---|---|---|---|
| THR-VIEW-001 | Stolen Viewer URL 또는 token replay | Browser → MediQ | short-lived session, actor binding, revoke | TC-VIEW-007 |
| THR-VIEW-002 | DICOM UID 추측을 통한 무단 조회 | Browser → Viewer Gateway | UID-only access deny, grant/resource binding | TC-VIEW-008 |
| THR-VIEW-003 | PACS endpoint 또는 credential 노출 | MediQ → PACS | backend-only connector, response redaction | TC-VIEW-008 |
| THR-VIEW-004 | Cross-Tenant Viewer 접근 | Actor → MediQ | tenant/organization/patient binding | TC-SEC-VIEW-001 |
| THR-VIEW-005 | Consent revoke 이후 Viewer Session 재사용 | Consent → Viewer | continuous validity check, session revoke | TC-SEC-VIEW-002 |
| THR-VIEW-006 | Browser/CDN/Proxy cache에 영상 잔존 | Delivery path | no-store/private control, intermediary bypass | TC-DATA-004 |
| THR-VIEW-007 | Temporary Cloud Object 미삭제 | Temporary storage | TTL, purge worker, purge evidence | TC-DATA-005 |
| THR-VIEW-008 | Source PACS 장애 시 잘못된 대체본 제공 | DICOMweb upstream | fail closed, explicit upstream failure | TC-VIEW-009 |
| THR-VIEW-009 | Source PACS substitution/SSRF | DICOMweb adapter | allowlisted endpoint, destination binding, TLS validation | TC-SEC-VIEW-003 |
| THR-MOB-001 | 모바일 기기 분실·탈취 | Mobile Vault | device binding, local authentication, key protection | TC-MOB-008 |
| THR-MOB-002 | Vault 데이터를 Gallery/공유 저장소로 유출 | Mobile storage | app-private encrypted storage | TC-MOB-008 |
| THR-MOB-003 | Screenshot/screen recording에 의한 노출 | Mobile Viewer | explicit product policy and platform control | TC-MOB-009 |
| THR-MOB-004 | Offline Copy revoke 불일치 | Cloud ↔ Mobile | expiry, sync policy, crypto-shredding boundary | TC-MOB-009 |
| THR-MOB-005 | StrongBox 부재 또는 Attestation 실패 후 Software Key로 Silent Downgrade | Device admission | explicit security level, server policy, deny persistent vault | TC-MOB-010/011 |
| THR-MOB-006 | Payload 암호와 Device Key가 결합되어 Key Rotation/PQC 전환 시 전체 영상 재암호화 또는 보안 우회 | Capsule crypto | per-Capsule DEK, versioned wrap slots, crypto agility | TC-MOB-012/017 |
| THR-MOB-007 | Background/App Switcher/메모리에 의료영상 평문 잔존 | Local viewer | immediate privacy screen, stop render, clear pixel buffer, 60-second reauth grace only | TC-MOB-014 |
| THR-MOB-008 | Screenshot, 녹화, 미러링 또는 비보안 디스플레이로 영상 유출 | Display boundary | platform capture controls, detection, privacy screen, residual-risk disclosure | TC-MOB-015 |
| THR-MOB-009 | 분실 기기가 오프라인 상태에서 Revoke를 받지 못함 | Device lifecycle | 30-day lease, online refresh deny, crypto-shredding when reachable | TC-MOB-013/016 |
| THR-MOB-010 | Cloud Key Escrow 또는 Cross-device 복구 저장소 침해 | Recovery boundary | no key escrow, new device key, source PACS re-download | TC-MOB-016/017 |
| THR-MOB-011 | AES-GCM Nonce 재사용으로 Payload 기밀성·무결성 붕괴 | Capsule packaging | per-Capsule DEK, random prefix + global sequence, immutable build plan | TC-MOB-018-A/B |
| THR-MOB-012 | Manifest/Chunk 누락·중복·순서변경·교체·혼합·절단 | Capsule parser/storage | COSE-signed directory, record hash, AAD binding, exact total length, GCM tag | TC-MOB-018-B |
| THR-MOB-013 | Wrap Slot 교체 또는 Crypto Suite Downgrade | Envelope/recipient boundary | signed Recipient Set, allowlist registry, unknown critical reject | TC-MOB-018-A/E/F |
| THR-MOB-014 | 재개 다운로드 중 이전·신규 Capsule Chunk 혼합 | HTTP/Blob → Mobile | strong ETag, If-Range, capsule/content version checkpoint | TC-MOB-018-C |
| THR-MOB-015 | Process Kill/Storage Full 이후 Partial Capsule을 정상 Vault Item으로 노출 | Mobile storage/state | staging isolation, full verification, atomic rename + DB recovery | TC-MOB-018-D |
| THR-MOB-016 | 표준화되지 않은 PQC Hybrid Combiner 또는 Software-only Key를 Hardware-backed로 오인 | Crypto agility | registry gate, no custom hybrid, device protection validation | TC-MOB-018-E/F |
| THR-MOB-017 | 탈취된 Bearer Token과 임의 Device ID로 Mobile API 호출 | Mobile API auth | PKCE, DPoP-bound token, registered proof-key binding | TC-MOB-019-A/B |
| THR-MOB-018 | Attestation Challenge 재사용 또는 다른 Key/Evidence로 치환 | Registration boundary | short-lived one-time challenge, purpose/user/key binding, replay cache | TC-MOB-019-C |
| THR-MOB-019 | 다른 Patient/Device의 Operation·Capsule·Lease IDOR 및 존재 유출 | Mobile resource API | server-derived patient/device binding, 404 concealment, scope checks | TC-MOB-019-D |
| THR-MOB-020 | Download Token 재사용 또는 ETag 변경 중 Record 혼합 | Capsule transport | capsule-scoped DPoP token, jti, strong ETag, If-Range, content version reset | TC-MOB-019-E |
| THR-MOB-021 | 위조·Rollback Offline Lease로 만료 이후 접근 | Lease API/local guard | COSE signed claims, lease version, security epoch, secure-time gate | TC-MOB-019-F |
| THR-MOB-022 | Server Revoke/Delete를 Offline Local 삭제 완료로 잘못 표시 | Lifecycle/API response | separate server/local status, explicit UNKNOWN, audit source separation | TC-MOB-019-G |
| THR-MOB-023 | Client Audit 위조·중복·순서 Gap을 서버 관찰 사실로 오인 | Audit ingestion | DPoP, event dedup, server enrichment, CLIENT_REPORTED source, gap detection | TC-MOB-019-H |

## Trust Boundary Decision

- Hospital PACS는 Browser/Mobile Client의 직접 trust boundary가 아니다.
- 모든 PACS 통신은 MediQ Backend Connector를 경유한다.
- Cloud Temporary Cache는 영구 신뢰 저장소가 아니며 expiry와 purge 실패 자체를 보안사건으로 다룬다.
- Mobile Vault는 P1의 별도 device trust boundary다.

**공통 기준:** Hospital PACS는 Source of Record다. MediQ Cloud는 Permanent PACS/장기 Archive가 아니며, P0 Cloud Viewer와 P1 Mobile Vault Viewer의 데이터 경로와 위협 경계를 분리한다.

## P1 Mobile Residual Risk Decision

- StrongBox만 강제하지 않고 검증된 Android TEE를 허용하므로 물리 공격 저항성은 기기별로 다를 수 있다.
- 오프라인 분실 기기의 접근은 서버 Revoke 직후가 아니라 최대 30일 Lease 만료 시점까지 남을 수 있다.
- Android/iOS 플랫폼 제어는 모든 Screenshot 구현, Root/Jailbreak, 외부 카메라 촬영을 완전히 방지하지 못한다.
- P1 Mobile MVP는 위 위험을 명시적으로 수용하되 Software/Unknown Key의 Persistent Vault, Silent Downgrade 및 Cloud Key Escrow는 수용하지 않는다.

---

# Azure Deployment Threat Recommendations — 2026-09-19

다음 위협은 `POST-MVP` Azure 프로파일 승인 시 정식 Threat ID와 Acceptance Test로 승격할 권고 항목이다. 현재 P0 완료조건을 변경하지 않는다.

| Candidate ID | Threat | Recommended control | Proposed classification |
|---|---|---|---|
| THR-AZ-C01 | Public ingress만 구성하고 사설 PACS에 도달할 수 있다고 오판 | Outbound Connector 또는 VPN/Private Network 결정 | PRODUCTIONIZATION |
| THR-AZ-C02 | 위조된 forwarded client certificate header 신뢰 | ingress sanitization, chain/registry binding 검증 | POST-MVP |
| THR-AZ-C03 | Managed Identity에 과도한 Storage/Key Vault 권한 부여 | workload별 identity, least privilege, access review | POST-MVP |
| THR-AZ-C04 | Temporary Blob의 TTL/purge 실패로 장기 영상 잔존 | lifecycle rule, purge worker, evidence, alert | POST-MVP |
| THR-AZ-C05 | `mobile-package`가 장기 Cloud Backup으로 변질 | staging-only policy, TTL, no escrow, source re-download | POST-MVP |
| THR-AZ-C06 | Connection Pool에서 이전 Tenant context 재사용 | transaction context, reset hook, cross-tenant test | POST-MVP |
| THR-AZ-C07 | One-Time Token이 Transfer Grant를 우회 | derived credential, scope binding, nonce/jti, consume-once | POST-MVP |
| THR-AZ-C08 | Workforce Identity를 실제 환자 본인확인으로 오인 | Patient CIAM/identity proofing 분리 | PRODUCTIONIZATION |
| THR-AZ-C09 | 비용·로그 폭증으로 서비스 중단 또는 민감 로그 장기보존 | budget alert, log cap, redaction, retention | POST-MVP |
| THR-AZ-C10 | CI/CD 또는 Container Image 공급망 침해 | signed provenance 후보, image/dependency/IaC scan | POST-MVP |

네트워크 내부성, VPN, mTLS, RLS 또는 Managed Identity 하나만으로 MediQ Authorization Chain을 대체할 수 없다. Azure 프로파일에서도 `Identity → Tenant → Session → Consent → Grant → Resource → Action` 검증을 유지한다.

---

# Synthetic Health Data Preview Threat Amendment — 2026-09-26

| Threat ID | Threat | Impact | Required Control | Classification |
|---|---|---|---|---|
| `THR-HHP-001` | 실제 지정심사·운영 연계로 오인 | 신뢰 훼손·허위 표현 | Persistent DEMO Banner, 금지 문구·Logo 검사 | CAPSTONE-P1 |
| `THR-HHP-002` | 합성 Record를 실제 환자정보로 오인 | 잘못된 의료 판단 | TEST Identity, SYNTHETIC Badge, 비진단 고지 | CAPSTONE-P1 |
| `THR-HHP-003` | 환경설정 오류로 실제 기관 Host 호출 | 무단 접근·정보노출 | Mock-only allowlist, no credential, outbound deny test | CAPSTONE-P1 |
| `THR-HHP-004` | Mock Consent가 실제 Consent/Grant로 승격 | 권한 우회 | 별도 Domain/State/Audit Namespace | CAPSTONE-P1 |
| `THR-HHP-005` | Fixture에 실제 PHI 혼입 | 개인정보 침해 | Fixture lint, allowlisted TEST values, review | CAPSTONE-P1 |
| `THR-HHP-006` | 합성 Record가 공유·PACS Workflow로 전달 | 데이터 경계 혼동 | share/import route 부재와 Negative Test | CAPSTONE-P1 |
| `THR-HHP-007` | 공식 기관 Logo·Badge 사용으로 제휴 오인 | 법적·평판 위험 | 승인 전 브랜드 자산 사용 금지 | CAPSTONE-P1 |
| `THR-HHP-008` | 합성 항체검사를 실제 면역·질환 판정으로 오인 | 잘못된 의료 판단 | SYNTHETIC Badge, 출처 원문 표시, MediQ 해석 금지 | CAPSTONE-P1 |
| `THR-HHP-009` | 서로 다른 검사법·단위·참고범위를 자동 병합 | 결과 왜곡 | 단위·출처 참고범위 보존, 누락값 추정 금지 | CAPSTONE-P1 |
| `THR-HHP-010` | 합성 검사와 영상 연결을 진단 인과로 오인 | 잘못된 해석 | 명시 Fixture Link만 사용, 관련 기록·비진단 고지 | CAPSTONE-P1 |

잔여 위험: 고정 Disclosure가 있어도 발표자가 실제 연계라고 잘못 설명할 수 있다. 발표 Script에도 “지정심사·운영 API 미연계, 합성 데이터 시연” 문구를 포함해야 한다.

# Patient Experience Feature Pack Threat Amendment — 2026-09-26

| Threat ID | Threat | Required Control | 영향 기능 |
|---|---|---|---|
| `THR-PXE-001` | UI/Push/QR를 권한으로 오인 | 서버 재인가, 비권위 Route | 1, 3, 4, 9 |
| `THR-PXE-002` | Projection/Cache 교차 Tenant 노출 | Tenant/Patient Binding, Allowlist | 1, 2, 5 |
| `THR-PXE-003` | 잠금화면·오류·Bundle PHI 노출 | 일반 문구, Redaction, PRIVATE visibility | 1, 2, 3, 7 |
| `THR-PXE-004` | Timeout 후 중복 Consent/STOW | idempotency, Result Unknown, 상태 조회 | 4, 7 |
| `THR-PXE-005` | 시계 변조·키 잔존으로 Lease 우회 | 시간 Anchor, 삭제 Journal, Crypto-shred | 6 |
| `THR-PXE-006` | Metadata/문서에서 잘못된 진단 추론 | 원본 불변, 중립 Mapping, 요약 금지 | 5, 8 |
| `THR-PXE-007` | 악성·변조 임상 문서 | Allowlist, Malware Scan, Hash/Provenance | 8 |
| `THR-PXE-008` | 가족관계 사칭·권한 상승 | 독립 신원, Authority, Scope, 만료·철회 | 9 |

기능별 상세 위협·통제와 Acceptance는 각 Feature Spec을 따른다. 신규 위협 시험은 모두 `NOT RUN`이며, 8·9번의 법적·운영 잔여 위험은 POST-MVP 승인 Gate가 해소하기 전 수용하지 않는다.

# Hospital Clinical Workflow P1 Threat Amendment — 2026-09-27

| Threat ID | Threat | Required Control | Verification |
|---|---|---|---|
| `THR-HCW-001` | 같은 Patient Reference로 무권한 과거 Study 열람 | Study별 재인가, Exchange/Source Scope, exact Study set | `TC-HCW-PR-002~005` |
| `THR-HCW-002` | Multi-study Session에 임의 UID 추가 | Session allowlist, WADO Gateway binding | `TC-HCW-PR-005` |
| `THR-HCW-003` | 인계 패킷이 영상·임상문서 권한을 합침 | Resource별 Scope/Expiry, 문서 기본 비활성 | `TC-HCW-HP-002~003` |
| `THR-HCW-004` | 업무 배정으로 접근권한 상승 | Assignment/Authorization 분리, Open 시 재인가 | `TC-HCW-AS-002~003/006` |
| `THR-HCW-005` | 교차 Tenant/Hospital 담당자 배정 | Registry binding, same-Hospital constraint | `TC-HCW-AS-002` |
| `THR-HCW-006` | 알림 Preview·URL·로그에서 PHI 노출 | Safe Summary Code, 최소정보, Redaction | `TC-HCW-NT-002` |
| `THR-HCW-007` | Stale/중복/역순 알림으로 잘못된 작업 | Event ID/Version, 최신 상태 재조회 | `TC-HCW-NT-003~005` |
| `THR-HCW-008` | 설명형 Timeline이 실패를 성공으로 왜곡 | 원장 Sequence, 상태 분리, RESULT_UNKNOWN 보존 | `TC-HCW-AT-001~003/006` |
| `THR-HCW-009` | 일반 의료진이 과도한 Audit 상세 열람 | Role-filtered Projection, Stack/Secret Redaction | `TC-HCW-AT-004~005/007` |
| `THR-HCW-010` | P1 Module 장애가 P0 인가를 우회 | 독립 실패경계, Fail Closed, P0 Regression | 별도 P0/P1 Regression |

잔여 위험: Body Part·Study Description은 비식별 정보가 아닐 수 있고 의료 맥락을 드러낼 수 있다. 후보 목록과 알림에는 업무에 필요한 최소 메타데이터만 표시하고 실제 운영 도입 전 개인정보·의료기관 정책 검토를 수행한다. 모든 시험은 `NOT RUN`이다.
