# MEDIQ-AUT-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-005` |
| 제목 | Trusted PostgreSQL authorization evidence reader |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — internal Study evidence-reader Acceptance only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js 24.18.0, npm 11.16.0, TypeScript 6.0.3, PostgreSQL 18.6 Test image, Docker Compose |
| 대상 환경 | API build/unit tests and disposable DB-008 Compose scratch project |
| Database identity | `mediq_runtime` for integration; `mediq_migrator` only for scratch fixture/migration setup |
| 데이터 | Random/synthetic Organization/Tenant/Hospital/Actor/PatientReference/Session/Consent/Grant/Package/StudyReference only |
| 외부 시스템 | No real hospital, operational PACS, DICOM payload, HTTP product route, or production service |

## 2. Acceptance 검증 매트릭스

| 검증 ID | 핵심 assertion | 실제 결과 | 판정 |
|---|---|---|---|
| `TC-AUT-005-DB-001` | Runtime privilege inventory at AUT-005 checkpoint | Exactly 62 column privilege rows at that checkpoint: 10 `patient_refs`, 11 IAM identity, 41 evidence `SELECT`; zero table-wide/default grants; all 7 evidence tables forced RLS | PASS — later PAT-002 acceptance adds 8 mapping SELECT privileges; current 70-row catalog is separately verified by `TC-PAT-002-DB-001` |
| `TC-AUT-005-DB-002` | Exact Study binding + `VIEW`, `DOWNLOAD`, `PACS_IMPORT` | Actual `mediq_runtime` + IAM-002 + executor/engine/policy/reader returned ALLOW for all three exact actions; callback received the same `PoolClient` | PASS |
| `TC-AUT-005-DB-003` | Wrong Session, Consent, Grant, StudyReference identifiers | Each produced denial and zero protected callback; unit tests also cover absent and ambiguous joined rows | PASS |
| `TC-AUT-005-DB-004` | Revoked/expired Grant and withdrawn Consent | Values were loaded from synthetic PostgreSQL rows and denied by actual policy; existing AUT-003 policy regression covers action/scope/package and malformed evidence | PASS |
| `TC-AUT-005-DB-005` | A/B bilateral visibility vs C nonparticipant | Destination B exact recipient allowed; source A could read bilateral facts but policy denied; Tenant C resolved no facts via RLS and was denied | PASS |
| `TC-AUT-005-DB-006` | Unsupported Series/Instance | Both denied before persistence query; callback count unchanged | PASS |
| `TC-AUT-005-DB-007` | Query error/denial fail-closed and pool cleanup | Unit tests verify reader/policy query error boundary; live denied calls invoke no callback; max-one pool reuse showed empty Tenant setting and zero visible Session rows | PASS |

## 3. 실행 명령과 결과

### TEST-001 — API build and TypeScript check

- 실행일: 2026-09-30
- 명령:

```powershell
npm run build:api
npm run typecheck:api
```

- 종료 코드: `0` for both.
- 결과: API compiled and strict no-emit typecheck passed.
- 판정: `PASS`.

### TEST-002 — Reader unit tests

- 명령:

```powershell
npx vitest run tests/api/postgres-authorization-evidence.reader.test.mjs
```

- 종료 코드: `0`.
- 결과: 1 file, 5 tests passed; parameter binding, mapping, child-resource no-query, zero/multiple row handling and DB error propagation covered.
- 판정: `PASS`.

### TEST-003 — Full API regression

- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`.
- 결과: build succeeded; 14 test files and 295 tests passed.
- 판정: `PASS`.

### TEST-004 — Migration metadata and runner regression

- 명령:

```powershell
npm run db:migrations:check
npm run test:db-migrations
```

- 종료 코드: `0` for both.
- 결과: migration journal check passed; runner unit suite 6/6 passed, including journal order and idempotent prefix handling.
- 판정: `PASS`.

### TEST-005 — Compose and PowerShell script validation

- 명령:

```powershell
.\scripts\validate-compose-baseline.ps1
$null = [scriptblock]::Create((Get-Content scripts/test-db-008-full-schema.ps1 -Raw))
```

- 종료 코드: `0`.
- 결과: Compose/test-image/environment allowlist validated; updated PowerShell script parsed successfully.
- 판정: `PASS`.

### TEST-006 — Full disposable PostgreSQL / authorization evidence acceptance

- 명령:

```powershell
.\scripts\test-db-008-full-schema.ps1
```

- 종료 코드: `0`.
- 결과:
  - Initial migration, repeated apply, scratch reset and fresh reapply passed; ledger=11, product tables=17, catalog=`17|44|14|29`.
  - Runtime role was non-owner/non-superuser/no-bypass-RLS; `SELECT 1` passed while migration ledger access was denied.
  - Exact column privilege inventory=62: PatientReference 10, IAM identity 11, Authorization evidence 41; table-wide/PUBLIC/default grant inventory=0.
  - RLS enable/force=16; Tenant A/B participant boundary passed; Tenant C denied; commit/rollback pool context cleanup passed.
  - PAT-001, IAM-002 and AUT-005 runtime integration container: 3/3 tests passed. AUT-005 exact action ALLOW, wrong IDs, revoked/expired Grant, withdrawn Consent, A/B/C behavior, unsupported child resources, same-client callback and pool reset passed.
  - Existing DB-002 through DB-007 regressions all passed.
  - `db008_ephemeral_cleanup=PASS`; only the owned scratch Compose resources were removed. Existing MediQ/PostgreSQL/Orthanc services were left running and unchanged.
- 판정: `PASS` for AUT-005 internal Study evidence reader and associated DB/security acceptance.

### TEST-007 — Whitespace/diff check

- 명령:

```powershell
git diff --check
```

- 결과: no whitespace errors; Git emitted only repository-wide LF→CRLF normalization warnings for pre-existing working-tree files.
- 판정: `PASS`.

## 4. 실패·거부 경로

| 경로 | 결과 | 판정 |
|---|---|---|
| Wrong Session/Consent/Grant/StudyReference UUID | Evidence join yields no usable facts; executor throws fixed denial; protected callback not invoked | PASS |
| Revoked Grant / expired Grant / withdrawn Consent | PostgreSQL facts map to policy and are denied | PASS |
| Source Tenant A attempts destination-authorized operation | RLS permits bilateral evidence visibility; object policy rejects wrong recipient before callback | PASS |
| Nonparticipant Tenant C | Forced RLS returns no evidence; policy denies before callback | PASS |
| `SERIES` and `INSTANCE` | Reader returns null without issuing evidence SQL | PASS |
| Reader query throws | Reader propagates internally; policy boundary converts to `DENY`; no caller-supplied fallback | PASS — unit/policy regression |
| Post-transaction pooled client | Tenant setting absent/empty; protected exchange row invisible | PASS |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| `AT-SEC-003`, `AT-SEC-017`, `TC-AUT-004-FC-001~004` | No protected business route/controller or HTTP safe-error integration | HTTP BOLA, response body non-disclosure and status mapping remain unproven | Separate API integration Ticket before route exposure |
| Concurrent Consent/Grant revoke vs downstream operation | No Consent/Grant workflow or side-effect operation/locking contract in scope | One successful evidence snapshot cannot prevent a later revoke race | Define transaction/locking/recheck semantics before Viewer/Download/PACS effects |
| PatientMapping runtime access | Explicitly outside AUT-005; PAT-002-DEC-002 later accepts a separate exact-Hospital internal read-only path | AUT-005 does not validate PatientMapping access; no PatientMapping API/write path exists | See `TC-PAT-002-TEN-001~002`, `SEC-001~003`, `DB-001` |
| Viewer/Download/PACS/Preflight/Audit/Integrity/Provenance/E2E | No downstream product operation registered | No data delivery, transfer, completion, or full authorization claim | Continue those approved P0 Tickets independently |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Reader unit tests | `tests/api/postgres-authorization-evidence.reader.test.mjs` | Synthetic UUIDs only; no PHI/Secret |
| Runtime DB tests | `tests/database/postgres-authorization-evidence-runtime.integration.test.mjs` | Synthetic fixtures only; no patient payload |
| Full scratch run | `scripts/test-db-008-full-schema.ps1`, output `db009_access_boundary=PASS`, `db008_schema_validation=PASS` | Credentials not emitted; test scratch cleaned |
| Migration | `services/api/src/database/migrations/0010_authorization_evidence_column_grants.sql` | Schema/grants only |

## 7. 결론

- 결과: `PASS` for the narrow AUT-005 Acceptance scope.
- `ALLOW` is a server-side policy decision only; no HTTP route or actual protected data/side effect is enabled.
- HTTP BOLA/safe-error, Consent/Grant workflow, PACS, Viewer/Download, Audit and complete P0 E2E remain open; overall `DB-009` remains `PARTIAL`. PAT-002's separate internal synthetic read-only mapping path later passed its exact scoped Acceptance; that does not close these gates.
- No real patient data, operational DICOM, secret, token or live PACS credential was used or recorded.
