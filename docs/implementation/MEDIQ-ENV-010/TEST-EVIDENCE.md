# MEDIQ-ENV-010 Test Evidence

| Item | Value |
|---|---|
| Ticket | `MEDIQ-ENV-010` |
| Title | Reproducible P0 environment smoke test |
| Classification | `CAPSTONE-P0` |
| Execution date | `2026-09-29` (Asia/Seoul) |
| Result | `PASS` — local environment reproducibility and fixture placement only |

## 1. Environment

| Item | Observed |
|---|---|
| OS / shell | Windows, PowerShell |
| Toolchain | Python `3.13.14`, pydicom `3.0.2`; Node `v24.18.0`, npm `11.16.0` |
| Container runtime | Docker Server `29.8.0`, Docker Compose `v5.5.1` |
| Services | PostgreSQL `18.6-bookworm`; Orthanc A/B core `1.13.0`; health-only API |
| Data | ENV-007 synthetic CT only; no actual patient data or production PACS |

The `.env` file remained ignored. Its contents, PACS credentials, DICOM UIDs, and payloads were not printed or recorded.

## 2. Verification Matrix

| Test ID | Requirement / risk | Type | Expected | Actual | Result |
|---|---|---|---|---|---|
| `TC-ENV-010-SMOKE-001` | Service is absent/unhealthy or startup loses reproducibility | Compose integration | Compose builds/starts required services and waits until healthy; no volume reset | All four services reported healthy; no `down`/volume reset/deletion was run | `PASS` |
| `TC-ENV-010-SMOKE-002` | Fixture is malformed, altered, or contains unexpected files/identities | Fixture integrity | Existing validator confirms approved manifest, exact files, three DICOM instances, UIDs/hashes/pixels | `fixture_validation=PASS`; 1 Study / 1 Series / 3 Instances; manifest SHA-256 `e041abb9085eb0eb8a0244ba832fb0981b5c0523df97251c51977d46ab953a69` | `PASS` |
| `TC-ENV-010-SMOKE-003` | Fixture is missing, duplicated, incomplete, or unexpectedly present at B | Authenticated QIDO integration | A matches manifest exactly at 1/1/3; B has zero studies | A: 1/1/3 and exact Study/Series/SOP UID sets; B: 0 studies | `PASS` |
| `TC-ENV-010-SMOKE-004` | Smoke reports success despite a failed subcheck | Fail-closed orchestration | Only print `environment_smoke_status=PASS` after validators, startup, health, and placement pass | Final run exited `0` and emitted PASS after all preceding checks | `PASS` |
| `ENV-010-STATIC-001` | PowerShell syntax error or unsafe reset operation | Static review | AST parse passes; script contains no reset/down/delete command | AST parse passed; no destructive cleanup commands in script | `PASS` |
| `ENV-010-FAIL-001` | Required smoke input is missing | Fail-closed negative check | Fail before invoking Compose or changing runtime state | Missing Python path was rejected at preflight; no services were touched | `PASS` |

## 3. Commands and Results

### TEST-001 — Final reproducible environment smoke

```powershell
./scripts/test-environment-smoke.ps1
```

- Final enhanced implementation exit code: `0`.
- The command was run twice overall: once before exact QIDO UID-set matching was added, then again after the stronger check. The final result below is from the enhanced run.
- It ran the fixture validator, `validate-compose-baseline.ps1`, `docker compose --env-file .env -f infra/docker-compose.yml up -d --build --wait`, the complete ENV-009 health orchestrator, and isolated A/B QIDO placement assertions.
- Safe result summary from the final run:

```text
fixture_validation=PASS
studies=1 series=1 instances=3
Compose baseline validation=PASS
PostgreSQL runtime SQL=PASS
Hospital A authenticated QIDO=PASS; unauthenticated/invalid auth=401; study_count=1
Hospital B authenticated QIDO=PASS; unauthenticated/invalid auth=401; study_count=0
A/B network isolation=PASS
API readiness=PASS
environment_health_status=PASS
source_study_count=1 source_series_count=1 source_instance_count=3
destination_study_count=0
synthetic_fixture=PASS location=data/synthetic-ct-env007
synthetic_placement=PASS hospital_a=1/1/3 hospital_b=0
environment_smoke_status=PASS
```

The script compared QIDO Study/Series/SOP Instance UIDs to the local synthetic manifest in memory and did not print any of the UIDs.

### TEST-002 — PowerShell syntax and no-destructive-action review

