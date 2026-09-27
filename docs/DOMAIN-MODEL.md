# MediQ Domain Model

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `DOMAIN-MODEL.md`
**Version:** v1.3 Synthetic Health Data Preview Amendment
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ의 핵심 Domain Entity, 관계, Lifecycle 및 Invariant를 정의한다.

본 문서는 다음 문서에서 정의된 Product 및 Security Requirement를 Domain Model로 변환한다.

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
```

본 문서는 다음 질문에 답한다.

```text
MediQ에서 핵심 Entity는 무엇인가?

각 Entity는 어떤 책임을 가지는가?

어떤 Entity가 어떤 Entity를 소유하거나 참조하는가?

Exchange Session은 무엇을 관리하는가?

Consent와 Authorization은 어떻게 분리되는가?

Transfer Grant는 무엇을 허용하는가?

DICOM Payload는 어디에 속하는가?

어떤 규칙은 어떠한 구현에서도 깨져서는 안 되는가?
```

---

# 2. Domain Modeling Principles

MediQ Domain Model은 다음 원칙을 따른다.

## Principle 1 — Workflow와 Payload 분리

```text
Exchange Session
≠
Imaging Package
```

Exchange Session은 의료영상 교환 업무를 표현한다.

Imaging Package는 실제 교환 대상 의료영상 Payload를 표현한다.

---

## Principle 2 — Hospital-local Patient ID와 MediQ Patient Reference 분리

```text
Hospital Patient ID
≠
MediQ Patient Reference
```

의료기관 Local Patient ID를 MediQ 전역 Patient ID로 직접 사용하지 않는다.

---

## Principle 3 — Consent와 Authorization 분리

```text
Consent
≠
Authorization
≠
Transfer Grant
```

각각의 역할을 독립적으로 관리한다.

---

## Principle 4 — Source PACS가 Source of Record

```text
Source Hospital PACS
=
Source / System of Record
```

MediQ는 의료영상 원본 보관기관으로 정의하지 않는다.

---

## Principle 5 — Cloud는 Exchange Broker

```text
MediQ Cloud
=
Temporary Medical Imaging Exchange
```

Permanent Cloud PACS로 정의하지 않는다.

---

## Principle 6 — Explicit Resource Access

모든 의료영상 접근은 다음 Context를 이용한 명시적인 Authorization을 거친다.

```text
Actor
Tenant
Exchange Session
Consent
Grant
Resource
Action
```

---

# 3. Core Domain Flow

MediQ의 핵심 Domain 흐름은 다음과 같다.

```text
PATIENT IDENTITY
       │
       ▼
PATIENT REFERENCE
       │
       ▼
PATIENT MAPPING
       │
       ▼
EXCHANGE SESSION
       │
       ├──────────────┐
       │              │
       ▼              ▼
CONSENT          IMAGING PACKAGE
       │              │
       ▼              │
AUTHORIZATION         │
       │              │
       ▼              │
TRANSFER GRANT        │
       │              │
       └──────┬───────┘
              ▼
        ACCESS ACTION
              │
      ┌───────┼─────────┐
      ▼       ▼         ▼
     VIEW   DOWNLOAD  PACS_IMPORT
              │
              ▼
          PROVENANCE
              │
              ▼
            AUDIT
```

---

# 4. Core Entities

P0 Core Entity를 다음과 같이 정의한다.

```text
Organization
Tenant
Hospital
Actor/User

PatientReference
PatientMapping

ExchangeSession

ConsentArtifact

TransferGrant

ImagingPackage
StudyReference

ProvenanceRecord

AuditEvent
```

Supporting Value Objects:

```text
AccessMode
GrantScope
SessionState
ConsentStatus
GrantStatus
ResourceReference
IntegrityEvidence
```

---

# 5. Aggregate Overview

MediQ Domain을 다음 Aggregate 중심으로 구성한다.

```text
Patient Aggregate
├─ PatientReference
└─ PatientMapping

Exchange Aggregate
├─ ExchangeSession
├─ ConsentArtifact
└─ TransferGrant

Imaging Aggregate
├─ ImagingPackage
└─ StudyReference

Governance Aggregate
├─ ProvenanceRecord
└─ AuditEvent
```

Organization/Tenant/Hospital은 독립적인 Identity/Ownership Context를 제공한다.

---

# 6. Organization

## Definition

`Organization`은 MediQ를 사용하는 조직 단위를 나타낸다.

Capstone에서는 Hospital Organization을 중심으로 사용한다.

예:

```text
ORG-HOSPITAL-A
ORG-HOSPITAL-B
```

## Core Attributes

```text
organization_id
name
type
status
```

## Relationships

```text
Organization
      │
      ├── Tenant
      │
      └── Hospital
```

---

# 7. Tenant

## Definition

`Tenant`는 SaaS Resource Isolation의 논리적 보안 경계다.

## Core Attributes

```text
tenant_id
organization_id
name
status
```

## Invariants

### INV-TEN-001

모든 보호 대상 Resource는 Authorization 수행에 필요한 Tenant Context를 가져야 한다.

### INV-TEN-002

Cross-Tenant Resource 접근은 기본적으로 거부된다.

```text
Tenant A
→ Tenant B Resource
→ DENY
```

### INV-TEN-003

Cross-Tenant 접근은 유효한 Exchange Context가 명시적으로 허용하는 경우에만 가능하다.

---

# 8. Hospital

## Definition

`Hospital`은 의료영상 Exchange의 Source 또는 Destination 역할을 하는 논리적 의료기관 Entity다.

Capstone에서는 실제 병원이 아닌 Test Hospital이다.

## Roles

```text
SOURCE_HOSPITAL

