# MediQ Product Baseline

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document Type:** Normative Product & Architecture Baseline
**Version:** v1.7 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Status:** Approved Baseline
**Primary Delivery Target:** P0 End-to-End Medical Imaging Exchange

---

# 1. Purpose

본 문서는 MediQ 프로젝트의 **제품 정의, 핵심 Domain, 시스템 경계, 상위 Architecture 및 설계 원칙을 고정하는 Product Baseline**이다.

상위 문서:

```text
PROJECT-CHARTER.md
CAPSTONE-MVP-BOUNDARY.md
```

본 문서는 위 두 문서에서 확정한 프로젝트 목적과 Scope를 변경하지 않는다.

## 1.1 환자 편의 Projection과 AI 질문자료 기준

MediQ는 기존 권위 상태를 환자 중심 Timeline·검색·쉬운 모드·진료 준비 화면으로 Projection할 수 있다. 이 표현 계층은 Consent, Authorization, Grant, PACS 원본 또는 Audit 원장을 변경하지 않는다.

합성 검사자료에 한해 `AI 질문용 자료 만들기` Prototype을 제공한다. MediQ는 외부 AI를 진단자나 판독자로 표현하지 않으며 외부 LLM에 데이터를 자동 전송하지 않는다. 실제 건강정보 외부 제공은 승인된 Production Connector가 생기기 전 제품 기능으로 주장하지 않는다.

## 1.2 RAG 제품 원칙

MediQ Synthetic RAG는 `설명과 질문 준비` 제품 계층이다. 승인된 합성 지식 Snapshot의 내용을 쉬운 말로 재구성하고 근거·Version·한계를 표시한다. Model Memory나 일반 Web을 지식으로 사용하지 않으며 근거가 없거나 충돌하면 답변을 보류한다. 이 계층은 P0 의료영상 이동과 보안 결정에서 독립된다.

본 문서의 목적은 다음 질문에 답하는 것이다.

```text
MediQ는 어떤 제품인가?

MediQ의 핵심 Domain은 무엇인가?

어떤 Component가 어떤 책임을 가지는가?

의료영상은 어떤 흐름으로 이동하는가?

환자 동의와 Authorization은 어디에서 적용되는가?

Hospital A / MediQ / Hospital B의 책임은 어떻게 구분되는가?

Cloud, Viewer, PACS, Mobile은 어떤 관계인가?

후속 Requirements와 Architecture는 어떤 기준을 따라야 하는가?
```

---

# 2. Product Definition

MediQ를 다음과 같이 정의한다.

> **MediQ는 환자의 요청 또는 동의를 기반으로 Source Hospital에서 생성된 CT·MRI 등 의료영상을 Destination Hospital이 Web Viewer로 조회하거나 DICOM으로 다운로드하거나 PACS로 수신할 수 있도록 하는 Patient-Controlled Medical Imaging Mobility SaaS이다.**

MediQ의 최상위 개념은 다음과 같다.

```text
MediQ
=
Patient-Controlled
Medical Imaging Mobility SaaS
```

---

# 3. What MediQ Is Not

MediQ를 다음과 같이 정의하지 않는다.

```text
MediQ = Cloud PACS
X

MediQ = DICOM Viewer
X

MediQ = Mobile Vault App
X

MediQ = 단순 DICOM File Transfer Tool
X

MediQ = EMR
X

MediQ = 장기 의료기록 보존시스템
X
```

각 기능은 MediQ의 일부 Component 또는 Access Mode일 수 있으나 전체 제품 자체를 의미하지 않는다.

---

# 4. Current Product Goal

현재 제품 목표는 실제 의료기관 상용 배포가 아니다.

현재 목표는:

> **Synthetic/Test 환경에서 의료영상의 조회·동의·인가·전송·수신·추적이 가능한 P0 End-to-End Technical MVP를 구현하고 검증하는 것**

이다.

기준 E2E:

```text
Hospital A Test PACS
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
┌───────────┬────────────┬─────────────┐
│           │            │             │
VIEW     DOWNLOAD     PACS_IMPORT    P1 MOBILE
│           │            │             │
▼           ▼            ▼             ▼
Viewer    DICOM      Hospital B      Secure Vault
                    Test PACS
```

---

# 5. Product Principles

## Principle 1 — Capstone MVP First

현재 최우선 목표는 P0 E2E의 완성이다.

새로운 기능은 P0 완료를 방해해서는 안 된다.

---

## Principle 2 — Patient-Controlled Exchange

의료영상 이동은 환자의 요청 또는 동의를 중심으로 설계한다.

환자가 모든 기술적 행위를 직접 수행한다는 의미가 아니라, 의료영상 교환에서 환자의 의사와 Authorization 관계를 명확하게 모델링한다는 의미다.

---

## Principle 3 — Exchange, Not Permanent Storage

MediQ Cloud의 기본 역할은:

```text
Medical Imaging Exchange Broker
```

이다.

