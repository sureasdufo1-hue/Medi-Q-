# MEDIQ-EXC-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-EXC-003` |
| 제목 | Destination-Hospital USER-bound idempotent ExchangeSession creation API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` |

## 1. 목표

승인 권고안 `EXC-003-DEC-001`에 따라 verified Hospital B `USER`만 목적지 병원용 Exchange 요청을 만들 수 있는 최소 API를 구현한다. 재시도에는 동일 Session 결과를 반환하고, Session과 성공 Audit은 같은 transaction에서 저장한다. 이 API는 영상 접근 권한을 만들지 않는다.

## 2. 범위

### 포함

- `POST /api/v1/exchange-sessions`와 Bearer Authentication Guard 연결
- IAM-002에서 검증한 Actor/Tenant/Hospital transaction context 사용
- 활성 합성 `MQ-TEST-*` PatientReference, UUID, source/destination, purpose 및 필수 UUID `Idempotency-Key` 검증
- verified `USER`의 Hospital이 destination과 정확히 일치해야 하는 server-side boundary
- `(requester_actor_id, idempotency_key)` 기반 idempotent persistence 및 payload 불일치의 고정 conflict
- `SESSION_CREATED/SUCCESS` Audit을 Session insert와 원자적으로 저장
- migration 0012: required `idempotency_key`, unique constraint, EXC-003 최소 column grants
- Acceptance·Threat Model·보안/데이터/API 문서와 구현 증거 동기화

### 제외

- Live OIDC issuer/provider 및 실제 Authorization Code/PKCE 로그인
- 단일 live HTTP → OIDC → PostgreSQL route end-to-end와 동시 HTTP 요청 경쟁시험
- Exchange 조회 API, GET BOLA, Consent 승인/철회, Authorization/TransferGrant 발급
- Study 선택, Viewer/Download, DICOMweb retrieval, PACS preflight/STOW, Integrity/Provenance 및 A→B 전송
- workforce role/capability 모델과 global Audit completeness

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `EXC-003-DEC-001`, `PDEC-001` | 권고안 선기록, verified 목적지 USER, retry semantics, exact runtime grants | policy log; API/DB Acceptance |
| 요구사항 | `REQ-EXC-001/002/007` | request metadata, verified core context, retry safety | service/repository tests |
| 보안 | `SEC-API-001/003/005`, `SEC-AUTHZ-010/011`, `SEC-DB-005/006`, `SEC-AUD-001` | auth, validation, idempotency, verified tenant, least privilege, atomic success Audit | controller, runtime DB integration |
| API·Data | `OPENAPI.yaml`, `DATA-MODEL.md`, `ERD.md` | header contract, `idempotency_key`, actor-scoped unique key, safe response | OpenAPI/schema/migration checks |
| Acceptance | `TC-EXC-003-API-001~012`, `TC-EXC-003-DB-001~006`, `AT-FUNC-001` | allowed and denied creation, retries, privilege/RLS/Audit boundaries | exact statuses in [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |
| Threat | `THR-001/002/027/040` | unauthenticated/BOLA/input/replay-abuse boundary | Threat Model amendment and limited tests |

## 4. 구현 결과

1. Bearer-authenticated request enters IAM-002; `X-Tenant-ID` is only a membership candidate, not authority.
2. Service verifies active Actor membership, `USER` type and exact destination Hospital before reading the PatientReference.
3. Only an active synthetic PatientReference and supported request fields are accepted. The Session is created in `REQUESTED` state.
4. Repository inserts with caller UUID idempotency key. Exact same Actor/key/request returns the original row; same Actor/key with changed request returns conflict.
5. On first creation only, one `SESSION_CREATED/SUCCESS` Audit row is inserted in the same transaction. Audit failure rolls back the Session.
6. Controller returns a minimal no-store response and fixed safe errors. It does not return requester or idempotency data and does not set a GET `Location` URL.

The exact persistent runtime inventory is 100 column-privilege rows. `exchange_sessions` has only the approved 12-column `SELECT` and 12-column `INSERT`; `audit_events` has only its approved 12-column `INSERT`. No table-wide, `PUBLIC`, default, DDL, `UPDATE`, `DELETE` or `TRUNCATE` grant was added. Existing forced Tenant RLS is retained.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/exchange/application/exchange-session-creation.service.ts` | request validation, destination USER check, idempotent orchestration, fail-closed errors |
| `services/api/src/exchange/presentation/exchange-session.controller.ts` | protected POST, minimal response, safe status/error mapping |
| `services/api/src/exchange/persistence/postgres-exchange-session.repository.ts` | idempotent insert/replay/conflict and row reconstruction |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | parameterized success Audit insert |
| `services/api/src/exchange/exchange.module.ts`, `services/api/src/app.module.ts` | module/controller/provider registration |
| `services/api/src/database/schema/exchange.ts` | idempotency key and unique Actor/key schema |
| `services/api/src/database/migrations/0012_graceful_domino.sql`, `meta/*`, `meta/_journal.json` | additive key/constraint and exact least-privilege grants |
| `services/api/Dockerfile` | include EXC-003 DB integration test in test image |
| `tests/api/exchange-session-creation.test.mjs`, `tests/api/exchange-session.controller.test.mjs` | application and HTTP-controller unit Acceptance |
| `tests/api/exchange-session-repository.test.mjs` | repository key/replay/conflict contract |
| `tests/database/exchange-session-creation-runtime.integration.test.mjs`, `exchange-session-repository-runtime.integration.test.mjs` | runtime role, RLS, retry, denial and rollback integration |
| `scripts/test-db-008-full-schema.ps1`, `scripts/test-db-004-exchange.ps1`, `scripts/test-db-005-consent-grant.ps1`, `scripts/test-db-006-imaging.ps1`, `scripts/test-db-007-evidence.ps1` | current schema/grant expectations and synthetic fixtures |
| `docs/` policy, requirements, security, OpenAPI, Acceptance, plan, threat and Ticket evidence files | approved decision, traceability and current state |

