# MediQ Capstone MVP Boundary

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document Type:** Normative Scope Boundary
**Version:** v1.7 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ 프로젝트의 **캡스톤 MVP 구현 범위와 비범위를 강제하기 위한 Scope Boundary 문서**다.

`PROJECT-CHARTER.md`가 MediQ의 목적과 비전을 정의한다면, 본 문서는 다음을 결정한다.

> **현재 무엇을 구현해야 하는가?**

> **무엇을 구현하면 안 되는가?**

> **어떤 요구사항이 P0 완료를 차단할 수 있는가?**

> **어떤 요구사항은 향후 Productionization으로 이관해야 하는가?**

본 문서의 최우선 목적은 **Scope Expansion으로 인해 P0 End-to-End MVP가 지연되는 것을 방지하는 것**이다.

## 1.1 2026-09-26 편의·외부 AI 범위 결정

- 통합 타임라인, 쉬운 모드, 검색·즐겨찾기, 진료 준비, 합성 검사 추세와 수동 일정은 P0를 차단하지 않는 `CAPSTONE-P1`이다.
- `AI 질문용 자료 만들기`는 `TEST/SYNTHETIC/MOCK` 검사자료의 On-device 최소화, Preview와 Local Clipboard 복사만 허용하는 `CAPSTONE-P1` 시연이다.
- 외부 LLM API, Provider Deep Link, 자동 Paste·Upload·Send, 답변의 의료기록 재수입은 Capstone 범위 밖이다.
- 실제 환자자료의 Copy·Capture·외부 LLM 제공은 개인정보·법률·보안·Provider 보존/학습·국외처리 검토가 필요한 `PRODUCTIONIZATION`이며 기본 비활성이다.

## 1.2 합성 환자 설명 RAG 범위 결정

- 승인된 Local Synthetic Knowledge Pack만 검색하는 환자 설명·질문 준비 RAG는 P0를 차단하지 않는 `CAPSTONE-P1`이다.
- 첫 구현은 Deterministic Mock Generator이며 Local LLM은 별도 Synthetic-only Spike와 안전성 평가 Gate 이후에만 검토한다.
- 인터넷·일반 Web Retrieval, 실제 환자정보, 진단·처방·판독·응급도 판단, 외부 LLM 전송과 사용자 자료 학습은 범위 밖이다.
- RAG 결과는 Consent, Authorization, Grant, Mandatory Preflight, Viewer, PACS Import 또는 의료기록의 입력이 될 수 없다.

---

# 2. Capstone Mission

현재 MediQ의 최우선 목표는 다음과 같다.

> **Synthetic/Test DICOM 환경에서 Hospital A의 CT·MRI를 MediQ가 DICOMweb으로 조회하고, 환자 동의 Workflow 및 Authorization을 거쳐 Hospital B가 Web Viewer로 조회하거나 DICOM으로 다운로드하거나 Test PACS로 수신할 수 있는 End-to-End 의료영상 이동 SaaS MVP를 구현하고 검증한다.**

현재 목표는 실제 의료기관 상용서비스 구축이 아니다.

---

# 3. Priority Order

현재 개발 우선순위를 다음과 같이 고정한다.

```text
PRIORITY 1
CAPSTONE P0 E2E MVP

PRIORITY 2
P0 Security Validation

PRIORITY 3
P1 Mobile Secure Vault

PRIORITY 4
Architecture Hardening

PRIORITY 5
Productionization
```

하위 Priority 기능은 상위 Priority의 완료를 지연시켜서는 안 된다.

---

# 4. Current Success Boundary

현재 프로젝트의 성공기준은 다음 질문으로 판단한다.

> **Synthetic/Test 환경에서 A병원 → MediQ → B병원 의료영상 이동 Workflow가 실제로 동작하는가?**

아래 질문은 현재 성공기준이 아니다.

```text
실제 의료기관에서 운영 가능한가?
X

실제 환자 데이터를 처리할 수 있는가?
X

의료법·개인정보보호법 상용 적합성을 모두 검증했는가?
X

Production SLA를 만족하는가?
X
```

---

# 5. P0 End-to-End Boundary

P0 E2E의 기준 경로는 다음과 같다.

