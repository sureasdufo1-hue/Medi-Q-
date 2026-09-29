# MediQ Implementation Plan

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `IMPLEMENTATION-PLAN.md`
**Version:** v1.8 Synthetic Patient Explanation RAG Amendment
**Current Target:** Capstone P0 End-to-End MVP
**Architecture:** Modular Monolith
**Deployment:** Docker Compose
**Primary Integration:** DICOMweb — QIDO-RS / WADO-RS / STOW-RS
**Status:** Approved Baseline

---

# 0. 현재 실행 일정 — 2026-09-28 점검

사용자가 지정한 제출 마감은 **2026-10-05**다. 일별 작업·역할·의존성·시험 증거와 지연 대응은 [P0-EXECUTION-SCHEDULE.md](P0-EXECUTION-SCHEDULE.md)를 따른다. 10월 4일은 기능 동결·검증, 10월 5일은 재현·제출 목표일이며 팀 가용 시간은 미확정이다.

이 일정은 P0 성공조건을 변경하지 않는다. 실제 구현은 환경 → 기술 Spike·계약 → Mapping/Consent/Authorization/Grant → PACS Import·Verification/Integrity/Provenance/Audit → Viewer/Download → 전체 회귀시험 순으로 통합한다. Audit·보안시험은 해당 코드 작성 시점부터 수행한다. P1·클라우드 구현은 이번 마감 일정에 배정하지 않는다.

§9~22의 상세 P0 Ticket 정의를 일정 매핑의 기본으로 사용한다. 과거 감사의 광의 `MEDIQ-ENV-002`는 환경 묶음이며, 개별 실행 기록은 `MEDIQ-ENV-002~010`으로 구분한다. 후속 Azure Track의 `MEDIQ-DB-001`/`MEDIQ-AUD-001` 중복 등은 실행 계획표 §5의 미해결 항목이다. 해당 후속 작업은 ID와 참조를 정리한 뒤 착수한다. 본문 BACKLOG/NOT_STARTED는 초기 상태표이며 실제 완료는 [구현 기록](implementation/README.md)과 시험 증거로만 갱신한다.

---

# 1. Purpose

본 문서는 지금까지 승인된 MediQ 설계를 실제 개발 가능한 **Phase / Ticket / Acceptance Gate**로 변환한다.

## 1.1 P1 편의·AI 질문자료 작업

| 순서 | Ticket | 산출물 | Gate |
|---:|---|---|---|
| 1 | `MEDIQ-AIQ-001` | 합성 Timeline·쉬운 모드·AI 질문 Text Preview·Local Copy HTML Prototype | 외부 Network 0, Synthetic-only |
| 2 | `MEDIQ-PXE-CX-002` | 정정 Case·방문 자료 꾸러미 Domain/API 설계 | P0 PASS, API·Audit 개정 |
| 3 | 별도 Production Ticket | 실제 건강정보 Copy/Capture 또는 승인 Provider Connector 검토 | 개인정보·법률·보안·Provider 심사 |

`MEDIQ-AIQ-001`은 P0 Golden Path를 지연시키거나 P0 완료조건으로 승격하지 않는다.

## 1.2 Synthetic Patient Explanation RAG Track

| 순서 | Ticket | 산출물 | Gate |
|---:|---|---|---|
| 1 | `MEDIQ-RAG-001` | Product·Knowledge·Architecture·Evaluation 기준선과 합성 Fixture | 문서 ID·Manifest·Hash 검증 |
| 2 | `MEDIQ-RAG-002` | Manifest/Chunk Validator와 Local Retriever | Synthetic-only, withdrawn/conflict test |
| 3 | `MEDIQ-RAG-003` | Intent Policy·Context Minimizer·Output Validators | 금지 Intent·PII·Citation test |
| 4 | `MEDIQ-RAG-004` | Mock Generator·Patient UI·Abstention UX | `TC-RAG-*`, no-network evidence |
| 5 | `MEDIQ-RAG-005` | Local Model Synthetic-only Spike | 별도 Model ADR·Golden Set Gate |

순서 1~4는 Deterministic Mock으로 완료할 수 있다. `MEDIQ-RAG-005`는 앞선 안전 Gate가 PASS한 뒤 시작하며 P0 일정의 차단 조건이 아니다.

구현 흐름은 다음과 같다.

```text
Approved Architecture
        ↓
Implementation Dependency
        ↓
Phase
        ↓
Ticket
        ↓
Implementation Record Open
        ↓
Code / DB / API Change
        ↓
Test
        ↓
Implementation Report / Test Evidence Sync
        ↓
Acceptance Gate
        ↓
DONE
```

본 문서에서는 새로운 Product Scope를 추가하지 않는다.

최종 목적은 다음 P0 Golden Path를 실제 Test Environment에서 재현하는 것이다.

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

# 2. Current Baseline

## 2.1 Approved Design Baseline

현재 구현계획의 상위 기준은 다음이다.

```text
PROJECT-CHARTER.md
CAPSTONE-MVP-BOUNDARY.md
PRODUCT-BASELINE.md

REQUIREMENTS.md
SECURITY-REQUIREMENTS.md

DOMAIN-MODEL.md
SYSTEM-ARCHITECTURE.md
TECH-STACK-DECISION.md
P0-WEB-UI-UX-SPEC.md
DICOM-INTEROPERABILITY-PROFILE.md
MOBILE-UI-UX-SPEC.md
MOBILE-NAVIGATION-AND-STATE-MODEL.md
MOBILE-APP-ARCHITECTURE.md
SECURE-MEDICAL-CAPSULE-FORMAT.md
MOBILE-API-CONTRACT.md
DATA-FLOW.md

DATA-MODEL.md
ERD.md
OPENAPI.yaml

THREAT-MODEL.md
ACCEPTANCE-TESTS.md
docs/implementation/README.md
```

Normative priority:

```text
Charter
  ↓
MVP Boundary
  ↓
Product Baseline
  ↓
Requirements
  ↓
Security Requirements
  ↓
Domain
  ↓
Architecture
  ↓
Data Flow
  ↓
Data Model / ERD
  ↓
OpenAPI
  ↓
Threat Model
  ↓
Acceptance Tests
  ↓
Implementation Plan
  ↓
Code
```

---

## 2.2 Repository Implementation Status

2026-09-28에 Git·파일 트리·실행 도구를 재점검했다. 로컬 HEAD와 원격 main은 `4308003d19d929df1828dd162a9c886045d605a3`이며 점검 시작 시 작업 트리는 clean이었다.

제품 API/Worker/Web 소스, package/lockfile, Compose, Migration, Orthanc 설정 및 제품 자동화 테스트는 없다. 문서, 정적 HTML 목업, 합성 UI 자산, 구현 기록 생성 스크립트와 해당 시험 기록은 존재한다. 따라서 저장소 전체에 실행 가능한 파일이 전혀 없다고 표현하지 않는다.

Docker Client/Server 29.8.0, Compose v5.5.1, Node v24.18.0, npm 11.16.0은 실제 실행 확인했다. 도구 실행은 프로젝트 환경 또는 제품 보안 검증의 PASS가 아니다.

P0 제품 작업 상태는 `NOT STARTED / NOT RUN`, Capstone Technical Readiness는 `BLOCKED`다. 기존 감사의 10개 요약 역량과 전체 Acceptance Test 수를 혼동하지 않는다. 현재 관찰·제약·명령은 [실행 계획표](P0-EXECUTION-SCHEDULE.md)에 기록했다.

---

# 3. Implementation Principles

## 3.1 Acceptance-driven Development

모든 P0 Critical Ticket은 최소 하나의 Acceptance Gate와 연결한다.

```text
Requirement
    ↓
Ticket
    ↓
Implementation
    ↓
Test
    ↓
Acceptance
```

코드가 존재한다는 이유만으로 `DONE` 처리하지 않는다.

```text
IMPLEMENTED
≠
DONE
```

정의:

```text
IMPLEMENTED
=
Code exists

DONE
=
Required tests + acceptance gates PASS
```

---

## 3.2 Integrated Implementation Documentation

코드·설정·Migration·API·Schema·테스트를 변경하는 Ticket은 구현과 문서화를 별도 후속 작업으로 분리하지 않는다.

```text
One Ticket
  = implementation change
  + command/test execution
  + implementation report
  + test evidence
  + affected baseline synchronization
```

Ticket 시작 시 `docs/implementation/<TICKET>/`를 생성하거나 기존 기록을 열고, 작업 종료 전 다음을 같은 변경 집합에서 갱신한다.

```text
IMPLEMENTATION-REPORT.md
TEST-EVIDENCE.md
docs/implementation/README.md status row
affected normative documents
```

실행 명령과 결과가 없는 테스트 주장은 Evidence가 아니다. 실행하지 못한 테스트는 생략하지 않고 이유와 잔여 위험을 기록한다. 구현 기록은 승인 기준선을 대체하지 않으며 Scope, API, Domain, Data, Security 변경은 해당 승인 문서를 함께 갱신한다.

