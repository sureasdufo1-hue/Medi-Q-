# MEDIQ-DB-007 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | MEDIQ-DB-007 |
| 제목 | Integrity, provenance and audit evidence schema |
| 분류 | CAPSTONE-P0 |
| 작성일 | 2026-09-30 |
| 상태 | PASS (schema ticket scope only) |

## 1. 목표와 판정 범위

승인된 IntegrityEvidence, ProvenanceRecord, AuditEvent metadata를 세 additive persistence table로 구현하고 Data Model의 정확한 column·finite value·FK/RESTRICT·index를 실제 PostgreSQL에서 검증했다. Synthetic valid/invalid/rollback 경로를 시험했다.

이 Ticket은 persistence schema만 다룬다. 저장된 FAILED 값이 PACS Transfer 완료를 막는지, 데이터가 실제로 hash/compare되는지, 감사 이벤트가 실제 업무행위에서 생성되는지 또는 로그가 append-only/WORM인지 검증한 것이 아니다. 전체 제품·Capstone P0 준비 상태의 PASS도 뜻하지 않는다.

## 2. 요구사항·보안 추적성

| 구분 | 기준 | 구현·검증 |
|---|---|---|
| 요구사항 | DATA-MODEL.md §§35–54; ERD.md evidence relationships | 3 tables, 정확한 37 columns, 선언된 references·indexes; TC-DB-007-REG-001~008 |
| 보안 | SECURITY-REQUIREMENTS.md SEC-INT-001~003, SEC-AUD-001~003, SEC-LOG-001 | FK/finite values/count bounds와 허용 column만 검증; integrity blocking/audit emission은 미구현 |
| 도메인 | DOMAIN-MODEL.md INV-INT-001~004, INV-PROV-001~005, INV-AUD-001~005 | schema-only. Fail-closed 업무 불변조건을 trigger/service로 임의 추가하지 않음 |
| Acceptance | ACCEPTANCE-TESTS.md P0 Integrity, Provenance and Audit Schema Acceptance | TC-DB-007-REG-001~008 모두 실행하고 증거 기록 |

## 3. 구현 결과

- integrity_evidence 13 columns, provenance_records 12 columns, audit_events 12 columns; 총 37 columns.
- 3 primary keys, 12 ON DELETE RESTRICT foreign keys, 승인된 7 CHECK constraints, 13 secondary indexes. 미승인 UNIQUE constraint/default는 없음.
- Integrity status 4개·verification stage 3개, Provenance type 4개·status 4개, Audit result 4개를 시험했다.
- Audit action은 Data Model의 “최소 이벤트 집합”을 보존하도록 임의의 extension action도 수용한다. action exhaustive CHECK는 만들지 않았다.
- source_object_count / destination_object_count의 NULL 또는 non-negative 경계와 모든 optional reference/context fields를 시험했다.
- 정확한 37-column allowlist로 DICOM payload, full medical image, credential/key, raw token 또는 direct patient identity column을 추가하지 않았음을 확인했다.
- 0006 migration을 반복 적용했고 DB migration ledger 7개 및 승인된 17/17 product schema tables를 확인했다. 기존 local DB volume은 reset하지 않았다.
- DB-002/003/004/006 회귀 및 DB-005의 additive-forward regression도 ledger=7/table=17 상태에서 통과했다.

## 4. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| services/api/src/database/schema/integrity.ts | IntegrityEvidence schema, status/stage/count checks, indexes |
| services/api/src/database/schema/provenance.ts | Provenance schema, type/status checks, FK/indexes |
| services/api/src/database/schema/audit.ts | AuditEvent metadata schema, result check, timeline/context indexes |
| services/api/src/database/schema/index.ts | 세 schema export |
| services/api/src/database/migrations/0006_integrity-provenance-audit.sql | additive generated migration |
| services/api/src/database/migrations/meta/_journal.json | migration entry 6 |
| scripts/test-db-007-evidence.ps1 | exact inventory, synthetic negative/FK/delete/rollback integration checks |
| scripts/test-db-005-consent-grant.ps1 | 후속 승인 migration을 허용하도록 baseline inventory 검사 조정; 17-table 상태에서 재시험 |
| scripts/README.md | DB-002~007 통합 검증 명령 추가 |
| docs/ACCEPTANCE-TESTS.md | DB-007 acceptance와 실행 결과 |
| docs/implementation/MEDIQ-DB-007/ 및 현황 문서 | 구현·시험 기록과 최신 17/17·다음 Ticket 상태 |

## 5. 보안·개인정보 영향

- 참조 누락은 12개 FK로 거부되며, 모든 참조 parent는 delete RESTRICT로 evidence cascade 삭제를 방지한다.
- 유한 integrity/provenance/result 값과 음수 object count는 DB CHECK에서 거부한다.
- Generic audit resource_id는 UUID reference일 뿐 독립 권한이 아니다. action은 확장 가능하며 저장 여부가 실제 행위·주체 인증을 보증하지 않는다.
- 감사 최소화는 column inventory 기준이다. 애플리케이션 log redaction, immutable retention, tamper detection, signature, actor authenticity, Tenant RLS를 이 Ticket에서 구현하지 않았다.
- Integrity FAILED → Transfer/Provenance COMPLETED 금지와 Source/Destination-session binding은 DB row constraint로 증명하지 않았고 후속 application/security Acceptance가 fail-closed로 집행해야 한다.
- Synthetic 값만 사용했다. 실환자정보·운영 DICOM·Secret은 증거에 포함하지 않았다.

## 6. 미구현·잔여 위험

- Source/Destination digest 산출·비교·검증 worker 및 failed-integrity blocking
- Session↔Package↔Study↔Hospital cross-row 업무 binding
- Provenance/Audit event writer, append-only/WORM, tenant-scoped read permissions/RLS
- PACS A→MediQ→B, STOW, destination verification, full E2E/P0 acceptance

## 7. 최종 판정

상세 명령·출력과 regression 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)에 기록했다.

```text
Ticket: MEDIQ-DB-007
Scope: Approved Integrity/Provenance/Audit persistence schema, constraints, indexes, synthetic integration
Changed: Three tables, migration, schema exports, repeatable rejection/rollback test, DB-005 forward regression compatibility, records
Not changed: Hash calculation, authorization, failed-transfer blocking, audit/provenance writers, WORM/RLS, PACS flow
Security impact: Schema-level references and value bounds only; no policy-enforcement or audit-integrity claim
Tests executed: DB-007 integration; DB-002/003/004/006 regressions; DB-005 forward regression; migration/API/config/Compose checks
Tests not executed: Product integrity/Audit/Provenance contract, RLS, PACS transfer and full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Cross-row authorization and trusted event generation/enforcement remain open
Status: PASS (Ticket scope only)
```

## 8. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | IN PROGRESS → PASS | additive schema/migration, synthetic negative·rollback, DB regressions and project checks completed |
