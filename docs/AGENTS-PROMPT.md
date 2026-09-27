# MediQ `AGENTS.md` 작성 프롬프트

## 1. 역할

당신은 다음 역할을 동시에 수행하는 **MediQ Repository Agent Governance 설계자**다.

* Senior Software Architect
* Backend Technical Lead
* PACS / DICOM / DICOMweb Engineer
* Application Security Engineer
* DevSecOps Engineer
* QA / E2E Test Lead
* Database Engineer
* AI Coding Agent Governance Engineer
* Repository Maintainer
* Scope / Dependency / Traceability 관리자

목표는 MediQ Repository의 AI Coding Agent가 실제 코드를 수정할 때 반드시 따라야 할 최상위 운영 규칙 문서:

```text
AGENTS.md
```

를 작성하는 것이다.

`AGENTS.md`의 목적은 프로젝트를 다시 설명하는 것이 아니다.

목적은 다음 실행 규칙을 고정하는 것이다.

```text
Read Baseline
    ↓
Inspect Repository
    ↓
Select Ticket
    ↓
Check Dependencies
    ↓
Implement Minimal Change
    ↓
Run Tests
    ↓
Run Acceptance
    ↓
Report Evidence
    ↓
DONE / BLOCKED
```

---

# 2. 핵심 목적

`AGENTS.md`를 읽은 AI Agent가 별도 설명 없이 다음을 판단할 수 있어야 한다.

```text
현재 MediQ의 P0 목표가 무엇인가?

어떤 문서가 상위 기준인가?

어떤 Architecture를 유지해야 하는가?

무엇을 수정하면 안 되는가?

현재 Ticket 전에 어떤 Dependency가 필요한가?

어떤 파일을 변경해야 하는가?

어떤 테스트를 반드시 실행해야 하는가?

보안 실패 시 어떻게 행동해야 하는가?

새 Scope가 발견되면 어떻게 처리해야 하는가?

Legacy Highpass 코드는 언제 재사용할 수 있는가?

언제 IMPLEMENTED이고 언제 DONE인가?

Agent가 작업 종료 시 무엇을 보고해야 하는가?
```

---

# 3. MediQ 최상위 목표

문서 최상단에 다음 목적을 명확하게 고정한다.

> **MediQ Capstone P0의 목표는 Synthetic/Test DICOM 환경에서 Hospital A Test Orthanc의 의료영상을 MediQ의 Patient Mapping, Exchange Session, Consent, Authorization 및 Scoped Transfer Grant 통제를 거쳐 Viewer로 조회하거나 DICOM으로 다운로드하거나 Hospital B Test Orthanc에 STOW-RS로 전달하고, Destination Verification·Integrity·Provenance·Audit까지 검증하는 것이다.**

Golden Path:

```text
Hospital A Test Orthanc
        ↓
     QIDO / WADO
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
                          STOW-RS
                             ↓
                  Hospital B Test Orthanc
                             ↓
                 Destination Verification
                             ↓
                   Integrity VERIFIED
                             ↓
                       Provenance
                             ↓
                          Audit
```

---

# 4. 현재 Phase

`AGENTS.md`에는 현재 Project Phase를 다음과 같이 명시한다.

```text
CURRENT PROJECT PHASE:
CAPSTONE TECHNICAL MVP

PRIMARY DELIVERY:
P0 END-TO-END MEDICAL IMAGING EXCHANGE

PRIMARY CRITICAL PATH:
HOSPITAL A → MEDIQ → HOSPITAL B

DATA:
SYNTHETIC / TEST / APPROVED DE-IDENTIFIED ONLY

REAL PATIENT DATA:
PROHIBITED

REAL HOSPITAL PRODUCTION DATA:
PROHIBITED

PRODUCTION DEPLOYMENT:
OUT OF CURRENT SCOPE

MOBILE SECURE VAULT:
P1
```

---

# 5. Normative Document Order

Agent는 코드 변경 전에 관련 상위 문서를 확인해야 한다.

우선순위:

```text
1. PROJECT-CHARTER.md
2. CAPSTONE-MVP-BOUNDARY.md
3. PRODUCT-BASELINE.md
4. REQUIREMENTS.md
5. SECURITY-REQUIREMENTS.md
6. DOMAIN-MODEL.md
7. SYSTEM-ARCHITECTURE.md
8. DATA-FLOW.md
9. DATA-MODEL.md
10. ERD.md
11. OPENAPI.yaml
12. THREAT-MODEL.md
13. ACCEPTANCE-TESTS.md
14. IMPLEMENTATION-PLAN.md
15. AGENTS.md
16. CODE
17. LEGACY HIGHPASS
```

단:

> `AGENTS.md`는 상위 Product/Requirement/Architecture 문서를 변경할 권한을 갖지 않는다.

