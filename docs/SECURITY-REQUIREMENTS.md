# MediQ Security Requirements Specification

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `SECURITY-REQUIREMENTS.md`
**Version:** v2.0 PACS Patient Identity and Unknown-Result Preconditions
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ의 P0 의료영상 교환 MVP를 보호하기 위해 필요한 **Security Requirement와 검증 기준**을 정의한다.

본 문서의 목적은 별도의 대규모 보안 플랫폼을 만드는 것이 아니다.

## 1.1 AI 질문자료 보안 추가 기준

- 질문자료 생성은 합성 Allowlist 필드만 사용하고 이름, Patient ID, 병원 식별자, DICOM UID, 원본 문서·영상과 Free Text를 제외한다.
- 질문 Text는 Analytics, Crash Report, URL, Notification 또는 일반 로그에 기록하지 않는다.
- MVP는 외부 LLM 통신을 구현하지 않으며 복사 전 Clipboard 노출, 외부 서비스 저장·학습 가능성과 오답 위험을 고지한다.
- 실제 건강정보 모드는 Production Gate 미충족 시 Fail Closed한다.
- 외부 LLM 응답은 의료기록, 검사 판정, Consent, Authorization, Grant 또는 PACS 흐름의 입력으로 신뢰하지 않는다.
- 세부 통제는 `SEC-AIQ-001~007`과 `SEC-PXE-CX-001~008`을 따른다.

## 1.2 Synthetic RAG Security Gate

- `SEC-RAG-001~015`를 적용한다.
- 사용자 질문, Knowledge 본문과 Model 출력은 모두 비신뢰 입력으로 처리한다.
- Knowledge Manifest의 상태·Version·Hash 검증에 실패하면 Retrieval을 중단한다.
- Capstone RAG Runtime의 Internet·외부 LLM·Embedding·Telemetry Egress를 차단한다.
- Citation·Unsupported Claim·금지 Intent·식별정보 검증 중 하나라도 실패하면 전체 답변을 폐기하고 `ABSTAINED`로 종료한다.
- RAG Generator를 인증·인가·Grant·Preflight Decision Point에 연결하지 않는다.

보호 대상은 다음 P0 E2E Flow다.

```text
Hospital A Test Orthanc
        ↓
     DICOMweb
        ↓
       MediQ
        ↓
 Patient Mapping
        ↓
 Exchange Session
        ↓
     Consent
        ↓
 Authorization
        ↓
 Transfer Grant
        ↓
 Imaging Package
        ↓
 ┌───────────┬──────────────┐
 ▼           ▼              ▼
VIEW      DOWNLOAD       PACS_IMPORT
                             ↓
                      Hospital B
                      Test Orthanc
```

현재 Security Baseline의 성공기준은:

> **정상적인 의료영상 Exchange는 허용하고, 유효하지 않은 Actor·Tenant·Session·Consent·Grant·Scope에 의한 접근은 일관되게 차단하며 이를 Security Test로 증명하는 것**

이다.

---

# 2. Scope

P0 Security Scope:

```text
Identity
Authentication
Authorization
Consent Enforcement
Transfer Grant Security
Tenant Isolation
Patient Mapping Security
Exchange Session Security
API Security
DICOMweb Security
Viewer Security
Download Security
PACS Import Security
Transport Security
Temporary Payload Protection
Secret / Token Security
Integrity
Provenance
Audit / Logging
Fail Closed
Security Observability
Security Testing
```

P1:

```text
Mobile Secure Vault
Secure Medical Capsule
Hardware-backed Key
Device Binding
Biometric Unlock
MOBILE_EXPORT
Crypto-Shredding
QR Transfer Request
```

Production Security는 현재 P0에서 제외한다.

---

# 3. Normative References

우선순위:

```text
1. PROJECT-CHARTER.md
2. CAPSTONE-MVP-BOUNDARY.md
3. PRODUCT-BASELINE.md
4. REQUIREMENTS.md
5. SECURITY-REQUIREMENTS.md
6. DOMAIN-MODEL.md
7. SYSTEM-ARCHITECTURE.md
8. DATA-MODEL / OPENAPI
9. THREAT-MODEL.md
10. ACCEPTANCE-TESTS.md
11. IMPLEMENTATION-PLAN.md
12. CODE
13. LEGACY HIGHPASS
```

본 문서는 상위 Baseline의 Scope를 확장하지 않는다.

충돌 발견 시:

```text
SECURITY BASELINE CONFLICT
```

로 기록하고 하위 구현에서 임의로 해결하지 않는다.

---

# 4. Security Objectives

MediQ P0 Security Objective는 다음과 같다.

## SO-01 Unauthorized Access Prevention

승인되지 않은 사용자가 의료영상에 접근할 수 없어야 한다.

## SO-02 Explicit Authorization

모든 보호된 Resource 접근은 명시적인 Authorization 평가를 거쳐야 한다.

## SO-03 Tenant Isolation

다른 Tenant의 Resource에 대한 기본 접근은 차단해야 한다.

## SO-04 Consent Enforcement

유효한 Consent 없이 신규 의료영상 접근권한을 생성해서는 안 된다.

## SO-05 Least Privilege

Grant가 허용한 Action만 수행할 수 있어야 한다.

## SO-06 Secure Transport

보호 대상 통신은 암호화된 Transport를 사용해야 한다.

## SO-07 Integrity

영상 전달 과정에서 무결성 검증이 가능해야 한다.

## SO-08 Auditability

주요 Security Decision과 의료영상 Exchange를 추적할 수 있어야 한다.

## SO-09 Fail Closed

보안 판단이 실패하거나 불명확하면 접근을 허용하지 않아야 한다.

---

# 5. Security Requirement Convention

ID 형식:

```text
SEC-<DOMAIN>-NNN
```

Classification:

```text
CAPSTONE-P0
CAPSTONE-P1
POST-MVP
PRODUCTIONIZATION
OUT-OF-SCOPE
```

Priority:

```text
MUST
SHOULD
COULD
```

P0 핵심 Security Control은 `MUST`다.

---

# 6. Core Security Principles

다음 원칙을 P0 Security Baseline으로 고정한다.

```text
DENY BY DEFAULT

FAIL CLOSED

LEAST PRIVILEGE

EXPLICIT AUTHORIZATION

SHORT-LIVED ACCESS

SCOPE RESTRICTION

TENANT ISOLATION

ENCRYPTED TRANSPORT

INTEGRITY VERIFICATION

AUDITABILITY

DATA MINIMIZATION
```

---

# 7. Protected Assets

P0에서 보호해야 할 주요 Asset:

```text
Medical Imaging Payload
DICOM Metadata
Patient Reference
Patient Mapping
Exchange Session
Consent Artifact
Transfer Grant
Authentication Context
Tenant Context
DICOMweb Endpoint
Audit Event
Provenance Record
Integrity Evidence
Service Credential
Application Secret
```

---

# 8. Trust Boundaries

최소 Trust Boundary:

```text
[Hospital A Test Environment]
        │
        ▼
[Network Boundary]
        │
        ▼
[MediQ Application]
        │
        ├─ Control Domain
        ├─ Imaging Domain
        └─ Security Domain
        │
        ▼
[Network Boundary]
        │
        ▼
[Hospital B Test Environment]
```

추가:

```text
User / Browser
        ↕
MediQ API / Viewer

MediQ Application
        ↕
Temporary Imaging Storage
```

P1:

```text
MediQ
 ↕
Mobile Device
```

---

# 9. Identity Requirements

## SEC-IAM-001 — Actor Identification

**Classification:** CAPSTONE-P0
**Priority:** MUST

보호 Resource에 접근하는 Actor를 식별할 수 없는 경우 접근을 허용해서는 안 된다.

**Protected Asset:** Medical Imaging Resource
**Threat:** Anonymous Unauthorized Access

**Expected**

```text
Identified Actor
→ Continue
```

**Failure**

```text
Unknown Actor
→ DENY
```

**Acceptance:** `STC-IAM-001-PLANNED`
**Traceability:** `REQ-AUT-001`

---

## SEC-IAM-002 — Identity Context 분리

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템은 최소 다음 Identity Context를 구분할 수 있어야 한다.

```text
User
Service
Hospital
Tenant
Synthetic Patient Reference
```

**Acceptance:** `STC-IAM-002-PLANNED`

---

## SEC-IAM-003 — Patient Identity Boundary

**Classification:** CAPSTONE-P0
**Priority:** MUST

Synthetic Patient Reference를 실제 환자 본인인증 결과로 취급해서는 안 된다.

**Acceptance:** `STC-IAM-003-PLANNED`
**Traceability:** `REQ-PAT-005`

---

# 10. Authentication Requirements

## SEC-IAM-004 — Authentication Required

**Classification:** CAPSTONE-P0
**Priority:** MUST

보호 API 및 의료영상 Resource는 인증되지 않은 요청을 허용해서는 안 된다.

```text
Unauthenticated
→ DENY
```

**Acceptance:** `TC-IAM-001-AUTH-001`, `TC-IAM-001-AUTH-006`

---

## SEC-IAM-005 — Invalid Authentication

**Classification:** CAPSTONE-P0
**Priority:** MUST

유효하지 않은 Credential 또는 Authentication Context를 이용한 요청은 거부해야 한다.

**Acceptance:** `TC-IAM-001-AUTH-003~005`

---

## SEC-IAM-006 — Expired Authentication

**Classification:** CAPSTONE-P0
**Priority:** MUST

만료된 Authentication Context는 보호 Resource 접근에 사용할 수 없어야 한다.

**Acceptance:** `TC-IAM-001-AUTH-003` (expired and not-yet-valid tokens)

---

# 11. Authorization Requirements

## SEC-AUTHZ-001 — Explicit Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

모든 보호 Resource 접근 전에 최소 다음 Context를 평가해야 한다.

```text
Actor
Tenant
Exchange Session
Resource
Requested Action
Consent
Transfer Grant
```

**Expected**

```text
Valid Context
→ Policy Evaluation
→ ALLOW or DENY
```

**Failure**

```text
Missing Required Context
→ DENY
```

**Acceptance:** `TC-AUT-001-CTX-001~005` (context completeness/shape only); decision behavior remains `MEDIQ-AUT-002~004` and related authorization Acceptance.
**Traceability:** `REQ-AUT-001`

---

## SEC-AUTHZ-002 — Default Deny

**Classification:** CAPSTONE-P0
**Priority:** MUST

명시적인 `ALLOW` 결정을 생성할 수 없는 요청은 기본적으로 거부해야 한다.

```text
No Explicit Allow
→ DENY
```

**Acceptance:** `TC-AUT-002-DD-001~005`

---

## SEC-AUTHZ-003 — Authorization Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

Authorization Engine 또는 Policy Evaluation 자체가 실패한 경우 접근을 허용해서는 안 된다.

```text
Policy Error
→ DENY
```

**Acceptance:** `TC-AUT-002-DD-006` (evaluator); `TC-AUT-004-APP-001~004` (application boundary); HTTP safe-error and protected-resource behavior remain `TC-AUT-004-FC-001~004` and `AT-SEC-017`.

---

## SEC-AUTHZ-012 — Server-Owned Authorization Evidence

**Classification:** CAPSTONE-P0
**Priority:** MUST

Authorization facts는 server-owned persistence에서 exact internal identifiers로 parameterized query하여, IAM-002가 verified membership을 확인한 동일 transaction client로 읽어야 한다. Runtime 권한은 필요한 column `SELECT`로만 제한하고 row access는 기존 forced RLS를 통과해야 한다. Caller-supplied evidence, partial/fallback facts, unsupported resource parent mapping, missing row 또는 query failure는 모두 `DENY`한다. Evidence reader는 UID, local patient ID, storage reference, DICOM payload를 Authorization result에 포함하거나 로그에 기록하지 않는다.

**Acceptance:** `TC-AUT-005-DB-001~007`; route/data non-disclosure는 `AT-SEC-003` 및 `TC-AUT-004-FC-*` 별도 Gate.

# 12. Consent Security Requirements

## SEC-CONSENT-001 — Valid Consent Required

**Classification:** CAPSTONE-P0
**Priority:** MUST

유효한 Consent가 없는 Exchange Session에 대해 신규 Transfer Grant를 발급해서는 안 된다.

```text
No Valid Consent
→ Grant DENY
```

**Acceptance:** `TC-CON-008-AUT-001~003` (synthetic PostgreSQL evidence and internal protected-operation boundary only); actual Grant issuance denial remains open.
**Traceability:** `REQ-CON-003`

---

## SEC-CONSENT-002 — Withdrawn Consent

