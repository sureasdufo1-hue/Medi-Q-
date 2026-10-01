# MEDIQ-CON-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-005` |
| 제목 | Synthetic patient claim-bound Consent withdrawal API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — Ticket 범위에 한정 |

## 1. 목표와 결과

승인된 `CON-005-DEC-001`에 따라 합성 P0에서 환자 claim에 결속된 Consent 철회 경로를 구현했다. 환자가 검증된 OIDC `mediq_patient_ref_id`를 통해 자신의 Session/Consent binding을 확인받고, 유효한 technical Consent를 `WITHDRAWN`으로 기록하며 단일 Audit과 원자적으로 저장한다.

이 API는 실제 환자 본인확인·법적 철회를 입증하지 않는다. 이미 전달·다운로드되었거나 오프라인 기기에 저장된 영상의 회수·삭제·키 폐기를 제공하지 않는다.

## 2. 범위

### 포함

- `POST /exchange-sessions/{sessionId}/consents/{consentId}/withdraw` — body 없음
- 서명·issuer·audience·시간 검증을 통과한 OIDC principal의 PatientReference claim만 사용하고, Tenant-level active `USER`, 비요청자 조건을 확인
- 동일 Tenant/RLS transaction에서 Session/Consent ID, PatientReference, source/destination binding을 재검증하고 Session advisory lock 사용
- `ACTIVE → WITHDRAWN`만 허용; Consent/Session 만료 또는 terminal Session 상태는 철회 기록을 막지 않음
- 동일 완료 replay는 성공 응답하되 Consent/Audit을 재기록하지 않음
- Consent 상태·`withdrawn_at`·`updated_at`과 성공 `CONSENT_WITHDRAWN` Audit을 원자적으로 commit
- migration `0015`에서 `mediq_runtime`에 `consents.withdrawn_at`의 column-level UPDATE 권한만 추가
- 13개 HTTP/PostgreSQL/RLS·보안 Acceptance 및 이전 DB 회귀 기대값 동기화

### 제외

- real identity, 법적 Consent/철회, 환자 통지, UI·로그인 제공자
- ExchangeSession 상태 전이, TransferGrant 발급/회수, Viewer/Download/PACS 호출
- 완료된 전달·다운로드·오프라인 복사본의 원격 회수
- schema 변경, PatientMapping write, 새로운 Tenant 권한·table-wide privilege

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 권고·정책 | `CON-005-DEC-001`, `PDEC-001` | 권고안과 대안·경계를 구현 전에 기록 | `docs/POLICY-DECISION-LOG.md` |
| 요구사항 | `REQ-CON-004`, `AT-FUNC-007` | synthetic technical withdrawal | `TC-CON-005-API-001~013` |
| 보안 | `SEC-CONSENT-002/007`, `SEC-API-001/002`, `SEC-DB-005/006`, `SEC-AUD-001`, `THR-004` | claim binding, fail-closed, Tenant RLS, least privilege, atomic Audit | signed OIDC/JWKS + runtime PostgreSQL/RLS test |
| API·도메인 | `OPENAPI.yaml`, Domain/Data Model | expiry-independent immutable domain transition; no body/query identity input | unit, repository and HTTP tests |
| Data permission | migration `0015_consent_withdrawal_column_grant` | `UPDATE(withdrawn_at)` only | exact runtime catalog: 126 grants |

## 4. 구현 결과

- 철회 성공 시 `200`, `Cache-Control: no-store`, correlation ID와 `WITHDRAWN` Consent를 반환한다. 재생에는 `Idempotency-Replayed: true`를 추가한다.
- 누락·다른 환자 claim, 요청자와 동일 actor, Hospital-bound actor, SERVICE/inactive actor, 다른 Tenant, Session/Consent binding 오류는 안전한 deny로 처리한다. PENDING/EXPIRED/REJECTED 및 timestamp 불일치는 conflict다.
- 철회 로직에는 Session UPDATE, Grant/Image/PACS service dependency가 없다. Session 상태와 Grant row는 시험에서 불변·미생성으로 확인했다.
- Domain transition은 immutable snapshot을 반환하며 기존 ACTIVE 객체를 바꾸지 않는다.
- 상태 변경은 conditional UPDATE로 한번만 수행한다. Consent/Audit/COMMIT fault injection에서 전체 transaction rollback을 확인했다.
- schema migration은 추가하지 않았고 runtime privileges는 기존 125개에서 `consents.withdrawn_at UPDATE` 1개만 증가했다. Forced RLS와 table-level 권한 부재를 유지했다.

## 5. 주요 변경 파일

