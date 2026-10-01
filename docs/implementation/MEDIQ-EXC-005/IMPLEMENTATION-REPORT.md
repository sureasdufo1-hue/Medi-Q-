# MEDIQ-EXC-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-005` |
| 제목 | ExchangeSession domain state transition rules |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — domain state-transition Acceptance PASS; application/runtime enforcement remains pending |

## 1. 목표

승인된 ExchangeSession positive lifecycle와 terminal transition을 immutable domain operation으로 강제하고, 불법 점프·역행·terminal reopen을 거부한다.

## 2. 범위

### 포함

- `EXC-005-DEC-001` 및 state-transition Acceptance를 먼저 기록
- ExchangeSession aggregate에 checked transition operation 추가
- 정상 흐름, terminal edge, completion time, monotonic timestamp 및 reject tests
- 전체 API build/unit regression

### 제외

- API/controller, repository state update, transaction/runtime DB grant/RLS
- Authentication, Tenant resolution, object/action Authorization, audit writer
- Consent/Grant expiry computation, PACS side effect 및 end-to-end terminal access denial

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `EXC-005-DEC-001` | edge matrix 및 pure-domain 경계 | domain transition method |
| 요구사항 | `REQ-EXC-005~006`, `INV-EXC-005~007` | lifecycle 표현·전이 불변성 | `TC-EXC-005-DOM-*` |
| 보안 | `SEC-API-002`, `SEC-AUTHZ-011`, `THR-002/029` | state/ID는 권한이 아니며 protected API integration 금지 | `TC-EXC-005-SEC-001` |
| Acceptance | `ACCEPTANCE-TESTS.md` ExchangeSession Transition | normal/terminal/invalid/time/immutability | `TC-EXC-005-*` |

## 4. 구현 결과

`ExchangeSession.transitionTo(nextState, now)`가 승인된 edge만 허용하고 terminal state에서 재전이를 차단한다. 정상 흐름과 상태별 terminal edge, 고정 오류코드, monotonic timestamp, `completedAt` 설정 및 원본 aggregate 불변성을 확인했다. 호출 API나 persistence는 연결하지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/exchange/domain/exchange-session.ts` | 허용 edge map, terminal lock, 고정 transition error, immutable transition operation |
| `tests/api/exchange-session.test.mjs` | 정상·terminal·금지 경로, timestamp, completion metadata 및 오류 비노출 시험 |
| `docs/POLICY-DECISION-LOG.md` | `EXC-005-DEC-001` 권고안과 적용 경계 기록 |
| `docs/ACCEPTANCE-TESTS.md` | `TC-EXC-005-DOM-001~004`, `SEC-001` 결과 기록 |
| `docs/REQUIREMENTS.md` | `REQ-EXC-005`를 domain Acceptance에 연결하고 runtime Gate 구분 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md` | 현재 범위와 PARTIAL 상태 동기화 |
| `docs/implementation/MEDIQ-EXC-005/IMPLEMENTATION-REPORT.md`, `TEST-EVIDENCE.md` | Ticket 구현 내용과 실제 시험 결과 기록 |

## 6. 영향 분석

### Architecture

- ExchangeSession domain only; no service/controller/provider registration.

### API·Data

- No schema/migration/repository/database mutation; returns a new in-memory aggregate.

### Security·Privacy

- State changes grant no access. Caller must later authenticate, authorize and persist under the trusted Tenant transaction; no route can currently invoke this method.

## 7. 실행 및 검증 요약

- 상세 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: Domain Acceptance와 API build/unit regression `PASS` (71/71); Ticket 전체는 runtime Gate 미완료로 `PARTIAL`

## 8. 변경하지 않은 사항

- API/state persistence, expiry decision, Consent/Grant/Authorization/Audit and PACS workflow.

## 9. 결정 및 예외

- `EXC-005-DEC-001`을 따른다. `expires_at`의 도메인 만료판정은 Application Service Acceptance까지 미룬다.

## 10. 잔여 위험과 후속 작업

- Runtime service must enforce authorization and time/consent/grant expiry before calling and persisting transitions.
- The current domain operation does not enforce terminal access denial through API, Viewer, Download or PACS.

## 11. 최종 판정

```text
Ticket: MEDIQ-EXC-005
Scope: Pure ExchangeSession domain transition rules and linked Acceptance/documentation
Changed: Domain transition operation/tests; recommendation, Acceptance, requirement mapping, schedule/status and Ticket evidence synchronized
Not changed: API, persistence, transaction context, AuthZ, Audit, PACS
Security impact: Illegal state changes denied in domain; no access right is granted; runtime enforcement absent
Tests executed: `npm run test:api` — build succeeded; 5 files / 71 tests passed; scoped source/config review
Tests not executed: API/database/Tenant/AuthZ/expiry/E2E integration
Evidence: `TEST-EVIDENCE.md`; Acceptance rows `TC-EXC-005-*`
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: transitions are not invoked/persisted by a protected application service
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | 권고안·Acceptance 선기록 후 pure domain transition 구현; API build 및 71개 API tests 통과. Runtime expiry·persistence·API/AuthZ는 미연결 |
