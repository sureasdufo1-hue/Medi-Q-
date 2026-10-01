# MEDIQ-IAM-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-IAM-002` |
| 제목 | Verified Actor and Tenant transaction context |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — verified Actor/Tenant/Hospital context, minimum resolver grants and pool/RLS boundary only |

## 1. 목표

`MEDIQ-IAM-001`이 검증한 단일 설정 OIDC issuer의 `issuer + subject`를 Registry의 활성 Actor membership과 연결한다. 미신뢰 Tenant 선택값은 membership 조회를 좁히는 selector로만 사용하고, 일치가 확인된 뒤에만 동일한 PostgreSQL transaction/client를 protected application work에 전달한다.

## 2. 범위

### 포함

- `IAM-002-DEC-001` 권고안 및 Acceptance 선작성, 이에 따른 구현
- exact configured issuer/subject, 정규 UUID Tenant selector 및 ACTIVE Actor/Tenant/optional Hospital 검사
- registry에서만 만들어지는 immutable Actor/Tenant context
- API/Health와 identity transaction wrapper가 공유하는 단일 runtime PostgreSQL pool service
- connection checkout 시 stale GUC 초기화, transaction-local RLS context, same-client lookup/callback, commit/rollback 및 cleanup 실패 시 connection 폐기
- `mediq_runtime`에 11개 명시 컬럼의 `SELECT`만 부여하는 migration 0009
- resolver unit/repository test, runtime-only DB privilege/RLS/pool integration, 임시 합성 Actor seed/cleanup 자동화
- Acceptance, Architecture, Security, Threat Model, implementation plan, schedule, script guide, implementation report/evidence 동기화

### 제외

- 제품 업무 API route, HTTP safe-error filter 또는 login/PKCE/provider 배포
- Business/object/action Authorization, PatientMapping/Exchange/Consent/Grant, Audit, Viewer, Download, PACS/DICOM side effect
- Actor/Tenant/Hospital write, wider runtime grants, multiple OIDC issuer schema
- Production/real-patient use 또는 custom PostgreSQL GUC를 arbitrary SQL로 바꾸는 공격에 대한 완전한 방어 주장

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 권고 | `IAM-002-DEC-001`, `PDEC-001` | untrusted Tenant selector, single issuer, exact active membership, column grants, same-client transaction | Policy Decision Log; 권고 후 구현 |
| 보안 | `SEC-AUTHZ-010~011`, `SEC-DB-005~006`, `SEC-TEN-005` | server-derived context, fail-closed, RLS != business Authorization | resolver/service + forced RLS integration |
| Database 선행 Ticket | `DB-009-DEC-001`; `MEDIQ-DB-009` | least privilege, Runtime/Migrator separation, Tenant RLS | migration 0009 and runtime catalog tests |
| Acceptance | `TC-IAM-002-CTX-001~004`, `DB-001`, `TX-001~003` | invalid/mismatched membership, exact context, grant inventory, transaction/pool cleanup | API unit + runtime PostgreSQL tests |
| 관련 업무 경계 | `TC-DB-009-AUTH-001~004`, `TC-PAT-002-*` | safe API errors and business authorization remain separate | not implemented or claimed |

## 4. 구현 결과

`ActorTenantContextService.run(principal, tenantCandidate, work)` rejects a missing/mismatched principal or malformed Tenant selector before acquiring a connection. It clears the checked-out session setting, begins a transaction, binds the candidate with transaction-local `set_config`, and resolves exact `external_subject` membership while requiring active Actor, Tenant and optional Hospital. The repository query is parameterized and cannot accept a client Actor/Hospital ID. Only after the lookup succeeds does the service freeze a Registry-derived context and invoke `work` with that same client.

Normal success commits and resets before pool release. Denials/callback errors roll back. Database setup, resolver, commit, rollback or reset failures produce generic context errors where appropriate and discard an unsafe client. Runtime pool and Health use the shared database provider; DB connection and query timeout remain 1.5 seconds.

