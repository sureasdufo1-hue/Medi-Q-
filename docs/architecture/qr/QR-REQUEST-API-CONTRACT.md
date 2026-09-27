# MediQ QR Handoff Request API Contract

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-API-001 |
| Document Title | QR Handoff Request API Contract |
| Version | 0.1.0 |
| Status | PROPOSED — not merged into `OPENAPI.yaml` |
| Owner | MediQ API & Security |
| Related Documents | `OPENAPI.yaml`, `MOBILE-API-CONTRACT.md`, `QR-PAYLOAD-FORMAT.md`, `QR-REQUEST-STATE-MODEL.md` |
| Last Updated | 2026-09-21 |

## 1. Compatibility profile

- Base URL: existing `https://localhost:8443/api/v1` profile.
- Proposed base path: `/qr-handoff`.
- Media type: `application/json`.
- Reuse existing `bearerAuth`, `X-Correlation-ID` and `ErrorResponse` semantics.
- Patient mobile commands use the selected Mobile DPoP profile after device registration.
- Hospital Web uses an OIDC workforce token; tenant, hospital and actor are derived from verified server context.
- `requestId`, QR reference, Study UID and display URL are not authorization credentials.
- Sensitive responses use `Cache-Control: no-store, private`.
- This document is design input for a future separate P1 OpenAPI file; current P0 `OPENAPI.yaml` is unchanged.

## 2. Common headers

| Header | Use |
|---|---|
| `Authorization` | Required; Bearer or DPoP profile according to client |
| `DPoP` | Required for registered patient mobile sensitive requests |
| `X-Correlation-ID` | Optional UUID; server creates if absent |
| `Idempotency-Key` | Required UUID for every POST command |
| `If-Match` | Required on approve/reject/cancel; strong ETag from latest state |
| `ETag` | Returned on request state resources |
| `Retry-After` | Returned for 202, 429 or transient 503 where applicable |

Tokens, QR references and Consent/Grant values must not appear in URL query parameters.

## 3. Endpoint inventory

| Operation ID | Method/path | Actor | Purpose | State |
|---|---|---|---|---|
| `createQrHandoffRequest` | `POST /qr-handoff/requests` | Patient | Create one Study/one action request | PROPOSED |
| `getQrHandoffRequest` | `GET /qr-handoff/requests/{requestId}` | Patient or claimant | Poll authorized safe state view | PROPOSED |
| `claimQrHandoffRequest` | `POST /qr-handoff/claims` | Hospital staff | Atomically claim decoded reference | PROPOSED |
| `approveQrHandoffRequest` | `POST /qr-handoff/requests/{requestId}/approvals` | Patient | Record explicit approval and queue grant issuance | PROPOSED |
| `rejectQrHandoffRequest` | `POST /qr-handoff/requests/{requestId}/rejections` | Patient | Reject request | PROPOSED |
| `cancelQrHandoffRequest` | `POST /qr-handoff/requests/{requestId}/cancellations` | Patient | Cancel before Grant issuance | PROPOSED |

Grant issuance is backend orchestration, not a scanner-callable QR endpoint. The claimant uses existing Viewer or PACS Import actions only after a bound Grant exists.

## 4. Create request

```http
POST /api/v1/qr-handoff/requests
Authorization: DPoP {patient-access-token}
DPoP: {proof}
Idempotency-Key: 7a280976-a120-4f23-bdd2-a084ff22569c
Content-Type: application/json
```

```json
{
  "studyRefId": "c31fe8a9-f94f-43bc-a4ac-7d04d22f2670",
  "requestedAction": "VIEW",
  "purposeCode": "TREATMENT"
}
```

The client cannot submit patient, tenant or source hospital as trusted fields. The server derives patient ownership from authentication and resolves source hospital/Study from `studyRefId`.

Success `201 Created`:

```json
{
  "requestId": "e5bcce85-a98e-4c08-bd40-a7c2446db159",
  "status": "CREATED",
  "version": 1,
  "qrPayload": "https://q.mediq.example/v1/h/OPAQUE_43_CHAR_REFERENCE_EXAMPLE_ONLY_1234",
  "displayReference": "M7K4Q2",
  "qrExpiresAt": "2026-09-21T09:05:00Z",
  "pollAfterSeconds": 2
}
```

`qrPayload` is returned only in the first successful response and idempotent replays of that response. It is never returned by GET.

Validations: authenticated patient, server-owned PatientReference, authorized Study/source relationship, one supported action, active-request limit, no terminal duplicate. Audit: `QR_REQUEST_CREATED`.

## 5. Claim request

```http
POST /api/v1/qr-handoff/claims
Authorization: Bearer {hospital-workforce-token}
Idempotency-Key: b8f42cb8-03b7-4c10-b95c-fac85f70ed73
Content-Type: application/json
```

```json
{
  "requestRef": "7lZp4lCscX1kRCr5DMu1xIYwUoYMc8vSzQdPi9rWw0A"
}
```

The request body has no hospital/tenant/staff ID. Server context supplies all three.

Success `200 OK`:

