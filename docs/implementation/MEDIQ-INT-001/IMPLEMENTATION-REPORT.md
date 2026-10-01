# MEDIQ-INT-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-INT-001` |
| 제목 | Bounded source manifest and pending evidence persistence foundation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 상태 | `PARTIAL` |

## 1. 목표

Synthetic/Test DICOM 인스턴스의 정확한 바이트를 study-sized 메모리 버퍼 없이 해시하는 내부 primitive와 operation-bound `SOURCE_CAPTURE/PENDING` evidence persistence foundation을 구현한다. 알고리즘·객체 식별자·길이를 하나의 canonical manifest로 묶고, 상한 초과·불완전 스트림·취소에서는 결과를 반환하지 않는다. DB writer는 Tenant-visible `CREATED` PACS operation에만 최초 baseline을 만들고 Session/Package/Study binding을 저장 데이터에서 유도한다. 이는 `REQ-INT-001`의 구현 선행 하위 게이트이며 authorized source capture 또는 P0 Source→MediQ→Destination 검증 완료를 뜻하지 않는다.

## 2. 범위

### 포함

- `SHA256-MANIFEST-V1` canonical manifest builder 및 고정 known vector
- Sequential lazy single-instance stream hashing; per-instance SHA-256은 내부 계산만 수행
- UID·개수·media type·response UID·Content-Length·empty/truncated/error/abort validation
- 고정 P0 ceiling 2,000 objects / 64 MiB per object / 2 GiB aggregate; 호출자가 낮출 수 있지만 높일 수 없음
- 범위·실패 경로별 Unit Acceptance 및 구현/요구사항 문서 동기화
- `integrity_evidence.operation_id` binding, fixed source-capture CHECK/partial UNIQUE, internal pending-only repository
- Disposable DB-008 exact-grant PostgreSQL/RLS Acceptance; temporary scratch grants are removed and persistent 209-column inventory restored

### 제외

- PACS/DICOM Gateway adapter·endpoint 호출·authorization context 생성·PatientMapping/Consent/Grant 확인
- Authorized PACS/DICOM retrieval, PatientMapping/Consent/Grant/Authorization enforcement, reauthorization, permanent runtime grant, Audit atomicity
- HTTP route, Viewer/Download, PACS coordinator, STOW, destination verification, retry/reconciliation
- 제품용 Source→Destination Integrity PASS 또는 transfer completion gate

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-INT-001` | hash + pending persistence sub-gates only | `TC-INT-001-HASH-001~008`, `TC-INT-001-DB-001~010` |
| 보안 | `SEC-INT-001~002`; `AGENTS.md` §§4–6 | hash result is not Authorization; failed/incomplete input yields no manifest | Unit Acceptance; no route/STOW |
| 도메인 | `INV-INT-001~004` | Bit-preserving intent and failed evidence must not be success | algorithm spec in decision/profile; completion not implemented |
| Decision | `INT-001-DEC-001~002`, `PDEC-001` | canonical frame, bounded streaming, operation-bound pending-only persistence | Policy log + Acceptance before implementation |

## 4. 구현 결과

`services/api/src/integrity/application/source-integrity-manifest.builder.ts` exports `buildSourceIntegrityManifest`. It validates the declared manifest and unique DICOM UIDs before opening any stream, sorts by ASCII UID, consumes one lazy `application/dicom` stream at a time, checks actual length and configured lower-only bounds, and computes one SHA-256 digest for each exact byte stream. It then hashes the domain separator, object count, and framed UID/length/per-object digest tuples. It returns only algorithm, aggregate digest, object count and total bytes; errors carry a fixed code and generic message.

`tests/api/source-integrity-manifest.test.mjs` covers known-vector determinism, order invariance, mutations, negative metadata, limits, stream failures and abort cancellation. The module has no concrete Gateway/DB/HTTP dependency and is not registered in a product route/provider.

`services/api/src/integrity/persistence/postgres-source-integrity-evidence.repository.ts` writes the manifest as an immutable `SOURCE_CAPTURE/PENDING` row only when the persisted PACS operation is Tenant-visible and `CREATED`. It derives Session, Package and Study from the operation graph, creates no destination result or verified timestamp, returns the same row for exact replay, and rejects changed digest/count without update. Migration `0021_source_integrity_operation_binding.sql` adds a nullable operation FK (`RESTRICT`), a partial operation/stage unique index, and a source-only binding CHECK. The repository is internal and is not wired to a source retrieval caller or product endpoint.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/integrity/application/source-integrity-manifest.builder.ts` | Internal canonical streaming hash primitive and hard ceilings |
| `tests/api/source-integrity-manifest.test.mjs` | 12 positive/negative deterministic stream tests |
| `services/api/src/integrity/persistence/*`, `services/api/src/database/schema/integrity.ts`, `services/api/src/database/migrations/0021_source_integrity_operation_binding.sql` | Internal pending-only operation-bound persistence and database binding constraints |
| `tests/api/source-integrity-evidence-repository.test.mjs`, `tests/database/source-integrity-evidence-runtime.integration.test.mjs` | 6 repository unit tests and synthetic PostgreSQL/RLS/exact-grant Acceptance |
| `scripts/test-db-007-evidence.ps1`, `scripts/test-db-008-full-schema.ps1`, `services/api/Dockerfile` | Updated schema inventory/regression and integration-test image wiring |
| `docs/ACCEPTANCE-TESTS.md` | 8 hash and 10 persistence Acceptance cases; scoped results PASS, end-to-end gates remain NOT RUN |
| `docs/POLICY-DECISION-LOG.md` | `INT-001-DEC-001~002`; PDEC-001 reconfirmed 2026-10-02 |
| `docs/DATA-MODEL.md`, `docs/DOMAIN-MODEL.md`, `docs/ERD.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md` | Schema binding, least-privilege test boundary, risk and acceptance synchronized |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | Current scoped status and next prerequisites |
| `docs/implementation/MEDIQ-INT-001/*` | Ticket report and test evidence |

