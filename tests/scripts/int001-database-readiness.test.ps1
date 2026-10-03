$ErrorActionPreference = "Stop"
$wrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../scripts/test-int001-source-capture.ps1"))
$parseTokens = $null
$parseErrors = $null
$syntax = [System.Management.Automation.Language.Parser]::ParseFile($wrapperPath, [ref]$parseTokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw "READINESS_WRAPPER_SYNTAX_INVALID" }
$functions = @($syntax.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Wait-ScratchDatabaseTcp'
}, $true))
if ($functions.Count -ne 1) { throw "READINESS_FUNCTION_MISSING_OR_AMBIGUOUS" }
# Load only this function, never the executable Compose/DDL wrapper body.
. ([scriptblock]::Create($functions[0].Extent.Text))
if (-not ([IO.File]::ReadAllText($wrapperPath)).Contains('--env PGCONNECT_TIMEOUT=3')) {
    throw "READINESS_CONNECT_BOUND_MISSING"
}

function Invoke-ScratchPsql([string]$Network, [string]$User, [string]$Database, [string]$Password, [string]$Sql) {
    $script:probeCalls++
    if ($Network -ne 'TEST-network' -or $User -ne 'TEST-user' -or $Database -ne 'TEST-db' -or
        $Password -ne 'TEST-only' -or $Sql -cne 'SELECT 1;') { throw "READINESS_PROBE_SCOPE_INVALID" }
    if ($script:failureClass -and ($script:alwaysFail -or $script:probeCalls -eq 1)) {
        throw "INT001_TEMPORARY_DATABASE_BOOTSTRAP_FAILED (exit=2, sqlstate=, connection_class=$script:failureClass); database output suppressed."
    }
}
function Start-Sleep([int]$Seconds) {
    if ($Seconds -ne 2) { throw "READINESS_INTERVAL_INVALID" }
    $script:pauseCalls++
}
function Test-ProbeCase([string]$Class, [bool]$Always, [bool]$ShouldFail, [int]$Calls, [int]$Pauses) {
    $script:failureClass = $Class
    $script:alwaysFail = $Always
    $script:probeCalls = 0
    $script:pauseCalls = 0
    $failed = $false
    try { Wait-ScratchDatabaseTcp -Network 'TEST-network' -User 'TEST-user' -Database 'TEST-db' -Password 'TEST-only' | Out-Null }
    catch { $failed = $true }
    if ($failed -ne $ShouldFail -or $script:probeCalls -ne $Calls -or $script:pauseCalls -ne $Pauses) {
        throw "READINESS_CASE_FAILED:$Class"
    }
}
Test-ProbeCase -Class '' -Always $false -ShouldFail $false -Calls 1 -Pauses 0
foreach ($failureClass in @('CONNECTION_REFUSED', 'CONNECTION_CLOSED', 'CONNECTION_TIMEOUT')) {
    Test-ProbeCase -Class $failureClass -Always $false -ShouldFail $false -Calls 2 -Pauses 1
}
foreach ($failureClass in @('AUTHENTICATION_DENIED', 'HBA_DENIED', 'DNS_FAILURE', 'DATABASE_MISSING', 'UNCLASSIFIED')) {
    Test-ProbeCase -Class $failureClass -Always $true -ShouldFail $true -Calls 1 -Pauses 0
}
Test-ProbeCase -Class 'CONNECTION_REFUSED' -Always $true -ShouldFail $true -Calls 30 -Pauses 29
Write-Output 'int001_tcp_readiness_unit=PASS cases=10 no_network=true probe_only_select=true'
