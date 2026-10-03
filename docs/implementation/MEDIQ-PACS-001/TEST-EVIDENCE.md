# MEDIQ-PACS-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-001` |
| 제목 | PACS Import coordinator prerequisites — identity/fence, encrypted spool and temporary-payload lifecycle sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PARTIAL` — identity/fence and source handoffs PASS in scoped boundaries; `DEC-009` physical purge/restart Acceptance PASS in isolated synthetic + scratch PostgreSQL/RLS scope; remaining lifecycle gates and full coordinator are open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell host; Linux Alpine Node integration container |
| Runtime·Toolchain | Node.js 24, npm workspaces, TypeScript 6, Vitest 5, Docker Compose |
| 대상 환경 | Local synthetic development/test only |
| Data | Synthetic CT from ENV-007; A has 1 Study / 1 Series / 3 instances; B matching-fixture baseline is 0 instances |
| Side effects | Acceptance used uniquely named isolated PostgreSQL scratch Compose projects, applied the existing 20 migrations, seeded synthetic rows, and removed only verified owned scratch resources. The fence test did not call DICOM/Orthanc or STOW/POST and changed no PACS data. An initial DB-008 aggregate run exposed a checksum mismatch in migration `0018`; inspection of a retained migrator image and the applied ledger established that the only byte differences were four stripped trailing spaces. The exact historical SQL bytes were restored (no SQL/schema semantic change). The direct local migration smoke and the complete aggregate rerun then passed. Orthanc named volumes were retained. |

## 2. Acceptance 검증표

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PACS-001-PID-001` | Missing/malformed/overlength source identity, empty study, invalid destination ID, mismatch among per-instance IDs | Domain unit | Fail closed with fixed reason only; exact non-empty synthetic match returns count only | 11 assertions/cases passed; no input PatientID in decision | PASS |
| `TC-PACS-001-PID-002` | WADO metadata PatientID missing, wrong VR, multi-valued; projection includes unrelated patient fields upstream | Adapter unit | Required single LO tag; invalid upstream shape sanitized; allowlisted result excludes unrelated fields | 4 new cases passed; `PatientName` sentinel absent from projection | PASS |
| `TC-PACS-001-PID-002` | Real local synthetic source metadata | Orthanc read-only integration | Every instance's internal PatientID equals synthetic manifest's mapping value | A Study returned 3 instances; all matched. Integration suite 5/5. | PASS — test fixture only |
| `TC-PACS-001-FENCE-001` | PACS operation-time `PACS_IMPORT` check races Consent/Grant mutation | API unit + PostgreSQL integration | Canonical Session fence is acquired before current evidence/policy query; same verified Tenant transaction covers the DB-only callback | API ordering assertion passed; actual scratch PostgreSQL test passed using the canonical fence and evidence reader | PASS — internal gate only |
| `TC-PACS-001-FENCE-002` | Grant revoked before the next fenced PACS eligibility check; Consent already withdrawn | PostgreSQL integration | Resolve current committed evidence after acquiring fence; deny before protected callback | Real Grant revocation committed; next fenced request denied before callback; active Grant tied to persisted withdrawn Consent also denied | PASS |
| `TC-PACS-001-FENCE-003` | Exact recipient revokes Grant while PACS holds Session fence | PostgreSQL two-connection concurrency integration | Revocation waits until the DB-only callback transaction commits, then succeeds; no network I/O | Real `GrantRevocationService` remained unsettled while fence was held; after release it committed `REVOKED`; no DICOM operation | PASS — DB serialization only, not remote cancellation |
| `TC-PACS-001-FENCE-004` | Lock acquisition or Authorization evidence fails | API unit + PostgreSQL integration | Sanitized fail-closed result before protected callback | Unit lock-failure case returned unavailable without calling policy/callback; revoked and withdrawn persisted evidence denied in DB test | PASS |
| `TC-PACS-001-FENCE-005` | Inspect post-check effects | DB integration + code/data-flow review | No DICOM Gateway/STOW, durable operation state transition, or reusable capability | `pacs_transfer_operations` count before/after matched; the tested path had no DICOM call/HTTP route. B Orthanc was not queried in this DB-only test. | PASS scoped — product B-unchanged remains separate |
| `TC-PACS-001-PID-003` | Mismatch through future PACS coordinator | Product integration/security | Zero STOW requests and unchanged B destination | No coordinator exists; no negative dispatch path to exercise. No STOW was sent by this test. | NOT RUN |
| `TC-PACS-001-PRE-001` | Full Mandatory Preflight ordering | Product integration | Any missing/stale prerequisite denies before STOW | Full coordinator and operation-time gates not implemented | NOT RUN |
| `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` | Full A→MediQ→B protected transfer | Product E2E/security | Full Authorization, Consent/Grant, Preflight, STOW, verification, Integrity/Provenance/Audit all PASS | Not executed; not enabled | NOT RUN |

## 3. 실행 명령과 결과

### TEST-001 — API build

```powershell
npm run build:api
```

- 종료 코드: `0`
- 결과: API TypeScript build succeeded.
- 판정: `PASS`

### TEST-002 — API regression including PACS identity and DICOM adapter cases

```powershell
npm run test:api
```

- Initial run: `29` files included; one new suite lacked explicit Vitest imports and three adapter assertions expected the wrong fixed error identifier. These test-harness/assertion issues were corrected; no product behavior was weakened.
- Final run: `29` files / `526` tests passed.
- 판정: `PASS` (final run)
- Fence follow-up after implementation: `npm run test:api -- --reporter=dot` completed with `29` files / `529` tests passed; this is the current API regression count and includes fence ordering, lock-failure and policy-engine-failure cases. The initial 526 count above is retained as the earlier PID sub-gate checkpoint.

### TEST-003 — Type and Port conformance

```powershell
npm run typecheck:api
npm run test:dicom-port-contract
```

- 종료 코드: both `0`.
- 결과: API strict TypeScript check and compile-time DICOM Gateway Port conformance passed.
- 판정: `PASS`

