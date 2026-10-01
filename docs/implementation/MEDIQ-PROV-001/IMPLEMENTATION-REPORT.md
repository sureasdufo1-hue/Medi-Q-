# MEDIQ-PROV-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PROV-001` |
| 제목 | Operation-bound pending Provenance persistence |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 상태 | `PASS (scoped)` |

## 1. 목표

PACS transfer operation에 결속된 `PENDING` Provenance row를 검증된 Tenant transaction 안에서 한 건만 멱등 기록하고, DB가 그 연계를 강제하도록 한다.

## 2. 범위

### 포함

- `provenance_records.operation_id` FK, 부분 UNIQUE와 PACS_IMPORT constraint
- 정확한 column-level SELECT/INSERT 권한 및 Tenant RLS
- DB identity를 operation/session/package/study에서 도출하는 internal repository
- exact replay, cross-tenant/no-context deny, invalid state/binding rejection
- API·DB·migration evidence 및 baseline 동기화

### 제외

- HTTP route/OpenAPI, DICOM network or PACS coordinator/STOW
- `IN_PROGRESS`/`COMPLETED`/`FAILED` transition, Integrity evidence, destination verification
- Audit event producers, unauthenticated/no-Tenant audit, global Audit completeness
- production PHI, live PACS credentials/data, cloud storage

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 결정 | `PDEC-001`; `PROV-001-DEC-001` | Recommendation and Acceptance first; internal pending-only boundary | Decision log; this report |
| 요구사항 | `REQ-PROV-001~002` | Session/source/destination traceable, no false completion | `TC-PROV-001-*` |
| 보안 | `SEC-INT-003`; `THR-019/043`; DB least privilege/RLS | Tenant isolation, server-derived bindings, no outcome promotion | DB-008 + integration |
| API·도메인 | `DATA-MODEL.md`; `DOMAIN-MODEL.md`; `ERD.md` | `PACS_IMPORT` record bound to one durable operation | Repository/domain cases |
| Acceptance | `TC-PROV-001-001~010` | schema, idempotency, negatives, privilege and rollback | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