DESTINATION_HOSPITAL
```

## Core Attributes

```text
hospital_id
tenant_id
organization_id
name
status
```

## Capability References

```text
QIDO-RS
WADO-RS
STOW-RS
```

상세 Endpoint 값은 Architecture/Data Model에서 정의한다.

---

# 9. PatientReference

## Definition

`PatientReference`는 MediQ가 의료영상 Exchange 내부에서 환자를 참조하기 위한 논리적 식별자다.

실제 국가 환자식별번호 또는 병원 Local Patient ID가 아니다.

예:

```text
MQ-TEST-0001
```

## Core Attributes

```text
patient_ref_id
status
created_at
```

## Invariants

### INV-PAT-001

MediQ Patient Reference는 Hospital Local Patient ID와 동일한 Identity Namespace로 취급해서는 안 된다.

```text
MediQ Patient Reference
≠
Hospital Local Patient ID
```

### INV-PAT-002

P0 Patient Reference는 Synthetic/Test Identity만 사용한다.

### INV-PAT-003

Patient Reference 자체는 실제 환자 본인확인 완료를 의미하지 않는다.

---

# 10. PatientMapping

## Definition

`PatientMapping`은 MediQ Patient Reference와 각 Hospital의 Local Patient ID 간 관계를 표현한다.

예:

```text
MediQ Patient Reference
MQ-TEST-0001
        │
        ├── Hospital A → TEST-A-001
        │
        └── Hospital B → TEST-B-982
```

## Core Attributes

```text
mapping_id
patient_ref_id
hospital_id
local_patient_id
status
validated_at
```

## Candidate Status

```text
VALID
UNVERIFIED
AMBIGUOUS
REVOKED
```

## Invariants

### INV-PAT-004

한 Mapping은 반드시 하나의 Hospital과 하나의 PatientReference를 참조한다.

### INV-PAT-005

PACS_IMPORT 수행에 사용되는 Destination Mapping은 `VALID` 상태여야 한다.

### INV-PAT-006

Mapping이 없는 경우 임의 Patient에게 전송해서는 안 된다.

```text
NO MATCH
→ DENY
```

### INV-PAT-007

복수 후보로 인해 Mapping이 모호한 경우 자동 선택해서는 안 된다.

```text
AMBIGUOUS
→ DENY
```

---

# 11. ExchangeSession

## Definition

`ExchangeSession`은 MediQ의 핵심 Business Entity다.

정의:

> **특정 Patient의 특정 의료영상이 Source Hospital에서 Destination 또는 허가된 Access Channel로 조회·다운로드·전송되는 하나의 의료영상 교환 업무 단위**

Exchange Session은 의료영상 Payload 자체가 아니다.

---

# 12. ExchangeSession Core Attributes

```text
session_id

patient_ref_id

source_hospital_id

destination_hospital_id

requester_ref

purpose

state

created_at

expires_at
```

참조:

```text
consent_artifact

transfer_grant

imaging_package

provenance

audit
```

---

# 13. ExchangeSession State Model

Baseline State:

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

Alternative Terminal States:

```text
REJECTED

EXPIRED

REVOKED

FAILED

CANCELLED
```

---

# 14. ExchangeSession State Invariants

### INV-EXC-001

모든 Exchange Session은 고유한 `session_id`를 가져야 한다.

### INV-EXC-002

Exchange Session은 하나의 PatientReference를 참조해야 한다.

### INV-EXC-003

Exchange Session은 하나의 Source Hospital을 가져야 한다.

### INV-EXC-004

Hospital-to-Hospital Exchange인 경우 Destination Hospital을 명확히 참조해야 한다.

### INV-EXC-005

다음 Terminal State의 Session을 신규 Resource Access의 근거로 사용할 수 없다.

```text
COMPLETED
REJECTED
EXPIRED
REVOKED
FAILED
CANCELLED
```

### INV-EXC-006

Session ID 자체는 Authorization Credential이 아니다.

```text
Know session_id
≠
Authorized
```

### INV-EXC-007

Session 상태는 정의된 State Transition을 우회하여 임의 변경해서는 안 된다.

---

# 15. ConsentArtifact

## Definition

`ConsentArtifact`는 환자가 특정 의료영상 이용 또는 전송에 동의했다는 사실을 표현하는 독립 Evidence Entity다.

Consent는 다음이 아니다.

```text
consent = true
```

---

# 16. ConsentArtifact Core Attributes

```text
consent_id

patient_ref_id

exchange_session_id

source_hospital_id

destination_hospital_id

resource_scope

allowed_actions

status

issued_at

expires_at

withdrawn_at
```

Future Extension:

```text
consent_version
policy_version
evidence_reference
```

---

# 17. Consent Status

```text
PENDING

ACTIVE

WITHDRAWN

EXPIRED

