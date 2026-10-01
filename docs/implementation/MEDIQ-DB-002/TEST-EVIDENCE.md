# MEDIQ-DB-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-002` |
| 제목 | P0 Organization Tenant Hospital registry schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — Ticket scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell host; services run in local Docker Compose |
| Runtime·Toolchain | Node.js/NPM workspace, Drizzle Kit, PostgreSQL 18.6 pinned image, Docker Compose |
| 대상 환경 | Local isolated database network and local persistent test DB |
| 데이터 | Synthetic registry rows only; transaction rolled back |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-DB-002-REG-001` | Inventory and repeat apply | Integration | Exactly the five DB-002 tables; migration ledger remains ordered and idempotent | Product table count 5; migration ledger 2 rows; two apply attempts pass | `PASS` |
| `TC-DB-002-REG-002` | Column contract | Integration | All documented columns, primary keys, SQL types, nullability and no undocumented defaults | Exact 39-column shape, five primary keys and zero column defaults matched | `PASS` |
| `TC-DB-002-REG-003` | FK and delete policy | Integration / Security | Missing references rejected; parent deletion RESTRICTed | Six FK paths rejected invalid references; three parent-delete attempts rejected by RESTRICT | `PASS` |
| `TC-DB-002-REG-004` | Unique keys | Integration | Duplicate declared keys rejected | Five code/composite unique cases rejected | `PASS` |
| `TC-DB-002-REG-005` | Approved CHECK values | Integration | Undocumented values rejected only for enumerations in baseline | Five invalid status/type/environment values rejected | `PASS` |
| `TC-DB-002-REG-006` | Secondary indexes | Integration | All documented indexes present | 11 named secondary indexes found | `PASS` |
| `TC-DB-002-REG-007` | Secret minimization | Security / Schema | No undeclared secret/credential columns; endpoint URL is not invoked | Exact column allowlist matched; test URLs are synthetic and were not called | `PASS` |
| `TC-DB-002-REG-008` | Fixture and rollback | Integration | Valid synthetic rows accepted; invalid paths rejected; no rows persist after rollback | Two organizations, tenants, hospitals, three endpoint metadata rows, two actors inserted; all test rows rolled back; persistent count 0 | `PASS` |
| `TC-DB-001-MIG-004/005` | Migration history and runtime boundary regression | Integration / Security | Idempotent migration history; runtime can connect but cannot read ledger | Two migration runs passed; ledger owned by migrator; runtime `SELECT 1` passed and ledger read denied | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Automated migration and runner checks

- 실행 일시: 2026-09-30 (KST)
- 목적: Migration journal consistency, safe runner behavior, rollback unit path, API schema compilation
- 명령:

```powershell
npm run db:migrations:check
npm run test:db-migrations
npm run typecheck:api
```

- 종료 코드: `0` for each command
- 핵심 결과: Drizzle journal check passed; 6 migration runner tests passed; API TypeScript typecheck passed
- 판정: `PASS`

### TEST-002 — Database migration smoke and DB-002 registry integration

- 실행 일시: 2026-09-30 (KST)
- 목적: Apply/re-run, role boundary, exact schema contract, positive/negative synthetic transactions and rollback
- 명령:

```powershell
.\scripts\test-db-002-registry.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과:

```text
migration_apply_attempt=1 result=PASS
migration_apply_attempt=2 result=PASS
migration_ledger=PASS rows=2 owner=mediq_migrator
product_tables=5 runtime_select_1=PASS runtime_migration_ledger_access=DENIED
db002_schema=PASS tables=5 columns=39 primary_keys=5 explicit_indexes=11 checks=5 foreign_keys=6
db002_synthetic_constraints=PASS unique=5 check=5 foreign_key=6 delete_restrict=3
db002_rollback=PASS synthetic_rows_persisted=0
db002_registry_status=PASS
```

- 판정: `PASS`

### TEST-003 — API/config/Compose regression and change hygiene

- 실행 일시: 2026-09-30 (KST)
- 명령 및 실제 결과:

```powershell
npm run test:api                     # PASS — 1 file, 3 tests
npm run typecheck:app-config         # PASS
npm run test:app-config              # PASS — 8 tests
.\scripts\validate-compose-baseline.ps1 # PASS
docker compose --env-file .env -f infra/docker-compose.yml config --quiet # exit 0
git diff --check                     # exit 0
```

- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-DB-002-REG-003/004/005` | Invalid FK, duplicate unique values, invalid CHECK values, restricted deletes | All expected DB errors occurred; SQL transaction continued only for expected constraint classes | `PASS` |
| `TC-DB-002-REG-008` | Synthetic positive writes followed by rollback | No registry fixture rows persisted | `PASS` |
| Product authorization cases | no consent / invalid grant / cross-tenant / wrong destination / invalid mapping | Not applicable to registry-only schema Ticket; no business API or authorization decision implemented | `NOT RUN — deferred` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Fresh-volume/bootstrap from empty persistent volume | Existing user database was preserved; destructive volume reset is outside this Ticket | Provisioning bootstrap has not been re-proven from zero state | Separate approved disposable-environment test |
| Concurrent migrator lock contention | Not required to establish five-table schema correctness in this local run | Runner's cross-process advisory-lock contention not integration-tested here | Add controlled two-runner test before CI gate |
| Real PostgreSQL mid-migration DDL failure injection | Runner unit test verified rollback using a fake client; no deliberate DDL failure was applied to shared local DB | Real-server rollback path not re-exercised for this schema migration | Use disposable DB in a future migration test |
| Product API authorization, RLS and table grants | Not part of DB-002 approved scope | Registry FK integrity does not provide Tenant isolation or authorization | DB-003+ and security/API Acceptance Tickets |
| Missing `organization_type`, hospital `status`, actor `status` enumerations and cross-row pair consistency | Approved Data Model leaves these values/relationships open | Those specific invariants are not DB-enforced in this migration | Resolve and trace in DB-008 before full-schema gate |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Migration | `services/api/src/database/migrations/0001_registry-core.sql` | No credentials or patient payload |
| Reproducible integration test | `scripts/test-db-002-registry.ps1` | Synthetic values only; no endpoint calls |
| Test log | This file, TEST-002 output | No password, token, real patient or DICOM payload |

## 7. 결론

- 결과: `PASS` — DB-002 declared registry-schema scope only
- PASS를 주장할 수 있는 범위: Five registry tables and synthetic constraint/rollback integration as recorded above
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
