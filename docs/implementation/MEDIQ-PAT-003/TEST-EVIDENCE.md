# MEDIQ-PAT-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-003` |
| 제목 | Synthetic destination PatientMapping domain validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PARTIAL` — domain and API regression tests passed; DB/PACS integration not run |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local workspace |
| Runtime·Toolchain | Node.js `v24.18.0`; npm `11.16.0`; Vitest `5.0.2`; TypeScript compiler via `npm run build:api` |
| 대상 환경 | Local unit test; no DB/PACS connection |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PAT-003-DOM-001~008` | Exact binding and invalid mapping cases | Domain unit/security | Deterministic `VALID` or `DENY`; no Local Patient ID in result | 1 file, 18 tests passed | `PASS` |
| API regression | Existing API unit suite | Regression | Existing tests unchanged/pass | 16 files, 323 tests passed | `PASS` |
| `AT-SEC-012` | Invalid/missing mapping blocks PACS Import and STOW | Integration/security | Operation denied, STOW request count 0 | Not run; no PACS application/preflight wiring in scope | `NOT RUN` |

## 3. 실행 명령과 결과

### TEST-001 — TypeScript API build

- 실행 일시: 2026-09-30 (local; before focused test run)
- 목적: API source strict TypeScript compilation
- 명령:

```powershell
npm run build:api
```

- 종료 코드: 0
- 핵심 결과: TypeScript build completed without errors
- 판정: `PASS`

### TEST-002 — Focused PAT-003 Acceptance

- 실행 일시: 2026-09-30 20:20:06 local
- 목적: `TC-PAT-003-DOM-001~008` cases, malformed input handling and minimum result shape
- 명령:

```powershell
npx vitest run tests/api/patient-mapping-validation.test.mjs
```

- 종료 코드: 0
- 핵심 결과: 1 test file, 18 tests passed
- 판정: `PASS`

### TEST-003 — Full API regression

- 실행 일시: 2026-09-30 20:20:18 local
- 목적: Rebuild API and run all API unit tests
- 명령:

```powershell
npm run test:api
```

- 종료 코드: 0
- 핵심 결과: build passed; 16 test files, 323 tests passed
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-PAT-003-DOM-002~006` | missing / multiple / mismatch / unverified / ambiguous / revoked / malformed | Fixed fail-closed domain decisions; no PACS integration claim | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| PACS no-STOW integration | PACS application/preflight is outside PAT-003 and is not wired | Actual import denial cannot be claimed | `MEDIQ-PACS-004` / PACS import integration ticket |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit test output | This file; synthetic IDs/status only | PHI·Secret 없음 |

## 7. 결론

- 결과: `PARTIAL` for PAT-003 product requirement; scoped Domain acceptance PASS
- PASS 범위: `TC-PAT-003-DOM-001~008` (18 focused tests) and API regression only
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