`provenance_records.operation_id`로 영속 PACS operation에 연결하고 DB FK/부분 UNIQUE/CHECK로 관계를 강제했다. `PostgresProvenanceRepository`는 caller가 이미 검증한 Tenant transaction을 사용하며 operation ID만 입력으로 받는다. Session, Package, Study, Source Hospital, Destination Hospital은 operation/session/study/package 조인에서 도출한다. 신규 기록은 operation 상태가 `CREATED` 또는 `PREFLIGHT_PASSED`일 때만 `PENDING`으로 생성된다. operation당 단일 row를 보장하고 exact replay는 기존 row를 반환한다. 상태 전이·결과를 입력받거나 기존 Provenance를 수정·삭제하는 기능은 없다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/migrations/0020_lazy_magneto.sql` 및 `meta/_journal.json` | nullable operation FK, unique index, PACS_IMPORT check (operation/destination/study), runtime의 정확한 13-column SELECT/INSERT 부여; migration 20/21 |
| `services/api/src/database/schema/provenance.ts` | Provenance operation 관계·제약과 Drizzle schema 반영 |
| `services/api/src/provenance/persistence/provenance.repository.ts`; `postgres-provenance.repository.ts` | 내부 계약 및 parameterized pending-only writer; 고정 오류, server-side binding, replay |
| `tests/api/provenance-repository.test.mjs`; `tests/database/provenance-repository-runtime.integration.test.mjs` | 도메인/SQL 계약 및 PostgreSQL runtime/RLS/privilege Acceptance |
| `scripts/test-db-008-full-schema.ps1`; `scripts/test-db-007-evidence.ps1` | 209 privilege, catalog, fixture, Provenance constraint/operation binding 전체 게이트에 반영 |
| `services/api/Dockerfile`; 관련 기존 database regression tests | 통합시험 image 구성 및 기존 DB-002~007 privilege baseline 동기화 |
| 승인 문서 및 이 폴더의 Test Evidence | Decision/Acceptance, Data·Domain·ERD·Security·Threat Model·Implementation Plan 상태 동기화 |

## 6. 영향 분석

### Architecture

- Internal persistence groundwork only; no route or PACS side effect.

### API·Data

- Migration `0020_lazy_magneto.sql`은 runtime에 정확한 13-column `SELECT`와 13-column `INSERT`만 부여한다. 현재 전체 runtime catalog는 209 column grants이며 table-level privilege, `PUBLIC`, `UPDATE`, `DELETE`는 없다.
- 신규 PACS Provenance 행은 operation에 대해 `CREATED` 또는 `PREFLIGHT_PASSED` 이전에만 생성되며 operation id 기준 exact replay를 제공한다.

### Security·Privacy

- Tenant RLS and exact column grants are mandatory. This row is evidence bookkeeping, not Consent/Authorization/Grant and not transfer proof.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- API: `npm run test:api` — 32 files / 565 tests PASS; `npm run typecheck:api` PASS.
- Migration: `npm run db:migrations:check` PASS; `npm run test:db-migrations` — 6/6 PASS.
- Database: `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` — exit 0; clean/reset/reapply, local migration smoke, DB-002~007 regression, current DB-007 schema, Provenance no-context/cross-tenant/late-first-write/runtime privileges and cleanup PASS.
- Whitespace: `git diff --check` exit 0 (Git emitted existing CRLF normalization warnings only).

## 8. 변경하지 않은 사항

- No terminal Provenance status, no Integrity result, no Audit producer, no API or STOW.

## 9. 결정 및 예외

- `PROV-001-DEC-001`; recommendation-first scope and acceptance adopted under `PDEC-001`.

## 10. 잔여 위험과 후속 작업

- This is persistence bookkeeping only. It does not prove authorized DICOM retrieval, source package hash, dispatch, STOW, destination receipt, integrity, audit completeness, or successful transfer.
- No HTTP endpoint, operation coordinator, Provenance result transition, Integrity writer, Audit producer, or live PACS effect is wired by this Ticket.
- Follow with a separately recommended and accepted source-evidence persistence slice, then the smallest coordinator/no-STOW and destination-unchanged Acceptance. Keep actual STOW gated behind Mandatory Preflight and product security/E2E Acceptance.

## 11. 최종 판정

```text
Ticket: MEDIQ-PROV-001
Scope: Internal operation-bound PENDING PACS_IMPORT Provenance persistence, schema migration, minimum runtime privileges, Tenant RLS and PostgreSQL regression.
Changed: Schema/repository/tests/DB gates and approval/Acceptance/implementation records listed above.
Not changed: HTTP route, DICOM retrieval, coordinator, STOW, result transitions, destination verification, product Integrity/Audit lifecycle, real patient or PACS data.
Security impact: Operation binding is server-derived; forced Tenant RLS and exact 13-column SELECT/INSERT enforce least privilege; no context/cross-tenant/late creation fail closed.
Tests executed: API 32 files/565 tests; API typecheck; migration check; 6 migration runner tests; DB-008 clean/reset/reapply and DB-002~007 regressions; git diff check.
Tests not executed: Product-level A→MediQ→B E2E, live DICOM/STOW, Integrity/Provenance terminal truth, full audit completeness.
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-PROV-001/
Remaining risks: No effect-capable PACS coordinator or end-to-end transfer exists; source-evidence persistence and product-level zero-STOW/B-unchanged checks remain separate gates.
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `IN PROGRESS` | `PROV-001-DEC-001` 및 Acceptance 기록 후 구현 착수 |
| 2026-10-02 | `PASS (scoped)` | Pending-only operation-bound persistence 구현; API 565 tests 및 DB-008 full clean/reset/reapply와 DB-002~007 regression 증거 완료 |
