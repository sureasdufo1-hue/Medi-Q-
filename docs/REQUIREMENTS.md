# MediQ Requirements Specification

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `REQUIREMENTS.md`
**Version:** v1.10 PACS Import Identity and Retry Preconditions
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ 프로젝트에서 구현해야 할 **기능 및 시스템 요구사항을 검증 가능한 형태로 정의**한다.

본 문서는 새로운 제품 방향이나 Architecture를 제안하는 문서가 아니다.

## 1.1 추가 요구사항 묶음

- 편의 확장 요구사항은 `docs/patient-experience/PATIENT-CONVENIENCE-EXPANSION-SPEC.md`의 `REQ-PXE-CX-001~013`을 따른다.
- AI 질문자료 요구사항은 `docs/patient-experience/EXTERNAL-LLM-QUESTION-PACK-SPEC.md`의 `REQ-AIQ-001~008`을 따른다.
- P1 Prototype은 합성 자료 Preview와 Local Copy만 허용한다. 실제 환자자료 또는 외부 LLM 네트워크 전송은 구현 요구사항이 아니며 Production Gate 전 `DENY`한다.
- 신규 Timeline·검색·정정·방문꾸러미 API는 현재 GAP이고, 승인된 `OPENAPI.yaml`을 우회해 구현하지 않는다.

## 1.2 Synthetic RAG 요구사항 묶음

- `docs/ai/SYNTHETIC-PATIENT-EXPLANATION-RAG-SPEC.md`의 `REQ-RAG-001~020`을 적용한다.
- RAG는 합성 Record와 Local Approved Knowledge Pack에만 동작하며 Citation 없는 설명을 허용하지 않는다.
- 진단·처방·영상판독·응급도·예후 예측 요청은 답변하지 않는다.
- 현재 `OPENAPI.yaml`에는 RAG Endpoint가 없으며 Local Prototype 경계를 넘어 구현하지 않는다.

다음 상위 문서에서 확정된 사항을 Requirement로 구체화한다.

```text
PROJECT-CHARTER.md
        ↓
CAPSTONE-MVP-BOUNDARY.md
        ↓
PRODUCT-BASELINE.md
        ↓
REQUIREMENTS.md
```

본 문서의 최종 목적은 개발자가 추가적인 제품 해석 없이 다음을 판단할 수 있도록 하는 것이다.

```text
무엇을 구현해야 하는가?

무엇은 구현하면 안 되는가?

어떤 조건에서 PASS인가?

어떤 조건에서 DENY해야 하는가?

P0 완료를 무엇으로 판단하는가?
```

---

# 2. Scope

현재 MediQ의 최우선 목표는 다음 P0 End-to-End 흐름을 구현하고 검증하는 것이다.

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
 ┌──────┼───────────┐
 ▼      ▼           ▼
VIEW  DOWNLOAD   PACS_IMPORT
                    ↓
             Hospital B
             Test Orthanc
