# MEDIQ-AUT-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-002` |
| 제목 | Default-deny authorization evaluator contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — evaluator contract only; business authorization and protected access remain unavailable |

## 1. 목표

`AUT-002-DEC-001` 및 `REQ-AUT-002`에 따라, 불완전하거나 위조된 Context, policy 미설정, 명시적 거부, 예상하지 못한 policy 결과 및 예외 상황에서 항상 `DENY`하는 비영속 Authorization evaluator 경계를 구현한다. 오직 정확한 `ALLOW` 결과만 evaluator 계약상 `ALLOW`가 되며, 이는 실제 업무 권한 판정을 의미하지 않는다.

## 2. 범위

### 포함

- Policy Decision Log에 default-deny 권고안 및 승인 기록
- AUT-001에서 생성된 Context 인스턴스만 허용하고 structural copy/prototype forgery 거부
- Policy port와 `ALLOW | DENY` 결과 타입 정의
- Policy 미설정·evaluator 누락·unsupported result·sync/async 예외 시 fail-closed
- AUT-002 Acceptance, 보안 요구사항 및 추적성 기록
- 합성 식별자 기반 evaluator unit test 및 API 회귀시험

### 제외

- 실제 Consent, Transfer Grant, Tenant, Patient, recipient, resource, action, expiry 조회·binding을 수행하는 business policy
- Authorization module/controller/route 등록, OpenAPI/API 동작, HTTP safe-error integration
- DB schema/grant/RLS/migration, Audit 기록, Viewer/Download/PACS side effect
- PAT-002 runtime grant 및 PatientMapping 경로 개방, Orthanc/PACS 또는 DICOM E2E

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `AUT-002-DEC-001` | exact `ALLOW`만 통과; invalid/missing/error/unsupported 결과는 `DENY` | [정책 결정 로그](../../POLICY-DECISION-LOG.md) |
| 요구사항 | `REQ-AUT-002` | default-deny evaluator 결과 계약 | `TC-AUT-002-DD-001~006` |
| 보안 | `SEC-AUTHZ-002~003`; `THR-030` | 명시 권한만 허용; 예외·오류는 fail-closed; evaluator만으로 실제 접근을 허용하지 않음 | `authorization-engine.test.mjs` |
| Domain | `DOMAIN-MODEL.md` Authorization | Context provenance guard 및 정확한 결과 처리 | authorization domain/application types |
| Acceptance | `ACCEPTANCE-TESTS.md` AUT-002 | invalid input, missing policy, deny/allow contract, unsupported result, exception | scoped 6 checks / 20 focused tests |
| 의존성 | `MEDIQ-AUT-001`; 후속 `MEDIQ-AUT-003/004` | Context 진위 경계 사용; business binding과 API side-effect guard는 후속 gate | no production wiring |

## 4. 구현 결과

`AuthorizationContext`는 생성된 객체를 private `WeakSet`에 등록하고, 정적 `is()` guard로 해당 경계를 검사한다. 따라서 유효한 모양만 복사한 plain object나 prototype을 흉내 낸 객체는 policy 호출 전에 거부된다. `AuthorizationEngine`은 유효 Context가 아니거나 policy/evaluator가 없으면 `DENY`를 반환한다. Policy 결과가 문자열 `ALLOW`와 정확히 일치할 때만 `ALLOW`를 반환하며, `DENY`, truthy 값, nullish 값, 대소문자·공백 변형 및 기타 알 수 없는 결과는 모두 `DENY`다. 동기 예외, 비동기 rejection, policy getter 예외도 내부 오류를 노출하지 않고 `DENY`로 닫는다.

명시적 `ALLOW` 테스트는 가짜 policy를 이용해 evaluator의 결과 매핑만 검증한다. 실제 business policy는 설치·등록되지 않았고 이 코드는 API route나 보호된 데이터 경로에서 호출되지 않는다. 따라서 이 Ticket은 권한 시스템이나 영상 접근을 구현한 것이 아니다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authorization/domain/authorization-context.ts` | 생성된 Context 인스턴스 provenance guard 추가 |
| `services/api/src/authorization/domain/authorization-effect.ts` | `ALLOW | DENY` 결과 타입 |
| `services/api/src/authorization/application/authorization-policy.port.ts` | policy evaluator port 계약 |
| `services/api/src/authorization/application/authorization-engine.ts` | 정확한 `ALLOW` 이외는 전부 deny하는 evaluator |
| `tests/api/authorization-engine.test.mjs` | invalid/forged Context, missing policy, result allowlist, 예외 등 20개 테스트 |
| `docs/POLICY-DECISION-LOG.md` | `AUT-002-DEC-001` 권고안과 채택 기록 |
| `docs/REQUIREMENTS.md`, `docs/SECURITY-REQUIREMENTS.md` | 요구사항·보안 acceptance 및 traceability |
| `docs/DOMAIN-MODEL.md`, `docs/SYSTEM-ARCHITECTURE.md`, `docs/THREAT-MODEL.md` | default-deny contract와 미연결 경계 명시 |
| `docs/ACCEPTANCE-TESTS.md` | `TC-AUT-002-DD-001~006` 결과 및 제한 범위 기록 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`, `README.md` | 진행 현황·후속 gate 동기화 |
| `docs/implementation/README.md` | Ticket scoped status 색인 |
| `docs/implementation/MEDIQ-AUT-002/*` | 구현 보고서와 시험 증거 |

