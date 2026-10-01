# MEDIQ-AUT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-001` |
| 제목 | P0 Authorization context value object |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — scoped context-shape Acceptance only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript 6, Vitest 5 |
| 대상 환경 | Local compile and unit tests; no database/API service write |
| 데이터 | Synthetic identifiers only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-AUT-001-CTX-001` | Complete trusted identity + all decision-input references | Unit | Required fields are copied and bound; no decision is created | Complete context assertions passed | `PASS` |
| `TC-AUT-001-CTX-002` | Missing/malformed identity, Session, Consent or Grant | Negative unit | Reject with fixed domain error; no permissive fallback | 13 missing/malformed cases rejected | `PASS` |
| `TC-AUT-001-CTX-003` | Unsupported resource/action, DICOM UID or arbitrary permission string | Negative unit | Only declared resource kinds and actions accepted | Invalid kinds/actions/IDs rejected; declared values accepted explicitly | `PASS` |
| `TC-AUT-001-CTX-004` | Mutable input changes after context creation | Unit/security | Context and nested Resource are immutable copies | Object/nested freeze and copy assertions passed | `PASS` |
| `TC-AUT-001-CTX-005` | Context existence or UUID mistaken for permission | Boundary inspection/unit | No decision field/service/route/grant is introduced | No decision property; `AppModule`, `OPENAPI.yaml`, migrations and DB grants unchanged | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and regression suite

- 실행 일시: 2026-09-30 15:50 KST (local)
- 목적: Compile API and run all API unit/contract suites including AUT-001
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript build passed; Vitest 9 files passed, 127 tests passed.
- 판정: `PASS` for API unit/contract regression scope

### TEST-002 — Focused AUT-001 suite

- 실행 일시: 2026-09-30 15:51 KST (local)
- 목적: Independently verify the new Authorization Context test suite
- 명령:

```powershell
npx vitest run tests/api/authorization-context.test.mjs
```

- 종료 코드: `0`
- 핵심 결과: 1 test file passed; 27 tests passed.
- 판정: `PASS` for `TC-AUT-001-CTX-001~005`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-AUT-001-CTX-002` | Missing identity/session/consent/grant; malformed issuer/subject/UUID/hospital/type | Fixed `InvalidAuthorizationContextError`; no fallback | `PASS` |
| `TC-AUT-001-CTX-003` | Unknown resource kind/action or DICOM UID as internal resource ID | Rejected; no implicit action promotion | `PASS` |
| `TC-AUT-001-CTX-004` | Mutate caller-owned resource or returned resource | Context retains original copy; frozen mutation rejected | `PASS` |
| `TC-AUT-001-CTX-005` | Present otherwise valid context and refs as access proof | Context contains no decision result; no route or policy wiring | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Consent/Grant row existence, state, scope, recipient, expiry and matching | Deliberately outside AUT-001 context-shape scope; no policy/repository exists | Well-formed references do not prove authorization | Consent/Grant persistence and AUT-002~004 policy Acceptance |
| Cross-Tenant/object/action Authorization through live DB/API | No business route or protected repository is registered by this Ticket | Future callers could misuse shape-only values absent trusted orchestration | Wire only after verified IAM-002 and object/action tests; keep PAT-002 denied |
| DICOM/Orthanc/PACS E2E | No imaging action or side effect in AUT-001 | No imaging-access claim | Later DICOM/Viewer/PACS Acceptance |

이 항목들은 본 Ticket의 완료 조건이 아니며 실행 결과를 PASS로 간주하지 않는다. 전체 제품 Authorization 또는 P0 E2E는 여전히 미완료다.

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Full API unit/contract output | `npm run test:api` — exit 0, 9 files / 127 tests | Synthetic fixtures; no PHI/secret |
| Focused AUT output | `npx vitest run tests/api/authorization-context.test.mjs` — exit 0, 27 tests | Synthetic UUIDs only |
| Route/schema boundary | `services/api/src/app.module.ts`, `docs/OPENAPI.yaml`, migration list | No Authorization route/migration/grant added |

## 7. 결론

- 결과: `PASS` for scoped AUT-001 only
- PASS 범위: complete context shape, typed action/resource allowlist, malformed input rejection, immutability and no-decision boundary.
- 미검증·미구현: all actual Authorization decisions, Consent/Grant verification, object/Tenant binding, protected API and A→B DICOM flow.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않았다.