**Classification:** CAPSTONE-P0
**Priority:** MUST

철회된 Consent를 근거로 신규 Grant를 생성해서는 안 된다.

```text
WITHDRAWN
→ New Grant DENY
```

**Acceptance:** `TC-CON-008-AUT-004~006` (synthetic PostgreSQL evidence and internal protected-operation boundary only); actual Grant issuance denial remains open.
**Traceability:** `REQ-CON-004`

## SEC-CONSENT-007 — Synthetic Patient Claim-bound Withdrawal and Atomic Audit

**Classification:** CAPSTONE-P0
**Priority:** MUST

The synthetic Consent withdrawal endpoint accepts the verified OIDC bearer principal only. `mediq_patient_ref_id` must originate from the JWT after signature, issuer, audience, time and UUID checks; request body, query, arbitrary header, or UI state cannot select the patient. The verified actor must be an active tenant-level `USER` without a Hospital binding and must not be the Session requester. The server reads the Session and Consent inside the same IAM-002 Tenant/RLS transaction and requires the URL IDs, Consent PatientReference, Session PatientReference and signed claim to match exactly.

Only `ACTIVE` Consent with `withdrawn_at IS NULL` may transition to `WITHDRAWN`. Withdrawal remains available even if Consent/Session expiry has passed or the ExchangeSession is terminal, because expiry or workflow completion does not erase the patient's ability to record a withdrawal. An already-withdrawn exact object may be replayed without another success Audit. `PENDING`, `EXPIRED`, `REJECTED`, inconsistent timestamp/state, missing/invisible objects, wrong claim/actor, RLS/AuthN/DB/Audit errors fail closed without object-existence disclosure.

The request uses the same per-Session transaction advisory lock as the Consent lifecycle. Updating only `consents.status`, `consents.withdrawn_at`, and `consents.updated_at`, plus inserting one `CONSENT_WITHDRAWN` success Audit, is one atomic transaction. It does not mutate ExchangeSession state or Grant/PACS/image data. Grant issuance must use the same lock and re-read Consent before later allowing a Grant; every protected access must independently reject withdrawn Consent. This control cannot retract an already completed transfer, previously downloaded file, or offline copy, and does not claim legal-consent or remote-revocation semantics.

The runtime role receives only the additive `UPDATE(withdrawn_at)` column privilege; existing Consent status/timestamp and Audit privileges are reused. Forced Tenant RLS remains mandatory. No table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE or other UPDATE grant is permitted.

**Acceptance:** `TC-CON-005-API-001~013`; `AT-FUNC-007`; `AT-SEC-006`
**Traceability:** `REQ-CON-004`, `SEC-CONSENT-002`, `SEC-CONSENT-006`, `SEC-API-001/002`, `SEC-DB-005/006`, `SEC-AUD-001`, `THR-004`

## SEC-CONSENT-008 — P0 Allowed Action and Grant Scope Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

P0 object Authorization accepts only Consent Action values `VIEW`, `DOWNLOAD`, and `PACS_IMPORT`. The requested Action must be an exact member of the server-resolved Consent action set. A Consent evidence set containing `MOBILE_EXPORT`, any unknown value, or a duplicate is invalid and must yield `DENY`, even if the current request is for an otherwise permitted P0 action. Grant scopes must map one-to-one to their exact P0 action (`study:view`, `study:download`, `study:pacs-transfer`); unknown, P1, mismatched, duplicate, or additional scopes not covered by Consent actions yield `DENY`.

This pure-policy rule does not prove Grant issuance denial, HTTP BOLA, trusted persistence provenance, or prevention of Viewer/Download/PACS side effects. P1 Mobile Export remains outside P0; a schema enum that can represent that future value does not enable it in P0.

**Acceptance:** `TC-CON-006-AUTH-001~005`; existing `TC-AUT-003-OBJ-001/005/009` (pure policy only)
**Traceability:** `REQ-CON-006`, `REQ-GRT-004`, `SEC-GRANT-005`, `SEC-API-002`, `THR-005`

---

## SEC-CONSENT-003 — Resource Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent가 허용한 Resource와 요청 Resource가 일치하지 않는 경우 접근을 허용해서는 안 된다.

**Acceptance:** `STC-CONSENT-003-PLANNED`

---

## SEC-CONSENT-004 — Destination Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent 대상 Destination과 다른 Hospital에 대한 전송 요청은 거부해야 한다.

```text
Consent: Hospital B
Request: Hospital C
→ DENY
```

**Acceptance:** `STC-CONSENT-004-PLANNED`

---

## SEC-CONSENT-005 — Consent Request Actor and Atomicity

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent Request 생성은 verified `USER` Actor가 자기 Hospital을 destination으로 하는, 본인이 생성한 `REQUESTED` ExchangeSession에 대해서만 허용해야 한다. Patient/Source/Destination context는 client가 제출한 값을 신뢰하지 않고 같은 IAM-002 Tenant/RLS transaction에서 저장된 Session으로부터 가져온다. 새 Consent는 항상 `PENDING`이며 Consent+action rows, Session의 `REQUESTED→CONSENT_PENDING` 전이와 `CONSENT_REQUESTED` 성공 Audit은 하나의 transaction에서 함께 commit되거나 함께 rollback되어야 한다. 동일 미결 요청 재시도는 중복 Consent/Audit를 만들지 않는다.

이 요청은 환자 승인, 법적 동의, Authorization `ALLOW`, TransferGrant, Viewer/Download/PACS 권한을 생성하지 않는다. DB 접근은 migration에 기록된 정확한 column-level `SELECT`/`INSERT` 및 `exchange_sessions(state, updated_at)` `UPDATE`만 허용하고 forced RLS를 유지한다.

**Acceptance:** `TC-CON-003-API-001~009`
**Traceability:** `REQ-CON-001/002/005`, `AT-FUNC-005`

`MEDIQ-CON-001` Acceptance verifies only the synthetic P0 Consent domain shape. `MEDIQ-CON-002` adds only internal PENDING metadata persistence under synthetic scratch grants and Tenant RLS; neither Ticket passes `SEC-CONSENT-001~004`. `MEDIQ-CON-003` adds only the authenticated destination-Hospital request path and atomic PENDING/Session/Audit workflow under `SEC-CONSENT-005`; it does not prove patient identity, legal consent, `SEC-CONSENT-001~004` enforcement, Grant issuance denial, or protected image access. Stored Consent or RLS visibility is not Authorization.

## SEC-CONSENT-006 — Synthetic Patient Claim-bound Technical Approval

**Classification:** CAPSTONE-P0
**Priority:** MUST

`approveConsent`는 유효한 configured OIDC issuer/audience/서명으로 검증된 bearer JWT의 `mediq_patient_ref_id` claim만 synthetic patient principal로 사용할 수 있다. Claim을 request body, URL, 일반 header 또는 UI 상태에서 받지 않는다. Claim은 UUID 형식이어야 하고 active `USER` Actor가 hospital-bound가 아니어야 하며 해당 exchange의 병원 요청 Actor와 동일해서는 안 된다. Session과 Consent는 같은 IAM-002 verified Tenant/RLS transaction에서 조회하고, Session ID·Consent ID·Consent `patient_ref_id`·Session `patient_ref_id`·서명 Claim이 모두 일치해야 한다.

승인 가능한 상태는 미만료 `CONSENT_PENDING` Session과 단일 `PENDING` Consent다. Session advisory lock으로 동시 승인을 직렬화한다. Consent `PENDING→ACTIVE`/issued timestamp, Session `CONSENT_PENDING→CONSENTED`, `CONSENT_APPROVED` Audit는 한 transaction에서 함께 commit/rollback한다. Claim 불일치, wrong Actor, not found/invisible object, 만료·철회·다른 상태, RLS/DB/AuthN/쓰기/Audit 실패는 default deny/fail closed하며 보호 데이터나 객체 존재를 노출하지 않는다. 정확히 같은 완료 승인은 idempotent replay로 처리하고 Audit를 중복 기록하지 않는다.

이 signed claim은 캡스톤 합성 데이터의 test identity binding일 뿐 환자 본인확인, 법적 의료정보 제공 동의, 충분한 설명 또는 운영 IDP 연계를 증명하지 않는다. `ACTIVE`는 Authorization `ALLOW`, Grant, Viewer/Download/PACS 권한이 아니며 해당 endpoint는 Grant·영상·PACS side effect를 수행하지 않는다. DB 권한은 `consents(status, issued_at, updated_at)` UPDATE 3개만 추가한다. 기존 Session `(state, updated_at)` UPDATE와 Audit INSERT 권한 및 forced RLS를 유지하고 table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/other UPDATE는 금지한다.

**Acceptance:** `TC-CON-004-API-001~010`
**Traceability:** `AT-FUNC-006`, `REQ-CON-003/005`, `SEC-API-001/002`, `SEC-DB-005/006`, `SEC-AUD-001`, `THR-004`

---

# 13. Transfer Grant Security Requirements

## SEC-GRANT-001 — Scoped Grant

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant는 최소 다음 항목으로 제한할 수 있어야 한다.

```text
grant_id
session
recipient
tenant
resource
scope
issued_at
expires_at
status
```

**Acceptance:** `TC-GRT-001-DOM-001~010` (domain metadata validation) and `TC-GRT-002-PER-001~008` (scratch-only persistence/RLS boundary; issuance, HTTP, cross-entity binding and protected operation enforcement remain separate)
**Traceability:** `REQ-GRT-001`

---

## SEC-GRANT-002 — Expired Grant

**Classification:** CAPSTONE-P0
**Priority:** MUST

만료된 Grant는 사용할 수 없어야 한다.

```text
Expired
→ DENY
```

**Acceptance:** `TC-GRT-007-EXP-001~008` (PASS — strict server-time expiry policy; protected-operation integration remains separate)
**Traceability:** `REQ-GRT-005`

---

## SEC-GRANT-003 — Recipient Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant에 지정되지 않은 Recipient의 사용을 거부해야 한다.

```text
Hospital B Grant
→ Hospital C
→ DENY
```

**Acceptance:** `STC-GRANT-003-PLANNED`

---

## SEC-GRANT-004 — Tenant Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant의 Tenant와 요청 Tenant가 일치하지 않는 경우 사용을 거부해야 한다.

**Acceptance:** `STC-GRANT-004-PLANNED`

---

## SEC-GRANT-005 — Scope Enforcement

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant에 포함되지 않은 Action을 허용해서는 안 된다.

```text
study:view
→ Viewer PASS
→ Download DENY
→ PACS_IMPORT DENY
```

**Acceptance:** `TC-GRT-005-AUTH-001~008` (pure shared object-authorization policy; no HTTP or PACS side-effect claim)
**Traceability:** `REQ-GRT-004`

---

## SEC-GRANT-006 — Sensitive Data Exclusion

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant에는 다음을 직접 포함해서는 안 된다.

```text
Raw DICOM Payload
DEK
KEK
Password
Private Key
Long-lived Secret
```

**Acceptance:** `TC-GRT-001-DOM-010`; `TC-GRT-006-PAY-001~004` (domain and issue/revoke serialization allowlist)

---

## SEC-GRANT-007 — Consent-bound actor-scoped issuance

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant issue는 IAM-002 verified `USER`가 자신의 목적지 Hospital에서 해당 Session을 생성한 경우에만 허용한다. Server facts 기준으로 Session·Patient·Source/Destination·ACTIVE Consent·Consent actions·Package binding·status·expiry를 재검증하고 default-deny한다. Recipient Actor/Tenant/Hospital은 서버 context에서 파생하며 exact non-null Package binding을 저장한다. 발급용 policy와 이미 발급된 Grant를 사용하는 object Authorization을 혼동하거나 순환 대체하지 않는다. 발급 성공은 영상 열람·다운로드·전송 권한이 아니다.

**Acceptance:** `TC-GRT-003-API-001~012`, `TC-GRT-003-API-017~020`.
**Traceability:** `REQ-GRT-003`, `REQ-GRT-007`.

---

## SEC-GRANT-008 — Grant issue idempotency and exact DB privilege

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant issue는 verified Tenant·Actor에 결속된 UUID `Idempotency-Key`를 받아야 한다. 동일 key의 의미상 동일 request는 동일 Grant를 반환하고, key 재사용으로 다른 binding/scope를 만들 수 없어야 한다. Session/advisory transaction lock, unique constraint, parent/scope insert 및 Audit은 원자적으로 처리한다. Runtime DB 권한은 지정된 Grant columns에 한정하며 table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/broad UPDATE를 허용하지 않는다.

