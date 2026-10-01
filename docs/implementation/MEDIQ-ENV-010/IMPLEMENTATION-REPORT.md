# MEDIQ-ENV-010 Implementation Report

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-010` |
| Title | Reproducible P0 environment smoke test |
| Classification | `CAPSTONE-P0` |
| Date | `2026-09-29` |
| Status | `PASS` — reproducible local environment gate only |

## 1. Objective

Provide one repeatable command that validates the synthetic CT fixture, checks the Compose security baseline, starts the approved local environment without deleting persistent data, and verifies API/DB/PACS readiness plus exact source/destination fixture placement.

## 2. Scope

### Included

- Require the ignored local `.env`, Compose definition, ENV-007 Python virtualenv, and approved fixture directory.
- Validate the synthetic fixture manifest, DICOM files, pixel properties, identities, UIDs, and SHA-256 hashes with the existing ENV-007 validator.
- Run the Compose baseline validator and build/start the four approved services using `docker compose up -d --build --wait`.
- Run the complete ENV-009 DB/A/B/API operational health gate.
- Query QIDO-RS within isolated A/B networks and compare the source Study, Series, and all 3 SOP Instance UIDs against the synthetic fixture manifest; require Hospital B to remain empty.
- Emit `environment_smoke_status=PASS` only after every preceding check succeeds.
- Document the smoke Acceptance cases, command, observed output, and limitations.

### Excluded

- Any Orthanc data mutation, seed, transfer, volume reset, container removal, or cleanup.
- WADO-RS payload retrieval, STOW-RS to B, MediQ product transfer, business API authorization, product schema/migrations, and full P0 acceptance.
- Use of real patient information, operational PACS, or operational credentials.

## 3. Baseline and Traceability

| Category | IDs / document | Applied behavior | Evidence |
|---|---|---|---|
| Environment baseline | `MEDIQ-ENV-003~009`, Phase 0 `GATE-IMP-01` | Revalidate Compose boundary and all service readiness before smoke passes | `TEST-EVIDENCE.md` |
| Synthetic data | `MEDIQ-ENV-007`, `data/synthetic-ct-env007/manifest.json` | Require exactly one approved Study/Series and 3 unique SOP Instance UIDs; verify DICOM payload hashes | Fixture validator and QIDO runtime results |
| Security | `SEC-DB-002/004`, `SEC-OPS-HEALTH-001`, PACS network boundary | Read ignored local secrets without printing; use authenticated isolated probes; no host ports or destructive operations | `TEST-EVIDENCE.md` |
| Acceptance | `TC-ENV-010-SMOKE-001~004` | Build/start, manifest validation, exact A placement/B empty, one-command fail-closed orchestration | `TEST-EVIDENCE.md` |

## 4. Implementation Results

- Added `scripts/test-environment-smoke.ps1` as the ENV-010 entry point.
- The script fails closed when `.env` is not Git-ignored, required inputs are absent, or the fixture manifest does not declare exactly 3 unique instances.
- It runs the existing fixture validator and Compose boundary validator before `docker compose up -d --build --wait`.
- It then runs the existing ENV-009 environment health orchestrator, which checks PostgreSQL runtime SQL authentication, Orthanc A/B readiness/auth/QIDO/network isolation, and API liveness/readiness.
- Finally, an ephemeral pinned Node client on each hospital-only network requests QIDO study/series/instance metadata. Hospital A must match all manifest UIDs and contain exactly 1/1/3; Hospital B must contain zero studies. The script prints counts only, not UIDs or credentials.
- The script contains no seed, delete, reset, `down`, or volume-removal command.
- Updated Acceptance Tests, developer baseline, operator README, schedule, status index, and Ticket implementation/evidence records.

## 5. Changed Files

| File | Change |
|---|---|
| `scripts/test-environment-smoke.ps1` | Repeatable fail-closed smoke orchestration and exact fixture placement verification |
| `docs/ACCEPTANCE-TESTS.md` | Added `TC-ENV-010-SMOKE-001~004` and scoped status |
| `docs/P0-DEVELOPER-BASELINE.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/IMPLEMENTATION-PLAN.md` | ENV-010 execution and Phase 0 environment gate status |
| `scripts/README.md`, `infra/README.md` | Reproduction instructions and boundary clarification |
| `docs/implementation/MEDIQ-ENV-010/*`, `docs/implementation/README.md` | Implementation record, evidence, and status index |

Pre-existing user changes were preserved. No commit or push was made.

## 6. Impact

### Architecture

No product architecture or service contract changed. Smoke uses ephemeral clients attached only to the intended internal networks.

### API and data

No product API, DB object, or DICOM data mutation was performed. Existing A synthetic fixture stayed unchanged; B stayed empty.

### Security and privacy

The script requires an ignored local `.env`; credentials are sent to container probes via stdin and are not printed. DICOM UIDs are compared in memory and not emitted. Only approved synthetic data was used. Existing host-port/network isolation is rechecked.

## 7. Verification Summary

The smoke command completed twice; the final implementation (including exact QIDO UID-set matching) returned exit code 0. Manifest validation, Compose boundary validation, all four service readiness checks, DB runtime SQL, authenticated A/B QIDO, invalid-credential rejection, network isolation, API readiness, exact A 1 Study/1 Series/3 SOP Instances, and B empty all passed. The negative missing-input check and final repository diff check also passed. Exact commands and safe output are in [TEST-EVIDENCE.md](TEST-EVIDENCE.md).

`GATE-IMP-01` is satisfied as the repository/environment reproducibility gate. This does not make the MediQ product/P0 workflow complete.

## 8. Not Changed

- No Orthanc import, export, transfer, reset, or data deletion.
- No Docker volume deletion and no `docker compose down`.
- No WADO payload, STOW-to-B, product schema/migration, or business workflow.
- No production PACS, patient data, external services, commit, or push.

## 9. Remaining Risks and Follow-up

- Product database schema and migrations are still absent; proceed to Phase 1 only under its approved `MEDIQ-DB-*` Tickets.
- Patient Mapping, Consent, Authorization, Grant, Preflight, product audit/provenance, WADO/STOW, and product E2E acceptance remain unimplemented.
- The smoke requires the ENV-007 virtualenv and existing synthetic fixture; setup instructions are documented and no auto-seeding occurs by design.

## 10. Final Status

```text
Ticket: MEDIQ-ENV-010
Scope: Repeatable local P0 environment and synthetic fixture placement smoke only
Changed: Smoke script, Acceptance cases, operator/status docs, ticket evidence
Not changed: DICOM store contents, product APIs/schema/migrations, transfer workflow
Security impact: ignored-secret guard, credentials not printed, isolated auth probes, no host port, no destructive operations
Tests executed: PowerShell AST; smoke command twice; fixture validator; Compose baseline; DB/A/B/API full health; exact QIDO placement; network isolation
Tests not executed: WADO/STOW product path, Consent/Authorization/Grant, destination transfer, full P0 product E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-ENV-010/
Remaining risks: Product workflow/security/API remains to be implemented and accepted
Status: PASS (environment gate only)
```

## 11. Change History

| Date | Status | Note |
|---|---|---|
| 2026-09-29 | `PASS` | Added repeatable Compose + synthetic fixture placement smoke; ran twice successfully without mutating PACS data. |
