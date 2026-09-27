# MediQ System Architecture

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `SYSTEM-ARCHITECTURE.md`
**Version:** v1.4 Synthetic Patient Explanation RAG Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Architecture Style:** Modular Monolith + External Imaging Components
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ의 Product Baseline, Functional Requirements, Security Requirements 및 Domain Model을 실제 시스템 Component와 Runtime 구조로 변환한다.

## 1.1 Synthetic RAG Optional Module

```text
Patient Experience UI
  → Synthetic Record Gate
  → Intent Policy / Context Minimizer
  → Local Knowledge Catalog / Retriever
  → Mock Generator 또는 승인된 Local Experiment
  → Citation / Safety Validator
  → Patient Explanation Projection
```

이 Module은 P0 Control·Imaging·Security Plane과 독립된 P1 실패경계를 가진다. 첫 구현에는 외부 Network, Vector Database, 실제 환자자료와 외부 Model Provider가 없다. 상세 Component 계약은 `docs/ai/RAG-ARCHITECTURE-AND-DATA-FLOW.md`를 따른다.

본 문서의 핵심 목적은 다음과 같다.

```text
Domain Model
    ↓
Application Component
    ↓
Runtime Boundary
    ↓
Data Flow
    ↓
Security Boundary
    ↓
Deployment Unit
```

본 문서는 세부 API Contract 또는 DB Schema를 확정하는 문서가 아니다.

해당 내용은 이후:

```text
DATA-MODEL.md
ERD.md
OPENAPI.yaml
```

에서 구체화한다.

---

# 2. Normative Architecture Inputs

Architecture는 다음 문서를 따른다.

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
```

본 문서는 상위 Baseline의 P0/P1/Future 경계를 변경하지 않는다.

---

# 3. Architecture Goal

MediQ P0 Architecture의 최우선 목표는 다음 E2E를 최소한의 복잡도로 구현하는 것이다.

```text
Hospital A Test Orthanc
          │
          │ DICOMweb
          ▼
        MediQ
          │
          ├─ Patient Mapping
          ├─ Exchange Session
          ├─ Consent
          ├─ Authorization
          ├─ Transfer Grant
          ├─ Imaging Package
          ├─ Audit
          └─ Provenance / Integrity
          │
     ┌────┼─────────────┐
     │    │             │
     ▼    ▼             ▼
   VIEW DOWNLOAD    PACS_IMPORT
                        │
                        ▼
                Hospital B
                Test Orthanc
```

---

# 4. Architecture Decision Summary

MediQ P0의 기본 Architecture Style은:

> **Modular Monolith + External Orthanc + Web Viewer**

로 한다.

다음 구조를 기본으로 채택한다.

```text
Browser / User
     │
     ▼
MediQ Web / Viewer
     │
     ▼
MediQ Backend API
(Modular Monolith)
     │
     ├─ Control Modules
     ├─ Imaging Modules
     ├─ Security Modules
     ├─ Audit / Provenance
     │
     ├─ PostgreSQL
     ├─ Temporary Imaging Storage
     │
     ├───────────────┐
     ▼               ▼
Hospital A        Hospital B
Orthanc           Orthanc
```

---

# 5. Why Modular Monolith

현재 단계에서 다음 구조는 사용하지 않는다.

```text
Patient Service
Exchange Service
Consent Service
Authorization Service
Imaging Service
Audit Service
Provenance Service
```

를 각각 독립 Network Service로 분리하는 Full Microservices Architecture.

그 이유는:

```text
소규모 팀
+
캡스톤 일정
+
높은 Domain 변경 가능성
+
P0 E2E 우선
+
불필요한 Network Complexity 방지
```

때문이다.

대신 코드 수준에서는 Module을 엄격히 분리한다.

```text
One Deployable Backend
        │
        ├─ Patient Module
        ├─ Exchange Module
        ├─ Consent Module
        ├─ Authorization Module
        ├─ Imaging Module
        ├─ Transfer Module
        ├─ Audit Module
        └─ Provenance Module
```

향후 필요 시 독립 Service로 분리할 수 있도록 Interface Boundary는 유지한다.

---

# 6. Architecture Planes

MediQ를 네 개 Plane으로 구분한다.

```text
┌────────────────────────────────────┐
│            CONTROL PLANE           │
├────────────────────────────────────┤
│            IMAGING PLANE           │
├────────────────────────────────────┤
│            SECURITY PLANE          │
├────────────────────────────────────┤
│              EDGE PLANE            │
└────────────────────────────────────┘
```

이 구분은 논리 Architecture이며 반드시 별도 Server를 의미하지 않는다.

---

# 7. Control Plane

Control Plane은 의료영상 Payload 자체보다 **업무·정책·상태·권한**을 관리한다.

포함:

```text
Organization
Tenant
Hospital Registry
Actor / User Context

Patient Reference
Patient Mapping

Exchange Session

Consent

Authorization Decision

Transfer Grant

Route / Access Mode

Lifecycle State
```

---

# 8. Control Plane Components

## 8.1 Patient Module

책임:

```text
PatientReference 생성 / 조회
PatientMapping 생성 / 조회
Hospital-local ID 연결
Mapping 상태 검증
```

Domain:

```text
PatientReference
PatientMapping
```

보안 Invariant:

```text
Missing Mapping
→ PACS_IMPORT DENY
```

---

## 8.2 Exchange Module

책임:

```text
ExchangeSession 생성
상태 관리
Source / Destination 연결
PatientReference 연결
Access Mode 관리
Session Lifecycle 관리
```

Domain:

```text
ExchangeSession
```

---

## 8.3 Consent Module

책임:

```text
ConsentArtifact 생성
Consent 상태 관리
Allowed Action 관리
Resource Scope 관리
Withdrawal 처리
```

Domain:

```text
ConsentArtifact
```

핵심 Rule:

```text
Consent
≠
Authorization
```

---

## 8.4 Authorization Module

책임:

```text
Actor 확인
Tenant 확인
Session 확인
Consent 확인
Resource 확인
Requested Action 확인
Transfer Grant 검증
ALLOW / DENY 결정
```

결정 모델:

```text
Actor
+
Tenant
+
Session
+
Consent
+
Grant
+
Resource
+
Action
    ↓
