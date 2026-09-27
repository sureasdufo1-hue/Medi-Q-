# MediQ Project Charter

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Current Phase:** Capstone Technical MVP
**Document Status:** Approved Baseline — amended 2026-09-26
**Primary Priority:** P0 End-to-End MVP Implementation

---

## 1. Executive Summary

**MediQ**는 환자의 요청 또는 동의를 기반으로 한 의료기관에서 생성된 CT·MRI 등 의료영상을 다른 의료기관이 **Web Viewer로 조회하거나, DICOM으로 다운로드하거나, PACS로 직접 수신할 수 있도록 하는 의료영상 이동 SaaS**이다.

현재 MediQ 프로젝트의 최우선 목표는 실제 의료기관을 대상으로 하는 상용서비스 구축이 아니다.

본 프로젝트는 **Synthetic/Test DICOM 데이터와 Test PACS/Orthanc 환경을 이용하여 의료영상 이동 SaaS의 핵심 Architecture와 Security Control을 구현하고 End-to-End로 검증하는 캡스톤 Technical MVP**를 목표로 한다.

MediQ는 다음 중 하나로 정의하지 않는다.

* Cloud PACS
* 단순 DICOM Viewer
* 파일전송 프로그램
* Mobile Vault 전용 애플리케이션

MediQ의 최상위 제품 개념은 다음과 같다.

> **MediQ = Patient-Controlled Medical Imaging Mobility SaaS**

Mobile Secure Vault는 향후 **Patient-side Secure Edge** 역할을 담당하는 P1 확장 기능으로 구분한다.

---

## 2. Background

현재 의료영상은 의료기관의 PACS를 중심으로 관리되며, 환자가 다른 의료기관으로 이동하거나 전원하는 과정에서 CT·MRI 등 의료영상을 별도로 전달해야 하는 상황이 발생할 수 있다.

대표적인 기존 흐름은 다음과 같다.

```text
Hospital A

CT / MRI 촬영
    ↓
PACS 저장
    ↓
CD 또는 별도 이동매체 발급
    ↓
환자가 직접 이동
    ↓
Hospital B
    ↓
영상 등록 / Import
    ↓
의료진 조회
```

MediQ는 이러한 의료영상 이동 과정을 디지털화하여 환자의 요청 또는 동의를 중심으로 보다 일관된 **조회·전송·다운로드 Workflow**를 제공하는 것을 목표로 한다.

---

## 3. Problem Statement

본 프로젝트가 해결하고자 하는 주요 문제는 다음과 같다.

* CD 등 물리적 이동매체에 대한 의존
* 환자가 의료영상을 직접 운반해야 하는 불편
* 이동매체의 분실 또는 재발급 가능성
* 의료기관 간 의료영상 시스템 연결 부족
* 영상 전송 진행상태 추적의 어려움
* 환자 동의와 의료영상 접근 권한 관리의 비일관성
* 누가 언제 어떤 의료영상에 접근했는지 추적하기 어려운 문제
* 영상 전달 지연으로 인한 진료 Workflow 비효율

MediQ는 의료현장의 모든 문제를 해결하는 시스템을 목표로 하지 않는다.

현재 프로젝트는 **의료영상 이동 Workflow의 핵심 기술적 가능성을 검증하는 캡스톤 MVP**로 범위를 제한한다.

---

## 4. Product Vision

MediQ의 제품 비전은 다음과 같다.

> **환자가 자신의 의료영상 이동에 대한 통제권을 가지고, 의료기관이 표준 기반 방식으로 의료영상을 안전하게 조회·전송·수신할 수 있는 Medical Imaging Mobility Platform을 구축한다.**

대표 흐름은 다음과 같다.

```text
Hospital A PACS
       ↓
    DICOMweb
       ↓
      MediQ
       ↓
Patient Request / Consent
       ↓
Authorization
       ↓
Medical Imaging Exchange
       ↓
┌──────────────┬───────────────┐
│              │               │
▼              ▼               ▼
Web Viewer  DICOM Download   PACS Import
                              ↓
                        Hospital B
```

P1에서는 다음 경로를 추가한다.

```text
Hospital A
    ↓
MediQ
    ↓
Secure Medical Capsule
    ↓
Mobile Secure Vault
    ↓
Patient-side Secure Edge
```

---

## 5. Project Objectives

### 5.1 Primary Objective

가장 중요한 목표는 다음이다.

