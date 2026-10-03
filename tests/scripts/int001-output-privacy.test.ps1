$ErrorActionPreference = "Stop"
$wrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../scripts/test-int001-source-capture.ps1"))
$tokens = $null
$parseErrors = $null
$syntax = [System.Management.Automation.Language.Parser]::ParseFile($wrapperPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "OUTPUT_PRIVACY_WRAPPER_SYNTAX_INVALID" }
$names = @('Assert-CaptureOutputPrivacy', 'Assert-ObserverLogPrivacy', 'Invoke-Compose')
$functions = @($syntax.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names
}, $true))
if ($functions.Count -ne 3) { throw "OUTPUT_PRIVACY_FUNCTIONS_MISSING" }
# Load actual functions only. Never execute Compose/DDL/environment wrapper body.
foreach ($function in $functions) { . ([scriptblock]::Create($function.Extent.Text)) }
$script:cases = 0
function Check([bool]$Condition) {
    if (-not $Condition) { throw "OUTPUT_PRIVACY_ASSERTION_FAILED" }
}
function Expect-Error([scriptblock]$Work, [string]$Message) {
    $caught = $null
    try { $null = & $Work } catch { $caught = $_.Exception.Message }
    Check ($caught -ceq $Message)
    $script:cases++
}
Check (@(Assert-CaptureOutputPrivacy -Output "TAP version 13`n# pass 51`n# fail 0" -SensitiveValues @('TEST-ONLY-SECRET')).Count -eq 0)
$script:cases++
foreach ($value in @('TEST-PATIENT-007', '2.25.987654321', 'x+?', 'TEST-CREDENTIAL', ('a' * 64))) {
    foreach ($encoded in @($value, [uri]::EscapeDataString($value), [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)))) {
        Expect-Error { Assert-CaptureOutputPrivacy -Output "unexpected: $encoded" -SensitiveValues @($value) } 'INT001_OUTPUT_PRIVACY_REJECTED'
    }
}
Expect-Error { Assert-CaptureOutputPrivacy -Output '' -SensitiveValues @('') } 'INT001_OUTPUT_PRIVACY_CONFIGURATION_INVALID'
foreach ($marker in @('-----BEGIN PRIVATE KEY-----', ('eyJ' + ('a' * 16) + '.' + ('b' * 16) + '.' + ('c' * 16)),
    '/tmp/mediq-owned/ciphertext/object', 'C:\Temp\mediq-owned\object', 'bb000000-0000-4000-8000-000000000001.enc',
    '{"dek":"TEST-only"}', 'kek=TEST-only', 'plaintext:TEST-only', 'DICM', '{"PixelData":"TEST-only"}')) {
    Expect-Error { Assert-CaptureOutputPrivacy -Output $marker -SensitiveValues @() } 'INT001_OUTPUT_PRIVACY_REJECTED'
}
Expect-Error { Assert-CaptureOutputPrivacy -Output ('x' * (8MB + 1)) -SensitiveValues @() } 'INT001_OUTPUT_PRIVACY_REJECTED'
Expect-Error { Assert-CaptureOutputPrivacy -Output ('한' * 3MB) -SensitiveValues @() } 'INT001_OUTPUT_PRIVACY_REJECTED'

$script:dockerCalls = @()
$script:dockerOutput = @()
$script:dockerExit = 0
$script:logsExit = 0
$script:owner = 'mediq-int001-capture-123456abcdef'
function docker {
    $script:dockerCalls += ,@($args)
    $global:LASTEXITCODE = $script:dockerExit
    if ($args[0] -eq 'inspect') { Write-Output $script:owner }
    else {
        if ($args[0] -eq 'logs') { $global:LASTEXITCODE = $script:logsExit }
        $script:dockerOutput | Write-Output
    }
}
$script:dockerOutput = @('TAP version 13', '# pass 51', '# fail 0')
$returned = Invoke-Compose @('compose', 'run', 'TEST-service') 'INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED' @('TEST-ONLY-SECRET')
Check (($returned -join '|') -ceq ($script:dockerOutput -join '|'))
Check (($script:dockerCalls[-1] -join '|') -ceq 'compose|run|TEST-service')
$script:cases++
foreach ($nativeExit in @(0, 1)) {
    $script:dockerExit = $nativeExit
    $script:dockerOutput = @('TEST-ONLY-SECRET')
    Expect-Error { Invoke-Compose @('compose', 'run', 'TEST-service') 'INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED' @('TEST-ONLY-SECRET') } 'INT001_OUTPUT_PRIVACY_REJECTED'
}
$script:dockerExit = 1
$script:dockerOutput = @('not ok 1 - TEST-ARBITRARY-UNTRUSTED-NAME', 'location: /workspace/tests/integration/authorized-source-capture.orthanc.integration.test.mjs:123:4', 'DEC017_PRIVACY_SNAPSHOT_AUDIT')
$projected = $null
try { $null = Invoke-Compose @('compose', 'run', 'TEST-service') 'INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED' @('TEST-ONLY-SECRET') }
catch { $projected = $_.Exception.Message }
Check ($projected -like '*failed_test_count=1*' -and $projected -like '*DEC017_PRIVACY_SNAPSHOT_AUDIT*' -and
    $projected -like '*test.mjs:123:4*' -and -not $projected.Contains('TEST-ARBITRARY') -and -not $projected.Contains('/workspace'))
