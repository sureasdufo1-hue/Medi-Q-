# MEDIQ-ORG-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ORG-001` |
| 제목 | Synthetic Organization and Tenant baseline seed |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — local synthetic seed, repeat/no-op and conflict rollback verified |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell host |
| Runtime·Toolchain | PowerShell, Docker Compose, PostgreSQL 18.6, psql 18.6 |
| 대상 환경 | Existing local `mediq` PostgreSQL on isolated `database` network |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-ORG-001-SEED-001` | A/B/C Organizations and separate Tenant owner pairs | Integration | Three exact Organization records; three unique Tenants reference their corresponding Organization | Seed transaction exact-verified 3+3 fixtures | `PASS` |
| `TC-ORG-001-SEED-002` | Re-run seed against existing fixture | Integration | No update/delete; insert-if-absent completes and exact verification still passes | First insert and subsequent repeat both passed; fixed SQL uses `ON CONFLICT DO NOTHING` | `PASS` |
| `TC-ORG-001-SEED-003` | Existing Organization metadata or Tenant owner-pair drift | Security / Integrity | Conflict rejected, transaction rolls back, existing rows remain valid and unchanged | Both intentional mismatch probes returned expected conflict marker; subsequent canonical seed verification passed | `PASS` |
| `TC-ORG-001-SEED-004` | Synthetic data boundary | Security / Privacy | Only Organization/Tenant rows; no PHI, endpoint credentials, Actor, Patient or DICOM | Seed allowlist is three Organizations and three Tenants; script performs no other DML | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — PowerShell parse and local database seed acceptance

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Parse both scripts and exercise first seed, repeat/no-op, Organization conflict rollback, Tenant owner-pair conflict rollback, and post-probe exact-state validation.
- 명령:

```powershell
$files = @('scripts/seed-org-001-registry.ps1','scripts/test-org-001-seed.ps1'); foreach ($file in $files) { $tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file), [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { Write-Error "$file parse failed"; $errors; exit 1 } }; 'PowerShell AST parse: PASS'; .\scripts\test-org-001-seed.ps1 -EnvFile .env
```

- 종료 코드: 0
- 핵심 결과: The initial clean-database seed invocation created 3 Organization/3 Tenant rows; the enhanced rerun revalidated those fixtures and executed both conflict probes. Final output: `PowerShell AST parse: PASS`; `org001_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS organization_conflict=PASS tenant_conflict=PASS post_probe_state=PASS`. Six synthetic Organization/Tenant rows are intentionally present in the local Test DB.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| Organization expected metadata mismatch | Probe supplies a deliberately different expected name after insert-if-absent | Rejected with fixed conflict marker; PostgreSQL transaction rolls back | `PASS` |
| Tenant expected owner-pair mismatch | Probe supplies a deliberately different expected parent Organization | Rejected with fixed conflict marker; following normal seed verifies canonical fixture remains | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Product API, runtime authorization/RLS, and Hospital A→B transfer | Not implemented in MEDIQ-ORG-001 and not needed to prove seed behavior | Seed existence is not proof of tenant isolation or product readiness | Implement and test in the later scoped P0 tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Console summary | Captured in TEST-001; no raw SQL connection output recorded | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` for local Synthetic Organization/Tenant fixture preparation only.
- PASS를 주장할 수 있는 범위: Stable insert-only A/B/C records, repeat execution, Organization/Tenant conflict fail-closed rollback, exact fixture post-check.
- PASS에 포함되지 않는 범위: Hospital or PACS registry, application authorization, RLS, APIs, DICOM access or transfer.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
