# MEDIQ-EXC-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-002` |
| 제목 | Internal ExchangeSession persistence repository contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — SQL contract and scratch-only live PostgreSQL/RLS Acceptance PASS; permanent runtime privilege, business Authorization and API remain closed |

## 1. 목표

승인된 `exchange_sessions` schema에 대해 내부 repository port와 parameterized PostgreSQL adapter를 구현하고, 실제 DB 동작은 `EXC-002-DEC-002`에 따라 disposable synthetic scratch DB에서 검증한다. 제품 API, permanent runtime DB privilege 및 business Authorization은 열지 않는다.

## 2. 범위

### 포함

- `EXC-002-DEC-001` 및 `TC-EXC-002-*`의 선행 기록
- `EXC-002-DEC-002`에 따른 scratch-only PostgreSQL/RLS integration Acceptance
- 새 domain Session 저장 및 Session ID 단건 조회의 repository contract
- 기존 11개 schema column만 사용하고 모든 값은 bind parameter로 전달
- DB conflict/failure와 손상된 결과를 고정 오류로 매핑
- 임시 exact 11-column `SELECT`/`INSERT`를 사용하는 `mediq_runtime` 실DB 시험; 매회 권한 회수 후 70-row privilege baseline 복원 확인
- SQL contract/unit, runtime database integration 및 API 회귀시험

### 제외

- Persistent migration/schema/role grant/RLS 변경 및 product runtime DB enablement
- `Pool` 생성·release, Tenant context 설정, transaction lifecycle
- Controller/API/AppModule 등록, 인증·membership·object/action Authorization
- State transition, Consent/Grant, Audit writer, DICOM/PACS side effect

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `EXC-002-DEC-001/002` | 내부 adapter 및 SQL contract; live 시험은 scratch-only 임시 privilege로 제한하고 permanent runtime/API는 계속 차단 | repository port/adapter, disposable PostgreSQL/RLS Acceptance, no module wiring |
| 요구사항 | `REQ-EXC-001~002`, `REQ-EXC-005` | session persistence; 12-state baseline including `CANCELLED` | `TC-EXC-002-PER-*`; EXC-005 lifecycle remains planned |
| 보안 | `SEC-API-002`, `SEC-TEN-005`, `DB-009-DEC-001` | RLS is not business auth; verified same-tenant transaction required; scratch grant is non-product test setup | `TC-EXC-002-SEC-*`, `TC-EXC-002-DB-*` |
| Schema | `MEDIQ-DB-004`, `TC-DB-004-REG-001~008` | Reuse approved exact 11-column table and existing RLS | no migration; allowlisted SQL columns |
| Deferred gates | `TC-DB-009-RLS-003/006`, `AUTH-001~004`, `THR-002` | Session create/read business Authorization, protected HTTP safe-error/BOLA and product API remain open | no product route or permanent runtime grant; RLS is not business Authorization |

## 4. 구현 결과

내부 `ExchangeSessionRepository`는 생성 및 ID 단건 조회를 제공한다. PostgreSQL adapter는 checked-out client의 query만 사용하고 승인된 11개 column을 정확히 명시한다. UUID/Session 값은 bind parameter로 전달하며 결과 row는 domain으로 재구성한다. conflict, DB 오류, 불가능한 행 수와 손상된 row는 고정 비노출 오류가 된다.

`MEDIQ-DB-008`의 disposable PostgreSQL에서 IAM-002의 동일 Actor/Tenant transaction client를 통해 실제 `mediq_runtime` create/read를 시험했다. Source/Destination Tenant row visibility, unrelated Tenant/no-context denial, rollback, same-client GUC reset 및 pool 재사용을 확인했다. Adapter 실DB Acceptance는 세 번 실행해 모두 통과했다. 테스트 동안에만 전체 11-column `SELECT`/`INSERT`를 임시 부여했으며 각 실행 후 기존 70 privilege-row baseline으로 회수됨을 검증했다. 어떠한 persistent migration/grant나 AppModule/API 연결도 추가하지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/exchange/application/exchange-session.repository.ts` | 내부 persistence port와 verified Tenant/AuthZ caller precondition |
| `services/api/src/exchange/persistence/postgres-exchange-session.repository.ts` | Parameterized INSERT/SELECT adapter, allowlisted projection, generic errors |
| `tests/api/exchange-session-repository.test.mjs` | SQL columns/parameters, error paths, state round-trip, malformed-key cases |
| `tests/database/exchange-session-repository-runtime.integration.test.mjs` | Scratch runtime role, IAM-002 context, repository round-trip, bilateral RLS/denial/rollback/pool Acceptance |
| `services/api/Dockerfile`, `infra/docker-compose.yml`, `scripts/validate-compose-baseline.ps1` | Test-only image/env allowlist for scratch Exchange fixture |
| `scripts/test-db-008-full-schema.ps1` | Temporary exact Exchange grants, isolated Acceptance invocation, column-level revoke and 70-row baseline assertion |
| `docs/POLICY-DECISION-LOG.md` | `EXC-002-DEC-001/002`; scratch-only runtime Acceptance and permanent grant/API gate |
| `docs/REQUIREMENTS.md`, `docs/ACCEPTANCE-TESTS.md` | 12-state baseline and repository Acceptance |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/implementation/README.md` | Phase/Ticket traceability and status |
| `docs/implementation/MEDIQ-EXC-002/*` | Implementation report and test evidence |

