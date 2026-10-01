# MEDIQ-DB-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-005` |
| 제목 | Consent and transfer grant persistence schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | 2026-09-30 |
| 상태 | `PASS` (schema ticket scope only) |

## 1. 목표와 판정 범위

승인된 Consent evidence와 scoped TransferGrant metadata를 네 개의 additive persistence table로 구현하고, 승인된 shape·제약·색인과 synthetic negative/rollback 경로를 실제 PostgreSQL에서 검증했다. DB-006을 먼저 적용해 선택적 imaging-package 외래키의 선행 테이블을 마련했다.

이 판정은 DB persistence schema Ticket에 한정된다. MediQ 제품의 Consent 업무흐름, Authorization, PACS 교환 또는 전체 P0 준비 상태가 PASS라는 뜻이 아니다.

## 2. 요구사항·보안 추적성

| 구분 | 기준 | 구현·검증 |
|---|---|---|
| Data Model / ERD | `DATA-MODEL.md` §§18–27; Consent/Grant relationships | 승인된 네 테이블·31 columns, 관계, 유한 상태/행위/scope, 인덱스; TC-DB-005-REG-001~008 |
| Security | `SECURITY-REQUIREMENTS.md` SEC-CONSENT-001~004, SEC-GRANT-001~006 | Consent와 Authorization 분리, metadata-only persistence, FK/범위 표기 검증. 정책 집행 서비스는 미구현 |
| Domain / API | `DOMAIN-MODEL.md`; `OPENAPI.yaml` | API/서비스 변경 없음. 식별자·상태·scope 자체는 권한으로 취급하지 않음 |
| Acceptance | `ACCEPTANCE-TESTS.md` P0 Consent and Transfer Grant Schema Acceptance | 8개 DB-005 acceptance 항목 모두 실행 결과 기록 |

## 3. 구현 결과

- Drizzle schema에 `consents`, `consent_actions`, `transfer_grants`, `transfer_grant_scopes` 추가.
- Generated additive migration `0005_consent-grant.sql` 및 migration journal index 5 등록.
- 31 columns, 4 primary keys, 13 RESTRICT foreign keys, 6 CHECK constraints, 3 UNIQUE constraints와 승인 인덱스 13개를 검증.
- Consent 상태 5개, Consent action 4개, Grant 상태 4개, Grant scope 4개 및 positive version / grant expiry 제약을 검증.
- Session당 ACTIVE Consent 1개를 보장하는 partial unique index와 Consent action·Grant scope 중복 방지를 검증.
- DB-005 최초 실행 시 ledger 6개, 승인 제품 table 14개에서 검증했다. DB-007 이후 forward regression을 다시 수행해 ledger 7개·17/17 product tables에서도 DB-005 스키마/fixture 검증이 통과했다. Runtime role의 migration ledger 접근 거부도 확인했다.
- 전체 테스트 행은 synthetic 값이며 모든 fixture transaction이 rollback되어 persistent test row가 0개임을 확인.

## 4. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/consent.ts` | Consent/Grant 네 테이블, FK, CHECK/UNIQUE, 인덱스 |
| `services/api/src/database/schema/index.ts` | Consent schema export |
| `services/api/src/database/migrations/0005_consent-grant.sql` | 생성된 additive SQL migration |
| `services/api/src/database/migrations/meta/_journal.json` | migration entry 5 |
| `scripts/test-db-005-consent-grant.ps1` | 격리 DB에서 migration·schema·거부·rollback 검증 |
| `scripts/README.md` | DB schema integration script 사용 안내 |
| `docs/ACCEPTANCE-TESTS.md` | TC-DB-005-REG-001~008 결과 연결 |
| `docs/implementation/MEDIQ-DB-005/` | 구현 보고서 및 실행 증거 |
| `docs/implementation/README.md` 외 현황 문서 | DB-005 당시 14/17 상태와 후속 DB-007 완료 상태 동기화 |

## 5. 보안·개인정보 영향

- Tenant, Patient, Hospital, Session, Consent, Grant, Actor, ImagingPackage 관계는 선언된 FK와 RESTRICT 삭제 정책으로 참조 오류 및 parent 삭제를 거부한다.
- 유한 상태/action/scope, positive consent version, grant 만료시각 순서를 CHECK로 제한한다.
- 정확한 승인 column allowlist와 nullability를 비교하여 DICOM payload, 환자 직접 식별정보, key/credential/secret 필드가 추가되지 않았음을 확인했다.
- 이 persistence schema는 Consent 유효성·철회, Authorization 결정, Tenant 격리, 대상/병원/package 간 업무 일관성, grant scope 집행 또는 상태전이를 수행하지 않는다. 해당 경로의 허용/거부는 별도 서비스·RLS·API·Acceptance Ticket에서 구현·검증해야 한다.
- 실환자 자료, 운영 DICOM, secret 또는 credential을 테스트나 보고서에 넣지 않았다.

## 6. 미구현·미검증 범위

- Consent 생성·열람·거부·철회 업무 API, Grant 발급·폐기·사용 및 Authorization Engine
- Tenant RLS/table grants, cross-row consistency enforcement, audit/provenance writer
- DICOM Viewer/Download, WADO-RS/STOW-RS 및 Hospital A→MediQ→Hospital B 제품 흐름
- 전체 P0 Acceptance 및 실제 병원 운영 준비

## 7. 후속 위험

Schema의 FK만으로는 Consent의 session/patient/source/destination/package 일치나 Grant와 Consent/session/recipient/scope의 일치를 보장하지 않는다. 권한 판정은 기본 거부·실패 폐쇄로 별도 구현하고, DB-008 이후 승인된 application/security Ticket에서 cross-entity invariants, tenant grants/RLS 및 거부 경로를 시험해야 한다.

## 8. 실행 및 최종 판정

실행 명령·실제 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록했다. DB-005 통합 검증, DB-002~004/006 회귀, migration/API/config/Compose 기준선 검증이 통과했다.

```text
Ticket: MEDIQ-DB-005
Scope: Consent/Grant metadata schema, constraints, indexes, synthetic integration
Changed: Four tables, migration, schema export, repeatable negative/rollback test, evidence and status documents
Not changed: Consent/Authorization/Grant services, API, RLS/table grants, DICOM transfer, product E2E
Security impact: Schema guards and RESTRICT references only; no authorization enforcement claim
Tests executed: DB-005 integration; DB-002/003/004/006 regressions; migration, API, app-config, Compose checks
Tests not executed: Product consent/auth/grant contract, RLS, PACS, security and full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Cross-entity business consistency and access-control enforcement remain open
Status: PASS (Ticket scope only)
```

## 9. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | IN PROGRESS → PASS | DB-006 FK prerequisite 확인 후 스키마·migration 구현, 실 DB synthetic negative/rollback 검증, 회귀 및 문서 동기화 |
