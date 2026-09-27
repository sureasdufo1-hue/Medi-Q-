# MEDIQ-DOC-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DOC-002` |
| 제목 | Patient experience feature pack 1-9 documentation baseline |
| 분류 | `CAPSTONE-P1` — 기능 8·9는 `POST-MVP` 하위 범위 |
| 작성일 | `2026-09-26` |
| 상태 | `TESTED` — Documentation only |

## 1. 목표

환자 편의 기능 1–9에 필요한 문서 체계와 구현 순서를 계획하고, 기능별 공식 작성 Prompt와 검증 가능한 정식 명세를 작성해 승인 기준선에 연결한다.

## 2. 범위

### 포함

- 공통 문서 계획·로드맵·추적성
- 기능 1–9의 Prompt 9개와 Spec 9개
- 기능 1–7 `CAPSTONE-P1`, 기능 8–9 `POST-MVP` 분류
- 기능 요구사항 73개, 보안 요구사항 49개, 논리 화면 39개, Acceptance 59개
- Scope/Product/Requirements/Security/Mobile UX/Threat/Acceptance/Implementation 기준선 연결

### 제외

- Android/Web/Backend 코드, OpenAPI Endpoint, DB Migration
- Push Provider, 실제 PACS/EMR/FHIR 연동, 실제 환자정보
- 법적 효력이 있는 전자 동의 영수증 또는 보호자 권한 검증
- Unit/Contract/Integration/Security/E2E 기능 시험

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 범위 | `CAPSTONE-MVP-BOUNDARY.md` §43 | 1–7 P1, 8–9 POST-MVP | P0 독립 Gate |
| 요구사항 | `REQ-PXE-*` 73개 | 기능별 검증 가능 요구사항 | 각 `TC-PXE-*` |
| 보안 | `SEC-PXE-*` 49개, `SEC-PXE-COMMON-*` | 최소노출·재인가·결과확정·미래 Gate | Negative/Security Test |
| 위협 | `THR-PXE-001~008` | UI 비권위화, PHI, 중복, 위임 등 | Feature Threat Table |
| Acceptance | `TC-PXE-*` 59개 | 정상·실패·거부·오프라인·접근성 | 현재 NOT RUN |
| 전체 연결 | `PATIENT-EXPERIENCE-TRACEABILITY.md` | ID·Ticket·기준선 Matrix | 구현 Ticket 입력 |

## 4. 문서화 결과

다음 설계를 승인 가능한 문서 기준선으로 등록했다.

1. 행동센터는 권한이 아닌 서버 상태 Projection이다.
2. 환자 활동 화면은 Audit 원장의 최소 Projection이고 영수증은 불변 승인 Snapshot이다.
3. Push는 최소 Hint이며 In-app Inbox와 서버 상태가 권위 원본이다.
4. 병원 방문 모드는 QR·Consent·Grant·Preflight·Verification을 분리한다.
5. 쉬운 영상 카드는 원본 Metadata를 바꾸거나 진단을 추론하지 않는다.
6. 저장 관리에서는 삭제·만료·철회·Crypto-shred를 구분한다.
7. 오류 복구는 Result Unknown과 멱등성 없는 재시도를 안전하게 다룬다.
8. 판독문·의뢰서는 별도 임상 문서 자원이며 POST-MVP다.
9. 가족 위임은 독립 신원·법적 권한·최소 Scope를 요구하며 POST-MVP다.

## 5. 변경 파일

