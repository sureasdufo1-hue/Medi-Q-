# MEDIQ-PACS-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-004` |
| 제목 | Destination PatientMapping eligibility gate (internal; no STOW) |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PARTIAL` |

## 1. 목표

`PACS-004-DEC-001` 권고안 및 Acceptance를 먼저 확정한 뒤, `PACS_IMPORT` object/action Authorization을 통과한 내부 caller만 동일한 verified Tenant transaction에서 persisted ExchangeSession·목적지 PatientMapping을 검증하도록 구현했다. 매핑 실패는 최소정보 `PACS_TRANSFER_FAILED` Audit과 원자적으로 끝나며, 성공은 내부 `MAPPING_VALIDATED` eligibility만 반환한다.

## 2. 범위

### 포함

- strict allowlisted command와 server-created `PACS_IMPORT` / `STUDY` AuthorizationContext
- existing `AuthorizationGatedOperationExecutor`를 통한 exact `ALLOW` gate
- 동일 checked-out Tenant transaction의 persisted Session recheck와 exact destination Hospital + persisted PatientReference PatientMapping read
- 기존 pure `validateDestinationPatientMapping` 재사용; mapping denial을 고정 결과로 축약
- denial의 metadata-only Audit (`PACS_TRANSFER_FAILED`, `FAILURE`, `PATIENT_MAPPING_INVALID`)
- import mapping gate의 internal provider 등록; HTTP Controller/route는 등록하지 않음

### 제외

- 공개 API/Controller/OpenAPI operation, Hospital/Patient mapping read/write workflow 또는 신규 DB schema/grants/migration
- DICOM Gateway, STOW, 목적지 PACS write, 성공 import 및 `AT-SEC-012` composite PASS 주장
- full Mandatory Preflight, Session/Consent/Grant revocation fencing, Endpoint/TLS, Integrity/Provenance 및 전체 PACS import coordinator
- live PostgreSQL/RLS atomic Audit/rollback, live Orthanc no-STOW counter, A→B E2E

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PAT-004`, `REQ-PACS-003` | 목적지 mapping eligibility must be checked before import | internal gate; `AT-SEC-012` remains NOT RUN |
| 보안 | `SEC-IAM-007~009`, `SEC-AUTHZ-001~003`, `SEC-AUD-001`, `THR-018` | exact `PACS_IMPORT`, fail closed, Tenant boundary, minimized denial Audit | unit/policy boundary; live DB/integration pending |
| API·도메인 | `AuthorizationGatedOperationExecutor`, `ExchangeSession`, `PatientMapping`, `validateDestinationPatientMapping` | use verified context and persisted bindings; `VALID` is not import permission | typed internal service; no public route |
| Acceptance | `PACS-004-DEC-001`, `TC-PACS-004-*` | strict inputs, exact authorization boundary, mapping denial, audit contract, no gateway capability | 16 focused tests; see evidence |

## 4. 구현 결과

`PacsImportMappingGateService`는 Session/Study/Consent/Grant internal IDs와 Tenant/correlation context만 받는다. Patient/local Patient ID, destination Hospital, endpoint URL 또는 authorization facts는 입력으로 받지 않는다. It constructs `PACS_IMPORT` itself and delegates exact-ALLOW enforcement. Inside the verified Tenant transaction it reloads Session, rechecks that the verified Hospital is the persisted destination, queries a mapping by that Hospital and the persisted PatientReference, and requires one `VALID` mapping with `validatedAt`. Mapping failure writes an audit row on the same client and returns a fixed denial. Persistence/audit failure propagates only a fixed unavailable error.

