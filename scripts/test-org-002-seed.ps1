[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$seedScript = Join-Path $PSScriptRoot "seed-org-002-hospital-registry.ps1"
if (-not (Test-Path -LiteralPath $seedScript -PathType Leaf)) {
    throw "ORG-002 Hospital seed script was not found."
}

$seedSource = Get-Content -LiteralPath $seedScript -Raw
$insertTargets = @([regex]::Matches($seedSource, '(?im)^\s*INSERT\s+INTO\s+public\.([a-z_]+)') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() })
if ($insertTargets.Count -ne 1 -or $insertTargets[0] -ne "hospitals") {
    throw "ORG-002 seed must write only to the hospitals registry table."
}
if ($seedSource -match '(?im)^\s*(UPDATE\s+public\.|DELETE\s+FROM\s+public\.)|Invoke-WebRequest|Invoke-RestMethod|HttpClient|\bfetch\s*\(') {
    throw "ORG-002 seed must not overwrite/delete registry data or call external services."
}

$firstRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($firstRun -join [Environment]::NewLine) -notmatch "org002_hospital_seed=PASS hospitals=3 mode=insert-only") {
    throw "ORG-002 first seed run did not report the expected synthetic Hospital fixtures."
}

$secondRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($secondRun -join [Environment]::NewLine) -notmatch "org002_hospital_seed=PASS hospitals=3 mode=insert-only") {
    throw "ORG-002 repeat seed run did not remain idempotent."
}

$metadataConflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeConflictForTest -Confirm:$false)
if (($metadataConflictRun -join [Environment]::NewLine) -notmatch "org002_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-002 Hospital metadata conflict probe did not fail closed."
}

$ownerPairConflictRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -ProbeOwnerPairConflictForTest -Confirm:$false)
if (($ownerPairConflictRun -join [Environment]::NewLine) -notmatch "org002_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true") {
    throw "ORG-002 Hospital owner-pair conflict probe did not fail closed."
}

$postProbeRun = @(& $seedScript -EnvFile $EnvFile -ComposeFile $ComposeFile -Confirm:$false)
if (($postProbeRun -join [Environment]::NewLine) -notmatch "org002_hospital_seed=PASS hospitals=3 mode=insert-only") {
    throw "ORG-002 conflict probes altered the canonical synthetic Hospital rows."
}

Write-Output "org002_hospital_seed_tests=PASS seed_invocation=PASS repeat_invocation=PASS metadata_conflict=PASS owner_pair_conflict=PASS post_probe_state=PASS scope=PASS"