## 6. 영향 분석

### Architecture

- Pure application/domain evaluator만 추가했다. Nest `AppModule`/controller/route에 등록하지 않았다.
- Policy port에 실제 business implementation을 제공하지 않았다.

### API·Data

- OpenAPI, DB schema, migration, DB role/grant/RLS, persistent data 및 external API는 변경하지 않았다.
- Consent/Grant/PatientMapping record를 읽거나 쓰지 않았다.

### Security·Privacy

- 누락·위조·예외·예상 밖 결과는 모두 deny하는 폐쇄적 경계를 추가했다.
- Context나 테스트용 explicit-ALLOW 결과는 권한 증명이나 영상 접근 허가가 아니다.
- 테스트에는 합성 UUID만 사용했고 PHI, credential, DICOM payload, secret을 추가하지 않았다.

## 7. 실행 및 검증 요약

- `npm run test:api`: TypeScript build PASS, 10 test files / 147 tests PASS.
- `npx vitest run tests/api/authorization-engine.test.mjs`: 1 file / 20 tests PASS.
- `git diff --check`: tracked diff exit code `0` (LF→CRLF 안내 경고만 출력); AUT-002 신규 소스·테스트·기록 파일의 trailing-whitespace scan에서도 일치 항목 없음.
- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md).

## 8. 변경하지 않은 사항

- 실제 Consent/Grant 상태 및 Tenant·object·action·recipient·expiry의 업무 권한 판단
- API route, request-to-policy orchestration, safe HTTP error, Audit event 및 데이터 반환 차단 integration
- DB privilege/RLS/migration, PatientMapping runtime grant/route, Viewer/Download/PACS access
- Hospital A → MediQ → Hospital B DICOM transfer 및 Acceptance E2E
- PAT-002 제한 해제. PAT-002 및 전체 P0 E2E는 계속 미완료다.

## 9. 결정 및 예외

- `AUT-002-DEC-001`은 사용자의 recommendation-first 정책에 따라 기록 후 채택했다.
- 가짜 policy의 explicit `ALLOW`는 evaluator contract testing에만 허용했다. 운영 policy를 만들거나 route에 연결하는 예외는 없다.
- 다음 결정·구현은 AUT-003에서 실제 대상/Tenant/action binding을 권고안·Acceptance로 먼저 확정한 뒤 진행한다. AUT-004에서 API fail-closed 및 side-effect 차단을 별도 검증한다.

## 10. 잔여 위험과 후속 작업

- **Open:** evaluator가 route에 미연결이고 실제 business policy가 없다. 서비스에서 보호자원 권한을 확인할 수 없으므로 보호 경로는 계속 사용할 수 없어야 한다.
- **Open:** evaluator 단위시험은 HTTP 응답, 데이터 반환, DB/PACS side effect가 없는 것을 증명하지 않는다. 이를 AUT-004 integration Acceptance에서 검증해야 한다.
- **Open:** policy 구현 시 Consent/Grant 및 Tenant/object/action/recipient/expiry를 동일 요청 범위에 결속하지 않으면 잘못된 접근이 가능하다.
- **Next:** 권고안 우선 절차로 `MEDIQ-AUT-003` business policy/object authorization 범위와 Acceptance를 먼저 구체화한다. 이후 AUT-004와 Consent/Grant gates를 닫기 전에는 PAT-002 접근 경로를 열지 않는다.

## 11. 최종 판정

```text
Ticket: MEDIQ-AUT-002
Scope: Non-persistent default-deny evaluator contract only
Changed: Context provenance guard, policy/effect contracts, evaluator, 20 focused tests, normative docs and records
Not changed: Real business policy, Consent/Grant/object/Tenant binding, route/API, DB access, Audit, Viewer/Download/PACS, PAT-002 access
Security impact: Invalid/missing/unsupported/error conditions deny; exact ALLOW contract is fake-policy-only and grants no product access
Tests executed: npm run test:api (build + 147/147); focused AUT-002 suite (20/20); git diff --check (exit 0)
Tests not executed: live policy/repository/API/HTTP side-effect, Consent/Grant/Tenant/object integration, Orthanc/PACS and A→B E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-AUT-002/
Remaining risks: No production business policy or API integration; protected access and PAT-002 remain unavailable
Status: PASS (scoped Ticket only)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` | default-deny evaluator contract 구현·문서·Acceptance·시험 증거 완료; business authorization은 후속 범위 |
