# MEDIQ-PAT-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-004` |
| 제목 | PatientMapping persistence-to-domain negative regression |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` |

## 1. 목표

합성 입력과 mocked PostgreSQL query를 사용해 PatientMapping persistence adapter의 조회 결과가 도메인 검증에 안전하게 전달되는 거부 경계를 검증한다. 이 범위는 DB 런타임 권한이나 목적지 접근 인가를 구현·승인하지 않는다.

## 2. 범위

### 포함

- 0행 조회 결과의 `null` 처리 및 도메인 `MAPPING_MISSING` 거부 확인
- 저장된 `AMBIGUOUS`, `UNVERIFIED`, `REVOKED`, 검증 시각이 없는 `VALID` 상태의 fail-closed 확인
- 중복 행을 첫 번째 결과로 선택하지 않고 고정 persistence 오류로 거부하는지 확인
- Query 오류의 상세를 노출하지 않고 고정 persistence 오류로 변환하는지 확인
- 합성 Local Patient ID, SQL 및 드라이버 상세가 오류에 노출되지 않는지 확인

### 제외

- 실제 PostgreSQL 통합, Migration, DB 권한, Tenant RLS 및 runtime role
- 교차 병원 목적지 조회, API/route, Consent·Authorization·Transfer Grant 연결
- PACS preflight, STOW-RS 호출 및 `AT-SEC-012` no-STOW 통합 Acceptance
- PAT-003 도메인 테스트의 중복 구현

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PAT-004` | 목적지 매핑 조회 결과는 모호하거나 검증되지 않으면 거부 | mocked persistence-to-domain 회귀 테스트 |
| 보안 | `SEC-IAM-007~009`, `THR-018` | 최소 공개·fail-closed·교차 경계 미승인 | 고정 오류와 상태 기반 거부 |
| API·도메인 | PatientMapping Repository + `validateDestinationPatientMapping` | 이 Ticket은 내부 adapter/domain 경계만 시험 | mock query 결과를 검증기에 전달 |
| Acceptance | `TC-PAT-004-PER-001~005` | DB/PACS 통합을 주장하지 않음 | 이 Ticket 테스트 파일 |

## 4. 구현 결과

mocked PostgreSQL adapter 결과를 destination mapping domain validator에 연결하는 7개 Acceptance test를 추가했다. 누락은 `MAPPING_MISSING`, 저장된 비승인 상태는 각 고정 `DENY`로 이어지고, 중복행과 DB 오류는 고정 `PatientMappingPersistenceError`로 종료한다. 합성 Local Patient ID·SQL·driver 상세는 오류 메시지에 노출되지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `tests/api/patient-mapping-denial.test.mjs` | 합성 mocked repository-to-domain 거부 경계 Acceptance |
| `docs/POLICY-DECISION-LOG.md` | PAT-004-DEC-001 권고안 및 경계 기록 |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/ACCEPTANCE-TESTS.md` | 요구사항·보안·Acceptance 추적성 및 실행 결과 동기화 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `docs/P0-DEVELOPER-BASELINE.md` | 현재 상태·시험 수·후속 게이트 동기화 |
| `docs/implementation/README.md`, 이 Ticket의 구현·증거 기록 | 현황 색인과 구현 기록 |

## 6. 영향 분석

### Architecture

- Production source, schema, API, runtime wiring 변경 없음. 테스트 전용 mocked adapter query 사용.

### API·Data

- 없음 또는 영향 내용

### Security·Privacy

- fail-closed 경계의 회귀 증거를 추가한다. 실제 Tenant RLS, Consent/Authorization/Grant 또는 PACS 접근 가능성은 부여하지 않는다. 합성 데이터만 사용하며 오류 공개 최소화를 검증한다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: 실행 후 기록

## 8. 변경하지 않은 사항

- Runtime DB, Tenant RLS, 목적지 API/인가, Consent·Grant, PACS Preflight/STOW는 변경하지 않는다.

## 9. 결정 및 예외

- `PAT-004-DEC-001` — `docs/POLICY-DECISION-LOG.md`; 제안 권고안대로 합성 mocked persistence-to-domain negative Acceptance만 수행한다.

## 10. 잔여 위험과 후속 작업

- 실제 DB·RLS 결과와 실제 PACS `no-STOW`는 여전히 검증되지 않으며 별도 PAT/PACS 통합 Gate에서 시험해야 한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-PAT-004
Scope: Mocked PatientMapping persistence-to-domain denial Acceptance
Changed: Added seven synthetic tests and synchronized Acceptance/requirements/progress documentation
Not changed: Runtime DB/RLS/grants, API, destination authorization, Consent/Grant and PACS import
Security impact: Confirms fail-closed duplicate/error/status handling; no new runtime access
Tests executed: API build; focused 7/7; API regression 17 files / 330 tests
Tests not executed: Live PostgreSQL/RLS and PACS no-STOW (outside Ticket scope)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Actual destination retrieval/authorization and PACS no-STOW remain open under PACS-004/AT-SEC-012
Status: PASS (PAT-004 Ticket Acceptance scope only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | 권고안대로 mocked adapter-to-domain 7/7, API regression 17 files / 330 tests; live DB/PACS 주장은 제외 |
