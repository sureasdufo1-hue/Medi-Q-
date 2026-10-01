# MEDIQ-CON-006 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-006` |
| 제목 | P0 Consent allowed-action policy enforcement |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — pure policy Acceptance only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell |
| Runtime·Toolchain | Node.js `v24.18.0`; npm `11.16.0`; Vitest `5.0.2` |
| 대상 환경 | Local pure policy/unit test |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-006-AUTH-001` | Exact three P0 Action/Scope pairs | Unit/Security | exact pairs ALLOW with valid synthetic evidence | All three exact mappings allowed | `PASS` |
| `TC-CON-006-AUTH-002` | Consent lacks requested Action | Unit/Security | DENY | Each P0 action denied when absent from Consent | `PASS` |
| `TC-CON-006-AUTH-003` | `MOBILE_EXPORT` mixed into otherwise valid P0 Consent actions | Unit/Security | DENY | `VIEW` plus `MOBILE_EXPORT` denied | `PASS` |
| `TC-CON-006-AUTH-004` | Unknown/duplicate Consent action | Unit/Security | DENY | `ADMIN` and duplicate `VIEW` denied | `PASS` |
| `TC-CON-006-AUTH-005` | Mismatched/unknown/P1/duplicate/extra Grant scope | Unit/Security | DENY | Wrong, mobile, unknown, duplicate, and Consent-expanding scopes denied | `PASS` |
| API typecheck/regression | Type safety and project regressions | Build/Unit | PASS | typecheck PASS; 20 test files / 373 tests PASS | `PASS` |
| `git diff --check` | Patch whitespace | Static check | no whitespace errors | no whitespace errors | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API typecheck and full API regression

- 실행 일시: 2026-10-01
- 목적: changed policy typing and full existing API regression
- 명령:

```powershell
npm run typecheck:api
npm run test:api
```

- 종료 코드: both `0`
- 핵심 결과: typecheck passed; `npm run test:api` built API and passed 20 test files / 373 tests.
- 판정: `PASS`

### TEST-002 — Patch whitespace check

```powershell
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: no whitespace errors. Git emitted only informational LF→CRLF notices for pre-existing modified tracked files.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-006-AUTH-003~005` | Invalid P1/unknown/duplicate action and invalid/expanded scopes | DENY at pure policy boundary | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| HTTP BOLA and route data non-disclosure | No protected route is in this Ticket; `AT-SEC-003` remains separate | Product endpoint integration unverified | Future protected-route Ticket |
| Grant issue endpoint denial and PACS side effects | No Grant/PACS route is in this Ticket | No issuance/effect claim | Grant/PACS integration Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Source diff and local test output | Ticket source and test files; no external artifact | Synthetic fixtures only; no PHI/Secret |

## 7. 결론

- 결과: `PASS` — P0 pure policy cases only
- PASS를 주장할 수 있는 범위: AUT-003 pure decision policy over synthetic Authorization evidence; no endpoint or product operation claim
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
