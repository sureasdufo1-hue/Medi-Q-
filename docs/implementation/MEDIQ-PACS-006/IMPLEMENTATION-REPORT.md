# MEDIQ-PACS-006 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PACS-006` |
| 제목 | Exact destination Series and Instance verification primitive |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 상태 | `PARTIAL` — internal read-only verifier scope tested; product post-STOW Acceptance remains unrun |

## 1. 목표

수신 PACS에서 서버가 사전에 확정한 Study→Series→SOP Instance 계층을 읽기 전용 QIDO-RS로 빠짐없이 조사하고, 기대 집합과 목적지 집합의 정확한 동일성을 보수적으로 판정한다. 이 결과는 완료 상태를 직접 변경하거나 영상 접근 권한을 부여하지 않는다.

## 2. 범위

### 포함

- `PACS-006-DEC-001`과 `MEDIQ-PACS-006` Acceptance에 따른 내부 `DicomGateway` 목적지 검증 입력·결과 계약 및 Orthanc adapter 구현
- 서버가 resolve한 비어 있지 않은 기대 Series/SOP 목록의 UID, 중복, 계층 및 수 제한 검증
- 목적지 B만 대상으로 QIDO `limit`/`offset` 전체 페이지를 조회하고 DICOM Warning 299의 남은 결과 수를 검증
- 두 번의 완전한 조회가 제한시간 내 동일하며 Study→Series→SOP 계층 전체가 기대 목록과 정확히 일치할 때만 `matchesExpected=true` 반환
- 중복·잘못된 UID·다른 Study/Series·누락/추가 인스턴스·페이지 불일치·제한 초과·시간 초과 시 fail-closed 처리

### 제외

