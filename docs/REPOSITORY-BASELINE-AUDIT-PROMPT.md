# MediQ `REPOSITORY-BASELINE-AUDIT.md` 작성 프롬프트

## 1. 역할

당신은 다음 역할을 동시에 수행하는 **MediQ Repository Baseline Audit 위원회**다.

* Senior Software Architect
* Backend Technical Lead
* DevSecOps Engineer
* Application Security Engineer
* PostgreSQL / Migration Engineer
* PACS / DICOM / DICOMweb Engineer
* QA / E2E Test Engineer
* Repository Maintainer
* Technical Project Manager
* Scope / Dependency / Traceability Auditor

목표는 현재 MediQ Repository의 실제 상태를 조사하여 공식 기준문서:

```text
REPOSITORY-BASELINE-AUDIT.md
```

를 작성하는 것이다.

이 문서는 새로운 기능이나 Architecture를 설계하는 문서가 아니다.

목적은:

```text
Approved MediQ Baseline
        ↓
Actual Repository
        ↓
Gap Analysis
        ↓
Implementation Classification
        ↓
Ticket Status
        ↓
Next Action
```

을 확정하는 것이다.

---

# 2. 최상위 감사 목적

현재 Repository에 실제로 존재하는:

```text
Source Code
Docker
PostgreSQL
Migration
Orthanc
DICOMweb
API
Security
Tests
Documentation
Legacy Highpass Assets
```

를 조사하여 각 구현항목을 다음 중 하나로 분류한다.

```text
ALREADY_IMPLEMENTED

PARTIAL

MISSING

LEGACY_REUSABLE

BLOCKED
```

근거가 없는 상태에서:

```text
PASS

DONE

COMPLETE

READY
```

로 표시하지 않는다.

---

# 3. 프로젝트 목표 기준

MediQ P0의 최종 구현 성공조건은 다음이다.

> **Synthetic/Test DICOM이 Hospital A Test Orthanc에서 MediQ의 Patient Mapping·Exchange Session·Consent·Authorization·Scoped Transfer Grant를 통과하여 Viewer/Download 또는 Hospital B Test Orthanc로 전달되고, PACS Import의 경우 Destination Verification·Integrity·Provenance·Audit까지 PASS하는 것**

핵심 흐름:

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

# 4. Normative Source Priority

Repository를 평가할 때 반드시 다음 문서를 우선 기준으로 사용한다.

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

중요:

```text
Existing Code
≠
Source of Truth
```

기존 코드가 Baseline과 충돌하면 기존 코드를 기준으로 문서를 바꾸지 않는다.

다음으로 기록한다.

```text
BASELINE CONFLICT
```

---

# 5. 현재 Project Scope

## CAPSTONE-P0

```text
Synthetic/Test Data

Hospital A Test Orthanc
Hospital B Test Orthanc

PatientReference
PatientMapping

ExchangeSession

Consent

Authentication
Authorization
TransferGrant

QIDO-RS
WADO-RS
STOW-RS

Viewer
DICOM Download
PACS Import

Tenant Isolation

Integrity
Provenance
Audit

Security Negative Tests

Golden E2E
```

## CAPSTONE-P1

```text
Mobile Secure Vault
Secure Medical Capsule
Hardware-backed Key
Device Binding
Biometric Unlock
QR
Mobile Export
Crypto-Shredding
```

## PRODUCTIONIZATION

```text
Real Patient Data
Real Hospital PACS
Enterprise IAM
Enterprise PKI
Enterprise KMS/HSM
Legal Consent Validation
HA / DR
Production SIEM/SOC
```

P1 또는 Productionization 기능이 Repository에 존재하더라도 P0 Critical Path로 자동 승격하지 않는다.

---

# 6. 감사 원칙

## 6.1 Read-First

코드 변경부터 시작하지 않는다.

우선:

```text
Inspect
→ Record
→ Compare
→ Classify
```

한다.

---

## 6.2 Evidence-Based

각 판정은 실제 Evidence를 가져야 한다.

예:

좋음:

```text
MEDIQ-DCM-003
Status: ALREADY_IMPLEMENTED

Evidence:
- adapters/dicomweb/orthanc_client.py
- query_studies()
- tests/integration/test_qido.py
- Integration test PASS
```

나쁨:

```text
QIDO seems implemented.
```

---

## 6.3 No Guessing

실행하지 않은 테스트:

```text
NOT EXECUTED
```

환경 때문에 실행 불가:

```text
BLOCKED
```

실패:

```text
FAIL
```

라고 기록한다.

---

# 7. Repository Inspection — Mandatory

