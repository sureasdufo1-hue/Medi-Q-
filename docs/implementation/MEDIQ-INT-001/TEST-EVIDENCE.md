# MEDIQ-INT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-INT-001` |
| 제목 | Bounded source integrity and authorized synthetic source-capture sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 결과 | `PARTIAL` — hash, persistence, CAP-001~004 and CAP-013~014 scoped PASS; CAP-005~012 and full destination/transfer workflow remain open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development workspace |
| Runtime·Toolchain | Node.js 24.18.0; npm 11; TypeScript 6.0.3; Vitest 5.0.2 |
| 대상 환경 | Local synthetic unit/build checks; disposable DB-008 PostgreSQL/RLS scratch; isolated CAP-001/002/003/004/014 PostgreSQL + HTTPS Test Orthanc A/B Compose project |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-INT-001-HASH-001~008` | Canonical digest, exact bytes, completeness, hard/lower-only caps, stream error/abort and isolated dependency boundary | Unit / static scope | Positive known vector; order-independent digest; reject invalid/truncated/oversized/aborted streams; no product I/O | Focused suite 12/12; full API 30 files/541 tests; no DB/Orthanc/route/STOW invoked | `PASS` primitive only |
| `TC-INT-001-DB-001~010` | Operation-bound source evidence persistence, scope derivation, exact replay/conflict, Tenant RLS, rollback, first-write state gate, CHECK and grants | Unit / PostgreSQL integration / schema / privilege | PENDING-only row under visible CREATED operation; no scope spoofing, cross-Tenant disclosure, update/delete, or verified/destination fields | Repository suite 6/6; final DB-008 exact persistent 236-column grants, RLS and regression inventory PASS; prior scratch-grant test was temporary and removed | `PASS` persistence foundation only |
| `TC-INT-001-CAP-001` | Caller cannot supply operation scope; server derives Study from the Tenant-visible operation graph; minimal result omits PatientID/DICOM UID | Integration / security | Malformed scope rejected before verified-Tenant transaction or A/B I/O; valid capture requests only the Study UID stored on its operation and returns only the approved result fields | `./scripts/test-int001-source-capture.ps1` exit 0; spoofed scope denied with zero Tenant transaction/A/B calls; successful WADO path matched operation-bound Study; response allowlist excluded PatientID/Study UID | `PASS` — CAP-001 scope only |
| `TC-INT-001-CAP-002` | Missing/invalid initial `PACS_IMPORT` authorization, cross-Tenant scope, and unavailable authorization dependency | Live service / PostgreSQL RLS / DICOM effect boundary / Audit | Absent Consent/Grant, withdrawn/expired Consent, revoked/expired Grant, wrong scope: fixed denial, zero DICOM gateway/A calls, no evidence, exactly one fixed minimized denial Audit when Tenant+operation resolve; hidden Tenant operation: no row/no Audit; DB unavailable: fixed unavailable/no DICOM/no Audit | `./scripts/test-int001-source-capture.ps1` exit 0; three consecutive runs each 19/19 Node tests; exact Audit observer: 7 CAP-002 denial rows, hidden/unavailable 0; B empty; cleanup/stack preservation PASS | `PASS` — CAP-002 scope only |
| `TC-INT-001-CAP-003` | Persisted operation/session/study/package/source binding mismatch or operation state not `CREATED` | Integration / DB / security | Two inconsistent but individually FK-valid synthetic aggregates are generic-denied with zero DICOM/evidence/source-denial-Audit and unchanged `CREATED`; a valid `FAILED` operation reached through domain/repository transition is denied with one minimized source-capture denial Audit, zero DICOM/evidence, and remains `FAILED` | `./scripts/test-int001-source-capture.ps1` exit 0; three consecutive runs each 19/19 tests; independent observer verified exact denial/setup Audits and all four operation states/evidence counts; no DICOM calls on CAP-003 paths; B EMPTY; cleanup/stack preservation PASS | `PASS` — CAP-003 scope only |
| `TC-INT-001-CAP-004` | Caller-controlled source endpoint/credential, untrusted origin, TLS downgrade, redirect or operation-role misuse | Live source-capture / adapter / TLS / route-boundary security | Extra endpoint/credential/Auth fields are rejected before Tenant context/network; actual authorized WADO uses only HTTPS `orthanc-a:8042/dicom-web/`, GET, redirect error and configured A Authorization; malformed origins and WADO-to-B/A-STOW are stopped before fetch; no browser controller/OpenAPI route | Source-capture runner exit 0 three consecutive times, each 19/19; 4 live A WADO requests/run observed with only exact configured A origin and auth-match boolean, zero forbidden-origin attempts; TLS/DICOM suite 7/7; AppConfig 11/11; API regression 34 files/585 tests; B EMPTY, cleanup/stack preservation PASS | `PASS` — CAP-004 scoped boundary only |
| `TC-INT-001-CAP-014` | Initial authorization ordering, source failure/success effects, active transaction boundary, and B-side zero-write | Integration / Security | A WADO follows committed DB-backed `PACS_IMPORT`; invalid Grant produces no A call; failure produces no evidence; success produces one pending baseline; no Tenant transaction spans WADO; B remains empty; disposable project is removed | `./scripts/test-int001-source-capture.ps1` exit 0; shared suite 19/19 on three consecutive runs including CAP-001~004; read-only Audit/evidence observer passed; B EMPTY before/after; cleanup PASS and existing `mediq` stack unchanged | `PASS` — CAP-014 scope only |
| `REQ-INT-001` full; `SEC-INT-001/002`; `AT-FUNC-014`; `AT-SEC-018`; `AT-E2E-003` | Authorized source, destination match, failure blocks completion and complete transfer evidence | DB / Integration / Security / E2E | Trusted A source→MediQ→B destination verification and no false completion | Destination comparison, product import route, STOW, transfer terminal state and full P0 workflow were not part of CAP-014 | `NOT RUN` |

## 3. 실행 명령과 결과

### TEST-001 — Focused source integrity suite

- 실행 일시: 2026-10-01
- 목적: 8 Acceptance groups covering deterministic manifest construction, exact stream bytes, boundaries, cancellation and sanitized failures
- 명령:

```powershell
npx vitest run tests/api/source-integrity-manifest.test.mjs --reporter=verbose --maxWorkers=1
```

- 종료 코드: 0
- 핵심 결과: 1 test file; 12 tests passed; fixed vector `sha256:855de908102c02a22d8d8c3f86e0096864689848ec77ba64c538878b4d1c0cca`
- 판정: `PASS` primitive only

### TEST-002 — Full API regression and build

- 실행 일시: 2026-10-01
- 목적: TypeScript API build plus all API tests
- 명령:

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: 0
- 핵심 결과: API build passed; 30 test files / 541 tests passed
- 판정: `PASS`

### TEST-003 — API typecheck

- 실행 일시: 2026-10-01
- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: 0
- 핵심 결과: TypeScript `--noEmit` passed
- 판정: `PASS`

### TEST-004 — DICOM Port type contract regression

- 실행 일시: 2026-10-01
- 명령:

```powershell
npm run test:dicom-port-contract
```

- 종료 코드: 0
- 핵심 결과: Port consumer/adapter contract TypeScript check passed; no adapter was changed or invoked
- 판정: `PASS`

### TEST-005 — Independent fixed-vector calculation

- 실행 일시: 2026-10-01
- 목적: Verify the committed test's digest against a separate inline implementation of the documented framing, not only against the builder itself
- 명령:

```powershell
node --input-type=module -e "import {createHash} from 'node:crypto'; const hash=createHash('sha256'); hash.update(Buffer.from('MEDIQ-DICOM-MANIFEST\0V1\0','ascii')); const count=Buffer.alloc(4); count.writeUInt32BE(2); hash.update(count); for (const [uid,data] of [['1.2.3',Buffer.from([1,2,3])],['1.2.4',Buffer.from([16,32])]]) { const id=Buffer.from(uid,'ascii'); const idLen=Buffer.alloc(4); idLen.writeUInt32BE(id.length); const size=Buffer.alloc(8); size.writeBigUInt64BE(BigInt(data.length)); hash.update(idLen).update(id).update(size).update(createHash('sha256').update(data).digest()); } console.log('sha256:'+hash.digest('hex'))"
```

- 종료 코드: 0
- 핵심 결과: independent result `sha256:855de908102c02a22d8d8c3f86e0096864689848ec77ba64c538878b4d1c0cca`, matching the fixed unit vector
- 판정: `PASS`

### TEST-006 — Pending source-evidence repository unit tests

- 실행 일시: 2026-10-02
- 명령:

```powershell
npx vitest run tests/api/source-integrity-evidence-repository.test.mjs --reporter=dot --maxWorkers=1
```

- 종료 코드: 0
- 결과: 1 file / 6 tests passed; exact operation/session/package/Study binding, PENDING-only SQL, exact replay, conflict, invisible operation, strict input surface and sanitized DB error covered
- 판정: `PASS` unit scope

### TEST-007 — API build and full regression

- 실행 일시: 2026-10-02
- 명령:

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: 0
- 결과: API build passed; 34 test files / 584 tests passed
- 판정: `PASS`

### TEST-008 — API typecheck, migration journal and migration runner

- 실행 일시: 2026-10-02
- 명령:

```powershell
npm run typecheck:api
npm run db:migrations:check
npm run test:db-migrations
npm run test:dicom-port-contract
```

- 종료 코드: all 0
- 결과: TypeScript no-emit, Drizzle journal consistency, 6 migration-runner tests and DICOM Port type contract passed
- 판정: `PASS`

### TEST-009 — Full disposable PostgreSQL/RLS/regression gate

- 실행 일시: 2026-10-02
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: 0
- 결과:
  - DB-008 fresh-schema and reset/reapply PASS; 18 product tables, 22 migration-ledger rows, PK/FK/UNIQUE/CHECK catalog `18|50|17|40`
  - New `INT-001` PostgreSQL/RLS Acceptance PASS: operation-derived binding, exact replay, changed-manifest conflict, rollback, no Tenant context, third-Tenant isolation, unknown/late-first-write denial, direct invalid-row CHECK rejection
  - Scratch-only 12-column SELECT + 12-column INSERT grant was revoked; persistent runtime inventory restored to 209; UPDATE/DELETE and table-level/PUBLIC rights absent
  - DB-002~007 regressions PASS and owned disposable resources cleaned
- 판정: `PASS` schema/persistence sub-gate only

One earlier aggregate attempt stopped on a synthetic UID fixture range error; a later intermediate run reported only a generic assertion. The fixture and probe were revised, and the final full run above passed. The intermediate assertion’s exact originating check was not independently established, so no specific root cause is claimed.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-INT-001-HASH-004~006` | Invalid UID/count/media type/Content-Length, size overflow, thrown/read error, abort | Reject with fixed code/generic message; active body cancelled where applicable; no result | `PASS` — focused tests |
| `TC-INT-001-HASH-008` | Check external-effect and sensitive-data boundary | No concrete DICOM adapter, database, route, audit/provenance or STOW integration in helper; no PatientID/payload/credential/per-instance digest in output | `PASS` — code/dependency review and isolated synthetic tests |
| `TC-INT-001-DB-006~010` | Missing Tenant/other Tenant, unknown operation, late first-write, invalid source status/binding and privilege probes | Fail closed; no returned identifiers or unauthorized changes; temporary grants removed | `PASS` — final DB-008 PostgreSQL/RLS run |
| Product Authorization/tenant/Consent/Grant denial | Not implemented in this hash primitive and no route calls it | No Authorization claim; later caller must gate retrieval/persistence separately | `NOT RUN` — required integration prerequisite |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Remaining CAP-005~012 negative/race/atomicity Acceptance beyond scoped CAP-001~004 | Live CAP-001~004 cover caller-scope, initial authorization, persisted binding, initial-state and source endpoint/TLS boundaries only; they do not cover every metadata, concurrency, rollback, destination and failure condition in the full CAP set | Some complete-service edge cases remain unverified | Continue separately under CAP-005~012 and retain STOW gate |
| Destination hash/verification, product no-STOW coordinator, STOW, production-like performance benchmark | Not in CAP-014 scope; no destination workflow or production workload was invoked | No destination authenticity, 2 GiB throughput, or end-to-end transfer claim | Separate recommendation/Acceptance and implementation before any STOW |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Synthetic unit output only | Test process output; no DICOM fixture file generated or persisted | PHI·Secret 없음 |
| Fixed known digest vector | `TC-INT-001-HASH-001` | Synthetic bytes and synthetic UIDs only |

