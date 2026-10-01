# MEDIQ-GRT-007 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-007` |
| 제목 | Strict TransferGrant Expiration Validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped |

## 1. 목표

Document and directly test strict server-time Grant validity and parent Session/Consent expiry boundaries by reusing the existing policy/domain rules; explicitly preserve expiry as access denial rather than asynchronous status mutation.

## 2. 범위

### 포함

- Eight dedicated temporal Acceptance cases mapped to the shared Authorization policy and existing issue-service TTL cap
- Exact `issuedAt <= now < expiresAt`, ACTIVE/not-revoked, Session/Consent validity, malformed-time fail-closed behavior

### 제외

- No second expiry evaluator, scheduler, state mutation, schema/migration, DB privilege, route or protected action

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-GRT-005` | Server-time strict expiration; never rely on status alone | pure policy + Grant issue service tests |
| 보안 | `SEC-GRANT-002`; `THR-007` | fail closed at exact expiry and on missing/contradictory time evidence | boundary matrix |
| API·도메인 | `GRT-007-DEC-001`; `TransferGrant.isTemporallyActiveAt`; `decideObjectAuthorization` | reuse existing half-open interval; no stored status rewrite | unit tests |
| Acceptance | `TC-GRT-007-EXP-001~008`; `TC-GRT-001-DOM-008`; `TC-AUT-003-OBJ-008` | temporal boundary and issuance TTL cap | focused policy/service suite |

## 4. 구현 결과

The existing pure policy and issue service already contained the temporal rules. Dedicated Acceptance-linked regression cases now cover the half-open validity interval, invalid/future timestamps, lifecycle/parent expiry and issue TTL cap. No runtime policy implementation change was needed.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `tests/api/object-authorization-policy.test.mjs` | named policy boundary cases EXP-001~007 |
| `tests/api/grant-issue.service.test.mjs` | named parent-expiry/TTL cap case EXP-008 |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | recommendation, execution evidence and traceability |

## 6. 영향 분석

### Architecture

- No architecture change; existing server policy remains authoritative.

### API·Data

- No API contract, DB schema, runtime grant, migration or status scheduler changes.

### Security·Privacy

- Keeps expired/terminal Grant denied; synthetic time fixtures only; no new data fields.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: focused policy/service suite 2 files / 145 tests, API typecheck, API build, and full API regression 25 files / 473 tests passed. See [TEST-EVIDENCE.md](TEST-EVIDENCE.md).

## 8. 변경하지 않은 사항

- Expiry denial does not automatically update stored Grant status; no HTTP/cache/in-flight fencing claim.

## 9. 결정 및 예외

- `GRT-007-DEC-001` — [Policy Decision Log](../../POLICY-DECISION-LOG.md#grt-007-dec-001--strict-temporal-grant-expiration-policy)

## 10. 잔여 위험과 후속 작업

- Pure time policy evidence does not prove live protected operations re-evaluate expiry at use time.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-007
Scope: Strict server-time expiration policy and existing issue TTL cap only
Changed:
Not changed:
Security impact:
Tests executed: focused temporal policy/service 2 files/145 tests; API build; API typecheck; full API regression 25 files/473 tests — PASS
Tests not executed: Protected HTTP operation-time enforcement, Viewer/Download/PACS, cache invalidation, session termination, in-flight fencing
Changed: Eight named Acceptance-linked regression tests and decision/requirements/security/plan/evidence documentation
Not changed: Runtime expiry policy, HTTP routes, database/schema/grants, Viewer/Download/PACS operations, or Grant status scheduler
Security impact: Adds regression evidence for existing fail-closed temporal rules; does not add a new runtime control or demonstrate operation-time enforcement
Evidence: TEST-EVIDENCE.md; TC-GRT-007-EXP-001~008
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Existing policy tests do not prove the expiry check runs on each protected operation or fences cached/in-flight work; no HTTP/image/PACS integration claim.
Status: PASS — scoped temporal policy and issuance TTL tests only
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` — scoped | GRT-007-DEC-001 and eight temporal Acceptance cases recorded before tests; existing strict expiry/TTL behavior confirmed by focused suite, typecheck, build and API regression |