### TEST-004 — Synthetic Orthanc read-only integration

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test
```

- 종료 코드: `0`.
- 결과: 5/5 tests passed: A QIDO Study query, A WADO hierarchy + exact synthetic PatientID per instance, all three byte/hash checks, rendered frame, and read-only repeatable B destination baseline.
- B matching synthetic-instance baseline: `0`.
- Network/effect boundary: test runner performed only QIDO/WADO reads. No STOW/POST or PACS mutation occurred; the one-off test-runner container was removed by `--rm`.
- 판정: `PASS` — local synthetic/read-only integration only.

### TEST-005 — Whitespace/diff integrity

```powershell
git diff --check
```

- 종료 코드: `0`.
- 결과: no whitespace errors. Git emitted repository-wide LF→CRLF conversion warnings for pre-existing/modified worktree files; line endings were not changed.
- 판정: `PASS`

### TEST-006 — Operation-time Authorization fence against real PostgreSQL

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- Isolated scratch phase result: `pacs001_session_fence=PASS`; revocation serialized behind the Session fence, post-revocation `PACS_IMPORT` was denied before callback, persisted withdrawn Consent was denied, and `pacs_transfer_operations` count stayed unchanged. The integration used the real synthetic actor registry, Tenant/RLS transaction, Authorization evidence reader and `GrantRevocationService` on separate PostgreSQL connections.
- DB-008 outputs after the PACS test: clean schema `18` product tables / migration ledger `20` / catalog `18|48|17|38`; owned-scratch reset passed; reset PostgreSQL role bootstrap passed; reset/reapply schema and full scratch Acceptance/regression outputs passed, including the fence again.
- Initial run: the aggregate command exited `1` in its final local migration smoke. The migrator correctly rejected migration `0018` because the applied-ledger SHA-256 (`83b53a62652d889e9c4de9e8947cf17ef0944214e635dd514e40d573f699faea`) differed from the then-current file (`40cd01e58ee1af553426404f0388ada6dcf95801dbecb35b7d5be54f21a21fde`). A retained pre-existing migrator image contained the exact applied version; line comparison showed only four missing trailing spaces, with no SQL statement or schema semantic difference.
- Correction: restored those four historical trailing spaces in `services/api/src/database/migrations/0018_smiling_shooting_star.sql`. The working-file hash then exactly matched the applied ledger and retained image (`83b53a62652d889e9c4de9e8947cf17ef0944214e635dd514e40d573f699faea`). No database ledger edit, re-baseline, schema change, or data mutation was performed.
- Direct local migration smoke: `./scripts/test-database-migrations.ps1 -EnvFile .env` exited `0`; both repeat-apply attempts passed; ledger `20`, owner `mediq_migrator`, product tables `18`; runtime `SELECT 1` passed and runtime access to the migration ledger was denied.
- Final aggregate rerun: `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` exited `0`. Clean UP/repeat, PACS-007 and PACS-001 fence integration, DB-009 exact privileges/RLS, PAT-002 internal mapping read, Consent/Grant/Exchange regressions, RESET/fresh UP, 18-table/20-migration catalog, and DB-002~007 schema regressions all passed. The script reported `db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false` and `db008_ephemeral_cleanup=PASS`.
- Cleanup: no owned `mediq-db008-*` scratch project remained after the successful run; existing named Orthanc volumes were not touched.
- 판정: `TC-PACS-001-FENCE-001~005` PASS at the internal no-side-effect gate; aggregate DB-008 and its final local migration smoke now PASS. This does not complete the PACS coordinator or full product transfer.

## 4. 실패·거부 경로

| 경로 | 결과 | 판정 |
|---|---|---|
| Empty source instance set or invalid collection | `SOURCE_INSTANCE_SET_EMPTY`; no source value returned | PASS |
| Missing/null, empty, real-shaped, lowercase, whitespace, or >64-char source PatientID | `SOURCE_IDENTITY_INVALID`; no ID reflected in result | PASS |
| Source PatientID differs from the destination mapping on any instance | `SOURCE_IDENTITY_MISMATCH`; no ID reflected in result | PASS |
| Destination mapping ID is not canonical synthetic input | `DESTINATION_IDENTITY_INVALID` | PASS |
| WADO PatientID missing, wrong VR, or multiple values | Sanitized `DICOM_UPSTREAM_INVALID`; no upstream body/details returned | PASS |
| Actual coordinator invoked with a bad identity | Not testable because coordinator is absent | NOT RUN |
| Grant revocation completes before a later PACS fence acquisition | Real revocation succeeded; subsequent fenced check re-read current status and denied callback | PASS |
| Grant revocation races an already-held PACS fence | Revocation remained blocked until DB-only transaction commit, then succeeded | PASS — does not recall/cancel a remote in-flight STOW |
| Withdrawn Consent, lock failure/policy exception, or changed operation ledger | Withdrawn evidence denied; unit lock and policy-engine failures returned sanitized unavailable without callback; operation count unchanged | PASS — scoped internal path |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Product coordinator identity-denial no-STOW/B-unchanged | No operation coordinator or protected import path exists | A future caller could fail to invoke the pure gate unless integrated and tested | Implement coordinator with the validator in Mandatory Preflight; prove zero STOW and compare B state before/after |
| Live STOW/A→B | `AGENTS.md` §5 requires every Mandatory Preflight gate first; several gates remain absent | No product transfer success evidence | Separate recommendation/Acceptance and enable only after all gates pass |
| Positive HTTPS/mTLS | Current resolver is local Test-only HTTP | Production transport security unproven | TLS profile and endpoint acceptance before deployment |
| Coordinator atomic dispatch boundary, Integrity/Provenance/Audit and reconciliation | Full coordinator and `STOW_STARTED` dispatch path remain absent; these are separate product gates | No proof that a future effect-capable path invokes the fence or atomically commits authorization with durable dispatch state; no remote cancellation guarantee | Record recommendation and Acceptance before implementing the full Mandatory Preflight/coordinator; keep live STOW gated |

## 6. 증거 및 민감정보 점검

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Focused and regression tests | `tests/api/pacs-patient-id-binding.test.mjs`; `tests/api/orthanc-dicomweb.adapter.test.mjs` | Only synthetic values; result tests verify values are not reflected |
| Orthanc integration | `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | Synthetic manifest; no PatientID printed; no raw DICOM or credentials included |
| Source handoff tests | `tests/api/authorized-source-capture.test.mjs`; `tests/integration/authorized-source-capture.orthanc.integration.test.mjs` | Synthetic fixture only; identity inventory exists only in the test process; no raw payload, patient identity, or credential is written to reports/logs |
| Implementation report | `docs/implementation/MEDIQ-PACS-001/IMPLEMENTATION-REPORT.md` | No actual IDs, PHI, credentials, payload or secret |
| Runtime state | Local Compose Test Orthanc | Read-only QIDO/WADO; B synthetic fixture remained at 0 matching SOP instances |

## 7. 결론

- 결과: `PARTIAL`.
- PASS 범위: pure synthetic exact-identity gate; required/minimized WADO metadata extraction; internal operation-time fence/Authorization recheck; API 29 files/529 tests; API typecheck; Port compile contract; Compose checks; read-only Orthanc 5/5; isolated PostgreSQL concurrency/withdrawal/revocation/no-operation-row Acceptance.
- PASS: aggregate DB-008 clean/reset/reapply, DB-002~007 regressions, exact migration ledger/checksum, local runtime/migrator separation and owned-scratch cleanup all passed after restoring the historical four whitespace bytes in migration `0018`. No applied ledger or database data was rewritten.
- NOT RUN: effect-capable coordinator invocation, actual product no-STOW/B-unchanged, live STOW, full Mandatory Preflight/atomic `STOW_STARTED`, positive production mTLS/PKI, Integrity/Provenance/Audit completion, reconciliation, destination verification and complete P0 E2E.
- `IDENTITY_MATCHED` is identity eligibility only; it does not authorize viewing, transfer or PACS import.
- No real patient information, production PACS credential, production DICOM or DICOM payload was recorded.

## 8. PACS-001-DEC-005 — Ephemeral source identity handoff

