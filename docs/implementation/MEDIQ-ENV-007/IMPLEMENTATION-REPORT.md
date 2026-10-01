# MEDIQ-ENV-007 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-007` |
| 제목 | Deterministic synthetic CT fixture, manifest and Orthanc A seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 상태 | `PASS` — fixture generation/validation and test-source seed scope only |

## 1. 목표

재현 가능한 Classic single-frame CT 합성 fixture와 무결성 manifest를 만들고, 승인된 로컬 Test Orthanc A에만 DICOMweb STOW-RS로 한 번 seed한다. Hospital B는 비어 있는 상태를 유지한다. 제품 API·환자 권한 흐름의 영상 교환은 이 Ticket의 성공으로 간주하지 않는다.

## 2. 범위

### 포함

- `pydicom==3.0.2` hash-pinned 가상환경 요구사항
- 결정론적 128×128, 3-slice, non-diagnostic CT phantom과 DICOM Part 10 파일
- SOP Class/Transfer Syntax/Study·Series·Instance UID/count/size/SHA-256을 담는 `manifest.json`
- allowlist·UID namespace·Part 10·pixel encoding·해시를 검사하는 fail-closed validator
- seed 전 A/B health·network·host-port 경계 확인
- A가 비어 있으면 STOW-RS 1회 실행, 정확히 동일한 Study/Series/SOP UID 집합이 있으면 재전송 없이 종료
- 예상 밖 A 데이터 또는 비어 있지 않은 B이면 거부
- A QIDO의 1 Study/1 Series/3 Instance와 B의 0 Study 사후 확인
- 실행·증거 및 현재 문서 동기화

### 제외

- DICOM fixture binary를 Git에 포함하거나 실제 환자·운영 DICOM 사용
- Hospital B 반입, MediQ API/Worker, Tenant/Patient Mapping, Consent/Authorization/Grant, Mandatory Preflight
- WADO-RS payload, browser viewer, TLS, destination transfer, Integrity/Provenance/Audit의 제품 Acceptance
- Orthanc volume 삭제·초기화 또는 fixture 재생성을 위한 destructive reset

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `P0-DEVELOPER-BASELINE.md` §2, §4–5; `IMPLEMENTATION-PLAN.md` §9 `MEDIQ-ENV-007` | Classic CT + Explicit VR LE fixture, 재현 가능한 seed와 manifest | generator, validator, A-only seed wrapper, evidence |
| 보안 | `AGENTS.md` §§4, 8; `SECURITY-REQUIREMENTS.md`; `THREAT-MODEL.md` | Synthetic-only, ignored runtime data, local ignored credentials, isolated A/B network, fail closed on unexpected store contents | `.gitignore`, authenticated peer requests via stdin, A/B pre/post checks |
| DICOM | `DICOM-INTEROPERABILITY-PROFILE.md` §§2, 3, 16, 21 | CT Image Storage, Explicit VR Little Endian, Part 10, UID/manifest traceability | pydicom validator and Orthanc QIDO/STOW seed smoke |
| Acceptance | `P0-EXECUTION-SCHEDULE.md` PLAN-01/02; `ACCEPTANCE-TESTS.md`; `DICOM-INTEROPERABILITY-PROFILE.md` §21 | Seed readiness only; not MediQ A→B or DICOM-INT full acceptance | STOW to A and QIDO inventory; product Gate remains NOT RUN |

## 4. 구현 결과

`scripts/generate-synthetic-ct.py` produces three deterministic, single-frame 128×128 CT Part 10 objects with synthetic geometric pixel data. Patient identity is fixed to `TEST-PATIENT-007` / `SYNTHETIC^TEST`; UIDs use a deterministic UUID-derived `2.25` namespace. The fixture is explicitly non-diagnostic and contains no source patient data. Each object is Explicit VR Little Endian, CT Image Storage, signed 16-bit pixel data, and has no private elements.

`manifest.json` records the fixture/version, patient test identity, SOP Class UID, Transfer Syntax UID, Study/Series/Frame UIDs, instance/SOP UIDs, dimensions, byte counts, pixel ranges and SHA-256 values. The fixture is generated only at ignored `data/synthetic-ct-env007/`. Generator reruns compare exact output and refuse to replace unexpected existing files.

`scripts/validate-synthetic-ct.py` checks the approved output path, exact file set, dependency version, manifest consistency, hashes, Part 10 marker, required DICOM metadata, UID namespace, pixel representation/dimensions, and synthetic identity allowlist.

