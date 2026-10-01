# MEDIQ-AUT-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-001` |
| 제목 | P0 Authorization context value object |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — context shape/validation scope only; authorization decision and protected access remain unimplemented |

## 1. 목표

`REQ-AUT-001`의 필수 입력을 누락 없이 표현하는 불변·비영속 Authorization Context를 정의하고 malformed input을 거부한다. Context 생성은 Authorization `ALLOW`를 뜻하지 않는다.

## 2. 범위

### 포함

- `AUT-001-DEC-001` 권고안과 context-shape Acceptance 확정
- IAM-002 `VerifiedActorTenantContext`에서 Actor/Tenant/optional Hospital/Actor type을 가져오는 typed context factory
- ExchangeSession, MediQ internal Resource kind/UUID, `VIEW|DOWNLOAD|PACS_IMPORT`, Consent UUID, TransferGrant UUID 필수 검증
- Context와 nested Resource의 immutable copy
- Unit negative tests와 기준 문서/추적성 동기화

### 제외

- Authorization `ALLOW/DENY` 정책 evaluator, repository lookup 또는 실제 Consent/Grant 상태·scope·expiry 검증
- Tenant/object/action/recipient/patient binding 판정
- Controller/API route, OpenAPI 변경, DB grant/RLS/migration, Audit writer
- PAT-002 runtime integration/API grant, PACS/DICOM side effect, 실제 환자정보

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `AUT-001-DEC-001` | Context 형식만 구현; 결정/route/DB 권한은 후속 Gate | `POLICY-DECISION-LOG.md` |
| 요구사항 | `REQ-AUT-001` | Actor/Tenant/Session/Resource/Action/Consent/Grant 입력 명시 | `TC-AUT-001-CTX-001~005` |
| 보안 | `SEC-AUTHZ-001`, `SEC-AUTHZ-010~011`; `INV-AUT-001~004` | Verified identity boundary, no implicit permission, deny/fail-closed invariants | `authorization-context.test.mjs`; no decision code |
| Domain | `DOMAIN-MODEL.md` §19 | Context is non-persistent; IDs are references, not credentials | value object |
| Acceptance | `ACCEPTANCE-TESTS.md` AUT-001 section | Complete, malformed, enum, immutability, no-decision boundaries | 5 scoped checks PASS |
| Dependency | `MEDIQ-IAM-002`; `MEDIQ-PAT-002` | Consume verified context type; preserve PAT-002 runtime grant gate | no AppModule/API wiring |

## 4. 구현 결과

`AuthorizationContext` validates and copies the verified identity fields plus required UUID references. It accepts only `STUDY`, `SERIES`, or `INSTANCE` internal resource references and explicit P0 actions. UUIDs are normalized to lowercase; context and nested resource are frozen. The only result is a context object—there is no policy decision property or `authorize` method.

Validation confirms shape only. It cannot prove that the identity object came from the IAM-002 service, that Consent/Grant rows exist or are active, or that any references match the same Tenant/session/resource/action. Future application orchestration must obtain identity from IAM-002 and resolve references server-side before constructing this object; AUT-002~004 and Consent/Grant work must enforce the decision.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/domain/authorization-context.ts` | Context type, finite action/resource kinds, UUID/required-field validation, immutable copy |
| `tests/api/authorization-context.test.mjs` | Complete/invalid input, enum, immutability and no-decision tests |
| `docs/POLICY-DECISION-LOG.md` | `AUT-001-DEC-001` recommendation and decision |
| `docs/DOMAIN-MODEL.md` | P0 Authorization Context shape and trust limitation |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md` | Acceptance/traceability link to scoped context tests |
| `docs/ACCEPTANCE-TESTS.md` | `TC-AUT-001-CTX-001~005` and executed outcomes |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/implementation/README.md` | Ticket status and next gates |
| `docs/implementation/MEDIQ-AUT-001/*` | Implementation report and test evidence |

## 6. 영향 분석

### Architecture

- Domain value object only; `AppModule` has no Authorization module/provider/controller wiring.
- Existing IAM-002 remains the sole runtime Actor/Tenant resolver; no change to its transaction wrapper.

### API·Data

- OpenAPI, schema, migration, privileges, database rows and public API were not changed.
- No Consent/Grant or PatientMapping data is read or written.

### Security·Privacy

- Required references and enumerated values reject malformed/incomplete context; no value defaults to a privileged action.
- Context/UUID presence is explicitly not an authorization credential. No protected access was added.
- Unit fixtures use synthetic identifiers only; no PHI, credentials, DICOM or secrets were added.

## 7. 실행 및 검증 요약

- `npm run test:api`: TypeScript build PASS; 9 test files / 127 tests PASS.
- `npx vitest run tests/api/authorization-context.test.mjs`: 1 file / 27 tests PASS.
- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- No authorization decision, default-deny evaluator, business endpoint, database access/grant/migration, audit write or DICOM action.
- No PatientMapping runtime grant or route; `MEDIQ-PAT-002` remains `PARTIAL`.
- No live issuer/provider, Tenant integration test, Consent/Grant persistence lookup, object binding or PACS E2E claim.

## 9. 결정 및 예외

- `AUT-001-DEC-001` is normative under `PDEC-001` and the standing recommendation-led policy.
- The Trust limitation is intentional: TypeScript interface membership is not runtime proof of provenance. Do not expose this factory to a route until server orchestration binds it to IAM-002 and the later policy gates.
- This ticket does not relax any security invariant or PAT-002 gate.

## 10. 잔여 위험과 후속 작업

- **Open:** Context constructor itself only validates shape. A future route could misuse request-built values unless AUT-002~004 orchestration strictly obtains identity from IAM-002 and resolves all records server-side.
- **Open:** No policy currently evaluates Consent, Grant, resource ownership, tenant, recipient, action, status or expiry; all protected access must remain unavailable.
- **Next:** `MEDIQ-AUT-002` default-deny policy; then AUT-003 object/resource binding and AUT-004 fail-closed behavior, plus Consent/Grant dependencies before PAT-002 runtime enablement.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUT-001
Scope: Immutable Authorization Context value object and shape validation only
Changed: Domain context, 27 focused unit cases, normative Acceptance and decision records
Not changed: Policy decision, Consent/Grant lookup, object authorization, routes, DB grants/migrations, PatientMapping runtime access, PACS/DICOM
Security impact: Requires complete typed inputs and rejects malformed values; context is not proof or permission
Tests executed: npm run test:api (build + 127/127); focused AUT suite (27/27)
Tests not executed: Authorization/DB/API/Consent/Grant/Tenant/object integration and PACS E2E (outside this Ticket scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md and TEST-EVIDENCE.md
Remaining risks: No policy evaluator or trusted request orchestration; protected access must remain denied
Status: PASS (scoped Ticket)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` (scoped) | Recommendation/Acceptance-first context model implemented; API suite and 27 focused cases pass |
