[CmdletBinding()]
param(
    [string]$EnvFile = ".env.example",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"

$quietArgs = @("--env-file", $EnvFile, "-f", $ComposeFile, "--profile", "migration", "--profile", "test", "config", "--quiet")
& docker compose @quietArgs
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose configuration is invalid."
}

$jsonArgs = @("--env-file", $EnvFile, "-f", $ComposeFile, "--profile", "migration", "--profile", "test", "config", "--format", "json")
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

$expectedServices = @("api", "api-db-integration-test", "migrator", "orthanc-a", "orthanc-b", "postgres")
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
$apiDockerfilePath = Join-Path $PSScriptRoot "../services/api/Dockerfile"
if (-not (Test-Path -LiteralPath $apiDockerfilePath -PathType Leaf)) {
    throw "Reviewed local API Dockerfile is missing."
}
$apiDockerfile = Get-Content -LiteralPath $apiDockerfilePath -Raw

$expectedNetworks = @{
    "api" = @("database", "hospital-a", "hospital-b")
    "api-db-integration-test" = "database"
    "migrator" = @("database")
    "postgres" = "database"
    "orthanc-a" = "hospital-a"
    "orthanc-b" = "hospital-b"
}

foreach ($serviceName in $expectedServices) {
    $service = $config.services.$serviceName
    $attachedNetworks = @($service.networks.PSObject.Properties.Name)
    if ($serviceName -eq "api") {
        if (-not $service.build -or $service.build.dockerfile -notmatch 'services[/\\]api[/\\]Dockerfile' -or $service.build.target -ne "runtime") {
            throw "API service must build from the reviewed Dockerfile runtime target."
        }
        $networkDifference = @(Compare-Object -ReferenceObject @($expectedNetworks[$serviceName] | Sort-Object) -DifferenceObject @($attachedNetworks | Sort-Object))
        if ($networkDifference.Count -gt 0) { throw "API must bridge only the three approved internal service networks." }
        if ($service.ports -or -not $service.read_only -or $service.init -ne $true -or $service.pids_limit -ne 100) {
            throw "API must remain unpublished, read-only, init-enabled, and process-limited."
        }
        if (@($service.cap_drop) -notcontains "ALL" -or @($service.security_opt) -notcontains "no-new-privileges:true") {
            throw "API must drop all Linux capabilities and disallow privilege escalation."
        }
        $apiHealthCommand = @($service.healthcheck.test)
        if ($apiHealthCommand.Count -ne 4 -or $apiHealthCommand[0] -ne "CMD" -or $apiHealthCommand[1] -ne "node" -or $apiHealthCommand[2] -ne "-e" -or $apiHealthCommand[3] -notmatch '/api/v1/health/ready') {
            throw "API healthcheck must use the generic internal readiness endpoint."
        }
        $requiredApiEnvironment = @(
            "MEDIQ_RUNTIME_PROFILE", "MEDIQ_ENV", "MEDIQ_LOG_LEVEL", "MEDIQ_API_PORT", "MEDIQ_POSTGRES_DB", "MEDIQ_DATABASE_URL",
            "MEDIQ_OIDC_ISSUER", "MEDIQ_OIDC_AUDIENCE", "MEDIQ_OIDC_JWKS_URI",
            "ORTHANC_A_URL", "ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD", "ORTHANC_B_URL", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD", "NODE_EXTRA_CA_CERTS"
        )
        $actualApiEnvironment = @($service.environment.PSObject.Properties.Name)
        $environmentDifference = @(Compare-Object -ReferenceObject @($requiredApiEnvironment | Sort-Object) -DifferenceObject @($actualApiEnvironment | Sort-Object))
        if ($environmentDifference.Count -gt 0) { throw "API environment contains missing or non-allowlisted settings." }
        if ($service.environment.NODE_EXTRA_CA_CERTS -ne "/run/mediq/test-ca.crt") {
            throw "API must trust only the mounted local Test CA path for Test Orthanc HTTPS."
        }
        if (@($service.volumes | ForEach-Object { $_.target }) -notcontains "/run/mediq/test-ca.crt") {
            throw "API must mount the local Test CA read-only for Test Orthanc HTTPS."
        }
        $requiredDependencies = @("postgres", "orthanc-a", "orthanc-b")
        foreach ($dependency in $requiredDependencies) {
            if (-not $service.depends_on.$dependency -or $service.depends_on.$dependency.condition -ne "service_healthy") {
                throw "API must wait for every required dependency to become healthy."
            }
        }
    }
    elseif ($serviceName -eq "migrator") {
        if (-not $service.build -or $service.build.dockerfile -notmatch 'services[/\\]api[/\\]Dockerfile' -or $service.build.target -ne "migration") {
            throw "Migration service must build from the isolated migration target."
        }
        if (@($service.profiles) -notcontains "migration") {
            throw "Migration service must require explicit activation of the migration profile."
        }
        $networkDifference = @(Compare-Object -ReferenceObject @("database") -DifferenceObject @($attachedNetworks))
        if ($networkDifference.Count -gt 0) { throw "Migration service must attach only to the isolated database network." }
        if ($service.ports -or -not $service.read_only -or $service.init -ne $true -or $service.pids_limit -ne 100) {
            throw "Migration service must remain unpublished, read-only, init-enabled, and process-limited."
        }
        if (@($service.cap_drop) -notcontains "ALL" -or @($service.security_opt) -notcontains "no-new-privileges:true") {
            throw "Migration service must drop all Linux capabilities and disallow privilege escalation."
        }
        $requiredMigrationEnvironment = @("MEDIQ_RUNTIME_PROFILE", "MEDIQ_ENV", "MEDIQ_POSTGRES_DB", "MEDIQ_MIGRATION_DATABASE_URL")
        $actualMigrationEnvironment = @($service.environment.PSObject.Properties.Name)
        $migrationEnvironmentDifference = @(Compare-Object -ReferenceObject @($requiredMigrationEnvironment | Sort-Object) -DifferenceObject @($actualMigrationEnvironment | Sort-Object))
        if ($migrationEnvironmentDifference.Count -gt 0) { throw "Migration environment is not restricted to its approved configuration allowlist." }
        if ($service.environment.PSObject.Properties.Name -contains "MEDIQ_DATABASE_URL") {
            throw "Migration service must not receive the application runtime database URL."
        }
        if (-not $service.depends_on.postgres -or $service.depends_on.postgres.condition -ne "service_healthy") {
            throw "Migration service must wait for PostgreSQL health before running."
        }
        $migrationStageIndex = $apiDockerfile.IndexOf("FROM runtime AS migration", [StringComparison]::Ordinal)
        if ($migrationStageIndex -lt 0) { throw "Migration image must inherit the minimal production runtime stage." }
        $migrationStage = $apiDockerfile.Substring($migrationStageIndex)
        foreach ($requiredLine in @(
            'COPY --chown=node:node scripts/run-database-migrations\.mjs scripts/run-database-migrations\.mjs',
            'COPY --chown=node:node services/api/src/database/migrations services/api/src/database/migrations',
            'CMD \["node", "scripts/run-database-migrations\.mjs"\]'
        )) {
            if ($migrationStage -notmatch $requiredLine) {
                throw "Migration image must contain only the reviewed runner path, SQL migrations, and non-root command."
            }
        }
        if ($migrationStage -match '(?m)^USER\s+root\s*$') {
            throw "Migration image must preserve the non-root identity inherited from runtime."
        }
    }
    elseif ($serviceName -eq "api-db-integration-test") {
        if (-not $service.build -or $service.build.dockerfile -notmatch 'services[/\\]api[/\\]Dockerfile' -or $service.build.target -ne "integration-test") {
            throw "PAT integration test must use the isolated test-only Docker target."
        }
        if (@($service.profiles) -notcontains "test") {
            throw "PAT integration test must require explicit activation of the test profile."
        }
        $networkDifference = @(Compare-Object -ReferenceObject @("database") -DifferenceObject @($attachedNetworks))
        if ($networkDifference.Count -gt 0 -or $service.ports) {
            throw "PAT integration test must attach only to the internal database network and publish no ports."
        }
        if (-not $service.read_only -or $service.init -ne $true -or $service.pids_limit -ne 100 -or
            @($service.cap_drop) -notcontains "ALL" -or @($service.security_opt) -notcontains "no-new-privileges:true") {
            throw "PAT integration test must retain the constrained non-root container boundary."
        }
        $actualTestEnvironment = @($service.environment.PSObject.Properties.Name)
        $expectedTestEnvironment = @("MEDIQ_TEST_DATABASE_URL", "MEDIQ_IAM002_TEST_SUBJECT", "MEDIQ_IAM002_TEST_ACTOR_ID", "MEDIQ_IAM002_TEST_TENANT_A", "MEDIQ_IAM002_TEST_TENANT_B", "MEDIQ_IAM002_TEST_TENANT_C", "MEDIQ_IAM002_TEST_HOSPITAL_A", "MEDIQ_AUT005_TEST_FIXTURE", "MEDIQ_PAT002_TEST_FIXTURE", "MEDIQ_PACS007_TEST_FIXTURE", "MEDIQ_PACS001_FENCE_FIXTURE", "MEDIQ_EXC002_TEST_FIXTURE")
        $testEnvironmentDifference = @(Compare-Object -ReferenceObject @($expectedTestEnvironment | Sort-Object) -DifferenceObject @($actualTestEnvironment | Sort-Object))
        if ($testEnvironmentDifference.Count -gt 0) {
            throw "Integration test may receive only its runtime test URL and ephemeral synthetic fixture identifiers."
        }
        if (-not $service.depends_on.postgres -or $service.depends_on.postgres.condition -ne "service_healthy") {
            throw "PAT integration test must wait for the isolated PostgreSQL service."
        }
        $testStageIndex = $apiDockerfile.IndexOf("FROM build AS integration-test", [StringComparison]::Ordinal)
        if ($testStageIndex -lt 0) { throw "The test-only image target is missing." }
        $testStage = $apiDockerfile.Substring($testStageIndex)
        if ($testStage -notmatch 'COPY tests/database/patient-reference-runtime\.integration\.test\.mjs' -or
            $testStage -notmatch 'COPY tests/database/actor-tenant-context-runtime\.integration\.test\.mjs' -or
            $testStage -notmatch 'COPY tests/database/postgres-authorization-evidence-runtime\.integration\.test\.mjs' -or
            $testStage -notmatch 'COPY tests/database/patient-mapping-read-runtime\.integration\.test\.mjs' -or
            $testStage -notmatch 'COPY tests/database/pacs-import-authorization-fence\.integration\.test\.mjs' -or
            $testStage -notmatch 'CMD \["node", "--test", "tests/database/patient-reference-runtime\.integration\.test\.mjs", "tests/database/actor-tenant-context-runtime\.integration\.test\.mjs", "tests/database/postgres-authorization-evidence-runtime\.integration\.test\.mjs", "tests/database/patient-mapping-read-runtime\.integration\.test\.mjs"\]') {
            throw "The test-only image must contain only the approved PAT-001, IAM-002, AUT-005 and PAT-002 runtime integration tests."
        }
    }
    else {
        if ($service.image -ne $expectedImages[$serviceName]) {
            throw "A service image does not match the pinned P0 baseline."
        }
        if ($attachedNetworks.Count -ne 1 -or $attachedNetworks[0] -ne $expectedNetworks[$serviceName]) {
            throw "A service is attached to an unexpected network."
        }
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

$orthancA = $config.services.PSObject.Properties["orthanc-a"].Value
if ($orthancA.ports) {
    throw "Hospital A Orthanc must remain on its isolated service network without a host-published port."
}
$orthancAHealthCommand = @($orthancA.healthcheck.test)
if (
    $orthancAHealthCommand.Count -ne 4 -or
    $orthancAHealthCommand[0] -ne "CMD" -or
    $orthancAHealthCommand[1] -ne "python3" -or
    $orthancAHealthCommand[2] -ne "/probes/mediq-tls-healthcheck.py" -or
    $orthancAHealthCommand[3] -ne "/run/mediq/test-ca.crt"
) {
    throw "Hospital A readiness must verify TLS certificate and hostname using the local Test CA."
}
if ($orthancA.environment.ORTHANC__SSL_ENABLED -ne "true" -or $orthancA.environment.ORTHANC__SSL_CERTIFICATE -ne "/run/mediq/orthanc.pem") {
    throw "Hospital A Test Orthanc must expose HTTPS only with the mounted local server certificate."
}
if (@($orthancA.volumes | ForEach-Object { $_.target }) -notcontains "/run/mediq/test-ca.crt" -or @($orthancA.volumes | ForEach-Object { $_.target }) -notcontains "/run/mediq/orthanc.pem") {
    throw "Hospital A Test Orthanc certificate and CA mounts are missing."
}

$orthancB = $config.services.PSObject.Properties["orthanc-b"].Value
if ($orthancB.ports) {
    throw "Hospital B Orthanc must remain on its isolated service network without a host-published port."
}
$orthancBHealthCommand = @($orthancB.healthcheck.test)
if (
    $orthancBHealthCommand.Count -ne 4 -or
    $orthancBHealthCommand[0] -ne "CMD" -or
    $orthancBHealthCommand[1] -ne "python3" -or
    $orthancBHealthCommand[2] -ne "/probes/mediq-tls-healthcheck.py" -or
    $orthancBHealthCommand[3] -ne "/run/mediq/test-ca.crt"
) {
    throw "Hospital B readiness must verify TLS certificate and hostname using the local Test CA."
}
if ($orthancB.environment.ORTHANC__SSL_ENABLED -ne "true" -or $orthancB.environment.ORTHANC__SSL_CERTIFICATE -ne "/run/mediq/orthanc.pem") {
    throw "Hospital B Test Orthanc must expose HTTPS only with the mounted local server certificate."
}
if (@($orthancB.volumes | ForEach-Object { $_.target }) -notcontains "/run/mediq/test-ca.crt" -or @($orthancB.volumes | ForEach-Object { $_.target }) -notcontains "/run/mediq/orthanc.pem") {
    throw "Hospital B Test Orthanc certificate and CA mounts are missing."
}

foreach ($network in $config.networks.PSObject.Properties) {
    if ($network.Value.internal -ne $true) {
        throw "A P0 service network is not internal."
    }
}

$volumeSources = @()
foreach ($service in $config.services.PSObject.Properties) {
    if ($service.Value.volumes) {
        foreach ($mount in @($service.Value.volumes)) {
            if ($mount.type -eq "volume") { $volumeSources += $mount.source }
        }
    }
}
if ($volumeSources.Count -ne 3 -or @($volumeSources | Sort-Object -Unique).Count -ne 3) {
    throw "PostgreSQL and each Orthanc service must use a distinct persistent volume."
}

Write-Output "PASS: Compose syntax, pinned images, runtime-target health-only API, explicitly profiled migrator, isolated PAT/IAM/AUT runtime integration tests, PostgreSQL readiness/internal boundary, isolated A/B Orthanc, networks, and persistent volumes."
