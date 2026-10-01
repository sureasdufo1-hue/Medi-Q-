# MEDIQ-DB-009 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-009` |
| 제목 | P0 runtime least privilege and Tenant RLS database boundary |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — DB privilege/RLS and IAM-002 identity context PASS; safe HTTP error boundary and business Authorization remain unimplemented |

## 1. 목표

Runtime DB access를 deny-by-default로 만들고, P0에서 실제 필요한 합성 PatientReference 권한만 열며, Tenant-owned/participating 관계의 row visibility를 PostgreSQL RLS로 제한한다. 이 DB 경계를 업무 Authorization으로 오인하지 않도록 요구사항·위협·Acceptance 경계를 확정한다.

## 2. 범위

### 포함

- `DB-009-DEC-001` 및 Security/Architecture/Data/Threat/Acceptance 기준 동기화
- Runtime role의 non-owner/non-superuser/NOINHERIT/NOBYPASSRLS 경계 및 객체별 privilege
- 전역 합성 전용 `patient_refs`의 column-level SELECT/INSERT와 DB synthetic-code CHECK
- Tenant-owned/participating 16개 product table의 ENABLE+FORCE RLS 및 명시적 runtime/migrator policies
- Transaction-local Tenant setting의 fail-closed, bilateral exchange visibility, third-Tenant denial, commit/rollback reset, mutable-GUC residual을 위한 disposable DB Acceptance
- DB-002~007 재회귀 및 test-only PAT-001 repository integration target

### 제외

- 인증, membership resolver, 업무 Authorization Engine, Consent/Grant/Scope decision
- API transaction/pool wrapper, API safe-error mapping, user-facing route/controller
- `patient_mappings` 등 Tenant-scoped product tables의 runtime CRUD grants
- PACS Preflight/STOW, real patient data, production context signing/keying
- PatientReference public API 및 PatientMapping workflow

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `DB-009-DEC-001` | exact runtime grants, synthetic global reference exception, RLS limits | migration `0008`; scratch DB |
| 보안 | `SEC-DB-005~006`, `SEC-TEN-005`, `SEC-AUTHZ-010~011` | DB privileges/RLS are defense-in-depth; AuthZ is separate | `TC-DB-009-PRIV-*`, `RLS-*`, `AUTH-*` |
| Architecture/Data/Threat | `SYSTEM-ARCHITECTURE.md`, `DATA-MODEL.md`, `THREAT-MODEL.md` DB-009 amendments | trusted context flow, 16 RLS relations, `patient_refs` exception, residual risk | catalog, positive/negative probes |
| Acceptance | `TC-DB-009-PRIV-001~005`, `RLS-001~002`, `RLS-004~005`, `RLS-007~009` | database enforcement evidence | `scripts/test-db-008-full-schema.ps1` |
| Acceptance deferred | `TC-DB-009-RLS-003` safe HTTP error; `AUTH-001~004` business authorization | IAM-002 resolves the separate application context/pool portion of `RLS-006` | `MEDIQ-IAM-002` evidence; remaining gates not implemented/tested |
| PAT trace | `TC-PAT-001-PER-003` | only global synthetic PatientReference create/read/conflict/rollback | isolated test-profile integration container |

## 4. 구현 결과

Migration `0008_black_mandrill.sql` adds the P0 synthetic PatientReference CHECK, applies and forces RLS on the 16 Tenant-owned/participating product relations, creates explicit `mediq_runtime` tenant policies and separate trusted `mediq_migrator` maintenance policies, revokes broad runtime/PUBLIC table access and grants only the five `patient_refs` columns for SELECT and INSERT.

Runtime has no ownership, database/schema DDL, table-wide business grants, migration-ledger access, role membership/elevation or RLS bypass. `patient_refs` is intentionally not RLS-protected and is usable only for `MQ-TEST-*`; it remains outside identity proof and business authorization.

Disposable PostgreSQL Acceptance confirms Tenant A/B/C visibility, exact bilateral Exchange row visibility, wrong-Tenant writes denied, missing/malformed context fail-closed, transaction-local context cleared after commit and rollback, and the same-role mutable custom-setting residual. The approved P0 boundary records this residual rather than claiming cryptographic context integrity or SQL-injection prevention.