REJECTED
```

---

# 18. Consent Invariants

### INV-CON-001

Consent는 Exchange Session과 독립적인 Entity여야 한다.

### INV-CON-002

Consent는 최소 하나의 PatientReference와 연결되어야 한다.

### INV-CON-003

Consent는 적용 대상 Resource 또는 Resource Scope를 식별할 수 있어야 한다.

### INV-CON-004

`ACTIVE` 상태가 아닌 Consent를 신규 Grant 발급 근거로 사용할 수 없다.

```text
PENDING
WITHDRAWN
EXPIRED
REJECTED

→ New Grant DENY
```

### INV-CON-005

Consent 대상 Destination과 실제 Destination이 다르면 해당 Consent를 사용할 수 없다.

```text
Consent Destination = Hospital B
Request Destination = Hospital C

→ DENY
```

### INV-CON-006

Consent가 허용한 Action을 초과하는 Grant를 생성할 수 없다.

예:

```text
Consent:
VIEW

Grant:
VIEW + DOWNLOAD

→ INVALID
```

### INV-CON-007

Consent는 Authorization 자체가 아니다.

```text
Valid Consent
≠
Automatic Access
```

---

# 19. Authorization Decision

Authorization은 별도의 영속 Entity로 반드시 구현해야 하는 것은 아니지만 Domain Decision으로 명시한다.

입력:

```text
Actor

Tenant

Exchange Session

Consent

Resource

Requested Action

Transfer Grant
```

결과:

```text
ALLOW

DENY
```

---

# 20. Authorization Invariants

### INV-AUT-001

필수 Authorization Context 중 하나라도 확인되지 않으면 기본 결과는 `DENY`다.

### INV-AUT-002

Consent가 존재한다는 이유만으로 접근을 자동 허용해서는 안 된다.

### INV-AUT-003

Explicit `ALLOW`가 생성되지 않은 요청은 `DENY`한다.

### INV-AUT-004

Policy Evaluation 실패 시 `FAIL CLOSED`를 적용한다.

```text
POLICY ERROR
→ DENY
```

---

# 21. TransferGrant

## Definition

`TransferGrant`는 Authorization 결과에 따라 특정 Recipient가 특정 Resource에 대해 특정 Action을 수행할 수 있도록 하는 제한된 권한 Entity다.

---

# 22. TransferGrant Core Attributes

```text
grant_id

exchange_session_id

recipient_ref

tenant_id

resource_ref

scope

issued_at

expires_at

status
```

---

# 23. Grant Scope

P0:

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

# 24. Grant Status

```text
ACTIVE

EXPIRED

REVOKED

CONSUMED
```

`CONSUMED`는 일회성 Grant를 구현하는 경우 사용할 수 있으며 상세 사용 여부는 Architecture에서 결정한다.

---

# 25. TransferGrant Invariants

### INV-GRT-001

Grant는 반드시 하나의 Exchange Session과 연결되어야 한다.

### INV-GRT-002

Grant는 하나 이상의 Resource Scope를 명시해야 한다.

### INV-GRT-003

Grant는 하나 이상의 Action Scope를 명시해야 한다.

### INV-GRT-004

만료된 Grant는 사용할 수 없다.

```text
EXPIRED
→ DENY
```

### INV-GRT-005

취소된 Grant는 사용할 수 없다.

```text
REVOKED
→ DENY
```

### INV-GRT-006

Grant에 지정된 Recipient 이외의 Actor/Tenant는 Grant를 사용할 수 없다.

### INV-GRT-007

Grant가 허용하지 않은 Action을 수행할 수 없다.

```text
study:view
→ DOWNLOAD DENY
```

### INV-GRT-008

Grant Scope는 Consent의 허용범위를 초과할 수 없다.

```text
Grant Scope
⊆
Consent Allowed Actions
```

### INV-GRT-009

Grant에 다음을 직접 포함해서는 안 된다.

```text
Raw DICOM Payload

DEK

KEK

Password

Private Key

Long-lived Secret
```

---

# 26. ImagingPackage

## Definition

`ImagingPackage`는 하나의 Exchange 과정에서 다루는 의료영상 Payload의 논리적 Container다.

```text
ExchangeSession
=
Workflow

ImagingPackage
=
Payload
```

---

# 27. ImagingPackage Core Attributes

```text
package_id

patient_ref_id

source_hospital_id

created_at

integrity_reference

provenance_reference
```

Payload Location 및 Encryption 상세는 Architecture/Data Model에서 결정한다.

---

# 28. ImagingPackage Structure

```text
ImagingPackage
       │
       ├─ StudyReference
       │      │
       │      ├─ Series
       │      │
       │      └─ SOP Instance
       │
       └─ Integrity Evidence
```

---

# 29. ImagingPackage Invariants

### INV-IMG-001

ImagingPackage는 ExchangeSession과 별도 Entity여야 한다.

### INV-IMG-002

ImagingPackage는 하나의 Source Hospital Context를 가져야 한다.

### INV-IMG-003

ImagingPackage는 하나의 PatientReference Context와 연결되어야 한다.

### INV-IMG-004

ImagingPackage 내부 Study가 다른 PatientReference에 속하도록 혼합해서는 안 된다.

### INV-IMG-005

ImagingPackage의 Source 정보를 임의로 Destination 정보로 변경해서는 안 된다.

---

# 30. StudyReference

## Definition

`StudyReference`는 MediQ가 DICOM Study를 Domain 수준에서 참조하기 위한 Entity 또는 Value Object다.

최소 Reference 대상:

```text
StudyInstanceUID
```

필요 시:

```text
SeriesInstanceUID
SOPInstanceUID
```

를 참조할 수 있다.

---

# 31. StudyReference Invariants

### INV-STUDY-001

하나의 StudyReference는 Source Hospital Context와 연결되어야 한다.

### INV-STUDY-002

StudyReference는 해당 ImagingPackage의 PatientReference와 논리적으로 일치해야 한다.

### INV-STUDY-003

StudyInstanceUID만 알고 있다고 의료영상 접근이 허용되어서는 안 된다.

---

# 32. Access Action Model

P0 Access Action:

```text
VIEW

