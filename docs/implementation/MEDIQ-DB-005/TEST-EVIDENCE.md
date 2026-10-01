# MEDIQ-DB-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-005` |
| 분류 | `CAPSTONE-P0` |
| 검증일 | 2026-09-30 (Asia/Seoul) |
| 결과 | `PASS` — DB persistence schema scope only |

## 1. 환경과 안전 경계

| 항목 | 값 |
|---|---|
| OS / 실행 | Windows PowerShell host, local Docker Compose |
| DB | pinned PostgreSQL 18.6 image, isolated Compose database network |
| Migration role | `mediq_migrator`; secret values are not recorded |
| Fixtures | Synthetic identifiers and values; test transaction rolled back |
| Database state after run | migration ledger 6; approved product tables 14; fixture rows 0 |

실제 환자정보, 운영 DICOM, credential, secret, key 또는 payload를 사용·기록하지 않았다. 기존 local DB volume은 보존했으며 migration 추가와 transaction 기반 fixture만 수행했다.

## 2. Acceptance 결과

| ID | 검증 | 실제 결과 | 판정 |
|---|---|---|---|
| TC-DB-005-REG-001 | migration apply/re-run, table inventory | Initial apply twice at ledger=6/tables=14; forward regression after DB-007 at ledger=7/tables=17; both PASS | PASS |
| TC-DB-005-REG-002 | exact schema/defaults | 4 tables, 정확히 31 columns, 4 PK; column type/length/nullability 일치, undocumented default 0 | PASS |
| TC-DB-005-REG-003 | FK and deletion policy | 13 FK 모두 RESTRICT; 13 invalid-reference insert 거부; 대표 9 parent deletion 제한 확인 | PASS |
| TC-DB-005-REG-004 | finite Consent/Grant values | Consent status 5, action 4, Grant status 4, scope 4 허용; 6종 invalid CHECK 거부 | PASS |
| TC-DB-005-REG-005 | consent version and grant expiry | consent_version > 0 및 expires_at > issued_at 경계; invalid version·expiry 거부 | PASS |
| TC-DB-005-REG-006 | uniqueness | session/version, ACTIVE-per-session partial index, consent/action, grant/scope 중복 총 4종 차단 | PASS |
| TC-DB-005-REG-007 | indexes and minimization | 승인 index 13개 확인; exact column allowlist로 미승인 payload/identity/secret 열 없음; 스키마 외 업무권한 생성 없음 | PASS |
| TC-DB-005-REG-008 | valid fixtures, optional fields, rollback | nullable actor/package 및 승인 참조 fixture 저장; transaction rollback 뒤 synthetic row 0 | PASS |

DB CHECK/FK는 스키마 제약만 검증한다. Consent 유효성·철회, Authorization, recipient/resource/destination 업무 일치 또는 Grant scope 사용 시점 차단을 검증한 결과가 아니다.

## 3. Ticket 통합 검증

### TEST-001 — DB-005 migration, exact schema, constraints, rejection and rollback

실행 명령:

```powershell
.\scripts\test-db-005-consent-grant.ps1 -EnvFile .env
```

핵심 결과:

```text
migration_apply_attempt=1 result=PASS
migration_apply_attempt=2 result=PASS
migration_ledger=PASS rows=6 owner=mediq_migrator
product_tables=14 runtime_select_1=PASS runtime_migration_ledger_access=DENIED
db005_schema=PASS scope_tables=4 columns=31 primary_keys=4 explicit_indexes=13 checks=6 foreign_keys=13 unique_constraints=3
db005_synthetic_constraints=PASS consent_states=5 actions=4 grant_states=4 scopes=4 invalid_checks=6 invalid_fk=13 duplicate_keys=4 delete_restrict=9 nullable_fields=PASS
db005_rollback=PASS synthetic_consent_grant_rows_persisted=0
db005_consent_grant_status=PASS
```

PowerShell AST parsing also completed with zero parse errors before the integration script was run. Test script output suppresses raw SQL and sensitive values.

최종 재실행 종료 코드: 0.

DB-007 additive migration 이후 forward-compatibility 확인을 위해 같은 script를 다시 실행했다. 종료 코드 0; migration ledger 7, approved product tables 17, DB-005의 4 tables/31 columns/제약/rollback checks 모두 PASS. 아래 기존 출력 block은 DB-005 최초 적용 당시의 snapshot이며 current-state regression은 이 문단의 결과를 따른다.

## 4. 회귀·프로젝트 기준선 검증

DB-005 migration 적용 이후 아래 schema regression scripts를 각각 실행했다. 각 script의 migration apply를 두 번 수행하고 ledger/table inventory를 재확인했다.

| 명령 | 결과 |
|---|---|
| `.\scripts\test-db-002-registry.ps1 -EnvFile .env` | PASS; registry 5 tables / 39 columns; rejection and rollback |
| `.\scripts\test-db-003-patient.ps1 -EnvFile .env` | PASS; patient 2 tables / 13 columns; rejection and rollback |
| `.\scripts\test-db-004-exchange.ps1 -EnvFile .env` | PASS; ExchangeSession 1 table / 11 columns; state, invalid FK and rollback |
| `.\scripts\test-db-005-consent-grant.ps1 -EnvFile .env` | PASS; DB-007 이후 forward regression at ledger=7 / 17 product tables |
| `.\scripts\test-db-006-imaging.ps1 -EnvFile .env` | PASS; imaging 2 tables / 19 columns; invalid state/count/FK, uniqueness and rollback |

| 명령 | 실제 결과 |
|---|---|
| `npm run db:migrations:check` | PASS |
| `npm run test:db-migrations` | 6 tests passed, 0 failed |
| `npm run typecheck:api` | PASS |
| `npm run test:api` | 1 file, 3 tests passed |
| `npm run typecheck:app-config` | PASS |
| `npm run test:app-config` | 8 tests passed, 0 failed |
| `.\scripts\validate-compose-baseline.ps1 -EnvFile .env` | PASS |
| `docker compose --env-file .env -f infra/docker-compose.yml config --quiet` | exit 0 |
| `git diff --check` | exit 0; Git printed only existing LF→CRLF normalization warnings |

One combined PowerShell command initially passed arguments incorrectly to the Compose validator; the validator was then called directly with `-EnvFile .env` and passed. This was test-command orchestration, not an application or Compose validation failure.

## 5. 미실행 시험과 잔여 위험

| 시험 | 미실행 사유 | 영향·후속 |
|---|---|---|
| Consent create/approve/reject/withdraw API and Authorization/Grant issue/use | DB-005 schema-only scope | Separate approved service/API/security Ticket required |
| Cross-tenant RLS/table grants | DB-008 and authorization foundation not complete | Tenant isolation is not proven by these schema tests |
| DICOMweb Viewer/Download, STOW-RS, destination verification, Integrity/Provenance/Audit, A→B E2E | Outside DB-005 scope | Product exchange and P0 acceptance remain unverified |
| Application-level cross-row consistency | Not declared as DB-005 trigger/schema responsibility | Enforce and test in domain/service layer fail-closed |

## 6. 최종 판정

- DB-005 persistence schema Acceptance TC-DB-005-REG-001~008: PASS.
- Scope completion: PASS for this schema-only Ticket.
- Product authorization, tenant isolation, DICOM transfer, and full Capstone P0: NOT ESTABLISHED / NOT PASS.
- Detailed implementation: [IMPLEMENTATION-REPORT.md](IMPLEMENTATION-REPORT.md).
