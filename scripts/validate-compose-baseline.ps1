[CmdletBinding()]
param(
    [string]$EnvFile = ".env.example",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"

$quietArgs = @("--env-file", $EnvFile, "-f", $ComposeFile, "config", "--quiet")
& docker compose @quietArgs
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose configuration is invalid."
}

$jsonArgs = @("--env-file", $EnvFile, "-f", $ComposeFile, "config", "--format", "json")
$configJson = & docker compose @jsonArgs
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose could not normalize the configuration."
}

try {
    $config = $configJson | ConvertFrom-Json
}
catch {
    throw "Docker Compose returned invalid normalized JSON."
}

$expectedServices = @("orthanc-a", "orthanc-b", "postgres")
$actualServices = @($config.services.PSObject.Properties.Name)
$serviceDifference = @(
    Compare-Object `
        -ReferenceObject @($expectedServices | Sort-Object) `
        -DifferenceObject @($actualServices | Sort-Object)
)
if ($serviceDifference.Count -gt 0) {
    throw "Compose service set does not match the P0 baseline."
}

$expectedImages = @{
    "postgres" = "postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650"
    "orthanc-a" = "orthancteam/orthanc:26.9.1@sha256:d2705f2c56547e55ce9bc2250fd22d05d326493b3f3d9fa191ecb7db8ca6b5a2"
    "orthanc-b" = "orthancteam/orthanc:26.9.1@sha256:d2705f2c56547e55ce9bc2250fd22d05d326493b3f3d9fa191ecb7db8ca6b5a2"
}

$expectedNetworks = @{
    "postgres" = "database"
    "orthanc-a" = "hospital-a"
    "orthanc-b" = "hospital-b"
}

foreach ($serviceName in $expectedServices) {
    $service = $config.services.$serviceName
    if ($service.image -ne $expectedImages[$serviceName]) {
        throw "A service image does not match the pinned P0 baseline."
    }

    $attachedNetworks = @($service.networks.PSObject.Properties.Name)
    if ($attachedNetworks.Count -ne 1 -or $attachedNetworks[0] -ne $expectedNetworks[$serviceName]) {
        throw "A service is attached to an unexpected network."
    }

    if ($service.ports) {
        foreach ($port in @($service.ports)) {
            if ($port.host_ip -ne "127.0.0.1") {
                throw "A published port is not bound to loopback."
            }
        }
    }
}

$postgresHealthcheck = $config.services.postgres.healthcheck
$healthCommand = @($postgresHealthcheck.test)
if (
    $healthCommand.Count -ne 2 -or
    $healthCommand[0] -ne "CMD-SHELL" -or
    $healthCommand[1] -notmatch "pg_isready" -or
    $healthCommand[1] -notmatch 'POSTGRES_USER' -or
    $healthCommand[1] -notmatch 'POSTGRES_DB'
) {
    throw "PostgreSQL readiness must use pg_isready with the configured database identity."
}
if ($config.services.postgres.ports) {
    throw "PostgreSQL must remain on its internal network without a published host port."
}

foreach ($network in $config.networks.PSObject.Properties) {
    if ($network.Value.internal -ne $true) {
        throw "A P0 service network is not internal."
    }
}

$volumeSources = @()
foreach ($service in $config.services.PSObject.Properties) {
    foreach ($mount in @($service.Value.volumes)) {
        $volumeSources += $mount.source
    }
}
if ($volumeSources.Count -ne 3 -or @($volumeSources | Sort-Object -Unique).Count -ne 3) {
    throw "PostgreSQL and each Orthanc service must use a distinct persistent volume."
}

Write-Output "PASS: Compose syntax, pinned images, PostgreSQL readiness and internal-only boundary, service networks, loopback-published Orthanc ports, and isolated volumes."
