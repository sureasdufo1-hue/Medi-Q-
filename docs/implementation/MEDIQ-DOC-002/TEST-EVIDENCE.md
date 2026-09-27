# MEDIQ-DOC-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DOC-002` |
| 제목 | Patient experience feature pack 1-9 documentation baseline |
| 분류 | `CAPSTONE-P1` / 기능 8·9 `POST-MVP` |
| 실행일시 | `2026-09-26T20:31:16+09:00` |
| 결과 | `PASS — documentation checks only` |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Microsoft Windows 11 Education |
| Runtime·Toolchain | PowerShell 7.6.5 |
| 대상 환경 | Local repository |
| 데이터 | 문서 Metadata만 사용, PHI·Secret 없음 |

## 2. 검증 매트릭스

| 검증 ID | 대상 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `DOC-PXE-001` | Prompt/Spec Pair와 ID 총계 | Static | 9/9, 73/49/39/59 | 일치 | PASS |
| `DOC-PXE-002` | TBD, Markdown Fence, 로컬 링크 | Static | 0, 균형, 링크 존재 | 일치 | PASS |
| `DOC-PXE-003` | Core Amendment와 분류 | Governance | 10개 연결, P1 7·POST 2 | 일치 | PASS |
| `DOC-PXE-004` | 기능별 ID 연속성 | Traceability | 001부터 기대 끝번호 | 일치 | PASS |
| `DOC-PXE-005` | 최종 링크·P0/OpenAPI/화면수 경계 | Regression | 링크 정상, 경계 불변 | 일치 | PASS |

## 3. 실행 명령과 결과

### DOC-PXE-001/002

PowerShell에서 `docs/patient-experience`의 `*-SPEC.md`, `*-PROMPT.md`를 열거하고 정규식으로 ID를 집계했다. 모든 Markdown Code Fence의 짝수 여부와 상대 `.md` 링크의 실제 파일 존재 여부를 검사했다.

```text
Specs=9
Prompts=9
Requirements=73
Security=49
Screens=39
Acceptance=59
TBD=0
RESULT=PASS
```

### DOC-PXE-003

10개 Core 문서에서 Patient Experience Amendment 존재 여부와 Feature 1–7의 P1, 8–9의 POST-MVP 표기를 검사했다.

```text
CoreAmendments=10
P1Specs=7
PostMvpSpecs=2
RESULT=PASS
```

### DOC-PXE-004

첫 실행은 PowerShell 검증식의 문자열 파싱 오류로 문서 검사 전에 종료되었다.

```text
ParserError: Missing ')' in method call.
```

검증식을 단순화한 뒤 각 Prefix의 고유 ID가 `001`에서 명세된 끝번호까지 연속인지 재실행했다.

```text
AllIdSequences=PASS
RESULT=PASS
```

### DOC-PXE-005

문서군·README·구현 기록 26개의 로컬 링크와 기존 Mobile 77개 표식, P0 Mission, 신규 Patient Experience OpenAPI 항목 부재를 확인했다.

```text
CheckedMarkdownFiles=26
BrokenLocalLinks=0
ExistingMobile77Marker=True
NewPatientExperienceOpenApiEntries=0
P0MissionMarker=True
RESULT=PASS
```

## 4. 실패·거부 경로

문서 자체의 실패·거부 경로는 각 Spec의 Threat/Acceptance에 정의했다. 애플리케이션이 없으므로 실제 no-consent, invalid-grant, cross-tenant, wrong-destination, invalid-mapping 실행은 하지 않았다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Unit/Domain | 코드 미구현 | 요구사항 동작 미확인 | 기능 Ticket에서 구현·실행 |
| Contract/API | OpenAPI 미승인 | API 오류·권한 모델 미확인 | Contract 개정 후 Test |
| Android UI/Accessibility | 화면 미구현 | 실제 사용성 미확인 | Compose UI 후 TalkBack/크기 Test |
| Security Negative | Backend/Mobile 미구현 | 공격 방어 미확인 | Feature별 Security Test |
| DICOMweb/PACS | 이번 문서 작업 비대상 | 방문 모드 E2E 미확인 | P0/P1 Test Orthanc 환경 |
| Legal/Interoperability | 외부 결정 필요 | 기능 8·9 운영 부적합 가능 | POST-MVP Gate/ADR |

## 6. 증거 산출물

| 산출물 | 위치 | 민감정보 점검 |
|---|---|---|
| 문서군 | `docs/patient-experience/` | PHI·Secret 없음 |
| 추적성 | `docs/patient-experience/PATIENT-EXPERIENCE-TRACEABILITY.md` | ID/문서 연결만 포함 |
| 구현 보고 | `docs/implementation/MEDIQ-DOC-002/IMPLEMENTATION-REPORT.md` | PHI·Secret 없음 |

## 7. 결론

- 문서 작업 범위 결과: `PASS`
- 기능 구현·운영 범위 결과: `NOT RUN`
- 기능을 `DONE`, 실제 연동 또는 법적 적합성 `PASS`로 주장할 수 없다.
