# MEDIQ-AIQ-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AIQ-001` |
| 대상 | Patient Convenience & Synthetic External LLM Question Pack Prototype |
| 환경 | Windows · PowerShell · Node.js syntax checker |
| 데이터 | Synthetic/Test only |
| 결과 | `PARTIAL` |

## 1. 검증 매트릭스

| ID | 검증 | 실제 결과 | 판정 |
|---|---|---|---|
| `AIQ-STATIC-001` | JavaScript Syntax | 오류 없음 | PASS |
| `AIQ-STATIC-002` | HTML Route/Page·DOM ID | 11/11, ID 24개 고유 | PASS |
| `AIQ-STATIC-003` | 외부 URL·Network·외부 실행 | 모두 0건 | PASS |
| `AIQ-STATIC-004` | 필수 Synthetic·비진단·자동전송 금지 고지 | 7/7 | PASS |
| `AIQ-STATIC-005` | REQ/SEC/TC ID 개수 | 13/8/9, 8/7/8 | PASS |
| `AIQ-STATIC-006` | OpenAPI 신규 Endpoint | 0건 | PASS |
| `AIQ-REG-001` | Mobile 77/SaaS 79/P0 Mission 경계 | 유지 | PASS |
| `AIQ-VISUAL-001` | Browser Visual/Interaction | 환경 제한 | NOT RUN |

## 2. 최초 검사와 수정

최초 Page Count 검사는 JavaScript의 ``document.querySelector(`[data-page="${route}"] h1`)`` Template 문자열을 실제 화면으로 오인하여 12개로 집계했다.

```text
Pages=12:home,images,timeline,health,visit,activity,notifications,storage,recovery,documents,delegation,${route}
```

검사 선택자를 실제 `<section class="page" data-page="...">`로 한정하고 동일 검증을 재실행했다. 제품 코드는 이 검사 오류 때문에 변경하지 않았다.

## 3. 정적 검사 결과

```text
JavaScriptSyntax=PASS
Pages=11:activity,delegation,documents,health,home,images,notifications,recovery,storage,timeline,visit
Routes=11:activity,delegation,documents,health,home,images,notifications,recovery,storage,timeline,visit
UniqueIds=24
DuplicateIds=0
ExternalUrls=0
NetworkCalls=0
ForbiddenExternalLaunch=0
RequiredMarkers=7/7
REQ-PXE-CX=13/13
SEC-PXE-CX=8/8
TC-PXE-CX=9/9
REQ-AIQ=8/8
SEC-AIQ=7/7
TC-AIQ=8/8
NewOpenApiEntries=0
Mobile77Boundary=True
SaaS79Boundary=True
P0MissionBoundary=True
RESULT=PASS
```

검사 범위의 `NetworkCalls`는 `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` 호출이며 `ForbiddenExternalLaunch`는 `window.open`과 `location.href` 외부 실행 후보를 포함한다.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-AIQ-003` | 실제 Record Marker | 문서상 Production Gate 전 Fail Closed | 제품 코드 없음 / NOT RUN |
| `TC-AIQ-005` | 외부 LLM Network | HTML 정적 호출 0건 | PASS for prototype only |
| `TC-AIQ-007` | 고위험 진단·약 변경 질문 | 기본 Template에 없음 | PASS for fixture |
| `TC-AIQ-008` | LLM 응답 재수입 | 수신/API 경로 없음 | PASS for prototype boundary |
| `TC-PXE-CX-005` | 단위·검사법 충돌 | 문서 기준만 존재 | NOT RUN |
| `TC-PXE-CX-007` | 방문 꾸러미 권한 Scope | UI 고지만 존재 | NOT RUN |

## 4.1 기록 완결성 검사

```text
JavaScriptSyntax=PASS
QuestionGeneratorForbiddenTokens=0
ImplementationPlaceholders=0
MissingReportLabels=0
MissingRequiredFiles=0
ImplementationIndex=True
PatientExperienceIndex=True
RESULT=PASS
```

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Browser Visual/Interaction | 연결된 Chrome 없음, IAB local file 차단 | Layout·Modal·Clipboard 실제 동작 미확인 | 허용된 Browser에서 수동 QA |
| Android UI·Clipboard | Native 앱 미구현 | OS별 Clipboard·Background 노출 미확인 | Android Ticket과 실기기 시험 |
| Accessibility | Browser/Screen Reader 실행 미완료 | 쉬운 모드·Focus·읽기 순서 미확인 | WCAG Keyboard/Screen Reader QA |
| API/Contract/DB | 구현 범위 밖 | 정정·꾸러미·Timeline 영속 동작 없음 | 승인 문서 개정 후 별도 Ticket |
| Security Integration/E2E | 외부 Connector와 App 없음 | 실제자료 Fail-closed 미검증 | Production Gate 후 자동화 |
| 실제 외부 LLM | 의도적 비범위 | Provider별 보존·학습·국외이전 미검증 | 법률·개인정보·Provider Matrix |

## 6. 증거 산출물

| 산출물 | 위치 | 민감정보 점검 |
|---|---|---|
| Convenience Spec | `docs/patient-experience/PATIENT-CONVENIENCE-EXPANSION-SPEC.md` | 실제 PHI 없음 |
| AI Question Pack Spec | `docs/patient-experience/EXTERNAL-LLM-QUESTION-PACK-SPEC.md` | 실제 PHI 없음 |
| HTML Prototype | `docs/mockups/mediq-patient-experience-mockup.html` | Synthetic only, 외부 URL/Network 0 |
| 구현 보고 | `docs/implementation/MEDIQ-AIQ-001/IMPLEMENTATION-REPORT.md` | Payload·Secret 없음 |

## 7. 결론

- 문서·HTML 정적 검증: `PASS`
- 실제 Browser·Android·API·Security/E2E: `NOT RUN`
- 전체 Ticket 상태: `PARTIAL`
- 실제 건강정보 외부 LLM 제공 또는 의료적 해석 기능의 구현 완료를 주장하지 않는다.