```powershell
$tokens=$null
$errors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/test-environment-smoke.ps1),[ref]$tokens,[ref]$errors) > $null
if($errors.Count){$errors | ForEach-Object Message; exit 1}
```

- Exit code: `0` (`PowerShell AST: PASS`).
- Manual/static review confirmed the smoke script contains no `docker compose down`, volume removal, seed, reset, or delete operation.

### TEST-003 — Missing-input fail-closed behavior

```powershell
$failedClosed = $false
try { ./scripts/test-environment-smoke.ps1 -PythonExecutable "does-not-exist.exe" }
catch { $failedClosed = $_.Exception.Message -match "Required smoke-test input is missing" }
if (-not $failedClosed) { throw "Smoke must reject missing inputs before runtime actions." }
"missing_input_fail_closed=PASS"
```

- This safe negative-path check was run after the final smoke; it failed at the preflight file check before Compose or container actions.
- Exit code: `0`; output: `missing_input_fail_closed=PASS`.

### TEST-004 — Repository final diff check

```powershell
git diff --check
```

- Executed after all related implementation, acceptance, and status documents were synchronized.
- Exit code: `0`; no whitespace errors. Git emitted only existing LF-to-CRLF working-copy warnings.

## 4. Failure and Boundary Paths

| Case | Evidence | Verdict |
|---|---|---|
| Required local smoke input absent | Deliberately supplied a nonexistent Python executable; script stopped during input preflight | `PASS` (expected fail-closed behavior) |
| A study/series/instance set differs from manifest | Exact QIDO-to-manifest comparison is implemented, but no PACS data was altered to simulate mismatch | Negative mutation not run; implementation is fail-closed |
| Hospital B contains any Study | Runtime B QIDO returned an empty array | `PASS` |
| Wrong/missing PACS authentication | ENV-009 probes returned HTTP `401` for missing/wrong test credentials | `PASS` |
| Cross-hospital network access | A/B probes could not reach the opposite Orthanc endpoint | `PASS` |
| Container service failure | Not injected; ENV-009 health orchestrator checks runtime state and exits before PASS | Not fault-injected |

## 5. Not Executed

| Test | Reason | Residual risk / follow-up |
|---|---|---|
| WADO-RS payload retrieval and hash comparison | No product DICOM adapter in ENV-010 | Separate DICOM integration/product Ticket |
| STOW-RS A→B, destination verification, Integrity/Provenance/Audit | Smoke must be read-only with respect to PACS contents | Separate approved product E2E Ticket |
| Product API auth, Consent, Authorization, Grant, Tenant isolation | No business API/schema is included | Implement and test under product Tickets |
| Product P0 end-to-end acceptance | Smoke is environment baseline only | Continue planned product implementation; P0 remains blocked |

## 6. Evidence Artifacts

| Artifact | Location | Sensitive-data review |
|---|---|---|
| Smoke script | `scripts/test-environment-smoke.ps1` | Requires ignored `.env`; does not print credentials/UIDs; no destructive action |
| Synthetic fixture validator and manifest | `scripts/validate-synthetic-ct.py`, ignored `data/synthetic-ct-env007/` | Synthetic test identity; manifest hash only recorded |
| ENV-009 readiness probes | `scripts/test-environment-health.ps1`, `scripts/test-orthanc-a.ps1`, `scripts/test-orthanc-b.ps1` | Test credential values suppressed |
| Runtime DICOM stores | Test Orthanc A/B volumes | A retains only approved fixture; B remains empty |
| Local `.env` | ignored root file | Not recorded or added to Git |

## 7. Conclusion

- The enhanced smoke script returned overall PASS after validating the fixture, Compose boundaries, four-service readiness, and exact source/destination placement.
- Hospital A contains exactly 1 synthetic Study, 1 Series, and the 3 SOP Instances defined by the validated manifest; Hospital B has zero Studies.
- The smoke did not seed, transfer, delete, reset, or otherwise mutate PACS contents.
- This completes the Phase 0 environment reproducibility gate `GATE-IMP-01` only. MediQ product flow and P0 Acceptance remain incomplete.

## 8. Final Result

```text
Ticket: MEDIQ-ENV-010
Scope: Reproducible local environment/fixture smoke only
Tests executed: final smoke; PowerShell AST; missing-input negative path; final `git diff --check`
Tests not executed: WADO/STOW product exchange, authorization, product schema/migrations, full P0 E2E
Evidence: This file and IMPLEMENTATION-REPORT.md
Remaining risk: product workflow, domain security, migration and transfer are not implemented
Status: PASS (environment gate only)
```