```json
{
  "requestId": "e5bcce85-a98e-4c08-bd40-a7c2446db159",
  "status": "AWAITING_PATIENT_APPROVAL",
  "version": 3,
  "displayReference": "M7K4Q2",
  "approvalExpiresAt": "2026-09-21T09:08:12Z",
  "requestedAction": "VIEW",
  "pollAfterSeconds": 2
}
```

Before patient approval, the hospital response excludes patient identity, Study UID, modality, source hospital and clinical details. It may display the non-sensitive action and pairing code.

Validation: reference format/hash, unexpired `CREATED`, authenticated active staff, registered active hospital, valid tenant context, rate limit. Atomic effects: claim, immutable destination binding, ExchangeSession creation, safe approval summary preparation, audit/outbox. A second hospital cannot claim.

## 6. Get authorized state

```http
GET /api/v1/qr-handoff/requests/{requestId}
Authorization: {actor token}
If-None-Match: "qr-3"
```

Patient owner view may include the verified approval summary:

```json
{
  "requestId": "e5bcce85-a98e-4c08-bd40-a7c2446db159",
  "status": "AWAITING_PATIENT_APPROVAL",
  "version": 3,
  "displayReference": "M7K4Q2",
  "sourceHospital": {"displayName": "Hospital A Test"},
  "destinationHospital": {"displayName": "Hospital B Test"},
  "requestingActor": {"displayName": "Synthetic Doctor", "role": "PHYSICIAN"},
  "study": {"studyRefId": "c31fe8a9-f94f-43bc-a4ac-7d04d22f2670", "modality": "CT", "studyDate": "2026-09-20"},
  "requestedAction": "VIEW",
  "purposeCode": "TREATMENT",
  "consent": {"consentId": "f695b454-d781-4189-950d-c85034524388", "version": 1, "status": "PENDING"},
  "approvalExpiresAt": "2026-09-21T09:08:12Z"
}
```

Hospital claimant view is minimized before Grant issuance and never includes local patient identifiers. Unrelated actors receive `404` to conceal existence. Unchanged resources may return `304 Not Modified`.

Polling profile: 2 seconds for the first 10 seconds, then 5 seconds; stop at terminal state or deadline. SSE is deferred.

## 7. Approve request

Consent approval remains a separate existing action. The QR approval call references the exact ACTIVE Consent/version shown to the patient.

```http
POST /api/v1/qr-handoff/requests/{requestId}/approvals
Authorization: DPoP {patient-access-token}
DPoP: {proof}
Idempotency-Key: bd9e3ef8-926e-4d8d-a62d-887695c6f0ea
If-Match: "qr-3"
```

```json
{
  "consentId": "f695b454-d781-4189-950d-c85034524388",
  "consentVersion": 1,
  "displayReference": "M7K4Q2",
  "confirmedAction": "VIEW"
}
```

Success `202 Accepted`:

```json
{
  "requestId": "e5bcce85-a98e-4c08-bd40-a7c2446db159",
  "status": "GRANT_ISSUANCE_PENDING",
  "version": 5,
  "pollAfterSeconds": 2
}
```

Required checks: patient auth/ownership, recent server-verifiable reauthentication, state/version/deadline, destination/actor/source/Study/action snapshot match, ACTIVE matching Consent, device/session policy. Approval never accepts replacement destination, Study or scope fields.

## 8. Reject and cancel

```http
POST /api/v1/qr-handoff/requests/{requestId}/rejections
POST /api/v1/qr-handoff/requests/{requestId}/cancellations
```

Both require patient DPoP authentication, `Idempotency-Key` and `If-Match`. Optional body permits only a safe enum reason such as `NOT_MY_REQUEST`, `WRONG_HOSPITAL`, `NO_LONGER_NEEDED`; free-text PHI is prohibited.

- Reject is allowed only from `AWAITING_PATIENT_APPROVAL`.
- Cancel is allowed from `CREATED`, `CLAIMED` or `AWAITING_PATIENT_APPROVAL`.
- Neither is allowed once a Grant binding exists.
- Success returns `200` with terminal state and version.

## 9. Grant result view

When state is `GRANT_ISSUED`, authorized views return only identifiers and scope needed for the next action:

```json
{
  "requestId": "e5bcce85-a98e-4c08-bd40-a7c2446db159",
  "status": "GRANT_ISSUED",
  "version": 7,
  "exchangeSessionId": "d51c2b0a-ab63-41bb-981f-5420bb966e2b",
  "grant": {
    "grantId": "a74b0371-fbd8-48e6-81e3-6335f502a06e",
    "scope": "study:view",
    "expiresAt": "2026-09-21T09:23:15Z"
  }
}
```

The Grant ID is not a bearer credential. Existing action endpoints must still authenticate, authorize and match recipient/resource/scope.

## 10. Error contract

