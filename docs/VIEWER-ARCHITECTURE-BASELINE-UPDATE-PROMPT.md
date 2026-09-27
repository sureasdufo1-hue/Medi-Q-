# MediQ Viewer Architecture Baseline Update Prompt

## 1. 역할

당신은 다음 역할을 동시에 수행하는 **MediQ 공식 기준문서 정합성 개정 책임자**다.

- Senior Software Architect
- PACS / DICOM / DICOMweb Engineer
- SaaS Platform Architect
- Mobile Security Architect
- Application Security Engineer
- Privacy-by-Design Engineer
- Product / Requirements Analyst
- API Contract Engineer
- Data Model and Traceability Auditor

목표는 현재 Repository에 등록된 MediQ 공식 기준문서를 읽고, 아래에서 확정한 제품·아키텍처 결정을 모든 관련 문서에 일관되게 반영하는 것이다.

이 작업은 구현 작업이 아니다. 코드, Docker, Migration, 테스트 구현을 시작하지 않는다. 문서 기준선만 개정하고 문서 간 모순과 추적성을 검증한다.

---

## 2. 최상위 제품 결정

다음 결정을 MediQ의 공식 기준으로 반영하라.

> MediQ는 각 병원의 PACS를 의료영상 원본 저장소이자 Source of Record로 유지하며, 클라우드에 장기보존용 영상 저장소나 영구 Cloud PACS를 구축하지 않는다.

> 병원 또는 환자가 승인된 의료영상 조회를 요청하면 MediQ는 Consent, Authorization, Tenant Isolation 및 Scoped Transfer Grant를 검증한 뒤, 원본 영상을 보유한 병원 PACS에서 필요한 Study·Series·Instance·Frame을 DICOMweb으로 온디맨드 조회하여 Cloud Web Viewer에 전달한다.

> 환자 모바일 기기에 명시적으로 Export되어 저장된 의료영상은 Mobile Secure Vault 내부에서 환자가 열람할 수 있어야 한다.

> MediQ Cloud는 의료영상 원본 보관소가 아니라 Patient-Controlled Medical Imaging Exchange 및 Authorized Viewer Gateway다.

---

## 3. 필수 아키텍처 경계

다음 경계를 임의로 변경하지 마라.

```text
Hospital A PACS
  = Source of Record
  = Original Medical Imaging Custodian

MediQ Cloud
  = Exchange Orchestrator
  = Authorization Gateway
  = On-Demand DICOMweb Retrieval Proxy
  = Cloud Web Viewer Delivery Gateway
  = Temporary/Ephemeral Processing Only
  != Permanent Cloud PACS
  != Long-Term Medical Imaging Archive

Hospital B PACS
  = Authorized Destination Imported Copy

Mobile Secure Vault
  = Patient-Controlled Local Encrypted Storage
  = Patient Mobile Viewer Data Source
  = P1 Extension
```

클라우드에 의료영상 복사본이 필요한 경우 다음으로 제한한다.

- 요청 처리 중 메모리 버퍼
- 제한된 수명의 암호화된 임시 캐시
- Viewer 전달 또는 전송 재시도를 위한 bounded temporary object
- 명시된 TTL, 삭제 조건, Audit 및 lifecycle control

클라우드 임시 복사본을 장기보존, 진료기록 원본, 백업 PACS 또는 영구 환자 Vault로 표현하지 마라.

---

## 4. 용어 결정

일반적인 동영상 스트리밍과 혼동하지 않도록 공식 용어를 다음처럼 사용하라.

```text
Authorized On-Demand DICOMweb Retrieval
Progressive DICOM Viewer Delivery
DICOMweb Proxy Rendering Path
WADO-RS Study / Series / Instance / Frame Retrieval
```

사용자 설명에서는 “스트리밍 방식 조회”라고 표현할 수 있으나, 기술 문서에서는 HTTP video streaming으로 오인되지 않도록 DICOMweb 기반 온디맨드·점진적 조회라고 정의한다.

---

## 5. P0 / P1 분류

다음 우선순위를 유지하라.

