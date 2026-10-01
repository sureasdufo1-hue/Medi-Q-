# MEDIQ-GRT-006 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-006` |
| 제목 | TransferGrant API Payload Allowlist |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped metadata serialization Acceptance |

## 1. 목표

Align `MEDIQ-GRT-006` with `REQ-GRT-006` and ensure both Grant issue and revoke controllers return only a shared explicit metadata allowlist. Synthetic forbidden/unknown fields attached to a source object must not be serialized.

## 2. 범위

### 포함

- Shared `toGrantResponse` presentation mapper used by both issue and revoke controllers
- Unit coverage for domain snapshot and both controller response shapes, including DICOM/key/credential/unknown field exclusion

### 제외

- No Grant payload/key storage, database schema/privilege/migration, API schema expansion or DICOM handling
- No change to Authorization, issuance/revocation semantics, Viewer/Download/PACS behavior or operation gates

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-GRT-006` | DICOM/keys/credentials are not Grant payload | `TransferGrant` snapshot and shared response mapper |
| 보안 | `SEC-GRANT-006`; `THR-031`; `SEC-SEC-001` | Explicit allowlist; no raw secrets in metadata output | mapper and response shape tests |
| API·도메인 | `GRT-006-DEC-001`; `TC-GRT-001-DOM-010` | Shared serializer; known metadata only | issue/revoke controller methods |
| Acceptance | `TC-GRT-006-PAY-001~004`; existing GRT-003 integration response allowlist | Domain and serialization exclusion | focused unit tests |

## 4. 구현 결과

Both Grant lifecycle controllers use a single explicit `toGrantResponse` field-by-field mapper. Focused synthetic tests verified the domain snapshot, issue/revoke controller return shapes, and that DICOM/key/credential/unknown properties are not copied. API typecheck and the full API suite passed.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/grant/presentation/grant-response.ts` | shared approved metadata response mapping |
| `services/api/src/grant/presentation/grant-issue.controller.ts` | use shared serializer |
| `services/api/src/grant/presentation/grant-revocation.controller.ts` | use shared serializer |
| `tests/api/grant-response.test.mjs` | domain/issue/revoke response allowlist and forbidden-field Acceptance |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, requirements/security/plan | recommendation and traceability |

## 6. 영향 분석

### Architecture

- No application architecture change beyond one shared presentation function.

### API·Data

- API field contract is unchanged; no database, persistence, migration, or payload handling changes.

### Security·Privacy

- Prevents accidental serialization of non-metadata properties; synthetic forbidden-field values only; no PHI/secret used.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: focused 1 file/4 tests, API typecheck and full regression 25 files/465 tests PASS.

## 8. 변경하지 않은 사항

- No raw DICOM, Capsule, DEK/KEK, passwords, private keys or long-lived secrets in Grant; no protected operation behavior.

## 9. 결정 및 예외

- `GRT-006-DEC-001` — [Policy Decision Log](../../POLICY-DECISION-LOG.md#grt-006-dec-001--transfergrant-api-payload-allowlist)

## 10. 잔여 위험과 후속 작업

- Metadata-only serialization does not encrypt/transfer images or prove a protected image operation is authorized.

## 11. 최종 판정

```text
Ticket: MEDIQ-GRT-006
Scope: Grant domain/API metadata allowlist for issue and revoke response only
Changed:
Not changed:
Security impact:
Tests executed: See TEST-EVIDENCE.md; pending
Tests not executed: DB migration/RLS, protected HTTP integration, DICOM transfer/Viewer/PACS (out of scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks:
Status: PASS (domain and controller serializer allowlist only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | GRT-006-DEC-001 and four payload Acceptance cases recorded first; shared mapper and synthetic forbidden-field tests passed; full API suite 25/465 |
