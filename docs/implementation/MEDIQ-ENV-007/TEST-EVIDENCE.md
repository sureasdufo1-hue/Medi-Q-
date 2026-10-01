# MEDIQ-ENV-007 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-007` |
| 제목 | Deterministic synthetic CT fixture, manifest and Orthanc A seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 결과 | `PASS` — ENV-007 scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell; Docker Desktop Linux containers |
| Runtime·Toolchain | Python `3.13.14`; pydicom `3.0.2` hash-pinned venv; Docker Engine `29.8.0`; Compose `5.5.1`; Orthanc Team `26.9.1` digest, core `1.13.0`; pinned Node `24-alpine` peer |
| 대상 환경 | Local Compose project `mediq`; isolated `hospital-a` and `hospital-b` internal networks |
| 데이터 | Synthetic non-diagnostic CT only; no real PHI, production DICOM, or credential in evidence |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV007-01 | Exact dependency and executable script syntax | Supply-chain/static | pydicom hash verified; generator/validator compile | `pydicom==3.0.2` installed with `--require-hashes`; `py_compile` exit 0 | `PASS` |
| ENV007-02 | Deterministic synthetic fixture and manifest | Generation/reproducibility | 3 CT Part 10 files, exact metadata/hash, repeat no change | 3 × 34,090 bytes; total 102,270 bytes; repeat output unchanged; manifest SHA-256 `e041abb9085eb0eb8a0244ba832fb0981b5c0523df97251c51977d46ab953a69` | `PASS` |
| ENV007-03 | Fixture profile and fail-closed validation | DICOM/security | Part 10, CT Image Storage, Explicit VR LE, synthetic allowlist, hashes and pixel encoding match | Validator passed; wrong output directory rejected with exit 1; original fixture unchanged | `PASS` |
| ENV007-04 | Hospital A seed and inventory | DICOMweb integration | One STOW to empty A; exact QIDO 1 Study/1 Series/3 SOP Instances | STOW HTTP 200; QIDO verified counts 1/1/3 and expected synthetic UID set | `PASS` |
| ENV007-05 | Idempotency and destination isolation | Integration/security | exact existing A fixture causes zero additional STOW; B remains empty | second run `stow_requests=0`; B pre/post QIDO `studies=0` | `PASS` |
| ENV007-06 | Environment regression | Runtime/security | A/B authenticated probes and isolation remain valid | A/B no-auth and invalid-password requests 401; authenticated QIDO 200; cross-network unreachable; B empty | `PASS` |
| ENV007-07 | Configuration/repository boundary | Static | Compose validation and diff/ignore checks succeed; generated data/venv not tracked | Commands exit 0; fixture and venv ignored; no DICOM binary staged/tracked | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — hash-pinned dependency install and compile

- 실행 일시: 2026-09-29 KST
- 목적: exact pydicom version/hash and script syntax validation
- 명령:

```powershell
python -m venv .venv-env007
.\.venv-env007\Scripts\python.exe -m pip install --disable-pip-version-check --require-hashes --only-binary=:all: -r scripts/requirements-dicom-fixture.txt
.\.venv-env007\Scripts\python.exe -m py_compile scripts/generate-synthetic-ct.py scripts/validate-synthetic-ct.py
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: hash-verified `pydicom 3.0.2` installed; Python compilation passed.
- 판정: `PASS`

### TEST-002 — create and deterministically rerun fixture

- 실행 일시: 2026-09-29 KST
- 목적: produce ignored CT Part 10 objects and prove repeated invocation matches byte-for-byte output
- 명령:

```powershell
.\.venv-env007\Scripts\python.exe scripts/generate-synthetic-ct.py
.\.venv-env007\Scripts\python.exe scripts/generate-synthetic-ct.py
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: first call created, second reported `fixture_generation=unchanged`; exactly 3 instances, each 34,090 bytes; total 102,270; manifest hash `e041abb9085eb0eb8a0244ba832fb0981b5c0523df97251c51977d46ab953a69`.
- 판정: `PASS`

### TEST-003 — DICOM/manifest validation and invalid-path rejection

- 실행 일시: 2026-09-29 KST
- 목적: inspect file hashes, Part 10, CT profile, UID namespace, synthetic metadata, private elements and pixel encoding; reject a non-approved path
- 명령:

```powershell
.\.venv-env007\Scripts\python.exe scripts/validate-synthetic-ct.py
& .\.venv-env007\Scripts\python.exe scripts/validate-synthetic-ct.py --directory data
$invalidPathExit = $LASTEXITCODE
if ($invalidPathExit -ne 1) { throw "Expected non-approved fixture path to fail closed." }
```