| Acceptance | Actual evidence | Judgment |
|---|---|---|
| `TC-PACS-001-HANDOFF-001/006` | Unit test binds the exact deterministic Series/SOP pairs observed by the instance retrieval calls to operation/Tenant/actor/Session/Package/Study/source/destination and pending evidence ID/algorithm/digest/count/total bytes. Isolated HTTPS Test Orthanc A run compares the handoff inventory to the synthetic manifest and independently observed exact instance byte hashes/lengths. The handoff and nested values are frozen; PatientID/Local Patient ID and payload are absent. | PASS — internal source-capture handoff only |
| `TC-PACS-001-HANDOFF-002` | `captureForCoordinator()` rejects caller-supplied inventory, patient/hospital/study identity, endpoint, credential, digest, mapping or Authorization evidence before Authorization and DICOM calls. | PASS |
| `TC-PACS-001-HANDOFF-003` | Unit matrix covers withdrawn Consent, revoked Grant, Consent withdrawn during WADO/final fence, invalid mapping, changed operation, malformed/duplicate source metadata and source stream/hash failure. No case yields a partial handoff; existing sanitized denial/unavailable behavior is retained. | PASS — synthetic failures |
| `TC-PACS-001-HANDOFF-004` | Existing ordinary `capture()` success regression still asserts exact keys `evidenceId`, `kind`, `objectCount`, `status`; handoff inventory/digest are available only via the distinct internal method. Full API regression passed. | PASS |
| `TC-PACS-001-HANDOFF-005` | Type boundary is retrieval-only (`retrieveStudyMetadata`, `retrieveInstanceStream`); no PACS controller is registered. Unit and isolated integration assert no destination write/verification, no STOW/POST, operation remains `CREATED`; A is read-only and B is EMPTY before/after. | PASS — handoff sub-gate only; not the full product no-STOW gate |
| `TC-PACS-001-HANDOFF-007` | Unit fault injection covers evidence insert, success Audit and outer commit failure; no handoff escapes and the operation remains at its pre-dispatch state. The isolated runtime-role PostgreSQL run exercises actual pending-evidence and success-Audit INSERT trigger failures through `captureForCoordinator()`; evidence/Audit transaction rolls back, independent observer confirms no pending evidence/success Audit for the failed operations, and operation remains `CREATED`. | PASS — isolated synthetic persistence failures; outer commit failure simulated at the unit transaction boundary |

### Commands and results

```powershell
npm run build:api
npx vitest run tests/api/authorized-source-capture.test.mjs --reporter=dot
npm run test:api -- --reporter=dot
npm run typecheck:api
npm run test:dicom-port-contract
./scripts/test-int001-source-capture.ps1 -EnvFile .env
```

- `npm run build:api`: exit `0`.
- Focused source-capture suite: final run `1` file / `55` tests passed. Intermediate test-only assertions incorrectly expected an operation changed to `FAILED` to remain `CREATED` and expected database rollback after a source-stream failure that occurs outside a transaction; both expectations were corrected to reflect the intended transaction/state boundaries. Final suite passed all 55 without weakening product behavior.
- Full API build/regression: `35` files / `667` tests passed.
- `npm run typecheck:api` and `npm run test:dicom-port-contract`: both exit `0`.
- Isolated live source-capture runner: exit `0`; `authorized_capture_test=PASS tests=35 failed=0`; independent Audit/evidence observer PASS; `orthanc_b_before=EMPTY` and `orthanc_b_after=EMPTY`; `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`.
- The live isolated success case uses synthetic DICOM on configured HTTPS Hospital A. It compares every returned Series/SOP identity to the same synthetic manifest identities whose exact bytes were streamed and hashed. The success operation remains `CREATED`; no `storeInstanceStream`, destination verification, STOW or POST occurred. Actual runtime-role evidence/Audit INSERT failure triggers were exercised through the handoff method; no failed operation acquired persisted pending evidence or a success Audit.
- No public route, worker, schema, migration, persistent UID inventory, PACS destination content or operation state was added or changed. The handoff remains transient application memory; process-crash recovery/zeroization is not claimed.
- `git diff --check`: exit `0` after final implementation and documentation synchronization; no whitespace errors.

## 9. PACS-001-DEC-006 — Per-instance source digest handoff

| Acceptance | Actual evidence | Judgment |
|---|---|---|
| `TC-PACS-001-DIGEST-001/002` | Integrity builder tests preserve the fixed aggregate `SHA256-MANIFEST-V1` known vector and return immutable per-instance SHA-256/byte lengths from the same sequential streams. Reversed descriptor input returns the same canonical inventory; existing duplicate UID, count, content-length, size-bound, malformed stream and cancellation cases remain passing. | PASS — unit scope |
| `TC-PACS-001-DIGEST-003` | `captureForCoordinator()` binds each `sha256:<hex>` and byte length to the exact server-derived Series/SOP descriptor. Unit fixture checks digest from known bytes and aggregate sums. Isolated HTTPS A integration independently compares each handoff digest/length with synthetic manifest values and observed WADO stream hashes/lengths. | PASS — synthetic source scope |
| `TC-PACS-001-DIGEST-004` | Existing denial/failure matrix exercises Consent/Grant/mapping denial, source metadata/stream/hash failure, changed scope, evidence/Audit insertion failure and simulated outer commit failure; no partial coordinator result escapes. | PASS — unit + isolated persistence-failure scope |
| `TC-PACS-001-DIGEST-005` | Ordinary `capture()` retains its exact four-field success allowlist. Existing pending evidence persists only aggregate manifest fields; no migration, per-instance UID/hash row, payload, PatientID or Local Patient ID was added. Isolated runtime-role Audit/evidence observer passed. | PASS — API + isolated DB scope |
| `TC-PACS-001-DIGEST-006` | The isolated runtime acceptance executed only authorized A metadata/WADO GETs. B was EMPTY before and after; STOW/destination-verification call counts were zero; operation stayed `CREATED`; no public route/worker was added. | PASS — this internal no-side-effect slice only, not full product no-STOW Acceptance |

### Commands and results

```powershell
npm run build:api
npx vitest run tests/api/source-integrity-manifest.test.mjs tests/api/authorized-source-capture.test.mjs --reporter=dot
npm run test:api -- --reporter=dot
npm run typecheck:api
npm run test:dicom-port-contract
./scripts/test-int001-source-capture.ps1 -EnvFile .env
git diff --check
```

- `npm run build:api`: exit `0`.
- Focused integrity/source-capture tests: 2 files / 68 tests passed.
- Full API build/regression: 35 files / 668 tests passed.
- API typecheck and DICOM Port contract: both exited `0`.
- Isolated source-capture runner: final exit `0`; `authorized_capture_test=PASS tests=35 failed=0`; independent Audit/evidence observer PASS; `orthanc_b_before=EMPTY`, `orthanc_b_after=EMPTY`; `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`.
- One initial isolated run failed because the integration assertion compared the fixture's unprefixed hex digest with the handoff's normative `sha256:<hex>` representation. The fixture expectation was corrected; the subsequent isolated run passed all 35 tests. No production behavior was weakened.
- An initial focused test assertion compared the two-field DICOM call observation to the expanded four-field handoff item. The test was corrected to compare the identity projection; the final focused run passed 68/68.
- No DICOM payload was persisted, logged, or sent to B. No source bytes are retained after hashing; bounded encrypted temporary package staging and purge evidence remain a prerequisite to forwarding exact checked bytes.

**Judgment:** `TC-PACS-001-DIGEST-001~006` PASS only for the internal ephemeral per-instance source-digest handoff. Together with `HANDOFF-001~007`, this does not prove complete Mandatory Preflight, operation dispatch, destination-byte verification, product-level no-STOW/security gates, STOW, the full PACS coordinator, or A→B transfer. No live STOW is authorized.

**Previous judgment — PACS-001-DEC-005:** `TC-PACS-001-HANDOFF-001~007` PASS only for the internal ephemeral source-identity handoff. This does not prove full Mandatory Preflight, operation dispatch, destination verification invocation, product-level no-STOW/security gates, STOW, full PACS coordinator or A→B transfer.

## 10. PACS-001-DEC-007 — Encrypted temporary spool primitive