---

## 3.3 P0 First

현재 최우선 순위:

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

특히:

```text
Hospital A
→ MediQ
→ Hospital B
```

PACS Import Flow를 Critical Path로 간주한다.

---

## 3.4 Vertical Integration

가능한 한 다음 방향으로 점진적으로 동작 가능한 시스템을 만든다.

```text
Foundation
   ↓
Core Domain
   ↓
Security Context
   ↓
DICOMweb
   ↓
Real Orthanc Integration
   ↓
E2E
```

---

## 3.5 Minimal Architecture

P0 기본 구조:

```text
MediQ API — Modular Monolith
PostgreSQL
MediQ Web
Viewer
Orthanc A
Orthanc B
```

다음을 도입하지 않는다.

```text
Full Microservices
Kubernetes
Service Mesh
Production HSM
Full SIEM
Full Cloud PACS
```

---

# 4. Scope Guard

## P0

```text
Synthetic/Test Data
Hospital A/B Test Orthanc
PatientReference
PatientMapping
ExchangeSession
Consent
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

## P1

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

## Productionization

```text
Real Patient Identity
Real Hospital PACS
Hospital SSO
Enterprise PKI
Enterprise KMS/HSM
Legal Consent Validation
Production SIEM/SOC
Kubernetes / HA / DR
```

P1 및 Productionization은 P0 Critical Path에 포함하지 않는다.

---

# 5. Architecture Constraints

반드시 유지할 Invariant:

```text
ExchangeSession
≠
ImagingPackage
```

```text
Consent
≠
Authorization
≠
TransferGrant
```

```text
Hospital Local Patient ID
≠
MediQ PatientReference
```

```text
Source Hospital PACS
=
System of Record
```

```text
MediQ
=
Temporary Medical Imaging Exchange Broker
```

모든 보호 Action:

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
Authorization
        ↓
ALLOW / DENY
```

---

# 6. Implementation Dependency Graph

```text
Repository Audit
       ↓
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
DICOMweb Source Integration
       ↓
     ┌────────────┬────────────┐
     ▼            ▼            ▼
  Viewer       Download    PACS Import
                                ↓
                         Destination Verify
                                ↓
                            Integrity
                                ↓
                           Provenance
                                ↓
                              Audit
                                ↓
                        Security Validation
                                ↓
                         Full Golden E2E
                                ↓
                             Release
```

---

# 7. Critical Path

최상위 Critical Path:

```text
MEDIQ-ENV-001
      ↓
MEDIQ-ENV-003~009
      ↓
MEDIQ-DB-001~008
      ↓
MEDIQ-PAT-001~003
      ↓
MEDIQ-EXC-001~006
      ↓
MEDIQ-CON-001~008
      ↓
MEDIQ-IAM-*
MEDIQ-AUT-*
MEDIQ-GRT-*
      ↓
MEDIQ-DCM-001~005
      ↓
MEDIQ-PACS-001~008
      ↓
MEDIQ-INT-001~004
      ↓
MEDIQ-PROV-*
MEDIQ-AUD-*
      ↓
MEDIQ-TEST-003
      ↓
MEDIQ-REL-*
```

`MEDIQ-TEST-003 — PACS Import Golden Path`를 프로젝트 최상위 통합 Gate로 둔다.

---

# 8. Parallelizable Work

Core Authorization 이후:

```text
               ┌─ Viewer
Authorization ─┼─ Download
               └─ PACS Import
```

가능한 병렬 개발:

```text
Viewer
↔
Download
```

또는:

```text
Integrity domain
↔
Audit infrastructure
```

하지만 다음은 병렬화하지 않는다.

```text
STOW implementation
before
Destination / Mapping / Grant validation
```

---

# 9. PHASE 0 — Repository / Environment Baseline

**Objective**

모든 개발자가 동일한 P0 환경을 재현하고 현재 Repository Gap을 확인할 수 있는 상태를 만든다.

**Status:** NOT_STARTED

## Tickets

| Ticket        | Priority    | Description                    | Dependency  |
| ------------- | ----------- | ------------------------------ | ----------- |
| MEDIQ-ENV-001 | P0-CRITICAL | Repository baseline audit      | -           |
| MEDIQ-ENV-002 | P0-HIGH     | Repository structure alignment | ENV-001     |
| MEDIQ-ENV-003 | P0-CRITICAL | Docker Compose baseline        | ENV-001     |
| MEDIQ-ENV-004 | P0-CRITICAL | PostgreSQL container           | ENV-003     |
| MEDIQ-ENV-005 | P0-CRITICAL | Hospital A Orthanc             | ENV-003     |
| MEDIQ-ENV-006 | P0-CRITICAL | Hospital B Orthanc             | ENV-003     |
| MEDIQ-ENV-007 | P0-CRITICAL | Synthetic DICOM fixture        | ENV-005     |
| MEDIQ-ENV-008 | P0-HIGH     | Application config baseline    | ENV-003     |
| MEDIQ-ENV-009 | P0-CRITICAL | Health checks                  | ENV-003~008 |
| MEDIQ-ENV-010 | P0-HIGH     | Environment smoke test         | ENV-009     |

---

## MEDIQ-ENV-001 — Repository Baseline Audit

**Classification:** CAPSTONE-P0
**Priority:** P0-CRITICAL

### Objective

현재 Repository를 실제 MediQ Baseline과 비교한다.

### Inspect

```text
Directory structure
Backend code
Frontend code
Docker
PostgreSQL
Migration
Orthanc
DICOMweb
Tests
Legacy Highpass assets
```

### Output Classification

각 자산:

```text
ALREADY_IMPLEMENTED
PARTIAL
MISSING
LEGACY_REUSABLE
BLOCKED
```

### Definition of Done

* [ ] 전체 파일 트리 확인
* [ ] 기존 실행방법 확인
* [ ] Docker 상태 확인
* [ ] DB/Migration 상태 확인
* [ ] Orthanc 상태 확인
* [ ] Test 상태 확인
* [ ] Legacy 재사용 후보 분리
* [ ] Ticket 초기상태 갱신

---

## Phase 0 Acceptance Gate

```text
docker compose up
```

이후 최소:

```text
MediQ API       HEALTHY
PostgreSQL      HEALTHY
Orthanc A       HEALTHY
Orthanc B       HEALTHY
Synthetic Study EXISTS IN A
```

### Exit Criteria

```text
GATE-IMP-01
Environment reproducible
→ PASS
```

---

# 10. PHASE 1 — Database / Persistence Foundation

**Objective**

승인된 Data Model/ERD의 17개 P0 Table을 구현한다.

**Dependency:** Phase 0
**Status:** NOT_STARTED

## Tickets

| Ticket       | Priority    | Description                         |
| ------------ | ----------- | ----------------------------------- |
| MEDIQ-DB-001 | P0-CRITICAL | Migration framework                 |
| MEDIQ-DB-002 | P0-CRITICAL | Organization/Tenant/Hospital schema |
| MEDIQ-DB-003 | P0-CRITICAL | Patient schema                      |
| MEDIQ-DB-004 | P0-CRITICAL | Exchange schema                     |
| MEDIQ-DB-005 | P0-CRITICAL | Consent/Grant schema                |
| MEDIQ-DB-006 | P0-CRITICAL | Imaging metadata schema             |
| MEDIQ-DB-007 | P0-HIGH     | Integrity/Provenance/Audit schema   |
| MEDIQ-DB-008 | P0-CRITICAL | PK/FK/UNIQUE/CHECK/INDEX validation |

## Tables

정확히:

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

새 P0 Table을 임의로 추가하지 않는다.

## Required Constraints

최소:

```text
patient_mappings
(hospital_id, local_patient_id)
UNIQUE
```

```text
patient_mappings
(patient_ref_id, hospital_id)
UNIQUE
```

```text
consents
(exchange_session_id, consent_version)
UNIQUE
```

```text
source_hospital_id
!=
destination_hospital_id
```

## Exit Criteria

```text
GATE-IMP-02
Database migration PASS
```

Migration:

```text
UP PASS
DOWN/RESET strategy verified
Schema constraints PASS
Seed compatibility PASS
```

---

# 11. PHASE 2 — Organization / Hospital / Patient Mapping

**Objective**

A/B Hospital Context와 Synthetic Patient Identity를 구성한다.

**Dependency:** Phase 1

## Tickets

### Organization

| Ticket        | Priority    | Description                      |
| ------------- | ----------- | -------------------------------- |
| MEDIQ-ORG-001 | P0-HIGH     | Organization/Tenant seed         |
| MEDIQ-ORG-002 | P0-CRITICAL | Hospital A/B registry            |
| MEDIQ-ORG-003 | P0-CRITICAL | QIDO/WADO/STOW endpoint registry |

### Patient

