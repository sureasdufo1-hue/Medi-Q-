# MEDIQ-AUT-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-004` |
| 제목 | Authorization-gated application operation boundary |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — application orchestration boundary PASS; HTTP fail-closed integration remains NOT RUN |

## 1. 목표

승인 결정 `AUT-004-DEC-001`에 따라 IAM-002가 검증한 Actor/Tenant transaction callback 안에서 AuthorizationContext를 만들고, 같은 transaction client로 정책을 평가하며, exact `ALLOW`인 경우에만 보호 작업 callback을 실행하는 내부 경계를 구현한다. HTTP/API, 실제 증거 조회 및 PACS 기능이 없는 현 단계에서 가능한 안전한 범위를 검증하되, 제품 Authorization 또는 접근 완료로 과장하지 않는다.

## 2. 범위

### 포함

- `AuthorizationGatedOperationExecutor` 내부 application service
- IAM-002 verified identity와 Context identity의 필드별 일치 검사
- transaction callback 안에서 Authorization Engine 1회 호출 및 동일 `PoolClient` 전달
- exact `ALLOW`일 때에만 보호 callback을 정확히 1회 호출
- malformed/unissued Context, mismatch, DENY, unsupported result, dependency/policy/operation exception의 fail-closed 처리
- Acceptance 분리: `TC-AUT-004-APP-001~004`는 이 executor만 시험하고 기존 HTTP cases `TC-AUT-004-FC-001~004`는 미실행으로 유지

### 제외

