# MEDIQ-GRT-003 Test Evidence

**Current status, 2026-10-03:** Current-schema regression failed; see §8. Earlier scoped PASS results below are historical and are not evidence that this failure is resolved.

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-003` |
| 제목 | Consent-bound idempotent Grant issue API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS — scoped Acceptance` |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS/Shell | Windows, PowerShell `7.6.5` |
| Node/npm | Node `v24.18.0`, npm `11.16.0` |
| PostgreSQL | DB-008 disposable scratch PostgreSQL `18.6-bookworm` pinned image |
| Runtime identity | `mediq_runtime` non-owner/non-superuser/`NOBYPASSRLS`; migration identity `mediq_migrator` |
| 대상 환경 | Local disposable Docker Compose integration harness |
| 데이터 | Synthetic/Test only; scratch environment cleaned after gate |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 실제 결과 | 판정 |
|---|---|---|---|---|
| GRT-UNIT | Scope/action mapping, recipient/session/consent/package binding, malformed input, state/freshness, TTL, replay/conflict, rollback on Audit failure | Unit | `npm run test:api -- --reporter=dot`: 23 files, 442 tests passed | PASS |
| GRT-TYPE | API TypeScript surface | Static/typecheck | `npm run typecheck:api` completed successfully | PASS |
| GRT-DB-API | Signed OIDC HTTP route, verified destination requester, exact recipient/package, Consent action checks, denied paths, replay and response minimization | Integration | DB-008 clean and reset/reapply runs each reported `grt003_issue_api=PASS`; nested TAP `pass 8` each | PASS |
| GRT-CONCURRENCY | Same-key concurrent issue, distinct keys and key/scope conflict | Integration/security | Same key returned one Grant and one success Audit pair; distinct keys created distinct Grants; conflicting scope returned 409 without mutation | PASS |
| GRT-ATOMIC | Injected Scope and Audit persistence failure | Integration | Both returned fixed 503; no Grant, Scope, or success Audit remained | PASS |
| GRT-PRIV-RLS | Runtime column privileges, forced RLS and cross-Tenant denial | Security/database | Exact 144 runtime column privilege rows; no broad table grant; third-Tenant issue denied without target rows/Audit | PASS |
| GRT-MIGRATION | Nullable idempotency column/index/check and clean migration replay | Migration/database | DB-008 clean + reset/reapply; ledger 17; product tables 17; migration checker passed | PASS |
| GRT-REGRESSION | Existing DB-002~007 schema and constraints | Regression | DB-002, DB-003, DB-004, DB-005, DB-006, DB-007 all reported PASS | PASS |
| GRT-CLEANUP | Ephemeral integration environment cleanup | Environment | `db008_ephemeral_cleanup=PASS`; no matching scratch/test containers remained | PASS |

## 3. 실행 명령과 결과

### TEST-001 — API typecheck

- 실행일: 2026-10-01
- 명령: `npm run typecheck:api`
- 종료 코드: `0`
- 핵심 결과: `tsc --project services/api/tsconfig.json --noEmit` 성공
- 판정: `PASS`

### TEST-002 — API regression

- 실행일: 2026-10-01
- 명령: `npm run test:api -- --reporter=dot`
- 종료 코드: `0`
- 핵심 결과: API 23 test files, 442 tests passed
- 판정: `PASS`

### TEST-003 — Migration consistency

- 실행일: 2026-10-01
- 명령: `npm run db:migrations:check`
- 종료 코드: `0`
- 핵심 결과: Drizzle migration consistency check reported `Everything's fine`
- 판정: `PASS`

### TEST-004 — Full DB-008 clean/reset/reapply gate

- 실행일: 2026-10-01
- 명령: `.\scripts\test-db-008-full-schema.ps1`
- 종료 근거: 최종 `db008_schema_validation=PASS` 및 `db008_ephemeral_cleanup=PASS` 출력 후 오류 없이 프로세스 종료, scratch/test 컨테이너 없음.
- 핵심 결과:
  - Clean 및 reset/reapply GRT-003 integrations 각 실행: `grt003_issue_api=PASS`, nested TAP `pass 8`.
  - Exact runtime catalog: 144 column privileges; broad table privilege 없음; forced RLS/cross-Tenant probes 통과.
  - Migration ledger 17, product tables 17; clean reset/reapply 성공.
  - DB-002~007 회귀 모두 통과. 갱신된 DB-005 inventory: 32 columns, 14 indexes, 7 checks.
  - Ephemeral scratch cleanup 통과.
- 판정: `PASS`

```text
grt003_issue_api=PASS signed_oidc=PASS consent_binding=PASS actor_tenant_binding=PASS semantic_idempotency=PASS concurrency=PASS audit_atomicity=PASS exact_privileges=144
db005_schema=PASS scope_tables=4 columns=32 primary_keys=4 explicit_indexes=14 checks=7 foreign_keys=13 unique_constraints=3
db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false
db008_ephemeral_cleanup=PASS
```

## 4. 실패·거부 경로