## 7. 결론

- 결과: `PARTIAL`
- PASS 범위: canonical streaming hash, operation-bound pending evidence/schema/RLS, exact permanent runtime grants (`CAP-013`), bounded operation-scope boundary (`CAP-001`), initial-authorization denial matrix (`CAP-002`), persisted-binding/initial-state rejection (`CAP-003`), configured endpoint/TLS/credential boundary (`CAP-004`), and isolated synthetic authorized source-capture effect boundary (`CAP-014`) only.
- No PASS claim for remaining CAP-005~012, production PACS, destination comparison/verification, transfer completion, product import route, STOW, or A→B E2E. CAP-001~004/014 evidence is limited to the disposable synthetic test environment.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.

## 8. Authorized Source-Capture Sub-gate — Current Checkpoint

`INT-001-DEC-003` and 14 Acceptance cases were recorded before code changes. The internal source-capture service, resolved authorization/session-fence executor path, Audit allowlist, and mocked API tests are implemented. CAP-014 has a separate live synthetic Test Orthanc/PostgreSQL result in section 9; the mocked tests still do not substitute for that real integration evidence.

| Verification | Command/evidence | Actual result | Status |
|---|---|---|---|
| API build + complete API regression, including new source-capture/executor/Audit unit tests | `npm run test:api -- --reporter=dot` | Exit 0; TypeScript API build passed; 34 test files / 584 tests passed | `PASS` — API/unit scope only |
| Focused authorization, Audit, source-capture test invocation via direct `npx vitest` | `npx vitest run tests/api/authorized-source-capture.test.mjs tests/api/authorization-gated-operation.test.mjs tests/api/audit-event-writer.test.mjs --reporter=dot --maxWorkers=1` | Did not start: external npx cache failed to resolve `@jridgewell/sourcemap-codec`; repository-owned `npm run test:api` subsequently ran the full suite successfully | `TOOLING ERROR` — no test result |
| Exact permanent runtime privilege migration/catalog inventory and source-evidence PostgreSQL/RLS sub-gate | `./scripts/test-db-008-full-schema.ps1` | Exit 0; exact 236 total column privileges; `integrity_evidence` 12 SELECT + 12 INSERT; `study_references` 6 SELECT; no UPDATE/DELETE; source-evidence replay/conflict/rollback/no-context/cross-Tenant/late-write cases PASS | `PASS` — database sub-gate only; no full service/PACS claim |
| Clean/reset/reapply and DB-002~007 regression | `./scripts/test-db-008-full-schema.ps1` | Exit 0; 18 product tables; migration ledger 23; catalog `18|50|17|40`; DB-002~007 PASS; owned ephemeral resources cleaned | `PASS` — schema/regression scope |
| Real Test Orthanc A WADO retrieval, B zero-write and no open DB transaction during WADO | Planned test-only integration using synthetic A/B and disposable PostgreSQL | Not run; current service tests use a mocked DICOM gateway | `NOT RUN` |