DOWNLOAD

PACS_IMPORT
```

P1:

```text
MOBILE_EXPORT
```

Mapping:

```text
VIEW
→ study:view

DOWNLOAD
→ study:download

PACS_IMPORT
→ study:pacs-transfer

MOBILE_EXPORT
→ study:mobile-export
```

---

# 33. Access Invariants

### INV-ACC-001

모든 Access Action은 적절한 Grant Scope를 필요로 한다.

### INV-ACC-002

Viewer 접근권한은 Download 권한을 의미하지 않는다.

```text
VIEW
≠
DOWNLOAD
```

### INV-ACC-003

Download 권한은 PACS Import 권한을 의미하지 않는다.

### INV-ACC-004

PACS Import 전에 유효한 Destination Patient Mapping이 존재해야 한다.

### INV-ACC-005

Access Action 실행 시 Exchange Session은 접근 가능한 상태여야 한다.

---

# 34. PACS Import Domain Rules

PACS Import Flow:

```text
Exchange Session
       ↓
Consent
       ↓
Authorization
       ↓
Transfer Grant
       ↓
Destination Hospital
       ↓
Patient Mapping
       ↓
Imaging Package
       ↓
STOW-RS
       ↓
Destination PACS
```

---

# 35. PACS Import Invariants

### INV-PACS-001

`study:pacs-transfer` Scope가 없는 경우 PACS Import를 수행할 수 없다.

### INV-PACS-002

Destination Hospital은 Grant/Session에 지정된 Destination과 일치해야 한다.

### INV-PACS-003

Destination Patient Mapping은 `VALID` 상태여야 한다.

### INV-PACS-004

STOW-RS 실패를 성공 Transfer로 기록해서는 안 된다.

### INV-PACS-005

성공 처리된 Transfer는 Destination Test PACS에서 수신 검증 가능해야 한다.

---

# 36. ProvenanceRecord

## Definition

`ProvenanceRecord`는 의료영상이 어디에서 시작해 어떤 경로를 거쳐 어디로 이동했는지를 기록하는 Domain Entity다.

---

# 37. Provenance Core Attributes

```text
provenance_id

package_id

source_hospital_id

source_study_ref

exchange_session_id

destination_hospital_id

ingested_at

transferred_at

integrity_status
```

---

# 38. Provenance Invariants

### INV-PROV-001

모든 PACS Transfer 완료 결과는 Source와 Destination을 추적할 수 있어야 한다.

### INV-PROV-002

Provenance는 Exchange Session과 연결되어야 한다.

### INV-PROV-003

Integrity Verification 결과를 Provenance와 연결할 수 있어야 한다.

### INV-PROV-004

실제 Source와 다른 Hospital을 Source로 기록해서는 안 된다.

### INV-PROV-005

실패한 Transfer를 성공 Provenance로 기록해서는 안 된다.

---

# 39. IntegrityEvidence

## Definition

`IntegrityEvidence`는 의료영상이 Transfer 과정에서 기대한 상태로 유지되었는지를 검증한 결과다.

P0는 Bit-preserving Scenario를 우선한다.

---

# 40. Integrity States

```text
PENDING

VERIFIED

FAILED

NOT_APPLICABLE
```

---

# 41. Integrity Invariants

### INV-INT-001

Bit-preserving Transfer의 Source/Destination Object가 일치하면:

```text
VERIFIED
```

로 기록할 수 있다.

### INV-INT-002

Integrity mismatch 발생 시:

```text
FAILED
```

이어야 한다.

### INV-INT-003

`FAILED` Integrity Transfer를 성공 완료 처리해서는 안 된다.

### INV-INT-004

향후 Transcoding 등 변환이 발생하는 경우 단순 File Hash 일치 규칙을 강제하지 않는다.

해당 검증 모델은 별도 확장한다.

---

# 42. AuditEvent

## Definition

`AuditEvent`는 MediQ에서 발생한 보안·업무 Event를 재구성할 수 있도록 기록하는 Domain Entity다.

---

# 43. AuditEvent Core Attributes

```text
audit_event_id

timestamp

actor_ref

tenant_id

session_id

action

result

resource_ref

reason_code
```

필요한 경우 일부 Field는 nullable할 수 있으며 상세 규칙은 Data Model에서 정의한다.

---

# 44. Core Audit Events

최소 다음 이벤트를 표현할 수 있어야 한다.

```text
SESSION_CREATED

CONSENT_REQUESTED

CONSENT_APPROVED

CONSENT_WITHDRAWN

AUTHORIZATION_GRANTED

AUTHORIZATION_DENIED

GRANT_CREATED

GRANT_DENIED

