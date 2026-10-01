# MEDIQ-AUD-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUD-001` |
| 제목 | Metadata-only common Audit event writer |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS (scoped)` — current Session/Consent/Grant/PatientMapping-denial writer boundary and its tested call paths only |

## 1. 목표

기존 업무별 Audit INSERT를 검증된 metadata-only `AuditEvent`와 공통 parameterized PostgreSQL writer 뒤에 둔다. 업무별 이벤트 의미, 원자성 및 정확한 12-column INSERT 권한을 유지하고, 범용 임의 이벤트·전역 Audit 완전성은 이 Ticket에서 주장하지 않는다.

## 2. 범위

### 포함

- `AUD-001-DEC-001`과 9개 scoped Acceptance를 코드 변경 전에 정책 로그/Acceptance에 기록
- 고정 event/action/result/resource/reason allowlist, UUID·timestamp 검증, unknown-field 거부
- transaction-neutral `PostgresAuditEventWriter`; 호출자가 전달한 동일 `PoolClient`만 사용
- 기존 업무별 Session/Consent/Grant/PatientMapping-denial adapter 메서드를 공통 writer에 위임
- Unit·SQL contract·runtime PostgreSQL/RLS·rollback regression

### 제외

- `audit_events` schema/migration/grant 변경 및 Audit query/read API·route
- 모든 `REQ-AUD`/`SEC-AUD` 이벤트의 전역 호출부 완전성, 미인증/global failure 수집
- retention, tamper resistance, WORM, 외부 SIEM/audit sink
- PACS transfer coordinator, 실제 STOW, 완전한 A→MediQ→B Audit E2E

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `PDEC-001`, `AUD-001-DEC-001` | 권고안·Acceptance 선작성, 제한된 공통 writer 채택 | [POLICY-DECISION-LOG.md](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-AUD-001~003` | 현재 Audit reference/event 계약과 data minimization | `TC-AUD-001-WRITER-001~009`; 전역 coverage 별도 미완료 |
| 보안 | `SEC-AUD-001~003`, `SEC-DB-005/006`, `SEC-TEN-005` | fixed event metadata, Tenant RLS, 최소 INSERT 권한 | API + DB-008 runtime regression |
| Data | `DATA-MODEL.md` AuditEvent, DB-007/008 | 기존 schema/12-column audit INSERT grant 유지 | DB catalog exact 12-column verification |
| Acceptance | `ACCEPTANCE-TESTS.md` | 9개 writer-specific positive/negative/rollback/scope cases | 모든 scoped case 증거는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

- `AuditEvent`는 현재 실제 저장 중인 이벤트 조합만 허용하고, Actor/Tenant/Session/resource/correlation UUID 및 시간 형식을 검증한다. 추가 필드(열거형·non-enumerable·symbol 포함)는 거부한다.
- `PostgresAuditEventWriter`는 검증된 이벤트의 기존 12개 컬럼만 12개의 bind parameter로 INSERT한다. transaction 시작·완료를 하지 않고, 드라이버 오류와 row-count 이상을 fixed `AUDIT_EVENT_PERSISTENCE_FAILED`로 변환한다.
- `PostgresExchangeSessionAuditRepository`의 기존 메서드와 결과 의미를 유지하면서 공통 writer에 위임한다. Grant 발급은 `AUTHORIZATION_GRANTED/ALLOW`와 `GRANT_CREATED/SUCCESS`를 각각 1회 기록하며 상위 transaction이 원자성을 보유한다.
- Audit 실패는 기존 업무 서비스의 동일 transaction rollback으로 이어진다. DB schema·migration·runtime grant·route/API는 변경하지 않았다.

## 5. 변경 파일

