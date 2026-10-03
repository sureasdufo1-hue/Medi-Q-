# MediQ Data Model

## DEC-022-B1 actual read gate — no schema/right change (2026-10-04)

Original95264 actual16-case destination graph/query/RLS plus independent exact Audit/Provenance/source-PENDING/noncompletion/purge/quota observer PASS; ACTDEST001–008/report§48/evidence§84. Existing253 exact runtime privileges unchanged, no destination integrity INSERT or terminal provenance/state write added, no source row promotion. Synthetic legal VERIFYING transitions are test setup, not a real Preflight/STOW claim. Original separately append-only DESTINATION_VERIFY and narrow immutable-binding terminal provenance writes require an independently documented minimum-rights delta, migration/RLS/denial/rollback/concurrency actual DB gate before implementation acceptance; not fulfilled by the ephemeral comparison result.

## DEC-022-A read-only verification gate — no schema/grant change

New repository reads the existing Tenant-visible source AVAILABLE/TTL/pending Integrity and exact operation VERIFYING/version3/semantic digest/count/pending Provenance/three transition Audits. It uses existing253 runtime column privilege tuples; no migration, historical source constraint rewrite or destination/provenance column write is added. The ephemeral minimized comparison proof is not a new DB row and must not be serialized as completed evidence. New closed checkpoint/failure Audit vocabulary uses existing12-column INSERT rights. Actual SQL/RLS/exact-catalog acceptance remains required; only model DB query composition is locally tested at this stage. Separate destination/terminal persistence design and actual gates still precede complete P0.

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `DATA-MODEL.md`
**Version:** v1.6 PACS Import Status Read Projection Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0

## DEC-021/021-A HTTP projection — no schema/grant amendment (2026-10-04)

CAPSTONE-P0. Existing operation rows/key/semantic digest/UQ remain unchanged. GET status returns only operationId, sessionId, operationState, completionConfirmed, resendAllowed=false, updatedAt (UTC ISO milliseconds); only proven COMPLETED adds the full closed PacsImportResult. Tenant/Actor/current destination Hospital/Session/key ownership is checked internally before projection. Idempotency-Key is a selector, not a bearer credential. Do not return actor/Tenant/Patient ID, Consent/Grant IDs, request digest, raw reason, UID, payload or PACS configuration.

Completed result includes bound operation/session/study, source/destination Hospital references, terminal Integrity/Provenance references and fixed verified completion/Audit/purge literals (OpenAPI1.3.0). These are projections of separately validated facts, not new columns or evidence-by-JSON. Ledger COMPLETED alone is insufficient. Source Integrity PENDING rows cannot be promoted to destination evidence. No table, migration, RLS/role/grant, retention or public Audit projection change; future actual owned lookup/terminal writer remains its own security/DB gate. REQ-PACS-API-001~006 / TC-PACS-001-API-001~007.
**Target RDBMS:** PostgreSQL
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ에서 실제로 저장해야 하는 **Control Metadata의 관계형 데이터 모델**을 정의한다.

상위 문서에서 확정한:

```text
PatientReference
→ PatientMapping
→ ExchangeSession
→ ConsentArtifact
→ TransferGrant
→ ImagingPackage
→ StudyReference
→ IntegrityEvidence
→ ProvenanceRecord
→ AuditEvent
```

를 다음 데이터베이스 요소로 변환한다.

```text
Entity
↓
Table
↓
Column
↓
Primary Key
↓
Foreign Key
↓
Unique Constraint
↓
Check Constraint
↓
Index
```

본 문서에서는 새로운 Product Domain을 추가하지 않는다.

---

# 2. Normative Inputs

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
DATA-FLOW.md
        ↓
DATA-MODEL.md
```

---

# 3. Data Model Principles

## Principle 1 — Metadata와 DICOM Binary 분리

관계형 DB:

```text
Patient Reference
Patient Mapping
Session
Consent
Grant
Imaging Metadata
Audit
Provenance
Integrity Metadata
```

Temporary Imaging Storage:

```text
DICOM Binary
CT / MRI Payload
```

따라서:

```text
PostgreSQL
≠
DICOM Binary Store
```

---

## Principle 2 — UUID 기반 식별

내부 Entity PK는 원칙적으로 UUID를 사용한다.

예:

```text
patient_ref_id
session_id
consent_id
grant_id
package_id
```

외부에 DB Sequence 값을 직접 식별자로 노출하지 않는다.

---

## Principle 3 — Hospital-local ID 분리

```text
patient_refs
≠
patient_mappings.local_patient_id
```

병원 Local Patient ID를 MediQ PK로 사용하지 않는다.

---

## Principle 4 — Consent / Grant 분리

```text
consents
≠
transfer_grants
```

동의가 존재한다고 실행권한이 자동 생성되지 않는다.

---

## Principle 5 — Evidence 보존

다음 데이터는 일반 Business Row 삭제와 함께 무조건 Cascade 삭제하지 않는다.

```text
audit_events
provenance_records
integrity_evidence
```

증적 데이터는 별도 Lifecycle을 가진다.

---

# 4. P0 Tables

P0 관계형 데이터 모델은 다음 Table을 사용한다.

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

---

# 5. Logical Relationship

```text
organizations
     │
     └── tenants
           │
           ├── hospitals
           │      │
           │      └── hospital_endpoints
           │
           └── actors

patient_refs
     │
     ├── patient_mappings ─── hospitals
     │
     └── exchange_sessions
              │
              ├── consents
              │      └── consent_actions
              │
              ├── transfer_grants
              │      └── transfer_grant_scopes
              │
              ├── imaging_packages
              │      ├── study_references
              │      └── integrity_evidence
              │
              ├── provenance_records
              │
              └── audit_events
```

---

# 6. Common Column Rules

모든 주요 Entity는 가능하면 다음 공통 Metadata를 사용한다.

```text
created_at TIMESTAMPTZ NOT NULL

updated_at TIMESTAMPTZ NOT NULL
```

Lifecycle Entity는 필요 시:

```text
expires_at
revoked_at
deleted_at
completed_at
```

등을 별도로 사용한다.

시간은 DB에서:

```text
TIMESTAMPTZ
```

로 저장한다.

---

# 7. organizations

## Purpose

MediQ를 사용하는 조직의 상위 논리단위.

## Columns

| Column            | Type         | Constraint       |
| ----------------- | ------------ | ---------------- |
| organization_id   | UUID         | PK               |
| organization_code | VARCHAR(64)  | NOT NULL, UNIQUE |
| name              | VARCHAR(200) | NOT NULL         |
| organization_type | VARCHAR(32)  | NOT NULL         |
| status            | VARCHAR(20)  | NOT NULL         |
| created_at        | TIMESTAMPTZ  | NOT NULL         |
| updated_at        | TIMESTAMPTZ  | NOT NULL         |

## organization_type

조직 분류를 나타내는 확장 가능한 코드다. 이 값은 lifecycle status가 아니며, 현재 P0에는 유한 허용값 목록을 두지 않는다. 따라서 DB CHECK는 적용하지 않는다. 향후 카탈로그/API 검증을 추가할 때는 별도 승인 기준과 Acceptance를 정의한다.

## Status

```text
ACTIVE
INACTIVE
```

## CHECK

```text
status IN ('ACTIVE', 'INACTIVE')
```

## Index

```text
UNIQUE organization_code
INDEX status
```

---

# 8. tenants

## Purpose

SaaS Resource Isolation의 논리적 Security Boundary.

## Columns

| Column          | Type         | Constraint       |
| --------------- | ------------ | ---------------- |
| tenant_id       | UUID         | PK               |
| organization_id | UUID         | FK, NOT NULL     |
| tenant_code     | VARCHAR(64)  | NOT NULL, UNIQUE |
| name            | VARCHAR(200) | NOT NULL         |
| status          | VARCHAR(20)  | NOT NULL         |
| created_at      | TIMESTAMPTZ  | NOT NULL         |
| updated_at      | TIMESTAMPTZ  | NOT NULL         |

## FK

```text
organization_id
→ organizations.organization_id
```

Delete:

```text
ON DELETE RESTRICT
```

## Status

```text
ACTIVE
SUSPENDED
INACTIVE
```

## Index

```text
UNIQUE tenant_code

INDEX organization_id

INDEX status
```

---

# 9. hospitals

## Purpose

의료영상 Source 또는 Destination 역할의 Hospital Entity.

Capstone에서는 Test Hospital만 사용한다.

## Columns

| Column           | Type         | Constraint       |
| ---------------- | ------------ | ---------------- |
| hospital_id      | UUID         | PK               |
| tenant_id        | UUID         | FK, NOT NULL     |
| organization_id  | UUID         | FK, NOT NULL     |
| hospital_code    | VARCHAR(64)  | NOT NULL, UNIQUE |
| name             | VARCHAR(200) | NOT NULL         |
| environment_type | VARCHAR(20)  | NOT NULL         |
| status           | VARCHAR(20)  | NOT NULL         |
| created_at       | TIMESTAMPTZ  | NOT NULL         |
| updated_at       | TIMESTAMPTZ  | NOT NULL         |

## environment_type

```text
TEST
DEVELOPMENT
```

현재 P0에서는 Production Hospital을 등록하지 않는다.

## status

```text
ACTIVE
SUSPENDED
INACTIVE
```

```text
CHECK status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')
```

## Registry Ownership Consistency

Hospital의 Tenant와 Organization은 동일한 Tenant Registry 행의 소유 관계를 따라야 한다.

```text
UNIQUE tenants(tenant_id, organization_id)
FK hospitals(tenant_id, organization_id)
  → tenants(tenant_id, organization_id)
ON DELETE RESTRICT
```

기존 개별 FK도 유지한다. 이 복합 FK는 Registry 관계의 구조적 일관성을 강제하며 Runtime Authorization을 대신하지 않는다.

## Index

```text
UNIQUE hospital_code

INDEX tenant_id

INDEX organization_id

