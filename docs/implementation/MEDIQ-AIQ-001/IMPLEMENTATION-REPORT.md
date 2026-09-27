# MEDIQ-AIQ-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AIQ-001` |
| 제목 | Patient convenience expansion and synthetic LLM question pack |
| 분류 | `CAPSTONE-P1`; real-data external disclosure is `PRODUCTIONIZATION` |
| 작성일 | `2026-09-26` |
| 상태 | `PARTIAL` — 문서·HTML Prototype 완료, 제품·외부 연동·실기기 시험 미완료 |

## 1. 목표

환자가 영상·검사·활동을 더 쉽게 찾고 진료를 준비하도록 Timeline·쉬운 모드·최신성·검색·질문·합성 추세를 설계한다. 합성 건강검진·검사자료는 식별정보를 제외한 질문 Text로 만든 뒤 사용자가 검토하고 Local Clipboard에 복사할 수 있게 시연한다.

## 2. 범위

### 포함

- 편의 기능 확장 요구사항·보안·Acceptance 기준선
- 합성 `TEST/SYNTHETIC/MOCK` Record의 AI 질문자료 Allowlist와 위험 고지
- 11번째 HTML Route `timeline`, 큰 글씨 쉬운 모드, 검색·즐겨찾기
- 합성 검사 추세, 방문 질문·자료 꾸러미, 수동 일정, 정정 요청 시안
- 합성 검사 선택 → 질문 Preview → Clipboard Copy UI
- 외부 URL·Network API·Provider Deep Link가 없는 Local Prototype

### 제외

