# MediQ QR Handoff Threat Model

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-TM-001 |
| Document Title | QR Handoff Threat Model |
| Version | 0.1.0 |
| Status | PROPOSED — CAPSTONE-P1 Design Baseline |
| Owner | MediQ Security |
| Related Documents | `THREAT-MODEL.md`, `QR-PAYLOAD-FORMAT.md`, `QR-EXPIRY-AND-REPLAY-POLICY.md` |
| Last Updated | 2026-09-21 |

## 1. Assets and boundaries

Assets: patient/Study confidentiality, destination correctness, approval integrity, Consent evidence, Transfer Grant, hospital/actor identity, QR availability, audit evidence and state consistency.

Trust boundaries:

1. patient display and camera-visible environment;
2. Hospital Web camera/browser;
3. patient/hospital clients to MediQ API;
4. QR orchestration to Identity/Consent/Authorization/Grant;
5. Grant to Viewer/DICOM transfer;
6. logs, telemetry, database and outbox.

The threat model assumes QR images can be photographed and relayed. Physical proximity is not trusted.

## 2. Threat register

| ID | Threat/path | Impact | Preventive controls | Detection/response | Residual risk / test |
|---|---|---|---|---|---|
| QR-T01 | QR photographed | Unauthorized claim attempt | opaque reference, short TTL, authenticated hospital, patient confirmation | claim audit, reject/cancel | Photo can be relayed; QR-AT-012 |
| QR-T02 | Payload stolen from app/browser | Same as above | no PHI/token, hash-at-rest, no clipboard/log | anomaly/rate alert, expire | live-window abuse remains; QR-AT-013 |
| QR-T03 | Fake/tampered QR | phishing or wrong origin | exact HTTPS origin/path allowlist, strict parser, server lookup | generic denial, security event | visual replacement possible; QR-AT-014 |
| QR-T04 | Used QR replay | duplicate claim/Grant | conditional claim, terminal state, idempotency, unique binding | replay reason audit | denial DoS possible; QR-AT-015 |
| QR-T05 | Real-time relay | remote authenticated hospital claims | independent destination/actor/action display, patient approval, comparison code | geo/tenant anomaly, reject | not fully preventable; QR-AT-016 |
| QR-T06 | Hospital impersonation | wrong destination | OIDC workforce auth, server-derived active hospital/tenant, trust registry | trust/audit review | compromised trusted account; QR-AT-017 |
| QR-T07 | Staff account takeover | fraudulent claim/use | IdP controls, session policy, least privilege, recent auth for sensitive action | behavior alert, disable actor/revoke Grant | IdP residual risk; QR-AT-018 |
| QR-T08 | Fake patient approval UI | patient misled | app link integrity, server-fetched summary, no QR-derived identity, step-up auth | app integrity monitoring/support | compromised device; QR-AT-019 |
| QR-T09 | Destination changed after approval | misdelivery | immutable snapshot/hash, destination-bound Consent/Grant/preflight | binding mismatch audit | none accepted; QR-AT-020 |
| QR-T10 | Study/scope changed | excess disclosure | one Study/action, immutable snapshot, scope containment | DENY/audit | none accepted; QR-AT-021/022 |
| QR-T11 | Expiry race | approval after deadline | server time, conditional update, serialization | expiry/decision audit | boundary winner by commit order; QR-AT-023 |
| QR-T12 | Simultaneous scanners | wrong claimant/data leak | first valid atomic claim, minimized loser response | conflict metrics | malicious first claimant DoS; QR-AT-024 |
| QR-T13 | Duplicate Grant issuance | multiple authority | idempotency, unique binding, transactional outbox | duplicate constraint alert | worker operational retry; QR-AT-025 |
| QR-T14 | Patient/request existence probing | privacy leak | 256-bit refs, auth before details, uniform unavailable/404, rate limits | enumeration alert | timing side channels require testing; QR-AT-026 |
| QR-T15 | QR/PHI in logs | persistent disclosure | structured redaction, no raw ref/image/PHI, no third-party analytics | log scan/DLP test | operator misconfiguration; QR-AT-027 |

## 3. Real-time relay analysis

Attack:

```text
Patient displays QR in Hospital B
→ attacker photographs/streams QR
→ authenticated actor in Hospital C claims before B
→ patient receives approval prompt
```

TTL and one-time claim do not stop this if the relay is immediate. The decisive control is the patient's independent review of server-verified Hospital C, actor, purpose, Study and action. If the user approves without reading, residual social-engineering risk remains.

The six-character display reference detects some UI/session mismatch when the patient can compare both screens, but it does not prove proximity and does not defeat a full interactive relay. Documentation and UI must state this limitation.

Potential post-MVP defenses requiring evaluation include hospital-managed scanner device attestation, risk-based network/location signals and transaction signing. None may replace patient confirmation or create false proximity claims.

## 4. Abuse and denial of service

- A malicious valid hospital can claim first and force the patient to regenerate. This is preferable to exposing patient data to multiple scanners.
- Limit active requests, claim attempts and scanner sessions.
- Apply exponential backoff and security alerting without locking out emergency or legitimate workflows through unaudited permanent bans.
- Request cancellation/recreation remains patient-controlled.

## 5. Data minimization

Before approval, hospital sees no patient identity or Study metadata. QR contains no PHI. Audit uses UUID resource references and safe reason codes. Camera frames, QR bitmap, raw reference, tokens, DICOM UIDs and clinical free text are prohibited from analytics/crash logs.

## 6. Security response

| Trigger | Response |
|---|---|
| Suspected QR leak before claim | Patient cancel; mark terminal; create new request |
| Wrong hospital claims | Patient reject; alert/audit; create new request |
| Compromised hospital actor | Disable actor/session; deny/revoke linked Grant; investigate audit |
| Consent withdrawn | Block issuance/new use; revoke/deny linked Grant |
| Duplicate/relay spike | Rate limit, correlation investigation, tenant security alert |
| Log leakage | stop collection, restrict access, purge under evidence-preserving incident procedure, rotate affected transient references where still active |

## 7. Accepted residual risks

- QR cannot cryptographically prove the scanner is physically nearby.
- A compromised authenticated hospital account can claim but still requires patient approval.
- Patient social engineering cannot be eliminated; verified destination UI and warnings reduce it.
- A first-claim attacker can cause short-lived denial of service without obtaining images.
- Production identity proofing, hospital PKI and legal Consent are outside the current synthetic/test P1 profile.

