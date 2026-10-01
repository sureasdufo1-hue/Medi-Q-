# MEDIQ-DB-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-001` |
| 제목 | P0 Drizzle migration framework and role-isolated runner |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — migration framework 범위에 한함 |

## 1. 목표

Drizzle Kit으로 versioned SQL을 생성·검토하고, API와 분리된 일회성 `mediq_migrator`가 기존 PostgreSQL database 안의 승인 schema에서 migration을 안전하게 적용한다. 이번 Ticket은 metadata ledger와 migration 실행 framework까지만 다루며 제품 domain table을 생성하지 않는다.

## 2. 범위

### 포함

- Pinned Drizzle ORM/Kit과 migration generation/journal consistency 명령
- 명시적 Compose `migration` profile, database-only network, runtime URL 미주입, non-root/read-only one-shot image
- URL/profile/role/database validation, migration journal·file·hash 검증, advisory lock, migration별 transaction, 실패 시 rollback, migrator-owned history ledger
- Runtime의 ledger 접근 거부와 product-table count 0 검증을 포함한 반복 가능한 local smoke test

### 제외

- 승인된 17개 product schema/table, table grants, Tenant RLS, domain/API 구현, seed/data migration
- 운영 DB/PACS 사용, production migration pipeline/approval/secret management, clean-volume reset 또는 자동 destructive rollback

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `DATA-MODEL.md`, `ERD.md`, Implementation Plan §10 | Migration 기반만 준비; 승인 제품 테이블은 아직 0개 | `TC-DB-001-MIG-002`, `004`, `006` |
| 보안 | `SEC-DB-002~004`, `SECURITY-REQUIREMENTS.md` | Runtime/migrator 분리; migrator는 schema DDL만, DB-level CREATE/elevated role 없음; config fail-closed·diagnostic 최소화 | `TC-DB-001-MIG-001`, `003`, `005` |
| API·도메인 | `DOMAIN-MODEL.md`, `OPENAPI.yaml` | API/domain behavior 변경 없음 | 범위 외; DB-002 이후 |
| Acceptance | `ACCEPTANCE-TESTS.md` — P0 Migration Framework Acceptance | 설정/journal/rollback unit + PostgreSQL 반복 적용·권한 smoke | `TC-DB-001-MIG-001~007` |

## 4. 구현 결과

Drizzle Kit은 reviewed SQL 생성과 journal consistency 검사에만 사용한다. `drizzle-kit migrate` 실행은 전용 role에 database-level `CREATE`가 필요하다는 PostgreSQL permission denial로 막혔다. DB 권한을 넓히지 않고, `pg` 기반 dedicated runner로 바꾸어 기존 `public` schema 내부의 ledger/DDL만 수행하도록 했다.

Runner는 승인된 local container endpoint와 `mediq_migrator` identity를 확인하고 DB-level `CREATE`, `CREATEDB`, `CREATEROLE`, `SUPERUSER`, `BYPASSRLS`를 거부한다. Journal index/tag/timestamp/file 일치, SQL file hash, applied-history prefix를 검증한다. PostgreSQL advisory lock으로 동시 실행을 거부하고 migration file과 ledger row를 같은 transaction에서 처리한다. 예외 메시지는 fixed code 또는 SQLSTATE만 출력한다.

실행은 opt-in Compose `migration` profile에 한정하며, migrator는 API/Worker와 credential을 공유하지 않고 database network만 사용한다. Framework baseline 적용 후 migration ledger 1행은 `mediq_migrator` 소유이며 runtime role은 이를 읽지 못한다. Product table은 0개다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `package.json`, `package-lock.json`, `services/api/package.json` | ORM/Kit 고정, generation/check/test 명령 및 `pg`/Drizzle dependency |
| `services/api/Dockerfile`, `infra/docker-compose.yml` | runtime 기반 non-root migrator target과 opt-in DB-only service |
| `drizzle.config.ts`, `services/api/src/database/schema/index.ts`, `services/api/src/database/migrations/*` | schema generation boundary, empty schema placeholder, journal 및 no-op framework baseline |
| `scripts/run-database-migrations.mjs`, `scripts/test-database-migrations.ps1`, `scripts/validate-compose-baseline.ps1` | guarded runner, repeat-run/least-privilege smoke, Compose/Dockerfile boundary validator |
| `tests/database/migration-runner.test.mjs` | config/journal/hash-prefix/split/rollback unit tests |
| `docs/ACCEPTANCE-TESTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/TECH-STACK-DECISION.md`, runbooks/status/schedule/index | decision, traceability, operating procedure and current scoped status |

## 6. 영향 분석

### Architecture

- API/Worker와 분리된 opt-in one-shot migration service를 추가했다. Permanent runtime service로 동작하지 않는다.

### API·Data

- API endpoint/domain schema 변경은 없다. Operational `public.__drizzle_migrations` ledger 1개만 생성되며 승인된 17개 business table 외부의 migration metadata다.

### Security·Privacy

- Dedicated local migration URL은 ignored `.env`와 명시적 profile에만 존재한다. PHI/DICOM payload나 connection secret을 출력하지 않는다. Runtime은 migration history에 접근할 수 없다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` — DB-001 migration-framework scope only

## 8. 변경하지 않은 사항

- Product tables/grants and Tenant RLS remain for `MEDIQ-DB-002~008` and related security tickets.
- No automatic destructive down-migration is supplied. A committed migration is immutable; corrections use a reviewed forward migration. Backups/restore and production rollback operations remain separate controls.
- The test used the existing persistent local PostgreSQL volume with zero public business tables; no volume reset/recreation was performed. A fresh-volume installation test remains unverified.

## 9. 결정 및 예외

- Do not grant database-level `CREATE` to make Drizzle Kit's stock PostgreSQL `migrate` command work. Its schema creation attempt failed under the approved least-privilege role; the generated SQL remains Drizzle-authored, while application uses the reviewed custom runner.
- Drizzle Kit `push` and stock `migrate` are prohibited for this stack; `db:generate`, `db:migrations:check`, and the opt-in migration runner are the approved path.

## 10. 잔여 위험과 후속 작업

- Fresh disposable database/volume bootstrap and CI/production secret-store migration workflow are untested.
- Only an empty framework baseline is present; table ownership/grants, Tenant isolation, schema constraints and existing product-data evolution are not covered.
- Next implementation: `MEDIQ-DB-002` Organization/Tenant/Hospital schema.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-001
Scope: Drizzle-generated SQL migration framework on the existing local DB with zero product tables
Changed: Reviewed generation/check path; isolated non-root migrator; guarded transactional runner; ledger and tests/docs
Not changed: Approved 17-table schema, table grants, Tenant RLS, APIs, product workflow, production migration ops
Security impact: Dedicated schema-only role; no DB-level CREATE/elevated flags; runtime ledger access denied; credentials not logged
Tests executed: 6 migration unit tests; journal check; 2-run PostgreSQL smoke; API/config/environment regressions; audit; Compose/source checks
Tests not executed: Fresh-volume provisioning; real PostgreSQL injected-failure rollback; simultaneous lock contention; product schema/data tests
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Clean install and product schema/grant/isolation are later gates; production is not assessed
Status: PASS — migration framework scope only
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | Generated SQL runner, isolated migrator, local repeat-run and privilege evidence recorded |
