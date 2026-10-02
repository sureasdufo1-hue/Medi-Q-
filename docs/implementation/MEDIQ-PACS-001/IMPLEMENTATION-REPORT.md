# MEDIQ-PACS-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-001` |
| 제목 | PACS Import coordinator prerequisites — identity/fence, source-integrity handoff and encrypted spool primitive sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PARTIAL` — identity/fence and source handoffs pass in scoped boundaries; `DEC-007` spool core/`STAGE-001` pass only in synthetic unit harnesses; `DEC-008` adds StudyReference lifecycle metadata and an unintegrated persistence repository, but DB/RLS Acceptance and runtime lifecycle remain unverified |

## 1. 목표 및 판정 범위

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

### 제외

- `PacsImportMappingGateService` 또는 API/controller에 validator를 연결하는 coordinator 구현, HTTP/OpenAPI route.
- Full coordinator, source-capture/storage wiring, cleanup worker, shared quota/restart recovery, durable end-to-end purge saga 또는 `STOW_STARTED` transition.
- PostgreSQL/RLS integration Acceptance 및 DB-008 clean/reset/reapply 검증은 이번 checkpoint에서 미실행.
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
| 정책 및 Acceptance | `PACS-001-DEC-007`, `TC-PACS-001-STORE-CORE-001~007`, `TC-PACS-001-STAGE-001~012` | per-instance AES-256-GCM spool core and optional exact-source capture seam; `STAGE-001` PASS only in local synthetic harness; Tenant-RLS metadata, shared lifecycle, service cleanup and purge Audit remain NOT RUN | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §10 |
| 정책 및 Acceptance | `PACS-001-DEC-008`, `TC-PACS-001-STAGE-006~008/010/013`, `TC-DB-008-REG-001/002/006` | StudyReference-scoped durable metadata schema/repository; migration and TypeScript compile are checked, but DB/RLS, sibling isolation, cleanup/Audit and DB-008 post-migration acceptance remain NOT RUN | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §11 |

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

- No database migration, schema, privilege, OpenAPI, or durable-data change.
- Per-instance PatientID exists only in the internal metadata result while the application performs the identity check. No DICOM payload attribute is changed.

### Security·Privacy

- The validator’s caller must supply a destination ID already resolved from the persisted, authorized mapping; this pure function cannot prove caller provenance. No coordinator currently invokes it, so no product transfer path is claimed.
- Only synthetic `TEST-*` IDs were used. Test output, denial result and documentation contain no ID values or DICOM payload.
- The optional source-capture seam creates ciphertext files only in an explicitly supplied private test root; it is not registered in Nest/Compose/runtime. Its in-process maps are not durable metadata and cannot support multi-process or restart recovery.
- Byte-preserving transfer policy is retained. The product-level zero-STOW and unchanged-B guarantee is still unproven because no transfer coordinator exists.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Current `npm run test:api -- --reporter=dot`: 36 files / 678 tests PASS; focused source builder/authorized capture/spool suites: 3 files / 78 tests PASS, including exact-source staging/read-back, revocation purge, quota-race, and one-chunk awaited-write/no-prefetch cases.
- `npm run typecheck:api` and `npm run test:dicom-port-contract`: PASS.
- `./scripts/test-int001-source-capture.ps1 -EnvFile .env`: 35/35 isolated synthetic integration tests PASS; independent Audit/evidence observer PASS; exact per-instance digest/length matched the synthetic source fixture; B EMPTY before/after; scratch cleanup and existing `mediq` stack preservation PASS.
- PACS-001 fence integration: PASS in the isolated PostgreSQL scratch DB, including revoke/fence concurrency and operation-row non-change.
- The first aggregate run failed at the local migration smoke because four trailing spaces in already-applied migration `0018` had been stripped from the source file. A retained migrator image confirmed the exact historical bytes; those bytes were restored without editing the DB ledger or changing SQL semantics. The direct migration smoke and subsequent complete `scripts/test-db-008-full-schema.ps1 -EnvFile .env` rerun both exited `0`. DB-008 clean/reset/reapply, 18-table/20-migration catalog, DB-002~007 regressions, PACS-007, PACS-001 fence, exact RLS/privilege probes and scratch cleanup passed. See [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
- Isolated Test Orthanc read-only integration: 5/5 PASS; no STOW or PACS mutation.
- The new staging tests do not use Orthanc, PostgreSQL/RLS, actual configured service volumes or a downstream PACS port. `STAGE-001` is PASS only in the injected synthetic unit harness; `STAGE-002~012` remain NOT RUN.
- Ticket result: **PARTIAL**.

## 8. 미구현 사항 및 잔여 위험

- The full coordinator must prove it gets the mapping from trusted persisted state and calls this validator for every exact source instance before dispatch.
- `PACS-001-DEC-005` ephemeral handoff is PASS only for its internal scope; no persistent UID inventory is stored, and the ordinary source-capture result remains minimized. The exact inventory is transient application memory and cannot survive a process crash; no JavaScript zeroization guarantee is claimed. This is not the PACS coordinator or a dispatch capability.
- `PACS-001-DEC-006` per-instance digests are transient and non-authorizing. The optional internal test seam stages the same checked WADO bytes, but the production Nest module does not inject the store and therefore still discards source bytes after hashing.
- `PACS-001-DEC-007` runtime remains unregistered. A non-empty directory after restart intentionally fails with `RECOVERY_REQUIRED`; Tenant-RLS metadata persistence, shared quota, SERVICE cleanup/recovery, purge saga and Audit remain unimplemented. No persistent storage path may be activated before `STAGE-002~012` and the broader runtime/Orthanc no-side-effect gates pass.
- `PACS-001-DEC-008` now supplies a migration and repository primitive, but no new repository-specific unit/integration tests were added in this checkpoint and no PostgreSQL migration was applied. Runtime SELECT/UPDATE privileges, forced RLS, two-Study isolation, `PURGE_PENDING` recovery, filesystem deletion ordering, and same-transaction purge Audit are therefore NOT RUN; the repository must not be described as verified lifecycle behavior.
- The fence has only been proven for internal paths using the shared helper and same database; full coordinator's atomic authorization + durable `STOW_STARTED` dispatch boundary remains open.
- Endpoint/TLS preflight integration, Integrity/Provenance/Audit gates, STOW result parsing, destination verification/reconciliation, and product-level zero-STOW/B-unchanged negative tests remain open.
- Exact equality of synthetic PatientID strings is not real-patient identity proof or cross-hospital identity matching.
- `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` remain NOT RUN.

## 9. 최종 판정

```text
Ticket: MEDIQ-PACS-001
Scope: Internal identity/fence sub-gates, `DEC-005/006` source handoffs, `DEC-007` optional exact-source spool integration, and `DEC-008` StudyReference metadata/schema persistence primitive
Changed: Added immutable `captureForCoordinator()` identity/digest handoffs, bounded AES-256-GCM spool primitive, four StudyReference lifecycle metadata columns with constraints/indexes and column-level grants, plus an unintegrated exact-binding Postgres repository and fixed purge Audit rule; ordinary `capture()` allowlist remains unchanged
Not changed: Full coordinator/source-storage wiring, cleanup worker, runtime volume, shared quota, end-to-end purge/recovery saga, operation transition/`STOW_STARTED`, HTTP route, destination verifier invocation, STOW, PACS write or reconciliation
Security impact: The migration grants runtime access only to the four metadata columns (SELECT/UPDATE; no INSERT/DELETE grant); repository assumes a verified Tenant transaction and checks operation/resource binding; neither has been verified against PostgreSQL/RLS in this checkpoint. No route, worker, destination write or STOW capability was added; process-only DEK best-effort zeroization remains the explicit limit
Tests executed: API 36 files/678 tests; API build and typecheck; Drizzle migration check; migration-runner 6/6; DICOM Port contract and `git diff --check` as recorded in TEST-EVIDENCE. Prior isolated source-capture/Test Orthanc/PostgreSQL 35/35, independent Audit observer, B EMPTY/zero STOW, fence and pre-DEC-008 DB-008 evidence remain separately scoped
Tests not executed: DEC-008 PostgreSQL/RLS migration and repository Acceptance, post-amendment DB-008 clean/reset/reapply, `STAGE-002~013` lifecycle Acceptance, runtime module/volume, Tenant SERVICE cleanup/purge Audit/recovery saga, shared-volume/multi-process quota, maximum-study memory/performance, full coordinator no-STOW/B-unchanged, Mandatory Preflight/dispatch/`STOW_STARTED`, live STOW, unknown-outcome reconciliation, terminal Integrity/Provenance/Audit, production TLS/PKI and P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: The optional seam is unregistered and not a product storage path; source bytes are discarded in the current Nest runtime. Persistent ciphertext lifecycle, atomic shared quota, Tenant-RLS purge discovery, SERVICE identity, durable purge Audit/recovery and maximum-study performance remain open; no effect-capable coordinator consumes the handoff; full Mandatory Preflight, endpoint/TLS, destination-byte verification and terminal Integrity/Provenance/Audit remain open
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
| 2026-10-03 | `PARTIAL` | `PACS-001-DEC-008` StudyReference metadata schema/repository primitive added after recommendation and Acceptance update; build/API/migration consistency checks pass, but no repository tests or PostgreSQL/RLS/DB-008 runtime acceptance; no store/worker registration |