> **Synthetic/Test 환경에서 Hospital A → MediQ → Hospital B의 의료영상 교환 E2E Workflow를 실제로 구현하고 검증한다.**

### 5.2 Technical Objectives

MediQ P0에서는 다음 기술요소를 검증한다.

* Test PACS/Orthanc 기반 Hospital A/B 환경
* DICOM 및 DICOMweb 기반 의료영상 연계
* Patient Reference 및 Patient Mapping
* Exchange Session
* 환자 Consent Workflow
* Authorization
* Transfer Grant
* Imaging Package
* Temporary Medical Imaging Exchange
* Web Viewer
* DICOM Download
* STOW-RS 기반 PACS Import
* Tenant Isolation
* Audit
* Provenance 및 Integrity Verification
* E2E 및 Security Test

### 5.3 Security Objective

보안은 사후 기능이 아니라 초기 Architecture에 포함한다.

핵심 원칙은 다음과 같다.

```text
Least Privilege
Explicit Authorization
Tenant Isolation
Encrypted Transport
Auditability
Integrity Verification
```

---

## 6. Target Users and Stakeholders

### 6.1 Patient

환자는 MediQ 의료영상 교환의 중심 주체다.

주요 역할:

* 자신의 의료영상 이동 요청
* 영상 제공 또는 이용 동의
* 전송 대상 의료기관 확인
* 의료영상 교환 상태 확인

P1에서는:

* Mobile Secure Vault 보관
* 모바일을 이용한 전송 승인
* QR 기반 Transfer Request 확인

등으로 확장한다.

### 6.2 Hospital A — Source Hospital

Hospital A는 의료영상의 Source Hospital이다.

역할:

* CT·MRI 등의 의료영상 생성
* PACS 저장
* DICOM/DICOMweb 제공
* MediQ를 통한 의료영상 제공

Capstone에서는 실제 병원 대신 다음 환경을 사용한다.

> **Hospital A Test Orthanc / Test PACS**

### 6.3 Hospital B — Destination Hospital

Hospital B는 의료영상을 이용하는 Destination Hospital이다.

역할:

* 의료영상 요청
* 승인된 영상 조회
* DICOM Download
* PACS Import

Capstone에서는:

> **Hospital B Test Orthanc / Test PACS**

로 시뮬레이션한다.

### 6.4 MediQ SaaS

MediQ는 의료영상 Exchange를 조정한다.

상위 수준 역할:

* Patient Mapping
* Exchange Session
* Consent Workflow
* Authorization
* Transfer Grant
* Imaging Package
* Routing
* Viewer Access
* Temporary Exchange
* Audit
* Provenance

상세 구현은 후속 Requirement 및 Architecture 문서에서 정의한다.

---

## 7. Primary User Scenario

대표 E2E 시나리오는 다음과 같다.

```text
1. Synthetic Patient가 Hospital A에서 CT 촬영

2. CT Study가 Hospital A Test Orthanc에 저장

3. MediQ가 DICOMweb으로 해당 Study를 조회

4. Hospital B가 의료영상 이용 요청

5. Patient Consent Workflow 수행

6. MediQ가 Authorization Policy 평가

7. 허용된 범위의 Transfer Grant 발급

8. Hospital B가 허용된 Access Mode 사용
```

P0 Access Mode:

```text
VIEW

DOWNLOAD

PACS_IMPORT
```

P1 Access Mode:

```text
MOBILE_EXPORT
```

---

## 8. Capstone MVP Scope

### 8.1 P0 — Core MVP

P0는 캡스톤 성공 여부를 결정하는 핵심 범위다.

포함:

* Hospital A Test Orthanc
* Hospital B Test Orthanc
* DICOM
* DICOMweb
* Patient Reference / Mapping
* Exchange Session
* Consent Workflow
* Authorization
* Transfer Grant
* Imaging Package
* Temporary Exchange
* Web Viewer
* DICOM Download
* STOW-RS PACS Import
* Tenant Isolation
* Audit
* Provenance
* Integrity Verification
* Integration Test
* Security Test
* E2E Test

**P0 E2E 완성이 프로젝트의 최우선 목표다.**

### 8.2 P1 — Differentiation

P1은 MediQ의 보안·환자 중심 차별성을 강화하는 확장 기능이다.

* Mobile Secure Vault
* Secure Medical Capsule
* Hardware-backed Key
* Device Binding
* Biometric Unlock
* QR Transfer Request
* Crypto-Shredding

