# MEDIQ-PAT-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-002` |
| 제목 | Synthetic source PatientMapping domain and repository boundary |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PARTIAL` — domain/SQL contract and DEC-002 internal read-only runtime Acceptance PASS; HTTP/API, write workflow and imaging Authorization remain out of scope |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest |
| 대상 환경 | Local API tests; isolated disposable PostgreSQL scratch Compose project for DB-008 clean/reset/reapply; existing local `mediq` development DB for the documented DB-002~007 migration/regression phase |
| 데이터 | Synthetic registry, actors, PatientReferences, mappings and injected test principal only; no real-patient/production data or live OIDC issuer |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PAT-002-GATE-001` | Scope and privilege boundary | Documentation/security gate | DEC-002 exact-Hospital read-only internal path only; no write/API route | `PAT-002-DEC-001/002` recorded; exact 8-column SELECT only; no mapping route/provider wiring | `PASS` |
| `TC-PAT-002-DOM-001~002` | Synthetic input, active reference, mapping states | Unit | Only canonical synthetic keys and declared states accepted | 14 PatientMapping domain cases passed; invalid forms, inactive and non-domain reference rejected | `PASS` |
| `TC-PAT-002-PER-001~002` | SQL injection, overbroad lookup and identifier leakage | SQL contract/unit | Bound values, exact Hospital predicates, generic conflicts/errors | 6 repository cases passed; no query for malformed keys; DB details/local ID not exposed in errors | `PASS` |
| `TC-PAT-002-TEN-001` | Cross-Tenant mapping visibility and writes | Integration/security | A/B exact-Hospital reads only; C denied; writes denied | Actual runtime A/B positive reads, Tenant C RLS invisibility, and INSERT/UPDATE/DELETE/TRUNCATE denials | `PASS` |
| `TC-PAT-002-TEN-002` | Untrusted Tenant/Hospital candidate and exact Hospital membership | Integration/security | Verified active `USER` and exact membership Hospital only; reject mismatch before mapping SQL | Wrong Hospital (including same Tenant), wrong Tenant, `SERVICE`, tenant-level and missing principal denied; mapping query count unchanged; no HTTP spoofing claim | `PASS` |
| `TC-PAT-002-SEC-001` | Missing/malformed Tenant context and safe error | Integration/security | Internal path fails closed without query/data/write | Missing principal/mismatch denied before mapping SQL; HTTP safe-error remains untested because no route exists | `PASS` — internal boundary only |
| `TC-PAT-002-SEC-002` | Connection-pool reuse after commit/rollback | Integration | No context inherited by the next borrower | Actual max-one runtime pool reused; tenant setting absent and no-context mapping query returned zero | `PASS` |
| `TC-PAT-002-SEC-003` | Grant/route precondition | Security gate | Exact approved internal read grant; no write or route; broader business/image access stays closed | DEC-002 reviewed; eight mapping SELECT columns only, forced RLS; no route/provider/OpenAPI/PACS path | `PASS` — approved limited scope |
| `TC-PAT-002-DB-001` | Mapping runtime privilege inventory | Security/DB integration | Exactly 8 named mapping SELECT columns and no write/table/default/PUBLIC/DDL grant | Runtime catalog exactly matched approved eight-column list; global runtime column inventory=70 | `PASS` |
| `TC-DB-003-REG-001~008` | Existing schema/FK/status/unique/index/rollback | DB schema | Approved existing mapping schema only | Prior DB-003 evidence PASS; DB-003 regression script also reran in TEST-002; PAT-002 introduced no schema change | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — 초기 domain/repository checkpoint

- 실행 일시: 2026-09-30 local time
- 목적: Compile API and run all API unit/contract suites, including PAT-002
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript build PASS; Vitest 3 files passed, 36 tests passed (PAT-002 file: 20 tests)
- 판정: `PASS` for implemented unit/SQL-contract scope

