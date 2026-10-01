# MEDIQ-PACS-007 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-007` |
| 제목 | Durable PACS transfer operation state and idempotency |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — 이 Ticket의 내부 상태·영속성 Acceptance만 해당 |

## 1. 목표 및 판정 범위

Session/Study별 PACS transfer operation의 durable 상태, 의미 기반 멱등성, compare-and-set 전이, Tenant 격리 및 metadata-only Audit을 구현했다. `RESULT_UNKNOWN`은 DB에 보존되고 blind retry 또는 임의 재전이를 할 수 없다.

이 PASS는 내부 도메인·PostgreSQL/RLS 영속성 경계에만 해당한다. 제품 PACS endpoint, operation-time Authorization/Consent/Grant 재검증, full Mandatory Preflight, DICOM 전송, destination reconciliation, 실제 PACS Import 또는 P0 E2E 완료를 뜻하지 않는다.

## 2. 범위

### 포함

- `PacsTransferOperation` 불변 도메인 객체 및 canonical semantic request digest.
- `pacs_transfer_operations` migration, Tenant RLS/Force RLS, 제약조건 및 정확한 runtime 열 권한.
- 검증된 Tenant transaction에 연결되는 내부 Repository: Session advisory lock, Session/Study uniqueness, actor/idempotency uniqueness, exact replay/conflict, versioned CAS 및 Audit savepoint 처리.
- SQL trigger로 초기 CREATED/version 0 및 허용된 state 전이 강제. Mandatory Preflight 전 `STOW_STARTED` 직접 전이는 거부.
- Synthetic-only domain/API/PostgreSQL integration test와 DB-008 전체 회귀.

### 제외

- HTTP route/controller/module/provider 등록 및 `OPENAPI.yaml` 변경.
- PACS/DICOM Gateway 호출, QIDO/WADO/STOW, Orthanc write, actual import, transfer worker 또는 read-only reconciliation worker.
- 이 Ticket 안의 Consent/Authorization/Grant/PatientMapping 실시간 판정. 따라서 operation 기록 자체는 전송 권한이 아니다.
- `RESULT_UNKNOWN` 해소, retry 또는 자동 완료 처리.

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 결정 | `PDEC-001`, `PACS-007-DEC-001` | 권고안과 Acceptance를 먼저 기록하고 durable/idempotent state 및 no-blind-retry 경계 적용 | 정책 로그, Acceptance, 본 Ticket |
| 요구사항 | `REQ-PACS-004` | Session/Audit에서 결과와 불명 상태를 구분할 영속 operation 기록 | `TC-PACS-007-*` |
| 보안 | `DB-009-DEC-001`, `SEC-DICOM-006`, `THR-019`, `THR-043` | 최소권한, Tenant RLS, 미확정 결과 보존 및 중복 전송 방지 | DB-008, PACS-007 runtime integration |
| Domain/Data | PACS Transfer Operation amendment | 한 Session/Study에 단일 operation claim, semantic digest, legal transition/CAS | domain tests, migration trigger, repository tests |
| Acceptance | `TC-PACS-007-DOM/STATE/IDEM/CONC/DB/RLS/AUD/UNK/SEC-001` | scoped internal lifecycle, idempotency, concurrency, RLS, Audit atomicity | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) |

## 4. 구현 결과

- Migration `0018_smiling_shooting_star.sql`과 `0019_violet_imperial_guard.sql`로 현재 product schema를 17개에서 18개 테이블로 확장하고 migration journal을 20개로 갱신했다.
- 새 테이블은 UUID reference, state/version, idempotency key, 64-char semantic digest, reason/count 및 timestamps만 저장한다. DICOM payload, local Patient ID, endpoint credential, raw response/body는 저장하지 않는다.
- Runtime role의 새 테이블 권한은 `SELECT 15 + INSERT 15 + UPDATE 7` column privileges뿐이다. `DELETE`, table-wide/default/PUBLIC/DDL 권한은 추가하지 않았다. 총 runtime column privilege inventory는 183이다.
- Repository는 caller의 이미 검증된 Tenant transaction만 사용하며 session lock/unique key/CAS로 중복 claim을 제한한다. State+Audit은 같은 transaction 경계에서 함께 기록되고 Audit 실패 시 savepoint에서 상태 변경을 되돌린다.
- `RESULT_UNKNOWN`은 terminal 상태로 보존하고 이후 dispatch/성공으로 전이하지 않는다. database trigger도 Preflight를 건너뛰는 직접 SQL 전이를 막는다.
- DICOM provider/import route가 등록되지 않았고 DICOM side effect가 없다.

## 5. 주요 변경 파일

