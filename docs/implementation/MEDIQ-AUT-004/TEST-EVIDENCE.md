# MEDIQ-AUT-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | MEDIQ-AUT-004 |
| 제목 | Authorization-gated application operation boundary |
| 분류 | CAPSTONE-P0 |
| 작성일 | 2026-09-30 |
| 결과 | PARTIAL — scoped executor tests pass; HTTP/product integration is not run |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js v24.18.0; npm 11.16.0; TypeScript 6.0.3; Vitest 5.0.2 |
| 대상 환경 | Local API TypeScript build, unit tests, typecheck |
| 데이터 | Synthetic UUIDs and in-memory identity/policy/client fakes only |
| 외부 시스템 | No live PostgreSQL, HTTP business route, Orthanc/PACS or DICOM payload |

## 2. Acceptance 검증 매트릭스

| 검증 ID | 핵심 assertion | 실제 결과 | 판정 |
|---|---|---|---|
| TC-AUT-004-APP-001 | Missing, malformed/unissued/forged Context; identity mismatch; absent policy/dependency | No policy/operation callback; generic deny/unavailable only | PASS — malformed context, all six verified identity fields, throwing factory, absent policy, and identity failure covered |
| TC-AUT-004-APP-002 | DENY/non-exact/unsupported result or rejected evaluation | Protected callback not invoked | PASS — DENY, unsupported values, no-policy and evaluator-rejection cases |
| TC-AUT-004-APP-003 | Exact ALLOW path | One decision precedes one callback; same PoolClient forwarded | PASS — synthetic IAM callback/policy contract; no live fact provenance claimed |
| TC-AUT-004-APP-004 | IAM/operation unexpected errors | Internal details not returned; fixed error boundary | PASS — operation and unexpected identity errors normalized; IAM fixed errors preserved |
| TC-AUT-004-FC-001~004 | HTTP fail-closed, data/BOLA and real side-effect behavior | Fixed safe HTTP result and zero protected side effect | NOT RUN — no protected route or PostgreSQL evidence reader |
| AT-SEC-003, AT-SEC-017 | HTTP object-ID BOLA and safe error response | No protected response/data disclosure | NOT RUN — no protected resource route/error mapping |

## 3. 실행 명령과 결과

### TEST-001 — API build, focused tests and typecheck

- 실행 일시: 2026-09-30 17:27 KST
- 명령 (각각 실행):
  - npm run build:api
  - npx vitest run tests/api/authorization-gated-operation.test.mjs
  - npm run typecheck:api
- 종료 코드: 0 for all three commands.
- 핵심 결과: API TypeScript build successful; focused suite 1 file / 21 tests passed; no-emit typecheck successful.
- 판정: PASS for implementation and focused application-boundary scope.

### TEST-002 — API build and full regression suite

- 실행 일시: 2026-09-30 17:27 KST
- 명령: npm run test:api
- 종료 코드: 0
- 핵심 결과: API TypeScript build succeeded; 13 test files passed, 290 tests passed.
- 판정: PASS for API unit/contract regression scope.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| APP-001 | Missing/forged Context, different Actor identity, context factory error | Deny before policy/callback | PASS |
| APP-002 | DENY, unsupported decision result, absent policy, policy rejection | Callback not invoked | PASS |
| APP-003 | Exact ALLOW | One policy evaluation and one operation callback; same synthetic transaction client | PASS |
| APP-004 | Protected operation or unknown IAM dependency exception | Fixed safe error; internal message not returned | PASS |
| FC-001~004 | HTTP response, real evidence reader, database grants, PACS/Viewer callback | No such integration path exists to execute | NOT RUN |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| HTTP safe status/body, AT-SEC-017 | No protected controller/route or error filter | Application errors are not verified at HTTP boundary | Add safe HTTP mapping in a separate protected-route ticket |
| Real BOLA, AT-SEC-003 | No route and no PostgreSQL-backed trusted evidence reader | Unit policy/context cannot prove resource non-disclosure | Implement reader, route, tenant/action tests and negative HTTP integration |
| Live IAM-002 + policy + evidence reader integration | Executor tests use synthetic IAM port; IAM-002 has separate acceptance evidence | Combined wiring could regress | Integrate after evidence-reader scope/grants Acceptance |
| Viewer/Download/WADO/STOW/PACS side effects | No business operations connected | No product side-effect prevention claim | Require separate Preflight/idempotency/Integrity/Provenance/Audit/verification gates |
| Database/PACS/E2E | Outside Ticket scope and no runtime business grants | Overall P0 transfer remains unimplemented | Keep DB-009/PAT-002 grants/routes closed pending separate gates |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Focused tests | tests/api/authorization-gated-operation.test.mjs | Synthetic identifiers only; no PHI/Secret |
| API regression | 13 files / 290 tests, npm run test:api | No live DB/PACS or DICOM payload in this Ticket suite |
| Build/typecheck | npm run build:api; npm run typecheck:api | No secrets emitted |

## 7. 결론

- 결과: PARTIAL
- PASS를 주장할 수 있는 범위: Internal application executor fail-closed orchestration, 21 focused tests and API unit/contract regression.
- TC-AUT-004-FC-001~004, AT-SEC-003/017, live PostgreSQL evidence authorization, protected HTTP resource behavior, PACS side effects, product authorization and full P0 E2E remain NOT RUN.
- No real patient data, production credential, Secret or operational DICOM was used.
