# MEDIQ-GRT-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-002` |
| 제목 | TransferGrant persistence and scratch database acceptance |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — scoped internal persistence only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS / Shell | Windows, PowerShell 7.6.5 |
| Runtime·Toolchain | Node.js v24.18.0; npm 11.16.0; Docker Engine 29.8.0 |
| 대상 환경 | Local build/unit; disposable Docker Compose DB-008 PostgreSQL scratch; configured local schema regression |
| DB role | Scratch integration: `mediq_runtime`; migration/bootstrap performed by existing DB-008 harness |
| 데이터 | Synthetic DB-008 Patient/Actor/Tenant/Hospital/Session/Consent/Grant/Package fixtures only |
| 지속 privilege baseline | 126 column privileges; GRT test adds 16 scratch-only grants then restores 126 |

DB-008's clean and reset/reapply Acceptance each ran the GRT test in a fresh disposable project. The harness also ran the existing additive migration smoke and DB-002~007 transaction-rollback regressions. No local `.env` contents or credential values were captured.

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-GRT-002-PER-001` | Runtime privilege creep; Grant RLS | Security / DB | 126 baseline + exactly 16 scratch-only columns; forced RLS; no broad grants | Two runs observed 142 temporary rows and forced RLS on both Grant tables | `PASS` |
| `TC-GRT-002-PER-002` | Persistence/readback scope | Integration | ACTIVE Grant and P0 scope rows round-trip via verified same-client Tenant transaction | Actual scratch PostgreSQL insert/read passed for metadata, optional bindings, times and scopes | `PASS` |
| `TC-GRT-002-PER-003` | Persisted row corruption/status confusion | Integration / Unit | Reconstitute visible ACTIVE/REVOKED/elapsed Grant rows; reject unsupported scope | Live rows reconstituted; ACTIVE with elapsed expiry remained non-temporally-active; P1 scope rejected by adapter test | `PASS` |
| `TC-GRT-002-PER-004` | Invalid domain/ID and terminal insert | Unit / Negative | Reject before database I/O | Non-Grant, terminal Grant and malformed ID cases rejected before persistence | `PASS` |
| `TC-GRT-002-PER-005` | Partial parent/scope writes | Integration / Negative | Scope failure rolls back all rows to SAVEPOINT | Real unique-scope injection left no parent or scope row; adapter rollback mapping also passed | `PASS` |
| `TC-GRT-002-PER-006` | Cross-Tenant visibility | Security / RLS | Source/recipient participant visibility only; unrelated and no-context hidden | Live PostgreSQL returned source and recipient visible rows; Tenant C/no context returned none | `PASS` |
| `TC-GRT-002-PER-007` | Missing Tenant RLS context | Security / Negative | Insert denied; fixed error; no row remains | Runtime-role insert without Tenant context denied; follow-up read returned null | `PASS` |
| `TC-GRT-002-PER-008` | Temporary privilege cleanup | Security / DB | Revoke temporary permissions and restore exact 126 | Both clean and reset runs restored 142→126; no permanent privilege or migration change | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — PowerShell harness syntax

- 실행 일시: `2026-10-01` (KST)
- 목적: DB-008 test harness parse before invoking Docker
- 명령:

```powershell
$tokens=$null
$parseErrors=$null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path 'scripts/test-db-008-full-schema.ps1'),
  [ref]$tokens,
  [ref]$parseErrors
) | Out-Null
```

- 종료 코드: `0`; `db008_parse_errors=0`
- 판정: `PASS`

### TEST-002 — TypeScript API typecheck

- 실행 일시: `2026-10-01` (KST)
- 목적: API/domain/persistence type contract
- 명령: `npm run typecheck:api`
- 종료 코드: `0`
- 핵심 결과: `tsc --project services/api/tsconfig.json --noEmit` passed
- 판정: `PASS`

### TEST-003 — API unit/contract regression

- 실행 일시: `2026-10-01` (KST)
- 목적: Entire API test suite, including seven Grant repository tests
- 명령: `npm run test:api`
- 종료 코드: `0`
- 핵심 결과: API build passed; `Test Files 22 passed (22)`, `Tests 399 passed (399)`
- 판정: `PASS`

### TEST-004 — Full schema, real PostgreSQL/RLS, and cleanup regression

- 실행 일시: `2026-10-01` (KST)
- 목적: DB-008 clean migration/reset-reapply, real Grant persistence/RLS, least privilege cleanup, and DB-002~007 regression
- 명령: `./scripts/test-db-008-full-schema.ps1`
- 종료 코드: `0`
- 핵심 결과:
  - `grt002_persistence=PASS insert_read=PASS savepoint_rollback=PASS tenant_rls=PASS no_context=DENY temporary_privileges=142_to_126 permanent_runtime_change=false` — observed twice, once per clean and reset/reapply schema run.
  - Each real database invocation was accepted only with TAP `pass 7` and `fail 0`.
  - `db008_clean_up=PASS product_tables=17 ledger=16 catalog=17|44|15|29`.
  - `db008_reset_reapply=PASS product_tables=17 ledger=16`.
  - DB-002, DB-003, DB-004, DB-005, DB-006, DB-007 all reported `PASS` and synthetic fixture rollback/persisted row counts of zero.
  - `db008_ephemeral_cleanup=PASS`; `db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false`.
- 판정: `PASS` for this scoped Ticket and its DB regression gates

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-GRT-002-PER-003` | Unsupported P1 `study:mobile-export` persisted scope | Adapter returns fixed persistence error; no scope is promoted into P0 domain | `PASS` |
| `TC-GRT-002-PER-004` | Non-domain object, terminal status insert, malformed UUID | Rejected before database query | `PASS` |
| `TC-GRT-002-PER-005` | Duplicate scope injected after parent insert | Savepoint rollback removes parent and prior scope row | `PASS` |
| `TC-GRT-002-PER-006` | Unrelated Tenant / no-context read | RLS returns no row | `PASS` |
| `TC-GRT-002-PER-007` | Insert without Tenant transaction context | PostgreSQL denies; repository hides driver detail; no row remains | `PASS` |
| `TC-GRT-002-PER-008` | Test ends after success or failure | `finally` revokes test permissions; exact inventory returns to 126 | `PASS` |

