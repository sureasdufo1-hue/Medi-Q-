# MEDIQ-CON-006 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-006` |
| 제목 | P0 Consent allowed-action policy enforcement |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — pure policy Acceptance only |

## 1. 목표

`CON-006-DEC-001`에 따라 AUT-003 pure policy가 Consent evidence의 P0 Action을 `VIEW`, `DOWNLOAD`, `PACS_IMPORT`로만 인정하고 각 Action과 Grant Scope의 정확한 mapping을 강제하도록 한다. `MOBILE_EXPORT` 등 P1/unknown Consent action evidence는 요청이 다른 유효한 P0 Action이어도 `DENY`한다.

## 2. 범위

### 포함

- `authorizationActions`를 P0 Consent action evidence의 허용 목록으로 사용한다.
- P0 Action과 `study:view`, `study:download`, `study:pacs-transfer` 이외의 action/scope mapping을 정책에서 제거한다.
- Consent에 P1 `MOBILE_EXPORT`가 유효한 P0 action과 함께 저장된 것처럼 전달되는 negative case를 테스트한다.
- 기존 AUT-003 exact mapping·missing action·invalid/duplicate action·extra scope 시험을 재실행해 CON-006 Acceptance에 연결한다.

### 제외

- Consent request/domain enum 및 database schema (기존 schema의 future P1 enum은 변경하지 않음)
- Consent/Grant issue/revoke API, HTTP route, DB migration/runtime grant, Viewer/Download/PACS action
- Patient identity/legal consent, evidence reader provenance, HTTP BOLA, product A→B E2E

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 권고·정책 | `CON-006-DEC-001`, `PDEC-001` | P0 action allowlist와 exact action/scope map; alternatives 및 non-scope 선기록 | `docs/POLICY-DECISION-LOG.md` |
| 요구사항 | `REQ-CON-006`, `REQ-GRT-004` | invalid Consent actions 또는 scope mismatch는 deny | `TC-CON-006-AUTH-001~005` |
| 보안 | `SEC-CONSENT-008`, `SEC-GRANT-005`, `SEC-API-002`, `THR-005` | P0/P1 분리, deny by default, no scope expansion | synthetic pure policy tests |
| API·도메인 | `DOMAIN-MODEL.md` AUT-003 / `authorization-context.ts` | pure decision policy only; no API contract change | API regression |
| Acceptance | `TC-CON-006-AUTH-001~005` | matching positive mapping plus invalid/missing/extra/P1 negative evidence | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

AUT-003 now uses `authorizationActions` as the Consent evidence allowlist and contains only the three P0 Action→Grant Scope mappings. P1 `MOBILE_EXPORT` was removed from the P0 Consent-action and scope mapping. A regression case proves that otherwise valid `VIEW` evidence is denied when `MOBILE_EXPORT` is mixed into the Consent action set.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/domain/object-authorization-policy.ts` | Use the P0 Authorization Context action allowlist; remove the P1 scope mapping |
| `tests/api/object-authorization-policy.test.mjs` | Deny mixed P1 Consent action and duplicate Grant scope; run full policy regression |
| `docs/POLICY-DECISION-LOG.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/DOMAIN-MODEL.md`, `docs/THREAT-MODEL.md`, `docs/ACCEPTANCE-TESTS.md` | Recommendation, normative control, scope and traceability |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/P0-DEVELOPER-BASELINE.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `docs/REPOSITORY-BASELINE-AUDIT.md`, `docs/implementation/README.md` | Current progress checkpoint synchronization |

## 6. 영향 분석

### Architecture

- AUT-003 pure policy only; no new module, route, DB client, PACS adapter or side effect.

### API·Data

- No API/schema/migration/runtime-grant change. Existing database enum may retain future `MOBILE_EXPORT`, but P0 policy denies that action evidence.

### Security·Privacy

- Strictly narrows P0 policy acceptance; does not grant or revoke rights. Existing Tenant/Consent/Grant bindings and fail-closed behavior remain. Synthetic facts only; no PHI/secret.

## 7. 실행 및 검증 요약

- API regression: 20 files / 373 tests — PASS
- API typecheck — PASS
- Patch whitespace check — PASS
- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- Grant issue denial, route-level BOLA, DB evidence provenance, protected data non-disclosure and Viewer/Download/PACS no-side-effect evidence remain separate open gates.

## 9. 결정 및 예외

- `CON-006-DEC-001` is approved under standing recommendation-first user instruction. No exception to the security baseline.

## 10. 잔여 위험과 후속 작업

- Pure policy Acceptance does not prove Grant issue denial, trusted DB evidence provenance, HTTP BOLA/data non-disclosure, or prevention of Viewer/Download/PACS side effects. These remain separate planned Acceptance gates.

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-006
Scope: P0 pure Authorization Consent-action allowlist and exact Action/Grant-scope mapping
Changed: AUT-003 P0 Consent action allowlist and exact scope map; regression tests; normative docs and traceability
Not changed: Consent/Grant API, persistence, runtime grants, HTTP route, PACS and P1 Mobile Export
Security impact: Restrictive fail-closed policy; no new privilege
Tests executed: `npm run typecheck:api`; `npm run test:api` (20 files/373 tests); `git diff --check`
Tests not executed: HTTP BOLA, Grant issue endpoint, live DB evidence provenance, Viewer/Download/PACS and A→B product E2E (outside scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Policy-only; no HTTP or end-to-end operation proof
Status: PASS (scoped pure policy only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | Recommendation and 5 Acceptance cases recorded before implementation; 20-file/373-test API suite and typecheck passed |
