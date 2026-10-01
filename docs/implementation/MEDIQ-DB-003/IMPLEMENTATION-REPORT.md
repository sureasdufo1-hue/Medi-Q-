# MEDIQ-DB-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-003` |
| 제목 | Patient Reference and Mapping schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — Ticket scope only |

## 1. 목표

승인된 Data Model/ERD의 `patient_refs`, `patient_mappings` 두 Patient Identity table을 Drizzle schema와 additive SQL migration으로 구현하고, schema constraints 및 synthetic-only data lifecycle을 검증한다. PatientReference와 Hospital-local Patient ID는 분리하며 실제 신원정보는 저장하지 않는다.

## 2. 범위

### 포함

- UUID PK, documented columns/types/nullability, created/updated timestamps without defaults
- PatientReference code unique/status constraint/status index
- PatientMapping의 patient/hospital FK(RESTRICT), four documented statuses, 두 composite unique keys, declared single-column indexes
- Generated migration apply/re-run 및 positive/negative transaction rollback test
- `TC-DB-003-REG-001~008`과 PAT-001/002 persistence traceability

### 제외

- Exchange/Consent/Grant/API/domain services, Tenant RLS 및 runtime grants
- `PAT-003` Destination validation, `PAT-004` invalid/ambiguous transfer decision workflow; 이 Ticket은 schema constraint만 구현
- Real patient identifier, demographic fields, seed 또는 production data

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `DATA-MODEL.md` §§12–14, `ERD.md` patient identity relationships, `IMPLEMENTATION-PLAN.md` §§10–11 | 두 승인 table의 columns/status/keys/index/FK 및 DB-only mapping rule | `TC-DB-003-REG-001~008` |
| 보안 | `SECURITY-REQUIREMENTS.md` §§15, `THREAT-MODEL.md` THR-018, `AGENTS.md` privacy/security invariants | Synthetic-only Patient Reference; Hospital-local ID는 cross-hospital identity가 아니며 PACS import는 valid mapping만 허용(서비스는 후속) | schema check/no-real-data tests; PAT-003/004 deferred |
| API·도메인 | `DOMAIN-MODEL.md` Patient Aggregate/INV; `OPENAPI.yaml` | PatientReference root + per-hospital mapping; no API changes | schema only; no endpoint |
| Acceptance | `ACCEPTANCE-TESTS.md` Patient Mapping AT-FUNC-003/AT-SEC-012 plus DB registry section | Persisted structure and SQL constraints only; business authorization stays separate | `TC-DB-003-REG-001~008` |

## 4. 구현 결과

`patient_refs`와 `patient_mappings` 두 table을 generated migration `0002_patient-identity.sql`로 적용했다. DB에는 승인된 13개 column과 2 PK, 2 FK(RESTRICT), 3 UNIQUE, 2 status CHECK, 4 secondary index만 존재하며 defaults/인구학 field를 추가하지 않았다.

실제 local PostgreSQL 시험은 ACTIVE/INACTIVE reference 및 VALID/UNVERIFIED/AMBIGUOUS/REVOKED mapping fixture를 받아들이고, 한 PatientReference가 별도 Test Hospital A/B에 하나씩 mapping될 수 있음을 확인했다. 세 unique key 중복, 잘못된 status/FK, parent delete를 각각 거부했고 transaction rollback 후 환자·mapping fixture row가 남지 않았다. 전체 product table은 이전 DB-002 5개와 합쳐 승인된 7개만 존재한다.

Mapping이 저장되어 있다는 사실은 PACS Import 권한이 아니다. `VALID`만 Import 가능한 domain rule의 실제 enforcement, invalid/ambiguous mapping workflow, Tenant authorization/RLS, 실제 업무 API는 구현하지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/patient.ts` | 두 Patient identity table의 approved Drizzle schema |
| `services/api/src/database/schema/index.ts` | Patient schema export 추가 |
| `services/api/src/database/migrations/0002_patient-identity.sql` | generated additive migration |
| `services/api/src/database/migrations/meta/_journal.json` | migration index 2 추가 |
| `scripts/test-db-003-patient.ps1` | schema inventory, synthetic constraints and rollback integration test |
| `scripts/test-db-002-registry.ps1` | 이후 승인된 table이 추가되어도 허용 model 안에서 DB-002 checks 재실행 가능하게 inventory 검증 일반화 |
| `docs/ACCEPTANCE-TESTS.md` | TC-DB-003-REG-001~008 및 evidence 연결 |
| `docs/implementation/MEDIQ-DB-003/` | 구현 보고서와 test evidence |
| `docs/implementation/README.md`, current execution/status docs | Ticket 상태·진행 경로 동기화 |

## 6. 영향 분석

### Architecture

- DB-002 registry에 additive patient identity tables만 연결했다. 새 component/service/API는 추가하지 않았다.

### API·Data

- PatientReference root와 hospital-scoped mapping persistence만 추가했다. Synthetic/Test fixture는 rollback했고 persistent patient row는 0건이다.

### Security·Privacy

- Real patient identifiers/demographics를 저장하지 않으며, local ID를 전역 patient identity로 취급하지 않는다.
- Synthetic local mapping identifier는 private database row이며 test log/output에는 기록하지 않는다.
- FK/unique/check는 structural integrity만 보장한다. `VALID` mapping import rule, tenant checks, RLS/grants, consent/authorization are outside this Ticket.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` — DB-003 approved patient persistence schema and synthetic constraints only

## 8. 변경하지 않은 사항

- PACS import workflow, PAT-003 destination validation and PAT-004 invalid/ambiguous mapping decisions
- Product APIs, seed, tenant RLS/runtime table grants, real identity fields and any patient data

## 9. 결정 및 예외

- Approved status values are complete in `DATA-MODEL.md`; enforce exactly those values using CHECK constraints.
- The two uniqueness constraints preserve a maximum of one hospital-local ID per PatientReference per hospital and a maximum of one PatientReference per local ID within a hospital.
- Do not use the database constraint layer to treat `UNVERIFIED`, `AMBIGUOUS`, or `REVOKED` as `VALID`; application authorization must fail closed in PAT-003/004 and E2E tickets.

## 10. 잔여 위험과 후속 작업

- Patient identity matching is synthetic-only. Real-world patient matching and identity proof are production/high-risk work and out of scope.
- Runtime table grants/RLS and application/domain mapping validation remain pending; DB-004+ and PAT-003/004 must enforce them before any product transfer.
- Fresh-volume provisioning, concurrent migration contention, real-Postgres injected DDL failure, business API auth and PACS import decision tests were not part of this ticket.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-003
Scope: Approved patient_refs/patient_mappings persistence schema and synthetic DB tests
Changed: Drizzle definitions, migration, reproducible integration test and traceability docs
Not changed: PACS import workflow, PAT-003/004 business mapping decisions, API, RLS/grants, real identity fields
Security impact: Hospital-scoped identifiers, FK/unique/status constraints, no real PHI; no authorization implied
Tests executed: Migration apply/re-run; schema metadata; FK/unique/check/RESTRICT; two-hospital fixture; rollback; prior DB-002 regression
Tests not executed: Fresh-volume provisioning, concurrent lock contention, real DDL failure injection, product API/RLS/PACS authorization
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Patient matching, `VALID`-only import enforcement and tenant access controls remain product-workflow gates
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | 구현 기록 생성 |
| 2026-09-30 | `PASS` | Patient schema generated/applied; synthetic constraints and rollback evidence recorded |