Policy Evaluation
    ↓
ALLOW / DENY
```

---

## 8.5 Grant Module

논리적으로 Authorization Module 내부 또는 인접 Module로 구현할 수 있다.

책임:

```text
TransferGrant 생성
Scope 관리
Recipient Binding
Expiration
Revocation
```

P0 Scope:

```text
study:view
study:download
study:pacs-transfer
```

P1:

```text
study:mobile-export
```

---

# 9. Imaging Plane

Imaging Plane은 실제 의료영상 Payload와 DICOM/DICOMweb 처리를 담당한다.

포함:

```text
ImagingPackage

StudyReference

DICOM

DICOMweb

QIDO-RS

WADO-RS

STOW-RS

Temporary Imaging Storage

Web Viewer Imaging Delivery

PACS Transfer
```

---

# 10. Imaging Plane Components

## 10.1 DICOMweb Adapter

외부 PACS/Orthanc와 MediQ Domain 사이의 Adapter다.

책임:

```text
QIDO-RS
WADO-RS
STOW-RS
Endpoint Handling
DICOMweb Error Normalization
```

Architecture 원칙:

```text
Core Domain
≠
Orthanc-specific API
```

즉 Orthanc 특화 구현은 Adapter 내부로 제한한다.

---

## 10.2 Imaging Module

책임:

```text
ImagingPackage 등록
StudyReference 관리
Source Hospital 연결
Temporary Payload Reference 관리
Integrity Reference 연결
```

Domain:

```text
ImagingPackage
StudyReference
IntegrityEvidence
```

---

## 10.3 Transfer Module

책임:

```text
PACS_IMPORT 실행
Destination 검증
Patient Mapping 검증
Grant Scope 확인
STOW-RS 호출
Transfer 결과 기록
```

실행 전:

```text
Valid Session?
Valid Consent?
Valid Grant?
study:pacs-transfer?
Correct Destination?
Valid Patient Mapping?
Endpoint Available?
```

중 하나라도 핵심 조건이 실패하면:

```text
NO TRANSFER
```

---

## 10.4 Viewer Gateway

Viewer가 의료영상에 직접 무제한 접근하지 않도록 MediQ Authorization을 통과한 Imaging Access를 제공한다.

논리 흐름:

```text
Browser
   ↓
Viewer Request
   ↓
MediQ Authorization
   ↓
study:view 확인
   ↓
Imaging Access
   ↓
Viewer Render
```

Study UID를 알고 있다는 것만으로 접근할 수 없어야 한다.

---

# 11. Security Plane

Security Plane은 모든 Plane에 횡단적으로 적용된다.

포함:

```text
Authentication

Authorization

Tenant Isolation

Grant Validation

Transport Security

Secret Management

Token Validation

Integrity Verification

Security Audit

Fail Closed
```

Security Plane을 독립 Microservice로 구현할 필요는 없다.

P0에서는 Security Module 및 Middleware로 구현할 수 있다.

---

# 12. Authentication Component

P0에서는 다음 Actor/Service Context를 구분할 수 있어야 한다.

```text
User

Service

Hospital

Tenant
```

보호 Resource는 Authentication Context 없이 접근할 수 없다.

```text
Unauthenticated
→ DENY
```

---

# 13. Authorization Enforcement Points

최소 다음 위치에서 Authorization을 적용한다.

```text
Exchange Session 조회

Consent 관련 변경

Grant 생성

Viewer Access

DICOM Download

PACS Import

DICOMweb Proxy / Gateway

Protected Audit 조회
```

Authorization은 UI 수준에만 의존하지 않는다.

Backend에서 반드시 Enforcement한다.

---

# 14. Tenant Isolation

Tenant Context는 최소 다음에 존재한다.

```text
User / Actor
Hospital
ExchangeSession
TransferGrant
Protected Resource
```

기본 Rule:

```text
Cross-Tenant Access
→ DENY
```

예외:

```text
Explicit Exchange Authorization
→ Limited ALLOW
```

---

# 15. Security Middleware

Backend에는 공통 Security Pipeline을 적용한다.

```text
Request
   ↓
Authentication
   ↓
Tenant Resolution
   ↓
Input Validation
   ↓
Object Authorization
   ↓
Scope Validation
   ↓
Business Module
   ↓
Audit
```

실패:

```text
Security Validation Failure
→ FAIL CLOSED
```

---

# 16. Edge Plane

Edge Plane은 MediQ 외부와 직접 상호작용하는 Endpoint/Client 계층이다.

P0:

```text
Hospital A Test Orthanc
Hospital B Test Orthanc
Web Browser
Web Viewer
```

P1:

```text
Mobile Secure Vault
```

Future:

```text
Hospital Connector
```

---

# 17. Hospital A Edge

역할:

```text
SOURCE HOSPITAL
SOURCE PACS
SYSTEM OF RECORD
```

P0 구현:

```text
Orthanc A
```

지원 기능:

```text
QIDO-RS
WADO-RS
```

필요 시 STOW-RS를 테스트에 사용할 수 있으나 Source 역할의 핵심은 Query/Retrieve다.

---

# 18. Hospital B Edge

역할:

```text
DESTINATION HOSPITAL
DESTINATION IMPORTED COPY
```

P0 구현:

```text
Orthanc B
```

지원 핵심 기능:

```text
STOW-RS
```

성공 PACS Import는 B Orthanc에서 Study 존재를 검증해야 한다.

---

# 19. Web Edge

Web Layer는 다음 기능을 제공할 수 있다.

```text
Exchange Session UI
Consent UI
Access Status
Viewer
Download Trigger
Transfer Status
```

UI는 Security Decision Source가 아니다.

모든 보안결정은 Backend에서 재검증한다.

---

# 20. P1 Mobile Edge

Mobile Secure Vault는 P1이다.

논리 구조:

```text
MediQ
   ↓