### CAPSTONE-P0

- Hospital A/B Test Orthanc
- Source PACS에서 DICOMweb 기반 On-Demand Retrieval
- Cloud Web Viewer
- 승인된 Hospital User의 Viewer 접근
- Synthetic Patient의 승인된 Cloud Viewer 접근
- Viewer Session과 short-lived `study:view` Grant
- DICOM Download
- Hospital B STOW-RS PACS Import
- Temporary/Ephemeral Cloud Processing
- Consent, Authorization, Tenant Isolation
- Integrity, Provenance, Audit
- Viewer direct URL / UID bypass 방지

### CAPSTONE-P1

- Mobile Secure Vault
- Secure Medical Capsule
- `study:mobile-export`
- 환자 모바일 기기의 암호화된 로컬 저장
- Mobile Vault에 저장된 영상의 Patient Mobile Viewer
- Device Binding, hardware-backed key, biometric unlock
- Mobile export revoke/expire/delete policy

### 현재 범위 밖

- Permanent Cloud PACS
- Cloud 장기 영상 보존
- MediQ Cloud를 의료영상 Source of Record로 사용하는 구조
- 전체 EMR/PHR 플랫폼
- 실제 환자·실제 병원 Production deployment
- 법적 보존 의무를 수행하는 Production archive

P1 Mobile 기능 때문에 P0 E2E 일정과 완료조건을 변경하지 마라.

---

## 6. 필수 사용자 흐름

### 6.1 Hospital Cloud Viewer

```text
Hospital User Viewer Request
→ Authentication
→ Tenant and Organization Validation
→ Patient Mapping Validation
→ Consent Validation
→ Authorization Decision
→ Short-Lived study:view Grant
→ Viewer Session Creation
→ MediQ DICOMweb Gateway
→ Source Hospital PACS WADO-RS Retrieval
→ Progressive Viewer Delivery
→ Audit / Provenance
```

### 6.2 Patient Cloud Viewer

```text
Synthetic Patient Viewer Request
→ Patient Authentication Context
→ PatientReference Binding
→ Consent / Purpose / Scope Validation
→ Short-Lived study:view Grant
→ Viewer Session Creation
→ Source Hospital PACS On-Demand Retrieval
→ Cloud Web Viewer
→ Audit / Provenance
```

### 6.3 Patient Mobile Vault Viewer — P1

```text
Authorized MOBILE_EXPORT Request
→ study:mobile-export Grant
→ Secure Medical Capsule
→ Device Binding
→ Encrypted Mobile Secure Vault Storage
→ Patient Device Authentication / Biometric Unlock
→ Local Patient Mobile Viewer
→ Local Access Audit / Synchronizable Non-Sensitive Event
```

### 6.4 Hospital B PACS Import

기존 P0 흐름을 유지한다.

```text
PACS_IMPORT Request
→ Mandatory Preflight
→ Destination / Tenant / Patient Mapping Validation
→ Consent / Authorization / Grant Validation
→ Source Retrieval
→ Integrity and Provenance
→ STOW-RS to Hospital B
→ Destination Verification
→ Audit
→ COMPLETED
```

---

## 7. Viewer 보안 불변조건

다음을 모든 관련 문서에 반영하라.

- Hospital PACS를 Browser 또는 Public Internet에 직접 노출하지 않는다.
- Viewer는 MediQ Authorization Gateway를 반드시 통과한다.
- PACS credential, internal endpoint, raw access token을 Browser나 Mobile App에 전달하지 않는다.
- DICOM UID 또는 Viewer URL을 아는 것만으로 영상을 조회할 수 없어야 한다.
- Viewer Session과 Grant는 짧은 만료시간을 가져야 한다.
- `study:view`는 `study:download`, `study:pacs-transfer`, `study:mobile-export`를 허용하지 않는다.
- 요청별 Tenant, Actor, PatientReference, Source Hospital, Study Scope를 검증한다.
- Consent 철회, Grant 만료, Patient Mapping 오류, Source/Destination mismatch, Cross-Tenant 요청은 fail closed 한다.
- Viewer response와 cache에 민감정보가 불필요하게 남지 않게 한다.
- CDN, reverse proxy, browser cache, service worker, 로그의 PHI/DICOM caching 위험을 명시적으로 통제한다.
- Source PACS를 사용할 수 없으면 과거 영상을 영구 Cloud Copy에서 제공하지 않고, 명확한 실패 상태와 Audit Event를 남긴다.
- 모든 Viewer open, series/instance/frame retrieval, deny, expiry, close 이벤트를 추적 가능하게 한다.