INDEX status
```

---

# 10. hospital_endpoints

## Purpose

Hospital의 DICOMweb Endpoint와 Capability를 저장한다.

## Columns

| Column        | Type         | Constraint   |
| ------------- | ------------ | ------------ |
| endpoint_id   | UUID         | PK           |
| hospital_id   | UUID         | FK, NOT NULL |
| endpoint_type | VARCHAR(20)  | NOT NULL     |
| base_url      | VARCHAR(500) | NOT NULL     |
| enabled       | BOOLEAN      | NOT NULL     |
| created_at    | TIMESTAMPTZ  | NOT NULL     |
| updated_at    | TIMESTAMPTZ  | NOT NULL     |

## endpoint_type

```text
QIDO_RS
WADO_RS
STOW_RS
```

## UNIQUE

```text
UNIQUE (
    hospital_id,
    endpoint_type
)
```

P0에서는 Hospital별 Endpoint Type당 하나의 활성 Endpoint를 기본으로 한다.

`enabled`는 서버 측 Connector가 Registry metadata를 후보 설정으로 사용할 수 있는지 나타낸다. `true`여도 접근권한, Tenant authorization, endpoint reachability, DICOM capability 또는 제품 readiness를 증명하지 않는다. 실제 요청은 allowlisted Registry resolution, 인증·인가, Consent/Grant, action/scope, destination 및 integrity preflight를 별도로 통과해야 한다. 검증되지 않은 capability는 `enabled=false`로 유지한다.

## Index

```text
INDEX hospital_id
INDEX endpoint_type
```

Credential 원문은 이 Table에 저장하지 않는다.

---

# 11. actors

## Purpose

MediQ에 접근하는 User 또는 Service Identity에 대한 Application-level Reference.

## Columns

| Column           | Type         | Constraint   |
| ---------------- | ------------ | ------------ |
| actor_id         | UUID         | PK           |
| tenant_id        | UUID         | FK, NOT NULL |
| hospital_id      | UUID         | FK, NULLABLE |
| actor_type       | VARCHAR(20)  | NOT NULL     |
| external_subject | VARCHAR(255) | NOT NULL     |
| display_name     | VARCHAR(200) | NULLABLE     |
| status           | VARCHAR(20)  | NOT NULL     |
| created_at       | TIMESTAMPTZ  | NOT NULL     |
| updated_at       | TIMESTAMPTZ  | NOT NULL     |

## actor_type

```text
USER
SERVICE
```

P0 Synthetic Patient approval은 기존 schema에 환자 인증 table을 추가하지 않는다. 테스트 OIDC issuer가 서명한 `mediq_patient_ref_id` claim과 동일 tenant의 active `USER` Actor (`hospital_id IS NULL`)를 함께 확인하고, claim을 Session/Consent의 server-owned `patient_ref_id`와 대조한다. 이 synthetic token claim은 실제 환자 신원 검증이나 법적 Consent 증거가 아니다.

## status

```text
ACTIVE
SUSPENDED
INACTIVE
```

```text
CHECK status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')
```

## Registry Ownership Consistency

`hospital_id`가 NULL이 아니면 Actor의 Tenant와 Hospital의 Tenant가 일치해야 한다.

```text
UNIQUE hospitals(tenant_id, hospital_id)
FK actors(tenant_id, hospital_id)
  → hospitals(tenant_id, hospital_id)
ON DELETE RESTRICT
```

`hospital_id = NULL`은 Tenant-level Actor로 허용하며, 기존 단일 FK와 Tenant FK도 유지한다. 이 복합 FK는 인증·인가 또는 Tenant RLS를 대체하지 않는다.

## UNIQUE

```text
UNIQUE (
    tenant_id,
    external_subject
)
```

## Index

```text
INDEX tenant_id
INDEX hospital_id
INDEX status
```

Password 자체를 이 Table에 저장하는 것을 P0 기본모델로 하지 않는다.

---

# 12. patient_refs

## Purpose

MediQ 내부 환자 Reference.

병원 Patient ID와 독립적이다.

## Columns

| Column           | Type        | Constraint       |
| ---------------- | ----------- | ---------------- |
| patient_ref_id   | UUID        | PK               |
| patient_ref_code | VARCHAR(64) | NOT NULL, UNIQUE |
| status           | VARCHAR(20) | NOT NULL         |
| created_at       | TIMESTAMPTZ | NOT NULL         |
| updated_at       | TIMESTAMPTZ | NOT NULL         |

예:

```text
MQ-TEST-0001
```

## status

```text
ACTIVE
INACTIVE
```

## Index

```text
UNIQUE patient_ref_code
INDEX status
```

실제 주민등록번호 등은 저장하지 않는다.

CAPSTONE-P0 애플리케이션에서 생성·조회하는 코드는 `PAT-001-DEC-001`에 따라 `MQ-TEST-` synthetic namespace만 허용한다. 이 prefix는 identity verification 또는 환자 본인 확인을 의미하지 않는다.

---

# 13. patient_mappings

## Purpose

MediQ PatientReference와 Hospital-local Patient ID를 연결한다.

## Columns

| Column           | Type         | Constraint   |
| ---------------- | ------------ | ------------ |
| mapping_id       | UUID         | PK           |
| patient_ref_id   | UUID         | FK, NOT NULL |
| hospital_id      | UUID         | FK, NOT NULL |
| local_patient_id | VARCHAR(128) | NOT NULL     |
| status           | VARCHAR(20)  | NOT NULL     |
| validated_at     | TIMESTAMPTZ  | NULLABLE     |
| created_at       | TIMESTAMPTZ  | NOT NULL     |
| updated_at       | TIMESTAMPTZ  | NOT NULL     |

`validated_at`은 schema상 NULLABLE이다. 그러나 PACS Mandatory Preflight에 후보로 제출되는 mapping은 `status = VALID`와 non-null `validated_at`을 모두 만족해야 하며, 불일치는 Domain/Application validation에서 거부한다. 이 Ticket은 DB migration/CHECK constraint를 추가하지 않는다.

## Status

```text
VALID
UNVERIFIED
AMBIGUOUS
REVOKED
```

## UNIQUE

```text
UNIQUE (
    hospital_id,
    local_patient_id
)
```

그리고:

```text
UNIQUE (
    patient_ref_id,
    hospital_id
)
```

P0에서는 한 MediQ PatientReference가 동일 Hospital에서 여러 Local Patient ID에 자동 연결되지 않도록 한다.

## Index

```text
INDEX patient_ref_id
INDEX hospital_id
INDEX status
```

---

# 14. Patient Mapping DB Rule

PACS Preflight에서 mapping 적격성을 만족하는 최소 조건:

```text
status = VALID
AND validated_at IS NOT NULL
```

Application Invariant:

```text
UNVERIFIED
AMBIGUOUS
REVOKED
VALID with validated_at = NULL
binding mismatch
missing or multiple candidate

→ Mapping eligibility DENY
```

Mapping eligibility `VALID`만으로 PACS_IMPORT 권한을 부여하지 않는다. Consent, Authorization, TransferGrant, destination binding, expiry, integrity/provenance 및 Mandatory Preflight는 별도로 평가해야 한다. 이 mapping 상태 조건은 단순 FK만으로 표현되지 않으므로 Application Service와 Acceptance Test에서도 검증한다. DB-level status/validated_at consistency constraint는 mapping write workflow를 설계할 때 별도 Ticket/decision으로 검토한다.

## P0 Source Mapping Boundary — MEDIQ-PAT-002

- P0 mapping은 `MQ-TEST-*` PatientReference와 `^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$` 형식(최대 128자)의 합성 Hospital Local Patient ID만 사용한다. 실제 환자번호, 이름, 생년월일 등은 허용하지 않는다.
- 이 입력 검증은 DB-003 schema를 변경하지 않는다. `PAT-002-DEC-002`는 합성 P0 내부 reader에 한해 `mediq_runtime`의 기존 승인 8개 컬럼 `SELECT`를 허용한다. Reader는 활성 IAM-002 `USER` membership, same-tenant transaction, exact verified Hospital 일치를 확인한 뒤 같은 `PoolClient`에서 조회하며, mismatch는 query 전에 거부한다. 이 migration은 write 권한 또는 HTTP/API route를 열지 않는다. broader business/API 권한은 별도 Acceptance와 권한 결정 전까지 닫는다.
- Tenant는 `patient_mappings.hospital_id → hospitals.tenant_id` 관계로 도출한다. Client가 보낸 Tenant ID는 사용하지 않는다. RLS의 row visibility는 Actor의 Hospital membership 또는 행위 권한을 뜻하지 않는다.
- P0에서 `VALID`는 합성 테스트 fixture의 상태만 나타낸다. 실제 환자 identity proof, PACS Import 허가 또는 다른 병원에서의 열람 권한으로 해석하지 않는다.

---

# 15. exchange_sessions

## Purpose

MediQ의 핵심 Business Transaction / Workflow Entity.

## Columns

| Column                  | Type         | Constraint   |
| ----------------------- | ------------ | ------------ |
| session_id              | UUID         | PK           |
| patient_ref_id          | UUID         | FK, NOT NULL |
| source_hospital_id      | UUID         | FK, NOT NULL |
| destination_hospital_id | UUID         | FK, NOT NULL |
| requester_actor_id      | UUID         | FK, NOT NULL |
| idempotency_key         | UUID         | NOT NULL     |
| purpose                 | VARCHAR(255) | NOT NULL     |
| state                   | VARCHAR(32)  | NOT NULL     |
| created_at              | TIMESTAMPTZ  | NOT NULL     |
| updated_at              | TIMESTAMPTZ  | NOT NULL     |
| expires_at              | TIMESTAMPTZ  | NULLABLE     |
| completed_at            | TIMESTAMPTZ  | NULLABLE     |

## State

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

## CHECK

```text
source_hospital_id
<>
destination_hospital_id
```

## Idempotency

```text
UNIQUE (requester_actor_id, idempotency_key)
```

The API requires a client-generated UUID `Idempotency-Key`. It is stored only
to make Exchange creation retry-safe and is not an authorization credential.
The key is scoped to the verified requester Actor and is never reused for a
different normalized request. Exact duplicate retries resolve to the original
Session; same-key/different-request attempts conflict. Correlation IDs remain
separate observability metadata.

P0는 Hospital-to-Hospital Exchange를 기본으로 한다.

---

# 16. Exchange Session Indexes

```text
INDEX patient_ref_id

