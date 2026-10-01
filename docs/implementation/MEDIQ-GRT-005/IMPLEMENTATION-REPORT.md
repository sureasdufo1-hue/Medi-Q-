# MEDIQ-GRT-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-005` |
| 제목 | P0 TransferGrant Scope Enforcement |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped pure-policy Acceptance |

## 1. 목표

승인된 P0 action-to-scope mapping을 기존 `decideObjectAuthorization` pure policy에서 default-deny로 검증하고, 전용 `TC-GRT-005-AUTH-001~008` Acceptance 및 기존 AUT-003 근거와 연결한다. 동일 정책 로직을 중복 생성하지 않는다.

## 2. 범위

### 포함

- 기존 pure policy를 사용하는 전용 acceptance test coverage와 traceability
- `VIEW→study:view`, `DOWNLOAD→study:download`, `PACS_IMPORT→study:pacs-transfer`의 정확한 대응
- Missing/wrong/duplicate/unknown/P1 scope, Consent 미허용 및 resolver/evidence 오류의 fail-closed 검증

### 제외

- 별도 Scope evaluator, API/HTTP route, DB/schema/grant/migration 변경
- Viewer/Download/PACS/STOW side effect 또는 operation-time race fencing

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-GRT-004` | Requested Action must have its exact supported Grant Scope; Grant scopes cannot exceed Consent actions | `decideObjectAuthorization` plus dedicated policy tests |
| 보안 | `SEC-GRANT-005`; `THR-006`; `SEC-CONSENT-008` | Default deny on mismatched/expanded scope; no action coercion | exact allow pairs and negative cases |
| API·도메인 | `GRT-005-DEC-001`; `AUT-003-DEC-001`; `TransferGrant` P0 scope allowlist | Reuse pure policy; no route or action side effect | shared evaluator |
| Acceptance | `TC-GRT-005-AUTH-001~008`; `TC-AUT-003-OBJ-001/005/009`; `AT-SEC-010/011` | Scope mapping, containment and denial paths | focused unit suite |

## 4. 구현 결과

Existing `decideObjectAuthorization` already enforces the exact action-to-Grant-Scope mapping and default-deny semantics. This Ticket reuses that policy and adds eight dedicated, named regression cases rather than a second implementation. All eight GRT-005 Acceptance IDs and the full API suite passed.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `tests/api/object-authorization-policy.test.mjs` | dedicated `TC-GRT-005-AUTH-*` assertions over the shared pure evaluator |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/IMPLEMENTATION-PLAN.md` | recommendation, scope and traceability |

## 6. 영향 분석

### Architecture

- No architecture or route wiring change; tests reuse the existing pure authorization policy.

### API·Data

- No API contract, DB schema, runtime privilege, persistence or PACS behavior change.

### Security·Privacy

- Tightens evidence for the existing Consent/Grant scope gate; synthetic evidence only; no new PHI or Audit fields.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: focused policy file 96/96 and full API regression 24 files/461 tests PASS; API typecheck PASS.

## 8. 변경하지 않은 사항

- No endpoint/Viewer/Download/PACS/STOW wiring, production behavior claim or in-flight fencing.

## 9. 결정 및 예외

- `GRT-005-DEC-001` — [Policy Decision Log](../../POLICY-DECISION-LOG.md#grt-005-dec-001--기존-pure-authorization-policy를-통한-grant-scope-enforcement)

## 10. 잔여 위험과 후속 작업

- Pure `ALLOW` is one policy result only and does not prove that evidence is trusted at runtime or that protected HTTP/resource behavior is safe; integration gates remain separate.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-005
Scope: Pure action-to-Grant-Scope enforcement regression/traceability only
Changed:
Not changed:
Security impact:
Tests executed: API build, focused policy file 96/96, API typecheck and full API regression 24/461; see TEST-EVIDENCE.md
Tests not executed: Protected HTTP, live Evidence Reader, Viewer/Download/PACS/STOW and race-fencing integration
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks:
Status: PASS (pure policy scope only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | GRT-005-DEC-001 and eight Acceptance cases recorded first; existing pure policy reused; focused 96/96 and API 24/461 tests passed |