MediQ Cloud를 영구 Cloud PACS로 설계하지 않는다.

---

## Principle 4 — Standards-Based Imaging

의료영상 교환은 기존 의료영상 생태계와의 상호운용성을 위해:

```text
DICOM
DICOMweb
```

을 중심으로 설계한다.

---

## Principle 5 — Explicit Authorization

다음 개념을 분리한다.

```text
Identity
Consent
Authorization
Transfer Grant
```

어떤 하나의 Token 또는 Boolean 값으로 전체 의료영상 접근권한을 표현하지 않는다.

---

## Principle 6 — Security by Design

다음은 초기 설계부터 포함한다.

```text
Least Privilege

Tenant Isolation

Explicit Authorization

Encrypted Transport

Auditability

Integrity Verification

Provenance
```

---

## Principle 7 — Synthetic/Test Data Only

현재 프로젝트에서는 실제 환자·실제 병원 운영 데이터를 사용하지 않는다.

---

## Principle 8 — Mobile Is an Extension

Mobile Secure Vault는 MediQ의 중요한 차별화 기능이지만 현재 P1이다.

P0 E2E보다 우선하지 않는다.

---

## Principle 9 — Productionization Is Separate

실제 환자, 실제 병원, 법률·개인정보·임상·운영 적합성은 별도의 Productionization Track으로 관리한다.

---

# 6. Core Domain Flow

MediQ의 핵심 Domain 흐름은 다음 순서로 정의한다.

```text
IDENTITY
   ↓
PATIENT MAPPING
   ↓
EXCHANGE SESSION
   ↓
CONSENT
   ↓
AUTHORIZATION
   ↓
TRANSFER GRANT
   ↓
IMAGING PACKAGE
   ↓
ROUTE / ACCESS MODE
   ↓
VIEW / DOWNLOAD / PACS IMPORT
   ↓
PROVENANCE
   ↓
AUDIT
```

이 흐름은 후속 Requirements, API, Data Model 및 Test 설계의 기준이 된다.

---

# 7. Core Domain Objects

## 7.1 Organization

MediQ SaaS의 Tenant 또는 조직 경계를 표현한다.

예:

```text
Hospital A Organization
Hospital B Organization
```

주요 목적:

* Tenant Isolation
* 사용자 소속
* Resource Ownership
* Authorization Scope

---

# 8. Hospital

의료영상 Source 또는 Destination 역할을 하는 의료기관 논리 객체다.

현재 Capstone에서는 실제 병원이 아니라:

```text
Hospital A Test Environment
Hospital B Test Environment
```

로 사용한다.

Hospital은 최소 다음 Capability 정보를 가질 수 있도록 설계한다.

```text
DICOMweb Support

QIDO-RS

WADO-RS

STOW-RS

Viewer Access Support

Download Support
```

상세 Capability Model은 후속 Requirements에서 정의한다.

---

# 9. Patient Reference

병원별 Patient ID와 MediQ 내부 환자 참조를 분리한다.

금지:

```text
Hospital A Patient ID
=
MediQ Global Patient ID
```

권장:

```text
                MEDIQ PATIENT REF

                 MQ-TEST-0001

                 /          \
                /            \
               ▼              ▼

Hospital A ID               Hospital B ID
TEST-A-001                  TEST-B-982
```

MediQ의 Patient Reference는 병원 Local Identifier를 직접 전역 식별자로 사용하지 않는다.

---

# 10. Patient Mapping

Patient Mapping은 다음 관계를 표현한다.

```text
MediQ Patient Reference
        │
        ├── Hospital A Local Patient ID
        │
        └── Hospital B Local Patient ID
```

현재 Capstone에서는 Synthetic Mapping을 사용한다.

실제 MPI, 국가 환자식별체계, 실환자 본인확인은 현재 범위가 아니다.

---

# 11. Exchange Session

`Exchange Session`은 MediQ의 **핵심 Business Object**다.

정의:

> 특정 환자의 특정 의료영상이 Source Hospital에서 Destination Hospital 또는 허가된 Access Channel로 이동하거나 조회되는 하나의 의료영상 교환 업무 단위

예:

```text
Exchange Session

Patient:
MQ-TEST-0001

Source:
Hospital A

Destination:
Hospital B

Purpose:
Medical Imaging Exchange

Payload:
CT Brain

Allowed:
VIEW / PACS_IMPORT
```

Exchange Session은 의료영상 파일 자체가 아니다.

---

# 12. Exchange Session Responsibility

Exchange Session은 다음을 연결한다.

```text
Patient

Source Hospital

Destination Hospital

Consent

Authorization

Transfer Grant

Imaging Package

Access Mode

Lifecycle State

Audit

Provenance
```

실제 DICOM Payload는 `Imaging Package`가 관리한다.

---

# 13. Exchange Session Lifecycle

Baseline 수준의 후보 State는 다음과 같다.