가장 먼저 다음을 조사한다.

```text
git status

git branch

git log --oneline

repository root

directory tree

configuration files

Docker files

environment files

migration files

source code

tests

documentation
```

가능하면 현재 Commit SHA도 기록한다.

---

# 8. Git Baseline

다음 정보를 기록한다.

```text
Repository:
...

Branch:
...

HEAD SHA:
...

Remote:
...

Working Tree:
CLEAN / DIRTY

Modified Files:
...

Untracked Files:
...

Staged Files:
...
```

중요:

Uncommitted 작업을 삭제하거나 덮어쓰지 않는다.

---

# 9. Directory Structure Audit

현재 실제 Directory Tree를 확인한다.

Expected logical structure:

```text
MediQ/

apps/
├─ api/
├─ web/
└─ viewer/

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

infra/
├─ docker/
└─ dev/

tests/
├─ unit/
├─ integration/
├─ security/
└─ e2e/

docs/
```

주의:

현재 Repository가 이 구조와 다르다고 해서 자동으로 재구성하지 않는다.

판정:

```text
MATCH

COMPATIBLE DIFFERENCE

NEEDS ALIGNMENT

BASELINE CONFLICT
```

중 하나로 기록한다.

---

# 10. Architecture Audit

현재 코드가 다음 Architecture를 유지하는지 확인한다.

```text
Modular Monolith
+
PostgreSQL
+
Web / Viewer
+
Hospital A Orthanc
+
Hospital B Orthanc
+
Docker Compose
```

검토:

```text
Unnecessary Microservices introduced?

Domain coupled directly to Orthanc?

Database logic mixed with HTTP layer?

Authorization scattered?

P0 architecture expanded?

P1 mixed into P0?
```

---

# 11. Docker Audit

다음을 확인한다.

```text
docker-compose.yml
compose.yaml
Dockerfile
Docker network
Volumes
Environment variables
Health checks
```

필수 P0 Components:

```text
mediQ-api

mediQ-web

postgres

orthanc-a

orthanc-b
```

Viewer가 별도이면:

```text
mediQ-viewer
```

확인한다.

---

# 12. Container Runtime Audit

가능하면 실제 실행한다.

```text
docker compose config

docker compose up
```

확인:

```text
API healthy?

PostgreSQL healthy?

Orthanc A healthy?

Orthanc B healthy?

Network connectivity?

Required ports reachable?
```

실행하지 못하면 이유를 명시한다.

---

# 13. PostgreSQL Audit

다음을 확인한다.

```text
PostgreSQL version

Database connection

Migration framework

Migration history

Current schema

Seed mechanism
```

---

# 14. P0 Table Audit

승인된 P0 Table은 정확히 다음 17개다.

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

각 Table:

```text
EXISTS

PARTIAL

MISSING

EXTRA / UNAPPROVED
```

로 분류한다.

---

# 15. Database Constraint Audit

최소 확인:

```text
PK

FK

UNIQUE

CHECK

INDEX

NULL / NOT NULL

ON DELETE behavior
```

특히:

```text
patient_mappings(
    hospital_id,
    local_patient_id
)
UNIQUE
```

```text
patient_mappings(
    patient_ref_id,
    hospital_id
)
UNIQUE
```

```text
consents(
    exchange_session_id,
    consent_version
)
UNIQUE
```

```text
source_hospital_id
!=
destination_hospital_id
```

확인한다.

---

# 16. Organization / Tenant Audit

확인:

```text
Organization model

Tenant model

Hospital model

Actor model

Hospital A seed

Hospital B seed

Hospital C negative-test tenant
```

Tenant Isolation 구현 여부도 별도로 확인한다.

---

# 17. Hospital Endpoint Audit

다음 Endpoint Registry 또는 동등 구조 존재 여부:

```text
QIDO-RS

WADO-RS

STOW-RS
```

확인:

```text
Hospital A:
QIDO
WADO

Hospital B:
STOW
```

Credential가 Source Code에 Hard-code되어 있지 않은지 확인한다.

---

# 18. Synthetic Patient Audit

다음 형태의 Synthetic Identity Fixture가 있는지 확인한다.

예:

```text
MediQ:
MQ-TEST-0001

Hospital A:
TEST-A-001

Hospital B:
TEST-B-982
```

실제 개인정보가 존재하면 Critical Finding으로 기록한다.

---

# 19. PatientReference Audit

확인:

```text
PatientReference model

Persistence

Repository

Tests
```

중요:

```text
Hospital local ID
≠
MediQ PatientReference
```

가 코드에서도 유지되는지 확인한다.

---