| Acceptance | Actual evidence and boundary |
|---|---|
| `TC-PACS-001-STORE-CORE-001` | One synthetic `AsyncIterable<Uint8Array>` was encrypted to a private temporary test directory. File bytes did not equal/include the known plaintext marker. After package seal, the primitive returned exact bytes, length and SHA-256 only after AES-256-GCM completion. PASS — local primitive unit only. |
| `TC-PACS-001-STORE-CORE-002` | Cross-Tenant package and wrong StudyReference binding both failed with sanitized `BINDING_MISMATCH`; no Buffer result escaped. PASS — no DB/RLS claim. |
| `TC-PACS-001-STORE-CORE-003` | A ciphertext bit flip produced `INTEGRITY_FAILED`; the method returned no plaintext. PASS — no downstream port exists. |
| `TC-PACS-001-STORE-CORE-004` | TTL equality denied read; repeated in-process purge returned the same receipt and removed the test package directory. PASS — no durable metadata or Audit claim. |
| `TC-PACS-001-STORE-CORE-005` | A narrowed 4-byte unit cap rejected 5 bytes and removed the partial object. Constructor rejects injected ceilings above policy maxima. PASS — no concurrent/global quota claim. |
| `TC-PACS-001-STORE-CORE-006` | A new store instance over a non-empty prior package directory returned `RECOVERY_REQUIRED` before creating or reading objects. PASS — fail-closed initialization only; cleanup/Audit recovery absent. |
| `TC-PACS-001-STAGE-001` | Authorized source-capture unit harness injected an unregistered local encrypted store. Three exact synthetic WADO-stream byte sequences were hashed and staged through awaited per-chunk writes; each receipt's SOP/Series/Study binding, SHA-256 and length matched the same capture handoff, and authenticated reads returned byte-for-byte identical source bytes. A second case revoked Authorization after reads and confirmed ciphertext was purged, no evidence committed and operation remained `CREATED`. PASS — no Orthanc, PostgreSQL/RLS, runtime mount, public module injection or downstream consumer claim. |
| `TC-PACS-001-STORE-CORE-007` | Three simultaneous writers with a narrowed 8-byte in-process environment cap reserved quota before async file writes; exactly two 4-byte writes succeeded, the third failed closed, and retry after abort proved reservations were released. PASS — single-process primitive only; no cross-process/shared-volume quota claim. |

### Commands and results

```powershell
npm run build:api
npx vitest run tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs tests/api/source-integrity-manifest.test.mjs tests/api/authorized-source-capture.test.mjs --reporter=dot
npm run typecheck:api
npm run test:api -- --reporter=dot
npm run test:dicom-port-contract
git diff --check
```

- API build and strict API typecheck exited `0`.
- Focused source builder/authorized capture/store suites: 3 files / 78 tests passed, including an awaited write/no-prefetch assertion.
- Full API suite: 36 files / 678 tests passed, including seven store-primitive, two exact-source staging/revocation and one stream backpressure property case.
- DICOM Port contract TypeScript check exited `0`; `git diff --check` exited `0` (Git emitted only the configured LF→CRLF working-copy warnings).
- Test inputs were synthetic byte markers only; tests used isolated OS temporary directories. No Orthanc, PostgreSQL, runtime `.env`, configured API container, mounted imaging volume, real PHI, DICOM payload or PACS endpoint was used by these new tests.

**Scope judgment:** `STORE-CORE-001~007` and `STAGE-001` PASS only within the local in-process synthetic unit harness. A separate assertion proves the builder waits for a chunk sink before pulling another, but this is only one primitive property and does not PASS `STAGE-009`. Source capture now has an optional internal storage seam, but the Nest module/Compose/runtime does not supply or register a store; tests do not prove Test Orthanc or DB/RLS behavior. `STAGE-002~012` remain NOT RUN: durable package metadata, cross-process/shared quota, per-Tenant SERVICE cleanup, restart orphan recovery, purge Audit/saga, runtime volume/secret setup, maximum-study/performance bounds and isolated Orthanc A/B no-STOW are absent. No public route, worker, `PREFLIGHT_PASSED`, `STOW_STARTED`, destination call or STOW path was added. `MEDIQ-PACS-001` remains PARTIAL.

## 11. PACS-001-DEC-008 — StudyReference temporary payload metadata checkpoint

**Point-in-time record:** The statements and verdict below capture the DEC-008 checkpoint before DEC-009 implementation. The current physical purge/restart result is recorded in §12.

**Execution date/environment:** 2026-10-03 Asia/Seoul; local Docker Desktop, uniquely named disposable Compose project, PostgreSQL 18.6. Synthetic IDs/rows only. The persistent `mediq` Compose project remained running and was not accessed by this command.

### Commands and results

```powershell
npm run build:api
npm run test:api -- --reporter=dot
npm run typecheck:api
npm run test:dicom-port-contract
npm run db:migrations:check
npm run test:db-migrations
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs
node --check tests/database/postgres-authorization-evidence-runtime.integration.test.mjs
node --check tests/database/exchange-session-creation-runtime.integration.test.mjs
node --check tests/database/consent-request-api-runtime.integration.test.mjs
node --check tests/database/consent-approval-api-runtime.integration.test.mjs
node --check tests/database/grant-issue-api-runtime.integration.test.mjs
node --check tests/database/transfer-grant-persistence-runtime.integration.test.mjs
node --check tests/database/provenance-repository-runtime.integration.test.mjs
node --check tests/database/consent-persistence-runtime.integration.test.mjs
node --check tests/database/source-integrity-evidence-runtime.integration.test.mjs
# PowerShell parser check for scripts/test-db-008-full-schema.ps1
git diff --check
```

- Final DB-008 scratch invocation exited `0`. It reported `db008_schema_validation=PASS scope=scratch_schema_runtime_acceptance_only persistent_mediq_database=NOT_ACCESSED`; clean/repeat/reset/reapply passed, with 18 product tables, 24 migration ledger entries, and catalog `18|50|17|42`.
- Final API build exited `0`; API regression passed 36 files / 678 tests; strict API typecheck and DICOM Port contract exited `0`; Drizzle migration consistency printed `Everything's fine`; migration-runner passed 6/6 tests.
- `pacs001_dec008_runtime=PASS`: exact grants, forced RLS, sibling Study isolation, same-operation reservation race denial, binding checks, purge-Audit transaction rollback, retry before `STOW_STARTED`, denial after `STOW_STARTED`, and unchanged ImagingPackage metadata.
- DB-009 reported `column_privileges=244`, `study_references=exact_10_select_4_update`, 17 forced-RLS tables, cross-Tenant denial, and runtime-role DDL/ownership denial. Existing AUT-005, EXC-002/003, Consent, Grant, PACS session-fence, Provenance, and Integrity PostgreSQL/RLS regressions passed against this catalog.
- `db008_prior_schema_regressions=SKIPPED scratch_only=true persistent_mediq_database=NOT_ACCESSED` is intentional: DB-002~007 regression scripts were not run because those legacy scripts apply pending migrations to the persistent development DB. This result is therefore the scratch schema/runtime acceptance scope, not a claim that the entire non-scratch DB-008 command ran.
- `db008_ephemeral_cleanup=PASS`; `docker ps --filter "name=mediq-db008"` returned no remaining scratch container. `docker compose --env-file .env -f infra/docker-compose.yml ps` confirmed persistent `api`, `orthanc-a`, `orthanc-b`, and `postgres` remained running.
- Node syntax checks for the added/updated integration tests passed; PowerShell script parsing passed; `git diff --check` exited `0` (only configured LF→CRLF warnings).
- During validation, the first test draft attempted to read Audit rows as `mediq_runtime`; PostgreSQL correctly denied that unauthorized read (`42501`). The test now uses the existing migration observer connection for evidence inspection only; runtime Audit read grants were not widened. A subsequent full-gate attempt found stale `236`/old StudyReference-update expectations in existing regression tests; those assertions were synchronized to the approved 244-column inventory and exact four metadata UPDATE columns. The final run passed without relaxing database grants or RLS.

