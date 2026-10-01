# MEDIQ-EXC-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-005` |
| 제목 | ExchangeSession domain state transition rules |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | Domain Acceptance + API build/unit regression: `PASS` (71/71); runtime integration: `NOT RUN` |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest |
| 대상 환경 | Local API build/unit tests; no product DB write |
| 데이터 | Synthetic identifiers only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-EXC-005-DOM-001` | Mainline lifecycle | Unit | seven-state positive lifecycle traversed only by its six approved edges; `COMPLETED` reached from `ACTIVE` with completion time | Positive path traversed in order; `completedAt` equals completion transition time | `PASS` |
| `TC-EXC-005-DOM-002` | State-specific terminal edges | Unit | `REJECTED`/`REVOKED` only from approved states; `EXPIRED`/`FAILED`/`CANCELLED` from any non-terminal | Approved terminal edges accepted for all declared non-terminal states | `PASS` |
| `TC-EXC-005-DOM-003` | Skip/backward/same/unknown/terminal reopen | Unit/security | fixed transition error; original aggregate unchanged | Invalid edges, unknown state, and all terminal reopen attempts rejected; original snapshot unchanged | `PASS` |
| `TC-EXC-005-DOM-004` | Timestamp and inconsistent completion metadata | Unit | invalid/backward time and corrupt pre-existing completion metadata rejected; immutable return value | Invalid/backward transition time and inconsistent non-terminal completion metadata rejected; new aggregate returned | `PASS` |
| `TC-EXC-005-SEC-001` | State is not authority or side effect | Security/scope review | no API/provider/repository/runtime grant added; no authorization or PACS call | Source/config scope review confirms domain-only method; no route/provider/grant or side-effect wiring added | `PASS` — scope review only |
| `TC-EXC-005-REG-001` | API regression | Build/unit | API build and all API unit suites pass | `npm run test:api`: TypeScript build succeeded; Vitest 5 files / 71 tests passed | `PASS` |

## 3. 실행 명령과 결과

2026-09-30, repository root:

```text
npm run test:api
Exit code: 0
> npm run build:api && vitest run tests/api
> tsc --project tsconfig.json — succeeded
Test Files  5 passed (5)
Tests       71 passed (71)
Duration    2.47s
```

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-EXC-005-DOM-003` | Skip/backward/reopen a terminal Session | Rejected with fixed transition error; source aggregate unchanged | `PASS` |
| `TC-EXC-005-DOM-004` | Time moves backwards or current snapshot is completion-inconsistent | Rejected with fixed transition error | `PASS` |
| `TC-EXC-005-SEC-001` | Treat transition as permission or invoke side effect | No runtime wiring is added; verified by source/config scope review | `PASS` — scope only |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Persisted state update under `mediq_runtime` | DB-009 trusted Tenant transaction/AuthZ wrapper is absent and grant remains denied | Domain state is not persisted or concurrency-safe at runtime | Add application service with optimistic/concurrency control and separate grant review after IAM/AuthZ gates |
| Expiry/Consent/Grant enforcement | No policy service currently decides these inputs | Domain accepts a requested `EXPIRED` edge but cannot prove expiration eligibility | Verify session/consent/grant timing in authorized application service before transition |
| Terminal access denial through API/PACS | No Exchange API or PACS import path | Domain terminal lock alone cannot block access | Implement EXC-003/004/006 and Preflight Acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit/build output | Command output summarized in §3; 5 files and 71 tests passed | Synthetic only; no PHI/secret/payload |

## 7. 결론

- 결과: Domain Acceptance 및 API build/unit regression `PASS` (71/71); Ticket 전체 `PARTIAL`
- PASS 범위: pure domain lifecycle edge enforcement, fixed error, timestamp/completion rules, API regression, scope review
- Domain tests do not prove API enforcement, persistence, AuthZ, expiry policy or end-to-end denial.