Reuse `ErrorResponse {code,message,correlationId,details}` with non-sensitive details only.

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `QR_PAYLOAD_INVALID` | Format/version invalid |
| 401 | `AUTHENTICATION_REQUIRED` | Invalid/missing user authentication |
| 403 | `QR_REQUEST_OWNERSHIP_DENIED` | Authenticated but not authorized; external views may map to 404 |
| 403 | `QR_HOSPITAL_NOT_TRUSTED` | Hospital context not active/registered |
| 403 | `QR_CONSENT_REQUIRED` | Matching ACTIVE Consent absent |
| 403 | `QR_AUTHORIZATION_DENIED` | Current policy denied |
| 404 | `QR_REQUEST_UNAVAILABLE` | Unknown, expired or concealed request for scanner |
| 409 | `QR_REQUEST_ALREADY_CLAIMED` | Another claim committed; no identity details |
| 409 | `QR_REQUEST_STATE_CONFLICT` | Invalid transition |
| 409 | `QR_REQUEST_VERSION_CONFLICT` | `If-Match` stale |
| 409 | `IDEMPOTENCY_CONFLICT` | Key reused with different command/body |
| 410 | `QR_REQUEST_EXPIRED` | Authorized owner view of expired request |
| 422 | `QR_BINDING_MISMATCH` | Consent/destination/Study/action snapshot mismatch |
| 429 | `QR_RATE_LIMITED` | Rate limit exceeded |
| 503 | `QR_GRANT_ISSUANCE_UNAVAILABLE` | Temporary orchestration failure; safe retry status |

Scanner-facing unknown/expired/tampered cases should converge on a generic response to reduce existence probing.

## 11. Idempotency and rate-limit profile

| Operation | Proposed limit | Idempotency |
|---|---:|---|
| Create | 5/min patient+device; max 3 active | Required |
| Claim | 10/min actor, 60/min hospital, adaptive abuse control | Required |
| Approve/reject/cancel | 5/min patient+request | Required plus `If-Match` |
| Status | Profiled polling; 30/min actor+request | GET naturally idempotent, ETag supported |

Values are proposed test defaults, not validated production limits and not substitutes for authorization.

## 12. Audit mapping

| API | Success event | Denial/failure event |
|---|---|---|
| Create | `QR_REQUEST_CREATED` | `QR_REQUEST_CREATE_DENIED` |
| Claim | `QR_CLAIM_SUCCEEDED` | `QR_CLAIM_DENIED` |
| Get | optional sampled `QR_STATUS_VIEWED` | `ACCESS_DENIED` |
| Approve | `QR_APPROVED`, `QR_GRANT_ISSUANCE_REQUESTED` | `QR_APPROVAL_DENIED` |
| Reject | `QR_REJECTED` | `QR_DECISION_DENIED` |
| Cancel | `QR_CANCELLED` | `QR_CANCELLATION_DENIED` |
| Internal grant | `QR_GRANT_ISSUED` + existing `GRANT_CREATED` | `QR_GRANT_FAILED` + `GRANT_DENIED` |

Audit includes actor, tenant, resource UUID, outcome, timestamp, correlation ID and safe reason code; never raw QR reference.

## 13. Proposed persistence requirements

No migration is performed by this design. A future schema ticket should add:

### `qr_handoff_requests`

```text
request_id UUID PK
request_ref_hash BYTEA UNIQUE NOT NULL
patient_ref_id UUID NOT NULL
source_hospital_id UUID NOT NULL
study_ref_id UUID NOT NULL
requested_action VARCHAR(32) NOT NULL
purpose_code VARCHAR(32) NOT NULL
status VARCHAR(40) NOT NULL
destination_tenant_id UUID NULL
destination_hospital_id UUID NULL
claiming_actor_id UUID NULL
exchange_session_id UUID UNIQUE NULL
display_reference_hash BYTEA NOT NULL
qr_expires_at TIMESTAMPTZ NOT NULL
approval_expires_at TIMESTAMPTZ NULL
claimed_at/approved_at/rejected_at/cancelled_at/terminal_at TIMESTAMPTZ NULL
version INTEGER NOT NULL
created_at/updated_at TIMESTAMPTZ NOT NULL
```

### `qr_handoff_approvals`

```text
approval_id UUID PK
request_id UUID UNIQUE NOT NULL
patient_actor_id UUID NOT NULL
consent_id UUID NOT NULL
consent_version INTEGER NOT NULL
approved_snapshot_hash BYTEA NOT NULL
decision VARCHAR(16) NOT NULL
decided_at TIMESTAMPTZ NOT NULL
```

### `qr_grant_bindings`

```text
request_id UUID UNIQUE NOT NULL
approval_id UUID UNIQUE NOT NULL
grant_id UUID UNIQUE NOT NULL
binding_hash BYTEA NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

Also required: command idempotency records and transactional outbox, whether shared or QR-specific. Raw QR references, DICOM, PHI, tokens and keys are excluded.

## 14. OpenAPI integration

Future work should add `docs/openapi/mediq-qr.yaml` or another repository-approved P1 module and reuse core schemas through reviewed `$ref` composition. It must pass OAS 3.1 lint, generated client checks, authorization-negative contract tests and path/schema compatibility review before implementation.

