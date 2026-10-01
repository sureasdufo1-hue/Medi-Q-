# MEDIQ-GRT-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-001` |
| 제목 | Immutable P0 TransferGrant domain metadata |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — pure domain scope only |

## 1. 목표

승인된 P0 TransferGrant metadata/status/scope 기준을 immutable domain entity로 표현하고, construction/reconstitution/lifecycle 데이터의 잘못된 shape를 fail closed로 거부한다. 이 entity가 Authorization이나 실제 Grant 발급을 대신하지 않도록 경계를 코드·문서·시험에 명시한다.

## 2. 범위

### 포함

- `GRT-001-DEC-001` 권고 및 10 Acceptance cases를 코드 변경 전에 기록
- Persistence-shaped immutable `TransferGrant` with UUID references, optional Actor/Package, scopes/status/timestamps
- P0-only unique non-empty scope set; `study:mobile-export` 거부
- persisted four-status reconstitution, `ACTIVE` in-memory factory, temporal helper 및 immutable revoke transition
- Date/scope defensive copies, snapshot property minimization, revokedAt/status consistency

### 제외

- TransferGrant repository/persistence/migration/runtime grants/RLS
- Authorization, Consent, Actor/Tenant/Hospital/Package cross-entity binding
- Grant issue/revoke HTTP API, Audit, Viewer/Download/PACS/QR 및 one-time `consume()`

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-GRT-001/002/006` | scoped Grant metadata와 P0 scope; sensitive field omission | `TC-GRT-001-DOM-001~010` |
| 보안 | `SEC-GRANT-001/006`; `INV-GRT-001~009` | Session/Consent/recipient/resource refs, P0 scope, time/status, payload 제외 | constructor, scope/status/date tests |
| API·도메인 | `GRT-001-DEC-001`; P0 `transfer_grants` schema | status/fields/nullable Actor·Package 의미를 persistence와 정합화 | `services/api/src/grant/domain/transfer-grant.ts` |
| Acceptance | `ACCEPTANCE-TESTS.md` | ten scoped domain acceptance groups | `tests/api/transfer-grant.test.mjs` |

## 4. 구현 결과

Added an immutable `TransferGrant` domain entity with exact persistence references (`grantId`, Session, Consent, recipient Tenant/Hospital/optional Actor, optional ImagingPackage), unique P0 scopes, four persisted statuses and lifecycle timestamps. It normalizes UUIDs, validates required fields and `expiresAt > issuedAt`, requires `revokedAt` only for a REVOKED record and not before issuance, returns defensive Date/scope snapshots, and creates a new REVOKED object only from ACTIVE.

`issue()` creates only an in-memory ACTIVE metadata object; it does not check authorization, consent, binding or persistence. `isTemporallyActiveAt()` checks only `ACTIVE`, no revocation, and the half-open `[issuedAt, expiresAt)` time interval. Neither method grants permission.

Ten Acceptance groups pass; the focused suite exercises 19 assertions/cases. API-wide regression and TypeScript typecheck pass.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/grant/domain/transfer-grant.ts` | immutable entity, P0 scope/status types, issue/reconstitute, temporal helper, revoke, defensive snapshot |
| `tests/api/transfer-grant.test.mjs` | 10 Acceptance groups; 19 focused test cases |
| `docs/POLICY-DECISION-LOG.md` | `GRT-001-DEC-001` recommendation, alternatives, boundaries and residual risks |
| `docs/DOMAIN-MODEL.md` | P0 TransferGrant domain contract amendment |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md` | scoped Acceptance traceability and explicit open integration gates |
| `docs/ACCEPTANCE-TESTS.md` | ten Acceptance results and limits |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | checkpoint, next Ticket and index synchronization |
| `docs/implementation/MEDIQ-GRT-001/*` | implementation report and test evidence |

## 6. 영향 분석

### Architecture

Adds a pure domain folder only; no Nest module, controller, provider, API route, or application service registration.

### API·Data

No OpenAPI, SQL, schema, migration, runtime privilege, or database data changes. Snapshot fields align with the existing `transfer_grants` and `transfer_grant_scopes` metadata model.

### Security·Privacy

P1 `study:mobile-export` cannot enter this P0 entity. Nullable Actor/Package values preserve persistence representation only; they are not access permission. The entity carries metadata references only, not DICOM/patient-local data/UID/key/credential/secret. Cross-entity Consent, recipient, Tenant, Hospital, resource and action checks remain separate server-side gates.

## 7. 실행 및 검증 요약

- Focused TransferGrant domain suite: 1 file / 19 tests PASS
- API build/regression: 21 files / 392 tests PASS
- TypeScript API typecheck PASS
- Detailed commands/results: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- No Grant was persisted or issued through an application/API path.
- No Authorization `ALLOW`, Consent validity, recipient binding, scope-to-action permission, or object/resource access is established by this domain.
- `EXPIRED` and `CONSUMED` are reconstitutable terminal statuses only; P0 has no `consume()` or scheduled expiry transition.
- No database integration or PACS/Viewer/Download/E2E gate was claimed.

## 9. 결정 및 예외

`GRT-001-DEC-001` was recorded before implementation under the active PDEC-001 standing recommendation process. It preserves the existing schema while excluding P1 scope promotion and session-wide authorization inference from a null package.

## 10. 잔여 위험과 후속 작업

- GRT-002 persistence/read permissions need a separate least-privilege recommendation and scratch DB Acceptance.
- Grant issue API must re-read/validate current Consent and receive exact server-side `ALLOW` before persistence.
- GRT-005 scope/action and GRT-006 recipient/Tenant binding require operation-level enforcement tests.
- GRT-007 must test actual expired Grant denial at the protected operation; the domain temporal helper alone is not sufficient.
- overall P0 E2E remains `BLOCKED`.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-001
Scope: Pure immutable P0 TransferGrant metadata domain
Changed: Entity, 10 Acceptance groups/19 focused cases, linked docs and evidence
Not changed: Persistence, Authorization, Consent/recipient/resource enforcement, API, schema, runtime grants, Viewer/PACS
Security impact: P0 scope allowlist and lifecycle metadata fail closed; entity does not authorize access
Tests executed: Focused 19, API 21 files/392 tests, API typecheck
Tests not executed: DB persistence, Grant issue/revoke API, HTTP BOLA, protected operation expiry/scope/recipient, PACS/E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: All issuance and product access gates remain open; overall P0 BLOCKED
Status: PASS (scoped pure domain)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | 권고안·Acceptance 선기록, domain 구현, 19 focused/API 392/typecheck 및 문서화 |