# 20. PatientMapping Audit

확인:

```text
mapping_id

patient_ref_id

hospital_id

local_patient_id

status
```

Expected Status:

```text
VALID
UNVERIFIED
AMBIGUOUS
REVOKED
```

확인:

```text
PACS import requires VALID mapping?
```

---

# 21. Mapping Security Audit

다음 테스트 또는 코드 경로를 확인한다.

```text
Missing Mapping
→ DENY

UNVERIFIED
→ DENY

AMBIGUOUS
→ DENY

REVOKED
→ DENY
```

그리고:

```text
No valid mapping
→ NO STOW
```

인지 확인한다.

---

# 22. ExchangeSession Audit

확인:

```text
Domain model

Persistence

Create API

Get API

State transition

Object authorization
```

Expected States:

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

---

# 23. ExchangeSession Security Audit

다음이 가능한지 검증한다.

```text
Known Session UUID
+
Wrong Tenant
→ DENY
```

Session ID 자체를 Credential처럼 사용하면 Critical Finding으로 기록한다.

---

# 24. Consent Audit

확인:

```text
ConsentArtifact exists?

Independent from ExchangeSession?

Status exists?

Allowed Action exists?

Version exists?

Withdraw exists?
```

Expected:

```text
PENDING
ACTIVE
WITHDRAWN
EXPIRED
REJECTED
```

---

# 25. Consent Enforcement Audit

확인:

```text
No ACTIVE Consent
→ Grant DENY
```

```text
WITHDRAWN Consent
→ New Grant DENY
```

Consent가 단순 Boolean이면:

```text
PARTIAL / BASELINE CONFLICT
```

로 평가한다.

---

# 26. Authentication Audit

확인:

```text
Authentication middleware

Actor resolution

Tenant resolution

Invalid token handling

Expired token handling

Audience validation
```

인증 Context가 Client Request Body의 `tenant_id`를 신뢰하지 않는지 확인한다.

---

# 27. Authorization Audit

Authorization이 다음 전체 Context를 평가하는지 확인한다.

```text
Actor
Tenant
ExchangeSession
Consent
TransferGrant
Resource
Action
```

다음 구현은 Critical Finding이다.

```text
if session_exists:
    allow
```

또는:

```text
if consent:
    allow
```

---

# 28. Fail-Closed Audit

Authorization Engine 또는 Security Validation 오류 시:

```text
DENY
```

가 되는지 확인한다.

다음은 Critical Security Failure:

```text
validation error
→ continue

authorization unavailable
→ allow
```

---

# 29. TransferGrant Audit

확인:

```text
Grant model

Persistence

Issue API

Revoke API

Expiration

Recipient binding

Tenant binding

Resource binding

Scope
```

P0 Scope:

```text
study:view
study:download
study:pacs-transfer
```

---

# 30. Grant Scope Audit

검증:

```text
study:view
→ Viewer only
```

```text
study:view
→ Download DENY
```

```text
study:view
→ PACS Import DENY
```

Scope가 하나의 범용 Access 권한으로 구현되어 있으면 Baseline conflict로 기록한다.

---

# 31. DICOMweb Adapter Audit

확인:

```text
DicomGateway

Orthanc adapter

QIDO-RS

WADO-RS

STOW-RS

Timeout

Error handling
```

Core Domain이 Orthanc-specific REST API에 직접 강하게 연결되어 있는지도 확인한다.

---

# 32. QIDO-RS Audit

실제 Hospital A Orthanc를 대상으로 가능한 경우 실행한다.

검증:

```text
Study discovery

Patient context

StudyInstanceUID

Error handling
```

판정:

```text
PASS
FAIL
NOT EXECUTED
BLOCKED
```

---

# 33. WADO-RS Audit

확인:

```text
Authorized retrieval

Actual Study retrieval

Payload handling

Failure handling
```

권한검증 없이 Orthanc WADO endpoint를 직접 노출하면 Security Finding으로 기록한다.

---

# 34. ImagingPackage Audit

확인:

```text
ImagingPackage metadata

PatientReference binding

Source Hospital binding

StudyReference binding

Temporary storage reference
```

중요:

```text
ImagingPackage
≠
ExchangeSession
```

가 유지되는지 확인한다.

---

# 35. DICOM Binary Storage Audit

PostgreSQL에:

```text
DICOM Binary
```

를 BLOB 등으로 저장하는지 확인한다.

Baseline:

```text
Metadata
→ PostgreSQL

Binary
→ Orthanc / Temporary Storage
```

위반 시:

```text
BASELINE CONFLICT
```

---

# 36. Viewer Audit

확인:

```text
Viewer action endpoint

study:view validation

Session validation

Consent validation

Grant validation

Resource validation

Short-lived access
```

다음 공격을 확인한다.

```text
Known Study UID
+
No authorization
→ DENY
```

---

# 37. Download Audit

확인:

```text
Download endpoint

study:download enforcement

DICOM package generation/stream

Audit
```

중요 Negative Test:

```text
study:view only
→ download DENY
```

---

# 38. PACS Import Audit

가장 높은 우선순위로 분석한다.

확인:

```text
PACS Import service

study:pacs-transfer

Destination validation

Patient Mapping validation

WADO retrieval

STOW execution

Destination verification

Failure states
```

---

# 39. STOW Preflight Audit

STOW 호출 전 반드시 다음을 확인하는지 분석한다.

```text
Authentication       VALID

Tenant               VALID

Session              VALID

Consent              ACTIVE

Grant                ACTIVE

Scope                study:pacs-transfer

Recipient            MATCH

Destination          MATCH

PatientMapping       VALID

STOW Endpoint        ALLOWED
```

하나라도 실패하면:

```text
NO STOW-RS CALL
```

이어야 한다.

---

# 40. Destination Binding Audit

검증:

```text
Session.destination
=
Consent.destination
=
Grant.recipient_hospital
=
Actual STOW Target
```

불일치한 상태에서 실제 STOW가 호출되면:

```text
CRITICAL SECURITY FAILURE
```

로 기록한다.

---

# 41. Destination Verification Audit

STOW 성공 이후:

```text
Hospital B
→ Study Exists?
```

를 확인하는 로직이 있는지 검사한다.

단순 STOW HTTP 성공만으로 완료 처리한다면:

```text
PARTIAL
```

로 분류한다.

---

# 42. Integrity Audit

확인:

```text
Source integrity evidence

Destination integrity evidence

Comparison

VERIFIED / FAILED
```

Critical Rule:

```text
Integrity FAILED
→ Transfer != COMPLETED
```

위반 시:

```text
CRITICAL SECURITY FAILURE
```

---

# 43. Provenance Audit

확인:

```text
source hospital

study

imaging package

exchange session

destination hospital

transfer status

integrity reference
```

다음을 재구성할 수 있어야 한다.

```text
Hospital A
→ MediQ
→ Hospital B
```

---

# 44. Audit Event Audit

확인:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED
CONSENT_WITHDRAWN

AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED

GRANT_CREATED

VIEWER_OPENED

DOWNLOAD_STARTED
DOWNLOAD_COMPLETED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
PACS_TRANSFER_FAILED

INTEGRITY_VERIFIED
INTEGRITY_FAILURE

ACCESS_DENIED
```

---

# 45. Sensitive Logging Audit

로그에서 다음을 찾는다.

```text
Raw Bearer Token

Password

Private Key

DEK

KEK

DICOM Binary

Sensitive Request Body
```

존재하면 Security Finding으로 기록한다.

---

# 46. TLS Audit

확인:

```text
Browser ↔ MediQ

MediQ ↔ Orthanc A

MediQ ↔ Orthanc B
```

TLS 구성 여부.

그리고 다음과 같은 우회가 Default인지 확인한다.

```text
verify=false

insecure TLS

certificate validation disabled
```

---

# 47. Secret Management Audit

Source Code와 설정에서 다음을 검사한다.

```text
DB password

Orthanc credentials

JWT secret

private key

API token
```

Hard-coded secret이 있으면:

```text
SECURITY FINDING
```

으로 기록한다.

---

# 48. Test Suite Audit

현재 Test 구조를 조사한다.

Expected:

```text
tests/unit

tests/integration

tests/security

tests/e2e
```

실제 구조가 다를 수 있으므로 이름보다 기능 기준으로 평가한다.

---

# 49. Unit Test Audit

확인해야 할 핵심 Domain Test:

```text
Withdrawn Consent
→ DENY

Expired Grant
→ DENY

Wrong Scope
→ DENY

Invalid Session
→ DENY

Mapping invalid
→ DENY

Integrity mismatch
→ FAILED
```

---

# 50. Security Test Audit

최소 다음 테스트가 존재하는지 확인한다.

```text
No Consent

Wrong Tenant

Wrong Scope

Wrong Recipient

Expired Grant

Invalid Mapping

Wrong Destination

Invalid Session

Known Study UID

Authorization Failure

Integrity Failure

Sensitive Logging
```

각 항목:

```text
EXISTS / MISSING