```text
REQUESTED
    ↓
CONSENT_PENDING
    ↓
CONSENTED
    ↓
AUTHORIZED
    ↓
READY
    ↓
ACTIVE
    ↓
COMPLETED
```

예외/종료:

```text
REJECTED

EXPIRED

REVOKED

FAILED

CANCELLED
```

상세 State Transition Rule은 후속 Domain/Requirements 문서에서 정의한다.

---

# 14. Consent

Consent는:

> **환자가 특정 의료영상의 특정 이용 또는 전송에 동의했음을 나타내는 별도의 Evidence Artifact**

로 정의한다.

Consent를 다음과 같이 구현하지 않는다.

```json
{
  "consent": true
}
```

최소한 다음 Context와 연결 가능한 구조여야 한다.

```text
Patient

Source

Destination

Resource

Purpose

Allowed Action

Status

Timestamp
```

현재 Consent는 Technical Workflow PoC이며 실제 법적 효력의 최종 판단은 Productionization 범위다.

---

# 15. Authorization

Authorization은 다음 질문에 답한다.

> **현재 요청자가 이 Resource에 이 Action을 수행할 권한이 있는가?**

예:

```text
Hospital B Doctor
+
Session 1001
+
Study CT-01
+
Action VIEW
```

결과:

```text
ALLOW
또는
DENY
```

Consent가 존재한다고 해서 모든 Action이 자동으로 허용되는 것은 아니다.

---

# 16. Transfer Grant

Transfer Grant는 Authorization 결과에 따라 생성되는 **제한된 실행 권한 객체**다.

예:

```text
Grant

Session:
1001

Recipient:
Hospital B

Resource:
CT-01

Scope:
study:view
study:pacs-transfer

Expires:
...
```

후보 Scope:

```text
study:view

study:download

study:pacs-transfer

study:mobile-export
```

---

# 17. Imaging Package

`Imaging Package`는 실제 교환 대상 의료영상의 논리적 Payload 객체다.

Exchange Session과 Imaging Package를 분리한다.

```text
Exchange Session
=
업무 상태 / 동의 / 권한

Imaging Package
=
의료영상 Payload
```

구조 예:

```text
Imaging Package

├─ Study
│
├─ Series
│
└─ SOP Instances
```

한 Exchange Session에서 하나 이상의 Study를 포함할 수 있도록 확장 가능하게 설계한다.

---

# 18. Study Reference

MediQ 내부 업무처리에서는 실제 DICOM 데이터 전체와 업무 Metadata를 구분한다.

Study Reference는 최소 다음 관계를 표현할 수 있어야 한다.

```text
Imaging Package
      ↓
Study
      ↓
Source Hospital
      ↓
Patient Reference
```

상세 DICOM Identifier Model은 후속 Data Model에서 정의한다.

---

# 19. Access Modes

P0에서 정의하는 Access Mode:

```text
VIEW

DOWNLOAD

PACS_IMPORT
```

P1:

```text
MOBILE_EXPORT
```

Access Mode는 개별 Grant Scope에 의해 통제한다.

예:

```text
Grant Scope:
study:view

Allowed:
VIEW

Denied:
DOWNLOAD
PACS_IMPORT
```

---

# 20. VIEW

VIEW는 MediQ의 Web Viewer를 이용해 의료영상을 조회하는 Mode다.

기본 흐름:

```text
Exchange Session
       ↓
Authorization
       ↓
Transfer Grant
       ↓
WADO-RS / Imaging Access
       ↓
Web Viewer
```

MVP Viewer는 캡스톤 검증용이다.

현재 목표가 아닌 기능:

```text
상용 진단용 Viewer 인증

Advanced 3D Reconstruction

AI Diagnosis

Full Radiology Workstation
```

---

# 21. DOWNLOAD

DOWNLOAD는 승인된 사용자가 DICOM을 다운로드하는 Mode다.

기본 흐름:

```text
Authorization
      ↓
study:download
      ↓
DICOM Download
```

다운로드 권한은 Viewer 권한과 자동으로 동일하지 않다.

---

# 22. PACS_IMPORT

PACS_IMPORT는 Destination Hospital의 PACS/Test Orthanc로 의료영상을 전송하는 Mode다.

P0 목표:

```text
Hospital A Test Orthanc
        ↓
      MediQ
        ↓
      STOW-RS
        ↓
Hospital B Test Orthanc
```

Hospital B에서 실제 Study 수신이 확인되어야 한다.

---

# 23. MOBILE_EXPORT

MOBILE_EXPORT는 P1 기능이다.

목적:

> 환자가 의료영상을 자신의 Mobile Secure Vault에 안전하게 저장하고 Patient-side Secure Edge로 사용할 수 있도록 한다.

구조:

```text
MediQ
 ↓
Secure Medical Capsule
 ↓
Mobile Secure Vault
```

MOBILE_EXPORT 구현 미완성은 P0 실패가 아니다.

---

# 24. Provenance

