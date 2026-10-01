# MEDIQ-ORG-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-001` |
| 제목 | Synthetic Organization and Tenant baseline seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — synthetic seed, idempotency and both conflict rejection probes verified |

## 1. 목표

Phase 2에서 사용하는 Synthetic Hospital A/B와 unauthorized third-party C의 Organization/Tenant 기준 데이터를 로컬 Test PostgreSQL에 재현 가능하고 비파괴적으로 준비한다.

## 2. 범위

### 포함

- 안정 UUID와 고정 code를 가진 Organization A/B/C 및 독립 Tenant A/B/C seed
- `mediq_migrator`만 사용하는 isolated database network 기반 PowerShell seed runner
- insert-if-absent + exact metadata/owner-pair verification; 충돌 시 fail-closed rollback
- 반복 seed, Organization 충돌, Tenant owner-pair 충돌 acceptance test

### 제외

- Hospital/Endpoint/Actor/Patient 데이터, PACS credential/endpoint 설정
- Runtime API, Consent/Authorization/Grant, RLS/table grants 또는 cross-tenant authorization 구현
- 실제 조직·병원·환자정보 및 Production DB 사용

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `IMPLEMENTATION-PLAN.md` Phase 2; Domain Model §§6–7 | Hospital Organization별 독립 Tenant fixture, C는 unauthorized party | `ORG-001-DEC-001`, seed script |
| 보안 | Tenant isolation invariants; `SECURITY-REQUIREMENTS.md` | Synthetic-only; no secret/PHI; no inference of authorization from Tenant row | local ignored .env, migrator-only path |
| API·도메인 | `DATA-MODEL.md` §§7–8; `ERD.md` REL-001 | Organizations/Tenants only with valid parent mapping | stable seed codes/IDs, DB constraints |
| Acceptance | `ACCEPTANCE-TESTS.md` TC-ORG-001-SEED-001~004 | Exact fixture, repeat/no-op, org/tenant mismatch fail-closed, data boundary | `scripts/test-org-001-seed.ps1` |

## 4. 구현 결과

Seed runner creates 3 synthetic Organizations and 3 separately scoped Tenants in one PostgreSQL transaction. It checks that DB-008 migration ledger is present, connects using `mediq_migrator` from the isolated Compose database network, uses stable fixture UUIDs, and performs `ON CONFLICT DO NOTHING`. It then verifies every expected ID, code, name, type/status and Tenant→Organization relationship. Any mismatch aborts the whole transaction; it never updates or deletes existing records. Repeat invocation is a no-op. Probe-only modes intentionally supply mismatched expected metadata/owner-pair values to exercise both rejection branches and do not persist changes.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `scripts/seed-org-001-registry.ps1` | Guarded, insert-only synthetic Organization/Tenant seed and rollback-only probes |
| `scripts/test-org-001-seed.ps1` | First run, repeat/no-op, Organization conflict, Tenant owner-pair conflict and post-probe verification |
| `docs/POLICY-DECISION-LOG.md` | `ORG-001-DEC-001` approved fixture and no-overwrite seed policy |
| `docs/ACCEPTANCE-TESTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `scripts/README.md` | Seed scope, required behavior and operator/test instructions |
| `docs/implementation/MEDIQ-ORG-001/` | Implementation report and executed test evidence |
| `docs/implementation/README.md`, `README.md`, status/schedule documents | Ticket/gate progression synchronized |

## 6. 영향 분석

### Architecture

- Adds six explicitly synthetic reference rows to the existing local PostgreSQL database. No production deployment or data-volume reset.

### API·Data

- No API/schema/migration changes. Uses existing Organization/Tenant tables and migration 0007.

### Security·Privacy

- Tenant rows represent intended isolation context for future Test fixtures, but do not authenticate or authorize anyone.
- No Consent/Authorization/Grant/Audit records, endpoint URL, PACS credentials, PHI or DICOM payload are read or written.
- Migration password is loaded only from the ignored local .env and never printed; database connections run on the isolated Docker database network.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` for seed Ticket scope; full product authorization and hospital workflow are outside this Ticket.

## 8. 변경하지 않은 사항

- Seed contains no Hospital, Endpoint, Actor, Patient or PACS rows.
- No schema Migration, runtime grants, RLS or API endpoint changed.

## 9. 결정 및 예외

- `ORG-001-DEC-001`: 3 Hospital Organization/3 Tenant fixture; stable UUID; insert-only; conflicts abort without overwrite.

## 10. 잔여 위험과 후속 작업

- Seed relies on the local ignored .env and existing Test PostgreSQL service; the script fails before writing if database scope/schema/credential identity is not verified.
- Tenant isolation must later be enforced by application authorization/RLS; seed alone proves no security control.

## 11. 최종 판정

```text
Ticket: MEDIQ-ORG-001
Scope: Seed A/B/C synthetic Organization/Tenant fixtures in local Test PostgreSQL
Changed: Insert-only runner, integration checks, policy log, Acceptance/plan/runbook and Ticket evidence
Not changed: Hospital/endpoint/actor/patient seed; runtime authorization, RLS, APIs, PACS/DICOM operations
Security impact: Uses isolated database network and mediq_migrator; no PHI/secret output; no authorization claim
Tests executed: PowerShell AST parse; test-org-001-seed.ps1 first insert/repeat/Org conflict/Tenant owner-pair conflict/post-probe exact verification
Tests not executed: Product API, application authorization, RLS and Hospital A→B exchange (outside Ticket)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Tenant isolation is not yet enforced by application/RLS; Hospital/Endpoint/Actor setup remains next
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | 구현 기록 생성 |
| 2026-09-30 | `PASS` | Synthetic A/B/C Organization/Tenant seed, repeat/no-op and both conflict rollback probes passed |