### TEST-002 — DEC-002 disposable runtime Acceptance

- 실행 일시: 2026-09-30 local time
- 목적: Disposable scratch DB clean/reset/reapply, exact grants/RLS, PAT-002 runtime path, and DB-002~007 regression.
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: `0`
- 핵심 결과: disposable scratch DB clean/reset/reapply and `db009_access_boundary=PASS` with 70 exact runtime column privileges; `patient_mappings` exact 8-column SELECT only; PAT-002 same-Hospital A/B read, same-Tenant wrong-Hospital pre-query denial, other-Tenant/SERVICE/tenant-level/missing-principal denial, Tenant C forced-RLS invisibility, INSERT/UPDATE/DELETE/TRUNCATE denial and pool reset passed. DB-002~007 scripts then ran against the existing `mediq` development Compose project as documented in `scripts/README.md`; their migration smoke applied pending migrations to that DB (ledger now 12) before transaction-scoped regressions, all PASS. The disposable project was cleaned up.
- 판정: `PASS` for DEC-002 internal read-only Acceptance; this does not pass HTTP/API or product-image Authorization.

Post-run read-only inspection of the existing `mediq` development database confirmed migration ledger=12, runtime column privileges=70, exactly 8 `patient_mappings` SELECT columns, and zero rows in `patient_mappings`, `patient_refs`, and `actors`. The existing synthetic registry baseline remained 3 organizations, 3 tenants, 3 hospitals and 4 endpoints; no business fixtures remained. The pending migration was applied to the persistent local development schema by the documented migration/regression phase; it was not applied to a production database.

### TEST-003 — current code and regression checks

