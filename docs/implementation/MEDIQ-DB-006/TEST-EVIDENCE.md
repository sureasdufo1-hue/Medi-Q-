# MEDIQ-DB-006 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-006` |
| 제목 | Imaging metadata persistence schema |
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
| `TC-DB-006-REG-001` | Migration apply/re-run and approved table list | Integration | Exactly two metadata tables added; no unexpected table; migration history idempotent | Applied/re-run twice; ledger=5 and total approved product tables=10 | `PASS` |
| `TC-DB-006-REG-002` | Declared columns, PK, types/nullability/defaults | Integration | Exact 19-column shape, two PKs, no undocumented defaults | Exact allowlist and catalog metadata passed | `PASS` |
| `TC-DB-006-REG-003` | Five parent FKs and delete policy | Integration / Security | Invalid references rejected; all FK delete rules RESTRICT | `invalid_fk=5`, FK catalog=5 with RESTRICT; four representative delete attempts rejected | `PASS` |
| `TC-DB-006-REG-004` | Seven ImagingPackage states | Integration | All approved values accepted; unknown value rejected | `states=7 invalid_state=1` | `PASS` |
| `TC-DB-006-REG-005` | Non-negative counts and nullable Study counts | Integration | Negative study/package counts denied; NULL series/instance count accepted | `invalid_count=3 nullable_study_counts=PASS` | `PASS` |
| `TC-DB-006-REG-006` | Index and Study UID uniqueness | Integration | Eight declared indexes exist; duplicate package/UID is rejected | `explicit_indexes=8 unique=1 duplicate_package_uid=1` | `PASS` |
| `TC-DB-006-REG-007` | Data minimization / authorization boundary | Security / Schema | No binary/PHI columns; synthetic metadata only; UID does not authorize access | Exact schema allowlist checked; no application authorization component exists in scope | `PASS — schema only` |
| `TC-DB-006-REG-008` | Synthetic parent-linked package/study rows and rollback | Integration | Valid references accepted; transaction rollback leaves no test rows | `db006_rollback=PASS synthetic_metadata_rows_persisted=0` | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Imaging Metadata migration and constraints

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Generated migration, declared metadata schema, count/state/UID constraints and rollback
- 명령:

```powershell
.\scripts\test-db-006-imaging.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: migration apply attempts 1/2 PASS; ledger=5 owned by `mediq_migrator`; approved product tables=10; exact schema, synthetic rejection and rollback PASS.
- 판정: `PASS`

### TEST-002 — Database migration and type checks

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령: `npm run db:migrations:check`; `npm run typecheck:api`; PowerShell AST parse of `scripts/test-db-006-imaging.ps1`
- 종료 코드: `0`
- 핵심 결과: Drizzle migration check, API TypeScript check, and PowerShell AST parse passed.
- 판정: `PASS`

### TEST-003 — Prior schema regression after DB-006

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령: `scripts/test-db-002-registry.ps1 -EnvFile .env`; `scripts/test-db-003-patient.ps1 -EnvFile .env`; `scripts/test-db-004-exchange.ps1 -EnvFile .env`
- 종료 코드: all `0`
- 핵심 결과: DB-002 registry 5-table/39-column constraints and rollback PASS; DB-003 2-table/13-column Patient schema, A/B mappings and rollback PASS; DB-004 11-column Exchange schema and negative/rollback PASS. Each ran with migration ledger=5 and approved product table count=10.
- 판정: `PASS`

### TEST-004 — Workspace, API/config and Compose regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령 및 결과:
  - `npm run test:db-migrations` — exit 0, 6/6 tests passed.
  - `npm run test:api` — exit 0, 1 file / 3 tests passed (includes API build).
  - `npm run typecheck:api` — exit 0.
  - `npm run test:app-config` — exit 0, 8/8 tests passed.
  - `npm run typecheck:app-config` — exit 0.
  - `scripts/validate-compose-baseline.ps1` — exit 0.
  - `docker compose --env-file .env -f infra/docker-compose.yml config --quiet` — exit 0.
  - `npm run db:migrations:check` — exit 0.
  - PowerShell AST parse of `scripts/test-db-006-imaging.ps1` — PASS.
  - `git diff --check` — exit 0; Git printed working-copy LF→CRLF warnings only.
- 판정: `PASS` for listed checks.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-DB-006-REG-003/004/005/006` | Invalid FK, state/count, duplicate Study UID, and restricted parent delete | Five invalid FKs, invalid state, three negative counts, duplicate UID and four parent deletes rejected | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| DB-005 Consent/Grant schema and package-reference FKs | Separate approved DB-005 scope; its FK target is now present | Consent/Grant schema itself remains unimplemented | Implement/test under DB-005 next |
| Application package/session patient/source consistency and PACS workflow | Outside DB-006 schema scope | Schema does not establish business authorization or PACS correctness | Enforce/test in approved service and integration Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Console summaries from TEST-001~004 | Counts and PASS markers recorded above; SQL payload/output omitted | Synthetic-only; no PHI/secret/credential |

## 7. 결론

- 결과: `PASS` (DB-006 schema Ticket scope only)
- PASS를 주장할 수 있는 범위: migration/schema/constraint/index/synthetic rollback only; product authorization and DICOM exchange are not PASS
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