P1의 미완성은 P0 실패로 판단하지 않는다.

### 8.3 Future / Productionization

다음 영역은 Capstone 완료 이후 별도로 검토한다.

* 실제 환자 적용
* 실제 의료기관 PACS 연동
* 실제 환자 본인확인
* 실제 의료기관 Identity 연계
* 실제 법적 동의체계
* Production IAM
* 실제 KMS/HSM
* 장기 보존 및 파기정책
* Production SLA
* DR
* Multi-region
* 상용 SaaS 운영

---

## 9. Out of Scope

현재 Capstone MVP에서는 다음을 목표로 하지 않는다.

* Full Cloud PACS
* Full EMR Integration
* 전체 FHIR Platform
* AI 진단
* AI 기반 Route Decision
* Blockchain
* DID
* ZKP
* Custom Cryptography
* Full PQC Migration
* Production Hospital Network Deployment
* 상용 의료정보시스템 인증 완료

Scope 밖 기능은 P0 구현을 지연시키지 않는다.

---

## 10. Data & Environment Boundary

MediQ Capstone은 실제 환자 또는 실제 병원 운영 데이터를 사용하지 않는다.

### 금지

* 실제 환자 개인정보
* 실제 주민등록번호
* 실제 환자번호
* 실제 진료기록
* 실제 병원의 운영 의료영상
* 실제 PACS Credential
* 실제 Production Network

### 허용

* Synthetic Patient
* Synthetic Hospital
* Test Patient ID
* Sample DICOM
* Synthetic CT/MRI
* 적법하게 사용할 수 있는 De-identified Test Dataset
* Test Orthanc
* Local PACS Simulation
* Mock Hospital A/B
* Development Credential

예:

```text
Patient:
TEST-PATIENT-001

Hospital A Patient ID:
TEST-A-001

MediQ Patient Ref:
MQ-TEST-0001

Hospital B Patient ID:
TEST-B-982
```

---

## 11. Legal / Productionization Boundary

MediQ Capstone의 현재 성공기준은 실제 의료서비스의 최종 법적 적합성을 확보하는 것이 아니다.

다음은 현재 완료조건이 아니다.

* 개인정보보호법 기준의 상용서비스 전체 적합성 검증
* 의료법 기준의 실제 운영 적합성 검증
* 실제 환자 동의의 법적 효력 검증
* 실제 의료기관 운영 승인
* 실제 의료정보 보유·파기 정책 확정

이를 다음 단계로 분리한다.

> **Future Productionization**

다만 향후 실제 서비스로 확장할 수 있도록 Architecture에는 Legal/Privacy/Clinical 요구사항을 반영할 Extension Point를 유지한다.

핵심 원칙:

```text
Technical MVP Ready
≠
Production / Legal Ready
```

---

## 12. High-Level Architecture Concept

```text
                Synthetic Patient
                       │
                Request / Consent
                       │
                       ▼

Hospital A      ┌───────────────┐       Hospital B
Test Orthanc    │    MediQ      │       Test Orthanc
     │          │     SaaS      │            ▲
     │          │               │            │
     └─────────▶│ Exchange      │────────────┘
    DICOMweb    │ Authorization │          STOW-RS
                │ Imaging       │
                │ Audit         │
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
          Web Viewer        DICOM Download
```

P1:

```text
MediQ
  ↓
Secure Medical Capsule
  ↓
Mobile Secure Vault
```

---

## 13. Success Criteria

### SC-01 — Source Retrieval

```text
Hospital A Test Orthanc
→ DICOMweb
→ MediQ

PASS
```

### SC-02 — Patient Mapping

```text
Hospital A Test Patient ID
→ MediQ Patient Reference
→ Hospital B Test Patient ID

PASS
```

### SC-03 — Exchange Session

```text
Exchange Session
CREATE / TRACK

PASS
```

### SC-04 — Consent Enforcement

```text
Consent 없음
→ Medical Image Access

DENY
```

### SC-05 — Authorized Viewer

```text
Valid Consent
+
Valid Grant
→ Viewer

PASS
```

### SC-06 — Authorized Download

```text
Valid Download Scope
→ DICOM Download

PASS
```

### SC-07 — PACS Transfer

```text
Hospital A
→ MediQ
→ STOW-RS
→ Hospital B Test Orthanc

PASS
```

### SC-08 — Tenant Isolation

```text
Unauthorized Tenant
→ Other Tenant Resource

DENY
```

### SC-09 — Integrity