PASS / FAIL / NOT EXECUTED
```

로 기록한다.

---

# 51. E2E Audit

다음 Golden Path 존재 여부를 확인한다.

## Viewer

```text
Hospital A
→ MediQ
→ Viewer
```

## Download

```text
Hospital A
→ MediQ
→ DICOM Download
```

## PACS Import

```text
Hospital A Orthanc
→ WADO
→ MediQ
→ STOW
→ Hospital B Orthanc
→ Destination Verify
→ Integrity
→ Provenance
→ Audit
```

---

# 52. Mock vs Real Integration

테스트가 Mock만 사용하는지 구분한다.

```text
MOCK TEST

REAL COMPONENT INTEGRATION

REAL ORTHANC E2E
```

PACS Golden Path는 최종적으로:

```text
REAL ORTHANC A/B E2E
```

가 필요하다.

---

# 53. Acceptance Test Mapping

`ACCEPTANCE-TESTS.md`의 각 주요 테스트에 대해 현재 상태를 기록한다.

최소:

```text
AT-FUNC-001
AT-FUNC-003
AT-FUNC-005
AT-FUNC-006
AT-FUNC-008
AT-FUNC-010
AT-FUNC-011
AT-FUNC-012
AT-FUNC-013
AT-FUNC-014
AT-FUNC-015
AT-FUNC-016

AT-SEC-001
AT-SEC-003
AT-SEC-004
AT-SEC-005
AT-SEC-006
AT-SEC-007
AT-SEC-008
AT-SEC-009
AT-SEC-010
AT-SEC-011
AT-SEC-012
AT-SEC-013
AT-SEC-017
AT-SEC-018
AT-SEC-020

AT-E2E-001
AT-E2E-002
AT-E2E-003
```

상태:

```text
PASS
FAIL
NOT_IMPLEMENTED
NOT_EXECUTED
BLOCKED
```

---

# 54. Implementation Ticket Audit

`IMPLEMENTATION-PLAN.md`의 Ticket별 실제 상태를 평가한다.

상태:

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

중요:

```text
Code exists
→ IMPLEMENTED
```

```text
Code + tests + acceptance
→ DONE
```

---

# 55. Ticket Classification Table

최종 문서에는 최소 다음 표를 작성한다.

| Ticket         | Repository Evidence  | Classification  | Test             | Status      | Next Action          |
| -------------- | -------------------- | --------------- | ---------------- | ----------- | -------------------- |
| MEDIQ-ENV-003  | `compose.yaml`       | PARTIAL         | smoke not run    | IMPLEMENTED | run compose          |
| MEDIQ-PAT-003  | none                 | MISSING         | none             | BACKLOG     | implement            |
| MEDIQ-DCM-003  | existing client      | LEGACY_REUSABLE | old test         | BACKLOG     | compatibility review |
| MEDIQ-PACS-005 | existing STOW module | PARTIAL         | integration fail | BLOCKED     | fix adapter          |

실제 Evidence를 기준으로 작성한다.

---

# 56. Legacy Highpass Audit

Legacy Asset 후보:

```text
Orthanc Docker

DICOMweb client

QIDO-RS

WADO-RS

STOW-RS

TLS/mTLS

Token validator

Audit utilities

Certificate tests

E2E utilities
```

각 항목은:

```text
REUSE

MODIFY

REWRITE

REJECT

NOT FOUND
```

로 판단한다.

---

# 57. Legacy Reuse Criteria

재사용 조건:

```text
Required by MediQ P0?

Compatible with current interface?

Compatible with security baseline?

Tests available?

Dependencies acceptable?

No old product-model coupling?
```

하나라도 중요한 조건이 충족되지 않으면 자동 REUSE하지 않는다.

---

# 58. Legacy Contamination Check

다음 Legacy 개념이 MediQ P0에 무단 유입되어 있는지 검사한다.

예:

```text
old transfer model

old consent boolean

old patient ID assumptions

privacy filter as P0 blocker

mobile-only assumptions

permanent cloud PACS design
```

발견 시:

```text
LEGACY MODEL CONFLICT
```

로 기록한다.

---

# 59. Documentation Audit

현재 Repository에 필요한 기준문서가 존재하는지 확인한다.

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

ACCEPTANCE-TESTS.md

IMPLEMENTATION-PLAN.md

AGENTS.md
```

각:

```text
FOUND
MISSING
OUTDATED
CONFLICTING
```

으로 분류한다.

---

# 60. Baseline Conflict Detection

다음 충돌을 검사한다.

```text
Code vs Requirement

Code vs Security Requirement

DB vs DATA-MODEL

API vs OPENAPI

Tests vs ACCEPTANCE

Implementation vs Architecture

Legacy vs MediQ Domain
```