---

## 8. Mobile Secure Vault 보안 불변조건

- Mobile Vault의 영상은 기기 저장 시 암호화한다.
- Device Binding과 환자 인증 없이 복호화하지 않는다.
- 원본 DICOM과 파생 렌더링 데이터의 저장 위치·수명·삭제 정책을 구분한다.
- 앱 외부의 Gallery, 일반 Download 폴더, 공유 Storage에 자동 저장하지 않는다.
- Screenshot, screen recording, export/share 정책은 위협 모델과 요구사항에서 명시적으로 결정한다.
- 기기 분실, 앱 제거, 계정 revoke, capsule expiry 시 접근 차단 또는 crypto-shredding 정책을 정의한다.
- Cloud의 Consent 철회가 이미 환자 기기에 합법적으로 Export된 Copy에 미치는 한계를 문서화한다.
- Mobile Viewer를 Cloud Viewer와 동일한 데이터 경로로 잘못 표현하지 않는다. Mobile Viewer는 Vault에 저장된 로컬 암호화 Copy를 열람한다.

---

## 9. 수정 대상 문서와 작업 지시

다음 순서로 문서를 읽고 수정하라.

### 9.1 `PROJECT-CHARTER.md`

- 제품 비전에 Source PACS 원본 유지와 No Permanent Cloud PACS 원칙을 강화한다.
- 병원·환자의 Cloud Viewer와 P1 Mobile Vault Viewer 관계를 명확히 한다.
- 기존 P0/P1 완료 경계를 훼손하지 않는다.

### 9.2 `CAPSTONE-MVP-BOUNDARY.md`

- P0 Cloud Viewer 사용자를 Hospital User와 Synthetic Patient로 명확히 분류한다.
- On-Demand DICOMweb Retrieval을 P0 Mandatory Scope에 추가한다.
- Permanent Cloud Storage를 명시적 Out-of-Scope로 유지한다.
- Mobile Vault Viewer는 P1로 고정한다.

### 9.3 `PRODUCT-BASELINE.md`

- MediQ의 역할을 Exchange Broker + Authorized Viewer Gateway로 정의한다.
- Source of Record, Destination Imported Copy, Temporary Cloud Processing, Mobile Local Copy를 구분한다.
- Hospital Viewer, Patient Cloud Viewer, Patient Mobile Viewer의 제품 경계를 작성한다.

### 9.4 `REQUIREMENTS.md`

다음 요구사항을 추가하거나 기존 요구사항을 정교화한다.

- Hospital Cloud Viewer
- Patient Cloud Viewer
- Source PACS On-Demand Retrieval
- Progressive Series/Instance/Frame Delivery
- Viewer Session lifecycle와 short-lived Grant
- No direct PACS access
- No permanent cloud retention
- Temporary cache TTL와 purge
- Source PACS unavailable fail-closed behavior
- Mobile Secure Vault local viewing — P1
- Mobile encrypted storage and device binding — P1

각 요구사항에 ID, Priority, Rationale, Security Traceability, Acceptance Test를 지정한다. 기존 ID 체계를 깨뜨리지 않는다.

### 9.5 `SECURITY-REQUIREMENTS.md`

- Viewer Gateway trust boundary
- Browser/PACS credential isolation
- Direct URL 및 UID replay 방지
- Viewer Session expiry/revocation
- Response/cache/log data minimization
- Cross-tenant Patient/Hospital Viewer denial
- Mobile vault encryption, key binding, local access control
- Cloud revoke와 exported mobile copy의 정책 경계