Provenance는 의료영상의 출처와 이동 경로를 추적한다.

목표:

> **이 의료영상이 어디에서 왔고 어떤 Exchange Session을 거쳐 어디로 전달되었는가?**

최소 논리정보:

```text
Source Hospital

Source Study

Ingest Time

Exchange Session

Destination

Transfer Time

Integrity Verification Status
```

---

# 25. Integrity

MediQ는 의료영상 전송 과정에서 무결성 검증 기능을 제공한다.

P0에서는 Bit-preserving Transfer Scenario를 우선 검증한다.

```text
Source Imaging Object
        ↓
      MediQ
        ↓
Destination Imaging Object

Integrity Verification
        ↓
PASS
```

Transcoding 등 Payload 변경이 발생하는 경우에는 단순 파일 Hash 동일성을 요구하지 않는다.

고급 Semantic Integrity 검증은 후속 단계로 확장할 수 있다.

---

# 26. Audit

Audit은 Exchange Lifecycle을 추적할 수 있도록 한다.

최소 Event 후보:

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

ACCESS_DENIED

SESSION_COMPLETED
```

Audit Log에 불필요한 의료정보 또는 민감정보를 직접 기록하지 않는 것을 기본 원칙으로 한다.

---

# 27. Tenant Model

MediQ는 SaaS이므로 Tenant Boundary를 가진다.

기본 모델:

```text
MediQ SaaS

├─ Tenant A
│    └─ Hospital A
│
└─ Tenant B
     └─ Hospital B
```

보안 원칙:

```text
Tenant A User
→ Tenant B Unauthorized Resource

DENY
```

Exchange Session을 통해 명시적으로 허용된 Resource만 Cross-Hospital Access 대상으로 취급한다.

---

# 28. High-Level Architecture

```text
                         PATIENT
                            │
                    Request / Consent
                            │
                            ▼

                    ┌───────────────┐
                    │     MediQ     │
                    │      SaaS     │
                    └───────┬───────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼

  CONTROL DOMAIN       IMAGING DOMAIN      SECURITY DOMAIN

 Patient Ref           DICOM               Authorization
 Patient Mapping       DICOMweb            Tenant Isolation
 Exchange Session      Imaging Package     Integrity
 Consent               QIDO-RS             Audit
 Transfer Grant        WADO-RS
                       STOW-RS

       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼

                       ACCESS MODES

              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼

            VIEW         DOWNLOAD      PACS_IMPORT
                                           │
                                           ▼
                                      Hospital B
                                      Test Orthanc
```

P1:

```text
MediQ
  ↓
MOBILE_EXPORT
  ↓
Mobile Secure Vault
```

---

# 29. Architectural Planes

MediQ Architecture를 다음 Plane으로 논리적으로 구분한다.

## 29.1 Control Plane

```text
Identity

Patient Mapping

Exchange Session

Consent

Authorization

Transfer Grant

Tenant

Policy

Audit Coordination
```

---

## 29.2 Imaging Plane

```text
DICOM

DICOMweb

QIDO-RS

WADO-RS

STOW-RS

Imaging Package

Viewer

Temporary Imaging Payload
```

---

## 29.3 Security Plane

```text
Authentication

Authorization

Tenant Isolation

Encrypted Transport

Integrity Verification

Audit

Provenance
```

P1 확장:

```text
DEK / KEK

Device Binding

Hardware-backed Key

Crypto-Shredding
```

---

## 29.4 Edge Plane

```text
Hospital A Test Orthanc

Hospital B Test Orthanc

Web Viewer
```

P1:

```text
Mobile Secure Vault
```

향후:

```text
Hospital Connector
```

---

# 30. Source-of-Record Boundary

의료영상의 원본 책임 경계를 다음과 같이 정의한다.

```text
Hospital A PACS
=
SOURCE / SYSTEM OF RECORD
```

MediQ는 원본 의료기록 보관기관으로 정의하지 않는다.

---

# 31. MediQ Cloud Copy

MediQ Cloud에서 관리되는 의료영상은:

```text
TEMPORARY EXCHANGE COPY
```

로 정의한다.

역할:

* Viewer 제공
* Download 제공
* PACS Transfer 중계
* Exchange Session 수행

MediQ Cloud Copy를 영구적인 환자 의료기록 원본으로 정의하지 않는다.

---

# 32. Destination Copy

Hospital B PACS에 수신된 영상은:

```text
DESTINATION IMPORTED COPY
```

로 정의한다.

현재 프로젝트에서는 실제 의료기관의 임상기록 관리 책임까지 구현하지 않는다.

---

# 33. Mobile Copy

P1에서 Mobile Secure Vault에 저장되는 영상은:

```text
PATIENT-HELD SECURE COPY
```

로 정의한다.

Mobile Vault가 Source Hospital 원본을 대체하지 않는다.

---

# 34. Temporary Storage Principle

MediQ Cloud의 기본 Data Lifecycle:

```text
INGEST

