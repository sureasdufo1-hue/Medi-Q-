# MEDIQ-INT-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-INT-001` |
| 제목 | Bounded source integrity and authorized synthetic source-capture sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 상태 | `PARTIAL` |

## 1. 목표

Synthetic/Test DICOM 인스턴스의 정확한 바이트를 study-sized 메모리 버퍼 없이 해시하는 내부 primitive, operation-bound `SOURCE_CAPTURE/PENDING` persistence, 그리고 별도 결정으로 승인된 internal synthetic/Test-only authorized source-capture sub-gate를 구현·검증한다. `CAP-014`는 격리된 PostgreSQL/RLS와 Test Orthanc A/B에서 source effect boundary만 검증한다. 이는 full `REQ-INT-001` 또는 P0 Source→MediQ→Destination 검증 완료를 뜻하지 않는다.

## 2. 범위

### 포함

- `SHA256-MANIFEST-V1` canonical manifest builder 및 고정 known vector
- Sequential lazy single-instance stream hashing; per-instance SHA-256은 내부 계산만 수행
- UID·개수·media type·response UID·Content-Length·empty/truncated/error/abort validation
- 고정 P0 ceiling 2,000 objects / 64 MiB per object / 2 GiB aggregate; 호출자가 낮출 수 있지만 높일 수 없음
- 범위·실패 경로별 Unit Acceptance 및 구현/요구사항 문서 동기화
- `integrity_evidence.operation_id` binding, fixed source-capture CHECK/partial UNIQUE, internal pending-only repository
- Exact permanent runtime grants and disposable DB-008 PostgreSQL/RLS Acceptance; separate CAP-014 isolated live source-capture Acceptance

### 제외

- Public HTTP/OpenAPI route, Viewer/Download, PACS import coordinator, STOW, destination verification, retry/reconciliation
- 제품용 Source→Destination Integrity PASS 또는 transfer completion gate

최초 foundation 범위에서 제외했던 내부 synthetic/Test-only source-capture는 `INT-001-DEC-003`와 CAP-014 추천·Acceptance 기록 후 별도 구현·검증했다. 해당 추가 범위와 한계는 §13에 기록한다.

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-INT-001` | hash, pending persistence, and narrowly scoped authorized source-capture sub-gates | `TC-INT-001-HASH-001~008`, `TC-INT-001-DB-001~010`, `TC-INT-001-CAP-001~014` |
| 보안 | `SEC-INT-001~002`; `AGENTS.md` §§4–6 | hash result is not Authorization; failed/incomplete input yields no manifest | Unit Acceptance; no route/STOW |
| 도메인 | `INV-INT-001~004` | Bit-preserving intent and failed evidence must not be success | algorithm spec in decision/profile; completion not implemented |
| Decision | `INT-001-DEC-001~003`, `PDEC-001` | canonical frame, bounded streaming, operation binding, synthetic authorized source capture | Policy log + Acceptance before implementation |

## 4. 구현 결과

`services/api/src/integrity/application/source-integrity-manifest.builder.ts` exports `buildSourceIntegrityManifest`. It validates the declared manifest and unique DICOM UIDs before opening any stream, sorts by ASCII UID, consumes one lazy `application/dicom` stream at a time, checks actual length and configured lower-only bounds, and computes one SHA-256 digest for each exact byte stream. It then hashes the domain separator, object count, and framed UID/length/per-object digest tuples. It returns only algorithm, aggregate digest, object count and total bytes; errors carry a fixed code and generic message.

`tests/api/source-integrity-manifest.test.mjs` covers known-vector determinism, order invariance, mutations, negative metadata, limits, stream failures and abort cancellation. The module has no concrete Gateway/DB/HTTP dependency and is not registered in a product route/provider.

`services/api/src/integrity/persistence/postgres-source-integrity-evidence.repository.ts` writes the manifest as an immutable `SOURCE_CAPTURE/PENDING` row only when the persisted PACS operation is Tenant-visible and `CREATED`. It derives Session, Package and Study from the operation graph, creates no destination result or verified timestamp, returns the same row for exact replay, and rejects changed digest/count without update. Migration `0021_source_integrity_operation_binding.sql` adds a nullable operation FK (`RESTRICT`), a partial operation/stage unique index, and a source-only binding CHECK.

The later `INT-001-DEC-003` sub-gate adds an internal-only authorized source-capture service; it resolves scope and checks the Session fence, Consent/Grant-backed `PACS_IMPORT`, PatientMapping and source PatientID before configured Test Hospital A WADO, then stores bounded pending evidence and fixed Audit outcomes. CAP-014 verifies this service only in disposable synthetic PostgreSQL/Test Orthanc; it does not add a product route or destination import flow.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/integrity/application/source-integrity-manifest.builder.ts` | Internal canonical streaming hash primitive and hard ceilings |
| `services/api/src/identity/application/actor-tenant-context.service.ts`, `tests/api/actor-tenant-context.test.mjs` | Per-COMMIT-only 5,000 ms node-postgres client deadline; generic failure, rollback attempt, client discard, and no-retry unit coverage |
| `tests/integration/safe-database-diagnostics.mjs`, `tests/api/source-capture-db-diagnostics.test.mjs`, `tests/integration/authorized-source-capture.orthanc.integration.test.mjs`, `services/api/Dockerfile` | Allowlisted test-only DB failure classification, regression coverage, and test-target helper packaging |
| `tests/api/source-integrity-manifest.test.mjs` | 12 positive/negative deterministic stream tests |
| `services/api/src/integrity/persistence/*`, `services/api/src/database/schema/integrity.ts`, `services/api/src/database/migrations/0021_source_integrity_operation_binding.sql` | Internal pending-only operation-bound persistence and database binding constraints |
| `tests/api/source-integrity-evidence-repository.test.mjs`, `tests/database/source-integrity-evidence-runtime.integration.test.mjs` | 6 repository unit tests and synthetic PostgreSQL/RLS/exact-grant Acceptance |
| `tests/api/authorized-source-capture.test.mjs`, `tests/api/orthanc-dicomweb.adapter.test.mjs` | Caller endpoint/credential override rejection, no source-capture controller registration, unsafe origin no-fetch matrix |
| `tests/integration/authorized-source-capture.orthanc.integration.test.mjs`, `scripts/test-int001-source-capture.ps1`, `scripts/seed-int001-source-capture-fixture.mjs`, `scripts/seed-int001-temporary-orthanc-a.mjs`, `scripts/probe-int001-temporary-orthanc-b-empty.mjs`, `scripts/verify-int001-source-capture.mjs` | CAP-001~004/014 real PostgreSQL/RLS + A WADO boundary, synthetic-only fixture lifecycle, observed origin/auth, B read-only observer and cleanup-safe isolated runner |
| `scripts/test-db-007-evidence.ps1`, `scripts/test-db-008-full-schema.ps1`, `services/api/Dockerfile` | Updated schema inventory/regression and integration-test image wiring |
| `docs/ACCEPTANCE-TESTS.md` | Hash, persistence, 14 source-capture Acceptance cases; CAP-001~004/013/014 scoped PASS |
| `docs/POLICY-DECISION-LOG.md` | `INT-001-DEC-001~003`; PDEC-001 reconfirmed 2026-10-02 |
| `docs/DATA-MODEL.md`, `docs/DOMAIN-MODEL.md`, `docs/ERD.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md` | Schema binding, least-privilege test boundary, risk and acceptance synchronized |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Current scoped status and next prerequisites |
| `docs/implementation/MEDIQ-INT-001/*` | Ticket report and test evidence |

## 6. 영향 분석

### Architecture

- Source-capture capability is registered as an internal provider behind verified-Tenant and operation-time authorization; it is not reachable through a controller/HTTP route. No browser/mobile client calls PACS or receives PACS credentials.

### API·Data

- No HTTP/OpenAPI contract, public PACS route or production workflow was added. Additive migrations `0021` and `0022` persist source-capture binding and exact permanent runtime column grants; DB-008 verified the 236-column privilege inventory and RLS. CAP-014 used a separately created disposable PostgreSQL cluster and removed its local resources. The `2 GiB` bound applies only to this manifest builder, not all study retrieval/transfer/storage.

### Security·Privacy

