# MEDIQ-PACS-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-001` |
| 제목 | PACS Import coordinator prerequisites — identity binding and operation-time authorization fence sub-gates |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PARTIAL` — identity and internal no-side-effect authorization-fence sub-gates PASS; full coordinator absent |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell host; Linux Alpine Node integration container |
| Runtime·Toolchain | Node.js 24, npm workspaces, TypeScript 6, Vitest 5, Docker Compose |
| 대상 환경 | Local synthetic development/test only |
| Data | Synthetic CT from ENV-007; A has 1 Study / 1 Series / 3 instances; B matching-fixture baseline is 0 instances |
| Side effects | Acceptance used uniquely named isolated PostgreSQL scratch Compose projects, applied the existing 20 migrations, seeded synthetic rows, and removed only verified owned scratch resources. The fence test did not call DICOM/Orthanc or STOW/POST and changed no PACS data. An initial DB-008 aggregate run exposed a checksum mismatch in migration `0018`; inspection of a retained migrator image and the applied ledger established that the only byte differences were four stripped trailing spaces. The exact historical SQL bytes were restored (no SQL/schema semantic change). The direct local migration smoke and the complete aggregate rerun then passed. Orthanc named volumes were retained. |

## 2. Acceptance 검증표

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PACS-001-PID-001` | Missing/malformed/overlength source identity, empty study, invalid destination ID, mismatch among per-instance IDs | Domain unit | Fail closed with fixed reason only; exact non-empty synthetic match returns count only | 11 assertions/cases passed; no input PatientID in decision | PASS |
| `TC-PACS-001-PID-002` | WADO metadata PatientID missing, wrong VR, multi-valued; projection includes unrelated patient fields upstream | Adapter unit | Required single LO tag; invalid upstream shape sanitized; allowlisted result excludes unrelated fields | 4 new cases passed; `PatientName` sentinel absent from projection | PASS |
| `TC-PACS-001-PID-002` | Real local synthetic source metadata | Orthanc read-only integration | Every instance's internal PatientID equals synthetic manifest's mapping value | A Study returned 3 instances; all matched. Integration suite 5/5. | PASS — test fixture only |
| `TC-PACS-001-FENCE-001` | PACS operation-time `PACS_IMPORT` check races Consent/Grant mutation | API unit + PostgreSQL integration | Canonical Session fence is acquired before current evidence/policy query; same verified Tenant transaction covers the DB-only callback | API ordering assertion passed; actual scratch PostgreSQL test passed using the canonical fence and evidence reader | PASS — internal gate only |
| `TC-PACS-001-FENCE-002` | Grant revoked before the next fenced PACS eligibility check; Consent already withdrawn | PostgreSQL integration | Resolve current committed evidence after acquiring fence; deny before protected callback | Real Grant revocation committed; next fenced request denied before callback; active Grant tied to persisted withdrawn Consent also denied | PASS |
| `TC-PACS-001-FENCE-003` | Exact recipient revokes Grant while PACS holds Session fence | PostgreSQL two-connection concurrency integration | Revocation waits until the DB-only callback transaction commits, then succeeds; no network I/O | Real `GrantRevocationService` remained unsettled while fence was held; after release it committed `REVOKED`; no DICOM operation | PASS — DB serialization only, not remote cancellation |
| `TC-PACS-001-FENCE-004` | Lock acquisition or Authorization evidence fails | API unit + PostgreSQL integration | Sanitized fail-closed result before protected callback | Unit lock-failure case returned unavailable without calling policy/callback; revoked and withdrawn persisted evidence denied in DB test | PASS |
| `TC-PACS-001-FENCE-005` | Inspect post-check effects | DB integration + code/data-flow review | No DICOM Gateway/STOW, durable operation state transition, or reusable capability | `pacs_transfer_operations` count before/after matched; the tested path had no DICOM call/HTTP route. B Orthanc was not queried in this DB-only test. | PASS scoped — product B-unchanged remains separate |
| `TC-PACS-001-PID-003` | Mismatch through future PACS coordinator | Product integration/security | Zero STOW requests and unchanged B destination | No coordinator exists; no negative dispatch path to exercise. No STOW was sent by this test. | NOT RUN |
| `TC-PACS-001-PRE-001` | Full Mandatory Preflight ordering | Product integration | Any missing/stale prerequisite denies before STOW | Full coordinator and operation-time gates not implemented | NOT RUN |
| `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` | Full A→MediQ→B protected transfer | Product E2E/security | Full Authorization, Consent/Grant, Preflight, STOW, verification, Integrity/Provenance/Audit all PASS | Not executed; not enabled | NOT RUN |