The DB-009 test profile executes the PAT-001 PostgreSQL repository against the actual `mediq_runtime` URL and confirms synthetic create/read/unique conflict/rollback. The domain/repository is still not wired into an API route.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/tenant-rls.ts` and affected schema files | shared transaction-local context expression; 16 explicit policy declarations; synthetic reference CHECK |
| `services/api/src/database/migrations/0008_black_mandrill.sql` and journal/snapshot | FORCE RLS, explicit policies and least-privilege grants |
| `scripts/test-db-008-full-schema.ps1` | role/catalog/DDL/grant/RLS/commit-rollback/PAT integration Acceptance; complete scratch reset/reapply and DB-002~007 regression |
| `tests/database/patient-reference-runtime.integration.test.mjs` | test-only actual runtime adapter create/read/conflict/rollback |
| `services/api/Dockerfile`, `infra/docker-compose.yml`, `scripts/validate-compose-baseline.ps1` | constrained test-profile target and runtime-only database URL boundary |
| `scripts/test-db-003-patient.ps1`, `scripts/test-db-004-exchange.ps1`, `scripts/test-db-005-consent-grant.ps1`, `scripts/test-db-006-imaging.ps1`, `scripts/test-db-007-evidence.ps1` | normalize synthetic fixture GUID code segments to the approved uppercase grammar |
| `docs/POLICY-DECISION-LOG.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/SYSTEM-ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/THREAT-MODEL.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/IMPLEMENTATION-PLAN.md` | decision and normative boundary / actual Acceptance status |

## 6. 영향 분석

### Architecture

- Adds a database defense-in-depth boundary, not an authentication or business authorization service.
- Follow-up: `MEDIQ-IAM-002` now implements/tests the backend verified-identity → Tenant transaction wrapper. Protected business-table grants remain absent, so unimplemented workflows fail closed.

### API·Data

- No API, route, controller, or public PatientReference endpoint was added.
- No data model entity or product table was added; migration adds policy/privilege controls and one CHECK.
- `patient_refs` is global only for synthetic test references; no real patient data may enter it.

### Security·Privacy

- Runtime can read/insert only the five approved PatientReference columns; cannot update/delete/truncate, own schema objects, execute DDL, read migration history, or bypass RLS.
- RLS does not decide Actor/Consent/Grant/Action/Resource/Recipient/expiry authorization.
- Same-role arbitrary SQL can mutate the custom Tenant GUC; accepted for synthetic-only capstone P0, prohibited as a production/real-patient claim.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Database privilege/RLS gate and DB-002~007 schema regression: PASS in final disposable scratch run.
- Overall Ticket: `PARTIAL` because API safe-error handling and business Authorization Acceptance do not exist. The later IAM-002 implementation closes only the identity-context/pool portion.

## 8. 변경하지 않은 사항

- No API/Worker runtime workflow or protected-table business grant.
- No authorization inference from RLS visibility, patient UUID, Session, Consent or Grant identifiers.
- No production/real-patient deployment or signed context guarantee.

## 9. 결정 및 예외

- `DB-009-DEC-001` is normative.
- `patient_refs` outside Tenant RLS is a documented global synthetic-only exception.
- `mediq_migrator` has separate explicit maintenance policies; it remains a trusted migration identity and is not injected into API/Worker runtime.

## 10. 잔여 위험과 후속 작업

- `MEDIQ-IAM-002` closes credential-backed Actor/Tenant resolution and same-client pool cleanup; see its separate evidence.
- Add API-level generic fail-closed error tests before any protected HTTP operation.
- Implement business Authorization separately from RLS before any Tenant-scoped runtime grants, route, DICOM retrieval, or PACS side effect.
- Before real patient/production use, replace/review mutable-GUC context with signed/non-forgeable binding or equivalent stronger isolation and operational evidence.
- Keep `TC-DB-009-AUTH-001~004` NOT RUN until those paths exist.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-009
Scope: P0 DB role/privilege, synthetic PatientReference exception, Tenant RLS database enforcement and evidence
Changed: migration 0008, 16 explicit ENABLE+FORCE RLS policies, exact runtime grants, synthetic code CHECK, scratch Acceptance and documentation
Not changed: business API/AuthZ, PatientMapping CRUD, PACS workflow (identity context was implemented separately under IAM-002)
Security impact: least-privilege runtime and fail-closed DB Tenant visibility; mutable custom-GUC limitation explicitly retained
Tests executed: full disposable DB-008 clean/repeat/reset/reapply + DB-002~007 regressions; DB-009 privilege/RLS and PAT-001 runtime integration; API/build/DB migration/Compose checks (see evidence)
Tests not executed: authenticated business API Tenant spoofing, Consent/Grant authorization, API safe error mapping, DICOM Preflight/STOW authorization
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: no safe HTTP error mapping or business Authorization; arbitrary SQL as runtime can change the custom Tenant GUC; global patient_refs is synthetic-only
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | DB privilege/RLS implementation and disposable Acceptance passed; application identity/authz integration deferred |
| 2026-09-30 | `PARTIAL` | Follow-up: IAM-002 separately passed identity context and pool/RLS Acceptance; DB-009 still awaits safe HTTP error and business Authorization |
