# MEDIQ-DB-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-004` |
| 제목 | Exchange session persistence schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` (scoped) |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell host; local Docker Compose |
| Runtime·Toolchain | Node.js/NPM workspace, Drizzle Kit, PostgreSQL 18.6 pinned image |
| 대상 환경 | Local isolated database network |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-DB-004-REG-001` | Migration up/re-run, approved table list | Integration | One exchange_sessions table; clean idempotent ledger | Applied/re-run twice; ledger=4 and total approved product tables=8; DB-002/003 regressions also retained | `PASS` |
| `TC-DB-004-REG-002` | 11 columns, PK, types/nullability/defaults | Integration | Exact schema; nullable expiry/completion; no undocumented defaults | `db004_schema=PASS`; 11 columns, 1 PK, exact allowlist and no column defaults | `PASS` |
| `TC-DB-004-REG-003` | Four parent FKs and delete policy | Integration / Security | Missing references denied; all parent deletes RESTRICTed | `invalid_fk=4`, `delete_restrict=4`; all denied as expected | `PASS` |
| `TC-DB-004-REG-004` | Twelve enumerated states | Integration | All approved state strings accepted; unknown state rejected | `states=12`, invalid state rejected by CHECK | `PASS` |
| `TC-DB-004-REG-005` | Source/destination separation | Integration / Security | Equal hospitals rejected | Same-hospital source/destination rejected by CHECK | `PASS` |
| `TC-DB-004-REG-006` | Seven declared indexes | Integration | All six single-column plus destination/state composite index exist | `explicit_indexes=7`; exact declared inventory found | `PASS` |
| `TC-DB-004-REG-007` | Authority and data minimization | Security / Schema | No payload/secret/extra identity fields; Session ID/state alone grant no access | Exact schema allowlist excludes payload/secret/direct identity fields; application authorization was not implemented or tested | `PASS — schema only` |
| `TC-DB-004-REG-008` | Synthetic session records and rollback | Integration | Valid parent-linked sessions accepted; no fixture persists | 12 synthetic state fixtures accepted; rollback verified 0 persistent synthetic rows | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — ExchangeSession migration and constraints

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Generated migration, schema metadata, state/source/destination constraints and rollback
- 명령:

```powershell
.\scripts\test-db-004-exchange.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: migration apply attempt 1/2 PASS; ledger=4 owned by `mediq_migrator`; approved product tables=8; DB-004 exact schema, synthetic constraints, and rollback PASS.
- 판정: `PASS`

### TEST-002 — Prior schema regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령: `scripts/test-db-002-registry.ps1 -EnvFile .env` and `scripts/test-db-003-patient.ps1 -EnvFile .env`
- 종료 코드: `0`
- 핵심 결과: DB-002 `tables=5 columns=39 primary_keys=5 explicit_indexes=11 checks=5 foreign_keys=6`, synthetic `unique=5 check=5 foreign_key=6 delete_restrict=3`, rollback rows=0. DB-003 `scope_tables=2 columns=13 primary_keys=2 explicit_indexes=4 checks=2 foreign_keys=2 unique=3`; synthetic allowed statuses/mappings, invalid FK/unique/check, RESTRICT; rollback rows=0. Both passed with DB-004 present, migration ledger=4 and approved tables=8.
- 판정: `PASS`

### TEST-003 — Workspace, migration, API/config and Compose regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령 및 결과:
  - `npm run db:migrations:check` — exit 0, Drizzle migration check reports everything fine.
  - `npm run test:db-migrations` — exit 0, 6/6 tests passed.
  - `npm run typecheck:api` — exit 0.
  - `npm run test:api` — exit 0, 1 file / 3 tests passed (includes API build).
  - `npm run typecheck:app-config` — exit 0.
  - `npm run test:app-config` — exit 0, 8/8 tests passed.
  - `scripts/validate-compose-baseline.ps1` — exit 0.
  - `docker compose --env-file .env -f infra/docker-compose.yml config --quiet` — exit 0.
  - PowerShell AST parse of `scripts/test-db-004-exchange.ps1` — PASS.
  - `git diff --check` — exit 0; Git printed existing LF→CRLF working-copy warnings only.
- 판정: `PASS` for listed checks.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-DB-004-REG-003/004/005` | Missing parent, invalid state, same source/destination, restricted delete | All four invalid FKs, invalid state, same-hospital pair, and four RESTRICT deletes were rejected | `PASS` |
| Consent/Grant/terminal-state authorization | Session alone used as access authority | Out of DB-004; must be enforced by later services | `NOT RUN — deferred` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Application authorization, transition enforcement, Tenant RLS/grants, PACS A→B and full P0 E2E | Outside DB-004 schema scope; downstream implementation remains pending | Schema PASS must not be mistaken for product workflow/security PASS | Implement under approved later Tickets and run their acceptance gates |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Console summaries from TEST-001~003 | Commands/results recorded above; no raw SQL, patient identifiers, credentials, or payload retained | Synthetic-only pass/count output |

## 7. 결론

- 결과: `PASS` (schema Ticket scope only)
- PASS를 주장할 수 있는 범위: DB-004 schema/migration/constraints/synthetic rollback; application authorization and end-to-end exchange are not PASS
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