| 파일군 | 변경 내용 |
|---|---|
| `docs/patient-experience/README.md` | 문서군 범위·보안·색인 |
| `docs/patient-experience/PATIENT-EXPERIENCE-FEATURE-ROADMAP.md` | Wave·Gate·성공지표 |
| `docs/patient-experience/PATIENT-EXPERIENCE-TRACEABILITY.md` | 1–9 전체 ID·문서·Ticket 연결 |
| `docs/patient-experience/prompts/` | 공통 Protocol과 기능별 Prompt 9개 |
| `docs/patient-experience/01~09-*-SPEC.md` | 정식 기능 명세 9개 |
| `README.md` | 공식 문서 시작점 추가 |
| Scope/Product/Requirements/Security | 환자 경험 Amendment와 분류·공통 통제 |
| Mobile Requirements/UI UX | 논리 화면과 기존 보안정책 연결 |
| Threat/Acceptance/Implementation | 위협 8개, Test Range, Wave/Ticket 등록 |
| `docs/implementation/` | 본 Ticket 보고서·시험 증거·색인 |

## 6. 영향 분석

### Architecture

상태 Projection, Audit Receipt, Notification, Clinical Document, Delegation의 논리 후보를 정의했다. 현재 Architecture나 런타임 구성은 변경하지 않았다.

### API·Data

모든 신규 업무 API와 영속 객체는 `GAP`으로 표시했다. `OPENAPI.yaml`, Domain/Data/ERD와 Migration은 변경하지 않았고 구현 Ticket에서 동시 개정하도록 Gate를 설정했다.

### Security·Privacy

기존 Deny by Default, Consent/Authorization/Grant 분리, Tenant Isolation, 최소 노출, Result Unknown, Integrity/Verification 기준을 유지했다. 가족 위임과 임상 문서는 별도 POST-MVP 보안·법적 Gate로 차단했다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- Prompt/Spec Pair·ID 수·미완성 표식·코드 Fence·로컬 링크: `PASS`
- Core Amendment·분류 검사: `PASS`
- ID 연속성 검사: 첫 명령 Parser Error 후 수정 명령 `PASS`
- 최종 링크·P0/OpenAPI/기존 화면 수 경계 검사: `PASS`
- 애플리케이션 기능 시험: `NOT RUN` — 코드 미구현

## 8. 변경하지 않은 사항

- P0 성공조건과 우선순위
- 기존 77개 Mobile Screen 기준선과 79개 SaaS Screen ID
- `OPENAPI.yaml`, Domain Model, Data Model, ERD
- 코드·인프라·데이터·운영 Credential

## 9. 결정 및 예외

- 기능 1–7은 P1 설계 기준, 8–9는 POST-MVP 설계 기준으로 승인한다.
- 39개 `MOB-PXE-*`는 논리 화면이며 전역 Screen Count에 아직 합산하지 않는다.
- 문서 정적 검증 PASS는 기능 구현·보안 적합성·법률 적합성 PASS가 아니다.

## 10. 잔여 위험과 후속 작업

- 공통 Projection/Error Envelope Contract가 아직 없다.
- Notification Provider와 Token Lifecycle 구현 선택이 남아 있다.
- Audit Receipt의 서명·보존 정책은 ADR이 필요하다.
- 임상 문서 표준 Profile과 법적 위임 검증은 외부 결정이 필요하다.
- 실제 구현 시 각 Ticket별 위협·API·Data·Screen·시험 증거를 다시 승인해야 한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-DOC-002
Scope: 환자 경험 기능 1~9의 계획, 작성 Prompt, 정식 명세와 기준선 연결
Changed: 계획 3개, Prompt 체계 10개, Feature Spec 9개, Core Amendment 10개, 구현 기록
Not changed: 코드, OpenAPI, DB, 기존 Screen Count, 실제 연동
Security impact: 기존 불변조건 유지; 최소노출·재인가·Result Unknown·미래 기능 Gate 추가
Tests executed: 문서 구조·ID 수/연속성·링크·Fence·분류·Core 연결 정적 검증
Tests not executed: Unit, Contract, Integration, Android UI, Security, DICOMweb, E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-DOC-002/
Remaining risks: API/Data 미승인, 기능 미구현, 법적·상호운용 결정 미완료
Status: PASS — documentation scope only
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-26 | `PLANNED` | 구현 기록 생성 |
| 2026-09-26 | `TESTED` | 기능 1–9 Prompt/Spec와 Core 추적성 작성·정적 검증 |
