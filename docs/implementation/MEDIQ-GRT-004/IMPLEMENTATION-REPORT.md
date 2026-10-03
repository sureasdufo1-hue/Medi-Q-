# MEDIQ-GRT-004 Implementation Report

**Shared harness result (2026-10-03 18:44 KST):** Diagnostic-only proxy changes passed 15 unit contracts and all three signed HTTP/PostgreSQL GRT-003/004 rounds in DB-008 session 51950, exit 0, reset/reapply/cleanup and independently empty owned inventory. Current scratch regression is scoped PASS. Earlier combined failure was GRT-003 rollback, not a GRT-004 revoke assertion; its cause remains unproven. No revocation code, permission, timeout or assertion change; evidence §8.

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-004` |
| 제목 | Recipient-bound Grant revocation API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped revocation API and current scratch shared-harness regression |

## 1. 목표

**Shared diagnostic checks (2026-10-03):** Fifteen fake-client tests preserve revoke-Audit fault, exact query/timeout forwarding and sanitized categories. Actual three-round scratch rerun **51950** exited 0 with cleanup; persistent DB-002~007 tests were excluded by ScratchOnly. Product semantics/grants remain unchanged. Evidence §8 retains the prior combined failure and scope; no GRT-004 product fix or operation-time imaging/full-P0 acceptance is inferred.

P0 TransferGrant를 exact verified destination recipient `USER`만 철회할 수 있는 API를 구현한다. 만료·Consent 철회·terminal Session이 위험감소 조작을 막지 않게 하고, 상태 변경과 단일 성공 Audit을 하나의 verified Tenant transaction으로 처리한다.

## 2. 범위

### 포함

- `POST /exchange-sessions/{sessionId}/grants/{grantId}/revoke` API 및 응답·입력 검증
- IAM-002 Actor/Tenant/Hospital 및 Session/Grant recipient exact binding
- 같은 Session advisory lock과 Grant row lock, 상태 기반 replay 및 terminal conflict
- `GRANT_REVOKED/SUCCESS` atomic Audit 및 minimized denial Audit
- `mediq_runtime`에 `transfer_grants.status`, `revoked_at` 두 UPDATE 열만 허용하는 0017 migration
- DB-008 exact privilege/RLS gate와 실제 PostgreSQL signed-OIDC API Acceptance

### 제외

- offline/mobile copy recall, active Viewer/Download/PACS 작업 강제 중단/fencing
- Patient claim 및 hospital-admin/operator 대리 철회/RBAC
- operation-time image Authorization, Mandatory Preflight 및 A→B PACS E2E
- table-wide UPDATE 또는 다른 Grant 열의 UPDATE 허용

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-GRT-008` | exact recipient 철회, 상태기반 replay, 만료 무관 위험감소, 단일 atomic Audit | `GrantRevocationService`, revoke API, PostgreSQL integration |
| 보안 | `SEC-GRANT-009`, `SEC-DB-005/006`, `SEC-TEN-005`, `SEC-AUD-001~006` | exact identity binding, forced RLS, 2-column UPDATE, 최소 Audit | IAM-002 transaction, migration 0017, DB-008 probes |
| 위협 | `THR-042` | unauthorized, cross-tenant, race, false remote-recall assurance | denial, concurrency, rollback Acceptance |
| API·도메인 | OpenAPI revoke operation; immutable `TransferGrant.revoke()` | bodyless 상태 전이, stable revokedAt | controller/service/repository |
| Acceptance | `TC-GRT-004-REV-API-001~012`; `TC-GRT-004-REV-DB-001~004`; `AT-FUNC-009` | success/deny/replay/conflict/concurrency/atomicity/least privilege | unit + signed-OIDC PostgreSQL/RLS + DB-008 |

## 4. 구현 결과

수신자 Actor는 인증된 IAM-002 context에서만 도출한다. Session과 Grant가 Tenant/Hospital/Actor/Session 경로로 정확히 일치할 때만 `ACTIVE→REVOKED` 전이한다. 이미 REVOKED인 retry는 원 timestamp를 보존하고 추가 성공 Audit 없이 200 replay를 반환한다. Consent/Session/Grant의 시간 만료 또는 Consent 철회는 아직 `ACTIVE`인 Grant의 철회를 막지 않는다. EXPIRED/CONSUMED는 409다. 철회 상태 변경 및 1건의 success Audit은 하나의 transaction으로 처리한다.

