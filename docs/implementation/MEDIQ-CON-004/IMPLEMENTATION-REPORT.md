# MEDIQ-CON-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-004` |
| 제목 | Synthetic patient claim-bound Consent approval API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` (scoped) |

## 1. 목표

합성 P0에서 승인 요청자가 아닌, 서명 검증된 합성 환자 OIDC principal만 해당 Session/Consent의 `PENDING` 상태를 기술적으로 승인할 수 있도록 보호 API와 원자적 상태 전이를 구현한다.

## 2. 범위

### 포함

- 검증된 JWT에서 선택적 `mediq_patient_ref_id` UUID claim을 추출하며, 없는 claim은 환자 승인 endpoint에서 거부한다.
- Active tenant-level `USER` Actor만 허용하고 병원 소속 사용자, `SERVICE`, requester와 동일한 Actor를 거부한다.
- server-owned Session·Consent의 IDs, PatientReference, 상태와 만료를 verified IAM-002 Tenant/RLS transaction에서 재확인한다.
- Consent `PENDING→ACTIVE`, Session `CONSENT_PENDING→CONSENTED`, `CONSENT_APPROVED` Audit를 한 transaction으로 처리한다.
- 동일 완료 요청은 재생(replay)하고 추가 Audit를 만들지 않으며 동시 요청은 Session advisory lock으로 직렬화한다.
- `consents(status, issued_at, updated_at)`에만 additive UPDATE grants를 부여하고 migration catalog와 RLS를 검증한다.
- Acceptance `TC-CON-004-API-001~010` 및 Ticket별 보고서·시험 증거를 동기화한다.

### 제외

- 실제 환자 신원확인·법적 동의·설명/서명 증거·운영 IdP 연계
- Consent를 Authorization `ALLOW`, TransferGrant, Viewer/Download/PACS 권한으로 승격하는 행위
- 환자/병원 mapping, 이미지 조회·전송, PACS 호출, Cloud Viewer, DB table/schema 추가
- 입력으로 전달된 body/query/header/UI의 patient reference를 principal claim 대신 신뢰하는 행위

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `PDEC-001`, `CON-004-DEC-001` | 권고안 선행 기록, synthetic claim-bound technical approval | 본 보고서 및 decision log |
| 요구사항 | `REQ-CON-003/005`, `AT-FUNC-006` | 합성 상태 전이만 다루며 no-consent Grant denial은 미완료 유지 | `TC-CON-004-API-001~010` |
| 보안 | `SEC-CONSENT-006`, `SEC-API-001/002`, `SEC-DB-005/006`, `SEC-AUD-001`, `THR-004` | Claim source, actor separation, exact binding, atomicity, least privilege | API/DB/RLS/security tests |
| API·도메인 | `OPENAPI.yaml`, `ConsentArtifact`, `ExchangeSession`, `IAM-002` | approve endpoint와 제한된 허용 전이 | API/domain/integration tests |
| Acceptance | `ACCEPTANCE-TESTS.md` | 10개 합성 승인 성공·거부·재시도·원자성·권한 사례 | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

서명·issuer·audience가 검증된 OIDC token의 선택적 `mediq_patient_ref_id` claim으로만 합성 PatientReference를 확인한다. Verified IAM-002 transaction에서 tenant-level active USER, requester 분리, Session·Consent exact binding, state·expiry를 검증한다. 승인 성공 시 Consent `PENDING→ACTIVE`, Session `CONSENT_PENDING→CONSENTED`, `CONSENT_APPROVED` Audit를 원자적으로 commit하고, 같은 완료 요청은 Audit 중복 없이 replay한다. Session advisory lock으로 동일 Session의 동시 승인을 직렬화한다. Input body/query/patient header는 거부한다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authentication/*` | 검증된 synthetic PatientReference claim만 principal에 선택적으로 전달 |
| `services/api/src/consent/*` | technical Consent approval domain/service, conditional persistence, protected HTTP route |
| `services/api/src/exchange/*` | atomic Session transition과 approval Audit writer |
| `services/api/src/database/migrations/0014_consent_approval_column_grants.sql`, `meta/_journal.json` | Consent UPDATE 3열만 추가; migration ledger 15 |
| `services/api/Dockerfile`, `scripts/test-db-008-full-schema.ps1` | 새 integration test 이미지·DB-008 연결 및 exact 125 grant/15 migration checks |
| `tests/api/*`, `tests/database/consent-approval-api-runtime.integration.test.mjs` | signed claim, domain, success/denial/replay/concurrency/rollback/least-privilege tests |
| Consent/Exchange/AUT database regression tests | 최신 125-row privilege baseline으로 predecessor regression 갱신 |
| `docs/OPENAPI.yaml`, `docs/ACCEPTANCE-TESTS.md`, `docs/POLICY-DECISION-LOG.md` | API contract, ten PASS Acceptance, decision history |
| `docs/implementation/README.md` 및 `MEDIQ-CON-004/*` | 구현 색인·실행보고서·시험 증거 동기화 |