| 경로 | 변경 |
|---|---|
| `services/api/src/audit/domain/audit-event.ts` | closed, immutable metadata-only Audit event model/allowlist |
| `services/api/src/audit/persistence/postgres-audit-event-writer.ts` | exact 12-column parameterized writer와 fixed persistence error |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | 기존 업무별 Audit adapter를 공통 writer로 위임 |
| `tests/api/audit-event-writer.test.mjs` | allowlist·invalid payload·immutability·SQL/error tests |
| `tests/api/exchange-session-creation.test.mjs`, `grant-issue.service.test.mjs`, `grant-revocation.service.test.mjs`, `pacs-import-mapping-gate.test.mjs` | bound parameters를 기준으로 기존 이벤트/rollback SQL contract assertions 동기화 |
| `tests/database/consent-approval-api-runtime.integration.test.mjs`, `consent-request-api-runtime.integration.test.mjs`, `grant-issue-api-runtime.integration.test.mjs` | fault injection을 SQL action literal 대신 bound value로 확인 |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/implementation/README.md` | recommendation, Acceptance, traceability와 status 동기화 |

## 6. 영향 분석

### Architecture

- internal repository boundary만 정리했다. writer는 route에 등록되지 않았고 verified IAM-002 transaction wrapper를 우회하지 않는다.
- caller-owned transaction은 계속 Session/Consent/Grant 업무 서비스가 소유한다. 네트워크/DICOM 호출은 추가하지 않았다.

### API·Data

- API route, OpenAPI, DB schema, migration, seed, RLS policy 및 grant는 변경하지 않았다.
- DB-008에서 전체 runtime column privilege inventory는 183으로 유지되고 `audit_events`에는 기존 12개 컬럼 INSERT만 있었다.

### Security·Privacy

- Tenant row isolation은 기존 forced RLS가 강제한다. 잘못된 tenant context Audit write는 업무 row와 함께 rollback 됨을 runtime에서 확인했다.
- 자유문자·환자 local ID·DICOM UID/payload·credential/token/key를 writer payload로 받지 않는다. DB driver detail은 fixed error에 포함되지 않는다.
- writer allowlist는 전역 event coverage를 보장하지 않는다. verified Tenant context가 없는 인증 실패를 기록한다고 주장하지 않는다.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- `npm run test:api`: 31 files / 556 tests PASS
- API typecheck, Drizzle migration check, migration-runner 6 tests PASS
- `./scripts/test-db-008-full-schema.ps1`: exit 0; exact runtime grants/RLS, EXC/Consent/Grant atomic Audit regressions, reset/reapply, DB-002~007 regressions 및 scratch cleanup PASS
- 판정은 common-writer scoped Acceptance에만 적용된다.

## 8. 변경하지 않은 사항

- Global security-event completeness, unauthenticated failure capture, Audit query/read API, retention/WORM/tamper resistance/external sink
- Product PACS coordinator, STOW, provenance/integrity source-to-destination completion 및 overall P0 Golden E2E
- Live DB atomicity for PatientMapping-denial branch (현재 이 경로는 API SQL-contract/mock Acceptance만 통과)

## 9. 결정 및 예외

- `AUD-001-DEC-001`은 `PDEC-001` 사용자 상시 지침에 따라 recommendation/Acceptance 선작성 후 채택되었다.
- `PAT-002-DEC-001/002`와 PAT-002 Acceptance는 기존 기록을 유지하며, DB-008 회귀에서 prior scoped tests로 다시 PASS했다. 본 Ticket은 PAT-002 권한을 넓히지 않는다.
- 이 기록은 요구사항 문서를 대체하지 않으며 global Audit pending 상태를 닫지 않는다.

## 10. 잔여 위험과 후속 작업

- 현재 event writer가 모든 요구사항 이벤트에서 호출된다는 보장은 없다. `MEDIQ-AUD-002`와 global `STC-AUD-001`이 남아 있다.
- Tenant context 없이 발생하는 인증 실패는 현재 tenant-RLS 기반 저장소에 기록할 수 있다고 가정하지 않는다. 별도 승인 범위의 안전한 sink/design이 필요하다.
- Mapping denial의 runtime PostgreSQL/RLS atomicity와 PACS transfer operation writer 통합은 이번 범위에서 완료되지 않았다.
- Query API/read, retention, append-only/tamper evidence/WORM, production audit export가 미구현이다.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUD-001
Scope: Existing metadata-only Session/Consent/Grant/PatientMapping-denial writer paths
Changed: Validated AuditEvent allowlist and shared parameterized PostgreSQL writer; existing adapter delegates; docs/tests updated
Not changed: Schema/grants/API/read, global event completeness, unauthenticated failure capture, retention/WORM, PACS E2E
Security impact: Forced Tenant RLS and exact existing 12-column insert; fixed errors; atomic caller transaction preserved
Tests executed: API 31 files/556 tests; typecheck; migration check/6 tests; DB-008 full scratch RLS/catalog/atomicity/reset and DB-002~007 regression
Tests not executed: Global Audit coverage, Audit read/retention/tamper resistance, live PACS mapping-denial persistence and full A→B product E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md and TEST-EVIDENCE.md
Remaining risks: Global event coverage and no-Tenant authentication-failure handling remain open
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS (scoped)` | Recommendation-first common writer, current call paths, API/runtime regression and evidence recorded; global Audit completeness remains open |