| Ticket        | Priority    | Description                         |
| ------------- | ----------- | ----------------------------------- |
| MEDIQ-PAT-001 | P0-CRITICAL | PatientReference domain/persistence |
| MEDIQ-PAT-002 | P0-CRITICAL | PatientMapping persistence          |
| MEDIQ-PAT-003 | P0-CRITICAL | Destination mapping validation      |
| MEDIQ-PAT-004 | P0-HIGH     | Invalid/Ambiguous mapping tests     |

## Fixture

```text
PatientReference:
MQ-TEST-0001

Hospital A:
TEST-A-001

Hospital B:
TEST-B-982
```

## Core Rule

```text
Mapping status != VALID
→ PACS_IMPORT DENY
```

## Traceability

```text
REQ-PAT-003
REQ-PAT-004

SEC-IAM-007
SEC-IAM-008
SEC-IAM-009

THR-018

AT-FUNC-003
AT-SEC-012
```

## Exit Criteria

```text
GATE-IMP-03
Patient Mapping PASS
```

---

# 12. PHASE 3 — Exchange Session

**Objective**

MediQ 핵심 Workflow Aggregate를 구현한다.

**Dependency:** Phase 2

## Tickets

| Ticket        | Priority    | Description                   |
| ------------- | ----------- | ----------------------------- |
| MEDIQ-EXC-001 | P0-CRITICAL | ExchangeSession domain        |
| MEDIQ-EXC-002 | P0-CRITICAL | Persistence/repository        |
| MEDIQ-EXC-003 | P0-CRITICAL | `POST /exchange-sessions`     |
| MEDIQ-EXC-004 | P0-HIGH     | `GET /exchange-sessions/{id}` |
| MEDIQ-EXC-005 | P0-CRITICAL | State transition rules        |
| MEDIQ-EXC-006 | P0-CRITICAL | Object-level authorization    |

## Required State Model

```text
REQUESTED
→ CONSENT_PENDING
→ CONSENTED
→ AUTHORIZED
→ READY
→ ACTIVE
→ COMPLETED
```

Terminal:

```text
REJECTED
EXPIRED
REVOKED
FAILED
CANCELLED
```

## Critical Rule

```text
Session ID
≠
Authorization Credential
```

## Traceability

```text
REQ-EXC-001
REQ-EXC-002

SEC-API-002
SEC-AUTHZ-004
SEC-AUTHZ-005

THR-002
THR-029

AT-FUNC-001
AT-FUNC-002
AT-SEC-003
AT-SEC-014
```

## Exit Criteria

```text
GATE-IMP-04
ExchangeSession PASS
```

---

# 13. PHASE 4 — Consent

**Objective**

Consent를 독립 Evidence Artifact로 구현한다.

**Dependency:** Phase 3

## Tickets

| Ticket        | Priority    | Description                     |
| ------------- | ----------- | ------------------------------- |
| MEDIQ-CON-001 | P0-CRITICAL | ConsentArtifact domain          |
| MEDIQ-CON-002 | P0-CRITICAL | Persistence/versioning          |
| MEDIQ-CON-003 | P0-CRITICAL | Consent request API             |
| MEDIQ-CON-004 | P0-CRITICAL | Consent approve API             |
| MEDIQ-CON-005 | P0-HIGH     | Consent withdraw API            |
| MEDIQ-CON-006 | P0-CRITICAL | Allowed action validation       |
| MEDIQ-CON-007 | P0-HIGH     | Consent audit events            |
| MEDIQ-CON-008 | P0-CRITICAL | Missing/withdrawn consent tests |

## Core Rules

```text
Consent
≠
Authorization
```

```text
No ACTIVE Consent
→ New Grant DENY
```

```text
WITHDRAWN
→ New Grant DENY
```

## Traceability

```text
REQ-CON-001~004

SEC-CONSENT-001~004

THR-004
THR-005

AT-FUNC-005
AT-FUNC-006
AT-FUNC-007
AT-SEC-005
AT-SEC-006
AT-SEC-007
```

## Exit Criteria

```text
GATE-IMP-05
Consent PASS
```

---

# 14. PHASE 5 — Authentication / Authorization / Transfer Grant

**Objective**

MediQ P0 Security Decision Chain을 구현한다.

**Dependency:** Phase 4

## 14.1 Authentication Tickets

| Ticket        | Priority    | Description                         |
| ------------- | ----------- | ----------------------------------- |
| MEDIQ-IAM-001 | P0-CRITICAL | Authentication middleware           |
| MEDIQ-IAM-002 | P0-CRITICAL | Actor/Tenant context resolution     |
| MEDIQ-IAM-003 | P0-HIGH     | Invalid/expired credential handling |

## 14.2 Authorization Tickets

| Ticket        | Priority    | Description                |
| ------------- | ----------- | -------------------------- |
| MEDIQ-AUT-001 | P0-CRITICAL | Authorization context      |
| MEDIQ-AUT-002 | P0-CRITICAL | Default-deny policy        |
| MEDIQ-AUT-003 | P0-CRITICAL | Object-level authorization |
| MEDIQ-AUT-004 | P0-CRITICAL | Fail-closed handling       |

## 14.3 Grant Tickets

| Ticket        | Priority    | Description              |
| ------------- | ----------- | ------------------------ |
| MEDIQ-GRT-001 | P0-CRITICAL | TransferGrant domain     |
| MEDIQ-GRT-002 | P0-CRITICAL | Grant persistence        |
| MEDIQ-GRT-003 | P0-CRITICAL | Grant issue API          |
| MEDIQ-GRT-004 | P0-HIGH     | Grant revoke API         |
| MEDIQ-GRT-005 | P0-CRITICAL | Scope enforcement        |
| MEDIQ-GRT-006 | P0-CRITICAL | Recipient/Tenant binding |
| MEDIQ-GRT-007 | P0-CRITICAL | Expiration validation    |

## Authorization Formula

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
Policy
        ↓
ALLOW / DENY
```

금지:

```text
if session_exists:
    ALLOW
```

```text
if consent_exists:
    ALLOW
```

## Grant Scopes

```text
study:view

study:download

study:pacs-transfer
```

## Traceability

```text
SEC-IAM-*
SEC-AUTHZ-*
SEC-GRANT-*

THR-001
THR-003
THR-005
THR-006
THR-007
THR-008
THR-028
THR-030
```

Acceptance:

```text
AT-FUNC-008
AT-FUNC-009

AT-SEC-001
AT-SEC-002
AT-SEC-004
AT-SEC-007
AT-SEC-008
AT-SEC-009
AT-SEC-017
AT-SEC-024
AT-SEC-025
AT-SEC-026
```

## Exit Criteria

```text
GATE-IMP-06
Authorization / Grant PASS
```

---

# 15. PHASE 6 — DICOMweb Source Integration

**Objective**

Hospital A Test Orthanc와 실제 QIDO/WADO E2E를 구성한다.

**Dependency:** Phase 5

## DICOM Tickets

| Ticket        | Priority    | Description                 |
| ------------- | ----------- | --------------------------- |
| MEDIQ-DCM-001 | P0-CRITICAL | `DicomGateway` interface    |
| MEDIQ-DCM-002 | P0-CRITICAL | Orthanc DICOMweb adapter    |
| MEDIQ-DCM-003 | P0-CRITICAL | QIDO-RS query               |
| MEDIQ-DCM-004 | P0-CRITICAL | WADO-RS retrieval           |
| MEDIQ-DCM-005 | P0-HIGH     | Timeout/error normalization |

## Imaging Tickets

| Ticket        | Priority    | Description                   |
| ------------- | ----------- | ----------------------------- |
| MEDIQ-IMG-001 | P0-CRITICAL | ImagingPackage metadata       |
| MEDIQ-IMG-002 | P0-CRITICAL | StudyReference metadata       |
| MEDIQ-IMG-003 | P0-CRITICAL | Resource ownership validation |

## Adapter Contract

```text
DicomGateway

