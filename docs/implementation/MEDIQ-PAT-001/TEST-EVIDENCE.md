# MEDIQ-PAT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-001` |
| 제목 | Synthetic PatientReference domain and persistence adapter |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — within the synthetic domain/repository scope; no API or business authorization claim |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell host |
| Runtime·Toolchain | Node.js 24; npm workspace; TypeScript/Vitest; Docker Compose; PostgreSQL 18.6 pinned scratch image |
| 대상 환경 | Unit/contract tests; isolated test-profile PostgreSQL runtime connection; disposable DB regression |
| 데이터 | Synthetic `MQ-TEST-*` only; generated row rolled back |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PAT-001-DOM-001~002` | Synthetic domain invariants | Unit/Security | Allowed code/UUID/status/time accepted; malformed/identity-shaped input rejected without echo | Domain tests passed, including malformed code/status/time | `PASS` |
| `TC-PAT-001-PER-001~002` | Parameterized SQL and safe error mapping | Unit/Contract | Five approved columns and bind parameters; unique/DB errors are non-disclosing | Create/find contracts and fixed conflict/persistence errors passed | `PASS` |
| `TC-PAT-001-SEC-001` | Public and identity boundary | Static/Contract | No route/controller/AppModule wiring; no identity proof claim | No patient controller/route or AppModule wiring | `PASS` |
| `TC-PAT-001-PER-003` | Runtime persistence under minimum privilege | Integration/Security | Runtime synthetic create/read/conflict/rollback works with only approved column grants | Test-only container asserted runtime role; one test passed; rollback left no row | `PASS` |
| `TC-DB-009-PRIV-004~005` | DB synthetic code and mutation boundary | Security/DB | DB rejects non-synthetic code and disallows mutations | Scratch DB CHECK rejected invalid namespace; UPDATE/DELETE/TRUNCATE denied | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build/unit/contract

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: PatientReference domain/repository contract and API regression tests.
- 명령:

```powershell
npm run test:api
npm run build:api
```

- 종료 코드: `0` (final rerun before handoff)
- 핵심 결과: PatientReference and health tests passed; build passed. Invalid SQL-shaped code test verifies rejection before any repository query.
- 판정: `PASS`

### TEST-002 — Actual `mediq_runtime` adapter integration

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Runtime user creates/finds a synthetic reference, maps duplicate to generic conflict, and rolls back.
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile test run --build --rm --no-deps api-db-integration-test
```

- 종료 코드: `0`
- 핵심 결과: Node test summary `pass 1`, `fail 0`; runtime identity/host assertions passed; all database mutations occurred in a rollback-only transaction.
- 판정: `PASS`

### TEST-003 — Full scratch DB and historical schema regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Reproduce DB-009 plus PAT-001 in disposable PostgreSQL and ensure prior DB-002~007 schema tests remain valid.
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: `0`
- 핵심 결과: DB-009 runtime grant/RLS probes PASS; PAT-001 repository integration PASS; clean reset/reapply PASS; DB-002~007 regressions PASS; owned scratch cleanup PASS.
- 판정: `PASS`

### TEST-004 — Migration runner/journal and deployment boundary

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령:

```powershell
npm run test:db-migrations
npm run db:migrations:check
./scripts/validate-compose-baseline.ps1
```

- 종료 코드: all `0` (final rerun before handoff)
- 핵심 결과: migration runner tests passed, Drizzle journal consistent, runtime/migration/test-profile credentials remain separate.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PAT-001-DOM-002` | Invalid/non-canonical code/status/time | Fixed domain error, no input echo | `PASS` |
| `TC-PAT-001-PER-002` | Duplicate reference and generic database failure | Fixed conflict/persistence errors; no DB details | `PASS` |
| `TC-DB-009-PRIV-004` | Non-synthetic PatientReference direct DB insert | DB CHECK denied the row | `PASS` |
| `TC-DB-009-PRIV-005` | Runtime UPDATE/DELETE/TRUNCATE | Insufficient privilege | `PASS` |
| `TC-DB-009-RLS-008` | SQL-injection-shaped value to repository | Domain rejected before DB query; valid query path remains parameterized | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Public PatientReference API | Explicitly excluded by PAT-001 and current synthetic-only policy | No external caller path exists; route must not be added implicitly | Separate approved API + IAM + privacy scope and Acceptance |
| PatientMapping persistence/authorization | PAT-002 Acceptance/scope not yet complete; no runtime grant for `patient_mappings` | PAT-001 reference success does not authorize mapping | Define PAT-002 Acceptance and Tenant-bound transaction/AuthZ prerequisite first |
| Real identity proof or real patient records | Out of scope for capstone synthetic fixture | Synthetic reference is not a verified person | Separate identity/privacy/legal review |
| Consent/Grant/DICOM/PACS E2E | PAT-001 repository scope has no business authorization or DICOM side effect | No authorization or transfer claim | Continue only after IAM/AUT/GRT/Preflight gates |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit/contract suite | `tests/api/patient-reference.test.mjs` | Synthetic fixed values only |
| Runtime integration | `tests/database/patient-reference-runtime.integration.test.mjs` | Test URL is not printed; generated code only; transaction rolled back |
| Disposable DB gate | `scripts/test-db-008-full-schema.ps1` | Synthetic fixture; temporary project cleaned |
| DB-009 migration | `services/api/src/database/migrations/0008_black_mandrill.sql` | Schema and grants only |

## 7. 결론

- 결과: `PASS` — only `MEDIQ-PAT-001` synthetic domain/repository persistence scope.
- PASS 범위: domain validation, parameterized minimal SQL, safe errors, runtime column-grant create/read/duplicate/rollback, no public route, synthetic DB constraint.
- PASS가 의미하지 않는 것: identity proof, PatientMapping, Actor/Tenant authorization, consent/grant decision, protected-table access, API exposure or PACS transfer.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