study:mobile-export
   ↓
Secure Medical Capsule
   ↓
Mobile Secure Vault
```

P1 미구현은 P0 Architecture 실패가 아니다.

---

# 21. High-Level Component Architecture

```text
                         ┌────────────────────┐
                         │   User / Browser   │
                         └─────────┬──────────┘
                                   │ HTTPS
                                   ▼
                     ┌────────────────────────┐
                     │     MediQ Web UI       │
                     │        Viewer          │
                     └──────────┬─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────┐
│                   MEDIQ BACKEND API                     │
│                 Modular Monolith                        │
│                                                         │
│  ┌──────────────── CONTROL PLANE ───────────────────┐   │
│  │ Patient Module                                   │   │
│  │ Exchange Module                                  │   │
│  │ Consent Module                                   │   │
│  │ Authorization / Grant Module                     │   │
│  │ Hospital / Tenant Registry                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────── IMAGING PLANE ───────────────────┐   │
│  │ Imaging Module                                   │   │
│  │ DICOMweb Adapter                                 │   │
│  │ Transfer Module                                  │   │
│  │ Viewer Access Gateway                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────── SECURITY PLANE ──────────────────┐   │
│  │ Authentication                                   │   │
│  │ Authorization Enforcement                       │   │
│  │ Tenant Isolation                                │   │
│  │ Grant Validation                                │   │
│  │ Integrity                                       │   │
│  │ Audit / Logging                                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────── GOVERNANCE ──────────────────────┐   │
│  │ Provenance                                       │   │
│  │ Audit                                            │   │
│  └──────────────────────────────────────────────────┘   │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
           ▼                           ▼
   ┌───────────────┐           ┌──────────────────┐
   │  PostgreSQL   │           │ Temporary Imaging│
   │ Metadata /    │           │ Storage          │
   │ Control Data  │           │                  │
   └───────────────┘           └──────────────────┘

           │ DICOMweb                     │ DICOMweb
           ▼                              ▼

┌─────────────────────┐        ┌─────────────────────┐
│ Hospital A Orthanc  │        │ Hospital B Orthanc  │
│ Source              │        │ Destination         │
│ QIDO / WADO         │        │ STOW                │
└─────────────────────┘        └─────────────────────┘
```

---

# 22. Backend Module Boundary

권장 Backend 구조:

```text
mediQ-backend/

modules/
├─ organization/
├─ tenant/
├─ patient/
├─ exchange/
├─ consent/
├─ authorization/
├─ imaging/
├─ transfer/
├─ provenance/
└─ audit/

adapters/
├─ dicomweb/
├─ persistence/
├─ storage/
└─ security/

shared/
├─ errors/
├─ types/
├─ config/
└─ observability/
```

실제 언어/Framework는 Implementation Plan에서 결정한다.

---

# 23. Domain-to-Component Mapping

| Domain                 | Component                     |
| ---------------------- | ----------------------------- |
| PatientReference       | Patient Module                |
| PatientMapping         | Patient Module                |
| ExchangeSession        | Exchange Module               |
| ConsentArtifact        | Consent Module                |
| Authorization Decision | Authorization Module          |
| TransferGrant          | Authorization / Grant Module  |
| ImagingPackage         | Imaging Module                |
| StudyReference         | Imaging Module                |
| PACS Transfer          | Transfer Module               |
| IntegrityEvidence      | Imaging / Integrity Component |
| ProvenanceRecord       | Provenance Module             |
| AuditEvent             | Audit Module                  |
| Hospital / Tenant      | Registry / Control Module     |

이 Mapping이 Microservice 경계를 의미하지는 않는다.

---

# 24. Data Architecture

데이터를 두 종류로 분리한다.

## Control / Metadata

저장:

```text
PostgreSQL
```

대상:

```text
Organization
Tenant
Hospital
PatientReference
PatientMapping
ExchangeSession
ConsentArtifact
TransferGrant
ImagingPackage Metadata
StudyReference
ProvenanceRecord
AuditEvent
```

---

## Imaging Payload

저장:

```text
Temporary Imaging Storage
```

또는 Source Orthanc에서 필요 시 조회한다.

Payload를 관계형 DB BLOB 중심으로 설계하지 않는다.

---

# 25. Data Separation Principle

```text
Metadata
→ Relational Database

Medical Imaging Binary
→ Imaging / Object Storage or DICOM Source
```

Audit DB에 DICOM Binary를 저장하지 않는다.

---

# 26. Medical Imaging Source Model

원본 역할:

```text
Hospital A PACS
=
SYSTEM OF RECORD
```

MediQ:

```text
TEMPORARY EXCHANGE COPY
```

Hospital B:

```text
DESTINATION IMPORTED COPY
```

P1:

```text
Mobile Secure Vault
=
PATIENT-HELD SECURE COPY
```

---

# 27. P0 E2E Flow — Exchange Creation

```text
User / Hospital B
       ↓
POST Exchange Request
       ↓
MediQ Backend
       ↓
PatientReference 조회
       ↓
Source / Destination 조회
       ↓
ExchangeSession 생성
       ↓
REQUESTED
       ↓
Audit SESSION_CREATED
```

---

# 28. P0 E2E Flow — Consent

```text
ExchangeSession
       ↓
Consent Request
       ↓
Synthetic Patient Approval
       ↓
ConsentArtifact
       ↓
ACTIVE
       ↓
Session
CONSENTED
       ↓
Audit
```

현재 이는 법적 전자동의 시스템이 아니라 Technical PoC다.

---

# 29. P0 E2E Flow — Grant

```text
Access Request
       ↓
Authorization Module
       ↓
Actor
Tenant
Session
Consent
Resource
Action
       ↓
Policy Evaluation
       ↓
ALLOW
       ↓
TransferGrant
```

실패:

```text
Missing / Invalid Context
→ DENY
```

---

# 30. P0 E2E Flow — Viewer

```text
Browser
  ↓
Viewer Request
  ↓
MediQ
  ↓
Authentication
  ↓
Session
  ↓
Consent
  ↓
