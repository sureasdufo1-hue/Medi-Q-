# MediQ AI Documentation

**Document Set:** Synthetic Patient Explanation & Question Preparation RAG  
**Ticket:** `MEDIQ-RAG-001`  
**Classification:** `CAPSTONE-P1 SYNTHETIC PROTOTYPE`  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Date:** 2026-09-26

## 1. 목적

이 문서군은 합성 건강검진·검사자료를 환자가 이해하기 쉬운 말로 설명하고 진료 질문을 준비하도록 돕는 제한형 RAG를 정의한다. 의료적 판정, 진단, 처방, 응급도 분류 또는 외부 LLM 전송은 수행하지 않는다.

## 2. 문서 색인

| 문서 | 역할 |
|---|---|
| [RAG Product Specification](SYNTHETIC-PATIENT-EXPLANATION-RAG-SPEC.md) | 사용자 흐름, 범위, 요구사항, 화면, Acceptance |
| [Knowledge Governance](RAG-KNOWLEDGE-BASE-GOVERNANCE.md) | 승인 지식자료의 등록·검토·버전·철회·출처 정책 |
| [Architecture & Data Flow](RAG-ARCHITECTURE-AND-DATA-FLOW.md) | Component, Trust Boundary, Retrieval·Generation·검증 흐름 |
| [Evaluation & Safety Plan](RAG-EVALUATION-AND-SAFETY-PLAN.md) | Golden Set, 평가 지표, Red-team, Release Gate |
| [Synthetic Knowledge Pack](../assets/synthetic-rag/README.md) | 구현용 합성 지식팩 Fixture |

## 3. 고정 결정

```text
P0 의료영상 교환: 변경 없음
CAPSTONE-P1: Synthetic Record + Local Approved Knowledge Pack
Capstone Generator: Deterministic Mock first
Local LLM: 별도 Synthetic-only Spike + Release Gate
Internet/Web Retrieval: 금지
실제 환자정보: 금지
진단·처방·판독: 금지
외부 LLM 자동전송: 금지
```

`AI가 설명했다`는 사실은 출처의 정확성, 의료적 적합성 또는 진단 유효성을 의미하지 않는다. 답변은 승인 지식자료의 내용을 환자 친화적으로 재구성한 비진단 안내다.