INDEX source_hospital_id

INDEX destination_hospital_id

INDEX requester_actor_id

INDEX state

INDEX created_at
```

주요 Dashboard/작업조회용:

```text
INDEX (
    destination_hospital_id,
    state
)
```

---

# 17. Exchange Session Terminal States

Terminal State:

```text
COMPLETED
REJECTED
EXPIRED
REVOKED
FAILED
CANCELLED
```

Application Invariant:

```text
Terminal Session
→ New Protected Access DENY
```

상태 전환은 DB에서 자유로운 문자열 변경으로 처리하지 않고 Application State Rule을 적용한다.

---

# 18. consents

## Purpose

Exchange에 대한 환자의 동의 Evidence Metadata.

## Columns

| Column                  | Type        | Constraint   |
| ----------------------- | ----------- | ------------ |
| consent_id              | UUID        | PK           |
| exchange_session_id     | UUID        | FK, NOT NULL |
| patient_ref_id          | UUID        | FK, NOT NULL |
| source_hospital_id      | UUID        | FK, NOT NULL |
| destination_hospital_id | UUID        | FK, NOT NULL |
| imaging_package_id      | UUID        | FK, NULLABLE |
| status                  | VARCHAR(20) | NOT NULL     |
| consent_version         | INTEGER     | NOT NULL     |
| issued_at               | TIMESTAMPTZ | NULLABLE     |
| expires_at              | TIMESTAMPTZ | NULLABLE     |
| withdrawn_at            | TIMESTAMPTZ | NULLABLE     |
| created_at              | TIMESTAMPTZ | NOT NULL     |
| updated_at              | TIMESTAMPTZ | NOT NULL     |

---

# 19. Consent Status

```text
PENDING
ACTIVE
WITHDRAWN
EXPIRED
REJECTED
```

## CHECK

```text
consent_version > 0
```

## UNIQUE

```text
UNIQUE (
    exchange_session_id,
    consent_version
)
```

---

# 20. Active Consent Uniqueness

동일 Session에서 동시에 여러 ACTIVE Consent가 존재하는 것을 방지하기 위해 PostgreSQL Partial Unique Index 사용을 권장한다.

```text
UNIQUE (
    exchange_session_id
)
WHERE status = 'ACTIVE'
```

---

# 21. Consent Indexes

```text
INDEX exchange_session_id

INDEX patient_ref_id

INDEX status

INDEX expires_at
```

---

# 22. consent_actions

## Purpose

Consent가 허용하는 Action 목록을 정규화한다.

`consents`에 `VIEW,DOWNLOAD,...` 문자열을 직접 합쳐 저장하지 않는다.

## Columns

| Column            | Type        | Constraint   |
| ----------------- | ----------- | ------------ |
| consent_action_id | UUID        | PK           |
| consent_id        | UUID        | FK, NOT NULL |
| action            | VARCHAR(32) | NOT NULL     |

## action

P0:

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

P1:

```text
MOBILE_EXPORT
```

## UNIQUE

```text
UNIQUE (
    consent_id,
    action
)
```

## Index

```text
INDEX consent_id
```

---

# 23. transfer_grants

## Purpose

Authorization 결과 생성되는 제한된 실행권한 Metadata.

## Columns

| Column                | Type        | Constraint   |
| --------------------- | ----------- | ------------ |
| grant_id              | UUID        | PK           |
| exchange_session_id   | UUID        | FK, NOT NULL |
| consent_id            | UUID        | FK, NOT NULL |
| recipient_tenant_id   | UUID        | FK, NOT NULL |
| recipient_hospital_id | UUID        | FK, NOT NULL |
| recipient_actor_id    | UUID        | FK, NULLABLE |
| idempotency_key       | UUID        | NULLABLE; unique partial Tenant/Actor/key for issue API |
| imaging_package_id    | UUID        | FK, NULLABLE |
| status                | VARCHAR(20) | NOT NULL     |
| issued_at             | TIMESTAMPTZ | NOT NULL     |
| expires_at            | TIMESTAMPTZ | NOT NULL     |
| revoked_at            | TIMESTAMPTZ | NULLABLE     |
| created_at            | TIMESTAMPTZ | NOT NULL     |

---

# 24. Grant Status

```text
ACTIVE
EXPIRED
REVOKED
CONSUMED
```

## CHECK

```text
expires_at > issued_at
```

---

# 25. transfer_grant_scopes

## Purpose

Grant Action Scope를 개별 Row로 관리한다.

## Columns

| Column         | Type        | Constraint   |
| -------------- | ----------- | ------------ |
| grant_scope_id | UUID        | PK           |
| grant_id       | UUID        | FK, NOT NULL |
| scope          | VARCHAR(64) | NOT NULL     |

## P0 Scopes

```text
study:view
study:download
study:pacs-transfer
```

P1:

```text
study:mobile-export
```

## UNIQUE

```text
UNIQUE (
    grant_id,
    scope
)
```

---

# 26. Grant Indexes

`transfer_grants`:

```text
INDEX exchange_session_id

INDEX consent_id

INDEX recipient_tenant_id

INDEX recipient_hospital_id

INDEX status

INDEX expires_at
```

조회 최적화:

```text
INDEX (
    exchange_session_id,
    status
)
```

---

# 27. Grant Application Invariants

다음은 Application-level Rule로 유지한다.

```text
Grant Scope
⊆
Consent Allowed Actions
```

또한:

```text
Grant.exchange_session_id
=
Consent.exchange_session_id
```

그리고:

```text
Grant.recipient_hospital_id
=
ExchangeSession.destination_hospital_id
```

DB Trigger를 P0에서 필수로 만들기보다 Application Layer와 Acceptance Test에서 강제한다.

---

# 28. imaging_packages

## Purpose

ExchangeSession에서 처리하는 Imaging Payload의 논리적 Metadata Container.

실제 DICOM Binary를 저장하지 않는다.

## Columns

| Column               | Type          | Constraint   |
| -------------------- | ------------- | ------------ |
| package_id           | UUID          | PK           |
| exchange_session_id  | UUID          | FK, NOT NULL |
| patient_ref_id       | UUID          | FK, NOT NULL |
| source_hospital_id   | UUID          | FK, NOT NULL |
| state                | VARCHAR(32)   | NOT NULL     |
| storage_ref          | VARCHAR(1024) | NULLABLE     |
| study_count          | INTEGER       | NOT NULL     |
| created_at           | TIMESTAMPTZ   | NOT NULL     |
| updated_at           | TIMESTAMPTZ   | NOT NULL     |
| retention_expires_at | TIMESTAMPTZ   | NULLABLE     |
| deleted_at           | TIMESTAMPTZ   | NULLABLE     |

---

# 29. Imaging Package State

```text
REGISTERED
AVAILABLE
IN_EXCHANGE
SESSION_COMPLETE
RETENTION_PENDING
DELETED
FAILED
```

## CHECK

```text
study_count >= 0
```

---

# 30. Imaging Package Indexes

```text
INDEX exchange_session_id

INDEX patient_ref_id

INDEX source_hospital_id

INDEX state

INDEX retention_expires_at
```

---

# 31. Imaging Package Invariants

Application Layer에서 다음을 검증한다.

```text
Package.patient_ref_id
=
Session.patient_ref_id
```

```text
Package.source_hospital_id
=
Session.source_hospital_id
```

불일치:

```text
→ REJECT / FAIL
```

---

# 32. study_references

## Purpose

ImagingPackage에 포함된 DICOM Study의 Metadata Reference.

## Columns

| Column             | Type         | Constraint   |
| ------------------ | ------------ | ------------ |
| study_ref_id       | UUID         | PK           |
| package_id         | UUID         | FK, NOT NULL |
| source_hospital_id | UUID         | FK, NOT NULL |
| study_instance_uid | VARCHAR(128) | NOT NULL     |
| modality           | VARCHAR(16)  | NULLABLE     |
| series_count       | INTEGER      | NULLABLE     |
| instance_count     | INTEGER      | NULLABLE     |
| created_at         | TIMESTAMPTZ  | NOT NULL     |
| temporary_storage_ref | UUID       | NULLABLE     |
| temporary_payload_state | VARCHAR(32) | NULLABLE   |
| temporary_payload_expires_at | TIMESTAMPTZ | NULLABLE |
| temporary_payload_purged_at | TIMESTAMPTZ | NULLABLE |

실제 Patient Name 등 불필요한 DICOM PHI를 P0 Metadata Table에 복제하지 않는다.

---

# 33. Study Constraints

```text
UNIQUE (
    package_id,
    study_instance_uid
)
```

## CHECK

```text
series_count IS NULL
OR series_count >= 0
```

```text
instance_count IS NULL
OR instance_count >= 0
```

## Index

```text
INDEX package_id

INDEX source_hospital_id

INDEX study_instance_uid

INDEX temporary_payload_state, temporary_payload_expires_at
  WHERE temporary_payload_state IN ('STAGING', 'AVAILABLE', 'PURGE_PENDING')