- HTTP route, application coordinator, DB/schema/migration 또는 ExchangeSession terminal state 변경
- Mandatory Preflight, Consent/Authorization/Grant 평가, operation-time Session fence 결합
- STOW-RS 또는 기타 목적지 쓰기, 실제 전송 및 제품 no-STOW 보장
- 바이트 무결성 비교, 최종 Provenance/Audit 커밋, `COMPLETED` 판정
- 운영 PACS, 실제 환자정보, 운영 자격증명 사용

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PACS-005`, `DICOM-INTEROPERABILITY-PROFILE.md` §10.3.1 | 목적지 Study의 계층별 정확한 식별 검증 | PACS-006 adapter tests 및 read-only Orthanc baseline |
| 보안 | `SEC-INT-001`, `THR-020` | 누락·변조·잘못된 목적지에 fail closed; 식별 일치는 byte integrity나 authorization을 대체하지 않음 | 잘못된 계층/중복/불일치/시간초과 테스트 |
| 정책 | `PACS-006-DEC-001` | bounded pagination, Warning 299 검사, 2회 동일 전체 스캔, 최대 5분 제한 | 구현 계약 및 시험 매트릭스 |
| Acceptance | `MEDIQ-PACS-006`, `AT-FUNC-013` | 내부 검증기 Acceptance는 수행; 전체 post-STOW 제품 Acceptance는 미실행 | `TEST-EVIDENCE.md`; `TC-PACS-006-COMP-001` 및 제품 `AT-FUNC-013`은 `NOT RUN` |

## 4. 구현 결과

`VerifyDestinationStudyRequest`는 호출자가 제공한 단순 SOP 목록 대신 서버가 resolve한 `{seriesInstanceUid, sopInstanceUid}` 목록을 받는다. 응답은 조회된 Series/SOP 식별자 집합과 exact-match 결과를 제공한다. 실제 B Orthanc adapter는 Series와 Series별 Instance QIDO를 페이지 단위로 끝까지 읽고, Warning 299 및 결과 수 진행을 검증한다. 응답 UID가 요청 Study/Series 계층에 속하는지, 전체 Series/SOP ID의 중복 여부, 수·본문·시간 상한을 함께 검사한다.

한 번의 조회는 PACS의 동시 변경에 대한 원자적 snapshot이 아니므로, 완전한 계층 스캔 두 회가 동일하고 둘 다 기대 집합과 정확히 같을 때만 일치로 반환한다. `Set.has()` 후 `add()`하는 방식으로 중복을 거부한다. 이 결과는 식별자 집합 일치만 의미하며 DICOM byte hash 일치, 권한 유효성 또는 전송 완료를 의미하지 않는다. Adapter는 application route/coordinator에 연결되지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/dicom/application/dicom-gateway.port.ts` | 목적지 기대 Series/SOP 계층과 검증 결과 Port 계약 정렬 |
| `services/api/src/dicom/infrastructure/orthanc-dicomweb.adapter.ts` | 완전 페이지 조회, Warning 299·계층·중복·상한·2회 스캔 검증 |
| `tests/api/orthanc-dicomweb.adapter.test.mjs` | 페이지·중복·잘못된 UID/계층·누락/추가·스캔 변화·상한·시간초과 Acceptance |
| `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | 실제 HTTPS Test Orthanc A/B의 읽기 전용 빈 목적지 기준선과 반복 안정성 확인 |
| `tests/types/dicom-gateway.port.contract.ts` | 변경된 Port의 compile-time 계약 fixture 정렬 |
| `docs/POLICY-DECISION-LOG.md` | PACS-006-DEC-001 권고안 및 결정 기록 |
| `docs/ACCEPTANCE-TESTS.md` | 내부 verifier Acceptance와 미실행 product completion 분리 |
| `docs/DICOM-INTEROPERABILITY-PROFILE.md` | 정확 계층 조회/페이지/상한과 적용 경계 반영 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | 최신 체크포인트·현황표·후속 의존성 동기화 |
| `docs/implementation/MEDIQ-PACS-006/` | 이 보고서와 재현 가능한 시험 증거 |

## 6. 영향 분석

### Architecture

기존 내부 DICOM Gateway Port/adapter 계약만 확장했다. 신규 endpoint, route wiring, coordinator 또는 worker 동작은 추가하지 않았다.

### API·Data

Public API, DB schema, migration, 저장 데이터 및 PACS 내용 변경 없음.

### Security·Privacy

목적지 B에 대한 읽기 전용 QIDO만 검증했다. 환자정보나 DICOM payload를 시험 보고서에 기록하지 않았다. 이 검증은 Consent/Authorization/Grant, Tenant·Session fence, 전송 권한, byte integrity, provenance, audit을 대체하지 않는다. STOW는 호출되지 않았다.

## 7. 실행 및 검증 요약

- 세부 명령·실제 종료 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 내부 목적지 adapter: 31/31 PASS
- API build/regression: 35 files / 652 tests PASS
- API typecheck 및 DICOM Port contract: PASS
- HTTPS Test Orthanc A/B read-only integration: 7/7 PASS; B 비어 있음, STOW/POST 없음
- 검증 결론: 내부 verifier 하위 범위만 `PASS`; Ticket 전체는 미완료이므로 `PARTIAL`

## 8. 변경하지 않은 사항

STOW, product endpoint, Preflight/coordinator, PACS operation state, DB, 실제 transfer, terminal completion, byte integrity 및 완료 Provenance/Audit는 변경하거나 PASS로 주장하지 않는다.

## 9. 결정 및 예외

`PACS-006-DEC-001`을 따른다. 경계 변경 예외는 없다. QIDO pagination은 동시 변경에 원자적 snapshot을 제공하지 않을 수 있어 연속 두 번의 동일 완전 스캔을 요구하지만, 이 방법도 제3의 동시 변경이나 byte 단위 동일성을 증명하지 않는다.

## 10. 잔여 위험과 후속 작업

- 신뢰된 PACS-001 coordinator에 서버 출처 inventory와 operation/Tenant/destination binding으로 연결되지 않음
- post-STOW 경로에 이 검증기를 사용한 통합 및 `AT-FUNC-013` 미실행
- 목적지 exact identity와 별도로 source/destination byte integrity, final Provenance 및 completion Audit를 원자적으로 증명해야 함
- 전체 Mandatory Preflight 및 제품 no-STOW/security Acceptance가 완료되기 전 STOW를 계속 차단해야 함
- QIDO 요청은 두 차례 전체 계층 조회이므로 PACS 부하·지연 및 제품 운영성은 별도 검증 대상

## 11. 최종 판정

```text
Ticket: MEDIQ-PACS-006
Scope: 내부 목적지 exact Series/SOP identity verifier
Changed: DICOM Gateway Port/Orthanc adapter, scoped tests, decision/Acceptance/profile/plan/evidence docs
Not changed: route/coordinator, DB, Preflight integration, STOW, operation state, byte integrity, terminal completion
Security impact: B-only read-only QIDO; bounded and fail-closed; no PHI/credential evidence; no STOW
Tests executed: focused 31/31; API 35 files/652 tests; typecheck; DICOM Port contract; HTTPS Orthanc 7/7
Tests not executed: post-STOW product AT-FUNC-013, atomic completion, full Preflight, live STOW, full A→B E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: coordinator binding and completion proof absent; identity match is not byte integrity
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-02 | `PARTIAL` | 내부 read-only verifier와 scoped tests 완료; 전체 post-STOW Acceptance 미실행 |
