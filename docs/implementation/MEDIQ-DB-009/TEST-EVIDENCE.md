# MEDIQ-DB-009 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-009` |
| 제목 | P0 runtime least privilege and Tenant RLS database boundary |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PARTIAL` — database enforcement PASS; application Authorization/context integration not implemented |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell host; Docker Desktop PostgreSQL scratch container |
| Runtime·Toolchain | PostgreSQL 18.6 pinned image; Node.js 24; npm workspaces; Docker Compose |
| 대상 환경 | Disposable scratch database; local synthetic runtime adapter test |
| 데이터 | Synthetic TEST organizations, tenants, hospitals, exchange and `MQ-TEST-*` PatientReferences only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-DB-009-PRIV-001` | Runtime role flags, membership, ownership and elevation/DDL | Security/DB | Non-owner, non-superuser, no elevated attributes/membership; DDL and `SET ROLE` denied | Scratch catalog exact; CREATE/ALTER/ROLE/SET ROLE returned insufficient privilege | `PASS` |
| `TC-DB-009-PRIV-002` | PUBLIC/default ACL, migration ledger and ungranted table at DB-009 checkpoint | Security/DB | No broad grants; runtime cannot read ledger or then-ungranted product table | At this DB-009 execution, no matching PUBLIC/runtime table/default grant; ledger and `patient_mappings` denied | `PASS` — later PAT-002-DEC-002 adds only eight named mapping SELECT columns; see `TC-PAT-002-DB-001` |
| `TC-DB-009-PRIV-003` | Exact PatientReference columns/operations | Security/DB | Five approved columns only, SELECT+INSERT only | Exact 10 column privilege rows; no table-wide grants | `PASS` |
| `TC-DB-009-PRIV-004~005` | Synthetic-code CHECK and mutation boundary | Security/Integration | Synthetic create/read succeeds; invalid code, UPDATE/DELETE/TRUNCATE denied | Database CHECK rejected non-synthetic value; mutations denied; PAT repository rollback passed | `PASS` |
| `TC-DB-009-PRIV-006` | API/migration runtime credential separation | Config/Security | Runtime receives runtime URL only; migrator and ledger isolated | Compose baseline check and scratch runtime ledger denial passed | `PASS` |
| `TC-DB-009-RLS-001` | RLS policy inventory | Security/DB | All Tenant-owned/participating rows ENABLE+FORCE with explicit policies; global synthetic exception listed | 16 relations ENABLE+FORCE; 16 runtime and 16 migrator policies; `patient_refs` excluded by policy | `PASS` |
| `TC-DB-009-RLS-002` | Missing context and wrong-Tenant write | Security/DB | Missing context exposes no rows; wrong-Tenant write denied | No-context read returned zero; Tenant A insert targeting B was denied | `PASS` |
| `TC-DB-009-RLS-003` | Malformed context and safe API denial | Security/API | DB fails closed and API maps to fixed safe error | Invalid UUID setting failed at database boundary; API error mapping is not implemented | `PARTIAL` |
| `TC-DB-009-RLS-004~005` | A/B/C row scope and bilateral Exchange visibility | Security/DB | Only own or exact participating Tenant rows visible; nonparticipant denied | A/B each saw the fixture Exchange; C saw zero; C saw only own Hospital | `PASS` |
| `TC-DB-009-RLS-006` | Transaction-local context reset | Security/DB | Commit/rollback clears context before another borrower | Original DB probe verified PostgreSQL semantics; IAM-002 same-client wrapper and runtime max-one-pool borrower/rollback acceptance passed (see IAM-002 evidence) | `PASS` |
| `TC-DB-009-RLS-007` | No grant/owner/BYPASSRLS path | Security/DB | Unapproved table/ledger denied; runtime is not owner and cannot bypass policies | Role/catalog probes and runtime denials passed | `PASS` |
| `TC-DB-009-RLS-008` | Parameterized SQL / injection-shaped input | Unit/Contract | Values stay bound; injection-shaped code rejected before repository query | Repository binding contract passed; malformed SQL-shaped code rejected before query | `PASS` |
| `TC-DB-009-RLS-009` | Same-role custom GUC mutation residual | Security/DB | Demonstrate and record that arbitrary SQL can change Tenant setting; no prevention claim | Runtime changed the setting and read the corresponding synthetic Tenant row; residual documented | `PASS` (limitation reproduced) |
| `TC-DB-009-AUTH-001~004` | Tenant spoofing, actor/membership, Consent/Grant/Action, Preflight/STOW | API/E2E/Security | Deny-by-default authorization before disclosure/side effect | Authenticated business routes, Authorization Engine and PACS Preflight are absent | `NOT RUN` |
| `TC-PAT-001-PER-003` | Least-privilege PAT repository persistence | Integration/Security | Runtime synthetic create/read/conflict/rollback; no temporary grant or API route | Test-profile container used actual runtime DB URL; test passed and transaction left no PatientReference | `PASS` (PAT scope only) |
| DB-002~007 regressions | Existing schema/constraint compatibility | Integration | Clean reset/reapply retains approved schema and all earlier tickets pass | DB-002 through DB-007 scripts all reported PASS in the final scratch run | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Full disposable schema, privilege/RLS, reset and prior-ticket regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Empty scratch PostgreSQL 생성, roles/migrations, DB-009 privilege/RLS/Auth boundary probes, PAT-001 repository runtime integration, owned-volume reset/reapply 및 DB-002~007 regression.
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: `0`
- 핵심 결과: `db009_access_boundary=PASS` (role/DDL/exact grant/RLS/cross-Tenant/context reset/PAT integration); `db008_reset_reapply=PASS`; `db008_prior_schema_regressions=PASS tickets=DB-002,DB-003,DB-004,DB-005,DB-006,DB-007`; `db008_ephemeral_cleanup=PASS`; `db008_schema_validation=PASS`.
- 판정: `PASS` for database enforcement and previous schema regressions.