- Nest `AppModule` provider 등록, Controller/HTTP route/OpenAPI 또는 HTTP status/body mapping
- PostgreSQL-backed Authorization evidence reader, runtime DB grant/RLS 변경
- Consent/TransferGrant persistence/workflow, PatientMapping runtime access
- Viewer/Download/WADO-RS/STOW-RS/PACS operation, Preflight, Audit, Integrity, Provenance
- `AT-SEC-003/017`, 실제 BOLA 또는 제품 데이터 비노출의 PASS 주장

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `AUT-004-DEC-001`, `PDEC-001` | APP boundary만 먼저 적용, HTTP/DB/PACS 경로는 닫음 | [정책 결정 로그](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-AUT-003` | 불확실/실패 시 deny/fail closed | `TC-AUT-004-APP-001~004`; HTTP `FC-001~004` pending |
| 보안 | `SEC-AUTHZ-003`, `SEC-ERR-003` | Policy·의존성 오류에서 보호 작업 실행 금지 | `tests/api/authorization-gated-operation.test.mjs` |
| 선행 경계 | `MEDIQ-IAM-002` | verified identity callback과 같은 transaction client 사용 | unit port contract; live IAM-002 경계는 별도 evidence 유지 |
| Acceptance | `TC-AUT-004-APP-001~004` | executor orchestration 검증 | 21 focused tests; 전체 API 회귀 |
| 미완료 Acceptance | `TC-AUT-004-FC-001~004`, `AT-SEC-003/017` | HTTP/data/BOLA/side effect integration | route/evidence reader 부재로 NOT RUN |

## 4. 구현 결과

새 executor는 caller의 인증 주체를 직접 해석하지 않고 IAM-002 `run` callback으로 전달된 verified identity만 받아 Context factory를 실행한다. Context가 발급된 `AuthorizationContext`인지 확인하고 Actor/Tenant/Hospital/issuer/subject/type이 verified identity와 일치해야 policy evaluation을 진행한다. 평가에는 같은 callback의 `PoolClient`를 전달하며 결과가 exact `ALLOW`가 아니면 callback을 건너뛴다. 허용된 경우 callback은 같은 context/client로 단 한 번 호출된다.

Context/policy/identity dependency 및 protected-operation 예외는 내부 메시지를 버리고 고정 오류로 정규화한다. IAM-002의 고정 denial/unavailable 오류는 그대로 전달한다. 이번 executor는 `AppModule`에 등록되지 않았고 어떠한 route/DB repository/PACS operation에도 연결되지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/application/authorization-gated-operation.executor.ts` | verified identity binding, same-client policy evaluation, exact-ALLOW callback and fixed errors |
| `tests/api/authorization-gated-operation.test.mjs` | allow/deny, malformed identity/context, policy/identity/operation failure and callback-boundary tests |
| `docs/POLICY-DECISION-LOG.md` | recommendation and scope recorded before implementation (`AUT-004-DEC-001`) |
| `docs/ACCEPTANCE-TESTS.md` | application and HTTP Acceptance IDs separated |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md` | traceability synchronized |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | current scoped status synchronized |
| `docs/implementation/MEDIQ-AUT-004/*` | this report and test evidence |

## 6. 영향 분석

### Architecture

- Internal unregistered class only; `AppModule`, module graph, controller and route count unchanged.
- Uses the existing IAM-002 callback boundary and existing Authorization Engine; no PostgreSQL evidence reader was created.

### API·Data

- No API/OpenAPI, schema, migration, database grant, persisted data or PACS configuration change.
- The operation callback is an internal abstraction only; no business repository or external side effect is wired.

### Security·Privacy

- Missing/malformed/unissued Context, identity mismatch, non-ALLOW, policy failure and unknown dependency error fail closed before callback.
- Same-client transaction binding and exact single callback are unit-tested through a synthetic IAM port; this is not live end-to-end IAM/AuthZ proof.
- No PHI, real patient identity, Secret, PACS credential or DICOM payload was used.
- Generic errors are defined at the application boundary. Actual HTTP status/body and response headers remain unimplemented and NOT RUN.

## 7. 실행 및 검증 요약

- API build: PASS
- Focused AUT-004 executor tests: 21/21 PASS
- API typecheck: PASS
- Full API regression: 13 files / 290 tests PASS
- Detailed commands/results: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- HTTP/API exposure, actual database evidence resolution, protected DB grants, Consent/Grant lifecycle and runtime authorization
- PatientMapping route/runtime integration
- Viewer, Download, WADO-RS, STOW-RS, PACS, Mandatory Preflight, Audit/Integrity/Provenance
- Overall `DB-009`, `PAT-002`, product P0 Authorization or A→B E2E status

## 9. 결정 및 예외

`AUT-004-DEC-001` was recorded first under standing recommendation workflow `PDEC-001`. The adopted recommendation intentionally advances only the internal application boundary. HTTP-specific cases retain their original IDs and remain `NOT RUN`; APP-specific cases use new IDs so unit PASS cannot be confused with HTTP acceptance.

## 10. 잔여 위험과 후속 작업

- The executor's policy dependency is only a port at this stage; the current real object policy has no trusted PostgreSQL-backed evidence reader/provider and is not registered.
- An HTTP caller, safe error filter, protected-resource route and live policy/data integration do not exist.
- PACS side effects must not be run through this generic callback until a separate preflight/idempotency/integrity/provenance/audit/destination-verification workflow is implemented and accepted.
- Keep PatientMapping/Exchange runtime grants and all protected routes closed. Implement evidence resolver, Consent/Grant runtime checks and HTTP fail-closed/BOLA Acceptance as separate approved gates.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUT-004
Scope: Internal Authorization-gated application orchestration boundary
Changed: Executor, 21 focused tests, traceability and ticket records
Not changed: HTTP/API, database evidence reader/grants, Viewer/Download/PACS, Audit, product access
Security impact: Exact ALLOW and same-client IAM callback required; unknown/error denies before callback
Tests executed: API build, focused 21/21, API typecheck, full API regression 13 files / 290 tests
Tests not executed: HTTP FC-001~004, AT-SEC-003/017, live PostgreSQL evidence reader, PACS/E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-AUT-004/
Remaining risks: No trusted evidence reader or protected route; DB-009/PAT-002/business Authorization gates remain open
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | 권고안 기록 후 내부 executor 구현; unit/orchestration Acceptance 통과; HTTP integration 보류 |