충돌 시:

```text
BASELINE CONFLICT
```

로 처리한다.

임의로 설계를 수정하여 해결하지 않는다.

---

# 6. Source of Truth Rule

Agent는 다음 순서를 따른다.

```text
Approved Documentation
        ↓
Current Repository
        ↓
Implementation Gap
        ↓
Code Change
```

다음을 금지한다.

```text
Existing code
→ therefore requirement
```

즉 기존 코드가 존재한다고 해서 현재 MediQ Baseline보다 우선하지 않는다.

---

# 7. Repository-First Rule

새로운 작업 시작 시 반드시 현재 Repository를 먼저 확인한다.

확인 대상:

```text
git status

directory structure

current branch

modified files

untracked files

Docker configuration

database migrations

Orthanc configuration

application modules

API implementation

test suites

existing documentation

legacy assets
```

빈 Repository라고 가정하지 않는다.

반대로 구현이 완료됐다고 추정하지도 않는다.

---

# 8. Initial Classification

작업 시작 시 관련 기능을 다음 중 하나로 판단한다.

```text
ALREADY_IMPLEMENTED

PARTIAL

MISSING

LEGACY_REUSABLE

BLOCKED
```

판단근거 없이 `PASS` 또는 `DONE`으로 표시하지 않는다.

---

# 9. Implementation Plan Rule

모든 P0 작업은 가능한 한:

```text
IMPLEMENTATION-PLAN.md
```

의 Ticket과 연결한다.

Ticket 형식:

```text
MEDIQ-<AREA>-NNN
```

예:

```text
MEDIQ-PAT-003

MEDIQ-EXC-003

MEDIQ-CON-004

MEDIQ-GRT-003

MEDIQ-DCM-004

MEDIQ-PACS-005

MEDIQ-INT-004

MEDIQ-TEST-003
```

---

# 10. No Ticket, No Large Change

작은 결함수정이나 테스트 보완을 제외하고 다음과 같은 큰 변경은 Ticket 없이 시작하지 않는다.

```text
new domain module

new database entity

new public API

architecture restructuring

new external dependency

security model change

DICOM transfer behavior change

tenant model change

patient mapping behavior change
```

필요한데 Ticket이 없다면:

```text
SCOPE CANDIDATE
```

또는:

```text
IMPLEMENTATION PLAN GAP
```

로 보고한다.

---

# 11. Ticket Execution Order

Ticket 실행 전 다음을 확인한다.

```text
Ticket exists?

Classification = CAPSTONE-P0?

Dependencies DONE?

Relevant baseline read?

Required API identified?

Required DB changes identified?

Security requirements identified?

Threats identified?

Acceptance tests identified?
```

Dependency가 완료되지 않았다면:

```text
DEPENDENCY BLOCKED
```

로 판단한다.

---

# 12. Critical Path

Agent는 다음 순서를 P0 Critical Path로 취급한다.

```text
Environment
    ↓
Database
    ↓
Organization / Hospital
    ↓
PatientReference / Mapping
    ↓
ExchangeSession
    ↓
Consent
    ↓
Authentication
    ↓
Authorization
    ↓
TransferGrant
    ↓
QIDO-RS / WADO-RS
    ↓
STOW-RS / PACS Import
    ↓
Destination Verification
    ↓
Integrity
    ↓
Provenance
    ↓
Audit
    ↓
Security Negative Tests
    ↓
Golden E2E
```

Viewer와 Download 역시 P0이나 PACS Import E2E 위험 제거보다 우선하지 않는다.

---

# 13. Architecture Rule

P0 Architecture:

```text
Modular Monolith
+
PostgreSQL
+
MediQ Web
+
Viewer
+
Hospital A Orthanc
+
Hospital B Orthanc
+
Docker Compose
```

논리적 Plane:

```text
Control Plane
Imaging Plane
Security Plane
Edge Plane
```

중요:

```text
Logical Plane
≠
Independent Microservice
```

Agent는 임의로 Microservice를 추가하지 않는다.

---

# 14. Prohibited Architecture Expansion

P0에서 다음을 추가하지 않는다.

```text
Kubernetes

Service Mesh

Full Microservices

Full Cloud PACS

Full FHIR Platform

Blockchain

DID

ZKP

Full PQC Migration

Enterprise HSM

Full SIEM

SOC Platform

Multi-region

Production DR

AI Diagnosis

AI Route Selection
```

---

# 15. Domain Invariants

Agent는 다음 불변조건을 코드 구조보다 우선한다.

## INV-01

```text
Hospital Local Patient ID
≠
MediQ PatientReference
```

## INV-02

```text
ExchangeSession
≠
ImagingPackage
```

## INV-03

```text
Consent
≠
Authorization
≠
TransferGrant
```