Workspace hygiene: `git diff --check` exited `0` (Git emitted repository-wide LF→CRLF conversion warnings only); a separate trailing-whitespace scan over new GRT source, tests and implementation records found no matches. After DB-008 completion, Docker filters for the unique `mediq-db008-860bccd51183` project returned no container, volume, or network.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Grant issue API and Consent/Authorization denial/serialization | GRT-002 explicitly excludes business issuance; no route is approved/wired | Repository accepts ACTIVE metadata if an authorized internal caller invokes it | GRT-003 recommendation and Acceptance before API/service wiring |
| Permanent runtime Grant INSERT and `created_at` SELECT | No issuance authorization path exists; decision prohibits widening persistent role | Product runtime cannot yet insert/read full Grant snapshots | Separate least-privilege recommendation and DB evidence with GRT-003 |
| HTTP BOLA, Viewer/Download/PACS and STOW effects | No protected image endpoints are connected | No product access/denial or A→B transfer claim | AUT/GRT/PACS/TEST tickets |
| Full `AT-E2E-003` | Imaging/DICOM/Preflight/Integrity/Provenance/Audit path incomplete | Overall P0 objective remains open | Continue plan; keep global readiness `BLOCKED` |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Recommendation and decision | `docs/POLICY-DECISION-LOG.md` — `GRT-002-DEC-001` | Synthetic metadata policy only |
| Acceptance results | `docs/ACCEPTANCE-TESTS.md` — `TC-GRT-002-PER-001~008` | No PHI or DICOM payload |
| Source and test suite | `services/api/src/grant/persistence/*`; `tests/api/postgres-transfer-grant-repository.test.mjs`; `tests/database/transfer-grant-persistence-runtime.integration.test.mjs` | Synthetic fixtures only |
| DB-008 console summary | TEST-004 output listed above | No raw SQL driver detail, credentials or patient payload recorded |
| Workspace diff validation | `git diff --check` exit 0; new GRT files trailing-whitespace scan empty | No secret-bearing files opened/exported |

## 7. 결론

- 결과: `PASS` — internal persistence and scratch PostgreSQL/RLS scope only
- PASS 주장 범위: ACTIVE/P0 repository insert/read/reconstitution, savepoint rollback, forced Tenant RLS and exact scratch privilege restoration
- Product Grant issuance, authorization, HTTP/API use, image access and full P0 E2E remain unproven and are not enabled by this Ticket.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM은 시험에 사용하거나 증거에 포함하지 않았다.