$script:cases++
$script:dockerOutput = @('TEST-ARBITRARY-UNTRUSTED-ERROR')
Expect-Error { Invoke-Compose @('compose', 'run', 'TEST-service') 'INT001_DATABASE_OBSERVER_FAILED' @('TEST-ONLY-SECRET') } 'INT001_DATABASE_OBSERVER_FAILED (exit=1, safe_error=UNCLASSIFIED); raw output suppressed.'

$script:dockerOutput = @('not ok 1 - TEST-ARBITRARY-UNTRUSTED-NAME', 'DEC017_ERROR_SOURCE_CAPTURE_UNAVAILABLE',
    'DEC017_ORIGIN_LINE_123', 'DEC017_PRIVACY_PROBE_RESERVED_DEC017_PRIVACY_CATALOG') + @(1..20 | ForEach-Object { "DEC017_CASE_SYNTHETIC_$_" })
$projected = $null
try { $null = Invoke-Compose @('compose', 'run', 'TEST-service') 'INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED' @('TEST-ONLY-SECRET') }
catch { $projected = $_.Exception.Message }
Check ($projected -like '*DEC017_ERROR_SOURCE_CAPTURE_UNAVAILABLE*' -and $projected -like '*DEC017_PRIVACY_PROBE_RESERVED_DEC017_PRIVACY_CATALOG*' -and
    $projected -like '*DEC017_ORIGIN_LINE_123*' -and -not $projected.Contains('TEST-ARBITRARY'))
Check ([regex]::Matches($projected, 'DEC017_CASE_').Count -eq 4)
$script:cases++

$script:dockerExit = 0
$script:dockerCalls = @()
$script:dockerOutput = @('INT001_PRIVACY_OBSERVER_READY')
$project = $script:owner
$name = "${project}-privacy-observer"
Assert-ObserverLogPrivacy -Name $name -ProjectName $project -SensitiveValues @('TEST-ONLY-SECRET')
Check ($script:dockerCalls.Count -eq 2 -and $script:dockerCalls[0][0] -eq 'inspect' -and $script:dockerCalls[1][0] -eq 'logs')
$script:cases++
$script:dockerCalls = @()
Expect-Error { Assert-ObserverLogPrivacy -Name 'unowned' -ProjectName $project -SensitiveValues @() } 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'
Check ($script:dockerCalls.Count -eq 0)
$script:owner = 'other-project'
Expect-Error { Assert-ObserverLogPrivacy -Name $name -ProjectName $project -SensitiveValues @() } 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'
Check ($script:dockerCalls.Count -eq 1)
$script:owner = $project
$script:dockerOutput = @('TEST-ONLY-SECRET')
Expect-Error { Assert-ObserverLogPrivacy -Name $name -ProjectName $project -SensitiveValues @('TEST-ONLY-SECRET') } 'INT001_OUTPUT_PRIVACY_REJECTED'
$script:logsExit = 1
Expect-Error { Assert-ObserverLogPrivacy -Name $name -ProjectName $project -SensitiveValues @('TEST-ONLY-SECRET') } 'INT001_PRIVACY_OBSERVER_LOG_INSPECTION_FAILED'
$script:logsExit = 0
$script:dockerExit = 1
$script:dockerCalls = @()
Expect-Error { Assert-ObserverLogPrivacy -Name $name -ProjectName $project -SensitiveValues @() } 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'
Check ($script:dockerCalls.Count -eq 1)
$global:LASTEXITCODE = 0
Write-Output "int001_output_privacy_unit=PASS cases=$script:cases no_network=true fake_docker=true actual_wrapper_functions=true"
