# MediQ QR Handoff Security Acceptance Test Specification

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-AT-001 |
| Document Title | QR Handoff Security Acceptance Test Specification |
| Version | 0.1.0 |
| Status | PROPOSED — TESTS NOT IMPLEMENTED OR EXECUTED |
| Owner | MediQ QA & Security |
| Related Documents | `ACCEPTANCE-TESTS.md`, all documents in `docs/architecture/qr/` |
| Last Updated | 2026-09-21 |

## 1. Test boundary

This specification defines P1 QR contract, state, concurrency, authorization, privacy and Grant-binding tests. It does not change the P0 acceptance gate. Synthetic patient, hospitals and DICOM only are permitted.

No test in this document has been implemented or executed. A future ticket must produce executable API/DB/browser/mobile/integration evidence before PASS.

## 2. Required invariants

```text
INV-QR-001  QR Scan Alone → No Transfer Grant
INV-QR-002  Expired QR → No New Claim or Approval
INV-QR-003  Rejected/Cancelled QR → No Transfer Grant
INV-QR-004  Approved Hospital B != Requested Hospital C → DENY
INV-QR-005  Approved Study X != Requested Study Y → DENY
INV-QR-006  Repeated Approval → No Duplicate Grant
INV-QR-007  Unauthenticated Scanner → No Patient Data Disclosure
INV-QR-008  VIEW Approval → PACS_IMPORT DENY
INV-QR-009  QR/Grant Success != Transfer Completion
INV-QR-010  Raw QR/PHI/Token/DICOM → Never in Audit or General Logs
```

## 3. Normal-flow tests

| Test ID | Scenario | Initial state | Action / expected API | Expected state | Expected audit |
|---|---|---|---|---|---|
| QR-AT-001 | Patient creates VIEW QR | Authorized patient/Study | POST create → 201, opaque payload | `CREATED` | `QR_REQUEST_CREATED` |
| QR-AT-002 | QR contains minimum payload | Created response | Decode QR; only allowed HTTPS origin/version/ref | unchanged | no sensitive event |
| QR-AT-003 | Hospital B claims | `CREATED`, valid B actor | POST claim → 200 | `AWAITING_PATIENT_APPROVAL` | `QR_CLAIM_SUCCEEDED` |
| QR-AT-004 | Patient views verified request | Awaiting | GET → B/actor/source/Study/action summary | unchanged | optional status view |
| QR-AT-005 | Matching Consent activation | Pending exact Consent | Existing approve Consent → 200 | Consent `ACTIVE` | `CONSENT_APPROVED` |
| QR-AT-006 | Patient approves | Awaiting, active Consent | POST approval → 202 | `GRANT_ISSUANCE_PENDING` | `QR_APPROVED`, issuance requested |
| QR-AT-007 | VIEW Grant issued | Pending, ALLOW | Worker/service issuance | `GRANT_ISSUED` | `GRANT_CREATED`, `QR_GRANT_ISSUED` |
| QR-AT-008 | Viewer access | `study:view` Grant active | Existing view action → Viewer Session | QR unchanged | Viewer audit |
| QR-AT-009 | PACS profile handoff | PACS request with valid mapping | Grant then PACS action | transfer state separate | preflight/transfer audits |
| QR-AT-010 | Patient rejects | Awaiting | POST rejection → 200 | `REJECTED` | `QR_REJECTED` |
| QR-AT-011 | Patient cancels before claim | `CREATED` | POST cancellation → 200 | `CANCELLED` | `QR_CANCELLED` |

## 4. Payload, theft and relay tests

