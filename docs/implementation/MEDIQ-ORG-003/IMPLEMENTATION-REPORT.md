# MEDIQ-ORG-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-003` |
| 제목 | Role-aligned DICOMweb endpoint registry baseline |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — role-aligned synthetic endpoint registry and fail-closed checks verified |

## 1. 목표

Synthetic Hospital A/B에 역할별 QIDO-RS/WADO-RS/STOW-RS endpoint metadata를 제한·검증된 Compose URL로 등록하고, 검증되지 않은 capability는 비활성화한다.

## 2. 범위

### 포함

- A: QIDO-RS + WADO-RS; B: QIDO-RS + STOW-RS; C: endpoint 없음
- 안정 Endpoint ID와 대응 Hospital ID, allowlisted internal host, `/dicom-web` base URL
- 현재 환경 시험이 있는 QIDO만 enabled; A WADO와 B STOW는 disabled
- `.env` URL host/scheme/port/path/userinfo/query/fragment 검증, insert-only seed, exact verification, fail-closed rollback probes
- 권고안·Acceptance·runbook·implementation plan/status/evidence 동기화

### 제외

- PACS credential 저장, 실제 PACS/DICOMweb network 호출, WADO payload/STOW transfer interoperability 검증
- endpoint routing/SSRF 방어 구현, API/Adapter/Authorization, TLS/mTLS 설정
- Hospital C endpoint, 실제 기관/운영 URL, schema/migration 변경

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-ORG-003`, `IMPLEMENTATION-PLAN.md` Phase 2 | Hospital별 필요한 DICOMweb endpoint metadata | `ORG-003-DEC-001`, endpoint seed |
| 보안 | `SEC-VIEW-003`, `SEC-DICOM-001~003`, `THR-VIEW-009` | backend-only credential; allowlisted URL; unverified WADO/STOW fail closed | `.env` URL validator, QIDO-only enable policy, no PACS call |
| API·도메인 | `DATA-MODEL.md` §10, `ERD.md`, `DICOM-INTEROPERABILITY-PROFILE.md` §§3/16/17 | QIDO/WADO/STOW type, unique per Hospital/type, DICOMweb root | exact 4-row A/B registry; C has none |
| Acceptance | `ACCEPTANCE-TESTS.md` `TC-ORG-003-SEED-001~005` | exact role rows/enable state, repeat, drift rollback, invalid URL rejection, scope boundary | `scripts/test-org-003-endpoint-seed.ps1` |

## 4. 구현 결과

`seed-org-003-dicomweb-endpoints.ps1` registers four synthetic DICOMweb endpoint rows for local Test Hospitals: A QIDO/WADO and B QIDO/STOW. The two QIDO records are enabled because A/B authenticated environment probes have passed. A WADO and B STOW are stored disabled because payload compatibility has not been tested; C has no endpoint. The seed reads only local ignored URL settings, permits only HTTP host `orthanc-a` or `orthanc-b` on port 8042 with no userinfo/path/query/fragment, and appends `/dicom-web`.

The runner preflights the DB-008 schema and exact ORG-002 parent Hospital rows, then inserts stable IDs using `ON CONFLICT (hospital_id, endpoint_type) DO NOTHING` and exact-verifies ID, type, base URL, enable state and four-row scope in one transaction. URL or enable-state drift aborts and rolls back. Seven invalid URL shapes are rejected before any database/network operation. The test runner verifies the only SQL write target is `public.hospital_endpoints`, with no UPDATE/DELETE or PACS HTTP call.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `scripts/seed-org-003-dicomweb-endpoints.ps1` | Guarded role-aligned endpoint seed, strict URL validation and rollback probes |
| `scripts/test-org-003-endpoint-seed.ps1` | Role/scope scan, repeat, metadata conflict and invalid URL tests |
| `docs/POLICY-DECISION-LOG.md`, `docs/DATA-MODEL.md` | `ORG-003-DEC-001`; defines endpoint enable eligibility semantics |
| `docs/ACCEPTANCE-TESTS.md`, `scripts/README.md` | Five acceptance cases and reproducible run instructions |
| `docs/IMPLEMENTATION-PLAN.md`, README and current status reports | Phase status and next ticket synchronized |
| `docs/implementation/MEDIQ-ORG-003/` | This report and executed test evidence |

## 6. 영향 분석

### Architecture

- No runtime networking or deployment topology change; endpoint URL rows are configuration metadata only.

### API·Data

- No schema, migration or API change; uses the approved `hospital_endpoints` table.

### Security·Privacy

- Stores only allowlisted synthetic internal URLs. Credentials remain in ignored local secret configuration; no PACS call or PHI/DICOM access. `enabled` does not replace Authorization.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` for this metadata-seed Ticket only; detailed commands/results are in TEST-EVIDENCE.md.

## 8. 변경하지 않은 사항

- WADO and destination STOW are unverified; configured rows remain disabled pending capability tests.
- No endpoint exists for C; no PACS integration or product readiness is claimed.

## 9. 결정 및 예외

- `ORG-003-DEC-001`: role-aligned four endpoints, QIDO enabled only, strict Compose host allowlist, no credentials, no network calls.

## 10. 잔여 위험과 후속 작업

- URL registry is not runtime SSRF defense; a later DICOMweb adapter must resolve allowlisted registry records, validate TLS, bind destination and handle redirects safely.
- WADO/STOW and product A→B transfer require later DICOM interoperability/adapter Acceptance.

## 11. 최종 판정

```text
Ticket: MEDIQ-ORG-003
Scope: Role-aligned synthetic DICOMweb endpoint registry in local Test PostgreSQL
Changed: Insert-only A/B endpoint metadata seed and tests; ORG-003 policy/Acceptance/runbook/status/evidence
Not changed: Endpoint schema/migration, credentials, PACS calls, DICOM Adapter/API, authorization, RLS or product exchange
Security impact: Strict internal-host URL allowlist; no credential in table/log; no external request; QIDO only enabled on environment evidence
Tests executed: `test-org-003-endpoint-seed.ps1` (seed/repeat/URL conflict/enabled conflict/invalid URL/post-state/scope); direct seven-case URL probe; `test-org-002-seed.ps1` regression; PowerShell AST parse of both ORG-003 scripts; targeted trailing-whitespace scan; `git diff --check` (exit 0)
Tests not executed: WADO payload and B STOW interoperability, runtime SSRF/TLS/auth, product A→B (outside Ticket)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Seed is not runtime endpoint authorization/SSRF control; WADO/STOW remain disabled pending capability tests
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PLANNED` | 구현 기록 생성 |
| 2026-09-30 | `PASS` | Role-aligned four-row endpoint seed, QIDO-only enabled policy, URL validation and rollback probes verified |