- The hash builder itself makes no Consent/Authorization/Grant decision; the separately implemented source-capture service requires DB-backed Authorization and PatientMapping before WADO. Aggregate digest is internal and not a bearer capability. No payload is persisted or logged.
- CAP-014 provides synthetic source/effect-boundary evidence only; it does not establish production PACS authenticity/readiness, destination integrity, or transfer success.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- API build/full regression: `PASS` (35 files / 606 tests latest; CAP-005 checkpoint recorded 594 tests)
- Hash suite: `PASS` (12/12); source-evidence repository suite: `PASS` (6/6)
- API typecheck and Drizzle migration consistency: `PASS`
- DB-008 full clean/reset/reapply, catalog/RLS, new source-evidence integration and DB-002~007 regressions: `PASS`; see `TEST-EVIDENCE.md`
- `TC-INT-001-CAP-001~004` and `CAP-013~014`: `PASS` within exact scopes; CAP-001 operation-derived scope, CAP-002 initial authorization denial/Audit matrix, CAP-003 persisted binding/state denial, CAP-004 exact configured HTTPS A endpoint/credential and origin override rejection, and CAP-014 isolated real source-capture effects
- CAP-005 metadata validation + COMMIT deadline: API/adapter matrix; bounded COMMIT-only 5,000 ms query timeout with 1,500 ms pool defaults; API regression 35/606; three consecutive fresh isolated runs 31/31 each; `PASS (scoped)`. The immediate client-side timer is mitigated; underlying DB/host/storage latency remains unknown.
- CAP-006 mapping/PatientID preflight: API 34/601 and isolated runner 31/31 pass; six invalid mapping states denied before metadata WADO, and one in-memory PatientID mismatch from actual HTTPS A metadata denied before instance payload WADO; exact Audit/evidence observer passed.
- CAP-004 validation: isolated capture runner 19/19 on three consecutive executions, HTTPS TLS/DICOM integration 7/7, AppConfig 11/11, and API regression 34 files/585 tests at that checkpoint; B EMPTY, no forbidden endpoint/STOW/destination call, cleanup and existing-stack preservation verified
- CAP-007 authorized streaming/exact-manifest path: static review plus three consecutive 31/31 isolated runs; `PASS (scoped)`. No study-sized DICOM aggregation or disk spill; parser may buffer within one 64 MiB instance cap, and no 2 GiB performance claim is made.
- Remaining CAP-008~012 as complete Acceptance, destination comparison, product route, STOW, destination verification and A→B E2E: open/not run; see explicit limits in `TEST-EVIDENCE.md`

## 8. 변경하지 않은 사항

- All `AGENTS.md` authorization, tenant, source-of-record, Audit and no-STOW boundaries remain unchanged.
- The builder/repository are not themselves a public route. An internal source-capture service is registered behind the verified authorization boundary; CAP-001/002/003/004/014 invoked it only against disposable Test Orthanc A and temporary PostgreSQL. Test setup wrote only synthetic fixtures to temporary A; the service issued no B request, STOW or destination-verification call.
- All CAP-001~006/014 disposable resources were removed after verification. The runner confirmed existing `mediq` containers, volumes and networks were unchanged. No patient data, production environment or operational credential was used.

## 9. 결정 및 예외

