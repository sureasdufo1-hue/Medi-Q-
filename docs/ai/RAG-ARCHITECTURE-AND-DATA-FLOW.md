# MediQ Synthetic RAG Architecture & Data Flow

**Document ID:** `MEDIQ-RAG-ARCH-001`  
**Ticket:** `MEDIQ-RAG-001`  
**Version:** v1.0  
**Status:** Proposed P1 Architecture — Not Implemented / Provider Decision Open  
**Date:** 2026-09-26

## 1. Architecture Decision

RAG는 P0 Security Decision Chain과 분리된 Optional Patient Experience Module로 구현한다.

```text
Patient Experience UI
  → Synthetic Record Gate
  → Intent Policy
  → Context Minimizer
  → Knowledge Catalog
  → Local Retriever
  → Answer Generator Port
  → Citation Validator
  → Safety Policy Validator
  → Patient Explanation Projection
```

```text
P0 Consent / Authorization / Grant / Preflight
  ─────────────── 독립 실패경계 ───────────────
P1 Synthetic RAG
```

RAG 결과는 P0 판단에 입력되지 않고, RAG 장애는 Viewer·Download·PACS Import를 변경하지 않는다.

## 2. 실행 Profile

| Profile | Retriever | Generator | Network | 사용 목적 |
|---|---|---|---|---|
| `RAG_DEMO_MOCK` | Local deterministic retrieval | Template/Mock | 차단 | UI·Contract·Safety 시연 |
| `RAG_LOCAL_EXPERIMENT` | Local index | 승인된 Local Model 후보 | 차단 | 합성자료 품질 Spike |
| `RAG_PRODUCTION` | 미결정 | 미결정 | 별도 Gate | 실제자료 검토 후 미래 |

첫 구현은 `RAG_DEMO_MOCK`이다. 실제 Model·Runtime·Embedding Library·Vector Store는 성능·보안·라이선스 비교 ADR 전까지 선정하지 않는다.

## 3. Component 책임

| Component | 책임 | 금지 |
|---|---|---|
| Synthetic Record Gate | TEST/SYNTHETIC/MOCK Marker 확인 | 실제 Record 통과 |
| Intent Policy | 허용 Intent와 고위험 요청 분리 | 자유로운 의료상담 |
| Context Minimizer | Allowlist Context 생성 | 원본 Record·식별자 전달 |
| Knowledge Catalog | Manifest·Hash·상태·버전 검증 | 일반 Web Retrieval |
| Retriever | 활성 Chunk 후보와 Score 반환 | 답변 생성·정책 결정 |
| Generator Port | 근거 범위 안의 설명 초안 생성 | 지식 기억 보완·추정 |
| Citation Validator | 문장과 Chunk Reference 확인 | 없는 Source 생성 허용 |
| Safety Validator | 진단·처방·누출·Injection 검사 | 경고만 남기고 위험 출력 표시 |
| Projection | 근거·한계·질문을 화면 계약으로 표현 | 의료기록 저장 |
| Minimal Audit | Mode·Version·Outcome 기록 | Prompt·답변·검사값 기록 |

## 4. Trust Boundary

```text
[Mobile/Web UI]
      │ 허용 Intent + Synthetic Record Reference
      ▼
[RAG Application Boundary]
      │ 최소화 Context
      ├── [Read-only Knowledge Pack]
      ├── [Local Retrieval Index]
      └── [Isolated Generator]
               │ Draft only
               ▼
      [Deterministic Validators]
               │ Validated Projection
               ▼
          [Patient UI]
```

Knowledge 본문, 사용자 질문과 Model 출력은 모두 비신뢰 입력이다. System Policy, 허용 Intent, 출력 Schema와 Validator는 문서 내용으로 변경할 수 없다.

## 5. 상세 Data Flow

```text
1. UI가 Synthetic Record Reference와 Intent를 전달
2. Gate가 sourceMode/providerMode/TEST Reference 검증
3. Context Minimizer가 Allowlist Object 생성
4. Catalog가 Active Manifest와 Content Hash 검증
5. Retriever가 Allowed Intent·Topic으로 Chunk 검색
6. 최소 근거 개수·Score·충돌 여부 확인
7. 부족·충돌이면 ABSTAINED
8. 충분하면 Generator에 Policy + Context + Chunk 전달
9. Output을 JSON Schema로 Parse
10. Citation·Unsupported Claim·금지표현·식별정보 검사
11. 모두 통과하면 화면 Projection 생성
12. Session 종료 후 Context·Draft·Retrieved Chunk Buffer 제거
13. 내용 없는 Outcome Audit 기록
```

## 6. Prompt Boundary

System Policy의 우선순위:

```text
1. 고정 Safety Policy
2. 허용 Intent와 Output Schema
3. Synthetic Record Context
4. Retrieved Knowledge Data
5. 사용자 질문
```

Retrieved Document 안의 “이전 지시를 무시하라”, “Secret을 출력하라”, “의학적 결론을 내려라”는 내용은 설명 대상 Data일 뿐 실행 지시가 아니다.

## 7. 출력 후 결정론적 Validator

최소 Validator:

- JSON Schema Validation
- Citation 존재·Manifest Membership·Version 검사
- 문장별 Source Coverage 검사
- 금지 Intent·금지표현 검사
- 식별정보·Secret·Identifier Pattern 검사
- 합성·비진단·한계 고지 검사
- 최대 답변·질문 수 검사
- Source Conflict·Withdrawn State 검사

하나라도 실패하면 부분 결과를 보여주지 않고 전체 답변을 `ABSTAINED`로 바꾼다.

## 8. Storage·Logging

- Prompt, Answer, 검사값과 Retrieved Chunk는 기본 비영속이다.
- Local Index는 승인된 Knowledge Chunk만 저장한다.
- Browser Local Storage, Service Worker Cache, 일반 Analytics에 RAG 내용을 넣지 않는다.
- Audit Event 예: `RAG_EXPLANATION_REQUESTED`, `RAG_EXPLANATION_SHOWN`, `RAG_ABSTAINED`, `RAG_COPY_REQUESTED`.
- Audit 필드: actor pseudonymous reference, mode, intent, fixture version, knowledge version, outcome, validation code, timestamp, correlation context.

## 9. API·Domain·Data 상태

현재 `OPENAPI.yaml`, Domain Model, Data Model과 ERD를 변경하지 않는다. Capstone Prototype은 Local Fixture와 in-memory Session으로 구현할 수 있다.

Backend API, Knowledge Release Store, Model Registry 또는 영속 Audit가 필요해지면 다음을 같은 Ticket에서 개정한다.

- 업무행위 중심 OpenAPI
- RAG Session·Knowledge Release·Evaluation Run Domain
- 보존기간과 DB Migration
- Tenant Isolation·Authorization·Audit
- Threat Model과 Acceptance

## 10. 배포 권고

학교 MVP에서는 Internet Egress가 차단된 개발 PC 또는 VM에서 Local Fixture·Mock Generator를 실행한다. Local Model Spike는 별도 Process/Container와 Resource Limit를 사용하고 API/PACS Credential Volume을 Mount하지 않는다. 운영 SaaS에 포함하기 전 Provider·Model·License·Telemetry·Update 경로를 별도 ADR로 승인한다.

