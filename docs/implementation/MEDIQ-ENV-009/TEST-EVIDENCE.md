# MEDIQ-ENV-009 Test Evidence

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-009` |
| Title | P0 operational health checks for API, PostgreSQL, and Test Orthanc A/B |
| Classification | `CAPSTONE-P0` |
| Execution date | `2026-09-29` (Asia/Seoul) |
| Result | `PASS` within ENV-009 operational-health scope only |

## 1. Environment

| Item | Observed |
|---|---|
| OS / shell | Windows, PowerShell |
| Toolchain | Node `v24.18.0`, npm `11.16.0`, TypeScript `6.0.3`, Vitest `5.0.2` |
| Container runtime | Docker Server `29.8.0`, Docker Compose `v5.5.1` |
| PostgreSQL | `18.6-bookworm`, dedicated runtime role, isolated database network |
| Test PACS | Hospital A/B Orthanc core `1.13.0`, separate internal networks and volumes |
| API | NestJS/Fastify operational health-only service; no product/business routes |
| Data | Synthetic CT fixture only; no actual patient data or operational PACS |

Credential values, URLs containing passwords, and database client diagnostics were not recorded or printed.

## 2. Verification Matrix

| Test ID | Requirement / risk | Type | Expected | Actual | Result |
|---|---|---|---|---|---|
| `TC-ENV-009-HEALTH-001` | One or more dependency/API containers not ready | Runtime integration | Postgres, Orthanc A/B, API healthy before full gate passes | All four services were running and healthy | `PASS` |
| `TC-ENV-009-HEALTH-002` | API/dependency probes accidentally use bootstrap DB identity | Authenticated integration | Runtime identity executes `SELECT 1` over internal network | `postgres_readiness=PASS runtime_sql_auth=PASS` | `PASS` |
| `TC-ENV-009-HEALTH-003` | Orthanc auth or A/B isolation is absent | DICOMweb security smoke | Authenticated QIDO works; absent/wrong auth is rejected; no cross-hospital path | A QIDO 200 / 1 study; B QIDO 200 / 0 studies; invalid and unauthenticated auth 401; cross-network unavailable | `PASS` |
| `TC-ENV-009-HEALTH-004` | Aggregate gate hides a failing component | Full orchestration | Default script reports full PASS only after DB/A/B/API checks | `postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=PASS`; overall PASS | `PASS` |
| `TC-ENV-009-HEALTH-005` | Liveness is coupled to dependency availability or leaks details | API unit test | Liveness remains `200 alive`, no-store, independent from failed readiness | Unit test passed; mocked failed readiness did not change liveness | `PASS` |
| `TC-ENV-009-HEALTH-006` | Healthy dependencies are not reflected by readiness | API/runtime | Generic `200 ready`, no-store, no component details | Unit and full runtime health orchestration passed | `PASS` |
| `TC-ENV-009-HEALTH-007` | Dependency failure leaks details or becomes ready | API unit test | Generic `503 not_ready`; no internal detail | Unit failure-path test passed | `PASS` |
| `TC-ENV-009-HEALTH-008` | API is externally published or runs over-privileged | Compose + runtime inspect | Internal networks only, no host port, read-only root, non-root, all capabilities dropped, no-new-privileges | Compose validator passed; inspect showed `node|true|["ALL"]|{}|running|healthy`; Compose specifies no-new-privileges | `PASS` |
| `ENV-009-STATIC-001` | Type/build/Compose configuration invalid | Build/static | Typecheck/build and baseline validators succeed | All listed checks succeeded | `PASS` |

## 3. Commands and Results

### TEST-001 — API production image build

```powershell
docker compose --env-file .env -f infra/docker-compose.yml build api
```

- Exit code: `0`
- Result: API TypeScript production build completed; image `mediq-api` built.
- Build context was 880 bytes for the runtime invocation and excluded local `.env`, Git, generated data, and key/certificate files through `.dockerignore`.
- Runtime dependency install reported 0 vulnerabilities; build dependency install reported 0 vulnerabilities.

### TEST-002 — Start only the API service and wait for readiness

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build --wait api
```

- Exit code: `0`
- PostgreSQL and Orthanc A/B were reused; no `down`, volume reset, or data deletion was performed.
- API started after all three dependencies were healthy and reached `healthy`.

### TEST-003 — Full environment health orchestration

```powershell
./scripts/test-environment-health.ps1
```

- Exit code: `0`
- Safe result summary:

```text
PostgreSQL runtime SQL: PASS
Hospital A: authenticated QIDO PASS; 1 synthetic study; invalid/unauthenticated credentials rejected
Hospital B: authenticated QIDO PASS; 0 studies; invalid/unauthenticated credentials rejected
A/B cross-network endpoints: unreachable
API liveness/readiness: PASS
postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=PASS
environment_health_status=PASS
```

### TEST-004 — API typecheck and unit tests

```powershell
npm run typecheck:api
npm run test:api
```

