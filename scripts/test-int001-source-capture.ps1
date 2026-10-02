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

function Invoke-Compose([string[]]$ComposeArgs, [string]$FailureCode) {
    $output = @(& docker @ComposeArgs 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $joined = [string]::Join("`n", [string[]]$output)
        $fixtureFailure = [regex]::Match($joined, '\b(INT001_FIXTURE_SEED_FAILED):([0-9A-Z]{5}):([a-zA-Z0-9_]{1,128})\b')
        $safeCode = if ($fixtureFailure.Success) { "$($fixtureFailure.Groups[1].Value):$($fixtureFailure.Groups[2].Value):$($fixtureFailure.Groups[3].Value)" }
            else { [regex]::Match($joined, '\b(INT001_[A-Z0-9_]+|MEDIQ_[A-Z0-9_]+|APP_CONFIG_[A-Z0-9_:]+|DICOM_[A-Z0-9_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23503|23505|23514|ASSERTION_FAILED)\b').Value }
        if (-not $safeCode) { $safeCode = "UNCLASSIFIED" }
        $failedTestNames = @()
        if ($FailureCode -eq "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED") {
            $failedTestNames = @(
                [regex]::Matches($joined, '(?m)^\s*not ok \d+ - ([^\r\n]{1,160})$') |
                    ForEach-Object { $_.Groups[1].Value }
            )
            $failedTestLocations = @(
                [regex]::Matches($joined, '(?m)^\s*location:\s*.*authorized-source-capture\.orthanc\.integration\.test\.mjs:(\d+):(\d+)') |
                    ForEach-Object { "authorized-source-capture.orthanc.integration.test.mjs:$($_.Groups[1].Value):$($_.Groups[2].Value)" } |
                    Sort-Object -Unique
            )
            $failedAssertionMarkers = @(
                [regex]::Matches($joined, '\bCAP005_[A-Z0-9_]{1,160}\b') |
                    ForEach-Object { $_.Value } |
                    Sort-Object -Unique
            )
            if ($failedTestNames.Count -gt 0) { $safeCode = "NODE_TEST_FAILURE" }
        }
        $safeTestSummary = if ($failedTestNames.Count -gt 0) { "; failed_tests=$($failedTestNames -join ',')" } else { "" }
        $safeLocationSummary = if ($failedTestLocations.Count -gt 0) { "; test_locations=$($failedTestLocations -join ',')" } else { "" }
        $safeAssertionSummary = if ($failedAssertionMarkers.Count -gt 0) { "; cap005_checks=$($failedAssertionMarkers -join ',')" } else { "" }
        throw "$FailureCode (exit=$exitCode, safe_error=$safeCode$safeTestSummary$safeLocationSummary$safeAssertionSummary); raw output suppressed."
    }
    return ,$output
}

function Invoke-ScratchPsql([string]$Network, [string]$User, [string]$Database, [string]$Password, [string]$Sql) {
    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    try {
        $env:PGPASSWORD = $Password
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -h postgres -U $User -d $Database -f - 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $joined = [string]::Join("`n", [string[]]$output)
            $sqlState = [regex]::Match($joined, '\b[0-9A-Z]{5}\b').Value
            throw "INT001_TEMPORARY_DATABASE_BOOTSTRAP_FAILED (exit=$exitCode, sqlstate=$sqlState); database output suppressed."
        }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
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

try {
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "config", "--quiet")) "INT001_COMPOSE_VALIDATION_FAILED"
    $null = Invoke-Compose ($composeBase + @("up", "--detach", "--wait", "postgres", "orthanc-a", "orthanc-b")) "INT001_TEMPORARY_SERVICES_START_FAILED"

    $networkName = "${projectName}_database"
    $networkOwner = (& docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' $networkName | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $networkOwner -ne $projectName) { throw "INT001_DATABASE_NETWORK_OWNERSHIP_INVALID" }

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
    $testOutput = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "api-source-capture-test")) "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_FAILED"
    $testText = [string]::Join("`n", [string[]]$testOutput)
    $testPass = [regex]::Match($testText, '(?m)^# pass (\d+)$').Groups[1].Value
    $testFail = [regex]::Match($testText, '(?m)^# fail (\d+)$').Groups[1].Value
    if ($testPass -ne "35" -or $testFail -ne "0") {
        throw "INT001_AUTHORIZED_CAPTURE_ACCEPTANCE_SUMMARY_INVALID:pass=${testPass}:fail=${testFail}"
    }
    Write-Output "authorized_capture_test=PASS tests=$testPass failed=$testFail"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-db-observer")) "INT001_DATABASE_OBSERVER_FAILED"
    Write-Output "audit_and_evidence_observer=PASS"
    $null = Invoke-Compose ($composeBase + @("--profile", "source-capture-test", "run", "--build", "--rm", "--no-deps", "source-capture-b-empty-probe")) "INT001_ORTHANC_B_AFTER_PROBE_FAILED"
    Write-Output "orthanc_b_after=EMPTY"
}
catch {
    $failure = $_.Exception.Message
}
finally {
    try {
        Assert-OwnedResources $projectName
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
        Write-Output "temporary_project_cleanup=PASS existing_mediq_stack=UNCHANGED"
    }
    catch {
        $cleanupFailure = $_.Exception.Message
    }
}

if ($cleanupFailure) { throw $cleanupFailure }
if ($failure) { throw $failure }
Write-Output "TC-INT-001-CAP-001/002/003/004/005/006/009/010/012/014=PASS scoped_authorized_source_capture=true"
