# MEDIQ-ORG-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-002` |
| 제목 | Synthetic Hospital registry baseline seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — seed scope, exact owner pairs, repeat and rollback probes verified |

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
| `TC-ORG-002-SEED-001` | Hospital A/B/C는 승인된 Organization/Tenant owner pair에 정확히 등록되어야 함 | Integration | 3 exact rows; correct parent pairs; TEST/ACTIVE | All three rows and every seeded column/parent pair exact-verified | `PASS` |
| `TC-ORG-002-SEED-002` | Seed 재실행은 멱등해야 함 | Integration | Repeat succeeds; canonical state unchanged | First and repeat invocations both succeeded | `PASS` |
| `TC-ORG-002-SEED-003` | Existing hospital metadata/owner-pair drift must fail closed | Integration/Security | Conflict probe rolls back; canonical rows unchanged | Both probes rejected; post-probe canonical seed succeeded | `PASS` |
| `TC-ORG-002-SEED-004` | Ticket must not configure endpoints, actors, patients, DICOM or authorization | Security/scope | No writes or external calls outside Hospital registry | Static scan found only `public.hospitals` INSERT; no UPDATE/DELETE or HTTP client/call | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Synthetic Hospital seed and conflict probes

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Verify insert-only Hospital A/B/C seed, repeatability, fail-closed mismatch probes and scope boundary.
- 명령:

```powershell
./scripts/test-org-002-seed.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: `org002_hospital_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS metadata_conflict=PASS owner_pair_conflict=PASS post_probe_state=PASS scope=PASS`
- 판정: `PASS`

### TEST-002 — Existing ORG-001 fixture regression

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: ORG-002가 기존 Organization/Tenant fixtures를 변경하지 않았는지 확인.
- 명령:

```powershell
./scripts/test-org-001-seed.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과: `org001_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS organization_conflict=PASS tenant_conflict=PASS post_probe_state=PASS`
- 판정: `PASS`

### TEST-003 — PowerShell syntax and repository whitespace

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령:

```powershell
$files = @('scripts/seed-org-002-hospital-registry.ps1','scripts/test-org-002-seed.ps1','docs/POLICY-DECISION-LOG.md','docs/implementation/MEDIQ-ORG-002/IMPLEMENTATION-REPORT.md','docs/implementation/MEDIQ-ORG-002/TEST-EVIDENCE.md')
foreach ($file in $files) {
  $lines = Get-Content -LiteralPath $file
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '[ \t]+$') { throw "Trailing whitespace: $($file):$($i+1)" }
  }
}
$files = @('scripts/seed-org-002-hospital-registry.ps1','scripts/test-org-002-seed.ps1')
foreach ($file in $files) {
  $tokens = $null; $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file), [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw "$file parse failed" }
}
git diff --check
```

- 종료 코드: `0` (final rerun after this evidence update)
- 핵심 결과: PowerShell AST parse and whitespace checks passed; `git diff --check` reported only Git LF/CRLF normalization warnings and no whitespace errors.
- 판정: `PASS`

### TEST-004 — Policy, Acceptance, index and next-ticket traceability

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령:

```powershell
$required = @(@('docs/POLICY-DECISION-LOG.md','ORG-002-DEC-001'),@('docs/ACCEPTANCE-TESTS.md','TC-ORG-002-SEED-004'),@('docs/implementation/README.md','MEDIQ-ORG-002'),@('docs/IMPLEMENTATION-PLAN.md','MEDIQ-ORG-003'),@('docs/P0-EXECUTION-SCHEDULE.md','MEDIQ-ORG-002'))
foreach ($entry in $required) { if (-not (Select-String -LiteralPath $entry[0] -SimpleMatch $entry[1] -Quiet)) { throw "Missing trace: $($entry[1]) in $($entry[0])" } }
```

- 종료 코드: `0`
- 핵심 결과: `ORG-002 policy/acceptance/index/next-ticket trace=PASS`
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-ORG-002-SEED-003` | Seed metadata or owner-pair drift | Both conflict probes failed closed and rolled back; canonical Hospital seed passed immediately afterward | `PASS` |
| Product cross-tenant authorization | Outside this seed Ticket; an ACTIVE C registry row is not access permission | Not tested here; runtime auth tests remain required | `N/A` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Product API, runtime Authorization/RLS and Hospital A→B transfer | Not implemented in this Ticket and not required to verify the seed | Hospital rows prove no authorization or transfer readiness | Later scoped Tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| None containing payloads | Test output contains fixture counts/status only; source report records no credentials | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` for MEDIQ-ORG-002 seed behavior and documented scope only.
- PASS를 주장할 수 있는 범위: Exact synthetic Hospital registry seed, repeatability, conflict rollback, hospital-only write boundary, and ORG-001 regression.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
