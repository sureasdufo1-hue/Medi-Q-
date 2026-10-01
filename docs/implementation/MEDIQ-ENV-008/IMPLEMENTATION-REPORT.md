# MEDIQ-ENV-008 Implementation Report

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-008` |
| Title | Application configuration and least-privilege database roles |
| Classification | `CAPSTONE-P0` |
| Date | `2026-09-29` |
| Status | `PASS` — scoped local configuration and PostgreSQL role boundary only |

## 1. Objective

Provide a fail-closed container application configuration baseline and ensure application runtime credentials do not use the PostgreSQL bootstrap/superuser account. Keep runtime, migration, and bootstrap credentials separate, and leave the existing PostgreSQL volume intact.

## 2. Scope

### Included

- A typed TypeScript config loader accepting only the currently approved `container` profile and validating required values, placeholders, service aliases, database role/name, API port, and A/B credential separation.
- A local provisioning script that uses the ignored root `.env`, creates/synchronizes independent local runtime and migration credentials, and applies minimum database/schema grants without resetting or deleting the database volume.
- A config validation script that passes only allowlisted runtime variables to the application loader and checks runtime/migration URL-to-credential correspondence without printing values.
- Unit tests for configuration acceptance and rejection, and a PostgreSQL role/authentication/DDL boundary probe.
- Security requirements, threat model, Acceptance Test, operator instructions, implementation status, and evidence synchronized with the implementation.

### Excluded

- Product API/Worker startup or an actual application connection from a product process.
- Product schema, executable migrations, table-level grants, Tenant RLS validation, or SQL-injection testing.
- Production secret storage/rotation, external identity, TLS deployment, PACS integration, WADO, or A→B product transfer.

## 3. Baseline and Traceability

| Category | IDs / document | Applied behavior | Implementation/test link |
|---|---|---|---|
| Environment | `MEDIQ-ENV-008`, `.env.example` | Container-only configuration and local role setup | Scripts and `TEST-EVIDENCE.md` |
| Security | `SEC-DB-001~004` | Bootstrap isolation, runtime least privilege, migration separation, configuration validation | `SECURITY-REQUIREMENTS.md`, `THREAT-MODEL.md` |
| Domain/API | Not applicable | No product API, domain state, or OpenAPI contract changed | Product API connection remains unimplemented |
| Acceptance | `TC-ENV-008-DB-001~005` | Runtime config allowlist, role flags, denied/allowed DDL, auth and mismatch rejection | `TEST-EVIDENCE.md` |

## 4. Implementation Results

- Added `services/api/src/config/app-config.ts` with a strict parser/loader. It accepts the `container` profile only, requires service aliases `postgres`, `orthanc-a`, `orthanc-b`, rejects placeholder or invalid credentials, and does not accept bootstrap/migration/admin secret variables in the runtime input.
- Added a pinned TypeScript toolchain entry and isolated app-config build/typecheck/test scripts. Eight configuration tests pass, including missing values, placeholders, privilege credential injection, unsupported host profile, service alias mismatch, database role/name mismatch, invalid API port, and reused A/B passwords.
- Added `scripts/setup-local-postgres-roles.ps1`. It does not remove, recreate, or reset a volume. It creates independent local `mediq_runtime` and `mediq_migrator` passwords in the ignored `.env`, applies role flags and grants, and suppresses database-client output that could expose local connection details.
- The PostgreSQL bootstrap account remains an administrative/bootstrap identity; it is not the runtime identity. `mediq_runtime` has `CONNECT` and schema `USAGE`, but no schema DDL, database/role creation, superuser, `BYPASSRLS`, or inherited role membership. `mediq_migrator` is a separate non-superuser identity with `CONNECT` and schema-level `USAGE, CREATE` for development migrations. No default table privileges are configured; future table grants must be explicit in reviewed migrations.
- Confirmed a correct runtime password authenticates, a deliberately incorrect password is rejected, runtime `CREATE TABLE` is denied, and migration DDL succeeds only inside a transaction that is rolled back with no probe table left behind.
- Updated `.env.example`, infrastructure/script instructions, security baseline, threat model, acceptance criteria, project status documents, and the implementation index.

## 5. Changed Files

| File/group | Change |
|---|---|
| `services/api/src/config/app-config.ts`, `services/api/tsconfig.app-config.json` | Typed configuration loader and isolated compilation target |
| `package.json`, `package-lock.json`, `tests/config/app-config.test.mjs` | Pinned compiler scripts and 8 configuration tests |
| `scripts/setup-local-postgres-roles.ps1`, `scripts/validate-app-config.ps1` | Local role provisioning, credential mapping, runtime-only config validation |
| `.env.example`, `infra/README.md`, `scripts/README.md` | Safe local setup contract and operator instructions |
| `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/ACCEPTANCE-TESTS.md` | `SEC-DB-001~004`, TB-06 and `TC-ENV-008-DB-001~005` |
| `docs/implementation/MEDIQ-ENV-008/*`, `docs/implementation/README.md` | Ticket report, test evidence and index |
| `docs/P0-DEVELOPER-BASELINE.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/TECH-STACK-DECISION.md`, `docs/REPOSITORY-BASELINE-AUDIT.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md` | Scoped progress and next-ticket status |

Other pre-existing worktree changes were preserved and are not claimed as ENV-008 output.

## 6. Impact

### Architecture

No runtime service was added. The config loader is a reusable API configuration boundary; only its typecheck/tests were built and run.

### API and data

No endpoint, schema, migration, table, or product behavior changed. The current database still has no product tables.

### Security and privacy

Reduces the impact of application credential compromise in the local development environment by removing superuser and schema DDL capability from the runtime role. Bootstrap and migration values stay out of the runtime config allowlist. The role setup reads only ignored `.env`; generated credentials were not displayed or added to Git. This does not prove Tenant isolation or application authorization.

## 7. Verification Summary

Commands and observed results are in [TEST-EVIDENCE.md](TEST-EVIDENCE.md). Config typecheck passed, 8/8 config tests passed, PostgreSQL authentication and privilege probes passed, Compose boundary validation passed, and Hospital A/B probes remained healthy. `git diff --check` and script syntax are included in the final evidence after the documentation edits.

## 8. Not Changed

- PostgreSQL volume contents and lifecycle; no `down -v`, database deletion, or destructive reset was performed.
- No product API connection, schema, migration runner, table grants, or RLS policy.
- No real patient data, production PACS, production credential, or operational DICOM was used.
- No commit or push was made.

## 9. Decisions and Exceptions

- Keep the local bootstrap identity for PostgreSQL initialization/provisioning only; `mediq_runtime` and `mediq_migrator` are separate identities.
- Allow only the internal container profile until a host-run topology with deliberately published, protected endpoints is separately approved.
- The migration role has schema-level DDL on the empty development `public` schema. Table-level runtime grants are intentionally deferred until actual migrations exist.

## 10. Remaining Risks and Follow-up

- API/Worker do not yet exist as running services, so the loader has not been exercised in a live product process.
- Future migrations must define and test explicit runtime table privileges; schema-level permission checks are not Tenant RLS tests.
- Local `.env` is appropriate only for this test setup. Production secrets, rotation, TLS, backup, and administrator access controls require a separate deployment design.
- Next environment ticket: `MEDIQ-ENV-009 Health checks`. Product database schema/API and DICOM transfer tickets remain separate.

## 11. Final Status

```text
Ticket: MEDIQ-ENV-008
Scope: Container config validation and local PostgreSQL bootstrap/runtime/migration role separation
Changed: App config loader/tests, safe local role provisioning/validation scripts, security/acceptance/operator documentation
Not changed: Product API/Worker connection, schema/migrations, table grants/RLS, product DICOM flow
Security impact: Local runtime no longer uses the bootstrap superuser; runtime DDL denied; invalid password rejected
Tests executed: Config typecheck, 8 config tests, URL mismatch rejection probe, PostgreSQL auth/role/DDL/rollback probes, Compose and Orthanc boundary checks
Tests not executed: Live product API connection, schema/table grants, Tenant RLS, API/SQL-injection, product DICOM E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Product runtime and schema are absent; future table grants and Tenant RLS remain unverified
Status: PASS (scoped local environment gate only)
```

## 12. Change History

| Date | Status | Note |
|---|---|---|
| 2026-09-29 | `PASS` (scoped) | App config and local DB least-privilege role boundary implemented and verified |