**Acceptance:** `TC-GRT-003-API-013~017`, `TC-GRT-003-DB-001~006`.
**Traceability:** `REQ-GRT-007`, `SEC-DB-005/006`, `SEC-AUD-001/002`.

---

## SEC-GRANT-009 — Exact-recipient Grant revocation

**Classification:** CAPSTONE-P0
**Priority:** MUST

Only the exact verified destination USER Actor bound to the Grant may revoke it in P0. Tenant, Hospital, Actor, route Session and Grant must match server-owned evidence; `SERVICE`, tenant-only membership, another Actor/Hospital/Tenant and caller-supplied identity/state are denied. Consent/Session/Grant expiry state must not block revoking an otherwise ACTIVE Grant.

The service must serialize revocation with Grant issuance and Consent transitions for the same Session, lock the exact Grant row, conditionally change only `status` and `revoked_at`, and atomically write one minimized `GRANT_REVOKED/SUCCESS` Audit. Already-REVOKED replay preserves the original timestamp and creates no duplicate success Audit. Runtime SQL permission is exactly `UPDATE(status, revoked_at)`; table-wide UPDATE and changes to scopes, bindings, expiry or creation metadata are forbidden. Forced RLS remains required.

This control does not prove the denial or termination of already-running Viewer/Download/PACS operations and does not remotely erase already delivered/offline copies. Protected operation handlers must independently revalidate Consent/Grant under a race-safe boundary before any side effect.

**Acceptance:** `TC-GRT-004-REV-API-001~012`; `TC-GRT-004-REV-DB-001~004`.
**Traceability:** `REQ-GRT-008`, `SEC-DB-005/006`, `SEC-AUD-001~006`, `THR-042`.

---

# 14. Tenant Isolation Requirements

## SEC-TEN-001 — Default Tenant Isolation

**Classification:** CAPSTONE-P0
**Priority:** MUST

다른 Tenant의 보호 Resource 접근은 기본적으로 거부해야 한다.

```text
Cross Tenant
→ DENY
```

**Acceptance:** `STC-TEN-001-PLANNED`
**Traceability:** `REQ-TEN-002`

---

## SEC-TEN-002 — Explicit Exchange Exception

**Classification:** CAPSTONE-P0
**Priority:** MUST

Cross-Tenant 접근은 다음 조건이 모두 유효할 때만 허용할 수 있다.

```text
Valid Exchange Session
+
Valid Consent
+
Valid Grant
+
Correct Resource
+
Correct Recipient
+
Correct Action
```

**Acceptance:** `STC-TEN-002-PLANNED`

---

## SEC-TEN-003 — Third Tenant Rejection

**Classification:** CAPSTONE-P0
**Priority:** MUST

A→B Exchange에 참여하지 않은 Tenant C는 해당 Grant를 사용할 수 없어야 한다.

**Acceptance:** `STC-TEN-003-PLANNED`

---

## SEC-TEN-004 — Registry Owner-Pair Integrity

**Classification:** CAPSTONE-P0
**Priority:** MUST

Registry는 Hospital의 `(tenant_id, organization_id)`가 같은 Tenant 행에 속하고, `hospital_id`가 지정된 Actor의 `(tenant_id, hospital_id)`가 같은 Tenant의 Hospital을 가리키도록 복합 FK로 강제해야 한다. `actors.hospital_id = NULL`인 Tenant-level Actor는 허용한다.

이 DB 구조 제약은 Registry 소유 관계 오류를 저장 단계에서 거부하는 defense-in-depth다. Runtime Tenant Authorization, Consent/Grant 평가, RLS 또는 보호 Resource 접근 검증을 대체하지 않는다.

**Acceptance:** `TC-DB-008-REG-009`
**Traceability:** `REQ-TEN-002`

---

# 15. Patient Mapping Security Requirements

## SEC-IAM-007 — Missing Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

Destination Patient Mapping이 없는 상태에서 PACS Import를 수행해서는 안 된다.

```text
Missing Mapping
→ PACS_IMPORT DENY
```

**Acceptance:** `TC-PAT-003-DOM-002`, `TC-PAT-004-PER-001`; PACS side-effect denial remains `AT-SEC-012` (planned PACS-004 integration gate)
**Traceability:** `REQ-PAT-004`

---

## SEC-IAM-008 — Ambiguous Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

Patient Mapping 결과가 둘 이상이거나 명확하지 않은 경우 임의 환자로 전송해서는 안 된다.

```text
Ambiguous Mapping
→ DENY
```

**Acceptance:** `TC-PAT-003-DOM-003~004`, `TC-PAT-004-PER-002~003`; PACS side-effect denial remains `AT-SEC-012` (planned PACS-004 integration gate)

---

## SEC-IAM-009 — Validated Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

명시적으로 검증된 Test Patient Mapping만 PACS Import에 사용할 수 있어야 한다.

**Acceptance:** `TC-PAT-003-DOM-001, DOM-005~006`, `TC-PAT-004-PER-002`; PACS authorization remains separately gated

---

# 16. Exchange Session Security Requirements

## SEC-AUTHZ-004 — Invalid Session State

**Classification:** CAPSTONE-P0
**Priority:** MUST

최소 다음 상태의 Session은 보호 Resource 접근에 사용할 수 없어야 한다.

```text
EXPIRED
REVOKED
REJECTED
FAILED
CANCELLED
```

**Acceptance:** `STC-AUTHZ-004-PLANNED`

---

## SEC-AUTHZ-005 — Session ID Is Not Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session ID를 알고 있다는 사실만으로 의료영상 접근권한을 부여해서는 안 된다.

**Acceptance:** `STC-AUTHZ-005-PLANNED`

---

# 17. API Security Requirements

## SEC-API-001 — Protected API Authentication

**Classification:** CAPSTONE-P0
**Priority:** MUST

보호된 MediQ API는 Authentication Context를 요구해야 한다.

**Acceptance:** `TC-IAM-001-AUTH-001`, `TC-IAM-001-AUTH-006~007`

---

## SEC-API-002 — Object-Level Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

객체 ID를 알고 있다는 이유만으로 Resource 접근을 허용해서는 안 된다.

예:

```text
GET /exchange-sessions/{id}
```

최소 다음을 검증한다.

```text
Actor
Tenant
Session
Authorization
```

**Threat:** IDOR / BOLA
**Acceptance:** `TC-AUT-003-OBJ-001~012` (policy contract); `AT-SEC-003` (protected HTTP BOLA/IDOR integration, pending route)

---

## SEC-API-003 — Input Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

보안 결정 또는 Resource 식별에 사용되는 입력은 허용 형식 및 Context에 대해 검증해야 한다.

**Acceptance:** `STC-API-003-PLANNED`

---

## SEC-API-004 — Resource Ownership

**Classification:** CAPSTONE-P0
**Priority:** MUST

보호 Resource의 소유 Tenant 또는 허가된 Exchange Context를 검증하지 않고 Resource를 반환해서는 안 된다.

**Acceptance:** `STC-API-004-PLANNED`

---

## SEC-API-005 — Idempotent Exchange Request Creation

**Classification:** CAPSTONE-P0
**Priority:** MUST

`POST /exchange-sessions`는 검증된 Actor에 scope된 필수 UUID `Idempotency-Key`를 요구해야 한다. 같은 Actor와 key로 동일한 request를 재시도하면 최초 Session 결과를 반환하고 새 Session이나 성공 Audit을 추가 생성하지 않아야 한다. 같은 Actor/key를 다른 Patient·Source·Destination·Purpose 입력과 재사용하면 고정 `409` conflict로 거부해야 한다. `X-Correlation-ID`는 관측용이며 idempotency key를 대체하지 않는다. Idempotency key는 자격증명이나 권한이 아니다.

이 Control은 Session request metadata 생성에만 적용한다. Session ID나 성공 응답은 Consent, Authorization, Transfer Grant, VIEW/DOWNLOAD/PACS_IMPORT 권한을 부여하지 않는다. 요청·응답 오류에는 Patient/병원 세부정보, SQL, Secret 또는 내부 오류를 노출하지 않는다.

**Acceptance:** `TC-EXC-003-API-006~008`, `TC-EXC-003-DB-003~004`

---

# 18. DICOM / DICOMweb Security Requirements

## SEC-DICOM-001 — QIDO-RS Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

승인되지 않은 Actor가 다른 Tenant 또는 Patient의 Study 목록을 조회할 수 없어야 한다.

**Acceptance:** `STC-DICOM-001-PLANNED`
**Traceability:** `REQ-DICOM-001`

---

## SEC-DICOM-002 — WADO-RS Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

유효한 Viewer 또는 Resource 권한 없이 WADO-RS 기반 Imaging Payload를 획득할 수 없어야 한다.

**Acceptance:** `STC-DICOM-002-PLANNED`
**Traceability:** `REQ-DICOM-002`

---

## SEC-DICOM-003 — STOW-RS Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

유효한 `study:pacs-transfer` Grant가 없는 요청은 STOW-RS 전송을 수행할 수 없어야 한다.

**Acceptance:** `STC-DICOM-003-PLANNED`
**Traceability:** `REQ-DICOM-003`

---

# 19. Viewer Security Requirements

## SEC-AUTHZ-006 — Viewer Access Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

Viewer 접근 전에 최소 다음을 모두 검증해야 한다.

```text
Authenticated
Authorized
Session Valid
Consent Valid
study:view
Correct Tenant
Correct Resource
```

하나라도 실패하면:

```text
DENY
```

**Acceptance:** `STC-VIEW-001-PLANNED`

---

## SEC-AUTHZ-007 — Direct Viewer URL

**Classification:** CAPSTONE-P0
**Priority:** MUST

Viewer URL 또는 Study UID를 직접 알고 있다는 이유만으로 의료영상을 조회할 수 없어야 한다.

**Acceptance:** `STC-VIEW-002-PLANNED`

---

# 20. Download Security Requirements

## SEC-AUTHZ-008 — Independent Download Permission

**Classification:** CAPSTONE-P0
**Priority:** MUST

Download는 Viewer 권한과 독립적인 `study:download` Scope를 요구해야 한다.

```text
Viewer Access
≠
Download Access
```

**Acceptance:** `STC-DWN-001-PLANNED`

---

## SEC-AUTHZ-009 — View-only Download Denial

**Classification:** CAPSTONE-P0
**Priority:** MUST

`study:view`만 가진 Grant의 Download 요청은 거부해야 한다.

**Acceptance:** `STC-DWN-002-PLANNED`

---

# 21. PACS Import Security Requirements

## SEC-DICOM-004 — PACS Import Precondition

**Classification:** CAPSTONE-P0
**Priority:** MUST

PACS Import 전에 최소 다음 보안조건을 확인해야 한다.

```text
Valid Session
Valid Consent
Valid Grant
study:pacs-transfer
Correct Destination
Valid Patient Mapping
Allowed STOW-RS Endpoint
```

**Acceptance:** `STC-PACS-001-PLANNED`

---

## SEC-DICOM-005 — Destination Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant에 지정된 Destination이 아닌 PACS Endpoint로 의료영상을 전송해서는 안 된다.

**Acceptance:** `STC-PACS-002-PLANNED`

---

## SEC-DICOM-006 — Byte-Preserving Patient Identity Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

P0 PACS Import must not send a byte-preserving DICOM instance unless its single validated PatientID exactly matches the verified destination Hospital PatientMapping `localPatientId`. Missing, malformed, conflicting or mismatched identity evidence must fail closed before any STOW-RS request. The P0 system must not rewrite PatientID or other DICOM attributes. The synthetic exact-match rule is not identity proof for real patients.

An ambiguous STOW outcome must be persisted as `RESULT_UNKNOWN` and must not trigger a blind retry. A durable operation/idempotency claim and read-only reconciliation path are required before the PACS coordinator can issue STOW.

**Acceptance:** `TC-PACS-001-PID-001/002` (internal identity preflight scoped PASS); `TC-PACS-001-PID-003` (coordinator no-STOW remains NOT RUN); `TC-PACS-001-UNKNOWN-001`, `AT-SEC-012/013`, `AT-E2E-003`

---

# 22. Transport Security Requirements

## SEC-TLS-001 — TLS Required

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 보호 대상 통신은 HTTPS/TLS를 사용해야 한다.

```text
Client ↔ MediQ
MediQ ↔ DICOMweb Endpoint
MediQ ↔ Test Orthanc
```

**Acceptance:** `STC-TLS-001-PLANNED`

---

## SEC-TLS-002 — Certificate Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

TLS 인증서 검증을 기본적으로 우회해서는 안 된다.

```text
verify=false
```