- Adopted `INT-001-DEC-001` under standing `PDEC-001`; see [Policy Decision Log](../../POLICY-DECISION-LOG.md#int-001-dec-001--bounded-source-integrity-manifest-primitive).
- Adopted `INT-001-DEC-002` under standing `PDEC-001`; its initial scope was the persistence foundation. Later `INT-001-DEC-003` separately authorized the synthetic/Test-only internal source-capture service and CAP-014 verification.
- Existing P0 limits are hard ceilings; an invocation may narrow them for a constrained context but cannot raise them.
- The end-to-end source evidence workflow must be separately authorized and integrated with Audit/Provenance before PACS import.

## 10. 잔여 위험과 후속 작업

- The internal source-capture service obtains bytes from configured Test Hospital A after DB-backed authorization in the verified test environment. No public/product route or production endpoint is wired; synthetic CAP-014 does not establish production source authenticity or operational PACS readiness.
- CAP-014 demonstrated failure Audit and pending-evidence behavior against real temporary PostgreSQL. CAP-001 verifies caller-scope rejection and DB-derived Study; CAP-002 verifies the initial-authorization denial/Audit matrix; CAP-003 verifies persisted binding and non-`CREATED` denial; CAP-004 verifies the configured A endpoint/TLS/credential boundary and fails closed on caller overrides; CAP-005 passes the metadata matrix and the post-timeout-fix 3×31/31 stability gate; CAP-006 verifies mapping and PatientID denial ordering; CAP-007 passes the stream/hash observer and static review within its synthetic scope. CAP-008~012/complete atomicity Acceptance, destination comparison and terminal `FAILED`/completion enforcement remain open.
- Adjacent deferred finding from static review (not exercised by this source-capture gate): `OrthancDicomwebAdapter.verifyDestinationStudy()` uses `!seenSeries.add(seriesUid)` and `!actual.add(sopUid)` as duplicate checks. Since `Set.add()` returns the Set, these predicates do not detect duplicates; the returned SOP set also collapses repeated UIDs. Do not claim destination duplicate verification is proven. Before any destination-verification PASS, create a separate recommendation/Acceptance, correct the checks, and add duplicate Series/SOP tests. No destination behavior was changed in CAP-005.
- 2 GiB/64 MiB limits have not been performance-benchmarked on a 2 GiB study or production-like workload.
- Follow-up: prepare CAP-008 recommendation and Acceptance for WADO/read failure, cancellation, framing/length/media-type/UID mismatch and hard-cap handling; then implement/test those failure paths without weakening the no-evidence/no-success-Audit invariant. Keep the separately documented destination adapter duplicate-detection defect in its own recommendation/Acceptance/fix/tests before any destination PASS. Keep STOW disabled until full Preflight and product no-STOW/B-unchanged negatives pass.

## 11. 최종 판정

```text
Ticket: MEDIQ-INT-001
Scope: Bounded hash + operation-bound pending evidence foundation; internal synthetic/Test-only authorized source-capture sub-gate; CAP-001~007 and CAP-013/014 (scoped only); CAP-008~012 open
Changed: SHA256-MANIFEST-V1 builder; operation-bound persistence and permanent exact grants; verified-Tenant/session-fence source-capture service; duplicate-SOP metadata rejection; A-only HTTPS WADO integration harness with metadata rejection matrix, exact origin/credential observations and caller-override denial; isolated Compose runner, synthetic fixture/DB setup, B empty probe, read-only Audit/evidence observer; synchronized records
Not changed: public route, Viewer/Download, PACS import coordinator, STOW, destination verification/comparison, transfer completion, full A→B E2E
Security impact: fail-closed Authorization and PatientMapping gates; exact runtime/RLS and transaction-outside-WADO boundary verified in disposable environments; CAP-002/003 denial boundaries, CAP-004 endpoint/TLS boundary, CAP-005 metadata + COMMIT deadline, CAP-006 mapping/PatientID and CAP-007 stream/hash boundaries passed only within recorded synthetic scopes; no forbidden-origin calls, B is unreachable to the source-capture service; underlying DB/host/storage latency and production SLO are unproven
Tests executed: API regression 35/606; CAP-005 COMMIT negative unit and three fresh isolated runners 31/31; CAP-006 API matrix and isolated runner 31/31; CAP-007 observer and static review in the same three 31/31 runners; Audit/evidence observers, B empty before/after, cleanup and existing-stack preservation; plus prior AppConfig 11/11, HTTPS TLS/DICOM 7/7, hash 12/12, evidence repository 6/6, typecheck, migration consistency, DB-008/DB-002~007, and CAP-001~004/014 recorded runs; see TEST-EVIDENCE.md
Tests not executed: CAP-008~012 complete-service scenarios, product import/API path, destination comparison, STOW/no-STOW product coordinator, live destination verification, production/client-ingress TLS, full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: CAP-001~007/013~014 use synthetic data and disposable local services; CAP-005's 5 s COMMIT deadline is a bounded mitigation, not a diagnosis of underlying DB/host/storage latency, and future timeout outcome remains ambiguous; the parser may buffer up to one 64 MiB instance and high-volume memory performance is unproven; an initial CAP-003 fixture attempt was rejected by the database initial-state guard, then corrected without bypassing it; the separate earlier CAP-002 runner exit 1 remains unexplained; no public/production source path, destination verification or completion gate; CAP-008~012 and production-like workload benchmark open
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PARTIAL` | Recommendation/Acceptance first; bounded canonical stream-hash sub-gate implemented and tested; integration prerequisites remain open |
| 2026-10-02 | `PARTIAL` | `INT-001-DEC-002` and DB Acceptance recorded first; operation-bound PENDING persistence sub-gate passed DB-008 scratch; authorized retrieval and full integrity remain open |
| 2026-10-02 | `PARTIAL` | `INT-001-DEC-003` and 14 Acceptance cases accepted before implementation. Authorized synthetic source-capture service work started; no implementation result claimed yet |
| 2026-10-02 | `PARTIAL` | Added exact permanent source-capture runtime column grants; DB-008 full clean/reset/reapply, 236-column privilege/RLS, INT-001 persistence and DB-002~007 regression all PASS. Live Test Orthanc A/B capture remains open |
| 2026-10-02 | `PARTIAL` | CAP-014 isolated Test Orthanc A/B + disposable PostgreSQL passed: 4/4 tests, authorization/failure/success Audit+evidence checked, B empty before/after, temporary cleanup and existing stack preservation; full P0 remains open |
| 2026-10-02 | `PARTIAL` | CAP-002 denial matrix added after recommendation/Acceptance; isolated runner passed 14/14 on three consecutive runs, including zero DICOM effects and conditional Audit behavior. One earlier exit 1 remains unexplained; CAP-003~012 and full P0 remain open |
| 2026-10-02 | `PARTIAL` | CAP-002 denial matrix passed 18/18 shared tests on three consecutive runs; CAP-003 persisted-binding/state matrix then passed the same 18/18 three times. State fixture used the approved domain/repository transition; initial direct later-state insert was rejected by the DB trigger and was not retained. CAP-004~012 and full P0 remain open |
| 2026-10-02 | `PARTIAL` | CAP-004 endpoint/TLS boundary added after recommendation/Acceptance; the updated live runner passed 19/19 on three consecutive executions, TLS/DICOM integration 7/7, AppConfig 11/11 and API regression 34 files/585 tests. Caller endpoint/credential overrides were denied before Tenant/network; four real A WADO requests per run used the exact HTTPS A origin/Auth configuration; B remained empty and no forbidden origin/STOW/destination call occurred. CAP-005~012 and full P0 remain open |
| 2026-10-02 | `PASS (scoped)` | CAP-005 recommendation/Acceptance recorded first; expanded API/adapter and isolated PostgreSQL/RLS + HTTPS A metadata matrix. Fixed duplicate-SOP validation (`Set.add()` misuse). API 34/594 and three consecutive fresh live runs 30/30 each passed. Earlier pre-metadata Tenant-context DB failures remain unexplained but were not reproduced during the stability sequence; CAP-006~012 and full P0 remain open |
| 2026-10-02 | `PASS (scoped)` | CAP-006 recommendation/Acceptance recorded before tests; six invalid PatientMapping states denied before metadata WADO, and one synthetic per-instance PatientID mismatch from real HTTPS A metadata denied before payload WADO. API regression 34/601; isolated runner 31/31; exact Audit/evidence observer, unchanged operation, B EMPTY and cleanup verified. CAP-007~012 and full P0 remain open |

| 2026-10-02 | `PASS (scoped)` | Diagnosed the test-only Tenant COMMIT query timeout, applied a 5,000 ms per-query timeout to COMMIT only, and passed API 35/606 plus three fresh isolated 31/31 runs. CAP-007 stream observer and static no-study-buffer/no-disk-spill review also passed; CAP-008~012, destination verification and full P0 remain open |

## 13. Authorized Source-Capture Sub-gate — CAP-014/CAP-001 Historical Checkpoint

Decision and Acceptance were recorded first in `INT-001-DEC-003` and `TC-INT-001-CAP-001~014`. The implementation scope for this continuation is internal-only and synthetic/Test-only: operation-derived scope, exact fenced `PACS_IMPORT` authorization, destination PatientMapping / per-instance PatientID equality, configured A-only HTTPS WADO, bounded sequential hash with the 30-minute total deadline, fixed minimized Audit events, atomic pending evidence + success Audit, and exact permanent runtime column grants. There will be no HTTP/OpenAPI route, B call/STOW, operation state transition, destination verification, or full-P0 claim.

This section preserves the checkpoint before the later CAP-002 denial-matrix extension. At that time the mocked API tests, exact permanent privilege/RLS database sub-gate, and isolated real Test Orthanc A/B source-capture gate passed within scope; CAP-001 and CAP-013~014 were scoped PASS while CAP-002~012 remained open. The subsequent CAP-002 recommendation and actual result are recorded in §13.5; the current status is also summarized in §§7 and 14.

### 13.1 Implemented in this checkpoint

- `AuthorizationGatedOperationExecutor.executeWithResolvedSessionFence` resolves server-owned scope inside the verified Tenant transaction, then acquires the shared Session fence and evaluates the exact Authorization context.
- `PostgresSourceCaptureScopeRepository` derives operation → Session → Study reference → package bindings from the Tenant-visible operation graph.
- `AuthorizedSourceCaptureService` is registered as an internal provider only. It enforces the Test A → Test B binding, `PACS_IMPORT`, `CREATED` operation state, destination PatientMapping, Study/Series/Instance count checks, per-instance PatientID equality, bounded sequential hash, a fixed 30-minute total deadline, and a second fenced authorization/mapping check before pending evidence + success Audit.
- Source-capture Audit event/result/reason combinations are allowlisted. No HTTP route, OpenAPI change, STOW call, B-side write, operation state transition or destination verification was added.
- New unit tests cover the executor transaction/fence sequence, mocked source-capture allow/deny/failure/concurrency and audit allowlist. API build and the 34-file/584-test API suite pass.

### 13.2 Historical database and CAP-014 sub-gates; full PACS integration remaining

- Added `0022_authorized_source_capture_column_grants.sql`: `integrity_evidence` exact 12-column SELECT + 12-column INSERT; `study_references` exact 6-column SELECT including the three capture-scope fields; no UPDATE/DELETE.
- Disposable PostgreSQL/RLS Acceptance passed for operation-bound pending evidence, exact replay/conflict, rollback, no Tenant context, cross-Tenant isolation, late first-write denial, exact persistent privilege inventory (236 total), and the DB-008 reset/reapply path. This exercises the evidence repository, not the complete application service's Audit/evidence atomicity.
- DB-008 confirmed runtime is non-owner/non-superuser/NOBYPASSRLS, no table-wide/PUBLIC/DDL grants, 17 forced-RLS tables, exact 236 column privileges, and all DB-002~007 regressions.
- `./scripts/test-int001-source-capture.ps1` passed: temporary PostgreSQL with real runtime role/migrations/RLS, real HTTPS A WADO, invalid-Grant denial, authorized source-body failure without evidence, success with one pending evidence row, exact Audit observer results, B EMPTY before/after, and cleanup preserving the persistent `mediq` resource inventory.
- At this historical checkpoint, `TC-INT-001-CAP-001` and `CAP-013~014` were PASS for their operation-scope, exact privilege/RLS, and effect-boundary scopes; CAP-002~012 were then open. CAP-002 was subsequently closed only for its recorded denial-matrix scope in §13.5. Destination comparison, product import route, STOW and full P0 remain open; this Ticket remains `PARTIAL`, not full source-capture/P0 PASS.

### 13.3 CAP-014 test-strategy recommendation (recorded before integration changes)

**Recommendation:** run the complete source-capture service against a uniquely named, disposable Compose project on every invocation. The service under test uses the real `mediq_runtime` PostgreSQL role, migrations, Tenant RLS, Consent/Grant evidence, operation/session fence, Audit/evidence transactions, and the real HTTPS Test Orthanc A adapter. Its container is attached only to the temporary `database` and `hospital-a` networks. It seeds only the committed synthetic CT fixture into the temporary A volume as test setup, then tests denied, source-read-failure, and successful capture paths. A separate read-only probe, attached only to `hospital-b`, asserts the temporary B store is empty before and after. The runner validates Compose ownership and removes only the random project’s containers, networks, and volumes.

**Alternative considered:** reuse the persistent local `mediq` stack or run only the existing DICOM adapter suite. Reusing the persistent stack risks coupling the test to user data/state; adapter-only tests do not exercise the application authorization/fence/evidence boundary. A synthetic in-memory database harness is also insufficient for the intended CAP-014 gate because it cannot prove real Tenant RLS or database transaction closure.

**Rationale and impact:** isolated resources preserve existing development state; real runtime credentials exercise the permanent least-privilege grants; the test container cannot reach B at the network layer; the observer cannot write B because its test code issues only authenticated GETs. Setup-time writes are confined to synthetic data in disposable Test Orthanc A. No public route, production endpoint, B STOW, destination verification, state transition, real patient data, or operational PACS credential is introduced.

**Acceptance and limits:** the test must show no A WADO before a real DB-backed initial `PACS_IMPORT` authorization is committed; an invalid Grant makes zero A WADO requests; the authorized failure path creates no pending evidence/success Audit; success creates exactly one operation-bound `SOURCE_CAPTURE/PENDING` and success Audit while the operation remains `CREATED`; no database transaction remains open during WADO headers or stream consumption; B is empty before/after and unreachable to the service container. The evidence proves this source-capture boundary only, not the later destination/STOW/full-P0 workflow. This is an implementation/test strategy under the already accepted `INT-001-DEC-003` and `TC-INT-001-CAP-014`, not a scope expansion.

### 13.4 CAP-001 operation-scope verification recommendation (recorded before test changes)

**상태·근거:** `PDEC-001` 및 승인된 `INT-001-DEC-003` / `TC-INT-001-CAP-001` 범위 안에서 진행한다. 제품 범위나 권한을 확대하지 않는 검증 보강이다.

**문제:** CAP-014 성공 경로는 실제 DB에서 operation scope를 읽고 A WADO까지 진행하지만, CAP-001 결과를 직접 입증하는 검증은 별도로 보이지 않는다. 현재 유닛 테스트는 caller-supplied `studyInstanceUid`를 거부하지만 PostgreSQL/Test Orthanc 경로에서 (a) 그 거부가 인증 DB transaction과 DICOM I/O 전에 일어나는지, (b) 정상 요청의 실제 A Study UID가 operation graph에서 유도되는지, (c) 응답 allowlist가 PatientID/Study UID를 제외하는지를 확인해야 한다.

**채택 권고안:** 기존 CAP-014 disposable Compose harness에 CAP-001 전용 통합 하위시험을 추가한다. 적대 입력은 operation/Consent/Grant reference 외에 가짜 `studyInstanceUid`를 포함하고, fixed invalid-request 오류·0 Tenant transaction·0 A/B 요청을 확인한다. 정상 성공 경로에서는 WADO 요청 Study UID가 manifest와 DB fixture가 공유하는 operation-bound Study UID와 일치하고, 결과 필드는 `evidenceId/kind/objectCount/status`만 포함하며 PatientID·Study UID는 나오지 않음을 확인한다. 기존 CAP-014의 read-only DB observer가 그 evidence가 동일 operation의 pending row에 결속됐음을 이미 확인하므로 새 저장 데이터나 API는 추가하지 않는다.

**대안·선택 이유:** (1) 현재 mocked unit test만으로 CAP-001을 종료 — DB-derived scope가 실제 PACS 요청까지 전달되는 증거가 없어 미채택. (2) public endpoint를 만들어 외부 요청시험 — DEC003의 internal-only 범위 바깥이므로 미채택. (3) 기존 격리 하네스에 테스트만 추가 — 같은 실제 DB/RLS/HTTPS A 경계를 재사용하고 B·운영환경에 영향이 없어 채택.

**범위·영향·잔여위험:** 테스트와 문서만 변경하고 synthetic/Test 환경만 사용한다. 제품 코드, API/OpenAPI, Schema/Migration, 권한, PACS 설정, B 데이터는 바꾸지 않는다. 이 결과는 CAP-001 test evidence만 닫으며 CAP-002~012, production PACS, destination verification, STOW 및 P0 E2E를 닫지 않는다.

**Acceptance/검증:** 변경 전에 승인된 `TC-INT-001-CAP-001`을 기준으로 negative path는 authorization context entry와 A/B network call이 0, positive path는 A WADO Study가 DB-derived scope와 정확히 같고 response가 최소 allowlist임을 확인한다. `node --test` 격리 통합 5/5, 전체 API 회귀 및 runner cleanup/기존-stack 보존을 요구한다. PASS 표시는 실제 명령·종료 코드가 evidence에 기록된 뒤에만 한다.

**실행 결과 (2026-10-02):** `./scripts/test-int001-source-capture.ps1` 종료 코드 0. 통합 하위시험 5/5 PASS. 가짜 `studyInstanceUid`는 `AuthorizedSourceCaptureInvalidRequestError`로 거부됐고 verified-Tenant context 진입과 A/B 요청이 모두 0이었다. 성공 캡처의 A WADO path는 operation-bound manifest Study와 일치했고 반환 객체는 `evidenceId/kind/objectCount/status`만 포함해 PatientID와 Study UID를 노출하지 않았다. Audit/evidence observer PASS, B EMPTY 전후, 임시 Compose 정리 및 기존 `mediq` stack 보존 PASS. API 회귀 명령도 아래 실행기록에서 재검증한다. 이 결과는 CAP-001 scope만 닫으며 Ticket은 계속 PARTIAL이다.

### 13.5 CAP-002 initial-authorization denial matrix recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-002-REC-001`, adopted 2026-10-02 under standing `PDEC-001` and the approved `INT-001-DEC-003` / `TC-INT-001-CAP-002`. This is a verification-only refinement within the existing internal synthetic/Test-only source-capture scope; no product behavior or privilege is added.

**문제:** Existing live CAP-014 exercises one unknown Grant, but does not demonstrate the full CAP-002 initial-authorization deny boundary, conditional denial Audit, RLS-hidden cross-Tenant resource, or unavailable-database mapping at the source-capture service boundary.

**채택 권고안:** Extend the same disposable PostgreSQL/RLS + HTTPS Test Orthanc A/B runner. Seed only synthetic variants for absent Consent/Grant references, withdrawn/expired Consent, revoked/expired Grant, and a wrong Grant scope. Add a valid synthetic Actor in Tenant A and try to resolve the existing Tenant-B operation under Tenant A to prove row invisibility and no existence-revealing Audit. Separately construct the service with a syntactically valid runtime config whose database endpoint is an intentionally closed loopback port to exercise actual connection-unavailable mapping. For every case assert fixed outcome, zero DICOM-gateway calls and zero A/B requests; for resolvable verified-Tenant cases assert exactly one fixed `PACS_SOURCE_CAPTURE_DENIED/DENY/AUTHORIZATION_DENIED` Audit and no source evidence; for hidden/unavailable cases assert no Audit. Keep the valid capture scenario last so the independent observer can prove all denials left the operation without source evidence before the one success baseline.

**대안·선택 이유:** (1) rely only on existing mocked service and separate AUT/Consent DB tests — rejected because they do not exercise CAP-002 through this capture service or prove zero DICOM effects and its conditional Audit behavior. (2) test only the unknown Grant — rejected as too narrow for the already approved CAP-002 matrix. (3) add the matrix to the disposable live runner — selected because it uses the real runtime role, RLS, policy and audit writer while all mutations/fixtures remain disposable and synthetic.

**범위·영향·잔여 위험:** Test fixture, integration tests, runner assertion, and evidence/docs only. No application code, API/OpenAPI, migration/schema, permanent grants, real PACS, Hospital B data, or production configuration changes. This can close only the initial-Authorization denial boundary in CAP-002; it does not close operation-time revocation/races in CAP-009, audit delivery/global completeness, CAP-003~012, destination verification, STOW, or P0 E2E.

**Acceptance/검증:** Before test changes, `docs/ACCEPTANCE-TESTS.md` requires the enumerated deny matrix, no metadata/instance gateway call, no evidence, fixed denial/unavailable result, and exactly one minimized denial Audit only when verified Tenant and operation scope resolve. Run `./scripts/test-int001-source-capture.ps1`; its Node test count must match the updated expected count; the read-only DB observer checks the exact denial-Audit correlation set and final operation/evidence state; A gateway and B remain uncalled/empty; temporary project is removed and persistent `mediq` resources remain unchanged. Run the complete API regression and syntax/diff checks. Do not mark CAP-002 PASS until these commands and actual results are recorded in `TEST-EVIDENCE.md`.

**실행 결과 (2026-10-02):** 최종 fixture/runner 보정 뒤 `./scripts/test-int001-source-capture.ps1`를 연속 세 차례 실행했고 매번 exit 0, 14/14 TAP tests, Audit/evidence observer PASS, B EMPTY 전후, 임시자원 정리 및 기존 `mediq` stack 불변을 확인했다. CAP-002 observer는 예상한 7개 denial Audit만 확인했고 RLS-hidden cross-Tenant 및 DB unavailable correlation에는 Audit이 없었으며 모든 거부 분기는 DICOM gateway/A 요청과 evidence가 0이었다. 전체 API 회귀 `npm run test:api -- --reporter=dot`도 exit 0, API build 포함 34 files/584 tests PASS. 초기 fixture seed에서 비 UUID synthetic idempotency key(SQLSTATE `22P02`)가 거부됐고, 수정 후 한 integration 실행은 exit 1이었으나 민감 TAP 원문을 노출하지 않도록 한 실행기의 안전 출력만으로 원인을 판정하지 못했다. Runner 기대 개수와 seed key를 수정한 뒤 세 차례 연속 통과했으며 미분류 실패 이력은 잔여 하네스 신뢰성 위험으로 유지한다. 판정은 CAP-002 scope만 `PASS`; CAP-003~012와 Ticket 전체는 계속 열린다.

### 13.6 CAP-003 persisted-operation binding and state gate recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-003-REC-001`, adopted 2026-10-02 under standing `PDEC-001` and the approved `INT-001-DEC-003` / `TC-INT-001-CAP-003`. This is a synthetic/Test-only verification refinement; it does not widen product scope or weaken any invariant.

**문제:** CAP-001/002 verify caller scope and initial authorization, but do not independently prove that the internal service rejects a persisted operation whose individually valid references form a mismatched Session/Package/Study/source-Hospital aggregate, or a fully bound operation that is no longer `CREATED`. The persistence schema has individual foreign keys; the authorized scope resolver's relational joins are the boundary that must prevent an inconsistent aggregate from reaching the PACS adapter.

**채택 권고안:** Extend the disposable fixture with two deliberately inconsistent but individually FK-valid synthetic operation graphs: (1) the operation Session is paired with a Study/package belonging to a different Session; (2) the operation Session source Hospital differs from the Study/package source Hospital. Add one internally consistent operation initially as `CREATED`; move it to `FAILED` only through the existing `PacsTransferOperation` domain transition and `PostgresPacsTransferOperationRepository`, with an explicit setup Audit. Invoke the actual source-capture service with a verified synthetic principal and the existing isolated Test configuration. For both malformed graphs, expect fixed generic `DENIED/AUTHORIZATION_DENIED`, no resolved-scope disclosure, no source-capture denial Audit because the complete trusted graph cannot resolve, zero source gateway/A/B calls, zero evidence, and unchanged operation state. For the valid non-`CREATED` operation, expect fixed denial, exactly one minimized source-capture denial Audit, zero DICOM/evidence, and state still `FAILED`; independently verify the setup transition Audit. Never bypass the database initial-state/transition trigger by directly inserting a later state. Preserve B-empty, forbidden STOW/destination calls, and cleanup/existing-stack invariants.

**대안·선택 이유:** (1) rely on unit/mocked repository tests — rejected because they do not prove the actual PostgreSQL joins/RLS and DICOM effect boundary. (2) directly insert `PREFLIGHT_PASSED` — rejected by evidence from the first fixture attempt (`SQLSTATE 23514`, `PACS_TRANSFER_OPERATION_INITIAL_STATE_INVALID`) and by the invariant that new operations must start as `CREATED`; bypassing this trigger would fabricate state. (3) alter the primary success operation in-place — rejected because it couples cases and risks test-order contamination. (4) seed separate synthetic aggregates and create the non-`CREATED` case through the existing domain/repository transition, then exercise the live source-capture service — selected because it preserves state invariants and uses real RLS/joins while keeping all mutations isolated and repeatable.

**범위·영향·잔여 위험:** Acceptance, synthetic fixture, integration test, read-only observer, runner expectation, and evidence/docs only unless a concrete implementation defect is found. No application route, API/OpenAPI, migration/schema, permanent grant, PACS configuration, B data, real PHI, credential, STOW, or production behavior is in scope. This closes only the initial persisted-binding/state boundary; it does not cover CAP-009 in-flight state races, later authorization/mapping changes, destination verification, or full P0.

**Acceptance/검증:** `docs/ACCEPTANCE-TESTS.md` recorded the exact mismatch/non-`CREATED` matrix before test edits. The first runner attempt exited during disposable fixture seed because a later state was directly inserted; the DB trigger rejected it and cleanup confirmed the existing stack unchanged. The fixture was revised to insert `CREATED` and use the approved domain/repository transition to `FAILED`.

**실행 결과 (2026-10-02):** `./scripts/test-int001-source-capture.ps1` exited 0 three consecutive times; each run passed 18/18 Node tests, the independent Audit/evidence/operation-state observer, B EMPTY before/after, cleanup, and existing-stack preservation. The mismatched Session↔Package/Study and source-Hospital bindings returned only generic denial, with zero DICOM calls, zero evidence, no source-capture denial Audit, and unchanged `CREATED` state. The fully bound operation was transitioned `CREATED→FAILED` via `PacsTransferOperation` + `PostgresPacsTransferOperationRepository` and emitted its separate setup transition Audit; source capture then returned generic denial, wrote exactly one minimized source-capture denial Audit, made zero DICOM calls, created no evidence, and left the operation `FAILED`. `npm run test:api -- --reporter=dot` exited 0 with API build and 34 files/584 tests. Syntax and `git diff --check` passed. CAP-003 is `PASS` for this scoped matrix only; CAP-004~012 and the full Ticket remain open.

### 13.7 CAP-004 source endpoint trust-boundary recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-004-REC-001`, adopted 2026-10-02 under standing `PDEC-001` and approved `INT-001-DEC-003` / `TC-INT-001-CAP-004`. Verification-only refinement within the internal synthetic/Test-only source-capture boundary; no product/API authority or production endpoint access is added.

**문제:** The existing `MEDIQ-TLS-001` evidence already verifies local Test Orthanc CA/SAN validation, wrong-name/untrusted-CA rejection, HTTPS-only behavior, and no HTTP downgrade. The endpoint resolver pins A/B to exact local service names and operation roles, and `AuthorizedSourceCaptureService.exactCommand()` has an allowlist. However, CAP-004 was still marked `PLANNED`, and the INT-001 live capture test did not itself assert the effective origin/scheme/port/redirect/Auth header on each WADO request or exercise endpoint/credential override fields against the actual capture command. Merely citing the TLS ticket would not show the source-capture path uses those controls.

**채택 권고안:** Keep the existing strict Test-only resolver and TLS architecture; do not add dynamic `hospital_endpoints` lookup, a generic URL, proxy override, or any route. Extend CAP-004 Acceptance first, then add focused tests which (1) pass synthetic caller-controlled endpoint/credential/auth fields to the internal command and prove exact-command rejection before verified-Tenant context or network; (2) observe every real capture request and require HTTPS to exact configured `orthanc-a:8042`, canonical `/dicom-web/` paths, no URL userinfo/fragment, `GET`, redirect mode `error`, and the backend-configured A Authorization value without logging it; (3) assert no A→B, non-A host/port, plaintext, STOW, or destination-verification calls; and (4) reuse, not duplicate, the existing live TLS negative suite for trusted/untrusted/malformed CA, wrong DNS identity, and HTTP downgrade. Retain explicit evidence that source capture has no browser-facing controller/OpenAPI route; do not represent that static product-boundary check as Client↔MediQ or production validation.

**대안·선택 이유:** (1) close CAP-004 solely by pointing at historical `MEDIQ-TLS-001` — rejected because it does not instrument the current source-capture request boundary or command override rejection. (2) add dynamic endpoint registry resolution or caller-selected PACS URLs — rejected as out of current scope and contrary to SSRF/authority separation. (3) expose capture to browser/API so a direct-client test can be added — rejected because no route is authorized and the existing implementation is deliberately internal-only. Reusing the existing TLS suite while directly instrumenting the current capture path is the smallest test change that proves the accepted boundary without duplicating TLS infrastructure.

**Acceptance/검증:** Before test changes, the detailed CAP-004 cases were added to `docs/ACCEPTANCE-TESTS.md`: exact command allowlist denial before context/network; per-request exact A origin, HTTPS, path, method, redirect and backend-only configured credential; origin/role negatives before fetch; live CA/SAN/HTTP-downgrade checks; no HTTP/OpenAPI source-capture route; synthetic-only data; zero B/STOW/destination calls. Required commands are the isolated `./scripts/test-int001-source-capture.ps1`, API/config/adapter regression, and the read-only local DICOM/TLS Compose Acceptance. Expected evidence includes exact request observations with secrets redacted, zero forbidden-origin counters, no new Audit/evidence on malformed command, B empty, cleanup/existing-stack preservation, and all TLS negative cases. Do not mark CAP-004 PASS until commands complete and actual results are appended to `TEST-EVIDENCE.md`.

**실행 결과 (2026-10-02):** `./scripts/test-int001-source-capture.ps1` exited 0 three consecutive times; each isolated PostgreSQL/RLS + HTTPS Test Orthanc A/B run passed 19/19 tests, independent Audit/evidence/state observer, B `EMPTY` before/after, temporary cleanup and existing-stack preservation. The endpoint/credential override command was rejected with 0 verified-Tenant context, upstream requests, Audit/evidence, STOW or destination verification. Each authorized capture made exactly four requests (metadata + three instances); every observed request was HTTPS `orthanc-a:8042`, under `/dicom-web/`, no URL userinfo/query/fragment, method GET, redirect `error`, and configured-A Authorization matched (only a boolean was kept). Forbidden endpoint/scheme counter was zero. `docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test` exited 0 with 7/7 tests, including trusted CA/SAN, untrusted/malformed CA, wrong DNS identity, HTTP downgrade and read-only DICOM hash checks; Hospital B contained zero instances and no STOW/POST ran. `npm run test:app-config` exited 0 with 11/11; `npm run test:api -- --reporter=dot` exited 0 with API build and 34 files/585 tests. Adapter negative-origin tests and module controller metadata assertion passed in the API suite. CAP-004 is `PASS` for the recorded local synthetic endpoint trust boundary only. No product/browser PACS route, Client↔MediQ ingress TLS, production PKI, STOW, destination verification, or full A→B behavior is proven.

### 13.8 CAP-005 metadata validation recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-005-REC-001`, adopted 2026-10-02 under standing `PDEC-001`, `INT-001-DEC-003`, and the existing CAP-005 Acceptance. Verification refinement only: no new product route, data field, DICOM destination, or production authority.

**문제:** The service already rejects absent/non-positive/over-limit persisted instance counts, validates projected Study/Series/Instance identity and count agreement before opening payload streams, and maps DICOM adapter failures to sanitized outcomes. Before this gate, CAP-005 was `PLANNED`; the API test covered only one mocked instance-count mismatch and there was no live evidence for the adapter/service boundary, persisted missing-count denial, series-count boundary, malformed/duplicate/over-limit metadata, or exact Audit/evidence/state effects.

**채택 권고안:** Preserve the current fail-closed behavior and distinguish two classes of invalid metadata. (1) A valid DICOM JSON response that projects to an empty Study or conflicts with the persisted expected `instance_count` / non-null `series_count` returns only `DENIED/SOURCE_METADATA_INVALID`, with fixed minimized denial Audit. (2) Malformed DICOM JSON, missing/invalid required identity tags, wrong Study UID, duplicate SOP identity, or an adapter count/size ceiling violation is a sanitized source-read failure: expose only `SOURCE_CAPTURE_UNAVAILABLE` at the application boundary and write only fixed `PACS_SOURCE_CAPTURE_FAILED/FAILURE/SOURCE_READ_FAILED` when a verified Tenant scope remains available. Invalid persisted counts are rejected before metadata WADO. For every CAP-005 path, retrieve metadata at most once, never open an instance payload stream, create no integrity evidence or success Audit, leave the PACS operation `CREATED`, keep B unchanged, and never log/return raw upstream content, PatientID, DICOM UID, credential, or secret. Extend the isolated integration test with a test-only metadata-response fault injector that transforms synthetic A's HTTPS WADO metadata response in memory; it must not change PACS storage or the production adapter. Seed one validly bound synthetic operation whose persisted `instance_count` is NULL, then verify runtime RLS denies before DICOM. Add focused unit/adapter matrix cases for other persisted count bounds and invalid wire projections. Change product logic only if these tests expose a concrete violation; any such change must be separately minimal and retain the same invariants.

**대안·선택 이유:** (1) Treat every empty/count mismatch as a transport failure — rejected because an HTTP-successful, structurally valid but incomplete Study is a domain validation denial, not an availability event. (2) Treat malformed upstream JSON/identity as a normal metadata denial — rejected because the adapter cannot establish a trustworthy projected Study and must expose only a fixed source-read failure. (3) Expand to destination import/STOW or persist rejected metadata for diagnostics — rejected because that exceeds CAP-005 and risks PHI/UID persistence. The selected split preserves useful fixed internal outcomes without exposing source details; response mutation remains test-only and entirely synthetic.

**Acceptance/검증:** `docs/ACCEPTANCE-TESTS.md` records each class and expected state/Audit effects before test edits. Required evidence: adapter/API matrix for empty, wrong Study, malformed required tags/JSON, duplicate SOP, >2,000 instances, positive/missing/zero/over-limit persisted count, count mismatch, and persisted `series_count` mismatch; isolated runner against disposable PostgreSQL/RLS and real HTTPS A for a missing persisted count plus semantic and malformed metadata response cases; independent observer verifies fixed event per correlation, zero evidence/success event, unchanged `CREATED`, and no sensitive values; per-case request counters show zero instance WADO. Re-run API regression, isolated CAP runner, B-empty/cleanup/stack-preservation probes. STOW and destination verification remain instrumented forbidden calls. Following observed transient DB failures, CAP-005 PASS requires three consecutive fresh isolated runner executions with no in-run retries; if a failure recurs, diagnose/fix rather than masking.

**실행 결과 (2026-10-02):** `npm run test:api -- --reporter=dot` exit 0; API build and 34 files/594 tests passed. The isolated command `./scripts/test-int001-source-capture.ps1` passed three consecutive fresh Compose runs, each with 30/30 integration assertions, independent Audit/evidence/state observer, B `EMPTY`, temporary cleanup and existing-stack preservation. The persisted-NULL-count fixture was denied before metadata WADO. Test-only in-memory HTTPS A metadata cases covered empty, count mismatch, persisted series-count mismatch, wrong Study, duplicate SOP, malformed JSON, missing identity tag, >2,000 rows and upstream 503; assertions verified no instance WADO, no evidence/success Audit, expected fixed denial/failure Audit, unchanged operation, zero B/STOW/destination calls and sanitized errors. Unit/adapter matrices also passed. A concrete adapter defect was fixed: duplicate-SOP validation used `!seenSop.add(sopUid)`, which is ineffective because `Set.add()` returns the Set; validation now checks `seenSop.has(sopUid)` before adding. Earlier isolated invocations intermittently failed before metadata requests with fixed `ACTOR_TENANT_CONTEXT_UNAVAILABLE`; safe diagnostics localized the aborted attempts to COMMIT/session-fence DB transaction work but did not recover an underlying error. This failure did not recur across the three consecutive fresh isolated runs, meeting the scoped repeatability criterion; mark CAP-005 `PASS (scoped)` and retain the unexplained earlier attempts as a test-environment residual risk. No payload, patient identifier, DICOM UID or credential was recorded; no production adapter fault injection, route, STOW or destination verification was added.

### 13.9 CAP-006 PatientID/mapping denial evidence recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-006-REC-001`, adopted 2026-10-02 under standing `PDEC-001`, `PACS-001-DEC-002`, and existing CAP-006 Acceptance. Test-only proof refinement within the existing identity-preflight boundary.

**문제:** The service validates the persisted destination mapping in its first fenced Tenant transaction and compares every projected source-instance PatientID to the mapping before opening any instance stream. The API suite currently has one all-instances mismatch case, but no test proves missing/ambiguous/unverified mapping statuses stop before metadata WADO, nor an isolated live adapter/service test that a single mismatched PatientID in actual HTTPS Test A metadata prevents payload retrieval and creates only the fixed denial Audit.

**채택 권고안:** Preserve the existing byte-preserving PatientID policy and no-STOW boundary. Extend service-unit coverage for absent, ambiguous, unverified, revoked, invalid, and binding-mismatched mapping states, asserting `DENIED/PATIENT_MAPPING_INVALID`, zero metadata/instance WADO, no evidence/success Audit, unchanged operation, and only a fixed minimized denial Audit. For a valid mapping, mutate exactly one synthetic row's PatientID in the HTTPS Test A metadata response in memory after the actual GET; expect fixed `DENIED/SOURCE_PATIENT_ID_MISMATCH`, one metadata GET, zero instance-payload requests, no evidence/success Audit, unchanged `CREATED`, B empty, no identifier in outputs/Audit, and cleanup. Do not mutate A's persisted objects. Change product logic only if a focused test exposes a concrete defect; do not rewrite DICOM, add a route, or exercise STOW.

**대안·선택 이유:** (1) rely only on pure mapping tests — rejected because they do not prove this source-capture callsite's no-WADO ordering. (2) Rewrite DICOM PatientID — rejected by `PACS-001-DEC-002` and the approved byte-preserving P0 boundary. (3) Add a public route or STOW to demonstrate destination behavior — rejected because full Mandatory Preflight and product no-STOW Acceptance remain open. (4) Log/persist the mismatched identifier — rejected as unnecessary disclosure.

**Acceptance/검증:** Before code/test changes, CAP-006 Acceptance was expanded in `docs/ACCEPTANCE-TESTS.md`. Required evidence is the mapping-invalid unit matrix with zero metadata/instance requests and fixed denial Audit; one mismatched synthetic instance in the isolated real HTTPS A response; exact correlation-bound Audit; zero payload WADO/evidence/success Audit; unchanged `CREATED`; B empty; no secret/PatientID/UID disclosure; API regression and disposable-run cleanup/stack-preservation. STOW/destination verification remain forbidden. Do not upgrade CAP-006 until the recorded cases and actual evidence pass.

**실행 결과 (2026-10-02):** API regression `npm run test:api -- --reporter=dot` exited 0; API build and 34 files/601 tests passed. The isolated runner `./scripts/test-int001-source-capture.ps1` exited 0 with 31/31 tests. Six invalid mapping cases made zero metadata/instance requests and emitted only fixed denial Audit; the actual HTTPS Test A metadata response was changed in memory for one synthetic PatientID mismatch, producing exactly one metadata GET and zero instance WADO/evidence/success Audit. The independent observer verified exact correlation-bound Audit, no persisted evidence and operation `CREATED`; B remained EMPTY, cleanup and existing-stack preservation passed. CAP-006 is `PASS (scoped)` only. No route, stored Orthanc object, STOW, destination verification or production behavior changed.

### 13.10 CAP-007 authorized stream and exact-manifest evidence recommendation (recorded before test changes)

**결정 ID·상태·권한:** `INT-001-CAP-007-REC-001`, adopted 2026-10-02 under standing `PDEC-001`, `INT-001-DEC-001/003`, and the existing `TC-INT-001-CAP-007`. This is a test/evidence refinement within the authorized internal synthetic source-capture scope.

**문제:** The hash primitive already has unit-level known-vector and lazy-stream tests, and CAP-014 exercises a successful A-only source capture. The live path does not yet prove each actual adapter-emitted DICOM byte stream equals the generated synthetic fixture, that the persisted aggregate digest is independently reproducible from that fixture, or that the prior stream is completely consumed before another instance stream opens. Do not expose the digest/UID to a route or client; validate it only inside the test boundary.

**채택 권고안:** Extend the existing isolated successful source-capture scenario with a test-only non-retaining observer around `retrieveInstanceStream`. It records per-instance byte count and incremental SHA-256, open/completion order, chunk count, and maximum concurrent open streams; it never stores payload bytes. Compare each observed hash/length to the local deterministic synthetic CT manifest, independently recalculate the documented `SHA256-MANIFEST-V1` aggregate from the fixture's per-instance hashes/UIDs/lengths, and compare it with internal pending evidence `algorithm`, `source_digest`, and `source_object_count`. Assert the operation-bound Study is the only metadata source; A is the only configured HTTPS origin; each stream is fully read before the next opens; maximum concurrency is one; `CREATED` + one `SOURCE_CAPTURE/PENDING` + fixed success Audit remain; response/Audit expose no DICOM payload, digest, UID or PatientID; zero B/STOW/destination calls; and cleanup/stack preservation. Review builder/service/adapter for no whole-study concatenation or filesystem spill dependency. Existing hash-unit Acceptance remains responsible for fixed ceilings and cancellation; this positive live test makes no 2-GiB performance claim. Change production code only if a concrete assertion fails and only within these invariants.

**대안·선택 이유:** Trusting the prior live success test does not prove digest correctness or sequential completion; buffering/cloning payload in the observer would undermine the streaming invariant; exposing a digest via new API or product telemetry would expand scope; RSS measurement is nondeterministic. Use streaming observation and independent fixture-derived expected values instead.

**구현·검증 결과 (2026-10-02):** Test-only non-retaining stream observer와 순차 lifecycle 단위 검증을 추가했다. `npm run test:api -- --reporter=dot`는 API build와 34 files/601 tests로 통과했다. 전체 `./scripts/test-int001-source-capture.ps1`는 CAP-005의 empty-metadata 하위 테스트에서 고정된 `ACTOR_TENANT_CONTEXT_UNAVAILABLE` / DB COMMIT 실패로 종료 코드 1을 반환했다. 따라서 CAP-007 live Acceptance는 PASS가 아니다. 해당 실행에서 임시 자원 정리와 기존 `mediq` 스택 보존은 성공했다. 원인이 해결될 때까지 CAP-005 반복 실패를 재실행으로 덮지 않고 진단한다.

**판정:** CAP-007 권고안과 Acceptance는 승인 범위 안에서 유지하지만, live integration 결과는 `PARTIAL`; independent CAP-007 PASS 주장 금지. 새 제품 코드·route·schema·grant·STOW·destination 동작은 추가하지 않았다. 다음 작업은 CAP-005 Tenant-context COMMIT 오류 원인 분석이며, 수정 필요 시 권고·Acceptance와 증거를 먼저 갱신한다.

### 13.11 CAP-005 recurring Tenant COMMIT failure diagnosis (recommendation recorded before diagnostic changes)

**Decision / authority:** `INT-001-CAP-005-RCA-001`, adopted under standing `PDEC-001`, within existing CAP-005/INT-001 synthetic verification. Supplemental Acceptance `TC-INT-001-CAP-005-RCA-001` was added before modifying the diagnostic harness.

**Observed failure:** The latest full isolated runner returned `ACTOR_TENANT_CONTEXT_UNAVAILABLE` with safe marker `CAP005_EMPTY_UNEXPECTED_UNAVAILABLE_M0_I0_RNONE_CACTOR_TENANT_CONTEXT_UNAVAILABLE_DBCOMMIT_ERROR`. The failure occurs before metadata or instance WADO. The current wrapper stores query label plus SQLSTATE or generic error name, so it cannot distinguish a driver timeout/connection fault from a generic error without exposing raw details.

**Adopted recommendation:** Change only the integration-test database wrapper to classify the failure from a strict allowlist: static SQL stage, valid PostgreSQL SQLSTATE, allowlisted driver error code/class, and known fixed-message category; optionally record a coarse duration bucket. Never log raw message, stack, SQL parameters, DSN/endpoint, environment values, identifiers, payload or credentials. Preserve all service/DB transaction code, timeouts, config, privileges, fixture, no-retry stability rule, and disposable topology. After the Acceptance update, make one fresh full isolated runner invocation without retries. A pass is diagnostic only and does not close CAP-005; a failure requires cause-specific investigation before any behavior/config correction.

**Alternatives and reasons:** An unchanged rerun gives no added evidence and risks masking recurrence; raw database/stack logging can leak identifiers or connection material; changing production COMMIT handling, timeout, pool behavior, or retries before identifying the error is unsupported and risks the fail-closed transaction invariant. The allowlisted test-only classifier is the smallest safe diagnostic.

**Acceptance / impact:** Only test harness and evidence, `CAPSTONE-P0`, synthetic Test Orthanc A/B and disposable PostgreSQL. No product/runtime/API/schema/grant/security behavior change, no new endpoint, no retry, and no external environment mutation. Acceptance requires one attempt, sanitized classified phase, no raw/sensitive fields, exact exit, cleanup and existing-stack preservation; a pass leaves CAP-005 open until its three-consecutive-run threshold is independently met.

**Diagnostic harness verification:** `npm run test:api -- --reporter=dot` passed API build and 35 files/605 tests, including four tests for SQLSTATE/driver allowlists, exact-message categorization, no raw-text disclosure, and coarse duration buckets. The first isolated runner attempt exited at module load because the dedicated Docker test target omitted the new helper; no DB diagnostic ran. The Acceptance was updated before adding the helper's explicit COPY to the test-only Docker target. The corrected diagnostic run passed 31/31, with independent Audit/evidence observer PASS, B EMPTY before/after, cleanup and existing-stack preservation. The first subsequent stability run also passed 31/31 with the same safeguards. The second stability run stopped at the first failure: `QUERY_READ_TIMEOUT` on Tenant-context `COMMIT`, coarse duration `GTE1000MS`; no PostgreSQL SQLSTATE or WADO request was observed. The local installed node-postgres source and pool configuration confirm its client-side query timer is set to 1,500 ms. The immediate timeout mechanism is identified; the underlying database/host/storage latency cause is not.

### 13.12 CAP-005 COMMIT timeout bounded-response implementation

**Decision / authority:** `INT-001-CAP-005-TIMEOUT-001`, adopted under standing `PDEC-001` within the existing CAPSTONE-P0 transaction and CAP-005 scope. `TC-INT-001-CAP-005-TIMEOUT-001` was added before any runtime change.

**Recommendation:** Override only the verified Tenant transaction's `COMMIT` query with `query_timeout=5000`; retain the 1,500 ms connection timeout and pool default query timeout. Keep all other transaction commands, fail-closed mapping, client discard, and no-retry behavior unchanged. A timeout after COMMIT was sent is outcome-ambiguous; do not infer rollback or automatically retry.

**Implementation:** `ActorTenantContextService` now sends only `COMMIT` as a node-postgres per-query config with `query_timeout: 5000`. Pool `connectionTimeoutMillis` and default `query_timeout` remain 1,500 ms; other transaction commands remain text queries. The existing fail-closed catch path is unchanged: it attempts rollback where possible, discards the client after COMMIT failure, exposes only generic unavailable, and never retries.

**Verification (2026-10-02):** `npm run test:api -- --reporter=dot` exited 0 (API TypeScript build; 35 files / 606 tests). Added unit coverage proves the 5,000 ms override applies only to COMMIT; the negative path returns generic unavailable, attempts rollback, discards the client, and issues exactly one COMMIT. Three consecutive fresh `./scripts/test-int001-source-capture.ps1` runs each exited 0 with 31/31 tests, independent Audit/evidence observer PASS, B EMPTY before/after, zero STOW/destination calls, temporary cleanup and existing-stack preservation. CAP-005 and `TC-INT-001-CAP-005-TIMEOUT-001` are `PASS (scoped)` in this synthetic environment.

**Residual risk:** The larger client deadline prevents the observed 1.5 s client timer from prematurely failing these three runs; it does not identify or fix underlying database/host/storage latency, guarantee commit outcome after any future timeout, or establish a production DB SLO. Keep no-retry and client-discard behavior; a timeout after sending COMMIT remains outcome-ambiguous.

### 13.13 CAP-007 streaming-path static review and repeated live evidence

**Static review (2026-10-02):** `buildSourceIntegrityManifest` opens and consumes instance descriptors serially; it retains only each object's UID bytes, byte count and 32-byte digest until the final manifest, not DICOM payload. The authorized capture service supplies a lazy WADO stream opener and does not aggregate study bytes or write them to disk. The Orthanc adapter delegates multipart parsing to `@ubercode/multipart-stream`, sets `maxParts=1`, `maxPartBytes=64 MiB`, bounded part headers and total/idle deadlines; the adapter returns a stream to the hash builder. Its bounded JSON helper buffers only DICOM metadata (up to 8 MiB), not instance payload. No study-sized DICOM `Buffer.concat`, filesystem spill or disk dependency exists in this builder/service/adapter path. The parser uses a `PassThrough` for a single part; memory use may include buffering up to the configured 64 MiB per-instance cap, so this review makes no constant-memory or 2 GiB performance claim.

**Verification:** The corrected CAP-005 timeout gate produced three consecutive fresh isolated runner passes, each 31/31; the CAP-007 positive path and non-retaining observer passed within each run. Independent Audit/evidence observer, exact evidence result, B EMPTY before/after, no STOW/destination calls, temporary cleanup and preservation of the pre-existing stack passed each time. CAP-007 is `PASS (scoped)` for synthetic internal source streaming/manifest evidence only; production PACS, high-volume memory behavior, destination verification and full A→B transfer remain unproven.

### 13.14 CAP-008 WADO failure, cancellation and deadline paths

**Decision / authority:** `INT-001-CAP-008-REC-001`, adopted under standing `PDEC-001` within the existing `CAPSTONE-P0` internal source-capture scope. `TC-INT-001-CAP-008` was approved before the CAP-008 test/implementation changes.

**Implementation:** Added manifest-builder and service failure matrices for body read failure, invalid media type/SOP UID, content-length and configured-cap violations, caller cancellation, and the fixed total deadline. Service behavior remains fail-closed: generic unavailable, fixed minimized failure Audit only where verified Tenant/operation context resolves, no pending evidence or success Audit, and no operation transition. The isolated HTTPS A harness injects failure after a small synthetic DICOM prefix without modifying the stored Orthanc object.

**Defect found and fixed:** The first post-change isolated runner hung on the mid-body injection. The multipart parser reports an outer WADO response error through its async iterator while the current part `PassThrough` may remain open. `nodeReadableToWebStream` previously waited only on the part reader, so the parser-level failure could leave the consumer awaiting indefinitely. The adapter now races part reads against iterator failure, destroys/cancels the active path, maps the failure to its fixed stream error, and releases the stream slot. A focused adapter regression test covers an outer-body error after the DICOM part starts. The interrupted test project was explicitly cleaned; the existing `mediq` stack remained unchanged. That unsuccessful run was not counted toward the stability gate.

**Verification (2026-10-02):** `npm run test:api -- --reporter=dot` exited 0; API TypeScript build passed; 35 test files / 614 tests passed. Three consecutive fresh `./scripts/test-int001-source-capture.ps1` runs each exited 0 with 31/31 tests, independent Audit/evidence observer PASS, active instance stream count returning to zero, no partial evidence or success Audit, operation remaining `CREATED`, B EMPTY before/after, zero STOW/destination calls, cleanup PASS and existing-stack preservation. No in-run retry occurred.

**Judgment / residual risk:** `TC-INT-001-CAP-008` is `PASS (scoped)` for the synthetic internal failure/cancellation/deadline paths. This does not prove all real PACS/network fault modes, production 30-minute timing, destination verification, STOW, or full A→B behavior. CAP-009~012 and product/transfer gates remain open.

## 14. 현재 체크포인트 판정

```text
Ticket: MEDIQ-INT-001
Scope: INT-001-DEC-003 authorized synthetic source-capture sub-gate; CAP-001~008 and CAP-013/014 scoped Acceptance; CAP-009~012 remain open
Changed: server-derived operation scope; resolved-session-fence executor; A-only WADO capture and bounded hashing; exact HTTPS origin/Auth observations and caller endpoint/credential override rejection; duplicate-SOP metadata rejection; destination mapping checks; fixed Audit events; pending evidence + Audit application transaction; mocked and isolated integration test matrix; exact permanent-grant migration; PostgreSQL/RLS Acceptance; CAP-005 COMMIT-only query deadline and fail-closed unit coverage; CAP-007 non-retaining stream observer, sequential lifecycle test, static review; CAP-008 stream-failure propagation fix, failure/cancel/deadline matrix and synchronized records
Not changed: HTTP/OpenAPI; PACS import coordinator; operation-state transition; STOW; destination verification; full A→B flow
Security impact: exact runtime column privileges/Tenant RLS and CAP-001~006/014 boundaries are verified only in disposable PostgreSQL/Test Orthanc; no forbidden-origin/STOW/destination call; B remains empty; scope is synthetic and internal-only
Tests executed: API build + 35 files/614 tests; COMMIT-only timeout unit assertions including fail-closed negative; three consecutive fresh CAP runners 31/31 each for CAP-005/007/008 as recorded, with observer/B/cleanup/stack safeguards; CAP-007 static no-study-aggregation/no-disk-spill review; CAP-008 active-stream/error propagation regression; historical AppConfig 11/11, TLS/DICOM 7/7, migration consistency, 6 migration-runner tests and DB-008 full gate including 236-column runtime privilege inventory/regressions
Tests not executed: CAP-009~012 complete-service Acceptance; product HTTP path; production/client-ingress TLS; destination comparison/verification; STOW and full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: CAP-001~008/013~014 are scoped synthetic local evidence, not production PACS or public product validation; CAP-005's 5 s COMMIT deadline is a mitigation and does not establish underlying DB/host/storage latency or production SLO; a future timeout after COMMIT submission remains outcome-ambiguous; single-instance parser buffering is bounded at 64 MiB but high-volume memory/performance is unproven; static review found an unfixed duplicate-detection defect in destination verification (`Set.add()` predicates); real PACS failure modes, CAP-009~012, destination comparison/completion gate and full P0 remain open
Status: PARTIAL
```
