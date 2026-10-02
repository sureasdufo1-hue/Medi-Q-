# MEDIQ-PACS-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-001` |
| 제목 | PACS Import coordinator prerequisites — identity, operation-time authorization fence and ephemeral source-identity handoff sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PARTIAL` — identity/fence sub-gates and `PACS-001-DEC-005` handoff PASS within recorded internal scope; full coordinator not implemented |

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

### 제외

- `PacsImportMappingGateService` 또는 API/controller에 validator를 연결하는 coordinator 구현, HTTP/OpenAPI route.
- DB schema/grant/migration, operation persistence/durable transition 또는 `STOW_STARTED` 변경.
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
| 정책 및 Acceptance | `PACS-001-DEC-005`, `TC-PACS-001-HANDOFF-001~007` | ordinary capture allowlist 유지; hash에 사용한 서버 metadata inventory만 evidence/Audit commit 이후 in-memory coordinator result로 전달; denial/transaction failure 시 반환 없음; no route/state/STOW | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) §8 |

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
- 일반 `capture()`의 성공 객체는 기존 4개 필드(`kind`, `evidenceId`, `status`, `objectCount`)를 그대로 유지한다. unknown/authority-bearing caller fields는 두 경로 모두 Authorization·DICOM 처리 전 reject한다.
- 최종 fenced Authorization, stable operation scope와 PatientMapping 확인, pending evidence 기록 및 success Audit 기록 뒤 `executeWithResolvedSessionFence`의 Tenant transaction이 정상 반환해야만 handoff가 호출자에게 반환된다. persistence/Audit failure에서는 handoff가 반환되지 않고 evidence/Audit writes가 rollback된다.
- 실제 격리 HTTPS Orthanc A/DB integration에서 descriptor identity와 관찰된 exact synthetic byte streams를 source manifest와 대조했다. B는 시작·종료 모두 EMPTY, STOW와 destination verification 호출은 0, operation은 `CREATED`, Audit/evidence independent observer 및 scratch cleanup/기존 스택 보존은 PASS.
- 이는 service 내부 handoff 경계다. public route/controller/worker, Mandatory Preflight, durable dispatch/`STOW_STARTED`, `RESULT_UNKNOWN` handling 또는 STOW를 추가하지 않았다.
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
| `tests/api/authorized-source-capture.test.mjs` | Handoff exact binding, minimization, caller-injection rejection, denial/failure/rollback matrix and no-side-effect tests |
| `tests/integration/authorized-source-capture.orthanc.integration.test.mjs` | HTTPS A exact source inventory/bytes plus runtime-role evidence/Audit failure and B-unchanged integration |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/DICOM-INTEROPERABILITY-PROFILE.md` | Recommendation, Acceptance and normative traceability update |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Current progress/status synchronization |
| `docs/implementation/MEDIQ-PACS-001/*` | Ticket report and test evidence |

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
- Byte-preserving transfer policy is retained. The product-level zero-STOW and unchanged-B guarantee is still unproven because no transfer coordinator exists.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Current `npm run test:api -- --reporter=dot`: 35 files / 667 tests PASS; dedicated `npx vitest run tests/api/authorized-source-capture.test.mjs --reporter=dot`: 55/55 PASS.
- `npm run typecheck:api` and `npm run test:dicom-port-contract`: PASS.
- `./scripts/test-int001-source-capture.ps1 -EnvFile .env`: 35/35 isolated synthetic integration tests PASS; independent Audit/evidence observer PASS; B EMPTY before/after; scratch cleanup and existing `mediq` stack preservation PASS.
- PACS-001 fence integration: PASS in the isolated PostgreSQL scratch DB, including revoke/fence concurrency and operation-row non-change.
- The first aggregate run failed at the local migration smoke because four trailing spaces in already-applied migration `0018` had been stripped from the source file. A retained migrator image confirmed the exact historical bytes; those bytes were restored without editing the DB ledger or changing SQL semantics. The direct migration smoke and subsequent complete `scripts/test-db-008-full-schema.ps1 -EnvFile .env` rerun both exited `0`. DB-008 clean/reset/reapply, 18-table/20-migration catalog, DB-002~007 regressions, PACS-007, PACS-001 fence, exact RLS/privilege probes and scratch cleanup passed. See [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
- Isolated Test Orthanc read-only integration: 5/5 PASS; no STOW or PACS mutation.
- Ticket result: **PARTIAL**.

## 8. 미구현 사항 및 잔여 위험

- The full coordinator must prove it gets the mapping from trusted persisted state and calls this validator for every exact source instance before dispatch.
- `PACS-001-DEC-005` ephemeral handoff is PASS only for its internal scope; no persistent UID inventory is stored, and the ordinary source-capture result remains minimized. The exact inventory is transient application memory and cannot survive a process crash; no JavaScript zeroization guarantee is claimed. This is not the PACS coordinator or a dispatch capability.
- The fence has only been proven for internal paths using the shared helper and same database; full coordinator's atomic authorization + durable `STOW_STARTED` dispatch boundary remains open.
- Endpoint/TLS preflight integration, Integrity/Provenance/Audit gates, STOW result parsing, destination verification/reconciliation, and product-level zero-STOW/B-unchanged negative tests remain open.
- Exact equality of synthetic PatientID strings is not real-patient identity proof or cross-hospital identity matching.
- `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` remain NOT RUN.

## 9. 최종 판정

```text
Ticket: MEDIQ-PACS-001
Scope: Internal identity/fence sub-gates plus `PACS-001-DEC-005` ephemeral source inventory handoff only
Changed: Added `captureForCoordinator()` with immutable operation/evidence binding and exact hashed server-derived Series/SOP inventory; ordinary `capture()` four-field result unchanged; expanded unit and isolated live Test Orthanc/PostgreSQL Acceptance evidence and synchronized documents
Not changed: Full coordinator, HTTP route/controller/worker, new DB grants/schema/migration, operation transition/`STOW_STARTED`, destination verifier invocation, STOW, PACS write or reconciliation; existing `0018` SQL bytes remain restored to their applied checksum only
Security impact: Handoff is transient internal data, not authorization; no PatientID/Local Patient ID/payload/credentials, persistent UID inventory, route or DICOM write capability; return occurs only after final fenced reauthorization and evidence+success-Audit transaction; no zeroization claim
Tests executed: Focused source-capture 55/55; API 35 files/667 tests; API typecheck; DICOM Port contract; isolated source-capture/Test Orthanc/PostgreSQL 35/35; independent Audit/evidence observer; B EMPTY before/after, zero STOW/destination calls, operation `CREATED`, scratch cleanup/existing stack unchanged; prior fence/DB-008 evidence remains recorded
Tests not executed: Full coordinator-level product no-STOW/B-unchanged gate, Mandatory Preflight/dispatch/`STOW_STARTED`, live STOW, unknown-outcome reconciliation, terminal Integrity/Provenance/Audit, production TLS/PKI and P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-PACS-001/
Remaining risks: Handoff is lost on process failure and cannot resume a transfer; no effect-capable coordinator consumes it; full Mandatory Preflight, endpoint/TLS, destination verification integration and terminal Integrity/Provenance/Audit remain open
Status: PARTIAL
```

## 10. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PARTIAL` | `PACS-001-DEC-002` 권고안/Acceptance 후 identity preflight primitive와 read-only WADO projection 구현; full coordinator는 후속 |
| 2026-10-01 | `PARTIAL` | `PACS-001-DEC-003` 권고안/5개 Fence Acceptance 후 shared Session fence와 operation-time internal Authorization 재검증 구현; PostgreSQL revoke serialization/denial/no-operation-state PASS. 후속으로 migration `0018` 원본 체크섬 drift를 exact byte 복원으로 해결하고 DB-008 aggregate/local migration smoke 전부 PASS; full coordinator는 미완 |
| 2026-10-02 | `PARTIAL` | `PACS-001-DEC-005`의 ephemeral source identity handoff 권고안과 `HANDOFF-001~007` Acceptance 기록; 코드/시험은 아직 미실행 |
| 2026-10-02 | `PARTIAL` | `PACS-001-DEC-005` handoff internal sub-gate PASS; `HANDOFF-001~007` scoped Acceptance, API and isolated Test Orthanc/PostgreSQL evidence recorded. Full coordinator remains unimplemented |