- 실제 환자 건강정보의 Copy·Capture·외부 제공
- 외부 LLM API, Provider 선택, 자동 Paste·Upload·Send
- LLM 답변 저장, 진단·판독·처방 또는 Consent/Authorization/Grant 입력
- Android 앱, Backend/API, DB, Audit Event, 정정 Case와 방문꾸러미 영속화
- 건강정보 고속도로·병원 운영 API 및 실기기 브라우저 시각 검증

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PXE-CX-001~013` | 편의 Projection·표시·정정·꾸러미 | HTML 일부 / 정적 검사 |
| 요구사항 | `REQ-AIQ-001~008` | Synthetic-only, Preview, no auto-send | HTML Prototype / 정적 검사 |
| 보안 | `SEC-PXE-CX-001~008` | 권한 비승격, 암호화 저장 후보, 최소 노출 | 문서 기준선 |
| 보안 | `SEC-AIQ-001~007` | Allowlist, no logging, Production fail-closed | HTML 경계 / 정적 검사 |
| Acceptance | `TC-PXE-CX-001~009` | 편의 기능 성공·거부 경로 | 제품 시험 `NOT RUN` |
| Acceptance | `TC-AIQ-001~008` | 식별자 제외, no-network, 실제 Record 거부 | 정적 일부 / 제품 시험 `NOT RUN` |
| API | `OPENAPI.yaml` | 신규 Endpoint 없음 | 회귀 검사 |

## 4. 구현 결과

환자 경험 HTML에 통합 건강 Timeline을 추가하고 영상·검사·동의·환자 입력 일정을 하나의 검색 가능한 흐름으로 표현했다. 쉬운 모드는 글씨·버튼 크기와 대비를 높이며 권한과 보안 경고를 바꾸지 않는다. 건강검진 화면에는 동일 코드·단위라는 전제의 합성 추세와 정정 요청 시안이 추가됐다.

`AI 질문용 자료 만들기`는 합성 검사 Record에서 검사명·월 단위 시점·값·단위·출처 참고문구와 상담 준비 질문만 만든다. 이름, 생년월일, Patient ID, 병원 식별자, DICOM UID와 원본 파일은 제외 대상으로 표시한다. 복사는 Local Clipboard 동작뿐이며 외부 LLM을 열거나 호출하지 않는다.

## 5. 변경 파일

| 파일군 | 변경 내용 |
|---|---|
| `docs/patient-experience/PATIENT-CONVENIENCE-EXPANSION-SPEC.md` | 편의 기능 10종의 분류·화면·요구사항·보안·시험 |
| `docs/patient-experience/EXTERNAL-LLM-QUESTION-PACK-SPEC.md` | 합성 질문자료와 Production Gate |
| Patient Experience README/Roadmap/Traceability | 문서 색인·Wave·ID 연결 |
| `docs/mockups/mediq-patient-experience-mockup.html` | Timeline, 쉬운 모드, 추세, 방문준비, AI 질문 Preview·Copy |
| Scope/Product/Requirements/Security/Data Flow | 합성/실제자료·외부전송 경계 |
| Threat/Acceptance/Implementation | 위협·시험·Ticket 계획 |
| Mobile/SaaS 화면 기준 | 비규범 Prototype과 기존 화면 수 경계 |
| `docs/implementation/MEDIQ-AIQ-001/` | 구현·시험 증거 |
| `README.md` | 편의 확장·AI 질문자료·통합 HTML 색인 |

## 6. 영향 분석

### Architecture·API·Data

정적 HTML과 문서만 변경했다. `OPENAPI.yaml`, Domain Model, Data Model, ERD, DB와 외부 Connector는 변경하지 않았다. Timeline·검색·정정·방문꾸러미는 구현 전 API/Domain GAP을 닫아야 한다.

### Security·Privacy

- MVP 자료는 `TEST/SYNTHETIC/MOCK`로 제한한다.
- 질문자료는 Allowlist 기반이며 식별자·원본 영상·원문 Free Text를 제외한다.
- Clipboard 노출과 외부 서비스의 저장·학습·국외처리 가능성을 복사 전에 고지한다.
- 외부 LLM 자동 호출·Deep Link·응답 재수입을 금지한다.
- 실제 건강정보 기능은 Production Gate 전 Fail Closed한다.

## 7. 실행 및 검증 요약

- JavaScript Syntax, 11 Route/Page, DOM ID 고유성: `PASS`
- 외부 URL, Network API, 외부 실행 코드: 각각 0건
- 필수 고지·Synthetic Marker와 REQ/SEC/TC ID 개수: `PASS`
- OpenAPI 신규 항목 0, Mobile 77/SaaS 79/P0 Mission 경계: `PASS`
- 첫 Page Count 정규식은 JS Template 문자열을 화면으로 오인해 `FAIL`; 선택자를 좁혀 재실행 후 `PASS`
- Browser Visual/Interaction, Android, API, Security Integration, E2E: `NOT RUN`

상세 명령과 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)를 따른다.

## 8. 변경하지 않은 사항

- P0 Hospital A → MediQ → Hospital B Golden Path와 완료조건
- Consent, Authorization, Grant, Preflight, Destination Verification, Integrity, Provenance, Audit
- Mobile 77개와 SaaS 79개 Screen 기준선
- 외부 LLM·실제 건강정보·실제 의료기관 연동

## 9. 결정 및 예외

- 기능 명칭은 `AI 진단`이 아니라 `AI 질문용 자료 만들기`로 고정한다.
- 이미지 Capture는 합성 Watermark Card 후보만 허용하고 현재 HTML은 Text Copy만 구현한다.
- 개인정보보호위원회 생성형 AI 안내의 입력자료·생성결과, 민감정보 경고, 학습·대화 저장 사용자 통제 원칙을 Production Gate에 반영한다.

## 10. 잔여 위험과 후속 작업

- 실제 Browser Responsive·Keyboard·Screen Reader 동작을 확인하지 못했다.
- Clipboard 내용의 OS·다른 앱 노출 위험은 제품 구현에서 수명 제한·Background 차폐와 실기기 시험이 필요하다.
- Android On-device Allowlist와 실제 Record Fail-closed 코드는 아직 없다.
- 실제 건강정보 외부 제공은 개인정보 영향평가, 법률 근거, Provider 처리·보존·학습·국외이전 Matrix와 승인된 Connector가 필요하다.

## 11. 최종 판정

```text
Ticket: MEDIQ-AIQ-001
Scope: 환자 편의 확장과 합성 검사자료 AI 질문 Text 준비·Local Copy 시연
Changed: 승인 문서, 11번째 Timeline Route, 쉬운 모드, 합성 추세·방문 준비·정정·AI 질문 Prototype
Not changed: OpenAPI, DB, Domain/ERD, Android, 외부 LLM, 실제 건강정보 연동, P0 완료조건
Security impact: Synthetic-only Allowlist, no-network, 복사 전 경고, 실제자료 Fail-closed 기준 추가
Tests executed: JS 문법, Route/Page, DOM ID, URL/Network/외부실행 0건, Marker, ID 개수, OpenAPI·화면 수·P0 경계 정적 검사
Tests not executed: Browser Visual/Interaction, Android, API/Contract, Security Integration, Accessibility, E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-AIQ-001/
Remaining risks: 실기기 Clipboard·Background·접근성 미검증, Production 법률·Provider 심사 미완료
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-26 | `PLANNED` | 구현 기록 생성 |
| 2026-09-26 | `PARTIAL` | 기준선·HTML Prototype·정적 증거 작성 |