```text
Synthetic Patient
        │
        ▼

Hospital A
Test Orthanc / PACS
        │
        │ DICOMweb
        ▼

      MediQ

Patient Mapping
Exchange Session
Consent Workflow
Authorization
Transfer Grant
Imaging Package

        │

        ├──────────────┐
        │              │
        ▼              ▼

   Web Viewer      DICOM Download

        │
        │
        └──────────────┐
                       │
                       ▼

                   STOW-RS

                       │
                       ▼

                  Hospital B
                Test Orthanc/PACS
```

이 흐름의 완성이 P0 완료의 핵심이다.

---

# 6. P0 Mandatory Scope

다음 기능은 `CAPSTONE-P0`로 분류한다.

## 6.1 Test Hospital Environment

* Hospital A Test Orthanc
* Hospital B Test Orthanc
* Test DICOM Dataset
* Synthetic Patient
* Synthetic Hospital
* Test Credentials

---

## 6.2 DICOM Interoperability

* DICOM
* QIDO-RS
* WADO-RS
* STOW-RS
* Study Retrieval
* Study Transfer

---

## 6.3 Patient Reference

MediQ는 병원별 Patient ID가 동일하다고 가정하지 않는다.

최소 다음 Mapping을 구현한다.

```text
Hospital A Patient ID
        ↓
MediQ Patient Reference
        ↓
Hospital B Patient ID
```

예:

```text
TEST-A-001
    ↓
MQ-TEST-0001
    ↓
TEST-B-982
```

---

# 7. Exchange Session

모든 의료영상 교환은 `Exchange Session` 단위로 관리한다.

최소 관리항목:

```text
session_id

patient_ref

source_hospital

destination_hospital

requester

purpose

consent_status

authorization_status

access_mode

state

created_at

expires_at
```

최소 상태:

```text
REQUESTED

CONSENT_PENDING

AUTHORIZED

ACTIVE

COMPLETED

REJECTED

EXPIRED

REVOKED

FAILED
```

---

# 8. Consent Workflow Boundary

현재 Consent는:

> **법적으로 완결된 실제 의료기관 전자동의 시스템이 아니라, 환자의 동의를 전제로 의료영상 접근을 통제하는 Technical Workflow PoC**

로 정의한다.

Consent는 P0에서 반드시 구현하지만 실제 법적 효력 검증은 하지 않는다.

최소 흐름:

```text
Transfer Request
        ↓
Consent Request
        ↓
Synthetic Patient Approval
        ↓
Consent Artifact
        ↓
Authorization
```

P0 Synthetic Patient Approval은 검증된 signed test OIDC claim `mediq_patient_ref_id`를 server-owned Session/Consent의 PatientReference와 대조하는 Technical Workflow다. Claim·Session·Consent binding이 불일치하거나 assertion이 없으면 fail closed한다. 이 테스트 assertion은 실제 환자 본인확인, 설명·숙려 절차 또는 법적 동의를 의미하지 않으며 Authorization·Grant·영상 권한을 부여하지 않는다.

P0 Synthetic Patient Withdrawal도 같은 검증 claim과 exact server-owned Session/Consent binding을 사용해 `ACTIVE→WITHDRAWN` 및 Audit를 원자적으로 기록한다. 이는 technical Consent 철회만 입증하며 이미 완료된 PACS 반입, 다운로드 파일 또는 오프라인 사본을 원격 회수·삭제한다고 의미하지 않는다.

---

# 9. Authorization Boundary

Consent와 Authorization은 분리한다.

```text
Consent
=
환자가 제공에 동의했는가?
```

```text
Authorization
=
현재 요청자가 해당 Action을 수행할 권한이 있는가?
```

다음 Rule은 P0에서 검증한다.

```text
NO CONSENT
→ DENY
```

```text
VALID CONSENT
+
VALID AUTHORIZATION
→ CONTINUE
```

---

# 10. Transfer Grant

실제 Access를 제어하기 위해 Transfer Grant를 사용한다.

Scope 예:

```text
study:view

study:download

study:pacs-transfer
```

예:

```text
VIEW ONLY Grant

→ Viewer PASS
→ Download DENY
→ PACS Transfer DENY
```

다음은 Grant에 포함하지 않는다.

* DICOM Payload
* DEK
* KEK
* Password
* 장기 Credential

---

# 11. Imaging Package

