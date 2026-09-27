# MediQ Synthetic Patient Explanation & Question Preparation RAG Specification

**Document ID:** `MEDIQ-RAG-SPEC-001`  
**Ticket:** `MEDIQ-RAG-001`  
**Version:** v1.0  
**Classification:** `CAPSTONE-P1 SYNTHETIC PROTOTYPE`  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Date:** 2026-09-26

## 1. 결정 요약

MediQ는 합성 건강검진·검사자료와 승인된 설명자료를 결합하여 다음 두 결과만 제공하는 제한형 RAG를 준비한다.

1. 화면에 표시된 항목과 출처·단위·참고범위가 무엇을 뜻하는지 쉬운 말로 설명한다.
2. 환자가 담당 의료진에게 확인할 질문을 준비한다.

MediQ가 정상·비정상, 질병, 면역 상태, 치료 필요성 또는 약물 변경을 판단하지 않는다.

## 2. 범위

### 2.1 CAPSTONE-P1 포함

- `TEST-*`, `sourceMode=SYNTHETIC`, `providerMode=MOCK` Record
- 버전이 고정된 Local Synthetic Knowledge Pack
- 승인 상태·유효기간·Hash가 확인된 Chunk만 Retrieval
- 질문 Intent 제한, 근거 Chunk 표시, 답변 후 안전 검증
- 쉬운 설명, 의료진 질문 추천, 답변 복사
- 답변 Session 종료 시 임시 Context 제거
- 내용 없는 Audit Event: 기능, Fixture Version, Knowledge Version, Outcome

### 2.2 제외

- 실제 환자 건강정보·운영 DICOM·판독문·임상 Free Text
- 인터넷·일반 Web·검색엔진·실시간 외부 지식 Retrieval
- 외부 LLM API, Provider Deep Link, 자동 Upload·Paste·Send
- 진단, 판독, 정상/비정상 재판정, 치료·약물·응급도 결정
- 답변을 의료기록·Consent·Authorization·Grant·PACS Workflow에 저장
- 사용자 대화나 건강정보를 이용한 학습·Fine-tuning

## 3. 사용자 흐름

```text
합성 검사 Record 선택
  → RAG Demo Disclosure
  → Allowed Intent 선택
  → Context Minimizer가 Allowlist 필드 생성
  → Approved Knowledge Catalog 검증
  → Retrieval
  → 최소 근거 충족?
      ├─ 아니오: 답변 보류 + 의료진 확인 질문만 제공
      └─ 예: Grounded Answer 생성
  → Citation·Safety Validator
      ├─ 실패: 답변 폐기 + 안전한 보류 응답
      └─ 통과: 설명·근거·질문 표시
  → 사용자가 검토·복사 또는 종료
  → 임시 Context 제거 + 최소 Audit
```

## 4. 허용 Intent

| Intent | 허용 응답 | 금지 응답 |
|---|---|---|
| `EXPLAIN_FIELD` | 검사명, 값, 단위, 출처 필드의 화면 의미 | 값의 의학적 판정 |
| `EXPLAIN_REFERENCE_TEXT` | 참고범위가 출처기관 제공 정보라는 설명 | 범위를 이용한 자체 정상·비정상 판정 |
| `PREPARE_CLINICIAN_QUESTIONS` | 검사법·단위·추가 확인에 관한 질문 | 치료·투약 변경 지시 |
| `EXPLAIN_PROVENANCE` | 합성 출처, Fixture·Knowledge Version | 실제 병원 연동 주장 |
| `EXPLAIN_LIMITATION` | 데이터 누락·미연결·합성 한계 | 누락값 추정 |

다음 Intent는 즉시 거부한다: `DIAGNOSE`, `INTERPRET_DISEASE`, `MEDICATION_ADVICE`, `TREATMENT_PLAN`, `EMERGENCY_TRIAGE`, `IMAGE_FINDING`, `PREDICT_OUTCOME`.

## 5. 입력 Context Allowlist

허용:

- Synthetic Record Type
- 합성 검사명·표준 코드 후보
- 합성 값·단위
- 합성 제공자 참고문구와 원문 판정
- 월 단위 또는 합성 검사일
- Fixture Version, Knowledge Pack Version
- 사용자가 선택한 허용 Intent

제외:

- 이름, 생년월일, 성별, 연락처, 주소
- Patient ID, Hospital-local ID, 주민등록번호
- 실제 병원·의료진명
- DICOM UID, Accession Number, Session·Grant·Receipt ID
- 원본 DICOM·PDF·Pixel Data·임상 Free Text
- 정확한 위치·진료시각

## 6. 답변 계약

