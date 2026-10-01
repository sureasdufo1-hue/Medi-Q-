# MEDIQ-AUT-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-003` |
| 제목 | Object-level Authorization policy contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — pure policy contract only; live evidence/API access not tested |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0`, TypeScript `6.0.3`, Vitest `5.0.2` |
| 대상 환경 | Local TypeScript build and API unit/contract suite |
| 데이터 | Synthetic UUIDs, in-memory server-fact fixtures, fake reader and fake transaction client only |
| 외부 시스템 | No database/PACS/API route used by AUT-003 tests |

## 2. Acceptance 검증 매트릭스

| 검증 ID | 핵심 assertion | 실제 결과 | 판정 |
|---|---|---|---|
| `TC-AUT-003-OBJ-001` | P0 Action마다 정확한 Consent Action + Grant Scope만 허용 | VIEW, DOWNLOAD, PACS_IMPORT 각 정확한 pair에서만 `ALLOW` | `PASS` |
| `TC-AUT-003-OBJ-002` | 누락·불완전·위조 Context/evidence, 잘못된 transaction scope, reader 실패 deny | missing records, forged Context, no transaction, rejection, throwing evidence에서 `DENY` | `PASS` |
| `TC-AUT-003-OBJ-003` | Session/Patient/Source/Destination binding, state와 expiry | 10개 cross-record mismatch, 6 disallowed states 및 expiry error deny | `PASS` |
| `TC-AUT-003-OBJ-004` | Consent ID/status/issue/expiry/withdrawal | wrong ID, non-ACTIVE, missing/future issue, withdrawal, expired/malformed expiry deny; valid null expiry accepted | `PASS` |
| `TC-AUT-003-OBJ-005` | Consent Action 및 optional Package | missing/duplicate/unknown action과 package mismatch deny; exact package equality exercised | `PASS` |
| `TC-AUT-003-OBJ-006` | Grant ID/session/Consent chain | wrong Grant ID, Session and Consent relationship deny | `PASS` |
| `TC-AUT-003-OBJ-007` | Recipient Tenant/Hospital/Actor binding | wrong recipient, wrong/missing context hospital deny; null actor only on exact destination hospital | `PASS` |
| `TC-AUT-003-OBJ-008` | Grant status, revocation, issue/expiry interval | inactive, revoked, missing/future issue, expired boundary and invalid interval deny | `PASS` |
| `TC-AUT-003-OBJ-009` | Grant scope exactness and Consent subset | wrong/missing/P1/unknown scope, broader-than-consent scope deny; `MOBILE_EXPORT` rejected by P0 Context | `PASS` |
| `TC-AUT-003-OBJ-010` | Exact Resource and parent Study/package binding | wrong ID/kind/parent/session/patient/source/package deny; resolved SERIES/INSTANCE parent binding passes | `PASS` |
| `TC-AUT-003-OBJ-011` | Package state/deletion/retention | six disallowed states, deleted, expired/malformed retention deny | `PASS` |
| `TC-AUT-003-OBJ-012` | Exact non-null Grant Package and optional Consent package | null/mismatched Grant Package denies; exact Grant-narrowed session Consent and exact package Consent tested | `PASS` |

Test details: `tests/api/object-authorization-policy.test.mjs` — 86 tests. The synthetic `AuthorizationPolicyFacts` fixture stands in for server-resolved rows; it does not prove the reader is trustworthy or that the database returned those facts.

## 3. 실행 명령과 결과

### TEST-001 — API TypeScript build

- 실행 일시: 2026-09-30 16:40 KST (local)
- 명령:

```powershell
npm run build:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript API project compiled successfully.
- 판정: `PASS`

### TEST-001A — API TypeScript no-emit typecheck

- 실행 일시: 2026-09-30 local time
- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: API TypeScript project typechecked successfully without emitting build output.
- 판정: `PASS`

### TEST-002 — Focused object-authorization policy tests

- 실행 일시: 2026-09-30 16:40 KST (local)
- 명령:

```powershell
npx vitest run tests/api/object-authorization-policy.test.mjs
```

- 종료 코드: `0`
- 핵심 결과: 1 test file passed, 86 tests passed.
- 판정: `PASS` for pure policy scope

