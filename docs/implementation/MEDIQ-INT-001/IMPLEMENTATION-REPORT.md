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
| `tests/api/source-integrity-manifest.test.mjs` | 12 positive/negative deterministic stream tests |
| `services/api/src/integrity/persistence/*`, `services/api/src/database/schema/integrity.ts`, `services/api/src/database/migrations/0021_source_integrity_operation_binding.sql` | Internal pending-only operation-bound persistence and database binding constraints |
| `tests/api/source-integrity-evidence-repository.test.mjs`, `tests/database/source-integrity-evidence-runtime.integration.test.mjs` | 6 repository unit tests and synthetic PostgreSQL/RLS/exact-grant Acceptance |
| `tests/integration/authorized-source-capture.orthanc.integration.test.mjs`, `scripts/test-int001-source-capture.ps1`, `scripts/seed-int001-source-capture-fixture.mjs`, `scripts/seed-int001-temporary-orthanc-a.mjs`, `scripts/probe-int001-temporary-orthanc-b-empty.mjs`, `scripts/verify-int001-source-capture.mjs` | CAP-014 real PostgreSQL/RLS + A WADO integration, synthetic-only fixture lifecycle, B read-only observer and cleanup-safe isolated runner |
| `scripts/test-db-007-evidence.ps1`, `scripts/test-db-008-full-schema.ps1`, `services/api/Dockerfile` | Updated schema inventory/regression and integration-test image wiring |
| `docs/ACCEPTANCE-TESTS.md` | Hash, persistence, and 14 source-capture Acceptance cases; CAP-013/014 scoped PASS |
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
- API build/full regression: `PASS` (34 files / 584 tests)
- Hash suite: `PASS` (12/12); source-evidence repository suite: `PASS` (6/6)
- API typecheck and Drizzle migration consistency: `PASS`
- DB-008 full clean/reset/reapply, catalog/RLS, new source-evidence integration and DB-002~007 regressions: `PASS`; see `TEST-EVIDENCE.md`
- `TC-INT-001-CAP-013~014`: `PASS` within exact scopes, including isolated PostgreSQL/RLS + real HTTPS Test Orthanc A WADO, denied/failure/success paths, Audit/evidence observer, B empty before/after, cleanup and persistent-stack preservation
- CAP-001~012 as complete Acceptance, destination comparison, product route, STOW, destination verification and A→B E2E: open/not run; see explicit limits in `TEST-EVIDENCE.md`

## 8. 변경하지 않은 사항

- All `AGENTS.md` authorization, tenant, source-of-record, Audit and no-STOW boundaries remain unchanged.
- The builder/repository are not themselves a public route. An internal source-capture service is registered behind the verified authorization boundary; CAP-014 invoked it only against disposable Test Orthanc A and temporary PostgreSQL. Test setup wrote only the committed synthetic fixture to temporary A; the service issued no B request, STOW or destination-verification call.
- All CAP-014 resources were removed after verification. The runner confirmed existing `mediq` containers, volumes and networks were unchanged. No patient data, production environment or operational credential was used.

## 9. 결정 및 예외