- Both exit codes: `0`
- `typecheck:api`: TypeScript completed with no errors.
- `test:api`: 1 test file passed, 3 tests passed (liveness independence, ready response, generic not-ready response).

### TEST-005 — Application config and DB credential-boundary tests

```powershell
./scripts/validate-app-config.ps1
```

- Exit code: `0`
- Typecheck passed; 8 tests passed, 0 failed.
- Loader emitted only the container profile and allowlisted non-secret host/role labels; credential values were not printed.

### TEST-006 — Compose boundary validator

```powershell
./scripts/validate-compose-baseline.ps1 -EnvFile .env
```

- Exit code: `0`
- Result: Compose syntax, image pins, dependency health, API allowlisted environment, internal network attachments, no host port, read-only root, dropped capabilities, no-new-privileges, and readiness healthcheck passed.

### TEST-007 — Runtime container hardening inspection

```powershell
$apiId = docker compose --env-file .env -f infra/docker-compose.yml ps -q api
docker inspect --format '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.PortBindings}}|{{.State.Status}}|{{.State.Health.Status}}' $apiId
docker compose --env-file .env -f infra/docker-compose.yml ps
```

- Exit code: `0`
- API safe inspection summary: `node|true|["ALL"]|{}|running|healthy`.
- All four Compose services reported `healthy`; API had no published port binding.
- `.env` values were not printed.

### TEST-008 — Repository whitespace check

```powershell
git diff --check
```

- Exit code: `0` after ticket/status documentation synchronization; no whitespace errors. Git emitted only working-copy LF-to-CRLF warnings.

## 4. Failure and Boundary Paths

| Case | Evidence | Verdict |
|---|---|---|
| API dependency readiness failure | Unit test stubs failed dependency probe; response is generic `503 not_ready` | `PASS` |
| API process alive while readiness is false | Unit test observes liveness independently | `PASS` |
| Missing/wrong Orthanc credentials | A/B runtime probes observed `401` | `PASS` |
| A/B cross-network access | A/B probe could not reach the opposite internal endpoint | `PASS` |
| Health endpoint exposed to host | Compose config and runtime port bindings are empty | `PASS` |
| Runtime root/capability boundary | Runtime inspection shows `node`, read-only root, `CapDrop=ALL`; Compose has `no-new-privileges` | `PASS` |
| Product authorization and Tenant isolation | No business endpoints or product schema exist in this Ticket | `NOT IN SCOPE / NOT RUN` |

## 5. Not Executed

| Test | Reason | Residual risk / follow-up |
|---|---|---|
| Product API authn/authz, Consent, Grant, patient mapping, Tenant RLS | Health-only API scaffold | Implement as separate approved product Tickets with negative security tests |
| Product schema/migration/table grants | No product schema is part of ENV-009 | Run approved DB Tickets before business API implementation |
| WADO, STOW to Hospital B, Destination Verification, Integrity/Provenance/Audit | Product DICOM exchange is outside ENV-009 | Separate DICOM/product E2E acceptance; do not infer from QIDO readiness |
| Full P0 Acceptance | This Ticket proves operational readiness only | Continue through ENV-010 and product Tickets; overall P0 remains blocked |

## 6. Evidence Artifacts

| Artifact | Location | Sensitive-data review |
|---|---|---|
| Implementation report | [`IMPLEMENTATION-REPORT.md`](IMPLEMENTATION-REPORT.md) | No credentials or PHI |
| Health orchestrator | `scripts/test-environment-health.ps1` | Reads ignored `.env`, prints status only |
| API health app/tests | `services/api/src/health/`, `tests/api/health.test.mjs` | Generic response; no patient data |
| API Docker image | `services/api/Dockerfile` | Multi-stage; no `.env` in build context; non-root runtime |
| Runtime DICOM | ignored `data/synthetic-ct-env007/` and Test Orthanc stores | Synthetic only; no payload in this evidence |
| Local `.env` | ignored root file | Not recorded or included in Git |

## 7. Conclusion

- The API operational-health service and all three dependencies pass the ENV-009 health gate in the current local Test environment.
- The API container is internally networked, has no published host port, runs non-root with a read-only root filesystem, and drops all capabilities.
- `PASS` applies only to the ENV-009 operational health scope. It does not mean the MediQ product API, secure workflow, product DICOM exchange, or P0 acceptance is complete.
- The earlier dependency-only `PARTIAL` and missing-API fail-closed observation are historical evidence; the full gate was subsequently completed and passed.

## 8. Final Result

```text
Ticket: MEDIQ-ENV-009
Scope: API liveness/readiness + runtime PostgreSQL + authenticated Test Orthanc A/B health
Tests executed: image build; API typecheck; 3 API tests; 8 config tests; Compose boundary validator; full runtime smoke; container hardening inspect
Tests not executed: product auth/domain/schema/migration/WADO/STOW/A→B/security/P0 acceptance
Evidence: This file and IMPLEMENTATION-REPORT.md
Remaining risk: Environment is ready for subsequent smoke/integration tickets; business product path is not implemented
Status: PASS (Ticket scope only)
```
