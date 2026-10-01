# MEDIQ-ORG-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-002` |
| 제목 | Synthetic Hospital registry baseline seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — synthetic Hospital seed and fail-closed conflict checks verified |

## 1. 목표

ORG-001의 합성 Organization/Tenant A/B/C 각각에 정확히 대응하는 합성 Test Hospital을 재현 가능하고 비파괴적으로 등록한다.

## 2. 범위

### 포함

- A/B/C 고정 Hospital ID/code와 기존 Tenant·Organization owner pair를 사용하는 seed runner
- `TEST` 환경과 명시적인 Synthetic 이름, `ACTIVE` registry status
- Insert-if-absent + 전체 속성·owner-pair exact verification, 충돌 시 fail-closed rollback
- 첫 실행, 반복/no-op, metadata 충돌, owner-pair 충돌 및 fixture 범위 검증
- 권고안과 결과를 정책 로그, Acceptance, 계획, runbook, 구현 기록에 동기화

### 제외

- Endpoint/credential, Actor, Patient, DICOM/PACS 데이터와 API 구현
- Runtime Authentication/Authorization, Tenant isolation/RLS/table grants 및 접근 허용 판단
- Schema/Migration 변경, 실제 병원 데이터 또는 Production 환경 사용

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `IMPLEMENTATION-PLAN.md` Phase 2, `MEDIQ-ORG-002` | Hospital A/B registry; C는 별도 unauthorized-party test fixture | `ORG-002-DEC-001`, seed script |
| 보안 | `SECURITY-REQUIREMENTS.md` Tenant isolation; `THREAT-MODEL.md` cross-tenant risks | synthetic-only, no secrets/PHI, registry status does not grant access | local ignored `.env`, isolated database network, `mediq_migrator` |
| API·도메인 | `DOMAIN-MODEL.md` §8; `DATA-MODEL.md` §9; `ERD.md` | Hospital owner pair must match one Tenant registry row; no endpoint in this Ticket | database composite FK + seed exact verification |
| Acceptance | `ACCEPTANCE-TESTS.md` `TC-ORG-002-SEED-001~004` | exact registry, repeat/no-op, fail-closed conflicts, scope boundary | `scripts/test-org-002-seed.ps1` |

## 4. 구현 결과

`seed-org-002-hospital-registry.ps1` inserts three fixed synthetic Test Hospitals into the local database's `hospitals` table. Before writing it verifies the ignored local `.env`, the `mediq_migrator` identity, the container runtime profile, the running PostgreSQL service on exactly one isolated database network, the DB-008 migration ledger, and the canonical ORG-001 Organization/Tenant parent fixtures. The Hospital rows use stable IDs/codes, `environment_type=TEST`, `status=ACTIVE`, and exact Tenant/Organization owner pairs.

The SQL transaction checks parent fixtures, performs `INSERT ... ON CONFLICT (hospital_code) DO NOTHING`, then exact-verifies every expected Hospital field and the three canonical codes. Metadata or owner-pair drift raises a controlled conflict and rolls the transaction back; no existing row is updated or deleted. The integration runner validates first/repeat invocations, both rollback-only conflict probes, unchanged post-probe canonical state, and that the only SQL insert target is `public.hospitals` with no update/delete or external HTTP operation.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `scripts/seed-org-002-hospital-registry.ps1` | Guarded insert-only synthetic Hospital A/B/C seed and rollback probes |
| `scripts/test-org-002-seed.ps1` | Integration, idempotency, conflict/post-state and write-scope checks |
| `docs/POLICY-DECISION-LOG.md` | `ORG-002-DEC-001` recommendation, alternatives and boundaries |
| `docs/ACCEPTANCE-TESTS.md`, `scripts/README.md` | Four ORG-002 acceptance cases and reproducible run instructions |
| `docs/IMPLEMENTATION-PLAN.md`, `README.md`, current status reports | Phase/ticket status and next work synchronized |
| `docs/implementation/MEDIQ-ORG-002/` | This report and executed test evidence |
| `docs/implementation/README.md`, `docs/P0-EXECUTION-SCHEDULE.md` | Ticket index and dated progress log |

## 6. 영향 분석

### Architecture

- No runtime behavior or deployment topology change; local Test PostgreSQL reference rows only.

### API·Data

- No schema, migration, API or endpoint configuration change; uses the approved `hospitals` table and existing composite owner-pair FK.

### Security·Privacy

- Adds only Synthetic Hospital registry metadata. No Consent/Grant/Actor/Patient/PACS access; no PHI, endpoint URL or credential. Registry `ACTIVE` is not an authorization grant and does not prove tenant isolation.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` for this seed Ticket only; detailed commands/results are in TEST-EVIDENCE.md.

## 8. 변경하지 않은 사항

- Endpoint registration and source/destination network calls remain MEDIQ-ORG-003 or later scope.
- Authentication, Authorization, RLS and product readiness remain unimplemented by this Ticket.

## 9. 결정 및 예외

- `ORG-002-DEC-001`: seed synthetic Hospitals A/B/C; C is only a separate negative-test registry fixture; stable ID; insert-only; conflict rollback. The choice and alternatives are recorded in the central policy log.

## 10. 잔여 위험과 후속 작업

- Seed rows do not enforce tenant isolation; runtime authorization/RLS remains a required later gate.
- `MEDIQ-ORG-003` owns QIDO/WADO/STOW endpoint registration; this Ticket adds no PACS connectivity.

## 11. 최종 판정

```text
Ticket: MEDIQ-ORG-002
Scope: Synthetic Hospital A/B/C registry fixture in local Test PostgreSQL
Changed: Insert-only seed and test runner; ORG-002 policy/Acceptance/runbook/status and Ticket evidence
Not changed: Schema/migration, endpoints, actors, patients, APIs, authorization/RLS, PACS or product transfer
Security impact: Isolated database network and `mediq_migrator`; no PHI/credential output; no access-control claim
Tests executed: PowerShell AST parse; ORG-002 insert/repeat/metadata conflict/owner-pair conflict/post-state/scope checks; ORG-001 seed regression; documentation and diff checks
Tests not executed: Product API, runtime authorization/RLS, DICOM endpoint access and Hospital A→B product exchange (outside Ticket)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Synthetic registry rows do not implement authentication, authorization or tenant isolation; endpoint configuration is next
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | 구현 기록 생성 |
| 2026-09-30 | `PASS` | Hospital A/B/C synthetic seed, no-op repeat and conflict rollback verified; docs synchronized |
