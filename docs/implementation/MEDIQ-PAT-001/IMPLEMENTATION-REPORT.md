# MEDIQ-PAT-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-001` |
| 제목 | Synthetic PatientReference domain and persistence adapter |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — approved synthetic domain/repository scope including actual runtime DB integration |

## 1. 목표

기존 DB-003 `patient_refs` 계약과 P0 synthetic-only identity boundary를 지키는 PatientReference domain, repository port 및 parameterized PostgreSQL adapter를 구현하고, `MEDIQ-DB-009`의 좁은 runtime privilege로 test-only PostgreSQL persistence를 증명한다. Public API나 실제 환자 identity 처리는 열지 않는다.

## 2. 범위

### 포함

- `MQ-TEST-*` synthetic code / UUID / status / timestamp domain validation
- Repository port와 DB-003의 기존 컬럼만 쓰는 PostgreSQL create/find adapter
- Unit/SQL-contract tests와 실제 `mediq_runtime` role의 isolated PostgreSQL create/read/conflict/rollback integration
- Acceptance·decision·구현 기록 동기화

### 제외

- Product API/controller, AppModule wiring, public PatientReference route
- PatientMapping, hospital-local identity verification, real identity data
- Business Authorization or Consent/Grant processing
- `patient_refs` Tenant RLS: this canonical P0 synthetic-only relation is explicitly global and separately constrained

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PAT-001` | Hospital-local ID와 독립된 MediQ reference | immutable synthetic-only domain |
| 보안 | `SEC-IAM-003`, `INV-PAT-001~003`, `SEC-DB-005` | Reference is not identity proof; no PHI; minimum DB grants | code grammar, exact projection/grant, no route |
| API·도메인 | `DOMAIN-MODEL.md` §9; `DATA-MODEL.md` §12; DB-003 | 기존 5-column contract와 repository boundary | domain/port/PostgreSQL adapter |
| Acceptance | `TC-PAT-001-DOM-001~002`, `PER-001~003`, `SEC-001` | Domain, SQL, runtime persistence and API boundary | API tests + test-profile runtime integration |
| Dependency | `MEDIQ-DB-009`, `DB-009-DEC-001` | Only the global synthetic `patient_refs` exception is granted | exact SELECT/INSERT column privileges; DB CHECK |

## 4. 구현 결과

PatientReference domain accepts only the P0 `MQ-TEST-*` namespace, creates UUID-backed `ACTIVE` objects and safely reconstitutes the existing `ACTIVE/INACTIVE` states. The PostgreSQL adapter uses bind parameters and only the five approved `patient_refs` columns. Duplicate and database failures become fixed, non-disclosing errors.

The `api-db-integration-test` profile connects using the actual `mediq_runtime` URL and verifies create, read by ID/code, generic duplicate conflict mapping and transaction rollback. It uses only synthetic data; runtime UPDATE/DELETE/TRUNCATE and non-synthetic reference insertion are denied by DB-009.

The adapter remains deliberately unwired from `AppModule` and public routes. PASS is limited to the synthetic PatientReference domain/repository and runtime persistence test. No identity proof, PatientMapping authorization, or public patient workflow is claimed.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/patient/domain/patient-reference.ts` | Synthetic-only immutable domain object, UUID/code/status/time validation |
| `services/api/src/patient/application/patient-reference.repository.ts` | Persistence port for create/find operations |
| `services/api/src/patient/persistence/postgres-patient-reference.repository.ts` | Parameterized PostgreSQL create/find adapter; safe errors |
| `tests/api/patient-reference.test.mjs` | Domain, bound-SQL, error and SQL-injection-shaped invalid input tests |
| `tests/database/patient-reference-runtime.integration.test.mjs` | Runtime-role PostgreSQL create/read/duplicate/rollback integration |
| `services/api/Dockerfile`, `infra/docker-compose.yml`, `scripts/validate-compose-baseline.ps1` | Isolated test-profile wiring; no public/API route |
| `docs/REQUIREMENTS.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/POLICY-DECISION-LOG.md`, `docs/DATA-MODEL.md`, `docs/IMPLEMENTATION-PLAN.md` | requirement, policy and acceptance status synchronization |

## 6. 영향 분석

### Architecture

- Test-only integration target; no product runtime route or AppModule dependency.
- Production API identity→Tenant context and business authorization remain separate future gates.

### API·Data

- No schema/table change in PAT-001; it relies on DB-003 and the separate DB-009 grant/check migration.
- Only `patient_refs` five-column create/find operations are verified.

### Security·Privacy

- Synthetic code validation is enforced in both domain and database.
- `mediq_runtime` receives only column-level SELECT/INSERT for this global synthetic namespace.
- No PHI, real identifier, local patient ID or public route is used.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Domain/SQL contract, build, actual runtime DB integration and DB-002~007 regression: PASS in the defined PAT-001 scope.
- DB-009 application authorization/context wrapper remains PARTIAL and is not hidden by PAT-001 PASS.

## 8. 변경하지 않은 사항

- PatientMapping, identity proof, Tenant-scoped business table grants, API, route/controller, Authorization Engine and DICOM access.
- No real patient data or PHI.

## 9. 결정 및 예외

- `PAT-001-DEC-001` and `DB-009-DEC-001` remain normative.
- Global `patient_refs` scope is synthetic-only; its runtime grant is not an Authorization decision.

## 10. 잔여 위험과 후속 작업

- Do not expose the repository through an API until authenticated identity/membership, verified Tenant context and business Authorization are implemented and tested.
- PAT-002 PatientMapping work needs its own complete Acceptance and authorization-aware runtime access design before any route or grant.

## 11. 최종 판정

```text
Ticket: MEDIQ-PAT-001
Scope: P0 synthetic PatientReference domain and PostgreSQL persistence adapter/test
Changed: domain, repository port/adapter, SQL contract/security tests, test-only runtime integration and traceability records
Not changed: PatientMapping, real identity, public API, authentication, business authorization or PACS workflow
Security impact: synthetic-only namespace; minimal column-level privilege; no route or identity proof
Tests executed: `npm run test:api`, `npm run build:api`, isolated `api-db-integration-test`, full DB-008 scratch + DB-002~007 regression (details in TEST-EVIDENCE.md)
Tests not executed: public route, verified Actor/Tenant, PatientMapping, Consent/Grant authorization, real-patient or PACS E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: no API integration or business authorization; PAT-001 PASS must not be read as patient identity or Tenant authorization
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | Initial implementation record created |
| 2026-09-30 | `PASS` | DB-009 approved synthetic runtime exception verified with create/read/conflict/rollback integration |
