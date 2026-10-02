# MEDIQ-PACS-006 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-006` |
| 제목 | Exact destination Series and Instance verification primitive |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 결과 | `PARTIAL` — internal verifier Acceptance PASS; product post-STOW completion NOT RUN |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS / Shell | Windows, PowerShell `7.6.5` |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0`, Vitest `5.0.2` |
| 대상 환경 | Local synthetic/test repository; disposable test runner against configured local Test Orthanc A/B |
| 데이터 | Synthetic CT fixture only; no real patient, production PACS, or production credential |
| Docker | Local Compose `dicom-test` profile; HTTPS Test Orthanc |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PACS-006-INPUT-001` | 빈/잘못된/중복된 server-resolved inventory 및 경계값 거부 | Unit | 입력 검증 후 안전한 내부 오류 | adapter suite cases passed | `PASS` |
| `TC-PACS-006-QIDO-001` | 페이지 누락·중복 및 Warning 299/offset/limit 처리 | Unit | 전체 페이지 확인, 비정상 응답 fail-closed | page/progress/remaining-count cases passed | `PASS` |
| `TC-PACS-006-EXACT-001` | exact/missing/extra/wrong Series 및 2회 scan drift | Unit | 완전한 두 스캔 exact match만 true | hierarchy/exactness/stability cases passed | `PASS` |
| `TC-PACS-006-DUP-001` | 중복 Series/SOP 및 잘못된 Study/Series UID | Unit | 중복/계층 불일치 거부 | duplicate and hierarchy-denial cases passed | `PASS` |
| `TC-PACS-006-FAIL-001` | timeout·상한·pagination inconsistency | Unit | bounded fail-closed response | limit/deadline/inconsistency cases passed | `PASS` (adapter scope only) |
| `TC-PACS-006-COMP-001` | verifier 결과를 terminal completion에 결합하고 byte Integrity/Provenance/Audit 검증 | Integration | 전 조건의 atomic completion만 허용 | coordinator/evidence integration is not implemented | `NOT RUN` |
| `TC-PACS-006-BOUNDARY-001` | 실제 Test Orthanc A/B 경계·no-STOW baseline | Integration | A read-only checks pass; B unchanged and no write | HTTPS Orthanc suite 7/7; B empty and no STOW/POST | `PASS` |
| `AT-FUNC-013` (product) | 실제 post-STOW exact destination set 및 completion 증명 | Acceptance/E2E | full product destination verification | STOW/product coordinator is intentionally not wired | `NOT RUN` |

## 3. 실행 명령과 결과

### TEST-001 — API build and regression

- 실행 일시: `2026-10-02` (local run; Windows system display timezone not captured)
- 목적: adapter 및 관련 API 변경의 전체 빌드/회귀 검증
- 명령:

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: `0`
- 핵심 결과: `Test Files 35 passed (35); Tests 652 passed (652)`; build included and successful
- 판정: `PASS`

### TEST-002 — focused destination-verifier suite

- 명령:

```powershell
npx vitest run tests/api/orthanc-dicomweb.adapter.test.mjs --reporter=dot
```

- 종료 코드: `0`
- 핵심 결과: `Test Files 1 passed (1); Tests 31 passed (31)`
- 판정: `PASS`

### TEST-003 — API typecheck

- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript `--noEmit` completed with no diagnostics
- 판정: `PASS`

### TEST-004 — DICOM Gateway Port compile contract

- 명령:

```powershell
npm run test:dicom-port-contract
```

- 종료 코드: `0`
- 핵심 결과: TypeScript Port contract compiled with no diagnostics
- 판정: `PASS`

### TEST-005 — isolated HTTPS Test Orthanc A/B integration

- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test
```

- 종료 코드: `0`
- 핵심 결과: `tests 7; pass 7; fail 0`; HTTPS/TLS, synthetic A QIDO/WADO/metadata/frame and B read-only baseline passed. B had zero instance UIDs, exact match false; no writes performed.
- 판정: `PASS` (read-only transport/adapter boundary only)

### TEST-006 — whitespace/conflict-marker check

- 명령:

```powershell
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: no whitespace errors reported
- 판정: `PASS`

### TEST-007 — Compose configuration validation

- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test config -q
```

- 종료 코드: `0`
- 핵심 결과: `dicom-test` profile configuration validated; no configuration output/errors
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PACS-006-INPUT-001` | empty/malformed/duplicate expected inventory | rejected by internal validator | `PASS` |
| `TC-PACS-006-QIDO-001` | incomplete, repeated, malformed, or inconsistent QIDO pages | bounded internal failure; no write path | `PASS` |
| `TC-PACS-006-EXACT-001` | missing/extra/wrong Series or changed second scan | exact match false or safe failure | `PASS` |
| `TC-PACS-006-DUP-001` | duplicate identities or response from wrong Study/Series | rejected | `PASS` |
| `TC-PACS-006-FAIL-001` | result/deadline/body/count ceiling exceeded | bounded internal failure; no write path | `PASS` |
| `TC-PACS-006-COMP-001` | reject terminal completion absent full evidence | product coordinator not present; not asserted | `NOT RUN` |
| Boundary | destination write/STOW | no write invoked; B remained empty | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Product `AT-FUNC-013` post-STOW | no STOW/coordinator/route is intentionally wired in this Ticket | live product destination verification and completion remain unproven | PACS-001 coordinator integration recommendation + Acceptance first |
| Atomic terminal completion with Integrity/Provenance/Audit | verifier is an internal read-only adapter primitive only | exact IDs alone cannot prove bytes, authorization, provenance, or completion | bind operation/source/destination and persist all required evidence atomically in a later ticket |
| Full Mandatory Preflight/no-STOW product security gate | outside PACS-006 implementation scope | do not enable STOW until this gate passes | complete Preflight/coordinator and product negative tests before any STOW enablement |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit Acceptance | `tests/api/orthanc-dicomweb.adapter.test.mjs` | synthetic UIDs only; no secrets or payloads recorded |
| Orthanc integration | `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | logs counts/outcome only; no patient identifiers emitted |
| Decision / Acceptance | `docs/POLICY-DECISION-LOG.md#pacs-006-dec-001--exact-destination-series-and-instance-verification`; `docs/ACCEPTANCE-TESTS.md#mediq-pacs-006--destination-study-verification-acceptance` | no PHI/credentials |
| Test command results | §3 above | no payload, token, key, secret, or PACS credential |

## 7. 결론

- 결과: `PARTIAL`
- PASS를 주장할 수 있는 범위: 내부 exact Series/SOP 목적지 검증 primitive, API regression/type/Port contract 및 합성 HTTPS Test Orthanc 읽기 전용 경계
- PASS를 주장할 수 없는 범위: post-STOW product `AT-FUNC-013`, route/coordinator, full Preflight, byte Integrity, atomic terminal Provenance/Audit, STOW 및 A→B E2E
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM은 증거에 포함하지 않았다.