Exchange Session과 실제 의료영상 데이터를 분리한다.

```text
Exchange Session
=
업무 / 동의 / 권한 / 상태

Imaging Package
=
CT / MRI 등 실제 Imaging Payload
```

최소 구조:

```text
Imaging Package

├─ Study
├─ Series
└─ SOP Instances
```

한 Session에 복수 Study를 포함할 수 있도록 확장 가능하게 설계한다.

---

# 12. Access Modes

P0에서 지원할 의료영상 Access Mode는 다음 세 가지다.

```text
VIEW

DOWNLOAD

PACS_IMPORT
```

각 Mode는 Transfer Grant Scope에 의해 통제한다.

P1:

```text
MOBILE_EXPORT
```

---

# 13. Web Viewer Boundary

Web Viewer는 P0에 포함한다.

목표:

```text
Authorized Session
        ↓
WADO-RS / Imaging Access
        ↓
Web Viewer
```

Viewer는 캡스톤 수준의 의료영상 확인 기능에 집중한다.

현재 P0에서 다음을 요구하지 않는다.

* 진단용 상용 Viewer 인증
* Advanced 3D Reconstruction
* AI 판독
* Radiology Workstation 전체 기능

---

# 14. DICOM Download Boundary

P0에서 Authorized Download를 구현한다.

Rule:

```text
study:download 없음
→ DENY
```

```text
study:download 있음
→ PASS
```

다운로드 기능은 실제 병원 Production Workflow가 아니라 Technical MVP 기능으로 취급한다.

---

# 15. PACS Transfer Boundary

P0 핵심 목표 중 하나는 다음 흐름의 검증이다.

```text
Hospital A
Test Orthanc
     ↓
   MediQ
     ↓
   STOW-RS
     ↓
Hospital B
Test Orthanc
```

PACS Transfer 성공 여부는 실제 Destination Test Orthanc에서 Study가 수신되는 것으로 검증한다.

---

# 16. Temporary Exchange Boundary

현재 MediQ Cloud는:

```text
Permanent Cloud PACS
X
```

가 아니라:

```text
Temporary Medical Imaging Exchange
O
```

로 정의한다.

현재 P0 목적:

* Exchange 중 일시적 Payload 관리
* Viewer 접근
* Download
* PACS Transfer

장기 의료영상 보존은 현재 Scope가 아니다.

---

# 17. Tenant Isolation

MediQ는 SaaS 구조를 가정하므로 Tenant Isolation을 P0 Security Control로 포함한다.

최소 검증:

```text
Hospital A User
→ Hospital B Unauthorized Resource

DENY
```

```text
Hospital B User
→ Authorized Exchange Session

PASS
```

---

# 18. Provenance

P0에서는 의료영상 이동의 출처와 경로를 최소 수준으로 추적한다.

예:

```text
source_hospital

source_study

ingested_at

exchange_session

destination

transferred_at

verification_status
```

목적:

> 의료영상이 어느 Source에서 시작되어 어떤 Session을 통해 어느 Destination으로 이동했는지 추적 가능해야 한다.

---

# 19. Integrity Verification

P0에서 전송 무결성을 검증한다.

Bit-preserving Test Scenario에서는:

```text
Source Object
      ↓
MediQ
      ↓
Destination Object

Integrity Match
→ PASS
```

전송과정에서 의도적인 변환이 발생하는 경우 단순 파일 Hash 동일성을 강제하지 않는다.

해당 경우는 Future/Advanced Validation으로 분리할 수 있다.

---

# 20. Audit

최소 다음 이벤트를 Audit한다.

```text
SESSION_CREATED

CONSENT_REQUESTED

CONSENT_APPROVED

AUTHORIZATION_GRANTED

GRANT_CREATED

VIEWER_OPENED

DOWNLOAD_STARTED

PACS_TRANSFER_STARTED

PACS_TRANSFER_COMPLETED

SESSION_COMPLETED

ACCESS_DENIED
```

Audit의 목적은:

> Exchange Lifecycle을 재구성할 수 있는 최소한의 추적성 확보

다.

---

# 21. P0 Security Validation

P0 완료에는 최소 다음 Security Test가 포함되어야 한다.

## SEC-P0-01

```text
No Consent
→ Viewer

DENY
```

## SEC-P0-02

