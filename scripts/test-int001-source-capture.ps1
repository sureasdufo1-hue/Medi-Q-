[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))
$resolvedComposeFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ComposeFile))
$postgresImage = "postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650"

function Read-LocalEnv([string]$Path) {
    $settings = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($settings.ContainsKey($key)) { throw "INT001_CONFIG_DUPLICATE_KEY" }
        $raw = $line.Substring($separator + 1).Trim()
        if ($raw.Length -ge 2 -and $raw.StartsWith('"') -and $raw.EndsWith('"')) {
            $value = ConvertFrom-Json -InputObject $raw
        }
        elseif ($raw.Length -ge 2 -and $raw.StartsWith("'") -and $raw.EndsWith("'")) {
            $value = $raw.Substring(1, $raw.Length - 2).Replace("''", "'")
        }
        else { $value = $raw }
        $settings[$key] = [string]$value
    }
    return $settings
}

function ConvertTo-SqlLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

function Is-Placeholder([string]$Value) {
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -match "(?i)(replace[-_ ]?before|change[-_ ]?me|placeholder|^todo$)"
}

function Get-ProjectResources([string]$ProjectName) {
    $containers = @(& docker ps -aq --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $containerExit = $LASTEXITCODE
    $volumes = @(& docker volume ls -q --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $volumeExit = $LASTEXITCODE
    $networks = @(& docker network ls -q --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $networkExit = $LASTEXITCODE
    if ($containerExit -ne 0 -or $volumeExit -ne 0 -or $networkExit -ne 0) {
        throw "INT001_DOCKER_RESOURCE_INVENTORY_FAILED"
    }
    return [pscustomobject]@{
        Containers = @($containers | Sort-Object)
        Volumes = @($volumes | Sort-Object)
        Networks = @($networks | Sort-Object)
    }
}

function Assert-NoProjectResources([string]$ProjectName) {
    $resources = Get-ProjectResources $ProjectName
    if ($resources.Containers.Count -or $resources.Volumes.Count -or $resources.Networks.Count) {
        throw "INT001_TEMPORARY_PROJECT_NOT_EMPTY"
    }
}

function Assert-OwnedResources([string]$ProjectName) {
    $resources = Get-ProjectResources $ProjectName
    foreach ($id in $resources.Containers) {
        $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $id | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "INT001_CONTAINER_OWNERSHIP_MISMATCH" }
    }
    foreach ($name in $resources.Volumes) {
        $owner = (& docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' $name | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "INT001_VOLUME_OWNERSHIP_MISMATCH" }
    }
    foreach ($id in $resources.Networks) {
        $owner = (& docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' $id | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "INT001_NETWORK_OWNERSHIP_MISMATCH" }
    }
}

function Invoke-DockerQuiet([string[]]$DockerArgs, [string]$FailureCode) {
    $null = @(& docker @DockerArgs 2>&1)
    if ($LASTEXITCODE -ne 0) { throw $FailureCode }
}

function Get-ObserverRemovalElapsedMilliseconds([Diagnostics.Stopwatch]$Clock) {
    return $Clock.ElapsedMilliseconds
}

function Stop-OwnedPrivacyObserver([string]$Name, [string]$ProjectName, [switch]$MutationController) {
    $suffix = if ($MutationController) { 'fixture-mutator' } else { 'privacy-observer' }
    $service = if ($MutationController) { 'source-capture-fixture-seed' } else { 'source-capture-db-observer' }
    if ($ProjectName -notmatch '^mediq-int001-capture-[0-9a-f]{12}$' -or $Name -cne "${ProjectName}-$suffix") {
        throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID"
    }
    $observerIds = @(& docker ps -aq --filter "name=$Name" | Where-Object { $_ })
    if ($LASTEXITCODE -ne 0) { throw "INT001_PRIVACY_OBSERVER_INVENTORY_FAILED" }
    if ($observerIds.Count -eq 0) { return }
    if ($observerIds.Count -ne 1 -or $observerIds[0] -notmatch '^[0-9a-f]{12,64}$') {
        throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID"
    }
    $observerId = $observerIds[0]
    $identity = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.Name}}|{{.HostConfig.AutoRemove}}' $observerId 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $identity -cne "$ProjectName|$service|/$Name|true") {
        throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID"
    }
    $null = @(& docker stop --timeout 15 $observerId 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "INT001_PRIVACY_OBSERVER_STOP_FAILED" }
    $removalClock = [Diagnostics.Stopwatch]::StartNew()
    while ((Get-ObserverRemovalElapsedMilliseconds $removalClock) -lt 30000) {
        $remaining = @(& docker ps -aq --filter "id=$observerId" | Where-Object { $_ })
        if ($LASTEXITCODE -ne 0) { throw "INT001_PRIVACY_OBSERVER_POSTSTOP_INVENTORY_FAILED" }
        if ($remaining.Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "INT001_PRIVACY_OBSERVER_AUTOREMOVE_INCOMPLETE"
}

function Assert-CaptureOutputPrivacy([string]$Output, [string[]]$SensitiveValues) {
    if ([Text.Encoding]::UTF8.GetByteCount($Output) -gt 8MB) { throw "INT001_OUTPUT_PRIVACY_REJECTED" }
    foreach ($value in $SensitiveValues) {
        if ([string]::IsNullOrEmpty($value)) { throw "INT001_OUTPUT_PRIVACY_CONFIGURATION_INVALID" }
        $variants = @($value, [uri]::EscapeDataString($value), [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)))
        foreach ($variant in $variants) {
            if ($Output.Contains($variant)) { throw "INT001_OUTPUT_PRIVACY_REJECTED" }
        }
    }
    $markers = '(?i)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|/tmp/mediq-[^\s]+|[A-Z]:\\[^\r\n]*\\(?:mediq-|ciphertext)[^\r\n]*|\b[0-9a-f-]{36}\.enc\b|\b(?:dek|kek|plaintext)["'']?\s*[:=]|\bDICM\b|["'']PixelData["'']\s*:'
    if ($Output -match $markers) { throw "INT001_OUTPUT_PRIVACY_REJECTED" }
}

function Assert-ObserverLogPrivacy([string]$Name, [string]$ProjectName, [string[]]$SensitiveValues, [switch]$MutationController) {
    $suffix = if ($MutationController) { 'fixture-mutator' } else { 'privacy-observer' }
    $service = if ($MutationController) { 'source-capture-fixture-seed' } else { 'source-capture-db-observer' }
    if ($ProjectName -notmatch '^mediq-int001-capture-[0-9a-f]{12}$' -or $Name -cne "${ProjectName}-$suffix") {
        throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID"
    }
    $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.Name}}|{{.HostConfig.AutoRemove}}' $Name 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $owner -cne "$ProjectName|$service|/$Name|true") { throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID" }
    $output = @(& docker logs $Name 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0) { throw "INT001_PRIVACY_OBSERVER_LOG_INSPECTION_FAILED" }
    Assert-CaptureOutputPrivacy -Output ([string]::Join("`n", [string[]]$output)) -SensitiveValues $SensitiveValues
}

