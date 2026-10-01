# MEDIQ-CON-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-001` |
| 제목 | P0 ConsentArtifact immutable domain |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — immutable synthetic P0 domain only; lifecycle, persistence and legal/authorization effect remain separate gates |

## 1. 목표

P0 요구사항에 맞는 불변 ConsentArtifact 도메인 계약을 구현하여 AUT-003 및 향후 Consent Application 작업에서 일관된 typed evidence shape를 사용하도록 한다. 생성·재구성 성공은 legal consent나 의료영상 접근권한을 의미하지 않는다.

## 2. 범위

### 포함

- `CON-001-DEC-001` 권고안과 `TC-CON-001-DOM-001~008` Acceptance 선확정
- 서버 생성 Consent UUID, positive safe-integer consent version, UUID context, optional Imaging Package, unique P0 action set, declared status, timestamps를 가진 immutable domain snapshot
- 신규 Artifact를 항상 `PENDING`으로 생성하고 schema의 다섯 status만 재구성
- Synthetic identifiers only; no persistence or API exposure

### 제외

- Approve/reject/withdraw/expire transition, Consent workflow/API, version allocator/concurrency, DB grants/RLS/migration, Audit
- Legal consent/e-signature/identity proof, `ALLOW` decision, TransferGrant issue, Viewer/Download/PACS side effects
- P1 `MOBILE_EXPORT` and production/real-patient use

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `CON-001-DEC-001` | Domain-only boundary, positive caller-allocated version, P0 actions, no implied authority | [정책 결정 로그](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-CON-001/002/005` | Artifact, context and technical-consent boundary | `TC-CON-001-DOM-001~008` |
| Domain/Data | `DOMAIN-MODEL.md` `INV-CON-001~010`; existing DB-005 `consents`/`consent_actions` | Match current schema without re-migrating it; version uniqueness/allocation remains a persistence concern | `ConsentArtifact` factory/reconstitution |
| 보안 | `SEC-CONSENT-001~004`; `AUT-003-DEC-001` | Consent is not Authorization; no route/grant/DB authority added | Explicitly NOT established by this Ticket |
| Acceptance | `ACCEPTANCE-TESTS.md` | Eight pure-domain groups; legal/effectiveness, workflow and integration excluded | Focused 36 and API 269 tests |

## 4. 구현 결과

`ConsentArtifact.create()` generates a fresh UUID, forces `PENDING`, and fixes `issuedAt`/`withdrawnAt` to null. `reconstitute()` accepts only the five schema-defined states after validating UUIDs, different source/destination hospitals, an optional package UUID, a non-empty unique P0 action set, a positive safe-integer version, valid optional timestamps and monotonic created/updated time. Values are normalized and immutable; Date getters return copies.

P0 actions are limited to `VIEW`, `DOWNLOAD`, and `PACS_IMPORT`; `MOBILE_EXPORT` is rejected. Null package is session-scoped Consent metadata only. No approve/authorize methods, API/provider wiring, migration, or runtime privileges were added.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/consent/domain/consent-artifact.ts` | Immutable pure-domain factory/reconstitution and input validation |
| `tests/api/consent-artifact.test.mjs` | 36 synthetic positive/negative tests |
| `docs/POLICY-DECISION-LOG.md` | `CON-001-DEC-001` recommendation, alternatives, boundary and rationale |
| `docs/DOMAIN-MODEL.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/ACCEPTANCE-TESTS.md` | Domain invariants and scoped traceability/Acceptance |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `README.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `docs/implementation/README.md` | Current Ticket progress and incomplete gates |
| `docs/implementation/MEDIQ-CON-001/*` | Implementation report and test evidence |

## 6. 영향 분석

### Architecture

- Internal domain module only; not registered in Nest and not exposed over HTTP.

### API·Data

- No OpenAPI, database schema, migration, runtime grant, persistent row or external dependency changed.

### Security·Privacy

- Synthetic technical evidence only. Consent never maps to `ALLOW`; Patient/legal identity is not proven. Missing workflow/evidence remains unavailable and existing fail-closed gates stay closed.

## 7. 실행 및 검증 요약

- `npm run build:api`: PASS.
- Focused `npx vitest run tests/api/consent-artifact.test.mjs`: 36/36 PASS (2026-09-30 17:07:43 KST).
- `npm run test:api`: 12 files / 269 tests PASS (2026-09-30 17:07:54 KST).
- `npm run typecheck:api`: PASS.
- Static checks: detailed results in [TEST-EVIDENCE.md](TEST-EVIDENCE.md).

## 8. 변경하지 않은 사항

- No Consent API, state transition, persistence, atomic version allocator, runtime access grant, legal consent claim, authorization policy wiring, Audit or clinical/PACS operation.

## 9. 결정 및 예외

- `CON-001-DEC-001` was recorded before code. Positive version is supplied by the caller; actual per-Session uniqueness/concurrent allocation is deferred. No expiry/issue/withdrawal time ordering or status/timestamp relationship was inferred beyond the approved shape constraints.

## 10. 잔여 위험과 후속 작업

- Version uniqueness is not proven until persistence supplies an atomic allocator and DB unique constraint (`MEDIQ-CON-002`).
- Reconstituted `ACTIVE` status is metadata only; a later service must validate current expiry, withdrawal, Session, resource, destination, Actor/Tenant, and Grant evidence before any access.
- Legal effect, informed patient interaction, approval/withdrawal, safe API errors and audit require later CON/AUT/DB Tickets and remain unimplemented.

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-001
Scope: Immutable synthetic P0 ConsentArtifact domain contract
Changed: Domain snapshot/factory/reconstitution; eight Acceptance groups; decision, normative docs, implementation record and status references
Not changed: Transitions, legal consent, persistence/version allocator, DB grants/RLS, API, Authorization, Grant, Audit or protected operation
Security impact: No access/ALLOW is inferred; P1 action rejected; no runtime authority opened
Tests executed: `npm run build:api`; focused suite 36/36; `npm run test:api` 12 files / 269 tests; `npm run typecheck:api`
Tests not executed: DB/API/Consent lifecycle/legal-effect/Authorization/Grant/Audit/PACS integration (out of scope)
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-CON-001/
Remaining risks: version concurrency and real Consent workflow are not implemented; status is not permission
Status: PASS (scoped domain contract only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | CON-001-DEC-001 domain-only recommendation implemented; focused 36/36 and API 269/269; workflow/persistence remain gated |