- 종료 코드: valid fixture `0`; expected invalid-path rejection `1`
- 핵심 결과: valid fixture reported CT Image Storage `1.2.840.10008.5.1.4.1.1.2`, Explicit VR LE `1.2.840.10008.1.2.1`, 1 Study/1 Series/3 instances. Wrong path was rejected before changing files.
- 판정: `PASS` (negative path behaved as expected)

### TEST-004 — seed source Study into Hospital A and verify destination remains empty

- 실행 일시: 2026-09-29 KST
- 목적: exercise authenticated DICOMweb STOW-RS for local fixture provisioning only, then verify exact QIDO inventory
- 명령:

```powershell
./scripts/seed-synthetic-ct.ps1
```

- 종료 코드: `0`
- 핵심 결과: Hospital B preflight QIDO `studies=0`; A STOW-RS HTTP `200`; A QIDO verified `studies=1 series=1 instances=3`; B postflight QIDO `studies=0`. Credentials passed to isolated Node peer through stdin and were not printed.
- 판정: `PASS`

### TEST-005 — idempotent rerun and A/B regression

- 실행 일시: 2026-09-29 KST
- 목적: verify no duplicate STOW, A auth/QIDO regression and B auth/isolation regression
- 명령:

```powershell
./scripts/seed-synthetic-ct.ps1
./scripts/test-orthanc-a.ps1
./scripts/test-orthanc-b.ps1
```

- 종료 코드: each `0`
- 핵심 결과: second seed reported `already_seeded_noop stow_requests=0`, A still QIDO 1/1/3, B remains 0; A and B unauthenticated/invalid credentials returned 401, authenticated QIDO returned 200; A/B cross-network endpoints remained unreachable and B ports remained unpublished.
- 판정: `PASS`

### TEST-006 — Compose/repository checks

- 실행 일시: 2026-09-29 KST
- 목적: validate Compose config, topology invariants, whitespace and local-only artifacts
- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
git diff --check
git check-ignore -v .venv-env007 data/synthetic-ct-env007/manifest.json
git status --short -- data
```

- 종료 코드: all expected success checks `0`
- 핵심 결과: config/topology checks passed; diff check clean; venv and generated fixture ignored; no generated fixture file tracked. (The expected-path negative case is recorded in TEST-003.)
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| ENV007-NEG-01 | Validator given a directory other than the approved fixture target | Exit 1; no source fixture changed | `PASS` |
| ENV007-NEG-02 | B already contains any Study before A seed | Implemented preflight guard refuses before STOW; not induced because B must be preserved and currently empty | `IMPLEMENTED; NOT INDUCED` |
| ENV007-NEG-03 | A contains unexpected Study or partial fixture | Seeder refuses rather than overwrite or auto-clean; not induced to preserve current Orthanc state | `IMPLEMENTED; NOT INDUCED` |
| ENV007-NEG-04 | STOW reports non-success or verification mismatch | Seeder exits nonzero and never reports successful seed; not fault-injected against the persistent source volume | `IMPLEMENTED; NOT INDUCED` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| WADO-RS metadata/instance/frame retrieval and payload byte/hash comparison | ENV-007 provisions a source fixture; application DICOMweb adapter is absent | QIDO/STOW seed does not prove WADO response compatibility or byte preservation | DICOM integration Spike and product Adapter ticket |
| STOW to Hospital B and destination QIDO verification | Requires approved transfer state/preflight; ENV-007 is source fixture provisioning only | No A→B transfer evidence | Implement/verify approved PACS Import flow |
| Concurrent seeder race | Seeder is sequentially idempotent but has no cross-process lock | Two simultaneous invocations could race before QIDO sees the first write | Operate one seed command at a time; add lock if concurrent automation becomes required |
| Viewer decode/render, TLS, MediQ Consent/Authorization/Grant, Integrity/Provenance/Audit | Product components are not part of ENV-007 | P0 acceptance remains blocked | Subsequent DICOM/security/product Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Manifest digest | local ignored `data/synthetic-ct-env007/manifest.json`; SHA-256 above | Synthetic identifiers only; no PHI/secret |
| DICOM objects | local ignored `data/synthetic-ct-env007/instance-001..003.dcm` | Generated geometric pixels only; excluded from Git |
| Repeatable commands | `scripts/README.md`; scripts in `scripts/` | Credentials read from ignored `.env`, never included in evidence |
| Orthanc inventory | this evidence: A QIDO 1/1/3, B QIDO 0 | No DICOM payload, UID, PACS credential or response body included |

## 7. 결론

- 결과: `PASS` — deterministic synthetic fixture, integrity manifest, fail-closed validation, A-only STOW seed, exact source QIDO set, idempotent rerun, A/B regression and B-empty boundary.
- PASS 범위: `MEDIQ-ENV-007` fixture provisioning only. It does not mean DICOM-INT acceptance, WADO compatibility, Hospital A→B, MediQ product security, or Phase 0 PASS.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