function Invoke-Compose([string[]]$ComposeArgs, [string]$FailureCode, [string[]]$PrivacyValues) {
    $output = @(& docker @ComposeArgs 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
    $joined = [string]::Join("`n", [string[]]$output)
    if ($null -ne $PrivacyValues) { Assert-CaptureOutputPrivacy -Output $joined -SensitiveValues $PrivacyValues }
    if ($exitCode -ne 0) {
        $fixtureFailure = [regex]::Match($joined, '\b(INT001_FIXTURE_SEED_FAILED):([0-9A-Z]{5}):([a-zA-Z0-9_]{1,128})\b')
        $safeCode = if ($fixtureFailure.Success) { "$($fixtureFailure.Groups[1].Value):$($fixtureFailure.Groups[2].Value):$($fixtureFailure.Groups[3].Value)" }
            else { [regex]::Match($joined, '\b(INT001_[A-Z0-9_]+|MEDIQ_[A-Z0-9_]+|APP_CONFIG_[A-Z0-9_:]+|DICOM_[A-Z0-9_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23503|23505|23514|ASSERTION_FAILED)\b').Value }
        if (-not $safeCode) { $safeCode = "UNCLASSIFIED" }
        $failedTestNames = @()
        $failedTestLocations = @()
        $failedAssertionMarkers = @()
        $failedCaseMarkers = @()
        if ($FailureCode -eq "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED") {
            $failedTestNames = @(
                [regex]::Matches($joined, '(?m)^\s*not ok \d+ - ([^\r\n]{1,160})$') |
                    ForEach-Object { "SOURCE_CAPTURE_TEST" }
            )
            $failedTestLocations = @(
                [regex]::Matches($joined, '(?m)^\s*location:\s*.*authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):(\d+)') |
                    ForEach-Object { "authorized-source-capture.orthanc.integration.test.mjs:$($_.Groups[1].Value):$($_.Groups[2].Value)" } |
                    Sort-Object -Unique | Select-Object -First 8
            )
            $failedAssertionMarkers = @(
                [regex]::Matches($joined, '\b(?:CAP005|DEC017)_[A-Z0-9_]{1,160}\b') |
                    ForEach-Object { $_.Value } |
                    Where-Object { $_ -notmatch '^DEC017_CASE_' } |
                    Sort-Object -Unique |
                    Sort-Object @{ Expression = { if ($_ -match '^DEC017_PRIVACY_PROBE_') { 0 } elseif ($_ -match '^DEC017_ERROR_') { 1 } elseif ($_ -match '^DEC017_(QUERY_|ORIGIN_)') { 2 } else { 3 } } }, @{ Expression = { $_ } } |
                    Select-Object -First 8
            )
            $failedCaseMarkers = @([regex]::Matches($joined, '\bDEC017_CASE_[A-Z0-9_]{1,80}\b') |
                ForEach-Object { $_.Value } | Sort-Object -Unique | Select-Object -First 4)
            if ($failedTestNames.Count -gt 0) { $safeCode = "NODE_TEST_FAILURE" }
        }
        $safeTestSummary = if ($failedTestNames.Count -gt 0) { "; failed_test_count=$($failedTestNames.Count)" } else { "" }
        $safeLocationSummary = if ($failedTestLocations.Count -gt 0) { "; test_locations=$($failedTestLocations -join ',')" } else { "" }
        $safeAssertionSummary = if ($failedAssertionMarkers.Count -gt 0) { "; cap005_checks=$($failedAssertionMarkers -join ',')" } else { "" }
        $safeCaseSummary = if ($failedCaseMarkers.Count -gt 0) { "; case_context=$($failedCaseMarkers -join ',')" } else { "" }
        throw "$FailureCode (exit=$exitCode, safe_error=$safeCode$safeTestSummary$safeLocationSummary$safeAssertionSummary$safeCaseSummary); raw output suppressed."
    }
    return ,$output
}

function Invoke-ScratchPsql([string]$Network, [string]$User, [string]$Database, [string]$Password, [string]$Sql) {
    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    try {
        $env:PGPASSWORD = $Password
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD --env PGCONNECT_TIMEOUT=3 $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -h postgres -U $User -d $Database -f - 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $joined = [string]::Join("`n", [string[]]$output)
            $sqlState = [regex]::Match($joined, '\b[0-9A-Z]{5}\b').Value
            $connectionClass = switch -Regex ($joined) {
                'could not translate host|Name or service not known|Temporary failure in name resolution' { 'DNS_FAILURE'; break }
                'password authentication failed' { 'AUTHENTICATION_DENIED'; break }
                'no pg_hba.conf entry' { 'HBA_DENIED'; break }
                'database .+ does not exist' { 'DATABASE_MISSING'; break }
                'Connection refused' { 'CONNECTION_REFUSED'; break }
                'timeout expired|Connection timed out' { 'CONNECTION_TIMEOUT'; break }
                'server closed the connection unexpectedly' { 'CONNECTION_CLOSED'; break }
                default { 'UNCLASSIFIED' }
            }
            throw "INT001_TEMPORARY_DATABASE_BOOTSTRAP_FAILED (exit=$exitCode, sqlstate=$sqlState, connection_class=$connectionClass); database output suppressed."
        }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

function Wait-ScratchDatabaseTcp([string]$Network, [string]$User, [string]$Database, [string]$Password) {
    # The official image's temporary init server has no TCP listener even when
    # its local-socket healthcheck passes. Retry only this read-only probe.
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            Invoke-ScratchPsql -Network $Network -User $User -Database $Database -Password $Password -Sql "SELECT 1;"
            Write-Output "temporary_database_tcp_readiness=PASS attempts=$attempt"
            return
        }
        catch {
            if ($attempt -eq 30 -or $_.Exception.Message -notmatch 'connection_class=(CONNECTION_REFUSED|CONNECTION_CLOSED|CONNECTION_TIMEOUT)\)') {
                throw
            }
            Start-Sleep -Seconds 2
        }
    }
    throw "INT001_TEMPORARY_DATABASE_TCP_READINESS_FAILED"
}

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) { throw "INT001_IGNORED_ENV_FILE_REQUIRED" }
if (-not (Test-Path -LiteralPath $resolvedComposeFile -PathType Leaf)) { throw "INT001_COMPOSE_FILE_MISSING" }
foreach ($requiredPath in @(
    (Join-Path $repositoryRoot "data/synthetic-ct-env007/manifest.json"),
    (Join-Path $repositoryRoot "data/synthetic-ct-env007/instance-001.dcm"),
    (Join-Path $repositoryRoot "data/synthetic-ct-env007/instance-002.dcm"),
    (Join-Path $repositoryRoot "data/synthetic-ct-env007/instance-003.dcm"),
    (Join-Path $repositoryRoot "data/local-tls/test-ca.crt"),
    (Join-Path $repositoryRoot "data/local-tls/orthanc-a.pem"),
    (Join-Path $repositoryRoot "data/local-tls/orthanc-b.pem")
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "INT001_SYNTHETIC_OR_TEST_TLS_FIXTURE_MISSING" }
}

