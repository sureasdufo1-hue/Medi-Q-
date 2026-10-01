# MEDIQ-DCM-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DCM-002` |
| 제목 | Synthetic Orthanc DICOMweb Adapter and Streaming Spike |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PARTIAL` — adapter and read-only interoperability only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell host; Linux Alpine Node integration container |
| Runtime·Toolchain | Node.js 24, npm workspaces, TypeScript 6, Vitest 5, Docker Compose |
| 대상 환경 | Local synthetic development/test only |
| Services | Compose API and Orthanc A/B healthy; dedicated test runner attached only to internal `hospital-a`/`hospital-b` networks |
| Data | ENV-007 synthetic CT only; A contains 1 Study/1 Series/3 instances; B matching fixture baseline: 0 instances |
| State changes | No Orthanc STOW/POST, DICOM/PACS write/delete, migration, DB grant change or host-published Orthanc port |

## 2. 검증 매트릭스

| 검증 ID | 위험/요구사항 | 유형 | 실제 결과 | 판정 |
|---|---|---|---|---|
| `CFG-001~003` | Exact A/B authority, role split, test credentials, no caller endpoint/DB lookup | Unit/contract | Fixed A/B pair, wrong-role denial, production-profile denial, invalid host tested | PASS |
| `QIDO-001` | Fixture Study query on A | Orthanc integration | Study UID/date/CT/3-instance count matched manifest | PASS |
| `QIDO-002` | Malformed/oversize JSON, wrong media, unauthorized status, timeout | Unit/negative | Invalid shape/UID, page overflow, >1 MiB body, wrong media, 401 and idle deadline fail closed | PASS |
| `WADO-001` | Metadata projection/hierarchy | Orthanc integration | Study/Series/3 SOP UID hierarchy matched; minimized projection only | PASS |
| `WADO-002` | Multipart instance stream/integrity | Orthanc integration | All 3 A instances streamed; byte size and SHA-256 match ENV-007 manifest | PASS |
| `WADO-003` | Boundary/media/truncation/multiparts/limits/cancel | Unit/negative | Missing boundary, wrong media, truncated/multi-part, >16 KiB header, >64 MiB part and caller abort rejected | PASS |
| `WADO-004` | Rendered-frame path | Orthanc integration | Frame 1 returned and streamed as bounded `image/jpeg` | PASS |
| `STOW-001` | One-instance request framing/byte identity | Mock | B role/path, multipart framing and byte identity checked; no live Orthanc write | PASS — mock only |
| `STOW-002` | Partial result and uncertain response | Mock | Partial 202 retained; connection loss after POST start becomes UNKNOWN; no retry | PASS — mock only |
| `STOW-003` | Wrong mapping/no-STOW before import | Product gate | No protected caller/Preflight exists; live STOW prohibited | NOT RUN |
| `VER-001` | B destination baseline | Orthanc read-only integration | Two QIDO reads stable; 0 matching fixture SOP UIDs | PASS — baseline only |
| `SEC-001` | Internal Test network boundary | Compose/integration | Internal A/B networks, exact service DNS; no Orthanc host ports | PASS — not TLS evidence |
| `SEC-002` | Positive TLS/certificate behavior | Security | Test resolver denies non-development/test profile; no HTTPS adapter/certificate test | PARTIAL — TLS NOT RUN |
| `SEC-003` | Data minimization | Unit/static | Typed projection excludes PatientName/AccessionNumber; adapter has no logging path | PASS — adapter boundary only |
| `SEC-004` | Public route/Authorization bypass | Static wiring | Adapter has no controller/module/provider registration | PASS — no product auth claim |
| `RUN-001` | Deadline/cancellation/unknown STOW | Unit | QIDO idle, WADO abort/idle, truncation and started-STOW response loss exercised | PASS — scoped paths |
| `RUN-002` | Page/object/header/concurrency caps | Unit/resource | 100 page, 64 MiB streamed part, 16 KiB header and max concurrency 2 enforced | PASS — no production memory benchmark |
| API regression | Existing API behavior | Unit | `npm run test:api`: 26 files / 487 tests | PASS |
| Build/contracts/config | Types and baseline | Build/type test | API build/typecheck, Port contract, AppConfig 10/10 | PASS |

## 3. 실행 명령과 결과

### TEST-001 — focused adapter tests

```powershell
npm run build:api
npx vitest run tests/api/orthanc-dicomweb.adapter.test.mjs
```

- 결과: build succeeded; 1 file / 14 tests passed.
- 판정: `PASS`

### TEST-002 — API regression

```powershell
npm run test:api
```

- 결과: TypeScript API build succeeded; 26 files / 487 tests passed.
- 판정: `PASS`

초기 회귀 실행에서는 `node:test` Orthanc integration suite가 Vitest glob에 수집되는 테스트 구성 문제가 발견됐다. 해당 suite를 `tests/integration/`으로 분리하고 Compose 전용 runner에 고정한 뒤 재실행하여 회귀 26/487이 통과했다. 제품 코드 실패를 숨기지 않았다.

### TEST-003 — type, port and AppConfig checks

```powershell
npm run typecheck:api
npm run test:dicom-port-contract
npm run test:app-config
```

- 결과: API strict typecheck PASS; typed Port compile contract PASS; AppConfig build + 10/10 tests PASS.
- 판정: `PASS`

### TEST-004 — Test Orthanc read-only compatibility

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test
```