```

Temporary payload lifecycle checks require the four fields to be all NULL before first staging, all active fields (`storage_ref`, state, expiry) to be present with `purged_at=NULL` in `STAGING/AVAILABLE/PURGE_PENDING`, and all four fields to be present with `purged_at` set in `PURGED`. `temporary_storage_ref` is unique when non-NULL. Runtime updates are limited to these four fields; other StudyReference columns remain read-only.

**DEC-017 completion timing (source wiring implemented; full integration acceptance open):** STAGING expiry is the single source-capture deadline (invocation + 30 minutes). After exact-byte capture, fsync and quota settlement, one trusted completion timestamp establishes the sealed receipt's expiry (completion + 30 minutes). A still-valid exact STAGING row may install that same expiry only in the fresh-authorized AVAILABLE transaction together with source evidence and Audit. `completeStaging` now requires a bounded receipt expiry and updates state/expiry together under the existing CAS; the optional source lifecycle now calls it before evidence/success Audit in one transaction; ordering/failure evidence includes modeled transactions and a limited separate actual PostgreSQL/RLS matrix, not full integration acceptance. No read/replay or already-AVAILABLE update may extend retention. This uses existing four columns/grants, not a migration; staging cannot be revived after expiry. Cancellation or uncertain final commit does not release a handoff and retains exact-ref purge recovery. See DEC-017, `LIFECYCLE-004/005/013` and PACS-001 evidence §§35–40 for component versus actual matrix scope and remaining gates; unit SQL inspection alone is not real DB acceptance.

---

# 34. DICOM UID Treatment

`StudyInstanceUID`는 의료영상 식별에 사용하지만:

```text
StudyInstanceUID
≠
Authorization Credential
```

UID를 알고 있다는 이유만으로 Resource 접근을 허용하지 않는다.

**DEC-017 privacy verification boundary:** The existing approved `study_instance_uid` and Hospital-local PatientMapping identity columns are needed for scoped source lookup and matching; they remain read-only to this capture integration. STAGE-002/011 tests must prove those baseline values remain unchanged and that no new UID/PatientID, per-instance manifest, payload, key or path is copied into temporary lifecycle/quota metadata, Audit, diagnostics or ordinary capture responses. Existing approved identifiers are not a database-wide identifier-free claim. Internal in-memory handoff data is sensitive and is not an access credential or public serialization contract.

---

# 35. integrity_evidence

## Purpose

Source → MediQ → Destination 구간의 무결성 검증 Metadata.

## Columns

| Column                   | Type         | Constraint   |
| ------------------------ | ------------ | ------------ |
| integrity_id             | UUID         | PK           |
| operation_id             | UUID         | FK, NULLABLE |
| exchange_session_id      | UUID         | FK, NOT NULL |
| package_id               | UUID         | FK, NOT NULL |
| study_ref_id             | UUID         | FK, NULLABLE |
| verification_stage       | VARCHAR(32)  | NOT NULL     |
| algorithm                | VARCHAR(32)  | NULLABLE     |
| source_digest            | VARCHAR(256) | NULLABLE     |
| destination_digest       | VARCHAR(256) | NULLABLE     |
| source_object_count      | INTEGER      | NULLABLE     |
| destination_object_count | INTEGER      | NULLABLE     |
| status                   | VARCHAR(20)  | NOT NULL     |
| verified_at              | TIMESTAMPTZ  | NULLABLE     |
| created_at               | TIMESTAMPTZ  | NOT NULL     |

`operation_id` references `pacs_transfer_operations.operation_id` with `ON DELETE RESTRICT`. A partial unique index on `(operation_id, verification_stage)` prevents duplicate stage evidence for a transfer operation while leaving older/non-operation evidence nullable. `SOURCE_CAPTURE` requires an operation, Study, algorithm `SHA256-MANIFEST-V1`, canonical `sha256:<64 lowercase hex>` digest and positive source object count. Its initial status is `PENDING`; destination fields and `verified_at` must be NULL. These constraints record a source manifest only and do not prove authorization or destination equality.

---

# 36. Integrity Status

```text
PENDING
VERIFIED
FAILED
NOT_APPLICABLE
```

## verification_stage

```text
SOURCE_CAPTURE
DESTINATION_VERIFY
END_TO_END
```

---

# 37. Integrity Constraints

```text
source_object_count IS NULL
OR source_object_count >= 0
```

```text
destination_object_count IS NULL
OR destination_object_count >= 0
```

## Index

```text
INDEX exchange_session_id

INDEX package_id

INDEX status
```

Application Invariant:

```text
Integrity = FAILED
→ PACS Transfer must not become COMPLETED
```

The runtime role has no persistent privilege on `integrity_evidence` at this checkpoint. A future authorized capture path must obtain exact column grants only after authorization, mapping, reauthorization and atomic Audit integration are acceptance-tested. The INT-001 persistence sub-gate temporarily grants the exact columns in a disposable DB and restores the pre-run runtime inventory (209) before cleanup.

---

# 38. provenance_records

## Purpose

의료영상 Data Movement Evidence.

질문:

> 어떤 영상이 어디에서 시작해 어떤 Session을 거쳐 어디로 이동했는가?

에 답한다.

## Columns

| Column                  | Type        | Constraint   |
| ----------------------- | ----------- | ------------ |
| provenance_id           | UUID        | PK           |
| exchange_session_id     | UUID        | FK, NOT NULL |
| package_id              | UUID        | FK, NOT NULL |
| study_ref_id            | UUID        | FK, NULLABLE |
| source_hospital_id      | UUID        | FK, NOT NULL |
| destination_hospital_id | UUID        | FK, NULLABLE |
| integrity_id            | UUID        | FK, NULLABLE |
| transfer_type           | VARCHAR(32) | NOT NULL     |
| transfer_status         | VARCHAR(20) | NOT NULL     |
| ingested_at             | TIMESTAMPTZ | NULLABLE     |
| transferred_at          | TIMESTAMPTZ | NULLABLE     |
| created_at              | TIMESTAMPTZ | NOT NULL     |

---

# 39. Provenance Transfer Type

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

P1:

```text
MOBILE_EXPORT
```

---

# 40. Provenance Transfer Status

```text
PENDING
IN_PROGRESS
COMPLETED
FAILED
```

## Index

```text
INDEX exchange_session_id

INDEX package_id

INDEX source_hospital_id

INDEX destination_hospital_id

INDEX transfer_status
```

---

# 41. Provenance Invariants

PACS Import에서는:

```text
source_hospital_id
=
ExchangeSession.source_hospital_id
```

```text
destination_hospital_id
=
ExchangeSession.destination_hospital_id
```

이어야 한다.

또한:

```text
Integrity FAILED
→ Provenance transfer_status != COMPLETED
```

이어야 한다.

---

# 42. audit_events

## Purpose

업무 및 Security Action Evidence.

질문:

> 누가 언제 어떤 Session에서 무엇을 했고 결과가 무엇이었는가?

에 답한다.

## Columns

| Column              | Type        | Constraint   |
| ------------------- | ----------- | ------------ |
| audit_event_id      | UUID        | PK           |
| occurred_at         | TIMESTAMPTZ | NOT NULL     |
| actor_id            | UUID        | FK, NULLABLE |
| tenant_id           | UUID        | FK, NULLABLE |
| exchange_session_id | UUID        | FK, NULLABLE |
| resource_type       | VARCHAR(64) | NULLABLE     |
| resource_id         | UUID        | NULLABLE     |
| action              | VARCHAR(64) | NOT NULL     |
| result              | VARCHAR(20) | NOT NULL     |
| reason_code         | VARCHAR(64) | NULLABLE     |
| correlation_id      | UUID        | NULLABLE     |
| created_at          | TIMESTAMPTZ | NOT NULL     |

---

# 43. Audit Result

```text
SUCCESS
FAILURE
ALLOW
DENY
```

---

# 44. Core Audit Actions

최소:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED
CONSENT_WITHDRAWN

AUTHENTICATION_FAILURE

AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED

GRANT_CREATED
GRANT_REVOKED
GRANT_DENIED

VIEWER_OPENED

DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
DOWNLOAD_FAILED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
PACS_TRANSFER_FAILED

INTEGRITY_VERIFIED
INTEGRITY_FAILURE

ACCESS_DENIED

SESSION_COMPLETED
```

---

# 45. Audit Indexes

Audit는 시간순 조회가 중요하다.

```text
INDEX occurred_at
```

Session 조사:

```text
INDEX (
    exchange_session_id,
    occurred_at
)
```

Actor 조사:

```text
INDEX (
    actor_id,
    occurred_at
)
```

Tenant 조사:

```text
INDEX (
    tenant_id,
    occurred_at
)
```

Correlation:

```text
INDEX correlation_id
```

---

# 46. Audit Data Minimization

다음 데이터는 `audit_events`에 저장하지 않는다.

```text
DICOM Binary

Medical Image

Password

Raw Access Token

Private Key

DEK

KEK

Full Request Body containing sensitive data
```

---

# 47. FK Delete Policy

MediQ에서는 Security / Traceability Evidence 유실을 방지하기 위해 무분별한 `ON DELETE CASCADE`를 사용하지 않는다.

기본:

```text
Core Business Metadata
→ ON DELETE RESTRICT
```

증적 대상:

```text
Audit
Provenance
Integrity
```

은 Parent 삭제로 자동 제거하지 않는다.

P0에서는 Entity Hard Delete보다:

```text
status
deleted_at
revoked_at
```

기반 Lifecycle을 우선한다.

---

# 48. Recommended FK Rules

| Child              | Parent            | Delete   |
| ------------------ | ----------------- | -------- |
| tenants            | organizations     | RESTRICT |
| hospitals          | tenants           | RESTRICT |
| hospital_endpoints | hospitals         | RESTRICT |
| actors             | tenants           | RESTRICT |
| patient_mappings   | patient_refs      | RESTRICT |
| patient_mappings   | hospitals         | RESTRICT |
| exchange_sessions  | patient_refs      | RESTRICT |
| exchange_sessions  | hospitals         | RESTRICT |
| consents           | exchange_sessions | RESTRICT |
| transfer_grants    | exchange_sessions | RESTRICT |
| imaging_packages   | exchange_sessions | RESTRICT |
| study_references   | imaging_packages  | RESTRICT |
| integrity_evidence | exchange_sessions | RESTRICT |
| provenance_records | exchange_sessions | RESTRICT |
| audit_events       | exchange_sessions | RESTRICT |

