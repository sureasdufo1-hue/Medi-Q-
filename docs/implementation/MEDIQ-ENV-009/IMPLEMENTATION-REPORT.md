# MEDIQ-ENV-009 Implementation Report

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-009` |
| Title | P0 operational health checks for API, PostgreSQL, and Test Orthanc A/B |
| Classification | `CAPSTONE-P0` |
| Date | `2026-09-29` |
| Status | `PASS` — operational health scaffold and local integration gate only |

## 1. Objective

Make local environment readiness repeatable across the API process, PostgreSQL runtime identity, and both isolated Test Orthanc services, while preventing an operational-health result from being misrepresented as product/API security acceptance.

## 2. Scope

### Included

- NestJS/Fastify operational API scaffold using the approved runtime configuration and pinned dependencies.
- `GET /api/v1/health/live` process-liveness response, independent of downstream dependencies.
- `GET /api/v1/health/ready` readiness check for PostgreSQL runtime authentication and authenticated Orthanc A/B `/system` probes.
- Generic response bodies, `Cache-Control: no-store`, bounded probe timeouts, and no downstream detail exposure.
- API-only Compose service with an internal readiness healthcheck, no published host port, read-only root filesystem, non-root runtime user, dropped capabilities, and no-new-privileges.
- Full environment health orchestrator and documentation/contracts/tests for the operational endpoints.

### Excluded

- Product authentication/authorization, Consent/Grant enforcement, business endpoints, DB schema or migration, Worker, Viewer, WADO/STOW workflow, and product A→B exchange.
- Public ingress for operational health endpoints. Any future ingress must deny these routes.
- Claims of Phase 0 product acceptance or production-readiness.

## 3. Baseline and Traceability

| Category | IDs / document | Applied behavior | Evidence |
|---|---|---|---|
| Environment | `MEDIQ-ENV-009`, `infra/docker-compose.yml` | API is readiness-gated by PostgreSQL and Orthanc A/B; the script reports full environment health only after all probes pass | `TEST-EVIDENCE.md` |
| API contract | `docs/OPENAPI.yaml` operations tag | Documented internal liveness/readiness paths and generic response schemas | OpenAPI validation / review |
| Security | `SEC-OPS-HEALTH-001`, `THR-OPS-001` | No-store, bounded probes, generic status only, internal networks, no host port, container hardening | Unit, runtime, inspect, Compose checks |
| Runtime identity | `SEC-DB-002`, `SEC-DB-004` | API config receives runtime-only DB URL; health query executes `SELECT 1` | Full environment smoke |
| Acceptance | `TC-ENV-009-HEALTH-001~008` | Unit, DB/PACS readiness, API health, failure response, and exposure/hardening gates | `TEST-EVIDENCE.md` |

## 4. Implementation Results

- Added a minimal API operational-health application under `services/api/src/health/` and `services/api/src/main.ts`.
- Liveness returns only `{"status":"alive"}` and does not query dependencies.
- Readiness probes `SELECT 1` using the runtime role and authenticated A/B Orthanc system endpoints; ready returns `200 {"status":"ready"}`, otherwise `503 {"status":"not_ready"}`. Component details and credentials are not returned.
- Each downstream probe is bounded by a 1.5-second timeout. The health routes set `Cache-Control: no-store`.
- Added a pinned Node 24 multi-stage API image. The build context excludes `.env*`, Git metadata, generated data, keys, and certificates; the runtime image installs production dependencies only and runs as the unprivileged `node` user.
- Added the API Compose service on the three dependency-specific internal networks, without host port publishing. Compose waits for PostgreSQL and A/B health; the API healthcheck calls the readiness route. Root filesystem is read-only, capabilities are dropped, and `no-new-privileges` is enabled.
- Expanded `scripts/test-environment-health.ps1` to run DB and A/B probes and then check API liveness/readiness internally. Missing or unhealthy API fails closed.
- Added three API unit tests and updated OpenAPI, Security Requirements, Threat Model, Architecture, Acceptance Tests, operator docs, and status records.

## 5. Security and Privacy Impact

- This is an internal operations surface only; it does not authorize access to patient or imaging resources.
- Neither health response contains patient identifiers, DICOM UIDs, dependency hostnames, credentials, or exception details.
- DB access uses the dedicated runtime role. Orthanc credentials are injected from ignored local environment and are not logged.
- API host ports are not published. API container runtime user is `node`, root filesystem is read-only, all capabilities are dropped, and no-new-privileges is set.
- Only synthetic/test fixture data is present. No volume was reset or deleted.

## 6. Verification Summary

See [TEST-EVIDENCE.md](TEST-EVIDENCE.md) for commands and observed results. The API image built successfully; API typecheck and 3 unit tests passed; app-config validation passed 8 tests; Compose boundary validation passed; all four containers reported healthy; and the default full environment health script returned `environment_health_status=PASS`. Runtime inspection confirmed non-root/read-only/capability/network constraints.

This PASS is scoped to the operational environment-health ticket. Product API authorization, DB schema/table grants, Tenant RLS, Migration, DICOM WADO, STOW to B, Integrity/Provenance/Audit, and the end-to-end MediQ workflow remain unimplemented or unverified.

## 7. Changed Files

| File/group | Change |
|---|---|
| `services/api/src/`, `services/api/tsconfig.json`, `services/api/package.json`, `services/api/Dockerfile` | Operational-health-only API application, container build, pinned runtime dependencies |
| `package.json`, `package-lock.json`, `.dockerignore` | Build/test scripts, locked dependencies, secret/data exclusion from image context |
| `infra/docker-compose.yml` | Internal API service, readiness ordering, runtime hardening; no host port |
| `scripts/test-environment-health.ps1`, `scripts/validate-compose-baseline.ps1` | Full health orchestration and static boundary validation |
| `tests/api/health.test.mjs` | Liveness, ready, and fail-closed readiness response tests |
| `docs/OPENAPI.yaml`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/SYSTEM-ARCHITECTURE.md`, `docs/ACCEPTANCE-TESTS.md` | Operational-health contract, risks, architecture, and verification criteria |
| `README.md`, `infra/README.md`, `scripts/README.md`, execution/status docs | Current implementation boundary and reproduction instructions |