study:view
  ↓
Authorization
  ↓
WADO-RS
  ↓
Web Viewer
```

---

# 31. P0 E2E Flow — Download

```text
Download Request
       ↓
Authentication
       ↓
Authorization
       ↓
study:download
       ↓
Imaging Package
       ↓
DICOM Download
```

Viewer 권한은 Download 권한으로 자동 변환되지 않는다.

---

# 32. P0 E2E Flow — PACS Import

```text
PACS_IMPORT Request
       ↓
Authentication
       ↓
Authorization
       ↓
study:pacs-transfer
       ↓
Destination Validation
       ↓
Patient Mapping
       ↓
ImagingPackage
       ↓
STOW-RS
       ↓
Hospital B Orthanc
       ↓
Destination Verification
       ↓
Integrity Verification
       ↓
Provenance
       ↓
Audit
```

---

# 33. DICOMweb Adapter Design

Core Application은 DICOMweb Client Library에 직접 강하게 결합하지 않는다.

Interface 예:

```text
DicomGateway

queryStudies()

retrieveStudy()

storeStudy()

checkCapability()
```

구현:

```text
OrthancDicomwebAdapter
```

향후:

```text
VendorSpecificDicomwebAdapter
```

로 교체 가능하게 한다.

---

# 34. Storage Adapter

Temporary Storage 역시 Adapter Boundary를 둔다.

```text
ImagingStorage
```

후보 구현:

```text
Local File Storage
Development Object Storage
```

Production:

```text
Cloud Object Storage
```

는 후속 단계다.

---

# 35. Persistence Adapter

Core Domain이 특정 ORM/DB에 직접 종속되지 않도록 Repository Boundary를 둔다.

예:

```text
PatientRepository
ExchangeRepository
ConsentRepository
GrantRepository
AuditRepository
ProvenanceRepository
```

단, 캡스톤에서 불필요하게 복잡한 DDD Framework를 도입할 필요는 없다.

---

# 36. Security Enforcement Architecture

보안 검증을 한 곳에만 의존하지 않는다.

```text
HTTP Middleware
       ↓
Authentication
       ↓
Tenant Context
       ↓
Application Service
       ↓
Object Authorization
       ↓
Domain Invariant
       ↓
External Adapter
```

즉:

```text
Controller Check only
X
```

가 아니라 Layer별 방어를 적용한다.

---

# 37. Authorization Boundary

Authorization Module은 최소 다음 Interface를 제공할 수 있다.

```text
authorize(
    actor,
    tenant,
    session,
    resource,
    action
)
```

결과:

```text
ALLOW
DENY
```

Grant 발급:

```text
issueGrant(...)
```

Grant 검증:

```text
validateGrant(...)
```

구체 API는 OPENAPI에서 결정한다.

---

# 38. Fail-Closed Architecture

다음 조건에서 외부 Action을 수행하지 않는다.

```text
Authentication Failure
Authorization Failure
Consent Validation Failure
Grant Validation Failure
Tenant Mismatch
Patient Mapping Failure
Destination Validation Failure
```

특히:

```text
Authorization Service Error
→ ALLOW
```

구조를 금지한다.

---

# 39. Integrity Architecture

P0 Bit-preserving 전송 기준:

```text
Source Object
       ↓
Source Integrity Evidence
       ↓
MediQ Transfer
       ↓
Destination Object
       ↓
Destination Integrity Evidence
       ↓
Compare
       ↓
VERIFIED / FAILED
```

`FAILED`이면 성공 Transfer로 완료하지 않는다.

---

# 40. Provenance Architecture

Provenance는 다음 관계를 기록한다.

```text
Source Hospital
       ↓
Source Study
       ↓
Imaging Package
       ↓
Exchange Session
       ↓
Destination
       ↓
Integrity Result
```

Provenance와 Audit의 차이:

```text
Provenance
=
Data가 어디에서 어디로 이동했는가

Audit
=
누가 언제 무엇을 수행했는가
```

---

# 41. Audit Architecture

Audit은 Business Module에서 발생한 주요 Event를 기록한다.

예:

```text
Exchange Module
→ SESSION_CREATED

Consent Module
→ CONSENT_APPROVED

Authorization Module
→ AUTHORIZATION_DENIED

Transfer Module
→ PACS_TRANSFER_COMPLETED
```

P0에서는 별도 Kafka/Event Bus를 필수로 하지 않는다.

직접 Audit Service 호출 또는 내부 Event 방식 모두 허용한다.

---

# 42. Observability

P0에서 필요한 Observability는 다음 수준이다.

```text
Application Logs
Structured Audit Events
Session Status
Transfer Status
DICOMweb Result
Integrity Result
Error Reason
```

다음은 현재 필수가 아니다.

```text
Full SIEM
Distributed Tracing Platform
Enterprise APM
SOC Integration
```

---

# 43. Network Architecture

P0 논리 Network:

```text
Browser
   │ HTTPS
   ▼
MediQ Web/API
   │
   ├─ PostgreSQL
   ├─ Temporary Storage
   │
   │ HTTPS / DICOMweb
   ▼
Orthanc A

MediQ
   │ HTTPS / DICOMweb
   ▼
Orthanc B
```

실제 Hospital Internal Network 구조는 Productionization에서 검토한다.

---

# 44. Transport Security

P0:

```text
HTTPS / TLS
```

를 기본으로 한다.

대상:

```text
Browser ↔ MediQ

MediQ ↔ Orthanc A

MediQ ↔ Orthanc B
```

mTLS는:

```text
P0 SHOULD
```

이며 기존 검증 Asset을 재사용할 수 있다.

하지만 mTLS 자체가 P0 E2E 구현을 차단해서는 안 된다.

---

# 45. Secrets Architecture

Source Code:

```text
Password
API Secret
Private Key
DB Password
```

Hard-code 금지.

개발환경에서는:

```text
Environment Variables
Docker Secret-like Injection
Local Secure Configuration
```

등을 사용할 수 있다.

Production Secret Manager는 Future다.

---

# 46. Deployment Architecture

P0 권장 Deployment:

```text
Docker Compose

