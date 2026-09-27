# MediQ QR Handoff Expiry and Replay Policy

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-RPL-001 |
| Document Title | QR Handoff Expiry, Idempotency and Replay Policy |
| Version | 0.1.0 |
| Status | PROPOSED — values require validation |
| Owner | MediQ Security & Backend |
| Related Documents | `SECURITY-REQUIREMENTS.md`, `QR-PAYLOAD-FORMAT.md`, `QR-REQUEST-STATE-MODEL.md` |
| Last Updated | 2026-09-21 |

## 1. Time-window separation

| Window | Current baseline | Proposed P1 default | Validated | Rationale |
|---|---|---:|---:|---|
| QR Request TTL | Not specified | 5 minutes from creation | No | Short exposure with workable in-person scan time |
| Scan Claim acquisition | Not specified | Atomic request; HTTP processing max 30 seconds | No | No detachable claim token |
| Patient Approval Window | Not specified | 5 minutes from successful claim | No | Gives patient time to inspect verified destination |
| `study:view` Grant TTL | Existing short-lived rule, no fixed number | 15 minutes | No | Viewer startup/use without durable access |
| `study:pacs-transfer` Grant TTL | Existing expiry required | 30 minutes | No | Preflight and transfer startup allowance |
| Transfer Job Deadline | Existing session policy only | 60 minutes after authorized start | No | Bounded retries; not the Grant TTL |

These are student P1 test-profile proposals, not production clinical policy. Usability tests, threat review and hospital workflow measurement must validate them before approval.

## 2. Authoritative time

- Server UTC time is authoritative for every transition.
- Client countdown is display-only and must account for the response `Date` header or server timestamp.
- Clock skew does not extend server expiry.
- Database conditions use one transaction timestamp source.
- A request crossing expiry concurrently with approval or claim has one serialized outcome; no grace period is silently added.

## 3. Claim model

The selected model is **First Valid Scanner Claims Request**.

A valid scanner must be:

- an authenticated active medical staff actor;
- operating under a server-derived active tenant/hospital context;
- authorized to request the selected action;
- within rate and abuse controls.

The first committed conditional update binds destination. Later scanners cannot join, replace or queue for patient selection. This reduces multi-scanner disclosure and state complexity. The residual risk of a malicious but authenticated hospital claiming first is addressed by explicit patient verification/rejection and audit, not hidden by the QR protocol.

## 4. One-time rules

```text
One QR reference
→ at most one successful hospital claim
→ at most one patient decision
→ at most one approval record
→ at most one QR-bound Transfer Grant
```

The QR reference is consumed for claim when `CREATED → CLAIMED` commits. It cannot be used to claim again even if patient later rejects, cancels or the Grant fails.

## 5. Replay controls

| Layer | Control |
|---|---|
| QR reference | 256-bit random, hash-at-rest, one successful claim, short TTL |
| Authentication | OIDC issuer/audience/expiry validation; DPoP on registered patient mobile profile |
| DPoP | `jti`, `iat`, `htm`, `htu`, `ath`, nonce and replay cache per mobile contract |
| Command | Mandatory `Idempotency-Key`, actor/operation/target/body-hash binding |
| State | Conditional update plus `version`/strong `ETag` |
| Approval | One unique decision row and immutable snapshot hash |
| Grant | Unique QR request↔Grant binding, `jti`, recipient/resource/action/expiry binding |
| Action | Existing authorization and scope verification on every Viewer/transfer call |

Rate limits reduce abuse but are not replay prevention or authorization.

## 6. Refresh and regeneration

- Refreshing the same display screen does not generate another QR.
- Repeating create with the same `Idempotency-Key` and same body returns the original create response.
- The raw reference is not recoverable through GET.
- If the app loses it, the patient cancels the old request if reachable and creates a new request.
- A new request gets a new reference and `requestId`; the old request is never reactivated.
- A terminal request cannot return to `CREATED`.

## 7. Idempotency record

A command record minimally binds:

```text
idempotency_key
authenticated_actor_id
tenant_id
operation_id
target_resource_id
canonical_request_hash
result_status
response_hash/reference
created_at
expires_at
```

Suggested retention is at least the longest QR/Grant/job retry window plus operational margin; the exact retention is an OPEN DECISION. Records contain no raw token, QR reference, PHI or DICOM.

## 8. Atomic Grant issuance

Approval transaction:

```text
conditional request state update
+ immutable approval decision/snapshot hash
+ audit QR_APPROVED
+ outbox QR_GRANT_ISSUANCE_REQUESTED
COMMIT
```

Grant issuance transaction:

```text
lock QR request/binding
+ revalidate current Consent/Authorization/bindings
+ insert TransferGrant and scope
+ insert unique qr_grant_binding
+ update QR request GRANT_ISSUED
+ audit GRANT_CREATED and QR_GRANT_ISSUED
COMMIT
```

If the response or worker acknowledgement is lost, retry detects the unique binding and returns the same Grant. It never inserts another Grant.

## 9. Expiry processing

Expiry is enforced lazily on every read/command and proactively by a scheduled sweeper. Correctness must not depend on the sweeper running.

```text
server_now >= applicable_expiry
AND state is expiry-eligible
→ conditionally mark EXPIRED
→ append QR_EXPIRED audit
→ deny claim/approval/grant issuance
```

Expiry does not delete audit or decision evidence. Raw QR references were never stored.

## 10. Relay limitation

Short TTL, one-time claim and pairing codes do not fully prevent real-time relay. An attacker with an authenticated hospital account can relay the QR and attempt a remote claim during the valid window. Required compensating controls are:

- independently verified destination/actor/purpose/action shown to patient;
- explicit patient confirmation after claim;
- optional comparison of the same short display reference on both screens;
- hospital trust and actor monitoring;
- alerting on unusual location/tenant/claim patterns;
- immediate reject/cancel path.

No documentation or UI may claim that QR proximity is cryptographically proven.