↓

TEMPORARY STORAGE

↓

AUTHORIZED ACCESS

↓

VIEW / DOWNLOAD / PACS IMPORT

↓

SESSION COMPLETE

↓

RETENTION WINDOW

↓

DELETE
```

Retention 기간의 실제 값은 Requirements/Policy에서 별도로 정의하며 Product Baseline에서 임의의 기간을 고정하지 않는다.

---

# 35. Hospital Integration Baseline

P0에서는 다음 환경을 사용한다.

```text
Hospital A
=
Test Orthanc

Hospital B
=
Test Orthanc
```

MediQ는 다음 DICOMweb Interaction을 중심으로 연결한다.

```text
QIDO-RS

WADO-RS

STOW-RS
```

실제 PACS Vendor별 Integration은 Productionization 범위다.

---

# 36. Hospital Connector

Hospital Connector는 장기 Architecture에서 유효한 Component지만 P0 필수 구현이 아니다.

후보 역할:

```text
Local PACS Integration

DICOMweb Adapter

Transfer Queue

Retry

Capability Discovery

Local Audit

Secure Outbound Connection
```

분류:

```text
Architecture:
DEFINED

P0:
NOT REQUIRED

P1/P2:
CANDIDATE
```

---

# 37. Route Baseline

MediQ는 하나의 의료영상 사용경로만 강제하지 않는다.

Route 후보:

```text
VIEW

DOWNLOAD

PACS_IMPORT

P1 MOBILE_EXPORT
```

향후에는 Route Engine으로 확장할 수 있다.

P0에서는 복잡한 자동 Routing Engine을 필수로 하지 않는다.

---

# 38. Preflight Concept

PACS Import 전에 Destination Capability를 확인할 수 있는 Preflight 구조를 설계 가능하도록 한다.

검토 후보:

```text
Destination Available?

Patient Mapping Valid?

STOW-RS Available?

Grant Valid?

Study Valid?
```

P0 구현 필수 여부는 후속 Requirements에서 결정한다.

---

# 39. Security Boundary

현재 P0에서 반드시 보장해야 하는 핵심 Security Rule:

```text
No Consent
→ DENY
```

```text
Invalid Grant
→ DENY
```

```text
Expired Grant
→ DENY
```

```text
Wrong Tenant
→ DENY
```

```text
Wrong Recipient
→ DENY
```

```text
Valid Consent
+
Valid Grant
+
Authorized Tenant
→ ALLOW
```

---

# 40. Data Boundary

현재 사용 가능:

```text
Synthetic Patient

Synthetic Hospital

Test Patient ID

Sample DICOM

Synthetic CT / MRI

Approved De-identified Test Dataset

Test Orthanc

Development Credential
```

현재 금지:

```text
Real Patient PII

Real Patient Medical Record

Real Hospital Production DICOM

Production PACS Credential

Production Hospital Network
```

---

# 41. Legal / Production Boundary

다음은 현재 Product Baseline의 P0 완료조건이 아니다.

```text
실제 의료법 상용 적합성

실제 개인정보보호법 운영 적합성

실환자 Identity Verification

실제 전자동의 법적 효력

실제 PACS Vendor Production Integration

Production SLA

Production DR

Enterprise KMS/HSM
```

분류:

```text
PRODUCTIONIZATION
```

이들이 미완료라는 이유로 Technical MVP를 BLOCKED 처리하지 않는다.

---

# 42. Legacy Highpass Relationship

기존 Highpass는 MediQ 제품 기준선이 아니다.

역할:

```text
REFERENCE

REUSABLE ASSET SOURCE

MIGRATION CANDIDATE
```

재사용 가능한 후보:

```text
Orthanc Environment

DICOMweb Code

QIDO-RS

WADO-RS

STOW-RS

TLS / mTLS

Audit

Existing Tests
```

다음 Domain은 MediQ에서 새 Baseline을 따른다.

```text
Patient Reference

Patient Mapping

Exchange Session

Consent

Authorization

Transfer Grant

Imaging Package

Provenance
```

---

# 43. Legacy Migration Principle

Migration 순서는 다음을 따른다.

```text
MediQ Baseline
     ↓
Requirement
     ↓
Architecture
     ↓
Legacy Candidate Search
     ↓
Compatible?
   /        \
 YES         NO
  ↓           ↓
MIGRATE     REWRITE
```

기존 코드를 살리기 위해 MediQ Domain Architecture를 변경하지 않는다.

---

# 44. P0 Product Scope

P0 Product Baseline은 다음으로 고정한다.

```text
Hospital A Test Orthanc

Hospital B Test Orthanc

DICOMweb

Patient Reference / Mapping

Exchange Session

Consent Workflow

Authorization

Transfer Grant

Imaging Package

VIEW

DOWNLOAD

PACS_IMPORT

Temporary Exchange

Tenant Isolation

Audit

Provenance

Integrity Verification

Security Validation

