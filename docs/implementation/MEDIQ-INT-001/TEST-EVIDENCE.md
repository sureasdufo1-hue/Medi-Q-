# MEDIQ-INT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-INT-001` |
| 제목 | Bounded source integrity and authorized synthetic source-capture sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 결과 | `PARTIAL` — CAP-001~010, CAP-013~014 pass only within recorded synthetic scopes; CAP-005/007/008 passed their recorded 3×31/31 and CAP-009/010 each passed 3×32/32 isolated gates; CAP-011~012, destination/transfer workflow and full P0 remain open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development workspace |
| Runtime·Toolchain | Node.js 24.18.0; npm 11; TypeScript 6.0.3; Vitest 5.0.2 |
| 대상 환경 | Local synthetic unit/build checks; disposable DB-008 PostgreSQL/RLS scratch; isolated CAP-001/002/003/004/005/006/009/010/014 PostgreSQL + HTTPS Test Orthanc A/B Compose project |
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
| `TC-INT-001-CAP-005` | Persisted-count gate and WADO metadata semantic/wire validation, no payload retrieval on rejection | API unit / DICOM adapter / isolated PostgreSQL-RLS + HTTPS Test Orthanc | Empty/count/series mismatch fixed denial; malformed/wrong/duplicate/over-limit metadata sanitized source-read failure; invalid persisted count denied before WADO; zero instance requests/evidence/success Audit; unchanged operation; B empty | API regression exit 0, build passed, 34 files/594 tests. `./scripts/test-int001-source-capture.ps1` passed 30/30 on three consecutive fresh projects; independent Audit/evidence observer PASS, B EMPTY, cleanup and existing-stack preservation PASS. Earlier intermittent pre-metadata DB-context failures were not reproduced in this sequence; original root cause remains unknown | `PASS` — scoped synthetic metadata validation; prior transient remains a test-environment residual |
| `TC-INT-001-CAP-006` | Invalid destination mapping or source-instance PatientID mismatch | API unit / isolated PostgreSQL-RLS + HTTPS Test Orthanc A | Missing/ambiguous/unverified/revoked/invalid mapping denies before metadata WADO; one synthetic source PatientID mismatch denies after exactly one metadata GET but before any instance WADO; fixed minimized Audit; no evidence/success Audit; unchanged operation; B empty | API regression exit 0, build passed, 34 files/601 tests. Six invalid mapping cases denied with zero metadata/instance calls and one fixed denial Audit. Isolated runner exit 0, 31/31; test-only in-memory metadata mutation caused fixed `SOURCE_PATIENT_ID_MISMATCH`, exactly one A metadata GET and zero instance WADO; independent observer verified exact Audit, no evidence/success, unchanged `CREATED`; B EMPTY and cleanup/stack preservation PASS | `PASS` — CAP-006 identity preflight only |
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
| Remaining CAP-007~012 negative/race/atomicity Acceptance beyond scoped CAP-001~006 | CAP-005/006 metadata and identity denial gates pass only within their recorded synthetic scopes; later gates still cover streaming failures, races, rollback, destination and failure conditions | CAP-007~012 complete-service edge cases remain unverified | Prepare CAP-007 recommendation/Acceptance, then continue CAP-007~012 and retain STOW gate |
| Destination hash/verification, product no-STOW coordinator, STOW, production-like performance benchmark | Not in CAP-014 scope; no destination workflow or production workload was invoked | No destination authenticity, 2 GiB throughput, or end-to-end transfer claim | Separate recommendation/Acceptance and implementation before any STOW |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Synthetic unit output only | Test process output; no DICOM fixture file generated or persisted | PHI·Secret 없음 |
| Fixed known digest vector | `TC-INT-001-HASH-001` | Synthetic bytes and synthetic UIDs only |

## 7. 결론

- 결과: `PARTIAL`
- PASS 범위: canonical streaming hash, operation-bound pending evidence/schema/RLS, exact permanent runtime grants (`CAP-013`), bounded operation-scope boundary (`CAP-001`), initial-authorization denial matrix (`CAP-002`), persisted-binding/initial-state rejection (`CAP-003`), configured endpoint/TLS/credential boundary (`CAP-004`), metadata validation (`CAP-005`), mapping/PatientID preflight (`CAP-006`), and isolated synthetic authorized source-capture effect boundary (`CAP-014`) only.
- CAP-007 and CAP-008 are `PASS (scoped)` only for their recorded synthetic internal stream/evidence and failure/cancellation/deadline tests. No PASS claim for CAP-009~012, production PACS, destination comparison/verification, transfer completion, product import route, STOW, or A→B E2E. CAP-001~008/013~014 evidence is limited to the disposable synthetic test environment.
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
- `TC-INT-001-CAP-001~010` and `CAP-013~014` are `PASS` for their recorded scopes. CAP-005/007/008 each passed three consecutive fresh isolated runs (31/31); CAP-009/010 each passed three consecutive fresh isolated runs (32/32). The historical pre-metadata Tenant-context failure root cause remains unknown. CAP-011~012 remain open.
- The exact permanent runtime grant migration is present and validated. The service remains internal-only and is not reachable through HTTP; CAP-014 proves only the isolated synthetic source-capture boundary, not destination import or B-side product behavior.
- No STOW, B write, destination verification or full A→B E2E was run or claimed.