Pre-existing worktree changes were preserved; no commit or push was made.

## 8. Not Changed

- No API business endpoint, authentication/authorization, Consent, Grant, patient mapping, viewer, or transfer operation.
- No product schema, migration, Worker, DICOM retrieval, STOW, or A→B product exchange.
- No published API host port and no public health route exposure.
- No database, Orthanc, or generated-data volume reset/removal.
- No commit or push.

## 9. Remaining Risks and Follow-up

- ENV-010 environment smoke remains to be performed as a separate Ticket.
- Product database objects, table grants, Tenant RLS, and API business-flow security remain unverified.
- Health endpoints are unauthenticated by design only because the API has no external ingress; network boundaries must remain enforced. If ingress is introduced, explicitly deny both paths.
- The full product Acceptance and A→MediQ→B flow remain blocked on implementation of product contracts and controls.

## 10. Final Status

```text
Ticket: MEDIQ-ENV-009
Scope: Internal operational liveness/readiness for API + runtime PostgreSQL + Test Orthanc A/B
Changed: Health-only API, image/Compose service, smoke orchestration, OpenAPI/security/architecture/acceptance docs, ticket evidence
Not changed: Product endpoints/auth/domain/schema/migration/Worker/Viewer/DICOM transfer or public ingress
Security impact: Generic no-store responses, bounded authenticated probes, runtime DB identity, no host port, non-root/read-only/capability-dropped container
Tests executed: Build, API typecheck, 3 API unit tests, 8 config tests, Compose boundary validator, full DB/A/B/API environment smoke, runtime hardening inspection, git diff check
Tests not executed: Product authorization, schema/table grants, Tenant RLS, migration, WADO/STOW product flow, P0 end-to-end acceptance
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-ENV-009/
Remaining risks: Operational PASS is not product readiness; ENV-010 and all product workflow/security gates remain
Status: PASS (Ticket scope only)
```

## 11. Change History

| Date | Status | Note |
|---|---|---|
| 2026-09-29 | `PASS` | Added and tested internal operational health API; DB/A/B/API full local gate passes. Product functionality remains out of scope. |
