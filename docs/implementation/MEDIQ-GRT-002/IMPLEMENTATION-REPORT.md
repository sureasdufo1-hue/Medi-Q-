# MEDIQ-GRT-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-002` |
| 제목 | TransferGrant persistence and scratch database acceptance |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped internal persistence only |

## 1. 목표

승인된 immutable P0 `TransferGrant` metadata의 내부 PostgreSQL 저장/복원을 구현하고 실제 runtime role, forced Tenant RLS, 원자적 실패와 privilege baseline을 증거화한다. Grant persistence가 Authorization이나 product Grant issuance가 아니라는 경계를 유지한다.

## 2. 범위

### 포함

- `GRT-002-DEC-001`과 8 Acceptance cases를 코드 변경 전에 기록
- IAM-002가 검증한 caller-owned `PoolClient` transaction용 internal repository port/adapter
- `ACTIVE` Grant와 정확한 P0 scope rows를 하나의 savepoint로 원자적 insert
- RLS-visible Grant와 scope를 parameterized query로 읽어 `TransferGrant.reconstitute` 수행
- malformed ID, non-domain/terminal insert, duplicate Grant, invalid scope, PostgreSQL error를 fail closed 및 safe fixed error로 처리
- disposable DB-008 scratch PostgreSQL에서 scratch-only exact privilege로 runtime integration 시험하고 126 baseline 복원

### 제외

- 신규 schema/migration 또는 permanent `mediq_runtime` grants
- Grant issue/revoke Application service, API/controller/OpenAPI/AppModule wiring
- Authorization, Consent 재검증·발급 직렬화, recipient/Tenant/Actor/Package cross-binding
- Audit, HTTP BOLA, Viewer/Download/PACS/QR, STOW, product E2E

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `GRT-002-DEC-001`; `PDEC-001` | 기존 schema와 permanent least-privilege baseline을 유지하고 임시 정확 권한으로만 scratch integration | `scripts/test-db-008-full-schema.ps1`; privilege inventory |
| 요구사항 | `REQ-GRT-001/002` | Domain metadata와 P0 scopes의 내부 persistence/reconstitution; access permission은 아님 | `TC-GRT-002-PER-001~008` |
| 보안 | `SEC-GRANT-001/006`; `SEC-DB-005/006`; `INV-GRT-001~009` | P0 scope-only shape, metadata-only payload, verified Tenant transaction, forced RLS, safe errors | PostgreSQL tests + adapter unit tests |
| API·도메인 | `GRT-001-DEC-001`; IAM-002 transaction client; existing `transfer_grants`/`transfer_grant_scopes` tables | ACTIVE-only insert, scope row atomicity, persisted metadata reconstitution | `services/api/src/grant/persistence/*` |
| Acceptance | `ACCEPTANCE-TESTS.md` | Eight scoped cases; live scratch PostgreSQL and adapter-level invalid-shape checks | `tests/api/postgres-transfer-grant-repository.test.mjs`; `tests/database/transfer-grant-persistence-runtime.integration.test.mjs` |

## 4. 구현 결과

Added an internal `TransferGrantRepository` port and `PostgresTransferGrantRepository`. The adapter accepts only an actual ACTIVE `TransferGrant`, parameterizes all values, writes Grant metadata and each scope row on the caller's existing transaction client, and uses a savepoint so any child-scope failure rolls back the parent and earlier scopes. It exposes only `insert` and `findById`; reads include `created_at` and the P0 scopes required to faithfully reconstitute the domain entity. An unsupported persisted scope becomes a fixed persistence error.

