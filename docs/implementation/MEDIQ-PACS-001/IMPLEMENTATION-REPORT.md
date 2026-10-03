# MEDIQ-PACS-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-001` |
| 제목 | PACS Import coordinator prerequisites — identity/fence, source-integrity handoff and encrypted spool/quota sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일/최종 갱신 | `2026-10-03` (최초 작성 2026-10-01) |
| 상태 | `PARTIAL` — R4 actual lifecycle 51/observer/B EMPTY/cleanup PASS; R5 preparation/unit 64 PASS, actual R5 NOT RUN; combined script 91/readiness 10 PASS; diagnostic DB rerun 51950 live; evidence §§41–46 |

## 1. 목표 및 판정 범위

**Latest user-requested checkpoint (2026-10-03, 18:16 KST; supersedes current labels below):** R5 read-only live-state observer, strict projections and source-test wrapper hooks are prepared; privacy unit 64 plus replica/Grant checks total **91 PASS**, readiness **10 PASS**, JS/PowerShell syntax and diff checks PASS. Actual R5 integration has not run; the earlier 51-test R4 result is not R5 evidence. DB rerun 51950 remains live and its inputs are frozen. This checkpoint changes tests/scripts and records only, not product code, permissions, runtime wiring or STOW. Commit/push is explicitly user-requested. Full raw-log privacy, remaining lifecycle and P0 gates remain open. Evidence §§45–46; status **PARTIAL**.

**Current R4 verification (2026-10-03):** Independent replica scenario passed in the actual 51-test source suite, with separate DB/B observers and owned cleanup. It proves a replica has no usable DEK and can perform only authorized purge recovery, not host-crash recovery. Full DB session 6711 failed separately; diagnostic rerun 51950 is live. Full lifecycle/P0 remain open; §43–44.

**Current status (2026-10-03, supersedes historical checkpoints below):** DEC-017-R4 actual signed-OIDC/PostgreSQL/RLS/HTTPS-Orthanc matrix: **51 tests PASS**, 16 lifecycle scenarios, independent observer/17 purge Audits/zero quota, B EMPTY before/after and owned cleanup PASS (§43). A distinct Node replica passed real authorization but had no DEK (RECOVERY_REQUIRED); authorized purge blocked the original handoff afterward. Runner protocol **12**, Grant diagnostic **15**, serial API **43 files/893**, type/Port checks PASS. Full DB run 6711 failed GRT-003 rollback with an unproven inner cause (§41); diagnostic-only rerun **51950** is live, not accepted (§44). Earlier failures remain recorded. Complete mapping/actor mutation/privacy/lifecycle, runtime/full coordinator/Preflight/STOW/destination verification/P0 E2E remain open; no runtime activation or STOW. Ticket **PARTIAL**.

