# MEDIQ-DB-008 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-008` |
| 제목 | P0 full database schema constraint and reset validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` |

## 1. 목표

승인된 P0 Data Model의 17개 테이블과 사용자 승인 결정 `DB-008-DEC-001`을 migration으로 구현하고, 전체 PK/FK/UNIQUE/CHECK/INDEX 카탈로그·적용·재적용·초기화·선행 schema Ticket 회귀·synthetic fixture 호환성을 검증한다.

## 2. 범위

### 포함

- 17개 P0 table catalog inventory와 migration ledger 상태 검증
- 승인된 registry status 및 owner-pair 정책을 additive migration으로 적용
- DB-002~007의 상세 schema/constraint/rollback 회귀 스크립트 실행
- 기존 데이터베이스를 삭제하지 않는 일회용 PostgreSQL 환경에서 clean UP 및 RESET 재현성 검증
- extensible `organization_type` 및 DB/Application 책임 경계 검증·기록

### 제외

- 업무 API, RLS, runtime grants, authorization, PACS 전송/E2E 구현

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `IMPLEMENTATION-PLAN.md` Phase 1 / GATE-IMP-02; `DATA-MODEL.md` §§9, 11, 52–53 | Full schema constraints, approved registry policy, clean migration/reset, fixture compatibility | `TC-DB-008-REG-001~010` |
| 보안 | `SECURITY-REQUIREMENTS.md` SEC-TEN-004; `THREAT-MODEL.md` THR-003 | Owner-pair structural integrity supplements but does not replace runtime authorization/RLS | `TC-DB-008-REG-003/009` |
| 결정 | `POLICY-DECISION-LOG.md` DB-008-DEC-001 | Status allowlists, extensible organization type, composite owner-pair FKs | `TC-DB-008-REG-005/009/010` |
| Acceptance | `ACCEPTANCE-TESTS.md` DB-002/DB-008 sections | 17-table exact inventory and predecessor regression evidence | `TC-DB-008-REG-001~010` |

## 4. 구현 결과

Drizzle schema와 additive migration 0007에 승인된 status CHECK 2개, 참조 대상 composite UNIQUE 2개, owner-pair composite FK 2개를 추가했다. organization_type에는 CHECK를 추가하지 않았다. Disposable PostgreSQL에서 17개 product table, migration ledger 8개, PK/FK/UNIQUE/CHECK 17/44/14/28을 확인했다. Clean UP/repeat, 프로젝트 소유 자원만 RESET, fresh UP을 재실행했고 정책 acceptance에서 두 소유 불일치와 두 invalid status를 거부하고, 세 status 각각·임의 organization type·nullable Tenant-level Actor를 허용했으며 synthetic row 0개를 남겼다. 기존 local test DB에도 migration 0007을 additive 적용하고 DB-002~007 회귀가 통과했다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/registry.ts` 및 migration 0007 | 승인 status CHECK와 복합 owner-pair key/FK |
| migration metadata/snapshot | Drizzle history 8개 migration으로 동기화 |
| `scripts/test-db-002-registry.ps1`, `scripts/test-db-008-full-schema.ps1` | 승인 상태·소유 관계 positive/negative/rollback과 full schema/reset 검증 |
| `docs/ACCEPTANCE-TESTS.md` | DB-008 acceptance traceability |
| `docs/DATA-MODEL.md`, `docs/ERD.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md` | 승인 정책과 보안 경계 기준선 반영 |
| `docs/POLICY-DECISION-LOG.md`, `AGENTS.md` | 상시 권고안 결정 절차와 채택 정책 기록 |
| `docs/implementation/MEDIQ-DB-008/` | 이 Ticket의 결과/evidence |
| status documents | DB-008/Phase 1 Gate 및 후속 단계 현황 동기화 |

## 6. 영향 분석

### Architecture

- Schema change is additive; the approved 17 product-table allowlist is unchanged.

### API·Data

- Existing migrations 0000–0006 remain unchanged; migration 0007 adds only the approved constraints and reference keys.

### Security·Privacy

- Catalog completeness does not establish runtime grants, RLS, row authorization, or tenant isolation.
- Composite owner-pair FK is structural defense-in-depth only; it does not authorize access.
- Synthetic-only fixtures; no PHI, credential, or DICOM payload in reports.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` for GATE-IMP-02; detailed evidence records clean UP/RESET, policy positive/negative paths, migration history and DB-002~007 regressions.

## 8. 변경하지 않은 사항

- DB-002~007의 원래 Ticket 경계와 migration 0000~0006은 수정하지 않았다.
- Runtime Authorization, RLS/table grants, 업무 API 및 제품 DICOM 전송은 이 Ticket에서 구현하지 않았다.

## 9. 결정 및 예외

- `DB-008-DEC-001`은 사용자가 두 권고안을 모두 승인한 정책 기준선이며 `docs/POLICY-DECISION-LOG.md`에 기록했다.
- `organization_type`은 확장 코드로 유지하고 DB CHECK를 두지 않는다.
- Hospital/Actor status는 `ACTIVE`, `SUSPENDED`, `INACTIVE` CHECK로 제한한다.
- Hospital Tenant/Organization 및 Actor Tenant/Hospital owner-pair는 composite FK로 강제한다. Actor의 nullable `hospital_id`는 유지한다.
- Composite FK는 구조적 무결성만 제공하며 Runtime Authorization, RLS/grants 또는 접근 통제를 대체하지 않는다.
- `PDEC-001`에 따라 향후 프로젝트 정책 선택은 권고안을 기본으로 적용하고, 대안·근거·영향·검증 추적을 결정 로그에 남긴다.

## 10. 잔여 위험과 후속 작업

- Runtime Authorization, RLS/table grants, business API and product DICOM A→B transfer remain unimplemented and belong to downstream P0 Tickets.
- `organization_type` values are intentionally extensible; a controlled category registry/API validation is not part of DB-008.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-008
Scope: Approved P0 17-table schema, registry policy amendment, aggregate catalog, disposable reset, predecessor regression
Changed: Additive migration 0007, Drizzle schema/snapshot/journal, synthetic acceptance scripts, normative docs and decision records
Not changed: Product Authorization/API, RLS/table grants, Consent/Grant enforcement, Viewer/Download or A→B transfer
Security impact: Owner-pair mismatches and invalid statuses are rejected structurally; no runtime access authorization is implied
Tests executed: `npm run db:migrations:check` PASS; `npm run test:db-migrations` 6/6; PowerShell AST PASS; full DB-008 disposable UP/repeat/RESET/reapply exit 0; DB-002~007 integration regressions PASS; local migration ledger=8; approved policy positive/negative and rollback probes PASS
Tests not executed: Product authorization/RLS, Viewer/Download, and DICOM A→B product E2E (outside this schema Ticket)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Runtime Authorization/RLS and product workflow remain separate incomplete gates; custom organization categories intentionally have no finite DB validation
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `IN_PROGRESS` | Ticket record and acceptance scope created before verification |
| 2026-09-30 | `PARTIAL` | 17/17 disposable UP/RESET, catalog 17/42/12/26, DB-002~007 regressions pass; allowed-value and owner-pair policy decisions remain open |
| 2026-09-30 | `PASS` | User-approved `DB-008-DEC-001` recorded and implemented in additive migration 0007; catalog 17/44/14/28, policy probes, reset/reapply, and predecessor regressions passed; GATE-IMP-02 closed |
