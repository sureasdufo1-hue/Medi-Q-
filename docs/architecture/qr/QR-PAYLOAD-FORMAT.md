# MediQ QR Handoff Payload Format

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-PAY-001 |
| Document Title | QR Handoff Payload Format |
| Version | 0.1.0 |
| Status | PROPOSED — CAPSTONE-P1 Design Baseline |
| Owner | MediQ Architecture & Security |
| Related Documents | `QR-HANDOFF-OVERVIEW.md`, `QR-EXPIRY-AND-REPLAY-POLICY.md`, `MOBILE-API-CONTRACT.md` |
| Last Updated | 2026-09-21 |

## 1. Security classification

The QR payload is a short-lived **pairing capability**, not an access token. It is assumed observable, photographable, copyable, relayable and loggable by untrusted software.

Possession permits only an authenticated, registered hospital actor to attempt an atomic claim. It grants no patient data, Consent, Transfer Grant, Viewer Session or DICOM access.

## 2. Selected wire format

The initial payload is a UTF-8 HTTPS universal link in QR byte mode.

```text
https://q.mediq.example/v1/h/{requestRef}
```

Production host configuration is environment-specific. Clients must validate an allowlisted HTTPS origin and exact path shape before calling the API.

### 2.1 ABNF-style profile

```text
payload     = "https://" qr-host "/v1/h/" request-ref
request-ref = 43base64url-char
```

`requestRef` is 32 cryptographically random bytes encoded as unpadded Base64url, yielding 43 ASCII characters. UUIDs, sequential IDs and patient-derived values are prohibited.

### 2.2 Size and encoding

| Property | Rule |
|---|---|
| Character set | UTF-8; selected payload is ASCII subset |
| Encoding | QR byte mode |
| Maximum payload | 256 UTF-8 bytes |
| Version | Path segment `v1` |
| Compression | None |
| Query parameters | Prohibited in v1 |
| Fragment | Prohibited |

## 3. Excluded content

The payload must not contain:

- patient name, date of birth, resident registration number or local patient ID;
- MediQ `patientRefId`;
- Study/Series/SOP Instance UID or `studyRefId`;
- source/destination hospital identifier or staff identifier;
- DICOM metadata, pixels or rendered image;
- access/refresh/download token, cookie or session identifier;
- Consent, Transfer Grant or Viewer Session;
- DEK, KEK, private key, password or PACS credential;
- requested action, clinical purpose or diagnosis.

Expiry is not encoded in v1. The patient app displays server-provided expiry, and the server is authoritative. This avoids stale client-side expiry claims and minimizes payload data.

## 4. Reference generation and storage

1. Generate 32 random bytes using an operating-system CSPRNG.
2. Base64url-encode without padding.
3. Return the raw reference exactly once in the create response as part of `qrPayload`.
4. Store only `SHA-256(requestRef)` in `qr_handoff_requests.request_ref_hash`.
5. Compare hashes in constant-time after format and size validation.
6. Never write raw payload/reference to application, proxy, analytics or audit logs.

If the patient app loses the one-time response, it cancels or abandons the old request and creates a new one. The server does not recover or redisplay the raw reference.

## 5. URL handling

### Official Hospital Portal scanner

The scanner decodes locally, validates the origin/path, extracts `requestRef`, and sends it in the authenticated claim request body. It must not navigate a browser to the QR URL.

### General camera

If opened in a general browser, the QR origin returns only a generic MediQ handoff landing page:

- no patient, Study, hospital or request-state disclosure;
- no automatic claim;
- `Cache-Control: no-store, private`;
- `Referrer-Policy: no-referrer`;
- no third-party scripts, pixels or analytics;
- strict CSP and no URL reflection into DOM or logs;
- invitation to use the authenticated Hospital Portal.

## 6. Signature/MAC decision

V1 does not embed a JWS, signature or MAC. The 256-bit random reference is looked up against authoritative server state, while claim requires authenticated hospital context and patient approval.

Rationale:

- an embedded signature does not prevent photography or real-time relay;
- self-contained claims would expose more metadata;
- server lookup is already required for expiry, claim and state validation;
- key rotation and payload growth are avoided.

The reference remains unguessable and transient. Tampered or unknown references return the same non-enumerating unavailable response.

## 7. Scanner validation

Before network submission, clients enforce:

```text
scheme == https
host in configured allowlist
path version == v1
type segment == h
requestRef matches ^[A-Za-z0-9_-]{43}$
total UTF-8 length <= 256
no username/password, query or fragment
```

Client validation is defense in depth. The server repeats all validation and is authoritative.

## 8. Safe example

```text
https://q.mediq.example/v1/h/7lZp4lCscX1kRCr5DMu1xIYwUoYMc8vSzQdPi9rWw0A
```

This is documentation-only and must never be accepted in a real environment.

## 9. Versioning

- Unknown major versions are rejected with `QR_PAYLOAD_VERSION_UNSUPPORTED`.
- V1 parsers reject extra fields and unexpected path segments.
- A new major version requires contract, threat-model and acceptance-test updates.
- Payload version does not imply API or Transfer Grant version.

## 10. Logging and telemetry

Allowed:

- request UUID after authenticated resolution;
- first 8 bytes of `SHA-256(requestRef)` only in restricted diagnostic correlation when necessary;
- outcome, reason code, actor, tenant, hospital and timestamp under audit minimization rules.

Prohibited:

- raw URL/reference;
- camera frame or QR bitmap;
- full request-reference hash in general logs;
- patient/Study metadata in QR scanner telemetry.

