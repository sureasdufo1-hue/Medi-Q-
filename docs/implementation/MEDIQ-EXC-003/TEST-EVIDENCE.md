# MEDIQ-EXC-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-003` |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-09-30` |
| 결과 | `PARTIAL` — scoped implementation Acceptance passes; live OIDC/HTTP→DB and concurrency gates remain |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS / Shell | Windows / PowerShell |
| Runtime·Toolchain | Node.js 24, npm 11, Docker Compose 5 |
| 대상 | Local synthetic development and disposable PostgreSQL scratch DB |
| Data | Synthetic Organization/Tenant/Actor/PatientReference; no PHI or operational DICOM |
| Local DB effect | Additive migration 0012 applied; ledger now 13; existing volume was not reset; regression fixtures were transaction-rolled-back |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 실제 결과 | 판정 |
|---|---|---|---|---|
| `TEST-001` | API + route unit regression | Unit/HTTP controller | 19 files, 345 tests passed | `PASS` |
| `TEST-002` | TypeScript API build/types | Static | `npm run typecheck:api` exit 0 | `PASS` |
| `TEST-003` | Migration journal/schema consistency | Migration | `npm run db:migrations:check`; “Everything's fine” | `PASS` |
| `TEST-004` | Migration runner behavior | Unit | `npm run test:db-migrations`; 6/6 passed | `PASS` |
| `TEST-005` | 100 exact runtime column grants and forced Tenant RLS | PostgreSQL integration | DB-008 scratch: exact 100 rows, Session SELECT/INSERT 12 each, Audit INSERT 12; no broad grant | `PASS` |
| `TEST-006` | Idempotent create/replay/changed request/destination denial | PostgreSQL + application integration | EXC-003 create, exact sequential replay, changed-purpose conflict, wrong destination denied | `PASS` |
| `TEST-007` | Atomic Session + successful Audit | PostgreSQL + application integration | Successful write; RLS-denied Audit insert rolled back Session; unit injected failure also rolled back mock state | `PASS` |
| `TEST-008` | Tenant visibility and write denial | PostgreSQL/RLS/security | Destination Tenant B created; Tenant C read was null; Session UPDATE/Audit DELETE denied | `PASS` |
| `TEST-009` | Complete schema, migration and prior regressions | Database integration | Clean UP/repeat/RESET/reapply; DB-002~007 pass; only ephemeral Compose resources removed | `PASS` |
| `TEST-010` | Live OIDC → HTTP → real PostgreSQL; simultaneous identical HTTP requests | End-to-end/concurrency | Not run; route/controller tests use verifier/service mocks; DB test invokes application service directly | `NOT RUN` |

## 3. 실행 명령과 결과

### TEST-001 — API regression

```powershell
npm run test:api
```

- 결과: 19 test files passed; 345 tests passed; exit code 0.
- 검증 범위: application unit behavior and Fastify/Nest controller/guard behavior. OIDC issuer itself is mocked; this is not a deployed API-to-DB E2E.

### TEST-002 — API typecheck

```powershell
npm run typecheck:api
```

- 결과: TypeScript completed with exit code 0.

### TEST-003 — Migration consistency

```powershell
npm run db:migrations:check
```

- 결과: Drizzle journal/schema check reported “Everything's fine”; exit code 0.

### TEST-004 — Migration runner

```powershell
npm run test:db-migrations
```

- 결과: 6 tests passed, 0 failed; exit code 0.

### TEST-005~009 — Full database gate

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- 최종 결과: exit code 0; `db008_schema_validation=PASS` and `db008_ephemeral_cleanup=PASS`.
- Disposable PostgreSQL clean migration, repeat application, RESET and fresh reapply passed with 17 product tables, ledger 13 and aggregate `PK/FK/UNIQUE/CHECK=17/44/15/29`.
- Each scratch cycle reported exact runtime inventory 100; `exchange_sessions` 12-column `SELECT` + 12-column `INSERT`; `audit_events` 12-column `INSERT`; no table-wide/PUBLIC/default/DDL/write-update/delete/truncate privilege.
- EXC-002 live repository/RLS sub-Acceptance passed; EXC-003 live application-service DB/RLS test passed in the full-gate cycles.
- DB-002~007 persistent-development regression scripts passed. Their documented migration smoke applied migration 0012 to the existing local `mediq` schema (ledger 13); the local DB volume was not reset, and synthetic transaction fixtures rolled back.

### TEST-010 — Current exact schema regression

```powershell
./scripts/test-db-004-exchange.ps1 -EnvFile .env
```