Conflict마다:

```text
Conflict ID

Description

Baseline

Current Implementation

Impact

Affected Ticket

Required Resolution
```

을 작성한다.

---

# 61. Critical Security Findings

다음은 발견 즉시 Critical로 분류한다.

```text
Cross-Tenant ALLOW

No Consent ALLOW

Wrong Scope ALLOW

Wrong Recipient ALLOW

Invalid Mapping STOW

Wrong Destination STOW

Unauthorized QIDO/WADO/STOW

Integrity FAILED but COMPLETED

Authentication bypass

Authorization failure fail-open

Real patient data present

Hard-coded production secret
```

---

# 62. Blocker Classification

Blocker는 다음 유형 중 하나로 분류한다.

```text
ENVIRONMENT BLOCKED

BASELINE CONFLICT

DEPENDENCY BLOCKED

IMPLEMENTATION DEFECT

TEST FAILURE

SECURITY FAILURE

EXTERNAL INTEGRATION FAILURE
```

---

# 63. Blocker Format

각 Blocker:

```text
Blocker ID:
BLK-XXX

Type:
...

Description:
...

Evidence:
...

Affected Ticket:
...

Affected Acceptance:
...

P0 Impact:
CRITICAL / HIGH / NORMAL

Recommended Resolution:
...
```

---

# 64. Risk Audit

최소 다음을 실제 Repository 상태에 따라 평가한다.

```text
RISK-01
DICOMweb Integration Complexity

RISK-02
Authorization Drift

RISK-03
Patient Mapping Error

RISK-04
PACS Import Late Integration

RISK-05
Legacy Contamination

RISK-06
Security Test Coverage Gap

RISK-07
Scope Expansion

RISK-08
Overengineering

RISK-09
Demo Environment Reproducibility

RISK-10
Uncommitted Change Collision
```

각:

```text
Likelihood
Impact
Evidence
Mitigation
Affected Phase
```

을 작성한다.

---

# 65. Gap Analysis

Repository Audit 이후 전체 Gap을 다음 형태로 정리한다.

```text
ENVIRONMENT GAP
DATABASE GAP
DOMAIN GAP
SECURITY GAP
DICOMWEB GAP
PACS GAP
TEST GAP
DOCUMENTATION GAP
LEGACY GAP
```

각 Gap에는:

```text
Current
Target
Difference
Ticket
Priority
```

를 작성한다.

---

# 66. P0 Critical Path Gap

별도로 가장 중요한 Critical Path Gap만 출력한다.

```text
Environment
    ↓
Database
    ↓
Patient Mapping
    ↓
ExchangeSession
    ↓
Consent
    ↓
AuthN/AuthZ/Grant
    ↓
QIDO/WADO
    ↓
STOW
    ↓
Destination Verification
    ↓
Integrity
    ↓
Provenance
    ↓
Audit
    ↓
Golden E2E
```

각 단계:

```text
READY
PARTIAL
MISSING
BLOCKED
DONE
```

로 표시한다.

---

# 67. Recommended Next Ticket

Audit 완료 후 단 하나의:

```text
NEXT RECOMMENDED TICKET
```

을 선정한다.

선정기준:

```text
P0 Critical Path

Dependency satisfied

Highest blocking impact

Implementable now

Acceptance impact
```

예:

```text
NEXT RECOMMENDED TICKET:
MEDIQ-DB-001
```

또는:

```text
MEDIQ-DCM-009
Legacy DICOMweb Compatibility Review
```

---

# 68. Do Not Implement During Audit

Repository Audit 단계에서는 원칙적으로:

```text
No feature implementation

No architecture refactoring

No schema redesign

No API redesign

No bulk migration

No automatic Legacy merge
```

를 수행한다.

단순한 읽기/진단 명령과 안전한 테스트 실행만 수행한다.

명확한 요청 없이 코드 수정으로 넘어가지 않는다.

---

# 69. Do Not Destroy State

다음을 수행하지 않는다.

```text
git reset --hard

git clean -fd

force push

delete untracked files

overwrite user changes

destructive DB reset
```

특히 기존 개발자의 Uncommitted Change를 보존한다.

---

# 70. Test Execution Safety

테스트 실행 전:

```text
Test environment?

Synthetic data?

No production endpoint?

No destructive operation?
```

을 확인한다.

실제 병원/PACS Endpoint로 요청하지 않는다.

---

# 71. Output Structure

최종 `REPOSITORY-BASELINE-AUDIT.md`를 다음 구조로 작성한다.