$relativeEnv = [IO.Path]::GetRelativePath($repositoryRoot, $resolvedEnvFile)
$ignoreCheck = @(& git -C $repositoryRoot check-ignore --quiet -- $relativeEnv 2>&1)
if ($LASTEXITCODE -ne 0) { throw "INT001_ENV_FILE_MUST_BE_GIT_IGNORED" }
$settings = Read-LocalEnv $resolvedEnvFile
foreach ($key in @(
    "MEDIQ_POSTGRES_USER", "MEDIQ_POSTGRES_PASSWORD", "MEDIQ_POSTGRES_DB",
    "MEDIQ_DB_RUNTIME_USER", "MEDIQ_DB_RUNTIME_PASSWORD",
    "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD",
    "MEDIQ_DATABASE_URL", "MEDIQ_MIGRATION_DATABASE_URL",
    "MEDIQ_RUNTIME_PROFILE", "MEDIQ_ENV", "MEDIQ_LOG_LEVEL", "MEDIQ_API_PORT",
    "ORTHANC_A_URL", "ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD",
    "ORTHANC_B_URL", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD"
)) {
    if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
        throw "INT001_REQUIRED_LOCAL_TEST_SETTING_MISSING:$key"
    }
}
if ($settings["MEDIQ_POSTGRES_DB"] -notmatch '^[a-z][a-z0-9_]{0,62}$' -or
    $settings["MEDIQ_DB_RUNTIME_USER"] -ne "mediq_runtime" -or
    $settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator" -or
    $settings["MEDIQ_RUNTIME_PROFILE"] -ne "container" -or
    $settings["MEDIQ_ENV"] -ne "development") {
    throw "INT001_LOCAL_TEST_CONFIGURATION_BOUNDARY_INVALID"
}
$secretKeys = @(
    "MEDIQ_POSTGRES_PASSWORD", "MEDIQ_DB_RUNTIME_PASSWORD", "MEDIQ_DB_MIGRATION_PASSWORD",
    "ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD"
)
foreach ($key in $secretKeys) {
    if (Is-Placeholder $settings[$key]) { throw "INT001_TEST_CREDENTIAL_PLACEHOLDER:$key" }
}
$orthancAUri = [uri]$settings["ORTHANC_A_URL"]
$orthancBUri = [uri]$settings["ORTHANC_B_URL"]
if ($orthancAUri.Scheme -ne "https" -or $orthancAUri.Host -ne "orthanc-a" -or $orthancAUri.Port -ne 8042 -or $orthancAUri.UserInfo -or $orthancAUri.Query -or $orthancAUri.Fragment -or
    $orthancBUri.Scheme -ne "https" -or $orthancBUri.Host -ne "orthanc-b" -or $orthancBUri.Port -ne 8042 -or $orthancBUri.UserInfo -or $orthancBUri.Query -or $orthancBUri.Fragment) {
    throw "INT001_TEST_ORTHANC_ENDPOINT_BOUNDARY_INVALID"
}