| 명령 | 실제 결과 | 판정 |
|---|---|---|
| `npm run test:api` | API TypeScript build PASS; Vitest 15 files / 305 tests PASS | PASS |
| `npm run typecheck:api` | exit 0 | PASS |
| `npm run db:migrations:check` | Drizzle journal consistency: “Everything's fine” | PASS |
| `npm run test:db-migrations` | 6 tests passed, 0 failed | PASS |
| `npm run test:app-config` | 10 tests passed, 0 failed | PASS |
| PowerShell parser for `scripts/test-db-008-full-schema.ps1` | no parser errors | PASS |
| `./scripts/validate-compose-baseline.ps1` | Compose syntax/security boundary validation PASS | PASS |

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PAT-002-DOM-001` | malformed/real-shaped Local ID and inactive PatientReference | Domain rejects without SQL access | `PASS` |
| `TC-PAT-002-PER-001` | SQL-injection-shaped key | Rejected before query; parameters remain bound | `PASS` |
| `TC-PAT-002-PER-002` | unique violation and generic database failure | Fixed non-disclosing application errors | `PASS` |
| `TC-PAT-002-TEN-001~002` | wrong Tenant/Hospital or client override | Runtime integration denies before mapping SQL and verifies C RLS invisibility; see TEST-002 | `PASS` |
| `TC-PAT-002-SEC-001` | absent/malformed context | Internal boundary denies before query; no HTTP mapping route exists | `PASS` internally; HTTP not run |
| `TC-PAT-002-SEC-002` | pool borrower after commit/rollback | Runtime max-one pool showed empty Tenant setting and zero visible rows after request transactions | `PASS` |
| `TC-PAT-002-SEC-003` | precondition for runtime mapping grant/route | DEC-002 authorizes only internal read; no write/API/image route | `PASS` for narrow approved boundary |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| HTTP mapping route and HTTP safe-error behavior | Explicitly excluded from `PAT-002-DEC-002`; no route/provider is registered | No HTTP access claim; internal error handling is not an HTTP response guarantee | Separate recommendation, Authorization/Consent/Grant and BOLA/safe-error Acceptance before any route |
| Role-based workforce capability for PatientMapping | Actor registry has no workforce roles/capabilities; DEC-002 uses same-Hospital verified active `USER` as its narrow internal read boundary | Any active `USER` in the exact Hospital can exercise this internal mapping reader | Keep internal-only and synthetic; establish role/capability model before exposing/expanding the operation |
| Public API and image authorization | No mapping business route or protected-image data path is implemented | No claim of Consent/Grant enforcement, Viewer/Download/PACS permission | Implement only after `SEC-AUTHZ-010~011` and AUT-002~004 / PACS preflight gates |
| Destination mapping and PACS Import denial | Explicitly PAT-003/004 scope | No PACS authorization/transfer claim | Execute PAT-003/004 Acceptance later |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| API test output | `npm run test:api`, exit 0, latest 305/305; initial 36/36 checkpoint retained above | Synthetic IDs only; no PHI/secret |
| DB schema evidence | `MEDIQ-DB-003/TEST-EVIDENCE.md` | Existing synthetic fixture evidence |
| Runtime grant/RLS boundary | `scripts/test-db-008-full-schema.ps1`, `MEDIQ-DB-009/TEST-EVIDENCE.md` | Disposable database evidence; scratch resources cleaned; no credentials copied |

## 7. 결론

- 결과: `PARTIAL` — approved internal slice PASS; Ticket is not fully complete.
- PASS 범위: synthetic domain validation, parameterized repository contract, same-Hospital verified USER internal lookup, exact 8-column runtime SELECT, forced Tenant RLS, cross-Hospital/Tenant/Actor denial, writes/DDL denial, and pool reset.
- 미검증/미구현 범위: HTTP/API exposure and HTTP safe-error, workforce role/capability authorization, PatientMapping writes/admin workflow, patient identity proof, Consent/Grant decision, image access/Viewer/Download, destination mapping and PACS behavior.
- Identity boundary: the database integration injects a synthetic principal into the IAM-002 trusted service boundary; it does not test OIDC/JWT signature validation or a live authentication/HTTP guard.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않았다.

## 8. PAT-002-DEC-002 follow-up — runtime read Acceptance (완료)

구현 시작 전 승인된 범위는 내부 read-only mapping path다. 허용 대상은 IAM-002 verified active `USER`와 exact Hospital 일치이며, mapping data query는 같은 verified Tenant transaction의 같은 `PoolClient`에서 수행한다. `patient_mappings`에는 정확한 8개 컬럼 `SELECT`만 허용하고 runtime write, route, PACS 연동은 계속 닫는다.

| 추가 검증 | 목표 결과 | 현재 판정 |
|---|---|---|
| Same-Hospital A/B mapping read | 합성 mapping만 반환; caller Hospital은 권한 근거가 아니며 SQL은 verified Hospital을 사용 | PASS — A/B returned only their own synthetic mapping |
| Wrong Hospital, same Tenant | repository query 전에 deny; callback/query count 변화 없음 | PASS — same-Tenant other-Hospital and Hospital B candidate denied with no query-count increase |
| Tenant C, Hospital-less, `SERVICE`, missing/failed context | deny; mapping data query 없음; Tenant C cannot view A/B row through RLS | PASS — untrusted actor/context cases denied before mapping query; C direct A-row read returned zero |
| Runtime privilege catalog | exact 8 mapping SELECT + preexisting grants only; write/table/default/DDL grant 없음 | PASS — exact 8 named SELECT privileges; INSERT/UPDATE/DELETE/TRUNCATE denied; overall inventory=70 |
| RLS/pool | cross-Tenant row 미노출; commit/rollback 후 pool 재사용에 Tenant setting 잔류 없음 | PASS — max-one runtime pool context reset; no-context read returned zero |

실행 증거는 `TEST-002`에 기록했다. `PAT-002-DEC-002`의 internal read-only Acceptance는 PASS다. HTTP mapping route, API safe-error, write path 및 의료영상 업무 Authorization은 별도 범위로 계속 닫혀 있다.
