# MEDIQ-PACS-007 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-007` |
| 제목 | Durable PACS transfer operation state and idempotency |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — scoped internal persistence/lifecycle Acceptance |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS / Shell | Windows, PowerShell |
| Runtime | Node.js, TypeScript, Vitest, PostgreSQL in disposable Docker Compose |
| Database | DB-008 script-owned scratch PostgreSQL; clean UP, repeated apply, reset and fresh reapply |
| Data | Synthetic tenant, actor, session, study, consent and grant references only |
| Network side effect | None; no Orthanc STOW or DICOM Gateway call |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 실제 결과 | 판정 |
|---|---|---|---|---|
| `TC-PACS-007-DOM-001` | Invalid reference, digest, state, timestamp/count 및 immutable snapshot | Unit | Domain rejects malformed values; canonical semantic digest and immutable snapshots verified | `PASS` |
| `TC-PACS-007-STATE-001` | Illegal transition, preflight skip, terminal restart | Unit + PostgreSQL trigger | Legal state path accepted; direct `CREATED → STOW_STARTED` denied; `RESULT_UNKNOWN` cannot return to dispatch | `PASS` |
| `TC-PACS-007-IDEM-001` | Exact replay / semantic or key/scope conflict | Unit + PostgreSQL | Exact replay returns persisted operation; changed digest and duplicate Session/Study claim conflict | `PASS` |
| `TC-PACS-007-CONC-001` | Concurrent state claims | PostgreSQL integration | Session advisory lock + version CAS admits one transition; stale contender receives concurrency error | `PASS` |
| `TC-PACS-007-DB-001` | Persistence and state/Audit atomicity | PostgreSQL integration | Insert/read/CAS works; injected Audit failure rolls transition back to savepoint | `PASS` |
| `TC-PACS-007-RLS-001` | Missing context and cross-Tenant visibility/write | PostgreSQL security | No-context and other-Tenant reads return no row; tenant binding UPDATE denied; Forced RLS verified | `PASS` |
| `TC-PACS-007-AUD-001` | Audit failure during operation change | PostgreSQL integration | Injected Audit failure leaves prior operation state/version unchanged | `PASS` |
| `TC-PACS-007-UNK-001` | Ambiguous post-dispatch result and blind retry | Unit + PostgreSQL | `RESULT_UNKNOWN` persists after commit and rejects another dispatch transition; no retry path exists | `PASS` — reconciliation resolver not in scope |
| `TC-PACS-007-SEC-001` | Schema/grant/dependency/route boundary | Catalog + static scope review | 15 SELECT, 15 INSERT, 7 UPDATE columns; no DELETE/table-wide/PUBLIC/DDL grant; no route/provider/STOW call | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and regression

- 명령: `npm run test:api`
- 종료 코드: `0`
- 결과: 28 test files passed; 511 tests passed.
- 판정: `PASS`

### TEST-002 — Focused PACS-007 tests

- 검증 대상: `tests/api/pacs-transfer-operation.test.mjs`
- 실제 결과: 8/8 focused domain/digest/repository tests passed during the implementation run.
- 판정: `PASS`

### TEST-003 — API typecheck

- 명령: `npm run typecheck:api`
- 종료 코드: `0`
- 판정: `PASS`

### TEST-004 — Migration metadata and runner

- 명령: `npm run db:migrations:check`
- 결과: `Everything's fine`; migration journal/SQL check passed.
- 명령: `npm run test:db-migrations`
- 결과: 6/6 runner tests passed.
- 판정: `PASS`

### TEST-005 — Full disposable PostgreSQL schema and predecessor gate

- 명령: `./scripts/test-db-008-full-schema.ps1`
- 최종 종료 코드: `0`.
- 결과: clean UP/repeat, PACS-007 PostgreSQL runtime, exact grants/RLS (183 runtime column privileges), DB-009 access boundary, PAT/IAM/AUT/EXC/Consent/Grant regressions, RESET/reapply, DB-002~007 schema regressions and owned scratch cleanup all passed. Final output included:

```text
pacs007_runtime=PASS exact_replay=PASS semantic_conflict=PASS session_study_unique=PASS advisory_lock_cas=PASS audit_savepoint_rollback=PASS unknown_persisted_no_retry=PASS bilateral_tenant_rls=PASS
db008_clean_up=PASS product_tables=18 ledger=20 catalog=18|48|17|38
db008_reset_reapply=PASS product_tables=18 ledger=20
db008_prior_schema_regressions=PASS tickets=DB-002,DB-003,DB-004,DB-005,DB-006,DB-007
db008_ephemeral_cleanup=PASS
db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false
```

- 판정: `PASS`

### TEST-006 — Diff and scratch cleanup

- 명령: `git diff --check`; `docker ps --filter "name=mediq-db008-"`
- 종료 코드: `0`; diff check reported no whitespace errors (Git emitted existing LF→CRLF working-copy warnings only).
- 결과: successful DB-008 run removed its owned scratch Compose resources; no matching scratch container remained.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `RLS-001` | Tenant context missing / other Tenant | No row visible; write to immutable Tenant binding denied | `PASS` |
| `STATE-001` | Direct SQL skips Mandatory Preflight | Trigger rejects the state jump | `PASS` |
| `IDEM-001` | Reuse key with changed semantics / duplicate Session-Study | Conflict with no second operation | `PASS` |
| `AUD-001` | Audit insertion failure | State mutation rolled back; previous version remains | `PASS` |
| `UNK-001` | Result ambiguous after dispatch claim | Durable `RESULT_UNKNOWN`; no retry transition accepted | `PASS` |
| `STOW` | DICOM/PACS transfer | Not invoked by scope | `NOT RUN` |

## 5. 검증 중 발견·수정한 회귀 기대값

초기 전체 회귀에서 기존 EXC/Consent tests가 누적 runtime privilege inventory를 이전 값 `146`으로 고정하고 있었고, UPDATE 목록의 expected sort order도 새 열과 불일치했다. 테스트 기대값을 현재 approved exact inventory `183` 및 정렬된 UPDATE 열 목록으로 동기화한 후 전체 clean/reset/reapply suite가 exit `0`으로 완료됐다. 런타임 권한은 승인된 새 열의 15 SELECT/15 INSERT/7 UPDATE뿐이며 테스트는 script-owned scratch DB만 사용했다.

## 6. 실행하지 않은 시험 및 잔여 위험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Actual STOW, Orthanc destination verification, `AT-FUNC-012`, `AT-SEC-012`, `AT-E2E-003` | PACS-001 coordinator/full Mandatory Preflight는 이 Ticket 범위 밖 | Real product transfer lifecycle not yet proven | 선행 Acceptance를 갖춘 후속 Ticket; no live STOW until full gate |
| `RESULT_UNKNOWN` reconciliation | Resolver/worker intentionally excluded | Unknown state requires later bounded read-only evidence to resolve | 별도 recommendation/Acceptance 후 구현 |
| Operation-time Consent/Grant revocation fence and destination PatientID binding | Authorization/PACS coordinator integration not in scope | Internal ledger by itself is not transfer permission | 실제 STOW 전에 integration 및 Acceptance 필요 |

## 7. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Domain/API tests | `tests/api/pacs-transfer-operation.test.mjs` | Fixed synthetic UUIDs; no PHI/secret |
| PostgreSQL runtime integration | `tests/database/pacs-transfer-operation-runtime.integration.test.mjs` | Synthetic references and metadata only |
| Migration/schema | `services/api/src/database/migrations/0018_*`, `0019_*`; Drizzle schema | No credential/payload column |
| Full scratch evidence | `scripts/test-db-008-full-schema.ps1` final output above | Disposable DB; script-owned resources removed |

## 8. 결론

- 결과: `PASS` — `MEDIQ-PACS-007` scoped acceptance.
- PASS 범위: durable internal operation record, canonical idempotency, legal state/CAS, Tenant RLS, exact least-privilege grants, atomic metadata Audit and conservative `RESULT_UNKNOWN`.
- 제품 transfer/E2E 완료 주장: `아니오`.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않았다.