권한은 migration 0017에서 `status`와 `revoked_at` 열 UPDATE만 추가한다. 이는 metadata 철회일 뿐 offline copy 회수나 in-flight Viewer/Download/PACS 중단을 뜻하지 않으며, 해당 접근은 operation-time authorization/fencing 구현 전까지 별도 경계다. 전체 구현 및 검증 상태는 TEST-EVIDENCE와 최종 판정에서 관리한다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/grant/application/grant-revocation.service.ts` | recipient-bound transaction, lock/replay/deny/conflict orchestration |
| `services/api/src/grant/presentation/grant-revocation.controller.ts` | bodyless HTTP endpoint, fixed status mapping, no-store/replay headers |
| `services/api/src/grant/persistence/transfer-grant.repository.ts` and `postgres-transfer-grant.repository.ts` | row lock and exact conditional two-column update |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | one success event and minimized denial event |
| `services/api/src/consent/consent.module.ts` | register the revoke controller/service |
| `services/api/src/database/migrations/0017_grant_revocation_column_update.sql` and `meta/_journal.json` | exact runtime column UPDATE migration / migration history |
| `tests/api/grant-revocation.service.test.mjs` | unit acceptance for success, denial, replay, terminal state, and rollback |
| `tests/database/grant-issue-api-runtime.integration.test.mjs` | signed-OIDC PostgreSQL/RLS issue and revoke integration; concurrency/rollback/denial |
| `tests/database/*runtime.integration.test.mjs` | current 146-column privilege baseline assertions |
| `scripts/test-db-008-full-schema.ps1` | exact grants, forbidden UPDATE probes, GRT-004 run and 18-migration ledger |
| `docs/OPENAPI.yaml`, `docs/OPENAPI.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/ACCEPTANCE-TESTS.md`, UI traceability and model documents | decision/contract/traceability sync |

## 6. 영향 분석

### Architecture

- Existing API module exposes a new P0 revocation operation within the Consent module; no other user role is introduced.

### API·Data

- Additive migration 0017 grants only two UPDATE columns; no table/schema/data model columns are added. Successful responses return metadata only.

### Security·Privacy

- Verified IAM-002 membership is bound to the persisted exact destination recipient. Denial is non-disclosing; no patient identifiers, DICOM, credentials, or scope payload are added to Audit. Existing forced Tenant RLS remains active.
- Consent/Session expiry does not prevent a risk-reducing revoke. Revocation does not itself establish/terminate resource-level Authorization.

## 7. 실행 및 검증 요약

- API typecheck, migration check, PowerShell AST parse, API build 및 24 files/453 tests 회귀가 통과했다.
- DB-008 full gate는 clean apply와 reset/reapply를 모두 통과했다. GRT-004 signed-OIDC PostgreSQL/RLS Acceptance, exact 146 privilege catalog, DB-002~007 regressions 및 scratch cleanup이 양쪽 실행에서 통과했다.
- 상세 명령·환경·결과와 보강 이력: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- no mobile capsule recall or PACS/Viewer interruption claim
- no authorization for VIEW/DOWNLOAD/PACS_IMPORT and no completed A→B transfer claim
- no administrator/delegate or patient-claim revoke flow

## 9. 결정 및 예외

- `GRT-004-DEC-001` — [정책 결정 로그](../../POLICY-DECISION-LOG.md#grt-004-dec-001--recipient-actor-한정-멱등-grant-철회)

## 10. 잔여 위험과 후속 작업

- Already delivered offline data and in-flight actions cannot be recalled. Future protected operations must revalidate Consent/Grant at the relevant operation boundary; race-safe fencing remains separate Acceptance/Ticket work.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-004
Scope: Exact recipient-bound metadata revocation only
Changed: API, exact column UPDATE migration, atomic Audit, Acceptance and documentation
Not changed: Offline recall, in-flight operation termination, operation-time image Authorization, PACS E2E
Security impact: Adds only status/revoked_at UPDATE under forced RLS; exact actor/session binding and fixed denial
Tests executed: See TEST-EVIDENCE.md; final DB-008 run pending
Tests not executed: Offline recall, in-flight operation fencing, protected image Authorization, PACS A→B E2E (out of scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Offline copies and already-running image actions are not remotely recalled or fenced
Status: PASS (scoped Ticket Acceptance only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | GRT-004-DEC-001 이후 구현. API regression 24/453, typecheck/migration check, DB-008 clean/reset signed-OIDC PostgreSQL/RLS GRT-004·DB-002~007 regression과 scratch cleanup 통과 |
