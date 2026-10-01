# MEDIQ-GRT-003 Implementation Report

| Item | Value |
|---|---|
| Ticket | `MEDIQ-GRT-003` |
| Title | Consent-bound idempotent Grant issue API |
| Classification | `CAPSTONE-P0` |
| Date | `2026-10-01` |
| Status | `PASS — scoped issue API and exact runtime DB boundary` |

## 1. Goal

Issue a short-lived, exact-resource TransferGrant only to the verified destination Session requester after rechecking Consent, Session and ImagingPackage facts. Make retries safe and persist Grant, scopes and success Audit atomically.

## 2. Scope

### Included

- `POST /exchange-sessions/{sessionId}/grants/issue` under verified IAM-002 `USER`/Tenant transaction context.
- Caller must be the exact Session requester Actor at the Session destination Hospital; recipient Tenant/Hospital/Actor are derived server-side.
- Active, unwithdrawn, unexpired Consent; exact Session/Patient/source/destination/package facts; Consent-action-to-scope mapping; expiry cap `min(now + 30 minutes, Session expiry, Consent expiry)`.
- Actor-scoped UUID `Idempotency-Key`, persistent uniqueness and safe semantic replay/conflict behavior.
- Atomic Grant + Scope + `AUTHORIZATION_GRANTED`/`GRANT_CREATED` success Audit; minimized verified-context denial Audit.
- Additive nullable idempotency key migration and exactly 18 new column privileges: 13 Grant INSERT + 3 GrantScope INSERT + 2 Grant SELECT; persistent inventory 144, forced RLS retained.
- Recommendation and decision `GRT-003-DEC-001`, requirements/security/traceability and all 26 API/DB Acceptance cases were recorded before implementation.

### Excluded

- Post-issuance object/action Authorization and operation-time Consent/Grant revalidation; Viewer, Download, WADO-RS, DICOM payload, PACS Import/STOW and Mandatory Preflight.
- Grant revocation/remote recall, legal identity/consent effect, workforce role administration, global Audit completeness and A→MediQ→B completion.

## 3. Traceability

| Type | IDs / document | Evidence |
|---|---|---|
| Decision | `GRT-003-DEC-001`, `PDEC-001` | Recommendation-first scope, considered alternatives and security rationale |
| Requirements | `REQ-GRT-001~007` | `TC-GRT-003-API-001~020`, `TC-GRT-003-DB-001~006` |
| Security | `SEC-GRANT-001~008`, `SEC-DB-005/006`, `SEC-AUD-001~006` | Deny-by-default, exact privilege and atomic Audit evidence |
| Threat | `THR-005/006/041` | Consent/resource/recipient substitution, replay and partial persistence |
| API/Domain | `OPENAPI.yaml`, Grant issue service, `DATA-MODEL.md`, `ERD.md` | Contract and persistence consistency |
| Regression | DB-008 | Clean/reapply migration, RLS, exact privileges and DB-002~007 regressions |

## 4. Implementation result

The endpoint derives issuer identity from verified IAM context and requires the caller to be the exact requester Actor at the Session destination Hospital. It rejects caller-supplied recipient/expiry properties. Before issue it verifies `CONSENTED` Session state, current Consent and allowed actions, exact active retained Package and its Study references. The mapping is strictly `VIEW↔study:view`, `DOWNLOAD↔study:download`, and `PACS_IMPORT↔study:pacs-transfer`.

Server expiry is capped at 30 minutes and at Session/Consent expiry. A repeated semantic request for the same Tenant/Actor/key resolves to the existing Grant; key reuse for another scope conflicts. Parent Grant, scopes and success Audit events share the verified transaction. Injected Scope or Audit persistence failures roll back the operation. This endpoint creates an authorization metadata artifact only; it does not grant operation-time Viewer/Download/PACS access and causes no PACS side effect.

## 5. Changed areas

| Area | Change |
|---|---|
| Decision/requirements/security | GRT-003 recommendation, requirement, threat and 26 Acceptance cases |
| API | Grant issue service/controller wired within Consent module; OpenAPI updated |
| Persistence | Nullable key, Actor CHECK/partial unique index, exact runtime column grants and repository lookup/insert |
| Test harness | API unit tests, signed-OIDC/PostgreSQL/RLS integration, DB-008 runner/AUT exact inventory, DB-005 forward-compatible regression |
| Data and execution docs | Data Model, ERD, plan, Acceptance, implementation index and Ticket evidence |

See [TEST-EVIDENCE.md](TEST-EVIDENCE.md) for exact commands and observed results.

## 6. Security and privacy impact

- Synthetic/test identities and rows only. No DICOM payload, real patient data, credential or secret was added.
- Recipient and expiry are not caller-authoritative; Grant binds to verified Actor and exact Package.
- Persistent runtime privilege inventory is exactly 144 column-privilege rows (baseline 126 + 18 specified columns). No table-wide, `PUBLIC`, default, DDL, DELETE, TRUNCATE or broad UPDATE privilege was introduced.
- Forced RLS remains enabled. Cross-Tenant HTTP issue is denied without writing a Grant or Audit into the destination Tenant.
- A Grant ID or idempotency key is not a bearer credential. Later operation-time Authorization and Mandatory Preflight remain mandatory.

## 7. Verification status

| Verification | Result |
|---|---|
| `npm run typecheck:api` | PASS |
| `npm run test:api -- --reporter=dot` | PASS — 23 files, 442 tests |
| `npm run db:migrations:check` | PASS |
| `./scripts/test-db-008-full-schema.ps1` | PASS — clean and reset/reapply runs; GRT-003 live integration 8/8 TAP on each run; DB-002~007 regressions and ephemeral cleanup PASS |

The first full-gate attempt found the historical DB-005 test harness still hard-coded its pre-migration Grant column/index/check inventory. This was a test-harness compatibility defect, not a product-schema failure. DB-005 was updated for the additive nullable key and its associated index/check; the complete clean rerun passed.

## 8. Risks and follow-up

- The 30-minute limit is a synthetic P0 default; production duration needs a separate recommendation and approval record.
- GRT-003 does not resolve Grant revocation/operation races or prove downstream operation-time enforcement.
- The issue Audit evidence is route-scoped, not proof of global Audit completeness or legal non-repudiation.
- Next recommended ticket is `MEDIQ-GRT-004` Grant revocation; its recommendation, scope and Acceptance must be recorded before implementation. Full P0 remains incomplete.

## 9. Final disposition

```text
Ticket: MEDIQ-GRT-003
Scope: Consent-bound, exact-Package, actor-scoped Grant issue API
Changed: API, migration/privileges, tests, DB harness, contract/security/data docs and evidence
Not changed: Viewer/Download/PACS use, revocation, Mandatory Preflight, A→B E2E
Security impact: Exact recipient/resource/scope, idempotent atomic Audit; 144 least-privilege rows with forced RLS
Tests executed: API typecheck; API 23 files/442 tests; migration check; full DB-008 clean/reset-reapply + DB-002~007 regressions
Tests not executed: Operation-time Authorization, Viewer/Download/PACS, actual A→B E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Operation-time Grant enforcement/revocation, global Audit and complete P0 integration
Status: PASS (scoped Ticket only; overall P0 remains incomplete)
```
