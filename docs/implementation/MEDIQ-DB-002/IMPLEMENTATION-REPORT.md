# MEDIQ-DB-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-002` |
| 제목 | P0 Organization Tenant Hospital registry schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — Ticket scope only |

## 1. 목표

승인된 Data Model/ERD의 `organizations`, `tenants`, `hospitals`, `hospital_endpoints`, `actors` 5개 registry table을 Drizzle schema와 reviewed SQL migration으로 구현한다. Tenant ownership FK/unique/check/index, endpoint metadata와 synthetic Actor identity reference를 검증하며 다른 12개 product table·seed·API는 포함하지 않는다.

## 2. 범위

### 포함

- DB-002 승인 범위 5개 table의 UUID PK, columns, explicit FK/UNIQUE/CHECK/index와 `ON DELETE RESTRICT`
- Generated migration을 opt-in least-privilege runner로 적용하고 기존 migration history를 보존
- Synthetic-only constraints/seed-compatibility test 및 implementation traceability

### 제외

- `patient_refs` 등 나머지 12개 business table, runtime/API repositories, Tenant RLS, organization/hospital seed
- Data Model에 enumerated values가 없는 `organization_type`, hospital/actor `status`에 임의 CHECK values 추가

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `DATA-MODEL.md` §§7–11, `ERD.md` §§3–5, Implementation Plan §10 | 고정된 5개 registry table과 declared keys/relations | `TC-DB-002-REG-001~008` |
| 보안 | `SECURITY-REQUIREMENTS.md` §14 및 DB roles; `THREAT-MODEL.md` tenant boundary | Registry metadata only; endpoint credential 금지, runtime/migrator 분리 유지. Row-to-row tenant consistency는 DB-008/domain authorization에 trace | `TC-DB-002-REG-003`, `006`, `008` |
| API·도메인 | `DOMAIN-MODEL.md` §§3–5, `OPENAPI.yaml` | API/runtime access 없음; Actor는 application-level identity reference | DB-002 schema only |
| Acceptance | `ACCEPTANCE-TESTS.md` — Organization/Tenant/Hospital registry | Migration up/re-run, exact table inventory, FK/UNIQUE/CHECK/index and synthetic transaction rollback | `TC-DB-002-REG-001~008` |

## 4. 구현 결과

Drizzle schema와 generated `0001_registry-core.sql`에 정확히 5개 registry table, 39개 documented columns, 5개 primary key, 6개 FK, 5개 unique key, 5개 명시 CHECK, 11개 secondary index를 적용했다. 모든 FK는 `ON DELETE RESTRICT`이며 UUID/timestamp defaults나 secret/credential columns를 추가하지 않았다. Approved Data Model에 정의된 허용값만 CHECK로 강제했다.

실제 DB 통합시험은 전체 column shape/nullability/default 부재, table/index/check/FK inventory, 유효 synthetic fixture, 중복·invalid FK·invalid CHECK 거부, RESTRICT delete, rollback 후 persistent test row 0개를 확인했다. Migration runner는 apply/re-run과 migration owner/history 및 runtime ledger denial도 재확인했다.

Approved Data Model에는 `organization_type`, hospital `status`, actor `status` 전체 허용값이 없다. 이 Ticket은 값을 추정하거나 undocumented CHECK를 추가하지 않았다. 이 세 enumeration과 독립 FK만으로 표현된 Tenant/Organization·Actor/Hospital pair consistency의 최종 결정은 DB-008/full-schema gate 이전에 필요하다. 본 Ticket의 범위에는 임의 enum, composite constraint, RLS, grants, API 또는 seed가 포함되지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/registry.ts` | 5개 승인 registry table의 Drizzle schema |
| `services/api/src/database/schema/index.ts` | registry schema export |
| `services/api/src/database/migrations/0001_registry-core.sql` | generated, reviewed additive migration |
| `services/api/src/database/migrations/meta/_journal.json` | migration index 1 추가 |
| `scripts/test-db-002-registry.ps1` | schema metadata 및 synthetic DB constraint/rollback integration test |
| `docs/ACCEPTANCE-TESTS.md` | TC-DB-002-REG-001~008 결과 연결 |
| `docs/implementation/MEDIQ-DB-002/` | Ticket report와 test evidence |
| `docs/implementation/README.md`, execution/status docs | Ticket 상태 및 현재 진행 기준 동기화 |

## 6. 영향 분석

### Architecture

- 기존 least-privilege migration runner만 사용한다. DB-001 history를 보존한 additive schema migration이다.

### API·Data

- 승인된 첫 5개 table만 생성했다. API, product seed 및 나머지 12개 table은 변경하지 않았다.

### Security·Privacy

- Tenant registry와 Actor identity reference만 저장하며, 이 row 자체가 authorization을 부여하지 않는다.
- `base_url`은 endpoint metadata이며 이번 Ticket에서 endpoint 호출은 하지 않는다. Credential은 저장하지 않는다.
- RLS 및 runtime product-table grants는 이 Ticket에 포함되지 않았고 후속 Ticket 전까지 업무 데이터 접근으로 사용하지 않는다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` — DB-002 declared schema and synthetic registry constraints only

## 8. 변경하지 않은 사항

- Product seed나 API endpoint를 추가하지 않는다.
- Approved value list가 없는 enum-like field에 CHECK values를 임의로 추정하지 않는다.

## 9. 결정 및 예외

- `organization_type`, hospital `status`, actor `status` enum을 추정하지 않는다. 승인 문서에 명시된 enumerations만 CHECK로 강제하고, missing allowed values는 DB-008 전에 결정 대상으로 남긴다.
- Organization/Tenant and Actor/Hospital cross-row consistency is not guaranteed by the independently documented foreign keys. DB-008/domain authorization review must decide whether additional composite constraints are required.

## 10. 잔여 위험과 후속 작업

- `organization_type`, hospital/actor status allowed values 미정.
- Organization/Tenant 및 Actor/Hospital cross-row tenant consistency, RLS, runtime schema/table grants는 구현하지 않는다.
- Migration 적용 및 local integration은 통과했지만 fresh-volume provisioning, concurrent migrator contention, real-Postgres DDL error injection, product API authorization은 후속 시험이다.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-002
Scope: P0 registry schema (5 tables) and synthetic DB constraint verification
Changed: Drizzle schema, generated migration, schema integration test and traceability docs
Not changed: Other 12 tables, API, seed, RLS, runtime product grants
Security impact: FK/unique/approved CHECK/RESTRICT enforced; no secret columns; no RLS/grants
Tests executed: Migration repeat-run smoke; schema metadata; synthetic positive/negative transactions; rollback; runner unit tests; typecheck
Tests not executed: Fresh-volume provisioning, concurrent lock contention, real DDL failure injection, API authorization
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Unspecified status/type enumerations and cross-row tenant consistency are DB-008 decisions
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `IN PROGRESS` | Scope and traceability recorded before implementation |
| 2026-09-30 | `PASS` | Five-table registry migration, synthetic constraints, repeat-run and rollback evidence recorded |