## 3. 실행 명령과 결과

### TEST-001 — API build

```powershell
npm run build:api
```

- 종료 코드: `0`
- 결과: API TypeScript build succeeded.
- 판정: `PASS`

### TEST-002 — API regression including PACS identity and DICOM adapter cases

```powershell
npm run test:api
```

- Initial run: `29` files included; one new suite lacked explicit Vitest imports and three adapter assertions expected the wrong fixed error identifier. These test-harness/assertion issues were corrected; no product behavior was weakened.
- Final run: `29` files / `526` tests passed.
- 판정: `PASS` (final run)
- Fence follow-up after implementation: `npm run test:api -- --reporter=dot` completed with `29` files / `529` tests passed; this is the current API regression count and includes fence ordering, lock-failure and policy-engine-failure cases. The initial 526 count above is retained as the earlier PID sub-gate checkpoint.

### TEST-003 — Type and Port conformance

```powershell
npm run typecheck:api
npm run test:dicom-port-contract
```

- 종료 코드: both `0`.
- 결과: API strict TypeScript check and compile-time DICOM Gateway Port conformance passed.
- 판정: `PASS`

### TEST-004 — Synthetic Orthanc read-only integration

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test
```

- 종료 코드: `0`.
- 결과: 5/5 tests passed: A QIDO Study query, A WADO hierarchy + exact synthetic PatientID per instance, all three byte/hash checks, rendered frame, and read-only repeatable B destination baseline.
- B matching synthetic-instance baseline: `0`.
- Network/effect boundary: test runner performed only QIDO/WADO reads. No STOW/POST or PACS mutation occurred; the one-off test-runner container was removed by `--rm`.
- 판정: `PASS` — local synthetic/read-only integration only.

### TEST-005 — Whitespace/diff integrity

```powershell
git diff --check
```

- 종료 코드: `0`.
- 결과: no whitespace errors. Git emitted repository-wide LF→CRLF conversion warnings for pre-existing/modified worktree files; line endings were not changed.
- 판정: `PASS`

### TEST-006 — Operation-time Authorization fence against real PostgreSQL

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- Isolated scratch phase result: `pacs001_session_fence=PASS`; revocation serialized behind the Session fence, post-revocation `PACS_IMPORT` was denied before callback, persisted withdrawn Consent was denied, and `pacs_transfer_operations` count stayed unchanged. The integration used the real synthetic actor registry, Tenant/RLS transaction, Authorization evidence reader and `GrantRevocationService` on separate PostgreSQL connections.
- DB-008 outputs after the PACS test: clean schema `18` product tables / migration ledger `20` / catalog `18|48|17|38`; owned-scratch reset passed; reset PostgreSQL role bootstrap passed; reset/reapply schema and full scratch Acceptance/regression outputs passed, including the fence again.
- Initial run: the aggregate command exited `1` in its final local migration smoke. The migrator correctly rejected migration `0018` because the applied-ledger SHA-256 (`83b53a62652d889e9c4de9e8947cf17ef0944214e635dd514e40d573f699faea`) differed from the then-current file (`40cd01e58ee1af553426404f0388ada6dcf95801dbecb35b7d5be54f21a21fde`). A retained pre-existing migrator image contained the exact applied version; line comparison showed only four missing trailing spaces, with no SQL statement or schema semantic difference.
- Correction: restored those four historical trailing spaces in `services/api/src/database/migrations/0018_smiling_shooting_star.sql`. The working-file hash then exactly matched the applied ledger and retained image (`83b53a62652d889e9c4de9e8947cf17ef0944214e635dd514e40d573f699faea`). No database ledger edit, re-baseline, schema change, or data mutation was performed.
- Direct local migration smoke: `./scripts/test-database-migrations.ps1 -EnvFile .env` exited `0`; both repeat-apply attempts passed; ledger `20`, owner `mediq_migrator`, product tables `18`; runtime `SELECT 1` passed and runtime access to the migration ledger was denied.
- Final aggregate rerun: `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` exited `0`. Clean UP/repeat, PACS-007 and PACS-001 fence integration, DB-009 exact privileges/RLS, PAT-002 internal mapping read, Consent/Grant/Exchange regressions, RESET/fresh UP, 18-table/20-migration catalog, and DB-002~007 schema regressions all passed. The script reported `db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false` and `db008_ephemeral_cleanup=PASS`.
- Cleanup: no owned `mediq-db008-*` scratch project remained after the successful run; existing named Orthanc volumes were not touched.
- 판정: `TC-PACS-001-FENCE-001~005` PASS at the internal no-side-effect gate; aggregate DB-008 and its final local migration smoke now PASS. This does not complete the PACS coordinator or full product transfer.

## 4. 실패·거부 경로

| 경로 | 결과 | 판정 |
|---|---|---|
| Empty source instance set or invalid collection | `SOURCE_INSTANCE_SET_EMPTY`; no source value returned | PASS |
| Missing/null, empty, real-shaped, lowercase, whitespace, or >64-char source PatientID | `SOURCE_IDENTITY_INVALID`; no ID reflected in result | PASS |
| Source PatientID differs from the destination mapping on any instance | `SOURCE_IDENTITY_MISMATCH`; no ID reflected in result | PASS |
| Destination mapping ID is not canonical synthetic input | `DESTINATION_IDENTITY_INVALID` | PASS |
| WADO PatientID missing, wrong VR, or multiple values | Sanitized `DICOM_UPSTREAM_INVALID`; no upstream body/details returned | PASS |
| Actual coordinator invoked with a bad identity | Not testable because coordinator is absent | NOT RUN |
| Grant revocation completes before a later PACS fence acquisition | Real revocation succeeded; subsequent fenced check re-read current status and denied callback | PASS |
| Grant revocation races an already-held PACS fence | Revocation remained blocked until DB-only transaction commit, then succeeded | PASS — does not recall/cancel a remote in-flight STOW |
| Withdrawn Consent, lock failure/policy exception, or changed operation ledger | Withdrawn evidence denied; unit lock and policy-engine failures returned sanitized unavailable without callback; operation count unchanged | PASS — scoped internal path |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Product coordinator identity-denial no-STOW/B-unchanged | No operation coordinator or protected import path exists | A future caller could fail to invoke the pure gate unless integrated and tested | Implement coordinator with the validator in Mandatory Preflight; prove zero STOW and compare B state before/after |
| Live STOW/A→B | `AGENTS.md` §5 requires every Mandatory Preflight gate first; several gates remain absent | No product transfer success evidence | Separate recommendation/Acceptance and enable only after all gates pass |
| Positive HTTPS/mTLS | Current resolver is local Test-only HTTP | Production transport security unproven | TLS profile and endpoint acceptance before deployment |
| Coordinator atomic dispatch boundary, Integrity/Provenance/Audit and reconciliation | Full coordinator and `STOW_STARTED` dispatch path remain absent; these are separate product gates | No proof that a future effect-capable path invokes the fence or atomically commits authorization with durable dispatch state; no remote cancellation guarantee | Record recommendation and Acceptance before implementing the full Mandatory Preflight/coordinator; keep live STOW gated |

## 6. 증거 및 민감정보 점검

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Focused and regression tests | `tests/api/pacs-patient-id-binding.test.mjs`; `tests/api/orthanc-dicomweb.adapter.test.mjs` | Only synthetic values; result tests verify values are not reflected |
| Orthanc integration | `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | Synthetic manifest; no PatientID printed; no raw DICOM or credentials included |
| Implementation report | `docs/implementation/MEDIQ-PACS-001/IMPLEMENTATION-REPORT.md` | No actual IDs, PHI, credentials, payload or secret |
| Runtime state | Local Compose Test Orthanc | Read-only QIDO/WADO; B synthetic fixture remained at 0 matching SOP instances |

## 7. 결론

- 결과: `PARTIAL`.
- PASS 범위: pure synthetic exact-identity gate; required/minimized WADO metadata extraction; internal operation-time fence/Authorization recheck; API 29 files/529 tests; API typecheck; Port compile contract; Compose checks; read-only Orthanc 5/5; isolated PostgreSQL concurrency/withdrawal/revocation/no-operation-row Acceptance.
- PASS: aggregate DB-008 clean/reset/reapply, DB-002~007 regressions, exact migration ledger/checksum, local runtime/migrator separation and owned-scratch cleanup all passed after restoring the historical four whitespace bytes in migration `0018`. No applied ledger or database data was rewritten.
- NOT RUN: effect-capable coordinator invocation, actual product no-STOW/B-unchanged, live STOW, full Mandatory Preflight/atomic `STOW_STARTED`, positive production mTLS/PKI, Integrity/Provenance/Audit completion, reconciliation, destination verification and complete P0 E2E.
- `IDENTITY_MATCHED` is identity eligibility only; it does not authorize viewing, transfer or PACS import.
- No real patient information, production PACS credential, production DICOM or DICOM payload was recorded.