| Test ID | Scenario | Action | Expected API/result | Expected state/audit |
|---|---|---|---|---|
| QR-AT-012 | QR photograph used by unauthenticated party | Claim without auth | 401, no details | `CREATED`; auth failure only |
| QR-AT-013 | Stolen valid ref used by authenticated Hospital C | C claims first | Claim may bind C; patient sees C and rejects | `REJECTED`; C recorded |
| QR-AT-014 | Wrong origin/version/length/ref alphabet | Submit malformed payload/ref | 400 or generic unavailable; no lookup detail | unchanged; safe denial |
| QR-AT-015 | Used QR replay | Claim again after B claim | 409/generic unavailable, no patient data | unchanged; replay/conflict audit |
| QR-AT-016 | Real-time relay | Remote valid Hospital C claims | Patient UI must show C, not physical B; approval not automatic | no Grant until explicit approval |
| QR-AT-017 | Unregistered hospital | Valid staff-like token, inactive hospital | 403/generic unavailable | `CREATED`; trust denial |
| QR-AT-018 | Disabled/expired staff account | Claim/use with invalid actor | 401/403 | no claim/use; auth audit |
| QR-AT-019 | Fake client-supplied hospital name | Claim body includes/changes hospital field | schema reject or ignore; server context wins | no destination substitution |

## 5. Binding and authorization tests

| Test ID | Scenario | Initial/action | Expected result | Expected audit |
|---|---|---|---|---|
| QR-AT-020 | Destination changes after approval | Replace B with C before issuance/action | 422/403 DENY, no Grant/STOW | binding mismatch |
| QR-AT-021 | Study changes after approval | X approval, Y issuance/action | DENY, no WADO/STOW | scope mismatch |
| QR-AT-022 | Scope expands | VIEW approval, PACS Import action | 403 `GRANT_SCOPE_DENIED` | access denied |
| QR-AT-023 | Expiry and approval simultaneous | Barrier race at deadline | Exactly one of approval or expiry commits | one terminal decision path |
| QR-AT-024 | Hospitals B/C simultaneous claim | Parallel claim transaction | Exactly one 200; loser gets safe conflict | one success, one conflict |
| QR-AT-025 | Grant worker retries after response loss | Same QR issuance twice | Same Grant returned; one DB Grant/binding | one creation, retry correlation |
| QR-AT-026 | Random reference enumeration | High-volume random refs | uniform 404/unavailable, rate limit, no timing/body disclosure | abuse audit/alert |
| QR-AT-027 | Log privacy | Run success/failure then scan logs | no raw ref, URL, PHI, UID, token, key, DICOM | audit minimization PASS only with evidence |
| QR-AT-028 | Other patient approves | Patient Y calls X request | concealed 404/403; no decision | access denied |
| QR-AT-029 | Missing matching Consent | Patient approves without ACTIVE exact Consent | 403 `QR_CONSENT_REQUIRED` | approval denied |
| QR-AT-030 | Withdrawn Consent before issuance | Withdraw after approval, before worker | no Grant; terminal failed/policy denied | consent withdrawal + grant denied |
| QR-AT-031 | Consent withdrawn after issuance | Withdraw then open Viewer/import | action DENY/revoke Grant | withdrawal/revocation/access deny |
| QR-AT-032 | Claiming actor changes | Actor D uses B's claimed request | DENY unless policy explicitly permits hospital-level recipient; profile expects actor binding | recipient mismatch |

## 6. State, idempotency and failure tests

| Test ID | Scenario | Expected result |
|---|---|---|
| QR-AT-033 | Same create idempotency key/body | Same 201 representation including original one-time payload; one request row |
| QR-AT-034 | Same key, different body | 409 `IDEMPOTENCY_CONFLICT`; no second request |
| QR-AT-035 | Duplicate approval same key | Original 202/result; one approval/outbox row |
| QR-AT-036 | Duplicate approval different key | State conflict or original decision; one Grant maximum |
| QR-AT-037 | Stale `If-Match` approval | 409 version conflict; no decision/Grant |
| QR-AT-038 | Cancel during claim | Serialized single outcome; no partial destination/session |
| QR-AT-039 | Network loss after approval commit | Retry returns committed pending/issued state; no duplicate evidence |
| QR-AT-040 | Temporary Grant service outage | Status stays pending with bounded retry; UI never reports issued |
| QR-AT-041 | Permanent policy denial | `FAILED`; no Grant; safe error and audit |
| QR-AT-042 | App loses raw payload | GET does not return it; old request cancelled/expires; new create gets new ref |
| QR-AT-043 | Expired reference after sweeper outage | Command/read path enforces expiry even without sweeper |
| QR-AT-044 | Terminal request mutation | Approve/claim/cancel on terminal state denied |