queryStudies()
retrieveStudy()
storeStudy()
checkCapability()
```

P0 Orthanc 구현:

```text
OrthancDicomwebAdapter
```

## Acceptance

```text
AT-FUNC-004
AT-DICOM-001
AT-DICOM-002
AT-SEC-015
AT-SEC-016
```

## Exit Criteria

```text
GATE-IMP-07
QIDO/WADO PASS
```

---

# 16. PHASE 7 — Viewer

**Objective**

`study:view` Scope 기반 Web Viewer Flow를 구현한다.

**Dependency:** Phase 6

## Tickets

| Ticket         | Priority    | Description                      |
| -------------- | ----------- | -------------------------------- |
| MEDIQ-VIEW-001 | P0-CRITICAL | Viewer action endpoint           |
| MEDIQ-VIEW-002 | P0-CRITICAL | `study:view` enforcement         |
| MEDIQ-VIEW-003 | P0-CRITICAL | WADO-backed Viewer path          |
| MEDIQ-VIEW-004 | P0-HIGH     | Short-lived viewer access        |
| MEDIQ-VIEW-005 | P0-CRITICAL | Direct URL/UID bypass prevention |
| MEDIQ-VIEW-006 | P0-HIGH     | Viewer audit                     |

## Core Rule

```text
Known Study UID
+
No Authorization
→ DENY
```

## Acceptance

```text
AT-FUNC-010
AT-SEC-015
AT-E2E-001
```

## Out of Scope

```text
Diagnostic Certification
Advanced MPR
3D Reconstruction
AI Diagnosis
```

## Exit Criteria

```text
GATE-IMP-08
Viewer PASS
```

---

# 17. PHASE 8 — DICOM Download

**Objective**

Viewer와 독립된 `study:download` 권한을 구현한다.

**Dependency:** Phase 6 / Phase 5

## Tickets

| Ticket        | Priority    | Description                   |
| ------------- | ----------- | ----------------------------- |
| MEDIQ-DWN-001 | P0-CRITICAL | Download action endpoint      |
| MEDIQ-DWN-002 | P0-CRITICAL | `study:download` enforcement  |
| MEDIQ-DWN-003 | P0-CRITICAL | DICOM retrieve/package stream |
| MEDIQ-DWN-004 | P0-HIGH     | Download audit                |
| MEDIQ-DWN-005 | P0-CRITICAL | View-only denial tests        |

## Critical Rule

```text
study:view
≠
study:download
```

## Acceptance

```text
AT-FUNC-011
AT-SEC-010
AT-E2E-002
```

## Exit Criteria

```text
GATE-IMP-09
Download PASS
```

---

# 18. PHASE 9 — PACS Import / STOW-RS

**Objective**

Hospital A Study를 Hospital B Test Orthanc에 실제 STOW-RS 전송한다.

**Dependency:** Phase 6 + Phase 5 + Phase 2

**Criticality:** HIGHEST

## Tickets

| Ticket         | Priority    | Description                           |
| -------------- | ----------- | ------------------------------------- |
| MEDIQ-PACS-001 | P0-CRITICAL | PACS Import application service       |
| MEDIQ-PACS-002 | P0-CRITICAL | `study:pacs-transfer` enforcement     |
| MEDIQ-PACS-003 | P0-CRITICAL | Destination binding                   |
| MEDIQ-PACS-004 | P0-CRITICAL | Destination PatientMapping validation |
| MEDIQ-PACS-005 | P0-CRITICAL | STOW-RS operation                     |
| MEDIQ-PACS-006 | P0-CRITICAL | Destination Study verification        |
| MEDIQ-PACS-007 | P0-CRITICAL | Transfer state management             |
| MEDIQ-PACS-008 | P0-HIGH     | Upstream failure handling             |

## STOW Preflight

STOW 호출 전에 반드시:

```text
Authentication        VALID
Tenant                VALID
Session               VALID
Consent               ACTIVE
Grant                 ACTIVE
Scope                 study:pacs-transfer
Destination           MATCH
PatientMapping        VALID
STOW Endpoint         ALLOWED
```

를 검증한다.

하나라도 실패:

```text
NO STOW-RS CALL
```

## Destination Binding

반드시:

```text
Session.destination
=
Consent.destination
=
Grant.recipient_hospital
=
Actual STOW Target
```

## Acceptance

```text
AT-FUNC-012
AT-FUNC-013

AT-SEC-011
AT-SEC-012
AT-SEC-013

AT-DICOM-003
AT-DICOM-004
```

## Exit Criteria

```text
GATE-IMP-10
STOW-RS PASS

GATE-IMP-11
Destination Verification PASS
```

---

# 19. PHASE 10 — Integrity / Provenance / Audit

**Objective**

전송 성공을 단순 HTTP 성공이 아니라 검증 가능한 Exchange Evidence로 완성한다.

---

## 19.1 Integrity Tickets

| Ticket        | Priority    | Description                       |
| ------------- | ----------- | --------------------------------- |
| MEDIQ-INT-001 | P0-CRITICAL | Source integrity evidence         |
| MEDIQ-INT-002 | P0-CRITICAL | Destination integrity evidence    |
| MEDIQ-INT-003 | P0-CRITICAL | Bit-preserving comparison         |
| MEDIQ-INT-004 | P0-CRITICAL | Integrity failure completion gate |

Critical Rule:

```text
Integrity FAILED
→ Transfer != COMPLETED
```

---

## 19.2 Provenance Tickets

| Ticket         | Priority    | Description                  |
| -------------- | ----------- | ---------------------------- |
| MEDIQ-PROV-001 | P0-HIGH     | Provenance model/service     |
| MEDIQ-PROV-002 | P0-CRITICAL | Source→Destination recording |
| MEDIQ-PROV-003 | P0-HIGH     | Provenance read API          |

Required Chain:

```text
Source Hospital
→ Study
→ ImagingPackage
→ ExchangeSession
→ Destination
→ Integrity Result
```

---

## 19.3 Audit Tickets

| Ticket        | Priority    | Description              |
| ------------- | ----------- | ------------------------ |
| MEDIQ-AUD-001 | P0-CRITICAL | Audit writer             |
| MEDIQ-AUD-002 | P0-CRITICAL | Security audit events    |
| MEDIQ-AUD-003 | P0-HIGH     | Audit query API          |
| MEDIQ-AUD-004 | P0-HIGH     | Correlation ID           |
| MEDIQ-AUD-005 | P0-CRITICAL | Sensitive-data exclusion |

Sensitive data forbidden:

```text
Password
Raw Bearer Token
Private Key
DEK
KEK
DICOM Binary
```

## Acceptance

```text
AT-FUNC-014
AT-FUNC-015
AT-FUNC-016

AT-SEC-018
AT-SEC-019
AT-SEC-020

AT-AUD-001
AT-AUD-002
AT-AUD-003

AT-PROV-001
```

## Exit Criteria

```text
GATE-IMP-12 Integrity PASS
GATE-IMP-13 Provenance PASS
GATE-IMP-14 Audit PASS
```

---

# 20. PHASE 11 — Security Validation

**Objective**

새 기능을 추가하지 않고 기존 시스템의 Failure / Abuse Path를 자동 검증한다.

## Tickets

| Ticket        | Priority    | Security Scenario                   |
| ------------- | ----------- | ----------------------------------- |
| MEDIQ-SEC-001 | P0-CRITICAL | Unauthenticated access              |
| MEDIQ-SEC-002 | P0-CRITICAL | BOLA / IDOR                         |
| MEDIQ-SEC-003 | P0-CRITICAL | Cross-Tenant                        |
| MEDIQ-SEC-004 | P0-CRITICAL | No Consent                          |
| MEDIQ-SEC-005 | P0-CRITICAL | Withdrawn Consent                   |
| MEDIQ-SEC-006 | P0-CRITICAL | Expired Grant                       |
| MEDIQ-SEC-007 | P0-CRITICAL | Wrong Scope                         |
| MEDIQ-SEC-008 | P0-CRITICAL | Wrong Recipient                     |
| MEDIQ-SEC-009 | P0-CRITICAL | Wrong Destination                   |
| MEDIQ-SEC-010 | P0-CRITICAL | Invalid Patient Mapping             |
| MEDIQ-SEC-011 | P0-CRITICAL | Authorization failure / Fail Closed |
| MEDIQ-SEC-012 | P0-CRITICAL | Integrity Failure                   |
| MEDIQ-SEC-013 | P0-HIGH     | Sensitive Error/Log                 |
| MEDIQ-SEC-014 | P0-HIGH     | Direct Storage Access               |
| MEDIQ-SEC-015 | P0-HIGH     | TLS / Certificate Validation        |

## Mandatory Exit Matrix

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

Integrity Failure
→ FAILED

Authorization failure
→ DENY
```

## Exit Criteria

```text
GATE-IMP-15
Security Negative Tests PASS
```

---

# 21. PHASE 12 — Full E2E Golden Path

**Objective**

P0 시스템 전체를 실제 Orthanc A/B까지 연결하여 검증한다.

## Tickets

| Ticket         | Priority    | Description                     |
| -------------- | ----------- | ------------------------------- |
| MEDIQ-TEST-001 | P0-CRITICAL | Viewer Golden Path              |
| MEDIQ-TEST-002 | P0-CRITICAL | Download Golden Path            |
| MEDIQ-TEST-003 | P0-CRITICAL | PACS Import Golden Path         |
| MEDIQ-TEST-004 | P0-HIGH     | Cross-Tenant negative E2E       |
| MEDIQ-TEST-005 | P0-HIGH     | Consent withdrawal negative E2E |
| MEDIQ-TEST-006 | P0-HIGH     | Mapping failure negative E2E    |
| MEDIQ-TEST-007 | P0-HIGH     | Integrity failure negative E2E  |

---