를 추가한다.

### 9.6 `DOMAIN-MODEL.md`

다음 개념이 기존 Aggregate와 어떤 관계인지 정의한다.

- ViewerSession
- ViewerActorType: `HOSPITAL_USER`, `PATIENT`
- ImagingAccessRequest
- TemporaryImagingObject 또는 동등한 ephemeral reference
- MobileVault / SecureMedicalCapsule — P1

새 Aggregate가 반드시 필요한지 먼저 검토한다. 기존 `ExchangeSession`, `TransferGrant`, `ImagingPackage`로 표현 가능한 개념을 중복 Entity로 만들지 않는다.

### 9.7 `DATA-FLOW.md`

Hospital Cloud Viewer, Patient Cloud Viewer, Mobile Vault Viewer의 흐름을 별도 sequence로 작성한다.

특히 다음을 표시한다.

- 요청 시점의 Authorization
- WADO-RS 호출 위치
- PACS credential이 Backend 경계 밖으로 나가지 않음
- Cloud temporary buffer/cache의 생성·TTL·삭제
- Viewer Event Audit
- Source PACS unavailable 경로

### 9.8 `DATA-MODEL.md` 및 `ERD.md`

- ViewerSession 또는 Temporary Object persistence가 실제로 필요한 경우에만 schema 변경을 제안한다.
- 영상 Payload 자체를 PostgreSQL 장기 저장 모델로 추가하지 않는다.
- TTL, expires_at, revoked_at, purged_at, source binding, tenant binding을 검토한다.
- P1 Mobile metadata는 P0 17-table baseline을 무단으로 확장하지 말고 P1 extension으로 분리한다.
- DATA-MODEL과 ERD를 항상 동기화한다.

### 9.9 `SYSTEM-ARCHITECTURE.md`

- MediQ Cloud Viewer Gateway와 DICOMweb Proxy 경계를 명확히 그린다.
- Hospital PACS direct exposure 금지 구조를 표시한다.
- On-Demand Retrieval과 bounded temporary cache를 구분한다.
- Hospital Viewer, Patient Cloud Viewer, Patient Mobile Viewer 경로를 분리한다.
- Source PACS availability dependency와 장애 동작을 작성한다.
- Mobile Secure Vault는 P1 extension으로 유지한다.

### 9.10 `OPENAPI.yaml`

- Database CRUD가 아니라 업무 행위 중심 Contract를 유지한다.
- 기존 viewer action endpoint를 Hospital/Patient actor와 ViewerSession lifecycle에 맞게 검토한다.
- short-lived viewer access, retrieval scope, expiration, deny error를 표현한다.
- PACS endpoint와 credential을 response에 노출하지 않는다.
- Mobile Export와 Mobile Vault metadata는 P1로 명확히 구분한다.
- OpenAPI 3.1 YAML parsing을 검증한다.

필요하다면 `OPENAPI.md` 설명본도 함께 갱신하되 `OPENAPI.yaml`과 내용이 충돌하지 않게 한다.

### 9.11 `THREAT-MODEL.md`

다음 위협을 추가하거나 강화한다.

- Stolen Viewer URL / Token Replay
- Guessable Study or DICOM UID
- Direct PACS Endpoint Exposure
- PACS Credential Leakage
- Cross-Tenant Viewer Access
- Browser/CDN/Proxy Cache Persistence
- Temporary Cloud Object Not Purged
- Consent Revocation Race
- Source PACS Substitution
- Mobile Device Loss or Compromise
- Mobile Vault Data Exfiltration
- Screenshot / Screen Recording Leakage
- Offline Export Revocation Limitation

각 위협을 요구사항, 통제, Acceptance Test에 연결한다.

### 9.12 `ACCEPTANCE-TESTS.md`

최소 다음 PASS/DENY 테스트를 추가한다.

