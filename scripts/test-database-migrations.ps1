[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml",
    [switch]$FrameworkOnly
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))
$resolvedComposeFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ComposeFile))
$migrationJournalPath = Join-Path $repositoryRoot "services/api/src/database/migrations/meta/_journal.json"
$postgresImage = "postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650"
$approvedProductTables = @(
    "organizations", "tenants", "hospitals", "hospital_endpoints", "actors",
    "patient_refs", "patient_mappings", "exchange_sessions", "consents", "consent_actions",
    "transfer_grants", "transfer_grant_scopes", "imaging_packages", "study_references",
    "integrity_evidence", "provenance_records", "audit_events", "pacs_transfer_operations"
)

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

function Invoke-LocalPsql {
    param(
        [string]$Network,
        [string]$User,
        [string]$Database,
        [string]$Password,
        [string]$Sql
    )

    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    try {
        $env:PGPASSWORD = $Password
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -h postgres -U $User -d $Database -f - 2>&1)
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile, $migrationJournalPath)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required migration test input is missing: $([IO.Path]::GetFileName($file))" }
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before database credentials are read." }
    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_DB", "MEDIQ_DB_RUNTIME_USER", "MEDIQ_DB_RUNTIME_PASSWORD", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
            throw "Required local database test setting is missing: $key"
        }
    }
    if ($settings["MEDIQ_DB_RUNTIME_USER"] -ne "mediq_runtime" -or $settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") {
        throw "Local database roles do not match the approved migration boundary."
    }
    $migrationJournal = Get-Content -LiteralPath $migrationJournalPath -Raw | ConvertFrom-Json
    $expectedMigrationCount = @($migrationJournal.entries).Count
    if ($migrationJournal.dialect -ne "postgresql" -or $expectedMigrationCount -lt 1) {
        throw "Migration journal is missing or invalid."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for the migration test." }
    $postgresState = (& docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}' $postgresId | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $postgresState -ne "running|healthy") { throw "PostgreSQL is not healthy for the migration test." }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }

    $preflight = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '__drizzle_migrations' ORDER BY table_name;"
    $preflightTables = @($preflight.Output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne "" })
    if ($preflight.ExitCode -ne 0 -or @($preflightTables | Where-Object { $_ -notin $approvedProductTables }).Count -gt 0) {
        throw "Migration smoke found a public table outside the approved P0 Data Model."
    }
    if ($FrameworkOnly -and $preflightTables.Count -gt 0) {
        throw "Framework-only smoke requires zero pre-existing product tables."
    }

    for ($attempt = 1; $attempt -le 2; $attempt++) {
        $runArgs = $composeArgs + @("--profile", "migration", "run", "--build", "--rm", "migrator")
        $migrationOutput = @(& docker @runArgs 2>&1)
        $migrationExitCode = $LASTEXITCODE
        if ($migrationExitCode -ne 0) { throw "Migration run $attempt failed; command output was suppressed." }
        Write-Output "migration_apply_attempt=$attempt result=PASS"
    }

    $ledger = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql "SELECT count(*) FROM public.__drizzle_migrations; SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='__drizzle_migrations'; SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '__drizzle_migrations';"
    $ledgerLines = @($ledger.Output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne "" })
    if ($ledger.ExitCode -ne 0 -or $ledgerLines.Count -ne 3 -or $ledgerLines[0] -ne [string]$expectedMigrationCount -or $ledgerLines[1] -ne "mediq_migrator") {
        throw "Migration ledger ownership/count or product-table boundary did not match the expected result."
    }
    if ($FrameworkOnly -and $ledgerLines[2] -ne "0") { throw "Framework-only baseline unexpectedly created a product table." }

    $runtimeProbe = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_RUNTIME_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql "SELECT 1;"
    if ($runtimeProbe.ExitCode -ne 0 -or ($runtimeProbe.Output -join "").Trim() -ne "1") { throw "Runtime DB role failed its harmless connection probe after migration." }
    $runtimeLedgerProbe = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_RUNTIME_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql "SELECT count(*) FROM public.__drizzle_migrations;"
    if ($runtimeLedgerProbe.ExitCode -eq 0) { throw "Runtime role unexpectedly read the migration ledger." }

    Write-Output "migration_ledger=PASS rows=$expectedMigrationCount owner=mediq_migrator"
    Write-Output "product_tables=$($ledgerLines[2]) runtime_select_1=PASS runtime_migration_ledger_access=DENIED"
    Write-Output "database_migration_status=PASS"
}
finally { Pop-Location }
