# MEDIQ-DB-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-004` |
| 제목 | Exchange session persistence schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` (scoped) |

## 1. 목표

승인된 Data Model/ERD의 `exchange_sessions` workflow-context table을 generated additive migration으로 구현하고, declared columns, FK, state/source-destination checks, indexes 및 synthetic-only negative/rollback tests를 검증한다.

## 2. 범위

### 포함

- 11 approved columns with UUID PK, nullability and timestamps without undocumented defaults
- PatientReference, source/destination Hospital and requester Actor FKs with `ON DELETE RESTRICT`
- The 12 explicitly listed state values; distinct source and destination check
- Seven declared indexes: patient_ref, source, destination, requester, state, created_at and `(destination_hospital_id,state)`
- Repeatable generated migration and transaction-scoped synthetic fixture tests
- `TC-DB-004-REG-001~008`

### 제외

- Consent, Authorization, TransferGrant and all APIs/services
- Application state transitions, terminal-state access decisions, expiry orchestration and Audit workflow
- DICOM payload, real patients, seed or operational PACS connection
- Undocumented `expires_at > created_at` or other inferred constraints

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `DATA-MODEL.md` §§15–17, §16 indexes, `ERD.md` ExchangeSession relationships, `IMPLEMENTATION-PLAN.md` §10 | Single exchange-session persistence table, states, FK, source/destination and indexes | `TC-DB-004-REG-001~008` |
| 보안 | `SECURITY-REQUIREMENTS.md` authorization/consent/session boundary; `THREAT-MODEL.md` session/state tampering | Session ID/state are not access authority; missing/invalid context remains fail closed | Schema-negative tests; product authorization deferred |
| API·도메인 | `DOMAIN-MODEL.md` ExchangeSession aggregate/state invariants; `OPENAPI.yaml` | Persisted workflow context only; state transition is application logic | schema only, no endpoints or transition service |
| Acceptance | `ACCEPTANCE-TESTS.md` session functional/security flows and DB schema gate | Test structure/constraints separately from actual consent, grant and access decisions | `TC-DB-004-REG-001~008` |

## 4. 구현 결과

Drizzle schema와 additive migration `0003_exchange-session.sql`로 승인된 `exchange_sessions` table을 추가했다. 11개 column, UUID primary key, PatientReference/source Hospital/destination Hospital/requester Actor의 4개 `ON DELETE RESTRICT` FK, 12개 허용 state 및 source/destination 불일치 CHECK, 7개 선언 index를 구현했다. 문서에 없는 column default, unique key 또는 만료시간 관계 조건은 추가하지 않았다.

격리된 로컬 DB에서 migration 재실행, 정확한 schema inventory, 모든 허용 state와 invalid state, 같은 source/destination, 잘못된 FK, parent delete 제한 및 synthetic fixture transaction rollback을 검증했다. 이전 DB-002/003 회귀 스크립트도 DB-004 적용 후 다시 통과했다. 검증된 상태는 schema Ticket 범위에만 한정한다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/exchange.ts` | ExchangeSession schema, approved states/checks/indexes |
| `services/api/src/database/schema/index.ts` | Exchange schema export |
| `services/api/src/database/migrations/0003_exchange-session.sql` | Generated additive migration |
| `services/api/src/database/migrations/meta/_journal.json` | Migration journal entry |
| `scripts/test-db-004-exchange.ps1` | Migration, constraints, inventory and rollback integration check |
| `docs/ACCEPTANCE-TESTS.md` | TC-DB-004-REG-001~008 results |
| `docs/implementation/MEDIQ-DB-004/` | Ticket report and test evidence |
| `docs/implementation/README.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md` | Ticket status and next-step tracking |

## 6. 영향 분석

### Architecture

- DB persistence foundation now contains eight of the 17 approved product tables. No API/worker/network architecture changed.

### API·Data

- Added only the approved ExchangeSession workflow-context table. No endpoint, service, state-transition engine, consent, grant, or PACS transfer was implemented.

### Security·Privacy

- Added restrictive referential constraints, finite state check, distinct source/destination check, and a schema with no DICOM payload, secret, or direct patient identity columns.
- Session ID/state do not confer authorization. Consent/Authorization/Grant checks, Tenant runtime isolation/RLS, and application-level access denial remain unimplemented and untested.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` (schema Ticket scope only; see [TEST-EVIDENCE.md](TEST-EVIDENCE.md))

## 8. 변경하지 않은 사항

- Consent/Authorization/Grant/API/Worker, transition policy, WADO/STOW and hospital A→B exchange were not changed.

## 9. 결정 및 예외

- No undocumented `expires_at > created_at` rule or additional uniqueness rule was inferred from the model.

## 10. 잔여 위험과 후속 작업

- Product authorization, Tenant RLS/grants, application workflow, PACS transfer and full P0 E2E remain open; continue with `MEDIQ-DB-005` only after confirming its approved Consent/Grant schema contract.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-004
Scope: Approved ExchangeSession schema and synthetic-only schema tests
Changed: One table, generated migration, schema export, repeatable DB integration script, acceptance/evidence records
Not changed: Consent/Authorization/Grant services, APIs, transition enforcement, RLS/grants, PACS/DICOM workflow
Security impact: Schema constraints and data minimization verified; no application authorization claim
Tests executed: DB-004 migration/schema/negative/rollback integration; DB-002/003 regressions; API tests/typecheck; app-config tests/typecheck; Compose validation/config; migration checks and diff validation (see evidence)
Tests not executed: Product API authorization, Tenant RLS/grants, WADO/STOW, PACS A→B, full P0 Acceptance
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Product-level authorization/isolation and exchange workflow remain incomplete; 9 approved tables plus grants/RLS/business workflow remain
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | 구현 기록 생성 |
| 2026-09-30 | `IN PROGRESS` | Approved schema implemented; integration evidence pending |
| 2026-09-30 | `PASS` (scoped) | DB-004 positive/negative/rollback tests and DB-002/003 regressions passed; product authorization remains out of scope |