## 6. 영향 분석

### Architecture

- Internal application capability only; no module/provider, controller or DI registration. Future callers must perform authorization and derive server-owned object references before passing a lazy opener.

### API·Data

- No HTTP/OpenAPI contract, PACS route, production workflow or permanent runtime grant was added. Additive migration `0021` changes the database schema; the aggregate DB-008 run verified 18 product tables, migration ledger 22 and catalog `18|50|17|40`. During the isolated runtime integration only, exact 12-column SELECT + 12-column INSERT rights were added and revoked; total runtime column grants returned to 209. The `2 GiB` bound applies only to this manifest builder, not all study retrieval/transfer/storage.

### Security·Privacy

- No Consent/Authorization/Grant decision is made or represented. Aggregate digest is internal and not a bearer capability. It contains no PatientID, local ID, payload, credential, or per-instance digest in the result. No payload is persisted or logged.
- Passing this builder does not establish source authenticity, tenant binding, authorization, patient mapping, provenance, audit, destination integrity, or transfer success.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- API build/full regression: `PASS` (33 files / 571 tests)
- Hash suite: `PASS` (12/12); source-evidence repository suite: `PASS` (6/6)
- API typecheck and Drizzle migration consistency: `PASS`
- DB-008 full clean/reset/reapply, catalog/RLS, new source-evidence integration and DB-002~007 regressions: `PASS`; see `TEST-EVIDENCE.md`
- Authorized source retrieval/persistence, permanent runtime grant, Audit atomicity, destination comparison, Test Orthanc product flow and A→B E2E: `NOT RUN`

## 8. 변경하지 않은 사항

- All `AGENTS.md` authorization, tenant, source-of-record, Audit and no-STOW boundaries remain unchanged.
- Neither builder nor repository is wired to a DICOM adapter, product route or product workflow; no DICOM network request, PACS write or Test Orthanc mutation occurred.
- Only the additive schema migration and disposable DB-008/DB-002~007 validation were applied. No persistent runtime privileges were retained, and no production data/environment was changed.

## 9. 결정 및 예외

- Adopted `INT-001-DEC-001` under standing `PDEC-001`; see [Policy Decision Log](../../POLICY-DECISION-LOG.md#int-001-dec-001--bounded-source-integrity-manifest-primitive).
- Adopted `INT-001-DEC-002` under standing `PDEC-001`; scope is strictly persistence foundation, with no permanent grant or authorized retrieval.
- Existing P0 limits are hard ceilings; an invocation may narrow them for a constrained context but cannot raise them.
- The end-to-end source evidence workflow must be separately authorized and integrated with Audit/Provenance before PACS import.

## 10. 잔여 위험과 후속 작업

- No caller yet guarantees that an input stream came from the authorized Hospital A Study; a digest from fabricated input is not trusted evidence.
- A durable pending source baseline can now be persisted by the internal repository, but no trusted source retrieval or source-capture caller exists; no failure Audit is integrated, and destination comparison/`FAILED` completion block remain absent.
- 2 GiB/64 MiB limits have not been performance-benchmarked on a 2 GiB study or production-like workload.
- Follow-up: create a recommendation and Acceptance package for authorized source WADO retrieval + reauthorization + atomic Audit before wiring the hash and pending baseline. Then separately implement destination verification and completion enforcement. Keep STOW disabled until full Preflight and no-STOW/B-unchanged negatives pass.

## 11. 최종 판정

```text
Ticket: MEDIQ-INT-001
Scope: Bounded hash primitive and operation-bound pending source evidence persistence foundation only
Changed: SHA256-MANIFEST-V1 builder; migration/schema/repository; 6 unit + PostgreSQL/RLS Acceptance; acceptance and execution records
Not changed: PACS/DICOM access, authorization workflow, permanent runtime grant, Audit/Provenance producer, routes, Viewer/Download, STOW, destination comparison
Security impact: Fail-closed bounded hashing; no authority escalation or payload persistence; not product integrity evidence
Tests executed: API regression 33/571; hash 12/12; evidence repository 6/6; typecheck; migration consistency; DB-008 and DB-002~007; see TEST-EVIDENCE.md
Tests not executed: authorized Orthanc source read, PatientMapping/Consent/Grant integration, Audit atomicity, destination comparison, PACS no-STOW product coordinator, live STOW
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Pending baseline is not proof of authorized source bytes; no trusted source caller/Audit, destination verification or completion gate; no workload benchmark
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PARTIAL` | Recommendation/Acceptance first; bounded canonical stream-hash sub-gate implemented and tested; integration prerequisites remain open |
| 2026-10-02 | `PARTIAL` | `INT-001-DEC-002` and DB Acceptance recorded first; operation-bound PENDING persistence sub-gate passed DB-008 scratch; authorized retrieval and full integrity remain open |