### Acceptance and remaining boundary

| Acceptance | Evidence | Judgment |
|---|---|---|
| DEC-008 exact runtime grants and forced Tenant RLS | 244 column grants; StudyReference SELECT 10 / UPDATE 4; no StudyReference INSERT/DELETE, no table-wide privilege, forced RLS; no-context and unrelated-Tenant denial | PASS — PostgreSQL scratch scope |
| Two StudyReferences sharing one ImagingPackage | Each Study reserved an independent reference; sibling reservation remained independent; same-operation racing reservation was denied after row-lock contention | PASS — metadata scope |
| Binding/state/constraint boundary | Invalid `PURGED` shape and duplicate storage reference rejected; wrong Tenant and wrong Package binding denied; re-fetch rejected after `STOW_STARTED`; package state/deleted_at unchanged | PASS — metadata scope |
| Purge Audit transaction behavior | Injected duplicate Audit ID caused transaction rollback and preserved `PURGE_PENDING` plus storage reference; subsequent valid Audit finalized metadata; replay was idempotent and sibling remained `AVAILABLE` | PASS — DB metadata/Audit transaction only |
| DB-008 scratch schema lifecycle | Clean/repeat/reset/re-UP, exact catalog and owned scratch cleanup | PASS — `-ScratchOnly`; DB-002~007 persistent regressions skipped intentionally |
| Physical temporary-storage lifecycle | Ciphertext deletion-before-success-Audit, DEK destruction, filesystem/DB saga/restart recovery, SERVICE cleanup, shared quota | At DEC-008 checkpoint: NOT RUN; see current DEC-009 scoped result in §12 |

At the DEC-008 checkpoint, the repository primitive was verified against real PostgreSQL/RLS but remained unwired to the encrypted store, source capture, Nest module, worker, or runtime volume; physical purge was then NOT RUN. The current DEC-009 physical lifecycle sub-gate is in §12. No Orthanc endpoint, DICOM transfer, STOW, real patient information, or production credential was used in either slice. `MEDIQ-PACS-001` remains `PARTIAL`; runtime activation, public route, Mandatory Preflight, `STOW_STARTED` dispatch, destination call, STOW, and product A→B E2E remain unauthorized/unproven.

## 12. PACS-001-DEC-009 — Physical purge saga and restart recovery

**Execution date/environment:** 2026-10-03 Asia/Seoul; Windows/PowerShell host, disposable uniquely named PostgreSQL 18.6 scratch Compose project, Node integration-test container, synthetic ciphertext only, OS temporary directory. Persistent `mediq` database and Orthanc A/B payloads were not used.

### Commands and results

```powershell
npm run build:api
npm run typecheck:api
npm run test:api -- --reporter=dot
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs
node --check tests/helpers/stage-temporary-payload-child.mjs
# PowerShell parser check for scripts/test-db-008-full-schema.ps1
git diff --check
```

- Final local API build and strict typecheck exited `0`. Full API regression passed **37 files / 686 tests**.
- The ticket-specific integration emitted `pacs001_temporary_payload_runtime=PASS exact_grants=PASS forced_rls=PASS sibling_study_isolation=PASS same_operation_race=PASS metadata_binding=PASS physical_purge=PASS restart_purge_only=PASS audit_retry=PASS retry_before_stow=PASS deny_after_stow=PASS package_unchanged=PASS`.
- This integration verifies the DEK-bearing writer process and a fresh process boundary, that the new process cannot decrypt, that only the DB-bound opaque reference can be used for purge-only recovery, physical ciphertext path removal before `PURGED`/success Audit, retry after purge/final transaction/Audit failures, concurrent/repeated purge converging to one Audit, wrong-Tenant and sibling Study isolation, and blocking ordinary reads/new staging while startup orphans remain unresolved. Safe path handling rejects symlinks/unexpected entries. Tests used only synthetic bytes.
- The first enclosing `-ScratchOnly` attempt stalled while Docker was starting a one-off psql client and was interrupted; its final wrapper result was therefore incomplete. A minimal disposable-PostgreSQL probe subsequently verified that the exact restricted migration-ledger query returns SQLSTATE `42501`; see the complete rerun below.
- The first attempt's uniquely named scratch Compose project was removed and verified to have no remaining containers, volumes or networks. Existing `mediq-api`, `mediq-postgres`, and Orthanc A/B remained healthy and unchanged. `persistent_mediq_database=NOT_ACCESSED`.
- `node --check` for the integration test and child-process helper, PowerShell parser, and `git diff --check` passed. No DICOM payload was sent to Orthanc; no STOW, route, module, worker or runtime volume was added.

### Acceptance and remaining boundary

| Acceptance | Evidence | Judgment |
|---|---|---|
| `STAGE-007` purge ordering and physical removal | Commit `PURGE_PENDING`; zeroize volatile key material; remove exact UUID package path; finalize `PURGED` plus fixed success Audit only after path absence | PASS — scoped synthetic/local filesystem + scratch PostgreSQL/RLS integration |
| `STAGE-008` failure/retry | Inject physical/path and final metadata/Audit failure paths; retain retry reference; idempotent retry produces one success Audit | PASS — tested injected failures; not a host power-loss/disk-failure certification |
| `STAGE-013` sibling Study isolation | Purge one Study payload while shared ImagingPackage/sibling payload remain unchanged | PASS — scoped internal storage/metadata test |
| `STAGE-014` process restart | New process has no DEK and cannot read; DB-bound opaque ref enables purge-only cleanup; unresolved orphan blocks reads/new writes | PASS — scoped scratch integration |
| Scratch DB-008 whole wrapper (first attempt) | DEC-009 test passed, but the final client startup did not return; owned scratch resources were removed | PARTIAL — superseded by successful full rerun in §13 |
| Runtime cleanup/service/quota and Orthanc no-side-effect | `STAGE-005/009/010/011/012`, runtime storage registration and full transfer were not exercised | NOT RUN |

`MEDIQ-PACS-001` remains `PARTIAL`. This slice proves a local purge saga only under the recorded test harness; it does not prove scheduled verified-Tenant `SERVICE` cleanup, shared/multi-process quota, runtime-volume durability/fsync behavior, forensic erasure, privacy gate `STAGE-011`, isolated Orthanc A/B no-STOW `STAGE-012`, full Mandatory Preflight, STOW, destination verification or A→B product transfer.

## 13. Final DB-008 `-ScratchOnly` rerun — complete wrapper evidence