$projectName = "mediq-int001-capture-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
Assert-NoProjectResources $projectName
$developmentSnapshot = Get-ProjectResources "mediq"
$composeBase = @(
    "compose", "--project-name", $projectName,
    "--env-file", $resolvedEnvFile,
    "--file", $resolvedComposeFile
)
$failure = $null
$cleanupFailure = $null
$privacyLogFailure = $null
$privacyObserverOwned = $false
$mutationControllerOwned = $false
$previousObservationToken = [Environment]::GetEnvironmentVariable("MEDIQ_TEST_OBSERVATION_TOKEN", "Process")
$previousObservationUrl = [Environment]::GetEnvironmentVariable("MEDIQ_TEST_OBSERVATION_URL", "Process")
$previousMutationToken = [Environment]::GetEnvironmentVariable("MEDIQ_TEST_MUTATION_TOKEN", "Process")
$previousMutationUrl = [Environment]::GetEnvironmentVariable("MEDIQ_TEST_MUTATION_URL", "Process")
$previousMutationProject = [Environment]::GetEnvironmentVariable("MEDIQ_TEST_PROJECT", "Process")
$privacyObserverName = "${projectName}-privacy-observer"
$mutationControllerName = "${projectName}-fixture-mutator"
$observationBytes = [byte[]]::new(32)
$mutationBytes = [byte[]]::new(32)
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($observationBytes); $random.GetBytes($mutationBytes) } finally { $random.Dispose() }
$env:MEDIQ_TEST_OBSERVATION_TOKEN = [BitConverter]::ToString($observationBytes).Replace('-', '').ToLowerInvariant()
$env:MEDIQ_TEST_OBSERVATION_URL = "http://${privacyObserverName}:8791"
$env:MEDIQ_TEST_MUTATION_TOKEN = [BitConverter]::ToString($mutationBytes).Replace('-', '').ToLowerInvariant()
$env:MEDIQ_TEST_MUTATION_URL = "http://${mutationControllerName}:8792"
$env:MEDIQ_TEST_PROJECT = $projectName
$capturePrivacyValues = @()
$privacyProbeScript = @'
const response = await fetch("http://127.0.0.1:8791/" + process.argv[1], {
  headers: { "x-mediq-test-observation": process.env.MEDIQ_TEST_OBSERVATION_TOKEN }, signal: AbortSignal.timeout(3000)
});
const body = await response.json();
if (!response.ok || body.status !== (process.argv[1] === "health" ? "READY" : "PRIVACY_OBSERVER_PASS")) process.exitCode = 1;
'@
$mutationProbeScript = @'
const response = await fetch("http://127.0.0.1:8792/" + process.argv[1], {
  headers: { "x-mediq-test-mutation": process.env.MEDIQ_TEST_MUTATION_TOKEN }, signal: AbortSignal.timeout(3000)
});
const body = await response.json();
if (!response.ok || body.status !== (process.argv[1] === "health" ? "READY" : "MUTATION_CONTROLLER_PASS")) process.exitCode = 1;
'@

