# MEDIQ-AUD-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUD-002` |
| 제목 | Verified-Tenant Grant denial Audit event pair |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS (scoped)` — verified-Tenant Grant issue/revocation denial event pair only |

## 1. 목표

검증된 IAM-002 Tenant transaction 안에서 발생하는 현재 Grant issue/revocation 거부 경로가 policy 결과 `AUTHORIZATION_DENIED`와 업무 결과 `GRANT_DENIED`를 각각 남기고, 둘의 Audit 기록이 업무 판정과 원자적으로 commit/rollback되게 한다.

## 2. 범위

### 포함

- `AUD-002-DEC-001`과 `TC-AUD-002-EVENT-001~008`을 코드 변경 전 문서화
- `GRANT_DENIED/DENY`의 고정 event/resource/reason allowlist 지원
- Grant issue와 revocation의 verified-Tenant denial path에서 event pair 기록
- Unit/API/real PostgreSQL RLS runtime evidence와 회귀 테스트
- Acceptance, security/requirements, plan 및 implementation index 동기화

### 제외

- Tenant 검증 전/인증 실패용 전역 감사 저장소 또는 로그 수집기
- Viewer/Download/PACS transfer/Integrity/Session-completion event producer 및 end-to-end flow
- `ACCESS_DENIED` 전역 coverage, Audit query/read API, retention/WORM/tamper resistance/SIEM
- DB schema/migration/RLS/grant/API response shape 변경
- Overall `REQ-AUD-001`, `SEC-AUD-001`, `STC-AUD-001` PASS 주장

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `PDEC-001`, `AUD-002-DEC-001` | Grant 거부 pair·원자성·고정 metadata 채택 | [POLICY-DECISION-LOG.md](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-AUD-001` | Security/업무 Audit action 최소 coverage | `TC-AUD-002-EVENT-001~008` |
| 보안 | `SEC-AUD-001~003`, `SEC-TEN-005`, `SEC-DB-005/006` | verified Tenant, RLS, minimization, no Tenant fabrication | API + PostgreSQL runtime tests |
| 업무 | `TC-GRT-003-API-018`, `AT-SEC-005/006` | Grant issue/Consent denial event expectation | Grant issue/revoke integration |
| 데이터 | `AUD-001-DEC-001`, existing Audit schema | exact existing 12-column INSERT only | DB-008 RLS/catalog/atomicity regression |

## 4. 구현 결과

`AuditEvent`는 `GRANT_DENIED/DENY`를 고정된 `EXCHANGE_SESSION` resource와 두 허용 reason으로 검증한다. Grant issue/revocation 거부 adapter가 기존 `AUTHORIZATION_DENIED/DENY`와 별도 UUID의 `GRANT_DENIED/DENY`를 순서대로 기록한다. 동일 Tenant/Actor/Session/correlation/timestamp/reason을 공유하며, 둘 중 어느 INSERT라도 실패하면 caller-owned IAM-002 transaction에서 전체 작업을 rollback한다. API response, schema, migration, RLS 및 exact privilege 수는 변경하지 않았다.

## 5. 변경 파일

| 경로 | 변경 |
|---|---|
| `services/api/src/audit/domain/audit-event.ts` | fixed `GRANT_DENIED/DENY` rule 및 Session/resource reference 일치 검증 |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | Grant issue/revocation denial에서 두 event를 동일 transaction으로 기록 |
| `tests/api/audit-event-writer.test.mjs` | GRANT_DENIED fixed-catalog positive/negative checks |
| `tests/api/grant-issue.service.test.mjs`, `tests/api/grant-revocation.service.test.mjs` | denial pair behavior assertions |
| `tests/database/grant-issue-api-runtime.integration.test.mjs` | live PostgreSQL pair/context/count checks 및 second-event failure rollback injection |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, requirements/security/plan/index and this record | recommendation, Acceptance and evidence/status synchronization |

## 6. 영향 분석

### Architecture

- Existing Grant service/repository path only; no new route or component.

### API·Data

- API response and database schema/migration/grants remain unchanged.
- Only current exact Audit metadata columns are used.

### Security·Privacy

- Both events use the caller's verified Tenant transaction and fixed UUID references/reason codes.
- No Tenant-less identity is invented; no PHI/free text/payload/token/key is added.
- Any member failure must rollback the pair and existing business mutation.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- `npm run test:api`: 31 files / 560 tests PASS; `npm run typecheck:api` PASS.
- `./scripts/test-db-008-full-schema.ps1`: exit 0; exact 183 privileges, Audit 12-column INSERT, forced RLS, Grant issue/revocation pair and rollback, clean/reset/reapply, DB-002~007 regressions, scratch cleanup PASS.
- 판정은 verified-Tenant Grant-denial event pair 범위에만 적용한다.

## 8. 변경하지 않은 사항

- Global Audit completeness, unauthenticated failure capture, unimplemented event producers, Audit read/retention/tamper/WORM and actual PACS transfer Audit.

## 9. 결정 및 예외

- `AUD-002-DEC-001`; no exception to Tenant RLS, least privilege or fail-closed rules.

## 10. 잔여 위험과 후속 작업

- Update with observed results; broader required security events remain open regardless of this scoped ticket.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUD-002
Scope: Verified-Tenant Grant issue/revocation denial Audit event pairs only
Changed: Fixed GRANT_DENIED event validation; both denial events recorded atomically; docs/Acceptance/evidence synchronized
Not changed: Global Audit sources/sink, future event producers, schema/grants/read API
Security impact: Same verified Tenant transaction; fixed metadata; no privilege expansion; partial event pair impossible on commit
Tests executed: API 31 files/557 tests; API typecheck; DB-008 full scratch RLS/grant/atomicity/reset/reapply/DB-002~007 regression
Tests not executed: Global Audit coverage and product Viewer/Download/PACS/Integrity paths (not implemented)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Global Audit completeness and no-Tenant authentication failure handling remain open
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS (scoped)` | Recommendation/Acceptance-first implementation; API and DB-008 runtime pair/rollback tests passed; global Audit remains open |