## 6. 영향 분석

### Architecture

- OIDC verified principal에 synthetic patient reference claim을 선택적으로 전달한다. Claim 부재 시 기존 일반 API 인증 동작은 유지하고 Consent 승인만 거부한다.

### API·Data

- migration `0014`는 기존 RLS/table/schema를 바꾸지 않고 Consent UPDATE 3열만 추가한다. Local ledger=15, product tables=17, aggregate catalog=`17/44/15/29`, runtime exact column privileges=125 확인.

### Security·Privacy

- Patient claim은 서명·issuer·audience 검증 뒤에만 사용하며 tenant-level Actor membership과 동일 transaction을 요구한다.
- 승인 상태와 Audit를 atomic하게 기록한다. 실패 시 fail-closed/rollback하며 이 상태만으로 별도 리소스 접근을 허용하지 않는다.
- 합성 데이터만 사용한다. 실제 환자정보·Secret·운영 Credential은 저장하거나 evidence에 포함하지 않는다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록된 API, type, migration, full DB-008/DB-002~007 gates PASS.

## 8. 변경하지 않은 사항

- 법적 동의 및 실환자 identity proofing은 지원하지 않는다.
- Consent 승인만으로 Authorization, Grant, Viewer, Download 또는 PACS side effect는 발생하지 않는다.
- Full P0 E2E/GATE-IMP-05를 완료로 주장하지 않는다.

## 9. 결정 및 예외

- `CON-004-DEC-001`은 `PDEC-001` 상시 권고안 정책과 사용자의 지시에 따른 채택 권고안이다.
- 본 범위는 test issuer가 넣은 서명 claim을 합성 identity binding으로만 해석한다.

## 10. 잔여 위험과 후속 작업

- 실제 환자 identity-proofing, 법무·보안 검토와 운영 claim 발급 절차는 별도 후속 결정·승인이 필요하다.
- Consent 기반 Authorization/Grant denial enforcement와 임상/PACS workflow는 후속 Ticket에서 검증해야 한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-004
Scope: Synthetic-only signed OIDC patient-reference claim-bound Consent technical approval API, exact Session/Consent binding, atomic state/Audit transition, replay/concurrency and least-privilege column grants
Changed: Consent approval application/domain/persistence/controller; verified optional OIDC claim; Session transition/Audit writer; migration 0014; tests, API contract, security/acceptance and project status records
Not changed: Real identity proofing/legal consent, Authorization/Grant, Viewer/Download, PACS/DICOM transfer, product A→MediQ→B E2E
Security impact: Fail-closed synthetic PatientReference claim; verified Tenant/RLS transaction; exact binding and expiry/state checks; atomic Audit; exact column grants; no broader access from Consent ACTIVE
Tests executed: npm run test:api (20 files/361 tests); npm run typecheck:api; npm run db:migrations:check; npm run test:db-migrations (6 tests); ./scripts/test-db-008-full-schema.ps1 -EnvFile .env; node --check tests/database/consent-approval-api-runtime.integration.test.mjs
Tests not executed: Production OIDC/real identity proofing and legal review; Hospital A/B PACS and full product transfer E2E
Evidence: TEST-EVIDENCE.md — exact commands and scoped results
Implementation record: IMPLEMENTATION-REPORT.md; docs/implementation/README.md index
Remaining risks: Synthetic claim is not proof of real identity or legally effective consent; Grant/Authorization enforcement and end-to-end image exchange remain incomplete; overall P0 remains BLOCKED
Status: PASS (scoped); overall P0: BLOCKED
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` (scoped) | Recommendation/Acceptance first; signed synthetic OIDC approval API, atomic Consent/Session/Audit, replay/concurrency, rollback, exact 125 privileges, schema/regression evidence recorded. Legal consent, Authorization/Grant and image exchange remain out of scope. |