실제 삭제정책은 향후 Production Retention Policy와 함께 확정한다.

---

# 49. DB-Enforceable Invariants

DB Constraint로 직접 강제한다.

```text
PK uniqueness

FK referential integrity

hospital_id + local_patient_id uniqueness

patient_ref_id + hospital_id uniqueness

session_id uniqueness

consent version uniqueness

Grant Scope uniqueness

Consent Action uniqueness

study UID uniqueness inside package

Status allowed values

expires_at > issued_at

source_hospital != destination_hospital
```

---

# 50. Application-Enforced Invariants

다음은 여러 Table을 동시에 비교해야 하므로 P0에서는 Application Service와 Acceptance Test를 통해 강제한다.

```text
Consent.session
=
Grant.session
```

```text
Grant Scope
⊆
Consent Allowed Actions
```

```text
Package.patient_ref
=
Session.patient_ref
```

```text
Package.source_hospital
=
Session.source_hospital
```

```text
Grant.destination
=
Session.destination
```

```text
PACS target
=
Session.destination
=
Consent.destination
=
Grant.destination
```

```text
PatientMapping.status
=
VALID
before PACS_IMPORT
```

```text
Integrity FAILED
→ Transfer cannot be COMPLETED
```

복잡한 DB Trigger는 P0에서 기본 선택으로 사용하지 않는다.

---

# 51. Why Avoid Excessive Triggers

P0의 목표는 DB 자체에 모든 Domain Logic을 넣는 것이 아니다.

다음 구조를 선호한다.

```text
Database
→ Structural Integrity

Application Domain
→ Business Invariants

Acceptance Tests
→ Behavioral Verification
```

따라서:

```text
FK
UNIQUE
CHECK
INDEX
```

는 DB에서 처리하고,

```text
Consent / Grant 관계
Tenant Authorization
Session State Transition
PACS Import Preconditions
```

은 Application Layer가 처리한다.

---

# 52. Status Constraint Strategy

Status Column을 자유문자열로 사용하지 않는다.

PostgreSQL에서는 두 방식을 사용할 수 있다.

Option A:

```text
CHECK Constraint
```

Option B:

```text
PostgreSQL ENUM
```

P0 권장:

> **VARCHAR + CHECK Constraint**

Registry status의 승인 허용값은 `organizations.status = ACTIVE/INACTIVE`, `tenants.status = ACTIVE/SUSPENDED/INACTIVE`, `hospitals.status = ACTIVE/SUSPENDED/INACTIVE`, `actors.status = ACTIVE/SUSPENDED/INACTIVE`다. `organization_type`은 확장 코드이므로 고정 CHECK를 두지 않는다.

이유:

```text
Migration 단순화
Status 변경 용이
테스트 용이
DB Vendor 결합 감소
```

---

# 53. Required Unique Constraints

최소 다음 Unique Constraint를 반드시 적용한다.

```text
organizations.organization_code

tenants.tenant_code

tenants(tenant_id, organization_id) — composite FK reference key

hospitals.hospital_code

hospitals(tenant_id, hospital_id) — composite FK reference key

actors(tenant_id, external_subject)

patient_refs.patient_ref_code

patient_mappings(hospital_id, local_patient_id)

patient_mappings(patient_ref_id, hospital_id)

hospital_endpoints(hospital_id, endpoint_type)

consents(exchange_session_id, consent_version)

consent_actions(consent_id, action)

transfer_grant_scopes(grant_id, scope)

study_references(package_id, study_instance_uid)
```

---

# 54. Required High-Value Indexes

P0 성능을 위해 모든 Column에 Index를 만드는 것은 피한다.

핵심 Query 기준으로 다음을 우선한다.

## Exchange

```text
exchange_sessions(patient_ref_id)

exchange_sessions(destination_hospital_id, state)

exchange_sessions(created_at)
```

## Patient Mapping

```text
patient_mappings(patient_ref_id)

patient_mappings(hospital_id, local_patient_id)
```

## Consent

```text
consents(exchange_session_id, status)
```

## Grant

```text
transfer_grants(exchange_session_id, status)

transfer_grants(recipient_tenant_id, status)

transfer_grants(expires_at)
```

## Imaging

```text
imaging_packages(exchange_session_id)

study_references(study_instance_uid)
```

## Audit

```text
audit_events(exchange_session_id, occurred_at)

audit_events(tenant_id, occurred_at)
```

## Provenance

```text
provenance_records(exchange_session_id)
```

---

# 55. P0 Access Query Model

## Viewer

필요한 핵심 Metadata:

```text
actor
tenant
exchange_session
consent
grant
grant_scope = study:view
imaging_package
study_reference
```

---

## Download

```text
actor
tenant
exchange_session
consent
grant
grant_scope = study:download
imaging_package
study_reference
```

---

## PACS Import

```text
actor
tenant
exchange_session
consent
grant
grant_scope = study:pacs-transfer

destination_hospital

patient_mapping
status = VALID

imaging_package

study_reference

hospital_endpoint
endpoint_type = STOW_RS
```

---

# 56. PACS Import Data Integrity Query

전송 성공 판정 시 최소 다음 Context가 연결되어야 한다.

```text
exchange_session

imaging_package

study_reference

destination_hospital

integrity_evidence

provenance_record

audit_event
```

---

# 57. Sensitive Data Policy

현재 DB에 저장하지 않는 데이터:

```text
실제 주민등록번호

실환자 개인정보

실제 진료기록

Raw DICOM Binary

Password 원문

Access Token 원문

Private Key

DEK

KEK
```

P0는 Synthetic/Test Data만 사용한다.

---

# 58. Temporary Payload Reference

실제 Imaging Payload는 DB에 저장하지 않고:

```text
imaging_packages.storage_ref
```

등을 통해 Temporary Storage 위치를 참조할 수 있다.

`storage_ref`는:

```text
파일시스템 경로 원문을 외부 사용자에게 노출하는 Public URL
```

로 사용해서는 안 된다.

Application 내부 Reference로 취급한다.

P0 `PACS-001-DEC-008`은 per-Study 전송 operation 및 재시도 수명주기와의 경계 충돌을 해결하기 위해 Temporary Payload metadata를 `study_references`에 둔다. `imaging_packages`는 여러 Study를 포함할 수 있으므로 package 단일 `storage_ref/deleted_at`을 한 Study operation의 임시 파일 수명주기에 사용하지 않는다.

| Logical metadata | Existing source of truth | Constraint |
|---|---|---|
| opaque per-operation object-set reference | `study_references.temporary_storage_ref` | server-generated UUID; never a path, URL or bearer capability |
| payload lifecycle | `study_references.temporary_payload_state` | `STAGING`, `AVAILABLE`, `PURGE_PENDING`, `PURGED`; null means never staged |
| expiry | `study_references.temporary_payload_expires_at` | reads deny at expiry even if physical cleanup is delayed |
| confirmed payload purge time | `study_references.temporary_payload_purged_at` | set only after ciphertext/key capability is confirmed inaccessible |
| Tenant / Session / Patient / Package / Study / operation | verified Tenant RLS + operation/Session/Package/StudyReference joins | never accepted from a caller as authority; operation is one Session/Study |
| purpose | persisted PACS transfer operation action plus authenticated package metadata | fixed to `PACS_IMPORT`; not a new DB column in this decision |

One `StudyReference` is unique within its `ImagingPackage`; one PACS transfer operation is unique per `(exchange_session_id, study_ref_id)`. This gives each operation an independent temporary payload pointer. A purge never changes `imaging_packages.state`, `storage_ref`, `retention_expires_at` or `deleted_at`, and therefore cannot invalidate a sibling Study's payload or grants. A PURGED row may be reused for a later pre-`STOW_STARTED` re-fetch only after a new random storage ref is reserved; prior purge evidence remains in Audit. Same-operation concurrent reservation and any re-fetch after `STOW_STARTED` fail closed.

AES-GCM AAD binds the storage security context; expected object length and source digest are rechecked against trusted source-capture evidence after complete tag authentication and before any bytes are returned. AES-GCM nonce/tag may exist only in the private temporary-storage boundary; P0 DEKs are volatile process memory only. Raw DEK/KEK and DICOM payload are not persisted in PostgreSQL or files. This schema change is limited to four metadata columns on the existing StudyReference table; it does not add a product table or public API.

---

# 59. Data Lifecycle

Control Metadata:

```text
CREATE
→ ACTIVE
→ TERMINAL STATUS
→ Retain for Test Evidence
```

Temporary Imaging Payload:

```text
INGEST
→ AVAILABLE
→ IN_EXCHANGE
→ SESSION_COMPLETE
→ RETENTION_PENDING
→ DELETED
```

구체 Retention 기간은 현재 문서에서 숫자로 확정하지 않는다.

---

# 60. Soft Delete Principle

다음과 같은 핵심 Entity는 P0에서 Hard Delete보다 상태변경을 우선한다.

```text
PatientReference
PatientMapping
ExchangeSession
Consent
TransferGrant
ImagingPackage
```

예:

```text
Grant
→ REVOKED

Consent
→ WITHDRAWN

ImagingPackage
→ DELETED
```

이는 Audit/Provenance와의 Referential Trace를 유지하기 위함이다.

---

# 61. Transaction Boundaries

P0에서 권장하는 주요 Transaction Boundary:

## Exchange Creation

```text
ExchangeSession INSERT
+
Audit SESSION_CREATED
```

---

## Consent Approval

```text
Consent UPDATE → ACTIVE
+
Session → CONSENTED
+
Audit CONSENT_APPROVED
```

## Consent Withdrawal

```text
Consent UPDATE → WITHDRAWN
+ withdrawn_at / updated_at
+ Audit CONSENT_WITHDRAWN
```

