# MEDIQ-AUT-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-005` |
| 제목 | Trusted PostgreSQL authorization evidence reader |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — Ticket의 internal Study evidence-reader Acceptance 범위만 |

## 1. 목표

IAM-002가 membership을 검증한 동일 PostgreSQL transaction에서 Session, Consent/Action, Grant/Scope, ImagingPackage, StudyReference 사실을 서버 저장소에서 읽고, AUT-003의 정책 및 AUT-004의 내부 executor와 실제 `mediq_runtime`으로 결합 검증한다.

## 2. 범위

### 포함

- 내부 UUID만 parameterized binding하는 단일 PostgreSQL Study evidence query와 row-to-policy facts mapping
- child resource 근거가 현재 schema에 없을 때 `SERIES`/`INSTANCE`를 query 없이 거부
- 7개 evidence table에 대한 정확한 41개 column-level `SELECT` migration
- 실제 IAM-002 context → `AuthorizationGatedOperationExecutor` → `AuthorizationEngine` → `ResolvedObjectAuthorizationPolicy` → PostgreSQL reader 통합시험
- disposable DB-008 scratch의 synthetic A/B/C fixtures, 최소권한/RLS/pool 검증 및 실행기 기대값 동기화
- 요구사항·보안·Acceptance·Architecture·Threat Model·구현 계획의 추적성 기록

### 제외

- Controller, `AppModule`, HTTP/OpenAPI route, HTTP safe-error/BOLA (`AT-SEC-003/017`, `TC-AUT-004-FC-*`)
- Consent/Grant 발급·승인·철회 workflow와 revocation 동시성/side-effect race 해결
- PatientMapping runtime grant/API, Viewer/Download, DICOMweb, PACS Import, Audit writer, Integrity/Provenance
- `SERIES`/`INSTANCE` 접근, UID/`storage_ref`/DICOM payload 조회, PHI·실제 PACS
- 제품 Authorization 완료 또는 A→MediQ→B transfer 완료 주장

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-AUT-004~005` | Object binding과 trusted server-owned evidence | `TC-AUT-005-DB-001~007` |
| 보안 | `SEC-AUTHZ-012`, `SEC-DB-005~006`, `SEC-TEN-005` | same verified client, exact minimum SELECT, forced RLS, caller evidence 불신 | 권한 catalog 및 tenant A/B/C runtime probes |
| API·도메인 | `AUT-003-DEC-001`, `AUT-004-DEC-001`; 기존 schema | AUT-003 facts contract와 AUT-004 exact-ALLOW executor 재사용; schema 변경 없음 | real reader/policy/executor integration |
| Acceptance | `TC-AUT-005-DB-001~007` | 실DB privilege/evidence/deny/pool Acceptance | DB-008 disposable scratch full validation |

## 4. 구현 결과

- `PostgresAuthorizationEvidenceReader`는 `STUDY`만 허용하고 `session_id`, `consent_id`, `grant_id`, `study_ref_id`를 bind parameter로 전달한다.
- 한 SQL statement에서 기존 Session·Consent/Action·Grant/Scope·Package·StudyReference를 결합한다. 결과가 0행 또는 1행이 아닌 경우 policy input을 반환하지 않는다. DB 오류는 상위 policy의 fail-closed 경계에 전달된다.
- `study_instance_uid`, local Patient ID, `storage_ref`, payload를 SELECT하거나 로그로 남기지 않는다. 현재 저장 schema가 child binding을 증명하지 못하는 `SERIES`/`INSTANCE`는 DB query 전에 거부한다.
- migration `0010_authorization_evidence_column_grants.sql`은 evidence table 7개에 총 41개 column `SELECT`만 부여한다. 전체 runtime catalog는 `patient_refs` 10 + IAM 11 + evidence 41 = 62 privilege rows이며, table-wide/default grant와 evidence write 권한은 없다.
- 실DB Acceptance는 exact 대상 액션 3개 허용, wrong IDs·revoked/expired/withdrawn·source/third-tenant/child-resource 거부, same-client callback 및 pool context cleanup을 통과했다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/persistence/postgres-authorization-evidence.reader.ts` | 내부 parameterized Study evidence reader |
| `services/api/src/database/migrations/0010_authorization_evidence_column_grants.sql` | 41 exact SELECT column grants |
| `services/api/src/database/migrations/meta/_journal.json` | migration 0010 journal entry |
| `tests/api/postgres-authorization-evidence.reader.test.mjs` | mapping, binding, child deny, absent/ambiguous/error unit tests |
| `tests/database/postgres-authorization-evidence-runtime.integration.test.mjs` | actual runtime role, policy/executor, RLS, actions, mismatch and pool integration |
| `tests/database/actor-tenant-context-runtime.integration.test.mjs` | scratch UUID fixture injection; existing fixed IDs remain defaults |
| `services/api/Dockerfile`, `infra/docker-compose.yml` | isolated runtime integration test image/environment |
| `scripts/validate-compose-baseline.ps1` | integration target/environment allowlist synchronization |
| `scripts/test-db-008-full-schema.ps1` | migration ledger/grant baseline, isolated IAM/AUT fixture, RLS-only column grants and safe test diagnostics |
| `docs/POLICY-DECISION-LOG.md` | `AUT-005-DEC-001` recommendation-first decision |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md` | `REQ-AUT-005`, `SEC-AUTHZ-012`, traceability |
| `docs/ACCEPTANCE-TESTS.md` | AUT-005 DB Acceptance and actual results |
| `docs/SYSTEM-ARCHITECTURE.md`, `docs/THREAT-MODEL.md` | reader trust/deny/resource boundary |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/implementation/README.md` | phase status and Ticket index |
| `docs/implementation/MEDIQ-AUT-005/*` | implementation and test evidence |

