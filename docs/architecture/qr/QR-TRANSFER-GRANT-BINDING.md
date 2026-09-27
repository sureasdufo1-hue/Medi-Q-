# MediQ QR Handoff Transfer Grant Binding

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-GRT-001 |
| Document Title | QR Approval to Transfer Grant Binding Contract |
| Version | 0.1.0 |
| Status | PROPOSED — CAPSTONE-P1 Design Baseline |
| Owner | MediQ Domain, Authorization & Security |
| Related Documents | `DOMAIN-MODEL.md`, `DATA-MODEL.md`, `OPENAPI.yaml`, `QR-REQUEST-STATE-MODEL.md` |
| Last Updated | 2026-09-21 |

## 1. Separation rule

```text
QR claimed
→ patient approved
→ matching Consent active
→ current Authorization ALLOW
→ Transfer Grant issued
```

Each arrow is a separate decision/evidence boundary. QR request, scan claim or approval record must not be accepted by Viewer Gateway, DICOM Gateway or Transfer Orchestrator as a Grant.

## 2. Binding snapshot

The approval screen and Grant issuance use the same immutable binding snapshot:

| Binding | Source |
|---|---|
| patient reference | Authenticated patient context and QR request |
| source hospital | Server-resolved Study reference |
| destination tenant/hospital | Authenticated successful scanner context |
| requesting actor | Authenticated successful scanner context |
| Study reference | Patient-selected server resource |
| requested action | QR request enum |
| purpose | QR request policy code |
| Consent ID/version | Exact ACTIVE Consent shown/confirmed |
| QR request ID | Server UUID, not raw reference |
| approval ID | Immutable patient decision evidence |

A canonical serialization of these fields is hashed as `approved_snapshot_hash`. Grant issuance recomputes and compares it. Mismatch fails closed and requires a new QR request.

## 3. Action mapping

| QR action | Required Consent action | Grant scope | Permitted next action |
|---|---|---|---|
| `VIEW` | `VIEW` | `study:view` | Existing Viewer authorization/session creation |
| `PACS_IMPORT` | `PACS_IMPORT` | `study:pacs-transfer` | Existing mandatory preflight and STOW-RS workflow |

No union, wildcard or implied scope is permitted. One request produces one scope. `study:view` cannot call PACS Import, and `study:pacs-transfer` does not imply download or mobile export.

## 4. Grant issuance checks

Immediately before insert, the backend verifies:

1. QR state is `GRANT_ISSUANCE_PENDING` and approval window was valid when decision committed.
2. Patient/owner and approval evidence match.
3. ExchangeSession exists and is not terminal.
4. Exchange source/destination equal the QR snapshot.
5. Study belongs to the selected ImagingPackage/Exchange resource scope.
6. Consent is ACTIVE, unexpired, same version, destination and action.
7. requesting actor, hospital and tenant remain active/trusted.
8. Authorization policy returns explicit ALLOW now.
9. no unique QR Grant binding already exists.
10. proposed Grant expiry is within policy and Consent/Session expiry.

Any unavailable or unknown validation is DENY/FAIL CLOSED.

## 5. Proposed Grant metadata

Existing `TransferGrant` remains canonical. The QR-specific relation is stored in `qr_grant_bindings` rather than putting QR payload into the Grant.

Logical binding:

```text
grant_id
exchange_session_id
consent_id
recipient_tenant_id
recipient_hospital_id
recipient_actor_id
imaging_package_id / study scope
scope
status
issued_at
expires_at
jti or equivalent replay identifier

qr_grant_binding:
  qr_request_id
  approval_id
  grant_id
  binding_hash
```

The raw QR reference, payload URL and display reference are prohibited in Grant content.

## 6. Consent behavior

- Existing matching ACTIVE Consent may be reused only if it covers the exact patient, source, destination, Study/resource, purpose and action.
- A PENDING Consent must be explicitly approved through the Consent workflow before QR approval succeeds.
- QR approval cannot silently create a broader Consent.
- Consent withdrawal before Grant issuance prevents issuance.
- Consent withdrawal after issuance prevents new protected use and triggers or causes Grant revocation according to existing policy.
- A completed PACS import is not retroactively erased by Consent withdrawal; the event remains audited and subsequent use follows destination policy and applicable governance.

## 7. Post-issuance behavior

### VIEW

Hospital B invokes the existing view action with the linked Grant and Study. Backend revalidates actor/tenant/recipient/Consent/Grant/resource/scope, then creates a short-lived Viewer Session. WADO-RS remains behind the MediQ Viewer Gateway.

### PACS_IMPORT

Hospital B invokes existing PACS Import. Mandatory Preflight validates destination, tenant, patient mapping, Grant scope, Consent, Authorization, expiry, integrity and provenance. STOW-RS is never called on failure. QR handoff does not bypass destination verification.

## 8. Revocation and failure matrix

| Event | QR history | Grant/action result |
|---|---|---|
| Grant issuance fails | `FAILED` | No Grant, no access |
| Consent withdrawn before issuance | `FAILED` or policy-denied result | No Grant |
| Consent withdrawn after issuance | Remains `GRANT_ISSUED` historical | Grant revoked/denied on use |
| Hospital trust/certificate revoked | Historical state unchanged | New use denied; active work stopped where safe |
| Actor disabled | Historical state unchanged | Actor use denied |
| Study mismatch | `FAILED`, binding mismatch audit | No Grant/action |
| Destination mismatch | `FAILED`, binding mismatch audit | No Grant/STOW |
| Partial STOW-RS success | QR remains handoff-complete | Transfer state partial/failed; verify/reconcile; never mark Exchange complete |

## 9. Invariants

- `INV-QR-GRT-001`: scan alone creates no Grant.
- `INV-QR-GRT-002`: approval alone creates no usable access credential.
- `INV-QR-GRT-003`: Grant binding equals the patient-visible approval snapshot.
- `INV-QR-GRT-004`: one QR request has at most one Grant.
- `INV-QR-GRT-005`: issued scope is exactly the requested/consented action mapping.
- `INV-QR-GRT-006`: destination is immutable after claim.
- `INV-QR-GRT-007`: current policy is re-evaluated before each protected action.
- `INV-QR-GRT-008`: QR/Grant issuance success is not transfer completion.

## 10. P0 compatibility

This P1 extension does not change P0 scope semantics or permit a destination-null `ExchangeSession`. QR is a pre-exchange pairing object. A normal destination-bound ExchangeSession is created on successful claim and the existing Domain Model remains authoritative thereafter.