## MEDIQ-TEST-003 — PACS Import Golden Path

### Priority

```text
P0-CRITICAL
HIGHEST
```

### Actual Flow

```text
Synthetic CT/MRI
       ↓
Hospital A Orthanc
       ↓
QIDO-RS
       ↓
WADO-RS
       ↓
MediQ
       ↓
ExchangeSession
       ↓
Consent ACTIVE
       ↓
Authorization ALLOW
       ↓
study:pacs-transfer
       ↓
PatientMapping VALID
       ↓
STOW-RS
       ↓
Hospital B Orthanc
       ↓
Destination Study Exists
       ↓
Integrity VERIFIED
       ↓
Provenance COMPLETED
       ↓
Audit
       ↓
ExchangeSession COMPLETED
```

### Mock Policy

다음만으로 PASS하지 않는다.

```text
Mock Orthanc
Mock STOW
Mock DICOM response
```

최종 Golden Path는 실제:

```text
Orthanc A
+
Orthanc B
```

Test Environment에서 실행한다.

### Acceptance

```text
AT-E2E-003
→ PASS
```

---

# 22. PHASE 13 — Capstone Release / Evidence Freeze

**Objective**

재현 가능한 Release Candidate를 고정한다.

## Tickets

| Ticket        | Priority    | Description               |
| ------------- | ----------- | ------------------------- |
| MEDIQ-REL-001 | P0-CRITICAL | Full automated test suite |
| MEDIQ-REL-002 | P0-CRITICAL | P0 Gate review            |
| MEDIQ-REL-003 | P0-HIGH     | Known issue register      |
| MEDIQ-REL-004 | P0-HIGH     | Demo fixture freeze       |
| MEDIQ-REL-005 | P0-CRITICAL | E2E evidence capture      |
| MEDIQ-REL-006 | P0-HIGH     | Release candidate tag     |
| MEDIQ-REL-007 | P0-CRITICAL | Capstone readiness report |

## Required Evidence

```text
Docker Compose startup

Hospital A Synthetic Study

ExchangeSession creation

Consent ACTIVE

Grant issued

Viewer PASS

Download PASS

PACS Import PASS

Hospital B Study received

Integrity VERIFIED

Provenance record

Audit timeline

Negative tests PASS
```

---

# 23. Ticket Backlog Summary

| Phase | Ticket Range       | Primary Output           | Initial Status |
| ----- | ------------------ | ------------------------ | -------------- |
| 0     | MEDIQ-ENV-001~010  | Reproducible environment | BACKLOG        |
| 1     | MEDIQ-DB-001~008   | PostgreSQL schema        | BACKLOG        |
| 2     | MEDIQ-ORG-001~003  | Hospital/Tenant registry | BACKLOG        |
| 2     | MEDIQ-PAT-001~004  | Patient mapping          | BACKLOG        |
| 3     | MEDIQ-EXC-001~006  | ExchangeSession          | BACKLOG        |
| 4     | MEDIQ-CON-001~008  | Consent workflow         | BACKLOG        |
| 5     | MEDIQ-IAM-001~003  | Authentication           | BACKLOG        |
| 5     | MEDIQ-AUT-001~004  | Authorization            | BACKLOG        |
| 5     | MEDIQ-GRT-001~007  | TransferGrant            | BACKLOG        |
| 6     | MEDIQ-DCM-001~005  | DICOMweb adapter         | BACKLOG        |
| 6     | MEDIQ-IMG-001~003  | Imaging metadata         | BACKLOG        |
| 7     | MEDIQ-VIEW-001~006 | Viewer                   | BACKLOG        |
| 8     | MEDIQ-DWN-001~005  | Download                 | BACKLOG        |
| 9     | MEDIQ-PACS-001~008 | STOW/PACS Import         | BACKLOG        |
| 10    | MEDIQ-INT-001~004  | Integrity                | BACKLOG        |
| 10    | MEDIQ-PROV-001~003 | Provenance               | BACKLOG        |
| 10    | MEDIQ-AUD-001~005  | Audit                    | BACKLOG        |
| 11    | MEDIQ-SEC-001~015  | Security validation      | BACKLOG        |
| 12    | MEDIQ-TEST-001~007 | Golden E2E               | BACKLOG        |
| 13    | MEDIQ-REL-001~007  | Release                  | BACKLOG        |

---

# 24. Key Ticket Traceability Matrix

| Ticket         | Requirement   | Security          | Threat           | Acceptance               |
| -------------- | ------------- | ----------------- | ---------------- | ------------------------ |
| MEDIQ-PAT-003  | REQ-PAT-004   | SEC-IAM-007       | THR-018          | AT-FUNC-003 / AT-SEC-012 |
| MEDIQ-EXC-003  | REQ-EXC-001   | SEC-API-002       | THR-002          | AT-FUNC-001              |
| MEDIQ-EXC-006  | REQ-EXC-001   | SEC-API-002       | THR-002          | AT-SEC-003               |
| MEDIQ-CON-004  | REQ-CON-003   | SEC-CONSENT-001   | THR-004          | AT-FUNC-006              |
| MEDIQ-CON-005  | REQ-CON-004   | SEC-CONSENT-002   | THR-004          | AT-FUNC-007              |
| MEDIQ-AUT-002  | REQ-AUT-001   | SEC-AUTHZ-002     | THR-030          | AT-SEC-017               |
| MEDIQ-AUT-003  | REQ-AUT-001   | SEC-API-002       | THR-002          | AT-SEC-003               |
| MEDIQ-GRT-003  | REQ-GRT-001   | SEC-GRANT-001     | THR-005          | AT-FUNC-008              |
| MEDIQ-GRT-005  | REQ-GRT-004   | SEC-GRANT-005     | THR-006          | AT-SEC-010               |
| MEDIQ-GRT-006  | REQ-GRT-003   | SEC-GRANT-003     | THR-008          | AT-SEC-009               |
| MEDIQ-DCM-003  | REQ-DICOM-001 | SEC-DICOM-001     | THR-011          | AT-DICOM-001             |
| MEDIQ-DCM-004  | REQ-DICOM-002 | SEC-DICOM-002     | THR-012          | AT-DICOM-002             |
| MEDIQ-VIEW-001 | REQ-VIEW-001  | SEC-AUTHZ-006     | THR-009          | AT-FUNC-010              |
| MEDIQ-DWN-001  | REQ-DWN-001   | SEC-AUTHZ-008     | THR-006          | AT-FUNC-011              |
| MEDIQ-PACS-001 | REQ-PACS-001  | SEC-DICOM-004     | THR-017          | AT-FUNC-012              |
| MEDIQ-PACS-003 | REQ-PACS-002  | SEC-DICOM-005     | THR-017          | AT-SEC-013               |
| MEDIQ-PACS-004 | REQ-PACS-003  | SEC-IAM-007       | THR-018          | AT-SEC-012               |
| MEDIQ-PACS-005 | REQ-PACS-001  | SEC-DICOM-003     | THR-019          | AT-DICOM-003             |
| MEDIQ-PACS-006 | REQ-PACS-005  | SEC-INT-001       | THR-020          | AT-FUNC-013              |
| MEDIQ-INT-004  | REQ-INT-002   | SEC-INT-002       | THR-021          | AT-SEC-018               |
| MEDIQ-PROV-002 | REQ-PROV-002  | SEC-INT-003       | THR-033          | AT-PROV-001              |
| MEDIQ-AUD-002  | REQ-AUD-001   | SEC-AUD-001       | THR-039          | AT-FUNC-016              |
| MEDIQ-AUD-005  | REQ-AUD-001   | SEC-AUD-003       | THR-034          | AT-SEC-020               |
| MEDIQ-TEST-003 | P0 E2E        | P0 Security Chain | Critical Threats | AT-E2E-003               |

---

# 25. Test Strategy

## Unit

Domain Invariant 중심:

```text
Withdrawn Consent
→ Grant issue DENY

Expired Grant
→ invalid

Wrong Scope
→ DENY

Terminal Session
→ DENY

Integrity mismatch
→ FAILED
```

---

## Integration

```text
PostgreSQL
Repository
Migration
API ↔ Domain
DICOMweb Adapter
Orthanc A
Orthanc B
```

---

## Security

반드시 자동화:

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
Authorization Error
Integrity Failure
Sensitive Logging
```

---

## E2E

최소:

```text
Test Client
→ MediQ API
→ PostgreSQL
→ Orthanc A
→ Orthanc B
```

까지 실제 연결한다.

---

# 26. Legacy Highpass Reuse Plan

Legacy 자산은 다음 기준으로만 재사용한다.

```text
Legacy Asset
      ↓
Required by current MediQ Ticket?
      ↓
Compatible with current interface?
      ↓
Compatible with security baseline?
      ↓
Tests available?
      ↓
