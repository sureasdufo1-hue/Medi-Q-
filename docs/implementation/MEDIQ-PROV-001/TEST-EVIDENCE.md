# MEDIQ-PROV-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PROV-001` |
| 제목 | Operation-bound pending Provenance persistence |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 결과 | `PASS (scoped)` |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows; PowerShell |
| Runtime·Toolchain | Node.js `v24.18.0`; npm `11.16.0`; Docker Client `29.8.0`; PostgreSQL scratch container |
| 대상 환경 | Local, isolated disposable PostgreSQL for DB-008; no production systems |
| 데이터 | Synthetic fixtures only; rollback/cleanup verified; no patient/PACS payload |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PROV-001-001` | Migration/FK/unique/PACS_IMPORT CHECK | DB schema | nullable operation FK with RESTRICT, unique operation binding, required operation/destination/Study | DB-008 and DB-007 PASS; full schema catalog: 18 primary keys / 49 foreign keys / 17 unique constraints / 39 checks; DB-007: 38 scoped columns, 13 FKs, 8 checks, 14 explicit indexes, one partial unique index | `PASS` |
| `TC-PROV-001-002~004` | Server-derived binding and pending-only creation | API + PostgreSQL integration | Only operation ID input; binding comes from persisted operation; PENDING only | API repository contract tests and `prov001_runtime=PASS operation_binding=PASS pending_only=PASS` | `PASS` |
| `TC-PROV-001-003` | Exact replay | PostgreSQL integration | Same provenance ID/binding; no second row | `replay=PASS`; preflight replay also covered | `PASS` |
| `TC-PROV-001-005` | Missing verified Tenant context | PostgreSQL/RLS security | No row returned/created; fail closed | `no_context=DENY`; writer rejects; direct unscoped row count is zero | `PASS` |
| `TC-PROV-001-006` | Cross-tenant access | PostgreSQL/RLS security | No visibility/create or identifying leakage | `cross_tenant=DENY` | `PASS` |
| `TC-PROV-001-007` | Unknown or invalid binding | API + PostgreSQL | Fixed failure/no committed row | Domain/adapter negatives plus DB operation/session/study/package joins and constraints in full DB gate | `PASS (scoped)` |
| `TC-PROV-001-008` | First write after STOW_STARTED | PostgreSQL/state security | Deny late first write | `late_first_write=DENY`; no row persisted | `PASS` |
| `TC-PROV-001-009` | PACS_IMPORT without operation/destination/Study | DB constraint | Each missing required binding is rejected | `DB-007 ... invalid_checks=7 invalid_fk=13`; explicit missing operation/destination and missing-Study constraint probes PASS | `PASS` |
| `TC-PROV-001-010` | Runtime least privilege and transaction rollback | DB/security | Exact 13 SELECT + 13 INSERT; no UPDATE/DELETE; rollback removes row | `exact_209_privileges=PASS update_delete=DENY rollback=PASS`; table-level/PUBLIC grant count zero | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Full database gate

- 실행 일시: 2026-10-02
- 목적: full clean/reset/reapply, migration smoke, current runtime catalog/RLS, PROV Acceptance and DB-002~007 regressions
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: `db008_clean_up=PASS product_tables=18 ledger=21 catalog=18|49|17|39`; `db008_reset_reapply=PASS product_tables=18 ledger=21`; migration apply twice PASS; runtime migration ledger access DENIED; DB-002~007 regression PASS; `db008_ephemeral_cleanup=PASS`; `db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false`.
- PROV output: `prov001_runtime=PASS operation_binding=PASS pending_only=PASS replay=PASS rollback=PASS no_context=DENY cross_tenant=DENY late_first_write=DENY exact_209_privileges=PASS update_delete=DENY`.
- 판정: `PASS`

### TEST-002 — API test suite

- 목적: API build + all current API tests.
- 명령: `npm run test:api`
- 종료 코드: `0`
- 결과: `Test Files 32 passed (32); Tests 565 passed (565)`.
- 판정: `PASS`

### TEST-003 — Typecheck, migration validation and patch hygiene

- 명령: `npm run typecheck:api`; `npm run db:migrations:check`; `npm run test:db-migrations`; `git diff --check`
- 결과: TypeScript no-emit check PASS; Drizzle `Everything's fine`; migration runner 6/6 PASS; `git diff --check` exit 0. Git printed CRLF normalization warnings for pre-existing Windows working-copy files; no whitespace error.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PROV-001-005` | No verified Tenant context | Writer rejects; no Provenance row | `PASS` |
| `TC-PROV-001-006` | Different Tenant context | RLS returns no operation/Provenance; writer denies | `PASS` |
| `TC-PROV-001-008` | First Provenance insert attempted after STOW_STARTED | Rejected; no row | `PASS` |
| `TC-PROV-001-009` | Direct PACS_IMPORT insert without required operation/destination | Database constraint rejects | `PASS` |
| `TC-PROV-001-009` | PACS_IMPORT with operation/destination but NULL Study | Database constraint rejects | `PASS` |
| `TC-PROV-001-010` | Runtime UPDATE/DELETE attempt; caller rollback | Privilege denied; caller rollback leaves zero row | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Actual authorized source DICOM retrieval and full A→B transfer | This Ticket deliberately contains no DICOM Gateway/coordinator/STOW | No claim about product transfer or zero-STOW under a live HTTP flow | Separate recommendation/Acceptance and coordinator/E2E gates |
| Destination byte/hash verification, Integrity terminal decision, Audit completeness | Out of scope; pending record is not evidence of successful transfer | Transfer cannot be called complete | Separate Integrity/Audit/Product E2E tickets |
| Production database, live hospital PACS, real patient data | P0 synthetic/local only | Production readiness not assessed | Productionization review |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| DB-008 terminal output | Command output recorded above; disposable resources cleaned | No PHI, DICOM payload or secret copied into this record |
| API/migration test output | Counts/results recorded above | No PHI or secret |

## 7. 결론

- 결과: `PASS (scoped)`
- PASS 범위: `MEDIQ-PROV-001` Acceptance and internal pending-only persistence within the stated synthetic test boundary.
- 이 결과는 product A→B transfer, PACS dispatch/STOW, destination verification, Integrity, Audit completeness 또는 overall P0 completion을 PASS하지 않는다.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