## 6. 영향 분석

### Architecture

내부 Authorization dependency path만 추가했다. Nest module, public API, route registration, DB schema/table, Viewer/PACS data path는 추가하지 않았다.

### API·Data

기존 facts/read models만 조회한다. DB schema remains unchanged; migration extends least-privilege column grants only. PatientMapping privileges remain closed.

### Security·Privacy

Evidence is sourced only from server-owned tables under IAM-002 transaction-local Tenant context and existing FORCE RLS. `ALLOW` remains only a decision; it does not deliver data or trigger effects. Existing custom GUC risk and revoke race remain documented. Synthetic/Test data only; no PHI, credential, operational DICOM or secrets used in evidence.

## 7. 실행 및 검증 요약

- API build/typecheck/unit/regression, migration journal, Compose/powershell validation passed.
- `scripts/test-db-008-full-schema.ps1` passed at AUT-005 execution: DB-008 initial/reset/reapply, 11 migration ledger, exact 62 runtime privilege rows, 41 evidence SELECT, 16 forced RLS policies, PAT/IAM/AUT runtime integration, and DB-002~007 regressions. A later PAT-002 follow-up adds exactly eight mapping SELECT columns (current total 70); the historical AUT-005 41-column evidence grant and 62-row checkpoint are unchanged.
- 상세 명령·환경·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- HTTP/API/OpenAPI, safe HTTP error and actual BOLA no-data behavior
- Consent/Grant workflow or revoke-race/operation lock policy
- PAT-002 PatientMapping runtime grant/route
- Viewer, Download, DICOMweb, PACS, Preflight, Audit, Integrity/Provenance
- `AT-SEC-003/017`, `TC-AUT-004-FC-001~004`, DB-009 overall and product A→B transfer status

## 9. 결정 및 예외

`AUT-005-DEC-001` recommendation was recorded under `PDEC-001` before implementation. Study is the only persisted resource binding proven by current schema; child resources are explicitly denied. Diagnostic failures in DB-008 uncovered and corrected a pre-existing test-harness issue: temporary table-wide RLS probe grants had erased IAM column grants on revoke. The harness now uses and revokes only the exact temporary columns needed by its RLS probe.

## 10. 잔여 위험과 후속 작업

- HTTP safe errors, real protected-resource data non-disclosure, BOLA/IDOR and response tests remain unimplemented.
- Consent/Grant write lifecycle, concurrent revocation semantics and operation-specific Preflight are absent; policy `ALLOW` cannot yet authorize an exposed route or side effect.
- The current schema has no Series/Instance binding. P0 reader denies those kinds; support requires an approved model and separate Acceptance.
- PostgreSQL custom Tenant GUC is defense-in-depth, not a cryptographic identity boundary against arbitrary SQL. Production/real-patient use remains out of scope.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUT-005
Scope: Internal PostgreSQL Study authorization evidence reader and synthetic runtime Acceptance
Changed: Reader, SELECT-only migration, disposable runtime integration, governance/security/traceability docs
Not changed: HTTP/API, PatientMapping, Viewer/Download, PACS, Audit, product transfer
Security impact: Exact 41 column SELECT; same verified IAM-002 client; forced RLS; unsupported child resources deny
Tests executed: API regression 14 files / 295 tests; reader unit 5/5; migration checks 6/6; full DB-008 scratch and DB-002~007 regression PASS
Tests not executed: HTTP BOLA/safe-error, revoke-race, PACS/Viewer/product E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-AUT-005/
Remaining risks: HTTP and business side-effect gates remain closed; no product Authorization/E2E claim
Status: PASS (Ticket scope only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | Recommendation first; exact-grant Study reader and synthetic live runtime Acceptance passed; HTTP/product gates remain open |
