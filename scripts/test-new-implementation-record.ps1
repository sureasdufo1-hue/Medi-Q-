[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$pwshExecutable = Join-Path $PSHOME 'pwsh.exe'
$scriptPath = Join-Path $PSScriptRoot 'new-implementation-record.ps1'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testDirectoryName = 'mediq-gov-scaffold-test-' + [guid]::NewGuid().ToString('N')
$testRoot = [IO.Path]::GetFullPath((Join-Path $temporaryParent $testDirectoryName))
$temporaryPrefix = $temporaryParent.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not $testRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Unsafe test path.'
}

if (-not ([IO.Path]::GetFileName($testRoot)).StartsWith('mediq-gov-scaffold-test-', [StringComparison]::Ordinal)) {
    throw 'Unexpected test directory name.'
}

$results = [ordered]@{}

try {
    [IO.Directory]::CreateDirectory($testRoot) | Out-Null

    $parseErrorCount = 0
    $parseTargets = @($scriptPath, $PSCommandPath)
    foreach ($parseTarget in $parseTargets) {
        $parseTokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $parseTarget,
            [ref]$parseTokens,
            [ref]$parseErrors
        ) | Out-Null
        $parseErrorCount += $parseErrors.Count
        if ($parseErrors.Count -ne 0) {
            throw ($parseErrors | Out-String)
        }
    }
    $results.ParsedScriptCount = $parseTargets.Count
    $results.ParserErrors = $parseErrorCount

    $whatIfOutput = & $pwshExecutable -NoLogo -NoProfile -File $scriptPath `
        -Ticket MEDIQ-TST-000 `
        -Title 'WhatIf verification' `
        -Classification CAPSTONE-P0 `
        -OutputRoot $testRoot `
        -WhatIf 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "WhatIf failed: $whatIfOutput"
    }
    $whatIfTarget = Join-Path $testRoot 'MEDIQ-TST-000'
    if (Test-Path -LiteralPath $whatIfTarget) {
        throw 'WhatIf created files.'
    }
    $results.WhatIfExit = 0
    $results.WhatIfCreatedFiles = $false

    $createOutput = & $pwshExecutable -NoLogo -NoProfile -File $scriptPath `
        -Ticket MEDIQ-TST-001 `
        -Title 'Scaffold verification' `
        -Classification CAPSTONE-P0 `
        -OutputRoot $testRoot 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Create failed: $createOutput"
    }

    $generatedRoot = Join-Path $testRoot 'MEDIQ-TST-001'
    $generatedFiles = @(Get-ChildItem -LiteralPath $generatedRoot -File)
    if ($generatedFiles.Count -ne 2) {
        throw "Expected two generated files, got $($generatedFiles.Count)."
    }
    $unexpanded = @(Select-String -LiteralPath $generatedFiles.FullName -Pattern '\{\{[^}]+\}\}')
    if ($unexpanded.Count -ne 0) {
        throw 'Unexpanded template token found.'
    }
    $results.CreateExit = 0
    $results.GeneratedFileCount = $generatedFiles.Count
    $results.UnexpandedTokenCount = $unexpanded.Count

    $duplicateOutput = & $pwshExecutable -NoLogo -NoProfile -File $scriptPath `
        -Ticket MEDIQ-TST-001 `
        -Title 'Duplicate verification' `
        -Classification CAPSTONE-P0 `
        -OutputRoot $testRoot 2>&1
    $duplicateExit = $LASTEXITCODE
    if ($duplicateExit -eq 0) {
        throw 'Duplicate ticket should fail.'
    }
    if (-not (($duplicateOutput | Out-String) -match 'already exists')) {
        throw 'Duplicate failure message was unexpected.'
    }
    $results.DuplicateExit = $duplicateExit

    $invalidOutput = & $pwshExecutable -NoLogo -NoProfile -File $scriptPath `
        -Ticket BAD-1 `
        -Title 'Invalid ticket verification' `
        -Classification CAPSTONE-P0 `
        -OutputRoot $testRoot 2>&1
    $invalidExit = $LASTEXITCODE
    if ($invalidExit -eq 0) {
        throw 'Invalid ticket should fail.'
    }
    $results.InvalidTicketExit = $invalidExit

    $requiredFiles = @(
        'docs\implementation\README.md',
        'docs\implementation\_templates\IMPLEMENTATION-REPORT.md',
        'docs\implementation\_templates\TEST-EVIDENCE.md',
        'docs\implementation\MEDIQ-GOV-001\IMPLEMENTATION-REPORT.md',
        'docs\implementation\MEDIQ-GOV-001\TEST-EVIDENCE.md',
        'scripts\new-implementation-record.ps1',
        'scripts\test-new-implementation-record.ps1'
    ) | ForEach-Object { Join-Path $repositoryRoot $_ }
    $missingFiles = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
    if ($missingFiles.Count -ne 0) {
        throw "Missing required files: $($missingFiles -join ', ')"
    }
    $results.RequiredFilesMissing = $missingFiles.Count

    $governanceChecks = @(
        @{ Path = 'AGENTS.md'; Pattern = '구현과 문서화의 단일 작업 규칙' },
        @{ Path = 'README.md'; Pattern = 'docs/implementation/README.md' },
        @{ Path = 'docs\IMPLEMENTATION-PLAN.md'; Pattern = 'v1.3 Integrated Implementation Documentation Gate' },
        @{ Path = 'docs\IMPLEMENTATION-PLAN.md'; Pattern = 'docs/implementation/<TICKET>/TEST-EVIDENCE.md' }
    )
    foreach ($check in $governanceChecks) {
        $checkPath = Join-Path $repositoryRoot $check.Path
        if (-not (Select-String -LiteralPath $checkPath -SimpleMatch $check.Pattern -Quiet)) {
            throw "Required governance text was not found: $($check.Path) -> $($check.Pattern)"
        }
    }
    $results.GovernanceChecks = $governanceChecks.Count

    $recordFiles = @(
        Join-Path $repositoryRoot 'docs\implementation\MEDIQ-GOV-001\IMPLEMENTATION-REPORT.md'
        Join-Path $repositoryRoot 'docs\implementation\MEDIQ-GOV-001\TEST-EVIDENCE.md'
    )
    $recordTokens = @(Select-String -LiteralPath $recordFiles -Pattern '\{\{[^}]+\}\}')
    if ($recordTokens.Count -ne 0) {
        throw 'Unexpanded template token found in MEDIQ-GOV-001 records.'
    }
    $results.UnexpandedRecordTokenCount = $recordTokens.Count
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        if (-not $testRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to clean an unsafe path.'
        }
        [IO.Directory]::Delete($testRoot, $true)
    }
}

$results.TempCleaned = -not (Test-Path -LiteralPath $testRoot)
[pscustomobject]$results | ConvertTo-Json