| 파일/영역 | 변경 내용 |
|---|---|
| `services/api/src/consent/` | immutable withdrawal, repository conditional update, service, HTTP route/module wiring |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | `CONSENT_WITHDRAWN` 성공 Audit 기록 |
| `services/api/src/database/migrations/0015_consent_withdrawal_column_grant.sql` 및 journal | 최소 column privilege migration |
| `tests/api/consent-artifact.test.mjs`, `tests/api/postgres-consent-repository.test.mjs` | transition 및 SQL/expiry/conflict unit tests |
| `tests/database/consent-approval-api-runtime.integration.test.mjs` | signed OIDC/JWKS HTTP→PostgreSQL/RLS approval+withdrawal acceptance |
| `tests/database/*`, `scripts/test-db-008-full-schema.ps1` | 126 exact grant 및 16 migration baseline/regression 동기화 |
| `docs/` | policy, requirements, security, threat, OpenAPI, Acceptance, plan/schedule 및 Ticket 증거 동기화 |

## 6. 영향 분석

### Architecture / API / Data

기존 Consent 모듈에 endpoint 하나를 추가했다. 새 table·schema·domain aggregate는 없다. Migration ledger는 15에서 16으로, synthetic local runtime privilege catalog는 125에서 126으로 바뀌었다.

### Security / Privacy

서명된 claim과 서버 소유 Session/Consent의 exact binding을 IAM-002 active Tenant transaction 및 forced RLS 안에서 확인한다. Consent와 Authorization/Grant는 여전히 분리된다. 동일 Session advisory lock은 Consent workflow 내부 경쟁을 직렬화한다.

미래 Grant 발급 경로도 같은 lock 안에서 Consent를 다시 읽도록 별도 Grant Acceptance가 필요하다. 이번 Ticket은 그 미래 경로와 동시 철회/Grant 경합을 검증하지 않았다. 기완료된 전송, 오프라인 데이터 및 법적 효력은 이 endpoint의 보장 밖이다.

### 변경하지 않은 사항

실환자 자료·실제 PACS Credential·운영 DICOM을 사용하지 않았다. `mediq_runtime`에 table-wide, PUBLIC/default, DDL, DELETE, TRUNCATE 또는 `withdrawn_at` 외의 추가 UPDATE 권한을 주지 않았다. source-of-record, Tenant/RLS 범위 및 P0 E2E 차단 판정은 유지했다.

## 7. 실행 및 검증 요약

세부 명령·결과·초기 harness 실패와 수정 내역은 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록했다.

- API regression: 20 files / 371 tests — PASS
- API typecheck — PASS
- migration runner: 6/6; Drizzle migration check — PASS
- full DB-008: clean/repeat/reset/reapply, CON-005 signed OIDC/HTTP/PostgreSQL/RLS, 126 exact grants 및 DB-002~007 persistent development regression — PASS
- Ticket Acceptance `TC-CON-005-API-001~013` — PASS (synthetic technical scope)

## 8. 잔여 위험 및 후속 작업

- User-signed patient claim은 시험 IdP의 합성 claim이며 실제 환자 identity-proofing이나 법적 Consent를 증명하지 않는다.
- 철회 기록은 이미 전달된 원격 PACS 데이터, 앱 다운로드 또는 offline copy를 회수하지 않는다.
- Grant 발급 구현은 Consent를 같은 advisory lock/transaction에서 재확인하고 `WITHDRAWN`이면 거부해야 한다.
- Authorization/Grant enforcement, PACS Preflight/STOW, Viewer/Download 및 제품 A→MediQ→B E2E가 미완료다. 전체 P0 기술 준비는 계속 `BLOCKED`다.

## 9. 최종 판정

```text
Ticket: MEDIQ-CON-005
Scope: Synthetic claim-bound Consent withdrawal API and one exact column grant
Changed: Domain, API, persistence, atomic Audit, migration, tests and normative docs
Not changed: Legal consent, identity proofing, Grant revocation, PACS/image/Session state, remote recall
Security impact: Fail-closed claim and Tenant binding; forced RLS; exact 126 column grants
Tests executed: API 20 files/371; typecheck; migration tests 6/6; DB-008 + DB-002~007
Tests not executed: real identity/legal validation, future Grant concurrency, real PACS/product A→B
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Synthetic-only identity; prior delivery/offline data not remotely revocable; Grant path remains separate
Status: PASS (scoped Ticket only); overall P0: BLOCKED
```

## 10. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | 권고안 선기록 후 13 Acceptance, 실제 HTTP/PostgreSQL/RLS 및 DB regression 통과 |