```text
# MediQ Repository Baseline Audit

## 1. Purpose

## 2. Audit Scope

## 3. Normative Baseline

## 4. Repository Identification

## 5. Git / Working Tree Status

## 6. Directory Structure

## 7. Architecture Alignment

## 8. Docker / Runtime Environment

## 9. PostgreSQL / Migration

## 10. P0 Table Audit

## 11. Organization / Tenant / Hospital

## 12. PatientReference / PatientMapping

## 13. ExchangeSession

## 14. Consent

## 15. Authentication / Authorization

## 16. TransferGrant

## 17. DICOMweb / Imaging

## 18. Viewer

## 19. Download

## 20. PACS Import / STOW-RS

## 21. Destination Verification

## 22. Integrity

## 23. Provenance

## 24. Audit / Logging

## 25. TLS / Secret Management

## 26. Unit / Integration Tests

## 27. Security Tests

## 28. E2E Tests

## 29. Acceptance Coverage

## 30. Legacy Highpass Review

## 31. Documentation Audit

## 32. Baseline Conflicts

## 33. Security Findings

## 34. Blockers

## 35. Risk Register

## 36. Implementation Gap Analysis

## 37. Ticket Status Matrix

## 38. P0 Critical Path Status

## 39. Recommended Next Ticket

## 40. Final Audit Decision
```

---

# 72. Repository Summary Table

문서 앞부분에 다음 Summary를 출력한다.

| Area            | Current | Target                   | Classification | P0 Impact |
| --------------- | ------- | ------------------------ | -------------- | --------- |
| Repository      | ?       | Stable baseline          | ...            | ...       |
| Docker          | ?       | Reproducible             | ...            | ...       |
| PostgreSQL      | ?       | 17 tables                | ...            | ...       |
| Patient Mapping | ?       | VALID-gated              | ...            | ...       |
| ExchangeSession | ?       | Workflow root            | ...            | ...       |
| Consent         | ?       | Independent artifact     | ...            | ...       |
| Authorization   | ?       | Explicit deny-by-default | ...            | ...       |
| TransferGrant   | ?       | Scoped                   | ...            | ...       |
| QIDO            | ?       | Working                  | ...            | ...       |
| WADO            | ?       | Working                  | ...            | ...       |
| STOW            | ?       | Working                  | ...            | ...       |
| Viewer          | ?       | P0                       | ...            | ...       |
| Download        | ?       | P0                       | ...            | ...       |
| Integrity       | ?       | Verified                 | ...            | ...       |
| Provenance      | ?       | Traceable                | ...            | ...       |
| Audit           | ?       | Traceable                | ...            | ...       |
| Security Tests  | ?       | Mandatory                | ...            | ...       |
| Golden E2E      | ?       | PASS                     | ...            | ...       |

실제 검사 결과로 `?`를 대체한다.

---

# 73. Ticket Status Matrix

전체 Implementation Plan Ticket 중 관련 Ticket을 다음 형태로 정리한다.

| Ticket         | Evidence | Classification | Implementation | Test | Acceptance | Status |
| -------------- | -------- | -------------- | -------------- | ---- | ---------- | ------ |
| MEDIQ-ENV-001  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-DB-001   | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-PAT-003  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-EXC-003  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-CON-004  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-GRT-003  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-DCM-004  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-PACS-005 | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-INT-004  | ...      | ...            | ...            | ...  | ...        | ...    |
| MEDIQ-TEST-003 | ...      | ...            | ...            | ...  | ...        | ...    |

가능하면 전체 Ticket을 포함한다.

---

# 74. Acceptance Coverage Summary

다음 지표를 산출한다.

```text
Total P0 Acceptance Tests:
...

PASS:
...

FAIL:
...

NOT EXECUTED:
...

NOT IMPLEMENTED:
...

BLOCKED:
...
```

단 테스트가 아직 실행되지 않았다면 Coverage %를 과장하지 않는다.

---

# 75. Security Coverage Summary

다음 핵심 항목을 별도로 평가한다.

```text
Authentication:
PASS / PARTIAL / MISSING / BLOCKED

Tenant Isolation:
...

Consent Enforcement:
...

Grant Scope:
...

Recipient Binding:
...

Patient Mapping:
...

Destination Binding:
...

Fail Closed:
...

Integrity:
...

Sensitive Logging:
...
```

---

# 76. E2E Readiness Summary

```text
Viewer E2E:
PASS / PARTIAL / BLOCKED / NOT IMPLEMENTED

Download E2E:
PASS / PARTIAL / BLOCKED / NOT IMPLEMENTED

PACS Import E2E:
PASS / PARTIAL / BLOCKED / NOT IMPLEMENTED
```

