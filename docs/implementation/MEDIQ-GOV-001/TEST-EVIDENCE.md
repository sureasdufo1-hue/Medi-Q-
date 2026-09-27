# MEDIQ-GOV-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GOV-001` |
| 제목 | 구현·실행·문서화 단일 작업 Gate |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-26` |
| 결과 | `PASS` |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell |
| Runtime·Toolchain | PowerShell `7.6.5` (`pwsh`) |
| 대상 환경 | Local Repository |
| 데이터 | 문서 템플릿과 합성 Ticket 식별자만 사용 |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `GOV-TEST-001` | script syntax | Static | 두 PowerShell script의 Parser 오류 없음 | 2개 script, 오류 0개 | `PASS` |
| `GOV-TEST-002` | WhatIf safety | Functional | 파일 생성 없이 대상 표시 | 대상 표시, 파일 미생성 | `PASS` |
| `GOV-TEST-003` | 정상 scaffold | Functional | 보고서 2개 생성·토큰 치환 | 두 파일 생성, 미치환 토큰 없음 | `PASS` |
| `GOV-TEST-004` | 기존 기록 보호 | Negative | 중복 Ticket 비정상 종료 | 비정상 종료 및 기존 파일 유지 | `PASS` |
| `GOV-TEST-005` | Ticket 형식 제한 | Negative | 잘못된 Ticket 거부 | Parameter validation으로 거부 | `PASS` |
| `GOV-TEST-006` | 문서 정합성 | Static | 필수 파일·링크·규칙 존재 | 모두 확인 | `PASS` |

## 3. 실행 명령과 결과

최종 통합 검증은 다음과 같이 실행했다. Test harness는 OS 임시 디렉터리 아래에 무작위 `mediq-gov-scaffold-test-<GUID>` 경로를 만들고, 경로 안전성을 확인한 뒤 검증 종료 시 해당 경로만 정리한다.

- 실행 일시: `2026-09-26T11:51:00+09:00`
- 명령:

```powershell
Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
& .\scripts\test-new-implementation-record.ps1
```

- 종료 코드: `0`
- 실제 결과:

```json
{
  "ParsedScriptCount": 2,
  "ParserErrors": 0,
  "WhatIfExit": 0,
  "WhatIfCreatedFiles": false,
  "CreateExit": 0,
  "GeneratedFileCount": 2,
  "UnexpandedTokenCount": 0,
  "DuplicateExit": 1,
  "InvalidTicketExit": 1,
  "RequiredFilesMissing": 0,
  "GovernanceChecks": 4,
  "UnexpandedRecordTokenCount": 0,
  "TempCleaned": true
}
```

아래 항목은 이 통합 검증 내부에서 실행된 세부 검사다.

### GOV-TEST-001 — PowerShell 구문

```powershell
$parseTargets = @(
  '.\scripts\new-implementation-record.ps1',
  '.\scripts\test-new-implementation-record.ps1'
)
foreach ($parseTarget in $parseTargets) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $parseTarget), [ref]$tokens, [ref]$errors
  ) | Out-Null
  if ($errors.Count -ne 0) { throw ($errors | Out-String) }
}
```

- 종료 코드: `0`
- 핵심 결과: 두 script의 Parser 오류 `0`
- 판정: `PASS`

### GOV-TEST-002 — WhatIf

```powershell
pwsh -NoProfile -File .\scripts\new-implementation-record.ps1 `
  -Ticket MEDIQ-TST-000 `
  -Title "WhatIf verification" `
  -Classification CAPSTONE-P0 `
  -OutputRoot $testRoot `
  -WhatIf
```

- 종료 코드: `0`
- 핵심 결과: 생성 예정 대상만 표시되고 `MEDIQ-TST-000` 디렉터리는 생성되지 않음
- 판정: `PASS`

### GOV-TEST-003 — 정상 생성 및 토큰 치환

```powershell
pwsh -NoProfile -File .\scripts\new-implementation-record.ps1 `
  -Ticket MEDIQ-TST-001 `
  -Title "Scaffold verification" `
  -Classification CAPSTONE-P0 `
  -OutputRoot $testRoot

$files = Get-ChildItem (Join-Path $testRoot 'MEDIQ-TST-001') -File
if ($files.Count -ne 2) { throw 'Expected two generated files.' }
if (Select-String -Path $files.FullName -Pattern '\{\{[^}]+\}\}') {
  throw 'Unexpanded template token found.'
}
```

- 종료 코드: `0`
- 핵심 결과: `IMPLEMENTATION-REPORT.md`, `TEST-EVIDENCE.md` 생성 및 모든 토큰 치환
- 판정: `PASS`