- 결과: exit code 0; 12 Session columns including required UUID idempotency key; 1 approved Actor/key UNIQUE; 12 states and all invalid state/equal-hospital/FK/delete probes behaved as expected; fixture rollback left zero rows.

## 4. 실패·거부 경로

| 경로 | 검증 결과 |
|---|---|
| Missing Bearer / unavailable mocked verifier | Fixed 401/503 controller response; no application call when authentication is unavailable |
| Wrong destination / SERVICE or tenant-only user | Denied before PatientReference lookup or write; real synthetic Hospital A requester denied for Hospital B destination |
| Unsupported Study UID, blank purpose, inactive PatientReference, invalid idempotency key | Validation denial; no Session/Audit write in service tests |
| Same Actor/key/exact request | Existing Session returned; no second success Audit |
| Same Actor/key/changed purpose | Fixed conflict; original row unchanged; no second Session/Audit |
| Audit insertion/RLS failure after Session insert | Transaction rollback leaves no Session |
| Unrelated Tenant C | Session is not visible through forced RLS |
| Session UPDATE and Audit DELETE | Denied by exact runtime privileges |

## 5. 테스트 harness 수정 이력

초기 검증 중 나타난 실패는 숨기지 않고 원인을 수정한 후 최종 전체 게이트를 다시 실행했다.

| 관찰 | 원인 | 수정 및 최종 확인 |
|---|---|---|
| Catalog expected `17/44/14/29` mismatched | Approved idempotency UNIQUE adds one unique constraint | Expected current catalog updated to `17/44/15/29`; clean UP/reapply passed |
| Migration ledger expected 12 | New additive migration 0012 is the 13th migration | DB-008 expects ledger 13; clean/reset/reapply passed |
| Synthetic DB fixture violated NOT NULL | Existing regression inserts omitted new required `idempotency_key` | DB-004~008 test fixtures now supply synthetic UUID keys; DB-002~007 all pass |
| EXC-003 test file absent in integration container | Dockerfile did not copy the new runtime integration test | Added explicit test-image COPY; full test executes and passes |
| EXC-003 destination request was denied | Reused AUT-005 destination fixture is intentionally `SERVICE` | Added isolated EXC-003 destination `USER`; preserved EXC-002/AUT-005 fixtures; full gate passes |
| EXC-002 fixture assertion failed after adding USER | EXC-002 and EXC-003 shared a fixture variable | Split fixtures per Ticket; EXC-002 and EXC-003 pass independently |
| One-line grant comparison false-negative | PowerShell string `[0]` checked only the first character | Compare the full normalized output string; exact inventory passes |

No credentials, token, PHI, DICOM payload or raw driver output were included in this evidence.

## 6. 실행하지 않은 시험과 잔여 위험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live OIDC issuer/provider and real token validation | No external issuer configured for this synthetic P0 Ticket | Real identity integration is unverified | IAM/ingress Gate before external exposure |
| Single live HTTP request through real OIDC, controller, IAM-002 and PostgreSQL | Controller and real-DB service are tested in separate suites | Cross-layer wiring/deployment may still fail | Add process-level integration test |
| Concurrent identical HTTP calls using same Actor/key | Sequential replay and database uniqueness were exercised, not a true race | Retry race remains unobserved, though unique DB key protects row uniqueness | Add concurrent integration acceptance |
| Full malformed UUID/equal-Hospital/over-limit input matrix and live persistence failure over HTTP | Current API suite covers key invalidation, blank purpose, unsupported field, inactive patient and fixed errors but not every listed boundary | Some validation and error branches lack direct test evidence | Extend the TC-EXC-003 API matrix |
| Consent/Grant, GET BOLA, Viewer/Download, DICOM/PACS, Integrity/Provenance, full A→B E2E | Outside this Ticket | `GATE-IMP-04` remains incomplete | Execute downstream approved Tickets and global acceptance |

## 7. 결론

- 결과: `PARTIAL`
- PASS 범위: API unit/controller boundary, type/migration checks, exact privilege catalog, live synthetic PostgreSQL Session creation/idempotent replay/conflict, Tenant RLS denial, atomic Audit rollback, full local schema and DB-002~007 regression.
- PARTIAL/NOT RUN: live OIDC/HTTP→DB E2E, real concurrent HTTP request, exhaustive malformed-input/dependency failure matrix and full product Exchange.
- 실제 환자정보·운영 Credential·Secret·운영 DICOM은 사용하지 않았으며 증거에 포함하지 않는다.