**Execution date/environment:** 2026-10-03 Asia/Seoul; local Docker Desktop; uniquely named disposable Compose project `mediq-db008-ab18eb06a978`; PostgreSQL 18.6; synthetic fixtures. The project was isolated from the persistent `mediq` Compose project.

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
```

- Exit code `0`. The wrapper reported `db008_clean_up=PASS product_tables=18 ledger=24 catalog=18|50|17|42`, `db008_reset=PASS only_owned_ephemeral_compose_resources_removed=true`, and final `db008_reset_reapply=PASS product_tables=18 ledger=24`.
- DB-009 exact runtime grants/forced-RLS access boundary, PACS-007 operation ledger, PACS-001 physical purge/restart/Audit retry, EXC-002/003, Consent request/approval/withdrawal, Grant issue/revocation, PACS Session Fence, Provenance, Integrity, policy conformance and the final runtime-role migration-ledger denial probe all passed across the clean/repeat/reset/reapply runs.
- Final output explicitly reported `db008_prior_schema_regressions=SKIPPED scratch_only=true persistent_mediq_database=NOT_ACCESSED` and `db008_schema_validation=PASS scope=scratch_schema_runtime_acceptance_only persistent_mediq_database=NOT_ACCESSED`. DB-002~007 were intentionally skipped; this is not a non-scratch full-regression claim.
- Final output reported `db008_ephemeral_cleanup=PASS`; independent inventory confirmed no containers, volumes or networks remained under the unique project label. The persistent API, PostgreSQL and Orthanc A/B containers remained healthy.

**Judgment:** DB-008 `-ScratchOnly` whole-wrapper Acceptance is PASS for scratch schema lifecycle/runtime acceptance. DB-002~007 persistent regressions and all PACS lifecycle gates not listed above remain outside this result. `MEDIQ-PACS-001` remains PARTIAL.

## 14. PACS-001-DEC-010 recommendation and Acceptance — pre-implementation checkpoint

**Decision date:** 2026-10-03. The standing user instruction authorizes recommendation-first decisions within approved scope; no new external approval was required. The adopted recommendation and complete Acceptance are recorded in [PACS-001-DEC-010](../../POLICY-DECISION-LOG.md#pacs-001-dec-010--shared-temporary-payload-quota-reservation) and [`TC-PACS-001-STAGE-005`](../../ACCEPTANCE-TESTS.md#p0-pacs-import-coordinator-preconditions--mediq-pacs-001).

- Finding: the existing in-memory `environmentBytes` counter is synchronous only inside one Node process and cannot enforce the existing 10 GiB environment ceiling across replicas.
- Chosen boundary: PostgreSQL singleton environment aggregate, shared ImagingPackage aggregate, and Tenant-RLS opaque reservation rows; dedicated `NOLOGIN/NOBYPASSRLS` owner and fixed safe-path functions; runtime has EXECUTE only, no direct ledger grants. 16 MiB reserve blocks precede writes; seal refunds unused slack; release is transactionally coupled to post-unlink `PURGED`+success Audit.
- Scope: three quota-control tables, migration/Drizzle/RLS/grant setup, quota repository and internal store wiring/tests. Package aggregate is shared across source/recipient Tenant contexts without exposing reservation rows. No route, provider, worker, volume, PACS write, STOW, or runtime storage activation.
- Alternatives considered: process-only counter, direct runtime counter grants, filesystem quota and Redis; reasons are recorded in DEC-010.
- Acceptance includes size/object/package/environment limits, multi-session race, exact runtime/owner privilege boundaries, Tenant/ref/state/expiry/writer binding, settle/release ordering, failures and retryable no-false-success behavior.
- At the subsequent code checkpoint, Drizzle schema/migration/functions and the quota repository adapter have been drafted; the storage primitive has only partial scaffolding. The store does not yet invoke shared reserve/settle/release, so it is not safe to activate.
- **Evidence status at this checkpoint:** design and Acceptance recorded; quota-specific implementation and database integration evidence are pending. No PASS is claimed for `STAGE-005`.

## 15. Current code checkpoint — verification before commit

**Execution date/environment:** 2026-10-03; local workspace; no database migration or persistent environment was touched.

```powershell
npm run build:api
npm run test:api
npm run db:migrations:check
git diff --check
```

- The first `npm run build:api` attempt exposed missing initialization for the new in-memory quota scaffolding. Initialization was added; the subsequent build passed as part of `npm run test:api`.
- `npm run test:api`: exit code `0`; 37 files and 686 tests passed. These are existing API regressions, not dedicated DEC-010 quota Acceptance.
- `npm run db:migrations:check`: exit code `0` (`Everything's fine`). This validates Drizzle migration metadata consistency only; migration `0024` was not applied to a database.
- `git diff --check`: exit code `0`.
- **Not executed:** fresh scratch-schema apply/reset/reapply, SQL function/RLS/grant probes, cross-process quota contention, store reserve-before-write/settle/release wiring tests. No `STAGE-005` PASS is claimed; no persistent DB was accessed.

**Judgment:** source compiles and the pre-existing API regression suite passes, but shared quota behavior remains unverified and incomplete. `MEDIQ-PACS-001` stays `PARTIAL`; keep the new storage path unregistered.

## 16. DEC-010 shared quota wiring checkpoint — 2026-10-03

**Point-in-time note:** This section records the earlier wiring checkpoint before `STAGE-005` boundary tests. Its `NOT RUN` verdict is superseded by §17, which records the subsequent scoped Acceptance results.

### Commands and confirmed results

```powershell
npm run build:api
npm run db:migrations:check
npm run test:db-migrations
npm run test:api
npx vitest run --maxWorkers=1 --no-file-parallelism tests/api/temporary-payload-purge-coordinator.test.mjs tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
git diff --check
```

- `npm run build:api`: exit 0. `npm run db:migrations:check`: exit 0, Drizzle reported consistency. `npm run test:db-migrations`: 6/6 passed. `npm run test:api`: exit 0, 37 files / 689 tests passed. Focused quota/store and purge unit suites: 2 files / 18 tests passed.
- Scratch schema expectations were extended to 21 product tables, 26 migration ledger entries and catalog `21|55|17|48`; DB-009 now expects 20 forced-RLS quota/product tables, 17 runtime policies, 20 migrator policies, zero direct runtime table privileges, and the unchanged 244 column grants.
- During scratch validation, the first migration application failed with SQLSTATE `42501` because migration 0025 attempted DDL before `SET ROLE mediq_quota_owner`; ordering was corrected. A subsequent purge integration exposed a missing owner SELECT grant on `study_references.temporary_payload_purged_at`; the narrow grant was added without expanding runtime grants. These failures were scratch-only and led to code/migration fixes.
- A later `-ScratchOnly` run emitted `db008_clean_up=PASS product_tables=21 ledger=26 catalog=21|55|17|48`, `db008_reset=PASS`, `db008_reset_postgres=PASS`, and the PACS-001 `temporary_payload_runtime=PASS` line (exact grants, forced RLS, sibling isolation, metadata binding, physical purge, restart recovery and Audit retry). The reset/reapply pass then progressed through PACS-007, PACS-001 purge, DB-009, EXC/Consent/Grant, fence and Provenance checks. Its final wrapper process exit / `db008_schema_validation` line was not captured, so this checkpoint does **not** claim whole-wrapper DB-008 PASS. An independent post-run Docker inventory showed no remaining `mediq-db008` resources.
- Persistent `mediq` DB and Orthanc A/B were not accessed by `-ScratchOnly`. No production credentials or patient data were used.

### DEC-010 Acceptance boundary

| Acceptance | Evidence | Judgment |
|---|---|---|
| Store reserves before ciphertext write; fail closed on adapter failure; settlement to actual payload size; one StudyReference per reserved storage ref | New synthetic store unit tests; focused suite 18/18 and full API suite 689/689 | PASS — local unit scope only |
| Purge release occurs after path removal and transactionally with `PURGED`+Audit; Audit rollback preserves reservation/counters | Purge-coordinator unit tests and PACS-001 scratch integration after the owner-column grant fix | PASS — scoped synthetic filesystem + disposable PostgreSQL/RLS lifecycle |
| Migration applies with three tables, `settled` marker, dedicated owner functions; runtime grants unchanged | Scratch output showed 21 tables / 26 migrations / catalog `21|55|17|48`; DB-009 printed 20 forced-RLS tables and 244 runtime grants | PASS — schema and existing access-boundary sub-gates observed; whole wrapper final exit unavailable |
| 64 MiB/object, 2,000-object, 2 GiB/package and 10 GiB/environment edges; independent runtime-session contention; source/recipient shared package aggregate; full wrong-binding/failure matrix | Not implemented in database Acceptance yet | NOT RUN — `STAGE-005` remains open |
| Cross-process crash recovery, quota rebuild/failover, maximum-size throughput, runtime registration, SERVICE cleanup, Orthanc no-side-effect | Outside current slice | NOT RUN |