```text
Expired / Invalid Grant
→ Access

DENY
```

## SEC-P0-03

```text
View-only Grant
→ Download

DENY
```

## SEC-P0-04

```text
Hospital B Grant
→ Hospital C

DENY
```

## SEC-P0-05

```text
Unauthorized Tenant
→ Resource

DENY
```

## SEC-P0-06

```text
Valid Session
+
Valid Consent
+
Valid Grant

→ Viewer

PASS
```

## SEC-P0-07

```text
Hospital A
→ MediQ
→ Hospital B

Integrity

PASS
```

---

# 22. P1 Boundary — Mobile Secure Vault

다음 기능은 `CAPSTONE-P1`이다.

* Mobile Secure Vault
* Secure Medical Capsule
* Hardware-backed Key
* Device Binding
* Biometric Unlock
* QR Transfer Request
* Crypto-Shredding
* Offline Access

원칙:

> P1이 미완성이라고 해서 P0 Capstone MVP 실패로 판단하지 않는다.

---

# 23. P1 Implementation Gate

다음 조건을 만족하기 전에는 Mobile Secure Vault 구현을 P0보다 우선하지 않는다.

```text
P0 DICOMweb Flow:
PASS

Exchange Session:
PASS

Consent / Grant:
PASS

Viewer:
PASS

PACS Transfer:
PASS

Tenant Isolation:
PASS

P0 E2E:
PASS
```

---

# 24. Synthetic/Test Data Policy

현재 프로젝트에서는 실제 환자 의료정보를 사용하지 않는다.

## Prohibited

```text
Real Patient PII

실제 주민등록번호

실제 진료기록

실제 Patient ID

실제 의료기관 운영 DICOM

실제 병원 Production Credential

실제 Production PACS
```

## Allowed

```text
Synthetic Patient

Synthetic Hospital

Test Patient ID

Synthetic CT / MRI

Sample DICOM

De-identified Test Dataset

Test Orthanc

Local PACS Simulation

Mock Credentials
```

---

# 25. Real Patient Boundary

다음 기능은 현재 요구하지 않는다.

```text
실환자 본인확인

주민등록번호 기반 Matching

휴대전화 본인인증

실제 의료기관 MPI 연계

실제 Patient Matching

국가 Patient Identifier
```

현재는 Synthetic Mapping Workflow만 검증한다.

---

# 26. Legal / Privacy Boundary

현재 프로젝트는 개인정보보호법, 의료법 등 관련 규제를 무시하지 않는다.

그러나 다음을 P0 완료조건으로 하지 않는다.

```text
개인정보보호법 Production Compliance 완료

의료법 Production Compliance 완료

실제 환자 동의 법적 효력 검증 완료

실제 의료기관 운영 승인

상용서비스 법률검토 완료
```

이를 다음으로 분류한다.

```text
PRODUCTIONIZATION
```

---

# 27. Productionization Boundary

다음 항목은 Capstone 이후 별도 Track으로 관리한다.

## Legal / Privacy

* 개인정보보호법 최종 검토
* 의료법 최종 검토
* 실제 환자 동의체계
* 민감정보 처리 근거
* 제3자 제공
* 처리위탁
* 보유기간
* 법적 파기정책

## Identity

* 실환자 본인확인
* 병원 실제 Patient Mapping
* MPI
* Production Identity Provider

## Hospital

* 실제 PACS Vendor 연동
* 실제 의료기관 Network
* Hospital Security Policy
* Production Connector

## Infrastructure

* Production IAM
* KMS/HSM
* SLA
* Backup
* DR
* Multi-region

---

# 28. Explicit Out of Scope

현재 P0에서 다음은 제외한다.

```text
Full Cloud PACS

Full EMR Integration

Full FHIR Platform

AI Diagnosis

AI Routing

Blockchain

DID

ZKP

Custom Cryptography

Full PQC Migration

Enterprise HSM

Multi-region SaaS

Actual Production Hospital Deployment
```

이 기능들은 별도 승인 없이 P0 Requirement로 추가하지 않는다.

---

# 29. Legacy Highpass Boundary

기존 Highpass 프로젝트는 MediQ의 Normative Source가 아니다.

분류:

```text
REFERENCE

REUSABLE ASSET SOURCE

MIGRATION CANDIDATE
```

