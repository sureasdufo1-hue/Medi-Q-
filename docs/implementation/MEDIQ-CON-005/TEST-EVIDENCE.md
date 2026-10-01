# MEDIQ-CON-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-005` |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — approved synthetic scope only |
| Host | Windows / PowerShell; Docker Compose Test profile |
| Host toolchain | Node.js `v24.18.0`; npm `11.16.0` |
| Data | Synthetic Actor, PatientReference, Session and Consent only |

## 1. Acceptance matrix

| Verification ID | Evidence / actual result | Status |
|---|---|---|
| `TC-CON-005-API-001` | Signed synthetic claim exactly bound to Session/Consent; `ACTIVE→WITHDRAWN`, timestamp and one success Audit | `PASS` |
| `TC-CON-005-API-002` | Missing, malformed-UUID and mismatched patient claims denied; no Consent/Audit mutation | `PASS` |
| `TC-CON-005-API-003` | Malformed Bearer returns 401 at this endpoint; forged signature, wrong issuer/audience and expiry are covered by `TC-IAM-001-AUTH-003/004`; protected handler is guarded | `PASS` |
| `TC-CON-005-API-004` | Requesting actor, SERVICE and Hospital-bound actor denied at endpoint; inactive membership is denied by the same IAM-002 active-membership gate covered by `TC-IAM-002` | `PASS` |
| `TC-CON-005-API-005` | Cross-Tenant, wrong Session/Consent pair and hidden Consent ID return generic 403; no write | `PASS` |
| `TC-CON-005-API-006` | PENDING, EXPIRED, REJECTED and ACTIVE-with-withdrawnAt inconsistent state return 409; no withdrawal Audit | `PASS` |
| `TC-CON-005-API-007` | Consent expiry and Session expiry are past and Session is terminal `FAILED`; withdrawal still succeeds without Session state mutation | `PASS` |
| `TC-CON-005-API-008` | Exact replay returns 200 and replay header; timestamp and Audit count remain unchanged | `PASS` |
| `TC-CON-005-API-009` | Two concurrent requests serialize under Session advisory lock; one transition/Audit, one replay | `PASS` |
| `TC-CON-005-API-010` | Injected Consent UPDATE, Audit INSERT and COMMIT failures return 503; outer transaction restores ACTIVE state and no withdrawal Audit | `PASS` |
| `TC-CON-005-API-011` | Runtime catalog exactly 126 allowed column grants, including only additive `consents.withdrawn_at UPDATE`; no table-level grants; forced RLS | `PASS` |
| `TC-CON-005-API-012` | Body, query and `x-patient-ref-id` overrides return 400 and do not mutate data | `PASS` |
| `TC-CON-005-API-013` | Session remains unchanged; no Grant row is created; route/service has no Grant, Viewer, DICOM or PACS dependency; no remote-recall claim | `PASS` (non-interference only) |

`TC-CON-005-API-003/004` rely in part on the already executed global IAM-001 JWT matrix and IAM-002 active-membership tests. This Ticket does not claim a legal patient identity or an external identity provider integration.

## 2. Commands and results

### TEST-001 — API build, typecheck and full unit/contract regression

```powershell
npm run typecheck:api
npm run test:api
```

- Exit: `0`
- Result: typecheck PASS; API build PASS; 20 test files / 371 tests PASS.

### TEST-002 — Migration tooling

```powershell
npm run test:db-migrations
npm run db:migrations:check
```

- Exit: `0`
- Result: migration runner 6/6 PASS; Drizzle journal check PASS.

### TEST-003 — Full PostgreSQL schema and Acceptance gate

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- Final exit: `0`.
- Disposable clean/repeat/reset/reapply PASS; 17 product tables; migration ledger 16; catalog `17/44/15/29`.
- DB-009 least-privilege/Tenant RLS and exact 126 runtime grants PASS.
- CON-004 and CON-005 actual signed OIDC/JWKS HTTP→PostgreSQL/RLS tests PASS, including denial, replay, concurrency and injected rollback cases.
- DB-002~007 persistent local development DB regressions PASS. Migration 0015 was applied idempotently to this existing development DB; final local ledger=16, runtime grants=126. The persistent volume was not reset; regression fixtures rolled back and did not remain. This was not a production DB or scratch-only run.

### TEST-004 — Patch whitespace check

```powershell
git diff --check
```

- Result: no whitespace errors. Git may print informational LF→CRLF notices for tracked files.

## 3. Harness correction attempts

Before the successful full run, two disposable-gate attempts exposed stale regression expectations caused by the newly approved exact column grant:

1. The DB-009 catalog assertion still expected 125 grants and three Consent UPDATE columns; it was updated to expect 126 and the exact four Consent columns.
2. The CON-002 runtime privilege fixture still omitted `UPDATE:consents:withdrawn_at`; its exact expected catalog was updated.

Both attempts exited non-zero before the persistent DB-002~007 regression phase. After those harness corrections, TEST-003 completed with exit `0`. No production resource was accessed or modified.

## 4. Evidence and unexecuted scope

- Test fixture and ephemeral OIDC signing material existed only for the local test run; no key, token, DICOM payload, PHI or secret was included in this record.
- Not executed: real patient identity/legal review, future Grant-issue/withdrawal race, live PACS call, Viewer/Download and product Hospital A→MediQ→Hospital B E2E. Those remain separate acceptance gates and overall P0 remains BLOCKED.
- No remote recall of delivered or offline content was tested or promised.