### GOV-TEST-004 — 중복 Ticket 거부

```powershell
pwsh -NoProfile -File .\scripts\new-implementation-record.ps1 `
  -Ticket MEDIQ-TST-001 `
  -Title "Duplicate verification" `
  -OutputRoot $testRoot
if ($LASTEXITCODE -eq 0) { throw 'Duplicate ticket should fail.' }
```

- 종료 코드: 비정상 종료를 예상하고 wrapper 검증은 `0`
- 핵심 결과: `Implementation record already exists` 오류로 덮어쓰기 차단
- 판정: `PASS`

### GOV-TEST-005 — 잘못된 Ticket 거부

```powershell
pwsh -NoProfile -File .\scripts\new-implementation-record.ps1 `
  -Ticket BAD-1 `
  -Title "Invalid ticket verification" `
  -OutputRoot $testRoot
if ($LASTEXITCODE -eq 0) { throw 'Invalid ticket should fail.' }
```

- 종료 코드: 비정상 종료를 예상하고 wrapper 검증은 `0`
- 핵심 결과: `ValidatePattern`이 잘못된 Ticket을 거부
- 판정: `PASS`

### GOV-TEST-006 — 문서 정합성

```powershell
$required = @(
  '.\docs\implementation\README.md',
  '.\docs\implementation\_templates\IMPLEMENTATION-REPORT.md',
  '.\docs\implementation\_templates\TEST-EVIDENCE.md',
  '.\docs\implementation\MEDIQ-GOV-001\IMPLEMENTATION-REPORT.md',
  '.\docs\implementation\MEDIQ-GOV-001\TEST-EVIDENCE.md',
  '.\scripts\new-implementation-record.ps1',
  '.\scripts\test-new-implementation-record.ps1'
)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }
if ($missing) { throw "Missing required files: $missing" }

$checks = @(
  @{ Path = '.\AGENTS.md'; Pattern = '구현과 문서화의 단일 작업 규칙' },
  @{ Path = '.\README.md'; Pattern = 'docs/implementation/README.md' },
  @{ Path = '.\docs\IMPLEMENTATION-PLAN.md'; Pattern = 'v1.3 Integrated Implementation Documentation Gate' },
  @{ Path = '.\docs\IMPLEMENTATION-PLAN.md'; Pattern = 'docs/implementation/<TICKET>/TEST-EVIDENCE.md' }
)
foreach ($check in $checks) {
  if (-not (Select-String -LiteralPath $check.Path -SimpleMatch $check.Pattern -Quiet)) {
    throw "Required governance text was not found: $($check.Path)"
  }
}
```

- 종료 코드: `0`
- 핵심 결과: 필수 파일 존재, README·AGENTS·Implementation Plan의 진입점과 규칙 확인
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `GOV-TEST-004` | 동일 Ticket 재생성 | 생성 전 중단, 기존 기록 보존 | `PASS` |
| `GOV-TEST-005` | 비표준 Ticket 식별자 | Parameter binding 단계에서 거부 | `PASS` |

제품 런타임 변경이 아니므로 no-consent, invalid-grant, cross-tenant, wrong-destination, invalid-mapping 보안 경로는 적용 대상이 아니다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Unit / Contract / DICOMweb Adapter | 제품 코드·계약 변경 없음 | 없음 | 해당 구현 Ticket에서 실행 |
| Orthanc A/B Integration 및 E2E | PACS 흐름 변경 없음 | 없음 | P0 E2E Ticket에서 실행 |
| 제품 Security Test | 보안 동작 변경 없음 | 없음 | 관련 보안 Ticket에서 실행 |
| CI Gate | CI 구현은 이번 범위 제외 | 기록 누락을 자동 차단하지 못함 | 후속 Automation Ticket 검토 |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| 구현 보고 | `docs/implementation/MEDIQ-GOV-001/IMPLEMENTATION-REPORT.md` | PHI·Secret 없음 |
| 시험 증거 | 본 문서 | PHI·Secret 없음 |
| Scaffold | `scripts/new-implementation-record.ps1` | Credential 처리 없음 |
| Scaffold test harness | `scripts/test-new-implementation-record.ps1` | 임시 합성 Ticket만 사용 |

## 7. 결론

- 결과: `PASS`
- PASS 범위: Repository Governance, 문서 템플릿, scaffold의 명시된 기능
- 제품 기능 또는 P0 E2E PASS를 의미하지 않는다.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM은 사용하거나 기록하지 않았다.