VIEWER_OPENED

DOWNLOAD_STARTED

PACS_TRANSFER_STARTED

PACS_TRANSFER_COMPLETED

ACCESS_DENIED

INTEGRITY_FAILURE

SESSION_COMPLETED
```

---

# 45. Audit Invariants

### INV-AUD-001

Authorization Denial은 추적 가능한 Audit Event를 생성해야 한다.

### INV-AUD-002

PACS Transfer 성공/실패 결과를 Audit에서 확인할 수 있어야 한다.

### INV-AUD-003

Audit Event에 Raw DICOM Payload를 저장해서는 안 된다.

### INV-AUD-004

Audit Event에 다음 Secret을 저장해서는 안 된다.

```text
Password
Raw Access Token
Private Key
DEK
KEK
```

### INV-AUD-005

Audit는 업무 Resource 자체가 아니라 업무행위에 대한 Evidence다.

---

# 46. Domain Relationship Model

전체 Relationship:

```text
Organization
     │
     └── Tenant
           │
           └── Hospital
                 │
                 └── PatientMapping
                         │
                         ▼
                  PatientReference
                         │
                         ▼
                 ExchangeSession
                  /      |       \
                 /       |        \
                ▼        ▼         ▼
        ConsentArtifact Grant   ImagingPackage
                                │
                                ▼
                          StudyReference
                                │
                                ▼
                       IntegrityEvidence
                                │
                                ▼
                        ProvenanceRecord
                                │
                                ▼
                           AuditEvent
```

AuditEvent는 실제로 모든 주요 Entity/Event와 연결될 수 있다.

---

# 47. Cardinality Baseline

논리적 Cardinality:

```text
Organization
1 ── N Tenant

Tenant
1 ── N Hospital

PatientReference
1 ── N PatientMapping

Hospital
1 ── N PatientMapping

PatientReference
1 ── N ExchangeSession

ExchangeSession
1 ── N ConsentArtifact

ExchangeSession
1 ── N TransferGrant

ExchangeSession
1 ── N ImagingPackage

ImagingPackage
1 ── N StudyReference

ImagingPackage
1 ── N IntegrityEvidence

ExchangeSession
1 ── N ProvenanceRecord

ExchangeSession
1 ── N AuditEvent
```

이 Cardinality는 논리적 Baseline이며 실제 DB 구현에서 최적화할 수 있다.

---

# 48. Aggregate Ownership

권장 Ownership:

## Patient Aggregate

Root:

```text
PatientReference
```

Children:

```text
PatientMapping
```

---

## Exchange Aggregate

Root:

```text
ExchangeSession
```

Related Entities:

```text
ConsentArtifact
TransferGrant
```

---

## Imaging Aggregate

Root:

```text
ImagingPackage
```

Children:

```text
StudyReference
IntegrityEvidence
```

---

## Governance Aggregate

Independent Evidence:

```text
ProvenanceRecord
AuditEvent
```

Audit/Provenance는 과거 Event Evidence이므로 Domain Entity 삭제와 함께 무조건 삭제되는 단순 Child로 취급하지 않는다.

---

# 49. Cross-Aggregate Rules

### INV-CROSS-001

ExchangeSession의 PatientReference와 ImagingPackage의 PatientReference는 일치해야 한다.

```text
Session.patient_ref
=
Package.patient_ref
```

### INV-CROSS-002

Consent의 ExchangeSession은 Grant의 ExchangeSession과 일치해야 한다.

### INV-CROSS-003

Grant Resource는 해당 ExchangeSession에서 허용된 ImagingPackage/Study 범위에 속해야 한다.

### INV-CROSS-004

PACS Import Destination은 다음 모두에서 일치해야 한다.

```text
ExchangeSession.destination

Consent.destination

TransferGrant.recipient/destination

PACS Target
```

### INV-CROSS-005

Tenant Context가 불일치하는 Resource는 명시적 Exchange Authorization 없이 접근할 수 없다.

### INV-CROSS-006

Provenance의 Source Hospital은 ImagingPackage Source Hospital과 일치해야 한다.

---

# 50. Critical Security Invariants

다음 규칙은 구현기술과 무관하게 반드시 유지한다.

## CSI-01

```text
No Consent
→ New Grant DENY
```

## CSI-02

```text
Withdrawn Consent
→ New Grant DENY
```

## CSI-03

```text
Invalid / Expired Grant
→ Access DENY
```

## CSI-04

```text
Wrong Scope
→ DENY
```

## CSI-05

```text
Wrong Recipient
→ DENY
```

## CSI-06

```text
Wrong Tenant
→ DENY
```

## CSI-07

```text
Invalid Patient Mapping
→ PACS_IMPORT DENY
```

## CSI-08

```text
Invalid Session State
→ DENY
```

## CSI-09

```text
Integrity Failure
→ Transfer Success DENY
```

## CSI-10

```text
Security Context Unknown
→ FAIL CLOSED
```

---

# 51. Valid Exchange Invariant

정상 Exchange의 최소 조건:

```text
Authenticated Actor
        +
Valid Tenant Context
        +
Valid Exchange Session
        +
Valid Consent
        +
Valid Transfer Grant
        +
Correct Resource
        +
Correct Scope
        +