`scripts/seed-synthetic-ct.ps1` first validates the local fixture and A/B boundaries. It sends DICOMweb STOW-RS only to A. A must either be empty or contain only the exact expected fixture; the latter is a no-op after QIDO verification. Any other A content fails closed. B must remain empty before and after. A successful seed was followed by QIDO confirmation of exactly 1 Study, 1 Series and 3 expected SOP Instances. A second run made zero STOW requests.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `.gitignore` | `.venv-env007/`와 기존 `data/*` 규칙으로 local runtime output 제외 확인 |
| `scripts/requirements-dicom-fixture.txt` | pydicom 3.0.2 exact pin과 PyPI SHA-256 hash |
| `scripts/generate-synthetic-ct.py` | 결정론적 Synthetic CT 생성 및 안전한 기존 산출물 비교 |
| `scripts/validate-synthetic-ct.py` | manifest·DICOM profile·hash fail-closed 검사 |
| `scripts/seed-synthetic-ct.ps1` | A-only STOW seed, idempotent verification, B-empty guard |
| `scripts/README.md`, `infra/README.md` | 재현 명령과 실제 환경 상태 |
| `README.md`, `docs/P0-DEVELOPER-BASELINE.md`, `docs/P0-EXECUTION-SCHEDULE.md` | 완료된 환경 항목과 남은 P0 Gate 동기화 |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/DICOM-INTEROPERABILITY-PROFILE.md`, `docs/TECH-STACK-DECISION.md`, `docs/REPOSITORY-BASELINE-AUDIT.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md` | 실제 fixture/seed 상태 및 미검증 범위 동기화 |
| `docs/implementation/README.md`, `docs/implementation/MEDIQ-ENV-007/*` | Ticket 색인·구현 보고서·실제 시험 증거 |

## 6. 영향 분석

### Architecture

- Only the isolated Hospital A test source store is seeded. Hospital B remains a distinct, empty test destination.
- No API/Worker, application service, or product DICOMweb adapter was added.

### API·Data

- No API, domain model, database schema, or migration changed. Orthanc A contains one synthetic Study for subsequent fixture-backed tests.

### Security·Privacy

- Synthetic data only; no PHI or production DICOM. Local Orthanc credentials are read from the ignored `.env`, sent to short-lived internal-network probe containers through stdin, and never printed or recorded.
- DICOM objects contain no private elements and no patient birth date/address/other patient IDs.
- Seed is restricted to the pinned local A endpoint and checks B is empty before and after. It does not establish Consent, Authorization, Tenant isolation in product code, or E2E security.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: deterministic generation/re-run, manifest/hash validation, A-only STOW seed, exact QIDO inventory, no-op second run, A/B runtime/auth regression and B-empty guard passed.

## 8. 변경하지 않은 사항

- No STOW to Hospital B, WADO-RS, MediQ authorization/preflight, product transfer, Viewer, Migration, or P0 Acceptance.
- No Orthanc volume reset or destructive recovery test.

## 9. 결정 및 예외

- The fixture uses Classic CT Image Storage + Explicit VR Little Endian as the first reproducible test object. `pydicom` is exact-pinned to 3.0.2 and installed with hash verification.
- The seeder is sequentially idempotent. Concurrent seed invocations are not coordinated by a distributed lock; run one seed command at a time.
- STOW to Hospital A is fixture provisioning only, not the product's Hospital A→MediQ→Hospital B workflow.

## 10. 잔여 위험과 후속 작업

- WADO-RS metadata/instance retrieval, content byte/hash behavior, supported viewer rendering, STOW to B, destination verification and complete MediQ Golden Path are unverified.
- Existing unexpected A/B store contents cause safe refusal; no automatic cleanup is provided. If a prior partial STOW left objects, investigate with QIDO and perform an explicitly approved test-volume recovery outside this Ticket.
- ENV-008 remains the next environment Ticket for app configuration/execution profile. DICOM integration Spike and product vertical slice remain separate work.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-007
Scope: CAPSTONE-P0 synthetic source-fixture generation, validation and isolated Hospital A seed
Changed: deterministic CT generator, hash-pinned pydicom requirement, fail-closed validator, repeatable A-only STOW seed, docs/evidence
Not changed: MediQ API/Worker, A→B transfer, Consent/Authorization/Grant, WADO, Viewer, DB schema/migration, P0 Acceptance
Security impact: Synthetic-only; ignored runtime files and local credentials; separate A/B networks; no secrets/PHI in evidence
Tests executed: dependency hash install; Python compile; deterministic generation/re-run; DICOM/manifest validation; expected-path rejection; STOW 200; QIDO exact 1/1/3; repeat run STOW count 0; A/B auth/network regression; B empty; Compose/config/diff checks (see TEST-EVIDENCE.md)
Tests not executed: WADO payload, STOW to B, MediQ policy/preflight, A→B Golden Path, destination verification, product integrity/provenance/audit, concurrent seeder race
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: product DICOM interoperability and Phase 0 remain unverified/BLOCKED
Status: PASS (MEDIQ-ENV-007 scope only; Phase 0 remains BLOCKED)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-29 | `PASS` | deterministic synthetic CT manifest, fail-closed validation, A-only STOW seed and repeat-run/B-empty evidence |