## 6. 영향 분석

### Architecture

Adds one protected application route to the modular monolith. The test container explicitly includes the new PostgreSQL integration test. Existing health-only runtime container was not redeployed as part of this Ticket.

### API·Data

`exchange_sessions.idempotency_key UUID NOT NULL` and unique `(requester_actor_id, idempotency_key)` were added via additive migration. Existing rows receive generated unique backfill keys. Local development DB now has 13 migrations, 17 tables, and aggregate `PK/FK/UNIQUE/CHECK=17/44/15/29`.

### Security·Privacy

The route records synthetic request metadata only. It does not evaluate patient consent or image/action Grant and is not permission to view, download or transfer DICOM. Session and successful Audit are transactionally coupled. No PHI, DICOM payload, credentials or secrets were used in tests or committed evidence. A successful Audit event is implemented; denial and global Audit coverage remain separate.

## 7. 실행 및 검증 요약

- API regression: 19 files / 345 tests — PASS
- API TypeScript typecheck — PASS
- Drizzle migration consistency — PASS
- Migration runner tests — 6/6 PASS
- Full DB-008 scratch reset/reapply + EXC-002/003 integration + DB-002~007 local regression — PASS
- Exact local runtime privileges: 100; migration ledger: 13; synthetic transaction fixtures left no rows
- Details and limitations: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- No Consent/Authorization/Grant was issued by Session creation.
- No GET route, Viewer, Download, WADO-RS, STOW-RS or PACS call was added.
- No live identity provider or publicly exposed runtime endpoint was configured.
- No production DB, real patient information or operational DICOM was used.

## 9. 결정 및 예외

`EXC-003-DEC-001` is marked approved under the user’s standing instruction to record recommendations first and proceed according to them. Separate `EXC-003` USER fixtures preserve the existing AUT-005/EXC-002 SERVICE fixtures. The exact grants and schema decision are recorded in `docs/POLICY-DECISION-LOG.md`.

## 10. 잔여 위험과 후속 작업

- Live OIDC, real API process connected to PostgreSQL and trusted ingress/rate-limit Acceptance remain open.
- A true concurrent same-key HTTP race was not invoked, even though the database unique key and sequential replay are verified.
- GET Session BOLA, business Authorization, Consent/Grant lifecycle and source Hospital active/capability checks remain separate Gates.
- Source Hospital FK existence alone is not authorization; retrieval and PACS preflight must recheck verified source/destination, Consent, Grant, scope, expiry and capability.
- `GATE-IMP-04`, integrity/provenance, Viewer/Download, PACS A→B and full P0 E2E are not complete.

## 11. 최종 판정

```text
Ticket: MEDIQ-EXC-003
Scope: Synthetic destination-Hospital USER-bound idempotent Session create API
Changed: API/service/repositories, schema migration/grants, tests, Acceptance and documentation
Not changed: Live OIDC provider, concurrent HTTP test, Consent/Grant, image access, PACS transfer
Security impact: Exact least-privilege grants; verified destination membership; atomic success Audit; no image authority
Tests executed: API 19 files/345; typecheck; migration checks; DB migrations 6/6; DB-008 full gate and DB-002~007 regression
Tests not executed: Live OIDC/HTTP→DB E2E; true simultaneous same-key HTTP calls; full P0 product E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: See §10; global DB-009 and GATE-IMP-04 remain PARTIAL/NOT EXECUTED
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | 권고안 기록·구현, scope Acceptance/DB integration 통과; full live HTTP/OIDC gate remains open |