try {
    $manifest = Get-Content -LiteralPath (Join-Path $repositoryRoot "data/synthetic-ct-env007/manifest.json") -Raw | ConvertFrom-Json
    $capturePrivacyValues = @($manifest.patient.patientId, $manifest.studyInstanceUID, $manifest.seriesInstanceUID) +
        @($manifest.instances | ForEach-Object { $_.sopInstanceUID }) +
        @($secretKeys | Where-Object { $_ -match 'PASSWORD$' } | ForEach-Object { $settings[$_] }) +
        @($settings["MEDIQ_DATABASE_URL"], $settings["MEDIQ_MIGRATION_DATABASE_URL"], $env:MEDIQ_TEST_OBSERVATION_TOKEN,
            $env:MEDIQ_TEST_MUTATION_TOKEN, 'TEST-R6-REBOUND')
    Assert-CaptureOutputPrivacy -Output '' -SensitiveValues $capturePrivacyValues
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "config", "--quiet")) "INT001_COMPOSE_VALIDATION_FAILED"
    $null = Invoke-Compose ($composeBase + @("up", "--detach", "--wait", "postgres", "orthanc-a", "orthanc-b")) "INT001_TEMPORARY_SERVICES_START_FAILED"

    $networkName = "${projectName}_database"
    $networkOwner = (& docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' $networkName | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $networkOwner -ne $projectName) { throw "INT001_DATABASE_NETWORK_OWNERSHIP_INVALID" }

    Wait-ScratchDatabaseTcp -Network $networkName -User $settings["MEDIQ_POSTGRES_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_POSTGRES_PASSWORD"]

    $runtimePassword = ConvertTo-SqlLiteral $settings["MEDIQ_DB_RUNTIME_PASSWORD"]
    $migrationPassword = ConvertTo-SqlLiteral $settings["MEDIQ_DB_MIGRATION_PASSWORD"]
    $database = $settings["MEDIQ_POSTGRES_DB"]
    $runtimeUser = $settings["MEDIQ_DB_RUNTIME_USER"]
    $migrationUser = $settings["MEDIQ_DB_MIGRATION_USER"]
    $roleSql = @"
BEGIN;
DO `$int001_roles`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('$runtimeUser', '$migrationUser', 'mediq_quota_owner')) THEN
    RAISE EXCEPTION 'INT001_ROLE_PREEXISTS';
  END IF;
  EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$runtimeUser', $runtimePassword);
  EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$migrationUser', $migrationPassword);
  CREATE ROLE mediq_quota_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END