재사용 후보:

* Orthanc Docker
* DICOMweb
* QIDO-RS
* WADO-RS
* STOW-RS
* TLS/mTLS
* Audit
* Existing Tests

새로 정의할 핵심 Domain:

```text
Patient Reference

Exchange Session

Consent

Authorization

Transfer Grant

Imaging Package

Provenance
```

---

# 30. Legacy Migration Gate

기존 코드는 다음 조건을 모두 충족하는 경우에만 MediQ로 가져온다.

```text
1. MediQ Requirement와 연결되는가?

2. P0 또는 승인된 P1인가?

3. 신규 Domain Model과 호환되는가?

4. Legacy dependency를 과도하게 끌고 오지 않는가?

5. Test 가능하거나 기존 Test가 존재하는가?
```

하나라도 중요한 문제가 있으면:

```text
DO NOT MIGRATE
```

또는:

```text
REWRITE
```

로 판정한다.

---

# 31. Requirement Classification

향후 모든 Requirement는 다음 중 하나로 분류한다.

```text
CAPSTONE-P0

CAPSTONE-P1

POST-MVP

PRODUCTIONIZATION

OUT-OF-SCOPE
```

Classification이 없는 Requirement는 구현 착수 대상으로 간주하지 않는다.

---

# 32. Scope Admission Rule

신규 기능을 P0에 추가하려면 최소 다음 질문에 답해야 한다.

```text
1. 핵심 E2E를 위해 반드시 필요한가?

2. Synthetic/Test 환경에서 검증 가능한가?

3. 이번 캡스톤 일정 내 구현 가능한가?

4. Success Criteria와 직접 연결되는가?

5. Acceptance Test를 작성할 수 있는가?
```

대부분 `NO`이면 P0에 추가하지 않는다.

---

# 33. Capstone Completion Criteria

P0는 다음 조건을 모두 만족할 때 완료로 판단한다.

```text
Hospital A Test Orthanc:
PASS

DICOMweb Retrieval:
PASS

Patient Mapping:
PASS

Exchange Session:
PASS

Consent Workflow:
PASS

Authorization:
PASS

Transfer Grant:
PASS

Web Viewer:
PASS

DICOM Download:
PASS

Hospital B STOW-RS:
PASS

Tenant Isolation:
PASS

Audit:
PASS

Provenance:
PASS

Integrity:
PASS

Security Tests:
PASS

E2E:
PASS
```

---

# 34. Readiness Separation

Technical MVP와 Production Readiness를 하나의 상태로 표현하지 않는다.

## Capstone Technical Readiness

```text
Architecture:
PASS / PARTIAL / BLOCKED

P0 Implementation:
PASS / PARTIAL / BLOCKED

Security Validation:
PASS / PARTIAL / BLOCKED

E2E:
PASS / PARTIAL / BLOCKED

CAPSTONE MVP READY:
YES / NO
```

## Production Readiness

```text
Real Patient Data:
NOT APPROVED

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

# 35. Definition of Done

MediQ Capstone P0 Definition of Done:

> **Synthetic/Test DICOM 환경에서 Hospital A Test PACS의 의료영상을 MediQ가 조회하고, Patient Mapping 및 Consent/Authorization Workflow를 거쳐 Hospital B가 Viewer·DICOM Download·STOW-RS 방식으로 허가된 의료영상을 사용할 수 있으며, Tenant Isolation·Audit·Provenance·Integrity 및 핵심 DENY/PASS Security Test가 자동 또는 반복 가능한 방식으로 검증되는 상태**

---

# 36. Scope Control Principles

## Principle 1 — P0 First

P0 E2E가 모든 신규 기능보다 우선한다.

## Principle 2 — No Real Patient Data

실제 환자·운영 의료정보는 현재 사용하지 않는다.

## Principle 3 — Synthetic Validation

현재 프로젝트는 Synthetic/Test Environment에서 기술적 가능성을 검증한다.

## Principle 4 — Security Must Be Testable

보안 기능은 설명이 아니라 PASS/DENY Test로 검증한다.

## Principle 5 — Mobile Does Not Block P0

Mobile Secure Vault는 P1이다.

## Principle 6 — Productionization Is Separate

법률·실환자·실병원·상용 인프라는 별도 Track이다.

## Principle 7 — No Uncontrolled Legacy Migration

기존 Highpass 코드는 검증 후 선택적으로 재사용한다.

---

# 37. Boundary Decision

```text
PROJECT:
MediQ

