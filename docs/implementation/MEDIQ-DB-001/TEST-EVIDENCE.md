# MEDIQ-DB-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-001` |
| 제목 | P0 Drizzle migration framework and role-isolated runner |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — migration framework scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local host + Docker Desktop Linux containers |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0`, Compose `v5.5.1`, PostgreSQL image `18.6-bookworm` |
| 대상 환경 | Existing local synthetic/test Compose environment; persistent volume retained |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-DB-001-MIG-001` | Wrong runtime profile/env/role/host/database/query options rejected | Unit/Security | Reject before DB connection; no credential diagnostics | 6 invalid configuration cases rejected | `PASS` |
| `TC-DB-001-MIG-002` | Journal version/dialect/index/tag/timestamp/file, applied-ledger hash/prefix and breakpoint validation | Unit | Reject malformed/missing history, hash mismatch and empty journal; split only at Drizzle markers | Valid journal/hash prefix accepted; missing file, wrong index, empty journal and changed history hash rejected; split verified | `PASS` |
| `TC-DB-001-MIG-003` | Migration role/database/schema privilege boundary | Integration/Security | `mediq_migrator`, no elevated flags/database `CREATE`; schema `USAGE/CREATE` allowed | Runner checked role attributes/privileges and applied migration under this boundary | `PASS` |
| `TC-DB-001-MIG-004` | Apply framework baseline and run repeatedly | Integration | One ledger row, correct owner, no duplicate or product table | Baseline applied; two repeat runs passed; ledger rows=1, owner=`mediq_migrator`, product tables=0 | `PASS` |
| `TC-DB-001-MIG-005` | Runtime access after migration | Integration/Security | Runtime `SELECT 1` allowed; ledger read denied | Both assertions passed in migration smoke | `PASS` |
| `TC-DB-001-MIG-006` | Framework scope boundary | Integration | DB-001 creates no product tables | Public base-table inventory except the ledger returned 0 | `PASS` |
| `TC-DB-001-MIG-007` | Synthetic migration statement failure | Unit | Roll back current transaction; no commit or ledger insert | Fake client asserted `BEGIN`, `ROLLBACK`, and no `COMMIT`/ledger `INSERT` after failure | `PASS` (unit path only) |
| `TC-DB-001-REG-001` | Existing API/config/environment regression | Unit/Integration | No operational readiness regression | API typecheck; 3 API tests; 8 config tests; Compose validator; environment health gate passed | `PASS` |

## 3. 실행 명령과 결과

The verification batch ran across `2026-09-29`–`2026-09-30` KST against synthetic/test resources only. `.env` contents and database URLs were never printed or copied into evidence.

### TEST-001 — Migration runner unit tests

```powershell
npm run test:db-migrations
```

- 종료 코드: `0`
- 결과: `6 tests passed, 0 failed` — config boundary, journal/file/history hash checks, statement split, rollback path.
- 판정: `PASS`

### TEST-002 — Migration journal consistency

```powershell
npm run db:migrations:check
```

- 종료 코드: `0`
- 결과: `Everything's fine`.
- 판정: `PASS`

### TEST-003 — PostgreSQL migration integration

```powershell
./scripts/test-database-migrations.ps1 -EnvFile .env -FrameworkOnly
```

- 종료 코드: `0`
- 결과: Two migration-profile executions passed; final ledger count=1 and owner=`mediq_migrator`; product tables=0; runtime `SELECT 1` passed; runtime ledger access denied.
- 판정: `PASS`
- Test retained the existing persistent PostgreSQL volume; no reset/recreation was performed.

### TEST-004 — Compose and application regression

```powershell
./scripts/validate-compose-baseline.ps1 -EnvFile .env
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
npm run typecheck:api
npm run test:api
npm run test:app-config
npm audit
```

- 종료 코드: all `0`.
- 결과: Compose/Dockerfile boundary passed; API 3 tests passed; app config 8 tests passed; `npm audit` reported `0 vulnerabilities`.
- 판정: `PASS`

### TEST-005 — Existing service health regression

```powershell
./scripts/test-environment-health.ps1 -EnvFile .env
```

- 종료 코드: `0`.
- 결과: PostgreSQL runtime SQL auth, Orthanc A/B authenticated QIDO/isolation, API readiness passed; A contained 1 synthetic Study, B contained 0.
- 판정: `PASS` — ENV operational scope only, not product acceptance.

### TEST-006 — Source hygiene

```powershell
git diff --check
```

- 종료 코드: `0`; Git emitted existing LF-to-CRLF normalization warnings only.
- PowerShell AST parse for the changed `.ps1` scripts passed.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-DB-001-MIG-001` | Wrong profile/environment/identity/host/database/query option | Fixed generic configuration rejection before DB connection | `PASS` |
| `TC-DB-001-MIG-003` | Elevated migration role privileges | Runner rejects role if database CREATE or any elevated role flag is present | `PASS` (current role check) |
| `TC-DB-001-MIG-007` | SQL statement failure during one migration | Unit fake-client verifies rollback and no ledger insert/commit | `PASS` (unit only) |
| Scope boundary | Runtime reads migration ledger | Permission denied as expected; smoke exposes status only | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Fresh PostgreSQL volume bootstrap | Persistent local volume was intentionally preserved; no reset/recreation | First-install provisioning path not proven from a newly created volume | Run against a disposable CI/test DB before product schema release |
| Actual PostgreSQL statement-failure rollback | Error path tested with fake client; no failing SQL was injected into the persistent DB | PostgreSQL-driver rollback behavior not separately demonstrated | Add isolated disposable-database failure injection |
| Concurrent migration contention | Runner uses non-blocking advisory lock, but two simultaneous containers were not launched | Lock contention/runtime recovery not empirically tested | Add CI integration test in disposable DB |
| Product schema/grants/Tenant RLS/business API | DB-001 is migration framework only | Product data isolation and domain constraints remain unverified | `MEDIQ-DB-002~008` and related security tickets |
| Production secret management/rotation and migration approval pipeline | Local capstone scope only | Production operation not assessed | Productionization gate; no production readiness claim |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Migration runner and 6 unit-test result | `scripts/run-database-migrations.mjs`, `tests/database/migration-runner.test.mjs` | No secret-bearing output |
| Migration integration summary | `scripts/test-database-migrations.ps1`; this evidence | Ledger count/owner/table count only; no credentials, patient identifiers or DICOM payload |
| Compose/app/environment regression summary | Commands in TEST-004/005 | No credential values |

## 7. 결론

- 결과: `PASS` — `MEDIQ-DB-001` migration framework only, on the existing persistent local database whose product schema was empty.
- PASS를 주장할 수 있는 범위: reviewed generated baseline application, config/journal/hash checks, current role boundary, migration transaction/lock code paths, repeat-run, ledger access separation, and zero product-table boundary as tested above.
- Product schema, data constraints, per-table grants, Tenant RLS, clean-volume provisioning, production security, and the P0 exchange acceptance are not covered by this result.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않았다.