`$int001_roles`$;
REVOKE CONNECT ON DATABASE "$database" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$database" TO "$runtimeUser", "$migrationUser";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "$runtimeUser";
GRANT USAGE, CREATE ON SCHEMA public TO "$migrationUser";
GRANT USAGE, CREATE ON SCHEMA public TO mediq_quota_owner;
GRANT mediq_quota_owner TO "$migrationUser";
COMMIT;
"@
    Invoke-ScratchPsql -Network $networkName -User $settings["MEDIQ_POSTGRES_USER"] -Database $database -Password $settings["MEDIQ_POSTGRES_PASSWORD"] -Sql $roleSql

    $null = Invoke-Compose ($composeBase + @("--profile", "migration", "run", "--build", "--rm", "--no-deps", "migrator")) "INT001_TEMPORARY_DATABASE_MIGRATION_FAILED"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-b-empty-probe")) "INT001_ORTHANC_B_BEFORE_PROBE_FAILED"
    Write-Output "orthanc_b_before=EMPTY"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-fixture-seed")) "INT001_DATABASE_FIXTURE_SEED_FAILED"
    Write-Output "database_fixture=PASS synthetic_only=true"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-orthanc-a-seed")) "INT001_ORTHANC_A_FIXTURE_SEED_FAILED"
    Write-Output "orthanc_a_fixture=PASS synthetic_instances=3"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--detach", "--rm", "--no-deps",
        "--name", $privacyObserverName, "--env", "MEDIQ_TEST_OBSERVATION_TOKEN", "source-capture-db-observer",
        "node", "scripts/verify-int001-source-capture.mjs", "--serve-privacy")) "INT001_PRIVACY_OBSERVER_START_FAILED"
    $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $privacyObserverName | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $owner -ne $projectName) { throw "INT001_PRIVACY_OBSERVER_OWNER_INVALID" }
    $privacyObserverOwned = $true
    $privacyReady = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $null = @(& docker exec $privacyObserverName node --input-type=module -e $privacyProbeScript health 2>&1)
        if ($LASTEXITCODE -eq 0) { $privacyReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $privacyReady) { throw "INT001_PRIVACY_OBSERVER_NOT_READY" }
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--detach", "--rm", "--no-deps",
        "--name", $mutationControllerName, "--env", "MEDIQ_TEST_MUTATION_TOKEN", "--env", "MEDIQ_TEST_PROJECT", "source-capture-fixture-seed",
        "node", "scripts/int001-fixture-mutation-controller.mjs")) "INT001_MUTATION_CONTROLLER_START_FAILED"
    $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $mutationControllerName | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $owner -ne $projectName) { throw "INT001_MUTATION_CONTROLLER_OWNER_INVALID" }
    $mutationControllerOwned = $true
    $mutationReady = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $null = @(& docker exec $mutationControllerName node --input-type=module -e $mutationProbeScript health 2>&1)
        if ($LASTEXITCODE -eq 0) { $mutationReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $mutationReady) { throw "INT001_MUTATION_CONTROLLER_NOT_READY" }
    $testOutput = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_TEST_OBSERVATION_TOKEN", "--env", "MEDIQ_TEST_OBSERVATION_URL",
        "--env", "MEDIQ_TEST_MUTATION_TOKEN", "--env", "MEDIQ_TEST_MUTATION_URL", "api-source-capture-test")) "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED" $capturePrivacyValues
    $testText = [string]::Join("`n", [string[]]$testOutput)
    $testPass = [regex]::Match($testText, '(?m)^# pass (\d+)$').Groups[1].Value
    $testFail = [regex]::Match($testText, '(?m)^# fail (\d+)$').Groups[1].Value
    if ($testPass -ne "58" -or $testFail -ne "0") {
        throw "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_SUMMARY_INVALID:pass=${testPass}:fail=${testFail}"
    }
    Write-Output "authorized_capture_test=PASS tests=$testPass failed=$testFail"
    Write-Output "source_test_output_privacy=PASS known_values_and_markers_only=true"
    Invoke-DockerQuiet -DockerArgs @("exec", $privacyObserverName, "node", "--input-type=module", "-e", $privacyProbeScript, "summary") -FailureCode "INT001_PRIVACY_OBSERVER_INCOMPLETE"
    Write-Output "live_privacy_observer=PASS read_only=true runtime_privileges_unchanged=true"
    Invoke-DockerQuiet -DockerArgs @("exec", $mutationControllerName, "node", "--input-type=module", "-e", $mutationProbeScript, "summary") -FailureCode "INT001_MUTATION_CONTROLLER_INCOMPLETE"
    Write-Output "fixture_mutation_controller=PASS restored_cases=6 test_only=true"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-db-observer")) "INT001_DATABASE_OBSERVER_FAILED" $capturePrivacyValues
    Write-Output "audit_and_evidence_observer=PASS"
    Write-Output "final_observer_output_privacy=PASS known_values_and_markers_only=true"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-b-empty-probe")) "INT001_ORTHANC_B_AFTER_PROBE_FAILED"
    Write-Output "orthanc_b_after=EMPTY"
}
catch {
    $failure = $_.Exception.Message
}
finally {
    if ($privacyObserverOwned) {
        try {
            Assert-ObserverLogPrivacy -Name $privacyObserverName -ProjectName $projectName -SensitiveValues $capturePrivacyValues
            Write-Output "live_observer_output_privacy=PASS known_values_and_markers_only=true"
        }
        catch {
            $privacyLogFailure = if ($_.Exception.Message -ceq "INT001_OUTPUT_PRIVACY_REJECTED") {
                "INT001_OUTPUT_PRIVACY_REJECTED"
            } else { "INT001_OBSERVER_OUTPUT_PRIVACY_UNVERIFIED" }
        }
    }
    if ($mutationControllerOwned) {
        try {
            Assert-ObserverLogPrivacy -Name $mutationControllerName -ProjectName $projectName -SensitiveValues $capturePrivacyValues -MutationController
            Write-Output "mutation_controller_output_privacy=PASS known_values_and_markers_only=true"
        }
        catch {
            $privacyLogFailure = if ($_.Exception.Message -ceq "INT001_OUTPUT_PRIVACY_REJECTED" -or $privacyLogFailure -ceq "INT001_OUTPUT_PRIVACY_REJECTED") {
                "INT001_OUTPUT_PRIVACY_REJECTED"
            } else { "INT001_OBSERVER_OUTPUT_PRIVACY_UNVERIFIED" }
        }
    }
    [Environment]::SetEnvironmentVariable("MEDIQ_TEST_OBSERVATION_TOKEN", $previousObservationToken, "Process")
    [Environment]::SetEnvironmentVariable("MEDIQ_TEST_OBSERVATION_URL", $previousObservationUrl, "Process")
    [Array]::Clear($observationBytes, 0, $observationBytes.Length)
    [Environment]::SetEnvironmentVariable("MEDIQ_TEST_MUTATION_TOKEN", $previousMutationToken, "Process")
    [Environment]::SetEnvironmentVariable("MEDIQ_TEST_MUTATION_URL", $previousMutationUrl, "Process")
    [Environment]::SetEnvironmentVariable("MEDIQ_TEST_PROJECT", $previousMutationProject, "Process")
    [Array]::Clear($mutationBytes, 0, $mutationBytes.Length)
    try {
        Assert-OwnedResources $projectName
        $observerStopFailure = $null
        foreach ($auxiliary in @(
            @{ Owned = $privacyObserverOwned; Name = $privacyObserverName; Mutation = $false },
            @{ Owned = $mutationControllerOwned; Name = $mutationControllerName; Mutation = $true }
        )) {
            try {
                if ($auxiliary.Owned) { Stop-OwnedPrivacyObserver -Name $auxiliary.Name -ProjectName $projectName -MutationController:$auxiliary.Mutation }
            }
            catch {
                if ($_.Exception.Message -notin @('INT001_PRIVACY_OBSERVER_STOP_FAILED', 'INT001_PRIVACY_OBSERVER_AUTOREMOVE_INCOMPLETE', 'INT001_PRIVACY_OBSERVER_POSTSTOP_INVENTORY_FAILED')) { throw }
                # Identity was verified. Attempt both owned stops and Compose down;
                # retain failure even when final inventory is empty.
                if (-not $observerStopFailure) { $observerStopFailure = $_.Exception.Message }
            }
        }
        $remaining = Get-ProjectResources $projectName
        if ($remaining.Containers.Count -or $remaining.Volumes.Count -or $remaining.Networks.Count) {
            Invoke-DockerQuiet -DockerArgs ($composeBase + @("down", "--volumes", "--remove-orphans", "--timeout", "15")) -FailureCode "INT001_TEMPORARY_PROJECT_CLEANUP_FAILED"
        }
        Assert-NoProjectResources $projectName
        $afterDevelopmentSnapshot = Get-ProjectResources "mediq"
        if ((Compare-Object $developmentSnapshot.Containers $afterDevelopmentSnapshot.Containers) -or
            (Compare-Object $developmentSnapshot.Volumes $afterDevelopmentSnapshot.Volumes) -or
            (Compare-Object $developmentSnapshot.Networks $afterDevelopmentSnapshot.Networks)) {
            throw "INT001_EXISTING_DEVELOPMENT_STACK_CHANGED"
        }
        if ($observerStopFailure) { throw $observerStopFailure }
        Write-Output "temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED"
    }
    catch {
        $cleanupFailure = $_.Exception.Message
    }
}

if ($cleanupFailure) { throw $cleanupFailure }
if ($privacyLogFailure) { throw $privacyLogFailure }
if ($failure) { throw $failure }
Write-Output "TC-INT-001-CAP-001/002/003/004/005/006/009/010/012/014=PASS scoped_authorized_source_capture=true"