E2E Validation
```

---

# 45. P1 Product Scope

P1:

```text
Mobile Secure Vault

Secure Medical Capsule

Hardware-backed Key

Device Binding

Biometric Unlock

QR Transfer Request

MOBILE_EXPORT

Crypto-Shredding
```

P1 미완성은 P0 Product Completion에 영향을 주지 않는다.

---

# 46. Future Product Scope

향후 검토:

```text
Hospital Connector

Long-term Cloud Vault

FHIR Integration

Radiology Report

Referral Data

Enterprise IAM

Enterprise HSM / KMS

Real Hospital Integration
```

---

# 47. Explicit Product Non-Goals

현재 MediQ가 하지 않는 것:

```text
Full Cloud PACS

Full EMR

Full FHIR Platform

AI Diagnosis

AI Routing

Blockchain

DID

ZKP

Custom Cryptography

Full PQC Migration

Medical Device Certification

Actual Production Hospital Deployment
```

---

# Azure Deployment Recommendation — 2026-09-19

Azure는 MediQ 제품 정의나 Source-of-Record 경계를 변경하는 별도 제품이 아니라 선택적 Deployment Profile 후보로 취급한다. 상세 권고는 `AZURE-DEPLOYMENT-RECOMMENDATIONS.md`를 따른다.

- 기본 분류: `POST-MVP`
- 현재 P0 기준: Docker Compose + Hospital A/B Test Orthanc
- 실제 병원망·Patient Identity 적용: `PRODUCTIONIZATION`
- Azure 적용 후에도 MediQ Cloud는 Permanent PACS나 장기 Archive가 아니다.
- Legacy Highpass의 명칭·scope·token 모델은 MediQ 기준을 통과한 경우에만 재사용한다.

본 권고는 제품 기준선의 승인된 기능 범위를 확장하지 않는다.

---

# 48. Product Success Model

MediQ P0는 다음 구조가 실제로 동작하면 제품 MVP 성공으로 판단한다.

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
Authorization / Grant
        ↓

┌────────────┬───────────────┐
│            │               │
▼            ▼               ▼

Viewer     Download       STOW-RS
                              ↓
                       Hospital B
                       Test Orthanc
```

추가로:

```text
Unauthorized Access
→ DENY

Tenant Isolation
→ PASS

Audit
→ PASS

Integrity
→ PASS

E2E
→ PASS
```

가 검증되어야 한다.

---

# 49. Product Completion Gate

다음 항목이 충족되기 전 P0 Product Baseline을 완료로 보지 않는다.

```text
GATE-01
Test Hospital Environment

GATE-02
DICOMweb Flow

GATE-03
Patient Mapping

GATE-04
Exchange Session

GATE-05
Consent Workflow

GATE-06
Authorization

GATE-07
Transfer Grant

GATE-08
Viewer

GATE-09
Download

GATE-10
PACS Import

GATE-11
Tenant Isolation

GATE-12
Audit

GATE-13
Provenance / Integrity

GATE-14
Security Tests

GATE-15
E2E Test
```

---

# 50. Normative Document Hierarchy

MediQ 문서의 우선순위를 다음과 같이 정의한다.

```text
1. PROJECT-CHARTER.md

2. CAPSTONE-MVP-BOUNDARY.md

3. PRODUCT-BASELINE.md

4. REQUIREMENTS.md

5. SECURITY-REQUIREMENTS.md

6. DOMAIN-MODEL.md / ADR

7. SYSTEM-ARCHITECTURE.md

8. DATA-MODEL / OPENAPI

9. ACCEPTANCE-TESTS.md

10. IMPLEMENTATION-PLAN.md

11. CODE

12. LEGACY HIGHPASS DOCUMENTS
```

하위 문서는 상위 문서의 Scope를 임의로 확장하거나 변경해서는 안 된다.

---

# 51. Baseline Change Rule

다음 항목의 변경은 Product Baseline Change로 간주한다.

```text
MediQ Product Definition

P0 Access Mode

Exchange Session 역할

Patient Mapping Model

Cloud Role

Source-of-Record Policy

P0 / P1 Boundary

Real Patient Data Policy

Productionization Boundary
```

이러한 변경은 후속 Requirements나 Code에서 임의로 수행하지 않는다.

Baseline 문서를 먼저 수정해야 한다.

---

# 52. Next Documents

본 Product Baseline 승인 후 다음 산출물은:

```text
REQUIREMENTS.md
```

와:

```text
SECURITY-REQUIREMENTS.md
```

이다.

두 문서는 본 Baseline을 검증 가능한 상세 Requirement로 변환해야 한다.

예:

```text
PRODUCT BASELINE

"Consent 없이 의료영상에 접근할 수 없다."

        ↓

REQUIREMENT

REQ-CON-001

시스템은 ACTIVE Consent가 없는 Exchange Session에 대해
의료영상 Access Grant를 발급해서는 안 된다.

        ↓

TEST

TC-CON-001

No Consent
→ Grant Request
→ DENY
```