├─ mediq-api
├─ mediq-web
├─ postgres
├─ orthanc-a
├─ orthanc-b
└─ optional temporary-storage
```

Viewer가 별도 Component인 경우:

```text
├─ mediq-viewer
```

를 추가할 수 있다.

---

# 47. Why Docker Compose

현재 목표는:

```text
Reproducible
Local
Demo-friendly
E2E-testable
```

환경이다.

다음은 P0 필수가 아니다.

```text
Kubernetes
Service Mesh
Multi-region
Autoscaling
Production Load Balancer
```

---

# 48. Physical Deployment Baseline

```text
Developer / Demo Host
       │
       └─ Docker Network
              │
              ├─ MediQ API
              ├─ MediQ Web
              ├─ PostgreSQL
              ├─ Orthanc A
              └─ Orthanc B
```

이 구조로 전체 E2E를 재현할 수 있어야 한다.

---

# 49. Repository Architecture

권장 구조:

```text
MediQ/

├─ apps/
│  ├─ api/
│  ├─ web/
│  └─ viewer/
│
├─ modules/
│  ├─ organization/
│  ├─ tenant/
│  ├─ patient/
│  ├─ exchange/
│  ├─ consent/
│  ├─ authorization/
│  ├─ imaging/
│  ├─ transfer/
│  ├─ provenance/
│  └─ audit/
│
├─ adapters/
│  ├─ dicomweb/
│  ├─ persistence/
│  ├─ storage/
│  └─ security/
│
├─ infra/
│  ├─ docker/
│  └─ dev/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ security/
│  └─ e2e/
│
└─ docs/
```

실제 Framework에 따라 조정 가능하다.

---

# 50. Module Dependency Rule

권장 Dependency:

```text
Web / API
   ↓
Application Modules
   ↓
Domain
   ↓
Port / Interface
   ↓
Adapters
```

금지:

```text
Domain
→ Orthanc SDK directly

Domain
→ Web Framework

Domain
→ HTTP Controller

Domain
→ DB-specific Query
```

단, 캡스톤에서는 완전한 Clean Architecture 구현보다 **의존성 방향을 유지하는 것**이 중요하다.

---

# 51. Architecture Invariants

## ARCH-INV-001

```text
ExchangeSession
≠
ImagingPackage
```

## ARCH-INV-002

```text
Consent
≠
Authorization
≠
TransferGrant
```

## ARCH-INV-003

```text
Hospital Local Patient ID
≠
MediQ PatientReference
```

## ARCH-INV-004

모든 보호 Imaging Action은 Backend Authorization을 거쳐야 한다.

## ARCH-INV-005

UI가 Security Enforcement Point의 유일한 위치가 되어서는 안 된다.

## ARCH-INV-006

Cross-Tenant Access는 기본 DENY다.

## ARCH-INV-007

MediQ Cloud는 Source of Record가 아니다.

## ARCH-INV-008

P1 Mobile 기능은 P0 Backend Core를 깨뜨리지 않는 Extension이어야 한다.

---

# 52. Architecture Decision — Microservices

Decision:

```text
FULL MICROSERVICES:
REJECTED FOR P0
```

선택:

```text
MODULAR MONOLITH:
APPROVED
```

이유:

```text
작은 팀
짧은 일정
복잡한 Domain
E2E 우선
운영 복잡도 감소
테스트 용이성
```

향후 독립 Service 전환 가능성을 위해 Module Boundary는 유지한다.

---

# 53. Architecture Decision — Cloud PACS

```text
MEDIQ AS PERMANENT CLOUD PACS:
REJECTED
```

MediQ 역할:

```text
Medical Imaging Exchange Broker
```

---

# 54. Architecture Decision — Imaging Storage

P0에서는 다음 둘 모두 허용한다.

```text
A. Source Orthanc에서 필요 시 Retrieve

B. Temporary Imaging Copy 사용
```

단:

```text
Permanent Cloud Storage
```

로 제품 Scope를 확장하지 않는다.

---

# 55. Architecture Decision — Viewer

Viewer는 독립 제품이 아니다.

MediQ의 Access Mode 중:

```text
VIEW
```

를 구현하는 Edge Component다.

---

# 56. Architecture Decision — Mobile

```text
Mobile Secure Vault
=
P1 Edge Extension
```

P0 Backend의 핵심 Domain은 Mobile 없이 완성 가능해야 한다.

---

# 57. Architecture Decision — Hospital Connector

Hospital Connector는 향후 실제 병원 Integration에서 유효할 수 있다.

P0:

```text
INTERFACE CONCEPT ONLY
```

P1/P2:

```text
OPTIONAL PoC
```

Production:

```text
LIKELY REQUIRED
```

---

# 58. P0 Component Gate

P0 완료를 위해 최소 다음 Component가 동작해야 한다.

```text
GATE-ARCH-01
MediQ API

GATE-ARCH-02
PostgreSQL

GATE-ARCH-03
Hospital A Orthanc

GATE-ARCH-04
Hospital B Orthanc

GATE-ARCH-05
Patient Module

GATE-ARCH-06
Exchange Module

GATE-ARCH-07
Consent Module

GATE-ARCH-08
Authorization / Grant Module

GATE-ARCH-09
Imaging / DICOMweb Adapter

GATE-ARCH-10
Viewer Access

GATE-ARCH-11
Download

GATE-ARCH-12
PACS Transfer

GATE-ARCH-13
Tenant Isolation

GATE-ARCH-14
Audit

GATE-ARCH-15
Provenance / Integrity

GATE-ARCH-16
E2E Test Environment
```

---

# 59. P1 Architecture

P1 추가 Architecture:

```text
Mobile App
   │
   ▼
MediQ API
   │
study:mobile-export
   │
   ▼
Secure Medical Capsule
   │
   ▼
Mobile Secure Vault
```

추가 Security Plane:

```text
Hardware-backed Key

Device Binding

Biometric Unlock