모든 성공 답변은 다음 순서를 따른다.

```text
1. 합성 데이터 배지
2. 한 문장 요약
3. 화면에서 확인 가능한 사실
4. 설명에 사용한 승인 자료
5. 담당 의료진에게 물어볼 질문 2~4개
6. 답변 한계와 비진단 고지
```

필수 구조:

| 필드 | 규칙 |
|---|---|
| `answerMode` | `SYNTHETIC_GROUNDED` 또는 `ABSTAINED` |
| `summary` | 근거가 있는 비진단 설명만 허용 |
| `facts` | Record와 Retrieved Chunk에서 직접 확인 가능해야 함 |
| `citations` | `documentId`, `version`, `chunkId`, `title` 포함 |
| `questionsForClinician` | 질문형 문장만 허용 |
| `limitations` | 합성·비진단·누락 가능성 표시 |
| `knowledgeSnapshot` | Manifest Version과 Hash Reference |

출처 없는 의학적 문장은 표시하지 않는다. Citation이 0개이면 `ABSTAINED`만 허용한다.

## 7. 화면 계약

| 논리 화면 ID | 화면 | 필수 상태 |
|---|---|---|
| `MOB-RAG-001` | RAG 기능 소개·Demo Disclosure | Synthetic, no external send, non-diagnostic |
| `MOB-RAG-002` | Record·Intent 선택 | Allowed, blocked, unavailable |
| `MOB-RAG-003` | 생성 중 | Retrieving, validating, timeout |
| `MOB-RAG-004` | 근거 기반 설명 | Grounded, partial, stale-source blocked |
| `MOB-RAG-005` | 답변 보류 | No source, unsafe intent, validation failed |
| `MOB-RAG-006` | 출처·버전 상세 | Active, superseded, withdrawn |

논리 화면 ID는 기존 Mobile 77개 또는 SaaS 79개 기준선에 자동 합산하지 않는다.

## 8. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-RAG-001` | Capstone 입력은 `TEST/SYNTHETIC/MOCK` Marker를 모두 검증해야 한다. |
| `REQ-RAG-002` | Marker가 없거나 실제 Record로 분류되면 생성 전에 Fail Closed해야 한다. |
| `REQ-RAG-003` | Retrieval은 현재 활성화된 Local Approved Knowledge Pack으로 제한해야 한다. |
| `REQ-RAG-004` | 인터넷·Web·외부 Search Connector를 사용할 수 없어야 한다. |
| `REQ-RAG-005` | 입력 Context는 Allowlist 방식으로 구성해야 한다. |
| `REQ-RAG-006` | 사용자 자유질문은 허용 Intent로 분류되지 않으면 답변을 보류해야 한다. |
| `REQ-RAG-007` | 모든 설명 문장은 하나 이상의 활성 Chunk로 근거화되어야 한다. |
| `REQ-RAG-008` | Citation은 문서·버전·Chunk와 표시 제목을 포함해야 한다. |
| `REQ-RAG-009` | 철회·만료·대체된 문서를 Retrieval에서 즉시 제외해야 한다. |
| `REQ-RAG-010` | 진단·처방·투약·응급도·영상소견 요청에 답변하지 않아야 한다. |
| `REQ-RAG-011` | 답변은 의료진에게 물어볼 질문을 최대 4개까지 제공할 수 있다. |
| `REQ-RAG-012` | 근거가 부족하거나 충돌하면 추측하지 않고 `ABSTAINED`를 반환해야 한다. |
| `REQ-RAG-013` | Source 간 충돌은 숨기지 않고 설명 생성을 중단해야 한다. |
| `REQ-RAG-014` | 답변을 의료기록·검사 판정·Authorization 입력으로 저장하지 않아야 한다. |
| `REQ-RAG-015` | 사용자는 답변·출처·한계를 함께 검토한 뒤 Text를 복사할 수 있어야 한다. |
| `REQ-RAG-016` | 복사 Payload에는 Citation과 합성·비진단 고지를 포함해야 한다. |
| `REQ-RAG-017` | Session 종료·Background 전환 시 표시 Context와 임시 Buffer를 정리해야 한다. |
| `REQ-RAG-018` | RAG 오류가 P0 Viewer·Download·PACS Import를 차단하지 않아야 한다. |
| `REQ-RAG-019` | Generator Provider·Model·Version 변경은 평가 Gate를 다시 통과해야 한다. |
| `REQ-RAG-020` | 화면은 `Mock`, `Local LLM Experiment`, `Production` Mode를 혼동 없이 표시해야 한다. |