### CAP-006 — Destination mapping / PatientID preflight

- Decision/Acceptance: `INT-001-CAP-006-REC-001`, recorded before test changes under `PDEC-001` and `PACS-001-DEC-002`; synthetic/Test-only, byte-preserving, no route/STOW.
- API regression: `npm run test:api -- --reporter=dot` exited 0; API build passed; 34 files / 601 tests passed.
- Service unit matrix: absent, ambiguous, unverified, revoked, missing validation evidence, and patient-reference binding mismatch all returned fixed `DENIED/PATIENT_MAPPING_INVALID`, one minimized denial Audit, zero metadata/instance requests, zero evidence, and no identifier disclosure. A one-of-three source PatientID mismatch returned fixed `DENIED/SOURCE_PATIENT_ID_MISMATCH` before any payload WADO.
- Isolated integration: `./scripts/test-int001-source-capture.ps1` exited 0 with 31/31 nested tests. A test-only transform changed one PatientID in the actual HTTPS Test A metadata response in memory. Exactly one metadata GET occurred; zero instance WADO, evidence, success Audit, STOW or destination verification occurred. Independent observer confirmed exact correlation-bound start/denial Audit, no persisted evidence and unchanged `CREATED`; B remained EMPTY and temporary cleanup/existing stack preservation passed.
- Raw PatientID/UID, DICOM payload, credential and upstream response were not included in outputs or evidence. Hospital A storage was not mutated.
- Not run: public route, production patient identity proof, STOW, destination verification or full A→B transfer.

## 9. CAP-005 / CAP-006 — Metadata and identity denial gates (scoped PASS)

- 실행 일시: 2026-10-02
- Decision/Acceptance: `INT-001-CAP-005-REC-001`, recorded before test changes in the policy log and implementation report §13.8; synthetic/Test-only, internal service only, STOW/destination verification remain forbidden.
- API regression: `npm run test:api -- --reporter=dot` exited 0; API build passed; 34 files / 594 tests passed.
- Focused coverage: `tests/api/authorized-source-capture.test.mjs` exercises missing/zero/over-limit persisted counts, empty/count/series mismatches, wrong Study, duplicate SOP, malformed identity and fixed no-stream/no-evidence/no-success behavior. `tests/api/orthanc-dicomweb.adapter.test.mjs` verifies duplicate SOP identity is rejected. The adapter defect was that `!seenSop.add(sopUid)` can never detect duplicates because `Set.add()` returns the Set; it now checks `has()` before insertion.
- Isolated command: `./scripts/test-int001-source-capture.ps1`; latest full invocation exited 0: `authorized_capture_test=PASS tests=30 failed=0`, independent Audit/evidence observer PASS, Hospital B EMPTY after, temporary project cleanup PASS, existing `mediq` stack unchanged. Test-only metadata response transformations happen in memory after HTTPS retrieval from synthetic Test Orthanc A.
- Observed CAP-005 expectations: invalid persisted count caused no metadata request; empty/count/series mismatch wrote only the fixed denial; malformed/wrong/duplicate/over-limit cases wrote only the fixed source-read failure; all cases had zero instance-payload requests, no evidence/success Audit, unchanged operation state, zero B/STOW/destination calls and sanitized output. Raw DICOM, PatientID, UID and credentials were not recorded.
- Stability caveat: earlier isolated invocations intermittently failed before reaching metadata WADO with the fixed `ACTOR_TENANT_CONTEXT_UNAVAILABLE` outcome; diagnostics localized failures to DB COMMIT/session-fence transaction work but did not establish a root cause. Three subsequent fresh isolated runs passed without in-run retries. CAP-005 is `PASS (scoped)` under the recorded three-run threshold; retain the historical unknown-cause test-environment residual.
- CAP-005 judgment: API regression 34 files / 594 tests and the isolated 30/30 runner passed three consecutive times with exact Audit/evidence observer, B EMPTY, cleanup and existing-stack preservation. This does not establish production PACS behavior or destination verification.
- CAP-006 decision/Acceptance: `INT-001-CAP-006-REC-001` was recorded before test changes under `PDEC-001` and `PACS-001-DEC-002`; synthetic/Test-only, byte-preserving, no route/STOW.
- CAP-006 API regression: `npm run test:api -- --reporter=dot` exited 0; API build passed; 34 files / 601 tests passed.
- CAP-006 service matrix: absent, ambiguous, unverified, revoked, missing validation evidence, and PatientRef-binding-mismatch mappings returned fixed `DENIED/PATIENT_MAPPING_INVALID`, one minimized denial Audit, zero metadata/instance requests, zero evidence, and no identifier disclosure. A one-of-three source PatientID mismatch returned fixed `DENIED/SOURCE_PATIENT_ID_MISMATCH` before payload WADO.
- CAP-006 isolated integration: `./scripts/test-int001-source-capture.ps1` exited 0 with 31/31 nested tests. A test-only in-memory transform changed one PatientID in the actual HTTPS Test A metadata response. Exactly one metadata GET occurred; zero instance WADO, evidence, success Audit, STOW or destination verification occurred. Independent observer confirmed the correlation-bound start/denial Audit, no persisted evidence and unchanged `CREATED`; B remained EMPTY and temporary cleanup/existing-stack preservation passed. Hospital A storage was not mutated.
- Other checks: `git diff --check` exited 0; JavaScript integration test syntax validation passed. The isolated command itself confirmed disposable cleanup and preservation of the existing stack.
- Not run in these gates: CAP-007~012, STOW, destination verification, production PACS, product HTTP source-capture route, full P0 transfer.

