# MEDIQ-EXC-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-001` |
| 제목 | ExchangeSession domain and lifecycle value model |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — scoped domain Acceptance; runtime integration excluded |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest |
| 대상 환경 | Local unit/build tests; no product DB write |
| 데이터 | Synthetic identifiers only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-EXC-001-DOM-001` | Unique Session creation and initial state | Unit | New UUID, approved references, `REQUESTED`, valid timestamps | Passed | `PASS` |
| `TC-EXC-001-DOM-002` | Invalid IDs, same source/destination and invalid purpose | Unit | Fixed domain error; no input reflection | Passed | `PASS` |
| `TC-EXC-001-DOM-003` | Declared state reconstitution and timestamp validity | Unit | All 12 states accepted; unknown/invalid dates rejected | Passed | `PASS` |
| `TC-EXC-001-DOM-004` | Immutable state/date boundaries and optional dates | Unit | Defensive Date copies; invalid optional dates rejected; no unapproved time/state relation inferred | Passed | `PASS` |
| `TC-EXC-001-SEC-001` | Session ID/state authority boundary | Security/documentation | No API, provider, DB grant or authorization claim is introduced | Source/config review passed; AppModule imports HealthModule only; no DB grant/config change | `PASS` |
| `TC-EXC-001-REG-001` | API regression | Build/unit | Existing API tests and API build pass | TypeScript build passed; 4 files / 50 tests passed | `PASS` |

## 3. 실행 명령과 결과

### TEST-001

- 실행 일시: 2026-09-30 local time
- 목적: API TypeScript build와 전체 API domain/unit 회귀시험
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: API TypeScript build PASS; Vitest 4 files passed, 50 tests passed.
- 판정: `PASS` for domain/unit scope

### TEST-002

- 실행 일시: 2026-09-30 local time
- 목적: 변경사항의 whitespace 오류 여부 점검
- 명령:

```powershell
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: whitespace error 없음. 기존 작업 트리의 여러 파일에 LF→CRLF 안내만 출력.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-EXC-001-DOM-002` | malformed UUID, same hospitals, blank/over-limit purpose | Fixed generic domain error; all rejected | `PASS` |
| `TC-EXC-001-DOM-003` | Unknown state | Rejected with fixed generic domain error | `PASS` |
| `TC-EXC-001-SEC-001` | Premature route/grant/authentication implication | No route or grant is added | `PASS` — scope review |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Tenant/RLS/API/runtime integration | Deliberately outside EXC-001 and prerequisites are not implemented | No runtime access/authorization claim | Later EXC/IAM/AuthZ Acceptance |
| State transition and expiry enforcement | Assigned to `MEDIQ-EXC-005` | Domain reconstitution alone does not enforce lifecycle | Implement with its own Ticket and Acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit/build output | To be recorded after execution | Synthetic IDs only |

## 7. 결론

- 결과: `PASS` — ExchangeSession domain/unit Acceptance only
- PASS를 주장할 수 있는 범위: `TC-EXC-001-DOM-001~004` and `TC-EXC-001-SEC-001`
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