The row above is a historical pre-CAP-014 checkpoint and is superseded by section 9 below.

### Current boundary

- New application-service tests exercise mocked authorization, operation scope, PatientMapping, metadata/count checks, source errors, in-flight revocation/mapping changes, and audit/evidence rollback behavior. They do not prove PostgreSQL grants/RLS or real PACS endpoint behavior.
- `TC-INT-001-CAP-001~004` and `CAP-013~014` are `PASS` for their recorded scopes; CAP-005~012 remain open/not accepted as complete end-to-end gates.
- The exact permanent runtime grant migration is present and validated. The service remains internal-only and is not reachable through HTTP; CAP-014 proves only the isolated synthetic source-capture boundary, not destination import or B-side product behavior.
- No STOW, B write, destination verification or full A→B E2E was run or claimed.

## 9. CAP-001 / CAP-002 / CAP-003 / CAP-004 / CAP-014 — Isolated live source-capture boundary Acceptance

- 실행 일시: 2026-10-02
- 권고/범위: §13.3~13.7 of [IMPLEMENTATION-REPORT.md](IMPLEMENTATION-REPORT.md), recorded before the respective test changes; test is confined to synthetic data and disposable services.
- 명령:

```powershell
./scripts/test-int001-source-capture.ps1
```

- 종료 코드: 0
- 주요 결과:
  - A/B Test Orthanc and PostgreSQL ran under a random temporary Compose project with isolated database, hospital-A, and hospital-B networks; no service-under-test container joined hospital-B.
  - Temporary database was migrated; synthetic fixture was seeded; Hospital A received exactly three approved synthetic CT instances. Hospital B was `EMPTY` before and after.
  - After the final CAP-004 changes, the source-capture runner was executed three times consecutively; each execution exited 0 with 19/19 Node tests. CAP-001 caller-scope spoofing was rejected before a verified-Tenant transaction or any A/B request; the valid success path used only the operation-bound Study UID and returned an allowlisted response with no PatientID/Study UID.
  - CAP-002 denial matrix: absent Consent/Grant, withdrawn/expired Consent, revoked/expired Grant and wrong Grant scope all returned fixed denial, made zero DICOM gateway/A requests, created no source evidence and produced exactly seven expected minimized denial Audit rows across the matrix. The RLS-hidden cross-Tenant operation and database-unavailable cases produced no Audit; Hospital B remained empty.
  - CAP-003 binding/state matrix: the operation→other-Session package/Study and operation→wrong-source-Hospital Study aggregates each returned fixed generic denial, made zero DICOM calls, created no evidence, produced no denial Audit because the complete trusted binding did not resolve, and remained `CREATED`. A separate valid operation was inserted as `CREATED`, transitioned to `FAILED` with `PacsTransferOperation` and `PostgresPacsTransferOperationRepository`, and emitted its setup transition Audit. Capture then returned fixed denial, emitted exactly one minimized source-capture denial Audit, made zero DICOM calls, created no evidence, and left it `FAILED`.
  - CAP-004 caller-override case supplied synthetic endpoint URL, source URL, username, password and Authorization properties; exact-command validation rejected them before Tenant context, DICOM gateway, Audit/evidence or upstream fetch. Each successful capture observed four outbound WADO requests (one metadata + three instances) as `https://orthanc-a:8042/dicom-web/...`, without URL userinfo/query/fragment, using GET and `redirect: error`; the configured-A Authorization match was retained only as a boolean, never printed or recorded as a credential. Forbidden endpoint/scheme counter, STOW and destination-verification calls were all zero. The `PacsImportModule` metadata test confirms no browser-facing controller is registered.
  - Authorized A metadata/instance retrieval followed committed database-backed authorization. Injected source-body failure persisted no source evidence and left the PACS operation `CREATED`; its fixed start/failure Audit events were observed. Successful capture recorded exactly one operation-bound `SOURCE_CAPTURE/PENDING` evidence row and fixed start/success Audit events; operation remained `CREATED`.
  - Fetch hooks asserted zero active verified-Tenant transactions during WADO headers and successful response stream consumption. The service container had no route to B and its DICOM gateway rejected any non-A request; STOW/destination-verification calls were instrumented as forbidden and remained zero.
  - Independent database observer checked exact Audit rows (8 source-capture denial rows; 4 hidden/unavailable/unresolvable cases without such Audit, plus the separately expected fixture state-transition Audit), final evidence and all four operation states. Each run cleaned only its temporary project, confirmed Hospital B `EMPTY` before/after, and showed the pre-existing `mediq` container/volume/network inventory unchanged.