---

# 53. Baseline Decision

```text
PROJECT:
MediQ

PRODUCT:
Patient-Controlled Medical Imaging Mobility SaaS

CURRENT PRODUCT TARGET:
Capstone P0 Technical MVP

CORE BUSINESS OBJECT:
Exchange Session

IDENTITY MODEL:
MediQ Patient Reference
+
Hospital-local Patient Mapping

CONSENT MODEL:
Independent Consent Artifact

AUTHORIZATION MODEL:
Explicit Authorization
+
Scoped Transfer Grant

PAYLOAD MODEL:
Imaging Package

SOURCE OF RECORD:
Source Hospital PACS

MEDIQ CLOUD ROLE:
Temporary Medical Imaging Exchange Broker

P0 ACCESS MODES:
VIEW
DOWNLOAD
PACS_IMPORT

P1 ACCESS MODE:
MOBILE_EXPORT

SECURITY MODEL:
Explicit Authorization
Tenant Isolation
Integrity
Provenance
Audit

PATIENT-SIDE EDGE:
Mobile Secure Vault — P1

DATA POLICY:
Synthetic / Test / Approved De-identified Data Only

REAL PATIENT DATA:
NOT USED

PRODUCTION LEGAL READINESS:
OUT OF CURRENT MVP SCOPE

LEGACY HIGHPASS:
REFERENCE / CONTROLLED MIGRATION ONLY

PRODUCT BASELINE STATUS:
APPROVED
```

---

# 54. Baseline Review

```text
Product Definition:
PASS

MVP Alignment:
PASS

P0/P1 Separation:
PASS

Core Domain:
PASS

Patient Identity Boundary:
PASS

Exchange Session Model:
PASS

Consent / Authorization Separation:
PASS

Imaging Payload Boundary:
PASS

Cloud Role:
PASS

Access Mode Definition:
PASS

Tenant Boundary:
PASS

Security Baseline:
PASS

Legacy Boundary:
PASS

Productionization Boundary:
PASS

Scope Risk:
MEDIUM

Primary Risk:
Feature and Architecture Expansion Before P0 E2E Completion

NEXT DOCUMENT:
REQUIREMENTS.md

PRODUCT BASELINE READY:
YES
```

---

# 34. Viewer and Storage Product Amendment — 2026-09-15

## 34.1 제품 역할

MediQ는 `Patient-Controlled Medical Imaging Exchange Broker`이자 `Authorized Viewer Gateway`다. MediQ는 병원 PACS를 대체하지 않으며 의료영상 원본 또는 장기 Archive의 관리주체가 아니다.

| 위치 | 데이터 역할 | Viewer 역할 | Scope |
|---|---|---|---|
| Hospital A PACS | 원본, Source of Record | DICOMweb 원본 제공 | P0 |
| MediQ Cloud | Temporary/Ephemeral 처리 | Hospital/Patient Cloud Viewer Gateway | P0 |
| Hospital B PACS | 승인된 Imported Copy | 병원 내부 PACS Viewer 가능 | P0 |
| Mobile Secure Vault | 환자 통제 암호화 Local Copy | Patient Mobile Viewer | P1 |

## 34.2 Cloud Viewer

Cloud Viewer는 영구 저장된 MediQ 영상 Archive를 조회하지 않는다. 승인된 요청마다 Backend가 Source Hospital PACS에서 필요한 DICOM 객체를 WADO-RS로 온디맨드 조회하고 Viewer에 점진적으로 전달한다.

P0 Actor:

- 승인된 Destination/Participating Hospital User
- Synthetic Patient

두 Actor는 동일한 `study:view` Action을 사용하더라도 Identity, Tenant, PatientReference 및 Recipient Binding 규칙을 각각 적용한다.

## 34.3 Patient Mobile Viewer

Patient Mobile Viewer는 P1이다. `study:mobile-export`가 허용한 Secure Medical Capsule이 Mobile Secure Vault에 저장된 이후, Device Binding과 환자 인증을 거쳐 로컬 Copy를 열람한다. Cloud Viewer와 Mobile Viewer는 동일한 데이터 경로가 아니다.

## 34.4 비제품 약속

MediQ는 Permanent Cloud PACS, 장기 의료영상 Archive 또는 Full EMR/PHR Platform을 현재 제품 범위로 약속하지 않는다.

## 34.5 P1 Mobile MVP Product Policy — 2026-09-15