와 같은 설정은 명시적인 Test-only 환경 이외에는 허용하지 않는다.

**Acceptance:** `STC-TLS-002-PLANNED`

**Execution status (2026-10-01):** `MEDIQ-TLS-001` passes the local synthetic API↔Test Orthanc portion (`TC-TLS-001-*`), including CA/hostname validation, HTTP downgrade rejection, and read-only DICOM probes. Client↔MediQ ingress TLS, production certificate lifecycle and overall `SEC-TLS-001/002` acceptance remain open; this scoped result must not be reported as global TLS completion.

---

## SEC-TLS-003 — mTLS

**Classification:** CAPSTONE-P0
**Priority:** SHOULD

Service-to-service 인증 강화를 위해 mTLS 적용을 고려한다.

단, mTLS 미적용만으로 P0 MVP 전체를 실패로 판단하지 않는다.

**Acceptance:** `STC-TLS-003-PLANNED`

---

# 23. Temporary Data Protection Requirements

## SEC-DATA-001 — Temporary Exchange Copy Protection

**Classification:** CAPSTONE-P0
**Priority:** MUST

MediQ Temporary Imaging Copy는 Application Authorization을 우회한 직접 접근으로부터 보호되어야 한다. Storage primitive 자체는 Authorization capability가 아니며 모든 사용 전에 verified Tenant·Consent·Grant·purpose 검사와 server-owned reference resolution이 필요하다.

**Acceptance:** `TC-PACS-001-STAGE-002/004/006/011` (`ACCEPTANCE-TESTS.md`; NOT RUN)

---

## SEC-DATA-002 — Data Lifecycle

**Classification:** CAPSTONE-P0
**Priority:** MUST

Temporary Imaging Payload는 Exchange 종료 이후 bounded TTL, 즉시 expiry deny, retryable purge, Tenant-RLS SERVICE cleanup 및 metadata-only Audit lifecycle을 가져야 한다. P0 synthetic timing은 `PACS-001-DEC-007`로 권고되며 Production retention은 별도 결정이다.

구체적인 Production Retention 기간은 P0에서 고정하지 않는다.

**Acceptance:** `TC-PACS-001-STAGE-007/008/010` (`ACCEPTANCE-TESTS.md`; NOT RUN)

---

## SEC-DATA-003 — Encryption at Rest

**Classification:** CAPSTONE-P0
**Priority:** MUST — accepted P0 design recommendation; implementation remains pending

Temporary Imaging Payload가 저장되는 경우 개발환경에서 적용 가능한 저장 암호화 또는 동등한 보호수단을 적용해야 한다.

`PACS-001-DEC-007`에 따라 각 instance는 AES-256-GCM으로 암호화하고, 단일 프로세스 P0에서 random DEK는 memory-only이며 파일·DB에 저장하지 않는다. Tenant/Session/Package/StudyReference/Purpose binding, 64 MiB/object, 2 GiB/package, 10 GiB/environment, TTL 및 purge evidence를 강제한다. Process restart/다른 replica에서는 해당 객체를 복호화할 수 없고 fail closed 및 purge 대상으로 처리한다. Enterprise HSM/KMS는 P0 필수가 아니며 생산용 multi-replica Managed KMS/HSM 통합은 별도 Gate다. 구현·검증 전에는 지속성 임시 DICOM 저장 경로를 활성화하지 않는다.

**Acceptance:** `TC-PACS-001-STAGE-001~003/009` (`ACCEPTANCE-TESTS.md`; `STAGE-001` PASS only in synthetic unit harness, `STAGE-002/003/009` NOT RUN)

---

# 24. Secret / Token Requirements

## SEC-SEC-001 — No Hard-coded Secrets

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 정보를 Source Code에 직접 Hard-code해서는 안 된다.

```text
Password
API Secret
Private Key
Service Credential
Database Password
```

**Acceptance:** `STC-SEC-001-PLANNED`

---

## SEC-SEC-002 — Secret Injection

**Classification:** CAPSTONE-P0
**Priority:** MUST

Test/Development Secret은 환경변수 또는 별도 Secret 전달수단으로 주입할 수 있어야 한다.

**Acceptance:** `STC-SEC-002-PLANNED`

---

## SEC-TOK-001 — Token Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

Token 기반 Context가 사용되는 경우 최소 다음 속성에 대한 검증을 지원해야 한다.

```text
issuer
audience
scope
expiration
token identifier
```

**Acceptance:** `STC-TOK-001-PLANNED`

---

## SEC-TOK-002 — Expired Token

**Classification:** CAPSTONE-P0
**Priority:** MUST

만료된 Token을 이용한 보호 Resource 접근은 거부해야 한다.

**Acceptance:** `STC-TOK-002-PLANNED`

---

## SEC-TOK-003 — Wrong Audience

**Classification:** CAPSTONE-P0
**Priority:** MUST

의도하지 않은 Audience용 Token을 MediQ 보호 Resource에 사용할 수 없어야 한다.

**Acceptance:** `STC-TOK-003-PLANNED`

---

## SEC-TOK-004 — Missing Scope

**Classification:** CAPSTONE-P0
**Priority:** MUST

필요한 Scope가 없는 Token/Grant로 해당 Action을 수행할 수 없어야 한다.

**Acceptance:** `STC-TOK-004-PLANNED`

---

# 25. Replay Protection Requirements

## SEC-RPL-001 — Short-lived Credential Replay

**Classification:** CAPSTONE-P0
**Priority:** SHOULD

Grant 또는 단기 Access Credential의 재사용 위험을 제한할 수 있는 구조를 지원해야 한다.

후보:

```text
jti
nonce
expiration
state
```

**Acceptance:** `STC-RPL-001-PLANNED`

QR은 P1 Security로 분리한다.

---

# 26. Integrity Requirements

## SEC-INT-001 — Source/Destination Verification

**Classification:** CAPSTONE-P0
**Priority:** MUST

Bit-preserving P0 Test Scenario에서 다음 구간의 무결성을 검증할 수 있어야 한다.

```text
Source Object
→ MediQ
→ Destination Object
```

**Expected**

```text
MATCH
→ PASS
```

**Failure**

```text
MISMATCH
→ FAIL
```

**Acceptance:** `TC-INT-001-HASH-001~008`; `TC-INT-001-DB-001~010` (hash and operation-bound PENDING persistence sub-gates only; authorized source/destination verification remains NOT RUN)
**Traceability:** `REQ-INT-001`

---

## SEC-INT-002 — Integrity Failure Handling

**Classification:** CAPSTONE-P0
**Priority:** MUST

Integrity Verification이 실패한 Transfer를 성공으로 기록해서는 안 된다.

**Acceptance:** `STC-INT-002-PLANNED`

---

# 27. Provenance Security Requirements

## SEC-INT-003 — Provenance Chain

**Classification:** CAPSTONE-P0
**Priority:** MUST

최소 다음 관계를 추적할 수 있어야 한다.

```text
Source Hospital
Source Study
Exchange Session
Destination
Transfer
Integrity Result
```

**Acceptance:** `STC-PROV-001-PLANNED`
**Traceability:** `REQ-PROV-002`

---

# 28. Audit / Logging Requirements

## SEC-AUD-001 — Security Event Audit

**Classification:** CAPSTONE-P0
**Priority:** MUST

최소 다음 Security Event를 Audit해야 한다.

```text
AUTHENTICATION_FAILURE
AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED
SESSION_CREATED (SUCCESS only; atomic with the Session row)
CONSENT_REQUESTED
CONSENT_APPROVED
CONSENT_WITHDRAWN
GRANT_CREATED
GRANT_DENIED
VIEWER_OPENED
DOWNLOAD_STARTED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
ACCESS_DENIED
INTEGRITY_FAILURE
```

EXC-003 records only successful Session creation in the same transaction as its row. GRT-003 records Grant issue allow/create events together with the Grant and records policy denials only after a verified Tenant context exists. `AUD-002-DEC-001` additionally requires the verified Grant issue/revocation denial paths to record both `AUTHORIZATION_DENIED` and `GRANT_DENIED` atomically. Denial/unavailable-event coverage outside these routes and global Audit completeness remain separate controls; Tenant-less authentication failures are not written to the tenant-RLS table.

**Acceptance:** `TC-AUD-001-WRITER-001~009` covers the scoped common writer/currently wired event paths; `TC-AUD-002-EVENT-001~008` covers verified-Tenant Grant denial pairs; `TC-CON-007-AUD-001~005` (Consent event context); `TC-GRT-003-API-013~020` (Grant issue events); `TC-EXC-003-API-003`, `TC-EXC-003-API-010`, `TC-EXC-003-DB-005`; global Audit gate `STC-AUD-001-PLANNED` remains open.

---

## SEC-AUD-002 — Audit Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

Security Audit Event는 최소 다음 정보를 포함하거나 참조할 수 있어야 한다.

```text
timestamp
actor_reference
tenant_context
session_reference
action
result
```

선택:

```text
resource_reference
reason_code
```

**Acceptance:** `STC-AUD-002-PLANNED`

---

## SEC-AUD-003 — Audit Data Minimization

**Classification:** CAPSTONE-P0
**Priority:** MUST

Audit에 다음 정보를 불필요하게 기록해서는 안 된다.

```text
DICOM Binary
Full Medical Image
Raw Credential
Password
Private Key
Raw Bearer Token
불필요한 Patient Metadata
```

**Acceptance:** `STC-AUD-003-PLANNED`

---

## SEC-LOG-001 — Sensitive Log Exclusion

**Classification:** CAPSTONE-P0
**Priority:** MUST

Application Log에 다음을 기록해서는 안 된다.

```text
Password
Secret
Raw Access Token
Private Key
Sensitive DICOM Payload
```

**Acceptance:** `STC-LOG-001-PLANNED`

---

# 29. Secure Error Handling

## SEC-ERR-001 — External Error Minimization

**Classification:** CAPSTONE-P0
**Priority:** MUST

외부 Error Response에 Credential, Token, Private Key 등 민감정보를 노출해서는 안 된다.

**Acceptance:** `STC-ERR-001-PLANNED`

---

## SEC-ERR-002 — Internal / External Error Separation

**Classification:** CAPSTONE-P0
**Priority:** SHOULD

사용자에게 반환되는 Error Response와 개발자가 확인하는 내부 진단정보를 구분해야 한다.

**Acceptance:** `STC-ERR-002-PLANNED`

---

## SEC-ERR-003 — Fail Closed

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 상황에서 기본 동작은 `DENY` 또는 `FAIL`이어야 한다.

```text
Authentication Unknown
Authorization Unknown
Consent Unknown
Grant Validation Failure
Tenant Mismatch
Patient Mapping Invalid
Integrity Failure
Security Policy Error
```

**Acceptance:** `STC-ERR-003-PLANNED`

---

# 30. Security Observability

## SEC-OBS-001 — Security Decision Visibility

**Classification:** CAPSTONE-P0
**Priority:** MUST

Test 환경에서 최소 다음 결과를 확인할 수 있어야 한다.

```text
Authentication Result
Authorization Result
Grant Validation Result
Tenant Validation Result
DICOMweb Result
PACS Transfer Result
Integrity Result
Access Denial Reason
```

**Acceptance:** `STC-OBS-001-PLANNED`

---

# 31. Security Test Data Boundary

보안 테스트에서도 실제 환자/병원 데이터를 사용하지 않는다.

허용:

```text
Synthetic Patient
Synthetic DICOM
Test Hospital
Test Credential
Invalid Test Credential
Forged Test Credential
Expired Test Grant
```

금지:

```text
Real Patient PII
Real Hospital Credential
Production Secret
Actual Hospital Network
```

---

# 32. Mandatory Negative Tests

다음 Negative Test는 P0 Security Acceptance에 포함한다.

| ID          | Scenario                                   | Expected         |
| ----------- | ------------------------------------------ | ---------------- |
| STC-NEG-001 | No Consent                                 | DENY             |
| STC-NEG-002 | Expired Grant                              | DENY             |
| STC-NEG-003 | Wrong Scope                                | DENY             |
| STC-NEG-004 | Wrong Recipient                            | DENY             |
| STC-NEG-005 | Wrong Tenant                               | DENY             |
| STC-NEG-006 | Invalid Patient Mapping                    | PACS_IMPORT DENY |
| STC-NEG-007 | Invalid Session                            | DENY             |
| STC-NEG-008 | Unauthorized Viewer                        | DENY             |
| STC-NEG-009 | View-only Grant → Download                 | DENY             |
| STC-NEG-010 | Unauthorized STOW-RS                       | DENY             |
| STC-NEG-011 | Integrity Failure                          | FAIL             |
| STC-NEG-012 | Unknown Authorization Context              | DENY             |
| STC-NEG-013 | Direct Object ID access without permission | DENY             |
| STC-NEG-014 | Expired Authentication                     | DENY             |
| STC-NEG-015 | Wrong Token Audience                       | DENY             |

