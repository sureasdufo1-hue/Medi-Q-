# MEDIQ-IAM-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-IAM-002` |
| 제목 | Verified Actor and Tenant transaction context |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-09-30` (Asia/Seoul) |
| 결과 | `PASS` — IAM-002 scoped Acceptance only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS/Shell | Windows PowerShell |
| Runtime·Toolchain | Node.js 24, npm 11, TypeScript, Vitest, Docker Compose, PostgreSQL 18.6 |
| 대상 환경 | Local development Compose; existing synthetic A/B/C registry; local persistent test DB |
| Runtime DB identity | `mediq_runtime` only for API and integration-test containers |
| Migration identity | `mediq_migrator` only for the opt-in migration service and fixture setup/cleanup |
| Data | Ephemeral synthetic Actor / synthetic subject only; no PHI or DICOM payload |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 실제 결과 | 판정 |
|---|---|---|---|---|
| `TC-IAM-002-CTX-001` | Invalid principal/issuer/Tenant selector | Unit | Denied before DB checkout; callback not called | `PASS` |
| `TC-IAM-002-CTX-002` | Exact active membership and immutable context | Unit + PostgreSQL integration | Registry row produced frozen server-side context | `PASS` |
| `TC-IAM-002-CTX-003` | Unknown/inactive membership; no detail leakage | Contract + integration | SQL requires active Actor/Tenant/optional Hospital; unknown candidate denied before callback; errors are fixed | `PASS` |
| `TC-IAM-002-CTX-004` | Tenant substitution / caller Actor-Hospital substitution | Unit + PostgreSQL integration | A membership accepted; B/C candidates denied; resolver accepts no caller Actor/Hospital fields | `PASS` |
| `TC-IAM-002-DB-001` | Runtime grants and forced RLS | PostgreSQL catalog integration | Exactly 11 approved `SELECT` column grants; no other column privilege rows; Actor/Tenant/Hospital all `ENABLE` + `FORCE RLS` | `PASS` |
| `TC-IAM-002-TX-001` | Same-client order and membership-before-callback | Unit + PostgreSQL integration | `RESET → BEGIN → set_config(local) → lookup → callback → COMMIT/ROLLBACK → RESET`; callback receives checked-out client only after membership | `PASS` |
| `TC-IAM-002-TX-002` | Pool context leak after commit | PostgreSQL integration | With pool max 1, next borrower saw empty setting and zero Tenant rows | `PASS` |
| `TC-IAM-002-TX-003` | Callback, setup, rollback and cleanup failures | Unit | Rollback/reset attempted; setup/rollback/reset-failing clients discarded; DB error detail replaced by generic internal error | `PASS` |
| `TC-DB-009-RLS-006` | Generic pool transaction context reset | PostgreSQL integration | IAM-002 commit, denied-membership rollback and next borrower verified | `PASS` |
| `TC-PAT-002-SEC-002` | Generic connection-pool reuse | PostgreSQL integration | Covered by IAM-002; no PatientMapping access granted | `PASS` for pool property only |

## 3. 실행 명령과 결과

### TEST-001 — API Unit/Contract and TypeScript build

```powershell
npm run test:api
```

- Exit code: `0`
- Result: 8 files, 100 tests passed.
- Includes IAM-002 resolver lifecycle, exact query contract, callback gating, generic errors and client discard failures.

### TEST-002 — Migration runner/journal and app configuration regression

```powershell
npm run test:db-migrations
npm run db:migrations:check
npm run test:app-config
```

- `test:db-migrations`: exit 0; 6/6 tests passed.
- `db:migrations:check`: exit 0; Drizzle reported the journal consistent.
- `test:app-config`: exit 0; 10/10 tests passed.

### TEST-003 — Apply migration and run runtime-only database integration

```powershell
./scripts/test-iam-002.ps1 -EnvFile .env
```

- Exit code: `0` on the final run.
- Migration runner: `migration_complete=PASS total=10`; migration `0009_identity_context_column_grants` was applied on the local synthetic database.
- Runtime integration container: IAM-002 + PAT-001 tests 2/2 passed.
- Integration container received only the runtime database URL plus unique synthetic fixture identifiers; migration credential was isolated to the migration/fixture harness.
- Temporary Actor fixture cleanup completed; a post-run count of `synthetic-iam002-*` test rows returned `0`.
- An earlier trial exposed an overly strict test assertion when an interrupted-run synthetic fixture was present; the assertion and scoped cleanup were corrected before this final passing run.

### TEST-004 — Compose configuration and live API container/readiness

```powershell
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1
docker compose --env-file .env -f infra/docker-compose.yml up -d --build --no-deps api
./scripts/test-environment-health.ps1 -EnvFile .env
```

- Compose validation: exit 0, no configuration output.
- Baseline validation: exit 0; service allowlists, runtime image target, and integration-test env/image boundaries passed.
- API image explicitly built with target `runtime`; API container started successfully with the new shared RuntimeDatabase/Identity modules.
- Environment health: `postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=PASS`; overall `environment_health_status=PASS`.
- Hospital A/B authenticated QIDO probes passed; unauthorized/invalid credential probes were rejected; A/B network boundary remained isolated. This does not prove product DICOM transfer.

### TEST-005 — Repository diff hygiene

```powershell
git diff --check
```

- Exit code: `0`; no whitespace errors. Git emitted its existing LF-to-CRLF working-copy advisory for Windows.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `CTX-001/004` | Wrong issuer, malformed selector, valid but nonmember B/C Tenant | Deny; no protected callback | `PASS` |
| `CTX-003` | Unknown subject, inactive Actor/Tenant/Hospital | Parameterized lookup requires all relevant statuses `ACTIVE`; absent active membership denied generically | `PASS` |
| `TX-003` | Resolver DB failure or transaction setup failure | Generic unavailable error; callback not invoked; client discarded where unsafe | `PASS` |
| `TX-003` | Callback error, rollback failure, post-transaction reset failure | Rollback/reset attempted; failing client discarded | `PASS` |
| `TX-002` | Borrow pooled connection after commit or membership-denial rollback | No inherited Tenant setting/rows | `PASS` |
| `AUTHZ` | Consent/Grant/action/resource/destination denial and PACS STOW | No business workflow exists in IAM-002 | `NOT RUN` — outside scope |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Safe HTTP error mapping for a protected endpoint | IAM-002 registers no business route or exception filter | Future routes must not expose DB/internal errors | Complete `MEDIQ-DB-009` API error Acceptance before route exposure |
| PatientMapping/Exchange business Authorization and runtime CRUD | Explicitly outside IAM-002; business grants remain absent | Context/RLS is not business permission | Implement `AUT-*` and PAT/EXC-specific scoped grants and negative tests |
| DICOM Viewer, Download, Preflight, PACS Import and A→B E2E | No product route/workflow in this Ticket | Overall MediQ P0 success condition remains incomplete | Continue sequential P0 implementation and Acceptance |
| Production OIDC provider, multi-issuer and real-patient readiness | P0 configured single-issuer synthetic boundary only | Actor schema has no multi-issuer namespace; custom GUC is mutable by same-role SQL | Separate identity schema/security/operations decision before production |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Unit/contract tests | `tests/api/actor-tenant-context.test.mjs`, `actor-registry.repository.test.mjs` | Synthetic identifiers only |
| Runtime DB integration | `tests/database/actor-tenant-context-runtime.integration.test.mjs` and `scripts/test-iam-002.ps1` | No connection URL or secret written to test output |
| Migration | `services/api/src/database/migrations/0009_identity_context_column_grants.sql` | Privilege declarations only |
| Runtime health evidence | Command result in this report; existing `MEDIQ-ENV-009` evidence remains linked separately | Health summary only; no credentials or patient data |
| Recommendation and current Acceptance | `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, linked architecture/security docs | No credentials, PHI or DICOM payload |

## 7. 결론

- 결과: `PASS` for `MEDIQ-IAM-002` scope only.
- PASS 범위: verified Actor/Tenant/Hospital resolver, exact minimal grants, transaction/pool cleanup, negative membership checks and API/runtime boot.
- `MEDIQ-DB-009` overall remains `PARTIAL`; no business authorization, safe business HTTP error, PAT mapping access, DICOM transfer or P0 E2E PASS is claimed.
- Security note: during a diagnostic expanded Compose-config inspection, local development `.env` credential values appeared in tool output. No values were copied into repository files or implementation evidence, and `.env` was not modified. Treat those local credentials as exposed if the transcript is shared; rotate them first if needed.
- No real patient information, production credentials or operational DICOM were used.