```

추가적으로 다음을 P0에서 검증한다.

```text
Tenant Isolation
Audit
Provenance
Integrity Verification
Failure Handling
E2E Test
```

---

# 3. Normative References

문서 우선순위는 다음과 같다.

```text
1. PROJECT-CHARTER.md
2. CAPSTONE-MVP-BOUNDARY.md
3. PRODUCT-BASELINE.md
4. REQUIREMENTS.md
5. SECURITY-REQUIREMENTS.md
6. DOMAIN-MODEL.md
7. SYSTEM-ARCHITECTURE.md
8. DATA-MODEL / OPENAPI
9. ACCEPTANCE-TESTS.md
10. IMPLEMENTATION-PLAN.md
11. CODE
12. LEGACY HIGHPASS
```

하위 문서는 상위 문서의 Scope를 임의로 변경할 수 없다.

---

# 4. Requirement Convention

Requirement ID 형식:

```text
REQ-<DOMAIN>-NNN
```

Domain Code:

| Code  | Domain                      |
| ----- | --------------------------- |
| SYS   | System / Common             |
| ORG   | Organization / Hospital     |
| PAT   | Patient Reference / Mapping |
| EXC   | Exchange Session            |
| CON   | Consent                     |
| AUT   | Authorization               |
| GRT   | Transfer Grant              |
| IMG   | Imaging Package             |
| DICOM | DICOM / DICOMweb            |
| VIEW  | Web Viewer                  |
| DWN   | DICOM Download              |
| PACS  | PACS Import                 |
| TEN   | Tenant                      |
| AUD   | Audit                       |
| PROV  | Provenance                  |
| INT   | Integrity                   |
| DATA  | Data / Test Environment     |
| ERR   | Error Handling              |
| OBS   | Observability               |
| MOB   | Mobile Secure Vault         |

---

# 5. Requirement Classification

모든 Requirement는 다음 중 하나로 분류한다.

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

P0 완료에 필요한 Requirement는 원칙적으로 `MUST`다.

---

# 6. System Context Requirements

## REQ-SYS-001 — P0 E2E 환경

**Classification:** CAPSTONE-P0
**Priority:** MUST

**Requirement**

시스템은 Hospital A Test Orthanc, MediQ 및 Hospital B Test Orthanc로 구성된 E2E 테스트 환경에서 실행 가능해야 한다.

**Expected Behavior**

```text
Hospital A
→ MediQ
→ Hospital B
```

의 전체 흐름이 하나의 테스트 환경에서 검증 가능해야 한다.

**Failure Behavior**

핵심 Component 중 하나가 동작하지 않아 E2E 검증이 불가능하면 P0 완료로 판단하지 않는다.

**Acceptance:** `TC-SYS-001-PLANNED`
**Traceability:** Product Baseline → P0 Product Scope

---

## REQ-SYS-002 — Synthetic/Test Data 전용

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템의 Capstone 환경에서는 실제 환자 개인정보 및 실제 의료기관 운영 데이터를 사용해서는 안 된다.

허용:

```text
Synthetic Patient
Test Patient ID
Sample DICOM
Synthetic CT/MRI
승인된 비식별 Test Dataset
```

금지:

```text
Real Patient PII
실제 진료기록
실제 운영 PACS DICOM
Production Credential
```

**Acceptance:** `TC-DATA-001-PLANNED`
**Traceability:** CAPSTONE-MVP-BOUNDARY → Data Policy

---

## REQ-SYS-003 — P0/P1 격리

**Classification:** CAPSTONE-P0
**Priority:** MUST

P1 기능의 미구현 또는 장애가 P0 의료영상 교환 E2E 실행을 차단해서는 안 된다.

**Acceptance:** `TC-SYS-003-PLANNED`
**Traceability:** Product Baseline → Mobile Is an Extension

---

# 7. Organization / Hospital Requirements

## REQ-ORG-001 — Source/Destination 식별

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템은 Source Hospital과 Destination Hospital을 독립적인 Hospital 객체로 식별해야 한다.

**Acceptance:** `TC-ORG-001-PLANNED`
**Traceability:** Product Baseline → Hospital

---

## REQ-ORG-002 — Tenant 연결

**Classification:** CAPSTONE-P0
**Priority:** MUST

각 Hospital은 하나 이상의 Tenant Context와 연결되어야 한다.

**Acceptance:** `TC-ORG-002-PLANNED`

---

## REQ-ORG-003 — DICOMweb Endpoint

**Classification:** CAPSTONE-P0
**Priority:** MUST

Hospital 객체는 P0에서 필요한 DICOMweb Endpoint 정보를 참조할 수 있어야 한다.

최소 대상:

```text
QIDO-RS
WADO-RS
STOW-RS
```

**Acceptance:** `TC-ORG-003-PLANNED`

---

# 8. Patient Reference & Mapping Requirements

## REQ-PAT-001 — MediQ Patient Reference

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템은 병원의 Local Patient ID와 별개의 MediQ Patient Reference를 사용해야 한다.

```text
Hospital Local ID
≠
MediQ Patient Reference
```

**Acceptance:** `TC-PAT-001-DOM-001~002`, `TC-PAT-001-PER-001~003`, `TC-PAT-001-SEC-001`
**Traceability:** Product Baseline → Patient Reference

---

## REQ-PAT-002 — Source Patient Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템은 Source Hospital의 Local Patient ID와 MediQ Patient Reference 간 Mapping을 유지해야 한다.

P0에서는 합성 `MQ-TEST-*` PatientReference와 `^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$` 형식(총 128자 이하)의 합성 Hospital Local Patient ID만 사용한다. Mapping은 해당 Hospital에 속한 관계로 저장하며, Tenant는 Hospital Registry 관계에서 도출한다. 요청이 전달한 Tenant/Actor/Hospital 값은 권한 근거가 아니다. `VALID` 상태는 P0 합성 fixture에서 명시적으로 승인된 매핑 상태일 뿐 실제 환자 본인확인이나 의료기관 대조를 의미하지 않는다.

이 요구사항은 저장소 구현을 의미하며 인증·인가 없는 공개 CRUD API를 허용하지 않는다. `PAT-002-DEC-002`에 따라 `mediq_runtime`에는 기존 승인 8개 컬럼의 `SELECT`만 부여하고, 활성 IAM-002 `USER` membership의 verified Tenant/Hospital transaction 안에서 같은 Hospital mapping을 읽는 내부 경로만 허용한다. 요청 Hospital이 verified Hospital과 다르면 mapping query 전에 거부하고 조회에는 verified Hospital ID를 사용한다. 이 제한은 mapping read에만 해당하며 PatientMapping write, role-based administration, Controller/API route, 실제 환자정보·영상 열람 또는 PACS 행위는 허용하지 않는다. 별도 HTTP/API Gate가 통과하기 전까지 Tenant-bound route는 금지한다. `VALID` 상태나 이 mapping read 자체는 환자 신원 증명, 임상 동일인 판정 또는 영상 업무 Authorization이 아니다.

**Acceptance:** `TC-PAT-002-GATE-001`, `TC-PAT-002-DOM-001~002`, `TC-PAT-002-PER-001~002`, `TC-PAT-002-TEN-001~002`, `TC-PAT-002-SEC-001~003`

---

## REQ-PAT-003 — Destination Patient Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

PACS_IMPORT을 위한 Mandatory Preflight에서 서버가 해석한 MediQ Patient Reference와 Destination Hospital의 binding에 맞는 PatientMapping 후보를 확인해야 한다. Mapping 자체가 `VALID`이고 검증 시각이 있어야 적격 판정을 받을 수 있다. 이 요구사항은 Consent·Authorization·TransferGrant 검증이나 Import 허가를 대체하지 않는다.

**Acceptance:** `TC-PAT-003-DOM-001~008` (순수 Domain 판정만; HTTP·DB 조회·PACS Import는 별도 Gate)

---

## REQ-PAT-004 — Missing Mapping 처리

**Classification:** CAPSTONE-P0
**Priority:** MUST

필요한 Destination Patient Mapping이 존재하지 않는 경우 시스템은 임의의 Patient에 의료영상을 전송해서는 안 된다.

**Failure Behavior**

```text
Mapping Missing
→ PACS_IMPORT DENY
```

또는 명시적인 Mapping 절차를 요구해야 한다.

**Acceptance:** `TC-PAT-003-DOM-002~006` (Domain denial only); `TC-PAT-004-PER-001~005` (mocked repository-to-domain denial only); `AT-SEC-012` PACS no-STOW integration remains pending under `MEDIQ-PACS-004`

---

## REQ-PAT-005 — Synthetic Identity 한정

**Classification:** CAPSTONE-P0
**Priority:** MUST

현재 Patient Mapping 기능은 Synthetic/Test Identity만 대상으로 해야 하며 실제 환자 본인확인을 구현 완료한 것으로 취급해서는 안 된다.

**Acceptance:** `TC-PAT-005-PLANNED`

---

# 9. Exchange Session Requirements

## REQ-EXC-001 — Session 생성

**Classification:** CAPSTONE-P0
**Priority:** MUST

새로운 의료영상 교환 요청마다 고유한 Exchange Session을 생성해야 한다.

**Acceptance:** `TC-EXC-001-DOM-001~002`; `AT-FUNC-001`; `TC-EXC-003-API-001~012`; `TC-EXC-003-DB-001~006`

---

## REQ-EXC-002 — Session Core Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session은 최소 다음 정보를 참조할 수 있어야 한다.

```text
session_id
patient_ref
source_hospital
destination_hospital
state
created_at
```

**Acceptance:** `TC-EXC-001-DOM-001, TC-EXC-001-DOM-003~004`; `AT-FUNC-001`; `TC-EXC-003-API-001~012`

---

## REQ-EXC-003 — Consent 연결

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session은 해당 Session에 적용되는 Consent Artifact와 연결될 수 있어야 한다.

**Acceptance:** `TC-EXC-003-PLANNED`

---

## REQ-EXC-004 — Imaging Package 연결

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session과 실제 의료영상 Payload인 Imaging Package는 별도 객체로 관리하면서 서로 연결되어야 한다.

**Acceptance:** `TC-EXC-004-PLANNED`

---

## REQ-EXC-005 — Session State

**Classification:** CAPSTONE-P0
**Priority:** MUST

시스템은 Exchange Session 상태를 최소 다음 Lifecycle을 표현할 수 있도록 관리해야 한다.

```text
REQUESTED
CONSENT_PENDING
CONSENTED
AUTHORIZED
READY
ACTIVE
COMPLETED
REJECTED
EXPIRED
REVOKED
FAILED
CANCELLED
```

**Acceptance:** `TC-EXC-005-DOM-001~004`; API/persistence workflow enforcement remains gated and separately planned

---

## REQ-EXC-006 — Terminal State 제한

**Classification:** CAPSTONE-P0
**Priority:** MUST

`COMPLETED`, `REJECTED`, `EXPIRED`, `REVOKED`, `FAILED` 등 종료 상태의 Session에서 허용되지 않은 신규 접근 또는 전송을 수행해서는 안 된다.

**Acceptance:** `TC-EXC-006-PLANNED`

---

## REQ-EXC-007 — Exchange 생성 재시도 멱등성

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange 생성 API는 verified requester Actor에 묶인 필수 UUID `Idempotency-Key`를 받아야 한다. 같은 Actor와 key, 같은 요청의 재시도는 기존 Session 결과를 반환하고, 같은 key를 다른 요청 내용에 재사용하면 고정 Conflict로 거부해야 한다. Correlation ID는 idempotency 보장으로 취급하지 않는다.

**Acceptance:** `TC-EXC-003-API-006~008`, `TC-EXC-003-DB-003~004`

---

# 10. Consent Requirements

## REQ-CON-001 — Consent Artifact

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent를 단순 Boolean 값이 아닌 독립적인 Artifact로 관리해야 한다.

**Acceptance:** `TC-CON-001-DOM-001~002`, `TC-CON-001-DOM-008` (domain shape only; no consent/authorization approval)

---

## REQ-CON-002 — Consent Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent Artifact는 최소한 다음 Context와 연결 가능해야 한다.

```text
patient_ref
exchange_session
source
destination
resource_scope
allowed_action
status
timestamp
```

**Acceptance:** `TC-CON-001-DOM-003~007` (context/action/resource/version/time shape only)

---

## REQ-CON-003 — No Consent Deny

**Classification:** CAPSTONE-P0
**Priority:** MUST

유효한 Consent가 없는 Exchange Session에서 의료영상 Access 또는 Transfer Grant를 허용해서는 안 된다.

```text
NO CONSENT
→ DENY
```

**Acceptance:** `TC-CON-008-AUT-001~003` verifies missing-Consent denial at the internal synthetic PostgreSQL evidence-reader→Authorization-gated operation boundary for the three P0 actions; it does not verify a Grant issuance API or product HTTP/image route. Grant-issuance denial remains a separate open gate. `TC-CON-004-API-001~010` covers only the synthetic technical approval state transition.

---

## REQ-CON-004 — Consent Withdrawal 구조

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent Artifact는 최소한 동의 철회 상태를 표현할 수 있어야 한다.

**Expected Behavior**

철회된 Consent를 근거로 신규 Grant를 발급해서는 안 된다.

**Acceptance:** `AT-FUNC-007`; `TC-CON-005-API-001~013` (synthetic claim-bound API and atomic Audit only); `TC-CON-008-AUT-004~006` verifies that a still-ACTIVE linked Grant cannot pass the internal protected-operation boundary after Consent withdrawal. Grant issuance and product HTTP/image paths remain separate gates; no legal-consent or remote-recall claim is made.

---

## REQ-CON-005 — Technical Consent Boundary

**Classification:** CAPSTONE-P0
**Priority:** MUST

현재 Consent 기능은 Technical Workflow PoC로 취급하며 실제 법적 동의 효력 완료 상태로 표시해서는 안 된다.

**Acceptance:** `TC-CON-001-DOM-008` (technical artifact boundary only; UI/API legal consent status remains a separate gate)

---

## REQ-CON-006 — P0 Consent Allowed Action Boundary

**Classification:** CAPSTONE-P0
**Priority:** MUST

P0 Authorization은 Consent의 `allowedActions`가 `VIEW`, `DOWNLOAD`, `PACS_IMPORT` 중 하나 이상의 고유하고 지원되는 값으로만 구성되었는지 확인해야 한다. 요청 Action은 Consent에 정확히 포함되어야 하며 Grant Scope는 `VIEW → study:view`, `DOWNLOAD → study:download`, `PACS_IMPORT → study:pacs-transfer`의 정확한 일대일 대응이어야 한다. `MOBILE_EXPORT`, 알 수 없는/중복 Action, 허용되지 않은 추가·불일치 Grant Scope가 evidence에 있으면 전체 Authorization 결과는 `DENY`한다.

이 기준은 P0 pure policy의 동작이며 HTTP 보호 경로, Grant 발급 endpoint 또는 PACS side effect가 구현·검증되었음을 뜻하지 않는다.

**Acceptance:** `TC-CON-006-AUTH-001~005` (pure Authorization policy only); HTTP/object integration remains `AT-SEC-003`.

---

# 11. Authorization Requirements

## REQ-AUT-001 — Explicit Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

의료영상 접근 전에 시스템은 Authorization 평가를 수행해야 한다.

평가 대상:

```text
Actor
Tenant
Session
Resource
Requested Action
Consent
Grant
```

**Acceptance:** `TC-AUT-001-CTX-001~005`

---

## REQ-AUT-002 — Allow/Deny 결과

**Classification:** CAPSTONE-P0
**Priority:** MUST

Authorization 평가 결과는 명시적인:

```text
ALLOW
DENY
```

중 하나로 결정되어야 한다.

**Acceptance:** `TC-AUT-002-DD-001~006`

---

## REQ-AUT-003 — Fail Closed

**Classification:** CAPSTONE-P0
**Priority:** MUST

필수 Authorization Context를 확인할 수 없는 경우 시스템은 기본적으로 접근을 거부해야 한다.

```text
Uncertain Authorization
→ DENY
```

**Acceptance:** `TC-AUT-004-APP-001~004` (application orchestration boundary) and `TC-AUT-004-FC-001~004` (HTTP/data/side-effect integration; separate and required before protected routes). The evaluator contract is separately `TC-AUT-002-DD-001~006`.

---

## REQ-AUT-004 — Object-Level Authorization

**Classification:** CAPSTONE-P0
**Priority:** MUST

객체 식별자를 알고 있거나 Tenant RLS에서 행을 볼 수 있다는 사실만으로 업무 Resource를 허용하지 않는다. Actor, Tenant, Hospital, Session, Patient, Source/Destination, Consent, Grant, Resource/Package, Action/Scope, 상태 및 만료의 server-resolved binding이 모두 요청과 일치해야 한다. 증거가 없거나 서로 모순되면 `DENY`한다.

**Acceptance:** `TC-AUT-003-OBJ-001~012` (pure policy contract); protected HTTP object-access `AT-SEC-003` remains an integration gate.

---

## REQ-AUT-005 — Trusted Authorization Evidence

**Classification:** CAPSTONE-P0
**Priority:** MUST

Authorization Policy의 Session, Consent/Action, TransferGrant/Scope, ImagingPackage 및 Resource facts는 서버 소유 persistence에서 검증된 Tenant transaction 안에서 조회해야 한다. Request body, query, header 또는 client-provided claims의 facts는 정책 근거로 신뢰하지 않는다. 조회 행이 없거나 binding이 불완전·모순되거나 조회에 실패하면 `DENY`한다. 현재 persistence가 parent binding을 증명하지 못하는 `SERIES`/`INSTANCE` 요청도 거부한다.

**Acceptance:** `TC-AUT-005-DB-001~007` (synthetic PostgreSQL/runtime-role integration); protected HTTP/BOLA remains a separate gate.

---

# 12. Transfer Grant Requirements

## REQ-GRT-001 — Scoped Grant

**Classification:** CAPSTONE-P0
**Priority:** MUST

Transfer Grant는 Resource 및 Action Scope가 제한된 권한 객체여야 한다.

**Acceptance:** `TC-GRT-001-DOM-001~010` (immutable synthetic P0 domain metadata only) and `TC-GRT-002-PER-001~008` (internal persistence/reconstitution only; scratch-only test privileges, no product issuance/Authorization claim)

---

## REQ-GRT-002 — P0 Scope

**Classification:** CAPSTONE-P0
**Priority:** MUST

P0에서 최소 다음 Scope를 구분해야 한다.

```text
study:view
study:download
study:pacs-transfer
```

**Acceptance:** `TC-GRT-001-DOM-005` (P0 scope shape) and `TC-GRT-002-PER-002/003` (persisted P0 scope round-trip only; no scope-to-action enforcement claim)

---

## REQ-GRT-003 — Recipient Binding

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant는 지정된 Recipient 이외의 Actor/Tenant가 사용할 수 없어야 한다.

```text
Hospital-B Grant
→ Hospital-C
→ DENY
```

**Acceptance:** `TC-GRT-003-API-001/003/004/005`; issue-time binding only. Protected operation authorization remains a separate Acceptance.

P0 issuance must bind the Grant to the verified destination Tenant/Hospital/Actor and to the Session requester. Recipient identity is derived from the verified context and Session, never accepted from request-body values. A Hospital-wide/null-Actor Grant is not issued by this endpoint.

---

## REQ-GRT-004 — Scope Enforcement

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant에 포함되지 않은 Action은 거부해야 한다.

```text
study:view
→ DOWNLOAD
→ DENY
```

**Acceptance:** `TC-GRT-005-AUTH-001~008` (pure shared object-authorization policy; see `GRT-005-DEC-001`; protected route and side-effect gates remain separate)

---

## REQ-GRT-005 — Expiration

**Classification:** CAPSTONE-P0
**Priority:** MUST

만료된 Grant를 사용한 접근은 거부해야 한다.

**Acceptance:** `TC-GRT-007-EXP-001~008` (PASS — strict server-time expiry policy and issuance cap; HTTP operation gates separate)

---

## REQ-GRT-006 — Grant Payload 제한

**Classification:** CAPSTONE-P0
**Priority:** MUST

Transfer Grant에 다음 민감정보를 직접 포함해서는 안 된다.

```text
DICOM Payload
DEK
KEK
Password
Hardware Key
```

**Acceptance:** `TC-GRT-006-PAY-001~004` (PASS — domain and controller response allowlist only; no DICOM/key storage)

---

## REQ-GRT-007 — Consent-bound Grant issuance

**Classification:** CAPSTONE-P0
**Priority:** MUST

Grant 발급은 `CONSENTED`·유효 Session, 정확히 결속된 ACTIVE·미철회·미만료 Consent, Consent action의 P0 scope 대응, 유효한 동일 Patient/Source/Session ImagingPackage, 검증된 목적지 Hospital의 Session requester를 모두 확인해야 한다. Grant는 non-null exact Package와 recipient Actor에 binding한다. Recipient와 expiry는 서버가 결정하며 TTL은 30분 이하이고 Session/Consent 만료를 넘지 않는다. 동일 Idempotency-Key의 동일 request는 같은 Grant를 재응답하고, 다른 request의 key 재사용은 conflict다. Parent/Scope와 Audit은 한 transaction에서 처리한다.

Grant 발급 성공 자체는 Viewer, Download 또는 PACS import 권한을 수행하지 않는다. 각 영상 작업은 이후 별도의 object/action Authorization 및 Preflight를 통과해야 한다.

**Acceptance:** `TC-GRT-003-API-001~020`; `TC-GRT-003-DB-001~006`.

**Execution evidence (2026-10-01):** All 26 scoped GRT-003 API/DB Acceptance cases passed. Verification: API 23 files/442 tests, API typecheck, migration consistency, DB-008 clean/reset-reapply signed-OIDC PostgreSQL/RLS integration twice (8/8 TAP each), exact runtime privilege inventory 144, and DB-002~007 regressions. This does not establish Viewer/Download/PACS operation authorization, revocation, or the full A→B E2E path; see [MEDIQ-GRT-003 evidence](implementation/MEDIQ-GRT-003/TEST-EVIDENCE.md).

---

## REQ-GRT-008 — Recipient-bound Grant revocation

**Classification:** CAPSTONE-P0
**Priority:** MUST

An ACTIVE TransferGrant must be revocable by its exact verified recipient USER Actor. The request must bind the authenticated Tenant, Hospital, Actor, route Session, and Grant; caller-supplied identity/state values are not authoritative. Revocation must remain available when Consent is withdrawn/expired, Session is terminal/expired, or the Grant expiry has elapsed, provided the Grant is still ACTIVE. It must set only `status=REVOKED` and server-generated `revoked_at`, preserve scopes and history, and write one success Audit atomically.

Repeating a successful revocation is an idempotent no-op: preserve the original `revoked_at`, return the current Grant, and create no duplicate success Audit. Concurrent requests must create at most one state transition and one success Audit. Revocation of EXPIRED/CONSUMED Grant states is a fixed conflict. This metadata transition does not guarantee recall of offline copies or terminate already-running Viewer/Download/PACS operations; those operations require their own status revalidation/fencing.

**Acceptance:** `TC-GRT-004-REV-API-001~012`; `TC-GRT-004-REV-DB-001~004`; `AT-FUNC-009`.

---

# 13. Imaging Package Requirements

## REQ-IMG-001 — Payload 분리

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session과 실제 의료영상 Payload를 별도로 관리해야 한다.

```text
Exchange Session
= Workflow

