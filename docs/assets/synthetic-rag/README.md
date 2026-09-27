# MediQ Synthetic RAG Knowledge Fixture

**Ticket:** `MEDIQ-RAG-001`  
**Classification:** `SYNTHETIC_DEMO / K0-DEMO`  
**Status:** Draft Fixture — Not Clinically Approved

이 디렉터리는 RAG Manifest, Retrieval, Citation, 철회와 안전검사를 위한 합성 지식자료를 보관한다.

규칙:

- 실제 환자정보·병원자료·운영 Credential을 포함하지 않는다.
- 의료기관 또는 임상의가 승인한 자료로 주장하지 않는다.
- 진단·정상/비정상·질환·면역·치료 결론을 제공하지 않는다.
- Internet Retrieval과 외부 LLM 전송에 사용하지 않는다.
- `DEMO_ACTIVE` 상태는 합성 UI 시연 허용일 뿐 임상 승인이 아니다.

파일:

- `sources/mediq-synthetic-explanation-guide.md`: 화면 필드·출처·질문 준비용 합성 Source
- `knowledge-manifest.v1.json`: Source·Chunk·허용 Intent·Hash를 연결하는 Fixture Manifest