```text
Hospital User + valid study:view
→ Cloud Viewer PASS

Synthetic Patient + valid PatientReference + valid study:view
→ Cloud Viewer PASS

VIEW-only Grant
→ Download / PACS Import / Mobile Export DENY

Expired or revoked Viewer Session
→ Instance / Frame Retrieval DENY

Cross-Tenant Viewer Request
→ DENY

Direct DICOM UID or PACS URL Request
→ DENY

Source PACS Unavailable
→ Viewer fails closed + Audit PASS

Temporary Cache TTL Expired
→ Object Purged PASS

Browser/Proxy Response
→ No PACS Credential / Internal Endpoint Leakage PASS

P1 Mobile Vault + authorized local patient
→ Stored Image View PASS

P1 Lost/Unbound Device
→ Vault Decryption DENY
```

### 9.13 `IMPLEMENTATION-PLAN.md`

- Cloud Viewer 구현을 ViewerSession → Authorization → DICOMweb Gateway → Progressive Delivery → Audit 단위 Ticket으로 세분화한다.
- Temporary cache lifecycle과 purge Ticket을 추가한다.
- Patient Cloud Viewer를 P0에 포함하되 Synthetic/Test Identity 경계를 명시한다.
- Mobile Secure Vault Viewer는 P1로 분리한다.
- DICOMweb integration과 Viewer 구현의 dependency를 명시한다.
- Acceptance Test가 없는 Ticket을 DONE으로 표시하지 않는다.

### 9.14 `REPOSITORY-BASELINE-AUDIT.md`

- 문서 개정 후에도 실제 구현 상태는 자동으로 상승시키지 않는다.
- 새 Architecture/Requirement는 `PLANNED`, `MISSING`, `NOT STARTED`로 반영한다.
- 테스트가 없는 기능은 PASS로 표시하지 않는다.
- 다음 권장 구현 Ticket이 변경되는지 재평가한다.

### 9.15 `README.md` 및 `AGENTS.md`

- README의 짧은 제품 정의와 문서 색인을 갱신한다.
- AGENTS.md에 No Permanent Cloud PACS, PACS Direct Exposure 금지, Viewer Grant 격리, Mobile P1 경계를 추가한다.
- 프로젝트 설명을 중복하여 문서를 불필요하게 비대화하지 않는다.

---

## 10. 문서 정합성 규칙

- 모든 문서에서 같은 개념에 같은 용어를 사용한다.
- `VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT` Scope를 분리한다.
- Hospital Viewer와 Patient Viewer의 Actor·Tenant·Patient binding 차이를 명시한다.
- Cloud Viewer와 Mobile Vault Viewer의 데이터 소스를 구분한다.
- Source PACS가 원본이라는 결정을 변경하지 않는다.
- Temporary Copy를 Permanent Copy처럼 표현하지 않는다.
- P1 Mobile 기능을 P0 완료조건으로 승격하지 않는다.
- 실제 환자 인증, 실제 병원 Network, Production 법적 검증을 완료된 것으로 표현하지 않는다.
- 새 Requirement, Security Control, Threat, API, Acceptance Test 및 Implementation Ticket을 traceability로 연결한다.

---

## 11. 충돌 처리

기존 문서에서 다음 표현을 발견하면 충돌로 분류하고 수정하라.

- MediQ가 의료영상의 영구 원본을 보유한다는 표현
- Cloud PACS 또는 장기 Archive를 P0로 요구하는 표현
- Browser가 Hospital PACS를 직접 호출하는 구조
- Viewer URL만으로 영상을 조회할 수 있는 구조
- `study:view`로 Download/PACS Import/Mobile Export가 가능한 구조
- Mobile Viewer가 P0 완료를 차단하는 구조
- Mobile Vault Copy와 Cloud Temporary Copy를 동일하게 취급하는 구조
- 환자의 Cloud Viewer 접근과 Mobile Viewer 접근을 구분하지 않은 구조

충돌 수정 시 기존 의미를 조용히 삭제하지 말고 변경 이유를 문서 Decision 또는 Revision Note에 기록하라.

---

## 12. 작업 순서