Imaging Package
= Imaging Payload
```

**Acceptance:** `TC-IMG-001-PLANNED`

---

## REQ-IMG-002 — DICOM Hierarchy

**Classification:** CAPSTONE-P0
**Priority:** MUST

Imaging Package는 최소 다음 DICOM 논리 구조를 표현할 수 있어야 한다.

```text
Study
Series
SOP Instance
```

**Acceptance:** `TC-IMG-002-PLANNED`

---

## REQ-IMG-003 — Session Association

**Classification:** CAPSTONE-P0
**Priority:** MUST

Imaging Package는 하나 이상의 Exchange Session에서 참조 가능한 구조 또는 명확한 Session 연결관계를 제공해야 한다.

**Acceptance:** `TC-IMG-003-PLANNED`

---

# 14. DICOM / DICOMweb Requirements

## REQ-DICOM-001 — Study Query

**Classification:** CAPSTONE-P0
**Priority:** MUST

MediQ는 Hospital A Test Orthanc에 대해 QIDO-RS 기반 Study 조회를 수행할 수 있어야 한다.

**Acceptance:** `TC-DICOM-001-PLANNED`

---

## REQ-DICOM-002 — Study Retrieval

**Classification:** CAPSTONE-P0
**Priority:** MUST

MediQ는 승인된 Test Study의 의료영상 Payload를 WADO-RS 또는 Baseline에서 허용된 DICOMweb 방식으로 조회할 수 있어야 한다.

**Acceptance:** `TC-DICOM-002-PLANNED`

---

## REQ-DICOM-003 — Destination Store

**Classification:** CAPSTONE-P0
**Priority:** MUST

MediQ는 STOW-RS를 이용하여 Hospital B Test Orthanc에 승인된 Study를 전송할 수 있어야 한다.

**Acceptance:** `TC-DICOM-003-PLANNED`

---

## REQ-DICOM-004 — Endpoint Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

QIDO/WADO/STOW Endpoint가 응답하지 않는 경우 시스템은 성공으로 처리해서는 안 된다.

**Acceptance:** `TC-DICOM-004-PLANNED`

---

# 15. Viewer Requirements

## REQ-VIEW-001 — Authorized View

**Classification:** CAPSTONE-P0
**Priority:** MUST

Web Viewer는 승인된 Exchange Session 및 `study:view` 권한이 존재하는 경우에만 의료영상을 표시해야 한다.

**Acceptance:** `TC-VIEW-001-PLANNED`

---

## REQ-VIEW-002 — Unauthorized View Deny

**Classification:** CAPSTONE-P0
**Priority:** MUST

Consent, Authorization 또는 Viewer Scope가 유효하지 않은 경우 Viewer 접근을 거부해야 한다.

**Acceptance:** `TC-VIEW-002-PLANNED`

---

## REQ-VIEW-003 — CT/MRI Test Study

**Classification:** CAPSTONE-P0
**Priority:** MUST

Web Viewer는 P0 테스트 Dataset의 최소 하나 이상의 CT 또는 MRI Study를 조회할 수 있어야 한다.

**Acceptance:** `TC-VIEW-003-PLANNED`

---

# 16. Download Requirements

## REQ-DWN-001 — Download Scope

**Classification:** CAPSTONE-P0
**Priority:** MUST

DICOM Download는 `study:download` Scope가 있는 경우에만 허용해야 한다.

**Acceptance:** `TC-DWN-001-PLANNED`

---

## REQ-DWN-002 — Unauthorized Download

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 중 하나라도 발생하면 다운로드를 거부해야 한다.

```text
No Consent
Invalid Grant
Expired Grant
Wrong Tenant
Wrong Recipient
Missing Download Scope
```

**Acceptance:** `TC-DWN-002-PLANNED`

---

# 17. PACS Import Requirements

## REQ-PACS-001 — STOW-RS Import

**Classification:** CAPSTONE-P0
**Priority:** MUST

승인된 의료영상은 MediQ를 통해 Hospital B Test Orthanc에 STOW-RS 방식으로 전송 가능해야 한다.

**Acceptance:** `TC-PACS-001-PLANNED`

---

## REQ-PACS-002 — Transfer Scope

**Classification:** CAPSTONE-P0
**Priority:** MUST

PACS Import에는 `study:pacs-transfer` Scope가 필요해야 한다.

**Acceptance:** `TC-PACS-002-PLANNED`

---

## REQ-PACS-003 — Destination Mapping

**Classification:** CAPSTONE-P0
**Priority:** MUST

PACS Import 전 Destination Patient Mapping이 확인되어야 한다.

P0 byte-preserving transfer additionally requires every source DICOM instance's validated PatientID to exactly equal the server-resolved destination mapping's `localPatientId`. If identity evidence is absent, malformed, inconsistent across instances, or mismatched, the transfer must be denied before STOW. P0 does not rewrite DICOM identity attributes and this rule does not establish real-world patient identity.

**Acceptance:** `TC-PACS-004-MAP-001~003` (mapping eligibility); `TC-PACS-001-PID-001~002` (synthetic byte-preserving identity preflight); `TC-PACS-001-PID-003` and `AT-SEC-012` (coordinator no-STOW) remain NOT RUN.

---

## REQ-PACS-004 — Transfer Result

**Classification:** CAPSTONE-P0
**Priority:** MUST

PACS Transfer의 성공 또는 실패 결과를 Session 및 Audit에서 확인할 수 있어야 한다.

STOW response loss/timeout after a request may have started must be represented as an unknown outcome, not as success or safe-to-retry failure. The same semantic operation must not start a second STOW while its prior result remains unresolved; resolve it through read-only destination reconciliation.

**Acceptance:** `TC-PACS-007-*` verifies durable operation state/idempotency and the unknown-outcome no-retry boundary; PACS coordinator/result delivery and destination reconciliation are still required for full REQ-PACS-004 acceptance.

---

## REQ-PACS-005 — Destination Verification

**Classification:** CAPSTONE-P0
**Priority:** MUST

성공으로 처리된 PACS Import는 Hospital B Test Orthanc에서 대상 Study 수신을 확인할 수 있어야 한다.

**Acceptance:** `TC-PACS-005-PLANNED`

---

# 18. Temporary Exchange Requirements

## REQ-DATA-001 — Temporary Exchange Copy

**Classification:** CAPSTONE-P0
**Priority:** MUST

MediQ가 관리하는 의료영상 Copy는 P0에서 영구 의료기록 원본이 아닌 Temporary Exchange Copy로 취급해야 한다.

PACS-001 DEC-017은 이를 구현하는 P0 source-lifecycle 연결 설계다. 정확한 StudyReference 예약 이후에만 임시 암호문을 쓰고, 완료 만료시각·AVAILABLE 상태·source evidence·Audit을 함께 확정하며, 실패 시 durable ref 기반 정리를 수행한다. `TC-PACS-001-LIFECYCLE-001~014`와 기존 STAGE Gate가 이를 추적한다. 현재는 설계만 승인됐으며 구현/시험 전이다. 이 내부 경로의 향후 PASS를 Viewer/Download 또는 전체 PACS Import 완료로 확대 해석하지 않는다.

**Acceptance:** `TC-DATA-001-PLANNED`

---

## REQ-DATA-002 — Payload Availability

**Classification:** CAPSTONE-P0
**Priority:** MUST

Exchange Session 수행 중 승인된 Viewer, Download 및 PACS Import 동작에서 필요한 Imaging Payload를 참조할 수 있어야 한다.

**Acceptance:** `TC-DATA-002-PLANNED`

---

# 19. Tenant Requirements

## REQ-TEN-001 — Tenant Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

사용자, Hospital 및 보호 대상 Resource는 Authorization에 사용할 Tenant Context를 가져야 한다.

**Acceptance:** `TC-TEN-001-PLANNED`

---

## REQ-TEN-002 — Default Isolation

**Classification:** CAPSTONE-P0
**Priority:** MUST

다른 Tenant의 Resource에 대한 접근은 기본적으로 거부해야 한다.

```text
Cross Tenant
→ DENY
```

**Acceptance:** `TC-TEN-002-PLANNED`

---

## REQ-TEN-003 — Explicit Exchange Exception

**Classification:** CAPSTONE-P0
**Priority:** MUST

Cross-Hospital Resource 접근은 유효한 Exchange Session 및 Grant가 명시적으로 허용한 범위 내에서만 가능해야 한다.

**Acceptance:** `TC-TEN-003-PLANNED`

---

# 20. Audit Requirements

## REQ-AUD-001 — Core Audit

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 이벤트를 최소 Audit 대상으로 기록해야 한다.

```text
SESSION_CREATED
CONSENT_REQUESTED
CONSENT_APPROVED
AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED
GRANT_CREATED
VIEWER_OPENED
DOWNLOAD_STARTED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
ACCESS_DENIED
SESSION_COMPLETED
```

**Acceptance:** `TC-AUD-001-WRITER-001~009` covers the common metadata-only writer and current call paths; `TC-AUD-002-EVENT-001~008` covers only verified-Tenant Grant issue/revocation denials. `TC-CON-007-AUD-001~005` remains Consent-specific context evidence. Broader event completeness remains `TC-AUD-001-PLANNED` / `STC-AUD-001-PLANNED`.

---

## REQ-AUD-002 — Audit Context

**Classification:** CAPSTONE-P0
**Priority:** MUST

Audit Event는 최소 다음 정보를 포함하거나 참조할 수 있어야 한다.

```text
timestamp
actor_ref
session_ref
action
result
tenant_context
```

**Acceptance:** `TC-AUD-002-PLANNED`

---

## REQ-AUD-003 — PHI Minimization

**Classification:** CAPSTONE-P0
**Priority:** MUST

Audit Log에는 테스트에 불필요한 의료영상 Payload 또는 불필요한 민감 Metadata를 직접 기록해서는 안 된다.

**Acceptance:** `TC-AUD-003-PLANNED`

---

# 21. Provenance Requirements

## REQ-PROV-001 — Source Tracking

**Classification:** CAPSTONE-P0
**Priority:** MUST

의료영상의 Source Hospital 및 Source Study를 추적할 수 있어야 한다.

**Acceptance:** `TC-PROV-001-PLANNED`

---

## REQ-PROV-002 — Exchange Path

**Classification:** CAPSTONE-P0
**Priority:** MUST

다음 이동경로를 Exchange Session 기준으로 추적할 수 있어야 한다.

```text
Source
→ MediQ
→ Destination
```

**Acceptance:** `TC-PROV-002-PLANNED`

---

## REQ-PROV-003 — Integrity Result 연결

**Classification:** CAPSTONE-P0
**Priority:** MUST

Provenance 정보에서 해당 Transfer의 Integrity Verification 결과를 참조할 수 있어야 한다.

**Acceptance:** `TC-PROV-003-PLANNED`

---

# 22. Integrity Requirements

## REQ-INT-001 — Bit-Preserving Verification

**Classification:** CAPSTONE-P0
**Priority:** MUST

Bit-preserving P0 Test Scenario에서 Source와 Destination Imaging Object의 무결성을 검증할 수 있어야 한다.

**Acceptance:** `TC-INT-001-HASH-001~008` (hash primitive only; end-to-end Source→MediQ→Destination verification remains NOT RUN)

---

## REQ-INT-002 — Integrity Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

무결성 검증 실패를 성공 Transfer로 처리해서는 안 된다.

**Acceptance:** `TC-INT-002-PLANNED`

---

## REQ-INT-003 — Integrity Evidence

**Classification:** CAPSTONE-P0
**Priority:** MUST

Integrity Verification 결과는 Session, Provenance 또는 Audit을 통해 확인 가능해야 한다.

**Acceptance:** `TC-INT-003-PLANNED`

---

# 23. Error Handling Requirements

## REQ-ERR-001 — Authorization Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

Authorization 평가 실패 또는 필수 Context 누락 시 시스템은 해당 의료영상 작업을 거부해야 한다.

**Acceptance:** `TC-ERR-001-PLANNED`

---

## REQ-ERR-002 — DICOMweb Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

DICOMweb 요청 실패 시 실패 상태와 원인을 확인 가능하게 기록해야 하며 성공 상태로 전환해서는 안 된다.

**Acceptance:** `TC-ERR-002-PLANNED`

---

## REQ-ERR-003 — PACS Transfer Failure

**Classification:** CAPSTONE-P0
**Priority:** MUST

STOW-RS 전송 실패 시 Exchange Session 또는 Transfer 상태에 실패 결과가 반영되어야 한다.

**Acceptance:** `TC-ERR-003-PLANNED`

---

## REQ-ERR-004 — Fail Closed

**Classification:** CAPSTONE-P0
**Priority:** MUST

보안 관련 오류 또는 판단 불가 상태에서는 허용보다 거부를 우선해야 한다.

**Acceptance:** `TC-ERR-004-PLANNED`

---

# 24. Observability Requirements

## REQ-OBS-001 — Session Status

**Classification:** CAPSTONE-P0
**Priority:** MUST

개발·테스트 환경에서 Exchange Session의 현재 상태를 확인할 수 있어야 한다.

**Acceptance:** `TC-OBS-001-PLANNED`

---

## REQ-OBS-002 — Transfer Status

**Classification:** CAPSTONE-P0
**Priority:** MUST

DICOMweb Retrieval 및 PACS Transfer의 성공/실패 상태를 확인할 수 있어야 한다.

**Acceptance:** `TC-OBS-002-PLANNED`

---

## REQ-OBS-003 — Failure Reason

**Classification:** CAPSTONE-P0
**Priority:** SHOULD

E2E 테스트 실패 시 최소한 어떤 단계에서 실패했는지 식별할 수 있는 오류정보를 제공해야 한다.

**Acceptance:** `TC-OBS-003-PLANNED`

---

# 25. P1 Mobile Requirements

다음 Requirement는 `CAPSTONE-P1`이다.

P1 미완료는 P0 실패로 판단하지 않는다.

## REQ-MOB-001 — Mobile Secure Vault

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

MediQ는 향후 의료영상을 Patient-side Mobile Secure Vault에 저장할 수 있는 구조를 지원해야 한다.

---

## REQ-MOB-002 — Secure Medical Capsule

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

Mobile Storage 대상 의료영상은 Secure Medical Capsule 형태로 보호할 수 있어야 한다.

---

## REQ-MOB-003 — Hardware-backed Key

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

모바일 암호키 보호에 Hardware-backed Key 저장소를 활용할 수 있어야 한다.

---

## REQ-MOB-004 — Device Binding

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

다른 Device에 복사된 보호 Payload의 복호화를 차단할 수 있는 Device Binding 구조를 지원해야 한다.

---

## REQ-MOB-005 — Biometric Unlock

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

Secure Vault 접근 시 기기에서 제공하는 사용자 인증기능과 연계할 수 있어야 한다.

---

## REQ-MOB-006 — MOBILE_EXPORT

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

Transfer Grant가 `study:mobile-export`를 허용할 경우 승인된 Imaging Package를 Mobile Vault로 Export할 수 있는 구조를 지원해야 한다.

---

## REQ-MOB-007 — Crypto-Shredding

**Classification:** CAPSTONE-P1
**Priority:** SHOULD

보호된 모바일 Payload의 복호화 능력을 폐기할 수 있는 Secure Delete 구조를 지원해야 한다.

---

# 26. Productionization Requirements

다음은 `PRODUCTIONIZATION`으로 분리한다.

| ID       | Requirement             | Classification    |
| -------- | ----------------------- | ----------------- |
| PROD-001 | 실제 환자 본인확인              | PRODUCTIONIZATION |
| PROD-002 | 실제 의료기관 Patient Mapping | PRODUCTIONIZATION |
| PROD-003 | 실제 PACS Vendor 연계       | PRODUCTIONIZATION |
| PROD-004 | 실제 환자 동의 법적 검증          | PRODUCTIONIZATION |
| PROD-005 | 개인정보보호 법률 검토            | PRODUCTIONIZATION |
| PROD-006 | Production IAM          | PRODUCTIONIZATION |
| PROD-007 | Enterprise KMS/HSM      | PRODUCTIONIZATION |
| PROD-008 | SLA / DR                | PRODUCTIONIZATION |
| PROD-009 | 실제 병원 운영망 연계            | PRODUCTIONIZATION |

위 항목이 미완료라는 이유로 Capstone Technical MVP를 BLOCKED 처리하지 않는다.

---

# 27. Explicit Non-Requirements

현재 프로젝트의 Requirement가 아니다.

```text
Full Cloud PACS