## 10. CAP-001 / CAP-002 / CAP-003 / CAP-004 / CAP-014 — Historical isolated live source-capture boundary Acceptance

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

## 11. CAP-007 — Authorized stream and exact-manifest evidence (PASS, scoped)

- Decision/Acceptance: `INT-001-CAP-007-REC-001` was recorded before implementation/test changes. Scope is test-only incremental observation of existing internal synthetic source capture; no route, schema/grant, production PACS, STOW, or destination behavior.
- API regression after CAP-005 timeout implementation: `npm run test:api -- --reporter=dot` exited 0; API build passed; 35 test files / 606 tests passed.
- Initial live command: `./scripts/test-int001-source-capture.ps1` exited 1 at module bootstrap because the dedicated Docker test target omitted the imported diagnostic helper. No Node test or DB diagnostic ran; B was EMPTY before, cleanup passed, and the existing `mediq` stack was unchanged. The missing helper COPY was then added and the test image rebuilt.
- After implementing a per-COMMIT 5,000 ms node-postgres client deadline, three consecutive fresh invocations of `./scripts/test-int001-source-capture.ps1` each exited 0 with `authorized_capture_test=PASS tests=31 failed=0`, independent Audit/evidence observer PASS, B EMPTY before/after, zero STOW/destination calls, temporary cleanup and existing-stack preservation. No in-run retries occurred.
- The test-only incremental observer asserts canonical operation-bound instance order, full stream close before next open, maximum one active stream, fixture byte/hash equality, independently recomputed aggregate digest vs pending evidence, allowlisted response, and zero forbidden destination/STOW calls. These assertions passed in each 31-test run.
- Static review: the hash builder consumes one lazy instance stream at a time and retains only UID bytes, length and per-instance digest. The service does not assemble/write DICOM payload. The Orthanc parser is configured for one part, max 64 MiB per instance, bounded headers, and total/idle timeouts. Metadata JSON buffering is separately capped at 8 MiB; it is not DICOM payload. No whole-study DICOM aggregation or filesystem spill dependency exists. The parser's PassThrough may buffer within the single-instance 64 MiB cap; no constant-memory or 2 GiB performance claim is made.
- Overall judgment: `TC-INT-001-CAP-007` is `PASS (scoped)` for the tested synthetic internal stream/manifest path only. Production PACS, high-volume performance, destination verification and complete A→B transfer remain unverified.

## 12. CAP-005-RCA — Safe Tenant transaction failure diagnosis (diagnosis scoped)

