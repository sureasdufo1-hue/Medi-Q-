# MEDIQ-CON-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-002` |
| 제목 | Synthetic Consent persistence and atomic version allocation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — 승인된 internal persistence scope only |

## 1. 목표

권고안 `CON-002-DEC-001`과 Acceptance를 먼저 기준선에 기록한 뒤, 기존 DB-005 Consent schema를 이용해 synthetic P0 technical Consent를 내부에서 안전하게 저장·재구성하고, 동시 생성에도 Session별 version이 중복되지 않음을 검증한다.

## 2. 범위

### 포함

- 내부 `ConsentRepository`/PostgreSQL adapter: `PENDING` Consent create, same-Tenant `findById`, ConsentAction persistence/readback
- 동일 IAM-002 verified Tenant transaction/`PoolClient` 내 Session lock, next-version allocation, Session/Patient/Source/Destination binding 확인
- Consent parent + actions 원자 저장; fixed persistence errors; unsupported/P1 action 거부
- disposable DB-008 scratch에서만 필요한 exact Consent/Action column grants를 임시 부여·회수하고 기존 100-row runtime inventory 복원
- sequential/concurrent version, same/unrelated/no-context RLS, rollback, exact privilege tests
- Acceptance와 security/requirements/implementation status, Ticket evidence 동기화

### 제외

- Schema migration, permanent Consent SELECT/INSERT grant, public route/OpenAPI/AppModule registration
- Consent request/approve/reject/withdraw/expire API 또는 state transition; issued/withdrawn timestamp 생성
- 환자 identity proof, authenticated patient actor, e-signature, 법적 동의 효력 또는 실제 환자 사용
- Authorization `ALLOW`, TransferGrant, Consent audit workflow, Viewer/Download/PACS effect, full P0 Gate

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `PDEC-001`, `CON-002-DEC-001` | 권고안 선기록; scratch-only grants; PENDING-only technical metadata | [정책 결정 로그](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-CON-001/002/005`, `INV-CON-001~010` | Consent context/action/version; technical-not-legal boundary | `TC-CON-002-DB-001~007` |
| 보안 | `SEC-DB-005/006`, `SEC-CONSENT-001~004`, `SEC-TEN-005` | Same verified transaction, RLS, exact temporary grants; no Authorization claim | runtime PostgreSQL/RLS + unit tests |
| Data/Domain | Existing DB-005 `consents`/`consent_actions`; `ConsentArtifact` | No schema change; server-assigned positive version; immutable PENDING snapshot | Repository contract/round-trip |
| Acceptance | `ACCEPTANCE-TESTS.md`; DB-008 scratch strategy | Atomic version allocation, binding, rollback, isolation and privilege restoration | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

구현·Acceptance·회귀 검증이 완료됐다. 기존 DB-005 schema와 동일 transaction/RLS 경계를 사용하고, Session별 transaction advisory lock과 기존 unique constraint로 버전을 보호했다. 새 row는 `PENDING`으로만 생성되며 parent/action 저장은 원자적이다. 임시 privilege는 DB-008 disposable scratch에 한정되며 실행 후 기존 100-row inventory가 복원됐다. 이 결과는 법적 Consent나 영상 접근 권한을 뜻하지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/consent/persistence/consent.repository.ts` | 내부 repository 계약 및 transaction-bound PENDING create/find 인터페이스 |
| `services/api/src/consent/persistence/postgres-consent.repository.ts` | Session binding, transaction advisory lock, server-assigned version, parent/action atomic insert/readback 및 fixed failure behavior |
| `tests/api/postgres-consent-repository.test.mjs` | Repository/domain boundary 10 focused unit tests |
| `tests/database/consent-persistence-runtime.integration.test.mjs` | Synthetic PostgreSQL persistence, concurrency, rollback, Tenant RLS 및 privilege integration tests |
| `services/api/Dockerfile` | DB-008 integration test asset COPY |
| `scripts/test-db-008-full-schema.ps1` | Temporary exact column grants, integration execution, revoke/final privilege inventory assertion |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/DOMAIN-MODEL.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/REQUIREMENTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/P0-DEVELOPER-BASELINE.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `README.md`, `docs/implementation/README.md` | Decision, scope, traceability, actual Acceptance and current status synchronized |

## 6. 영향 분석

### Architecture

- Internal persistence adapter only; no Nest module/provider, route or external surface is opened.

### API·Data

- Existing approved schema is reused; no migration or OpenAPI change is planned. Runtime production privilege baseline remains unchanged.

### Security·Privacy

- Synthetic-only records. Database RLS is not business Authorization. New records remain PENDING and cannot grant resource access. Temporary grants exist only in disposable scratch DB and must be removed.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- `npm run test:api`: PASS, 20 files / 355 tests.
- `npm run build:api`: PASS.
- `npm run typecheck:api`: PASS.
- `./scripts/test-db-008-full-schema.ps1 -EnvFile .env`: PASS on final run; DB-008 scratch reset/reapply, DB-002~007 regressions, CON-002 persistence/RLS/rollback/concurrency, privilege cleanup and ephemeral cleanup passed.
- 최초 harness assertion 수정 및 상세 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록했다.

## 8. 변경하지 않은 사항

- No Consent lifecycle/API/legal consent, patient identity proof, Authorization/Grant, permanent DB grants, Audit workflow, Viewer/Download/PACS operation or E2E claim.

## 9. 결정 및 예외

- `CON-002-DEC-001` is recorded before code under the user's standing recommendation-first instruction. Session version is serialized by transaction advisory lock and backed by the existing UNIQUE constraint.

## 10. 잔여 위험과 후속 작업

- Until `CON-003~008`, Consent request/approval/withdrawal, actor/patient semantics, legal effect and audit remain unavailable. Until AUT/GRT/PACS gates pass, persisted Consent is not access authority.

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-002
Scope: Synthetic PENDING Consent internal persistence and atomic Session-scoped version allocation
Changed: Internal repository/PostgreSQL adapter and unit/integration tests; decision, Acceptance and linked implementation status synchronized
Not changed: Migration, public API, permanent Consent grants, approval/withdrawal, legal effect, Authorization/Grant/Audit/PACS
Security impact: Same verified Tenant transaction and RLS; temporary exact grants only in disposable scratch and restored; no access permission inferred
Tests executed: API 20 files/355 tests PASS; API typecheck PASS; DB-008 full scratch and DB-002~007 regression script PASS; 12 concurrent creates, rollback, RLS and 120→100 privilege restoration PASS
Tests not executed: Live OIDC/HTTP patient Consent, legal/identity assurance and product image access are outside this Ticket
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-CON-002/
Remaining risks: Consent lifecycle/API, legal basis, business Authorization, Grant, Audit and protected operations remain unimplemented
Status: PASS (scoped Ticket Acceptance only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `IN_PROGRESS` | Recommendation and seven DB Acceptance cases recorded before implementation |
| 2026-10-01 | `PASS` (scoped) | Implementation and scratch PostgreSQL Acceptance completed; evidence and linked status documents synchronized |