| 항목 | 승인 기준 |
|---|---|
| Native 플랫폼 | Android 우선; iOS Native Vault는 후속 단계 |
| iOS MVP 경로 | 적용 가능한 Identity/Test 범위의 반응형 Cloud Viewer |
| 기기 보안 등급 | StrongBox 선호, Android TEE 허용, Software/Unknown Persistent Vault 거부 |
| Payload 보호 | AES-256-GCM 기반 Secure Medical Capsule과 Device-bound Envelope Encryption |
| Crypto Agility | 버전된 Crypto Suite와 복수 Key Wrap Slot; PQC는 DEK Wrap/Key Establishment 계층에서 전환 |
| Offline | 마지막 성공한 발급/온라인 검증부터 30일 |
| Background | 즉시 Privacy Screen; 조건 충족 시 60초 재인증 유예 |
| 화면 캡처 | 플랫폼 제공 범위에서 Screenshot·녹화·미러링 기본 제한 |
| 분실/교체 | Key 복구 없음; Device 재등록 후 Source PACS 재다운로드 |

Offline Lease와 Lost Device Revocation은 더 이상 단순 Future 검토 항목이 아니라 P1 기준이다. `Recoverable Vault`를 Cloud Key Escrow 또는 Cross-device Key Migration으로 구현하지 않으며, 복구 경로는 유효한 Consent/Grant 재검증 후 Source PACS에서 재다운로드하는 방식이다.

---

# Synthetic Health Data Preview Product Amendment — 2026-09-26

## Product Decision

MediQ Mobile은 향후 건강정보 고속도로 연계 UX를 설명하기 위한 합성 건강정보 Preview를 P1 Prototype으로 제공할 수 있다.

```text
Product Value:
Patient-controlled health information preview

Capstone Data:
Synthetic/Test only

Capstone Provider:
Mock only

Real Integration:
PRODUCTIONIZATION
```

## Approved Preview Capability

- 건강검진·일반 혈액검사·항체검사·진료이력·투약이력·예방접종의 합성 목록과 상세
- 같은 날짜의 합성 의료영상과 검사정보를 관련 기록으로 함께 찾는 환자 편의 표현
- 모의 본인확인, 선택적 데이터 범위, 모의 활용동의
- 모든 Record와 화면의 `SYNTHETIC / DEMO MODE` 표시
- 실제 Provider와 교체 가능한 `HealthDataProvider` 논리 경계
- Preview 초기화와 `DEMO_*` Audit Event

## Product Non-Claims

Preview는 실제 건강정보 고속도로 활용기관 승인, 공식 연동, FHIR 적합성, 실환자 Identity, 실제 건강기록 또는 의료적 해석을 의미하지 않는다. Full FHIR Platform과 Full PHR은 계속 Non-Goal이다.

검사결과의 값·단위·참고범위·판정은 `합성 제공기관 원문`으로만 표시한다. MediQ가 정상·비정상·면역·질환 여부를 새로 계산하지 않으며 관련 영상 표시는 인과관계 또는 진단을 의미하지 않는다.

상세 기준은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다. 이 Amendment는 기존 `FHIR Integration` Productionization 경계를 실제 연계 범위로 승격하지 않는다.

# Patient Experience Product Amendment — 2026-09-26

MediQ는 P0 보안·교환 기준선 위에 다음 환자 경험 계층을 둘 수 있다.

- P1: 행동센터, 접근이력·동의 영수증, 최소 알림, 병원 방문 모드, 쉬운 영상 카드, 저장공간·만료 관리, 오류 복구
- POST-MVP: 판독문·의뢰서 묶음, 보호자·가족 위임

제품 원칙은 `환자가 다음 행동을 이해할 수 있음`, `민감정보 최소 표시`, `서버 권위 상태`, `명시적 승인`, `안전한 실패`다. 카드·알림·QR·즐겨찾기·딥링크는 권한이 아니며, 앱은 의료영상이나 임상 문서에서 진단·정상/이상을 추론하지 않는다.

정식 기능 범위와 금지사항은 `patient-experience/README.md` 및 아홉 Feature Spec을 따른다. 이 Amendment는 기능 구현, 실제 병원 연동, 법적 위임 적합성 또는 임상 문서 상호운용 완료를 주장하지 않는다.

# Hospital Clinical Workflow Product Amendment — 2026-09-27

MediQ Hospital Portal은 P0 교환·Viewer·PACS Import 화면 위에 다음 P1 업무 편의 계층을 둘 수 있다.

- 권한 범위의 관련 과거 영상 비교
- Resource별 권한을 보존하는 진료 인계 패킷
- 계정 공유 없는 팀 배정·인계
- 개인정보 최소 Hospital Inbox
- Audit·Provenance 원장을 설명하는 역할별 타임라인

제품 원칙은 `서버 권위 상태`, `업무 배정과 접근권한 분리`, `Study별 재인가`, `임상문서 권한 분리`, `최소정보 알림`, `원장 불변 Projection`이다. 이 기능은 Full RIS/EMR, 전역 환자검색, 자동 진단, Permanent Cloud PACS 또는 장기 Clinical Document Store를 제품 범위로 추가하지 않는다.

상세 기준은 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`를 따른다. P1 Screen Extension은 기존 79개 SaaS Screen ID를 재번호화하지 않으며 `HCW-SCR-*` Namespace를 사용한다.