## 9. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-RAG-001` | 지식문서의 본문을 Instruction이 아닌 비신뢰 Data로 처리해야 한다. |
| `SEC-RAG-002` | Prompt Injection 문자열이 정책·System Instruction을 변경할 수 없어야 한다. |
| `SEC-RAG-003` | Knowledge Manifest의 Version·Hash·상태 검증 실패 시 Retrieval을 중단해야 한다. |
| `SEC-RAG-004` | Prompt·답변·검사값을 일반 로그, Analytics, Crash Report, URL에 기록하지 않아야 한다. |
| `SEC-RAG-005` | Audit에는 내용 대신 Mode, Intent, Knowledge Version, Outcome, Validation Code만 기록해야 한다. |
| `SEC-RAG-006` | Capstone Runtime은 외부 AI·Embedding·Telemetry Endpoint로 통신하지 않아야 한다. |
| `SEC-RAG-007` | Model은 PACS Credential, Token, Key, DICOM Payload에 접근할 수 없어야 한다. |
| `SEC-RAG-008` | Retrieval Index에는 승인 Chunk와 최소 Metadata만 포함해야 한다. |
| `SEC-RAG-009` | 사용자 입력을 Model Training·Fine-tuning Dataset으로 저장하지 않아야 한다. |
| `SEC-RAG-010` | Output Validator 실패 결과는 사용자에게 노출하거나 캐시하지 않아야 한다. |
| `SEC-RAG-011` | Citation 없는 Answer, 존재하지 않는 Chunk Reference와 Source 위조를 거부해야 한다. |
| `SEC-RAG-012` | 실제 건강정보 모드는 별도 Production Gate 전 비활성화해야 한다. |
| `SEC-RAG-013` | 답변 복사는 합성자료에만 허용하고 자동 외부전송을 제공하지 않아야 한다. |
| `SEC-RAG-014` | RAG 서비스 장애·Timeout은 안전한 보류 응답으로 종료해야 한다. |
| `SEC-RAG-015` | Generator는 Consent·Authorization·Grant·Preflight Decision Point에 연결하지 않아야 한다. |

## 10. Acceptance

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| `TC-RAG-001` | 합성 항체검사·허용 Intent | 근거 설명·Citation·질문·고지 표시 |
| `TC-RAG-002` | 실제 Record Marker | 생성 전 Fail Closed |
| `TC-RAG-003` | Patient ID가 섞인 입력 | Context와 출력에서 제거 |
| `TC-RAG-004` | Citation 없는 답변 | 폐기하고 `ABSTAINED` |
| `TC-RAG-005` | 철회된 Source | 검색 결과 0, 기존 Cache 무효화 |
| `TC-RAG-006` | 충돌하는 Source | 추정 없이 보류 |
| `TC-RAG-007` | 진단 요청 | 거부하고 의료진 질문 준비로 전환 |
| `TC-RAG-008` | 약 중단 요청 | 답변 거부, 약 변경 지시 없음 |
| `TC-RAG-009` | 영상 판독 요청 | 거부, Viewer나 AI 판독으로 우회 없음 |
| `TC-RAG-010` | Knowledge Prompt Injection | 정책 변경 실패, 안전 이벤트 기록 |
| `TC-RAG-011` | 존재하지 않는 Chunk Citation | Validator가 폐기 |
| `TC-RAG-012` | Generator Timeout | 안전한 보류, P0 경로 영향 없음 |
| `TC-RAG-013` | 외부 Network 관찰 | LLM·Embedding·Search 호출 0건 |
| `TC-RAG-014` | 답변 복사 | Citation·합성·비진단 고지 포함 |
| `TC-RAG-015` | Background 전환 | Preview 차폐·Buffer 제거 |
| `TC-RAG-016` | 대체된 Knowledge Version | 최신 Active Version만 사용 |
| `TC-RAG-017` | Model Version 변경 | 평가 Gate 전 활성화 금지 |
| `TC-RAG-018` | RAG 답변의 의료기록 Import | 저장 거부 |
| `TC-RAG-019` | RAG 장애 중 Viewer 사용 | Viewer 정상, 독립 실패경계 유지 |
| `TC-RAG-020` | Mock Mode 화면 | 실제 AI·실제 연동으로 오인할 문구 없음 |

모든 제품 Acceptance는 `NOT RUN`이다.

## 11. 완료 경계

본 문서는 구현 계약이다. 현재 RAG Runtime, Retriever, Generator, Model, Vector Store, Mobile 화면, Backend API와 자동화 시험은 존재하지 않는다. 문서와 합성 Knowledge Fixture가 준비됐다는 사실을 AI 기능 구현 또는 의료적 유효성으로 주장하지 않는다.