| 검증 | 경로 | 실제 결과 | 판정 |
|---|---|---|---|
| API-NEG | Wrong Actor/Hospital, `SERVICE`, tenant-level USER, another Tenant, missing/mismatched Session/Consent/Package, invalid Consent state/action, invalid/P1 scope | Denied; no Grant/Scope/success Audit; verified-context denials are minimized and audited | PASS |
| API-INPUT | Caller-supplied recipient/expiry, duplicate/empty/unknown scope, malformed key/correlation | Fixed 400/403; no unauthorized persistence | PASS |
| API-IDEM | Exact replay and same key/different scope | Exact replay returns same Grant; semantic mismatch returns 409, leaves existing Grant unchanged, records no second success pair | PASS |
| API-ROLLBACK | Scope or Audit writer fault | Fixed 503 and complete transaction rollback | PASS |
| DB-TENANT | Third-Tenant attempts to issue against another Tenant's Session | 403; no destination-Tenant Grant or Audit row | PASS |
| DB005-HARNESS | First full-gate run found the older DB-005 fixture expected its pre-0016 exact Grant column/index/check inventory | Updated only the regression harness for the additive nullable key/index/check and positional synthetic inserts; subsequent full clean gate reported DB-005 PASS | RESOLVED |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Operation-time object/action Authorization | GRT-003 issues the metadata Grant; this Ticket does not execute Viewer/Download/PACS operations | An issued Grant is not yet proof that every protected operation enforces it | GRT-005+ and Viewer/Download/PACS operation tickets |
| Grant revoke/remote recall | Explicitly excluded from GRT-003 scope | Existing/offline copies cannot be recalled by this issue API | `MEDIQ-GRT-004` recommendation and Acceptance first |
| Test Orthanc A→B DICOM/STOW E2E | No PACS/DICOM side effect is part of the issue endpoint | Overall P0 transfer path remains incomplete | PACS/Preflight/Verification E2E tickets |
| Production OIDC, legal consent and clinical TTL validation | Synthetic P0 local scope only | 30-minute cap and synthetic Consent semantics are not production approvals | Separate policy, privacy/legal and operational review before production |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Implementation report | `docs/implementation/MEDIQ-GRT-003/IMPLEMENTATION-REPORT.md` | No PHI/secret/payload |
| API unit suite | `tests/api/grant-issue.service.test.mjs` | Synthetic identifiers only |
| Signed-OIDC/PostgreSQL integration | `tests/database/grant-issue-api-runtime.integration.test.mjs` | Synthetic fixture; no credential/payload committed |
| Full schema gate | `scripts/test-db-008-full-schema.ps1` | Scratch-only environment, cleaned |
| DB-005 forward-compatible gate | `scripts/test-db-005-consent-grant.ps1` | Synthetic transactional rows rolled back |

## 7. 결론

- 결과: `PASS` — GRT-003 scoped issue API Acceptance만 통과.
- 근거: 26 API/DB Acceptance cases, API 442 tests, typecheck, migration consistency, live signed-OIDC PostgreSQL/RLS integration twice, exact 144 privilege inventory, DB-002~007 regressions.
- 전체 P0 A→MediQ→B 전송, Viewer/Download/PACS operation Authorization, revocation과 production readiness는 이 결과로 PASS 처리하지 않는다.
- 증거에는 실제 환자정보, 운영 Credential, Secret 또는 운영 DICOM을 포함하지 않는다.

## 8. Current rollback regression diagnosis (2026-10-03)

DB-008 `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`, session **6711**, project **mediq-db008-9d749e984b73**, exited **1** (confirmed 17:23:38 KST). Combined GRT-003/004 summary: **12 PASS / 2 FAIL**, the GRT-003 `Audit or Scope persistence failure rolls back all Grant rows` child and its parent suite. Fixed diagnostic: stage ROLLBACK, ActorTenantContextUnavailableError, no inner SQLSTATE/query phase. Cause unproven; COMMIT latency is not established. Later full-regression stages/repeat/reset/reapply were not reached. Independent exact-label inventory: zero containers/volumes/networks; existing MediQ stack healthy. Raw database output and credentials are not retained.

Before edits: GRT-003-DEC-002/DIAG-001~004 require test-only fixed connect/query/substep diagnostics, forwarding and error-identity preservation, unchanged injected failures/assertions/timeouts, and fault-app finally cleanup. ActorTenantContext currently intentionally replaces inner setup/registry/commit failures with the fixed unavailable error; the fixture context uses an unobserved client, so the current marker cannot identify the failed phase. No product fix is justified from this evidence. The active R4 source run uses another Docker target; do not alter its source/harness/Dockerfile inputs. Diagnostic-only code/tests and actual rerun evidence are pending; status PARTIAL.

**Implementation and checks:** The runtime proxy now emits only fixed stage/allowlisted error/coarse-time categories for unexpected connect/query errors, rethrows the same error, and forwards the original query/parameters/query_timeout unchanged. The GRT-003 fixture's ActorTenantContext uses that observed proxy; intentional fault branches are unchanged. Rollback scenarios report fixed CREATE_SESSION/SEED/APP/ISSUE/CLOSE/OBSERVE substeps and close fault apps in finally. DB-008 surfaces at most eight fixed DB markers and eight substeps, not raw output. `node --test tests/scripts/grant-db-diagnostics.test.mjs` exited 0 at **17:34:25 KST**, **15 PASS / 0 FAIL**, 452 ms: actual functions extracted by AST, fake clients only, including five preserved fault modes and sensitive-error suppression. `node --check tests/database/grant-issue-api-runtime.integration.test.mjs`, PowerShell parser on the wrapper, and `git diff --check` passed. Real DB rerun and full gate remain pending; neither a timeout fix nor rollback acceptance is claimed.

**Actual diagnostic rerun:** After separate source integration/cleanup and serial API 893/type/Port PASS had terminated, launched `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`, session **51950**, project **mediq-db008-181f3dd33ac9**, approximately 17:37 KST. Healthy PostgreSQL and role-bootstrap PASS only; full suite, three rounds, final exit and cleanup remain pending. Current test/product/build inputs are frozen. Follow MEDIQ-PACS-001 evidence §44; no success inferred and no retry of individual DDL/operations.