**Historical user-requested Git checkpoint (2026-10-03, superseded):** Preserve the completed DEC-014/015 work and DEC-016 recommendation/Acceptance only; DEC-016 implementation had not started at that checkpoint. Commit-time API build/regression passed 40 files/732 tests, with typecheck and DICOM Port contract passing. See [evidence §28](TEST-EVIDENCE.md#28-user-requested-git-checkpoint). This checkpoint does not close MEDIQ-PACS-001 or enable runtime storage/STOW.

```text
Ticket: MEDIQ-PACS-001
Scope: User-requested commit/push of existing work and current verification evidence
Changed: Preserve adapter backpressure/cancellation fixes, pinned local EOF patch, tests, scoped results and DEC-016 pre-implementation documents
Not changed: No additional product implementation, schema/grants, runtime activation, cleanup worker or destination/STOW calls
Security impact: Existing limits and fail-closed boundaries preserved; local dependency maintenance risk remains
Tests executed: API build and 40 files/732 tests PASS; API typecheck PASS; DICOM Port contract PASS; git diff --check PASS
Tests not executed: No new scratch DB, maximum-workload, Docker image, Orthanc or product E2E run for this Git checkpoint
Evidence: TEST-EVIDENCE.md section 28; earlier heavyweight results remain in section 26
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: DEC-016 SERVICE cleanup is design-only; privacy, runtime, coordinator, Preflight/STOW and product E2E remain open
Status: PARTIAL
```

**DEC-016 implementation record opened:** STAGE-010 recommendation and CLEAN-001~008 are recorded before code. Add bounded expired-target discovery, SERVICE/expiry revalidation in the existing TTL purge path and an internal per-Tenant batch runner, with unit and real scratch PostgreSQL/ciphertext evidence. No runtime activation, migration/grant change or STOW. Results pending; prior scoped gates remain historical evidence.

**Current result (DEC-014/015, supersedes historical checkpoints below):** [Evidence §26](TEST-EVIDENCE.md#26-dec-014-implementation-and-integrated-workload) records the corrected adapter, reproducible MIT-derived local EOF patch and all red/green results. STAGE-005 and STAGE-009 are scoped PASS; API 40 files/732 tests, typecheck/Port contract, exact integrated workload/cleanup and network-disabled runtime-image module resolution pass. No real PACS/clinical DICOM, runtime storage, worker, route, Preflight/STOW or product E2E was enabled. Next STAGE-010 SERVICE cleanup. Full Ticket remains PARTIAL.

**Historical commit checkpoint (2026-10-03, superseded by §26 evidence):** [TEST-EVIDENCE.md §25](TEST-EVIDENCE.md#25-dec-013014-current-commit-checkpoint) supersedes all older current-status notes below. DEC-013 is implemented: private authenticated reads, one-active/eight-waiter borrowed lifetime, explicit pre/post `VERIFIED` checks and zero-before-release. Commit-time lifetime tests 21/21 and typecheck pass; the revised exact 2 GiB/2,000-object primitive workload passed with cleanup. The new actual-adapter backpressure regression fails (8 MiB read ahead versus 512 KiB allowance); its fix is not included. The earlier 39-file/722-test API PASS predates that failing test. Full STAGE-005/009 and this Ticket remain PARTIAL; runtime and STOW stay disabled.

```text
Ticket: MEDIQ-PACS-001
Scope: User-requested intermediate Git checkpoint of DEC-012/013/014 work
Changed: Borrowed plaintext lifetime boundary; workload/concurrency/lifetime/cleanup tests; recommendation, Acceptance and implementation evidence
Not changed: Adapter fix, dependencies, schema/grants/OpenAPI, runtime provider/worker/volume, public routes, destination calls or STOW
Security impact: Internal authenticated buffer lifetime strengthened; real runtime authorization remains required and unimplemented here
Tests executed: Typecheck PASS; lifetime 21/21 PASS; exact 2 GiB/2000-object consumer workload and cleanup PASS; adapter concurrency 3 PASS/1 FAIL
Tests not executed: Full API after the new failing regression; integrated FLOW-002/003; product E2E; current scratch wrapper final exit/cleanup not confirmed
Evidence: TEST-EVIDENCE.md section 25 (older API 722 PASS is pre-FLOW-001 only)
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Known FLOW-001 buffer read-ahead failure, pending DB wrapper and downstream activation/transfer gates
Status: PARTIAL
```

**DEC-013 implementation record opened (before code):** DEC-012 maximum primitive workload completed with exact 2 GiB/2,000 objects and cleanup; see evidence §24. Next implement the approved borrowed authenticated-buffer lifetime and required verifier hooks, with LIFE-001~008 tests and an updated maximum workload. Raw read has no runtime callers; this remains a non-authorizing, unregistered internal API and does not implement PACS dispatch.

**Historical DEC-012 execution checkpoint (superseded):** [TEST-EVIDENCE.md §23](TEST-EVIDENCE.md#23-dec-012-execution-and-test-cleanup-correction) supersedes earlier test counts/current-state descriptions below, including the §11 commit checkpoint. Adapter concurrency (3/3), cooperative cancellation (1/1) and standalone API (38 files/701 tests) pass. The maximum workload initially timed out; its corrected-budget rerun and the unchanged DEC-011 scratch wrapper remain running. No overall STAGE-005/009 PASS. Production runtime is unchanged; the earlier DB wrapper PASS applies to DEC-010, not this live run.

`PACS-001-DEC-002/003`에 따라 byte-preserving P0 transfer의 필수 source DICOM PatientID binding과 operation-time Authorization race 방지의 no-side-effect 선행 slice를 구현했다. 모든 synthetic source instance ID가 caller/application이 전달한 서버 검증 destination mapping ID와 canonical exact match일 때만 `IDENTITY_MATCHED`를 반환한다. PACS eligibility gate는 verified Tenant transaction 안에서 공통 ExchangeSession fence를 먼저 획득한 뒤 Consent/Grant/Study evidence를 다시 평가한다. 두 판정 모두 Authorization/Import permission 또는 STOW dispatch 승인이 아니다.

이 Ticket은 전체 PACS Import coordinator를 완료하지 않았다. 구현은 **PARTIAL**이며 actual product no-STOW, live STOW 또는 A→B transfer를 주장하지 않는다.

## 2. 범위

### 포함

- P0 synthetic `TEST-*` PatientID allowlist, DICOM LO 최대 64자 기준.
- 비어 있지 않은 instance 집합의 각 ID를 검증된 destination mapping ID와 대소문자 변환 없이 정확 비교.
- 결과는 `IDENTITY_MATCHED + count` 또는 fixed non-identifying denial reason만 반환; ID 값은 결과에 포함하지 않음.
- WADO Study metadata parser가 모든 instance에 대해 정확히 하나의 `PatientID (0010,0020), VR=LO`를 읽고 internal typed metadata에만 투영.
- missing, wrong VR, multi-valued PatientID를 sanitized upstream invalid로 거부.
- A Test Orthanc의 합성 CT Study에 대해 read-only metadata 조회로 각 instance ID를 synthetic manifest mapping과 비교.
- Canonical `acquireExchangeSessionFence` utility를 추가하고 Authorization executor/PACS eligibility gate와 Consent·Grant mutation 경로에서 같은 transaction advisory lock을 사용.
- Fence를 획득한 뒤 `PACS_IMPORT` 정책 근거를 재조회하고 평가; fence failure는 protected callback 전에 sanitized unavailable/deny 처리.
- 실제 synthetic PostgreSQL 두 connection 통합시험에서 Grant 철회 직렬화, 철회 완료 후 거부, withdrawn Consent 거부, operation ledger의 비변경을 입증.
- `PACS-001-DEC-005` 범위의 internal-only coordinator handoff: hash된 동일 metadata descriptor로부터 최소 Series/SOP inventory 생성, 최종 fenced Authorization 및 operation/mapping 재검증 이후 pending evidence+success Audit transaction commit 뒤에만 반환.
- `PACS-001-DEC-006` 범위의 per-instance byte evidence handoff: 기존 sequential WADO stream에서 계산한 instance별 SHA-256·byte length를 exact server-derived Series/SOP identity에 결합하여 별도 coordinator-only handoff로 반환; 기존 aggregate manifest·DB schema·ordinary capture allowlist 불변.
- `PACS-001-DEC-008` 범위의 Study 단위 임시 payload lifecycle 기반: `study_references`에 storage ref/state/expiry/purged-at 네 열, 상태·shape CHECK와 cleanup/unique partial index를 추가하고, runtime role의 네 열 SELECT/UPDATE 권한만 migration에 부여.
- Verified Tenant transaction을 전제로 exact operation/Session/Package/Study/source binding을 확인하는 PostgreSQL metadata repository와 purge success Audit event rule을 추가. 이는 persistence primitive이며 아직 source capture, cleanup worker 또는 Nest runtime에 연결하지 않음.
- `PACS-001-DEC-009`에 따라 internal purge saga를 추가: verified Tenant runner에서 `PURGE_PENDING` 선커밋, in-memory DEK/nonce/tag zeroization 및 정확한 UUID ciphertext 경로 제거, 경로 부재 확인 후 `PURGED`+성공 Audit 원자 커밋, 재시작 후 DB-bound ref를 사용하는 purge-only 복구.
- `PACS-001-DEC-010` 구현 slice: quota singleton/package/reservation tables와 fixed definer functions, `settled` marker 및 narrow quota repository를 추가하고, reserved store는 매 write 전에 16 MiB reservation, seal 시 actual-byte settlement를 수행한다. Physical purge 후 `PURGED`+Audit transaction 안에서 quota release를 호출한다. SQL owner에 필요한 `temporary_payload_purged_at` SELECT만 추가했으며 runtime의 기존 244 column grants는 유지한다.

### 제외

- `PacsImportMappingGateService` 또는 API/controller에 validator를 연결하는 coordinator 구현, HTTP/OpenAPI route.
- Full coordinator, source-capture/Nest/runtime storage registration, cleanup worker, verified Tenant SERVICE scheduler, runtime-volume durability or `STOW_STARTED` transition.
- Product/runtime lifecycle is excluded. STAGE-005 quota/bounds/faults and STAGE-009 single-process streaming/lifetime are scoped PASS in evidence §26; host crash/durability, cross-process/global memory, scheduled Tenant SERVICE cleanup, active runtime Authorization and actual destination transfer remain unverified. ScratchOnly deliberately excludes persistent DB-002~007 regressions.
- PatientID를 DICOM payload에 rewrite하거나 수정하는 동작.
- STOW-RS, destination write/verification, actual no-STOW coordinator 증명, reconciliation.
- TLS/production PACS, real patient/PHI/credential 사용.
- 새로운 PACS operation state, route/controller/worker, DICOM write capability, destination verification invocation 또는 STOW dispatch.

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 결정 | `PDEC-001`, `PACS-001-DEC-001/002/003/004`, `PACS-007-DEC-001` | Recommendation/Acceptance-first; implemented identity/fence slices are no-side-effect only; DEC-004 defines but does not implement the full dispatch gate | Policy Decision Log; DEC-004 coordinator cases remain NOT RUN |
| 요구사항 | `REQ-PACS-003` | server-resolved destination mapping과 source instance identity exact binding | `TC-PACS-001-PID-001~003` |
| 보안 | `SEC-DICOM-006`, `SEC-AUTHZ-001/002`, `THR-017/019` | identity mismatch deny; fresh Consent/Grant query after shared fence; byte-preserving payload; no external exposure/rewrite | Domain/API + scratch PostgreSQL fence tests; product no-STOW remains NOT RUN |
| DICOM | `DICOM-INTEROPERABILITY-PROFILE.md` §§8.2, 10.2 | internal WADO metadata의 최소 per-instance PatientID 투영 및 검증 | Adapter tests + read-only Orthanc |
| Acceptance | `TC-PACS-001-PID-001/002`, `FENCE-001~005` | pure exact-match gate, metadata extraction and session-fenced fresh Authorization/denial/no-side-effect boundary | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |
| 정책 및 Acceptance | `PACS-001-DEC-005/006`, `TC-PACS-001-HANDOFF-001~007`, `TC-PACS-001-DIGEST-001~006` | ordinary capture allowlist 유지; hash에 사용한 exact inventory와 per-instance byte digest/length만 evidence/Audit commit 이후 in-memory coordinator result로 전달; denial/transaction failure 시 반환 없음; no route/state/STOW | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §§8–9 |
| 정책 및 Acceptance | `PACS-001-DEC-007`, `TC-PACS-001-STORE-CORE-001~007`, `TC-PACS-001-STAGE-001~012` | At the DEC-007 checkpoint, the spool core/exact-source seam and `STAGE-001` passed only in a local synthetic harness; later DEC-008/009 PostgreSQL and purge evidence is recorded separately below | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §10 |
| 정책 및 Acceptance | `PACS-001-DEC-008/009/010`, `TC-PACS-001-STAGE-005~008/013/014`, `TC-DB-008-REG-*` | DEC-008 metadata, DEC-009 physical purge/restart, scoped DEC-010 quota sub-gates and DB-008 `-ScratchOnly` whole-wrapper pass against disposable PostgreSQL/RLS and synthetic ciphertext; DB-002~007 persistent regressions were intentionally skipped | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §§11–14, 17 |

### 3.1 현 구현 단계 권고안 — exact WADO stream과 encrypted spool 연결

| 항목 | 결정 |
|---|---|
| 채택 권고안 | 승인된 내부 `captureForCoordinator()` 경로에서만 source integrity reader가 각 WADO 청크를 해시한 직후 `await` 가능한 제한된 staging sink에 전달한다. Sink는 같은 청크를 AES-GCM으로 암호화해 기록하고 source digest/length와 일치할 때만 instance를 확정한다. Study는 기존 순차 처리로 유지한다. |
| 고려한 대안 | `ReadableStream.tee()` 또는 별도 재조회는 빠를 수 있으나 소비 속도 차이로 버퍼가 무제한 증가하거나 해시한 바이트와 저장한 바이트가 달라질 수 있어 채택하지 않는다. DB metadata/RLS, quota admission, SERVICE cleanup, purge Audit가 없는 상태에서 API/Compose에 저장 경로를 등록하는 안도 채택하지 않는다. |
| 근거 | `PACS-001-DEC-007` 및 `STAGE-001/009`의 exact-byte, backpressure, one-instance-memory bound와 `AGENTS.md`의 source-integrity/no-side-effect 요구. `await` 기반 단일 청크 처리로 reader가 다음 청크를 읽기 전에 암호화 쓰기를 완료하게 한다. |
| Acceptance 및 완료 범위 | 이번 slice는 `TC-PACS-001-STAGE-001`의 synthetic authorized source-capture harness에서 같은 source stream의 SHA-256/length와 staged receipt를 대조하고, sealed spool read 결과의 byte equality를 검사한다. `STAGE-009`는 별도 최대 Study 성능·동시성 Gate로 남기며 이번 결과만으로 PASS하지 않는다. |
| 영향/경계 | Internal coordinator handoff에만 opaque in-memory `storageRef`와 per-instance object references를 추가할 수 있다. 기존 ordinary `capture()` 응답, DB/Audit schema, Consent/Authorization 의미, operation state는 유지한다. PACS module provider/route/worker/Compose volume에는 연결하지 않고, B write/STOW는 호출하지 않는다. |
| 잔여 위험 | 현재 primitive에는 DB metadata, multi-process quota, restart recovery, Tenant-RLS SERVICE cleanup 및 purge Audit/saga가 없다. 따라서 구현·unit PASS는 저장 lifecycle 또는 product activation을 뜻하지 않으며, downstream byte release는 여전히 금지한다. |
| 적용 권한 | 이미 기록된 `PACS-001-DEC-007`과 사용자의 상시 권고안 채택 지침 범위 안의 구현 세부 선택. 새로운 제품 범위나 보안 약화는 포함하지 않는다. |

### 3.2 현 구현 단계 권고안 — Study 단위 임시 payload metadata

| 항목 | 결정 |
|---|---|
| 확인 근거 | `imaging_packages`는 여러 `study_references`를 소유하고, `pacs_transfer_operations`는 `(exchange_session_id, study_ref_id)`별로 독립한다. 현재 source-capture seam도 operation이 선택한 한 Study만 spool한다. 따라서 package-level 단일 `storage_ref`는 동시 Study의 참조를 덮어쓰고, package `deleted_at/state`를 한 Study purge에 쓰면 sibling operation의 권한까지 바꿀 수 있다. |
| 채택 권고안 | `PACS-001-DEC-008`에 따라 `study_references`에 임시 저장 참조·상태·만료·확정 purge 시각 네 열만 추가한다. 다른 테이블은 추가하지 않는다. 저장 reference는 디렉터리를 만들기 전에 operation이 `CREATED`이고 동일 Tenant/Session/Package/Study 연결이 확인된 RLS transaction에서 먼저 예약한다. 한 operation의 active staging은 하나만 허용하고, 신규 재조회는 이전 payload가 PURGED이고 operation이 여전히 `CREATED`인 경우에만 허용한다. |
| 고려한 대안 | `imaging_packages` 재사용은 여러 Study가 공유하는 단일 포인터/state라 거부한다. 별도 payload table은 가능하지만 기존 `study_references` 행이 정확한 operation resource이므로 중복 관계를 늘려 거부한다. DB metadata 없이 filesystem만 기록하면 restart 및 unlink/Audit 실패에서 orphan 정리가 불가능하므로 거부한다. |
| Acceptance 및 완료 범위 | `TC-PACS-001-STAGE-006~008/010/013`: exact-column grants와 forced Tenant RLS, 같은 package의 두 Study 독립 staging/purge, 같은 operation 경쟁 거부, `STOW_STARTED` 이후 재조회 거부, ciphertext 삭제 전 `PURGED`/success Audit 금지, 오류 후 `PURGE_PENDING` 참조 보존 및 idempotent recovery, wrong-Tenant DENY. Clean migration UP/repeat/RESET/re-UP와 synthetic runtime-role Acceptance를 요구한다. 이 Acceptance 전 runtime store registration 및 downstream consumer는 금지한다. |
| 영향/경계 | Existing ImagingPackage/Consent/Grant 의미와 P0 18-table 개수는 유지한다. 메타데이터 열 4개, lifecycle CHECK 및 partial cleanup index만 추가한다. 공개 API, Worker endpoint, `PREFLIGHT_PASSED`, `STOW_STARTED`, destination call/STOW는 추가하지 않는다. |
| 잔여 위험 | per-Study metadata만으로 cross-process 10 GiB quota, 실제 scheduling/service principal, restart cleanup, encrypted volume operation 또는 physical erasure를 입증하지 못한다. 이들은 후속 `STAGE` gate다. |
| 적용 권한 | 사용자 상시 지침에 따른 recommendation-first 진행. `PACS-001-DEC-007`의 명시적 Schema Change Gate를 충족하는 현 모델 cardinality 증거이며 제품 범위·보안 불변조건은 확장하거나 약화하지 않는다. |

### 3.3 DEC-008 PostgreSQL Acceptance 실행 경계

| 항목 | 권고안 |
|---|---|
| 확인 근거 | `scripts/test-db-008-full-schema.ps1`은 disposable scratch DB의 clean/repeat/reset/re-apply 뒤에 DB-002~007 회귀를 실행하며, 해당 회귀가 실행 중인 영구 개발용 `mediq` DB에 pending migration을 적용한다. 이번 Acceptance는 새 migration의 runtime role/RLS를 확인하는 것이므로 persistent fixture DB 변경은 필요하지 않다. |
| 채택 권고안 | DB-008에 `-ScratchOnly` 실행 모드를 추가한다. 고유 Compose project와 폐기 가능한 PostgreSQL volume 안에서만 migration·catalog·runtime-role integration을 수행하고, DB-002~007 persistent regression 단계는 명시적으로 건너뛴다. 기존 `mediq` Compose project, 그 데이터 volume, Orthanc A/B는 시작·변경·삭제하지 않는다. |
| 고려한 대안 | 전체 DB-008을 바로 실행하면 기존 회귀도 검증되지만, 이번 스코프에 필요하지 않은 persistent development DB migration side effect가 동반된다. 별도 수동 SQL 검사는 재현성 및 runtime role/RLS 증거가 약해 채택하지 않는다. |
| Acceptance 및 경계 | `-ScratchOnly`는 fresh UP, repeat apply, reset/re-UP, exact 18-table/24-migration/catalog/grant inventory, StudyReference repository positive/negative/RLS/concurrency/Audit rollback cases 후 owned scratch resource cleanup을 모두 입증해야 한다. 실행 스크립트는 migration 이후 persistent `mediq` DB에 접속하지 않아야 한다. |
| 보안·운영 영향 | 이 모드는 test-harness 경계만 변경한다. `.env`는 Git-ignored인지 확인한 후 scratch 컨테이너 생성에만 쓰고, secret을 출력하지 않는다. 신규 test rows, triggers, grants 및 migration history는 disposable volume 밖에 남기지 않는다. PACS/Orthanc/실제 환자정보는 사용하지 않는다. |
| 적용 권한 | `PACS-001-DEC-008` 승인된 isolated PostgreSQL/RLS Acceptance와 `AGENTS.md`의 synthetic-only/test evidence 요건 안의 검증 구현 세부 선택. 제품 scope나 보안 invariant 변경은 없다. |

### 3.4 현 구현 단계 권고안 — physical purge saga와 restart recovery

| 항목 | 권고안 |
|---|---|
| 확인 근거 | `PACS-001-DEC-008` metadata/RLS Acceptance는 `PURGE_PENDING`과 Audit transaction만 증명한다. 실제 spool의 filesystem/key 처리와 verified Tenant repository를 묶는 coordinator가 없고, 재시작 시 저장소가 non-empty root 전체에 `RECOVERY_REQUIRED`를 반환해 DB-bound ref를 통한 purge-only 복구도 불가능하다. |
| 채택 권고안 | `PACS-001-DEC-009`에 따라 내부·미등록 purge coordinator를 구현한다. (1) server-owned operation graph를 검증하는 Tenant transaction에서 `PURGE_PENDING` commit, (2) active writes 취소/대기와 DEK/nonce/tag zeroization 후 UUID package 경로의 일반 `.enc` 파일만 안전하게 unlink, (3) 해당 경로 부재를 확인한 다음 별도 verified Tenant transaction에서 `PURGED`와 fixed success Audit를 원자적으로 commit한다. 중간 실패는 원 reference를 보존해 retry하며, restart 경로는 복호화 없이 DB에서 확인한 reference에 대한 purge-only 작업만 허용한다. Duplicate/concurrent call과 ambiguous commit은 Audit 한 건으로 수렴해야 한다. |
| 고려한 대안 | `PURGE_PENDING` 전에 파일부터 삭제하거나, 실제 unlink 전에 `PURGED`/Audit를 기록하는 안은 crash/failure에서 상태가 사실과 달라지므로 거부한다. DEK를 영속/escrow하여 restart 복호화를 지원하는 안은 현재 ephemeral-key 정책 밖이라 거부한다. 파일시스템 전체를 무조건 정리하거나 신규 module/worker/volume에 등록하는 안도 Tenant ownership/shared quota/Service cleanup gates 전이므로 거부한다. |
| Acceptance 및 완료 범위 | `TC-PACS-001-STAGE-007/008/013/014`의 local encrypted payload, exact unlink ordering, failure injection/retry, restart purge-only, concurrent/idempotent Audit, wrong-Tenant/sibling isolation을 disposable PostgreSQL forced-RLS 및 temporary filesystem에서 검증한다. 이 기록은 `STAGE-005/009/010/011/012`나 runtime activation을 대체하지 않는다. |
| 보안·운영 영향 | 새 schema/grant/public API/route/worker/volume은 추가하지 않는다. No-STOW invariant 및 ordinary source-capture result를 유지한다. OS unlink는 forensic media erasure가 아니며 SSD/snapshot/backup 복구, directory fsync/power-loss durability, cross-process quota를 보장하지 않는다. |
| 적용 권한 | 사용자의 standing recommendation-first instruction과 `PACS-001-DEC-008`의 승인된 lifecycle scope 내 선택. `STOW_STARTED`, destination call/STOW, 운영 PACS/credential 또는 실환자정보를 추가하지 않는다. |

### 3.5 현 구현 단계 권고안 — cross-process shared quota

| 항목 | 권고안 |
|---|---|
| 채택 권고안 | `PACS-001-DEC-010`을 적용한다. PostgreSQL singleton counter와 Tenant-RLS opaque reservation ledger로 10 GiB/database-environment 및 2 GiB/ImagingPackage quota를 원자적으로 관리한다. 16 MiB 단위 reserve는 ciphertext write 전에 완료하고, seal 시 actual bytes로 정산하며, ciphertext 물리 제거 뒤 `PURGED`+Audit와 같은 Tenant transaction에서만 quota를 해제한다. |
| 고려한 대안 | 프로세스 로컬 카운터, runtime의 직접 counter UPDATE, 미승인 Redis, 매 임의 크기 청크마다 DB 왕복은 각각 다중 프로세스 oversubscription, counter 조작, 미승인 인프라 증가, 높은 호출비용 때문에 채택하지 않는다. |
| 보안·스키마 | Dedicated `mediq_quota_owner` is `NOLOGIN/NOBYPASSRLS`; runtime receives function EXECUTE only and no quota-table privileges. Three operational tables contain no DICOM payload, UID, PatientID, key or path. A separate Package aggregate prevents source/recipient Tenant ledgers from undercounting the same ImagingPackage. Runtime's existing 244-column privilege inventory must remain unchanged. |
| Acceptance 및 범위 | `TC-PACS-001-STAGE-005` covers size/object/package/environment limits, independent-session race, exact role/RLS/ref/state/expiry/writer binding, package aggregation, settlement/release ordering, injected failure behavior and store-before-write. Schema/functions/repository/store and scratch integration only; no route/provider/worker/runtime volume/STOW. |
| 적용 권한 | `PACS-001-DEC-010`, `TC-PACS-001-STAGE-005` and the user's standing instruction to implement recorded recommendations without repeating the approval request. |
| 잔여 위험 | Singleton row locks serialize reservation blocks; full 2 GiB/production throughput and database failover recovery remain unverified. `STAGE-009/010/011/012` and runtime activation remain open. |

### 3.6 DEC-010 implementation checkpoint — earlier snapshot superseded by §17

The unregistered `beginReservedPackage` path now fails closed when the shared quota adapter is absent. For each staged write it reserves capacity before encryption/file output, serializes reserve calls per storage reference, and refuses a second StudyReference for one reserved storage package. Seal freezes writes while settling actual bytes; purge releases counters only after physical path absence and inside the same verified Tenant transaction as `PURGED` plus success Audit. A `settled` marker makes settlement replay exact-value idempotent and blocks further reservation after settlement. The migration owner received only the additional purge-timestamp column read needed by the release function; `mediq_runtime` direct quota-table privileges remain zero and its existing column inventory remains 244.

At this earlier checkpoint, API build and 689 API tests had passed, but the wrapper exit and quota boundary tests were not yet recorded. The subsequent §17 documents API 37/691, the final DB-008 `-ScratchOnly` wrapper exit 0, scoped `STAGE-005` PASS cases and remaining open cases. No `STAGE-005` overall PASS is claimed; storage stays unregistered.

## 4. 구현 결과

- `validatePacsPatientIdBinding`는 empty input, non-canonical destination/source ID, 64자 초과 및 어떤 instance라도 destination과 다른 경우 fail closed한다.
- Successful result는 instance count만 제공하고 PatientID를 반환하지 않는다. Denial reason도 고정 enum이며 입력값을 반영하지 않는다.
- `DicomInstanceMetadata.patientId`는 internal `DicomGateway` metadata shape다. Orthanc adapter는 DICOM JSON의 PatientID를 읽되 PatientName 등 다른 환자 필드는 projection하지 않고 logging도 하지 않는다.
- 실제 Synthetic Orthanc A read-only Test에서 세 instance의 PatientID가 모두 manifest의 synthetic mapping과 일치했다. Test runner는 GET/QIDO/WADO만 수행했고 B matching-instance baseline은 0으로 확인했다.
- `AuthorizationGatedOperationExecutor.executeWithSessionFence`는 verified identity/context 이후, Authorization policy의 fresh evidence query 전에 같은 Session transaction fence를 획득한다. Fence/DB dependency failure는 callback 전에 fail closed한다.
- PACS mapping eligibility gate와 기존 Consent request/approval/withdrawal, Grant issue/revocation, PACS operation repository는 canonical helper/lock key를 공유한다. 별도 Grant issue idempotency lock은 별개의 기능으로 유지한다.
- Isolated PostgreSQL Acceptance에서 operation이 먼저 fence를 보유하면 exact-recipient Grant revocation은 DB-only callback transaction commit까지 대기하고 이후 성공한다. 다음 `PACS_IMPORT` revalidation은 거부하고, pre-existing withdrawn Consent도 거부했다. `pacs_transfer_operations` count는 전후 동일했다.
- Fence integration test는 DICOM Gateway, Orthanc 또는 STOW를 호출하지 않으며, `B` Orthanc를 직접 조회하지 않는다. Product-level no-STOW/B-unchanged remains separately NOT RUN.
- `captureForCoordinator()`는 별도 내부 result discriminant로만 handoff를 반환한다. handoff inventory는 hash builder에 전달한 동일 `descriptors`에서 생성하며 deterministic Series/SOP 정렬과 nested freeze를 적용한다. operation/Tenant/actor/Session/Package/Study/source/destination 및 pending evidence ID/algorithm/digest/count/total bytes binding을 포함하고 PatientID/Local Patient ID/instance bytes는 포함하지 않는다.
- 각 handoff instance에는 같은 WADO stream의 exact `byteLength`와 `sha256:<hex>` digest를 포함한다. `SHA256-MANIFEST-V1` aggregate known vector와 persisted evidence shape는 바뀌지 않으며, per-instance digest는 DB/Audit/log/ordinary API에 기록되지 않는다.
- 일반 `capture()`의 성공 객체는 기존 4개 필드(`kind`, `evidenceId`, `status`, `objectCount`)를 그대로 유지한다. unknown/authority-bearing caller fields는 두 경로 모두 Authorization·DICOM 처리 전 reject한다.
- 최종 fenced Authorization, stable operation scope와 PatientMapping 확인, pending evidence 기록 및 success Audit 기록 뒤 `executeWithResolvedSessionFence`의 Tenant transaction이 정상 반환해야만 handoff가 호출자에게 반환된다. persistence/Audit failure에서는 handoff가 반환되지 않고 evidence/Audit writes가 rollback된다.
- 실제 격리 HTTPS Orthanc A/DB integration에서 descriptor identity와 관찰된 exact synthetic byte streams를 source manifest와 대조했다. B는 시작·종료 모두 EMPTY, STOW와 destination verification 호출은 0, operation은 `CREATED`, Audit/evidence independent observer 및 scratch cleanup/기존 스택 보존은 PASS.
- 이는 service 내부 handoff 경계다. public route/controller/worker, Mandatory Preflight, durable dispatch/`STOW_STARTED`, `RESULT_UNKNOWN` handling 또는 STOW를 추가하지 않았다.
- `PACS-001-DEC-007` adds a per-instance AES-256-GCM spool writer and an optional internal `AuthorizedSourceCaptureService` seam. When explicitly injected in an isolated harness, the integrity reader awaits each chunk's encrypted file write, compares the exact source SHA-256/length, and returns only opaque object refs in the post-commit internal coordinator handoff. The Nest module/Compose/runtime does not supply/register a store; ordinary `capture()` remains unchanged and there is no route or downstream byte consumer.
- `STORE-CORE-001~007` and `STAGE-001` pass only as local synthetic unit cases. They do not pass `STAGE-002~012`, prove shared quota across processes, DB/RLS cleanup, or authorize a downstream byte consumer.
- `PACS-001-DEC-008` PostgreSQL/RLS acceptance passed in a disposable DB-008 scratch project: exact 244 runtime column grants, forced Tenant RLS, exact 10 StudyReference SELECT / 4 metadata UPDATE grants, sibling-Study isolation, reservation race denial, wrong-Tenant/binding denial, invalid-shape/duplicate-reference constraints, Audit-failure rollback, idempotent metadata purge, pre-`STOW_STARTED` retry and post-`STOW_STARTED` denial. The final scratch clean/repeat/reset/reapply catalog was 18 tables / 24 migrations / `18|50|17|42`; scratch cleanup passed. Persistent `mediq` DB was not accessed; DB-002~007 persistent regressions were skipped by design.
- `PACS-001-DEC-009` added an unregistered internal saga: commit `PURGE_PENDING` before filesystem work; zeroize volatile DEK/nonce/tag buffers; safely remove only the exact package directory; then commit `PURGED` and its fixed Audit event. Restart recovery accepts only an opaque DB-bound reference and is purge-only. Embedded scratch integration passed exact grants/forced RLS, physical purge, restart, Audit retry, sibling isolation and STOW state-fence checks.
- The first enclosing `-ScratchOnly` invocation was interrupted during a delayed psql-client startup. A final rerun completed with exit `0`, including runtime-role migration-ledger denial, clean/repeat/reset/reapply, catalog, and owned scratch cleanup. Persistent `mediq` was not accessed; DB-002~007 persistent regressions were not run in this execution.
- No DICOM payload was changed; no STOW request was sent.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/pacs/domain/pacs-patient-id-binding.ts` | Synthetic PatientID validation 및 identifier-minimized exact-match decision |
| `services/api/src/dicom/application/dicom-gateway.port.ts` | Internal instance metadata에 required PatientID 추가 |
| `services/api/src/dicom/infrastructure/orthanc-dicomweb.adapter.ts` | WADO metadata의 exact single LO PatientID projection |
| `services/api/src/exchange/persistence/exchange-session-fence.ts` | Canonical per-Session PostgreSQL transaction advisory fence helper |
| `services/api/src/authorization/application/authorization-gated-operation.executor.ts` | Fresh policy evaluation after optional canonical Session fence; fail-closed lock error |
| `services/api/src/pacs/application/pacs-import-mapping-gate.service.ts` | PACS eligibility check switched to fenced Authorization executor |
| Consent/Grant/PACS persistence and application services | Duplicate Session lock SQL replaced by shared helper; separate Grant idempotency lock retained |
| `tests/api/authorization-gated-operation.test.mjs`, `tests/api/pacs-import-mapping-gate.test.mjs` | Fence ordering/failure and PACS gate ordering assertions |
| `tests/database/pacs-import-authorization-fence.integration.test.mjs` | Scratch-only real PostgreSQL concurrency, post-revoke/withdrawal denial and no-operation-state test |
| `services/api/Dockerfile`, `infra/docker-compose.yml`, `scripts/validate-compose-baseline.ps1`, `scripts/test-db-008-full-schema.ps1` | Integration-test packaging, fixture, allowlist and DB-008 isolated acceptance wiring |
| `services/api/src/database/migrations/0023_illegal_marvel_zombies.sql` | Four StudyReference metadata columns, state/shape constraints, partial indexes and exact runtime column grants |
| `services/api/src/database/schema/temporary-payload-quota.ts`, migrations `0024/0025`, related schema/RLS files | DEC-010 quota tables, `settled` marker, dedicated owner policies, fixed reserve/settle/release functions and narrow purge-timestamp owner grant; scratch application and existing lifecycle compatibility evidence recorded |
| `services/api/src/imaging-storage/application/temporary-payload-quota.port.ts`, `services/api/src/imaging-storage/persistence/postgres-temporary-payload-quota.repository.ts` | Quota port and fixed-function repository adapter; no runtime provider registration |
| `scripts/test-db-008-full-schema.ps1` | Update isolated catalog/table/RLS expectations and synthetic PACS fixtures to 21 tables, 26 migrations, unchanged runtime grants, source/recipient Package aggregate and exact 10 GiB boundary acceptance; complete fault matrix remains incomplete |
| `services/api/src/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.ts` | Exact operation/resource-bound temporary payload metadata persistence primitive |
| `tests/database/temporary-payload-metadata-runtime.integration.test.mjs` | Scratch PostgreSQL/RLS binding/state and physical purge saga, restart-only recovery, retry/Audit, sibling-isolation Acceptance |
| `services/api/src/imaging-storage/application/temporary-payload-purge.coordinator.ts` | Internal unregistered three-phase purge coordinator with verified Tenant transactions and retry-safe Audit finalization |
| `tests/api/temporary-payload-purge-coordinator.test.mjs`, `tests/helpers/stage-temporary-payload-child.mjs` | Purge ordering/unit acceptance and synthetic cross-process restart fixture |
| Existing DB runtime integration tests | Updated exact runtime privilege inventory expectations from 236 to 244 and StudyReference update allowlist to the four DEC-008 metadata columns |
| `services/api/src/database/migrations/0018_smiling_shooting_star.sql` | Restored four historical trailing spaces so source bytes match the already-applied immutable migration checksum; no SQL/schema semantic change |
| `tests/api/pacs-patient-id-binding.test.mjs` | Exact match, empty/malformed/overlength/mismatch/invalid destination tests |
| `tests/api/orthanc-dicomweb.adapter.test.mjs` | Projection minimization 및 missing/multivalue/wrong-VR tests |
| `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | Read-only A metadata identity comparison against synthetic manifest |
| `services/api/src/integrity/application/authorized-source-capture.service.ts` | Ordinary output unchanged; dedicated immutable coordinator handoff after fenced evidence/Audit transaction |
| `services/api/src/integrity/application/source-integrity-manifest.builder.ts` | Existing deterministic aggregate plus immutable per-instance digest/length from the same sequential source streams |
| `tests/api/authorized-source-capture.test.mjs` | Handoff exact binding, minimization, caller-injection rejection, denial/failure/rollback matrix and no-side-effect tests |
| `tests/api/source-integrity-manifest.test.mjs` | Aggregate known-vector preservation, per-instance digest binding, ordering and immutability |
| `tests/integration/authorized-source-capture.orthanc.integration.test.mjs` | HTTPS A exact source inventory/bytes plus runtime-role evidence/Audit failure and B-unchanged integration |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/DICOM-INTEROPERABILITY-PROFILE.md` | Recommendation, Acceptance and normative traceability update |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Current progress/status synchronization |
| `docs/implementation/MEDIQ-PACS-001/*` | Ticket report and test evidence |

추가 변경: `services/api/src/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.ts` (미등록 단일 프로세스 암호화 spool primitive), `tests/api/ephemeral-encrypted-temporary-imaging-store.test.mjs` (6개 격리 unit case).

## 6. 영향 분석

### Architecture

- Added one pure PACS Domain function and widened only the internal DICOM metadata type.
- No module/controller/provider wiring or public API change. No external side-effect path was added.

### API·Data

- Additive migration `0023` adds only four `study_references` temporary-payload metadata columns, lifecycle CHECKs/indexes and exact metadata-column SELECT/UPDATE grants. No public OpenAPI/API schema or runtime store/worker wiring changed; the repository is a persistence primitive, not an enabled storage path.
- Per-instance PatientID exists only in the internal metadata result while the application performs the identity check. No DICOM payload attribute is changed.

### Security·Privacy

- The validator’s caller must supply a destination ID already resolved from the persisted, authorized mapping; this pure function cannot prove caller provenance. No coordinator currently invokes it, so no product transfer path is claimed.
- Only synthetic `TEST-*` IDs were used. Test output, denial result and documentation contain no ID values or DICOM payload.
- The optional source-capture seam creates ciphertext files only in an explicitly supplied private test root; it is not registered in Nest/Compose/runtime. Its in-process maps are not durable metadata and cannot support multi-process or restart recovery.
- Byte-preserving transfer policy is retained. The product-level zero-STOW and unchanged-B guarantee is still unproven because no transfer coordinator exists.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Latest `npm run test:api`: 37 files / 691 tests PASS; focused temporary-store suite: 14/14 PASS, including 64 MiB+1, 2,001-object rejection, reserve-before-write, settlement and purge quota-release ordering/rollback.
- `npm run typecheck:api` and `npm run test:dicom-port-contract`: PASS.
- `./scripts/test-int001-source-capture.ps1 -EnvFile .env`: 35/35 isolated synthetic integration tests PASS; independent Audit/evidence observer PASS; exact per-instance digest/length matched the synthetic source fixture; B EMPTY before/after; scratch cleanup and existing `mediq` stack preservation PASS.
- PACS-001 fence integration: PASS in the isolated PostgreSQL scratch DB, including revoke/fence concurrency and operation-row non-change.
- The first aggregate run failed at the local migration smoke because four trailing spaces in already-applied migration `0018` had been stripped from the source file. A retained migrator image confirmed the exact historical bytes; those bytes were restored without editing the DB ledger or changing SQL semantics. The direct migration smoke and subsequent complete `scripts/test-db-008-full-schema.ps1 -EnvFile .env` rerun both exited `0`. DB-008 clean/reset/reapply, 18-table/20-migration catalog, DB-002~007 regressions, PACS-007, PACS-001 fence, exact RLS/privilege probes and scratch cleanup passed. See [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
- Earlier DEC-008/009 DB-008 `-ScratchOnly` evidence is retained in §§11–13. For DEC-010, the final disposable `-ScratchOnly` wrapper exited `0` after clean/repeat/reset/reapply, runtime/RLS regressions and owned-resource cleanup; schema/catalog is `21|55|17|48`, with 20 forced-RLS tables, zero runtime direct quota-table privileges and unchanged 244 runtime column grants. Persistent DB and Orthanc A/B were not accessed; DB-002~007 persistent regressions were intentionally skipped. Scoped quota test results and remaining `STAGE-005` cases are in §17.
- Latest DEC-009 verification: API build, strict typecheck, and 37-file/686-test API regression passed. The embedded temporary-payload integration emitted full PASS for exact grants, forced RLS, binding, physical purge, restart purge-only, Audit retry, sibling isolation, retry-before-STOW and deny-after-STOW. Final `-ScratchOnly` wrapper rerun exited `0` with clean/repeat/reset/reapply, 18 product tables, 24 migrations, catalog `18|50|17|42`, runtime denial and owned scratch cleanup. DB-002~007 were intentionally skipped and persistent `mediq` was not accessed.
- Isolated Test Orthanc read-only integration: 5/5 PASS; no STOW or PACS mutation.
- The storage/purge/shared-quota paths remain unregistered and do not use actual configured service volumes or a downstream PACS port. `STAGE-007/008/013/014` pass only in the recorded synthetic/local filesystem + scratch PostgreSQL/RLS harness. `STAGE-005` is PARTIAL: per-object/object-count edges, reduced-cap independent-session contention, exact 2 GiB package accounting, exact 10 GiB environment exhaustion, scoped binding/privilege denials, distinct-writer collision, source/recipient shared-Package aggregate, actual-byte settlement and purge/Audit quota lifecycle passed; the complete injected DB/filesystem/Audit fault matrix remains open. `STAGE-009/010/011/012` remain NOT RUN.
- Ticket result: **PARTIAL**.

## 8. 미구현 사항 및 잔여 위험

- The full coordinator must prove it gets the mapping from trusted persisted state and calls this validator for every exact source instance before dispatch.
- `PACS-001-DEC-005` ephemeral handoff is PASS only for its internal scope; no persistent UID inventory is stored, and the ordinary source-capture result remains minimized. The exact inventory is transient application memory and cannot survive a process crash; no JavaScript zeroization guarantee is claimed. This is not the PACS coordinator or a dispatch capability.
- `PACS-001-DEC-006` per-instance digests are transient and non-authorizing. The optional internal test seam stages the same checked WADO bytes, but the production Nest module does not inject the store and therefore still discards source bytes after hashing.
- `PACS-001-DEC-007/008/009/010` storage remains unregistered. After restart, the primitive denies reads and new staging while an orphan is unresolved; an exact Tenant-validated reference can invoke purge-only recovery but never decryption. The Audit observer uses the migration role solely for test evidence because `mediq_runtime` intentionally has no Audit SELECT grant. Scoped tests cover the local filesystem/DB purge saga, key-buffer zeroization and quota lifecycle wiring, not quota edge/contention Acceptance, forensic erasure, crash/fsync durability, scheduled SERVICE cleanup or runtime-volume wiring. No persistent storage path may be activated before `STAGE-005/009/010/011/012` and broader runtime/Orthanc no-side-effect gates pass.
- DEC-008 proved metadata/Audit transaction behavior; DEC-009 separately proves physical path removal before success Audit in the synthetic scratch harness. Neither makes the storage lifecycle an active product feature or proves a full PACS coordinator.
- The fence has only been proven for internal paths using the shared helper and same database; full coordinator's atomic authorization + durable `STOW_STARTED` dispatch boundary remains open.
- Endpoint/TLS preflight integration, Integrity/Provenance/Audit gates, STOW result parsing, destination verification/reconciliation, and product-level zero-STOW/B-unchanged negative tests remain open.
- Exact equality of synthetic PatientID strings is not real-patient identity proof or cross-hospital identity matching.
- `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` remain NOT RUN.

## 9. 최종 판정

```text
Ticket: MEDIQ-PACS-001
Scope: Internal identity/fence/source-handoff sub-gates, `DEC-007` spool, `DEC-008` StudyReference metadata, `DEC-009` purge/restart and partial `DEC-010` shared quota wiring
Changed: Added immutable source handoffs, bounded AES-256-GCM spool, four StudyReference lifecycle metadata columns/grants, exact-binding repository and internal purge coordinator; shared DB quota reserve-before-write, seal settlement and post-unlink purge release; runtime grant inventory remains 244; ordinary `capture()` allowlist unchanged
Not changed: Complete injected DB/filesystem/Audit fault matrix for quota `STAGE-005`, source-storage runtime registration, cleanup worker/SERVICE scheduler, runtime volume, operation transition/`STOW_STARTED`, HTTP route, destination verifier invocation, STOW, PACS write or reconciliation
Security impact: Exact metadata grants/forced Tenant RLS and existing quota lifecycle integration were scratch-tested; the quota owner has one minimum parent-column SELECT grant and runtime receives no direct quota-table privileges. No route, worker, runtime volume, destination-write or STOW capability was added. Path unlink is not forensic erasure; cross-process failure recovery/runtime crash durability and production DEK lifecycle are unproven
Tests executed: API build/regression 37 files/691 tests; focused temporary-store suite 14/14; API typecheck; Drizzle migration consistency; migration runner 6/6; disposable DB-008 `-ScratchOnly` wrapper exit 0 with clean/repeat/reset/reapply, runtime/RLS regressions and cleanup; catalog `21|55|17|48`, 20 forced-RLS tables, zero runtime quota-table privileges and 244 runtime column grants. Scoped `STAGE-005` evidence is recorded in §§17–19. Persistent DB/Orthanc not accessed.
Tests not executed: Remaining complete injected `STAGE-005` DB/filesystem/Audit fault matrix; `STAGE-009/010/011/012`, runtime module/volume registration, SERVICE cleanup, maximum-study bounds, full coordinator no-STOW/B-unchanged, Mandatory Preflight/dispatch/`STOW_STARTED`, live STOW, unknown-outcome reconciliation, destination verification and P0 E2E. DB-002~007 persistent regressions were intentionally skipped in `-ScratchOnly` mode.
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: The store/coordinator remain unregistered and are not a product storage path; source bytes are discarded in the current Nest runtime. The complete quota DB/filesystem/Audit fault matrix, verified SERVICE scheduling, runtime volume/fsync, host-level durability and maximum-study performance remain open; no effect-capable PACS coordinator consumes the handoff; full Mandatory Preflight, endpoint/TLS, destination-byte verification and terminal Integrity/Provenance/Audit remain open
Status: PARTIAL
```

## 10. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PARTIAL` | `PACS-001-DEC-002` 권고안/Acceptance 후 identity preflight primitive와 read-only WADO projection 구현; full coordinator는 후속 |
| 2026-10-01 | `PARTIAL` | `PACS-001-DEC-003` 권고안/5개 Fence Acceptance 후 shared Session fence와 operation-time internal Authorization 재검증 구현; PostgreSQL revoke serialization/denial/no-operation-state PASS. 후속으로 migration `0018` 원본 체크섬 drift를 exact byte 복원으로 해결하고 DB-008 aggregate/local migration smoke 전부 PASS; full coordinator는 미완 |
| 2026-10-02 | `PARTIAL` | `PACS-001-DEC-005`의 ephemeral source identity handoff 권고안과 `HANDOFF-001~007` Acceptance 기록; 코드/시험은 아직 미실행 |
| 2026-10-02 | `PARTIAL` | `PACS-001-DEC-005` handoff internal sub-gate PASS; `HANDOFF-001~007` scoped Acceptance, API and isolated Test Orthanc/PostgreSQL evidence recorded. Full coordinator remains unimplemented |
| 2026-10-02 | `PARTIAL` | Initial `PACS-001-DEC-007` recommendation/Acceptance checkpoint: six unregistered encrypted-spool primitive unit cases pass; source integration, DB/RLS, shared quota, cleanup worker and purge Audit were then NOT RUN |
| 2026-10-02 | `PARTIAL` | Added optional exact-source observer integration and atomic in-process quota reservation; `STORE-CORE-001~007` + `STAGE-001` scoped unit PASS; `STAGE-002~012`, runtime registration, DB/RLS lifecycle and full coordinator remain NOT RUN |
| 2026-10-03 | `PARTIAL` | `PACS-001-DEC-008` exact StudyReference metadata grants/RLS, sibling isolation, race, purge-Audit transaction, operation-state fence and DB-008 scratch clean/repeat/reset/reapply PASS. Physical storage purge saga, runtime registration, SERVICE cleanup/quota and full coordinator remain open |
| 2026-10-03 | `PARTIAL` | `PACS-001-DEC-009` physical purge ordering, restart purge-only recovery, sibling isolation, retry/Audit idempotency and scoped STAGE-007/008/013/014 passed; API 37/686, build/typecheck and final ScratchOnly clean/repeat/reset/reapply/catalog/runtime-denial/cleanup all passed. DB-002~007 intentionally skipped; runtime/service/quota/no-STOW/full coordinator remain open |
| 2026-10-03 | `PARTIAL` | `PACS-001-DEC-010` shared quota and scoped `STAGE-005` boundary tests recorded. API 37/691 and focused store 14/14 pass; distinct-writer race and source/recipient shared-Package aggregate pass. DB-008 `-ScratchOnly` wrapper exit 0 with clean/repeat/reset/reapply and owned cleanup. Exact 10 GiB and full fault matrix remain open |
| 2026-10-03 | `PARTIAL` | Exact 10 GiB environment boundary PASS in disposable PostgreSQL: five Packages at 2 GiB, sixth Package denied at 16 MiB with SQLSTATE `54000`, counters/ledger unchanged, no payload files allocated, and normal purge+Audit cleanup returned quota to zero. Final DB-008 `-ScratchOnly` wrapper exit 0 after clean/repeat/reset/reapply and owned cleanup. Complete injected DB/filesystem/Audit fault matrix remains open; runtime storage and coordinator remain disabled |

## 11. DEC-011 current commit checkpoint

**Work in progress after this historical checkpoint:** DEC-012 records a maximum-Study workload probe before test implementation. Scope is test-only: real 2 GiB/2,000-object local ciphertext processing, not runtime activation or a full STAGE-009 PASS. See evidence §22; DEC-011's existing DB wrapper continues unchanged.

**Subsequent implementation/result:** `tests/performance/temporary-imaging-maximum-study.test.mjs` and `tests/api/orthanc-dicomweb-concurrency.test.mjs` are added. The existing store test now uses abort-aware object creation and tracked cleanup after runner cancellation. Tests and rejected/failed attempts are recorded in evidence §23. The prior timed-out API run left 313 empty test files outside Git whose explicit cleanup was denied by execution policy; no bypass was attempted. Current maximum-workload rerun and scratch wrapper still require final exit/cleanup proof. Runtime consumer lifetime, SERVICE cleanup, privacy, Orthanc no-side-effect, full Preflight/STOW and E2E remain open.

```text
Ticket: MEDIQ-PACS-001
Scope: Preserve current DEC-011 implementation and evidence as an intermediate commit
Changed: Internal ciphertext write/sync test seam with unchanged Node default; six added store cases; scratch DB settlement/release transaction-failure cases; recommendation, Acceptance and implementation records
Not changed: Schema/migrations/grants/OpenAPI, runtime provider/volume/worker, public routes, destination calls, STOW or patient data
Security impact: Deterministic fail-closed tests only; no new access authority or runtime activation. Quota effects in store unit tests are modeled; PostgreSQL fault Acceptance is not yet confirmed
Tests executed: API build/regression 37 files/697 tests PASS, both modified test-file syntax checks PASS; current DB-008 ScratchOnly run observed still in progress
Tests not executed: No final DEC-011 DB wrapper/cleanup result verified at this checkpoint; product Orthanc/E2E tests not rerun for this commit
Evidence: TEST-EVIDENCE.md section 21; previous sections remain historical evidence
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Full STAGE-005 failure matrix and downstream runtime/SERVICE/performance/Preflight/transfer gates remain unaccepted; observe pending scratch run and synchronize its results before any full-stage PASS
Status: PARTIAL
```

## 12. DEC-014/015 completed streaming sub-gate

This is the current implementation report; earlier checkpoint blocks are history.

```text
Ticket: MEDIQ-PACS-001
Scope: STAGE-005 final evidence and STAGE-009 bounded source/crypto/consumer verification
Changed: Adapter pull-based multipart reading and unchanged-cap enforcement; exact-cap/overflow/cancellation/slow-reader tests; pinned MIT-derived local multipart EOF patch, license/provenance, lockfile and Docker inputs; integrated 2 GiB workload; normative/evidence synchronization
Not changed: Schema/migrations/grants/OpenAPI, runtime storage/worker/volume/route activation, destination calls, live STOW or patient data
Security impact: Bounded upstream read-ahead and authenticated borrowed-buffer lifetime verified; truncation/overflow/timeout/cancel remain fail closed. Local third-party patch adds documented maintenance responsibility; no install scripts or new registry dependency
Tests executed: API build 40 files/732 tests PASS; typecheck and DICOM Port type contract PASS; exact adapter/crypto/consumer 2 GiB/2000-object workload and cleanup PASS; original DEC-011 scratch final exit/cleanup PASS; final Docker build and non-root/network-disabled module/hash probe PASS; diff check PASS
Tests not executed: New dependency with real Orthanc/clinical DICOM; Tenant SERVICE cleanup, privacy/no-side-effect and runtime activation gates; full Preflight/STOW/destination verification/P0 E2E; persistent DB-002~007 regressions intentionally excluded from ScratchOnly
Evidence: TEST-EVIDENCE.md section 26, including red/green attempts and scope limitations
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Cross-process/global memory, runtime Authorization/lifecycle and downstream transfer remain unverified; 313 historical empty test files outside Git remain recorded; no new commit/push in this continuation
Status: PARTIAL (STAGE-005 and STAGE-009 scoped PASS)
```

Traceability: DEC-014/015 → FLOW-001~003 and slow-valid/truncated regressions → adapter and local dependency; DEC-013 → LIFE-001~008 → borrowed consumer; DEC-012 → CONC-001~003/MAX-001 → default admission and measured workload; DEC-011 → FAIL-001~004 → completed scratch lifecycle. The 2 GiB result is synthetic byte transport, not DICOM/CT conformance. Next implementation gate is STAGE-010, with a new recommendation and Acceptance before code.

## 13. DEC-016 internal expiry cleanup implementation

**Current user-requested commit checkpoint (2026-10-03, approximately 14:15 KST):** Replacement session 77695 has emitted its first signed-OIDC/SERVICE/Tenant-RLS/ciphertext expiry integration PASS, followed by prior payload and DB-boundary regression sentinels. The whole wrapper is still running; repeat/reset/reapply, final exit and owned cleanup remain unconfirmed. Commit-time API rerun passes **41 files/764 tests**, type/Port checks and Node/PowerShell syntax checks pass. STAGE-010 and Ticket remain **PARTIAL**, with no runtime activation or STOW. Evidence §30 supersedes older live-result wording below; historical failures remain recorded.

**Real-test follow-up (2026-10-03):** The first scratch process exited 1 in partial-failure verification, and all its owned containers/volumes/networks were confirmed removed. Schema/test comparison identified a quota observer defect: switching to the quota-owner role does not bypass forced Tenant RLS, but the new observer omitted Tenant context. Recommendation recorded before fixing that observer and adding missing/wrong-Tenant hidden-row checks. Fixed substage/aggregate/SQLSTATE diagnostics are also added without raw output. Production code/grants are unchanged by this correction. Replacement process 77695 / project `mediq-db008-84a48ffac0f8` is live; no rerun PASS yet. This supersedes earlier live-handle notes, not historical failed evidence.

```text
Ticket: MEDIQ-PACS-001
Scope: STAGE-010 CLEAN-001~008, internal per-Tenant expiry cleanup
Changed: Metadata-only bounded discovery; immutable principal/selectors; SERVICE and atomic TTL checks in every TTL_EXPIRED purge; sequential batch with aggregate results; unit/model and dedicated disposable DB integration; test image/wrapper and normative/evidence documents
Not changed: Schema/migrations/grants/OpenAPI, runtime provider/scheduler/volume/routes, live PACS/STOW or persistent database
Security impact: Exact Tenant-owned operation graph and active Tenant-level SERVICE required; stale ref/expiry and identity changes deny before deletion; post-admission identity loss keeps finalization retryable without false Audit; no transaction spans physical purge
Tests executed: Focused expiry/purge 38/38 PASS; API build 41 files/764 tests PASS; typecheck and Port contract PASS; Node/PowerShell syntax and diff checks PASS
Tests not executed: Final signed-OIDC/real-RLS/ciphertext and whole scratch-wrapper result not yet confirmed; product Orthanc/Preflight/STOW/E2E not run
Evidence: TEST-EVIDENCE.md section 29; section 27 recommendation precedes code
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Internal trusted principal is not standalone authentication; scheduling fairness, multi-process service deployment and operational cleanup guarantees remain future runtime gates
Status: PARTIAL
```

Traceability: CLEAN-001/003/006 → `findExpired` joined Tenant/Session/Package/Study/operation predicates and fixed column grants; CLEAN-002/005 → shared SERVICE context guard plus existing ActorTenantContextService/registry; CLEAN-003/005 → atomic expiredAt predicate and two-transaction purge saga; CLEAN-004/007 → bounded sequential batch, fixed counters and retry; CLEAN-008 → no module/route/provider registration. `temporary-payload-expiry.test.mjs` is a modeled unit boundary only. `temporary-payload-expiry-runtime.integration.test.mjs` uses signed synthetic OIDC, real registry/RLS, independently observed generated ciphertext/quota/Audit and deliberate fixture faults. Privileged fixture seed/inspection is not cleanup behavior. The existing DB-008 disposable wrapper includes this test before the older payload suite in every clean/repeat/reset/reapply round; it must finish with owned cleanup before full scoped acceptance.

## 14. Next-gate readiness inspection (not implementation or Acceptance)

Read-only inspection while DEC-016's replacement scratch process is live identified concrete integration prerequisites for the remaining STAGE-002/003/004/011/012 gates:

- `AuthorizedSourceCaptureService.captureForCoordinator` currently calls the optional store's `beginPackage`, not its DB-reserved `beginReservedPackage`. This is the previously approved unregistered primitive seam, not an actual quota/lifecycle-backed product path. The next implementation must connect server-resolved operation binding and verified Tenant metadata reservation before any ciphertext write; more isolated store tests alone cannot close that gap.
- Its final evidence/success Audit transaction must be coordinated with the exact Study payload's AVAILABLE transition before returning a usable internal handoff. Ordinary `capture()` must retain its existing four-field success/two-field denial allowlist. Persisted metadata cannot be inferred from an in-memory receipt.
- Failure cleanup currently calls the primitive's `purgePackage`. A persisted lifecycle requires the existing committed PURGE_PENDING → physical absence → atomic PURGED/quota/Audit saga, including failures before a handle is returned and ambiguous commit/retry. Never lose the only recovery ref or report success after failed cleanup.
- DEC-007 distinguishes the existing 30-minute source deadline from a completed package's 30-minute TTL after successful capture. Metadata and in-memory expiry must agree; a future reservation/finalization design must not silently use an earlier staging timestamp as the completed package TTL or extend retention without the authorized final transition.
- Read permission still requires a real trusted operation-time verifier at both borrowed-consumer checks; a unit-test callback returning VERIFIED is not Consent/Grant/RLS evidence. Restart remains purge-only and cannot authorize re-fetch after STOW_STARTED.
- Privacy verification must reconcile the approved `study_references.study_instance_uid` source-reference field (DATA-MODEL §§33–34) with the prohibition on copying UID/PatientID/payload/key data into temporary lifecycle/quota fields, Audit, logs, diagnostics or ordinary responses. Record an explicit normative interpretation and Acceptance before changing tests; do not remove or weaken a prohibition to get a passing scan.

These observations are preparation only. Record the next recommendation and success/failure/denial Acceptance before implementing this integrated source lifecycle. The live DEC-016 test is not restarted or declared PASS. No API/route/provider, persistent imaging volume, STOW or runtime activation follows from this inspection. The eventual evidence must use actual signed identity/registry/Authorization, real PostgreSQL/RLS and encrypted files; STAGE-012 additionally needs isolated Test Orthanc A/B with independent B-empty/no-destination-write evidence.

## 15. DEC-017 implementation-ready design and sequencing

**R5 opened before changes (2026-10-03):** Previous goal turn made progress through real 51-test replica acceptance, API 893/type/Port verification and diagnostic-only correction preparation for the failed full DB run. Current session 51950 is confirmed live; all its DB/product/build inputs remain frozen. R5 recommendation/Acceptance address the remaining live-value privacy gap with a separate read-only fixture observer, exact projections and no runtime credential/grant widening. Only source-test-target files and related records change; evidence §45 must distinguish preparation/unit checks from actual privacy acceptance.

**R4 replica verification opened before changes (2026-10-03):** Starting checkpoint `65084e0` is clean and remotely synchronized. Previous turn made concrete progress by publishing the reviewed R3 implementation/evidence. DB-008 session 6711 remains live and has emitted an additional PACS-007 runtime PASS marker, not a terminal full-regression result. DEC-017-R4 and Acceptance are recorded before adding an independent replica test. Only the source-test target's fixture/harness/observer/wrapper are edited; inspection of the Dockerfile confirms these are not inputs to the running database integration target. No product/schema/build-input change or parallel heavy execution. New evidence and remaining limits belong in §43; Ticket remains PARTIAL.

**R3 matrix opened before changes (2026-10-03):** Clean starting commit `38ce204`; previous goal turn made progress through actual 39-test integration/independent cleanup proof, regression evidence and user-requested commit/push. All previous handles are terminal. Recommendation DEC-017-R3 and Acceptance precede eleven additional actual source-lifecycle fault/replay cases. Preserve product/runtime/schema/grant boundaries and all existing tests; record failures, exact commands, final scope and cleanup in evidence §40. This is continuation of sequence 4, not completion or a new product feature.

**Sequence 4 opened before changes (2026-10-03):** Previous turn is progress (concrete consumer, 893 API/type/Port evidence). Dirty files are that known work and must be preserved. No old test process is live. Extend the existing disposable source harness/seed/observer with four independent lifecycle scenarios and actual signed OIDC; retain all earlier tests. Recommendation/Acceptance above precede fixture changes. Evidence §38 will distinguish test construction, actual execution, cleanup and still-open full lifecycle gates.

**Sequence 3 opened before changes (2026-10-03):** Commit `02bfab5` is the verified clean starting point; previous goal turn made progress through source implementation/evidence and user-requested remote checkpoint. DEC-017-R2 records the concrete two-check consumer, private weak capture binding and admission-Audit semantics before code. Preserve ordinary/handoff schemas and existing storage/source tests. Product and test changes require evidence §37; no new DB wrapper or runtime activation is implied.

**Sequence 2 checkpoint:** Durable reservation, immutable principal/actor-bound quota, common-expiry AVAILABLE/evidence/Audit completion, post-commit deadline checks and exact-ref purge are implemented. Source suite expanded from 57 to 84 cases; full API 814/type/Port PASS. Real encryption and AuthorizationEngine run with model transactions/registry; actual signed-OIDC/RLS/Orthanc and concrete read verifier remain open (§36).

**Sequence 2 opened before source edits (2026-10-03):** Previous turn is progress: original DEC-016 completion was verified and sequence-1 store/metadata code passed API 787/type/Port checks. Current worktree retains those uncommitted changes; no live test needs waiting/restarting. Implement the already approved durable source reservation, authenticated per-capture quota, final AVAILABLE/evidence/Audit transaction and exact-ref failure purge. Extend existing model tests without replacing their success/denial assertions. Real PostgreSQL/Orthanc acceptance, concrete read verifier and the full P0 goal remain open; no PASS from wiring alone. See decision detail and evidence §36.

**Product implementation opened (15:12 KST):** Original DEC-016 wrapper exited 0 and exact owned project inventories are empty. Sequence 0 is complete for the internal ScratchOnly scope; evidence §34. Start sequence 1: immutable explicit per-package quota, post-settlement completion time, single in-flight seal and post-await liveness denial, followed by the exact metadata completion transition. Preserve sequential ambiguous-settlement retry. Re-run the unmodified nine RED assertions and all existing regressions; no source/Authorization/Orthanc lifecycle gate is closed by this step alone.

**Sequence-1 metadata record opened:** Implement mandatory-expiry `completeStaging` using the existing exact CAS and shared private transition; preserve legacy `markAvailable` semantics without enabling the new source path to use that fallback. Unit success, invalid-time, stale/denied CAS and sanitized SQL-failure checks precede real PostgreSQL/source integration. No schema/grant change; evidence §35 will distinguish this code from prior DB proof.

**R1 test record opened (2026-10-03):** Before implementation, decision DEC-017-R1 and Acceptance specify concurrent seal exclusion and post-settlement purge denial. Add only these deterministic cases to the existing isolated lifecycle contract file while the original DB wrapper is live. Product source remains unchanged until its gate closes; actual RED results belong in evidence §33, not a PASS claim. Existing sequential settlement-retry behavior must be retained by the later fix.

**R1 actual execution:** Focused 9-case suite: 8 FAIL/1 PASS; full serial API: 765 PASS/8 FAIL, exit 1, 62.34 seconds. Both races fail exactly at the specified guard: a duplicate settlement begins, and the physically purged package returns a seal receipt. Existing sequential retry tests pass. All owned lifecycle test roots were absent after exit; previous policy-denied residue remains untouched. The same DB session emitted third-round expiry/payload/least-privilege and Exchange regression PASS sentinels; final wrapper completion is still pending. These are concrete new failure evidence, not source fixes or full Acceptance.

**Initial design status (historical):** 2026-10-03; design accepted under standing instructions before implementation. This turned §14's read-only findings into a specific recommendation and Acceptance without skipping the then-live DEC-016 completion gate. Current sequence-1 results supersede the historical RED notes below.

**Test-only record opened:** Under DEC-017's documented sequencing refinement, prepare and run one isolated store contract file while DEC-016's wrapper completes. No source/DB/Compose/current database-test input changes. RED tests will remain real failures, not skipped checks; record commands/results in evidence §32. The two passing expiry rounds do not yet open the product-source implementation gate.

**Test-only implementation:** Added `tests/api/temporary-imaging-capture-lifecycle.test.mjs`, with actual ciphertext/filesystem cleanup and modeled quota. It asserts explicit per-package quota selection, distinct Tenant package isolation, copied method/receiver lifetime, malformed-port denial, post-settlement TTL and legacy constructor compatibility. Focused result is 6 RED/1 PASS; full-suite unexpected timeout attempts and unchanged-limit serial rerun are recorded separately. This is executable preparation, not a source-lifecycle or security implementation PASS.

**Historical pre-R1 execution detail:** Serial API was 765 PASS/6 FAIL with original 5-second/30-second deadlines unchanged. Default parallel timeouts are retained, not declared fixed. New test-owned roots were cleaned; one older timed-out source test left two synthetic ciphertext files totaling seven bytes in its exact local Temp root. Read-only ownership/path/reparse/process checks were completed, but native deletion was rejected by execution policy; no workaround was attempted and the residue remains (evidence §32). Existing DB session 77695 passed clean/repeat and owned reset, then restarted its reset-reapply database successfully. See the R1 result above for current counts; no product code or current DB test inputs changed.

| Sequence | Planned smallest integrated change | Evidence needed before acceptance |
|---|---|---|
| 0 — scoped PASS | Original DEC-016 session 77695 exited 0; all three rounds, reset/reapply and owned cleanup verified | Evidence §34; persistent DB-002~007 scripts excluded by ScratchOnly |
| 1 — implemented, integration pending | Reserved package quota snapshots, one post-settlement expiry, single in-flight seal/purge denial and mandatory-expiry metadata transition | Focused 82 and full API 787/type/Port PASS, no schema/grant expansion; new real-DB proof remains required |
| 2 — implemented, integration pending | Source service now uses fresh fenced exact-ref reservation, actor-bound quota, atomic AVAILABLE/evidence/Audit and purge saga; snapshots issuer/subject and preserves ordinary response | 84 source unit/model cases and full API 814/type/Port PASS (§36); actual signed-OIDC/PostgreSQL/RLS/Orthanc proof for LIFECYCLE-001/003/004/005/010/013 still required |
| 3 — implemented, integration pending | Source-service concrete two-check borrowed consumer with private weak provenance, current graph/mapping/AVAILABLE/evidence and admission Audit; no new handoff fields or caller verifier | 74 added source and 5 Audit-denial cases, full API 893/type/Port PASS; actual LIFECYCLE-006~010/014 integration still required (§37) |
| 4 — R4 actual replica slice scoped PASS; full gates open | Existing source cases plus 16 signed lifecycle scenarios: 51 PASS, exact observer/17 purge Audits/zero quota/B EMPTY/owned cleanup; replica key-loss and purge-only behavior verified | Evidence §§41–44. DB regression failed at GRT-003 rollback; diagnostic rerun 51950 live. Full mapping/actor/privacy/lifecycle/runtime/P0 gates remain open |
| 5 | Reconcile remaining storage gates, then separately implement runtime wiring/full coordinator/Preflight/dispatch/reconciliation/verification and product E2E | Existing IMPLEMENTATION-PLAN and original P0 success condition; no completion inferred from this storage slice |

Concrete privacy reconciliation is recorded in normative Data Model/Security/Acceptance: preserve and compare approved source UID/PatientMapping columns while prohibiting new copies elsewhere. A broad "no UID anywhere in DB" scan would contradict the approved source-reference model and cannot replace this precise inspection. Crash-dump/platform hardening remains explicitly unproven.

```text
Ticket: MEDIQ-PACS-001
Scope: DEC-017-R3 sequence-4 actual fault/denial/concurrency/replay matrix and R3-A test-runner readiness
Changed: Eleven synthetic lifecycle graphs/cases and signed patient actor, exact SQL fault target, independent observer expectations, bounded failure markers, SELECT-only TCP readiness and ten deterministic tests; evidence and current status/normative execution notes
Not changed: Product source, schema/grants/migrations, Compose/Dockerfile/dependencies/runtime registration, OpenAPI, actual patient data, destination writes or STOW; no commit/push
Security impact: Actual Consent withdrawal/current metadata and corrupted-ciphertext denial; competing/repeated capture cannot replace winner or extend TTL; faults preserve exact-ref purge/Audit/quota. Readiness retries SELECT only, not DDL or product operations; no permission or timeout relaxation
Tests executed: Actual integration 50 PASS plus independent observer/16 purge Audits/zero quota/B EMPTY/cleanup. TCP readiness ten tests and actual transient recovery PASS. Serial API 43 files/893, API typecheck, DICOM Port, JS/PowerShell syntax, relative file links and diff checks PASS. Earlier failed attempts retained
Tests not executed: Remaining full mapping/actor mutation/source-process restart/privacy and lifecycle gates; STOW/destination verification/P0 E2E. Post-edit DB-008 ScratchOnly regression is currently running, not accepted
Evidence: TEST-EVIDENCE.md sections 40–41; earlier component proof remains in sections 34–39
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Fifteen integrated scenarios do not close the full matrix; three first-run lifecycle failures did not recur but their cause is unproven; earlier parallel timeouts/local Temp residue retained; current DB wrapper and original runtime/Preflight/STOW/destination verification/P0 E2E incomplete
Status: PARTIAL
```

## 16. R4 verification preparation — current change report

```text
Ticket: MEDIQ-PACS-001
Scope: DEC-017-R4 independent replica no-DEK/authorized purge-only verification
Changed: One synthetic graph, child mode and bounded/cancellable runner in the source integration test, exact observer expectations, wrapper expected count, 12 runner protocol tests and decision/Acceptance/evidence records
Not changed: Product implementation, schema/grants, DB tests/helpers, Dockerfile/Compose/dependencies, OpenAPI, runtime activation, real data or destination writes; no automatic commit/push
Security impact: Adds tests for fail-closed unknown handoffs and no-key replicas, real authorization before the primitive key-loss probe, identity-gated physical purge and fixed diagnostics; no product verifier override or persisted keys
Tests executed: R4 actual 51 PASS/observer/17 purge Audits/zero quota/B EMPTY/cleanup; runner protocol 12, Grant diagnostic 15, fixture 16 cases/208 IDs, readiness 10, serial API 43 files/893/type/Port/syntax/diff PASS. Earlier DB run failed; its cause remains unproven
Tests not executed: Remaining full mapping/actor mutation/privacy/lifecycle, runtime/Preflight/STOW/destination verification/P0 E2E. Full current DB diagnostic rerun 51950 is live and not accepted
Evidence: TEST-EVIDENCE.md sections 41–44; separate MEDIQ-GRT-003/004 reports and evidence §8 for diagnostic-only DB changes
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Successful replica proof is not killed-origin/host-crash recovery or full lifecycle/P0. DB regression remains unresolved while diagnostic rerun is live; prior unexplained failures/local Temp residue and original runtime/Preflight/STOW/destination gates remain open
Status: PARTIAL
```