Correct Recipient
```

결과:

```text
→ ALLOW
```

PACS Import는 추가:

```text
Valid Patient Mapping
+
Correct Destination
```

이 필요하다.

---

# 52. Source-of-Record Model

복사본의 의미를 다음과 같이 고정한다.

```text
Hospital A PACS
=
SOURCE / SYSTEM OF RECORD
```

```text
MediQ
=
TEMPORARY EXCHANGE COPY
```

```text
Hospital B PACS
=
DESTINATION IMPORTED COPY
```

P1:

```text
Mobile Secure Vault
=
PATIENT-HELD SECURE COPY
```

---

# 53. Source-of-Record Invariants

### INV-SOR-001

MediQ Temporary Copy를 Source Hospital Original로 표현해서는 안 된다.

### INV-SOR-002

Mobile Secure Vault Copy가 Source PACS Original을 대체한다고 간주해서는 안 된다.

### INV-SOR-003

MediQ P0는 장기 의료기록 원본 저장 책임을 갖지 않는다.

---

# 54. Temporary Payload Lifecycle

논리적 Lifecycle:

```text
REGISTERED
    ↓
AVAILABLE
    ↓
IN_EXCHANGE
    ↓
SESSION_COMPLETE
    ↓
RETENTION_PENDING
    ↓
DELETED
```

구체적인 Retention 시간은 현재 Domain Model에서 정하지 않는다.

---

# 55. Domain Events

향후 Architecture에서 다음 Domain Event를 사용할 수 있다.

```text
ExchangeSessionCreated

ConsentRequested

ConsentActivated

ConsentWithdrawn

AuthorizationAllowed

AuthorizationDenied

TransferGrantIssued

TransferGrantExpired

ImagingPackageRegistered

ViewerOpened

DownloadStarted

PacsTransferStarted

PacsTransferCompleted

IntegrityVerified

IntegrityFailed

ExchangeSessionCompleted
```

Domain Event 사용은 구현 필수사항이 아니며 Architecture에서 결정한다.

---

# 56. P1 Domain Extension

Mobile Secure Vault는 P1으로 다음 Entity가 추가될 수 있다.

```text
Device

SecureMedicalCapsule

WrappedKey

MobileExportGrant
```

관계:

```text
ExchangeSession
      ↓
TransferGrant
      ↓
MOBILE_EXPORT
      ↓
SecureMedicalCapsule
      ↓
Device
```

P1 Domain은 P0 Core Domain을 변경하지 않고 확장해야 한다.

---

# 57. P1 Invariant

```text
P1 Failure
≠
P0 Exchange Failure
```

Mobile 기능이 없더라도 다음은 독립적으로 동작해야 한다.

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

---

# 58. Productionization Boundary

다음 Entity/Domain은 현재 P0에서 구체화하지 않는다.

```text
Real Patient Identity Proofing

National Patient Identifier

Hospital MPI

Production Legal Consent Evidence

Enterprise IAM

Production Key Management

Billing

SLA

Clinical Workflow Integration
```

필요 시 향후 별도 Domain Module로 추가한다.

---

# 59. Explicit Domain Non-Goals

현재 Domain Model에 다음을 추가하지 않는다.

```text
Cloud PACS Domain

Full EMR Domain

FHIR Platform Domain

AI Diagnosis Domain

Blockchain Identity Domain

DID / ZKP Domain

PQC Key Infrastructure Domain
```

---

# 60. Domain Consistency Checklist

구현 또는 Data Model 작성 전 다음을 확인한다.

```text
Patient ID와 PatientReference가 분리되어 있는가?

ExchangeSession과 ImagingPackage가 분리되어 있는가?

Consent와 Authorization이 분리되어 있는가?

Grant가 Scope 기반인가?

Tenant Context가 모든 보호 Resource에서 확인 가능한가?

PACS Import 전에 Patient Mapping을 검증하는가?

Source / Destination이 명확한가?

Provenance가 Source→Destination을 추적 가능한가?

Integrity Failure가 성공으로 기록되지 않는가?

Audit에 Secret/Payload가 저장되지 않는가?

Mobile P1이 P0 Domain을 오염시키지 않는가?
```

---

# 61. Domain Model Decision

```text
PROJECT:
MediQ

DOMAIN MODEL VERSION:
v1.1 Viewer Architecture Amendment

CORE BUSINESS AGGREGATE:
ExchangeSession

PATIENT ROOT:
PatientReference

PATIENT MAPPING:
Hospital-local ID ↔ MediQ PatientReference

CONSENT MODEL:
Independent ConsentArtifact

AUTHORIZATION MODEL:
Explicit ALLOW / DENY Decision

ACCESS AUTHORITY:
Scoped TransferGrant

PAYLOAD MODEL:
ImagingPackage

DICOM RESOURCE:
StudyReference

SOURCE OF RECORD:
Source Hospital PACS

MEDIQ CLOUD:
Temporary Exchange Copy

DESTINATION:
Imported PACS Copy

INTEGRITY:
IntegrityEvidence

MOVEMENT TRACE:
ProvenanceRecord

ACTIVITY TRACE:
AuditEvent

P0 ACCESS MODES:
VIEW
DOWNLOAD
PACS_IMPORT

P1:
MOBILE_EXPORT
Mobile Secure Vault

FAILURE MODEL:
DENY BY DEFAULT
FAIL CLOSED