Full EMR Integration

Full FHIR Platform

AI Diagnosis

AI Route Selection

Blockchain

DID

ZKP

Custom Cryptography

Full PQC Migration

Actual Production Hospital Deployment
```

---

# 28. Requirement Dependencies

핵심 의존관계:

```text
Test Environment
      ↓
Hospital / Tenant
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
┌─────────────┼──────────────┐
↓             ↓              ↓
VIEW       DOWNLOAD      PACS_IMPORT
                              ↓
                         Destination
                              ↓
                    Provenance / Integrity
                              ↓
                            Audit
```

P1:

```text
P0 E2E Complete
      ↓
MOBILE_EXPORT
      ↓
Secure Medical Capsule
      ↓
Mobile Secure Vault
```

---

# 29. Traceability Matrix

| Requirement   | Class | Product Baseline         | Acceptance           |
| ------------- | ----- | ------------------------ | -------------------- |
| REQ-SYS-001   | P0    | P0 Product Scope         | TC-SYS-001-PLANNED   |
| REQ-SYS-002   | P0    | Data Boundary            | TC-DATA-001-PLANNED  |
| REQ-ORG-001   | P0    | Hospital                 | TC-ORG-001-PLANNED   |
| REQ-PAT-001   | P0    | Patient Reference        | TC-PAT-001-DOM-001~002 / PER-001~003 / SEC-001 |
| REQ-PAT-002   | P0    | Source Patient Mapping   | TC-PAT-002-GATE-001 / DOM-001~002 / PER-001~002 / TEN-001~002 / SEC-001~003 |
| REQ-PAT-003   | P0    | Destination Mapping     | TC-PAT-003-DOM-001~008 (domain only; no API/PACS claim) |
| REQ-PAT-004   | P0    | Patient Mapping          | `TC-PAT-003-DOM-002~006` (domain); `TC-PAT-004-PER-001~005` (mocked persistence); `AT-SEC-012` pending PACS-004 |
| REQ-EXC-001   | P0    | Exchange Session         | TC-EXC-001-DOM-001~002 / AT-FUNC-001 / TC-EXC-003-API-001~005 |
| REQ-EXC-002   | P0    | Session Core Context     | TC-EXC-001-DOM-001, DOM-003~004 / AT-FUNC-001 / TC-EXC-003-API-001~005 |
| REQ-EXC-005   | P0    | Session Lifecycle        | TC-EXC-005-DOM-001~004 (domain only; runtime enforcement gated) |
| REQ-EXC-007   | P0    | Exchange Creation Retry Safety | TC-EXC-003-API-006~008 / TC-EXC-003-DB-003~004 |
| REQ-CON-001   | P0    | Consent Artifact         | TC-CON-001-DOM-001~002, DOM-008 (domain); `TC-CON-002-DB-001/005`; `TC-CON-003-API-001/007` (synthetic PENDING API only) |
| REQ-CON-002   | P0    | Consent Context          | TC-CON-001-DOM-003~007 (domain); `TC-CON-002-DB-004`; `TC-CON-003-API-001/002/004` (server-owned Session binding) |
| REQ-CON-005   | P0    | Technical Consent Boundary | TC-CON-001-DOM-008; `TC-CON-002-DB-001/006`; `TC-CON-003-API-001/008` (PENDING-only, no identity/legal/Authorization claim) |
| REQ-CON-003   | P0    | Consent Enforcement      | `TC-CON-003-PLANNED` (Grant deny remains open); `TC-CON-004-API-001~010` (synthetic technical approval only) |
| REQ-CON-004   | P0    | Consent Withdrawal      | `AT-FUNC-007`; `TC-CON-005-API-001~013` (synthetic technical withdrawal only) |
| REQ-CON-006   | P0    | P0 Allowed Action Boundary | `TC-CON-006-AUTH-001~005` (pure policy only; no Grant/API integration claim) |
| REQ-AUT-001   | P0    | Explicit Authorization   | TC-AUT-001-CTX-001~005 (context shape only; decision remains AUT-002~004) |
| REQ-AUT-002   | P0    | Allow/Deny result        | TC-AUT-002-DD-001~006 (evaluator contract; no business policy) |
| REQ-AUT-003   | P0    | Fail Closed              | TC-AUT-004-APP-001~004 (application boundary); TC-AUT-004-FC-001~004 (HTTP integration pending) |
| REQ-AUT-004   | P0    | Object-Level Authorization | TC-AUT-003-OBJ-001~012 (policy contract; HTTP BOLA remains AT-SEC-003) |
| REQ-AUT-005   | P0    | Trusted Authorization Evidence | TC-AUT-005-DB-001~007 (synthetic DB integration; no HTTP route) |
| REQ-GRT-002   | P0    | Access Scope             | `TC-GRT-001-DOM-005`; `TC-GRT-003-API-002/008` |
| REQ-GRT-003   | P0    | Recipient Binding        | `TC-GRT-003-API-001~005` |
| REQ-GRT-004   | P0    | Scope Enforcement        | `TC-GRT-005-AUTH-001~008` (PASS — shared pure policy only; protected routes remain separate) |
| REQ-GRT-005   | P0    | Expiration               | `TC-GRT-007-EXP-001~008` (PASS — strict server-time policy and issue TTL cap; protected operation remains separate) |
| REQ-GRT-007   | P0    | Consent-bound Grant Issue | `TC-GRT-003-API-001~020`; `TC-GRT-003-DB-001~006` |
| REQ-GRT-008   | P0    | Recipient-bound Grant revocation | `TC-GRT-004-REV-API-001~012`; `TC-GRT-004-REV-DB-001~004` |
| REQ-IMG-001   | P0    | Imaging Package          | TC-IMG-001-PLANNED   |
| REQ-DICOM-001 | P0    | QIDO-RS                  | TC-DICOM-001-PLANNED |
| REQ-DICOM-002 | P0    | WADO-RS                  | TC-DICOM-002-PLANNED |
| REQ-DICOM-003 | P0    | STOW-RS                  | TC-DICOM-003-PLANNED |
| REQ-VIEW-001  | P0    | VIEW                     | TC-VIEW-001-PLANNED  |
| REQ-DWN-001   | P0    | DOWNLOAD                 | TC-DWN-001-PLANNED   |
| REQ-PACS-001  | P0    | PACS_IMPORT              | TC-PACS-001-PLANNED  |
| REQ-PACS-002  | P0    | Transfer Scope           | TC-PACS-002-PLANNED  |
| REQ-PACS-003  | P0    | Destination/PatientID Binding | `TC-PACS-004-MAP-001~003`; `TC-PACS-001-PID-001/002` scoped PASS; `TC-PACS-001-PID-003` and `AT-SEC-012` coordinator no-STOW remain NOT RUN |
| REQ-PACS-004  | P0    | Transfer Result/Unknown Outcome | `TC-PACS-007-*` scoped durable-state Acceptance PASS; coordinator/reconciliation/live transfer NOT RUN |
| REQ-PACS-005  | P0    | Destination Verification | TC-PACS-005-PLANNED  |
| REQ-TEN-002   | P0    | Tenant Isolation         | TC-TEN-002-PLANNED   |
| REQ-AUD-001   | P0    | Audit                    | TC-AUD-001-PLANNED   |
| REQ-PROV-002  | P0    | Provenance               | TC-PROV-002-PLANNED  |
| REQ-INT-001   | P0    | Integrity                | `TC-INT-001-HASH-001~008` primitive PASS; end-to-end NOT RUN |
| REQ-ERR-004   | P0    | Fail Closed              | TC-ERR-004-PLANNED   |
| REQ-MOB-001   | P1    | Mobile Secure Vault      | TC-MOB-001-PLANNED   |

세부 `ACCEPTANCE-TESTS.md` 작성 시 모든 P0 MUST Requirement에 Test ID를 확정한다.

---

# 30. P0 Requirement Gate

다음 Domain이 모두 정의되고 검증 가능해야 Requirements Baseline을 완료로 판단한다.

```text
GATE-01 Test Environment
GATE-02 Hospital / Tenant
GATE-03 Patient Mapping
GATE-04 Exchange Session
GATE-05 Consent
GATE-06 Authorization
GATE-07 Transfer Grant
GATE-08 Imaging Package
GATE-09 DICOMweb
GATE-10 Viewer
GATE-11 Download
GATE-12 PACS Import
GATE-13 Tenant Isolation
GATE-14 Audit
GATE-15 Provenance
GATE-16 Integrity
GATE-17 Error Handling
GATE-18 Acceptance Linkage
```

---

# 31. Requirement Baseline Decision

```text
PROJECT:
MediQ

