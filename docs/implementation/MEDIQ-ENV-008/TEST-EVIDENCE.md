# MEDIQ-ENV-008 Test Evidence

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-008` |
| Title | Application configuration and least-privilege database roles |
| Classification | `CAPSTONE-P0` |
| Execution date | `2026-09-29` (Asia/Seoul; local terminal session) |
| Result | `PASS` — scoped local configuration and database role boundary only |

## 1. Environment

| Item | Observed |
|---|---|
| OS / shell | Windows, PowerShell |
| Runtime/toolchain | Node `v24.18.0`; npm `11.16.0`; TypeScript `6.0.3` from pinned project dependency |
| Container runtime | Docker Server `29.8.0`; Docker Compose `v5.5.1` |
| Database | PostgreSQL `18.6-bookworm`, Compose service `postgres`, isolated `database` network |
| DICOM test services | Hospital A/B Test Orthanc, core `1.13.0`; internal isolated networks |
| Data | Synthetic test fixture only; no actual patient data or operational PACS |
| Local credentials | Read from ignored `.env`; generated values were not printed or recorded |

Commands ran on `2026-09-29` KST during the current local development session. Tool outputs below are reduced to non-sensitive pass/fail facts; connection strings and credential values are intentionally omitted.

## 2. Verification Matrix

| Test ID | Requirement / risk | Type | Expected | Actual | Result |
|---|---|---|---|---|---|
| `TC-ENV-008-DB-001` | Bootstrap/migration credential reaches app loader | Unit/config security | Config rejects privileged or migration inputs; only allowlisted runtime config is passed | Relevant negative unit test passed; allowlist validation passed | `PASS` |
| `TC-ENV-008-DB-002` | Runtime role is elevated or inherits another role | DB security | Non-superuser, no DB/role creation, no `BYPASSRLS`, no inherited membership | Role flags all false; runtime membership count 0 | `PASS` |
| `TC-ENV-008-DB-003` | Runtime can change schema | DB negative | Runtime `CREATE TABLE` denied | Denied; command output suppressed | `PASS` |
| `TC-ENV-008-DB-004` | Migration role separation and migration DDL boundary | DB integration | Separate non-superuser role can execute schema DDL in transaction; rollback removes test object | Migration role authenticated, elevated flags false; transaction DDL succeeded and post-rollback object count was 0 | `PASS` |
| `TC-ENV-008-DB-005` | Authentication/config mismatch/placeholder/profile confusion | Config + DB security | Valid runtime login succeeds; invalid password, mismatched URL mapping, placeholder and unsupported profiles are rejected | Valid login succeeded; wrong password rejected; URL mismatch self-check and unit rejection cases passed; no secret values printed | `PASS` |
| `ENV-008-REG-001` | App config implementation | Typecheck/unit | Typecheck and all config tests pass | Typecheck/build passed; 8 tests passed, 0 failed | `PASS` |
| `ENV-008-REG-002` | Compose boundary regression | Static/config | DB stays internal; services pinned; no host ports; isolated networks/volumes | Baseline validator passed | `PASS` |
| `ENV-008-REG-003` | Existing Hospital A/B runtime regression | Integration smoke | A/B healthy, credential rejection, authenticated QIDO, no cross-hospital path | A: QIDO 1 study; B: QIDO 0 studies; unauthenticated/invalid credentials rejected; network/port isolation confirmed | `PASS` |
| `ENV-008-REG-004` | Script syntax, whitespace, local secret ignore | Static | PowerShell parses; `git diff --check` clean; `.env` ignored | All passed; Git emitted only configured LF→CRLF advisory warnings | `PASS` |

## 3. Commands and Results

### TEST-001 — Local PostgreSQL role provisioning and least privilege

- Executed: `2026-09-29` KST
- Command:

```powershell
./scripts/setup-local-postgres-roles.ps1
```

- Exit code: `0`
- Result: bootstrap was used only for local provisioning; runtime/migration credentials were distinct; runtime flags were non-elevated; migration flags were non-elevated; correct runtime authentication passed; invalid password was rejected; runtime DDL was denied; migration transaction DDL passed and rollback left no probe object.
- Output included no credential values.
- Verdict: `PASS`

### TEST-002 — App config typecheck, unit suite and local value validation

- Executed: `2026-09-29` KST
- Command:

```powershell
./scripts/validate-app-config.ps1
```

- Exit code: `0`
- Result: TypeScript typecheck and build passed; all 8 config unit tests passed; the container runtime config parsed; the intentionally mismatched URL credential self-check was rejected; local `.env` values were not printed; bootstrap and migration settings were not passed to the config loader.
- Verdict: `PASS`

### TEST-003 — Compose boundary validation

- Executed: `2026-09-29` KST
- Command:

```powershell
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
```

- Exit code: `0`
- Result: Compose syntax, pinned images, PostgreSQL readiness/internal-only boundary, A/B service probes, no host ports, network and volume separation passed.
- Verdict: `PASS`

### TEST-004 — Hospital A/B no-regression probes

- Executed: `2026-09-29` KST
- Commands:

```powershell
./scripts/test-orthanc-a.ps1
./scripts/test-orthanc-b.ps1
```

- Exit codes: both `0`
- Result: both Orthanc services healthy; unauthenticated and wrong-password requests returned `401`; authenticated DICOMweb QIDO returned `200`; A contained the expected one-study synthetic fixture and B remained empty; host-port and cross-hospital network paths remained unavailable.
- Verdict: `PASS` for existing fixture/readiness scope. This is not WADO or product A→B exchange evidence.

### TEST-005 — Static and local-secret boundary

- Executed: `2026-09-29` KST
- Checks: PowerShell AST parse of both ENV-008 scripts; `git diff --check`; `git check-ignore --quiet .env`.
- Exit code: `0`
- Result: scripts parsed, no whitespace errors, `.env` remained ignored. Git printed only LF→CRLF advice for repository files; no content was normalized for this check.
- Verdict: `PASS`

## 4. Failure and Denial Paths

| Case | Observed result | Verdict |
|---|---|---|
| Incorrect PostgreSQL runtime password | Connection rejected | `PASS` |
| Runtime `CREATE TABLE` | Permission denied; no successful DDL | `PASS` |
| App loader receives privileged bootstrap or migration configuration | Unit test rejects | `PASS` |
| Missing or placeholder application configuration | Unit tests reject without exposing values | `PASS` |
| Host profile or incorrect internal service alias | Unit tests reject | `PASS` |
| Database URL role/name mismatch and deliberate expected-password mismatch | Unit/self-check rejects | `PASS` |
| Orthanc unauthenticated or wrong password | HTTP `401` for A and B | `PASS` |

## 5. Not Executed

| Test | Reason | Residual risk / follow-up |
|---|---|---|
| Live API/Worker process connecting to PostgreSQL | Product services are not implemented/running | ENV-009 and product service tickets must verify actual runtime injection and health |
| Product schema migrations and explicit table grants | No product schema exists yet | Each migration must grant only required table/sequence privileges and prove rollback |
| Tenant row-level security and application authorization | Outside the empty-schema environment ticket | Test cross-tenant isolation with real repository queries before product PASS |
| SQL injection, API contract, WADO, STOW-to-B and complete P0 E2E | Product request/transfer path not implemented | Must be covered by API/security/integration/E2E tickets |
| Production secret manager, credential rotation, TLS/backup/HA | Local capstone environment only | Productionization review required; no production-readiness claim |

## 6. Evidence Artifacts

| Artifact | Location / identifier | Sensitive-data review |
|---|---|---|
| Implementation report | [`IMPLEMENTATION-REPORT.md`](IMPLEMENTATION-REPORT.md) | No secrets or patient data |
| Config unit tests | `tests/config/app-config.test.mjs` | Synthetic values only |
| Local config/role scripts | `scripts/validate-app-config.ps1`, `scripts/setup-local-postgres-roles.ps1` | Read ignored local `.env`; output is sanitized |
| Test DICOM | ignored `data/synthetic-ct-env007/` | Synthetic only; not included in this evidence or Git |
| Local `.env` | ignored root `.env` | Excluded from Git and evidence; values not recorded |

## 7. Conclusion

- Result: `PASS` for the `MEDIQ-ENV-008` local app-configuration and PostgreSQL role-boundary scope.
- This does **not** mean an API/Worker is connected to the database, a schema or migration is implemented, Tenant isolation is proven, or the P0 product flow is complete.
- No production credential, actual patient data, or operational DICOM was used.