REUSE / MODIFY / REWRITE / REJECT
```

## Candidate Assets

| Legacy Asset           | Initial Decision |
| ---------------------- | ---------------- |
| Orthanc Docker         | REVIEW           |
| DICOMweb Client        | REVIEW           |
| QIDO-RS code           | REVIEW           |
| WADO-RS code           | REVIEW           |
| STOW-RS code           | REVIEW           |
| TLS/mTLS configuration | REVIEW           |
| Token validation       | REVIEW           |
| Audit utility          | REVIEW           |
| Certificate tests      | REVIEW           |
| E2E utilities          | REVIEW           |

실제 Repository Audit 전 `REUSE` 판정을 하지 않는다.

필요 시 별도 Ticket:

```text
MEDIQ-DCM-009
Legacy DICOMweb compatibility review
```

같은 Migration Ticket으로 관리한다.

---

# 27. Risks / Blockers

| Risk                | Likelihood | Impact | Mitigation                    | Phase   |
| ------------------- | ---------- | ------ | ----------------------------- | ------- |
| DICOMweb 통합 복잡도     | HIGH       | HIGH   | Orthanc A/B 조기 통합             | 0,6,9   |
| Authorization Drift | MEDIUM     | HIGH   | 중앙 Policy + Negative tests    | 5,11    |
| Patient Mapping 오류  | MEDIUM     | HIGH   | VALID-only + fail closed      | 2,9     |
| PACS Import 후반 지연   | HIGH       | HIGH   | STOW를 Critical Path로 유지       | 6,9     |
| UI 우선 일정 왜곡         | MEDIUM     | HIGH   | UI polish 후순위                 | 7+      |
| Legacy 오염           | MEDIUM     | HIGH   | Compatibility Review          | 0       |
| Security Test 후순위   | MEDIUM     | HIGH   | Ticket-level tests + Phase 11 | 전 Phase |
| Scope Creep         | HIGH       | HIGH   | P0/P1 gate 유지                 | 전체      |
| Overengineering     | MEDIUM     | MEDIUM | Modular Monolith              | 전체      |
| Demo 재현 실패          | MEDIUM     | HIGH   | Docker + fixture freeze       | 0,13    |

---

# 28. Blocker Classification

Blocker는 다음 중 하나로 기록한다.

```text
ENVIRONMENT BLOCKED

BASELINE CONFLICT

DEPENDENCY BLOCKED

IMPLEMENTATION DEFECT

TEST FAILURE

SECURITY FAILURE

EXTERNAL INTEGRATION FAILURE
```

Template:

```text
Blocker:
...

Type:
...

Impact:
...

Affected Tickets:
...

P0 Impact:
...

Resolution:
...
```

---

# 29. Scope Change Rule

개발 중 새 기능이 필요해 보이는 경우:

```text
SCOPE CANDIDATE

Description:
...

Reason:
...

Required to pass existing P0 Acceptance?
YES / NO

Classification:
P0
P1
POST-MVP
PRODUCTIONIZATION

Decision:
...
```

다음 질문이 `NO`이면 기본적으로 P0에 추가하지 않는다.

> 기존 승인된 P0 Acceptance Test를 통과하는 데 반드시 필요한가?

---

# 30. Definition of Done — Ticket

Ticket은 다음을 모두 충족해야 한다.

```text
[ ] Code implemented

[ ] `docs/implementation/<TICKET>/IMPLEMENTATION-REPORT.md` updated

[ ] `docs/implementation/<TICKET>/TEST-EVIDENCE.md` contains actual commands and results

[ ] `docs/implementation/README.md` status updated

[ ] Baseline conflict 없음

[ ] Required unit tests PASS

[ ] Required integration tests PASS

[ ] Security control implemented

[ ] Error path implemented

[ ] Acceptance reference exists

[ ] Required audit implemented

[ ] Schema/API/baseline/implementation documents synced

[ ] No unauthorized P1/Future expansion
```

따라서:

```text
Code written
→ IMPLEMENTED
```

이며:

```text
Implementation
+
Tests
+
Acceptance
→ DONE
```

이다.

---

# 31. Definition of Done — Phase

Phase는 다음을 만족해야 `PASS`다.

```text
All P0 Critical Tickets DONE

Relevant Acceptance Gates PASS

No unresolved Critical Blocker

No Critical Regression

Implementation matches Baseline
```

---

# 32. Implementation Gate Review

| Gate        | Target                        |
| ----------- | ----------------------------- |
| GATE-IMP-01 | Environment reproducible      |
| GATE-IMP-02 | Database migration PASS       |
| GATE-IMP-03 | Patient Mapping PASS          |
| GATE-IMP-04 | ExchangeSession PASS          |
| GATE-IMP-05 | Consent PASS                  |
| GATE-IMP-06 | Authorization/Grant PASS      |
| GATE-IMP-07 | QIDO/WADO PASS                |
| GATE-IMP-08 | Viewer PASS                   |
| GATE-IMP-09 | Download PASS                 |
| GATE-IMP-10 | STOW-RS PASS                  |
| GATE-IMP-11 | Destination Verification PASS |
| GATE-IMP-12 | Integrity PASS                |
| GATE-IMP-13 | Provenance PASS               |
| GATE-IMP-14 | Audit PASS                    |
| GATE-IMP-15 | Security Negative PASS        |
| GATE-IMP-16 | Viewer Golden Path PASS       |
| GATE-IMP-17 | Download Golden Path PASS     |
| GATE-IMP-18 | PACS Golden Path PASS         |

현재 계획 단계 상태:

```text
GATE-IMP-01~18
NOT EXECUTED
```

실행 전부터 PASS로 표시하지 않는다.

---

# 33. Final Release Gate

다음이 실제 Test 결과로 모두 `PASS`일 때만:

```text
CAPSTONE MVP READY = YES
```

로 한다.

```text
Functional Acceptance

Security Acceptance

Viewer E2E

Download E2E

PACS Import E2E

Tenant Isolation

Consent Enforcement

Grant Scope

Patient Mapping

Destination Binding

Integrity

Provenance

Audit

Fail Closed
```

---

# 34. P0 Critical Failure Conditions

다음 중 하나라도 실제로 발생하면 P0 Security Release를 차단한다.

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
→ DOWNLOAD or PACS_IMPORT ALLOW
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
Authorization error
→ ALLOW
```

---

# 35. Deferred Backlog

## CAPSTONE-P1

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

## POST-MVP

```text
Hospital Connector PoC

Advanced replay protection

Advanced retention automation

Extended viewer controls
```

## PRODUCTIONIZATION

```text
Real Patient Identity

Real Hospital Integration

Hospital SSO

Enterprise KMS/HSM

Enterprise PKI

Production SIEM/SOC

HA / DR

Production WAF

Legal/Privacy validation
```

---

# 36. Recommended Execution Order

실제 개발 시작 시 다음 순서를 사용한다.

```text
STEP 1
MEDIQ-ENV-001
Repository audit

STEP 2
ENV / Docker / Orthanc / PostgreSQL

STEP 3
Database Migration

STEP 4
PatientReference / Mapping

STEP 5
ExchangeSession

STEP 6
Consent

STEP 7
AuthN / AuthZ / TransferGrant

STEP 8
QIDO-RS / WADO-RS

STEP 9
STOW-RS 최소 Vertical Slice

STEP 10
Destination Verification

STEP 11
Integrity / Provenance / Audit

STEP 12
Viewer / Download complete

STEP 13
Security Negative Tests

STEP 14
Full E2E

STEP 15
Release Evidence Freeze
```

중요:

> STOW-RS를 모든 UI 작업 이후로 미루지 않는다.

---

# 37. First Development Milestone

첫 번째 의미 있는 기술 Milestone은 UI가 아니다.

```text
MILESTONE M1

Orthanc A
→ MediQ DICOMweb Adapter
→ Orthanc B

Synthetic Study
STOW-RS transfer

PASS
```

이때 Consent/Auth 등 전체 Security Chain이 아직 완성되지 않았더라도 **Integration Spike 수준에서 DICOMweb 기술 위험을 조기에 제거**할 수 있다.

단:

```text
Integration Spike PASS
≠
P0 Acceptance PASS
```

최종 P0에서는 반드시 전체 Security Chain을 거쳐야 한다.

---

# 38. Second Milestone

```text
MILESTONE M2

Patient Mapping
+
ExchangeSession
+
Consent
+
Authorization
+
TransferGrant
+
WADO
+
STOW
```

가 연결된 최소 Secure Transfer.

---

# 39. Third Milestone

```text
MILESTONE M3

M2
+
Destination Verification
+
Integrity
+
Provenance
+
Audit
```

즉 실제:

```text
AT-E2E-003
```

Golden Path 완성.

---

# 40. Final Implementation Decision