REQUIREMENTS VERSION:
v1.3 Mobile Application and QR Handoff Amendment

CURRENT TARGET:
CAPSTONE P0 END-TO-END MVP

P0 REQUIREMENTS:
COMPLETE

PATIENT MAPPING:
PASS

EXCHANGE SESSION:
PASS

CONSENT:
PASS

AUTHORIZATION:
PASS

TRANSFER GRANT:
PASS

IMAGING PACKAGE:
PASS

DICOMWEB:
PASS

VIEWER:
PASS

DOWNLOAD:
PASS

PACS IMPORT:
PASS

TENANT ISOLATION:
PASS

AUDIT:
PASS

PROVENANCE:
PASS

INTEGRITY:
PASS

ERROR HANDLING:
PASS

DATA BOUNDARY:
PASS

P1 MOBILE:
DETAILED

P1 QR HANDOFF:
DEFINED

PRODUCTIONIZATION:
SEPARATED

ACCEPTANCE TEST IDS:
P0/P1 CORE DEFINED — EXECUTION NOT RUN
QR SECURITY MATRIX DEFINED — EXECUTION NOT RUN

REQUIREMENTS BASELINE READY:
YES
```

---

# 32. Requirements Quality Review

```text
Unique Requirement IDs:
PASS

Classification:
PASS

Priority:
PASS

P0/P1 Separation:
PASS

Productionization Separation:
PASS

Synthetic/Test Data Boundary:
PASS

Requirement Testability:
PASS

Baseline Traceability:
PASS

Acceptance Linkage:
PARTIAL
Reason:
Acceptance specifications exist, but implementation and executable evidence are not complete.

Scope Expansion Detected:
NO

Legacy Auto-Migration:
NO
```

---

# 33. Next Document

다음 공식 산출물:

```text
SECURITY-REQUIREMENTS.md
```

목적:

```text
REQUIREMENTS.md
        ↓
보안 요구사항 상세화
        ↓
