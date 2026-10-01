# MEDIQ-CON-007 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-007` |
| 제목 | Consent Audit event context and minimization Acceptance |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — scoped Consent Audit context/minimization Acceptance |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 / PowerShell local host |
| Runtime·Toolchain | Node.js v24.18.0; npm 11.16.0; Docker Compose; PostgreSQL 18.6 test image |
| 대상 환경 | API unit/contract regression; disposable full-schema PostgreSQL; existing local development DB regression |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-007-AUD-001` | Request Audit actor/tenant/session/Consent binding, correlation, timestamps and replay | HTTP + PostgreSQL/RLS | Exact values; one `CONSENT_REQUESTED/SUCCESS` event | Verified against non-replayed response, Session requester, Consent ID and response correlation; one row | `PASS` |
| `TC-CON-007-AUD-002` | Approval Audit binding, correlation, timestamps and replay | HTTP + PostgreSQL/RLS | Exact patient Actor/Tenant/Session/Consent; one `CONSENT_APPROVED/SUCCESS` event | Exact row and response correlation verified; existing replay kept one row | `PASS` |
| `TC-CON-007-AUD-003` | Withdrawal Audit binding, correlation, timestamps and replay | HTTP + PostgreSQL/RLS | Exact patient Actor/Tenant/Session/Consent; one `CONSENT_WITHDRAWN/SUCCESS` event | Exact row and response correlation verified; existing replay kept one row | `PASS` |
| `TC-CON-007-AUD-004` | Denial, concurrent replay and injected failure paths | HTTP + PostgreSQL/RLS | No false success; replay exact-once; failed state/event fully rolls back | Existing CON-003~005 replay/concurrency and injected rollback matrices passed | `PASS` |
| `TC-CON-007-AUD-005` | Audit data minimization and runtime least privilege | PostgreSQL schema/catalog | Exact 12 reference/metadata fields, no payload field, no runtime SELECT | Exact schema inventory; global catalog verifies exactly 12 Audit INSERT columns, no runtime Audit SELECT | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Integration harness syntax and API typecheck

- 실행 일시: 2026-10-01
- 목적: Verify edited integration harness syntax and API type safety.
- 명령:

```powershell
node --check tests/database/consent-request-api-runtime.integration.test.mjs
node --check tests/database/consent-approval-api-runtime.integration.test.mjs
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: 두 Node syntax checks와 TypeScript API typecheck 모두 통과.
- 판정: `PASS`

### TEST-002 — API regression

- 실행 일시: 2026-10-01
- 목적: Ensure API/domain unit and contract regressions remain green.
- 명령: `npm run test:api`
- 종료 코드: `0`
- 핵심 결과: API build PASS; 20 test files / 373 tests PASS.
- 판정: `PASS`

### TEST-003 — Full schema, Consent integration and local DB regression

- 실행 일시: 2026-10-01
- 목적: Run signed synthetic Consent request/approval/withdrawal HTTP-to-PostgreSQL/RLS Acceptance, exact privilege/schema checks, disposable reset/reapply and DB-002~007 regressions.
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: DB-008 disposable schema clean/reset/reapply and owned-resource cleanup PASS; DB-009 runtime inventory PASS at 126 exact column privileges with 12 Audit INSERT columns only; CON-003 request, CON-004 approval, CON-005 withdrawal signed OIDC/JWKS HTTP/PostgreSQL/RLS integrations PASS, including new exact Audit context assertions, replay, concurrency and rollback; DB-002~007 persistent development DB regressions PASS; final ledger=16, product tables=17. Existing `mediq` development volume was not reset; transaction-scoped synthetic regression fixtures rolled back. No production DB used.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-003-API-002/007` | Request denial, Audit insert/commit fault | Denial has no Consent success event; injected failures rollback Consent/Session/Audit | `PASS` |
| `TC-CON-004-API-002~008` | Approval claim/actor/state denial, replay/concurrency, transaction faults | No approval success event on denial; one on commit; entire transition rolls back on fault | `PASS` |
| `TC-CON-005-API-002~010` | Withdrawal denial, replay/concurrency, transaction faults | No withdrawal success event on denial; one on commit; entire transition rolls back on fault | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Production/global Audit event completeness | Outside CON-007; synthetic local scope only | Other event families/denial-event pipeline remain unproven | Separate `MEDIQ-AUD-*` / `STC-AUD-001` Ticket |
| Production OIDC, legal consent and real patient identity | Outside synthetic P0 acceptance | No identity/legal effect claim | Separate legal/production gate |
| Grant enforcement, Viewer/Download and PACS A→B E2E | No behavior changed by this ticket | Product exchange remains incomplete | Planned Grant/PACS/E2E Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Recommendation and Acceptance | `POLICY-DECISION-LOG.md` `CON-007-DEC-001`; `ACCEPTANCE-TESTS.md` `TC-CON-007-AUD-001~005` | No PHI/Secret |
| Synthetic integration assertions | `tests/database/consent-request-api-runtime.integration.test.mjs`; `tests/database/consent-approval-api-runtime.integration.test.mjs` | Test tokens/keys/fixture values not copied into report; no PHI |
| Executed output summary | Commands/results in this file; Docker script returned exit 0 | No raw tokens, credentials, patient data or DICOM payload |

## 7. 결론

- 결과: `PASS` — only the five scoped CON-007 Acceptance cases.
- PASS를 주장할 수 있는 범위: Existing technical Consent success-event row context, replay exact-once, transaction rollback and current metadata-only schema/runtime INSERT boundary.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
