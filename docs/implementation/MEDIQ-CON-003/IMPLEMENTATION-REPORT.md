# MEDIQ-CON-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-003` |
| 제목 | Destination-Hospital Consent request API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` (Ticket scope only) |

## 1. 목표

승인된 `POST /exchange-sessions/{sessionId}/consents/request`를 실제 PostgreSQL·Tenant RLS와 연결한다. verified destination Hospital의 Session 생성자만 저장된 Session context에 대해 PENDING Consent를 요청할 수 있고, Consent/actions·Session state·success Audit를 한 transaction에서 처리하며 semantic retry가 중복 row를 만들지 않도록 한다.

## 2. 범위

### 포함

- `CON-003-DEC-001`에 따른 protected controller/application/persistence flow
- 저장된 Session·actor·hospital·state 검증과 optional ImagingPackage exact binding
- PENDING Consent/action 생성, Session `REQUESTED→CONSENT_PENDING`, `CONSENT_REQUESTED` Audit의 atomicity
- Pending identical semantic replay와 changed-body conflict
- migration을 통한 exact column grants (기존 100 → 122 inventory), DB-008 regression 및 실제 HTTP/PostgreSQL/RLS Acceptance
- OpenAPI, Security, Requirement, Acceptance, plan 및 Ticket evidence 동기화

### 제외

- patient approve/reject/withdraw, legal consent/identity proof 또는 patient notification
- Authorization `ALLOW`, TransferGrant, Viewer/Download/PACS/DICOM call
- table-wide grants, Patient-local ID 또는 PHI response/logging

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `PDEC-001`, `CON-003-DEC-001` | recommendation and Acceptance before code | [Policy Decision Log](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-CON-001/002/005`, `AT-FUNC-005` | Session-bound technical Consent request | `TC-CON-003-API-001~009` |
| 보안 | `SEC-CONSENT-005`, `SEC-API-001/002`, `SEC-DB-005/006`, `SEC-AUD-001` | actor/destination, RLS, exact privileges, atomic audit | HTTP/DB/RLS/security tests |
| API·도메인 | `OPENAPI.yaml`, `ConsentArtifact`, `ExchangeSession` | exact request/response, state transition and PENDING-only semantics | Contract + actual API integration |
| Acceptance | `ACCEPTANCE-TESTS.md` | success, denial, validation, retry, rollback, least privilege | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

구현 및 이 Ticket의 필수 Acceptance 완료. 인증된 목적지 병원 사용자(Session 생성자)만 서버가 저장한 Session context에 대해 기술적 `PENDING` Consent 요청을 생성한다. 요청 transaction은 Consent/actions, Session `REQUESTED→CONSENT_PENDING`, `CONSENT_REQUESTED` Audit를 함께 커밋한다. 동일 의미의 동시 재시도는 기존 요청을 재사용하고, 의미가 달라진 재시도는 거부한다. Consent·action과 Session transition을 위한 migration은 필요한 column 단위 권한만 추가한다.

서명된 합성 OIDC/JWKS를 이용한 실제 HTTP→PostgreSQL/RLS 통합, Tenant/object denial, validation/resource denial, semantic replay, 다섯 transaction fault-injection 지점의 rollback, exact grants를 검증했다. 세부 실행명령과 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록했다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `docs/POLICY-DECISION-LOG.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/ACCEPTANCE-TESTS.md` | Recommendation, SEC-CONSENT-005 and nine Acceptance cases recorded before code |
| `docs/OPENAPI.yaml`, `docs/REQUIREMENTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Contract/traceability/status updates |
| `services/api/src/consent/{presentation,application,persistence}`; `services/api/src/exchange/{presentation,application,persistence}`; `services/api/src/app.module.ts` | Protected request endpoint, service/repository wiring, conditional Session transition and Audit integration |
| `services/api/src/database/migrations/0013_consent_request_column_grants.sql` and migration journal | Exact additive least-privilege grants; ledger reaches 14 |
| `tests/database/consent-request-api-runtime.integration.test.mjs`; DB-008 harness and related Acceptance/evidence docs | Signed OIDC HTTP/PostgreSQL/RLS integration, concurrency/replay, denial, rollback and privilege assertions |

## 6. 영향 분석

### Architecture

- Consent request capability added to the existing authenticated modular-monolith API; no PACS/Imaging call path.

### API·Data

- Additive migration `0013_consent_request_column_grants.sql` adds only Consent/action column SELECT+INSERT and Session state/updated timestamp UPDATE; verified runtime inventory is 122 rows (previous 100 plus 22). No table-wide grants or extra mutation privileges.

### Security·Privacy

- Same IAM-002 verified Tenant transaction and forced RLS. PENDING is not approval/Authorization. Audit is transactionally coupled. Synthetic only; no PHI or DICOM response/logging.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- PASS for this Ticket only: API 20 files / 355 tests; API typecheck; migration tests 6/6; migration journal check; DB-008 clean/repeat/reset/reapply and DB-002~007 regression; CON-003 signed-OIDC HTTP/PostgreSQL/RLS acceptance twice; ledger 14, runtime privilege inventory 122, aggregate catalog 17/44/15/29.

## 8. 변경하지 않은 사항

- Approval/rejection/withdrawal, legal effect, Grant, image access, Viewer/Download/PACS and patient identity remain closed.

## 9. 결정 및 예외

- `CON-003-DEC-001` was recorded and selected under the standing recommendation-first instruction before implementation. Exact transaction/actor/retry/privilege behavior is normative.

## 10. 잔여 위험과 후속 작업

- This does not prove patient approval, legal consent or no-consent Grant denial; CON-004~008 and Authorization/Grant consumers remain required.

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-003
Scope: Protected destination-Hospital Consent request; atomic Consent/Session/Audit and replay under exact runtime grants
Changed: Protected Consent request API, Session transition and atomic Audit/persistence, additive least-privilege migration, signed-OIDC PostgreSQL/RLS integration tests, Acceptance and status/evidence documentation
Not changed: Approval/withdrawal, legal consent, Authorization/Grant, Viewer/Download/PACS
Security impact: Same verified Tenant transaction, forced RLS, actor/session/destination binding, exact-column grants, no permission implied by PENDING
Tests executed: `npm run test:api` (20 files/355 tests); `npm run typecheck:api`; `npm run test:db-migrations` (6/6); `npm run db:migrations:check`; `node --check tests/database/consent-request-api-runtime.integration.test.mjs`; `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` (full details in TEST-EVIDENCE.md)
Tests not executed: Patient legal-consent/identity proof and approval/withdrawal; Authorization/Grant enforcement; Viewer/Download/PACS and full P0 A→MediQ→B E2E (out of Ticket scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: No patient approval, legal assurance, Consent enforcement, Grant or protected image operation
Status: PASS (MEDIQ-CON-003 scope only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` (scoped) | Implemented protected PENDING Consent request API; all nine Acceptance groups and documented regression/migration gates pass. Product Consent workflow and P0 E2E remain open. |
