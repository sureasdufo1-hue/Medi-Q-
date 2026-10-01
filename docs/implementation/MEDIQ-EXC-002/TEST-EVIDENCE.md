# MEDIQ-EXC-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-002` |
| 제목 | Internal ExchangeSession persistence repository contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PARTIAL` — SQL contract and scratch-only live PostgreSQL/RLS sub-Acceptance PASS; permanent runtime use remains gated |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest, PostgreSQL 18.6 scratch container, Docker Compose |
| 대상 환경 | Local API build/unit tests; disposable DB-008 PostgreSQL scratch runtime integration; DB-002~007 existing development regression |
| 데이터 | Synthetic identifiers only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-EXC-002-PER-001` | Session persistence SQL | SQL contract/unit | exact approved 11 columns; values parameterized; round-trip domain | Passed; exact allowlist asserted | `PASS` |
| `TC-EXC-002-PER-002` | Session lookup | SQL contract/unit | validated ID bound as a parameter; only one row materialized | Passed; exact projection and bound predicate asserted | `PASS` |
| `TC-EXC-002-PER-003` | Absent or RLS-invisible row | Unit | adapter returns same `null` when query yields no row | Mocked empty result passed; live RLS not tested | `PASS` (unit only) |
| `TC-EXC-002-PER-004` | Conflict, DB failure, impossible row cardinality/corrupt row | Unit | fixed conflict/persistence error; driver data hidden | Duplicate, DB failure, multiple rows and invalid persisted state passed | `PASS` |
| `TC-EXC-002-PER-005` | Invalid lookup ID / SQL injection-shaped value | Unit | fixed domain error before SQL; no query executed | Invalid and injection-shaped IDs rejected before query | `PASS` |
| `TC-EXC-002-SEC-001` | Premature product exposure | Security/scope review | no route/provider/permanent grant; same-client Tenant and business AuthZ preconditions documented | AppModule remains health-only; no persistent grant/migration; product Authorization remains required | `PASS` (scope review) |
| `TC-EXC-002-DB-001` | Live create/read round-trip | PostgreSQL integration | `mediq_runtime` adapter create/findById uses IAM-002 same transaction; exact values round-trip | Passed in 3 disposable scratch runs | `PASS` (scratch persistence only) |
| `TC-EXC-002-DB-002` | Bilateral RLS visibility | PostgreSQL security integration | Source and destination Tenant see row; no business-auth claim | Verified active synthetic membership for A and B; both could read the session | `PASS` (RLS only) |
| `TC-EXC-002-DB-003` | Third Tenant/no-context/rollback denial | PostgreSQL security integration | C and missing-context reads return no row; missing-context insert denied; rolled-back row absent | All deny/rollback probes passed in 3 runs | `PASS` |
| `TC-EXC-002-DB-004` | Tenant GUC/pool cleanup | PostgreSQL integration | Same pooled client has no residual Tenant context after successful, denied and rollback paths | IAM-002 wrapper reset plus reused-client no-context probe passed | `PASS` |
| `TC-EXC-002-SEC-002` | Temporary exact privilege lifecycle | Security/catalog integration | Scratch-only 11-column SELECT+INSERT; revoke to exact 70-row inventory; no DDL/table-wide or permanent grant | Each of 3 runs moved inventory 70→86→70; no migration or permanent privilege | `PASS` |
| `TC-EXC-002-REG-001` | API regression | Build/unit | API build and full API tests pass | TypeScript build; 17 files / 330 tests passed | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and unit regression

- 실행 일시: 2026-09-30 local time
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: API TypeScript build PASS; Vitest 17 files passed, 330 tests passed.
- 판정: `PASS` for local unit/SQL-contract scope

### TEST-002 — Compose security boundary

- 실행 일시: 2026-09-30 local time
- 명령:

```powershell
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
```

- 종료 코드: `0`
- 핵심 결과: Compose syntax, pinned images, test profile, networks and runtime boundary validation PASS.
- 판정: `PASS`

### TEST-003 — Full DB-008 / EXC-002 runtime acceptance

- 실행 일시: 2026-09-30 local time
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: DB-008 clean migration, repeat application, reset, fresh re-application, DB-002~007 regressions and ephemeral cleanup PASS. `TC-EXC-002-DB-001~004` and `TC-EXC-002-SEC-002` passed in three disposable scratch cycles. Each cycle granted exactly the 11 `SELECT` and 11 `INSERT` columns needed for the internal adapter, then revoked the temporary grants and verified catalog restoration from 86 to the pre-test 70 rows. No permanent migration or Exchange grant was applied.
- Persistent development DB effect: this established DB-008 command also ran its documented DB-002~007 migration smoke/regressions against the local development database; ledger remained 12 rows and synthetic regression rows rolled back. It did not reset the `mediq` volume.
- 판정: `PASS` for DB-008 + EXC-002 scratch persistence/RLS sub-scope, not the full Exchange gate.