- Decision/Acceptance: `INT-001-CAP-005-RCA-001` / `TC-INT-001-CAP-005-RCA-001` were recorded before changing diagnostic code. Scope is test-only, allowlisted DB error classification; no service/DB/retry behavior changes.
- Implemented test helper: `tests/integration/safe-database-diagnostics.mjs` returns only validated PostgreSQL SQLSTATE, allowlisted Node code, a fixed exact-message category, allowlisted error name, or `UNCLASSIFIED`; failed-query duration is bucketed. Arbitrary error strings and parameters are never returned.
- Unit command: `npm run test:api -- --reporter=dot`; exited 0. API build passed; 35 test files / 605 tests passed, including four diagnostic-classifier tests covering valid/invalid SQLSTATE, allowed/rejected Node codes, fixed vs. arbitrary messages, and duration buckets.
- First live invocation: `./scripts/test-int001-source-capture.ps1` exited 1 before Node tests began because the `authorized-source-capture-test` Docker target did not copy the imported helper; TAP reported module bootstrap at `authorized-source-capture.orthanc.integration.test.mjs:1:1`. This is a test-target packaging failure, not DB diagnostic evidence. Hospital B was confirmed `EMPTY` before the invocation; temporary cleanup passed and the pre-existing `mediq` stack was unchanged. The post-test B probe and DB observer did not run.
- Acceptance amendment: a bootstrap/import failure is explicitly classified as setup failure and corrected before the one valid diagnostic run; once Node test execution begins, do not retry. The Docker test target now explicitly copies `tests/integration/safe-database-diagnostics.mjs`. The corrected isolated diagnostic run passed 31/31 with observer/B/cleanup/stack checks. A later stability run passed 31/31; the second stability run then failed at COMMIT with `QUERY_READ_TIMEOUT` (`GTE1000MS`), before WADO. No SQLSTATE was emitted; the installed node-postgres client source confirms the client-side read timer and runtime pool setting of 1,500 ms. The immediate timeout mechanism is known; underlying DB/host/storage latency remains unproven. The three-run gate stopped at first failure.
- Follow-up decision: `INT-001-CAP-005-TIMEOUT-001` / `TC-INT-001-CAP-005-TIMEOUT-001` selected a bounded `query_timeout=5000` only for verified Tenant `COMMIT`, preserving 1,500 ms pool defaults, fail-closed handling, client discard, and no automatic retry. Implementation and acceptance evidence are recorded in §13 below. The underlying database/host/storage latency cause remains unknown.

## 13. CAP-005-TIMEOUT — COMMIT-only bounded query deadline (PASS, scoped)

- Decision/Acceptance: `INT-001-CAP-005-TIMEOUT-001` / `TC-INT-001-CAP-005-TIMEOUT-001` were approved and recorded before source changes.
- Implementation: `ActorTenantContextService` passes `{ text: "COMMIT", query_timeout: 5000 }` only for COMMIT. `RuntimeDatabaseService` connection and default query timeout stay at 1,500 ms. Other transaction commands remain unchanged.
- Unit assertions: successful path confirms only COMMIT receives the override. Simulated COMMIT failure maps to generic `ACTOR_TENANT_CONTEXT_UNAVAILABLE`, attempts `ROLLBACK`, discards the client, calls connect once, and sends COMMIT exactly once; no automatic retry is introduced.
- API command: `npm run test:api -- --reporter=dot`; exit 0; TypeScript build passed; 35 test files / 606 tests passed.
- Isolated command, executed three times consecutively with fresh disposable Compose projects and no retries:

```powershell
./scripts/test-int001-source-capture.ps1
```

- Each run: exit 0; 31/31; independent Audit/evidence observer PASS; Hospital B EMPTY before/after; zero STOW/destination calls; temporary project cleanup PASS; existing `mediq` stack unchanged.
- Judgment: CAP-005 timeout Acceptance and the CAP-005 live stability gate are `PASS (scoped)`. The change removes the observed 1,500 ms client-side COMMIT deadline as the limit for that single query; it does not prove/fix underlying storage/database latency or any production SLO. A future timeout after COMMIT submission remains outcome-ambiguous and must not be blindly retried.

## 14. CAP-008 — WADO stream failure, cancellation and deadline (PASS, scoped)

- Decision/Acceptance: `INT-001-CAP-008-REC-001` / `TC-INT-001-CAP-008` were recorded before CAP-008 implementation/test changes.
- API command: `npm run test:api -- --reporter=dot`; exit 0; API TypeScript build passed; 35 test files / 614 tests passed. Coverage includes manifest read/media-type/SOP UID/length/cap failures, no partial evidence, caller cancellation, fake-timer total deadline, fixed Audit/error classification, and an adapter regression where the outer WADO response fails after the DICOM part starts.
- Defect found: the first post-change isolated run hung on the partial-body failure case. The parser reports outer-response failure through its async iterator while the current part stream may stay open; the adapter previously awaited only the part reader. The adapter now races the reader against iterator failure and terminates/releases the active stream fail-closed. The interrupted disposable project was explicitly cleaned; existing `mediq` containers remained healthy/unchanged. That unsuccessful attempt was not counted.
- Isolated command, then executed three consecutive times with fresh disposable projects and no in-run retries:

```powershell
./scripts/test-int001-source-capture.ps1
```

- Each post-fix run: exit 0; 31/31; independent Audit/evidence observer PASS; active instance stream count returned to zero with no partial-stream completion; no pending evidence/success Audit and operation remained `CREATED` on injected failure; fixed minimized failure Audit where verified context resolved; Hospital B EMPTY before/after; zero STOW/destination calls; temporary cleanup PASS; existing `mediq` stack unchanged.
- Judgment: `TC-INT-001-CAP-008` is `PASS (scoped)` for synthetic internal source-capture failure/cancellation/deadline behavior. Real PACS fault coverage, production timing/SLO, destination verification, STOW and full A→B remain unverified; CAP-009~012 remained open at that checkpoint.

## 15. CAP-009 — Final fenced authorization revalidation after WADO (PASS, scoped)

- Decision/Acceptance: `INT-001-CAP-009-REC-001` and expanded `TC-INT-001-CAP-009` were recorded before test/fixture changes. Scope remains internal synthetic source capture only.
- Focused command: `npx vitest run tests/api/authorized-source-capture.test.mjs --reporter=dot`; exit 0, 38/38 tests. The post-WADO matrix proves Consent withdrawal/expiry, Grant revocation/expiry, Session expiry/ineligible state, operation state change, and destination mapping binding change all deny before evidence; changed operation state remains `FAILED`; no case creates pending evidence or capture-success Audit.
- API regression/build: `npm run test:api -- --reporter=dot`; exit 0; 35 files / 620 tests passed.
- Isolated command, executed three consecutive times after fixture correction, each in a fresh disposable project with no in-run retry:

```powershell
./scripts/test-int001-source-capture.ps1
```

- Each run: exit 0; 32/32 Node tests; independent DB observer PASS for exact capture start/denial, no capture-success Audit, separate `GRANT_REVOKED/SUCCESS` Audit, zero evidence for the dedicated operation and unchanged `CREATED`; all A instance streams closed; no Tenant transaction spanned WADO; B EMPTY before/after; zero STOW/destination calls; cleanup PASS; existing `mediq` stack unchanged.
- The live test used a separate synthetic Session/Package/Study/Consent/Grant and invoked the actual `GrantRevocationService` under the application runtime role after all three A WADO bodies were consumed but before the last observed stream closed. The final fenced reauthorization saw the committed revocation and returned fixed `DENIED/AUTHORIZATION_DENIED`.
- Initial setup attempt: fixture seeding was rejected by the existing `(session, study)` unique constraint before the CAP suite began. The disposable project was cleaned; fixture was corrected to a separate valid aggregate. This setup failure was not counted toward the three consecutive passes.
- Judgment: `TC-INT-001-CAP-009` is `PASS (scoped)`. Already received bytes are not recalled. No route, production PACS, STOW, destination verification, race where final persistence owns the fence first, or full A→B behavior is proven.

## 16. CAP-010 — Successful operation-bound source-capture commit (PASS, scoped)

- Decision/Acceptance: `INT-001-CAP-010-REC-001` and the expanded `TC-INT-001-CAP-010` were recorded before test/trace changes. The single existing valid success operation was reused; no duplicate success request was created.
- API build/regression: `npm run test:api -- --reporter=dot`; exit 0; 35 files / 620 tests passed.
- Isolated command, executed three consecutive times in fresh disposable projects with no in-run retry:

```powershell
./scripts/test-int001-source-capture.ps1
```

- Each run: exit 0; 32/32 tests; independent DB observer PASS for exactly one correlation-bound `PACS_SOURCE_CAPTURE_STARTED/ALLOW`, one `PACS_SOURCE_CAPTURED/SUCCESS`, and one operation-bound `SOURCE_CAPTURE/PENDING` row with expected `SHA256-MANIFEST-V1` digest/count and no destination verification fields; operation remained `CREATED`.
- The service response contained exactly `evidenceId`, `kind=CAPTURED`, `objectCount`, and `status=PENDING`; no UID, PatientID, digest, payload or credential. A-only source WADO consumed all expected streams; no Tenant transaction spanned WADO; all streams closed; B EMPTY before/after; STOW/destination calls 0; cleanup PASS; existing `mediq` stack unchanged.
- Judgment: `TC-INT-001-CAP-010` is `PASS (scoped)` for the positive operation-bound source-capture commit. CAP-012 negative persistence-failure/rollback, product route, destination verification, STOW and full A→B remain unverified.