---

# 33. Mandatory Positive Tests

다음 정상 흐름도 검증한다.

## STC-POS-001 — Viewer

```text
Valid Identity
+
Valid Session
+
Valid Consent
+
Valid Grant
+
Correct Tenant
+
study:view

→ Viewer PASS
```

## STC-POS-002 — Download

```text
Valid Context
+
study:download

→ DICOM Download PASS
```

## STC-POS-003 — PACS Import

```text
Valid Context
+
study:pacs-transfer
+
Valid Patient Mapping
+
Correct Destination

→ Hospital B STOW-RS PASS
```

## STC-POS-004 — Integrity

```text
Bit-preserving Transfer
+
Matching Integrity Evidence

→ PASS
```

---

# 34. P1 Mobile Security Requirements

다음은 `CAPSTONE-P1`이다.

## SEC-MOB-001 — Mobile Secure Vault

**Priority:** SHOULD

의료영상을 보호된 Mobile Secure Vault에 저장할 수 있는 구조를 지원한다.

## SEC-MOB-002 — Secure Medical Capsule

**Priority:** SHOULD

Mobile Export 의료영상은 암호화된 Secure Medical Capsule 형태로 보호할 수 있어야 한다.

## SEC-MOB-003 — Hardware-backed Key

**Priority:** SHOULD

모바일 Key Material 보호에 Hardware-backed Key 저장 기능을 활용할 수 있어야 한다.

## SEC-MOB-004 — Device Binding

**Priority:** SHOULD

다른 Device에 복사된 Capsule의 복호화를 차단할 수 있어야 한다.

```text
Original Device
→ PASS

Copied to Other Device
→ DENY
```

## SEC-MOB-005 — Biometric Unlock

**Priority:** SHOULD

Secure Vault 접근 시 Device 사용자 인증기능과 연계할 수 있어야 한다.

## SEC-MOB-006 — MOBILE_EXPORT Scope

**Priority:** SHOULD

`study:mobile-export` Scope가 없는 경우 Mobile Export를 허용해서는 안 된다.

## SEC-MOB-007 — Crypto-Shredding

**Priority:** SHOULD

암호화된 Capsule의 복호화 능력을 폐기할 수 있는 구조를 지원해야 한다.

## SEC-MOB-008 — QR Security

**Priority:** SHOULD

QR에는 다음을 포함하지 않는다.

```text
DICOM
PHI
DEK
KEK
Password
Long-lived Credential
```

QR은 Transfer Request Bootstrap 역할로 제한한다.

---

# 35. Productionization Security Requirements

다음 항목은 현재 P0 Security Gate가 아니다.

```text
Production IAM
Hospital SSO
Real Patient Identity Proofing
Enterprise PKI
Enterprise KMS / HSM
Production Secret Manager
24x7 SOC
Production SIEM
Production WAF
DR Security
Multi-region Security
Actual Hospital Security Assessment
Legal / Privacy Compliance Certification
```

Classification:

```text
PRODUCTIONIZATION
```

---

# 36. Explicit Security Non-Requirements

현재 P0에서 요구하지 않는다.

```text
Full Zero Trust Platform
Full SOC Platform
Full SIEM
Blockchain Security
DID
ZKP
Custom Cryptography
Full PQC Migration
Enterprise HSM
Production Hospital PKI
Real Patient Authentication Platform
```

---

# 37. Security Dependency Model

기본 Security Decision Flow:

```text
Identity
   ↓
Authentication
   ↓
Tenant Context
   ↓
Exchange Session
   ↓
Consent
   ↓
Authorization
   ↓
Transfer Grant
   ↓
Resource Access
   ↓
Audit
Provenance
Integrity
```

PACS Import:

```text
Authentication
      ↓
Authorization
      ↓
Consent
      ↓
Transfer Grant
      ↓
Destination Validation
      ↓
Patient Mapping
      ↓
STOW-RS
      ↓
Integrity Verification
      ↓
Audit
```

---

# 38. Security Traceability Matrix

| Security Requirement | Functional Requirement | Security Control           | Security Test   |
| -------------------- | ---------------------- | -------------------------- | --------------- |
| SEC-IAM-001          | REQ-AUT-001            | Actor Identification       | STC-IAM-001     |
| SEC-IAM-007          | REQ-PAT-004            | Missing destination mapping fails closed | `TC-PAT-003-DOM-002`, `TC-PAT-004-PER-001` (mock/domain); `AT-SEC-012` (PACS no-STOW pending) |
| SEC-IAM-008          | REQ-PAT-004            | Ambiguous destination mapping fails closed | `TC-PAT-003-DOM-003~004`, `TC-PAT-004-PER-002~003` (mock/domain); PACS no-STOW pending |
| SEC-IAM-009          | REQ-PAT-003            | Only explicitly validated synthetic mapping is eligible | `TC-PAT-003-DOM-001, DOM-005~006`, `TC-PAT-004-PER-002` (mock/domain only) |
| SEC-AUTHZ-001        | REQ-AUT-001            | Explicit Authorization     | `TC-AUT-001-CTX-001~005` (context shape only); policy tests remain AUT-002~004 |
| SEC-AUTHZ-002        | REQ-AUT-002            | Exact explicit-allow/default-deny evaluator | `TC-AUT-002-DD-001~005` |
| SEC-AUTHZ-003        | REQ-AUT-003            | Policy exception becomes deny | `TC-AUT-002-DD-006`, `TC-AUT-004-APP-001~004` (application); HTTP `TC-AUT-004-FC-001~004` pending |
| SEC-AUTHZ-012        | REQ-AUT-005            | Server-owned same-transaction evidence; minimum SELECT; fail-closed resource support | `TC-AUT-005-DB-001~007` (synthetic DB integration only) |
| SEC-CONSENT-001      | REQ-CON-003            | Consent Enforcement        | STC-CONSENT-001 |
| SEC-CONSENT-002      | REQ-CON-004            | Consent Withdrawal         | STC-CONSENT-002 |
| SEC-CONSENT-007      | REQ-CON-004            | Claim-bound withdrawal API, atomic Audit, exact UPDATE grant | `TC-CON-005-API-001~013` |
| SEC-CONSENT-008      | REQ-CON-006            | P0 Consent Action and exact Grant-scope validation | `TC-CON-006-AUTH-001~005` (pure policy only) |
| SEC-GRANT-002        | REQ-GRT-005            | Expiration                 | `TC-GRT-007-EXP-001~008` (pure policy/issuance TTL; protected-operation integration remains separate) |
| SEC-GRANT-003        | REQ-GRT-003            | Recipient Binding          | STC-GRANT-003   |
| SEC-GRANT-005        | REQ-GRT-004            | Scope Enforcement          | `TC-GRT-005-AUTH-001~008` (pure policy; route/side effects separate) |
| SEC-GRANT-007        | REQ-GRT-003/007        | Consent-bound verified Actor/Session/Package issue authorization | `TC-GRT-003-API-001~012`, `017~020` |
| SEC-GRANT-008        | REQ-GRT-007            | Actor-scoped idempotency, atomic Audit and exact column privileges | `TC-GRT-003-API-013~017`, `TC-GRT-003-DB-001~006` |
| SEC-GRANT-009        | REQ-GRT-008            | Exact recipient-only revocation, status/revoked_at update only, atomic one-time Audit | `TC-GRT-004-REV-API-001~012`, `TC-GRT-004-REV-DB-001~004` |
| SEC-TEN-001          | REQ-TEN-002            | Tenant Isolation           | STC-TEN-001     |
| SEC-API-002          | REQ-AUT-004            | Object Authorization       | `TC-AUT-003-OBJ-001~012` (policy); `AT-SEC-003` (HTTP integration pending) |
| SEC-API-005          | REQ-EXC-007            | Actor-scoped idempotent Exchange request creation | `TC-EXC-003-API-006~008`, `TC-EXC-003-DB-003~004`; concurrent HTTP case pending |
| SEC-DICOM-001        | REQ-DICOM-001          | QIDO Authorization         | STC-DICOM-001   |
| SEC-DICOM-002        | REQ-DICOM-002          | WADO Authorization         | STC-DICOM-002   |
| SEC-DICOM-003        | REQ-DICOM-003          | STOW Authorization         | STC-DICOM-003   |
| SEC-DICOM-006        | REQ-PACS-003/004       | Exact byte-preserving PatientID binding; durable RESULT_UNKNOWN/no-blind-retry and operation-time Consent/Grant fence prerequisites | `TC-PACS-001-PID-001/002` and `FENCE-001~005` internal sub-gates PASS; PACS-007 durable unknown/no-retry boundary PASS; product coordinator invocation/no-STOW/B-unchanged, endpoint/TLS enforcement, reconciliation and STOW NOT RUN |
| SEC-AUTHZ-008        | REQ-DWN-001            | Download Scope             | STC-DWN-001     |
| SEC-DICOM-004        | REQ-PACS-001           | PACS Precondition          | STC-PACS-001    |
| SEC-TLS-001          | REQ-SYS-001            | Encrypted Transport        | STC-TLS-001     |
| SEC-INT-001          | REQ-INT-001            | Integrity Verification     | `TC-INT-001-HASH-001~008` primitive PASS only; authorized source/destination verification NOT RUN |
| SEC-AUD-001          | REQ-AUD-001            | Security Audit             | `TC-AUD-002-EVENT-001~008` (verified Grant-denial pair only); `TC-GRT-003-API-013~018`; `TC-EXC-003-DB-005`; global `STC-AUD-001` pending |
| SEC-ERR-003          | REQ-ERR-004            | Fail Closed                | STC-ERR-003     |

상세 Acceptance Test는 `ACCEPTANCE-TESTS.md`에서 확정한다.

---

# 39. Security Gate Review

P0 Security Baseline은 다음 영역이 모두 정의되어야 한다.

```text
GATE-SEC-01 Identity / Authentication
GATE-SEC-02 Authorization
GATE-SEC-03 Consent Enforcement
GATE-SEC-04 Transfer Grant Security
GATE-SEC-05 Tenant Isolation
GATE-SEC-06 Patient Mapping Security
GATE-SEC-07 DICOMweb Security
GATE-SEC-08 Viewer Security
GATE-SEC-09 Download Security
GATE-SEC-10 PACS Import Security
GATE-SEC-11 Transport Security
GATE-SEC-12 Data Protection
GATE-SEC-13 Integrity
GATE-SEC-14 Audit / Logging
GATE-SEC-15 Secret / Token Security
GATE-SEC-16 Fail Closed
GATE-SEC-17 Negative Security Tests
GATE-SEC-18 Positive Security Tests
```

현재 문서 기준:

```text
GATE-SEC-01: PASS
GATE-SEC-02: PASS
GATE-SEC-03: PASS
GATE-SEC-04: PASS
GATE-SEC-05: PASS
GATE-SEC-06: PASS
GATE-SEC-07: PASS
GATE-SEC-08: PASS
GATE-SEC-09: PASS
GATE-SEC-10: PASS
GATE-SEC-11: PASS
GATE-SEC-12: PASS
GATE-SEC-13: PASS
GATE-SEC-14: PASS
GATE-SEC-15: PASS
GATE-SEC-16: PASS
GATE-SEC-17: DEFINED
GATE-SEC-18: DEFINED
```

---

# 40. Security Baseline Decision

```text
PROJECT:
MediQ

SECURITY REQUIREMENTS VERSION:
v1.1 Viewer Architecture Amendment

CURRENT SECURITY TARGET:
CAPSTONE P0 SECURITY VALIDATION

IDENTITY:
PASS

AUTHENTICATION:
PASS

AUTHORIZATION:
PASS

CONSENT ENFORCEMENT:
PASS

TRANSFER GRANT SECURITY:
PASS

TENANT ISOLATION:
PASS

PATIENT MAPPING SECURITY:
PASS

DICOMWEB SECURITY:
PASS

VIEWER SECURITY:
PASS

DOWNLOAD SECURITY:
PASS

PACS IMPORT SECURITY:
PASS

TRANSPORT SECURITY:
PASS

DATA PROTECTION:
PASS

TOKEN / SECRET SECURITY:
PASS

INTEGRITY:
PASS

AUDIT / LOGGING:
PASS

FAIL CLOSED:
PASS

NEGATIVE TESTS:
DEFINED

POSITIVE TESTS:
DEFINED

P1 MOBILE SECURITY:
DEFINED

PRODUCTION SECURITY:
SEPARATED

SECURITY ACCEPTANCE TESTS:
PLANNED — TO BE FINALIZED IN ACCEPTANCE-TESTS.md

SECURITY BASELINE READY:
YES
```