## INV-04

```text
Session ID
≠
Authorization Credential
```

## INV-05

```text
StudyInstanceUID
≠
Authorization Credential
```

## INV-06

```text
Source Hospital PACS
=
System of Record
```

## INV-07

```text
MediQ
=
Temporary Medical Imaging Exchange Broker
```

---

# 16. Authorization Rule

모든 보호된 Imaging Action은 다음 Context를 평가해야 한다.

```text
Actor
+
Tenant
+
ExchangeSession
+
Consent
+
TransferGrant
+
Resource
+
Action
        ↓
Authorization
        ↓
ALLOW / DENY
```

다음 코딩 패턴을 금지한다.

```text
if session_exists:
    allow()
```

또는:

```text
if consent:
    allow()
```

또는:

```text
if study_uid:
    return_image()
```

---

# 17. Default Security Policy

항상:

```text
DENY BY DEFAULT
```

그리고:

```text
FAIL CLOSED
```

를 적용한다.

다음은 허용하지 않는다.

```text
authorization error
→ ALLOW
```

```text
tenant unknown
→ continue
```

```text
grant validation error
→ skip
```

---

# 18. Tenant Rule

Cross-Tenant 접근:

```text
DEFAULT
→ DENY
```

허용 조건:

```text
Valid ExchangeSession
+
Valid Consent
+
Valid Grant
+
Correct Recipient
+
Correct Resource
```

Hospital C는 Hospital A→B Grant를 사용할 수 없다.

---

# 19. Consent Rule

Consent는 Boolean이 아니다.

최소:

```text
patient
session
source
destination
resource scope
allowed actions
status
time
```

Context를 가진 독립 Artifact로 취급한다.

다음 상태는 신규 Grant 발급 불가:

```text
PENDING
WITHDRAWN
EXPIRED
REJECTED
```

---

# 20. Transfer Grant Rule

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

Agent는 Scope를 합쳐서 하나의 범용 접근권한으로 만들지 않는다.

예:

```text
study:view
→ DOWNLOAD
```

는 반드시 DENY다.

---

# 21. Grant Forbidden Content

Transfer Grant에 다음을 넣지 않는다.

```text
Raw DICOM

Password

Private Key

DEK

KEK

Long-lived Credential
```

---

# 22. Patient Mapping Rule

PACS Import 전에 Destination Mapping은 반드시:

```text
VALID
```

이어야 한다.

다음은 전송 불가:

```text
NO MATCH

UNVERIFIED

AMBIGUOUS

REVOKED
```

특히 `AMBIGUOUS` 상태에서 자동선택하지 않는다.

---

# 23. PACS Import Mandatory Preflight

실제 STOW-RS 호출 직전 반드시 검증한다.

```text
Authentication          VALID
Tenant                  VALID
Session                 VALID
Consent                 ACTIVE
Grant                   ACTIVE
Scope                   study:pacs-transfer
Recipient               MATCH
Destination             MATCH
Patient Mapping         VALID
STOW Endpoint           ALLOWED
```

하나라도 실패:

```text
NO STOW-RS CALL
```

---

# 24. Destination Binding Rule

PACS Import는 반드시:

```text
ExchangeSession.destination
=
Consent.destination
=
TransferGrant.recipient_hospital
=
Actual STOW Target
```

이어야 한다.

불일치:

```text
DENY
```

---

# 25. DICOMweb Rule

P0 Protocol:

```text
QIDO-RS
WADO-RS
STOW-RS
```

Core Domain이 Orthanc 특정 API에 직접 종속되지 않게 한다.

권장 Boundary:

```text
DicomGateway

queryStudies()
retrieveStudy()
storeStudy()
checkCapability()
```

Orthanc 구현:

```text
OrthancDicomwebAdapter
```

---

# 26. DICOM Payload Rule

PostgreSQL에는 DICOM Binary를 저장하지 않는다.

```text
Metadata
→ PostgreSQL

DICOM Binary
→ Orthanc / Temporary Imaging Storage
```

금지:

```text
DICOM Binary
→ relational BLOB
```

P0 Baseline을 임의로 변경하지 않는다.

---

# 27. Integrity Rule

Bit-preserving PACS Transfer:

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
```

```text
MISMATCH
→ FAILED
```

중요:

```text
Integrity FAILED
→ Transfer != COMPLETED
```

---

# 28. Provenance Rule

Provenance는:

```text
어떤 의료영상이
어디에서 시작하여
어떤 Session을 통해
어디로 이동했는가
```

를 증명한다.

최소:

```text
source hospital
study
imaging package
exchange session
destination
integrity result
```

을 연결한다.

---

# 29. Audit Rule

Audit는:

```text
누가
언제
어떤 Context에서
무슨 Action을 수행했고
결과가 무엇이었는가
```

를 기록한다.

최소:

```text
timestamp
actor
tenant
session
action
result
correlation_id
```

---

# 30. Never Log

다음은 Application Log 또는 Audit에 기록하지 않는다.

```text
Raw Bearer Token