```text
PROJECT:
MediQ

IMPLEMENTATION PLAN VERSION:
v1.3 Integrated Implementation Documentation Gate

CURRENT TARGET:
CAPSTONE P0 END-TO-END MVP

ARCHITECTURE:
MODULAR MONOLITH

DEPLOYMENT:
DOCKER COMPOSE

TOTAL PHASES:
14

REPOSITORY ACTUAL STATE:
NOT YET VERIFIED

FIRST ACTION:
MEDIQ-ENV-001
REPOSITORY BASELINE AUDIT

P0 CRITICAL PATH:
DEFINED

TICKETS:
DEFINED

DEPENDENCIES:
DEFINED

DATABASE:
17-TABLE P0 BASELINE

REQUIREMENT TRACEABILITY:
DEFINED

SECURITY TRACEABILITY:
DEFINED

THREAT TRACEABILITY:
DEFINED

ACCEPTANCE TRACEABILITY:
DEFINED

PACS IMPORT:
PRIMARY CRITICAL PATH

STOW-RS:
EARLY INTEGRATION REQUIRED

SECURITY NEGATIVE TESTS:
MANDATORY

E2E GOLDEN PATH:
MANDATORY

P1 MOBILE:
DEFERRED

PRODUCTIONIZATION:
SEPARATED

LEGACY HIGHPASS:
CONTROLLED REVIEW / MIGRATION ONLY

CAPSTONE TECHNICAL READINESS:
NOT YET ASSESSED

PRODUCTION READINESS:
NOT ASSESSED / NOT READY

IMPLEMENTATION PLAN READY:
YES
```

---

# FINAL IMPLEMENTATION POLICY

> **MediQ의 구현 우선순위는 UI 완성도가 아니라 Hospital A → MediQ → Hospital B 의료영상 Exchange의 실제 동작이다.**

> **`Environment → DB → Patient Mapping → ExchangeSession → Consent → Authorization/Grant → DICOMweb → PACS Import → Integrity/Provenance/Audit → Security Tests → E2E`를 Critical Path로 사용한다.**

> **Viewer와 Download는 P0 필수기능이지만 PACS Import Integration 위험보다 우선하지 않는다.**

> **모든 P0 Critical Ticket은 Acceptance Test와 연결되어야 하며 Code가 존재하는 것만으로 DONE으로 판단하지 않는다.**

> **코드·설정·Migration·API·Schema·테스트 변경은 같은 Ticket에서 구현 보고서와 테스트 증거를 함께 갱신해야 하며, 문서화가 누락된 구현은 완료로 판정하지 않는다.**

> **최종 완료 기준은 Synthetic/Test DICOM이 Hospital A Test Orthanc에서 조회되어 MediQ의 Patient Mapping·Consent·Authorization·Scoped Grant 검증을 통과한 후 Hospital B Test Orthanc에 STOW-RS로 저장되고, Destination Verification·Integrity·Provenance·Audit까지 모두 PASS하는 것이다.**

---

# Viewer Architecture Implementation Amendment — 2026-09-15

## P0 Viewer Tickets

| Ticket | Priority | Description | Dependency | Acceptance |
|---|---|---|---|---|
| MEDIQ-VIEW-007 | P0-CRITICAL | Hospital User/Synthetic Patient actor-aware ViewerSession | AUTH/Grant core | TC-VIEW-004/005 |
| MEDIQ-VIEW-008 | P0-CRITICAL | Source PACS WADO-RS on-demand/progressive delivery | MEDIQ-DICOM WADO | TC-VIEW-006/009 |
| MEDIQ-VIEW-009 | P0-CRITICAL | Short-lived session, revoke, UID/direct URL bypass prevention | MEDIQ-VIEW-007 | TC-VIEW-007/008 |
| MEDIQ-VIEW-010 | P0-HIGH | Viewer event Audit and Provenance | Audit module | TC-VIEW-004~009 |
| MEDIQ-DATA-018 | P0-HIGH | Encrypted TTL cache lifecycle and purge evidence | Imaging module | TC-DATA-004/005 |
| MEDIQ-SEC-018 | P0-CRITICAL | Backend-only PACS connector allowlist and credential isolation | Environment/Secrets | TC-SEC-VIEW-003 |

## P1 Mobile Viewer Tickets

| Ticket | Priority | Description | Acceptance |
|---|---|---|---|
| MEDIQ-MOB-007 | P1 | Mobile Vault local DICOM/derived image viewer | TC-MOB-007 |
| MEDIQ-MOB-008 | P1 | Device binding, encrypted app-private storage, local authentication | TC-MOB-008 |
| MEDIQ-MOB-009 | P1 | Expiry/revoke/offline copy and crypto-shredding policy | TC-MOB-009 |
| MEDIQ-MOB-010 | P1 | Android-first Native Vault, Device Registration, Attestation 및 StrongBox/TEE Admission | TC-MOB-010/011 |
| MEDIQ-MOB-011 | P1 | AES-256-GCM Capsule, per-Capsule DEK, versioned Wrap Slot, PQC-ready crypto agility 및 key lifecycle | TC-MOB-012/017 |
| MEDIQ-MOB-012 | P1 | 30-day Offline Lease, online policy refresh 및 clock/restore abuse 방어 | TC-MOB-013 |
| MEDIQ-MOB-013 | P1 | Background privacy, 60-second reauth grace 및 capture protection | TC-MOB-014/015 |
| MEDIQ-MOB-014 | P1 | Lost Device revoke, no-key-escrow replacement 및 Source PACS reissue | TC-MOB-016 |
| MEDIQ-MOB-015 | P1 | Capsule v1 Backend Writer/Android Reader, Deterministic CBOR, COSE/HPKE Interop Vector, Range Resume 및 Atomic Commit | TC-MOB-018 |
| MEDIQ-MOB-016 | P1 | Separate Mobile OpenAPI, PKCE/DPoP Profile, Device/Export/Capsule/Lease/Revocation/Audit Mock·Generated Client·Contract Tests | TC-MOB-019 |

## Dependency Order

```text
Environment / Orthanc / PostgreSQL
→ Authentication / Patient Mapping / Consent / Grant
→ DICOMweb WADO-RS Adapter
→ MEDIQ-VIEW-007 ViewerSession
→ MEDIQ-VIEW-008 Progressive Delivery
→ MEDIQ-VIEW-009 Security Enforcement
→ MEDIQ-DATA-018 Cache Purge
→ MEDIQ-VIEW-010 Audit / Provenance
→ Viewer Acceptance Tests
```

Mobile Viewer는 P0 Viewer Acceptance가 완료된 이후 P1 Track에서 수행한다. 문서 개정만으로 위 Ticket 상태를 DONE으로 변경하지 않는다.

**공통 기준:** Hospital PACS는 Source of Record이며 MediQ Cloud에 Permanent PACS/장기 Archive를 구현하지 않는다. P0 Cloud Viewer는 온디맨드 DICOMweb 경로, P1 Mobile Viewer는 암호화 Local Vault 경로로 구현한다.

## P1 Mobile Dependency Order

P0 Viewer Acceptance와 P0 Security Validation이 완료된 뒤 다음 순서로 수행한다.

```text
MEDIQ-MOB-016 Mobile OpenAPI + Mock + Generated Client Contract
  → MEDIQ-MOB-010 Android platform shell + Device Admission
  → MEDIQ-MOB-011 Capsule crypto + Key Lifecycle + Crypto Agility
  → MEDIQ-MOB-015 Capsule v1 Interop + Resume + Atomic Commit
  → MEDIQ-MOB-007 Local Viewer
  → MEDIQ-MOB-008 Device Binding + Local Authentication
  → MEDIQ-MOB-012 Offline Lease
  → MEDIQ-MOB-013 Background/Capture Protection
  → MEDIQ-MOB-014 Lost Device/Reissue
  → P1 Mobile Acceptance Tests
```

iOS Native Vault는 Android P1 Mobile MVP의 보안 및 성능 증거가 확보된 후 별도 Ticket으로 계획한다. P1 Mobile API와 DB Migration은 Domain/Data/OpenAPI/Acceptance 문서를 함께 갱신하는 별도 승인 Ticket 없이는 생성하지 않는다.

---

# Azure Deployment Recommendation Track — 2026-09-19

Azure 구현은 현재 `POST-MVP` 권고 Track이며 P0 Critical Path를 선점하지 않는다. 상세 기준은 `AZURE-DEPLOYMENT-RECOMMENDATIONS.md`를 따른다.

## Entry Gate

```text
Repository Baseline
  → MEDIQ-ENV-002 Local Reproducible Environment
  → P0 Local Golden Path PASS
  → P0 Security Negative Tests PASS
  → Azure Scope Decision
  → Azure Recommendation Track
```

## Proposed Tickets

