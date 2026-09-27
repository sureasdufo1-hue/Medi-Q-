# MEDIQ-UI-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-UI-001` |
| 대상 | `docs/mockups/mediq-patient-experience-mockup.html` |
| 환경 | Windows 11 Education · PowerShell 7.6.5 · Node.js syntax checker |
| 데이터 | Synthetic/Test assets only |
| 결과 | `PARTIAL` |

## 1. 검증 매트릭스

| ID | 검증 | 결과 | 판정 |
|---|---|---|---|
| `UI-STATIC-001` | JavaScript 문법 | 오류 없음 | PASS |
| `UI-STATIC-002` | 9개 Route와 9개 Page 대응 | 일치 | PASS |
| `UI-STATIC-003` | DOM ID 중복 | 17개 모두 고유 | PASS |
| `UI-STATIC-004` | 로컬 합성 영상 Asset | 3개 존재 | PASS |
| `UI-STATIC-005` | 외부 URL·통신 Dependency | 0개 | PASS |
| `UI-STATIC-006` | 기능·보안 고지 문구 | 13개 필수 문구 존재 | PASS |
| `UI-STATIC-007` | 반응형·접근성 기본 | Breakpoint 3, Reduced Motion 1, ARIA 11 | PASS |
| `UI-STATIC-008` | README·Ticket 기록·9개 Page 최종 연결 | 6개 파일·색인·기록 정상 | PASS |
| `UI-VISUAL-001` | 실제 Browser Visual/Interaction | 환경 제한 | NOT RUN |

## 2. 실행 결과

### 구조·문법 검사

```text
HtmlBytes=70737
Pages=9:activity,delegation,documents,home,images,notifications,recovery,storage,visit
Routes=9:activity,delegation,documents,home,images,notifications,recovery,storage,visit
UniqueIds=17
LocalImages=3
ExternalUrls=0
JavaScriptSyntax=PASS
RESULT=PASS
```

### 기능·반응형·접근성 검사

```text
RequiredContent=13
Buttons=74
AriaAttributes=11
ResponsiveBreakpoints=3
ReducedMotionRules=1
FeatureCoverage=PASS
RESULT=PASS
```

### 최종 기록 연결 검사

```text
FilesChecked=6
PageSections=9
ImplementationIndex=PASS
RecordCompleteness=PASS
RESULT=PASS
```

## 3. 브라우저 검증 시도

1. Chrome Session 생성: `Browser is not available: chrome`.
2. Codex IAB에서 로컬 `file://` 열기: Browser URL 보안 정책으로 차단.
3. 정책 우회 없이 중단하고 정적 검증으로 범위를 제한했다.

## 4. 실행하지 않은 시험

| 시험 | 이유 | 위험 | 후속 조치 |
|---|---|---|---|
| Desktop Visual QA | 연결된 Chrome 없음 | CSS Layout 오류 가능 | 사용 가능한 Browser에서 수동 확인 |
| Mobile Visual QA | Browser Rendering 불가 | 680px Navigation 오류 가능 | 실제 Device/Responsive Mode 확인 |
| Keyboard/Screen Reader | 렌더링 환경 없음 | Focus·읽기 순서 미확인 | NVDA/TalkBack Test |
| Application E2E | 목업에 Backend 없음 | 기능 동작 미검증 | 구현 Ticket에서 자동화 |

## 5. 증거 및 결론

- 정적 HTML/JavaScript와 보안 고지 검증: `PASS`
- 실제 브라우저·접근성 검증: `NOT RUN`
- 전체 Ticket 상태: `PARTIAL`
- 실제 기능 구현, 의료기관 연동 또는 보안 시험 PASS를 주장하지 않는다.

후속 Ticket `MEDIQ-HHP-006`에서 동일 HTML에 열 번째 `health` Route가 추가되었다. 본 문서의 9개 Route 결과는 `MEDIQ-UI-001` 실행 당시 증거이며, 현재 파일 검증 결과는 `MEDIQ-HHP-006/TEST-EVIDENCE.md`를 따른다.
