# MEDIQ-PACS-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-004` |
| 제목 | Destination PatientMapping eligibility gate (internal; no STOW) |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PARTIAL` — internal gate/unit contract only; composite PACS Acceptance not run |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host, PowerShell 7.6.5 |
| Runtime·Toolchain | Node.js v24 / npm 11; TypeScript 6.0.3; Vitest 5.0.2 |
| 대상 환경 | Local build/unit regression plus isolated API-container startup/health smoke; no DB/PACS runtime |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PACS-004-REQ-001` | caller가 patient/local ID/destination/endpoint를 주입 | Unit/security | Unknown property를 DB/Auth 경계 전에 거부하고 입력을 echo하지 않음 | synthetic injected `localPatientId` rejected; tenant/SQL not entered | `PASS` |
| `TC-PACS-004-AUTH-001` | exact action, missing identity, DENY/non-exact effect, policy exception | Authorization-gated unit | `PACS_IMPORT` + `STUDY` context; exact ALLOW required; denial before data lookup | Context fields checked; missing principal/policy DENY/exception did not issue Session/Mapping query | `PASS` — fake policy, not real DB evidence |
| `TC-PACS-004-BIND-001` | persisted Session destination conflicts with verified Hospital | Unit/domain | Deny before Mapping read | Rehydrated different-destination Session denied; mapping query count=0 | `PASS` — service recheck only; DB-backed fact mismatch remains NOT RUN |
| `TC-PACS-004-DB-001` | Session and Mapping provenance/transaction scope | SQL contract | Session-derived PatientReference and verified destination Hospital queried with same client | Mock query parameters were `[sessionId]`, then `[verified destinationHospitalId, persisted patientRefId]`; one transaction callback | `PASS` — mock only, no actual PostgreSQL/RLS |
| `TC-PACS-004-MAP-001~003` | missing/invalid/valid mapping | Unit/security | Missing and invalid deny; one VALID+validatedAt returns mapping eligibility only | missing, AMBIGUOUS, UNVERIFIED, REVOKED, VALID without validatedAt and binding mismatch denied; valid returned only mappingId | `PASS` — synthetic/mocked repository |
| `TC-PACS-004-AUD-001` | invalid mapping denial Audit | SQL contract/security | fixed action/result/reason and actor/tenant/session/study/correlation; no local ID/DICOM/secret | Mock INSERT statement/parameters checked; no localPatientId in event | `PASS` — live DB/RLS/audit persistence not run |
| `TC-PACS-004-AUD-002` | Audit persistence fails | Failure/security | Operation fails closed and verified transaction rolls back | Audit mock error mapped to fixed unavailable; rollback recorded; no commit | `PASS` — mocked transaction only |
| `TC-PACS-004-SEC-001` | scope/side-effect capability | Structural/security | no controller/OpenAPI/STOW dependency | PACS module has no controller; gate source imports no DICOM Gateway/adapter; no public route added | `PASS` — static wiring review |
| Focused suite | Gate branch regressions | Unit | All focused cases pass | `npx vitest run tests/api/pacs-import-mapping-gate.test.mjs`: 1 file / 16 tests passed | `PASS` |
| API regression | Existing API behavior | Unit/regression | No regression | `npm run test:api`: 27 files / 503 tests passed | `PASS` |
| API typecheck / DICOM Port contract | Type boundaries | Compile | No type errors | `npm run typecheck:api` and `npm run test:dicom-port-contract` exit 0 | `PASS` |
| App config / Compose / diff | Runtime configuration and patch hygiene | Config | Existing local validation remains valid | AppConfig 10/10; Compose `config -q`; `git diff --check` exit 0 | `PASS` (LF→CRLF warnings only) |

## 3. 실행 명령과 결과

### TEST-001 — Build and focused PACS mapping-gate Acceptance

- 실행 일시: 2026-10-01 14:08 KST
- 목적: TypeScript build and new authorization/mapping/Audit gate cases
- 명령:

```powershell
npm run build:api
if ($LASTEXITCODE -eq 0) { npx vitest run tests/api/pacs-import-mapping-gate.test.mjs }
```

- 종료 코드: 0
- 핵심 결과: API build succeeded; focused PACS gate 1 file / 16 tests passed.
- 판정: `PASS` — unit/mocked boundary only

### TEST-002 — Full API regression

- 실행 일시: 2026-10-01 14:09 KST
- 목적: PACS module/provider and audit repository changes do not regress API tests
- 명령: `npm run test:api`
- 종료 코드: 0
- 핵심 결과: API build succeeded; 27 files / 503 tests passed.
- 판정: `PASS`