- TLS/DICOM command: `docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test`; exit 0, 7/7 live integration tests. Trusted A/B certificate/auth path passed; untrusted and malformed CA, wrong SAN and plaintext downgrade were rejected; A QIDO/WADO/frame checks passed with byte hashes matching the synthetic manifest; B read-only baseline contained 0 instances; no STOW or POST ran.
- Configuration command: `npm run test:app-config`; exit 0, API AppConfig build + 11/11 tests, including rejection of HTTP, wrong host/port, userinfo, path, query and fragment.
- API regression: `npm run test:api -- --reporter=dot` exit 0; API TypeScript build passed; 34 test files / 585 tests passed.
- 판정: `PASS` — `TC-INT-001-CAP-001~004` and CAP-014 scoped boundaries only. This does not prove CAP-005~012, production/client-ingress TLS, destination verification, STOW, `AT-SEC-012`, `AT-E2E-003`, or full P0 transfer.
- 이전 시도 참고: CAP-002 fixture seeding first rejected a malformed synthetic idempotency UUID (`22P02`), and one earlier integration invocation exited 1 without a safely attributable root cause; that unresolved CAP-002 harness-risk record remains. The first CAP-003 fixture attempt was rejected by `PACS_TRANSFER_OPERATION_INITIAL_STATE_INVALID` (`23514`) because it tried to insert a non-`CREATED` state; this confirms the DB guard and was corrected by using the approved transition repository, not by bypassing it. Three later CAP-003-inclusive runs passed 18/18; the final CAP-004-inclusive runner passed 19/19 on three consecutive runs.
