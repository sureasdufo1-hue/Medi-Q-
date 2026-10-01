# MEDIQ-AUT-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-003` |
| 제목 | Object-level Authorization policy contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — deterministic policy rules only; trusted DB evidence resolution and protected API enforcement remain gated |

## 1. 목표

`AUT-003-DEC-001`에 따라 RLS row visibility나 ID 소지만으로 접근을 허용하지 않고, server-resolved Session·Consent·Grant·Recipient·Resource·Action·Package·상태·만료가 모두 정확히 binding된 경우에만 `ALLOW`하는 P0 객체 인가 규칙을 구현한다. 업무계약과 Acceptance 번호를 보존·정합화하고 implementation과 documentation을 동일 Ticket으로 추적한다.

## 2. 범위

### 포함

- PDEC-001에 따른 권고안, 고려한 대안, 요구사항 ID 정합성 결정 기록
- 정확한 Context와 서버 조회 evidence snapshot에 대한 순수 object-authorization policy
- action↔scope 정확 매핑, consent scope containment, exact recipient 및 package binding
- resource evidence lookup port와 동일 request-scoped transaction client 전달 경계
- 누락·모순·만료·철회·알 수 없는 값·resolver 오류의 default deny
- 12개 Acceptance 및 API 회귀시험, 기준 문서와 추적성 갱신

### 제외

