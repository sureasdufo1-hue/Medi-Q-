# MEDIQ-DB-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-003` |
| 제목 | Patient Reference and Mapping schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — Ticket scope only |

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
| `TC-DB-003-REG-001` | Migration up/re-run, product table allowlist | Integration | DB-003 two tables applied once; no unapproved table | Ledger=3; two DB-003 apply attempts; total approved product tables=7 | `PASS` |
| `TC-DB-003-REG-002` | Columns, PK, types, nullability, defaults | Integration | Exact 13-column shape; two PKs; no undocumented defaults | Exact shape, nullability and no defaults matched; two PKs | `PASS` |
| `TC-DB-003-REG-003` | Patient/hospital FK and delete behavior | Integration / Security | Two FK references enforced; parent deletes RESTRICT | Both invalid FK inserts and both RESTRICT delete attempts denied | `PASS` |
| `TC-DB-003-REG-004` | Three declared unique constraints | Integration | Reference code and both mapping pairs reject duplicates | All three duplicate cases rejected; one reference mapped to both hospitals accepted | `PASS` |
| `TC-DB-003-REG-005` | Explicit status checks | Integration | Two status CHECK constraints enforce baseline values | Both invalid status cases rejected; all six declared statuses accepted | `PASS` |
| `TC-DB-003-REG-006` | Four declared secondary indexes | Integration | All named indexes exist | Four named indexes found | `PASS` |
| `TC-DB-003-REG-007` | Identity minimization | Security / Schema | Synthetic-only values; no real identity or demographic columns | Exact 13-column allowlist; synthetic codes only; output contains counts/status, not local IDs | `PASS` |
| `TC-DB-003-REG-008` | Two-hospital mapping fixture and rollback | Integration | Same PatientReference can map to separate hospitals; no fixture persists | A/B mappings accepted; transaction rolled back; patient/mapping fixture rows=0 | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Migration contract and type checks

- 실행 일시: 2026-09-30 (KST)
- 목적: Generated journal consistency, migration runner unit coverage and API schema compilation
- 명령:

```powershell
npm run db:migrations:check
npm run test:db-migrations
npm run typecheck:api
```

- 종료 코드: `0` for each command
- 핵심 결과: Drizzle journal check passed; 6 runner tests passed; API typecheck passed
- 판정: `PASS`

### TEST-002 — DB-003 migration and synthetic patient integration

- 실행 일시: 2026-09-30 (KST)
- 명령:

```powershell
.\scripts\test-db-003-patient.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과:

```text
migration_apply_attempt=1 result=PASS
migration_apply_attempt=2 result=PASS
migration_ledger=PASS rows=3 owner=mediq_migrator
product_tables=7 runtime_select_1=PASS runtime_migration_ledger_access=DENIED
db003_schema=PASS scope_tables=2 columns=13 primary_keys=2 explicit_indexes=4 checks=2 foreign_keys=2 unique=3
db003_synthetic_constraints=PASS patient_reference_status=2 mapping_status=4 invalid_fk=2 unique=3 check=2 delete_restrict=2
db003_rollback=PASS synthetic_patient_rows_persisted=0
db003_patient_status=PASS
```

- 판정: `PASS`

### TEST-003 — Previous registry regression after Patient migration

- 실행 일시: 2026-09-30 (KST)
- 명령: `.\scripts\test-db-002-registry.ps1 -EnvFile .env`
- 종료 코드: `0`
- 결과: DB-002 schema checks still pass with 7 approved product tables; migration history remains at 3 rows and runtime cannot read the ledger.
- 판정: `PASS`

### TEST-004 — API/config/Compose regression and change hygiene

- 실행 일시: 2026-09-30 (KST)
- 실행 결과:

```powershell
npm run typecheck:api                   # PASS
npm run test:api                        # PASS — 1 file, 3 tests
npm run typecheck:app-config            # PASS
npm run test:app-config                 # PASS — 8 tests
.\scripts\validate-compose-baseline.ps1 # PASS
docker compose --env-file .env -f infra/docker-compose.yml config --quiet # exit 0
git diff --check                        # exit 0
```

- DB-003 PowerShell script AST parse: `PASS`
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-DB-003-REG-003/004/005` | Missing FK, duplicate keys, invalid status and RESTRICT delete | Expected SQL constraint classes were rejected within synthetic test transaction | `PASS` |
| Product mapping decisions | Invalid/Ambiguous mapping for PACS Import | Out of DB schema Ticket; PAT-003/004 and business flow | `NOT RUN — deferred` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Fresh-volume/bootstrap from empty persistent volume | Existing shared local database was preserved | Fresh provisioning not re-proven | Disposable environment follow-up; do not reset user volume |
| Concurrent migrator lock contention | Not needed to verify the DB-003 schema contract | Cross-process contention remains untested | Add controlled concurrent test before CI gate |
| Real PostgreSQL DDL error injection | No destructive/failure injection against the shared DB | Real-server mid-migration rollback not re-proven | Test only against an approved disposable DB |
| Mapping authorization/PACS import | PAT-003/004 and business workflow are outside DB-003 | A structurally valid row does not authorize transfer | Implement fail-closed application checks and E2E later |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Generated migration | `services/api/src/database/migrations/0002_patient-identity.sql` | No patient payload/secret |
| Reproducible test | `scripts/test-db-003-patient.ps1` | Synthetic-only; local patient IDs not printed or persisted |
| Test output | This file, TEST-002~004 | Aggregate counts/status only; no PHI or credential |

## 7. 결론

- 결과: `PASS` — DB-003 approved persistence schema and synthetic constraints only
- PASS를 주장할 수 있는 범위: PatientReference/Mapping schema, approved statuses/keys/FKs/indexes and transaction rollback above
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
