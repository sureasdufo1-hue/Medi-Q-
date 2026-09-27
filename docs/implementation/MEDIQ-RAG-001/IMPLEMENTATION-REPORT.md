# MEDIQ-RAG-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-RAG-001` |
| 제목 | Synthetic patient explanation and question preparation RAG baseline |
| 분류 | `CAPSTONE-P1 SYNTHETIC PROTOTYPE` |
| 작성일 | `2026-09-26` |
| Ticket 상태 | `TESTED` — 문서·Fixture 범위 완료 |
| 제품 상태 | `NOT IMPLEMENTED / NOT TESTED` |

## 1. 목표

합성 건강검진·검사자료를 승인된 설명자료와 연결하여 환자에게 쉬운 설명과 진료 질문을 제공하는 제한형 RAG의 제품·지식·아키텍처·평가 기준선을 수립한다.

## 2. 포함 범위

- 합성 환자 설명·질문 준비 RAG 기능 명세
- Local Approved Knowledge Pack Governance
- Synthetic-only Architecture, Trust Boundary와 Data Flow
- Golden Set·안전 지표·Red-team·Release Gate
- `K0-DEMO` 합성 Source, Manifest와 실제 SHA-256
- Scope/Product/Requirements/Security/Architecture/Threat/Acceptance/Implementation 기준선 연결
- 기존 외부 LLM 질문자료 기능과 Local RAG의 경계 구분

## 3. 제외 범위

- Retriever, Generator, Model, Embedding, Vector Store와 Runtime 코드
- Mobile/Web 화면과 Backend API
- 실제 건강정보·의료기관 지식자료·임상 승인
- 인터넷 검색, 외부 LLM·Embedding API
- 진단·처방·영상판독·응급도·예후 예측
- 자동화 Golden Set, Integration, Security와 E2E 시험

## 4. 추적성

| 구분 | ID·문서 | 결과 |
|---|---|---|
| 기능 요구사항 | `REQ-RAG-001~020` | 문서화 완료 |
| 보안 요구사항 | `SEC-RAG-001~015` | 문서화 완료 |
| 논리 화면 | `MOB-RAG-001~006` | 문서화 완료, 기존 화면 수 불변 |
| Acceptance | `TC-RAG-001~020` | 계획 완료, 제품 시험 NOT RUN |
| Knowledge | `MEDIQ-RAG-KB-001` | Governance와 합성 Fixture 작성 |
| Architecture | `MEDIQ-RAG-ARCH-001` | Mock-first, local/no-network 경계 |
| Evaluation | `MEDIQ-RAG-EVAL-001` | Release Gate와 증거 계약 |
| API | `OPENAPI.yaml` | 변경 없음, 신규 RAG Endpoint 0 |

## 5. 핵심 결정

1. P0 의료영상 교환보다 우선하지 않는 Optional P1 Module로 둔다.
2. 첫 구현은 Local deterministic retrieval과 Mock Generator다.
3. Local LLM은 별도 `MEDIQ-RAG-005` Synthetic-only Spike와 Model ADR 이후 검토한다.
4. 지식은 Active Manifest·Version·Hash가 확인된 Local Pack만 사용한다.
5. Citation·안전 검증 실패, 근거 부족 또는 Source 충돌 시 전체 답변을 `ABSTAINED`로 바꾼다.
6. RAG 답변은 의료기록·Consent·Authorization·Grant·Preflight·PACS 흐름에 입력하지 않는다.

## 6. 변경 파일

| 파일군 | 변경 내용 |
|---|---|
| `docs/ai/` | 제품 명세, 지식 Governance, Architecture/Data Flow, Evaluation/Safety |
| `docs/assets/synthetic-rag/` | 합성 Source와 Hash-bound Manifest |
| `README.md` | RAG 문서·Fixture 색인 |
| Patient Experience 문서 | External LLM Copy와 Local RAG 경계·추적성 |
| Scope/Product/Requirements | P1 Synthetic·금지범위·요구사항 연결 |
| Security/Threat | Injection, Hallucination, Egress, Leakage, Version 위협 |
| System Architecture/Data Flow | 독립 Module과 Local Retrieval Flow |
| Acceptance/Implementation | `TC-RAG-*`와 Ticket 순서 |
| Tech Stack/Mobile 문서 | Provider 미선정, Mock-first, 논리 화면 경계 |

## 7. Security·Privacy 영향

- Capstone 입력은 `TEST/SYNTHETIC/MOCK`만 허용한다.
- 지식 본문·사용자 질문·Model 출력은 비신뢰 입력이다.
- Internet, 외부 AI·Embedding·Telemetry Egress를 금지한다.
- Prompt·답변·검사값은 일반 로그와 Analytics에 저장하지 않는다.
- 실제 Record, 금지 Intent, 식별정보, Source 위조와 철회 자료는 Fail Closed한다.
- 임상 검토가 없는 Fixture는 필드 설명·질문 준비만 허용한다.

## 8. 검증 요약

- Manifest JSON Parsing: PASS
- Source SHA-256: MATCH
- Source/Manifest Chunk: 6/6
- `REQ/SEC/TC/MOB-RAG`: 20/15/20/6
- 필수 문서: 8/8
- External Retrieval, Clinical Use, Training Use: 모두 false
- 신규 OpenAPI Entry: 0
- 기준선 문서 연결·Ticket Index·Fixture 금지 문자열: PASS
- RAG Runtime·제품 Acceptance: NOT RUN

상세 명령과 결과는 [TEST-EVIDENCE.md](TEST-EVIDENCE.md)를 따른다.

## 9. 잔여 위험·후속 Ticket

- `MEDIQ-RAG-002`: Manifest/Chunk Validator와 Local Retriever 구현
- `MEDIQ-RAG-003`: Intent·Minimizer·Citation·Safety Validator 구현
- `MEDIQ-RAG-004`: Mock Generator, UI와 Abstention UX 구현
- `MEDIQ-RAG-005`: Local Model Synthetic-only 비교 Spike
- 임상 Reviewer가 없는 현재 지식팩은 의료내용 설명에 사용할 수 없다.
- 실제 환자정보와 Production Provider는 별도 개인정보·법률·의료기기 검토가 필요하다.

## 10. 최종 판정

```text
Ticket: MEDIQ-RAG-001
Scope: 합성 환자 설명·질문 준비 RAG 문서 기준선과 합성 Knowledge Fixture
Changed: AI 문서군, Hash-bound 지식팩, 관련 Scope·Security·Architecture·Threat·Acceptance·Plan 문서
Not changed: P0 Golden Path, OpenAPI, Domain/DB/ERD, App 코드, Model/Vector Store, 실제 건강정보·외부 LLM
Security impact: Synthetic-only, local/no-network, untrusted-input, citation/safety validation, fail-closed 기준 추가
Tests executed: JSON parse, SHA-256, Chunk 연결, ID 개수, 문서 존재, runtime policy, OpenAPI·기준선·색인 정적 검사
Tests not executed: RAG Runtime, Model, Mobile/Web UX, Retrieval quality, Prompt Injection runtime, Security Integration, E2E
Evidence: TEST-EVIDENCE.md
Implementation record: docs/implementation/MEDIQ-RAG-001/
Remaining risks: Runtime·Golden Set 미구현, 임상 검토 없음, Model/License/Telemetry 미결정
Status: PASS — documentation and synthetic fixture scope only
```

## 11. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-26 | `PLANNED` | Ticket 기록 생성 |
| 2026-09-26 | `TESTED` | 문서 기준선·합성 지식팩·정적 검증 완료 |