The transaction uses the same Session advisory lock as request/approval, changes no ExchangeSession or TransferGrant row, and does not delete/retract data already delivered outside MediQ. Grant issuance must re-read Consent under the same lock before it can create a Grant.

---

## Grant Issuance

```text
Authorization ALLOW
+
TransferGrant INSERT
+
Grant Scope INSERT
+
Audit GRANT_CREATED
```

---

## PACS Completion

논리적으로 다음 결과의 일관성이 중요하다.

```text
STOW-RS Success
+
Destination Verify
+
Integrity VERIFIED
+
Provenance COMPLETED
+
Audit PACS_TRANSFER_COMPLETED
+
Session Completion
```

외부 STOW-RS 자체는 DB Transaction에 포함할 수 없으므로 분산 Transaction을 시도하지 않는다.

대신 명시적 상태 전이를 사용한다.

---

# 62. External Operation State Pattern

PACS Transfer는:

```text
DB BEGIN
→ Transfer Status = IN_PROGRESS
→ COMMIT

External STOW-RS

→ Verify Result

DB BEGIN
→ Integrity
→ Provenance
→ Audit
→ Transfer Status
→ COMMIT
```

형태를 사용할 수 있다.

P0에서 XA/2PC 등 복잡한 Distributed Transaction은 요구하지 않는다.

---

# 63. Concurrency Principles

P0에서도 다음 중복 처리를 방지해야 한다.

```text
Duplicate Consent Action

Duplicate Grant Scope

Duplicate Patient Mapping

Duplicate Study inside same Package
```

이는 Unique Constraint로 보호한다.

`PACS-007-DEC-001`에 따른 durable operation ledger는 아래의 `MEDIQ-PACS-007` amendment로 추가되었다. 그 ledger만으로 Authorization 또는 STOW 허가가 생기지는 않는다.

---

# 64. Referential Example

예시:

```text
PatientReference
MQ-TEST-0001
       │
       ├── Mapping
       │   Hospital A / TEST-A-001
       │
       └── Mapping
           Hospital B / TEST-B-982
       │
       ▼
ExchangeSession
SESSION-001
       │
       ├── Consent
       │    └── VIEW
       │    └── PACS_IMPORT
       │
       ├── TransferGrant
       │    └── study:pacs-transfer
       │
       ├── ImagingPackage
       │    └── StudyReference
       │
       ├── IntegrityEvidence
       │
       ├── ProvenanceRecord
       │
       └── AuditEvents
```

---

# 65. P0 Table Responsibility Matrix

| Table                 | Control |   Payload | Security | Evidence |
| --------------------- | ------: | --------: | -------: | -------: |
| organizations         |       ✓ |           |          |          |
| tenants               |       ✓ |           |        ✓ |          |
| hospitals             |       ✓ |           |        ✓ |          |
| hospital_endpoints    |       ✓ |           |        ✓ |          |
| actors                |       ✓ |           |        ✓ |          |
| patient_refs          |       ✓ |           |          |          |
| patient_mappings      |       ✓ |           |        ✓ |          |
| exchange_sessions     |       ✓ |           |        ✓ |          |
| consents              |       ✓ |           |        ✓ |        ✓ |
| consent_actions       |       ✓ |           |        ✓ |          |
| transfer_grants       |       ✓ |           |        ✓ |        ✓ |
| transfer_grant_scopes |       ✓ |           |        ✓ |          |
| imaging_packages      |       ✓ | Reference |          |          |
| study_references      |       ✓ | Reference |          |          |
| integrity_evidence    |         |           |        ✓ |        ✓ |
| provenance_records    |         |           |          |        ✓ |
| audit_events          |         |           |        ✓ |        ✓ |

---

# 66. Tables Explicitly Not Required for P0

현재 별도 Table로 만들지 않는다.

```text
billing

subscriptions

real_patient_identity

national_patient_identifier

medical_records

clinical_reports

diagnosis

FHIR resources

AI inference

blockchain

DID

HSM keys

PQC keys
```

---

# 67. P1 Extension Tables

Mobile Secure Vault 구현 시 별도 확장할 수 있다.

```text
devices

secure_medical_capsules

wrapped_keys

mobile_exports
```

현재 P0 Migration에 만들 필요는 없다.

---

# 68. Productionization Extensions

향후 다음이 추가될 수 있다.

```text
identity_providers

hospital_connectors

retention_policies

key_references

legal_consent_evidence

deployment_regions

production_endpoints
```

P0 Data Model에 미리 과도하게 넣지 않는다.

---

# 69. Data Model Gate

다음이 정의되어야 P0 Data Model을 완료로 판단한다.

```text
GATE-DATA-01
Organization / Tenant

GATE-DATA-02
Hospital / Endpoint

GATE-DATA-03
Actor

GATE-DATA-04
PatientReference

GATE-DATA-05
PatientMapping

GATE-DATA-06
ExchangeSession

GATE-DATA-07
Consent

GATE-DATA-08
Consent Action

GATE-DATA-09
TransferGrant

GATE-DATA-10
Grant Scope

GATE-DATA-11
ImagingPackage

GATE-DATA-12
StudyReference

GATE-DATA-13
IntegrityEvidence

GATE-DATA-14
Provenance

GATE-DATA-15
Audit

GATE-DATA-16
PK / FK

GATE-DATA-17
UNIQUE

GATE-DATA-18
INDEX

GATE-DATA-19
STATUS CONSTRAINT

GATE-DATA-20
P0/P1 Separation
```

---

# 70. Data Model Decision

```text
PROJECT:
MediQ

DATA MODEL VERSION:
v1.1 Viewer Architecture Amendment

DATABASE:
PostgreSQL

PRIMARY KEY:
UUID

CONTROL METADATA:
RELATIONAL DATABASE

DICOM BINARY:
NOT STORED AS RELATIONAL BLOB

PATIENT MODEL:
PatientReference + PatientMapping

WORKFLOW ROOT:
ExchangeSession

CONSENT:
Independent Entity

AUTHORIZATION AUTHORITY:
TransferGrant + Scope

IMAGING METADATA:
ImagingPackage + StudyReference

INTEGRITY:
IntegrityEvidence

DATA MOVEMENT EVIDENCE:
ProvenanceRecord

ACTIVITY EVIDENCE:
AuditEvent

STATUS MODEL:
VARCHAR + CHECK CONSTRAINT

DELETE POLICY:
RESTRICT / STATUS-BASED LIFECYCLE

SECURITY EVIDENCE CASCADE DELETE:
NOT ALLOWED BY DEFAULT

P1 MOBILE TABLES:
DEFERRED

PRODUCTION TABLES:
DEFERRED

DATA MODEL STATUS:
APPROVED BASELINE
```

---

# 71. Data Model Review

```text
Control Metadata:
PASS

DICOM Binary Separation:
PASS

PK Strategy:
PASS

FK Strategy:
PASS

Patient Reference:
PASS

Patient Mapping:
PASS

Exchange Session:
PASS

Consent:
PASS

Consent Action:
PASS

Transfer Grant:
PASS

Grant Scope:
PASS

Imaging Package:
PASS

Study Reference:
PASS

Integrity:
PASS

Provenance:
PASS

Audit:
PASS

Unique Constraints:
PASS

Status Constraints:
PASS

Indexes:
PASS

Delete Policy:
PASS

P0/P1 Separation:
PASS

Productionization Separation:
PASS

DATA MODEL READY:
YES
```

---

# 72. Next Document

다음 단계는:

```text
ERD.md
```

이다.

`ERD.md`에서는 본 Data Model을 새로운 Entity를 추가하지 않고 관계도로 변환한다.

핵심 관계:

```text
Organization
1 ─── N
Tenant

Tenant
1 ─── N
Hospital

Hospital
1 ─── N
HospitalEndpoint

Tenant
1 ─── N
Actor

PatientReference
1 ─── N
PatientMapping

Hospital
1 ─── N
PatientMapping

PatientReference
1 ─── N
ExchangeSession

ExchangeSession
1 ─── N
Consent

Consent
1 ─── N
ConsentAction

ExchangeSession
1 ─── N
TransferGrant

TransferGrant
1 ─── N
TransferGrantScope

ExchangeSession
1 ─── N
ImagingPackage

ImagingPackage
1 ─── N
StudyReference

ImagingPackage
1 ─── N
IntegrityEvidence

ExchangeSession
1 ─── N
ProvenanceRecord

ExchangeSession
1 ─── N
AuditEvent
```

그 다음:

```text
ERD.md
   ↓
OPENAPI.yaml
   ↓
THREAT-MODEL.md
   ↓
ACCEPTANCE-TESTS.md
```

순서로 진행한다.

---

# FINAL DATA MODEL POLICY

> **MediQ PostgreSQL은 의료영상 Binary 저장소가 아니라 Patient Mapping, Exchange Session, Consent, Grant, Imaging Reference, Provenance, Integrity, Audit 등 의료영상 Exchange를 통제하고 증명하기 위한 Metadata Store다.**

> **병원 Local Patient ID와 MediQ PatientReference를 분리하고, Consent와 TransferGrant를 별도 Entity로 유지하며, Grant Scope는 독립적으로 관리한다.**

> **DB는 PK·FK·UNIQUE·CHECK를 통해 구조적 무결성을 보장하고, Consent/Grant 범위·Tenant Authorization·Patient Mapping 검증·Session State Transition 등 복수 Entity에 걸친 Business Invariant는 Application Layer와 Acceptance Test에서 강제한다.**

## P0 Object Authorization Interpretation — `AUT-003-DEC-001`

DB-005가 `transfer_grants.imaging_package_id`를 nullable로 정의하더라도 P0 object-level access에서는 null을 Session 전체 허용으로 확대 해석하지 않는다. Grant에는 정확한 Package binding을 요구한다. Consent package가 null인 것은 Session-level consent로 해석하되, Grant가 별도로 특정한 Package에 한해서만 허용한다.

