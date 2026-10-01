[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml",
    [switch]$DependenciesOnly
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
        if ($settings.ContainsKey($key)) { throw "Duplicate local environment key: $key" }
        $rawValue = $line.Substring($separator + 1).Trim()
        if ($rawValue.Length -ge 2 -and $rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) {
            $value = ConvertFrom-Json -InputObject $rawValue
        }
        elseif ($rawValue.Length -ge 2 -and $rawValue.StartsWith("'") -and $rawValue.EndsWith("'")) {
            $value = $rawValue.Substring(1, $rawValue.Length - 2).Replace("''", "'")
        }
        else { $value = $rawValue }
        $settings[$key] = [string]$value
    }
    return $settings
}

function Invoke-RuntimeDatabaseProbe([string]$Network, [string]$User, [string]$Database, [string]$Password) {
    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    try {
        $env:PGPASSWORD = $Password
        $probeOutput = @("SELECT 1;" | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -h postgres -U $User -d $Database -f - 2>&1)
        $probeExitCode = $LASTEXITCODE
        return [pscustomobject]@{ ExitCode = $probeExitCode; Output = $probeOutput }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
    throw "Local env file not found. Copy .env.example to the ignored root .env and run the local role setup first."
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The env file must be ignored by Git before credentials are read." }
    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($requiredKey in @("MEDIQ_DB_RUNTIME_USER", "MEDIQ_DB_RUNTIME_PASSWORD", "MEDIQ_POSTGRES_DB", "MEDIQ_API_PORT")) {
        if (-not $settings.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($settings[$requiredKey])) {
            throw "Required runtime database setting is missing: $requiredKey"
        }
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $services = @(& docker @composeArgs config --services)
    if ($LASTEXITCODE -ne 0) { throw "Compose service inventory failed." }
    if ("api" -notin $services -and -not $DependenciesOnly) {
        throw "No API service exists in Compose; the complete ENV-009 health gate cannot pass. Run with -DependenciesOnly only to verify existing dependencies."
    }
    foreach ($service in @("postgres", "orthanc-a", "orthanc-b")) {
        if ($service -notin $services) { throw "Required dependency service is absent: $service" }
        $containerId = (& docker @composeArgs ps -q $service | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
            throw "Required dependency container is not running: $service"
        }
        $containerHealth = (& docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' $containerId | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $containerHealth -ne "running|healthy") {
            throw "Required dependency is not healthy: $service"
        }
    }

    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    $networks = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL network inspection failed." }
    $databaseNetworks = @($networks.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one expected database network." }
    $runtimeProbe = Invoke-RuntimeDatabaseProbe -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_RUNTIME_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_RUNTIME_PASSWORD"]
    if ($runtimeProbe.ExitCode -ne 0 -or ($runtimeProbe.Output -join "").Trim() -ne "1") {
        throw "Authenticated runtime-role database readiness query failed; client output was suppressed."
    }

    & (Join-Path $PSScriptRoot "test-orthanc-a.ps1") -EnvFile $EnvFile -ComposeFile $ComposeFile
    if ($LASTEXITCODE -ne 0) { throw "Hospital A authenticated DICOMweb health probe failed." }
    & (Join-Path $PSScriptRoot "test-orthanc-b.ps1") -EnvFile $EnvFile -ComposeFile $ComposeFile
    if ($LASTEXITCODE -ne 0) { throw "Hospital B authenticated DICOMweb health probe failed." }

    if ("api" -notin $services) {
        if (-not $DependenciesOnly) {
            throw "Existing database and PACS dependencies are healthy, but no API service exists; the complete ENV-009 health gate cannot pass. Run with -DependenciesOnly only to verify existing dependencies."
        }
        Write-Output "postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=NOT_IMPLEMENTED"
        Write-Output "environment_health_status=PARTIAL (dependency-only verification)"
        return
    }

    $apiContainerId = (& docker @composeArgs ps -q api | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($apiContainerId)) { throw "API service is defined but no API container is running." }
    $apiHealth = (& docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' $apiContainerId | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $apiHealth -ne "running|healthy") { throw "API service healthcheck is absent or unhealthy." }
    if ($settings["MEDIQ_API_PORT"] -notmatch '^\d{4,5}$') { throw "Configured API port is invalid." }
    $apiPort = [int]$settings["MEDIQ_API_PORT"]
    $apiProbe = "const root='http://api:$apiPort/api/v1/health'; for (const [path,body] of [['live','alive'],['ready','ready']]) { const r=await fetch(root+'/'+path,{signal:AbortSignal.timeout(2000)}); const j=await r.json(); if(r.status!==200||r.headers.get('cache-control')!=='no-store'||j.status!==body) process.exit(1); }"
    $apiProbeOutput = @(& docker run --rm --network $databaseNetworks[0] node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 node --input-type=module -e $apiProbe 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Internal API health routes failed validation; client output was suppressed." }
    Write-Output "postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=PASS"
    Write-Output "environment_health_status=PASS"
}
finally { Pop-Location }