DOMAIN MODEL STATUS:
APPROVED BASELINE
```

---

# 62. Domain Baseline Review

```text
Patient Reference:
PASS

Patient Mapping:
PASS

Exchange Session:
PASS

Consent Separation:
PASS

Authorization Separation:
PASS

Transfer Grant:
PASS

Imaging Package:
PASS

Study Model:
PASS

Tenant Boundary:
PASS

PACS Import Rules:
PASS

Provenance:
PASS

Integrity:
PASS

Audit:
PASS

P0/P1 Separation:
PASS

Productionization Separation:
PASS

Critical Invariants:
DEFINED

Cross-Aggregate Invariants:
DEFINED

DOMAIN BASELINE READY:
YES
```

---

# 63. Next Document

다음 공식 산출물은:

```text
SYSTEM-ARCHITECTURE.md
```

이다.

`SYSTEM-ARCHITECTURE.md`에서는 본 Domain Model을 실제 Component 구조로 변환한다.

예:

```text
PatientReference
        ↓
Patient Service

ExchangeSession
        ↓
Exchange Service

ConsentArtifact
        ↓
Consent Service

TransferGrant
        ↓
Authorization Service

ImagingPackage
        ↓
Imaging Service

Provenance / Audit
        ↓
Audit / Provenance Service
```

단, Domain Entity와 Service를 반드시 1:1 Microservice로 구현할 필요는 없다.

캡스톤 P0에서는 **Modular Monolith 또는 소수 서비스 구조도 허용**하며, 실제 Deployment Architecture는 `SYSTEM-ARCHITECTURE.md`에서 결정한다.

---

# FINAL DOMAIN POLICY

> **MediQ의 중심 Business Object는 `ExchangeSession`이며, Patient Identity는 `PatientReference + Hospital-local PatientMapping`, 동의는 독립적인 `ConsentArtifact`, 실행권한은 Scope 기반 `TransferGrant`, 의료영상 Payload는 `ImagingPackage`, 데이터 이동 증적은 `ProvenanceRecord`, 활동 및 보안 증적은 `AuditEvent`로 분리한다.**

> **어떠한 구현에서도 Consent를 Authorization으로 대체하거나, Session ID를 접근권한으로 사용하거나, Hospital Local Patient ID를 MediQ 전역 환자식별자로 직접 사용해서는 안 된다.**

> **P0에서는 `VIEW / DOWNLOAD / PACS_IMPORT`의 E2E 완성이 우선이며 Mobile Secure Vault는 이 Domain을 변경하지 않는 P1 Extension으로 유지한다.**

---

# Viewer Domain Amendment — 2026-09-15

## ViewerSession

`ViewerSession`은 독립적인 영구 의료영상 Aggregate가 아니라 승인된 `ExchangeSession`과 `TransferGrant`에서 파생되는 short-lived access context다.

최소 속성:

```text
viewer_session_id
exchange_session_id
grant_id
actor_type: HOSPITAL_USER | PATIENT
actor_id
tenant_id
patient_ref_id
source_hospital_id
study_ref_id
status: ACTIVE | EXPIRED | REVOKED | CLOSED | FAILED
created_at
expires_at
closed_at
```

불변조건:

- `study:view` Scope만 허용한다.
- Actor/Tenant/Patient/Source/Study Binding 중 하나라도 다르면 접근을 거부한다.
- Consent 또는 Grant가 무효화되면 ViewerSession도 사용할 수 없다.
- ViewerSession ID나 DICOM UID는 단독 접근권한이 아니다.

## TemporaryImagingObject

`TemporaryImagingObject`는 Imaging Payload의 영구 Domain 소유권을 나타내지 않는다. 필요한 경우 `ImagingPackage` 하위의 ephemeral lifecycle metadata로 모델링한다.

```text
storage_ref
tenant_id
exchange_session_id
purpose: VIEW_BUFFER | TRANSFER_RETRY
encrypted
created_at
expires_at
purged_at
```

## P1 Mobile Extension

`SecureMedicalCapsule`과 `MobileVault`는 P1 extension이다. Mobile Viewer는 Source PACS의 live path가 아니라 환자 기기에 저장된 암호화 Local Copy를 연다. P0 17-table baseline을 자동으로 확장하지 않는다.

---

# P1 Mobile Security Domain Amendment — 2026-09-15

P1 Mobile MVP는 다음 논리적 Domain Object를 사용한다. 이는 P0 Aggregate와 17-table baseline을 변경하지 않으며 구현 Ticket 승인 전까지 논리 모델이다.

## MobileDevice

```text
device_id
patient_reference_id
platform: ANDROID | IOS
key_security_level: STRONGBOX | TRUSTED_ENVIRONMENT | SOFTWARE | UNKNOWN
attestation_status: VERIFIED | FAILED | UNAVAILABLE
status: PENDING | ACTIVE | REVOKED | LOST | RETIRED
registered_at
revoked_at
```

Persistent Mobile Vault 허용조건은 Android와 검증된 `STRONGBOX` 또는 `TRUSTED_ENVIRONMENT`다. 다른 상태는 Cloud Viewer 경로만 사용할 수 있다.

## SecureMedicalCapsule

```text
capsule_id
patient_reference_id
source_hospital_id
study_reference_id
mobile_export_grant_id
crypto_suite_version
payload_algorithm: AES_256_GCM
wrapped_key_slots
issued_at
last_policy_verified_at
offline_expires_at
status: ACTIVE | EXPIRED | REVOKED | CRYPTO_SHREDDED
```

## MobileViewerSession

```text
device_id
capsule_id
authenticated_at
backgrounded_at
reauth_grace_expires_at
status: ACTIVE | PRIVACY_LOCKED | AUTH_REQUIRED | CLOSED
```

## Domain Invariants

- `INV-MOB-001`: Software/Unknown Device는 Persistent Vault 또는 Mobile Export 대상이 될 수 없다.
- `INV-MOB-002`: Offline Lease는 발급 또는 마지막 성공한 온라인 정책 검증으로부터 최대 30일이다.
- `INV-MOB-003`: 60초 Background 유예는 재인증에만 적용하며 민감 화면은 즉시 가린다.
- `INV-MOB-004`: Capsule Key는 다른 Device로 이전하거나 Cloud Escrow로 복구하지 않는다.
- `INV-MOB-005`: 새 기기 재발급은 현재 유효한 Consent, Authorization 및 `study:mobile-export` Grant가 필요하다.
- `INV-MOB-006`: Mobile Vault Copy는 Source PACS Original을 대체하지 않는다.

---

# Synthetic Health Data Preview Logical Domain Amendment — 2026-09-26

이 Amendment는 P0 Aggregate와 PostgreSQL Baseline을 변경하지 않는 P1 논리 모델이다.

## Logical Objects

### HealthDataPreviewSession

```text
preview_session_id
patient_reference: TEST-* only
provider_mode: MOCK
source_mode: SYNTHETIC
selected_categories
selected_period
state
fixture_version
created_at
reset_at
```

### MockHealthDataConsent

```text
preview_session_id
purpose
selected_categories
selected_period
confirmed_at
status: DEMO_CONSENTED | RESET
```

`MockHealthDataConsent`는 실제 Consent Aggregate, Authorization Decision 또는 Transfer Grant가 아니다.

### SyntheticHealthRecord

```text
scenario_id
record_type
synthetic_payload
source_mode: SYNTHETIC
provider_mode: MOCK
fixture_version
disclaimer
```

### SyntheticHealthDataProvenance

합성 Record의 시나리오, Fixture Version, 생성시각과 Hash만 추적한다. 실제 기관을 Data Source로 주장하지 않는다.

## Domain Invariants

- `INV-HHP-001`: `TEST-*`, `SYNTHETIC`, `MOCK` Marker가 모두 유효하지 않으면 Preview를 열 수 없다.
- `INV-HHP-002`: Mock Consent는 실제 Consent/Grant를 생성하거나 갱신할 수 없다.
- `INV-HHP-003`: SyntheticHealthRecord는 DICOM Exchange, PACS Import 또는 의료진 공유 Resource가 아니다.
- `INV-HHP-004`: Capstone 상태는 `INSTITUTION_APPROVED`, `PRODUCTION_CONNECTED`, `REAL_DATA_AVAILABLE`로 전이할 수 없다.
- `INV-HHP-005`: Preview Reset 후 Session과 합성 Cache는 접근할 수 없어야 한다.

상세 상태와 계약은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다.

# Hospital Clinical Workflow P1 Domain Amendment — 2026-09-27

## P1 Logical Objects

- `AuthorizedPriorStudyProjection`: 권한 범위의 과거 Study 후보를 나타내는 읽기 Projection이다. 같은 Patient Reference만으로 생성하지 않는다.
- `ComparisonViewerSession`: Actor/Tenant/Hospital/Purpose/Expiry와 허용 Study 집합에 binding된 Short-lived Viewer Session이다.
- `ClinicalHandoffPacket`: 하나의 Exchange/Patient/Tenant에 속하는 인계 목적과 Resource Reference 집합이다.
- `HandoffResourceReference`: 영상, 향후 임상문서 등 Resource별 Scope·Expiry·Provenance를 분리한다.
- `WorkAssignment`: Hospital 내부 담당자·Role Queue·기한·상태·Version을 나타낸다.
- `HospitalNotification`: Event에서 생성된 개인정보 최소 Inbox Projection이다.
- `ExplainableTimelineProjection`: Audit/Provenance/Integrity 원장을 사용자 역할에 맞게 설명하는 읽기 모델이다.

## Domain Invariants

1. `WorkAssignment` 생성은 Authorization 또는 Transfer Grant 생성이 아니다.
2. `ClinicalHandoffPacket`에 Resource Reference가 존재해도 해당 Actor가 Resource를 열 수 있다는 뜻이 아니다.
3. `ComparisonViewerSession`은 모든 포함 Study가 개별적으로 허용된 경우에만 생성한다.
4. 판독문·의뢰서와 영상은 다른 Resource Type과 Scope를 가진다.
5. `ExplainableTimelineProjection`은 원장 Event를 변경·삭제·성공으로 승격하지 않는다.
6. Notification 상태와 업무 상태는 Exchange, Transfer, Clinical Care 완료 상태가 아니다.
7. P1 객체는 DICOM Pixel, PACS Credential, Secret 또는 장기 Cloud Imaging Copy를 소유하지 않는다.

정식 상태와 전이는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`를 따른다. Persistence와 API는 구현 Ticket 승인 전 논리 모델이다.