---

# 41. Security Quality Review

```text
Unique Security IDs:
PASS

Classification:
PASS

Priority:
PASS

Protected Assets:
PASS

Threat / Security Objective:
PASS

Expected Behavior:
PASS

Failure Behavior:
PASS

Testability:
PASS

Functional Requirement Traceability:
PASS

Security Test References:
PARTIAL
Reason:
Formal ACCEPTANCE-TESTS.md has not yet been created.

P0/P1 Separation:
PASS

Productionization Separation:
PASS

Synthetic/Test Data Boundary:
PASS

Legacy Auto-Migration:
NO

Security Scope Expansion:
NO
```

---

# 42. Next Document

다음 공식 산출물:

```text
DOMAIN-MODEL.md
```

목적:

```text
REQUIREMENTS
        +
SECURITY REQUIREMENTS
        ↓
Core Domain Entity
        ↓
Relationship
        ↓
Lifecycle
        ↓
Invariant
        ↓
Authorization Boundary
```

그 후:

```text
SYSTEM-ARCHITECTURE.md
```

를 작성한다.

---

# FINAL SECURITY POLICY

> **MediQ P0 Security는 실제 의료기관 상용 보안체계를 완성하는 것이 아니라, Synthetic/Test 환경에서 의료영상 Exchange에 필요한 핵심 접근통제·Tenant Isolation·Consent/Grant Enforcement·TLS·Integrity·Audit 통제가 실제 PASS/DENY Test로 검증 가능한 상태를 만드는 것을 목표로 한다.**

> **승인되지 않은 요청은 기본적으로 DENY하며, 보안 판단에 필요한 정보가 없거나 검증 자체가 실패한 경우 FAIL CLOSED를 적용한다.**

> **P1 Mobile Security와 Production Security는 P0 E2E 구현을 차단하지 않는다.**

---

# Viewer and Mobile Security Amendment — 2026-09-15

## SEC-VIEW-001 — Viewer Gateway Enforcement

모든 Hospital/Patient Cloud Viewer 요청은 Backend Authorization Gateway를 통과해야 하며 직접 PACS 접근은 거부해야 한다.

## SEC-VIEW-002 — Actor and Resource Binding

Viewer Session은 Actor Type, Actor ID, Tenant, PatientReference, Source Hospital, Study Reference, Grant 및 expiry에 binding되어야 한다.

## SEC-VIEW-003 — Backend-Only PACS Credential

PACS endpoint, credential, internal storage reference 및 raw upstream token은 Server-side Connector 경계 밖으로 노출해서는 안 된다.

## SEC-VIEW-004 — Short-Lived and Revocable Viewer Access

Viewer access는 short-lived여야 하며 Consent 철회, Grant revoke/expiry 또는 Session invalidation 후 재사용할 수 없어야 한다.

## SEC-VIEW-005 — Action Scope Isolation

`study:view`는 Viewer만 허용하며 Download, PACS Import, Mobile Export 권한으로 승격되어서는 안 된다.

## SEC-CACHE-001 — Ephemeral Cache Protection

임시 DICOM 객체는 전송 중·저장 중 암호화, Tenant/Session/Package/Study/Purpose binding, 승인된 크기 제한, TTL 및 Tenant-RLS 감사 가능한 purge evidence를 가져야 한다. P0 설계는 `PACS-001-DEC-007`이다. Optional same-WADO-chunk seam의 `STAGE-001`만 synthetic unit scope PASS이며 `STAGE-002~012`는 NOT RUN이다. 제품 경로는 전체 lifecycle 및 no-STOW 검증 전 활성화할 수 없다.

## SEC-CACHE-002 — Client and Intermediary Cache Control

Browser, CDN, reverse proxy, service worker 및 로그에 의료영상·환자정보가 불필요하게 보존되지 않도록 cache-control과 data minimization을 강제해야 한다.

## SEC-MOB-007 — Mobile Vault Encryption

P1 Mobile Vault 영상은 device-bound key로 암호화하며 승인된 앱 경계에서만 복호화해야 한다.

## SEC-MOB-008 — Mobile Local Access Control

Device Binding, 환자 인증 및 지원되는 경우 biometric unlock이 실패하면 Mobile Viewer 접근을 거부해야 한다.

## SEC-MOB-009 — Offline Copy Boundary

이미 Export된 offline Copy에 대한 revoke 한계를 명시하고 expiry, access disable 및 crypto-shredding 정책을 정의해야 한다.

모든 신규 보안 판단은 정보 부족 또는 upstream 검증 실패 시 Fail Closed를 적용한다.

**공통 기준:** Hospital PACS는 Source of Record다. MediQ Cloud는 Permanent PACS/장기 Archive가 아니며 P0 Cloud Viewer는 Source PACS DICOMweb의 온디맨드 데이터만 승인된 경로로 전달한다. Mobile Vault Local Viewer는 P1이다.

---

# P1 Mobile Security Policy Amendment — 2026-09-15

## SEC-MOB-010 — Platform Boundary

Android Native Secure Vault를 P1 Mobile MVP의 우선 구현 대상으로 한다. iOS Native Vault 미구현을 이유로 약한 공통 암호 구현을 도입해서는 안 되며, 공유 Capsule/Protocol은 플랫폼 독립적으로 유지한다.

## SEC-MOB-011 — Hardware-backed Admission and No Silent Downgrade

Persistent Vault를 허용하려면 검증된 Key Security Level이 Android `STRONGBOX` 또는 `TRUSTED_ENVIRONMENT`여야 한다. `SOFTWARE`, `UNKNOWN`, Attestation 검증 실패 또는 요구 속성 불일치 시 Mobile Export를 Fail Closed하고 Cloud Viewer로 유도한다. StrongBox 실패를 TEE로 전환하는 경우에도 실제 Security Level을 기록하고 정책상 허용 여부를 서버에서 검증한다.

## SEC-MOB-012 — Envelope Encryption and Crypto Agility

- Payload 기본 암호는 AES-256-GCM으로 한다.
- Capsule마다 무작위 DEK를 생성하고, Device KEK/Private Key는 OS Hardware-backed Keystore 밖으로 내보내지 않는다.
- DICOM은 Instance 또는 검증된 Chunk 단위로 인증 암호화하여 점진적 조회 성능을 확보한다.
- DEK는 승인된 짧은 Viewer Session에서만 메모리에 두고 평문 영상과 Pixel Buffer를 사용 후 제거한다.
- Crypto Suite, KDF/KEM 및 Key Wrap Metadata를 버전하고 복수 Wrap Slot을 지원한다.
- PQC 전환은 Payload 전체 재암호화가 아니라 DEK Wrap/Key Establishment 계층에서 수행하며 ML-KEM 계열 또는 승인된 Hybrid Suite를 수용한다.
- 검토되지 않은 자체 암호나 자체 프로토콜을 사용하지 않는다.

## SEC-MOB-013 — Offline Lease Enforcement

Offline Lease는 마지막 성공한 발급 또는 온라인 정책 검증 후 30일로 제한한다. 만료 시 네트워크가 없으면 Fail Closed하며 시스템 시각 되돌리기, 앱 데이터 복원 또는 Capsule 복제로 Lease를 연장할 수 없어야 한다. 온라인 상태에서는 Consent, Grant, Account 및 Device Revoke를 확인한 뒤에만 갱신한다.

## SEC-MOB-014 — Background and Local Session Protection

Background/Inactive 진입 즉시 Privacy Screen을 표시하고 렌더링을 중지하며 복호화된 Frame/Pixel Buffer를 제거한다. 60초 유예는 화면 노출 유예가 아니라 재인증 편의 유예다. OS 잠금, 60초 초과, 계정 전환, Device/Key 상태 변경, 생체정보 변경 또는 보안 이벤트 발생 시 Local Viewer Session을 폐기하고 재인증을 요구한다.

## SEC-MOB-015 — Capture Protection Boundary

Android Viewer는 Secure Window를 사용하여 Screenshot, 녹화 및 비보안 디스플레이 출력을 제한한다. iOS 후속 구현은 App Switcher Snapshot을 가리고 Capture/Mirroring 감지 시 Viewer를 중단한다. 플랫폼 통제가 일반 Screenshot 또는 외부 카메라 촬영을 완전히 차단한다고 주장하지 않으며 잔여 위험을 명시한다.

## SEC-MOB-016 — Lost Device, Reissue and No Key Escrow

분실 기기의 Device Binding과 향후 Lease 갱신은 Revoke해야 한다. Device Private Key, Vault KEK, 복호화 가능한 평문 Capsule 또는 장기 Cloud 원본을 복구 목적으로 보관해서는 안 된다. 새 기기 재발급은 현재 유효한 Patient Identity, Consent, Authorization 및 `study:mobile-export` Grant를 모두 다시 확인하고 Source PACS에서 새 Capsule을 생성해야 한다. 오프라인 분실 기기는 Lease 만료 전 즉시 차단을 보장할 수 없다는 위험을 수용·기록한다.

## SEC-MOB-017 — Standard Key Lifecycle

키 상태는 생성, 등록, 활성화, 사용, 회전, 폐기, 만료, 파기 및 감사 단계를 가져야 하며 NIST SP 800-57 계열 원칙을 따른다. 키 삭제 후 해당 키에만 의존하는 Capsule은 복호화할 수 없어야 한다. 회전 또는 PQC 전환은 가능한 경우 Payload를 다시 암호화하지 않고 DEK를 새로운 승인 Wrap Slot으로 재래핑한다.

P1 Capsule v1의 Recipient Set은 발급 후 Immutable로 취급한다. 동일 Device에 대한 Crypto-agility는 발급 시 복수 승인 Slot을 함께 생성하는 방식으로 검증하고, 새 Device는 기존 DEK Rewrap이 아니라 Source PACS 재조회와 새 Capsule 발급을 사용한다. 발급 후 In-place Rewrap은 별도 ADR과 재서명·ETag·Authorization·Audit 계약이 승인되기 전까지 허용하지 않는다.

## SEC-MOB-018 — Capsule Format Integrity, Resume and Atomic Commit

- Capsule v1은 `SECURE-MEDICAL-CAPSULE-FORMAT.md`의 고정 Header, Deterministic CBOR, Record Layout과 Allowlist Registry를 따라야 한다.
- AES-256-GCM은 256-bit DEK, 96-bit Nonce, 128-bit Tag와 규격의 64-byte AAD를 사용해야 한다.
- 같은 DEK/Nonce 조합을 재사용해서는 안 되며 Build 재시작 시 새 Capsule ID, DEK와 Nonce Prefix를 생성해야 한다.
- Header, Public Manifest와 Recipient Set은 승인된 COSE_Sign1 Signing Key로 인증하고, 각 Record는 Signed SHA-256 Directory와 AES-GCM Tag를 모두 검증해야 한다.
- Device DEK Wrap은 승인된 Profile만 사용하며 P1 HPKE P-256 Profile은 StrongBox/TEE Physical Device와 독립 구현 상호운용 Gate를 통과해야 한다.
- HTTP Resume는 강한 ETag, `If-Range`, Capsule ID, Content Version과 Record Boundary를 결합해야 하며 서로 다른 Representation의 Chunk를 혼합해서는 안 된다.
- Tag, Signature, Manifest 또는 반복 Hash 실패를 단순 Network Error로 처리해서는 안 된다.
- 모든 필수 검증 후 같은 File System의 Atomic Rename과 상태 Transaction이 완료되어야 `COMMITTED`로 표시할 수 있다.
- PQC/Hybrid Slot은 승인된 표준 Profile 없이는 생성해서는 안 되며 자체 Combiner를 금지한다.

## SEC-MOB-019 — Mobile API Authentication, Authorization and Contract Security