Password

Private Key

DEK

KEK

DICOM Binary

Full sensitive request body
```

---

# 31. Database Rules

DB의 역할:

```text
PK
FK
UNIQUE
CHECK
INDEX
Referential Integrity
```

Application의 역할:

```text
Authorization

Tenant validation

Consent/Grant consistency

Session transition

Patient Mapping validation

Destination validation

Integrity completion rule
```

복잡한 Domain Logic을 DB Trigger에 과도하게 구현하지 않는다.

---

# 32. P0 Table Baseline

현재 승인된 P0 Table은 17개다.

```text
organizations
tenants
hospitals
hospital_endpoints
actors

patient_refs
patient_mappings

exchange_sessions

consents
consent_actions

transfer_grants
transfer_grant_scopes

imaging_packages
study_references

integrity_evidence
provenance_records
audit_events
```

Agent는 새로운 Table을 임의 추가하지 않는다.

새 Table 필요 시 먼저:

```text
DATA MODEL CHANGE CANDIDATE
```

로 보고한다.

---

# 33. API Design Rule

API는 Table CRUD가 아니라 Domain Action 중심이다.

허용 예:

```text
POST /exchange-sessions

POST /exchange-sessions/{id}/consents/request

POST /exchange-sessions/{id}/consents/{id}/approve

POST /exchange-sessions/{id}/grants/issue

POST /exchange-sessions/{id}/actions/view

POST /exchange-sessions/{id}/actions/download

POST /exchange-sessions/{id}/actions/pacs-import
```

지양:

```text
PUT /audit-events/{id}

DELETE /provenance/{id}

POST /integrity-evidence

generic CRUD for all tables
```

---

# 34. API Compatibility Rule

`OPENAPI.yaml`이 승인된 Contract다.

Public API 수정이 필요하면:

```text
Current OpenAPI
       ↓
Required P0 Acceptance?
       ↓
YES
       ↓
Contract Update Candidate
```

를 먼저 보고한다.

기존 Contract와 충돌하는 API를 조용히 구현하지 않는다.

---

# 35. Error Handling Rule

외부 Error Response에는 내부 Secret을 노출하지 않는다.

금지:

```text
stack trace with credentials

database password

raw access token

private key

storage credential
```

Security validation 실패 시 명확한 DENY를 사용한다.

---

# 36. Status Rule

Agent는 다음 상태를 구분한다.

```text
BACKLOG

READY

IN_PROGRESS

BLOCKED

IMPLEMENTED

TESTING

DONE

DEFERRED
```

특히:

```text
IMPLEMENTED
=
code exists
```

```text
DONE
=
implementation + required tests + acceptance PASS
```

---

# 37. Test Levels

Ticket에 따라 다음 중 필요한 Test를 실행한다.

```text
UNIT

INTEGRATION

SECURITY

E2E

ACCEPTANCE
```

모든 Ticket에 모든 종류를 강제하지 않는다.

하지만 P0 Critical 기능은 Acceptance와 연결되어야 한다.

---

# 38. Unit Test Priorities

Unit Test는 Domain Invariant를 우선한다.

예:

```text
WITHDRAWN Consent
→ Grant DENY

Expired Grant
→ DENY

Wrong Scope
→ DENY

Invalid Session
→ DENY

Integrity mismatch
→ FAILED
```

---

# 39. Integration Test Priorities

다음을 실제 Component와 검증한다.

```text
PostgreSQL

Migration

Repository

API ↔ Domain

DICOMweb Adapter

Hospital A Orthanc

Hospital B Orthanc
```

---

# 40. Security Tests — Mandatory

P0에서는 다음을 자동화한다.

```text
No Consent
→ DENY

Wrong Tenant
→ DENY

Wrong Scope
→ DENY

Wrong Recipient
→ DENY

Expired Grant
→ DENY

Invalid Mapping
→ NO STOW

Wrong Destination
→ NO STOW

Invalid Session
→ DENY

Known Study UID only
→ DENY

Authorization Failure
→ DENY

Integrity Failure
→ FAILED
```

---

# 41. Golden Path Rule

최종 Golden Path는 Mock만으로 PASS 처리하지 않는다.

반드시 실제 Test Environment에서:

```text
Hospital A Orthanc
        ↓
QIDO/WADO
        ↓
MediQ
        ↓
STOW-RS
        ↓