Identity / Authentication
Authorization
Tenant Isolation
Grant Security
Transport Security
DICOM Access Security
Audit Security
Integrity
Secrets / Token
Mobile P1 Security
```

그 후:

```text
DOMAIN-MODEL.md
```

을 작성한다.

---

# 33. Viewer and Storage Requirements Amendment — 2026-09-15

본 절의 요구사항은 기존 Viewer, Temporary Exchange 및 P1 Mobile 요구사항을 구체화한다. 충돌 시 본 절을 우선 적용한다.

## REQ-VIEW-004 — Hospital Cloud Viewer Actor

**Priority:** CAPSTONE-P0

시스템은 승인된 Hospital User가 유효한 Tenant, Exchange Session, Consent, Authorization 및 `study:view` Grant를 가진 경우에만 Cloud Viewer Session을 생성해야 한다.

**Acceptance:** `TC-VIEW-004-PLANNED`

## REQ-VIEW-005 — Synthetic Patient Cloud Viewer Actor

**Priority:** CAPSTONE-P0

시스템은 Synthetic Patient의 인증 Context가 대상 PatientReference와 일치하고 유효한 Consent 및 `study:view` Grant가 존재하는 경우 Cloud Viewer Session을 생성할 수 있어야 한다. 이는 실제 환자 본인확인 완료를 의미하지 않는다.

**Acceptance:** `TC-VIEW-005-PLANNED`

## REQ-VIEW-006 — On-Demand DICOMweb Retrieval

**Priority:** CAPSTONE-P0

Cloud Viewer는 MediQ의 영구 영상 Archive가 아니라 Source Hospital PACS의 WADO-RS Study·Series·Instance·Frame 조회를 사용해야 한다. 필요한 데이터만 요청 시점에 점진적으로 전달해야 한다.

**Acceptance:** `TC-VIEW-006-PLANNED`

## REQ-VIEW-007 — Viewer Session Lifecycle

**Priority:** CAPSTONE-P0

Viewer Session은 Actor, Tenant, PatientReference, Source Hospital, Study, Grant 및 만료시간에 binding되어야 하며 짧은 유효기간을 가져야 한다. Consent 철회, Grant 만료·취소 또는 binding 불일치 시 즉시 Fail Closed해야 한다.

**Acceptance:** `TC-VIEW-007-PLANNED`

## REQ-VIEW-008 — No Direct PACS Exposure

**Priority:** CAPSTONE-P0

Browser 및 Mobile Client에 Hospital PACS endpoint, PACS credential, raw storage reference 또는 장기 access token을 노출해서는 안 된다. DICOM UID나 Viewer URL만으로 영상을 조회할 수 없어야 한다.

**Acceptance:** `TC-VIEW-008-PLANNED`

## REQ-DATA-004 — No Permanent Cloud Imaging Retention

**Priority:** CAPSTONE-P0

MediQ Cloud는 의료영상 원본, 장기 Archive 또는 Permanent Cloud PACS로 동작해서는 안 된다.

**Acceptance:** `TC-DATA-004-PLANNED`

## REQ-DATA-005 — Temporary Cache Lifecycle

**Priority:** CAPSTONE-P0

Viewer 전달 또는 전송 재시도에 필요한 임시 객체는 암호화하고 TTL, 최대 크기, session binding, purge 상태를 가져야 한다. TTL 만료, Session 종료 또는 정책상 삭제 조건 충족 시 삭제되어야 한다.

**Acceptance:** `TC-DATA-005-PLANNED`

## REQ-VIEW-009 — Source PACS Failure

**Priority:** CAPSTONE-P0

Source PACS 또는 DICOMweb 검증에 실패하면 Cloud Viewer는 영구 Cloud Copy로 우회하지 않고 실패 상태와 Audit Event를 기록해야 한다.

**Acceptance:** `TC-VIEW-009-PLANNED`

## REQ-MOB-VIEW-001 — Patient Mobile Vault Viewer

**Priority:** CAPSTONE-P1

환자는 `study:mobile-export`로 승인되어 Mobile Secure Vault에 암호화 저장된 의료영상을 Device Binding 및 기기 사용자 인증 후 Mobile Viewer로 열람할 수 있어야 한다.

**Acceptance:** `TC-MOB-007-PLANNED`

## REQ-MOB-008 — Mobile Storage Isolation

**Priority:** CAPSTONE-P1

Mobile Vault 영상은 일반 Gallery, 공용 Download 폴더 또는 공유 Storage에 자동 저장되어서는 안 되며, 앱이 통제하는 암호화 Storage에서만 복호화되어야 한다.

**Acceptance:** `TC-MOB-008-PLANNED`

## REQ-MOB-009 — Exported Copy Policy Boundary

**Priority:** CAPSTONE-P1

Consent 철회 또는 계정 revoke가 이미 환자 기기에 적법하게 Export된 Copy에 미치는 범위와 offline enforcement 한계를 명시해야 한다. 만료·접근차단·crypto-shredding 정책을 별도로 정의해야 한다.

**Acceptance:** `TC-MOB-009-PLANNED`

## 33.1 Amendment Traceability

| Requirement | Security | Threat | API | Acceptance | Planned Ticket |
|---|---|---|---|---|---|
| REQ-VIEW-004/005 | SEC-VIEW-001/002 | THR-VIEW-001/002 | `POST /exchange-sessions/{sessionId}/actions/view` | TC-VIEW-004/005 | MEDIQ-VIEW-007 |
| REQ-VIEW-006/009 | SEC-VIEW-003 | THR-VIEW-003/008 | `GET /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}` | TC-VIEW-006/009 | MEDIQ-VIEW-008 |
| REQ-VIEW-007/008 | SEC-VIEW-001~005 | THR-VIEW-001~005 | `GET/DELETE /viewer-sessions/{viewerSessionId}` | TC-VIEW-007/008 | MEDIQ-VIEW-009 |
| REQ-DATA-004/005 | SEC-CACHE-001/002 | THR-VIEW-006/007 | Viewer delivery response contract | TC-DATA-004/005 | MEDIQ-DATA-018 |
| REQ-MOB-VIEW-001 / REQ-MOB-008~009 | SEC-MOB-007~009 | THR-MOB-001~004 | P1 deferred | TC-MOB-007~009 | MEDIQ-MOB-007~009 |

**공통 기준:** Hospital PACS는 Source of Record이며, MediQ Cloud는 Permanent PACS/장기 Archive가 아니다. P0 Cloud Viewer는 Source PACS의 온디맨드 DICOMweb 데이터를 사용하고, P1 Mobile Viewer는 Mobile Vault의 암호화 Local Copy를 사용한다.

---

# P1 Mobile Security Policy Requirements — 2026-09-15

다음 요구사항은 `CAPSTONE-P1`이며 P0 완료를 차단하지 않는다.

## REQ-MOB-010 — Android-first Platform Scope

P1 Mobile MVP의 Native Secure Vault는 Android를 우선 구현해야 한다. iOS Native Vault는 후속 단계로 분리하고, 적용 가능한 Identity/Test 범위의 iOS 사용 경로는 반응형 Cloud Viewer로 제공해야 한다. Capsule, Crypto Suite, Key Wrap Metadata 및 Mobile Export 업무행위는 플랫폼 독립적으로 정의해야 한다.

**Acceptance:** `TC-MOB-010-PLANNED`

## REQ-MOB-011 — Device Security Admission

Device 등록 시 Key Security Level을 판정해야 한다. Android `STRONGBOX`는 선호하고 `TRUSTED_ENVIRONMENT`는 Persistent Vault에 허용한다. `SOFTWARE` 또는 `UNKNOWN`만 확인되면 Persistent Vault 생성과 Mobile Export를 거부하고 Cloud Viewer를 안내해야 한다. 보안 등급을 조용히 하향해서는 안 된다.

**Acceptance:** `TC-MOB-011-PLANNED`

## REQ-MOB-012 — Performant Crypto-agile Capsule

Secure Medical Capsule은 AES-256-GCM, Capsule별 무작위 DEK 및 Hardware-backed Device Wrap Key를 사용하는 Envelope Encryption을 기본으로 해야 한다. API 요청용 Device Proof Key와 Capsule 복호화용 Device Wrap Key는 역할을 분리해야 한다. Viewer는 짧은 로컬 열람 세션에서 DEK를 한 번 승인하여 Instance/Chunk 단위 데이터를 점진적으로 복호화할 수 있어야 하며 평문은 승인된 앱 메모리 밖에 저장해서는 안 된다. Crypto Suite와 Key Wrap은 버전되어야 하고 복수 Wrap Slot과 표준화된 향후 Hybrid/PQC 전환을 수용해야 한다. 검증되지 않은 자체 Hybrid Combiner를 사용해서는 안 된다.

**Acceptance:** `TC-MOB-012-PLANNED`

## REQ-MOB-013 — Thirty-day Offline Lease

Offline Lease 기본값은 마지막 성공한 Capsule 발급 또는 온라인 정책 검증 시점부터 30일이어야 한다. 연결 가능 시 Consent, Grant, Device 및 Account 상태를 재검증하여 갱신할 수 있어야 한다. Lease 만료 후 온라인 재검증 전에는 로컬 복호화를 거부해야 한다.

**Acceptance:** `TC-MOB-013-PLANNED`

## REQ-MOB-014 — Background Privacy and Reauthentication

앱이 Background 또는 Inactive 상태로 전환되면 민감 화면을 즉시 가리고 렌더링을 중단하며 복호화된 Pixel Buffer를 제거해야 한다. 동일 기기가 계속 잠금 해제된 상태로 60초 이내 복귀하면 재인증을 생략할 수 있다. 60초 초과, OS 잠금, 계정·Device 상태 변경 또는 보안 이벤트가 있으면 생체인증 또는 Device Credential을 다시 요구해야 한다.

**Acceptance:** `TC-MOB-014-PLANNED`

## REQ-MOB-015 — Screen Capture Restriction

Mobile Viewer는 Screenshot, 화면녹화, 미러링 및 비보안 디스플레이 출력을 플랫폼 제공 범위에서 기본 제한해야 한다. Android는 Secure Window 보호를 사용해야 한다. iOS 구현은 녹화·미러링 감지와 App Switcher Privacy Screen을 적용하되 일반 Screenshot의 사전 완전 차단이나 외부 카메라 방지를 보장해서는 안 된다.

**Acceptance:** `TC-MOB-015-PLANNED`

## REQ-MOB-016 — Lost and Replacement Device Recovery

분실 또는 기기 교체 시 Device Private Key, Vault Key 또는 평문 Capsule을 Cloud에 Escrow하여 복구해서는 안 된다. 기존 Device Binding과 Lease 갱신을 Revoke하고 새 기기를 등록한 뒤 Source PACS에서 다시 다운로드하여 새 Device Key로 보호해야 한다. 기존 Consent와 `study:mobile-export` Grant가 유효할 때만 자동 재발급할 수 있으며 무효 또는 만료 상태이면 새 승인을 요구해야 한다.

**Acceptance:** `TC-MOB-016-PLANNED`

## REQ-MOB-017 — Key Lifecycle

Mobile Key는 NIST SP 800-57 계열 원칙에 따라 생성, 등록, 활성화, 사용, 회전, 폐기, 만료, 파기 및 감사 상태를 추적해야 한다. Logout, Device Revoke, 계정 폐기 또는 정책상 Secure Delete 시 복호화 능력을 제거해야 한다.

**Acceptance:** `TC-MOB-017-PLANNED`

## REQ-MOB-018 — Deterministic Capsule Format and Atomic Activation

Secure Medical Capsule은 `SECURE-MEDICAL-CAPSULE-FORMAT.md`의 v1 Container, Deterministic CBOR Manifest, 1 MiB 기본 Chunk, AES-256-GCM Nonce/AAD/Tag, Signed Record Directory 및 Device-bound Wrap Slot을 따라야 한다. 다운로드는 Capsule ID, Content Version과 강한 ETag에 결합하여 Record 단위로 재개할 수 있어야 하며, 모든 Signature·Hash·Tag·Device Binding·Lease 검증 전에는 Vault Item을 활성화해서는 안 된다. Partial Download 또는 검증 실패 Capsule은 정상 의료영상으로 표시하지 않는다.

**Acceptance:** `TC-MOB-018-PLANNED`

## REQ-MOB-019 — Mobile API Contract and Device-bound Authorization

P1 Mobile API는 `MOBILE-API-CONTRACT.md`에 따라 사용자 인증, Patient Binding, Device Trust, `study:mobile-export` Grant, Capsule Download Session, Offline Lease와 Audit를 분리해야 한다. 기존 P0 OpenAPI를 깨지 않고 별도 Mobile OpenAPI로 계약을 제공해야 하며, 등록 후 민감 API는 단순 Device ID가 아니라 승인된 Device Proof와 사용자 Access Token을 함께 검증해야 한다. Manifest와 Chunk는 `SECURE-MEDICAL-CAPSULE-FORMAT.md`의 exact bytes를 전달하고 strong ETag/Range Resume와 Idempotency를 지원해야 한다. Server Revocation/Deletion을 Offline Device Data 삭제 완료로 표시해서는 안 된다.

**Acceptance:** `TC-MOB-019-PLANNED`

## Mobile Policy Traceability

| Requirement | Security | Threat | API | Acceptance | Planned Ticket |
|---|---|---|---|---|---|
| REQ-MOB-010 | SEC-MOB-010 | THR-MOB-005 | P1 contract deferred | TC-MOB-010 | MEDIQ-MOB-010 |
| REQ-MOB-011 | SEC-MOB-011 | THR-MOB-005 | P1 contract deferred | TC-MOB-011 | MEDIQ-MOB-010 |
| REQ-MOB-012/017 | SEC-MOB-012/017 | THR-MOB-006/010 | P1 contract deferred | TC-MOB-012/017 | MEDIQ-MOB-011 |
| REQ-MOB-013 | SEC-MOB-013 | THR-MOB-004/009 | P1 contract deferred | TC-MOB-013 | MEDIQ-MOB-012 |
| REQ-MOB-014 | SEC-MOB-014 | THR-MOB-007 | Local lifecycle | TC-MOB-014 | MEDIQ-MOB-013 |
| REQ-MOB-015 | SEC-MOB-015 | THR-MOB-003/008 | Local platform control | TC-MOB-015 | MEDIQ-MOB-013 |
| REQ-MOB-016 | SEC-MOB-016 | THR-MOB-001/009/010 | P1 contract deferred | TC-MOB-016 | MEDIQ-MOB-014 |
| REQ-MOB-018 | SEC-MOB-018 | THR-MOB-011~016 | P1 contract deferred | TC-MOB-018 | MEDIQ-MOB-015 |
| REQ-MOB-019 | SEC-MOB-019 | THR-MOB-017~023 | Separate Mobile OpenAPI proposed | TC-MOB-019 | MEDIQ-MOB-016 |

---

# 34. Mobile Application and QR Handoff Requirements Amendment — 2026-09-21

본 Amendment는 이후 작성된 모바일 애플리케이션 상세 요구사항과 QR Handoff 통합 설계를 기본 요구사항 기준선에 반영한다. 기존 P0 범위와 성공조건은 변경하지 않으며, 다음 요구사항은 모두 `CAPSTONE-P1`이다.

## 34.1 Normative relationship

`MOBILE-APPLICATION-REQUIREMENTS.md`의 `MAPP-*` 요구사항은 본 문서의 P1 Mobile 요구사항을 세부화하는 하위 기준선이다. 다음 QR 설계 문서는 `REQ-QR-*`의 상세 계약이다.

```text
REQUIREMENTS.md
  └── MOBILE-APPLICATION-REQUIREMENTS.md
        ├── MOBILE-UI-UX-SPEC.md
        ├── MOBILE-NAVIGATION-AND-STATE-MODEL.md
        ├── MOBILE-APP-ARCHITECTURE.md
        ├── SECURE-MEDICAL-CAPSULE-FORMAT.md
        ├── MOBILE-API-CONTRACT.md
        └── architecture/qr/*
```

상세 설계가 본 문서의 P0 보안 불변조건과 충돌하면 본 문서와 상위 기준선을 우선한다.

## REQ-MOB-020 — Detailed Mobile Application Baseline

**Classification:** CAPSTONE-P1  
**Priority:** MUST

Android Mobile Application은 `MOBILE-APPLICATION-REQUIREMENTS.md`에 정의된 `MAPP-*` 기능·보안·데이터·성능·UX 요구사항을 구현·검증해야 한다. 해당 문서의 요구사항은 구현 완료가 아니라 승인된 P1 요구사항 계약이며, 실행 증거 없이 PASS로 표시해서는 안 된다.

**Acceptance:** `MAPP-*` Traceability and P1 evidence bundle — NOT RUN

## REQ-MOB-021 — Mobile Authentication and Device-bound API

**Classification:** CAPSTONE-P1  
**Priority:** MUST

환자 모바일 인증은 System Browser 기반 OIDC Authorization Code와 PKCE를 사용해야 한다. 등록 후 민감 API는 사용자 Access Token과 승인된 Device Proof를 결합하고 Patient, Tenant, Device 및 Resource 관계를 서버에서 검증해야 한다. 생체인증과 Device ID는 단독 Authorization 근거가 될 수 없다.

**Acceptance:** `MAPP-AUTH-*`, `MAPP-API-*` — NOT RUN

## REQ-MOB-022 — Key Role Separation and Crypto Agility

**Classification:** CAPSTONE-P1  
**Priority:** MUST

API 요청 서명용 Device Proof Key와 Capsule DEK 보호용 Device Wrap Key를 분리해야 한다. Content 암호와 Key Wrap은 versioned Registry로 관리하고, 표준화된 향후 PQC/Hybrid Wrap Profile을 추가할 수 있어야 한다. 검증되지 않은 자체 암호 조합이나 Software Key를 Hardware-backed로 표시해서는 안 된다.

**Acceptance:** `MAPP-DEV-*`, `MAPP-CAP-*` — NOT RUN

## REQ-MOB-023 — Secure Download and Atomic Vault Activation

**Classification:** CAPSTONE-P1  
**Priority:** MUST

Mobile Export 다운로드는 Capsule·Patient·Device·Grant에 binding된 단기 Download Session과 strong ETag/Range/`If-Range` 재개를 사용해야 한다. Envelope, Manifest, Record, Signature, Hash, GCM Tag, Device Binding 및 전체 길이 검증 전에는 Vault Item을 활성화해서는 안 된다. Process Kill, 저장공간 부족 또는 Content Version 변경 시 부분 데이터를 정상 Capsule과 혼합해서는 안 된다.

**Acceptance:** `MAPP-EXP-*`, `MAPP-VLT-005~006`, `TC-MOB-018/019` — NOT RUN

## REQ-MOB-024 — Performant Local Viewer

**Classification:** CAPSTONE-P1  
**Priority:** MUST

Local Viewer는 Device Binding, Capsule 상태, Offline Lease 및 환자 기기 인증을 통과한 후 필요한 Instance/Frame만 메모리에서 점진적으로 복호화·파싱·렌더링해야 한다. 전체 Study 평문 파일을 임시 디스크에 생성하거나 암호화를 비활성화하여 성능 목표를 달성해서는 안 된다.

**Acceptance:** `MAPP-LVW-*`, `MAPP-PERF-*` — NOT RUN

## REQ-MOB-025 — Application Lifecycle and Recovery

**Classification:** CAPSTONE-P1  
**Priority:** MUST

Background 전환 시 민감 화면을 즉시 가리고 렌더링과 평문 Buffer를 정리해야 한다. 분실·교체 기기의 Private Key 또는 DEK를 Cloud에 Escrow하거나 다른 기기로 이전해서는 안 되며, 새 기기는 새 Key/Attestation과 현재 Consent·Authorization·Grant 검증 후 Source PACS에서 새 Capsule을 받아야 한다.

**Acceptance:** `MAPP-LIFE-*`, `MAPP-REC-*` — NOT RUN

## REQ-MOB-026 — Mobile Audit and Sensitive Data Minimization

**Classification:** CAPSTONE-P1  
**Priority:** MUST

Device 등록, Mobile Export, Download, Vault 활성화, Local Viewer, Offline Lease, Revoke 및 QR Handoff를 감사 가능하게 기록해야 한다. PHI, DICOM Payload, Pixel Buffer, Token, DPoP Proof, QR 원문, Key, Password와 raw Attestation Evidence는 로그·분석·Crash Report에 기록해서는 안 된다.

**Acceptance:** `MAPP-AUD-*` and automated sensitive-log scan — NOT RUN

## 34.2 QR Handoff Requirements

## REQ-QR-001 — Bootstrap-only QR Payload

**Classification:** CAPSTONE-P1  
**Priority:** MUST

QR은 의료영상 공유·전송 요청을 연결하는 Pairing Capability로만 사용해야 한다. QR v1에는 허용된 Origin/Version과 256-bit 불투명 Request Reference만 포함하고 환자정보, DICOM, UID, Access/Refresh Token, Consent, Transfer Grant, 암호키 또는 PACS Credential을 포함해서는 안 된다. QR은 Access Token이 아니다.

**Acceptance:** `QR-AT-001/002/012~015/027/052`

## REQ-QR-002 — Patient-created Single-study Request

**Classification:** CAPSTONE-P1  
**Priority:** MUST

초기 QR Profile은 인증된 환자가 서버에서 확인된 자신의 Study 하나와 `VIEW` 또는 `PACS_IMPORT` 작업 하나를 선택하여 요청을 생성하는 방식이어야 한다. Mobile Secure Vault에 영상이 저장되어 있지 않아도 QR Handoff를 사용할 수 있어야 한다.

**Acceptance:** `QR-AT-001/009`

## REQ-QR-003 — Authenticated Atomic Hospital Claim

**Classification:** CAPSTONE-P1  
**Priority:** MUST

인증되고 등록된 최초 유효 병원 의료진만 QR 요청을 원자적으로 claim할 수 있어야 한다. Tenant, Hospital 및 Actor는 인증된 서버 Context에서 결정하고 QR 또는 요청 Body의 값을 신뢰해서는 안 된다. Claim 이후 Destination은 변경할 수 없어야 한다.

**Acceptance:** `QR-AT-003/017~019/024/053`

## REQ-QR-004 — Informed Patient Approval and Consent Separation

**Classification:** CAPSTONE-P1  
**Priority:** MUST

환자는 서버가 확인한 요청 병원, 의료진, 원본 병원, Study, 목적, 작업 및 유효기간을 확인한 후 승인·거절·취소할 수 있어야 한다. QR Scan이나 QR Approval은 Consent 또는 Authorization을 대체하지 않으며, 정확히 일치하는 ACTIVE Consent/version을 별도로 확인해야 한다.

**Acceptance:** `QR-AT-004~006/010/011/016/028~030/045~050`

## REQ-QR-005 — Exact Transfer Grant Binding

**Classification:** CAPSTONE-P1  
**Priority:** MUST

환자 승인 후에도 현재 Consent, Authorization, Tenant, Patient, Source, Destination, requesting Actor, Study, Action과 expiry를 재검증해야 한다. 환자에게 표시된 승인 Snapshot과 동일한 범위의 Transfer Grant만 최대 하나 발급해야 하며 `study:view`를 `study:pacs-transfer`로 확대해서는 안 된다.

**Acceptance:** `QR-AT-007/020~022/025/029~032/055/056`

## REQ-QR-006 — Expiry, Idempotency and Replay Resistance

**Classification:** CAPSTONE-P1  
**Priority:** MUST

QR Request TTL, Patient Approval Window, Transfer Grant TTL 및 Transfer Job Deadline을 분리해야 한다. 서버 시간이 만료 판단의 기준이며, Conditional Update, 상태 Version/ETag, Idempotency-Key, Replay Cache 및 unique QR-to-Grant binding으로 중복 claim·결정·Grant 발급을 차단해야 한다. 초기 QR TTL과 승인 Window의 5분 값은 검증 전 제안값이다.

**Acceptance:** `QR-AT-015/023~025/033~044/052~058`

## REQ-QR-007 — QR Privacy and Relay Risk

**Classification:** CAPSTONE-P1  
**Priority:** MUST

승인 전 병원에는 환자 Identity, Study UID, 영상 또는 불필요한 Source 정보를 노출해서는 안 된다. QR 촬영과 실시간 Relay는 TTL이나 비교 코드만으로 완전히 방지되지 않으므로 환자가 실제 병원·의료진·목적·작업을 독립적으로 확인하도록 해야 한다. QR bitmap, camera frame과 raw reference를 로그·분석 SDK에 기록해서는 안 된다.

**Acceptance:** `QR-AT-012~019/026/027/046~049`

## REQ-QR-008 — QR State and Imaging Transfer Separation

**Classification:** CAPSTONE-P1  
**Priority:** MUST

QR Request 상태, Consent 상태, Transfer Grant 상태, Viewer Session 상태와 Transfer Job 상태를 별도로 관리해야 한다. QR `GRANT_ISSUED`는 Handoff 완료만 의미하며 Viewer 조회, WADO-RS, STOW-RS, Destination Verification 또는 Exchange `COMPLETED`를 의미해서는 안 된다.

**Acceptance:** `QR-AT-007~009/040/041/050`

## REQ-QR-009 — QR API and Persistence Contract

**Classification:** CAPSTONE-P1  
**Priority:** MUST

QR API는 공통 인증·Error·Correlation·Idempotency 계약을 재사용하고 별도 P1 OpenAPI로 정의해야 한다. 서버에는 raw QR Reference가 아닌 Hash만 저장하고, 하나의 Request·Decision·Grant Binding을 보장하는 Constraint와 Transactional Outbox 또는 동등한 원자성 패턴을 적용해야 한다.

**Acceptance:** `QR-AT-025/027/033~043/052~058`

## 34.3 Amendment Traceability

| Requirement | Detailed source | Security/Threat | Acceptance | Status |
|---|---|---|---|---|
| REQ-MOB-020 | `MOBILE-APPLICATION-REQUIREMENTS.md` | `SEC-MOB-*`, `THR-MOB-*` | `MAPP-*` summaries | DOCUMENTED / NOT RUN |
| REQ-MOB-021~026 | Mobile API/Architecture/Capsule/UX | `SEC-MOB-010~019`, `THR-MOB-005~023` | TC-MOB + MAPP matrices | DOCUMENTED / NOT RUN |
| REQ-QR-001~009 | `architecture/qr/*` | `QR-T01~T15` | `QR-AT-001~058` | DOCUMENTED / NOT RUN |

## 34.4 Scope and implementation boundary

- QR Handoff와 Mobile Secure Vault는 `CAPSTONE-P1`이며 P0 완료를 차단하지 않는다.
- 기존 P0 `OPENAPI.yaml`, 현재 18-table baseline 및 P0 성공조건은 본 Amendment로 자동 변경되지 않는다.
- P1 구현 전에 별도 Mobile/QR OpenAPI, Database Migration, 구현 Ticket 및 실행 가능한 Acceptance Test가 승인되어야 한다.
- QR은 영상 전송 프로토콜이 아니다. 실제 영상 조회·전송은 기존 HTTPS/DICOMweb WADO-RS/STOW-RS 경로를 사용한다.
- Mobile App과 Browser는 Hospital PACS를 직접 호출하지 않는다.
- Cloud는 Permanent PACS 또는 장기 Mobile Backup으로 사용하지 않는다.

---

# 35. Change Coverage Audit — 2026-09-21

| Change area | Reflected in base requirements | Result |
|---|---|---|
| Hospital PACS Source of Record / no permanent Cloud PACS | REQ-DATA-004/005, REQ-VIEW-006/009 | YES |
| Cloud Viewer on-demand WADO-RS | REQ-VIEW-004~009 | YES |
| Patient Mobile Vault local viewer | REQ-MOB-VIEW-001, REQ-MOB-008~009 | YES |
| Android-first, StrongBox/TEE admission | REQ-MOB-010/011 | YES |
| AES-GCM Capsule, Key lifecycle, PQC agility | REQ-MOB-012/017/018, REQ-MOB-022/023 | YES |
| 30-day Offline Lease | REQ-MOB-013 | YES |
| Background/capture/lost-device policy | REQ-MOB-014~016, REQ-MOB-025 | YES |
| Device-bound Mobile API and resume | REQ-MOB-019/021/023 | YES |
| Detailed mobile functional/performance/UX requirements | REQ-MOB-020~026 + `MAPP-*` | YES |
| QR Payload/API/UI/State/Replay/Threat/Grant/Test | REQ-QR-001~009 + `architecture/qr/*` | YES |
| Mobile-to-PACS direct upload | Explicitly excluded | YES |
| P0 success-condition preservation | Section 34.4 | YES |

## 35.1 Identifier correction

과거 Viewer Amendment에서 `REQ-MOB-007`이 기존 `Crypto-Shredding` 요구사항과 중복 사용되었다. 다음과 같이 정규화한다.

```text
REQ-MOB-007
→ Crypto-Shredding (기존 ID 유지)

REQ-MOB-VIEW-001
→ Patient Mobile Vault Viewer (중복 ID에서 변경)
```

기존 Acceptance ID `TC-MOB-007`은 Mobile Vault Viewer 시험으로 유지한다. 이는 Requirement ID와 Test ID가 반드시 같은 숫자를 사용해야 한다는 의미가 아니다.

## 35.2 Current readiness

```text
P0 REQUIREMENTS:
UNCHANGED

P1 MOBILE REQUIREMENTS:
CONSOLIDATED

P1 QR REQUIREMENTS:
ADDED

REQUIREMENT ID COLLISION:
RESOLVED

CODE / API / DB IMPLEMENTATION:
NOT PERFORMED

TEST EXECUTION:
NOT RUN

BASELINE STATUS:
APPROVED REQUIREMENTS — IMPLEMENTATION EVIDENCE PENDING
```

---

# Synthetic Health Data Preview Requirements Amendment — 2026-09-26

다음 Requirement는 `CAPSTONE-P1 PROTOTYPE`이며 P0 완료조건에 포함되지 않는다.

| ID | Requirement | Classification | Verification |
|---|---|---|---|
| `REQ-HHP-001` | Preview는 P0와 분리된 Optional P1 Module이어야 한다. | CAPSTONE-P1 | Dependency test |
| `REQ-HHP-002` | 모든 Preview 화면과 캡처에 `DEMO MODE`와 실제 연계 미완료를 표시해야 한다. | CAPSTONE-P1 | UI test |
| `REQ-HHP-003` | `TEST-*` Identity, `sourceMode=SYNTHETIC`, `providerMode=MOCK`만 허용해야 한다. | CAPSTONE-P1 | Fixture validation |
| `REQ-HHP-004` | Capstone Build는 실제 건강정보 기관 API·Credential·인증서를 사용해서는 안 된다. | CAPSTONE-P1 | Network/config test |
| `REQ-HHP-005` | Mock Consent는 실제 Consent, Authorization, Transfer Grant와 분리해야 한다. | CAPSTONE-P1 | Domain/security test |
| `REQ-HHP-006` | 합성 Record에 Source Mode, Scenario, Fixture Version과 비진단 고지를 표시해야 한다. | CAPSTONE-P1 | UI/contract test |
| `REQ-HHP-007` | 사용자는 Preview Session과 합성 Cache를 초기화할 수 있어야 한다. | CAPSTONE-P1 | Functional test |
| `REQ-HHP-008` | 승인·공식연계로 오인시키는 문구·Logo·Badge를 금지해야 한다. | CAPSTONE-P1 | Content test |
| `REQ-HHP-009` | Preview Record를 의료진 공유, PACS Import 또는 의료적 판단에 사용할 수 없어야 한다. | CAPSTONE-P1 | Negative test |
| `REQ-HHP-010` | 실제 Provider는 지정심사·테스트베드·법률·OpenAPI·Security Gate 후에만 활성화해야 한다. | PRODUCTIONIZATION | Governance review |
| `REQ-HHP-011` | Preview는 건강검진·일반 혈액검사·항체검사를 구분된 Synthetic Record Type으로 표시해야 한다. | CAPSTONE-P1 | Fixture/UI test |
| `REQ-HHP-012` | 검사명·코드·일시·값·단위·출처 제공 참고범위·출처를 손실 없이 표시해야 한다. | CAPSTONE-P1 | Contract/UI test |
| `REQ-HHP-013` | MediQ는 검사값으로 정상·비정상·면역·질환 여부를 추론해서는 안 된다. | CAPSTONE-P1 | Content negative test |
| `REQ-HHP-014` | 합성 영상과 검사정보는 명시된 Fixture Link만 관련 기록으로 표시해야 한다. | CAPSTONE-P1 | Relationship test |
| `REQ-HHP-015` | 실제 Provider는 기관별 코드·단위·최신성 차이를 보존하고 누락값을 추정하지 않아야 한다. | PRODUCTIONIZATION | Interoperability test |

`SYNTHETIC-HEALTH-DATA-PREVIEW.md`가 이 Requirement의 상세 UX·상태·Fixture 계약을 정의한다. 현재 OpenAPI에는 Health Data Preview Endpoint가 없으며, 문서 개정만으로 API 또는 기능이 구현된 것으로 간주하지 않는다.

# Patient Experience Requirements Amendment — 2026-09-26

## Requirement Ranges

| 기능 | 분류 | Requirement Range | 상세 기준 |
|---|---|---|---|
| 행동센터 | P1 | `REQ-PXE-AC-001~008` | `patient-experience/01-ACTION-CENTER-SPEC.md` |
| 접근이력·영수증 | P1 | `REQ-PXE-AR-001~008` | `patient-experience/02-PATIENT-ACCESS-RECEIPT-SPEC.md` |
| 개인정보 최소 알림 | P1 | `REQ-PXE-NT-001~008` | `patient-experience/03-PRIVACY-SAFE-NOTIFICATIONS-SPEC.md` |
| 병원 방문 모드 | P1 | `REQ-PXE-VM-001~008` | `patient-experience/04-HOSPITAL-VISIT-MODE-SPEC.md` |
| 쉬운 영상 카드 | P1 | `REQ-PXE-IC-001~008` | `patient-experience/05-PLAIN-LANGUAGE-IMAGING-CARDS-SPEC.md` |
| 저장공간·만료 | P1 | `REQ-PXE-SE-001~008` | `patient-experience/06-STORAGE-AND-EXPIRY-MANAGEMENT-SPEC.md` |
| 오류 복구 | P1 | `REQ-PXE-ER-001~008` | `patient-experience/07-PATIENT-FRIENDLY-ERROR-RECOVERY-SPEC.md` |
| 판독문·의뢰서 | POST-MVP | `REQ-PXE-RR-001~008` | `patient-experience/08-RADIOLOGY-REPORT-REFERRAL-BUNDLE-SPEC.md` |
| 보호자·가족 위임 | POST-MVP | `REQ-PXE-GD-001~009` | `patient-experience/09-GUARDIAN-FAMILY-DELEGATION-SPEC.md` |

이 Requirement들은 기존 Consent·Authorization·Grant·Tenant·PACS/DICOMweb 요구사항에 추가 적용한다. 구현 전 해당 Feature의 API GAP를 `OPENAPI.yaml`에 승인하고, 영속 객체가 필요하면 Domain/Data/ERD와 Migration을 같은 Ticket에서 갱신해야 한다. 현재 상태는 `DOCUMENTED — NOT IMPLEMENTED / NOT TESTED`다.

# Hospital Clinical Workflow Requirements Amendment — 2026-09-27

## Requirement Ranges

| 기능 | 분류 | Requirement Range | 상세 기준 |
|---|---|---|---|
| 관련 과거 영상 | P1 | `REQ-HCW-PR-001~008` | `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md` §6 |
| 진료 인계 패킷 | P1 | `REQ-HCW-HP-001~009` | 같은 문서 §7 |
| 팀 배정·인계 | P1 | `REQ-HCW-AS-001~008` | 같은 문서 §8 |
| 병원 알림함 | P1 | `REQ-HCW-NT-001~008` | 같은 문서 §9 |
| 감사·출처 타임라인 | P1 | `REQ-HCW-AT-001~008` | 같은 문서 §10 |

공통 요구사항:

- P0 `HOSPITAL_USER`의 권한을 암묵적으로 세부 역할에 상속하지 않는다.
- 후보 Study, 패킷 Resource, Assignment 대상과 Notification 대상은 Tenant/Hospital/Object Scope를 서버에서 검증한다.
- 배정·알림·Deep Link·Timeline은 권한이 아니며 보호 자원 접근 직전에 재인가한다.
- 판독문·의뢰서 Payload는 별도 Resource Scope가 없는 P1에서 표시하지 않는다.
- 관련 API는 현재 GAP이며 구현 Ticket에서 `OPENAPI.yaml`, 오류모델, Idempotency, Pagination과 Contract Test를 함께 승인한다.

현재 상태는 `APPROVED REQUIREMENTS — NOT IMPLEMENTED / NOT TESTED`다.