```text
Source
→ MediQ
→ Destination

Integrity Verification

PASS
```

### SC-10 — Auditability

```text
Exchange Lifecycle
→ Audit Trail

추적 가능

PASS
```

---

## 14. Constraints

현재 프로젝트의 주요 제약은 다음과 같다.

* 캡스톤 일정 제한
* 소규모 개발인력
* 실제 의료기관 Infrastructure 없음
* 실제 Patient Data 미사용
* Test Orthanc 중심의 검증 환경
* Production-grade 운영 인프라 부재
* 실제 의료기관 Vendor 환경 미검증
* Production-level Legal/Privacy Validation 제외

이 제약을 이유로 Scope를 의도적으로 통제한다.

---

## 15. Risks

### RISK-01 — Scope Explosion

DICOM, Cloud, Viewer, Security, Mobile을 동시에 확장하면서 프로젝트가 과대해질 위험.

**Mitigation**

```text
P0
↓
P1
↓
Future
```

순서를 강제한다.

### RISK-02 — Legacy Contamination

기존 Highpass 요구사항·코드·문서가 MediQ의 신규 Architecture와 혼합될 위험.

**Mitigation**

> New Baseline First / Controlled Migration

### RISK-03 — DICOM Complexity

DICOM 및 DICOMweb 구현 범위가 예상보다 커질 위험.

**Mitigation**

* Orthanc 활용
* DICOMweb 우선
* 제한된 CT/MRI Test Scenario
* P0 Use Case 고정

### RISK-04 — Mobile Scope

Mobile Secure Vault 구현 때문에 P0가 지연될 위험.

**Mitigation**

> Mobile Secure Vault = P1

### RISK-05 — Productionization Expansion

법률·개인정보·실제 의료기관 요구사항이 캡스톤 개발 범위를 확대할 위험.

**Mitigation**

> Productionization Track 분리

---

## 16. Legacy Migration Policy

기존 Highpass 프로젝트는 MediQ의 Normative Architecture Source가 아니다.

Legacy Highpass는 다음 목적으로만 사용한다.

```text
Reference

Reusable Asset Source

Migration Candidate
```

재사용 후보:

* Orthanc Docker 환경
* DICOMweb 관련 구현
* QIDO-RS / WADO-RS / STOW-RS 코드
* TLS / mTLS
* Audit
* 기존 검증 Test

다음 Domain은 MediQ 기준으로 새롭게 정의한다.

* Patient Reference
* Patient Mapping
* Exchange Session
* Consent
* Authorization
* Transfer Grant
* Imaging Package
* Provenance

원칙:

> **새 Architecture가 Legacy Code에 맞추는 것이 아니라 Legacy Code가 MediQ Architecture에 맞을 경우에만 재사용한다.**

---

## 17. Project Principles

### Principle 1 — Capstone MVP First

P0 E2E 완성이 모든 확장 기능보다 우선한다.

### Principle 2 — Synthetic/Test Data Only

실제 환자 또는 실제 의료기관 운영 데이터를 사용하지 않는다.

### Principle 3 — Patient-Controlled Exchange

의료영상의 이동과 접근은 환자의 요청 또는 동의를 중심으로 설계한다.

### Principle 4 — Interoperability First

DICOM/DICOMweb 기반 의료영상 상호운용성을 핵심으로 한다.

### Principle 5 — Security by Design

Authorization, Tenant Isolation, Integrity 및 Audit을 처음부터 Architecture에 포함한다.

### Principle 6 — Mobile is an Extension

Mobile Secure Vault는 P1 차별화 기능이며 P0 구현을 차단하지 않는다.

### Principle 7 — Productionization is Separate

실제 환자·병원·법률·운영환경 적용은 별도 Productionization 단계에서 수행한다.

---

## 18. Deliverables

MediQ 프로젝트의 주요 문서 산출물은 다음 순서로 작성한다.

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
ACCEPTANCE-TESTS.md
        ↓
DATA-MODEL / ERD
        ↓
OPENAPI
        ↓
THREAT-MODEL
        ↓
IMPLEMENTATION-PLAN.md
        ↓