No module or route is wired. The product database role still has exactly 126 column privilege rows and cannot insert Grant metadata. DB-008 temporarily adds only 16 column grants in its disposable scratch database (12 Grant INSERT, 3 Grant Scope INSERT, 1 Grant `created_at` SELECT), then revokes them and checks exact restoration. Both clean migration and reset/reapply paths ran the real PostgreSQL/RLS integration suite and passed 7/7 TAP cases.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/grant/persistence/transfer-grant.repository.ts` | Internal repository port and authorization boundary contract |
| `services/api/src/grant/persistence/postgres-transfer-grant.repository.ts` | ACTIVE-only atomic insert, P0 scope persistence, parameterized read/reconstitution, fixed errors |
| `tests/api/postgres-transfer-grant-repository.test.mjs` | 7 adapter contract/negative tests |
| `tests/database/transfer-grant-persistence-runtime.integration.test.mjs` | Real PostgreSQL role/Tenant RLS, round-trip, savepoint rollback, no-context denial |
| `services/api/Dockerfile` | Include the new integration test in integration-test image |
| `scripts/test-db-008-full-schema.ps1` | Scratch-only exact temporary grants, test invocation, guaranteed revoke and 126 baseline check |
| `docs/POLICY-DECISION-LOG.md` | `GRT-002-DEC-001` recommendation and execution result |
| `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/DOMAIN-MODEL.md` | Acceptance result and explicit persistence/security boundary |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Checkpoint, next Ticket, traceability and index |
| `docs/implementation/MEDIQ-GRT-002/*` | This implementation report and test evidence |

## 6. 영향 분석

### Architecture

Adds only an internal persistence port/adapter. `AppModule`, feature modules, HTTP controllers, routes, and OpenAPI are unchanged.

### API·Data

No API, schema, migration, data model shape, or permanent database privilege changes. Parent and child rows are inserted atomically under a caller-owned IAM-002 transaction. The shared `mediq_runtime` role cannot use this insert path outside the temporary scratch test grants.

### Security·Privacy

Forced RLS controls row visibility, not business Authorization. Tenant visibility is not treated as permission. Repository errors omit SQL/driver detail; values are bind parameters. No PHI, actual patient identifiers, DICOM payload, secrets, credentials, or production data were used. This code does not validate Consent freshness, Authorization ALLOW, recipient relationships, or operation scopes.

## 7. 실행 및 검증 요약

- `npm run typecheck:api`: PASS
- `npm run test:api`: 22 files / 399 tests PASS
- `./scripts/test-db-008-full-schema.ps1`: exit 0; two actual GRT-002 PostgreSQL/RLS runs, each TAP 7/7; each temporary privilege inventory 142→126; DB-002~007 and reset/reapply regressions PASS; owned scratch cleanup PASS
- `git diff --check`: exit 0; repository-wide line-ending conversion warnings only, no whitespace error. New GRT source/test/record files also passed the trailing-whitespace scan.
- 상세 명령·환경·시험 증거: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- No permanent Grant INSERT permission, migration, schema, or database table was added.
- No issue/revoke service, API route, module registration, Authorization, Consent workflow, or Audit event was added.
- No product Viewer/Download/PACS/QR effect or whole P0 E2E was tested or claimed.
- Repository persistence and RLS visibility do not prove Authorization or authorize data access.

## 9. 결정 및 예외

`GRT-002-DEC-001` was recorded before implementation under standing `PDEC-001`. It selects exact scratch-only temporary permissions and preserves the persistent 126-column privilege baseline. No exception to approved security invariants was made.

## 10. 잔여 위험과 후속 작업

- `findById` reads `transfer_grants.created_at`; this is granted only in scratch integration. Production runtime access remains unavailable.
- An authorization-gated Grant issuance API needs a separate decision and Acceptance covering current Consent, DENY paths, exact recipient/resource/action/package bindings, concurrency/idempotency, Audit atomicity, and any required least-privilege migration.
- GRT-004 revocation, GRT-005 scope enforcement, GRT-006 recipient/Tenant binding, GRT-007 operation expiry, HTTP BOLA and A→B E2E remain open.
- Overall P0 readiness remains `BLOCKED`.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-002
Scope: Internal TransferGrant persistence/reconstitution and disposable DB-008 Acceptance
Changed: Repository port/adapter, API/runtime tests, scratch test harness, linked docs/evidence
Not changed: Permanent privileges, migration/schema, issue/revoke API, Authorization, Viewer/PACS
Security impact: ACTIVE/P0-only persistence; same verified transaction; atomic savepoint; forced RLS; scratch-only exact privileges
Tests executed: API typecheck; API 22 files/399 tests; DB-008 clean + reset/reapply GRT tests 7/7 each; DB-002~007 regression
Tests not executed: Product issue/deny API, HTTP BOLA, actual Viewer/Download/PACS, Grant operation enforcement, full A→B E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Runtime Grant insert remains unavailable; no Authorization/issue flow; overall P0 remains blocked
Status: PASS (scoped internal persistence only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | 권고안·8 Acceptance 선기록, repository 구현, API 399 tests 및 DB-008 clean/reset PostgreSQL/RLS evidence |