### TEST-003 — API build and full regression suite

- 실행 일시: 2026-09-30 16:40 KST (local)
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript build succeeded; 11 test files passed, 233 tests passed.
- 판정: `PASS` for API unit/contract regression scope

#### 실행 환경 주의

한 번은 build와 focused Vitest를 병렬 실행했을 때 Vitest가 이전 `dist` 산출물을 읽어 4개 테스트가 실패했다. 빌드 종료 후 focused suite를 순차 재실행해 81/81 통과했고, 최종 code/test 변경 후 86/86 focused 및 233/233 전체 API regression이 순차 실행에서 통과했다. 최종 증거는 순차 실행 결과만 사용한다.

## 4. 실패·거부 경로

| 경로 | 결과 | 판정 |
|---|---|---|
| No Session/Consent/Grant/Resource evidence; malformed/unsupported values | `DENY` | `PASS` |
| Terminal/pre-authorization/expired Session or inactive/withdrawn/expired Consent | `DENY` | `PASS` |
| Grant missing, mismatched, wrong recipient, revoked, expired, over-scoped | `DENY` | `PASS` |
| Wrong Resource/parent Study/Package or unavailable/deleted/expired Package | `DENY` | `PASS` |
| No request-scoped transaction or evidence-reader exception | reader is not called or policy returns `DENY` | `PASS` |
| API failure response, protected data omission, no DB/PACS side effect | no protected API path exists in this Ticket | `NOT RUN` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live Consent/Grant/Session/Resource DB evidence resolution | No PostgreSQL adapter or business-table runtime privilege was approved/implemented | Fake evidence does not establish row provenance, same-snapshot consistency or RLS behavior | Consent/Grant persistence and least-privilege reader Ticket with A/B/C RLS integration |
| `AT-SEC-003` HTTP Session BOLA/IDOR | No protected Exchange/object route exists | Policy unit test does not block a route unless Application invokes it before data access | Add secured route and verify 403/404 plus denial Audit before any protected data response |
| `TC-AUT-004-FC-001~004` safe error/no-data/no-side-effect | AUT-004 is the next Ticket; no API error mapping/business path | A caller could mishandle deny/error unless integration prevents continuation | AUT-004 injection/HTTP tests and downstream side-effect spy |
| Runtime PostgreSQL grants, forced RLS queries, pool reuse | AUT-003 changed no migration/grant and tests use a fake client | No evidence that DB facts are tenant scoped in runtime | Review exact column/table privileges and same-client IAM-002 transaction before reader activation |
| Audit, Viewer, Download, PACS Preflight/STOW, A→B E2E | No resource-return/side-effect implementation exists | Product P0 workflow remains blocked | Implement applicable Consent/Grant/Viewer/PACS gates and verify end-to-end |

This scoped PASS does not change `AT-SEC-003`, `TC-DB-009-AUTH-003`, PAT-002 runtime access or the overall P0 readiness status.

## 6. Static checks and artifact review

| Check | Command/result | 판정 |
|---|---|---|
| Tracked patch whitespace | `git diff --check` — exit `0`; Git printed line-ending normalization notices only | `PASS` |
| AUT-003 source/test/record trailing whitespace | `rg -n "[ \t]+$" services/api/src/authorization tests/api/object-authorization-policy.test.mjs docs/implementation/MEDIQ-AUT-003` — no matches (exit `1`, interpreted as clean) | `PASS` |
| API TypeScript no-emit typecheck | `npm run typecheck:api` — exit `0` | `PASS` |
| PHI/secret boundary | Reviewed fixtures and evidence: synthetic IDs only; no PHI, credentials, tokens or DICOM payload | `PASS` |

## 7. 결론

- 결과: `PASS` for `MEDIQ-AUT-003` pure policy contract only.
- 완료 증거: all 12 policy Acceptance groups; focused 86/86 and API regression 233/233.
- 실제 제품 권한 또는 protected API access로 주장할 수 있는 범위: 없음.
- 미검증: trusted evidence provenance, live PostgreSQL/RLS, HTTP BOLA, deny-before-data/no-side-effect, Audit and PACS E2E.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 사용하거나 증거에 포함하지 않았다.
