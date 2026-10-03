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

## 20. PACS-001-DEC-011 failure-matrix pre-implementation checkpoint

**Decision/Acceptance:** [PACS-001-DEC-011](../../POLICY-DECISION-LOG.md#pacs-001-dec-011--deterministic-quota-failure-boundary-acceptance) and `TC-PACS-001-STAGE-005-FAIL-001~004` were recorded before code changes. This checkpoint is intentionally pre-implementation; no new failure case is claimed PASS here.

**Coverage audit:** Prior tests cover initial reserve denial, quota ceilings and binding denials, plus `STAGE-008/014` purge pending-metadata failure, physical unlink failure, Audit rollback, ambiguous commit/retry, and sibling isolation. The missing direct cases are later-block reserve denial after a successful write, ciphertext file write/sync error, settlement failure and idempotent retry, and quota-release function error rolling back final metadata/Audit.

**Adopted implementation scope:** Add a narrow internal ciphertext-I/O seam used only by deterministic tests; its production default delegates directly to Node `FileHandle.write()`/`sync()` and the seam receives only the already-encrypted buffer/handle, never a path, source plaintext or caller-supplied selector. Add focused store tests for the four boundary families and extend the existing DB-008 scratch integration to inject quota-release query failure inside the actual Tenant transaction. Reuse existing Stage-008/014 evidence rather than rewriting or weakening it.

**Environment and safety:** Synthetic content, local temporary filesystem and uniquely named DB-008 `-ScratchOnly` PostgreSQL only. No persistent development DB, Orthanc A/B, runtime volume/provider, network transfer, migration, direct runtime grant or STOW. `STAGE-005` remains PARTIAL until the post-change results and cleanup are recorded below.

**Status before implementation:** Code/test changes NOT STARTED; the previously recorded exact 10 GiB and existing purge lifecycle evidence are unchanged.

## 21. DEC-011 commit checkpoint — API verified, DB run pending

**Checkpoint:** 2026-10-03 Asia/Seoul, following the user's request to commit and push the current work. This section supersedes the pre-implementation status in §20, not the historical results in §§17–19. No full-stage completion is claimed.

### Changes and traceability

- `PACS-001-DEC-011` / `TC-PACS-001-STAGE-005-FAIL-001~003`: added the internal ciphertext write/sync seam (default Node FileHandle behavior) and six store cases: later-block reserve denial, partial write, sync failure, cleanup obstruction/recovery, settlement rollback and lost acknowledgement/retry. Local filesystem operations are real; quota effects in these store tests are modeled, not PostgreSQL evidence. Store suite now contains 20 cases.
- `FAIL-003/004`: extended the disposable PostgreSQL integration test with settlement rollback, committed-settlement acknowledgement loss, identical/changed replay, and SQL errors immediately before/after the release-function call. These are transaction-boundary injections, not a modified PL/pgSQL function or proof of production database outages. Final DB results remain unconfirmed at this checkpoint.
- No migration, grant, public API, runtime registration, worker, destination call or STOW was added. The store remains unregistered and `MEDIQ-PACS-001` / `STAGE-005` remain **PARTIAL**.

### Commands and observed results

| Command | Observed result |
|---|---|
| `node --check tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs` | Exit 0 |
| `node --check tests/database/temporary-payload-metadata-runtime.integration.test.mjs` | Exit 0; syntax only, not DB Acceptance |
| `npm run test:api` | Commit-time rerun at 11:30:53 KST: build and 37 files / 697 tests passed, exit 0, 25.36 seconds |
| `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` | Started before this commit request; still running when checked. Scratch PostgreSQL and role-bootstrap PASS observed. Final wrapper exit, clean/repeat/reset/reapply outcomes and owned-resource cleanup have NOT been confirmed for this revision; do not reuse §19's earlier PASS as DEC-011 evidence |
| `git diff --check` | Exit 0 before and after documentation synchronization; no whitespace errors |

**Earlier failed attempts retained:** Initial type checks rejected implicit parameter types and the overloaded `FileHandle.write` return type in the new seam; explicit port typing and a bytesWritten-only result resolved them. One API run had 696 PASS / 1 FAIL because the new test expected a value from void `purgeByReference`; correcting that assertion yielded 697/697. These failures were not treated as completion evidence.

**Not verified / remaining work:** Observe the existing scratch run to final exit and cleanup, record real `FAIL-003/004` outcomes, then reconcile full `STAGE-005` Acceptance and baseline documents. Do not mark the fault matrix PASS before that. Maximum-Study/backpressure, verified Tenant SERVICE cleanup, privacy/log serialization, runtime activation, Orthanc no-side-effect integration, full coordinator/Preflight/STOW/destination verification and P0 E2E remain separate gates. No additional DB run or persistent DB/Orthanc mutation was initiated for this commit request.

## 22. DEC-012 maximum-Study pre-implementation record

Recommendation `PACS-001-DEC-012` and `TC-PACS-001-STAGE-009-MAX-001` are recorded before adding the test. The existing DEC-011 scratch run has emitted its first `pacs001_temporary_payload_runtime=PASS` and DB-009 access-boundary PASS; the full wrapper is still running, not restarted, and not yet accepted as complete.

The new workload will use a unique local temporary directory and generated synthetic bytes only. Disk free-space inspection found approximately 1.2 TB free on C:, and the test itself will require at least 4 GiB before allocation. Planned command: `node --test tests/performance/temporary-imaging-maximum-study.test.mjs`, after `npm run build:api`. It is outside the normal API regression set. No runtime code, DB, network, patient data or STOW will be used. Status: **NOT RUN**; full STAGE-009 remains unverified even if this workload passes.

## 23. DEC-012 execution and test-cleanup correction

**Date:** 2026-10-03 Asia/Seoul. This section supersedes §§21–22's current-state notes, while preserving those historical observations. All new code in this continuation is test-only; production runtime, schema, grants, API and STOW behavior are unchanged.

### Commands and results

| Command / observation | Result |
|---|---|
| `npm run build:api` and `node --check tests/performance/temporary-imaging-maximum-study.test.mjs` | Exit 0 |
| `node --test tests/performance/temporary-imaging-maximum-study.test.mjs` — first run | Exit 1; cancelled by the initial 600,000 ms harness timeout (total 606,121 ms). No complete maximum-workload result. Post-exit read-only inspection found zero `mediq-max-study-*` temporary directories; this attempt's cleanup completed |
| `npx vitest run tests/api/orthanc-dicomweb-concurrency.test.mjs` — first run | 0/3: synthetic.invalid was rejected by the existing endpoint allowlist before HTTP. Corrected only the mock resolver's origin to the approved Test Orthanc shape; the injected responder still makes zero real HTTP requests |
| Same focused concurrency command after fixture correction | Exit 0; 3/3 PASS — EOF, cancellation, bounded waiters/cancelled-queue recovery |
| `npm run test:api` while maximum workload was running | Exit 1; 38 files, 699/700 passed. Existing 2,000-writer case timed out at 30 seconds; afterEach raced continuing writer creation, causing ENOTEMPTY and a FileHandle GC warning. This failed run is not regression acceptance |
| `npx vitest run tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs -t 'stops a cancelled object-count'` | Exit 0; 1 PASS / 20 intentionally unselected. Deterministic cancellation after exactly three creations opened no fourth writer, drained/closed every writer and left an empty object directory |
| `npm run test:api` after workload termination and cleanup correction | Exit 0; **38 files / 701 tests PASS**, start 11:56:38 KST, duration 22.85 seconds. Existing 2,000-object assertion and 30-second timeout unchanged; cleanup now waits for cooperative cancellation/finally completion |
| Corrected-budget `node --test tests/performance/temporary-imaging-maximum-study.test.mjs` | Launched after API completion, approximately 11:58 KST. **RUNNING**, no final result yet. Same 2 GiB/2,000 objects/64 MiB instance/64 KiB chunks/512 MiB measured array-buffer guard; source 30 minutes, post-capture 15 minutes, outer 47 minutes including cleanup, per existing DEC-007 phase budgets |
| Existing DEC-011 `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` | Same original run, not restarted. First payload-runtime and DB-009 boundary round passed, followed by EXC/Consent/Grant, fence, PROV/INT and policy-conformance sentinels. Final repeat/reset/reapply/exit and scratch teardown still pending |
| `git diff --check` | Exit 0 at checkpoint; LF/CRLF normalization warnings only |

### Scope and interpretation

- `CONC-001~003` uses the actual adapter semaphore and multipart body wrappers with a synthetic responder. It proves the default two permits remain occupied until EOF/cancel, a third waits, the queue caps at eight, overflow is rejected before HTTP, queued cancellation removes waiters, and later requests can proceed. It is not a global multi-process/multi-adapter limit or a combined encrypted maximum-Study path.
- MAX-001 uses `beginPackage()` only as the documented isolated primitive entry point, with real AES-GCM and filesystem I/O. It does not exercise DB reservations, Tenant authorization, actual DICOM encoding, a PACS server, or a production downstream consumer. A sequential test caller cannot establish the runtime plaintext-buffer lifetime requirement.
- The initial full API failure coincided with the heavy workload; the corrected standalone run passes, but no host/storage root-cause claim is made. The concrete teardown race is addressed using the installed Vitest TestContext abort signal, a tracked exercise promise and drain-before-remove. Cleanup gets 30 seconds; the actual ceiling test still has its original 30-second assertion deadline.
- One older failed API run left **313 zero-byte `.enc` files** in test-owned `mediq-temp-imaging-6SohzY` under the local Temp directory. Its worker process was confirmed absent; read-only inspection found no reparse entries. Explicit validated cleanup was rejected by execution policy, so no alternate deletion method was attempted. These empty synthetic test artifacts remain outside Git; manual/authorized cleanup remains open. No patient data or real ciphertext content was present in those files.

**Judgment:** Adapter concurrency and cancellation regression are scoped PASS. MAX-001, full STAGE-009, final DEC-011 wrapper and full STAGE-005 are not yet accepted; `MEDIQ-PACS-001` remains **PARTIAL**. Observe the two existing live test handles instead of restarting on an observation timeout. No commit/push was requested for this continuation and none was performed.

**Subsequent live observation:** The same DB wrapper emitted a second `pacs001_temporary_payload_runtime=PASS` plus DB-009 and EXC sentinels, but has not yet returned a final exit/cleanup verdict. The corrected maximum-workload run emitted `max_study_progress=STAGING objects=500`. Both process handles remain live; these are progress observations, not full-run PASS.

## 24. DEC-012 maximum workload completed; DEC-013 pre-implementation

The existing corrected workload process exited **0**: one test PASS, duration 633,316.97 ms. It actually generated, encrypted and authenticated **2,147,483,648 bytes / 2,000 objects** in 33,008 source chunks. Max source chunk 65,536 bytes; max active source/write/consumer-buffer counts each 1; max consumer buffer **67,108,864 bytes**. Measured peak RSS **157,192,192 bytes**, array buffers **78,466,979 bytes**, 32 delayed writes and 20 delayed consumer acknowledgements. Capture took **613,627 ms**, post-capture inventory/read took **14,499 ms**; elapsed including cleanup **633,187 ms**. Owned temporary-directory cleanup PASS; DB/PACS not accessed. This closes only the DEC-012 primitive MAX-001 run, not arbitrary caller lifetime enforcement or full STAGE-009.

DEC-013 and LIFE-001~008 are recorded before implementation. Planned change: replace raw `readInstance` with a void-returning borrowed callback, shared one-active/eight-waiter in-process gate, immutable selectors, required pre/post-decrypt access-verifier hook, cancellation and zero-before-release. Actual Consent/Grant/RLS verifier/runtime wiring remains out of this primitive. Re-run the exact workload through the new API after unit/typecheck/API results; do not reuse the preceding raw-read harness result as proof of the new consumer API. DEC-011's original DB wrapper is still live and must not be restarted merely because polling yields no output.

DEC-014 preparation: installed parser code ignores the optional byte counter's write backpressure; current Node's toWeb byte-length strategy was inspected and is not being blamed without evidence. Record FLOW-001~003 before reproducing with a held actual adapter consumer. No dependency change or limit relaxation is authorized.

## 25. DEC-013/014 current commit checkpoint

**Date:** 2026-10-03 Asia/Seoul. The user requested commit and push of the current state. This checkpoint supersedes older current-status descriptions, not historical evidence. No adapter fix or runtime activation is included; the failing regression is retained, not skipped. Ticket and full STAGE-005/009 remain **PARTIAL**.

### Implemented scope and traceability

- DEC-013 / LIFE-001~008: replace public internal raw-buffer reads with `consumeInstance`, private authenticated decrypt, immutable selectors, one active lifetime and eight metadata-only waiters shared within a Node module/process, required exact `VERIFIED` decisions before decrypt and delivery, expiry/purge rechecks, sanitized errors, and zeroing before admission release. Cancellation cannot release an active consumer's permit before it settles. The verifier hook is not an actual Consent/Grant/RLS implementation; the store remains unregistered.
- DEC-012: standalone maximum-workload and adapter concurrency tests; cooperative cleanup for the existing object-count test. The synthetic workload uses generated bytes, not clinical DICOM data, a PACS, DB reservations or a runtime consumer.
- DEC-014 / FLOW-001: added a regression demonstrating whole-instance read-ahead while the actual multipart adapter's consumer is stalled. The adapter fix and FLOW-002/003 are not implemented in this checkpoint. Do not treat the earlier aggregate API PASS as the current suite's verdict after this regression was added.

### Commands and observed results

| Command | Result |
|---|---|
| DEC-013 initial three-suite run | 91/92 passed; existing source-revocation filesystem case exceeded its unchanged five-second timeout. Retained as a failed attempt, not Acceptance |
| Sequential focused store/source/lifetime rerun | 3 files / 99 tests PASS; typecheck PASS |
| `npm run test:api -- --maxWorkers=1` before adding FLOW-001 | Build and 39 files / 722 tests PASS, start 12:24:25 KST, 67.51 seconds. Historical pre-FLOW-001 result only |
| `npm run typecheck:api` | Exit 0, including commit-time rerun |
| `node --check tests/performance/temporary-imaging-maximum-study.test.mjs` | Exit 0 |
| `node --test tests/performance/temporary-imaging-maximum-study.test.mjs` through DEC-013 consumer | Exit 0; one test PASS and owned cleanup PASS; exact metrics below |
| `npx vitest run tests/api/temporary-imaging-consumer-lifetime.test.mjs --maxWorkers=1` | Commit-time rerun: exit 0; 21/21 PASS, start 12:36:13 KST, 2.47 seconds |
| `npx vitest run tests/api/orthanc-dicomweb-concurrency.test.mjs --maxWorkers=1` | Commit-time rerun: exit 1; 3 PASS / 1 FAIL, start 12:35:14 KST. FLOW-001 observed 8,388,608 bytes prefetched with the consumer stalled, exceeding the 524,288-byte test allowance |
| Existing `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` | Not restarted. Clean/repeat/reset and the reset-reapply payload-runtime/DB-009 sentinels observed; final wrapper exit and owned cleanup remain unconfirmed at this checkpoint. No full STAGE-005 PASS |

### DEC-013 maximum-workload result

Source, ciphertext and authenticated bytes each **2,147,483,648**, **2,000 objects**, **33,008 chunks**, largest chunk **65,536 bytes**. Maximum active sources, writes and consumer buffers each **1**; largest borrowed plaintext buffer **67,108,864 bytes**. Peak sampled RSS **160,940,032 bytes**, array buffers **77,263,727 bytes**; **32** delayed writes and **20** delayed consumer acknowledgements. Capture **599,312 ms**, post-capture **20,731 ms**, elapsed including cleanup **632,702 ms**; Node total **632,865.75 ms**. Buffer zeroing after callback and test-owned directory cleanup passed. DB/PACS not accessed. This is local primitive MAX-001/LIFE-008 evidence, not the actual multipart adapter pipeline or full STAGE-009.

### Remaining risks and follow-up

FLOW-001 is a known failing regression in this commit. Apply the recorded DEC-014 recommendation in a subsequent implementation task, preserve the 64 MiB cap, then verify FLOW-002/003 and full regression. Observe the existing scratch wrapper's final exit/cleanup without restarting it. SERVICE cleanup, privacy/no-side-effect gates, runtime activation, coordinator/Preflight/STOW/destination verification and P0 E2E remain open. Prior 313 empty test artifacts outside Git remain recorded in §23; no cleanup bypass or patient-data use occurred. No source-code repair, persistent DB mutation, deployment, dependency change or additional heavy workload was initiated solely for the commit request.

## 26. DEC-014 implementation and integrated workload

**Pre-implementation checkpoint (2026-10-03):** Work resumes from clean commit `cc44fdb`. The previous turn made progress by recording DEC-013 completed workload and the actual FLOW-001 failure. The same DB-008 scratch handle is confirmed live; no restart. DEC-014 already authorizes removing only the multipart library's optional non-backpressured counter and adding the unchanged 64 MiB check before each adapter enqueue. Header/count/transfer-syntax, terminal iterator failure, cancellation and semaphore release behavior must remain intact. No dependency, endpoint permission, STOW, schema or runtime activation change is allowed.

FLOW-002 will directly verify exact 64 MiB success, +1-byte rejection, cancellation and permit reuse, plus existing malformed/timeout/abort regressions. FLOW-003 will route the unchanged maximum workload through the real multipart adapter using injected synthetic HTTP only. Bounded adapter prefetch may legitimately overlap an awaited encrypted write: measure produced-minus-acknowledged bytes at every source pull and require at most 512 KiB, instead of asserting zero upstream pull across internal stream buffers. Keep sequential source instances, one active write, exact bytes/digests/objects, one authenticated consumer buffer, unchanged memory/deadline limits and cleanup. This refines the integration measurement; it does not relax the source-consumer backpressure requirement. Results pending.

First build/focused run (`npm run build:api`, then `npx vitest run tests/api/orthanc-dicomweb-concurrency.test.mjs tests/api/orthanc-dicomweb.adapter.test.mjs --maxWorkers=1`, 12:41:50 KST): 35 assertions passed but the runner exited 1 with an uncaught `Controller is already closed` from the flowing Node-to-Web bridge during multipart cancellation. Not accepted as PASS. DEC-014 records the pull-based async-iterator corrective recommendation before its implementation.

After the pull-based bridge correction, focused adapter tests passed 35/35, then 39/39 with exact-cap/+1-byte, manifest denial, recovery and started-body abort/idle/total cases. API build/regression passed 39 files/727 tests (12:46:08 KST, 23.87 s), API typecheck and DICOM Port type contract passed. These precede DEC-015 and are not its final Acceptance.

Three FLOW-003 attempts ended with exit 1 in the first source instance (approximately 431, 458 and 377 ms); final diagnostic showed exactly 64 MiB source/acknowledged bytes, one active source/write, and 262,144-byte maximum lag, then failure while awaiting EOF. All attempts terminated normally through the test's cleanup finally; no maximum-workload PASS. A direct slow-reader diagnostic of installed 1.1.0 reproduced its premature `MultipartTruncatedError` despite a valid boundary. DEC-015 records the local pinned-source correction and slow valid/truncated regression before dependency changes.

**DEC-011 final result:** The original DB-008 `-ScratchOnly` process exited 0 after clean/repeat/reset/reapply; `db008_reset_reapply=PASS product_tables=21 ledger=26`, `db008_ephemeral_cleanup=PASS` and `db008_schema_validation=PASS scope=scratch_schema_runtime_acceptance_only persistent_mediq_database=NOT_ACCESSED` were observed. All three payload runtime rounds passed, including settlement/release failure cases, forced RLS and exact 244 runtime column grants. Earlier exact quota/bounds evidence plus this completed failure matrix close **STAGE-005 (scoped PASS)**. Persistent DB-002~007 regressions were intentionally skipped; this run does not certify subsequent DEC-014/015 adapter/dependency changes or any runtime activation.

DEC-015 red/green: the delayed-consumer pair on upstream 1.1.0 produced 1 FAIL (valid response) / 1 PASS (truncated rejection), 12:53:07 KST. After the local patch, both adapter suites passed 41/41, exit 0 (12:54:35 KST). `npm install --ignore-scripts --offline` succeeded; `npm ls` resolved API → local `1.1.0-mediq.1` → unchanged `streamsearch@1.1.0`. API build/regression subsequently passed 39 files/729 tests (12:55:41 KST, 40.99 s), typecheck and Port type contract passed. The upstream ESM comparison confirmed only the approved callback change plus newline normalization/removal of two dangling source-map directives; declarations and license are preserved. The first run warned about a missing upstream source map; both non-executable directives were then removed. The added local source/lockfile/Docker provenance suite passes 3/3 (12:57:35 KST); a final aggregate rerun remains required after these test additions.

The first runtime image build succeeded with the local package in build and runtime stages. A final image build/isolated module-resolution probe will use the final source hash and explicit `--ignore-scripts`; no application, DB or PACS service is launched. The post-patch maximum workload is running through the actual multipart adapter; final evidence is still pending here, not inferred from progress counts.

### Final results (supersede pending observations above)

| Command | Final observed result |
|---|---|
| `node --test tests/performance/temporary-imaging-maximum-study.test.mjs` | Exit 0; FLOW-003 exact 2 GiB/2,000-object adapter → manifest/encryption → authenticated borrowed-consumer workload and owned cleanup PASS; metrics below |
| `docker build --target runtime -f services/api/Dockerfile -t mediq-api:dec015-validation .` | Final build exit 0; build/runtime both include local dependency and install with `--ignore-scripts`; final image config `sha256:56ce1ba6c71a73e2dcab99ff21d5ee4f126e46daa188f61a46d406567ac852e7` |
| Network-disabled, read-only, non-root container module probe (command below) | Exit 0; local package version, normalized source hash, parser and compiled adapter imports PASS. Container removed by `--rm`; no application startup, DB, PACS, credential injection or service deployment |
| `npm run test:api -- --maxWorkers=1` after workload completion | Exit 0; **40 files / 732 tests PASS**, start 13:01:48 KST, 44.22 seconds; no uncaught errors or source-map warnings |
| `npm run typecheck:api` | Exit 0 |
| `npm run test:dicom-port-contract` | Exit 0 |
| `git diff --check` | Exit 0; Git LF/CRLF normalization warnings only |

FLOW-003 measured **2,147,483,648 bytes** each at source/ciphertext/authenticated consumption, **2,000 adapter requests/objects**, **33,008 source chunks** ≤65,536 bytes. Maximum produced-minus-acknowledged lag **262,145 bytes** (≤524,288 allowance); active sources/writes/consumer buffers each **1**, largest released plaintext buffer **67,108,864 bytes**. Peak sampled RSS **216,408,064 bytes**, array buffers **121,836,015 bytes** (<512 MiB test guard). **32** delayed writes and **20** delayed consumer acknowledgements; capture **237,159 ms**, post-capture **15,556 ms**, elapsed including cleanup **259,965 ms** (Node total **260,310.48 ms**). Exact digests/lengths and zero-after-consumer passed. No DB/PACS or actual clinical DICOM was used; timings are local observations, not production SLOs or comparative performance proof.

Reproducible final container probe (PowerShell):

```powershell
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --workdir /workspace/services/api --entrypoint node mediq-api:dec015-validation --input-type=module -e 'import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; import {createRequire} from "node:module"; const require=createRequire(import.meta.url); const pkg=JSON.parse(readFileSync(require.resolve("@ubercode/multipart-stream/package.json"),"utf8")); assert.equal(pkg.version,"1.1.0-mediq.1"); const source=readFileSync("/workspace/vendor/multipart-stream/index.js","utf8").replace(/\r\n/g,"\n"); assert.equal(createHash("sha256").update(source).digest("hex"),"3574331e86ab1cde0a4def60895b212e5edb7b345f7cab03990ebe8b560b5c5d"); const parser=await import("@ubercode/multipart-stream"); assert.equal(typeof parser.parseMultipartRelated,"function"); const adapter=await import("./dist/dicom/infrastructure/orthanc-dicomweb.adapter.js"); assert.equal(typeof adapter.OrthancDicomwebAdapter,"function"); assert.notEqual(process.getuid(),0); console.log("dec015_container_resolution=PASS runtime_user=non_root network=none source_hash=PASS adapter_import=PASS application_started=false");'
```

**Judgment:** STAGE-005 is **PASS (scoped)** by the completed DEC-011 fault matrix plus prior exact quota/bounds evidence. STAGE-009 is **PASS (scoped, unregistered single-process boundary)** from the combined actual-adapter FLOW-001~003, default two-permit/eight-waiter CONC-001~003, production-intended borrowed lifetime LIFE-001~008 and exact workload evidence. The workload's own `full_stage009=NOT_PROVEN` marker is intentionally conservative: it alone does not prove concurrency/lifetime; those have separate recorded tests. No cross-process/global memory ceiling, clinical DICOM conformance, actual downstream STOW consumer, active runtime Authorization or product E2E is claimed. MEDIQ-PACS-001 remains **PARTIAL**. Next: STAGE-010 verified per-Tenant SERVICE cleanup, followed by privacy/no-side-effect and runtime/coordinator gates. No new commit/push was performed in this goal continuation.

## 27. DEC-016 verified SERVICE expiry cleanup

**Pre-implementation (2026-10-03):** Previous goal turn made concrete progress: STAGE-005/009 scoped PASS with final API 732 and integrated workload evidence. Current worktree contains those uncommitted changes and is preserved. DEC-016 and CLEAN-001~008 precede implementation. Reuse existing runtime identity/RLS and purge saga; add no grant/schema or runtime registration. Tests will use mocked transactions for narrow unit assertions and a dedicated disposable DB-008 integration with signed synthetic OIDC, active SERVICE registry resolution, two Tenants and actual generated ciphertext. Privileged fixture setup/inspection is not worker behavior. No current test PASS is claimed yet.

## 28. User-requested Git checkpoint

**Date:** 2026-10-03 Asia/Seoul. The user requested saving the current state with commit and push. Existing DEC-014/015 implementation, tests and scoped evidence are preserved. DEC-016 is recommendation/Acceptance only, with no cleanup-runner implementation or test PASS. No further feature work or runtime activation is performed for this checkpoint.

| Command/check | Observed result |
|---|---|
| `npm run typecheck:api` | Exit 0 |
| `npm run test:dicom-port-contract` | Exit 0 |
| `npm run test:api -- --maxWorkers=1` | Build and **40 files / 732 tests PASS**, exit 0; start 13:22:20 KST, duration 24.69 seconds |
| `git -c core.safecrlf=false diff --check` | Exit 0 |
| Candidate-file inspection | 25 files: source, tests, documentation, dependency metadata and retained third-party license. No excluded runtime/data file, binary/large-file flag or selected high-confidence secret pattern found. This is a limited pre-commit check, not a comprehensive PHI/security audit |
| `git check-ignore .env services/api/dist/main.js` | Both paths ignored; neither is included in the checkpoint |
| `git fetch origin` | Exit 0; remote points to the user-requested Medi-Q- repository |

No new disposable PostgreSQL, exact 2 GiB workload, Docker image, real Orthanc or product E2E run was performed for this Git-only task. Earlier results remain historical evidence in section 26 and are not represented as reruns. No patient data, runtime credentials or generated imaging payload is intentionally included. Full Ticket status remains **PARTIAL**; successful commit/push is a repository checkpoint, not product completion.

## 29. DEC-016 implementation and verification

**2026-10-03, started from clean commit `3b04e3c`.** The preceding turn made progress by committing the validated streaming work and pre-implementation DEC-016 decision. Recommendation and CLEAN-001~008 were already recorded. This continuation implements bounded expired-target discovery, immutable input snapshots, exact Tenant-level SERVICE guards in discovery and both TTL purge transactions, atomic expiry revalidation before physical deletion, and aggregate-only sequential batch results. No runtime registration, schema/grants, endpoint or STOW change.

| Command | Observed result |
|---|---|
| `npm run build:api` then `npx vitest run tests/api/temporary-payload-expiry.test.mjs tests/api/temporary-payload-purge-coordinator.test.mjs --maxWorkers=1` | Exit 0; 2 files/38 tests PASS (32 new expiry cases plus six prior saga cases), 13:31:43 KST, 862 ms |
| `npm run test:api -- --maxWorkers=1` | Build and 41 files/764 tests PASS, exit 0; 13:37:59 KST, 24.45 s |
| `npm run typecheck:api`; `npm run test:dicom-port-contract` | Both exit 0 |
| `node --check tests/database/temporary-payload-expiry-runtime.integration.test.mjs` | Exit 0, including the final transaction-observer correction |
| PowerShell parser of `scripts/test-db-008-full-schema.ps1` | No parse errors; `db008_powershell_syntax=PASS` |
| `git diff --check` | Exit 0; LF/CRLF warnings only |
| `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` | Live process session 42314, owned project `mediq-db008-bafd5c1a87ca`; observed `db008_scratch_postgres=PASS role_bootstrap=PASS`. No final integration/wrapper/cleanup verdict yet; not restarted |

Unit/model results cover bounded queries and immutable/aggregate output, SERVICE/context/clock denials, stale ref/expiry, before/after-admission identity changes, partial failure and idempotent retry. SQL modeling is not PostgreSQL/RLS evidence. The dedicated real integration test uses fresh signed synthetic OIDC, actual ActorTenantContextService/registry and mediq_runtime only for discovery/purge. A separate migrator connection seeds/observes or deliberately alters synthetic test rows; it never runs worker discovery or purge. Its physical-effect observer checks no current task's transaction via AsyncLocalStorage and, during sequential cases, independently verifies zero runtime transactions in pg_stat_activity. Concurrent batches may legitimately have another batch's metadata transaction active; the observer does not confuse that with a transaction spanning its own filesystem call.

Pending: dedicated real DB/ciphertext result and existing wrapper clean/repeat/reset/reapply/owned cleanup. No real PACS, runtime scheduler, clinical DICOM or product E2E is tested. STAGE-010 and MEDIQ-PACS-001 remain PARTIAL. The misplaced DEC-016 pre-implementation heading and P0/P1 architecture/Acceptance paragraphs were moved back to their correct sections without changing their requirements. No commit/push in this continuation.

**First real integration result (supersedes live-run notes above):** Session 42314 exited **1**. PACS-007 regression passed, then DEC-016 failed at `TENANT_ISOLATED_DISCOVERY_AND_PARTIAL_FAILURE`, safe code `ASSERTION`; raw output remained suppressed. Read-only Docker inventories confirmed zero containers, volumes and networks for `mediq-db008-bafd5c1a87ca` after the wrapper's finally cleanup. No full STAGE-010 or DB wrapper PASS. Static inspection does not establish the failed assertion's cause. Record the diagnostic refinement before adding fixed substage/aggregate/SQLSTATE categories; preserve all checks and rerun in a fresh disposable stack only after the original terminal status is confirmed.

**Observer defect and corrected rerun:** Comparison with migration 0024 and the existing payload-runtime observer showed that quota reservations remain FORCE RLS protected under `mediq_quota_owner`; the new observer omitted the transaction-local Tenant setting and therefore cannot see the retained row. DEC-016 records the recommendation before adding exact target-Tenant context in that read-only observer. No-/wrong-Tenant observer reads must still return zero, while the correct Tenant must see one retained reservation before successful purge and zero afterward. No runtime privileges, policy, production implementation or original assertion count is weakened. This explains a concrete test defect consistent with the failure; the rerun must determine whether it is the only cause.

The first process was confirmed terminal before launching the unchanged full command `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` again. Replacement session **77695**, owned project **mediq-db008-84a48ffac0f8**: observed bootstrap PASS and healthy scratch PostgreSQL. Safe diagnostic/substage changes and the observer correction were saved while this replacement run was still in bootstrap/SQL setup, before its expiry integration build. `node --check` and `git diff --check` passed for the corrected test. Fixed diagnostics include only stage names, aggregate counts and SQLSTATE/observer categories; raw errors, selectors, paths and secrets remain suppressed. Final test/image provenance, integration, clean/repeat/reset/reapply and owned cleanup are still pending; do not reuse session 42314 or restart the live replacement merely for delayed output.

**Verified wait / next-gate inspection (14:04 KST):** The same session 77695 remains live; the owned PostgreSQL is healthy and an owned Docker psql subprocess was observed executing. No timeout was treated as terminal, no replacement was launched and no integration PASS inferred. Read-only inspection found the still-unconnected source-capture primitive `beginPackage`/`purgePackage` seam, completed-capture TTL coordination and ordinary-response privacy boundaries. Report §14 records these concrete next-gate prerequisites; they are not implementation or acceptance of STAGE-002/003/004/011/012. Existing source/runtime behavior and current test inputs are unchanged by that inspection.

## 30. DEC-016 user-requested commit checkpoint

**Date:** 2026-10-03, approximately 14:15 KST. The user requested committing and pushing the current state. This checkpoint supersedes earlier pending observations, not historical failed attempts. No product code, permissions, runtime activation or test assertions were changed for this checkpoint.

| Command / observation | Actual result |
|---|---|
| `npm run test:api` | Exit 0; build and **41 files / 764 tests PASS**; start 14:14:15 KST, Vitest duration 17.48 seconds |
| `npm run typecheck:api` | Exit 0 |
| `npm run test:dicom-port-contract` | Exit 0 |
| `node --check tests/api/temporary-payload-expiry.test.mjs` and `node --check tests/database/temporary-payload-expiry-runtime.integration.test.mjs` | Both exit 0 |
| PowerShell parser for `scripts/test-db-008-full-schema.ps1` | Zero syntax errors |
| Existing session 77695, unchanged `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` | First `pacs001_expiry_runtime=PASS` observed: signed OIDC, active SERVICE, Tenant RLS, stale denial, partial retry, concurrent idempotency, ciphertext cleanup and quota/Audit. Existing PACS-007, payload-runtime, DB-009 and EXC-002 sentinels also observed. Process remains live; full repeat/reset/reapply, final exit and owned-project cleanup **not yet confirmed** |
| `git diff --check` | Exit 0; LF/CRLF normalization warnings only |
| Changed-file credential-pattern and artifact-path review | Zero matches for inspected private-key/token/credential-URL patterns; no `.env`, DICOM, ciphertext, runtime logs or build outputs selected. This limited review is not a comprehensive secret-detection guarantee |
| `git fetch origin`; `git rev-list --left-right --count HEAD...origin/main` | Fetch exit 0; `0 0` before the new checkpoint commit |

**Judgment:** Preserve **PARTIAL** for STAGE-010 and MEDIQ-PACS-001. The first real integration round now passes, but it does not replace the whole-wrapper completion/cleanup gate. Leave the existing test running without restarting it. Runtime storage/scheduler, source lifecycle integration, privacy/no-side-effect gates, Mandatory Preflight/STOW/destination verification and P0 E2E remain open. This commit records an intermediate state, not completion or deployment.

## 31. DEC-017 pre-implementation design and verified wait

**Date:** 2026-10-03, 14:16–14:26 KST observations. Previous turn was concrete progress: checkpoint `e8e4e47` committed/pushed with API 764 PASS and honest PARTIAL status. This continuation makes design/Acceptance changes and verifies the existing live process; it is not a repeated blocker or product implementation PASS.

| Action / command | Observed result |
|---|---|
| `git status --short --branch` at continuation start | Clean `main...origin/main`; no unrelated changes to overwrite |
| Poll existing process session 77695 (`test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`) | Still live. Additional EXC-003, Consent persistence/request/approval/withdrawal, Grant persistence/issue/revoke, Session fence, Provenance, Integrity and policy-conformance PASS sentinels observed. These extend the first-round evidence; they are not whole-wrapper completion |
| `docker ps --filter label=com.docker.compose.project=mediq-db008-84a48ffac0f8 --format '{{.Names}} {{.Status}}'` at 14:26 | Owned scratch PostgreSQL healthy; process handle still live with no terminal exit. No restart or replacement launched |
| Read current source, metadata/quota/store/purge, Authorization executor, source evidence, existing isolated Orthanc harness/observer and relevant normative scopes | Confirmed the primitive stage/purge seam, unsynchronized completion expiry, missing actual read verifier, existing exact grants/identifier columns and separate B probe/network boundary. No application or test code modified |
| Record DEC-017 and LIFECYCLE-001~014 before code | Adopted exact durable reservation, per-capture identity-bound quota, atomic common completion expiry/evidence/Audit, concrete pre/post-decrypt Authorization, exact-ref failure recovery and scoped privacy interpretation. Each success/failure/denial path and required real environment is specified |

**Current judgment:** DEC-016/STAGE-010 remains PARTIAL until its original full-wrapper final exit/repeat/reset/reapply/cleanup is confirmed. DEC-017 implementation and all LIFECYCLE cases remain NOT STARTED/NOT RUN. Existing API 764 and prior scoped gates are historical verified evidence, not evidence for the new design. No changes to live test inputs, scripts, source code, DB schema/privileges, OpenAPI or runtime registration; no new tests, PACS writes, deployment or automatic commit/push. Next perform sequence 0→4 in report §15, then the unchanged remaining P0 plan.

**Documentation verification (14:31 KST):** `git diff --check` exited 0 (line-ending warnings only). Read-only PowerShell checks over `git diff --name-only` found exactly 15 changed Markdown documents and zero non-document changes; the DEC-017 Acceptance subsection contains exactly the ordered `001` through `014` cases; every relative Markdown file-link target in changed documents exists (zero broken file links). This checks target files, not all anchor fragments or semantic test coverage. The same process handle remains live; a newly created owned Docker psql subprocess was observed at 14:31:38 without printing command lines/credentials. No whole-wrapper PASS inferred.

## 32. DEC-017 test-first preparation and DEC-016 second-round audit

**Before test changes:** Existing session 77695 emitted a second PACS-007 sentinel followed by a second `pacs001_expiry_runtime=PASS`. No final clean/reset/reapply/exit/cleanup result yet. Reviewed the complete expiry test against CLEAN-001~008: real signed identities/registry/forced RLS and fixed grants, missing/wrong identity denial before discovery, eligible-state/unexpired/Tenant exclusions, stale ref/expiry/service denial, partial physical failure/retry, post-admission identity loss, actual Audit SQL rollback, bounded batches and concurrent one-Audit convergence are asserted. Static module/worker/Docker inspection confirms no expiry provider/scheduler/route registration; source capture still has no store injection. This audit does not substitute for the running wrapper's final evidence.

DEC-017 recommendation/Acceptance were refined **before** adding a separate store unit contract. Only that new `tests/api` file may change during the wait; the running DB integration Dockerfile explicitly copies its database tests, not `tests/api`. Product source, wrapper, existing test inputs and Compose remain untouched. Planned RED contracts: explicit per-package quota with/without constructor fallback, per-package isolation and method snapshots, malformed explicit quota rejection, post-settlement completion TTL, and preserved constructor-only compatibility. Results pending; a RED run cannot be reported as current full API PASS or integrated lifecycle acceptance.

### Actual RED results and regression follow-up

| Command / check | Observed result |
|---|---|
| `node --check tests/api/temporary-imaging-capture-lifecycle.test.mjs`; `npm run build:api` | Both exit 0; unchanged product code builds |
| `npx vitest run tests/api/temporary-imaging-capture-lifecycle.test.mjs --maxWorkers=1` | Initial run: exit 1, **6 FAIL / 1 PASS**, start 14:39:36 KST, 4.02 seconds. Missing explicit adapter, fallback use, three malformed adapter cases and pre-settlement TTL all fail as specified; constructor-only compatibility passes |
| Same focused command after strengthening mutation timing and method receiver assertions | Exit 1, **6 FAIL / 1 PASS**, start 14:40:34 KST, 6.93 seconds. Mutation now occurs immediately after invocation and before awaiting allocation; a copied method must preserve its receiver. No contract is skipped or converted to expected failure |
| `npm run test:api` | Exit 1; **42 files, 762 PASS / 9 FAIL**, start 14:41:18 KST, 39.49 seconds. Six new intended contract failures plus three existing test timeouts: two source-capture cases at unchanged 5 seconds and object-count admission at unchanged 30 seconds. Do not classify the latter as intended or infer a root cause merely from concurrent load |
| `npx vitest run tests/api --maxWorkers=1` | Started only after the prior full suite exited. Exit 1; **41 files PASS / 1 FAIL; 765 tests PASS / 6 FAIL**, start 14:42:55 KST, 65.27 seconds. All original 764 tests plus the new compatibility test pass; only six new contracts remain RED. Same assertions/timeouts, scheduling only changed. No product/test-configuration change |
| `git diff --name-only -- services scripts infra package.json package-lock.json` | Empty: all product/build/Compose/wrapper inputs unchanged |
| Dockerfile `tests/api`/new-test reference search | No match; current DB image uses explicit separate database tests. Existing session 77695 continued with its second payload/runtime/security-regression sentinels |
| New test-owned temporary-root check at 14:43 KST | Zero remaining `mediq-capture-lifecycle-*` roots from these runs. Test hooks first purge their tracked refs, validate exact generated parent/prefix, remove only owned roots and assert absence. A source-test directory observed during the serial suite cannot be labeled a leftover while that suite is live |

The TTL test reproduces a **300,000 ms shorter remaining TTL** after a held five-minute modeled settlement: expiry is currently chosen before awaiting settlement. This is a completed-copy timing defect, not evidence of plaintext exposure or excess retention. The other failures expose unimplemented DEC-017 internal contracts, not a newly changed production path. Current full API status is **FAIL**, not the historical 764 PASS; the new file must stay RED until the corresponding implementation passes the existing gate. No baseline timeout/assertion was relaxed. Store fixture quota is a model; all integrated Authorization/RLS/Orthanc LIFECYCLE requirements remain unaccepted.

**Serial-result interpretation:** The three default-run timeout failures do not recur with one worker and unchanged 5-second/30-second test limits. That supports a scheduling-sensitive test-run risk, not proof of its exact environmental cause or a default-run fix. Retain both attempts; use the serial command for the next deterministic implementation comparison without altering test configuration or masking the six new failures. Original DB wrapper 77695 remains live with second-round Consent/Grant regressions; no final wrapper acceptance yet.

**Subsequent DB observation:** Same session 77695 emitted the remaining second-round Grant/fence/Provenance/Integrity PASS sentinels, `db008_clean_up=PASS product_tables=21 ledger=26 catalog=21|55|17|48`, and `db008_reset=PASS only_owned_ephemeral_compose_resources_removed=true`. Reset-reapply/final exit/final owned cleanup are still required; do not restart or close STAGE-010 from these intermediate messages.

**Local failed-test residue:** After both full API processes exited, read-only checks found no new `mediq-capture-lifecycle-*` roots. The timed-out older source-denial test left `mediq-authorized-source-spool-deny-KPaRxW` in local Temp (created 14:41:32): two synthetic `.enc` files totaling seven bytes, two directories, no reparse entries. No local Vitest process remains. The resolved exact target was checked to be a direct child of Temp before a native PowerShell `Remove-Item -LiteralPath <exact-test-root> -Recurse -Force` attempt, with repeated count/size/extension/reparse/process checks. Execution policy rejected the command before launch. **The directory was not deleted; no alternative deletion method was attempted.** Keep this residue separate from the earlier 313 empty files in §23 and from the active Docker scratch project's automatic cleanup. This is failed test-teardown evidence, not a real-patient incident or proof of product purge. Future timeout-safe test cleanup still needs review; neither repeated red tests nor a serial pass erases this failure record.

## 33. DEC-017 settlement-race preparation and continuing prerequisite verification

**Before changes, 2026-10-03:** User-requested checkpoint `feba379` was committed/pushed and remote HEAD verified; this is concrete previous-turn progress. On continuation at 15:00 KST, the working tree was clean and original session 77695 was still live. The same owned project began its third/reset-reapply integration build and emitted another PACS-007 runtime PASS; no final wrapper exit/cleanup yet. Do not restart it or modify its product/build/database-test inputs.

Source inspection found two unguarded await-boundary conditions in `sealPackage`: concurrent finalization can enter settlement twice, and purge can finish while settlement is held without a subsequent liveness check before a receipt. DEC-017-R1 and Acceptance were written first. Next add deterministic held-settlement tests to the existing isolated lifecycle file and retain real RED failures, while preserving the historical seven-case/full-suite results in §32. No source change or integrated acceptance follows from this preparation; results pending.

### Actual execution

| Command / observation | Actual result |
|---|---|
| `node --check tests/api/temporary-imaging-capture-lifecycle.test.mjs` | Exit 0 before and after the runs |
| `npx vitest run tests/api/temporary-imaging-capture-lifecycle.test.mjs --maxWorkers=1` | Exit 1, **8 FAIL/1 PASS**, start 15:04:15 KST, 2.97 seconds. Original six failures unchanged; both new races reproduce without sleeps/time-dependent assertions |
| `npx vitest run tests/api --maxWorkers=1` | Exit 1, **41 files PASS/1 FAIL; 765 tests PASS/8 FAIL**, start 15:04:47 KST, 62.34 seconds. All original 764 tests plus compatibility pass; only the eight lifecycle contracts fail. Existing rolled-back/ack-lost sequential seal retries pass. No new timeout or assertion weakening |
| Exact new-test root inventory after suite exit, 15:06:31 KST | Zero `mediq-capture-lifecycle-*` directories remain. Each held promise is released/awaited in finally before existing per-fixture cleanup. Earlier failed-test residue from §32 was not touched |
| `git diff --name-only -- services scripts infra package.json package-lock.json` | Empty: current running DB inputs and product code unchanged |
| `git diff --check` | Exit 0, line-ending warnings only |
| Poll original session 77695 | Third `pacs001_expiry_runtime=PASS`, payload runtime and exact 244-column runtime-boundary PASS, then EXC-002/003 PASS observed. Same handle still live; final reset-reapply/policy conformance/exit/owned cleanup not yet confirmed |

The new errors show a primitive receipt-lifecycle defect, not actual deployed transfer or disclosure: no source storage/provider/route is activated. Do not infer a finished source-capture handoff, DB AVAILABLE transition or successful STOW from a model quota receipt. Keep the exact failing contracts; implement the documented per-package quota, post-settlement expiry, single in-flight seal and post-await purge denial only after DEC-016's final gate, then continue durable source/authorization/real Orthanc integration and the original P0 E2E plan. Full API is currently **FAIL**; MEDIQ-PACS-001 remains **PARTIAL**. This goal turn is progress (new deterministic evidence and updated authoritative records), alongside a verified wait, not a blocker or completion.

## 34. DEC-016 final scoped acceptance and DEC-017 implementation opening

**2026-10-03, before product edits:** Original session **77695**, command `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`, owned project **mediq-db008-84a48ffac0f8**, exited **0**. Retain the original failed attempt in §29; no restart was substituted for a slow live process.

- Three `pacs001_expiry_runtime=PASS` rounds, each with signed synthetic OIDC/active SERVICE, Tenant RLS, stale denial, partial retry, concurrent idempotency, ciphertext cleanup and quota/Audit. Existing payload, exact 244 privileges, Exchange/Consent/Grant/fence/Provenance/Integrity regressions passed each round.
- Final observed sentinels: `db008_policy_conformance=PASS`, `db008_reset_reapply=PASS product_tables=21 ledger=26`, `db008_ephemeral_cleanup=PASS`, `db008_schema_validation=PASS scope=scratch_schema_runtime_acceptance_only persistent_mediq_database=NOT_ACCESSED`; clean repeat and owned reset had already passed in §32.
- `db008_prior_schema_regressions=SKIPPED scratch_only=true`: the separate persistent DB-002~007 scripts were deliberately not run. Do not expand the result into a persistent-schema or product E2E acceptance.
- Independent post-exit `docker ps -a`, `docker volume ls` and `docker network ls`, each filtered by the exact owned Compose label, returned **0 containers / 0 volumes / 0 networks** at 15:12:52 KST. Existing `mediq-postgres-1` and `hipass-postgres` remained healthy. Local denied-deletion residue in §32 is separate and still not touched.
- Reviewed the actual expiry integration assertions against CLEAN-001~008: eligible/expired exact graph; no-context/wrong/inactive identity denial; stale ref/expiry/SERVICE denial before physical work; pending/retry after unlink or Audit failure; two-Tenant isolation and quota observer context; one Audit under concurrent retry; bounded batches/immutable selectors (unit complement); no own transaction during filesystem I/O; unchanged package/grants and no scheduler activation.

**Judgment:** STAGE-010 **PASS only for the unregistered DEC-016 internal baseline** represented by product code in `e8e4e47`/`feba379`. Full API remains RED under §33's new contracts, and Ticket remains PARTIAL. This now opens the previously recorded DEC-017 product-source sequence, not a route, active scheduler, STOW or P0 E2E gate. Product implementation/retests below must have their own evidence; never reuse this prior run as proof for later edits.

**Step 1 opened before edits:** Implement the existing DEC-017/R1 recommendation against the nine unchanged contract assertions. Retain the scoped quota port and bound methods per reserved package before awaits; fix completion time after settlement; prevent concurrent seals and post-purge success while preserving sequential settlement retries. Next coordinate the exact metadata expiry and integrate source/real read authorization under the original LIFECYCLE cases. Results pending.

## 35. DEC-017 sequence-1 implementation and unit/regression evidence

**2026-10-03, after §34's confirmed prerequisite exit:** Changed only the encrypted store and temporary metadata repository product code. Reserved packages snapshot their explicit quota methods/receiver before allocation awaits, retain the port per package, and use it for both reserve and settle. Explicit invalid adapters cannot fall back. Seal now settles quota before one validated completion timestamp, rejects overlapping seals before duplicate settlement, and rechecks package liveness/purge after settlement. Sequential retry after rollback/lost acknowledgement remains supported with writes frozen.

The metadata repository adds mandatory-expiry `completeStaging`: validate finite times, remaining expiry in `(0, 30 minutes]`, then atomically set AVAILABLE and exactly that expiry under the existing ref/STAGING/unexpired/CREATED/Tenant/graph predicates. Existing `markAvailable` keeps the old expiry via the shared transition; source integration must use the mandatory new method. Dates are copied before passing to the transaction. No schema, grant, migration or route change. The method is **not yet connected** to actual source capture or the evidence/Audit transaction.

| Command / scope | Actual result |
|---|---|
| `npm run build:api`; `npx vitest run tests/api/temporary-imaging-capture-lifecycle.test.mjs tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs --maxWorkers=1` | Exit 0; **2 files / 30 tests PASS**, start 15:16:22 KST, 4.04 seconds. All nine previously RED/compatibility contracts pass unchanged; original 21 store cases include sequential settlement retries |
| Build, then focused lifecycle/completion-metadata/store/purge/expiry suites with `--maxWorkers=1` | Exit 0; **5 files / 82 tests PASS**, start 15:19:45 KST, 4.46 seconds. Exact command: `npx vitest run tests/api/temporary-imaging-capture-lifecycle.test.mjs tests/api/temporary-payload-completion-metadata.test.mjs tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs tests/api/temporary-payload-purge-coordinator.test.mjs tests/api/temporary-payload-expiry.test.mjs --maxWorkers=1` |
| `npm run test:api` | Build and default full run exit 0; **43 files / 787 tests PASS**, start 15:20:42 KST, 23.37 seconds. No timeout in this attempt; retain earlier timeout and RED evidence, not an asserted root-cause fix |
| `npm run typecheck:api`; `npm run test:dicom-port-contract` | Both exit 0 |
| `node --check tests/api/temporary-payload-completion-metadata.test.mjs` | Exit 0 |

New metadata unit coverage (14 cases) checks one-statement exact expiry/CAS parameter binding, copied dates, older receipt expiry without reset, missing/null/invalid/expired/overlong expiry, invalid clock, non-exact row count, fixed SQL errors and legacy retained-expiry behavior. These tests inspect SQL/parameters through a model transaction: **they do not execute PostgreSQL or prove RLS**, authorization or the source-evidence/Audit atomic commit. The store fixtures use real ciphertext/files with modeled quota, not authenticated database quota.

**Remaining required work:** Real PostgreSQL proof of the new completion transition; durable source reservation and bound authenticated quota injection; shared AVAILABLE/evidence/Audit transaction and failure purge; concrete two-check read Authorization; signed-OIDC/RLS/HTTPS Orthanc integration, updated scratch regressions and all LIFECYCLE/STAGE privacy/no-side-effect gates. The completed §34 run predates these product edits and cannot verify them. Runtime/coordinator/Mandatory Preflight/STOW/reconciliation/destination verification/Viewer/Download/original P0 E2E remain open. Ticket **PARTIAL**; unit green is not DONE. No automatic commit/push.

**Final local verification (15:28:54 KST):** `git diff --check` and both new/extended API test syntax checks exit 0; all relative Markdown file targets in the changed documents exist (zero broken targets, anchors not exhaustively checked). No `mediq-capture-lifecycle-*` roots remain. `git diff --name-only -- scripts infra package.json package-lock.json docs/OPENAPI.yaml` is empty. Product changes are exactly the store and metadata repository; tests are the extended lifecycle file and new completion-metadata file. Plans/Acceptance/Security/Architecture/Data/Threat/decision/report/index records now distinguish completed DEC-016 baseline from partially implemented DEC-017. All test sessions used this turn are terminal; no new DB wrapper was launched. Existing policy-denied residue was not deleted or bypassed. Changes remain uncommitted after user checkpoint `feba379`.

Traceability: LIFECYCLE-002 → `snapshotQuota`/`beginReservedPackage`/package-owned reserve+settle, quota selection/mutation tests (actual authenticated quota still pending); LIFECYCLE-004 → post-settlement timestamp and `completeStaging`, delayed-TTL/expiry parameter tests (actual DB/source transaction pending); LIFECYCLE-005/013 → in-flight seal exclusion/post-purge liveness plus retained rollback/ack-loss sequential retry (whole source saga pending). No complete integrated case is inferred from this mapping.

## 36. DEC-017 source lifecycle wiring

This section describes the sequence-2 checkpoint; subsequent sequence-3 work is recorded in §37.

**Before implementation, 2026-10-03 15:30 KST:** Inspected current dirty worktree, sequence-1 source/metadata, actual source orchestration, Authorization executor, actor context, purge coordinator and existing unit harness. Preserve all previous changes. Previous goal turn is progress (code plus API 787/type/Port evidence), not a blocker. DEC-016 session is terminal; do not poll or restart it. Source still uses primitive begin/purge and lacks transactional completion. Sequence-2 detail and existing LIFECYCLE-001~005/010/013 Acceptance are recorded before edits. Unit harness will model transactional metadata/quota and retain actual AuthorizationEngine plus synthetic bytes; it cannot prove real registry/RLS/Orthanc. Product source and test implementation/results pending.

**First implementation attempt:** Source wiring and build completed. `npx vitest run tests/api/authorized-source-capture.test.mjs --maxWorkers=1` exited 1: **56 PASS/1 FAIL**, start 15:39:03 KST, 2.21 seconds. The existing storage-success fixture used source clock `2026-10-02T00:00:00Z` but the encrypted store used actual wall time, so the newly enforced completion expiry exceeded the source's permitted 30-minute window. Keep the product bound unchanged. Before fixture correction, adopt one shared trusted clock for source/store in the two older storage tests, and retain explicit clock mismatch as a negative case in the extended lifecycle tests. Preserve old byte/digest/denial assertions. This is test-environment alignment, not an allowed retention extension or an erased failure.

### Sequence-2 implementation and user-requested Git checkpoint

The optional `captureForCoordinator` storage path now snapshots issuer/subject, retains one invocation deadline and reauthorizes the same actor/graph/mapping under the Session fence before reserving a fresh STAGING ref. The attempted binding/ref is retained before awaiting SQL; known reservation commit precedes allocation/instance I/O. An explicit immutable quota adapter re-enters the authenticated actor/Tenant context for reserve/settle. Final fresh-authorized completion updates AVAILABLE/receipt expiry before source evidence and success Audit in the same transaction. Post-commit cancellation/deadline prevents a handoff; all failed/uncertain paths use the exact-ref purge saga, including failures before a storage handle returns. Missing identity or cleanup failure retains retryable metadata; no elevated cleanup, primitive fallback or automatic re-fetch is introduced.

Source tests add 27 cases (57 → 84), using real AES-GCM/files and AuthorizationEngine with **modeled DB/registry transactions**. Coverage includes committed reservation before allocation, quota-before-write, immutable principal, original staging deadline versus completion TTL, Consent withdrawal, losing reservation/winner preservation, SQL/rollback/commit-ack loss, allocation/quota/completion/evidence/Audit faults, expiry mismatch, post-commit cancellation/deadline, identity change/loss and retryable purge-admission/physical/Audit failures. Fixture teardown is distinct from product cleanup assertions. No real PostgreSQL, RLS, signed OIDC or Orthanc acceptance is claimed by this suite.

| Command / scope | Actual result |
|---|---|
| `npx vitest run tests/api/authorized-source-capture.test.mjs --maxWorkers=1` after fixture alignment and initial additions | Exit 0; 79 cases PASS, start 15:43:06 KST, 3.95 seconds; five further cases were added before the full runs below |
| `npm run test:api` | Exit 0; 43 files/814 tests PASS, start 15:46:14 KST, 12.49 seconds |
| `npm run test:api` after fixed reservation-failure Audit and assertions | Exit 0; 43 files/814 tests PASS, start 15:48:47 KST, 13.25 seconds |
| User-requested commit checkpoint: `npm run test:api` | Build and tests exit 0; **43 files/814 tests PASS**, start 15:53:37 KST, 11.17 seconds; no product/test edits during this checkpoint |
| Commit checkpoint: `npm run typecheck:api`; then `npm run test:dicom-port-contract` with failure propagation | Both exit 0 |
| Commit checkpoint: `git diff --check`, staged diff check and `node --check` for the three changed API test files | All exit 0 |
| Post-test owned-root inventory | Zero `mediq-source-lifecycle-*` / `mediq-capture-lifecycle-*` roots; prior policy-denied residue was not touched |
| Explicit staging and added-line inspection | 21 text files: 15 documents, 3 source files, 3 test files. No environment file, runtime data, DICOM or build output staged. Bounded high-confidence private-key/token/credential-URL scan found zero matches; this heuristic is not a comprehensive secret/privacy audit |
| `git fetch origin`; `git rev-list --left-right --count HEAD...origin/main` before commit | Exit 0; 0/0 divergence at pre-commit HEAD `feba379`; no force push or history rewrite required |

Traceability: LIFECYCLE-001/003 → fenced exact reservation before physical allocation; LIFECYCLE-002 → principal/actor-bound quota adapter; LIFECYCLE-004 → `completeStaging` plus evidence/Audit transaction; LIFECYCLE-005/010/013 → exact-ref purge and failed/ambiguous commit/identity/deadline cases. These are component/model results only. All full LIFECYCLE cases remain NOT RUN until actual integration evidence exists.

The existing isolated source Orthanc harness has a manually supplied synthetic principal rather than signed-JWT verification and currently omits store injection. Future DEC-017 integration must explicitly add signed identity verification, storage, separate fixture/observer coverage and real RLS without weakening previous tests. The completed DEC-016 DB run predates these edits and cannot validate them. Concrete two-check read authorization, updated DB/Orthanc/privacy regressions, runtime/coordinator/Preflight/STOW/destination verification/Viewer/Download/P0 E2E remain open. **Ticket PARTIAL.** No new DB wrapper was run for this Git request; no schema, grants, migrations, scripts/Compose, OpenAPI or runtime registration changed. Prior RED/timeout/denied-cleanup evidence remains preserved.

## 37. DEC-017-R2 concrete source-bound borrowed consumer

**Before code, 2026-10-03:** Clean main at user-requested verified remote checkpoint `02bfab5`. Previous turn is progress, not a blocker/wait. Inspected the source handoff, scope/mapping/evidence repositories, actual Authorization executor and encrypted borrowed read; DEC-017-R2 recommendation and Acceptance precede changes. No process from the earlier DB run is live/restarted.

Implemented `consumeCapturedInstance` on the existing internal source service. A private WeakMap registers the exact frozen handoff and immutable identity/Patient/scope/mapping only after known commit/deadline validation. Clones, unknown objects, foreign service instances and caller verifier/purpose/operation overrides cannot use it. The binding is provenance, not permission: BOTH store checks independently enter the real AuthorizationGatedOperationExecutor/Session fence with PACS_IMPORT, compare current identity/graph/mapping, and read exact AVAILABLE ref/expiry plus PENDING source evidence. Admission Audit must commit before each phase; filesystem/borrowed callback work remains outside its own transaction. No plaintext return, no change to serialized handoff or ordinary response, no new public route/provider, schema/grant, scheduler, STOW or PACS call.

Initial focused run `npx vitest run tests/api/authorized-source-capture.test.mjs --maxWorkers=1`: **exit 1, 120 PASS / 23 FAIL (143 cases)**, start 16:04:57 KST, 6.90 seconds. The new fixed read Audit actions were missing from AuditEvent's explicit domain allowlist; valid reads failed closed before first admission. Inspected the constructor and existing DB string columns, documented exact event/result/resource/reason rules in DOMAIN-MODEL, then added only the two fixed rules. No wildcard rule, bypass or assertion removal. Keep this failed attempt.

| Command / scope | Actual result |
|---|---|
| `npm run build:api`; focused source suite after Audit rules | Exit 0; **143 tests PASS**, start 16:05:41 KST, 9.09 seconds |
| `npx vitest run tests/api/authorized-source-capture.test.mjs tests/api/audit-event-writer.test.mjs --maxWorkers=1` after additional identity/cancel/expiry/replay cases | Exit 0; **2 files/203 tests PASS**, start 16:06:28 KST, 19.69 seconds |
| `npm run test:api` | Build and regression exit 0; **43 files/893 tests PASS**, start 16:07:03 KST, 32.06 seconds; includes existing store lifetime/concurrency and source regressions |
| `npm run test:api` after moving unknown-handoff rejection before any handoff property access | Build and regression exit 0; **43 files/893 tests PASS**, start 16:10:12 KST, 17.43 seconds; final product snapshot |
| `npm run typecheck:api`; `npm run test:dicom-port-contract` | Both exit 0 |
| `node --check tests/api/authorized-source-capture.test.mjs`; `node --check tests/api/audit-event-writer.test.mjs`; `git diff --check` | All exit 0 |
| Changed-document relative file targets and final root inventory | Zero broken relative file targets (anchors not exhaustively verified); at 16:10:34 KST zero new source/lifecycle test roots. Historical policy-denied residue untouched. All current test sessions terminal |
| `git diff --name-only -- scripts infra package.json package-lock.json docs/OPENAPI.yaml services/api/src/database` | Empty: no schema/grant/migration, build-input, Compose, script or OpenAPI changes. Product edits are source service and exact Audit domain rules only; no commit/push in this turn |

Source coverage is now 158 cases (84 previous + 74 new), with 5 additional Audit denial cases. New cases test exact byte delivery and zero-after-callback; two committed admissions and no delivered/success claim; immutable principal/selectors; missing/forged/copied/cross-service handoffs; both-phase Consent withdrawal, Grant revoke/expiry, inactive/changed actor/Tenant/Hospital, patient/Session/Package/Study/source/destination/state/mapping changes, purge/ref/expiry/evidence changes; SQL/Audit/rollback/ack-loss failures at each phase; ciphertext tamper; cancellation before/between/after final commit, expiry during commit, callback failure, and replay without TTL extension or extra source retrieval.

**Evidence boundary:** These tests use real crypto/files, domain validation, AuthorizationEngine, executor and SQL-producing repositories, but **modeled DB transactions/registry, synthetic non-DICOM byte fixtures and in-process synthetic principals**. They do not prove signed-JWT verification, actual PostgreSQL grants/RLS/query behavior, independent restarted-process cleanup, HTTPS Orthanc or full LIFECYCLE/STAGE acceptance. The cross-service test is a provenance denial test, not proof of process-crash recovery. Source/error Audit is admission/failure evidence, not destination receipt. Future actual source harness must add signed identity verification, store injection, concrete consumer, exact fixtures and independent DB/B-empty observer without dropping prior cases.

Traceability: LIFECYCLE-006/007 → private source binding + two concrete current authorization/graph/mapping/evidence checks; LIFECYCLE-008 → exact object and existing authenticated crypto (one tamper case here, broader crypto matrix retained); LIFECYCLE-009/010 → post-commit liveness, borrowed callback/no return, own-transaction observations and existing LIFE/CONC tests; LIFECYCLE-011 → unchanged serialized handoff and fixed domain Audit rules, not yet full privacy scan; LIFECYCLE-014 → API/type/Port regression only. All full integrated cases remain NOT RUN; **MEDIQ-PACS-001 PARTIAL**. Next sequence 4 is actual signed-OIDC/PostgreSQL/RLS/Orthanc lifecycle/consumer/privacy/no-side-effect proof, followed by runtime/full coordinator/Mandatory Preflight/STOW/reconciliation/destination verification/Viewer/Download/P0 E2E. No automatic commit/push.

## 38. DEC-017 first signed-OIDC/Orthanc lifecycle matrix

**Before changes, 2026-10-03:** Previous goal turn is progress (sequence-3 implementation and 893 API/type/Port evidence). Inspected the dirty worktree and preserved those changes. No earlier test handle remains live. Sequence-4 recommendation, four-case Acceptance and Ticket record were written before fixtures/tests. Full original P0 goal and all remaining LIFECYCLE gates are preserved.

Added shared fixed synthetic selectors (4 cases, 52 distinct valid UUIDs), separate fixture graphs and exact known-case Audit fault triggers. The existing source harness now optionally injects storage and test OIDC config; its 35 existing tests/assertions remain. Four additional cases use actual RS256/JWKS verification, wrong-audience/bad-signature rejection, active actor registry/forced RLS, HTTPS Test Orthanc A, real quota/store/source service, concrete borrowed consumer and purge coordinator. API container keeps mediq_runtime only; separate seeder/observer keep their existing privileged fixture scope. No B credential/network or production route/provider is added. The initial-admission observer now requires the actual start-Audit INSERT and its successful COMMIT, not any earlier observer transaction.

Test coverage targets exact generated DICOM bytes/hash, ciphertext inequality, quota before writes, committed reservation before file allocation, DB/receipt TTL equality, per-phase read admissions, live Grant revoke between checks, capture/read Audit SQL rollback, callback denial, physical absence before purge finalization, idempotent purge and quota release. Independent observer retains old exact assertions and adds scoped metadata/evidence/Audit/quota/identifier/Package checks. Wrapper expects all 39 Node tests and still probes B EMPTY before/after and validates exact owned cleanup. Four cases alone do NOT close the entire integrated Acceptance, concurrency/restart/full privacy or scratch regression gates.

Pre-run checks: four changed/new JavaScript files passed `node --check`; PowerShell parser found zero errors; `git diff --check` passed. Synthetic-selector module contract passed with 4 cases/52 unique valid IDs. Existing mediq API/Orthanc A/B/PostgreSQL and other development containers were healthy in read-only inventory.

**First actual run:** `./scripts/test-int001-source-capture.ps1 -EnvFile .env`, process session **72187**, owned Compose project **mediq-int001-capture-8a89e66dfc09**. At 16:17:18 KST its exact three PostgreSQL/Orthanc containers were healthy and the same process remained live. No terminal result yet. Do not restart on silence or use prior API/DEC-016 results as proof; freeze current source/fixture/test/build inputs until exit. Results/cleanup pending; no PASS claimed.

**First terminal result:** Session 72187 exited **1** before migration/fixtures/tests: `INT001_TEMPORARY_DATABASE_BOOTSTRAP_FAILED (exit=2, sqlstate=)`. The original wrapper did not classify this connection error, so its cause is unproven. `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`; independent exact-label container/volume/network inventories were empty before retry. No new lifecycle case ran. Preserve this failed attempt.

**Post-exit correction/preparation:** Added fixed connection-error categories (DNS/authentication/HBA/database/refused/timeout/closed), without raw psql output or credentials. Static review also found the independent observer must use its pre-existing NOINHERIT quota-owner membership explicitly: use `BEGIN READ ONLY`/`SET LOCAL ROLE mediq_quota_owner`/exact Tenant plus `ROLLBACK`, never widen app grants or give it the inspector URL. DICOM equality assertions now compare Boolean equality to avoid byte dumps on a failed assertion. JS/diff checks passed; test inputs changed only after session 72187 terminated.

**Second actual run:** Same wrapper/arguments, session **95289**, owned project **mediq-int001-capture-af75c65f4b96**, started after the first run's confirmed cleanup. At 16:19:37 KST the three owned services were healthy. A read-only `docker exec <exact-owned-postgres> pg_isready -h 127.0.0.1 -p 5432` reported accepting TCP connections while the wrapper remained live. This is readiness, not password validation or a root-cause finding. Keep the current process and source/build inputs unchanged until terminal result.

**Second terminal result, confirmed during the user-requested Git checkpoint:** Session 95289 exited **0** by 16:25:38 KST. Observed `database_fixture=PASS synthetic_only=true`, `orthanc_a_fixture=PASS synthetic_instances=3`, `authorized_capture_test=PASS tests=39 failed=0`, `audit_and_evidence_observer=PASS`, B `EMPTY` before and after, and `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`. The original 35 tests and four added signed lifecycle cases passed; the independent observer completed its exact lifecycle metadata/evidence/Audit/quota/identifier assertions. At 16:26:00 KST, separate exact-label inventories confirmed **0 containers / 0 volumes / 0 networks** for this project; existing MediQ API/PostgreSQL/Orthanc A/B remained healthy.

**Acceptance boundary:** Scoped PASS for these four generated-DICOM signed-OIDC/PostgreSQL/RLS/HTTPS-Orthanc lifecycle cases, not all LIFECYCLE-001~014. Actual STOW and destination verification were not exercised and operations remain CREATED. Complete integrated concurrency/restart/fault/privacy coverage, post-edit full scratch reset/reapply regression, runtime wiring, coordinator/Mandatory Preflight/dispatch/reconciliation and product P0 E2E remain open. First bootstrap failure and its unproven cause are retained above. MEDIQ-PACS-001 remains **PARTIAL**.

## 39. User-requested source-consumer and integration Git checkpoint

**Scope, 2026-10-03:** User requested committing and pushing the current work. Preserve existing sequence-3 product edits and sequence-4 fixtures/integration/observer changes; do not expand implementation or change test limits. The previously live integration run finished as recorded in §38. Only current evidence/status documentation is being synchronized for this checkpoint.

| Command / observation | Actual result |
|---|---|
| `npm run test:api` | Build succeeded; regression exit **1**, **41 files PASS / 2 FAIL; 891 tests PASS / 2 FAIL**, start 16:24:06 KST, 88.27 seconds. `rejects the 2,001st concurrently staged object` exceeded 30 seconds; `fails closed for loseReadCommitAck at check 2` exceeded 5 seconds. Integration-wrapper tail work overlapped this run; contention is a hypothesis, not a confirmed cause |
| `npm run typecheck:api`; `npm run test:dicom-port-contract` | Both exit 0 |
| `node --check` on six changed/new JavaScript test/fixture/observer files; PowerShell parser on the changed source-capture wrapper | Exit 0; zero PowerShell parse errors |
| `git diff --check`; bounded added-line private-key/token/credential-URL heuristic | Exit 0; zero high-confidence matches. This is not a comprehensive security/privacy audit |
| `git fetch origin`; `git rev-list --left-right --count HEAD...origin/main` | Exit 0; pre-commit divergence 0/0 at `02bfab5`. No force push or history rewrite needed |

The failed parallel regression is not hidden by the earlier 893-test passes. An unchanged-limit single-worker rerun (`npx vitest run tests/api --maxWorkers=1`) began only after both the failed API process and integration wrapper had terminated. Its result and final staging checks are recorded below; no PASS is inferred before exit. Historical policy-denied Temp residue remains outside this Git task and is not deleted or committed.

**Serial terminal result:** Session 8618 exited **0**; **43 files / 893 tests PASS**, start 16:25:50 KST, 31.70 seconds. No product/test edits, assertion weakening, skips or timeout increases between the two runs. This shows the two timeouts did not recur in this serial attempt; it does not prove the parallel cause or a default-run fix. Ticket remains PARTIAL.

**Post-test read-only inventory, 16:26:32 KST:** No new `mediq-source-lifecycle-*` or `mediq-capture-lifecycle-*` roots. Historical `mediq-authorized-source-spool-deny-KPaRxW` (2 files/7 bytes) and `mediq-temp-imaging-6SohzY` (313 empty files) remain. The checkpoint's failed parallel run also left `mediq-authorized-source-spool-deny-ZkWsuG` (3 synthetic ciphertext files/12 bytes) and `mediq-temp-imaging-s7rgWi` (345 empty files). These are local failed-test teardown residue, not product purge acceptance or real patient data. No deletion/bypass was attempted in this Git task; no Temp/runtime data is included in the commit. Timeout-safe teardown/reproducibility remains a follow-up risk.

**Explicit staging check:** 24 intended text files only (14 documents, 3 scripts, API Dockerfile, 2 product-source files, 2 API tests, one integration test and one synthetic-selector source module). `git diff --cached --check` exited 0. No environment file, runtime/build output, DICOM/ciphertext, key/certificate or binary artifact staged. Bounded staged added-line private-key/token/credential-URL scan found zero high-confidence matches; this heuristic is not an exhaustive audit. Current report/index/schedule/plan/Acceptance distinguish the four-case scoped integration result, serial regression pass, parallel timeout risk and remaining full P0 gates. No additional implementation change was made for the Git request.

## 40. DEC-017-R3 actual fault, denial, concurrency and replay matrix

**Before changes, 2026-10-03:** Starting main `38ce204` is clean; user-requested commit/push and actual §38 results are previous-turn progress. Earlier processes are terminal; do not reuse prior evidence for changed tests. Inspected approved P0 requirements, current LIFECYCLE-001~014 and actual source/metadata/Consent/store/test/observer implementations. R3 recommendation/Acceptance/report precede eleven extra independent cases in the existing isolated runner. Retain all earlier failures and local residue. No product implementation, schema/grant/runtime activation, real PHI or STOW is authorized by the test extension. Actual results pending.

**Construction and pre-run checks:** Shared selector fixture now contains 15 scenarios / 195 distinct valid UUIDs, verified by an executable module assertion. Three modified JS scripts/test files pass `node --check`; PowerShell wrapper parser has zero errors; `git diff --check` passes. Added only a synthetic hospital-less patient actor to the separate seed, an exact source-evidence fault trigger target, and the planned cases/independent observer expectations. Existing 39 cases and assertions are retained; one known-fixture exact-read helper is shared without removing byte/hash/zeroing assertions. The stream-write fault allows the prefetch monitor to reach EOF or cancellation, but requires exactly one source instance opened, no subsequent instance, no dangling stream, no handoff and full failure cleanup. No product/API/grant/Compose/Dockerfile change.

**Actual run opened:** `./scripts/test-int001-source-capture.ps1 -EnvFile .env`, session **92759**, started 16:32:43 KST, exact owned Compose project **mediq-int001-capture-03c1a6e6f2e7**. Three services became healthy; same handle remains live. Keep current seed/test/observer/source/build inputs fixed until terminal result. Existing development stack was healthy before the run. No parallel API workload is launched; all terminal results and exact cleanup must be recorded before scoped acceptance.

**First R3 terminal result:** Session 92759 exited **1**, confirmed 16:40:00 KST. DB synthetic fixture and A's three synthetic instances passed; B was EMPTY before tests. Wrapper reported failures in `read_revoked`, `read_audit_failure` and `ciphertext_truncated` plus the containing suite. Two are previously passing cases. The existing sanitized wrapper revealed no underlying query/error stage, so no product/root-cause conclusion is supported. Independent final observer and B-after gate were not reached. `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`; exact owned resource inventories are checked before any retry. Retain this failed attempt; R3 remains unaccepted.

**Post-terminal diagnostic refinement:** Add only bounded case name, fixed error class/code, originating test line and existing sanitized query-failure categories to lifecycle test failures. Never print assertions' object/byte values, patient selectors, JWT/JWK/private keys, paths, SQL parameters or credentials. Inputs are editable only after the confirmed terminal result. Assertions, timeout values and failure behavior remain unchanged; this refinement enables evidence-based correction instead of guessing from the failed test names.

**R3 diagnostic rerun:** Exact first-run label inventories returned zero containers/volumes/networks before retry. Diagnostic-only test edit passed syntax/diff checks. Same wrapper/arguments started 16:41:19 KST as session **96408**, owned project **mediq-int001-capture-e8452f937c93**; at 16:42:34 KST all three owned services were healthy and the same handle remained live. No product/assertion/timeout change, restart-on-silence or parallel API load. Await its terminal result; neither healthy containers nor earlier passing tests constitute R3 acceptance.

**Documentation reconciliation:** Requirements, security, data flow/model, DICOM profile and threat-model execution notes no longer incorrectly describe all actual integration as NOT RUN after §38. They now refer to this Ticket's centralized evidence for limited verified scope, failures and open full gates. Retention, source-of-record, privacy, exact grants and all normative Acceptance requirements are unchanged; R3 remains pending/failed until its own result is known.

**Diagnostic rerun terminal:** Session 96408 exited **1** before migration/fixtures/tests: `INT001_TEMPORARY_DATABASE_BOOTSTRAP_FAILED`, exit 2, `connection_class=CONNECTION_REFUSED`. Cleanup/existing-stack preservation passed; exact-label container/volume/network inventories were empty at 16:43:35 KST. No lifecycle case ran, so the first R3 failures remain unexplained. Compose health is local-socket pg_isready, not the same authenticated TCP client path. R3-A recommendation/Acceptance now require a separate bounded read-only TCP readiness probe before single-attempt role DDL; no retry of writes or weaker runtime/test timeout. Inspect the pinned image entrypoint to distinguish demonstrated readiness behavior from an inferred cause.

**Readiness correction evidence:** Read-only inspection of `/usr/local/bin/docker-entrypoint.sh` from the existing pinned PostgreSQL 18.6 image showed its temporary initialization server sets `listen_addresses=''` and stops before normal startup; no TCP readiness follows from the existing host-less pg_isready check. The observed refusal is consistent with this readiness gap, but no original failed-container snapshot proves its exact startup phase. Added SELECT-only TCP readiness before role DDL, 30-attempt bound, two-second spacing, three-second libpq connection timeout, and retries only for classified transient connection failures. No DDL/test retry, global Compose/runtime policy change or credential output. `./tests/scripts/int001-database-readiness.test.ps1` exited 0 at 16:45:25 KST: **10 cases PASS**, fake-only/no network, exact SELECT scope, three transient recoveries, five non-transient immediate failures, first-attempt success and bounded exhaustion. JS syntax and diff checks pass. No lifecycle assertion or timeout changed.

**Third R3 run opened:** Same wrapper/arguments, session **29609**, started 16:45:43 KST, exact owned project **mediq-int001-capture-b6f1de7650e6**. At 16:47:03 KST the runner emitted `temporary_database_tcp_readiness=PASS attempts=2`: the first allowed transient probe failed and the next authenticated SELECT succeeded. Bootstrap remains a single write attempt after readiness. This confirms the new readiness path actually recovered a transient connection condition, not that all bootstrap or lifecycle failures are fixed. Keep this handle and frozen execution inputs; terminal integration/observer/B/cleanup results remain pending.

**Third R3 terminal result, 16:52:22 KST:** Session 29609 exited **0**. All **50 Node tests PASS**, independent Audit/evidence observer PASS, B EMPTY before/after, and `temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED`. The independent observer's 15 lifecycle graphs verified exactly 16 purge Audits (two only for authorized re-fetch), zero remaining quota reservations/package quota, unchanged approved UID/PatientMapping/Package/siblings, actual Consent withdrawal and unchanged CREATED operation state/no STOW. New exact-byte/ciphertext-fault/concurrent-winner/replay assertions all passed without weakening assertions, skipping tests or extending their limits. Physical absence was checked before product purge finalization; fixture teardown did not substitute for product purge. Independent exact-label resource counts and existing-stack health were checked after exit.

**Failure interpretation and scope:** The three first-run lifecycle failures did not recur; no diagnostic case/query failure marker was emitted on the passing run. Their exact cause remains unproven, and the TCP readiness correction cannot be claimed to fix already-running lifecycle cases. Preserve both failed attempts and this pass. R3 has scoped positive evidence for its eleven additions plus the original four cases, not full LIFECYCLE acceptance or a general stability/parallel-timeout fix. Full mapping/actor mutation, independent source-process restart, complete privacy projection/value scan, updated scratch clean/repeat/reset/reapply, runtime/coordinator/Preflight/STOW/destination verification/P0 E2E remain open. Prior Temp residue is untouched. Current source/DB grants/schema/Compose/runtime/OpenAPI have no changes. Full API/type/Port regression is now run serially after the integration wrapper's confirmed exit.

**Post-integration checks:** Independent exact-label inventory at 16:52:56 KST: zero containers/volumes/networks; existing MediQ API/PostgreSQL/Orthanc A/B healthy. Session 70826 ran `npm run build:api`, `npx vitest run tests/api --maxWorkers=1`, `npm run typecheck:api`, and `npm run test:dicom-port-contract` sequentially with failure propagation; final exit **0**. API **43 files/893 tests PASS**, start 16:53:04 KST, 32.66 seconds; type/Port also PASS. No parallel API rerun or timeout relaxation. Changed-document relative file link check found zero missing targets in ten documents (anchors not exhaustively checked); diff checks pass. No new product/source or build dependency changes and no commit/push in this continuation.

## 41. Post-DEC-017 full scratch-schema regression

**Before execution, 2026-10-03:** LIFECYCLE-014 requires current scratch clean/repeat/reset/reapply, not reuse of pre-DEC-017 evidence §34. After the R3 integration wrapper and serial API/type/Port processes have both exited, run the existing unmodified `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`. Reviewed its fresh random project, owner-label checks before each reset/removal, zero-resource check, three integration rounds and final cleanup. ScratchOnly skips persistent DB-002~007 scripts; do not claim persistent database acceptance. No production/PACS write, existing stack reset, new schema/grants or code change is part of this run. Keep current source/database-test/Docker/build inputs fixed while its specific handle is live. Full lifecycle/privacy/process-restart and the original P0 E2E remain separate requirements regardless of this regression result. Actual process/results pending.

**Actual run opened:** Session **6711**, started 16:54:18 KST, owned Compose project **mediq-db008-9d749e984b73**. At 16:55:45 KST its exact PostgreSQL container was healthy and the same handle emitted `db008_scratch_postgres=PASS role_bootstrap=PASS`. Migration/integration rounds, repeat/reset/reapply, final exit and owned cleanup are still pending. This is a verified live run; do not restart on quiet output or mark this gate PASS. Continue with the same handle and preserve its inputs.

**Latest checkpoint, 16:56:56 KST:** Same session 6711 is confirmed live, no terminal result. Current-input diff confirms product source, schema/runtime Compose, API Dockerfile/dependencies and OpenAPI unchanged in this continuation. All fourteen changed documents have valid relative file targets (anchors not exhaustive); `git diff --check` and repeated ten-case readiness tests pass. The completed local API rerun left no new source/lifecycle test roots; only the four previously recorded Temp residue directories remain, untouched. This local inventory is not cleanup proof for the still-running DB scratch project. R3 implementation/report/index/plan/schedule/normative execution notes are synchronized with the actual scoped pass and retained failures. No commit/push; goal and Ticket remain active/PARTIAL.

**Terminal update for the preceding §41 run, confirmed 17:23:38 KST:** Session **6711** exited **1** in the first clean-schema round's GRT-003/004 signed HTTP/PostgreSQL suite: **12 PASS / 2 FAIL** including the containing suite. The failing child case was `Audit or Scope persistence failure rolls back all Grant rows`, stage `ROLLBACK`, fixed `ACTOR_TENANT_CONTEXT_UNAVAILABLE`. No SQLSTATE or inner connection/query stage was available; the cause is unproven. Later first-round checks, repeat and reset/reapply were not reached; no full-regression PASS. Independent exact-label inventory immediately after exit found **0 containers / 0 volumes / 0 networks** for `mediq-db008-9d749e984b73`; existing MediQ API/PostgreSQL/Orthanc A/B were healthy. Preserve this failure and do not restart merely to seek a pass. Inspect the failed case and add bounded diagnostic evidence if needed. With this handle terminal and owned resources absent, the separate R4 source test can run without overlapping heavy DB work; its result cannot substitute for the failed full DB gate.

## 42. User-requested R3 Git checkpoint

**Scope, 2026-10-03:** The user explicitly requested committing and pushing the current state. Preserve R3 lifecycle tests, the isolated TCP-readiness correction and their decision/Acceptance/implementation records. No new product implementation, schema/grant, runtime activation, STOW or cleanup operation is part of this Git task. Ticket remains **PARTIAL**; the prior failed attempts and unproven causes remain in §§39–40.

**Checks repeated for this checkpoint:** `git diff --check`, `node --check` on the four changed JavaScript files, and `./tests/scripts/int001-database-readiness.test.ps1` all exited 0; readiness reported **10 cases PASS** with no network calls. The completed 50-test integration, independent observer/B EMPTY/cleanup and serial 893-test API/type/Port results are retained as earlier execution evidence (§40), not claimed as newly rerun here. No competing heavy test workload was started. `git fetch origin` succeeded and `git rev-list --left-right --count HEAD...origin/main` reported **0/0** at `38ce204`; no history rewrite is needed.

**Publication boundary:** Review covers 20 intended text files (14 documents, three scripts, the shared synthetic-selector module, one integration test and one new PowerShell unit-test file). No environment file, generated DICOM/ciphertext, local Temp residue, build output or key/certificate is included. A bounded credential-pattern review flagged one existing synthetic unavailable-database URL pointing to loopback port 1; it is a deliberate connection-failure fixture, not an operational credential. No other private-key/token/credential-URL match was found in this review. This heuristic is not a comprehensive security/privacy audit.

**Pending execution preserved:** The same DB-008 ScratchOnly process, session **6711** / project **mediq-db008-9d749e984b73**, is still live at the pre-commit check; no terminal result or final cleanup acceptance is available. Its execution inputs are not changed by this checkpoint. Committing this snapshot does not turn that gate or the remaining full lifecycle/runtime/Preflight/STOW/P0 E2E gates into PASS. Final staged validation and remote synchronization are reported in the user-facing Git result.

## 43. DEC-017-R4 independent replica recovery verification

**Before implementation, 2026-10-03:** Verified clean starting `65084e0`; prior user-requested checkpoint successfully committed/pushed R3. The existing DB session 6711 is still live and now emitted the PACS-007 runtime/idempotency/unknown-no-retry/RLS PASS marker; remaining rounds, terminal exit and cleanup are unproven. Continue polling the same handle. Source/DB tests/Dockerfile/Compose/dependencies are unchanged; the source integration fixture/test/observer/wrapper are only copied by a different Docker target, so preparing them does not alter this DB run's inputs. No second heavy test is started while that run is live.

R4 recommendation and success/denial/failure/cleanup Acceptance precede code. Add one independent Node replica over the actual signed source-capture path, explicitly distinguishing product handoff provenance rejection from a real-authorized primitive RECOVERY_REQUIRED result. Never transfer DEK/private signing keys/plaintext; child IPC and diagnostics are bounded and ephemeral. Keep the original process alive and label evidence as replica behavior, not original-process death. Exact-ref authorized purge, fixed parent read denial, independent Audit/quota/identifier/B observer and final cleanup remain mandatory. Construction and actual execution results pending; no new PASS claimed.

**Construction checkpoint:** Source fixture now has 16 scenarios/208 distinct valid synthetic UUIDs; executable fixture assertion, modified JS syntax checks, ten readiness checks and diff check pass. Parent/child share no DEK/private key/plaintext; a child mode in the already-copied integration module avoids changing Docker build inputs. Actual R4 suite is NOT RUN while DB session 6711 is active. That session has now emitted expiry-service, temporary-metadata/purge, DB access-boundary, Exchange repository and creation markers; these are intermediate results only. Before adding a lightweight runner unit file, Acceptance now explicitly covers fake close/error/timeout/output-bound behavior using the actual runner AST; no network, real subprocess or second heavy workload is involved. This also guards sanitized diagnostics and awaiting child close before parent cleanup.

**Runner verification:** `node --test tests/scripts/int001-replica-protocol.test.mjs` first exited 0 with ten cases. Review then identified that a parent test timeout must also abort its owned child even when the child's own timer has not expired. Acceptance was extended before wiring the Node test's AbortSignal into the runner and adding pre-abort/live-abort checks; the success case also verifies abort-listener removal. At **17:20:31 KST** the same command exited **0**, **12 tests PASS / 0 FAIL**, no skips/cancellation, 985 ms. It executes the actual runner function obtained from its AST with fake child events/streams/timers, not a copy; no real subprocess/network/PACS/DB action. Raw stdout/stderr/error suppression, bounded input/output, timeout/cancellation ownership, close-before-teardown and fixed error markers are covered. This is not actual replica recovery acceptance.

**Current execution limit:** The expanded **51-test** source wrapper is prepared but **NOT RUN**. Its expected independent observer is 16 scenarios/17 purge Audits; those are required future assertions, not observed results. Prior 50/893 successes remain historical baseline evidence (§40). DB session 6711 is still live and has additionally emitted Consent persistence/request/approval/withdrawal PASS markers; full clean/repeat/reset/reapply and owned cleanup are still pending. No product source, DB test/helper, schema, Dockerfile, Compose or dependency file changed, no heavy parallel run, and no automatic commit/push. Continue this exact DB handle; after its terminal result and owned-resource check, run the revised source wrapper and record failures/results before any R4 PASS.

**Actual R4 execution and terminal result (supersedes preparation above):** After session 6711's failure/zero-resource confirmation, ran `./scripts/test-int001-source-capture.ps1 -EnvFile .env`, session **11645**, owned project **mediq-int001-capture-a224593d3157**, approximately 17:25 KST. Authenticated TCP readiness passed in one attempt; B was EMPTY, database fixture synthetic-only and A contained the three generated instances. Session 11645 exited **0**, confirmed 17:34 KST: **51 tests PASS / 0 FAIL**, independent Audit/evidence observer PASS, B EMPTY after, cleanup PASS/existing stack UNCHANGED. At **17:35:30 KST**, independent exact-label inventory confirmed **0 containers / 0 volumes / 0 networks**; existing API/PostgreSQL/Orthanc A/B healthy.

The new replica case ran in a distinct Node PID with actual JWT/JWKS verification and current registry/AuthorizationEngine/Consent/Grant/RLS. Its fresh source service rejected the serialized handoff; a separate primitive probe completed real authorization then failed specifically with RECOVERY_REQUIRED and zero callbacks. Missing/wrong-identity purge made no physical effect or metadata/ciphertext change. Exact-ref PROCESS_RESTART purge checked physical absence before finalization and idempotent repeat; the original parent's formerly working handoff subsequently denied without more A reads. Observer verified the 16 lifecycle graphs, exactly 17 purge Audits, zero quota, unchanged approved identifiers/siblings/Package and CREATED operations. No STOW/destination verification occurred. This is scoped replica evidence, not killed-origin/host-crash evidence, exhaustive privacy/mapping/actor mutation, full lifecycle/P0 or acceptance of the failed DB regression.

**Separate failed-DB follow-up:** After §41 became terminal, GRT-003-DEC-002/DIAG-001~004 were documented before modifying only the shared DB test proxy/rollback substep diagnostics, guaranteed fault-app close, and the DB wrapper's bounded marker projection. No live R4 input or product/schema/build/dependency changed. `node --test tests/scripts/grant-db-diagnostics.test.mjs`: **15 PASS / 0 FAIL**, exit 0 at **17:34:25 KST**; test-file JS syntax, DB-wrapper PowerShell parse and diff checks PASS. Fixed classification, argument/timeout forwarding, original error identity and all five injected-fault modes are verified with fakes; no DB cause is inferred. GRT-003 and GRT-004 have separate updated implementation/evidence records. Actual diagnostic DB rerun awaits completion of the post-R4 serial API/type/Port run (session 35893); no concurrent heavy execution or widened timeout.

**Post-R4 serial regression terminal:** Session **35893** exited **0** after sequential `npm run build:api`, `npx vitest run tests/api --maxWorkers=1`, `npm run typecheck:api`, and `npm run test:dicom-port-contract`. API **43 files/893 PASS**, start **17:35:38 KST**, 33.84 seconds; type/Port PASS. R4/DB suite did not overlap this workload. No timeout, assertion, product code, privilege or dependency change. A current diagnostic DB run can now proceed; its prior failure is not erased by this API result.

## 44. Current full DB regression diagnostic rerun

**Before execution, 2026-10-03:** The original DB session 6711, R4 source session 11645 and serial API session 35893 are all confirmed terminal; both owned scratch projects have zero resources and the existing stack is healthy. GRT-003-DEC-002 diagnostic-only edits passed 15 unit checks/JS syntax/PowerShell parse/diff checks. Repeat the existing `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly` with the added fixed inner failure markers, unchanged assertions/timeouts and three complete integration rounds. This is an evidence-seeking rerun after diagnostic improvement, not automatic retry of DDL or a claim that the earlier cause is fixed. Freeze its current source, DB tests/helpers, wrapper and Docker/Compose/dependency inputs until terminal result. It excludes persistent DB-002~007 tests and cannot prove production/E2E. Final exit and exact owned cleanup are mandatory; actual result pending.

**Actual run opened:** Session **51950**, owned project **mediq-db008-181f3dd33ac9**, started approximately **17:37 KST**. At 17:39:09 KST its exact PostgreSQL container was healthy; the same handle subsequently emitted `db008_scratch_postgres=PASS role_bootstrap=PASS`. No terminal result, full-round acceptance or cleanup result yet. Keep this exact handle; do not restart on quiet output. Current reports/index/plan/schedule/Acceptance distinguish the completed 51-test R4 slice from the failed earlier DB run and this pending diagnostic rerun. Goal remains active and Tickets PARTIAL; no automatic commit/push.

**Latest checkpoint, 17:43:30 KST:** Same session 51950 is confirmed live with no terminal result. Diff checks and relative-file-link checks on all eleven changed Markdown documents pass (anchors not exhaustively checked). Product source, API Dockerfile, Compose and package/dependency files have no changes; the current DB run's test/wrapper inputs have not been edited after launch. Read-only local Temp inspection found only the four earlier recorded residues (two small synthetic-ciphertext directories and two empty-file directories), no new source/lifecycle roots; no deletion attempted. Git changes are the recorded test/diagnostic/docs work, uncommitted. The next action is to follow this exact diagnostic DB run, use any fixed inner error evidence if it fails, then complete the remaining actual mapping/actor/privacy/lifecycle gates before runtime/Preflight/STOW/E2E. The original A→MediQ→B success condition is unchanged and not achieved.

## 45. DEC-017-R5 live privacy projections

**Before changes (2026-10-03):** Previous turn is progress: actual R4 51-test/independent observer/B/cleanup proof, serial API 893/type/Port, runner protocol 12 and Grant diagnostic 15 tests. Existing dirty work belongs to those recorded changes and is preserved. DB session 51950 is live and has emitted PACS-007 runtime PASS; no full result yet. Read-only inspection finds the current source observer checks quota only after purge and selects only part of each lifecycle evidence/Audit row. It therefore cannot establish the full transient-value LIFECYCLE-011 claim.

R5 recommendation and Acceptance precede implementation: separate read-only fixture observer process on the owned database network, per-run bounded fixed protocol, no published port, no runtime privileged URL/grant or new schema. Inspect committed live values and strict projections, compare approved baseline identifiers unchanged, and require a complete in-memory phase ledger plus the existing final observer/B/cleanup gates. Preserve all 51 cases and live DB inputs; only files copied by the distinct source-test target and records may change now. No parallel heavy test, actual PHI or new product API. Tests/results pending; no privacy PASS claimed.

**First R5 unit run:** `node --test tests/scripts/int001-privacy-observer.test.mjs` exited 1: **60 PASS / 1 FAIL**. The failed protocol assertion compared HTTP status 503 with the fixed JSON body diagnostic `DEC017_PRIVACY_PROTOCOL`: the fake reply merged both into a property named `code`, overwriting the status with the body code. This is an observed test-harness naming collision, not a failure to reject the malformed request. Before correction, retain this result and separate `httpStatus` from the unchanged body `code`; keep all rejection assertions. Extend positive complete-ledger and read-only snapshot transaction/rollback tests. Actual R5 integration remains NOT RUN. Live DB session 51950 has now passed its first GRT-003/004 segment (14-case combined gate), fences/provenance/integrity and policy-conformance markers; no final three-round/cleanup acceptance or explanation of the earlier failure follows.

**R5 construction and unit checkpoint:** The source-test wrapper now starts a separate, unpublished read-only fixture observer with a per-run random token; the API test receives no privileged database URL. Fixed scenario/phase probes inspect committed temporary metadata, quota, integrity and Audit values at RESERVED/QUOTA/AVAILABLE/READ_RESULT/PHYSICAL_ABSENT/FINAL. Exact column/value projections and approved identifier comparisons are enforced; ordinary capture results/errors retain their approved projections. Existing 51 source cases, final independent observer, B-empty checks and owned cleanup remain required. The server's protocol and transaction tests use fake listeners/clients and do not establish actual network, PostgreSQL or Orthanc acceptance.

After the mock status-field correction, `node --test --test-reporter=dot tests/scripts/int001-privacy-observer.test.mjs` exited **0**, **64 PASS**, at **18:09:31 KST**. At **18:10:41 KST**, `node --test tests/scripts/int001-privacy-observer.test.mjs tests/scripts/int001-replica-protocol.test.mjs tests/scripts/grant-db-diagnostics.test.mjs` exited **0**, **91 PASS / 0 FAIL** (64 privacy + 12 replica protocol + 15 Grant diagnostics). Readiness checks: **10 PASS**; modified JS and wrapper syntax/diff checks passed. Earlier failed unit evidence is retained. Actual R5 integration remains **NOT RUN** while DB session 51950 is live. Full raw-log privacy, platform/crash exposure, mapping/actor mutation and original lifecycle/runtime/Preflight/STOW/P0 gates remain unaccepted.

## 46. User-requested Git checkpoint — 2026-10-03

The user explicitly requested commit and push of the current state. Preserve the R4 verified slice, GRT diagnostic changes and R5 test-only preparation as a **PARTIAL checkpoint**, not a release or full Acceptance. Product source, schema/grants/migrations, Dockerfile/Compose/dependencies, OpenAPI, runtime registration and destination writes are unchanged. No new feature work or heavy integration run is part of this checkpoint.

At **18:16:21 KST**, sequential checkpoint checks exited **0**:

- `node --test --test-reporter=dot tests/scripts/int001-privacy-observer.test.mjs tests/scripts/int001-replica-protocol.test.mjs tests/scripts/grant-db-diagnostics.test.mjs`: **91 tests PASS**.
- `./tests/scripts/int001-database-readiness.test.ps1`: **10 cases PASS**, no network/database mutation.
- PowerShell parser: both changed wrappers, zero syntax errors; `node --check`: all seven changed/new JavaScript test/observer files passed.
- `git diff --check`: passed. `git fetch origin` and `git rev-list --left-right --count HEAD...origin/main`: **0/0** divergence at pre-commit `65084e0`.

The same DB session **51950** / **mediq-db008-181f3dd33ac9** remains live at this checkpoint. Its first full assertion round passed, and the repeated round has emitted Consent approval/withdrawal and Grant persistence markers; final wrapper exit, reset/reapply and cleanup are still pending. Its inputs remain frozen. No current DB PASS, earlier-failure root cause or actual R5 privacy PASS is inferred. Git publishing does not terminate that run or complete the product goal. Stage only reviewed source-text tests/scripts and documents; keep local configuration, secrets, generated DICOM, test data and build/runtime artifacts excluded.

**Pre-commit staging check:** Exactly **20 reviewed text files** staged (11 documents, 3 scripts, 6 test/fixture files). No environment, key/certificate, DICOM, log, generated data or build artifact path staged. Added-line high-confidence private-key/token/credential-URL pattern scan: **0 matches**; in-memory comparison against **7 local sensitive configuration values** of at least eight characters: **0 matches**. No secret values were printed or stored in evidence. These bounded heuristics are not a comprehensive secret/privacy audit and do not replace R5 actual integration. Staged diff check passed; no force push or history rewrite is authorized or needed.
