# MEDIQ-PAT-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-002` |
| 제목 | Synthetic source PatientMapping domain and repository boundary |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — domain/SQL contract and `PAT-002-DEC-002` internal read-only runtime Acceptance PASS; broader API/workflow remains out of scope |

## 1. 목표

P0 합성 Source Hospital Local Patient ID와 MediQ PatientReference mapping을 도메인 및 parameterized repository 경계로 구현한다. 실제 환자정보·identity proof를 배제하고, 인증·인가 선행조건 전에는 route 또는 runtime table 권한을 열지 않는다.

## 2. 범위

### 포함

- `PAT-002-DEC-001`과 PAT-002 domain/repository Acceptance 확정
- `MQ-TEST-*` PatientReference 및 `TEST-*` Local Patient ID만 허용하는 domain validation
- 신규 mapping은 `UNVERIFIED`로 생성하고 기존 4개 mapping status만 reconstitute
- Approved `patient_mappings` columns만 사용하는 parameterized repository port/adapter
- 정확한 Hospital ID predicate를 포함하는 단건 조회, generic conflict/error mapping
- Unit, SQL-contract 및 runtime database integration tests
- `PAT-002-DEC-002` follow-up: verified IAM-002 active `USER` membership의 exact-Hospital mapping read boundary와 internal runtime integration

### 제외

- PatientMapping schema/data shape 변경, runtime mapping writes, API route/provider wiring
- Controller, API route, Actor/Membership resolver, verified Tenant transaction/pool wrapper
- PatientMapping의 객체·행위 업무 Authorization 및 mapping 상태 변경 workflow
- Destination mapping 검증, PACS Import Preflight/STOW, real identity/PHI
- Runtime mapping writes, role-based mapping administration, HTTP route/module/OpenAPI wiring, downstream image operations

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 결정 | `PAT-002-DEC-001/002` | Synthetic Source Mapping; exact-Hospital internal read-only exception; no write/API | Policy Decision Log |
| 요구사항 | `REQ-PAT-002` | Source Hospital과 PatientReference 간 mapping 유지 | `TC-PAT-002-*` |
| Domain/Data | `DATA-MODEL.md` §§13–14 | 기존 schema, 상태, synthetic local-ID boundary | domain constructors |
| Security | `SEC-DB-005~006`, `SEC-TEN-005`, `SEC-AUTHZ-010~011` | 최소권한, Tenant RLS와 업무 인가 분리 | access intentionally not wired |
| Acceptance | `TC-PAT-002-DOM-001~002`, `PER-001~002` | synthetic domain 및 SQL contract | `tests/api/patient-mapping.test.mjs` |
| Acceptance | `TC-PAT-002-TEN-001~002`, `SEC-001~003`, `DB-001` | same-Hospital read; mismatches deny; exact privileges/RLS/pool | disposable scratch PostgreSQL integration |
| Deferred Acceptance | HTTP safe-error, image/business authorization, write workflow | Separate protected API, Consent/Grant and BOLA gates | no HTTP route or product data path |
| Schema evidence | `TC-DB-003-REG-001~008` | Existing table/FK/status/unique/index/rollback boundary | DB-003 evidence |

## 4. 구현 결과

`PatientMapping`은 UUID Hospital/PatientReference keys, canonical synthetic Local Patient ID, approved mapping statuses, immutable timestamps를 검증한다. New mapping defaults to `UNVERIFIED`; creation requires an active synthetic `PatientReference`. The repository port is documented as an internal persistence boundary, not an authorization mechanism.