```text
1. git status / branch / HEAD 확인
2. 승인 문서 전체 읽기
3. 현재 용어·범위·모순 목록 작성
4. 영향 문서와 Traceability Matrix 작성
5. PROJECT-CHARTER / MVP-BOUNDARY 수정
6. PRODUCT / REQUIREMENTS / SECURITY 수정
7. DOMAIN / DATA / ERD 수정
8. ARCHITECTURE / DATA-FLOW 수정
9. OPENAPI 수정 및 YAML 검증
10. THREAT-MODEL / ACCEPTANCE-TESTS 수정
11. IMPLEMENTATION-PLAN / AUDIT / README / AGENTS 수정
12. 문서 간 용어·ID·P0/P1 정합성 재검증
13. 실제 변경사항과 미해결 충돌 보고
```

기존 사용자 변경을 삭제하거나 reset하지 않는다. 실제 구현 상태를 문서 변경만으로 PASS 또는 DONE으로 올리지 않는다.

---

## 13. 완료 검증

다음 질문에 모두 근거와 함께 답하라.

```text
1. Hospital PACS가 Source of Record로 일관되게 표현되는가?
2. MediQ Cloud에 Permanent PACS/Long-Term Archive가 없는가?
3. Cloud Viewer가 On-Demand DICOMweb Retrieval을 사용하는가?
4. Hospital Viewer와 Patient Cloud Viewer가 모두 정의되었는가?
5. Patient Mobile Viewer가 P1 Mobile Vault 경로로 분리되었는가?
6. PACS credential과 endpoint가 Client에 노출되지 않는가?
7. Viewer Grant가 short-lived이고 action scope가 격리되는가?
8. Temporary cache TTL/purge가 요구사항·위협·테스트에 연결되는가?
9. Consent revoke와 Source PACS unavailable이 fail closed 되는가?
10. 문서 개정만으로 구현 상태를 PASS 처리하지 않았는가?
11. OpenAPI YAML이 파싱되는가?
12. Requirement → Security → Threat → API → Acceptance → Ticket 추적성이 유지되는가?
```

하나라도 검증할 수 없으면 해당 항목을 `PARTIAL` 또는 `BLOCKED`로 보고한다.

---

## 14. 최종 보고 형식

```text
CHANGE OBJECTIVE:
MediQ Viewer and Storage Architecture Baseline Alignment

DOCUMENTS REVIEWED:
<list>

DOCUMENTS CHANGED:
<list>

CORE DECISIONS APPLIED:
- Hospital PACS = Source of Record
- MediQ Cloud = No Permanent PACS
- Cloud Viewer = Authorized On-Demand DICOMweb Retrieval
- Patient Cloud Viewer = P0 Synthetic/Test Scope
- Patient Mobile Viewer = P1 Mobile Secure Vault

BASELINE CONFLICTS FOUND:
<number and list>

TRACEABILITY UPDATED:
PASS / PARTIAL / BLOCKED

OPENAPI YAML VALIDATION:
PASS / FAIL / NOT RUN

IMPLEMENTATION STATUS CHANGED:
NO, unless actual implementation evidence exists

TESTS EXECUTED:
<document/schema validation only>

REMAINING DECISIONS:
<list>

STATUS:
PASS / PARTIAL / BLOCKED
```

---

# FINAL INSTRUCTION

현재 MediQ Repository의 승인된 문서를 실제로 읽고, 위 결정을 관련 문서 전체에 최소 변경으로 반영하라.

가장 중요한 결과는 다음 문장이 모든 공식 문서에서 모순 없이 유지되는 것이다.

> **MediQ는 병원 PACS를 의료영상의 Source of Record로 유지하고, 클라우드에 영구 PACS나 장기 영상 Archive를 구축하지 않으며, 승인된 병원 또는 환자의 요청에 따라 원본 PACS에서 DICOMweb으로 영상을 온디맨드 조회하여 Cloud Viewer에 전달한다. 환자 모바일 기기에 명시적으로 Export된 영상은 P1 Mobile Secure Vault에서 환자가 안전하게 열람한다.**

문서 수정만으로 기능이 구현되었다고 표시하지 말고, 테스트하지 않은 항목을 PASS 또는 DONE이라고 보고하지 마라.