CURRENT OBJECTIVE:
Capstone Technical MVP

PRIMARY DELIVERY:
Hospital A → MediQ → Hospital B
Medical Imaging Exchange E2E

P0 ACCESS MODES:
VIEW / DOWNLOAD / PACS_IMPORT

P1:
MOBILE_EXPORT / MOBILE SECURE VAULT

DATA:
SYNTHETIC / TEST / DE-IDENTIFIED ONLY

REAL PATIENT DATA:
PROHIBITED IN CURRENT SCOPE

CLOUD ROLE:
TEMPORARY MEDICAL IMAGING EXCHANGE

FULL CLOUD PACS:
OUT OF SCOPE

PRODUCTION LEGAL COMPLIANCE:
FUTURE

REAL HOSPITAL DEPLOYMENT:
FUTURE

P0 FAILURE CONDITION:
CORE E2E OR SECURITY ACCEPTANCE CRITERIA NOT MET

P1 FAILURE:
DOES NOT INVALIDATE P0

CAPSTONE MVP BOUNDARY STATUS:
APPROVED
```

---

# 38. Next Document

본 문서 승인 후 다음 문서는:

```text
PRODUCT-BASELINE.md
```

로 한다.

`PRODUCT-BASELINE.md`에서는 본 문서에서 정한 범위를 변경하지 않고, 다음을 구체화한다.

```text
MediQ Product Definition

Core Domain

High-Level Architecture

System Boundaries

Control / Imaging / Security Plane

Core Entity Relationships

Source / Destination Responsibility