PACS Import를 최우선으로 평가한다.

---

# 77. Final Audit Decision

최종 문서 마지막에 다음 형식으로 출력한다.

```text
PROJECT:
MediQ

AUDIT:
REPOSITORY BASELINE

AUDIT VERSION:
v1.0

CURRENT TARGET:
CAPSTONE P0 END-TO-END MVP

REPOSITORY:
INSPECTED / PARTIAL / BLOCKED

WORKING TREE:
CLEAN / DIRTY

ENVIRONMENT:
READY / PARTIAL / BLOCKED

DATABASE:
READY / PARTIAL / MISSING

PATIENT MAPPING:
READY / PARTIAL / MISSING

EXCHANGE SESSION:
READY / PARTIAL / MISSING

CONSENT:
READY / PARTIAL / MISSING

AUTHENTICATION:
READY / PARTIAL / MISSING

AUTHORIZATION:
READY / PARTIAL / MISSING

TRANSFER GRANT:
READY / PARTIAL / MISSING

QIDO-RS:
READY / PARTIAL / MISSING

WADO-RS:
READY / PARTIAL / MISSING

VIEWER:
READY / PARTIAL / MISSING

DOWNLOAD:
READY / PARTIAL / MISSING

STOW-RS:
READY / PARTIAL / MISSING

DESTINATION VERIFICATION:
READY / PARTIAL / MISSING

INTEGRITY:
READY / PARTIAL / MISSING

PROVENANCE:
READY / PARTIAL / MISSING

AUDIT:
READY / PARTIAL / MISSING

SECURITY NEGATIVE TESTS:
PASS / PARTIAL / NOT EXECUTED / MISSING

VIEWER E2E:
PASS / PARTIAL / BLOCKED / MISSING

DOWNLOAD E2E:
PASS / PARTIAL / BLOCKED / MISSING

PACS IMPORT E2E:
PASS / PARTIAL / BLOCKED / MISSING

LEGACY REUSE:
ASSESSED / PARTIAL / NOT ASSESSED

BASELINE CONFLICTS:
<number>

CRITICAL SECURITY FINDINGS:
<number>

BLOCKERS:
<number>

CAPSTONE TECHNICAL READINESS:
PASS / PARTIAL / BLOCKED / FAIL

PRODUCTION READINESS:
NOT ASSESSED / NOT READY

NEXT RECOMMENDED TICKET:
MEDIQ-...

REPOSITORY BASELINE AUDIT:
COMPLETE / PARTIAL / BLOCKED
```

---

# 78. 최종 작업 지시

현재 MediQ Repository를 실제로 조사하라.

첫 단계에서 코드 수정하지 말고 다음을 수행하라.

```text
1. git status / branch / SHA 확인

2. Repository Tree 확인

3. Docker/PostgreSQL/Orthanc 구성 확인

4. Migration 및 17개 P0 Table 확인

5. Domain Module 확인

6. Authentication/Authorization/Grant 확인

7. QIDO/WADO/STOW 구현 확인

8. Viewer/Download/PACS Import 확인

9. Integrity/Provenance/Audit 확인

10. Unit/Integration/Security/E2E Tests 확인

11. Legacy Highpass 재사용 가능 자산 확인

12. Baseline 문서와 코드 비교

13. Ticket 상태 갱신

14. 가장 먼저 실행해야 할 다음 Ticket 결정
```

가능한 경우 안전한 Test Environment에서 현재 테스트를 실행하되, 실제 환자 데이터·실제 의료기관 Endpoint는 사용하지 않는다.

실행하지 못한 Test를 PASS라고 표시하지 않는다.

---

# FINAL AUDIT POLICY

> **Repository Audit의 목적은 코드를 평가하기 전에 코드를 바꾸는 것이 아니라, 현재 실제 상태를 MediQ 승인 Baseline에 비추어 정확히 고정하는 것이다.**

> **기존 코드가 존재해도 MediQ Baseline에 맞지 않으면 `ALREADY_IMPLEMENTED`가 아니라 `PARTIAL`, `BASELINE CONFLICT`, `LEGACY_REUSABLE` 또는 `REWRITE` 후보로 판단한다.**

> **최종 결과는 반드시 `Actual Repository → Gap → Ticket → Acceptance` 관계를 보여야 하며, 감사가 끝나면 P0 Critical Path상 지금 당장 수행해야 할 단 하나의 `NEXT RECOMMENDED TICKET`을 제시하라.**

> **어떠한 경우에도 테스트하지 않은 기능을 PASS 또는 DONE이라고 보고하지 마라.**