- 결과: 5/5 integration tests passed: A QIDO, minimal WADO metadata, all three per-instance byte/hash comparisons, rendered JPEG frame and repeated B QIDO baseline.
- B matching fixture baseline remained 0. Test runner made GET requests only; no STOW/POST and no A/B mutation occurred.
- Docker build npm audit reported 0 vulnerabilities; it warned that the existing esbuild install script remains pending approval. This task did not approve or run that install script.
- 판정: `PASS` — read-only local Orthanc subset only.

### TEST-005 — Compose and diff integrity

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test config -q
git diff --check
```

- Compose configuration check: PASS.
- `git diff --check`: exit code 0. Git printed repository-wide LF→CRLF conversion warnings for pre-existing/modified working files; no whitespace errors were reported and line-ending settings were not changed.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `CFG-001/002` | A→STOW, B→WADO, unknown Hospital, invalid host, redirect | Denied before alternate network path; Fetch uses `redirect: error` | PASS — adapter scope |
| `QIDO-002` | Malformed/oversized DICOM JSON, wrong media, 401, timeout | Fixed bounded error; upstream body/details are not returned | PASS |
| `WADO-003` | Missing boundary, truncated/multiple parts, wrong media, header/body caps, caller cancel | Fails closed; partial result is not returned as successful | PASS |
| `STOW-002` | Partial 202 or response loss after POST begins | Partial remains partial; response loss is `UNKNOWN`; adapter does not retry | PASS — mock only |
| `STOW-003` | Wrong/unknown destination PatientMapping | No Preflight/product caller exists; live STOW not attempted | NOT RUN — intentional security gate |
| `SEC-002` | Production HTTPS/mTLS/untrusted cert | No production adapter/PKI profile exists | NOT RUN / PARTIAL |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live STOW to B / A→B | Mandatory Preflight invariant; no authorized product operation | Mapping/authorization mismatch could mutate destination | `MEDIQ-PACS-004`, operation Authorization/Consent/Grant and Preflight; then new STOW recommendation/Acceptance |
| Positive HTTPS/TLS/mTLS | Local Compose profile is intentionally HTTP-only | Transport security is unproven outside isolated test network | `SEC-TLS-001` certificate/runtime test before deployment |
| Real wrong-mapping no-STOW test | Product destination mapping resolver/Preflight not wired | Byte-preserving `PatientID` may not equal destination local ID | PACS-004 / Authorization gate |
| Product Integrity/Provenance/Audit/full E2E | Outside adapter-only DCM-002 scope | No transaction completion proof | Later PACS import and `AT-DICOM-*` gates |
| Production memory/throughput benchmark | Only deterministic small fixture and hard caps tested | Production workload performance unknown | Separate workload recommendation and benchmark |
| External Hospital/vendor profile | One digest-pinned Orthanc version only | Vendor-specific deviations unknown | Per-site interoperability onboarding |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Focused adapter suite | `tests/api/orthanc-dicomweb.adapter.test.mjs` | synthetic UID; fake credential sentinels |
| Orthanc integration suite | `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | synthetic manifest; no credentials/raw DICOM logged |
| Synthetic source manifest | ignored local `data/synthetic-ct-env007/manifest.json` | synthetic IDs/hash only; not committed by this Ticket |
| Implementation report | `docs/implementation/MEDIQ-DCM-002/IMPLEMENTATION-REPORT.md` | no PHI/secret/payload |
| Compose/Git evidence | `config -q`, `diff --check` | `.env` values and expanded Compose config never printed |

## 7. 결론

- 결과: `PARTIAL` — internal adapter and read-only local Orthanc compatibility are verified.
- PASS 범위: focused 14 tests; API regression 26 files/487 tests; API typecheck; Port contract; AppConfig 10 tests; 5 read-only Orthanc integration tests.
- NOT PASS: live STOW, TLS/production security, Consent/Authorization/Grant/Preflight, wrong-mapping no-STOW product gate, Integrity/Provenance/Audit, Viewer/API and full P0 A→MediQ→B.
- B는 읽기 전용으로 확인했고 matching fixture instances는 0건이었다. 어떠한 Orthanc write/delete도 실행하지 않았다.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
