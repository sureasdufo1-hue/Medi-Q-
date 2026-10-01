[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$seedScript = Join-Path $PSScriptRoot "seed-org-003-dicomweb-endpoints.ps1"
if (-not (Test-Path -LiteralPath $seedScript -PathType Leaf)) {
    throw "ORG-003 endpoint seed script was not found."
}

$seedSource = Get-Content -LiteralPath $seedScript -Raw
$insertTargets = @([regex]::Matches($seedSource, '(?im)^\s*INSERT\s+INTO\s+public\.([a-z_]+)') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() })
if ($insertTargets.Count -ne 1 -or $insertTargets[0] -ne "hospital_endpoints") {
    throw "ORG-003 seed must write only to the hospital_endpoints registry table."
}
if ($seedSource -match '(?im)^\s*(UPDATE\s+public\.|DELETE\s+FROM\s+public\.)|Invoke-WebRequest|Invoke-RestMethod|HttpClient|\bfetch\s*\(') {
    throw "ORG-003 seed must not overwrite/delete registry data or call external services."
}

$firstRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($firstRun -join [Environment]::NewLine) -notmatch "org003_endpoint_seed=PASS endpoints=4 qido_enabled=2 unverified_disabled=2 mode=insert-only") {
    throw "ORG-003 first seed run did not report the expected role-aligned endpoint set."
}

$secondRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($secondRun -join [Environment]::NewLine) -notmatch "org003_endpoint_seed=PASS endpoints=4 qido_enabled=2 unverified_disabled=2 mode=insert-only") {
    throw "ORG-003 repeat seed run did not remain idempotent."
}

$urlConflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeUrlConflictForTest -Confirm:$false)
if (($urlConflictRun -join [Environment]::NewLine) -notmatch "org003_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-003 endpoint URL conflict probe did not fail closed."
}

$enabledConflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeEnabledConflictForTest -Confirm:$false)
if (($enabledConflictRun -join [Environment]::NewLine) -notmatch "org003_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-003 enabled-state conflict probe did not fail closed."
}

$invalidUrlRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeInvalidUrlsForTest -Confirm:$false)
if (($invalidUrlRun -join [Environment]::NewLine) -notmatch "org003_invalid_url_probes=PASS cases=7") {
    throw "ORG-003 invalid URL shapes were not all rejected."
}

$postProbeRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($postProbeRun -join [Environment]::NewLine) -notmatch "org003_endpoint_seed=PASS endpoints=4 qido_enabled=2 unverified_disabled=2 mode=insert-only") {
    throw "ORG-003 conflict probes altered the canonical synthetic endpoint rows."
}

Write-Output "org003_endpoint_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS url_conflict=PASS enabled_conflict=PASS invalid_url=PASS post_probe_state=PASS scope=PASS"
