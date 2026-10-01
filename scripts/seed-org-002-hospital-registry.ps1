[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Low')]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml",
    [switch]$ProbeConflictForTest,
    [switch]$ProbeOwnerPairConflictForTest
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

function Is-Placeholder([string]$Value) {
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -match "(?i)(replace[-_ ]?before|change[-_ ]?me|placeholder|^todo$)"
}

function ConvertTo-SqlLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
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
        throw "Required ORG-002 input is missing: $([IO.Path]::GetFileName($file))"
    }
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before credentials are read." }

    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_DB", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
            throw "Required local database setting is missing: $key"
        }
    }
    if ($settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") {
        throw "ORG-002 requires the approved local migration identity."
    }
    if (Is-Placeholder $settings["MEDIQ_DB_MIGRATION_PASSWORD"]) {
        throw "The local migration password is still a placeholder."
    }
    if ($ProbeConflictForTest -and $ProbeOwnerPairConflictForTest) {
        throw "Select only one ORG-002 conflict probe per run."
    }
    if ($settings["MEDIQ_RUNTIME_PROFILE"] -and $settings["MEDIQ_RUNTIME_PROFILE"] -ne "container") {
        throw "ORG-002 supports only the local container database profile."
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
    $database = $settings["MEDIQ_POSTGRES_DB"]
    $preflightSql = @'
WITH expected(organization_id, organization_code, tenant_id, tenant_code) AS (
  VALUES
    ('01000000-0000-4000-8000-000000000001'::uuid, 'ORG-HOSPITAL-A', '02000000-0000-4000-8000-000000000001'::uuid, 'TEST-TENANT-A'),
    ('01000000-0000-4000-8000-000000000002'::uuid, 'ORG-HOSPITAL-B', '02000000-0000-4000-8000-000000000002'::uuid, 'TEST-TENANT-B'),
    ('01000000-0000-4000-8000-000000000003'::uuid, 'ORG-HOSPITAL-C', '02000000-0000-4000-8000-000000000003'::uuid, 'TEST-TENANT-C')
)
SELECT CASE
  WHEN to_regclass('public.organizations') IS NOT NULL
   AND to_regclass('public.tenants') IS NOT NULL
   AND to_regclass('public.hospitals') IS NOT NULL
   AND (SELECT count(*) FROM public.__drizzle_migrations) >= 8
   AND NOT EXISTS (
     SELECT 1
     FROM expected e
     LEFT JOIN public.organizations o ON o.organization_id = e.organization_id
     LEFT JOIN public.tenants t ON t.tenant_id = e.tenant_id
     WHERE o.organization_id IS NULL
        OR o.organization_code <> e.organization_code
        OR o.organization_type <> 'HOSPITAL'
        OR o.status <> 'ACTIVE'
        OR t.tenant_id IS NULL
        OR t.tenant_code <> e.tenant_code
        OR t.organization_id <> e.organization_id
        OR t.status <> 'ACTIVE'
   )
  THEN 'org002_preflight=PASS'
  ELSE 'org002_preflight=FAIL'
END;
'@
    $preflight = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $database -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $preflightSql
    if ($preflight.ExitCode -ne 0 -or ($preflight.Output -join [Environment]::NewLine) -notmatch "org002_preflight=PASS") {
        throw "ORG-002 requires the verified DB-008 schema and canonical ORG-001 fixtures; diagnostic output suppressed."
    }

    $hospitals = @(
        [pscustomobject]@{ Id = "04000000-0000-4000-8000-000000000001"; TenantId = "02000000-0000-4000-8000-000000000001"; OrganizationId = "01000000-0000-4000-8000-000000000001"; Code = "TEST-HOSPITAL-A"; Name = "Synthetic Hospital A"; Environment = "TEST"; Status = "ACTIVE" },
        [pscustomobject]@{ Id = "04000000-0000-4000-8000-000000000002"; TenantId = "02000000-0000-4000-8000-000000000002"; OrganizationId = "01000000-0000-4000-8000-000000000002"; Code = "TEST-HOSPITAL-B"; Name = "Synthetic Hospital B"; Environment = "TEST"; Status = "ACTIVE" },
        [pscustomobject]@{ Id = "04000000-0000-4000-8000-000000000003"; TenantId = "02000000-0000-4000-8000-000000000003"; OrganizationId = "01000000-0000-4000-8000-000000000003"; Code = "TEST-HOSPITAL-C"; Name = "Synthetic Hospital C"; Environment = "TEST"; Status = "ACTIVE" }
    )

    $insertRows = @()
    $expectedRows = @()
    foreach ($hospital in $hospitals) {
        $id = ConvertTo-SqlLiteral $hospital.Id
        $tenantId = ConvertTo-SqlLiteral $hospital.TenantId
        $organizationId = ConvertTo-SqlLiteral $hospital.OrganizationId
        $code = ConvertTo-SqlLiteral $hospital.Code
        $name = ConvertTo-SqlLiteral $hospital.Name
        $environment = ConvertTo-SqlLiteral $hospital.Environment
        $status = ConvertTo-SqlLiteral $hospital.Status
        $insertRows += "($id::uuid, $tenantId`::uuid, $organizationId`::uuid, $code, $name, $environment, $status, now(), now())"

        $expectedTenantId = $hospital.TenantId
        $expectedOrganizationId = $hospital.OrganizationId
        $expectedName = $hospital.Name
        if ($ProbeConflictForTest -and $hospital.Code -eq "TEST-HOSPITAL-A") {
            $expectedName = "INTENTIONAL ORG-002 CONFLICT PROBE"
        }
        if ($ProbeOwnerPairConflictForTest -and $hospital.Code -eq "TEST-HOSPITAL-A") {
            $expectedTenantId = "02000000-0000-4000-8000-000000000002"
            $expectedOrganizationId = "01000000-0000-4000-8000-000000000002"
        }
        $expectedRows += "($id`::uuid, $(ConvertTo-SqlLiteral $expectedTenantId)`::uuid, $(ConvertTo-SqlLiteral $expectedOrganizationId)`::uuid, $code, $(ConvertTo-SqlLiteral $expectedName), $environment, $status)"
    }

    $sqlTemplate = @'
BEGIN;
DO $parent_check$
DECLARE mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM (VALUES
    __PARENT_EXPECTED_ROWS__
  ) AS expected(organization_id, organization_code, tenant_id, tenant_code)
  LEFT JOIN public.organizations o ON o.organization_id = expected.organization_id
  LEFT JOIN public.tenants t ON t.tenant_id = expected.tenant_id
  WHERE o.organization_id IS NULL
     OR o.organization_code <> expected.organization_code
     OR o.organization_type <> 'HOSPITAL'
     OR o.status <> 'ACTIVE'
     OR t.tenant_id IS NULL
     OR t.tenant_code <> expected.tenant_code
     OR t.organization_id <> expected.organization_id
     OR t.status <> 'ACTIVE';

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIQ_ORG_002_PARENT_CONFLICT';
  END IF;
END
$parent_check$;

INSERT INTO public.hospitals
  (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  __HOSPITAL_INSERT_ROWS__
ON CONFLICT (hospital_code) DO NOTHING;

DO $hospital_check$
DECLARE mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM (VALUES
    __HOSPITAL_EXPECTED_ROWS__
  ) AS expected(hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status)
  LEFT JOIN public.hospitals actual ON actual.hospital_code = expected.hospital_code
  WHERE actual.hospital_id IS NULL
     OR actual.hospital_id <> expected.hospital_id
     OR actual.tenant_id <> expected.tenant_id
     OR actual.organization_id <> expected.organization_id
     OR actual.name <> expected.name
     OR actual.environment_type <> expected.environment_type
     OR actual.status <> expected.status;

  IF mismatch_count <> 0
     OR (SELECT count(*) FROM public.hospitals
         WHERE hospital_code IN ('TEST-HOSPITAL-A', 'TEST-HOSPITAL-B', 'TEST-HOSPITAL-C')) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIQ_ORG_002_SEED_CONFLICT';
  END IF;
END
$hospital_check$;

COMMIT;
SELECT 'org002_hospital_seed_commit=PASS';
'@
    $parentRows = @(
        "('01000000-0000-4000-8000-000000000001'::uuid, 'ORG-HOSPITAL-A', '02000000-0000-4000-8000-000000000001'::uuid, 'TEST-TENANT-A')",
        "('01000000-0000-4000-8000-000000000002'::uuid, 'ORG-HOSPITAL-B', '02000000-0000-4000-8000-000000000002'::uuid, 'TEST-TENANT-B')",
        "('01000000-0000-4000-8000-000000000003'::uuid, 'ORG-HOSPITAL-C', '02000000-0000-4000-8000-000000000003'::uuid, 'TEST-TENANT-C')"
    )
    $sql = $sqlTemplate.Replace("__PARENT_EXPECTED_ROWS__", ($parentRows -join ("," + [Environment]::NewLine + "    ")))
    $sql = $sql.Replace("__HOSPITAL_INSERT_ROWS__", ($insertRows -join ("," + [Environment]::NewLine + "  ")))
    $sql = $sql.Replace("__HOSPITAL_EXPECTED_ROWS__", ($expectedRows -join ("," + [Environment]::NewLine + "    ")))

    $isConflictProbe = $ProbeConflictForTest -or $ProbeOwnerPairConflictForTest
    $action = if ($isConflictProbe) { "run rollback-only synthetic Hospital conflict probe" } else { "insert-if-absent synthetic Hospital fixtures" }
    if (-not $PSCmdlet.ShouldProcess("local PostgreSQL database", $action)) { return }

    $result = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $database -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    $combinedOutput = $result.Output -join [Environment]::NewLine
    if ($isConflictProbe) {
        if ($result.ExitCode -eq 0 -or $combinedOutput -notmatch "MEDIQ_ORG_002_SEED_CONFLICT") {
            throw "ORG-002 conflict probe did not fail closed as expected."
        }
        Write-Output "org002_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true"
        return
    }
    if ($result.ExitCode -ne 0 -or $combinedOutput -notmatch "org002_hospital_seed_commit=PASS") {
        throw "ORG-002 Hospital seed failed or conflicted with existing rows; database output suppressed."
    }
    Write-Output "org002_hospital_seed=PASS hospitals=3 mode=insert-only"
}
finally {
    Pop-Location
}
