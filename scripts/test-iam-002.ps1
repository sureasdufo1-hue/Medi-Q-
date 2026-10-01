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
$fixtureSubject = "synthetic-iam002-$([guid]::NewGuid().ToString('N'))"
$fixtureActorId = [guid]::NewGuid().ToString()
$tenantA = "02000000-0000-4000-8000-000000000001"
$hospitalA = "04000000-0000-4000-8000-000000000001"
$fixtureSeedAttempted = $false

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

function ConvertTo-SqlLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-LocalPsql {
    param([string]$Network, [string]$User, [string]$Database, [string]$Password, [string]$Sql)
    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    try {
        $env:PGPASSWORD = $Password
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -h postgres -U $User -d $Database -f - 2>&1 | ForEach-Object { $_.ToString() })
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required IAM-002 input is missing: $([IO.Path]::GetFileName($file))"
    }
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before credentials are read." }

    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_DB", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD", "MEDIQ_DATABASE_URL")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
            throw "Required local database setting is missing: $key"
        }
    }
    if ($settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") {
        throw "IAM-002 requires the approved local migration identity."
    }
    $runtimeUrl = [Uri]$settings["MEDIQ_DATABASE_URL"]
    if ($runtimeUrl.UserInfo.Split(":")[0] -ne "mediq_runtime" -or $runtimeUrl.Host -ne "postgres") {
        throw "IAM-002 runtime integration must use the mediq_runtime database identity."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) {
        throw "The local PostgreSQL service is not running."
    }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Could not verify the local PostgreSQL network." }
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }
    $network = $databaseNetworks[0]

    Write-Output "IAM-002: apply approved migration using the migration-only service"
    & docker @composeArgs --profile migration run --build --rm --no-deps migrator
    if ($LASTEXITCODE -ne 0) { throw "IAM-002 migration failed; diagnostic details are in the command output." }

    $subjectSql = ConvertTo-SqlLiteral $fixtureSubject
    $actorSql = ConvertTo-SqlLiteral $fixtureActorId
    $tenantSql = ConvertTo-SqlLiteral $tenantA
    $hospitalSql = ConvertTo-SqlLiteral $hospitalA
    $seedSql = @"
DO `$iam002_preflight`$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
     WHERE tenant_id = $tenantSql::uuid AND status = 'ACTIVE'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.hospitals
     WHERE hospital_id = $hospitalSql::uuid
       AND tenant_id = $tenantSql::uuid
       AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIQ_IAM002_SYNTHETIC_REGISTRY_REQUIRED';
  END IF;
END
`$iam002_preflight`$;
INSERT INTO public.actors
  (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES
  ($actorSql::uuid, $tenantSql::uuid, $hospitalSql::uuid, 'USER', $subjectSql, 'Synthetic IAM-002 test actor', 'ACTIVE', now(), now());
SELECT 'iam002_fixture=READY';
"@
    $fixtureSeedAttempted = $true
    $seedResult = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $seedSql
    if ($seedResult.ExitCode -ne 0 -or ($seedResult.Output -join "`n") -notmatch "iam002_fixture=READY") {
        throw "Synthetic IAM-002 fixture setup failed; database diagnostics are suppressed."
    }

    $previousSubject = [Environment]::GetEnvironmentVariable("MEDIQ_IAM002_TEST_SUBJECT", "Process")
    $previousActorId = [Environment]::GetEnvironmentVariable("MEDIQ_IAM002_TEST_ACTOR_ID", "Process")
    try {
        $env:MEDIQ_IAM002_TEST_SUBJECT = $fixtureSubject
        $env:MEDIQ_IAM002_TEST_ACTOR_ID = $fixtureActorId
        Write-Output "IAM-002: run runtime-only DB acceptance (application receives no migration credential)"
        & docker @composeArgs --profile test run --build --rm --no-deps api-db-integration-test
        if ($LASTEXITCODE -ne 0) { throw "IAM-002 runtime integration acceptance failed." }
    }
    finally {
        if ($null -eq $previousSubject) { Remove-Item Env:MEDIQ_IAM002_TEST_SUBJECT -ErrorAction SilentlyContinue }
        else { $env:MEDIQ_IAM002_TEST_SUBJECT = $previousSubject }
        if ($null -eq $previousActorId) { Remove-Item Env:MEDIQ_IAM002_TEST_ACTOR_ID -ErrorAction SilentlyContinue }
        else { $env:MEDIQ_IAM002_TEST_ACTOR_ID = $previousActorId }
    }
}
finally {
    if ($fixtureSeedAttempted -and $settings -and $network) {
        $cleanupActorSql = ConvertTo-SqlLiteral $fixtureActorId
        $cleanupTenantSql = ConvertTo-SqlLiteral $tenantA
        $cleanupHospitalSql = ConvertTo-SqlLiteral $hospitalA
        $cleanupSubjectSql = ConvertTo-SqlLiteral $fixtureSubject
        $cleanupSql = @"
DELETE FROM public.actors
 WHERE actor_id = $cleanupActorSql::uuid
   AND tenant_id = $cleanupTenantSql::uuid
   AND hospital_id = $cleanupHospitalSql::uuid
   AND external_subject = $cleanupSubjectSql
   AND display_name = 'Synthetic IAM-002 test actor';
DELETE FROM public.actors
 WHERE tenant_id = $cleanupTenantSql::uuid
   AND hospital_id = $cleanupHospitalSql::uuid
   AND external_subject LIKE 'synthetic-iam002-%'
   AND actor_type = 'USER'
   AND display_name = 'Synthetic IAM-002 test actor';
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.actors
   WHERE external_subject LIKE 'synthetic-iam002-%'
     AND display_name = 'Synthetic IAM-002 test actor'
) THEN 'iam002_fixture_cleanup=COMPLETE'
  ELSE 'iam002_fixture_cleanup=INCOMPLETE' END;
"@
        $cleanupResult = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $cleanupSql
        if ($cleanupResult.ExitCode -ne 0 -or ($cleanupResult.Output -join "`n") -notmatch "iam002_fixture_cleanup=COMPLETE") {
            Write-Warning "Synthetic IAM-002 fixture cleanup did not complete; inspect the registry for the unique synthetic test subject."
        }
    }
    Pop-Location
}