| 파일·영역 | 변경 내용 |
|---|---|
| `services/api/src/pacs/domain/` | Operation aggregate, 상태 그래프 및 semantic digest |
| `services/api/src/pacs/persistence/` | Repository contract 및 PostgreSQL transaction adapter |
| `services/api/src/database/schema/pacs-transfer-operation.ts`, `schema/index.ts` | Drizzle schema/export |
| `services/api/src/database/migrations/0018_*.sql`, `0019_*.sql`, migration journal | 테이블, RLS, exact grants, database transition guard |
| `tests/api/pacs-transfer-operation.test.mjs`, `tests/database/pacs-transfer-operation-runtime.integration.test.mjs` | Domain/mock 및 실제 PostgreSQL Acceptance |
| `scripts/test-db-008-full-schema.ps1`, 관련 회귀 테스트·Docker 설정 | PACS-007 fixture/DB gate와 현재 183권한·18 table 기준 반영 |
| `docs/` | 결정·Domain/Data/ERD·요구사항·보안·Acceptance·일정·구현 증거 동기화 |

## 6. 영향 분석

### Architecture / API

내부 PACS persistence/domain만 추가했다. HTTP API, OpenAPI, route graph, DICOM Gateway wiring은 변경하지 않았다.

### Data

P0 승인 스키마를 18개 table로 확장했다. 새 FK는 Tenant, ExchangeSession, StudyReference 및 Actor에 연결되며 삭제는 제한된다. 이전 17-table DB-008 실행기록은 그 날짜의 역사적 증거로 보존한다.

### Security / Privacy

Forced Tenant RLS, immutable Tenant/Actor/Session/Study binding, exact column privileges 및 metadata-only Audit을 적용했다. Operation state는 Consent나 Authorization을 대체하지 않으며 실제 PACS 접근을 허용하지 않는다. Synthetic/Test 데이터만 사용했다.

## 7. 구현하지 않은 사항과 잔여 위험

- PACS-001 coordinator가 아직 없어 `PREFLIGHT_PASSED` 및 `STOW_STARTED`는 실제 사용 경로에서 생성되지 않는다. Migration trigger만 직접 상태 위조를 차단한다.
- SQL trigger는 상태 순서만 강제하고 underlying Mandatory Preflight evidence 자체를 증명하지 않는다. Future trusted coordinator must verify all evidence before advancing; no current service can dispatch.
- Consent/Grant 철회와 side-effect 간 operation-time fence, PACS endpoint/TLS 검증, PatientID byte-preserving destination binding, integrity/provenance, destination verification 및 `RESULT_UNKNOWN` read-only reconciliation은 후속 Ticket이다.
- `RESULT_UNKNOWN`은 안전하게 보존되지만 이 Ticket은 이를 해소하는 자동/수동 도구를 제공하지 않는다.
- 실제 Orthanc STOW, `AT-SEC-012`, `AT-FUNC-012`, `AT-E2E-003`은 실행하지 않았다.

## 8. 결정 및 후속 순서

`PACS-007-DEC-001`의 승인된 범위대로 PACS-007을 PACS-001 coordinator보다 먼저 구현했다. `PACS-001-DEC-004`가 complete Mandatory Preflight와 최종 fenced Authorization/`STOW_STARTED`+Audit 경계를 정의했으며, 연결 Acceptance는 coordinator와 Integrity/Provenance/Audit/endpoint dependencies가 생길 때까지 NOT RUN으로 유지한다. 실제 STOW는 `AGENTS.md §5` Mandatory Preflight 전체와 product no-STOW/B-unchanged negative tests가 코드와 시험으로 입증될 때까지 금지한다.

## 9. 최종 판정

```text
Ticket: MEDIQ-PACS-007
Scope: Durable internal PACS transfer operation state/idempotency only
Changed: Domain, semantic digest, PostgreSQL repository, migrations/RLS/grants, tests, baseline docs
Not changed: HTTP/API routes, DICOM calls, STOW, reconciliation worker, product transfer Authorization
Security impact: Forced Tenant RLS; exact SELECT/INSERT/UPDATE columns; atomic metadata Audit; RESULT_UNKNOWN cannot retry
Tests executed: See TEST-EVIDENCE.md; complete DB-008 clean/reset/reapply and DB-002~007 regressions PASS
Tests not executed: Live STOW, reconciliation worker, full PACS Preflight and P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-PACS-007/
Remaining risks: Operation-time Authorization fence, full Mandatory Preflight, destination reconciliation/verification, integrity/provenance and live PACS path
Status: PASS (scoped ticket only)
```

## 10. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | Recommendation-first 승인 범위의 internal durable operation/idempotency, RLS/grants 및 PostgreSQL Acceptance 완료; PACS transfer E2E는 별도 미완료 |
