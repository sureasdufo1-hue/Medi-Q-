# MEDIQ-CON-008 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-008` |
| 제목 | Missing and withdrawn Consent operation denial Acceptance |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped internal Authorization operation boundary only |

## 1. 목표

실제 synthetic PostgreSQL Authorization evidence를 사용하는 internal Study operation boundary에서 Consent가 없거나 철회된 경우, P0 action 세 종류 모두를 fail-closed로 거부하고 보호 callback이 실행되지 않는지 증거화한다.

## 2. 범위

### 포함

- `CON-008-DEC-001` 권고 및 여섯 Acceptance case를 변경 전 기록
- `VIEW`, `DOWNLOAD`, `PACS_IMPORT` 각각에 대해 미존재 Consent evidence 거부
- 세 action 각각에 대해 `WITHDRAWN` Consent와 연결된 `ACTIVE` Transfer Grant의 operation 거부
- PostgreSQL evidence reader 결과의 Consent/Grant 상태 및 보호 callback 미실행 assertion
- 요구사항·보안·위협 추적표, Acceptance, 계획표 및 구현 색인 동기화

### 제외

- TransferGrant 발급·철회 service/API와 발급 경쟁조건
- 새로운 API route, `AppModule` 연결, DB migration/schema/runtime grant
- 실제 HTTP BOLA, Viewer/Download/PACS side effect, STOW 또는 전체 A→B E2E
- 법적 동의, 이미 전달·다운로드된 자료의 회수 주장

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-CON-003/004`, `REQ-AUT-003/005` | 유효한 Consent 부재·철회 및 불완전한 persistence evidence는 거부 | `TC-CON-008-AUT-001~006` |
| 보안 | `SEC-CONSENT-001/002/007`, `THR-004` | 동의와 Authorization은 분리; 철회 여부를 보호 작업에서 독립 재검증 | Runtime evidence + policy + executor |
| API·도메인 | `MEDIQ-AUT-005`, `CON-006-DEC-001` | 기존 exact Study evidence와 P0 action/scope 정책만 사용 | `tests/database/postgres-authorization-evidence-runtime.integration.test.mjs` |
| 결정·Acceptance | `CON-008-DEC-001`; `ACCEPTANCE-TESTS.md` | DB-backed 내부 보호 operation을 여섯 조합으로 검증 | DB-008 격리 통합 게이트 |

## 4. 구현 결과

기존 AUT-005 runtime integration test에 두 개의 명시적 action matrix를 추가했다. Consent UUID가 persistence에 없으면 evidence reader는 `null`을 반환하고, 세 P0 action 모두 Authorization에서 DENY된다. 철회 fixture는 `WITHDRAWN` Consent와 유효기간 내 `ACTIVE` Grant를 함께 유지하여, Grant 활성 상태만으로 철회 Consent가 우회되지 않는지 확인한다. 여섯 경로 모두 `executeDenied`가 callback 호출 수 불변을 확인한다.

Acceptance 결과는 `TC-CON-008-AUT-001~006` 모두 PASS다. 기존 test harness가 사용하는 `mediq_runtime`, verified Tenant/RLS transaction, same-client Authorization flow를 그대로 유지했다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `tests/database/postgres-authorization-evidence-runtime.integration.test.mjs` | 누락·철회 Consent의 세 P0 action별 runtime denial 및 facts/callback assertions |
| `docs/POLICY-DECISION-LOG.md` | `CON-008-DEC-001` 권고안, 경계, 대안 및 잔여 위험 |
| `docs/ACCEPTANCE-TESTS.md` | 여섯 Acceptance와 실제 실행 결과 |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md` | Acceptance 추적성 추가 및 Grant issuance/HTTP 분리 명시 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | checkpoint, 다음 Ticket 및 구현 색인 동기화 |
| `docs/implementation/MEDIQ-CON-008/*` | 본 보고서와 재현 가능한 시험 증거 |

## 6. 영향 분석

### Architecture

새 module, route 또는 product service wiring은 없다. 기존 internal Authorization operation executor test 경계만 Acceptance로 확장했다.

### API·Data

API contract, schema, migration, database runtime privilege 및 영구 제품 동작은 변경하지 않았다. DB-008 전용 scratch 환경으로 기존 승인 schema를 재적용해 회귀 검증했다.

### Security·Privacy

Consent와 Grant를 별개 evidence로 평가하며, 활성 Grant가 있어도 철회 Consent이면 operation이 거부된다. 테스트는 synthetic fixture만 사용하고 DICOM payload, 환자 식별정보, credential 또는 secret을 evidence에 기록하지 않았다. 이 결과는 실제 HTTP/Viewer/PACS 경로의 side effect 차단을 보증하지 않는다.

## 7. 실행 및 검증 요약

- 세 P0 action의 missing/withdrawn Consent runtime denial: PASS
- API typecheck 및 회귀 20 files / 373 tests: PASS
- DB-008 full disposable reset/reapply 및 DB-002~007 regression: PASS
- 세부 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)

## 8. 변경하지 않은 사항

- Consent withdrawal은 Grant row를 변경하거나 자동 revoke하지 않는다.
- Grant 발급 시 Consent 재검증·직렬화는 별도 Gate다.
- HTTP route, Viewer, Download, DICOMweb, PACS/STOW 및 전체 P0 E2E는 구현·검증하지 않았다.
- overall P0 상태는 계속 `BLOCKED`다.

## 9. 결정 및 예외

`CON-008-DEC-001`은 `PDEC-001`에 따라 변경 전 작성했다. 권고안은 기존 PostgreSQL runtime harness의 Acceptance 강화만 선택하고, 신규 API/schema/권한이나 grant 자동철회를 제외했다.

## 10. 잔여 위험과 후속 작업

- Grant issuer의 missing/withdrawn Consent 거부 및 동시 발급 race는 별도 `MEDIQ-GRT-*` Acceptance 필요
- 보호 HTTP route의 BOLA/no-data behavior는 `AT-SEC-003` 및 `AT-SEC-017` Gate로 유지
- 실제 Viewer/Download/PACS no-side-effect 및 A→MediQ→B 통합은 미검증
- 다음 예정 Ticket: `MEDIQ-GRT-001`; 먼저 recommendation, scope, security boundary, Acceptance를 기록

## 11. 최종 판정

```text
Ticket: MEDIQ-CON-008
Scope: Internal DB-backed Study Authorization operation boundary
Changed: Six runtime denial cases and linked recommendation/Acceptance/traceability records
Not changed: Grant issuance, product HTTP, Viewer/Download/PACS, schema, migration, permanent grants
Security impact: Missing or withdrawn Consent fails closed before the protected callback for all P0 actions
Tests executed: API typecheck, API regression, DB-008 full reset/reapply and DB-002~007 regression
Tests not executed: Grant-issuance route/race, HTTP BOLA, product image side effects, legal consent, full P0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Grant issuer and product protected paths remain unimplemented/unverified; overall P0 BLOCKED
Status: PASS (scoped)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | 권고안/Acceptance 선기록, 여섯 runtime denial case, DB/API 검증 및 문서 정합화 |