IMPLEMENTATION
```

---

## 19. Project Completion Definition

MediQ Capstone P0 MVP는 다음 상태에 도달했을 때 완료로 판단한다.

> **Synthetic/Test DICOM 환경에서 Hospital A Test PACS의 CT·MRI Study를 MediQ가 DICOMweb으로 조회하고, Synthetic Patient의 Consent Workflow와 Authorization을 거쳐 Hospital B가 Web Viewer로 조회하거나 DICOM으로 다운로드하거나 Test PACS로 수신할 수 있으며, Tenant Isolation·Audit·Provenance·Integrity Control이 Acceptance Test를 통해 검증된 상태**

P1 Mobile Secure Vault의 완료 여부는 별도로 평가한다.

---

## 20. Charter Decision

```text
PROJECT:
MediQ

PRODUCT:
Patient-Controlled Medical Imaging Mobility SaaS

CURRENT PHASE:
Capstone Technical MVP

PRIMARY PRIORITY:
P0 End-to-End Implementation

DATA POLICY:
Synthetic / Test / De-identified Data Only

REAL PATIENT DATA:
NOT USED

PRODUCTION DEPLOYMENT:
OUT OF CURRENT SCOPE

LEGAL / PRIVACY PRODUCTION REVIEW:
FUTURE PRODUCTIONIZATION

MOBILE SECURE VAULT:
P1

LEGACY HIGHPASS:
REFERENCE / CONTROLLED MIGRATION ONLY

PROJECT CHARTER STATUS:
APPROVED BASELINE
```

---

# Charter Review

```text
Problem Definition:
PASS

Product Definition:
PASS

MVP Boundary:
PASS

Data Boundary:
PASS

P0/P1 Separation:
PASS

Productionization Boundary:
PASS

Success Criteria:
PASS

Scope Risk:
MEDIUM

Primary Risk:
Scope Expansion

Recommended Control:
P0 E2E completion before P1 implementation

NEXT DOCUMENT:
CAPSTONE-MVP-BOUNDARY.md

CHARTER READY:
YES
```

---

## 21. Viewer and Storage Architecture Amendment — 2026-09-15

본 조항은 Viewer·Cloud Storage·Mobile Storage에 관한 이후의 승인된 Charter Amendment이며, 앞선 표현과 충돌하는 경우 본 조항을 우선 적용한다.

- Hospital A PACS는 의료영상 원본을 보유하는 `Source of Record`다.
- MediQ Cloud는 영구 Cloud PACS 또는 장기 영상 Archive가 아니다.
- MediQ Cloud의 영상 처리는 승인된 교환·Viewer 전달에 필요한 메모리 버퍼 또는 TTL 기반 암호화 임시 캐시로 제한한다.
- 승인된 Hospital User 또는 Synthetic Patient가 Cloud Viewer를 요청하면 MediQ가 Consent, Authorization, Tenant/Patient Binding 및 `study:view` Transfer Grant를 검증한다.
- 검증 후 MediQ Backend가 Source Hospital PACS에서 DICOMweb/WADO-RS로 필요한 Study·Series·Instance·Frame을 온디맨드 조회하여 Viewer에 점진적으로 전달한다.
- Hospital PACS endpoint와 credential은 Browser 또는 Mobile Client에 노출하지 않는다.
- 환자 모바일 기기에 명시적으로 Export된 영상은 P1 Mobile Secure Vault의 암호화된 로컬 Copy이며, 환자가 Mobile Viewer로 열람할 수 있다.

```text
P0 CLOUD VIEWER:
HOSPITAL USER + SYNTHETIC PATIENT

P0 CLOUD STORAGE:
EPHEMERAL / TTL-BOUNDED ONLY

P1 MOBILE:
SECURE LOCAL STORAGE + PATIENT MOBILE VIEWER

PERMANENT CLOUD PACS:
OUT OF SCOPE
```

---

# Synthetic Health Data Preview Charter Amendment — 2026-09-26

MediQ는 향후 환자 건강정보 연계 경험을 설명하기 위해 Android Patient App에 합성 건강검진·진료·투약·예방접종 Preview를 제공할 수 있다.

- 분류는 `CAPSTONE-P1 PROTOTYPE / PRODUCTIONIZATION PREVIEW`다.
- Preview는 Mock Provider, `TEST-*` Identity와 Synthetic Fixture만 사용한다.
- 모든 화면은 `DEMO MODE`, 실제 지정심사 미완료, 운영 API 미연계를 명확히 표시한다.
- 건강정보 고속도로 지정심사·테스트베드·공식 API·실제 환자정보는 `PRODUCTIONIZATION`이다.
- Preview는 P0 의료영상 Exchange 성공조건과 Full FHIR Platform 비범위를 변경하지 않는다.

상세 기준은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.