- PostgreSQL evidence-reader adapter, `mediq_runtime` business-table grant/RLS change, migration 또는 live DB lookup
- Nest provider/module registration, controller/API route, OpenAPI, data-return path
- HTTP BOLA `AT-SEC-003`, fail-closed no-data/no-side-effect `AUT-004` integration, Audit writer
- Consent/Grant issuance/workflow, Viewer/Download, PACS Preflight/STOW, PatientMapping runtime grant
- 실제 환자정보, 운영 PACS, production authorization, workforce role/capability policy

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `AUT-003-DEC-001` | exact binding policy, null-package grant deny, actor-null hospital scope, transaction-bound resolver contract | [정책 결정 로그](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-AUT-004` | Object-level authorization | `TC-AUT-003-OBJ-001~012` |
| 보안 | `SEC-API-002`; `THR-002` | BOLA/IDOR 방지; RLS와 UUID 지식은 permission 아님 | policy unit tests; HTTP `AT-SEC-003` remains pending |
| 보안 후속 | `REQ-AUT-003`; `SEC-AUTHZ-003`; `SEC-ERR-003` | 기존 Fail Closed 의미·ID 보존, API integration은 AUT-004 | `TC-AUT-004-FC-001~004` not run |
| Domain/Data | Authorization invariants; Consent/Grant/Exchange/Imaging models | Session lifecycle, Consent/Grant state/scope/recipient, Package/parent Study binding | `decideObjectAuthorization()` |
| Acceptance | `ACCEPTANCE-TESTS.md` AUT-003 section | 12개의 positive/negative rule groups | focused 86 tests PASS; full API suite PASS |
| 의존성 | `MEDIQ-IAM-002`, `MEDIQ-AUT-001/002`, `MEDIQ-PAT-002` | verified identity Context, default-deny engine, no PAT-002 route widening | policy not registered; mapping gate remains closed |

### 요구사항 식별 정합성

계획서 §14.2는 AUT-003을 Object Authorization, AUT-004를 Fail Closed로 정의하지만 기존 `REQ-AUT-003`은 Fail Closed 의미를 가진다. 승인된 의미와 기존 참조를 보존하기 위해 새 `REQ-AUT-004`를 Object Authorization에 배정하고, `REQ-AUT-003`의 integration Acceptance를 AUT-004에 연결했다. 기존 요구사항 ID를 재사용해 의미를 바꾸지 않았다.

## 4. 구현 결과

- `AuthorizationPolicyFacts`는 Session·Consent·Grant·Resource parent binding을 표현하는 server-resolved snapshot 계약을 정의한다.
- `decideObjectAuthorization()`은 정확한 Session, Patient, Source/Destination, Context Tenant/Hospital, Consent, Grant, Action/Scope, resource parent Study 및 Package binding을 검사한다.
- 허용 Session 상태는 `AUTHORIZED|READY|ACTIVE`; Consent는 `ACTIVE`, 과거 issue time, 미철회 및 정확한 Action; Grant는 `ACTIVE`, 미철회, `issuedAt <= now < expiresAt`, exact recipient 및 exact non-null Package다.
- Grant action/scope는 `VIEW→study:view`, `DOWNLOAD→study:download`, `PACS_IMPORT→study:pacs-transfer`로만 매핑하며, Grant 전체 scope는 Consent actions의 subset이어야 한다.
- Resource Package는 `AVAILABLE|IN_EXCHANGE`, 미삭제·미만료여야 한다. `SERIES`/`INSTANCE`는 resolver가 parent Study binding을 반환하지 않으면 deny한다.
- `ResolvedObjectAuthorizationPolicy`는 동일 request-scoped `PoolClient`를 `AuthorizationEvaluationScope`로 요구한다. 해당 client가 IAM-002 verified callback에서 왔는지는 client type만으로 증명되지 않으므로 실제 호출자는 후속 application integration에서 callback 안에 결합해야 한다.
- Policy는 `AppModule`에 등록되지 않았다. Resolver fake와 synthetic facts를 사용하는 86개 테스트는 규칙 동작만 증명하며 DB provenance나 제품 접근을 증명하지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/domain/authorization-facts.ts` | policy evidence read-model 계약 |
| `services/api/src/authorization/domain/object-authorization-policy.ts` | fail-closed object binding rules |
| `services/api/src/authorization/application/authorization-evidence.reader.ts` | context + request-scoped PoolClient reader port |
| `services/api/src/authorization/application/resolved-object-authorization.policy.ts` | evidence reader와 순수 규칙을 잇는 policy |
| `services/api/src/authorization/application/authorization-policy.port.ts` | optional evaluation scope 타입 확장 |
| `services/api/src/authorization/application/authorization-engine.ts` | policy에 request-scoped evaluation scope 전달 |
| `tests/api/object-authorization-policy.test.mjs` | policy positive/negative matrix, 86 tests |
| `docs/POLICY-DECISION-LOG.md` | `AUT-003-DEC-001`, REQ ID 정합성 및 선택 근거 |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md` | `REQ-AUT-004` 및 traceability; AUT-004 fail-closed 연결 |
| `docs/DOMAIN-MODEL.md`, `docs/DATA-MODEL.md` | policy invariants 및 nullable Package/recipient semantics |
| `docs/SYSTEM-ARCHITECTURE.md`, `docs/THREAT-MODEL.md` | transaction-bound evidence reader, BOLA residual risk |
| `docs/ACCEPTANCE-TESTS.md` | `TC-AUT-003-OBJ-001~012`; DB-009/AuthZ와 HTTP scope 분리 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md` | 진행 상태와 ticket/requirement traceability |
| `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `README.md` | 현황 및 미완료 범위 동기화 |
| `docs/implementation/README.md`, `docs/implementation/MEDIQ-AUT-003/*` | index, report, test evidence |

## 6. 영향 분석

### Architecture

- 순수 policy와 internal reader port만 추가했다. API/Worker/Nest wiring은 변경하지 않았다.
- Engine은 evaluation scope를 policy에 전달한다. 실제 workflow는 여전히 health-only API다.

### API·Data

- OpenAPI, database schema/migration, product DB grants/RLS, seed 및 persistent rows는 변경하지 않았다.
- Consent/Grant/Exchange/Imaging facts를 live DB에서 읽지 않았다.

### Security·Privacy

- RLS row visibility, UUID knowledge, Consent alone, Session state 또는 partial grant를 access proof로 취급하지 않는다.
- 만료 경계는 `expiresAt <= now` deny다. Consent `expiresAt=null`은 Data Model nullable을 보존해 scheduled expiry 없음으로 해석하되 Active/issued/withdrawn 검증을 계속 요구한다.
- `recipientActorId=null`은 정확한 IAM-002 verified destination Hospital membership에 한정한 hospital-level scope다. P0에 workforce role/capability가 없다는 잔여 위험은 synthetic/test에만 허용한다.
- PACS_IMPORT의 `ALLOW`는 Mandatory Preflight, Integrity/Provenance, Destination Verification, Audit 또는 STOW 실행을 대체하지 않는다.
- 테스트는 synthetic IDs/facts와 in-memory transaction stub만 사용; PHI, secrets, credentials, DICOM payload 없음.

## 7. 실행 및 검증 요약

- `npx vitest run tests/api/object-authorization-policy.test.mjs`: 1 file / 86 tests PASS.
- `npm run test:api`: API TypeScript build PASS; 11 files / 233 tests PASS.
- whitespace/static checks: 상세 [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
- Overall product authorization and `AT-SEC-003` remain NOT RUN.

## 8. 변경하지 않은 사항

- PostgreSQL resolver, business-table privilege/migration, RLS integration, source-of-facts provenance
- Consent/Grant persistence workflow and Session/Imaging live repository
- `AuthorizationPolicy` production registration, public route, OpenAPI, HTTP safe error, data response and Audit
- Viewer/Download/PACS import, preflight, integrity/provenance, PAT-002 mapping runtime access or E2E
- AUT-004 `REQ-AUT-003` HTTP/data/side-effect fail-closed behavior

## 9. 결정 및 예외

- `AUT-003-DEC-001`은 PDEC-001의 권고안 선기록 절차에 따라 기록 후 적용했다.
- 고려한 대안과 기각 근거는 Policy Decision Log에 기록했다. 특히 DB grants/API를 조기 개방하거나 null-package grant를 session-wide로 해석하지 않았다.
- Scope-only `PASS`는 policy function Acceptance에 한정하며 BOLA mitigation 전체 PASS가 아니다.

## 10. 잔여 위험과 후속 작업

- **HIGH / Open:** policy가 registered route에 연결되지 않았고 trusted evidence reader 구현도 없다. HTTP BOLA는 여전히 완화되지 않았으며 보호 경로를 열면 안 된다.
- **Open:** fake `PoolClient`는 IAM-002 callback provenance를 증명하지 않는다. Application Ticket에서 policy call/context/client를 같은 verified callback에 강제해야 한다.
- **Open:** Consent/Grant/Exchange/Imaging grants가 없고, AC runtime join에서 RLS 참여 Tenant 범위를 확인하는 DB tests가 없다.
- **Open:** `recipientActorId=null`의 hospital-wide grant는 role-less P0 residual이다. Production/실환자 사용 전에 workforce role/capability를 설계·검증해야 한다.
- **Next:** Consent/Grant runtime evidence repository를 최소 column/table privileges 및 A/B/C RLS negative tests와 함께 승인·구현하고, 이후 AUT-004에서 HTTP deny-before-data/side-effect를 검증한다. Gate 완료 전 PAT-002 runtime grant/route, Viewer/Download/PACS path는 닫힌다.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUT-003
Scope: Deterministic object-level authorization policy over an internal evidence-reader contract
Changed: Policy, transaction-scope contract, 86 focused tests, Acceptance/requirements/security/architecture/traceability docs
Not changed: PostgreSQL evidence adapter/grants, module or HTTP route, data response, Audit, PACS/Viewer/Download, PAT-002 access
Security impact: Exact bindings only; missing/malformed/mismatched/expired facts deny; no live path is opened
Tests executed: focused AUT-003 suite (86/86); npm run test:api (build + 233/233); static checks in TEST-EVIDENCE.md
Tests not executed: live DB/RLS resolver, protected API BOLA, HTTP safe error, no-data/no-side-effect, Audit, PACS/DICOM E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-AUT-003/
Remaining risks: no trusted facts source/route; actual object Authorization and P0 exchange remain incomplete
Status: PASS (scoped policy contract only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | AUT-003-DEC-001 구현, 12 Acceptance groups/86 focused tests, API regression 233/233; live resolver/API remains gated |