### TEST-003 — Types and config contracts

- 실행 일시: 2026-10-01 14:10 KST
- 명령: `npm run typecheck:api`; `npm run test:dicom-port-contract`; `npm run test:app-config`
- 종료 코드: all 0
- 핵심 결과: API/DICOM Port typechecks passed; AppConfig tests 10/10.
- 판정: `PASS`

### TEST-004 — Compose and whitespace validation

- 실행 일시: 2026-10-01 14:10 KST
- 명령: `docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test config -q`; `git diff --check`
- 종료 코드: both 0
- 핵심 결과: Compose model accepted; no diff whitespace errors. Git printed existing LF→CRLF normalization warnings.
- 판정: `PASS`

### TEST-005 — Isolated API container startup and health smoke

- 실행 일시: 2026-10-01 14:22 KST
- 목적: 변경된 API module/provider graph가 컨테이너에서 시작되고 기본 readiness/liveness endpoint를 제공하는지 확인
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml run --build --no-deps --rm api
docker exec mediq-api-run-fd8aed350a50 node -e "Promise.all(['live','ready'].map(async p=>{const r=await fetch('http://127.0.0.1:8080/api/v1/health/'+p); console.log(p,r.status,await r.text())}))"
```

- 결과: API container reached Docker `healthy`; `/api/v1/health/live` and `/api/v1/health/ready` both returned HTTP 200 (`alive`, `ready`). Initial diagnostic probe to port 3000 returned connection refused; inspection confirmed configured `MEDIQ_API_PORT=8080`, and the corrected probes passed.
- 경계: `--no-deps`; this verifies API startup/health only, not PostgreSQL/RLS, PACS, Authorization runtime, import or STOW. One-off container was stopped and removed after the probe.
- 판정: `PASS` — runtime startup/health smoke only

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PACS-004-AUTH-001` | Missing principal, non-ALLOW effect and policy exception | Fixed `AUTHORIZATION_DENIED`; no Session/Mapping query | `PASS` — mocked executor boundary |
| `TC-PACS-004-BIND-001` | Rehydrated Session destination differs from verified Hospital | Deny before PatientMapping query | `PASS` — mocked row; real evidence DB integration not run |
| `TC-PACS-004-MAP-001~002` | Mapping missing, invalid status/evidence, wrong binding, duplicate rows | Fixed mapping denial or fixed unavailable; no patient ID disclosure | `PASS` — mock/unit |
| `TC-PACS-004-AUD-002` | Denial Audit write failure | Rollback/fixed unavailable; no import continuation | `PASS` — fake client only |
| `AT-SEC-012` | Actual protected PACS Import with invalid mapping | Zero STOW-RS calls, destination unchanged, persisted denial Audit | `NOT RUN` — no PACS import route/coordinator; no actual Orthanc request in this Ticket |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live PostgreSQL/RLS mapping + Audit transaction | Ticket test fixture uses mocked PoolClient; no disposable PACS authorization fixture was prepared | Runtime column grants/RLS/Audit rollback remain unverified | Add isolated signed-OIDC/PACS fixture with no schema/privilege drift under PACS coordinator integration |
| Actual Orthanc no-STOW counter / B unchanged | This gate has no PACS operation route and no DICOM Gateway dependency | Full `AT-SEC-012` remains unproven | Wire into protected import coordinator only after required authorization/preflight gates; run before/after read-only B verification |
| Full Consent/Grant revocation fence, TLS, Integrity/Provenance | Explicitly beyond mapping-only gate; each is required before STOW | Authorized mapping alone can never justify a transfer | Complete mandatory preflight and operation fencing before any live write |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| `tests/api/pacs-import-mapping-gate.test.mjs` | Local Vitest output summarized above; no raw DICOM/log artifacts saved | Synthetic identifiers only; no PHI/Secret |
| `git diff --check` | Exit 0; line-ending warnings summarized above | No payload/credential output |

## 7. 결론

- 결과: `PARTIAL` — internal mapping gate only.
- PASS 가능 범위: focused unit/mocked query/Audit contracts, API regression, type/config checks, and static no-route/no-DICOM-dependency review.
- NOT PASS: live PostgreSQL/RLS atomicity, actual product import denial/no-STOW, Orthanc destination-unchanged, TLS, full Mandatory Preflight, operation fencing, and overall PACS/P0 E2E.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