## 6. 영향 분석

### Architecture

- Internal application port + PostgreSQL adapter only; no DI provider/controller registration.

### API·Data

- Existing schema only; no OpenAPI, migration, runtime grant, or persistent test data.

### Security·Privacy

- Adapter accepts a checked-out transaction client but does not create one or set Tenant context. The test used IAM-002 verified membership and its transaction wrapper; product callers still require exact object/action Authorization.
- Session ID/state remain non-authoritative; bilateral RLS visibility does not replace business Authorization or grant a user access.
- Temporary full-column privileges existed only in disposable DB-008 scratch, were revoked after every run, and the catalog returned to the approved 70 rows. No permanent runtime access was enabled.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- `npm run test:api`: TypeScript build PASS; 17 files / 330 tests PASS.
- `scripts/validate-compose-baseline.ps1 -EnvFile .env.example`: PASS.
- `scripts/test-db-008-full-schema.ps1 -EnvFile .env`: full DB-008 scratch/reset/reapply + DB-002~007 regressions PASS; EXC-002 live integration passed 3/3 times and each run restored runtime privilege inventory 86→70.
- `git diff --check`: exit 0; no whitespace errors (line-ending informational output exists for the pre-existing dirty worktree).

## 8. 변경하지 않은 사항

- Persistent `mediq_runtime` grant, RLS policy, migration/schema, API/OpenAPI and application wiring changes. Scratch-only test grant was temporary and revoked.
- Verified Actor/Tenant context, Authorization, Consent, lifecycle, audit and DICOM transfer.

## 9. 결정 및 예외

- `EXC-002-DEC-001/002`를 따른다. DB-004 schema evidence는 재사용하며 EXC-002에서 schema PASS를 중복 주장하지 않는다. Scratch persistence/RLS Acceptance does not authorize product runtime access.

## 10. 잔여 위험과 후속 작업

- Permanent live persistence remains disabled until Session create/read object/action Authorization, protected HTTP safe-error/BOLA, and a separate permanent privilege review pass.
- RLS-visible Session metadata is not authorization. `EXC-003/004/006`, Consent/Grant workflow and full Exchange Acceptance remain required.

## 11. 최종 판정

```text
Ticket: MEDIQ-EXC-002
Scope: Internal repository SQL contract plus scratch-only PostgreSQL/RLS integration; product runtime persistence remains gated
Changed: port/adapter, exact parameterized SQL projection, generic errors, scratch-only runtime Acceptance, documentation and `CANCELLED` baseline correction
Not changed: persistent grants/migration, API, business Authorization, lifecycle writes, PACS
Security impact: temporary exact grants only in disposable scratch DB; revoked each run and 70-row baseline restored; no route/provider
Tests executed: API build/regression 17 files / 330 tests; Compose validation; DB-008 full reset/reapply and DB-002~007 regressions; EXC-002 scratch integration 3/3 with privilege restore; `git diff --check`
Tests not executed: Session create/read business Authorization, protected HTTP BOLA/safe-error, permanent runtime persistence, Consent/Grant workflow, PACS
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: No product caller; permanent access awaits object/action AuthZ and protected HTTP gates
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | DEC-002 및 Acceptance 선기록; SQL contract와 scratch live PostgreSQL/RLS sub-Acceptance 3/3 PASS; permanent runtime privilege/API는 차단 유지 |