Crypto-Shredding
```

P1은 별도 Architecture Extension 문서로 상세화할 수 있다.

---

# 60. Productionization Boundary

현재 Architecture에 포함하지 않는 Production Component:

```text
Enterprise API Gateway

Hospital Production Connector

Enterprise IAM

Hospital SSO

Enterprise PKI

Enterprise KMS / HSM

Production Object Storage

Production SIEM

SOC Integration

Kubernetes

Multi-region

DR Site

Production Load Balancer

24x7 Monitoring
```

필요 시 Future Architecture에서 추가한다.

---

# 61. End-to-End Architecture Success Criteria

## ARCH-SC-01

```text
Orthanc A
→ QIDO/WADO
→ MediQ

PASS
```

## ARCH-SC-02

```text
Patient Mapping
→ ExchangeSession

PASS
```

## ARCH-SC-03

```text
No Consent
→ Access

DENY
```

## ARCH-SC-04

```text
Valid Consent
+
Valid Grant
→ Viewer

PASS
```

## ARCH-SC-05

```text
View-only Grant
→ Download

DENY
```

## ARCH-SC-06

```text
Valid study:download
→ Download

PASS
```

## ARCH-SC-07

```text
Valid study:pacs-transfer
+
Valid Mapping
→ STOW-RS
→ Orthanc B

PASS
```

## ARCH-SC-08

```text
Wrong Tenant
→ DENY
```

## ARCH-SC-09

```text
Source
→ MediQ
→ Destination

Integrity
→ PASS
```

## ARCH-SC-10

```text
Full Exchange Lifecycle
→ Audit / Provenance

Traceable
```

---

# 62. Architecture Risks

## Risk 1 — Over-Microservices

대응:

```text
Modular Monolith
```

---

## Risk 2 — Domain Coupling

대응:

```text
Module Boundaries
Adapter Pattern
Domain Invariants
```

---

## Risk 3 — DICOM Complexity

대응:

```text
Orthanc
DICOMweb
Adapter Boundary
Limited P0 Use Cases
```

---

## Risk 4 — Security Scope Expansion

대응:

```text
P0 Security Controls Only
Production Security Separation
```

---

## Risk 5 — Mobile Delay

대응:

```text
Mobile = P1
```

---

# 63. Architecture Quality Attributes

P0에서 우선하는 품질속성:

```text
Correctness

Security

Traceability

Interoperability

Testability

Maintainability

Reproducibility
```

P0에서 낮은 우선순위:

```text
Massive Scalability

Global Availability

High Availability

Multi-region

Extreme Performance Optimization
```

---

# 64. Architecture Traceability

| Domain / Requirement | Architecture Component              |
| -------------------- | ----------------------------------- |
| PatientReference     | Patient Module                      |
| PatientMapping       | Patient Module                      |
| ExchangeSession      | Exchange Module                     |
| ConsentArtifact      | Consent Module                      |
| Authorization        | Authorization Module                |
| TransferGrant        | Grant Module                        |
| ImagingPackage       | Imaging Module                      |
| QIDO/WADO/STOW       | DICOMweb Adapter                    |
| VIEW                 | Viewer Gateway                      |
| DOWNLOAD             | Imaging/Download Handler            |
| PACS_IMPORT          | Transfer Module                     |
| Tenant Isolation     | Security Middleware / Authorization |
| Integrity            | Integrity Component                 |
| Provenance           | Provenance Module                   |
| Audit                | Audit Module                        |

---

# 65. Architecture Baseline Decision

```text
PROJECT:
MediQ

ARCHITECTURE VERSION:
v1.1 Viewer Architecture Amendment

ARCHITECTURE STYLE:
Modular Monolith

DEPLOYMENT STYLE:
Docker Compose

CONTROL PLANE:
DEFINED

IMAGING PLANE:
DEFINED

SECURITY PLANE:
DEFINED

EDGE PLANE:
DEFINED

DATABASE:
Relational Metadata Store

IMAGING PAYLOAD:
Temporary Imaging Storage / Source Retrieval

SOURCE PACS:
Hospital A Orthanc

DESTINATION PACS:
Hospital B Orthanc

VIEWER:
MediQ Access Mode Component

AUTHORIZATION:
Backend Explicit Authorization

TENANT ISOLATION:
Mandatory

DICOM INTEGRATION:
Adapter-based

MICROSERVICES:
NOT REQUIRED FOR P0

MOBILE SECURE VAULT:
P1

HOSPITAL CONNECTOR:
POST-P0 / FUTURE

PRODUCTION INFRA:
OUT OF CURRENT SCOPE

SYSTEM ARCHITECTURE STATUS:
APPROVED BASELINE
```

---

# 66. Architecture Review

```text
P0 E2E Alignment:
PASS

Domain Mapping:
PASS

Control Plane:
PASS

Imaging Plane:
PASS

Security Plane:
PASS

Edge Plane:
PASS

Patient Identity Boundary:
PASS

Consent / Authorization Separation:
PASS

Imaging Payload Separation:
PASS

Tenant Isolation:
PASS

DICOMweb Integration Boundary:
PASS

Audit / Provenance:
PASS

Modular Monolith Decision:
PASS

Microservice Overengineering Risk:
CONTROLLED

P0/P1 Separation:
PASS

Productionization Separation:
PASS

ARCHITECTURE READY:
YES
```

---

# 67. Next Documents

본 Architecture 승인 후 다음 문서는 다음 순서로 작성한다.

```text
DATA-FLOW.md
      ↓
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

가장 먼저 `DATA-FLOW.md`에서 다음 4개 Scenario를 확정한다.

```text
FLOW-01
Hospital A → MediQ → Viewer

FLOW-02
Hospital A → MediQ → DICOM Download

FLOW-03
Hospital A → MediQ → Hospital B PACS

FLOW-04 P1
Hospital A → MediQ → Mobile Secure Vault
```

각 Flow에는 반드시:

```text
Data

Authentication

Authorization

Consent

Grant

Encryption

Audit

Provenance

Integrity
```

를 표시한다.

---

# FINAL ARCHITECTURE POLICY