Architecture Principles
```

P0/P1/Future의 변경이 필요하면 `PRODUCT-BASELINE.md`에서 임의로 변경하지 않고 본 문서의 Scope Decision을 먼저 수정한다.

---

# 39. Viewer and Storage Scope Amendment — 2026-09-15

본 조항은 Viewer 및 영상 저장 경계에 대한 승인된 Scope Decision이다.

## 39.1 CAPSTONE-P0 추가 명확화

- Hospital User의 승인된 Cloud Web Viewer
- Synthetic Patient의 승인된 Cloud Web Viewer
- Source PACS 기반 `Authorized On-Demand DICOMweb Retrieval`
- WADO-RS Study/Series/Instance/Frame 점진적 전달
- Short-lived Viewer Session과 `study:view` Grant
- Backend Viewer Gateway를 통한 PACS endpoint/credential 격리
- 메모리 버퍼 또는 TTL 기반 암호화 Temporary Cache
- Viewer open/retrieval/deny/expiry/close Audit
- Source PACS 장애 시 Fail-Closed 처리

Patient Cloud Viewer의 P0 포함은 Synthetic/Test Identity 범위이며 실제 환자 본인확인 완료를 의미하지 않는다.

## 39.2 CAPSTONE-P1 유지

- Mobile Secure Vault
- Secure Medical Capsule
- `study:mobile-export`
- 환자 기기의 암호화된 로컬 영상 저장
- Mobile Vault에 저장된 영상을 환자가 열람하는 Patient Mobile Viewer
- Device Binding, hardware-backed key, biometric unlock, crypto-shredding
- Android Native Secure Vault 우선 구현과 Android TEE 이상 Device Admission
- 30일 Offline Lease, Background Privacy Lock, 화면 캡처 제한
- 분실 기기 Revoke 및 Source PACS 기반 재다운로드

## 39.3 명시적 비범위

- Permanent Cloud PACS
- Cloud 장기 영상 보존
- MediQ Cloud를 의료영상 Source of Record 또는 법적 Archive로 사용하는 기능
- Browser/Mobile Client에서 Hospital PACS를 직접 호출하는 기능

```text
Hospital PACS = SOURCE OF RECORD
MediQ Cloud = AUTHORIZED VIEWER GATEWAY + TEMPORARY EXCHANGE
Mobile Vault = P1 PATIENT-CONTROLLED LOCAL COPY
```

---

# 40. P1 Mobile MVP Scope Decision — 2026-09-15

본 결정은 P1 Mobile Secure Vault의 편의성 우선 MVP 기준이며 P0 완료조건을 변경하지 않는다.

- Native Mobile Vault는 Android를 우선한다.
- iOS Native Vault는 후속 단계이며, 적용 가능한 Identity/Test 범위의 iOS 사용자는 반응형 Cloud Viewer 경로를 사용한다.
- Android `STRONGBOX`는 선호하고 `TRUSTED_ENVIRONMENT`(TEE)는 허용한다.
- `SOFTWARE` 또는 `UNKNOWN` Key Security Level만 확인되는 기기에는 Persistent Vault를 허용하지 않는다.
- Offline Lease는 마지막 성공한 발급 또는 온라인 정책 검증으로부터 30일이다.
- Background 진입 시 민감 화면은 즉시 가리되, 계속 잠금 해제된 동일 기기의 60초 이내 복귀는 재인증을 생략할 수 있다.
- Mobile Viewer의 Screenshot·화면녹화·미러링은 플랫폼이 제공하는 범위에서 기본 제한한다.
- 분실·기기 교체 시 Key Escrow/이전 없이 Device를 재등록하고 Source PACS에서 다시 다운로드한다.
- 기존 Consent와 `study:mobile-export` Grant가 유효한 경우에만 새 Device Key로 재발급한다.

P1 Mobile API Contract와 DB Migration은 관련 구현 Ticket 승인 시 별도로 확정하며, 이 문서 개정만으로 구현 완료를 의미하지 않는다.

---

# 41. Azure Deployment Recommendation Status — 2026-09-19

Azure 기반 배포는 현재 승인된 `CAPSTONE-P0` 완료조건이 아니라 `POST-MVP` 권고사항이다. 권고안은 `AZURE-DEPLOYMENT-RECOMMENDATIONS.md`에 기록한다.

- P0 기준 배포는 Docker Compose와 Hospital A/B Test Orthanc를 유지한다.
- Azure 배포가 학교 평가의 필수조건으로 확정되면 본 문서의 Scope Decision을 먼저 개정한다.
- 실제 병원 PACS 연결, 운영 Patient Identity, VPN/Outbound Connector, 운영 PKI, WAF/APIM/SIEM 및 HA/DR은 `PRODUCTIONIZATION`이다.
- Azure를 사용하더라도 Permanent Cloud PACS, 장기 Mobile Package Backup 또는 Cloud Key Escrow를 허용하지 않는다.
- Azure 서비스 선택만으로 `OPENAPI.yaml`의 업무행위나 canonical scope는 변경되지 않는다.

본 조항은 Azure 구현을 승인하지 않으며 기존 P0/P1 완료조건을 변경하지 않는다.

---

# 42. Synthetic Health Data Preview Scope Decision — 2026-09-26

## 42.1 CAPSTONE-P1 Prototype 포함

다음 항목은 `CAPSTONE-P1 PROTOTYPE`으로 허용한다.

- Android Patient App의 건강정보 연동 Preview
- 고정 `DEMO MODE` Disclosure
- `TEST-*` Patient Identity와 Synthetic FHIR-shaped Fixture
- `MockHealthDataProvider` 기반 건강검진·진료·투약·예방접종 조회 흐름
- 모의 본인확인·범위선택·모의 동의·목록·상세·초기화 UX
- 실제 외부기관 호출이 없음을 검증하는 Negative Test

## 42.2 Productionization 유지

다음 항목은 Capstone 구현 범위가 아니다.

- 건강정보 고속도로 활용기관 지정심사 또는 승인 주장
- 테스트베드·운영 API, 운영 Credential, 인증서 또는 실제 기관 연결
- 실제 본인인증, 법적 효력이 있는 동의, 실제 환자 건강정보
- 실제 의료진 공유, 진료 의사결정 또는 Full FHIR/PHR Platform

## 42.3 Non-Misrepresentation Gate

Preview는 실제 승인·연결 상태로 오인될 수 있는 `승인 완료`, `공식 연동`, `운영 연결`, `실제 건강검진 결과` 표현과 기관 Logo·Badge를 사용해서는 안 된다. 각 화면과 발표 캡처에는 `DEMO MODE`, `합성 데이터`, `실제 지정심사·운영 연계 미완료`를 표시한다.

## 42.4 P0 Independence

Preview 구현 또는 미구현은 P0 완료조건에 영향을 주지 않는다. P0 Golden Path와 P0 Security Validation이 우선이며, Preview API·DB·실제 Provider는 별도 승인 Ticket 없이 추가하지 않는다.

Normative 세부사항은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다. Preview의 합성 데이터 범위에는 건강검진, 일반 혈액검사와 항체검사가 포함될 수 있으며 모두 `TEST-* / SYNTHETIC / MOCK`으로 제한한다.

# Patient Experience Feature Pack Scope Amendment — 2026-09-26

## 43.1 Scope Decision

다음 환자 편의 기능은 P0 완료 후 선택적으로 구현하는 `CAPSTONE-P1`이다.

1. 통합 행동센터
2. 환자용 접근이력·동의 영수증
3. 개인정보 최소 알림
4. 병원 방문 모드
5. 쉬운 의료영상 카드
6. 저장공간·만료 관리
7. 환자 친화 오류 복구

판독문·의뢰서 묶음과 보호자·가족 위임은 `POST-MVP`다. 두 기능의 설계 문서 존재는 P1 구현 승인을 의미하지 않는다.

## 43.2 P0 Independence

기능 1–9의 구현 또는 미구현은 P0 Golden Path와 P0 Security Validation의 완료조건을 변경하지 않는다. UI 편의 상태는 Consent, Authorization, Transfer Grant, Destination Verification, Integrity 또는 Audit를 대체하지 않는다.

## 43.3 Normative Reference

분류, 구현 Wave와 상세 요구사항은 `patient-experience/README.md`, `PATIENT-EXPERIENCE-FEATURE-ROADMAP.md` 및 각 Feature Spec을 따른다. 모든 신규 API와 영속 객체는 아직 GAP이며 승인된 OpenAPI·Domain/Data/ERD 개정 전 현재 구현 범위가 아니다.

# 44. Hospital Clinical Workflow P1 Scope Amendment — 2026-09-27

## 44.1 Scope Decision

다음 병원 Portal 편의 기능은 P0 Golden Path와 Security Validation 완료 후 선택적으로 구현하는 `CAPSTONE-P1`이다.

1. 승인된 범위의 관련 과거 영상 검색과 Side-by-side 비교
2. Resource별 권한을 분리한 진료 인계 패킷
3. 병원 내 팀 배정과 업무 인계
4. 개인정보 최소 Hospital Inbox
5. P0 Audit·Provenance 원장 기반 설명형 타임라인

P0 `HOSPITAL_USER`는 상위 Workforce Principal로 유지한다. P1 세부 역할 `CLINICIAN`, `IMAGING_STAFF`, `PACS_OPERATOR`, `AUDITOR`, `HOSPITAL_ADMIN`은 별도 Identity/Role/Permission 계약과 거부시험을 통과하기 전 권한으로 사용하지 않는다.

## 44.2 Resource and Document Boundary

- 같은 환자의 과거 Study라도 Study별 `study:view` 재인가 없이는 조회하지 않는다.
- 비교 Viewer는 허용된 Study 집합에 binding하고 Source PACS에서 WADO-RS로 온디맨드 조회한다.
- 인계 패킷은 Pixel이나 DICOM Payload를 저장하지 않고 Resource Reference와 Projection만 보유한다.
- 영상 권한은 판독문·의뢰서·검사결과 권한을 포함하지 않는다.
- 판독문·의뢰서 Payload 연계는 계속 `POST-MVP`이며 별도 Scope, Integrity와 Provenance가 필요하다.
- 알림, 배정, Deep Link와 타임라인은 접근권한이 아니다.

## 44.3 P0 Independence

이 기능군의 구현·미구현·실패는 P0 완료조건을 변경하지 않는다. P1 Module 장애는 P0 Consent, Authorization, Grant, Viewer, Transfer와 Audit 원장을 우회하거나 변경해서는 안 된다.

## 44.4 Normative Reference

상세 요구사항, 화면, 상태, 보안, API GAP, 논리 객체와 Acceptance는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md` 및 `HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`를 따른다. 현재 OpenAPI·DB·Web 구현과 Test Evidence는 없으며 상태는 `DOCUMENTED — NOT IMPLEMENTED / NOT TESTED`다.