Hospital B Orthanc
```

를 실행한다.

Mock Test:

```text
PASS
```

는 Unit/Integration evidence일 수 있지만:

```text
P0 GOLDEN E2E PASS
```

가 아니다.

---

# 42. Acceptance Test Authority

`ACCEPTANCE-TESTS.md`는 구현 완료 판정의 최상위 Test Contract다.

특히 다음 실패는 P0 Release Blocker다.

```text
No Consent
→ ALLOW
```

```text
Wrong Tenant
→ ALLOW
```

```text
study:view
→ DOWNLOAD / PACS_IMPORT ALLOW
```

```text
Invalid Mapping
→ STOW executes
```

```text
Wrong Destination
→ STOW executes
```

```text
Integrity FAILED
→ COMPLETED
```

```text
Authorization Error
→ ALLOW
```

---

# 43. Test Before Claim Rule

Agent가 다음 표현을 사용하려면 실제 실행 증거가 있어야 한다.

```text
PASS

DONE

VERIFIED

WORKING

COMPLETED
```

테스트를 실행하지 못한 경우:

```text
NOT EXECUTED
```

또는:

```text
BLOCKED
```

로 보고한다.

추정해서 PASS 처리하지 않는다.

---

# 44. No Silent Test Skipping

테스트가 실패했다고 다음 방식으로 우회하지 않는다.

```text
skip failing test

delete failing test

weaken assertion

remove security validation

mock the failing integration

mark xfail without justification
```

Test 변경이 필요하면 이유를 명시한다.

---

# 45. Legacy Highpass Rule

Legacy Highpass Asset은 자동 재사용하지 않는다.

절차:

```text
Legacy Asset
      ↓
Required by current Ticket?
      ↓
Interface Compatible?
      ↓
Security Baseline Compatible?
      ↓
Tests Available?
      ↓
REUSE / MODIFY / REWRITE / REJECT
```

재사용 후보:

```text
Orthanc Docker

DICOMweb Client

QIDO/WADO/STOW implementation

TLS/mTLS assets

Token validation

Audit utilities

Certificate tests

E2E utilities
```

---

# 46. Legacy Priority Rule

다음은 금지한다.

```text
Legacy implementation exists
→ therefore MediQ follows it
```

정상:

```text
MediQ Baseline
        ↓
Required interface
        ↓
Legacy compatibility evaluation
```

---

# 47. Scope Candidate Rule

구현 중 새로운 기능/Entity/API가 필요해 보이면 즉시 구현하지 않는다.

다음 형식으로 분류한다.

```text
SCOPE CANDIDATE

Description:
...

Reason:
...

Required for existing P0 Acceptance?
YES / NO

Classification:
CAPSTONE-P0
CAPSTONE-P1
POST-MVP
PRODUCTIONIZATION

Decision:
...
```

핵심 질문:

> **이 변경이 현재 승인된 P0 Acceptance Test를 통과하기 위해 반드시 필요한가?**

`NO`이면 P0에서 기본적으로 제외한다.

---

# 48. Blocker Rule

Blocker 유형:

```text
ENVIRONMENT BLOCKED

BASELINE CONFLICT

DEPENDENCY BLOCKED

IMPLEMENTATION DEFECT

TEST FAILURE

SECURITY FAILURE

EXTERNAL INTEGRATION FAILURE
```

보고:

```text
Blocker:
...

Type:
...

Affected Ticket:
...

Evidence:
...

P0 Impact:
...

Recommended Resolution:
...
```

---

# 49. Security Failure Priority

다음 문제는 일반 Defect보다 우선한다.

```text
Cross-Tenant exposure

Consent bypass

Grant scope bypass

Wrong patient mapping

Wrong destination

Unauthorized QIDO/WADO/STOW

Integrity failure accepted as success

Secret leakage
```

발견 시:

```text
SECURITY FAILURE
```

로 표시하고 관련 P0 Gate를 차단한다.

---

# 50. Change Minimization Rule

Ticket을 해결하는 데 필요한 최소 범위만 수정한다.

금지:

```text
unrelated refactoring

large formatting changes

mass renames

architecture redesign

dependency replacement without need
```

권장:

```text
Small
Focused
Testable
Traceable
```

Change Set.

---

# 51. No Opportunistic Refactoring

현재 Ticket과 무관한 코드 문제를 발견한 경우 바로 대규모 수정하지 않는다.

다음 중 하나로 기록한다.

```text
FOLLOW-UP

TECH-DEBT

SCOPE CANDIDATE

SECURITY FAILURE
```

단 Critical Security 문제는 즉시 보고한다.

---

# 52. Configuration Rule

환경별 설정은 Source Code에 Hard-code하지 않는다.

금지:

```text
DB password

API secret

private key

Orthanc password
```

권장:

```text
Environment Variables

Development secret injection

Docker environment configuration
```

Production Secret Manager는 현 P0 Scope가 아니다.

---

# 53. TLS Rule

P0 보호통신:

```text
Browser ↔ MediQ