`PostgresPatientMappingRepository` accepts a checked-out PostgreSQL client (not a `Pool`), uses bound parameters, the existing approved eight mapping columns, and exact Hospital predicates. The `PatientMappingAccessService` uses IAM-002's verified Tenant transaction and the same `PoolClient`; only active `USER` Actors with a non-null verified Hospital matching the request candidate can reach the repository. The query predicate uses only the verified Hospital. Missing/malformed context, `SERVICE`, tenant-level membership, wrong Tenant and wrong Hospital are denied before mapping SQL. Migration `0011_patient_mapping_read_column_grants.sql` grants `mediq_runtime` exact `SELECT` on the eight approved columns and no write/table-wide/default privilege. The service and repository are intentionally not registered as an HTTP route/provider. PostgreSQL unique violations remain fixed conflicts; other DB errors remain fixed persistence errors.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/patient/domain/patient-mapping.ts` | Synthetic mapping domain, status and input validation |
| `services/api/src/patient/application/patient-mapping.repository.ts` | Internal repository port and security precondition comment |
| `services/api/src/patient/persistence/postgres-patient-mapping.repository.ts` | Parameterized insert/scoped reads and generic error mapping |
| `tests/api/patient-mapping.test.mjs` | Domain, SQL contract, conflict and invalid-input tests |
| `services/api/src/patient/application/patient-mapping-access.service.ts` | Internal verified-membership/exact-Hospital read boundary; no route registration |
| `services/api/src/database/migrations/0011_patient_mapping_read_column_grants.sql`, `meta/_journal.json` | Exact 8-column runtime SELECT; all mutation/DDL remains denied |
| `tests/api/patient-mapping-access.test.mjs`, `tests/database/patient-mapping-read-runtime.integration.test.mjs` | Pre-query denial/unit cases and actual runtime-role/RLS/pool integration |
| `scripts/test-db-008-full-schema.ps1`, `infra/docker-compose.yml`, `services/api/Dockerfile`, `scripts/validate-compose-baseline.ps1` | Disposable PAT-002 fixture/integration execution and config validation |
| `docs/POLICY-DECISION-LOG.md`, `docs/REQUIREMENTS.md`, `docs/DATA-MODEL.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/SYSTEM-ARCHITECTURE.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Approved scope, decision, traceability, risks and status |
| `docs/implementation/README.md` | Ticket status index |

## 6. 영향 분석

### Architecture

- Internal domain/repository code only. `AppModule` has no PatientMapping route or provider wiring.
- Shared runtime identity-to-Tenant context is provided by `MEDIQ-IAM-002`; this repository/adapter is not yet wired to it.

### API·Data

- No API/OpenAPI operation, PatientMapping schema change, product seed or persistent product data change.
- Migration 0011 grants only the eight named `SELECT` columns; no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/DDL, table-wide, PUBLIC or default grant.
- PAT-002 runtime integration and reset/reapply are tested in a disposable scratch project. The documented aggregate DB-002~007 regression phase also applied pending migration 0011 to the existing local `mediq` development database. A post-run read-only check found ledger=12, 70 runtime column grants, zero `patient_mappings`/`patient_refs`/`actors` rows and the prior synthetic registry counts unchanged. No production DB was used.

### Security·Privacy

- P0 inputs are synthetic only. No PHI or real Hospital Local Patient IDs are accepted by the domain.
- The internal mapping reader requires IAM-002-resolved active USER membership and exact Hospital equality; its integration injects a synthetic principal at the trusted IAM-002 boundary and does not test live OIDC/JWT signature validation or an HTTP authentication guard. It does not establish identity proof for the mapped person or role-based capability.
- Forced RLS provides Tenant defense-in-depth and does not establish medical-image/business permission. This internal reader is not connected to a route or Viewer/Download/PACS operation.
- All active `USER` members of one Hospital can use this internal reader because workforce roles/capabilities are not modeled; this is a recorded synthetic-P0 residual and blocks expansion to external/API use until a separate role/Authorization decision.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- `./scripts/test-db-008-full-schema.ps1`: exit 0; PAT-002 exact 8-column read-only runtime acceptance, RLS/pool/write denial, DB-002~007 regressions and scratch cleanup PASS.
- `npm run test:api`: build PASS; 15 files / 305 tests PASS.
- `npm run typecheck:api`, migration journal check + 6 migration tests, app-config build + 10 tests, PowerShell parser and Compose baseline validation PASS.
- Overall Ticket remains `PARTIAL`: no HTTP/API, role-based mapping management, write workflow or imaging/PACS authorization is implemented.

## 8. 변경하지 않은 사항

- No PatientMapping write grant, route, controller, OpenAPI operation or AppModule/provider wiring.
- No identity proof, Actor membership, business Authorization, Consent/Grant, destination validation or PACS side effect.
- No claim that RLS or mapping status grants access.

## 9. 결정 및 예외

- `PAT-002-DEC-001/002` are normative under the standing recommendation-led decision process.
- DB-003 schema evidence is reused only for schema-level constraints; it is not PAT-002 runtime authorization evidence.
- `mediq_runtime` receives only the approved eight-column internal SELECT grant after `PAT-002-DEC-002`; the grant does not permit HTTP exposure, writes, identity proof, image access or PACS actions.

## 10. 잔여 위험과 후속 작업

- Workforce role/capability and patient-identity matching do not exist; all active USER members at one Hospital can use this internal synthetic mapping read. Keep internal-only and revisit before route/API or production use.
- The exact 8-column SELECT grant does not add a DB-level `TEST-*` local-ID CHECK. Only synthetic fixtures are populated in the disposable test DB; no write API exists. Add a bypass-resistant constraint or equivalent gate before any runtime write.
- HTTP safe-error/BOLA, mapping administration, Consent/Grant workflow, image access, destination mapping and PACS remain separate Acceptance work.
- PAT-003/004 still own destination mapping validation and fail-closed PACS Import behavior.

## 11. 최종 판정

```text
Ticket: MEDIQ-PAT-002
Scope: Synthetic source PatientMapping domain and unexposed parameterized repository contract
Changed: scope/Acceptance docs, mapping domain, repository port/adapter, unit and SQL-contract tests
Not changed: PatientMapping write path, HTTP route/OpenAPI, workforce role model, identity proof, Consent/Grant workflow, destination mapping or DICOM/PACS flow
Security impact: synthetic internal read only; exact verified-Hospital membership boundary and eight-column SELECT; no identity proof, image authorization, write or public route
Tests executed: disposable full DB scratch/reset/reapply and DB-002~007 regressions; PAT-002 runtime/RLS/pool integration; API 15 files / 305 tests; typecheck, migration, app-config, PowerShell parser and Compose checks (details in TEST-EVIDENCE.md)
Tests not executed: HTTP safe-error/BOLA, write/admin workflow, workforce role/capability authorization, Consent/Grant, image access, destination mapping and PACS E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md and TEST-EVIDENCE.md
Remaining risks: all same-Hospital active USER actors can use the internal synthetic reader because workforce capabilities are absent; no DB-level TEST-* local-ID constraint; HTTP/write/image paths remain closed
Status: PARTIAL
```

## 12. 변경 이력

### 12.1 `PAT-002-DEC-002` follow-up — scoped Acceptance PASS

다음 slice는 합성 mapping의 read-only runtime acceptance다. `patient_mappings`에 exact 8-column `SELECT` 외 권한은 부여하지 않고, IAM-002가 반환한 활성 `USER` Actor의 verified `hospitalId`와 요청 대상 Hospital이 다르면 repository query 전에 거부한다. 조회 predicate에는 verified Hospital만 사용한다. `SERVICE`, Hospital-less, wrong-Hospital, malformed identity, wrong Tenant는 거부한다. API route는 계속 연결하지 않으며 mapping write는 fixture/migrator 경계에 둔다. 결정은 코드 변경 전에 `PAT-002-DEC-002`로 기록했다.

필수 Acceptance인 A/B same-Hospital positive read, same-Tenant wrong-Hospital pre-query denial, Tenant C forced-RLS denial, context 누락/오류의 no-query denial, exact 8-column privilege inventory, runtime write/DDL denial, same-client use 및 commit/rollback pool reset이 `scripts/test-db-008-full-schema.ps1` disposable scratch 실행에서 PASS했다. HTTP/API 및 영상 업무 Authorization은 본 slice의 scope 밖이며 통과한 것으로 간주하지 않는다.

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | Scope/Acceptance approved; synthetic domain and parameterized repository contract implemented; runtime/security prerequisites remain open |
| 2026-09-30 | `PARTIAL` | Follow-up: DEC-002 exact-Hospital internal mapping read, eight-column runtime grant, forced-RLS denials, write denial and pool reset passed; HTTP/write/image paths remain closed |