GRT-003 issue API는 P0에서 `recipient_actor_id`와 `imaging_package_id`를 실제 값으로 저장하고 Actor-scoped `idempotency_key`를 함께 기록한다. 기존 내부/레거시 Grant 행의 `idempotency_key`는 NULL로 남을 수 있다. 멱등성 키는 재시도 식별용일 뿐 접근 권한이나 Grant 조회용 bearer 값이 아니다.

`recipient_actor_id`가 null인 TransferGrant는 `recipient_tenant_id`와 `recipient_hospital_id`가 지정한 Hospital-wide grant로 해석하되, 매 요청에서 IAM-002의 active Actor/Tenant/Hospital membership 및 정확한 Hospital 일치를 확인해야 한다. Actor ID가 있으면 그 Actor로 더 좁힌다. P0에는 workforce role/capability가 아직 없어 이 의미는 synthetic/test workflow에 한정한다.

Authorization Context가 `SERIES` 또는 `INSTANCE`를 가리키는 경우 Storage/PACS resolver가 해당 내부 resource ID의 parent Study와 Package 관계를 동일 Exchange/Patient/Source 범위로 증명해야 한다. 현재 `study_references` schema 밖의 관계가 확인되지 않으면 거부하며 DICOM UID 자체를 권한 식별자로 사용하지 않는다.

Registry의 Hospital→Tenant/Organization 및 Actor→Tenant/Hospital owner-pair 일치는 이 원칙의 구조적 무결성 항목으로 복합 FK가 강제한다. 접근권한과 보호 Resource의 Tenant Authorization은 계속 Application Layer에서 별도로 검증한다.

> **Audit, Provenance, Integrity와 같은 Security Evidence는 일반 Business Entity의 삭제로 자동 Cascade 삭제되지 않아야 한다.**

---

# Viewer Persistence Amendment — 2026-09-15

현재 승인된 P0 baseline은 PACS-007 amendment를 포함한 18개 persistent table이다. Viewer 개정만으로 새 영구 Table을 추가하지 않는다.

## P0 Persistence Mapping

- ViewerSession은 우선 기존 `exchange_sessions`, `transfer_grants`, `audit_events`와 단기 runtime/session store 조합으로 구현한다.
- ViewerSession의 Actor, Tenant, PatientReference, Source Hospital, Study, Grant 및 expiry binding은 Application Layer에서 강제한다.
- Viewer open, retrieval, deny, expiry, close는 기존 Audit 구조에 event로 기록한다.
- 임시 DICOM Payload는 PostgreSQL에 저장하지 않는다.
- Temporary Cache가 필요하면 object metadata의 opaque storage reference, operation-scoped state, expiry와 purge timestamp만 관리하고 영상 Binary는 TTL 기반 암호화 임시 저장소에 둔다. `PACS-001-DEC-008`은 payload lifecycle metadata를 기존 `StudyReference` 행에 둔다. `PACS-001-DEC-010`은 새 운영 제어 테이블 3개에 비식별 예약량 집계/opaque reservation만 저장하며 영상 Binary·DICOM UID·raw key는 DB에 두지 않는다.
- Current implementation status (2026-10-03): DEC-008/009 metadata/purge and DEC-010/011 quota/fault gates have scoped PASS, including final scratch clean/repeat/reset/reapply/cleanup. Schema baseline remains 21 tables/26 migrations/catalog `21|55|17|48`, 20 forced-RLS tables and 244 runtime column grants. DEC-014/015 streaming/consumer work changes no schema/grant. Tenant SERVICE cleanup and runtime registration remain gated; see PACS-001 evidence §26.

## Schema Change Gate

별도의 `viewer_sessions` 또는 payload table은 다음 조건을 모두 만족할 때만 후속 Migration으로 제안한다. Quota Control metadata는 DICOM payload entity가 아니며, 전역 합계와 Tenant-scoped reservation identity를 기존 per-Study lifecycle columns만으로 원자적·최소권한으로 표현할 수 없어 `PACS-001-DEC-010` Schema Change Gate를 통과한다. 이 amendment는 기존 `study_references` lifecycle columns를 대체하거나 넓히지 않는다.

1. 기존 schema와 runtime session store로 shared cross-process reservation Acceptance를 충족할 수 없다.
2. 전역 원자 quota 및 Study/Package/Tenant-scoped release binding을 DB constraint와 좁은 함수 경계로 강제할 명확한 필요가 있다.
3. `DATA-MODEL.md`, `ERD.md`, Migration/Drizzle schema, Security/Threat, Acceptance 및 implementation evidence가 함께 갱신된다.

### P0 Temporary Payload Quota Control — PACS-001-DEC-010

The three operational tables below are quota-control metadata, not medical-image entities. Their runtime-readable/writable surface is only the fixed quota-function API; `mediq_runtime` receives no direct table privilege. The non-login quota owner receives the minimum parent-column reads needed to check StudyReference, including the confirmed purge timestamp.

| Table | Purpose | Minimum fields | Access boundary |
|---|---|---|---|
| `temporary_payload_quota_state` | One row per database/environment, holding the fixed 10 GiB cap and current reserved byte total | singleton key, `max_reserved_bytes`, `reserved_bytes`, update timestamp | Owned by `mediq_quota_owner`; no direct runtime access; only fixed definer functions update it |
| `temporary_payload_package_quotas` | Shared 2 GiB aggregate by ImagingPackage across source/recipient Tenant contexts | `package_id`, `reserved_bytes`, update timestamp | RLS follows the existing Tenant-visible ImagingPackage; aggregate metadata only; direct runtime access denied |
| `temporary_payload_reservations` | One active reservation per opaque storage ref, with writer ownership and package aggregate accounting | `tenant_id`, `storage_ref`, `study_ref_id`, `package_id`, random `writer_id`, `reserved_bytes`, timestamps | Forced RLS by transaction Tenant context; direct runtime access denied; quota owner functions enforce exact StudyReference/ref/state/expiry binding |

Reservation uses 16 MiB blocks before ciphertext writes. Function-level row locking serializes the singleton environment counter and enforces 10 GiB environment capacity; the package aggregate row enforces the shared 2 GiB cap even when source and recipient Tenants have separate reservation rows. Sealing settles the reservation to exact actual bytes; physical purge release deletes the reservation and decrements both aggregates in the same verified Tenant transaction as `PURGED` and success Audit. A process restart cannot resume writes with the old `writer_id`; it can only enter the already-approved purge-only recovery path.

P1 Mobile Vault의 DICOM Binary는 모바일 기기의 암호화 Local Storage에 위치하며 MediQ PostgreSQL의 장기 Payload Entity가 아니다.

**공통 기준:** Hospital PACS가 Source of Record이며 MediQ Cloud와 PostgreSQL은 Permanent PACS 또는 장기 영상 Archive 역할을 하지 않는다. Patient Mobile Viewer는 P1 Mobile Vault의 Local Copy를 사용한다.

---

# P1 Mobile Security Logical Data Amendment — 2026-09-15

P0 PostgreSQL 21-table baseline과 현재 Migration은 변경하지 않는다. P1 구현 Ticket에서 Schema Change Gate를 통과할 때 다음 최소 Metadata를 정규화한다.

## devices 후보 필드

```text
id
patient_reference_id
platform
key_security_level
attestation_status
attestation_verified_at
status
registered_at
revoked_at
```

`key_security_level`은 `STRONGBOX | TRUSTED_ENVIRONMENT | SOFTWARE | UNKNOWN`, `status`는 `PENDING | ACTIVE | REVOKED | LOST | RETIRED`로 제한한다. Attestation 원문이나 Device Private Key를 저장하지 않고 검증 결과와 최소 증적만 보존한다.

## secure_medical_capsules 후보 필드

```text
id
patient_reference_id
source_hospital_id
study_reference_id
mobile_export_grant_id
device_id
crypto_suite_version
payload_algorithm
issued_at
last_policy_verified_at
offline_expires_at
status
```

## wrapped_keys 후보 필드

```text
id
capsule_id
wrap_slot
wrap_suite
key_reference
wrapped_dek
created_at
retired_at
```

`wrapped_dek`는 Device-bound Key로 보호된 DEK만 허용한다. KEK, Device Private Key, 평문 DEK 또는 DICOM Binary를 PostgreSQL에 저장하지 않는다. 복수 Wrap Slot은 Key Rotation과 PQC/Hybrid 전환을 위한 것이며 독립적인 접근권한이 아니다.

## mobile_exports 후보 필드

```text
id
exchange_session_id
grant_id
device_id
capsule_id
issued_at
offline_expires_at
reissue_of
outcome
```

30일 Lease, Device Revoke, Reissue 및 Crypto-shredding 상태는 Audit Event와 연결한다. 실제 Table/Column, Index, Constraint 및 Migration은 `MEDIQ-MOB-*` 구현 Ticket에서 Domain/OpenAPI/Acceptance Test와 함께 승인한다.

---

# Synthetic Health Data Preview Data Amendment — 2026-09-26

Preview는 현재 PostgreSQL Schema를 변경하지 않는다.

```text
Storage:
App Asset or Test-only Backend Fixture

Persistence:
Session-scoped / Resettable

Identity:
TEST-* only

Provider:
MOCK only

New Production Table:
NONE
```

Fixture Envelope는 `schemaVersion`, `scenarioId`, `sourceMode=SYNTHETIC`, `providerMode=MOCK`, `TEST-* patientReference`, `fixtureVersion` 또는 동등한 버전 정보, 생성시각과 비진단 고지를 포함한다.

금지 데이터:

- 실제 주민등록번호·환자번호·검진결과·진료이력
- 실제 의료기관 OID·Credential·Token·인증서
- 실제 건강정보 고속도로 응답 또는 운영 Payload
- Synthetic Marker가 없는 FHIR/JSON Resource

향후 실제 연계가 승인되면 Health Data Connection, Consent, Provenance, Retention, Encryption, Tenant/Patient Binding을 포함하는 별도 Data Model과 Migration Gate를 거쳐야 한다. 현재 Amendment는 해당 Table을 사전 승인하지 않는다.