> **MediQ P0는 Control Plane, Imaging Plane, Security Plane, Edge Plane으로 논리적으로 분리하되 이를 다수의 독립 Microservice로 구현하지 않는다.**

> **Backend는 Modular Monolith를 기본으로 하고 Patient, Exchange, Consent, Authorization, Imaging, Transfer, Provenance, Audit을 Module 단위로 분리한다.**

> **Hospital A Orthanc는 Source of Record, MediQ는 Temporary Medical Imaging Exchange Broker, Hospital B Orthanc는 Destination Imported Copy 역할을 가진다.**

> **모든 의료영상 Access는 Backend Authorization을 통과해야 하며, Consent·Grant·Tenant·Resource·Action의 검증이 실패하면 Fail Closed를 적용한다.**

> **P0 Architecture의 목적은 Architecture 자체의 복잡성이 아니라 `Hospital A → MediQ → Viewer/Download/Hospital B` 흐름을 보안통제와 함께 실제로 검증하는 것이다.**

---

# Viewer Gateway Architecture Amendment — 2026-09-15

## Architecture Decision

```text
Hospital A PACS
  = Source of Record

MediQ Cloud
  = Exchange Orchestrator
  = Authorization Gateway
  = DICOMweb Retrieval Proxy
  = Cloud Viewer Delivery Gateway
  = Ephemeral Processing Boundary
  != Permanent Cloud PACS

Hospital B PACS
  = Authorized Destination Imported Copy

Mobile Secure Vault
  = P1 Patient-Controlled Encrypted Local Copy
```

## P0 Cloud Viewer Path

```text
Hospital User / Synthetic Patient Browser
                │
                │ authenticated viewer request
                ▼
┌───────────────────────────────────────────────┐
│ MediQ Cloud                                  │
│                                               │
│ API → Consent/AuthZ/Grant → ViewerSession    │
│                         │                     │
│                         ▼                     │
│                  Viewer Gateway               │
│                         │                     │
│                  DICOMweb Adapter             │
│                         │                     │
│        Encrypted Memory / TTL Cache           │
└─────────────────────────┼─────────────────────┘
                          │ Backend-only WADO-RS
                          ▼
                  Hospital A Test Orthanc
                     Source of Record
```

Browser에는 MediQ-controlled Viewer endpoint만 제공한다. Hospital PACS endpoint, credential, internal network address 및 raw storage reference는 제공하지 않는다.

## Progressive Delivery

Viewer Gateway는 일반 video streaming server가 아니다. Viewer가 필요로 하는 Study·Series·Instance·Frame을 WADO-RS로 온디맨드 조회하여 점진적으로 전달한다. Transfer Syntax와 rendered frame 지원은 Orthanc/DICOMweb capability negotiation 결과를 따른다.

## Temporary Processing

- 기본은 memory/streaming pipeline이다.
- 재사용 또는 retry에 임시 객체가 필요한 경우 암호화, Tenant/Session/Study binding, TTL, 크기 제한 및 purge evidence를 적용한다.
- Cloud temporary copy는 의료영상 Source of Record나 장기 Archive가 아니다.
- Source PACS unavailable 시 영구 Cloud Copy로 우회하지 않고 Fail Closed한다.

## P1 Mobile Viewer Path

```text
MediQ MOBILE_EXPORT
  → Secure Medical Capsule
  → Device-Bound Encryption
  → Mobile Secure Vault
  → Patient Authentication / Biometric Unlock
  → Local Patient Mobile Viewer
```

Cloud Viewer와 Mobile Viewer는 공통 Consent/Grant 원칙을 공유하지만 Payload source와 lifecycle은 다르다.

---

# P1 Mobile Security Architecture Amendment — 2026-09-15

## Platform Rollout

```text
P1 Mobile MVP
  ├── Android Native Secure Vault: first implementation
  ├── iOS: responsive Cloud Viewer path
  └── iOS Native Secure Vault: subsequent implementation
```

Capsule Format, Crypto Suite Registry, Key Wrap Metadata 및 Mobile Export 업무행위는 플랫폼 독립적으로 설계한다.

## Device Admission

```text
Device Registration
  → Key generation in OS Keystore
  → Attestation / Security Level verification
  → STRONGBOX: ALLOW (preferred)
  → TRUSTED_ENVIRONMENT: ALLOW
  → SOFTWARE / UNKNOWN / verification failure: DENY Persistent Vault
  → Cloud Viewer fallback
```

StrongBox 사용 실패 시 TEE로 전환할 수 있으나 실제 등급을 서버에 제출하고 정책 검증을 받아야 하며 조용한 Software Fallback은 금지한다.

## Capsule Crypto Path

```text
DICOM Instance/Chunk
  → random per-Capsule DEK
  → AES-256-GCM authenticated encryption
  → DEK wrapped to Hardware-backed Device Key
  → versioned Wrap Slot(s)
  → encrypted app-private Mobile Vault
```

Viewer는 짧은 로컬 세션에서 DEK 사용을 한 번 승인하고 필요한 Instance/Chunk만 점진적으로 복호화한다. 평문 파일을 생성하지 않으며 Background 전환 시 렌더링과 복호화된 Pixel Buffer를 제거한다. PQC는 KEM/DEK Wrap 계층을 교체하거나 Hybrid Slot을 추가하여 전환하고 대용량 Payload를 불필요하게 재암호화하지 않는다.

## Offline and Background Policy

- Offline Lease: 마지막 성공한 발급/온라인 검증 후 30일
- Online refresh: Consent, Grant, Account, Device 상태 확인 후 갱신
- Expired while offline: Fail Closed
- Background/Inactive: Privacy Screen 즉시 표시
- Reauthentication grace: 동일 잠금 해제 기기에서 최대 60초
- OS 잠금, 상태 변경 또는 보안 이벤트: 즉시 Local Session 폐기 및 재인증

## Capture and Recovery Boundary