**Judgment:** DEC-010 has implementation progress but is not Acceptance-complete. Keep the store unregistered, do not enable source-capture runtime wiring, and do not claim `STAGE-005` PASS. `MEDIQ-PACS-001` remains `PARTIAL`.

## 17. PACS-001-DEC-010 — STAGE-005 quota Acceptance sub-gate

**Follow-up note:** This section records the first boundary-test run. The concurrent distinct-writer same-ref case and source/recipient cross-Tenant Package aggregate initially remained open here; [§18](#18-stage-005-cross-tenant-quota-follow-up) supersedes those two sub-cases with the later verified results. Other partial/open Acceptance items remain unchanged.

**Execution date/environment:** 2026-10-03 Asia/Seoul; local Docker Desktop; uniquely named disposable DB-008 Compose project; PostgreSQL 18.6; synthetic `TEST-*` fixtures only. `-ScratchOnly` did not access the persistent `mediq` database or start/modify Orthanc A/B.

### Commands and results

```powershell
node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs
npx vitest run --maxWorkers=1 --no-file-parallelism tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs
npm run typecheck:api
npm run db:migrations:check
npm run test:db-migrations
npm run test:api
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
git diff --check
```

- `node --check`, `npm run typecheck:api`, and `npm run db:migrations:check` exited `0`; Drizzle reported `Everything's fine`. `npm run test:db-migrations` exited `0` with **6/6** tests. Focused store suite passed **14/14**. `npm run test:api` exited `0`: **37 files / 691 tests** passed; this command also rebuilt the API TypeScript output.
- Final `scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` exited `0`. Clean migration, repeat apply, reset, reset/reapply, runtime/RLS regressions and owned-resource cleanup all passed. Final output: `product_tables=21`, `ledger=26`, `catalog=21|55|17|48`, `20` forced-RLS tables, runtime quota-table direct privileges `0`, runtime column-grant inventory `244`, and `db008_schema_validation=PASS scope=scratch_schema_runtime_acceptance_only persistent_mediq_database=NOT_ACCESSED`. DB-002~007 persistent regression scripts were intentionally skipped in `-ScratchOnly` mode. The wrapper repeated its acceptance checks across clean/repeat/reset-reapply phases; PACS-001 temporary-payload integration reported PASS in each phase. The final owned scratch project was removed.
- The first added integration attempt exposed a test-harness role leak: session-level `SET ROLE mediq_quota_owner` remained on a pooled inspector connection and denied a later Audit observation. The helpers now use `SET LOCAL ROLE`; the successful rerun completed the full wrapper. This was a test-harness issue, not a product migration change.
- The first full API run timed out the 2,000-writer local filesystem case at Vitest’s default 5-second limit. The test now has a 30-second bound and aborts files in batches; the focused rerun passed 14/14 and the full API rerun passed 691/691.

### Verified `STAGE-005` sub-cases

- The ephemeral store rejects a 64 MiB+1 instance before writing any ciphertext bytes; the opened empty writer is explicitly aborted and its temporary object removed. It accepts at most 2,000 concurrently staged object writers and rejects the 2,001st; test cleanup aborts all writers.
- With a disposable environment ceiling reduced to 16 MiB, two independent `mediq_runtime` PostgreSQL backend sessions raced to reserve one 16 MiB block for the same Study/storage reference. Exactly one reservation committed; the environment/package/ref counters remained at the ceiling. The test uses the same writer ID in both concurrent calls; a different writer ID is separately denied, but a concurrent distinct-writer collision case remains open.
- Restoring approved maxima, 128 fixed 16 MiB reservations reached exactly 2 GiB for one ImagingPackage/Exchange without allocating 2 GiB of payload. The 129th block was denied with SQLSTATE `54000`; the counters remained exactly 2 GiB. The reduced environment contention and exact Package ceiling are separate assertions.
- Runtime is allowed to execute only the three fixed reserve/settle/release functions for this path and is denied direct `SELECT` on all three quota tables. Missing Tenant context, unrelated Tenant, wrong Study/ref, wrong writer, expired StudyReference and invalid non-block delta all fail closed.
- The scratch lifecycle stages one synthetic encrypted object, settles the previously reserved amount to its exact byte count, then attempts restart purge. A colliding Audit event after unlink leaves the reference `PURGE_PENDING` and retains the exact retryable quota reservation/counters. Successful retry commits `PURGED` plus the single success Audit and removes the reservation/package/global counter only after the ciphertext path is absent. Existing purge unit cases continue to cover reserve-before-write, quota-adapter failure and filesystem/Audit failure behavior.

### Acceptance boundary and remaining work

| Acceptance | Evidence | Judgment |
|---|---|---|
| 64 MiB+1 instance and 2,001st object | Store unit tests, included in focused 14/14 and full API 691/691 | PASS — local synthetic filesystem scope |
| Reduced-cap independent-session environment contention | Two distinct PostgreSQL backend PIDs; one 16 MiB admission, one denial, no counter overshoot | PASS — disposable scratch DB; reduced limit, not exact 10 GiB exhaustion |
| Exact 2 GiB Package quota boundary | 128 successful 16 MiB DB reservations; 129th rejected; counter remains 2 GiB | PASS — disposable PostgreSQL/RLS; reservation accounting only, not 2 GiB throughput |
| Tenant/ref/expiry/writer denial and direct-table/function privileges | Runtime-role DB probes and 244-column/forced-RLS catalog evidence | PASS — scoped scratch DB; concurrent different-writer branch remains open |
| Actual-byte settlement and release after physical removal; Audit failure rollback | Synthetic encrypted child payload, exact settlement, Audit-collision retained reservation, successful purge-only retry released after unlink | PASS — scoped scratch PostgreSQL/RLS + synthetic filesystem |
| Source/recipient cross-Tenant Package aggregate, exact 10 GiB exhaustion, concurrent distinct-writer same-ref race, complete injected DB/filesystem/Audit matrix | Not fully exercised by this run | NOT RUN — required before full `STAGE-005` PASS |
| Cross-process crash/failover, SERVICE scheduler, runtime volume, maximum-Study throughput, Orthanc no-side-effect and PACS coordinator | Outside this sub-gate | NOT RUN — remain separate later gates |

**Judgment:** `STAGE-005` is **PARTIAL**, not PASS. Keep the store unregistered; do not wire a runtime volume/provider/worker, and do not add `PREFLIGHT_PASSED`, `STOW_STARTED`, destination calls or STOW. `MEDIQ-PACS-001` remains **PARTIAL**. No persistent development database, patient data, production credential or Orthanc A/B was accessed.

## 18. STAGE-005 cross-Tenant quota follow-up

**Execution date/environment:** 2026-10-03 Asia/Seoul; local disposable DB-008 PostgreSQL 18.6 and synthetic-only fixtures. Existing persistent DB and Orthanc A/B were not used.

### Commands and results

```powershell
node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs
npm run test:api
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
```

- Syntax check passed. `npm run test:api` exited `0`: **37 files / 691 tests** passed.
- The first scratch wrapper attempt reached `QUOTA_SETTLE_TO_SEALED_CIPHERTEXT_BYTES` and failed because the test refactor had removed the default `writerId` from shared inputs but had not added the winning writer ID to the later settlement call. This was a test-harness input omission. The settlement call and wrong-Study/Tenant/expiry probes now explicitly pass the winning writer identity.
- The first distinct-writer-only scratch wrapper run emitted the cleanup/schema PASS sentinels, but that polling call did not retain a numeric exit code. After adding the source fixture and cross-Tenant assertions, the final full wrapper rerun exited **0**, emitted the clean/repeat/reset/reapply PASS sentinels, and completed owned scratch-project cleanup (see the final wrapper result below).

### Distinct-writer collision evidence

- Two different random writer IDs raced concurrently against the same `StudyReference` and opaque storage reference from two independent `mediq_runtime` PostgreSQL backend sessions. Exactly one reservation fulfilled and one rejected with `TemporaryPayloadQuotaPersistenceError`; the loser did not overwrite the winner's reservation.
- The environment, Package and ref counters remained exactly at the reduced 16 MiB limit after the race. Subsequent exact 2 GiB Package accounting, actual-byte settlement and Audit-failed/successful physical-purge release all completed in the same scratch integration run using only the winning writer identity.
- The wrong-writer, wrong-Study, other-Tenant and expired-reference denials all supplied otherwise valid writer context so each probe exercises its intended authorization/binding boundary.

### Source/recipient shared-Package aggregate

- The disposable fixture includes a source-Tenant operation and StudyReference in the same ImagingPackage as the recipient-Tenant StudyReference. The recipient Tenant first reserves one 16 MiB block.
- To distinguish Package enforcement from environment exhaustion, the scratch caps are then set to a 32 MiB environment limit and a 16 MiB Package limit. The source Tenant attempts to reserve a block for its distinct StudyReference/storage ref; the database function rejects with SQLSTATE `54000` because the Package is already full, while environment headroom remains.
- Reading quota state under the source Tenant context shows the shared Package counter and global counter both remain at 16 MiB; the source Tenant sees no reservation-ledger row for the recipient Tenant, and its own attempted reservation leaves no row or ref counter. This validates cross-Tenant aggregate enforcement without cross-Tenant ledger visibility.
- After restoring reduced-cap headroom before the later binding-denial probes, the complete DB-008 `-ScratchOnly` wrapper was rerun. It exited **0**, emitted clean/repeat/reset/reapply PASS sentinels, preserved catalog `21|55|17|48`, and completed owned scratch-project cleanup. Persistent `mediq`, Orthanc A/B and DB-002~007 production-stack regressions were not accessed (`-ScratchOnly` explicitly skipped the latter).

**Judgment:** Concurrent distinct-writer same-ref collision and source/recipient cross-Tenant Package aggregate cases are **PASS** in the disposable scratch scope. `STAGE-005` remains **PARTIAL**: exact 10 GiB exhaustion and the complete injected DB/filesystem/Audit fault matrix remain open. Storage remains unregistered; no route, worker, runtime volume, destination call or STOW was enabled.

## 19. STAGE-005 exact 10 GiB environment quota boundary

**Recommendation/Acceptance recorded before implementation:** `PACS-001-DEC-010` exact-cap recommendation and the scoped Acceptance were recorded in the policy log and `ACCEPTANCE-TESTS.md` before adding this fixture. The selected topology uses disposable PostgreSQL only: five independent synthetic Packages, each filled with 128 × 16 MiB reservations to the existing 2 GiB Package cap, plus a sixth zero-use Package as the environment-overflow probe. It creates no 10 GiB ciphertext/payload files and does not change limits or product scope.

### Commands and results

```powershell
node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs
npm run test:api
./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly
git diff --check
```

- `node --check` exited `0`. `npm run test:api` exited `0`: **37 files / 691 tests** passed.
- The first full scratch-wrapper attempt reached the exact quota assertions but a later PROV-001 regression failed because the initial test fixture reused a StudyReference and conflicted on `(exchange_session_id, study_ref_id)`. This was isolated to fixture setup. The test now creates six dedicated synthetic quota-only Sessions, Packages and StudyReferences, avoiding all existing PACS/provenance/integrity fixtures.
- The final `scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` exited `0`. Its clean/repeat/reset/reapply acceptance rounds emitted `pacs001_temporary_payload_runtime=PASS`; DB-009, EXC/Consent/Grant, PACS Session fence, PROV-001, INT-001, policy-conformance and schema-validation sentinels passed, and the owned disposable Compose project was removed. Final scratch catalog was `21|55|17|48`, with 20 forced-RLS tables, zero direct runtime quota-table privileges and 244 runtime column grants. Persistent `mediq` was not accessed; DB-002~007 persistent regressions were skipped by the explicit `-ScratchOnly` scope; Orthanc A/B was not started or modified.

### Exact-limit assertions and cleanup

- The database quota functions accepted 128 reservations of 16 MiB for each of five separate Packages. The measured per-Package counters were exactly `2,147,483,648` bytes and the global counter exactly `10,737,418,240` bytes.
- A sixth otherwise-valid Package with zero reserved bytes attempted its first 16 MiB reservation. The function rejected with PostgreSQL SQLSTATE `54000`. The environment counter stayed exactly at 10 GiB; the probe Package/ref counters stayed zero and no probe reservation-ledger row was created.
- The probe takes place at reservation time before any ciphertext for that block can be written. No 10 GiB payload files were created. The test confirmed its package ciphertext paths were absent, then released only test-owned quota through the normal `PURGED` + success-Audit cleanup path. It verified the global/package counters and dedicated reservation rows returned to zero; no direct counter rollback was used.
- The fixture is run in each applicable clean/repeat/reset-reapply integration phase. The first failed aggregate attempt and corrected isolated-fixture rerun are both retained above; only the final complete wrapper exit `0` is the completion evidence.

### Acceptance boundary

| Acceptance | Evidence | Judgment |
|---|---|---|
| Five independent 2 GiB Package reservations reach the exact 10 GiB environment ceiling | Disposable PostgreSQL integration; exact `2,147,483,648` bytes per Package and `10,737,418,240` global bytes | PASS — quota accounting only; no 10 GiB disk-capacity or throughput claim |
| Sixth Package cannot reserve a valid next 16 MiB quantum; denial is atomic | SQLSTATE `54000`; unchanged global/probe counters and absent probe ledger row; reserve function rejects before ciphertext write | PASS — fail-closed environment-cap subcase |
| Test-only usage is cleaned by the product quota lifecycle | Ciphertext paths absent; normal `PURGED`+success-Audit release; all test-owned counters/rows return to zero | PASS — scoped scratch PostgreSQL/RLS lifecycle |
| Complete injected DB/filesystem/Audit fault matrix and other `STAGE-005` failure boundaries | Not covered by this exact-cap topology | NOT RUN — remains the open `STAGE-005` sub-gate |

**Judgment:** The exact 10 GiB environment-cap subcase is **PASS (scoped)**. `STAGE-005` and `MEDIQ-PACS-001` remain **PARTIAL** because the complete injected DB/filesystem/Audit fault matrix is still open. Storage remains unregistered; no runtime volume/provider/worker, route, destination call, STOW, PACS mutation or product completion claim was enabled. No persistent database, production credential, actual patient information or Orthanc A/B was used.
