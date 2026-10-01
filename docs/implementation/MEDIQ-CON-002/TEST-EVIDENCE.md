# MEDIQ-CON-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-002` |
| 제목 | Synthetic Consent persistence and atomic version allocation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — all in-scope CON-002 Acceptance passed |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS / Shell | Windows / PowerShell |
| Runtime·Toolchain | Repository workspace Node/npm; Docker Compose scratch PostgreSQL; PowerShell |
| 대상 환경 | API unit suite; disposable DB-008 scratch PostgreSQL; DB-002~007 regressions against persistent local development DB without volume reset |
| 데이터 | Synthetic Organization/Tenant/Actor/PatientReference/Session/Consent only; no PHI or operational DICOM |
| Persistent DB effect | Local development volume was not reset; no migration or permanent Consent grants added. DB-002~007 persistent development regressions ran as part of the documented script. |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-002-DB-001` | PENDING parent/action persistence and round-trip | PostgreSQL integration | Exact snapshot/actions and version 1; no implied approval | DB round-trip preserved PENDING/null timestamps, exact action set and version 1 | `PASS` |
| `TC-CON-002-DB-002` | Sequential and per-Session versions | PostgreSQL integration | Monotonic unique versions; another Session begins at 1 | Sequential same-Session versions increased; independent Session began at 1 | `PASS` |
| `TC-CON-002-DB-003` | Simultaneous same-Session creates | Concurrent PostgreSQL integration | Distinct contiguous versions, no lost/duplicate Consent | 12 concurrent creates returned unique contiguous versions | `PASS` |
| `TC-CON-002-DB-004` | Session/context mismatch or unsupported action | Unit + PostgreSQL | Fixed denial; zero writes | Missing/invisible/mismatched Session and unsupported/P1 action denied; no persisted rows | `PASS` |
| `TC-CON-002-DB-005` | ConsentAction insert failure | Transaction integration | Parent and actions both roll back | Induced real PostgreSQL child uniqueness failure rolled back parent and actions | `PASS` |
| `TC-CON-002-DB-006` | Tenant RLS and no-context access | PostgreSQL security | Unrelated Tenant/no context sees no row; unauthenticated persistence fails | Participant RLS visibility passed; unrelated/no-context read and write denied | `PASS` |
| `TC-CON-002-DB-007` | Exact scratch privilege inventory | PostgreSQL catalog/security | Baseline SELECT 10/2 plus temporary SELECT 3/1 gives effective `consents` SELECT/INSERT 13/13 and `consent_actions` 3/3; total 120; cleanup restores 100; no broad or mutation privileges | Exact effective column set and 120 inventory observed; cleanup restored exact 100 baseline | `PASS` |
| `UNIT-CON002` | Repository/domain boundary behavior | Focused unit | Validation, transaction/savepoint failure handling and error mapping pass | 10 focused tests passed | `PASS` |
| `REG-API` | Existing API regressions | Unit/contract | All API tests pass | `npm run test:api`: 20 files, 355 tests passed | `PASS` |
| `BUILD-API` | API compilation | Build | Build succeeds | `npm run build:api` exited 0 | `PASS` |
| `TYPE-API` | API TypeScript | Static | Typecheck succeeds | `npm run typecheck:api` exited 0 | `PASS` |
| `DB-BASELINE` | Existing full database regression | PostgreSQL | DB-008 plus DB-002~007 regressions pass, local volume preserved | Final DB-008 full script passed; scratch reset/reapply and DB-002~007 regressions passed; local volume was not reset | `PASS` |

## 3. 실행 명령과 결과

Commands below were executed from repository root. Final results are from actual process exit status and test output; no raw credential or patient data is included.

```text
npm run test:api
Result: PASS — 20 test files, 355 tests passed.

npx vitest run tests/api/postgres-consent-repository.test.mjs
Result: PASS — 10 focused tests.

npm run build:api
Result: PASS — exit code 0.

npm run typecheck:api
Result: PASS — exit code 0.

node --check tests/database/consent-persistence-runtime.integration.test.mjs
Result: PASS — syntax check succeeded.

./scripts/test-db-008-full-schema.ps1 -EnvFile .env
Result: PASS on final run (exit code 0).
  con002_persistence=PASS pending_only=PASS atomic_version=PASS concurrent=PASS
  rls=PASS exact_privileges=120 restored=100
  DB-009/EXC-002/EXC-003 checks and DB-002~007 regressions passed.
  DB-008 clean UP/repeat/RESET/fresh reapply passed; 17 product tables;
  catalog 17/44/15/29; ephemeral scratch resources cleaned up.
  Persistent local DB volume was not reset; migration ledger remained 13.
```

First full-script attempt exited non-zero because the test harness compared equivalent privilege catalog rows in different ordering. The comparator was corrected to sort actual rows; the full script was rerun and passed. Both executions are disclosed; the initial failure was an assertion-ordering defect in the harness, not a DB security-control failure.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-002-DB-004` | Missing/invisible Session, patient/hospital mismatch, invalid or P1 action | All tested denials returned fixed failure and left no rows | `PASS` |
| `TC-CON-002-DB-005` | Parent inserted, action insert fails | PostgreSQL child uniqueness violation caused parent/action rollback | `PASS` |
| `TC-CON-002-DB-006` | Unrelated Tenant and no Tenant context | RLS returned no rows; context-free write was denied | `PASS` |
| Out of scope | Legal consent, patient identity, Authorization denial, Grant and PACS no-side-effect | Not tested by this Ticket; later workflow gates own these | `OUT OF SCOPE` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live OIDC/HTTP/legal Consent | Explicitly outside CON-002 | No patient-facing consent or public access flow | CON-003~008 and identity/legal review remain required |
| Consent/Grant image operations | Explicitly outside CON-002 | No product access authorized | AUT/GRT/Viewer/PACS gates required |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Recommendation and Acceptance | `POLICY-DECISION-LOG.md`, `ACCEPTANCE-TESTS.md` | Synthetic-only; no PHI/Secret |
| Command output | Summarized above; transient full output not copied into repository | Raw credentials, payload and sensitive logs excluded |

## 7. 결론

- 결과: `PASS` for the approved internal synthetic PENDING persistence/versioning scope and listed Acceptance only.
- Not established: legal consent, patient identity assurance, Consent lifecycle/API, business Authorization, Grant, Audit workflow or protected image access.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