## 7. UI acceptance tests

| Test ID | UI assertion |
|---|---|
| QR-AT-045 | QR display says scan is not approval and exposes countdown/cancel |
| QR-AT-046 | Hospital waiting view has no patient identity, Study UID or thumbnail |
| QR-AT-047 | Patient final screen shows verified destination, actor, source, Study, purpose, action and expiry |
| QR-AT-048 | VIEW and PACS_IMPORT consequences are distinct and PACS is not preselected |
| QR-AT-049 | Backgrounding mobile immediately shows privacy screen and hides recent-app snapshot |
| QR-AT-050 | Timeout/network failure never renders approved/issued/transferred optimistically |
| QR-AT-051 | Accessibility: screen reader, focus order, dynamic text, non-color state cues |

## 8. Data and database tests

| Test ID | Assertion |
|---|---|
| QR-AT-052 | `request_ref_hash` unique and raw reference absent from DB |
| QR-AT-053 | One successful destination binding under concurrent claims |
| QR-AT-054 | One decision row per request |
| QR-AT-055 | One request↔Grant binding and one Grant under concurrent workers |
| QR-AT-056 | Approval snapshot hash changes on any patient/source/destination/Study/action/Consent change and issuance fails |
| QR-AT-057 | Audit/outbox commit atomically with state transition |
| QR-AT-058 | QR terminal evidence retained while transient reference cannot be recovered |

## 9. Requirement traceability

| Requirement ID | Contract/UI field | State/control | Threat | Test |
|---|---|---|---|---|
| QR-FUN-001 Create request | POST create, `studyRefId`, action | `CREATED` | T02/T15 | AT-001/002/033 |
| QR-FUN-002 Hospital claim | POST claims | atomic first claim | T05/T06/T12 | AT-003/016/017/024 |
| QR-FUN-003 Patient approval | approval + Consent version | awaiting→approved | T08/T09/T10 | AT-004/006/020/021 |
| QR-SEC-001 Minimal payload | HTTPS ref only | hash-at-rest | T01/T02/T15 | AT-002/012/027/052 |
| QR-SEC-002 Authentication | Bearer/DPoP contexts | deny by default | T06/T07/T14 | AT-012/017/018/026 |
| QR-SEC-003 Expiry | server deadlines | `EXPIRED` | T04/T11 | AT-023/043 |
| QR-SEC-004 Replay | idempotency/unique binding | one claim/decision/Grant | T04/T12/T13 | AT-015/024/025/033-036 |
| QR-SEC-005 Binding | approval snapshot | exact recipient/resource/action | T09/T10 | AT-020-022/056 |
| QR-SEC-006 Privacy | minimized API/UI/logs | concealment/redaction | T14/T15 | AT-026/027/046 |
| QR-GRT-001 Separate Grant | internal issuance | pending→issued | T13 | AT-006/007/025 |
| QR-GRT-002 Consent current | `consentId/version` | revalidate before issue/use | T09/T10 | AT-029-031 |
| QR-UX-001 Informed decision | verified summary | explicit approve/reject | T05/T08 | AT-016/045-050 |

## 10. Required execution layers

- Domain/unit tests for transition guards and mapping.
- PostgreSQL integration tests with concurrent transactions and constraints.
- API contract tests generated/validated from future P1 OpenAPI.
- Mobile UI tests for state, privacy and error handling.
- Browser/Playwright tests for authenticated scanner and data minimization.
- Security tests for enumeration, replay, IDOR/BOLA, binding and log leakage.
- End-to-end synthetic flow through existing Viewer and Test Orthanc A/B PACS Import.

## 11. Evidence required for PASS

PASS requires test command/version, environment, timestamp, result artifact, relevant logs with redaction, database constraint evidence and traceability to the exact document/OpenAPI version. Design review alone is not PASS.

Current result: **NOT RUN / NOT IMPLEMENTED**.