실행 이력: 초기 시도에서는 Node 24 TAP summary 표기 및 기존 DB-003~007 합성 코드 fixture 대소문자 불일치가 발견되어 harness를 수정했다. 강화 probe 적용 중 disposable DB reset bootstrap exit 2가 한 번 발생했으며, 스크립트가 소유한 임시 Compose project만 cleanup했다. 이후 같은 전체 명령을 재실행해 위 acceptance 전부와 최종 cleanup을 exit 0으로 확인했다. persistent/local Docker volume 삭제는 하지 않았다.

### TEST-002 — API and persistence contract regressions

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: PatientReference domain/repository bind-parameter, invalid SQL-shaped value rejection, API health and migration-runner regressions.
- 명령:

```powershell
npm run test:api
npm run test:db-migrations
npm run build:api
npm run db:migrations:check
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: API build + 16 tests passed; migration-runner 6 tests passed; Drizzle journal check returned “Everything's fine”.
- 판정: `PASS`

### TEST-003 — Compose privilege boundary

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: API/test target에는 runtime DB URL만, migration profile에는 migration URL만 주입되는지 검증.
- 명령:

```powershell
./scripts/validate-compose-baseline.ps1
```

- 종료 코드: `0`
- 핵심 결과: Compose syntax, pinned images, migration/runtime URL separation, isolated PAT test profile, network and volume controls passed.
- 판정: `PASS`

Read-only postcondition check: local MediQ PostgreSQL migration ledger has 9 rows; `patient_refs` and `patient_mappings` each have 0 rows after integration tests. The disposable DB-008 Compose project reported owned-resource cleanup PASS.

### TEST-004 — PAT-001 runtime integration container

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: actual `mediq_runtime` connection로 `PatientReference` create/find/duplicate-safe-conflict/rollback 실행.
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile test run --build --rm --no-deps api-db-integration-test
```

- 종료 코드: `0`
- 핵심 결과: Node test summary `pass 1`, `fail 0`; runtime username/host assertions passed; synthetic row rolled back.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| PRIV-001 | Runtime attempts table/schema/role DDL or `SET ROLE` | SQLSTATE insufficient privilege | `PASS` |
| PRIV-004 | Runtime inserts non-`MQ-TEST-*` reference | DB CHECK violation | `PASS` |
| PRIV-005 | Runtime UPDATE/DELETE/TRUNCATE | Denied; no direct write capability | `PASS` |
| RLS-002/004 | Missing context, wrong-Tenant insert | Empty read/denied write | `PASS` |
| RLS-003 | Malformed UUID context | Database cast fails closed; no API wrapper to test | `PARTIAL` |
| RLS-005 | Third Tenant queries bilateral Exchange | Zero rows | `PASS` |
| RLS-009 | Same runtime executes `set_config` with another synthetic Tenant | Context changes; matching row becomes visible; this is the explicitly accepted residual | `PASS` (risk reproduced) |
| AUTH-001~004 | Spoofed identity, invalid Consent/Grant, preflight failure before STOW | No relevant authenticated application path exists | `NOT RUN` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Verified identity → Tenant resolution and app transaction wrapper | Completed separately by `MEDIQ-IAM-002` | Context wrapper is accepted, but it is not business Authorization | Keep business routes/grants closed until safe errors and object/action Authorization pass |
| Fixed safe API error for malformed Tenant context | No protected business API/exception mapper exists | Raw DB exception must not be exposed when routes are added | Add API-level generic denial tests before endpoint wiring |
| Consent/Grant/Action/Resource authorization and PACS preflight | Business Authorization and transfer workflow not implemented | RLS visibility must never be treated as permission | Implement IAM/AUT/GRT/Preflight acceptance; assert zero STOW on denial |
| Production or real-patient context integrity | P0 uses synthetic data and accepted mutable-GUC residual | Same-role arbitrary SQL can change Tenant context | Production gate requires signed/non-forgeable context or stronger isolation |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Reproducible scratch acceptance | `scripts/test-db-008-full-schema.ps1`; output summarized in this record | Synthetic identifiers only; no secrets or DICOM payload |
| Migration | `services/api/src/database/migrations/0008_black_mandrill.sql` | Schema/policy text only |
| PAT integration test | `tests/database/patient-reference-runtime.integration.test.mjs` | Synthetic-only; no connection string printed |
| Decision and normative amendments | `docs/POLICY-DECISION-LOG.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/SYSTEM-ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/THREAT-MODEL.md`, `docs/ACCEPTANCE-TESTS.md` | No patient/credential values |

## 7. 결론

- 결과: `PARTIAL`
- PASS 범위: scratch DB object privileges, role/DDL boundary, PatientReference synthetic exception, RLS policy inventory/SQL probes, IAM-002 same-client wrapper/pool reset, known mutable-GUC residual reproduction, PAT-001 runtime repository test, DB-002~007 regression.
- 미완료 범위: API generic error mapping, business Authorization, PatientMapping runtime path and PACS Preflight/STOW denial evidence.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