MediQ ↔ Orthanc A

MediQ ↔ Orthanc B
```

은 TLS를 기본으로 한다.

Certificate Validation을 기본 비활성화하지 않는다.

```text
verify=false
```

를 정상 Default로 사용하지 않는다.

mTLS는 상위 Baseline에서 P0 MUST로 명시되지 않는 한 Architecture를 막는 필수조건으로 승격하지 않는다.

---

# 54. Real Data Prohibition

절대 사용하지 않는다.

```text
Real Patient PII

Resident Registration Number

Real Clinical Record

Production DICOM

Real Hospital Credential

Production PACS

Production Token
```

테스트:

```text
Synthetic Patient

Synthetic CT/MRI

Sample DICOM

Approved De-identified Dataset

Test Credentials
```

만 사용한다.

---

# 55. Mobile Scope Rule

다음은 P1이다.

```text
Mobile Secure Vault

Secure Medical Capsule

Hardware-backed Key

Device Binding

Biometric Unlock

QR Transfer Request

study:mobile-export

Crypto-Shredding
```

Agent는 이를 P0 작업 중 자동 구현하지 않는다.

---

# 56. Productionization Rule

다음도 P0가 아니다.

```text
Real Patient Identity Verification

Legal Consent Validation

Actual Hospital Network

Enterprise IAM

Enterprise PKI

Enterprise KMS/HSM

24x7 SOC

Multi-region

SLA / DR
```

---

# 57. UI Priority Rule

P0 UI는 다음 업무를 실행/확인할 정도면 된다.

```text
Create Exchange

Consent status

Grant status

Viewer

Download

PACS Import

Transfer result

Integrity result

Audit timeline
```

초기 Critical Path에 다음을 넣지 않는다.

```text
Advanced Dashboard

Animation

Visual polish

Complex chart

Design system expansion
```

---

# 58. Commit / Change Tracking

가능하면:

```text
1 Ticket
≈
1 Logical Change
```

를 유지한다.

Agent 작업 보고에는 반드시 다음을 포함한다.

```text
Ticket

Changed Files

Why Changed

Tests Executed

Test Results

Acceptance Result

Remaining Issues
```

---

# 59. Git Safety Rule

사용자의 명시적 요청이 없는 한 다음 위험한 Git 작업을 자동 수행하지 않는다.

```text
force push

history rewrite

reset --hard

delete remote branch

mass revert

destructive clean
```

기존 사용자 변경사항을 덮어쓰지 않는다.

작업 시작 전에:

```text
git status
```

를 확인한다.

---

# 60. Existing Changes Rule

Uncommitted 변경이 존재하면:

```text
identify

classify

avoid overwriting

preserve unrelated user work
```

한다.

현재 Ticket과 충돌한다면:

```text
IMPLEMENTATION BLOCKER
```

로 보고한다.

---

# 61. Documentation Sync Rule

코드 변경으로 승인된 Contract가 실제 변경되는 경우 관련 문서도 동기화가 필요하다.

예:

```text
Schema change
→ DATA-MODEL / ERD

API contract change
→ OPENAPI

Security behavior change
→ SECURITY-REQUIREMENTS / THREAT / ACCEPTANCE
```

그러나 Agent가 상위 Baseline을 임의로 변경해서 코드를 정당화해서는 안 된다.

---

# 62. Required Work Cycle

모든 Agent 작업은 다음 순서를 기본으로 한다.

## Step 1 — Inspect

```text
Read relevant baseline

Inspect repository

Inspect git status

Inspect existing tests
```

## Step 2 — Plan

```text
Identify Ticket

Identify dependencies

Identify target files

Identify tests

Identify acceptance
```

## Step 3 — Implement

```text
Minimal code change

Preserve architecture

Preserve security invariants
```

## Step 4 — Verify

```text
Unit

Integration

Security

Acceptance
```

필요 수준만 실행.

## Step 5 — Report

```text
Previous

Target

Achieved

Changed Files

Tests

Acceptance

Blockers

Next Recommended Ticket
```

---

# 63. Agent Final Report Format

각 작업 종료 시 가능한 한 다음 형식을 사용한다.

```text
## Phase Result

Ticket:
MEDIQ-XXX-NNN

Previous:
...

Target:
...

Achieved:
PASS / PARTIAL / BLOCKED / FAIL

## Changed Files

- ...
- ...

## Implementation

- ...
- ...

## Tests

Unit:
PASS / FAIL / NOT RUN

Integration:
PASS / FAIL / NOT RUN

Security:
PASS / FAIL / NOT RUN

E2E:
PASS / FAIL / NOT RUN

Acceptance:
AT-XXX-XXX
PASS / FAIL / NOT RUN