The gate deliberately has no DICOM Gateway dependency. A valid mapping returns only `{ kind: "MAPPING_VALIDATED", mappingId }`; this is not import permission. Full Mandatory Preflight and the real PACS no-STOW Acceptance remain incomplete.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/pacs/application/pacs-import-mapping-gate.service.ts` | Strict request, exact authorization, same-transaction Session/mapping check and minimized Audit |
| `services/api/src/pacs/pacs-import.module.ts`; `services/api/src/app.module.ts` | Internal provider/export only; no controller and no DICOM Gateway provider |
| `services/api/src/exchange/persistence/postgres-exchange-session-audit.repository.ts` | Fixed metadata-only invalid-mapping Audit INSERT |
| `tests/api/pacs-import-mapping-gate.test.mjs` | 16 focused denial/binding/SQL-contract tests |
| `docs/POLICY-DECISION-LOG.md`; `docs/ACCEPTANCE-TESTS.md`; `docs/IMPLEMENTATION-PLAN.md`; `docs/P0-EXECUTION-SCHEDULE.md`; `docs/implementation/README.md`; this Ticket record | Recommendation, Acceptance, status and test evidence synchronization |

## 6. 영향 분석

### Architecture

- Internal `PacsImportModule` is imported by `AppModule` and exports an application provider only. No PACS HTTP controller or DICOM adapter is registered through it.

### API·Data

- No OpenAPI/public route, migration, schema change or privilege expansion. Reuses existing exact PatientMapping SELECT and Audit INSERT columns, same transaction-local Tenant context.

### Security·Privacy

- Authorization action is created server-side as `PACS_IMPORT`; executor exact `ALLOW` is mandatory before Session/Mapping SQL.
- Session and mapping are re-read on same transaction client; request cannot choose a PatientReference, local patient identifier or destination Hospital.
- Invalid mapping Audit is fixed and metadata-only. No DICOM, credentials, local Patient ID or policy evidence is emitted.
- Internal mapping `VALID` is not authorization and cannot lead to STOW in this service. No real/production/PHI data used.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PARTIAL` — API build/regression 27 files / 503 tests, 16 focused PACS tests, API typecheck, Port contract, AppConfig 10/10, Compose validation, `git diff --check`, and isolated API-container startup/readiness/liveness smoke passed. Real PostgreSQL/RLS, actual import route, Orthanc no-STOW, TLS and full Mandatory Preflight are not run.

## 8. 변경하지 않은 사항

- No route or OpenAPI exposure; no DICOM Gateway/STOW use; no live DB privilege test or database mutation.
- `AT-SEC-012` stays `NOT RUN` until protected import execution, actual STOW request count zero and unchanged B destination are observed together.

## 9. 결정 및 예외

- `PACS-004-DEC-001` selected under standing `PDEC-001` instruction before implementation. No exception to `AGENTS.md` Mandatory Preflight.
- `MAPPING_VALIDATED` carries eligibility only; later operation must revalidate/fence Consent/Grant and all Mandatory Preflight facts through the side-effect boundary.

## 10. 잔여 위험과 후속 작업

- Internal gate is not a product PACS Import endpoint; live runtime AuthZ evidence through this gate, DB/RLS behavior and audit atomicity remain unverified.
- Next recommendation-first Ticket: `MEDIQ-PACS-001` import coordinator, with `PACS-002/003` Authorization/destination binding integrated before any live STOW. Do not expose or write PACS until Integrity/Provenance, TLS and full Preflight gates pass.

## 11. 최종 판정

```text
Ticket: MEDIQ-PACS-004
Scope: Internal authorization-gated PatientMapping preflight only
Changed: same-transaction Session/mapping validation and minimized invalid-mapping Audit
Not changed: public route, OpenAPI, schema/grant/migration, DICOM Gateway, STOW, full Preflight
Security impact: DENY-by-default; exact `PACS_IMPORT` context, verified Tenant/Hospital bindings; mapping VALID is not authorization
Tests executed: focused 16/16; API 27 files/503 tests; API typecheck; DICOM Port contract; AppConfig 10/10; Compose config; diff check; isolated API startup and live/ready HTTP 200
Tests not executed: live PostgreSQL/RLS/audit rollback, protected HTTP import, Orthanc no-STOW counter, TLS, full AT-SEC-012/E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: operation route/coordinator absent; actual DB evidence and denial Audit not integrated; full Preflight, revocation fencing and PACS E2E absent
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PLANNED` | Decision/Acceptance first; implementation record opened |
| 2026-10-01 | `PARTIAL` | Internal mapping gate, same-client query contract, minimized Audit mock, focused/regression evidence and isolated API startup/health smoke; composite AT-SEC-012 remains NOT RUN |