# Hospital Clinical Workflow P1 Data Amendment — 2026-09-27

현재 승인하는 것은 논리 데이터 계약이며 실제 Table/Column/Migration은 아니다.

| Candidate Table / Projection | 목적 | 핵심 Binding | Payload Policy |
|---|---|---|---|
| `comparison_viewer_sessions` | 복수 승인 Study Viewer Session | actor/tenant/hospital/purpose/study set/expiry | Pixel 저장 금지 |
| `clinical_handoff_packets` | 인계 목적·상태·버전 | tenant/patient/exchange | Reference only |
| `handoff_resource_refs` | Resource별 Scope·Expiry | packet/resource/scope/provenance | 문서/Payload 저장 금지 |
| `work_assignments` | 담당자·Queue·기한·상태 | hospital/packet/assignee/version | 구조화 사유 우선 |
| `hospital_notifications` | 최소정보 Inbox Projection | actor 또는 role queue/tenant/hospital/event version | PHI Preview 금지 |
| `authorized_prior_study_projection` | 권한 범위 과거 Study 후보 | request actor/patient/source/study | 요청 시 생성, 비영속 우선 |
| `explainable_timeline_projection` | 역할별 원장 표시 | exchange/audit/provenance/integrity | 원장 복제·수정 금지 |

Data invariants:

- 모든 영속 후보는 `tenant_id`와 필요한 `hospital_id`를 가지며 Server Query에서 누락 시 Fail Closed한다.
- `work_assignments`의 assignee는 같은 Hospital의 활성 Workforce Identity 또는 허용 Role Queue만 참조한다.
- Notification과 Timeline Projection은 Source Event ID/Version을 보존하고 중복·역순 Event를 정규화한다.
- Report/Referral Payload Column과 DICOM Binary Column을 이 P1 Amendment로 추가하지 않는다.
- 자유서술 Note Column은 별도 Retention/Redaction ADR 전 추가하지 않는다.
- 삭제가 Audit/Provenance Evidence를 Cascade 삭제하지 않도록 한다.

실제 Schema는 `MEDIQ-HCW-*` 구현 Ticket에서 Domain, ERD, OpenAPI, Migration과 Acceptance를 함께 승인한다.

---

# P0 Database Access and Tenant RLS Amendment — 2026-09-30

## Runtime privilege model

The application runtime role is not a table/schema owner and receives no business-table access by default. Each approved implementation Ticket grants only the exact column/table operations it needs; broad `PUBLIC` and default grants are prohibited. Runtime DDL, ownership changes, `TRUNCATE`, and migration-ledger access remain denied.

## Tenant RLS model

Tenant-owned or Tenant-participating rows are protected with PostgreSQL RLS (`ENABLE` + `FORCE`). A row with direct `tenant_id` uses that value. Related rows without the column derive participation only through their approved owner relationship: Hospital for registry/mapping rows, or ExchangeSession for Consent, Grant, Imaging, Integrity, Provenance, and Audit-linked data. An A↔B session may be visible to its two participating Tenants for workflow continuity; the row-visibility exception does not grant an action. Tenant C remains excluded.

Tenant context is server-derived from verified identity and set transaction-locally by a backend transaction wrapper. Missing or invalid context is fail-closed, and context must not survive commit/rollback or connection-pool reuse. The context is not trusted from client input. RLS is defense-in-depth, not business Authorization or protection against arbitrary SQL under the same runtime login; see `DB-009-DEC-001` and `SEC-DB-006`.

For P0 Actor resolution, a request Tenant value is only an untrusted membership-selection candidate. Within a transaction-local RLS scope, the backend must match the exact configured OIDC issuer and verified `external_subject` to an `ACTIVE` Actor in the candidate Tenant, and require the Tenant and optional owning Hospital to be `ACTIVE`. Only the Registry match may populate the immutable Actor/Tenant/Hospital context; the candidate alone never authorizes work. `actors.external_subject` is scoped to one configured P0 issuer; multi-issuer identity requires a separately reviewed issuer+subject model.

## Global synthetic PatientReference exception

`patient_refs` remains a globally shared canonical namespace because a single MediQ reference may link hospital-local mappings across Tenant boundaries. In CAPSTONE-P0 it stores only `MQ-TEST-*` synthetic codes; a database CHECK and the domain validator must enforce the same grammar. Its limited runtime access is approved-column `SELECT` and `INSERT` only, without update/delete/truncate or a public route. It is intentionally not Tenant-RLS protected. This does not authorize real patient identity, demographics, unrestricted lookup, or production use. Before any such expansion, revise Domain/Data/ERD, identity and privacy controls, and Acceptance as a separately approved scope decision.

## Ticket gate

`MEDIQ-DB-009` implements the P0 explicit `patient_refs` column grant, synthetic-code CHECK and 16 Tenant policies; its database privilege/RLS Acceptance and PAT-001 synthetic runtime integration passed on disposable PostgreSQL. `IAM-002-DEC-001` separately authorizes only the Actor/Tenant/Hospital resolver columns needed for authenticated membership lookup. `PAT-002-DEC-002` adds one narrow exception: eight `patient_mappings` columns are readable only by an internal path with verified active USER membership and exact Hospital match; it does not enable mapping writes or a route. Other Tenant-scoped business routes and image operations remain prohibited until object/action Authorization and their individual grants/Acceptance pass. Acceptance is tracked in `ACCEPTANCE-TESTS.md` as `TC-DB-009-*`, `TC-IAM-002-*` and `TC-PAT-002-*`.

---

# P0 Durable PACS Transfer Operation Amendment — 2026-10-01

`PACS-007-DEC-001` and `MEDIQ-PACS-007` add `pacs_transfer_operations` as the 18th approved P0 product table. It stores only durable operation/control metadata; it is not a transfer permission or DICOM payload store.

| Column | Type / nullability | Purpose |
|---|---|---|
| `operation_id` | UUID, PK | Internal operation identifier |
| `tenant_id` | UUID, FK → `tenants` | Owning Tenant and RLS key |
| `exchange_session_id` | UUID, FK → `exchange_sessions` | Exchange boundary |
| `study_ref_id` | UUID, FK → `study_references` | Single Study boundary |
| `actor_id` | UUID, FK → `actors` | Verified initiator reference |
| `idempotency_key` | UUID | Actor/Tenant-scoped request key |
| `request_digest` | VARCHAR(64) | Canonical semantic fingerprint; raw Consent/Grant/action request is not stored here |
| `state` | VARCHAR(32) | Durable transfer operation state |
| `version` | INTEGER, default 0 | Optimistic CAS version |
| `reason_code` | VARCHAR(64), nullable | Minimized state reason |
| `source_object_count` | INTEGER, nullable | Source count metadata |
| `destination_object_count` | INTEGER, nullable | Destination verification count metadata |
| `created_at`, `updated_at` | timestamptz | State lifecycle timestamps |
| `stow_started_at` | timestamptz, nullable | Dispatch claim timestamp; no STOW is enabled by this table |

Unique keys are `(exchange_session_id, study_ref_id)` and `(tenant_id, actor_id, idempotency_key)`. The table also checks state/version/digest/count/timestamp consistency and completed-count consistency. A trigger enforces initial `CREATED/version=0`, immutable operation binding, one-step version increments and the approved transition graph; direct SQL cannot skip the `PREFLIGHT_PASSED` state before `STOW_STARTED`. This transition-order check does not prove the underlying Mandatory Preflight facts were actually validated; only a future trusted coordinator may advance after checking them.

The runtime role receives only 15 `SELECT`, 15 `INSERT`, and 7 `UPDATE` column privileges for this table, with no `DELETE`, table-wide, `PUBLIC`, default, DDL or `TRUNCATE` access. RLS is enabled and forced. A Tenant row is visible only under transaction-local matching Tenant context and valid Actor/Session owner bindings. At the PACS-007 checkpoint the full inventory was 183 column privileges across 18 product tables; after migration `0020_lazy_magneto.sql`, the current verified inventory is 209 (see `MEDIQ-PROV-001/TEST-EVIDENCE.md`).

Audit state-change metadata is written in the caller's same Tenant transaction. A failed Audit insert must roll the operation mutation back. `RESULT_UNKNOWN` is durable and cannot be retried or transitioned back to dispatch. This schema does not implement the future bounded read-only reconciliation resolver.


## P0 Operation-bound Provenance Amendment — 2026-10-01

`PROV-001-DEC-001` adds nullable `provenance_records.operation_id` referencing `pacs_transfer_operations.operation_id` with `ON DELETE RESTRICT`, plus a partial unique index for non-null operation IDs. Every `PACS_IMPORT` row must have `operation_id`, `destination_hospital_id`, and `study_ref_id`; non-PACS rows remain nullable for compatibility. A PACS operation has at most one Provenance record.

The runtime writer derives Session, Package, Study, Source Hospital and Destination Hospital by joining the persisted PACS operation to ExchangeSession and StudyReference under the verified Tenant transaction. It accepts no patient/hospital/package/study identity or result status from a request. It creates only `PENDING` rows for operation states `CREATED` or `PREFLIGHT_PASSED`; exact operation replay returns the same row. It has exact 13-column `SELECT` and 13-column `INSERT`, no `UPDATE`/`DELETE`, and Forced Tenant RLS. This increments the expected runtime column-privilege inventory from 183 to 209; the live catalog is the final evidence.

This record contains metadata only: it adds no DICOM payload, Hospital-local Patient ID, PACS endpoint credential, raw PACS response, or DEK/KEK. It is not authorization or evidence that dispatch, receipt, integrity, or audit completed. The current catalog count and operation binding are verified by the disposable DB-008 gate.

`PENDING` is bookkeeping and does not claim that PACS transfer started, succeeded, or passed integrity. Operation dispatch, Audit atomicity, source/destination hashes, verification and terminal Provenance transitions remain later gates.