- Native Authentication은 Authorization Code + PKCE S256 Profile을 사용하고 Implicit 또는 Password Grant를 사용해서는 안 된다.
- Device Proof Key와 Capsule HPKE Wrap Key를 서로 다른 Hardware-backed Key로 생성·등록해야 한다.
- Device 등록 후 민감 API에는 RFC 9449 DPoP Profile 또는 별도 ADR로 승인된 동등 이상의 Sender-constrained 방식이 필요하다. 단순 Bearer Token과 Device ID 문자열만으로 Device Binding을 인정해서는 안 된다.
- Attestation Challenge는 사용자·Patient Context·Purpose·App Instance에 결합된 고엔트로피 1회용 값이며 짧은 만료시간과 Replay 방지를 가져야 한다.
- Android Key Attestation, Play Integrity, Key Security Level, Device Registration과 최종 Security Decision을 같은 증거로 취급해서는 안 된다.
- OAuth/API Scope, `study:mobile-export` 업무 Grant, Download Session Token과 Offline Lease를 서로 대체하거나 하나의 장기 Token으로 통합해서는 안 된다.
- Capsule Download Token은 대상 Capsule과 Device Proof Key에 결합된 짧은 수명이어야 하며 다른 Capsule/API에서 거부해야 한다.
- Manifest/Chunk API는 서명된 Capsule exact bytes를 전달하고 strong ETag, Content Version, Range/If-Range를 검증하여 다른 Representation의 Record 혼합을 차단해야 한다.
- Command API는 Actor/Device/Method/Path/Body에 결합된 Idempotency를 적용하고 같은 Key의 다른 Body 재사용을 거부해야 한다.
- Cross-patient/tenant/device Resource는 존재 여부가 노출되지 않도록 404를 사용할 수 있어야 한다.
- Offline Lease는 Capsule/Patient/Device/Grant/Policy Version에 서명 결합하고 최대 30일을 넘지 않아야 한다.
- Device Revocation과 Server Capsule Deletion은 Offline Device Local Data 삭제 완료를 의미하지 않으며 Response/Audit에서 이를 구분해야 한다.
- Mobile Audit Event는 `CLIENT_REPORTED`로 표시하고 서버가 인증 Context를 보강해야 하며 Client가 주장한 Actor/Tenant를 신뢰해서는 안 된다.

---

# Azure Security Recommendations — 2026-09-19

다음은 `POST-MVP` Azure Deployment Profile의 권고 통제이며, 승인된 P0 Security Requirement를 대체하거나 구현 완료를 의미하지 않는다.

## AZ-SEC-REC-001 — Workload Identity

Azure 내부 서비스는 Managed Identity를 우선하고 장기 Service Credential을 이미지, 소스 또는 `.env`에 포함하지 않는 것을 권고한다.

## AZ-SEC-REC-002 — Key Vault Boundary

Key Vault에는 Secret, 인증서, KEK 또는 key reference만 저장한다. DICOM Payload, plaintext DEK 및 환자 영상 원본을 저장하지 않는다.

## AZ-SEC-REC-003 — Temporary Blob

Temporary Blob은 저장 중·전송 중 암호화, Tenant/Session/Patient/Study binding, TTL, 크기 제한 및 purge evidence를 가져야 한다. Public access와 장기 Mobile Backup 사용은 금지한다.

## AZ-SEC-REC-004 — Hospital Connectivity

실제 병원 Connector 경계는 TLS 인증서 검증과 mTLS를 적용하고 Hospital Registry와 인증서 Identity를 binding하는 것을 권고한다. mTLS 또는 VPN은 Consent, Authorization, Transfer Grant 및 Tenant Isolation을 대체하지 않는다.

## AZ-SEC-REC-005 — Forwarded Certificate Trust

클라이언트 인증서 전달 헤더는 신뢰 가능한 ingress가 외부 입력을 제거하고 생성한 경우에만 사용한다. 애플리케이션은 인증서 체인, 만료, revocation 상태, 허용된 기관 및 Registry binding을 검증해야 한다.

## AZ-SEC-REC-006 — Database RLS

PostgreSQL RLS는 defense-in-depth로만 사용한다. transaction-scoped tenant context, pool reset, service-role bypass 제한, context 누락 시 Fail Closed 및 cross-tenant test가 없는 RLS 도입은 권고하지 않는다.

## AZ-SEC-REC-007 — Transfer Execution Credential

One-Time Transfer Token이 필요한 경우 Scoped Transfer Grant에서 파생된 단기 1회용 실행 자격 증명으로 제한한다. 독립적인 인가원으로 사용하지 않으며 Grant, Tenant, Patient, Study, Action, Destination, expiry 및 replay 방지 값에 binding한다.

## AZ-SEC-REC-008 — Cost and Operational Guardrail

Budget Alert, 로그 보존기간·수집량 제한, Quota 확인, IaC validation 및 teardown 절차를 배포 승인조건으로 권고한다. 가격·무료 한도는 변동 가능한 운영 정보이며 Normative Security Requirement로 고정하지 않는다.

---

# Synthetic Health Data Preview Security Amendment — 2026-09-26

## SEC-HHP-001 — Provider Allowlist

Capstone Build는 `MockHealthDataProvider`만 활성화하며 다른 Provider 선택, 실제 기관 Host 또는 운영 Base URL이 구성되면 Fail Closed해야 한다.

## SEC-HHP-002 — No Real Credential

건강정보 기관의 운영 Client Credential, Token, 인증서, Secret 또는 실제 사용자 인증정보를 Repository, Build, Fixture, 로그 또는 Screenshot에 포함해서는 안 된다.

## SEC-HHP-003 — Synthetic Marker Enforcement

`TEST-*` Patient Reference, `sourceMode=SYNTHETIC`, `providerMode=MOCK`, 승인된 Fixture Version 중 하나라도 누락되거나 변조되면 Record 표시를 거부해야 한다.

## SEC-HHP-004 — Consent Separation

Mock Consent는 UX 시연 상태일 뿐이며 실제 Consent, Authorization Decision, Transfer Grant, Viewer Session, Mobile Export 또는 QR Handoff 권한으로 승격하거나 결합해서는 안 된다.

## SEC-HHP-005 — Non-Misrepresentation

모든 Preview 화면과 발표 캡처는 `DEMO MODE`, 합성 데이터, 실제 지정심사·운영 연계 미완료를 표시해야 한다. 공식 승인·연결로 오인시키는 문구, 기관 Logo, 인증 Badge를 금지한다.

## SEC-HHP-006 — Route Isolation

합성 건강기록은 PACS Import, DICOM Download, 의료진 공유 또는 실제 진료 Workflow로 전달할 수 없다.

## SEC-HHP-007 — Logging and Analytics

Preview Payload를 Analytics, Crash Report 또는 민감 로그에 기록하지 않는다. Audit는 `DEMO_*` Prefix와 `source_mode=SYNTHETIC`을 포함한다.

## SEC-HHP-008 — Reset and Retention

Preview 초기화 시 Session과 합성 Cache를 제거한다. 신규 장기 Cloud Health Record Store 또는 PostgreSQL Health Record Table은 별도 Productionization 승인 전 만들지 않는다.

## SEC-HHP-009 — Production Gate

실제 Provider 구현은 활용기관 지정심사, 테스트베드, 법률·개인정보 검토, 공식 API 계약, Identity/Consent 설계, Threat Model과 Acceptance Test 승인을 모두 거쳐야 한다.

## SEC-HHP-010 — Visual Evidence Integrity

UI Automation, Screenshot, 발표 영상과 자료집에서도 `DEMO MODE`, 합성 데이터, 실제 지정심사·운영 연계 미완료 표시를 유지해야 한다. Disclosure가 잘리거나 가려진 산출물을 실제 기능 증거로 사용해서는 안 된다.

상세 통제와 시험 연결은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.

## SEC-HHP-011 — Synthetic Lab Boundary

합성 혈액·항체검사 Fixture는 실제 환자번호, 실제 의료기관 OID·Logo·운영 기관명, 실검사 결과를 포함하지 않는다. `TEST-*`, `SYNTHETIC`, `MOCK` Marker 누락 시 표시를 거부한다.

## SEC-HHP-012 — No Clinical Route Escalation

합성 검사결과와 관련 영상 연결은 Preview 내부 탐색용이다. 실제 Consent, Authorization, Transfer Grant, 의료진 공유, Download 또는 PACS Import 권한으로 승격하지 않는다.

## SEC-HHP-013 — Result Confidentiality

합성이라도 검사값·참고범위·원문 판정은 실제 운영 설계와 동일하게 Notification, URL Query, Analytics, Crash Report와 비민감 로그에서 제외한다.

# Patient Experience Security Amendment — 2026-09-26

## SEC-PXE-COMMON-001 — Non-authoritative UX

카드, 알림, QR, Deep Link, 즐겨찾기, Cache와 클라이언트 상태는 접근권한이 아니다. 보호 자원 접근 직전에 서버가 Authentication, Tenant, Patient Mapping, Consent, Authorization, Action Scope와 만료를 재검증해야 한다.

## SEC-PXE-COMMON-002 — Minimum Disclosure

잠금화면, 오류, 행동센터, 지원 Bundle, URL, 로그에는 환자명, 진단, 검사 상세, DICOM UID, PACS Endpoint, Token, Credential, DEK/KEK를 포함하지 않아야 한다.

## SEC-PXE-COMMON-003 — Confirmed State

서버 확정 상태와 Destination Verification·Integrity PASS 전에는 완료를 표시하지 않는다. `RESULT_UNKNOWN`에서는 상태 조회만 허용하고 멱등성 보장 없이 작업을 반복하지 않는다.

## SEC-PXE-COMMON-004 — Projection Integrity

환자용 Audit·Action·Card Projection은 원본 원장과 Metadata를 수정하지 않는다. Tenant/Patient Binding, `stateVersion`, Allowlist, Cache 무효화와 무결성 검증을 적용한다.

## SEC-PXE-COMMON-005 — Future Clinical and Delegated Access

임상 문서는 영상과 별도 권한·무결성·Provenance를 가져야 하며 앱이 진단을 추론하지 않는다. 가족 위임은 관계 주장만으로 활성화하지 않고 독립 신원, 법적 Authority, 최소 Scope, 만료, 철회와 재인증을 요구한다. 두 기능은 POST-MVP Gate 전 비활성이다.

기능별 `SEC-PXE-*`와 Negative Test는 `patient-experience/PATIENT-EXPERIENCE-TRACEABILITY.md`를 따른다.

# Hospital Clinical Workflow Security Amendment — 2026-09-27

`SEC-HCW-001~015`는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md` §15를 정식 기준으로 사용한다. 핵심 통제는 다음과 같다.

1. 같은 Patient Reference는 과거 Study 접근권한이 아니며 Study별 `study:view`를 재검증한다.
2. Multi-study Viewer Session은 Actor, Tenant, Hospital, Purpose, 허용 Study 집합과 Expiry에 binding한다.
3. 인계 패킷은 Resource 유형별 Scope를 분리하고 Pixel·DICOM Payload를 저장하지 않는다.
4. Assignment는 책임 상태만 변경하며 수신자에게 Viewer·Download·PACS Import 권한을 부여하지 않는다.
5. Notification과 Deep Link는 최소정보만 포함하고 대상 열기 직전에 Object Authorization을 다시 수행한다.
6. P1 Role Claim은 신뢰된 Identity 경계와 Hospital Registry에 binding하고 Unknown/Disabled/Mismatch Role은 거부한다.
7. Timeline은 Audit·Provenance 원장을 수정하지 않는 Role-filtered Projection이어야 한다.
8. 판독문·의뢰서는 별도 권한·무결성·Provenance가 없으면 표시하지 않는다.
9. Cache와 Projection은 Actor/Tenant/Hospital/Resource/Version에 binding하고 철회·만료 시 무효화한다.
10. P1 장애나 Stale 상태는 P0 인가와 교환 상태를 변경하거나 우회해서는 안 된다.

위 통제의 Negative Test는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`에 정의되어 있으며 모두 `NOT RUN`이다.

# 37. PostgreSQL Credential and Role Isolation — 2026-09-29

## SEC-DB-001 — Bootstrap Credential Isolation

**Classification:** CAPSTONE-P0
**Priority:** MUST

PostgreSQL bootstrap/admin credential은 로컬 DB 초기화와 명시적으로 승인된 role provisioning에만 사용한다. API·Worker의 런타임 환경에 bootstrap credential을 주입하지 않는다.

**Acceptance:** `TC-ENV-008-DB-001`

## SEC-DB-002 — Runtime Least Privilege

**Classification:** CAPSTONE-P0
**Priority:** MUST

Application runtime은 전용 non-superuser role을 사용하고 `CREATEDB`, `CREATEROLE`, `BYPASSRLS` 또는 상속된 상위 role을 가져서는 안 된다. 현재 schema가 없는 환경에서는 runtime에 database `CONNECT`와 schema `USAGE`만 부여하고 DDL을 거부한다. 향후 각 migration에서 필요한 테이블 권한을 객체별로 명시적으로 부여하며 넓은 `ALTER DEFAULT PRIVILEGES`는 사용하지 않는다. Tenant 보안은 application/domain authorization 및 승인된 RLS 설계를 우회하지 않는다.

