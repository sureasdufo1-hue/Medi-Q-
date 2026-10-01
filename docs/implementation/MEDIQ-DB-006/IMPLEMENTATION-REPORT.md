# MEDIQ-DB-006 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-006` |
| 제목 | Imaging metadata persistence schema |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` (scoped) |

## 1. 목표

DB-005 Consent/Grant의 optional `imaging_package_id` FK를 완전하게 생성할 수 있도록 승인된 `imaging_packages`와 `study_references` metadata schema를 additive migration으로 구현하고 schema/negative/rollback tests로 검증한다.

## 2. 범위

### 포함

- `imaging_packages`와 `study_references`의 승인된 19 columns, PK/FK/UNIQUE/CHECK/indexes
- DICOM binary를 저장하지 않는 metadata-only schema 및 synthetic fixture tests
- `TC-DB-006-REG-001~008`

### 제외

- Consent/Grant schema(DB-005), APIs/services, authorization, Tenant RLS/table grants
- DICOM retrieval/storage/streaming, PACS import, production storage reference resolution
- 승인 문서에 정의되지 않은 composite Tenant/Patient/Source consistency trigger

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `DATA-MODEL.md` §§28–34; `ERD.md` ImagingPackage/StudyReference | Metadata-only package + study reference, declared states/constraints/indexes | `TC-DB-006-REG-001~008` |
| 보안 | `SECURITY-REQUIREMENTS.md`; `THREAT-MODEL.md` data minimization and DICOM UID handling | No DICOM binary or direct identity fields; UID/storage reference alone do not grant access | Schema allowlist + synthetic-only tests; no access service in scope |
| API·도메인 | `DOMAIN-MODEL.md` ImagingPackage/StudyReference invariants; `OPENAPI.yaml` | Persistence only; package/session patient/source consistency remains application invariant | No endpoint or adapter changes |
| Acceptance | `ACCEPTANCE-TESTS.md` P0 Imaging Metadata Schema Acceptance | Migration/schema/FK/state/count/unique/index/rollback | `TC-DB-006-REG-001~008` |

## 4. 구현 결과

Drizzle schema 및 generated additive migration `0004_imaging-metadata.sql`로 `imaging_packages`와 `study_references`를 추가했다. 두 테이블의 승인된 19개 column, 2 PK, 5 restrictive FK, 4 CHECK, package/Study UID UNIQUE, 8 secondary indexes를 반영했다. DICOM binary 및 direct identity fields는 저장하지 않고 문서에 없는 defaults/추가 cross-row constraints는 넣지 않았다.

DB-005의 nullable package reference가 이 migration을 FK target으로 사용하도록 실행 순서를 선행했다. 격리된 로컬 PostgreSQL에서 repeated migration, exact schema, seven package states, invalid FKs/state/counts, duplicate Study UID, RESTRICT deletes, nullable Study counts, transaction rollback을 확인했다. synthetic fixture 행은 남지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/database/schema/imaging.ts` | ImagingPackage/StudyReference schema and constraints/indexes |
| `services/api/src/database/schema/index.ts` | Imaging schema export |
| `services/api/src/database/migrations/0004_imaging-metadata.sql` | Generated additive migration |
| `services/api/src/database/migrations/meta/_journal.json` | Migration journal entry |
| `scripts/test-db-006-imaging.ps1` | Migration, schema, negative-path and rollback integration test |
| `docs/ACCEPTANCE-TESTS.md` | TC-DB-006-REG-001~008 results |
| `docs/implementation/MEDIQ-DB-006/` | Ticket report and evidence |
| `docs/implementation/README.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md` | Ticket status and dependency order |

## 6. 영향 분석

### Architecture

- Two metadata tables are now present; total approved product schema tables: 10/17. No API/service/worker architecture changed.

### API·Data

- No DICOM binary is stored. DB-005 Consent/Grant package-reference FKs can now be added in the next migration.

### Security·Privacy

- Exact column allowlist excludes DICOM binary and direct patient identity. Study UID/storage reference are metadata, not authorization credentials.
- Application-level package/session Patient/Source consistency, Tenant RLS/grants, consent and authorization remain unimplemented and untested.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` (DB-006 schema scope only; see [TEST-EVIDENCE.md](TEST-EVIDENCE.md))

## 8. 변경하지 않은 사항

- Consent/Grant tables and services, product APIs, WADO/STOW, PACS or Mobile workflows were not changed.
- No DICOM binary or Patient/DICOM payload was inserted into PostgreSQL; integration rows were transaction-scoped and rolled back.

## 9. 결정 및 예외

- Execution order: DB-006 runs before DB-005 because Consent and TransferGrant declare nullable FKs to `imaging_packages`; DB-006 has no reverse dependency on Consent/Grant.
- `storage_ref` remains nullable metadata only; this schema ticket does not create or configure object storage.

## 10. 잔여 위험과 후속 작업

- At DB-006 completion, DB-005 was next because it depended on the optional imaging-package FK target. DB-005 and DB-007 have since passed their schema-only ticket scopes; application-level cross-entity invariants, Tenant RLS/grants, DICOM access/transfer and full P0 E2E remain open. Current next DB ticket is DB-008.

## 11. 최종 판정

```text
Ticket: MEDIQ-DB-006
Scope: Approved ImagingPackage and StudyReference persistence schema only
Changed: Two-table generated migration, schema export, synthetic integration/negative/rollback tests, acceptance and tracking documents
Not changed: Consent/Grant services, APIs, DICOM binary/storage/retrieval, authorization, Tenant RLS/grants or PACS workflow
Security impact: Metadata minimization and restrictive references tested; UID/storage reference do not authorize access
Tests executed: DB-006 migration/schema/negative/rollback; DB-002/003/004 regression; schema/type/migration/API/config/Compose checks (see evidence)
Tests not executed: Product authorization, Tenant RLS/grants, DICOM WADO/STOW, PACS A→B, full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Cross-entity domain invariants and application authorization are not enforced by this schema; seven other approved tables and grants/RLS remain
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `IN PROGRESS` | Imaging metadata FK prerequisite found; scope, traceability and acceptance gate recorded before implementation |
| 2026-09-30 | `PASS` (scoped) | Generated migration and synthetic schema/constraint/rollback evidence passed; Consent/Grant/API workflow remains pending |