Android Viewer는 Secure Window를 사용한다. iOS 후속 구현은 App Switcher Snapshot을 가리고 녹화·미러링 감지 시 Viewer를 중단한다. 일반 Screenshot과 외부 카메라 방지를 완전 보장하지 않는다.

분실/교체 복구는 `Cloud Key Restore`가 아니라 다음 재발급 Flow다.

```text
Revoke/Lost old Device
  → deny future Lease refresh
  → register and verify new Device
  → re-check Patient Identity + Consent + Authorization + study:mobile-export
  → retrieve from Source PACS
  → create new Capsule and Device-bound Wrap
```

MediQ Cloud는 복구를 위한 Permanent DICOM Copy, Device Private Key 또는 Vault KEK를 보관하지 않는다.

---

# Azure Deployment Profile Recommendation — 2026-09-19

상세 권고는 `AZURE-DEPLOYMENT-RECOMMENDATIONS.md`에 정의한다. 이 프로파일은 `POST-MVP` 후보이며 현재 Docker Compose P0 Architecture를 대체하지 않는다.

```text
Browser / Mobile Web
  → Azure-hosted Web UI
  → MediQ API / Authorization Gateway
  → short-lived Viewer Session 또는 Scoped Transfer Grant
  → internal Viewer/Transfer Worker
  → approved Test PACS connectivity
  → Hospital A/B Test Orthanc
```

권장 Azure 매핑은 Web 정적 호스팅, Container Apps 기반 API/Worker, PostgreSQL Flexible Server, Temporary Blob Storage, Key Vault, Managed Identity, Container Registry 및 Azure Monitor다. 특정 Azure 서비스는 교체 가능한 infrastructure adapter이며 Domain Model이나 OpenAPI 업무행위를 변경하지 않는다.

## Connectivity Recommendation

- 학교 MVP는 Synthetic/Test Orthanc만 사용하며 VPN을 필수조건으로 만들지 않는다.
- 실제 병원 PACS에는 Hospital-side outbound Connector, Site-to-Site VPN 또는 승인된 Private Network 중 하나가 필요하다.
- Public mTLS ingress는 endpoint 인증 수단이며 Azure에서 병원 사설망으로 가는 연결 경로를 대신하지 않는다.
- 실제 PACS를 공용 인터넷에 직접 노출하지 않는다.

## Identity Recommendation

- Hospital User는 Workforce/Federated Identity를 사용한다.
- Patient는 별도 Patient Identity/CIAM Adapter를 사용한다.
- Hospital Connector는 X.509 인증서와 Hospital Registry binding을 사용한다.
- Azure 내부 서비스는 Managed Identity를 우선한다.

## Storage Recommendation

Azure Blob은 승인된 Viewer/Transfer/Mobile Export를 위한 TTL 기반 Temporary Processing에만 사용할 수 있다. `mobile-package`가 존재해도 단기 staging이며 장기 Cloud Backup, Source of Record 또는 Device Key Escrow가 아니다.

---

# Synthetic Health Data Preview Architecture Amendment — 2026-09-26

## Capstone Architecture

```text
Android Patient App
  → Health Data Preview Use Case
  → HealthDataProvider Port
      └── MockHealthDataProvider
            → Versioned Synthetic Fixture
  → Fixture Validator
  → Preview State/View Model
  → DEMO_* Audit Event
```

## Future Production Architecture

```text
Android Patient App
  → MediQ Backend Authorization/Consent Gateway
  → Approved Health Data Connector
  → Official Platform API
```

Future 경로는 설명용 Target이며 구현·연결·승인된 상태가 아니다.

Architecture constraints:

- Capstone Build에는 Mock Provider만 포함하고 실제 Connector 구현체·Base URL·Credential을 포함하지 않는다.
- Mobile Client가 실제 건강정보 기관 Endpoint를 직접 호출하지 않는다.
- Preview Module은 P0 DICOMweb Path, Cloud Viewer, PACS Import, Mobile Capsule과 독립 배포·실패 경계를 가진다.
- 실제 API Contract는 별도 OpenAPI, Identity, Consent, Security, Threat, Data Migration Gate 없이 추가할 수 없다.
- Preview는 Full FHIR Server를 요구하지 않으며 Fixture의 FHIR-shaped 구조를 공식 상호운용 적합성으로 주장하지 않는다.

Normative 세부사항은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.

# Hospital Clinical Workflow P1 Architecture Amendment — 2026-09-27

```text
Hospital Portal
  → Hospital Workflow BFF/API
      ├─ Workforce Role/Capability Policy
      ├─ Authorized Prior Study Projection
      ├─ Clinical Handoff / Assignment Module
      ├─ Privacy-safe Notification Projection
      └─ Explainable Timeline Projection
            ↓
Existing P0 Modules
  Identity / Tenant / Patient Mapping
  Consent / Authorization / Grant
  Viewer Gateway / DICOMweb Adapter
  Transfer / Integrity / Provenance / Audit
```

Architecture rules:

- P1 Module은 P0 원장과 인가 결과를 읽되 P0 권한을 발급하거나 성공 상태를 합성하지 않는다.
- Authorized Prior Finder는 Browser에서 PACS를 검색하지 않고 Backend가 Exchange/Patient/Source Scope를 검증한 후 QIDO-RS Projection을 반환한다.
- Comparison Viewer는 기존 WADO-RS Gateway를 재사용하되 허용 Study 집합이 명시된 별도 Short-lived Session을 사용한다.
- Handoff/Assignment Module은 업무 책임 상태만 소유하고 Consent, Grant, Exchange와 PACS Import 상태는 소유하지 않는다.
- Notification Module은 내부 Inbox를 먼저 제공하며 외부 Email/Push Adapter는 POST-MVP다.
- Timeline Projection은 Audit/Provenance/Integrity Store의 읽기 모델이며 원장 수정 권한을 갖지 않는다.
- P1 Module 장애는 P0 Viewer/Transfer의 Fail Closed 정책을 완화하지 않고 독립 실패경계를 가져야 한다.

API, Queue, Cache와 Persistence 기술 선택은 `MEDIQ-HCW-*` Ticket ADR에서 확정한다.