Migration `0009_identity_context_column_grants` removes table/column privileges for `mediq_runtime` on `actors`, `tenants`, and `hospitals`, then grants only 6 Actor, 2 Tenant, and 3 Hospital columns for `SELECT`. Existing `ENABLE/FORCE RLS` policies are unchanged. The local synthetic integration confirmed the exact 11-column inventory, active A membership, no B/C membership, forced RLS, and no inherited setting/rows for the next pool borrower.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/runtime-database.service.ts` | Shared bounded PostgreSQL pool and lifecycle |
| `services/api/src/database/runtime-database.module.ts` | Shared runtime config/pool DI provider |
| `services/api/src/identity/identity-context.types.ts` | Trusted context, callback and generic errors |
| `services/api/src/identity/persistence/actor-registry.repository.ts` | Parameterized exact ACTIVE membership query |
| `services/api/src/identity/application/actor-tenant-context.service.ts` | Tenant resolution, same-client transaction and fail-closed cleanup |
| `services/api/src/identity/identity-context.module.ts`, `services/api/src/app.module.ts` | Register internal context service; no route |
| `services/api/src/health/health.module.ts`, `health.service.ts` | Reuse shared runtime pool instead of owning a separate pool |
| `services/api/src/database/migrations/0009_identity_context_column_grants.sql`, `meta/_journal.json` | Narrow Actor/Tenant/Hospital SELECT grants |
| `tests/api/actor-tenant-context.test.mjs`, `actor-registry.repository.test.mjs` | Identity, transaction ordering and failure-path unit/contract tests |
| `tests/database/actor-tenant-context-runtime.integration.test.mjs` | Runtime-only DB/RLS/pool acceptance |
| `services/api/Dockerfile`, `infra/docker-compose.yml` | Include integration test, keep API on explicit `runtime` build target, pass only ephemeral synthetic fixture identifiers |
| `scripts/test-iam-002.ps1`, `scripts/validate-compose-baseline.ps1`, `scripts/README.md` | Apply migration, seed unique synthetic Actor, run runtime test, validate image targets/env boundary, scoped cleanup and usage guide |
| `docs/ACCEPTANCE-TESTS.md`, `SECURITY-REQUIREMENTS.md`, `SYSTEM-ARCHITECTURE.md`, `DATA-MODEL.md`, `THREAT-MODEL.md`, `IMPLEMENTATION-PLAN.md`, `P0-EXECUTION-SCHEDULE.md`, `POLICY-DECISION-LOG.md`, `docs/implementation/README.md` | Recommendation, acceptance results, current scope/status and traceability |

## 6. 영향 분석

### Architecture

- Health and internal identity resolution share one Nest-managed runtime pool; it is closed on module shutdown.
- Context resolution is a non-route internal prerequisite. No public/business operation was registered.

### API·Data

- No OpenAPI operation or table shape changed. Additive migration 0009 changes only runtime privileges; test Actor is ephemeral and removed.
- No PAT-002 mapping, Exchange, Consent, Grant or PACS table grant was added.

### Security·Privacy

- Valid OIDC authentication is not business authorization. Resolver requires one configured issuer; `actor_type` is context metadata, not a role/capability.
- Tenant candidate is not trusted authority. Forced RLS remains defense-in-depth. Same-role arbitrary SQL can still change a custom GUC; synthetic P0 residual is explicitly documented.
- No PHI, real identity, production credential, DICOM payload or migration secret was placed in application/test runtime evidence.

## 7. 실행 및 검증 요약

- Exact commands, environment and test output: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- API unit/contract suite: 8 files, 100 tests PASS (including failure/cleanup cases).
- Migration runner/journal check: 6 tests PASS; Drizzle migration consistency PASS.
- Local PostgreSQL migration 0009 applied; runtime integration: IAM-002 + PAT-001 2/2 PASS; synthetic fixture cleanup completed.
- Overall product P0 remains incomplete; this Ticket's PASS is narrowly scoped.

## 8. 변경하지 않은 사항

- No business route, HTTP error map, business authorization, Tenant-scoped CRUD, Consent/Grant or PACS capability was implemented.
- No issuer provider/login flow, production identity namespace, RLS cryptographic binding or ingress/rate limiter was added.

## 9. 결정 및 예외

- Recommendation and tests were written before code changes. `IAM-002-DEC-001` is selected under the user's standing recommendation-first policy.
- One configured issuer is required because Actor schema has no issuer namespace. Multiple issuers require separate schema/Acceptance decision.
- No exception to the approved security or scope baseline.

## 10. 잔여 위험과 후속 작업

- A custom PostgreSQL GUC is mutable by arbitrary SQL under the same runtime role. Keep P0 data synthetic; production requires a stronger signed/non-forgeable context review.
- `MEDIQ-DB-009` remains PARTIAL until the fixed safe HTTP error boundary and business Authorization/Preflight are implemented and tested.
- `MEDIQ-PAT-002` mapping runtime grant/API remains gated by object/action Authorization, mapping-specific RLS integration and Acceptance.
- Configured live OIDC provider, ingress/rate-limit and operations are separate deployment gates.
- A diagnostic expanded Compose-config command inadvertently exposed local development credentials in tool output; no values were copied to repository files and `.env` was not modified. If sharing the transcript, rotate those local credentials first.

## 11. 최종 판정

```text
Ticket: MEDIQ-IAM-002
Scope: Verified configured-issuer Actor/Tenant/Hospital resolution and transaction-local RLS context
Changed: Internal resolver, shared runtime pool, additive column grants, tests, synthetic test harness and docs
Not changed: Business API/AuthZ, PatientMapping, Consent/Grant, DICOM/PACS, real identity/PHI
Security impact: Exact 11-column SELECT only; forced RLS preserved; failure denies and unsafe clients are discarded
Tests executed: API 100 tests; migration runner 6; journal check; runtime PostgreSQL integration 2; Compose config and diff checks
Tests not executed: Business route safe-error/Authorization, PAT-002 runtime mapping, product E2E A→B
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-IAM-002/
Remaining risks: Same-role custom GUC mutability; no safe HTTP business error or Authorization gate; P0 A→B not implemented
Status: PASS — IAM-002 scope only
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` (scoped) | 권고안 선작성 후 resolver, exact grants, transaction/pool tests와 문서 동기화 |
