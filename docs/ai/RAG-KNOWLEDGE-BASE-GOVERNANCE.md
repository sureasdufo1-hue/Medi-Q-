# MediQ RAG Knowledge Base Governance

**Document ID:** `MEDIQ-RAG-KB-001`  
**Ticket:** `MEDIQ-RAG-001`  
**Version:** v1.0  
**Status:** Approved Governance Baseline — Knowledge Pack Draft / Not Clinically Approved  
**Date:** 2026-09-26

## 1. 원칙

RAG 품질은 Model보다 사용 가능한 지식의 범위와 상태에 우선 의존한다. MediQ는 인터넷을 검색하지 않고 `승인·버전·Hash·유효기간`이 확인된 지식 Snapshot만 사용한다.

```text
Source Candidate
→ 출처·저작권 확인
→ 의료 내용 검토
→ 환자 표현·접근성 검토
→ 보안·식별정보 검사
→ Chunk 생성
→ Manifest·Hash 생성
→ Release 승인
→ Active Retrieval
→ 정기 검토 / 대체 / 철회
```

## 2. Source 등급

| 등급 | 자료 | Capstone 사용 | Production 사용 |
|---|---|---|---|
| `K0-DEMO` | MediQ가 작성한 합성 UI·필드 설명 | Demo 승인 후 허용 | 임상 설명으로 사용 금지 |
| `K1-OFFICIAL` | 정부·공공기관의 환자 안내자료 | License·Snapshot 확인 후 후보 | 의료·법률 검토 후 허용 후보 |
| `K2-INSTITUTION` | 의료기관이 승인한 환자 교육자료 | 현재 없음 | 기관·Tenant Scope로 승인 가능 |
| `K3-PROFESSIONAL` | 학회·전문단체 자료 | 현재 없음 | 라이선스·전문가 검토 후 후보 |
| `KX-UNTRUSTED` | 일반 Web, Blog, Forum, 광고, Model Memory | 금지 | 금지 |

Capstone Pack은 `K0-DEMO`만 포함하며 `Not Clinically Approved`를 표시한다.

## 3. 금지 Source

- 검색결과 Snippet, 일반 Web Page의 실시간 본문
- 출처·작성일·Version을 확인할 수 없는 문서
- 저작권·재사용 권한이 불명확한 자료
- 실제 환자정보, Case Report의 식별 가능 내용
- 광고, 제품 판촉, 익명 Community 답변
- Model이 기억에서 생성한 설명
- 문서 안에서 정책 변경·Secret 요청·도구 실행을 지시하는 내용

## 4. Manifest 최소 Schema

| 필드 | 설명 |
|---|---|
| `packId`, `packVersion` | 불변 지식 Snapshot 식별자 |
| `status` | `DRAFT`, `ACTIVE`, `SUPERSEDED`, `WITHDRAWN` |
| `classification` | `SYNTHETIC_DEMO` 등 |
| `createdAt`, `effectiveFrom`, `reviewDueAt` | 수명주기 |
| `documentId`, `documentVersion` | Source Version |
| `title`, `language`, `sourceTier` | 표시 Metadata |
| `allowedIntents` | 사용할 수 있는 답변 종류 |
| `forbiddenUses` | 진단·처방 등 금지 목적 |
| `contentHash` | 원본 Snapshot 무결성 |
| `chunkIds` | 승인 Chunk 목록 |
| `reviewState` | Product·Clinical·Privacy·Security 상태 |

`ACTIVE`가 아니거나 필수 검토가 완료되지 않은 Pack은 Runtime에 Mount할 수 없다. Capstone Mock은 `DEMO_ACTIVE`라는 별도 상태를 사용할 수 있지만 화면에 의료 승인으로 표시하지 않는다.

## 5. 검토 역할

| 역할 | 검토 항목 | Capstone | Production |
|---|---|---|---|
| Product Owner | 목적·표현·범위 | 필수 | 필수 |
| Clinical Reviewer | 의료 내용·오해 가능성 | Demo 문구 검토 권고 | 필수 |
| Privacy Reviewer | 식별정보·처리 목적 | 필수 | 필수 |
| Security Reviewer | Injection·Manifest·배포 | 필수 | 필수 |
| Accessibility Reviewer | 쉬운 말·읽기 순서 | 필수 | 필수 |
| Legal/License Reviewer | 사용권·외부 제공 | 출처가 외부면 필수 | 필수 |

Capstone 자료에 Clinical Review가 없으면 `의학 설명`이 아니라 `화면 필드 설명·질문 준비`만 허용한다.

## 6. Chunking 규칙

- 하나의 Chunk는 하나의 설명 목적만 가진다.
- 제목·Source Version·Chunk ID를 본문과 함께 유지한다.
- 표의 행을 문맥 없이 분리하지 않는다.
- 수치 Threshold는 출처·검사법·단위와 함께 있지 않으면 Chunk로 만들지 않는다.
- `정상`, `비정상`, `질환`, `면역`, `치료 필요`를 MediQ가 새로 추가하지 않는다.
- 숨은 HTML, Script, Prompt Instruction과 외부 URL Parameter를 제거한다.
- Chunk 최대길이와 Overlap은 구현 Spike에서 평가하고 임의로 확정하지 않는다.

## 7. 충돌·대체·철회

- 같은 주제의 Active Source가 충돌하면 해당 Intent를 `ABSTAINED`로 처리한다.
- 새 Version 발행 시 이전 Version은 `SUPERSEDED`로 바꾸고 신규 Session Retrieval에서 제외한다.
- 안전 문제 발견 시 Pack을 `WITHDRAWN`으로 바꾸고 Index·Cache를 즉시 무효화한다.
- 이미 표시된 답변은 의료기록으로 보존하지 않으며, Audit에는 사용한 Knowledge Version만 남긴다.

## 8. 변경 관리

Knowledge 변경은 코드 배포와 분리할 수 있지만 다음 증거 없이는 활성화하지 않는다.

1. Source Snapshot과 License Reference
2. Content Hash
3. 변경 Diff
4. 역할별 Review 기록
5. Golden Set 회귀 결과
6. Injection·PHI Leakage 검사
7. Release 승인과 Rollback 대상 Version

## 9. 현재 Fixture 상태

`docs/assets/synthetic-rag/`의 지식팩은 구조·검색·Citation 시험용 합성 자료다. 의료기관 또는 임상의가 승인한 교육자료가 아니며 `K0-DEMO` 범위를 넘을 수 없다.

## 10. 참고 기준

- [NIST AI RMF Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)은 RAG를 포함한 Model 적응 방식, 데이터 출처·Provenance와 지속적 평가 문서화를 제시한다.
- [개인정보보호위원회 생성형 AI 개인정보 처리 안내](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000%22&nttId=11410)는 AI 생애주기별 법적 근거와 안전조치 검토의 국내 기준으로 참고한다.
