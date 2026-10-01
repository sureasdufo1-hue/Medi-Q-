# MEDIQ-DCM-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DCM-002` |
| 제목 | Synthetic Orthanc DICOMweb Adapter and Streaming Spike |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PARTIAL` — internal adapter/read-only interoperability scope only |

## 1. 목표

승인된 DICOM Gateway Port 뒤에 synthetic local Test Orthanc 전용 내부 adapter를 구현하고, QIDO/WADO streaming compatibility를 A에서 확인하며 B의 destination baseline을 읽기 전용으로 검증한다. 실제 B STOW는 Mandatory Preflight/operation Authorization 구현 전까지 실행하지 않는다.

## 2. 범위

### 포함

- Server-owned immutable Test A/B endpoint resolver, role별 operation 제한과 caller URL/credential 미노출
- QIDO Study allowlist projection, bounded JSON body/page, fixed sanitized error
- WADO Study metadata의 Study/Series/Instance hierarchy projection
- One-instance WADO multipart streaming, media/boundary/header/byte/time limits, cancellation/backpressure cleanup
- 1-based rendered-frame JPEG streaming 및 byte cap
- Per-instance STOW multipart stream/response parser — mocked contract only
- Destination B QIDO read-only baseline
- Isolated Docker Compose compatibility test runner

### 제외

- Public/controller/API route 또는 adapter provider 등록
- Live STOW, A→B transfer, retry/idempotency workflow
- Runtime `hospital_endpoints` DB lookup, Tenant context 또는 business Authorization
- Consent/Grant/revocation fencing, Mandatory Preflight, PatientMapping administration/reconciliation
- Production HTTPS/mTLS, credential PKI, Integrity/Provenance/Audit transaction
- Viewer/Download, performance/memory high-water benchmark, external Hospital PACS support

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-DICOM-001~004`; `DICOM-INTEROPERABILITY-PROFILE.md` §§8–15 | QIDO/WADO/STOW Port conformance, per-instance streaming, bounded profile | `TC-DCM-002-*`; adapter unit + isolated Orthanc integration |
| 보안 | `SEC-DICOM-001~005`; `SEC-TLS-001`; `THR-011/012/019/020` | fixed endpoint/credential, role separation, fail-closed media/limits, Test HTTP exception | resolver tests, no route registration, Compose internal networks; TLS remains open |
| API·도메인 | `DCM-001-DEC-001`; `DCM-002-DEC-001`; `ORG-003-DEC-001`; typed `DicomGateway` Port | Port-only internal adapter; A QIDO/WADO, B QIDO/STOW role split | `services/api/src/dicom/application/dicom-gateway.port.ts` |
| Acceptance | `TC-DCM-002-CFG-001~003`, `QIDO-001~002`, `WADO-001~004`, `STOW-001~003`, `VER-001`, `SEC-001~004`, `RUN-001~002` | Adapter and local compatibility evidence only | [Acceptance table](../../ACCEPTANCE-TESTS.md#p0-synthetic-orthanc-dicomweb-adapter-acceptance--mediq-dcm-002) |

## 4. 구현 결과

`OrthancDicomwebAdapter`는 `DicomGateway`를 구현하며 adapter 밖에서 PACS URL/credential을 전달받지 않는다. `TestOrthancEndpointResolver`는 고정된 A/B Hospital ID, 정확한 Compose DNS/port/path, development/test-only HTTP, operation role pair 및 server-side Basic credential을 검사한다. Resolver는 runtime `hospital_endpoints`를 조회하지 않고 adapter는 어떠한 제품 route에도 등록하지 않았다.

QIDO는 DICOM JSON의 `vr` 필드를 검증하고 Study UID/date/modalities/count만 반환한다. WADO metadata도 Study/Series/Instance UID와 modality/SOP class만 projection한다. Instance WADO는 `@ubercode/multipart-stream@1.1.0`을 사용해 하나의 `application/dicom` part를 WHATWG stream으로 전달하고 64 MiB body, 16 KiB part-header, idle/total timeout 및 cancellation을 적용한다. Orthanc A의 세 synthetic instance bytes/hash가 ENV-007 manifest와 일치했고 JPEG frame도 읽기 전용으로 확인했다.

STOW body framing과 success/partial/UNKNOWN 응답 처리는 unit test에서만 확인했다. A→B STOW는 수행하지 않았다. `AGENTS.md` §5의 PACS import Mandatory Preflight가 아직 구현되지 않았기 때문이다. B의 matching fixture UID baseline은 0건이며, test run 전후 QIDO만 실행했다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/dicom/infrastructure/test-orthanc-endpoint-resolver.ts` | immutable Test A/B endpoint/credential resolution, environment/role/context 검증 |
| `services/api/src/dicom/infrastructure/orthanc-dicomweb.adapter.ts` | typed QIDO/WADO/frame/STOW/verification adapter, streaming, caps/timeouts/errors |
| `services/api/package.json`; `package-lock.json` | parser dependency `@ubercode/multipart-stream@1.1.0` 고정 |
| `tests/api/orthanc-dicomweb.adapter.test.mjs` | 14 focused transport/negative/resource contract tests |
| `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | A read-only QIDO/WADO/frame + B baseline Node integration tests |
| `services/api/Dockerfile`; `infra/docker-compose.yml` | isolated `dicom-test` profile runner, internal A/B networks, read-only manifest mount |
| `docs/POLICY-DECISION-LOG.md`; `docs/ACCEPTANCE-TESTS.md` | recommendation, mandatory no-live-STOW correction, Acceptance statuses |
| `docs/DICOM-INTEROPERABILITY-PROFILE.md`; `docs/TECH-STACK-DECISION.md`; `docs/SYSTEM-ARCHITECTURE.md` | actual adapter compatibility, profile limits, standards/default syntax and security boundary |
| `docs/IMPLEMENTATION-PLAN.md`; `docs/P0-EXECUTION-SCHEDULE.md`; `docs/implementation/README.md` | current status, next recommendation-first gate and index synchronization |
| `docs/implementation/MEDIQ-DCM-002/IMPLEMENTATION-REPORT.md`; `TEST-EVIDENCE.md` | ticket-level implementation/test evidence |

## 6. 영향 분석

### Architecture

- Adapter는 typed Port 뒤의 infrastructure 구현이며 Nest Controller/Module/provider와 연결하지 않았다.
- Dedicated test container는 A/B internal Compose network에만 붙고 Orthanc host ports는 공개하지 않는다.
- Native `fetch`/WHATWG stream을 사용한다. Multipart parser는 저사용량·single-maintainer로 residual maintenance/supply-chain risk가 남아 exact version/lockfile을 고정했다.

### API·Data

- OpenAPI, database schema/migration/grants, runtime registry lookup은 변경하지 않았다.
- local B PACS content는 읽기 전용으로 유지했다. Live STOW 없음.

### Security·Privacy

- Consent, Authorization, Grant, Tenant boundary 또는 Mandatory Preflight를 구현했다고 주장하지 않는다.
- HTTP Basic credentials는 Compose test env에서만 adapter가 주입한다. 값은 URL, log, return payload, docs에 기록하지 않는다.
- Test-only HTTP is not `SEC-TLS-001` evidence. Production HTTPS/certificate validation remains a release gate.
- DICOM JSON은 typed allowlist로 축소하며 raw dataset/body/name/accession을 응답하지 않는다. Pixel/DICOM bytes는 per-instance stream으로만 test adapter 안에서 전달된다.
- Wrong destination/mapping no-STOW, Part 10 metadata validation, hash persistence and audit/provenance remain later gates.

## 7. 실행 및 검증 요약

- 실제 명령·결과·미검증 사항: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Focused: 14/14; Test Orthanc read-only integration: 5/5; API regression: 26 files / 487 tests; TypeScript and Port contracts: PASS.
- Verification conclusion: **PARTIAL**. Adapter/read-only compatibility is verified; protected PACS transfer is not.

## 8. 변경하지 않은 사항

- No product route, Authorization executor wiring, PACS import operation, Consent/Grant check or Preflight implementation.
- No B write, STOW retry, product Integrity/Provenance/Audit, TLS production path, UI/Viewer, schema or database privilege change.
- No real patient, live PACS credential or production DICOM.

## 9. 결정 및 예외

- `DCM-002-DEC-001`: [Policy Decision Log](../../POLICY-DECISION-LOG.md#dcm-002-dec-001--synthetic-orthanc-dicomweb-adaptertransportpatient-id-gate)
- STOW live-write authorization in the earlier draft was narrowed before execution because it conflicted with the higher-priority mandatory Preflight invariant. The adopted scope uses a mock STOW contract and read-only B baseline.
- DICOM PS3.18 `application/dicom` default syntax is Explicit VR Little Endian when omitted; adapter requests that syntax explicitly. Orthanc test fixture bytes/hash were independently checked against its approved manifest.

## 10. 잔여 위험과 후속 작업

- `MEDIQ-PACS-004` must validate destination PatientMapping and prove Mandatory Preflight rejects before STOW. Product operation authorization must bind Tenant, Consent, Grant/action/resource and expiry before the adapter is called.
- Only the local synthetic Orthanc profile is exercised. No production HTTPS/TLS, arbitrary hospital interoperability, external DICOM corpus, performance/high-water benchmark, STOW live response, destination verification after a transfer, Integrity/Provenance/Audit or complete A→MediQ→B flow.
- Parser dependency’s single-maintainer risk needs version/update review and dependency scanning in CI.

## 11. 최종 판정

```text
Ticket: MEDIQ-DCM-002
Scope: Internal test-profile Orthanc adapter; A read-only compatibility and B baseline; mocked STOW only
Changed: Resolver, adapter, tests/Compose runner, dependency, linked profile/decision/Acceptance/plan/evidence docs
Not changed: Public API, operation Authorization, Preflight, live STOW/A→B, DB, production TLS, product Integrity/Provenance/Audit
Security impact: Exact internal endpoint/role and server credential controls; bounded streaming; no route or product authorization claim
Tests executed: API 26 files/487 tests, focused 14 tests, Orthanc 5/5 read-only integration, API/Port/AppConfig type checks — PASS
Tests not executed: Live STOW, HTTPS/TLS, wrong-mapping no-STOW product test, product route/BOLA, complete E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: PACS-004/Authorization/Preflight; external PACS; TLS; Integrity/Provenance/Audit; parser maintenance risk
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PARTIAL` | Recommendation/Acceptance, internal adapter and A read-only Orthanc evidence recorded; live STOW excluded by mandatory Preflight |