- Adopted `INT-001-DEC-001` under standing `PDEC-001`; see [Policy Decision Log](../../POLICY-DECISION-LOG.md#int-001-dec-001--bounded-source-integrity-manifest-primitive).
- Adopted `INT-001-DEC-002` under standing `PDEC-001`; its initial scope was the persistence foundation. Later `INT-001-DEC-003` separately authorized the synthetic/Test-only internal source-capture service and CAP-014 verification.
- Existing P0 limits are hard ceilings; an invocation may narrow them for a constrained context but cannot raise them.
- The end-to-end source evidence workflow must be separately authorized and integrated with Audit/Provenance before PACS import.

## 10. 잔여 위험과 후속 작업

- The internal source-capture service obtains bytes from configured Test Hospital A after DB-backed authorization in the verified test environment. No public/product route or production endpoint is wired; synthetic CAP-014 does not establish production source authenticity or operational PACS readiness.
- CAP-014 demonstrated failure Audit and pending-evidence behavior against real temporary PostgreSQL. Remaining CAP-001~012/complete atomicity Acceptance, destination comparison and terminal `FAILED`/completion enforcement are not all closed by that sub-gate.
- 2 GiB/64 MiB limits have not been performance-benchmarked on a 2 GiB study or production-like workload.
- Follow-up: close remaining CAP-001~012 Acceptance gaps with evidence; then separately implement destination verification and completion enforcement under a new recommendation/Acceptance gate. Keep STOW disabled until full Preflight and product no-STOW/B-unchanged negatives pass.

## 11. 최종 판정

```text
Ticket: MEDIQ-INT-001
Scope: Bounded hash + operation-bound pending evidence foundation; internal synthetic/Test-only authorized source-capture sub-gate; CAP-013/014 scoped Acceptance
Changed: SHA256-MANIFEST-V1 builder; operation-bound persistence and permanent exact grants; verified-Tenant/session-fence source-capture service; real A-only HTTPS WADO integration harness; isolated Compose runner, synthetic fixture/DB setup, B empty probe, read-only Audit/evidence observer; synchronized records
Not changed: public route, Viewer/Download, PACS import coordinator, STOW, destination verification/comparison, transfer completion, full A→B E2E
Security impact: fail-closed Authorization and PatientMapping gates; exact runtime/RLS and transaction-outside-WADO boundary verified in disposable environments; B is unreachable to the service container; no claim beyond CAP-014
Tests executed: API regression 34/584; hash 12/12; evidence repository 6/6; typecheck; migration consistency; DB-008/DB-002~007; CAP-014 four tests + Audit/evidence observer + B empty before/after + cleanup; see TEST-EVIDENCE.md
Tests not executed: remaining CAP-001~012 end-to-end scenarios, product import/API path, destination comparison, STOW/no-STOW product coordinator, live destination verification, full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: CAP-014 uses synthetic data and disposable local services; no public/production source path, destination verification or completion gate; remaining CAP-001~012 and production-like workload benchmark open
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

## 13. Authorized Source-Capture Sub-gate — CAP-014 Checkpoint

Decision and Acceptance were recorded first in `INT-001-DEC-003` and `TC-INT-001-CAP-001~014`. The implementation scope for this continuation is internal-only and synthetic/Test-only: operation-derived scope, exact fenced `PACS_IMPORT` authorization, destination PatientMapping / per-instance PatientID equality, configured A-only HTTPS WADO, bounded sequential hash with the 30-minute total deadline, fixed minimized Audit events, atomic pending evidence + success Audit, and exact permanent runtime column grants. There will be no HTTP/OpenAPI route, B call/STOW, operation state transition, destination verification, or full-P0 claim.

Before the CAP-014 integration changes, the test strategy and acceptance boundary were recorded in §13.3. The mocked API tests, exact permanent privilege/RLS database sub-gate, and isolated real Test Orthanc A/B source-capture gate now pass within scope. `TC-INT-001-CAP-013~014` are PASS; CAP-001~012 and the full PACS workflow are not thereby accepted.

### 13.1 Implemented in this checkpoint

- `AuthorizationGatedOperationExecutor.executeWithResolvedSessionFence` resolves server-owned scope inside the verified Tenant transaction, then acquires the shared Session fence and evaluates the exact Authorization context.
- `PostgresSourceCaptureScopeRepository` derives operation → Session → Study reference → package bindings from the Tenant-visible operation graph.
- `AuthorizedSourceCaptureService` is registered as an internal provider only. It enforces the Test A → Test B binding, `PACS_IMPORT`, `CREATED` operation state, destination PatientMapping, Study/Series/Instance count checks, per-instance PatientID equality, bounded sequential hash, a fixed 30-minute total deadline, and a second fenced authorization/mapping check before pending evidence + success Audit.
- Source-capture Audit event/result/reason combinations are allowlisted. No HTTP route, OpenAPI change, STOW call, B-side write, operation state transition or destination verification was added.
- New unit tests cover the executor transaction/fence sequence, mocked source-capture allow/deny/failure/concurrency and audit allowlist. API build and the 34-file/584-test API suite pass.

### 13.2 Database and CAP-014 sub-gates verified; full PACS integration remaining

- Added `0022_authorized_source_capture_column_grants.sql`: `integrity_evidence` exact 12-column SELECT + 12-column INSERT; `study_references` exact 6-column SELECT including the three capture-scope fields; no UPDATE/DELETE.
- Disposable PostgreSQL/RLS Acceptance passed for operation-bound pending evidence, exact replay/conflict, rollback, no Tenant context, cross-Tenant isolation, late first-write denial, exact persistent privilege inventory (236 total), and the DB-008 reset/reapply path. This exercises the evidence repository, not the complete application service's Audit/evidence atomicity.
- DB-008 confirmed runtime is non-owner/non-superuser/NOBYPASSRLS, no table-wide/PUBLIC/DDL grants, 17 forced-RLS tables, exact 236 column privileges, and all DB-002~007 regressions.
- `./scripts/test-int001-source-capture.ps1` passed: temporary PostgreSQL with real runtime role/migrations/RLS, real HTTPS A WADO, invalid-Grant denial, authorized source-body failure without evidence, success with one pending evidence row, exact Audit observer results, B EMPTY before/after, and cleanup preserving the persistent `mediq` resource inventory.
- `TC-INT-001-CAP-013~014` are PASS for exact privilege/RLS and effect-boundary scopes. CAP-001~012, destination comparison, product import route, STOW and full P0 remain open. This Ticket remains `PARTIAL`, not full source-capture/P0 PASS.

### 13.3 CAP-014 test-strategy recommendation (recorded before integration changes)

**Recommendation:** run the complete source-capture service against a uniquely named, disposable Compose project on every invocation. The service under test uses the real `mediq_runtime` PostgreSQL role, migrations, Tenant RLS, Consent/Grant evidence, operation/session fence, Audit/evidence transactions, and the real HTTPS Test Orthanc A adapter. Its container is attached only to the temporary `database` and `hospital-a` networks. It seeds only the committed synthetic CT fixture into the temporary A volume as test setup, then tests denied, source-read-failure, and successful capture paths. A separate read-only probe, attached only to `hospital-b`, asserts the temporary B store is empty before and after. The runner validates Compose ownership and removes only the random project’s containers, networks, and volumes.

**Alternative considered:** reuse the persistent local `mediq` stack or run only the existing DICOM adapter suite. Reusing the persistent stack risks coupling the test to user data/state; adapter-only tests do not exercise the application authorization/fence/evidence boundary. A synthetic in-memory database harness is also insufficient for the intended CAP-014 gate because it cannot prove real Tenant RLS or database transaction closure.

**Rationale and impact:** isolated resources preserve existing development state; real runtime credentials exercise the permanent least-privilege grants; the test container cannot reach B at the network layer; the observer cannot write B because its test code issues only authenticated GETs. Setup-time writes are confined to synthetic data in disposable Test Orthanc A. No public route, production endpoint, B STOW, destination verification, state transition, real patient data, or operational PACS credential is introduced.

**Acceptance and limits:** the test must show no A WADO before a real DB-backed initial `PACS_IMPORT` authorization is committed; an invalid Grant makes zero A WADO requests; the authorized failure path creates no pending evidence/success Audit; success creates exactly one operation-bound `SOURCE_CAPTURE/PENDING` and success Audit while the operation remains `CREATED`; no database transaction remains open during WADO headers or stream consumption; B is empty before/after and unreachable to the service container. The evidence proves this source-capture boundary only, not the later destination/STOW/full-P0 workflow. This is an implementation/test strategy under the already accepted `INT-001-DEC-003` and `TC-INT-001-CAP-014`, not a scope expansion.

## 14. 현재 체크포인트 판정

```text
Ticket: MEDIQ-INT-001
Scope: INT-001-DEC-003 authorized synthetic source-capture sub-gate; CAP-013/014 scoped Acceptance
Changed: server-derived operation scope; resolved-session-fence executor; A-only WADO capture and bounded hashing; destination mapping checks; fixed Audit events; pending evidence + Audit application transaction; mocked and real isolated integration tests; exact permanent-grant migration; PostgreSQL/RLS Acceptance and synchronized records
Not changed: HTTP/OpenAPI; PACS import coordinator; operation-state transition; STOW; destination verification; full A→B flow
Security impact: exact runtime column privileges/Tenant RLS and CAP-014 source effect boundary are verified in disposable PostgreSQL/Test Orthanc; no B network access/write; scope is synthetic and internal-only
Tests executed: API build + 34 files/584 tests; migration consistency; 6 migration-runner tests; DB-008 full gate exit 0 including 236-column runtime privilege inventory and regressions; CAP-014 runner exit 0, 4/4 tests, Audit/evidence observer, B empty before/after, isolated cleanup
Tests not executed: remaining CAP-001~012 end-to-end Acceptance; product HTTP path; destination comparison/verification; STOW and full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: synthetic local CAP-014 is not production PACS or public product validation; remaining CAP-001~012, destination comparison/completion gate and full P0 are open
Status: PARTIAL
```