## Security Review

Tenant Isolation:
...

Consent Enforcement:
...

Grant Enforcement:
...

Fail Closed:
...

## Scope Review

New P0 Scope Added:
NO / YES

P1 Work Added:
NO / YES

Production Work Added:
NO / YES

## Blockers

...

## Next Recommended Ticket

MEDIQ-...
```

---

# 64. Do Not Overstate

다음과 같은 표현은 증거 없이 사용하지 않는다.

```text
Production ready

Hospital ready

Legally compliant

HIPAA/PIPA compliant

Clinically validated

Secure against all attacks
```

P0 결과는:

```text
CAPSTONE TECHNICAL MVP
```

수준으로 표현한다.

---

# 65. Current Release Criteria

다음이 모두 실제 PASS일 때만:

```text
CAPSTONE MVP READY = YES
```

로 한다.

```text
Functional Acceptance PASS

Security Acceptance PASS

Viewer E2E PASS

Download E2E PASS

PACS Import E2E PASS

Tenant Isolation PASS

Consent Enforcement PASS

Grant Scope PASS

Patient Mapping PASS

Destination Binding PASS

Integrity PASS

Provenance PASS

Audit PASS

Fail Closed PASS
```

---

# 66. Critical Release Blockers

다음 중 하나라도 발생하면 Release를 차단한다.

```text
No Consent
→ Access ALLOW

Wrong Tenant
→ ALLOW

Wrong Scope
→ ALLOW

Wrong Recipient
→ ALLOW

Invalid Mapping
→ STOW

Wrong Destination
→ STOW

Integrity FAILED
→ COMPLETED

Authorization failure
→ ALLOW
```

---

# 67. First Agent Task

새 Repository 또는 현재 상태가 불명확한 상태에서 Agent의 첫 작업은:

```text
MEDIQ-ENV-001
Repository Baseline Audit
```

이다.

확인:

```text
repository tree

git status

Docker

PostgreSQL

Orthanc A/B

migration

modules

API

tests

legacy assets
```

결과를:

```text
ALREADY_IMPLEMENTED
PARTIAL
MISSING
LEGACY_REUSABLE
BLOCKED
```

로 분류한다.

코드 변경 전에 현재 상태를 먼저 고정한다.

---

# 68. Preferred Execution Sequence

```text
MEDIQ-ENV
    ↓
MEDIQ-DB
    ↓
MEDIQ-ORG / PAT
    ↓
MEDIQ-EXC
    ↓
MEDIQ-CON
    ↓
MEDIQ-IAM / AUT / GRT
    ↓
MEDIQ-DCM / IMG
    ↓
MEDIQ-PACS
    ↓
MEDIQ-INT / PROV / AUD
    ↓
MEDIQ-VIEW / DWN
    ↓
MEDIQ-SEC
    ↓
MEDIQ-TEST
    ↓
MEDIQ-REL
```

STOW-RS Integration을 프로젝트 마지막까지 미루지 않는다.

---

# 69. AGENTS.md Scope

최종 `AGENTS.md`는 너무 장황한 프로젝트 설명서가 되지 않도록 한다.

중심은:

```text
Agent Operating Rules

Scope Guard

Architecture Invariants

Security Invariants

Implementation Workflow

Testing Rules

Ticket Rules

Completion Rules

Reporting Rules
```

이다.

필요한 경우 상위 문서를 링크하고 세부 정의는 반복하지 않는다.

단, Agent가 실수하기 쉬운 Critical Invariant는 `AGENTS.md`에 직접 명시한다.

---

# 70. Recommended AGENTS.md Structure

최종 파일을 다음 구조로 작성한다.

```text
# MediQ Agent Instructions

## 1. Mission

## 2. Current Project Phase

## 3. Source of Truth

## 4. Required Pre-Work Checks

## 5. Implementation Workflow

## 6. Ticket Rules

## 7. Architecture Constraints

## 8. Domain Invariants

## 9. Security Invariants

## 10. Database Rules

## 11. API Rules

## 12. DICOM / DICOMweb Rules

## 13. PACS Import Preflight

## 14. Test Rules

## 15. Acceptance Rules

## 16. Legacy Highpass Rules

## 17. Scope Guard

## 18. Git / Repository Safety

## 19. Documentation Synchronization

## 20. Definition of Done

## 21. Blocker Handling

## 22. Agent Completion Report

## 23. Critical Release Blockers

## 24. Current First Action
```

---

# 71. Writing Style

`AGENTS.md`는 다음 스타일로 작성한다.

```text
Concise

Imperative

Unambiguous

Repository-actionable

Testable

Security-aware
```

예:

좋음:

> Before executing PACS import, verify session, consent, grant scope, recipient, destination patient mapping, and registered STOW endpoint. If any check fails, do not call STOW-RS.

나쁨:

> Security should generally be considered before transferring medical images.

규칙은 가능한 한:

```text
MUST

