# MEDIQ-RAG-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-RAG-001` |
| 대상 | Synthetic Patient Explanation & Question Preparation RAG documentation baseline |
| 환경 | Windows · PowerShell |
| 데이터 | Synthetic K0-DEMO only |
| 결과 | `PASS` — documentation and fixture scope only |

## 1. 검증 매트릭스

| ID | 검증 | 결과 | 판정 |
|---|---|---|---|
| `RAG-DOC-001` | Manifest JSON Parsing | 정상 | PASS |
| `RAG-DOC-002` | Source Content Hash | SHA-256 일치 | PASS |
| `RAG-DOC-003` | Source/Manifest Chunk | 6/6 | PASS |
| `RAG-DOC-004` | REQ/SEC/TC/MOB ID | 20/15/20/6 | PASS |
| `RAG-DOC-005` | 필수 문서 | 8/8 | PASS |
| `RAG-DOC-006` | Runtime 금지 정책 | external/clinical/training false | PASS |
| `RAG-DOC-007` | OpenAPI 신규 항목 | 0 | PASS |
| `RAG-DOC-008` | 기준선·색인 연결 | 정상 | PASS |
| `RAG-RUNTIME-001` | 실제 Retrieval·Generation | Runtime 없음 | NOT RUN |

## 2. Manifest·ID 검사 결과

```text
ManifestParse=PASS
PackStatus=DEMO_ACTIVE
ClinicalReview=NOT_REVIEWED
HashMatch=True
Chunks=6/6
SEC-RAG=15/15
MOB-RAG=6/6
TC-RAG=20/20
REQ-RAG=20/20
RequiredFiles=8/8
OpenApiRagEntries=0
ExternalRetrievalAllowed=False
ClinicalUseAllowed=False
TrainingUseAllowed=False
RESULT=PASS
```

검사한 Source SHA-256:

```text
70d819730c25838f0a837ab37448c986d0c12b6ab844c9ee4edcc7e7246e27db
```

## 3. 기준선·민감정보 검사

검사 항목:

- Root·Patient Experience·Implementation Index에 `MEDIQ-RAG-001` 연결
- Scope/Product/Requirements/Security/Architecture/Data Flow/Threat/Acceptance/Plan에 RAG 경계 존재
- P0 Hospital A → MediQ → Hospital B Mission 보존
- Mobile 77개·SaaS 79개 기준선 자동 변경 없음
- 합성 Source에 실제 환자명, 실제 병원명, 주민등록번호 형식, DICOM UID, URL 없음
- Knowledge Path에 상위 디렉터리 이동 없음

결과: `PASS`.

```text
BaselineLinks=10/10
MissingReportLabels=0
ImplementationPlaceholders=0
ForbiddenFixtureMarkers=0
NationalIdPatterns=0
PathTraversal=0
RootIndex=True
PatientIndex=True
ImplementationIndex=True
P0MissionBoundary=True
Mobile77Boundary=True
SaaS79Boundary=True
RESULT=PASS
```

## 4. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 |
|---|---|---|---|
| Retrieval Recall@5 | Retriever 미구현 | 지식 검색 품질 미확인 | `MEDIQ-RAG-002` |
| Intent·PII·Citation Validator | Runtime 미구현 | 정책 우회·누출 미확인 | `MEDIQ-RAG-003` |
| UI·Abstention·Accessibility | 화면 미구현 | 환자 오인·접근성 미확인 | `MEDIQ-RAG-004` |
| Local Model Evaluation | Model 미선정 | 환각·성능·License 미확인 | `MEDIQ-RAG-005` |
| Network Egress Runtime | Process 없음 | 실행 시 외부통신 여부 미검증 | 구현 후 Network Test |
| Security/E2E | App/API 없음 | Injection·Timeout·P0 격리 미검증 | 구현 후 자동화 |

## 5. 증거 산출물

| 산출물 | 위치 | 상태 |
|---|---|---|
| 문서 색인 | `docs/ai/README.md` | PASS |
| 기능 명세 | `docs/ai/SYNTHETIC-PATIENT-EXPLANATION-RAG-SPEC.md` | PASS |
| Knowledge Governance | `docs/ai/RAG-KNOWLEDGE-BASE-GOVERNANCE.md` | PASS |
| Architecture | `docs/ai/RAG-ARCHITECTURE-AND-DATA-FLOW.md` | PASS |
| Evaluation Plan | `docs/ai/RAG-EVALUATION-AND-SAFETY-PLAN.md` | PASS |
| Manifest | `docs/assets/synthetic-rag/knowledge-manifest.v1.json` | PASS |
| Source Fixture | `docs/assets/synthetic-rag/sources/mediq-synthetic-explanation-guide.md` | PASS |

## 6. 결론

- 문서와 Synthetic Knowledge Fixture의 구조·무결성·추적성: `PASS`
- 실제 RAG 기능·모델·제품 Acceptance: `NOT RUN`
- 본 증거는 RAG가 구현됐거나 의료적으로 유효하다는 증거가 아니다.