**Acceptance:** `TC-ENV-008-DB-002`, `TC-ENV-008-DB-003`

## SEC-DB-003 — Migration Role Separation

**Classification:** CAPSTONE-P0
**Priority:** MUST

Migration credential은 runtime 및 bootstrap credential과 달라야 하며 API·Worker에 주입하지 않는다. P0 개발 DB에서 migration role은 승인된 schema의 객체 변경에 필요한 최소 권한만 가진다. DB-level `CREATE`, `CREATEDB`, `CREATEROLE`, `SUPERUSER`, `BYPASSRLS`는 부여하지 않는다. 일회성 migrator는 명시적 `migration` profile 및 database 전용 내부 network에서만 실행하고, versioned SQL을 advisory lock과 migration별 transaction으로 적용하며, migration history를 migrator 소유 ledger에 기록한다. Migration 권한을 실제 schema/table에 적용할 때는 해당 migration과 권한 변경을 함께 검토하고 기록한다.

**Acceptance:** `TC-ENV-008-DB-004`, `TC-DB-001-MIG-001`–`TC-DB-001-MIG-007`

## SEC-DB-004 — Credential and Connection Validation

**Classification:** CAPSTONE-P0
**Priority:** MUST

필수 설정 누락, placeholder, 잘못된 runtime profile, DB URL과 전용 role/password/database 간 불일치, DB 인증 실패는 시작 또는 사전 검증을 실패시켜야 한다. 로컬 설정 파일은 Git에서 제외하고, 진단 출력에 비밀번호·URL 전체 또는 환경변수 값이 나타나지 않게 한다. 컨테이너 profile은 내부 서비스 DNS를 사용하며 DB host port를 열지 않는다.

**Acceptance:** `TC-ENV-008-DB-005`

DB-002는 registry schema의 승인된 FK/UNIQUE/CHECK/RESTRICT와 secret-column 부재를 synthetic test로 확인했다(`TC-DB-002-REG-001~008`). DB-003은 PatientReference/Mapping schema의 approved status·FK·unique constraints와 rollback을 synthetic-only로 확인했다(`TC-DB-003-REG-001~008`). 두 결과 모두 runtime table privilege, Tenant RLS, 실제 mapping authorization, API 연결 및 SQL injection 검증을 포함하지 않으며, 해당 내용은 제품 DB/API 업무 Ticket에서 별도 시험한다.

## SEC-DB-005 — Explicit Runtime Object Privileges

**Classification:** CAPSTONE-P0
**Priority:** MUST

Runtime 로그인은 schema owner/migration owner가 아니며 database/schema DDL, role creation, `BYPASSRLS`, inherited elevated role, `PUBLIC` 업무 table grants 또는 포괄적인 future default grants를 가져서는 안 된다. 각 업무 Ticket은 필요한 table/column 및 `SELECT`/`INSERT`/`UPDATE`/`DELETE` 중 실제 명령만 명시적으로 부여한다. 기본은 무권한이며 privilege가 없거나 검증되지 않은 객체는 접근을 거부한다. `TRUNCATE`, `REFERENCES`, `TRIGGER`, sequence 사용은 별도 근거가 없으면 금지한다.

P0 `patient_refs` 예외는 DB-009 decision에서 승인한 합성 코드만 대상으로 한다. Runtime은 승인 컬럼의 `SELECT`·`INSERT`만 가지며 DB CHECK도 `MQ-TEST-*` pattern을 강제한다. `UPDATE`·`DELETE`·`TRUNCATE`와 public API 노출은 금지한다. 이 global synthetic namespace에 RLS가 적용된다고 주장하지 않는다.

`PAT-002-DEC-002`는 기존 `patient_mappings` 8개 승인 컬럼(`mapping_id`, `patient_ref_id`, `hospital_id`, `local_patient_id`, `status`, `validated_at`, `created_at`, `updated_at`)에 대한 `SELECT`만 허용한다. 내부 reader는 IAM-002 verified active `USER`와 같은 Tenant/Hospital transaction을 요구하고 verified Hospital predicate만 사용한다. `INSERT`·`UPDATE`·`DELETE`·`TRUNCATE`·DDL, `PUBLIC`/default/table-wide grants 및 API route는 금지한다. 이 범위는 합성 mapping read에 한정되고, patient identity proof·role-based capability·영상 열람/다운로드/전송 권한을 주지 않는다. 정확한 catalog, RLS, cross-Hospital/Tenant denial 및 write denial은 `TC-PAT-002-DB-001`에서 별도로 검증한다.

`EXC-003-DEC-001`은 `exchange_sessions`의 정확한 12개 승인 컬럼에 `SELECT`와 `INSERT`만, `audit_events`의 정확한 12개 승인 컬럼에 `INSERT`만 부여한다. Exchange 생성 Audit은 Session 생성과 같은 verified IAM-002 Tenant transaction에서 저장하며 Audit 실패 시 둘 다 rollback한다. 다른 Session/Audit 컬럼, table-wide privilege, `UPDATE`·`DELETE`·`TRUNCATE`·DDL, `PUBLIC`/default grant는 부여하지 않는다. 현재 `mediq_runtime` column-privilege inventory는 승인된 전체 목록과 정확히 100행이어야 한다. Session 생성 API는 활성 합성 PatientReference와 목적지 병원 verified `USER` membership에만 한정되고 영상 접근 권한은 만들지 않는다.

**Acceptance:** `TC-DB-009-PRIV-001~006`, `TC-EXC-003-DB-001~006`

## SEC-DB-006 — Tenant Row-Level Security and Transaction Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

Tenant 소유/참여에 따라 보호되는 P0 업무 테이블은 RLS를 `ENABLE` 및 `FORCE`하고 명시적 policy가 없거나 tenant context가 없으면 접근을 허용하지 않는다. Tenant이 직접 저장되지 않은 행은 승인된 Hospital 또는 Exchange 관계를 통해 Tenant를 도출한다. legitimate A↔B Exchange 행은 해당 Session의 source/destination 참여 Tenant 범위에 한해 RLS에서 보일 수 있으며, 제3 Tenant는 보이지 않아야 한다.

인증된 요청의 Tenant는 검증된 Actor/Identity에서 서버가 확정한다. 클라이언트가 전달한 tenant ID를 권위 있는 값으로 사용하지 않는다. DB 접근은 transaction wrapper 안에서 tenant context를 transaction-local로 설정하고, 모든 쿼리·commit/rollback이 같은 transaction을 사용한다. context 설정 실패, 누락, 빈값 또는 잘못된 값은 fail closed하고 connection pool 재사용 시 이전 Tenant 값이 남지 않게 한다.

RLS는 업무 Authorization을 대체하지 않는다. custom GUC 기반 context는 빠진 predicate와 pool 누수를 완화하는 defense-in-depth이며, 같은 런타임 role에서 임의 SQL을 실행하는 공격자의 context 변경까지 방지하는 인증수단으로 간주하지 않는다. Parameterized query, 입력검증, Authorization Engine 및 SQL injection negative tests를 함께 유지한다. Production/실환자 release는 signed DB context 또는 동등한 stronger binding의 별도 검토를 요구한다.

전역 canonical `patient_refs`는 병원 간 동일 PatientReference를 연결하기 위해 Tenant 소유 행이 아닌 P0 synthetic-only namespace로 유지한다. 이 테이블은 SEC-DB-005의 제한된 grant와 synthetic DB CHECK로 보호한다. 실제 환자 정보/인구학 데이터 또는 patient-ref API를 추가하기 전에는 별도 scope·privacy·authorization 결정, 데이터 모델 검토 및 acceptance가 필수다.

**Acceptance:** `TC-DB-009-RLS-001~009`, `TC-DB-009-AUTH-001~004`

## SEC-TEN-005 — Database Tenant Context Is Not Business Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

Database RLS에서 row가 보이더라도 보호행위는 자동 허용되지 않는다. Backend는 Actor, Tenant, Hospital, ExchangeSession, Consent, TransferGrant, 정확한 Resource/Scope, Action, Recipient/Destination, 상태와 expiry를 별도로 평가한다. client-supplied IDs/claims, session existence 또는 RLS visibility alone은 권한이 아니다. Cross-Tenant는 명시적으로 승인된 Exchange 범위만 허용하고 제3 Tenant는 거부한다. PACS side effect는 Mandatory Preflight 이후에만 허용한다.

**Acceptance:** `TC-DB-009-AUTH-001~004`; 기존 `SEC-AUTHZ-*`, `SEC-GRANT-*`, `SEC-TEN-001~003` tests

## SEC-AUTHZ-010 — Authenticated Tenant Context Resolution

**Classification:** CAPSTONE-P0
**Priority:** MUST

Tenant/Actor context는 검증된 authentication credential과 trusted registry/membership mapping으로 서버가 확정한다. Request body, query, arbitrary header, UUID, Hospital ID 또는 Viewer URL에서 권한 context를 직접 채택하지 않는다. 선택 tenant가 인증된 identity의 membership과 불일치하면 거부한다. 인증 context가 없거나 검증 서비스가 실패하면 fail closed한다.

**Acceptance:** `TC-IAM-002-CTX-001~004`, `TC-IAM-002-DB-001`, `TC-IAM-002-TX-001~003`; HTTP/business API enforcement는 `MEDIQ-IAM-001~003` 및 `MEDIQ-AUT-*`에서 별도 검증한다. 기존 `TC-DB-009-AUTH-001~002`는 보호 업무 endpoint Acceptance로 유지한다.

## SEC-AUTHZ-011 — Authorization Before Persistence or Side Effect

**Classification:** CAPSTONE-P0
**Priority:** MUST

모든 보호된 DB read/write 또는 DICOM side effect 전에 서버의 업무 Authorization을 수행한다. DB RLS는 tenant row visibility의 추가 경계이고 Consent, Grant, scope/action, object ownership 또는 Mandatory Preflight의 decision point가 아니다. Authorization failure, dependency failure, stale/missing state는 deny-by-default로 처리하며 client에 내부 DB/정책 상세를 노출하지 않는다.

**Acceptance:** `TC-DB-009-AUTH-003~004`; 기존 `TC-SEC-*`, `TC-FUNC-*`, `TC-E2E-*`

# 38. Internal Operational Health Endpoints — 2026-09-29

## SEC-OPS-HEALTH-001 — Liveness and Readiness Disclosure Boundary

**Classification:** CAPSTONE-P0
**Priority:** MUST

GET /api/v1/health/live는 API process liveness만, GET /api/v1/health/ready는 runtime-role SELECT 1 및 설정된 Test Orthanc A/B의 authenticated /system reachability만 평가한다. 두 응답은 민감정보를 포함하지 않고 Cache-Control: no-store를 사용한다. Readiness failure는 고정된 generic 503 {"status":"not_ready"}만 반환하며 exception, host, endpoint, dependency 이름, version, credential 또는 환자·DICOM 정보를 노출하지 않는다. Liveness는 dependency 실패와 무관하게 process가 응답 가능하면 성공한다.

두 경로는 local Compose internal network에서만 허용해야 한다. Host port, public ingress 또는 사용자용 UI를 통해 노출하지 않는다. dependency probe는 각각 최대 1.5초로 제한하고 실패 시 fail closed한다. Health probe는 업무 감사 이벤트를 생성하지 않으며 로그에 URL, credential, response body를 남기지 않는다.

**Acceptance:** TC-ENV-009-HEALTH-005~008

---

# P0 Operation-bound Pending Provenance Security Amendment — 2026-10-01

`PROV-001-DEC-001` requires each PACS_IMPORT Provenance row to bind to one durable PACS operation by a restrictive foreign key and unique operation reference. A first-time row is permitted only before external dispatch (`CREATED` or `PREFLIGHT_PASSED`), and its result must remain `PENDING` in this scope. Source, destination, Session, Package and Study bindings must be derived from persisted server-side records in the same verified Tenant transaction, never accepted as caller-selected identity. Forced Tenant RLS and exact SELECT/INSERT column privileges apply; no update/delete privilege is granted by this Ticket.

This record does not itself authorize image access, prove PACS dispatch, completion, destination verification or integrity. No HTTP route, PACS call, STOW or no-Tenant Audit synthesis is permitted by this amendment. A missing late Provenance row must fail closed rather than be backfilled after dispatch could have begun.

**Acceptance:** `TC-PROV-001-001~010`; `MEDIQ-PROV-001`. Full `AT-PROV-001` and the P0 security/E2E gates remain separate.