MUST NOT

SHOULD

MAY
```

형태로 명확하게 표현한다.

---

# 72. Avoid Duplication

다음과 같은 상세 전체 내용을 `AGENTS.md`에 다시 복사하지 않는다.

```text
full database schema

full OpenAPI specification

full threat model

all acceptance cases

full project charter
```

대신:

```text
See docs/.../DATA-MODEL.md
See docs/.../OPENAPI.yaml
```

와 같이 Source of Truth를 지정한다.

단 Critical Rule은 직접 반복해도 된다.

---

# 73. Optional Nested AGENTS.md

기본적으로 Root:

```text
/AGENTS.md
```

하나를 우선한다.

다음과 같은 명확한 필요가 없는 한 초기 P0에서 Nested `AGENTS.md`를 과도하게 만들지 않는다.

```text
apps/api/AGENTS.md

modules/imaging/AGENTS.md

tests/AGENTS.md
```

Root 문서가 지나치게 커지거나 하위 디렉터리에 별도 운영규칙이 실제로 필요한 경우에만 추후 분리한다.

현재 기본 결정:

```text
ROOT AGENTS.md:
REQUIRED

NESTED AGENTS.md:
DEFERRED UNLESS JUSTIFIED
```

---

# 74. Final Validation Checklist

최종 `AGENTS.md` 작성 후 검토한다.

```text
Does it identify P0 Golden Path?

Does it point to normative docs?

Does it require repository inspection first?

Does it require Ticket traceability?

Does it preserve Modular Monolith?

Does it prevent scope expansion?

Does it preserve PatientReference separation?

Does it preserve Consent/Auth/Grant separation?

Does it enforce Tenant Isolation?

Does it enforce scoped grants?

Does it define PACS preflight?

Does it prevent invalid mapping STOW?

Does it enforce integrity failure handling?

Does it define audit/log exclusions?

Does it prohibit real patient data?

Does it separate P1?

Does it separate productionization?

Does it require tests before PASS?

Does it distinguish IMPLEMENTED from DONE?

Does it protect existing git changes?

Does it define blocker reporting?

Does it define final work report?
```

하나라도 핵심항목이 빠지면 수정한다.

---

# 75. Final Agent Governance Decision

최종 문서 마지막에 다음 형식으로 요약한다.

```text
PROJECT:
MediQ

AGENT GOVERNANCE:
ROOT AGENTS.md

CURRENT TARGET:
CAPSTONE P0 END-TO-END MVP

PRIMARY CRITICAL PATH:
Hospital A → MediQ → Hospital B

ARCHITECTURE:
MODULAR MONOLITH

DATA:
SYNTHETIC / TEST ONLY

SOURCE OF TRUTH:
APPROVED BASELINE DOCUMENTS

WORK UNIT:
MEDIQ-* TICKET

DEFAULT SECURITY:
DENY BY DEFAULT

FAILURE POLICY:
FAIL CLOSED

PACS IMPORT:
MANDATORY PREFLIGHT

INVALID PATIENT MAPPING:
NO STOW

WRONG DESTINATION:
NO STOW

INTEGRITY FAILURE:
NO COMPLETED STATUS

TEST BEFORE PASS:
MANDATORY

IMPLEMENTED != DONE:
TRUE

LEGACY HIGHPASS:
CONTROLLED REUSE ONLY

P1 MOBILE:
DEFERRED

PRODUCTIONIZATION:
SEPARATED

FIRST ACTION IF STATE UNKNOWN:
MEDIQ-ENV-001 REPOSITORY BASELINE AUDIT

AGENT GOVERNANCE READY:
YES
```

---

# FINAL INSTRUCTION

현재 MediQ의 승인된 문서와 `IMPLEMENTATION-PLAN.md`를 읽은 뒤 Repository Root에 사용할 `AGENTS.md`를 작성하라.

`AGENTS.md`는 **AI Agent를 위한 실행 규정**이어야 한다.

프로젝트 설명을 장황하게 반복하는 대신 다음을 명확하게 강제하라.

> **Inspect first → follow the approved Ticket → preserve the baseline → make the smallest correct change → enforce security invariants → run the required tests → never claim PASS without evidence → report exactly what changed.**

그리고 MediQ의 최상위 구현 성공조건을 절대로 변경하지 마라.

> **Synthetic/Test DICOM이 Hospital A Test Orthanc에서 MediQ의 Patient Mapping·Consent·Authorization·Scoped Transfer Grant 검증을 통과하여 Hospital B Test Orthanc에 STOW-RS로 전달되고, Destination Verification·Integrity·Provenance·Audit까지 PASS해야 한다.**
