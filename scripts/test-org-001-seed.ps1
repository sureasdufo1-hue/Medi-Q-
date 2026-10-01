[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$seedScript = Join-Path $PSScriptRoot "seed-org-001-registry.ps1"
if (-not (Test-Path -LiteralPath $seedScript -PathType Leaf)) {
    throw "ORG-001 seed script was not found."
}

$firstRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($firstRun -join [Environment]::NewLine) -notmatch "org001_seed=PASS organizations=3 tenants=3 mode=insert-only") {
    throw "ORG-001 first seed run did not report the expected synthetic fixture."
}

$secondRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($secondRun -join [Environment]::NewLine) -notmatch "org001_seed=PASS organizations=3 tenants=3 mode=insert-only") {
    throw "ORG-001 repeat seed run did not remain idempotent."
}

$conflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeConflictForTest -Confirm:$false)
if (($conflictRun -join [Environment]::NewLine) -notmatch "org001_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-001 Organization conflict probe did not reject the drifted expected baseline."
}

$tenantConflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeTenantConflictForTest -Confirm:$false)
if (($tenantConflictRun -join [Environment]::NewLine) -notmatch "org001_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-001 Tenant relationship conflict probe did not fail closed."
}

$postProbeRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($postProbeRun -join [Environment]::NewLine) -notmatch "org001_seed=PASS organizations=3 tenants=3 mode=insert-only") {
    throw "ORG-001 conflict probe altered the existing synthetic rows."
}

Write-Output "org001_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS organization_conflict=PASS tenant_conflict=PASS post_probe_state=PASS"