### TEST-004 — Source and PowerShell syntax / whitespace

- 실행 일시: 2026-09-30 local time
- 명령:

```powershell
node --check tests/database/exchange-session-repository-runtime.integration.test.mjs
$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/test-db-008-full-schema.ps1),[ref]$tokens,[ref]$errors) | Out-Null; if($errors.Count -gt 0){$errors | ForEach-Object Message; exit 1}
git diff --check
```

- 종료 코드: `0` for each check.
- 핵심 결과: Node and PowerShell syntax PASS; no whitespace error (Git emitted line-ending informational warnings for the pre-existing dirty worktree).
- 판정: `PASS`

### TEST-005 — Initial harness false-negative and correction

- 실행 일시: 2026-09-30 local time
- 명령: `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` (two initial attempts)
- 결과: PowerShell string `[0]` indexing compared only the first character of a scalar inventory string and produced a false-negative. SQL returned `true|86|11|11|0` after grant and `true|70|6|0|0` after revoke. The disposable scratch cleanup path ran; no product DB grant/migration was involved. The comparison was changed to an array-safe full-string check before the successful TEST-003 run.
- 민감정보: Diagnostics contain only synthetic fixtures and privilege counts; no credential/raw database output was recorded.
- 판정: `CORRECTED`; final evidence is TEST-003.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-EXC-002-PER-004` | Duplicate Session ID | Fixed `EXCHANGE_SESSION_CONFLICT`; driver detail hidden | `PASS` |
| `TC-EXC-002-PER-004` | Database/row-mapping failure | Fixed `EXCHANGE_SESSION_PERSISTENCE_FAILED`; invalid result denied | `PASS` |
| `TC-EXC-002-PER-005` | Malformed ID / injection-shaped lookup | Fixed domain error; no query issued | `PASS` |
| `TC-EXC-002-DB-003` | Unrelated Tenant/no-context/rollback | No session row returned to unrelated Tenant or without context; writes without Tenant are denied; rollback row absent | `PASS` — scratch DB |
| `TC-EXC-002-SEC-002` | Attempted privilege retention after probe | Temporary SELECT/INSERT grants revoked; exact 70-row baseline restored | `PASS` — 3 scratch runs |
| `TC-EXC-002-SEC-001` | RLS visibility treated as product Authorization | No route/provider or permanent privilege exists; no business access asserted | `PASS` — scope review |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Session create/read business Authorization and protected HTTP BOLA/safe-error | This Ticket adds only persistence/RLS test; no Session operation-specific Authorization or product endpoint | No evidence that any Actor may create/read an ExchangeSession | Implement EXC-003/004/006 and AUT HTTP fail-closed Acceptance before product runtime grant/route |
| Permanent `mediq_runtime` Exchange privilege | DEC-002 intentionally limits grants to disposable scratch | Repository is not enabled for product runtime | Separate object/action Authorization review and permanent least-privilege decision/migration |
| Consent/Grant/PACS/E2E | Outside EXC-002 repository scope | No full Exchange or A→B success claim | Consent/Grant, DICOM, Preflight and PACS tickets / `GATE-IMP-04` |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit/build output | `npm run test:api`, exit 0; TypeScript build + 17 files / 330 tests | Synthetic IDs only; no payload/secret |
| Runtime Acceptance | `scripts/test-db-008-full-schema.ps1 -EnvFile .env`, exit 0; three scratch cycles and catalog 86→70 | Synthetic IDs only; disposable DB; no payload/secret |

## 7. 결론

- 결과: `PARTIAL` — SQL contract and scratch-only live repository/RLS Acceptance passed; permanent runtime use remains gated.
- PASS를 주장할 수 있는 범위: `TC-EXC-002-PER-001~005`, `TC-EXC-002-DB-001~004`, `TC-EXC-002-SEC-001~002` (repository/RLS/scratch privilege lifecycle only).
- Live persistence code-path and RLS were tested in disposable DB; business Authorization, HTTP/API access, persistent grants and full Exchange workflow are not claimed. `GATE-IMP-04` remains NOT EXECUTED.
