# MEDIQ-ORG-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-003` |
| 제목 | Role-aligned DICOMweb endpoint registry baseline |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — four-row role-aligned endpoint fixture, URL allowlist, repeat and rollback checks verified |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 / PowerShell host |
| Runtime·Toolchain | PowerShell 7.6.5; Docker Compose PostgreSQL; pinned PostgreSQL 18.6 `psql` image |
| 대상 환경 | Local Test PostgreSQL, isolated Compose database network |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-ORG-003-SEED-001` | Role-aligned endpoints and enable policy are exact | Integration | A QIDO/WADO, B QIDO/STOW; QIDO enabled; WADO/STOW disabled; C none | Four canonical records exact-verified; Hospital C has zero endpoints | `PASS` |
| `TC-ORG-003-SEED-002` | Seed is idempotent | Integration | Repeat succeeds without changing canonical rows | First and repeat seed invocations succeeded | `PASS` |
| `TC-ORG-003-SEED-003` | Existing endpoint URL/enable metadata drift fails closed | Integration/Security | Conflict transaction rolls back; canonical rows remain | Both URL and enabled-state probes rejected; canonical post-probe seed passed | `PASS` |
| `TC-ORG-003-SEED-004` | URL configuration rejects unapproved authority or URL components | Security | Invalid scheme/host/port/path/userinfo/query/fragment rejected before DB write | Seven invalid URL-shape probes rejected with no URL output | `PASS` |
| `TC-ORG-003-SEED-005` | Ticket performs no external PACS call and stores no credential | Security/scope | Only `hospital_endpoints` rows written; no HTTP client invocation | Static scope scan found only endpoint-table INSERT; no UPDATE/DELETE/HTTP call | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Endpoint seed and rejection probes

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Verify role-specific endpoint fixtures, idempotency, metadata drift rollback, invalid URL rejection, and no-network scope.
- 명령:

```powershell
./scripts/test-org-003-endpoint-seed.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: `org003_endpoint_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS url_conflict=PASS enabled_conflict=PASS invalid_url=PASS post_probe_state=PASS scope=PASS`
- 판정: `PASS`

### TEST-002 — Direct URL validator probe

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: 7종의 비승인 URL 형태가 database preflight 전에 거부되는지 확인.
- 명령:

```powershell
./scripts/seed-org-003-dicomweb-endpoints.ps1 -EnvFile .env -ProbeInvalidUrlsForTest -Confirm:$false
```

- 종료 코드: `0`
- 핵심 결과: `org003_invalid_url_probes=PASS cases=7`
- 판정: `PASS`

### TEST-003 — ORG-002 Hospital fixture regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령:

```powershell
./scripts/test-org-002-seed.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: `org002_hospital_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS organization_conflict=PASS tenant_conflict=PASS post_probe_state=PASS scope=PASS`
- 판정: `PASS`

### TEST-004 — Syntax, documentation traceability and repository whitespace

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령:

```powershell
# Parse both ORG-003 scripts with System.Management.Automation.Language.Parser.
# Scan the two scripts and two new ORG-003 implementation records for trailing whitespace.
git diff --check
```

- 종료 코드: `0` for AST/targeted whitespace scan; `0` for `git diff --check`.
- 핵심 결과: Both PowerShell scripts parsed without errors; policy decision, five Acceptance IDs, implementation index and current next-ticket links were cross-checked; the new ORG-003 scripts and implementation records had no trailing whitespace; Git reported no whitespace errors. Git emitted only existing LF-to-CRLF working-copy warnings.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-ORG-003-SEED-003` | Endpoint metadata/enable drift | Both probes aborted and rolled back; canonical fixture re-seed passed | `PASS` |
| `TC-ORG-003-SEED-004` | Unapproved endpoint URL | Seven unapproved URL shapes rejected before DB access and not emitted | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| WADO payload, Hospital B STOW, runtime Authorization/TLS/SSRF and product A→B | Outside this registry-only Ticket | Registry configuration does not prove reachability, capability or authorization | Later DICOM Adapter/interoperability Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| None containing payloads | Test output contains counts/status only; no credential values or URLs are emitted | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` for MEDIQ-ORG-003 endpoint metadata seed and documented scope only.
- PASS를 주장할 수 있는 범위: Four-row endpoint fixture, QIDO-only enable policy, URL allowlist, repeatability, conflict rollback, no-network scope and ORG-002 regression.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