| Ticket | Classification | Description | Dependency | Status |
|---|---|---|---|---|
| MEDIQ-CLOUD-001 | POST-MVP | Azure Deployment ADR, budget/region/quota 및 PACS connectivity decision | Local P0 E2E | PROPOSED |
| MEDIQ-CLOUD-002 | POST-MVP | Bicep 기반 최소 Azure Landing Zone과 teardown | MEDIQ-CLOUD-001 | PROPOSED |
| MEDIQ-CLOUD-003 | POST-MVP | Managed Identity, Key Vault 및 least-privilege service boundary | MEDIQ-CLOUD-002 | PROPOSED |
| MEDIQ-CLOUD-004 | POST-MVP | Encrypted Temporary Blob TTL, binding 및 purge evidence | MEDIQ-CLOUD-003 | PROPOSED |
| MEDIQ-CLOUD-005 | POST-MVP | Synthetic/Test Orthanc connectivity PoC | MEDIQ-CLOUD-002 | PROPOSED |
| MEDIQ-CLOUD-006 | POST-MVP | Azure E2E, cross-tenant, replay, purge 및 failure-path tests | MEDIQ-CLOUD-003~005 | PROPOSED |
| MEDIQ-DB-001 | POST-MVP | PostgreSQL RLS, pool isolation 및 migration | Core DB stable | PROPOSED |
| MEDIQ-CONN-001 | PRODUCTIONIZATION | Hospital outbound Connector/VPN/PKI architecture | Institution agreement | PROPOSED |
| MEDIQ-AUD-001 | PRODUCTIONIZATION | Audit Hash Chain/WORM/SIEM hardening | P0 Audit PASS | PROPOSED |

`PROPOSED` Ticket은 승인된 구현 작업이 아니다. 평가 요구로 Azure가 P0 필수가 되면 `CAPSTONE-MVP-BOUNDARY.md`를 먼저 개정하고 관련 Acceptance Test를 함께 추가한다.

---

# Synthetic Health Data Preview Implementation Track — 2026-09-26

이 Track은 P0 Golden Path와 P0 Security Validation 이후 수행하는 Optional `CAPSTONE-P1 PROTOTYPE`이다.

```text
P0 E2E PASS
  → MEDIQ-HHP-001 Disclosure-first Mobile UI
  → MEDIQ-HHP-002 HealthDataProvider Port + Mock Provider
  → MEDIQ-HHP-003 Versioned Synthetic Fixture + Validator
  → MEDIQ-HHP-004 Demo Audit + Reset + Route Isolation
  → MEDIQ-HHP-005 UI/No-network/Security Acceptance
  → Productionization Discovery only if institution decision exists
```

| Ticket | Classification | Description | Dependency | Acceptance | Status |
|---|---|---|---|---|---|
| `MEDIQ-HHP-001` | CAPSTONE-P1 | `MOB-HHP-001~008` 화면과 영구 DEMO Disclosure | P0 UI baseline | TC-HHP-001/009 | PROPOSED |
| `MEDIQ-HHP-002` | CAPSTONE-P1 | HealthDataProvider Port와 Mock-only selection | HHP-001 | TC-HHP-005/010 | PROPOSED |
| `MEDIQ-HHP-003` | CAPSTONE-P1 | Synthetic Fixture, TEST Identity, Marker/Hash Validator | HHP-002 | TC-HHP-002~004 | PROPOSED |
| `MEDIQ-HHP-004` | CAPSTONE-P1 | Mock Consent 분리, DEMO Audit, Reset, Share/Import DENY | HHP-001~003 | TC-HHP-006~008 | PROPOSED |
| `MEDIQ-HHP-005` | CAPSTONE-P1 | Preview UI/Accessibility/Network/Security Regression | HHP-004 | TC-HHP-001~010 | PROPOSED |
| `MEDIQ-HHP-006` | CAPSTONE-P1 | 건강검진·혈액·항체 Synthetic Fixture와 Patient Web HTML 시연 | HHP-001~003 | TC-HHP-011~015 | IN PROGRESS |
| `MEDIQ-HHP-PROD-001` | PRODUCTIONIZATION | 지정심사·테스트베드·법률·공식 API Discovery | Institution decision | 별도 정의 | PROPOSED |

Implementation constraints:

- 현재 `OPENAPI.yaml`에는 Health Data Preview Endpoint를 추가하지 않는다.
- 초기 Prototype은 App Asset 또는 Test-only Fixture를 사용할 수 있다.
- API가 필요해지면 Mobile OpenAPI, Domain/Data/Security/Threat/Acceptance를 같은 Ticket에서 개정한다.
- 실제 Provider, 운영 Base URL, Credential, 인증서, 실제 환자정보는 금지한다.
- P1 Preview 지연·실패는 P0 완료를 차단하지 않는다.

상세 기준은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.

# Patient Experience Feature Pack Implementation Track — 2026-09-26

이 Track은 P0 Golden Path와 Security Validation 완료 후 시작한다.

| Wave | Ticket | 기능 | 분류 | 상태 |
|---|---|---|---|---|
| 0 | `MEDIQ-PXE-CORE-001` | 공통 Projection·Error Envelope·접근성 토큰 | P1 | PROPOSED |
| 1 | `MEDIQ-PXE-IC-001` | 쉬운 영상 카드 | P1 | PROPOSED |
| 1 | `MEDIQ-PXE-ER-001` | 오류 복구 | P1 | PROPOSED |
| 1 | `MEDIQ-PXE-SE-001` | 저장공간·만료 | P1 | PROPOSED |
| 2 | `MEDIQ-PXE-AR-001` | 접근이력·영수증 | P1 | PROPOSED |
| 2 | `MEDIQ-PXE-NT-001` | 개인정보 최소 알림 | P1 | PROPOSED |
| 3 | `MEDIQ-PXE-AC-001` | 행동센터 | P1 | PROPOSED |
| 4 | `MEDIQ-PXE-VM-001` | 병원 방문 모드 | P1 | PROPOSED |
| 5 | `MEDIQ-PXE-RR-001` | 판독문·의뢰서 | POST-MVP | PROPOSED |
| 6 | `MEDIQ-PXE-GD-001` | 보호자·가족 위임 | POST-MVP | PROPOSED |

각 Ticket은 Feature Spec의 요구사항·보안·Acceptance를 선택하고, 필요한 OpenAPI·Domain/Data/ERD·Threat·Screen 문서를 코드와 같은 작업에서 갱신한다. 기능 8·9는 별도 Scope Decision과 법적·상호운용 ADR 없이는 시작하지 않는다. 실행 순서와 산출물 Gate는 `patient-experience/PATIENT-EXPERIENCE-FEATURE-ROADMAP.md`를 따른다.

# Hospital Clinical Workflow P1 Implementation Track — 2026-09-27

이 Track은 P0 Golden Path와 P0 Security Validation 완료 후 수행한다.

| Wave | Ticket | 기능 | Dependency | Acceptance | 상태 |
|---|---|---|---|---|---|
| 0 | `MEDIQ-HCW-CORE-001` | Workforce Role/Capability, 공통 Projection·Error·Pagination | P0 Identity/Tenant | Cross-role/Tenant tests | PROPOSED |
| 1 | `MEDIQ-HCW-AT-001` | 설명형 Audit·Provenance Timeline | P0 Audit/Provenance PASS | `TC-HCW-AT-001~007` | PROPOSED |
| 1 | `MEDIQ-HCW-NT-001` | 개인정보 최소 Hospital Inbox | CORE + Domain Event | `TC-HCW-NT-001~007` | PROPOSED |
| 2 | `MEDIQ-HCW-AS-001` | 팀 배정·인계 State Machine | CORE | `TC-HCW-AS-001~008` | PROPOSED |
| 2 | `MEDIQ-HCW-HP-001` | 진료 인계 패킷 | CORE + AS | `TC-HCW-HP-001~008` | PROPOSED |
| 3 | `MEDIQ-HCW-PR-001` | 권한 범위 과거 영상 Finder | P0 QIDO/Viewer | `TC-HCW-PR-002~004/006~007` | PROPOSED |
| 3 | `MEDIQ-HCW-PR-002` | Multi-study Comparison Viewer Session | PR-001 + WADO Gateway | `TC-HCW-PR-001/004~005` | PROPOSED |
| 4 | `MEDIQ-HCW-TEST-001` | Contract/Security/Accessibility/P0 Regression | HCW 기능 | 전체 HCW + P0 Regression | PROPOSED |

Dependency order:

```text
P0 E2E + Security PASS
→ HCW Role/Capability Contract
→ OpenAPI + Domain/Data/ERD + Migration
→ Timeline / Inbox
→ Assignment / Handoff
→ Authorized Prior Finder
→ Multi-study Viewer
→ Security / Accessibility / E2E Evidence
```

`PROPOSED`는 구현 승인이거나 완료 상태가 아니다. 각 Ticket은 `docs/implementation/<TICKET>/IMPLEMENTATION-REPORT.md`와 `TEST-EVIDENCE.md`를 생성하고 코드·문서·테스트를 한 작업으로 수행한다. 판독문·의뢰서 Payload와 외부 Push/Email은 이 Track에서 구현하지 않는다.
