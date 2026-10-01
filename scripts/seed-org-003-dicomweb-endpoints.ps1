[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Low')]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml",
    [switch]$ProbeUrlConflictForTest,
    [switch]$ProbeEnabledConflictForTest,
    [switch]$ProbeInvalidUrlsForTest
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

function Get-ApprovedDicomwebBaseUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][string]$ExpectedHost
    )

    $uri = $null
    if ([string]::IsNullOrWhiteSpace($Value) -or -not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
        throw "MEDIQ_ORG_003_URL_REJECTED"
    }
    if ($uri.Scheme -cne "http" -or $uri.Host -ine $ExpectedHost -or $uri.Port -ne 8042 -or
        -not [string]::IsNullOrEmpty($uri.UserInfo) -or $uri.AbsolutePath -notin @("", "/") -or
        -not [string]::IsNullOrEmpty($uri.Query) -or -not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw "MEDIQ_ORG_003_URL_REJECTED"
    }

    return $uri.GetLeftPart([UriPartial]::Authority) + "/dicom-web"
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
        throw "Required ORG-003 input is missing: $([IO.Path]::GetFileName($file))"
    }
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before configuration is read." }

    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_DB", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD", "ORTHANC_A_URL", "ORTHANC_B_URL")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
            throw "Required local ORG-003 setting is missing: $key"
        }
    }
    if ($settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") {
        throw "ORG-003 requires the approved local migration identity."
    }
    if (Is-Placeholder $settings["MEDIQ_DB_MIGRATION_PASSWORD"]) {
        throw "The local migration password is still a placeholder."
    }
    $probesSelected = 0
    if ($ProbeUrlConflictForTest) { $probesSelected++ }
    if ($ProbeEnabledConflictForTest) { $probesSelected++ }
    if ($ProbeInvalidUrlsForTest) { $probesSelected++ }
    if ($probesSelected -gt 1) { throw "Select only one ORG-003 test probe per run." }
    if ($settings["MEDIQ_RUNTIME_PROFILE"] -and $settings["MEDIQ_RUNTIME_PROFILE"] -ne "container") {
        throw "ORG-003 supports only the local container database profile."
    }

    if ($ProbeInvalidUrlsForTest) {
        $invalidValues = @(
            "https://orthanc-a:8042",
            "http://attacker.invalid:8042",
            "http://orthanc-a:8080",
            "http://orthanc-a:8042/dicom-web",
            "http://user@orthanc-a:8042",
            "http://orthanc-a:8042?target=external",
            "http://orthanc-a:8042#fragment"
        )
        foreach ($invalidValue in $invalidValues) {
            $rejected = $false
            try { [void](Get-ApprovedDicomwebBaseUrl -Value $invalidValue -ExpectedHost "orthanc-a") }
            catch {
                if ($_.Exception.Message -ne "MEDIQ_ORG_003_URL_REJECTED") { throw }
                $rejected = $true
            }
            if (-not $rejected) { throw "ORG-003 URL validator accepted an unapproved URL shape." }
        }
        Write-Output "org003_invalid_url_probes=PASS cases=$($invalidValues.Count)"
        return
    }

    $orthancAUrl = Get-ApprovedDicomwebBaseUrl -Value $settings["ORTHANC_A_URL"] -ExpectedHost "orthanc-a"
    $orthancBUrl = Get-ApprovedDicomwebBaseUrl -Value $settings["ORTHANC_B_URL"] -ExpectedHost "orthanc-b"

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
WITH expected(hospital_id, hospital_code) AS (
  VALUES
    ('04000000-0000-4000-8000-000000000001'::uuid, 'TEST-HOSPITAL-A'),
    ('04000000-0000-4000-8000-000000000002'::uuid, 'TEST-HOSPITAL-B'),
    ('04000000-0000-4000-8000-000000000003'::uuid, 'TEST-HOSPITAL-C')
)
SELECT CASE
  WHEN to_regclass('public.hospitals') IS NOT NULL
   AND to_regclass('public.hospital_endpoints') IS NOT NULL
   AND (SELECT count(*) FROM public.__drizzle_migrations) >= 8
   AND NOT EXISTS (
     SELECT 1
     FROM expected e
     LEFT JOIN public.hospitals h ON h.hospital_id = e.hospital_id
     WHERE h.hospital_id IS NULL
        OR h.hospital_code <> e.hospital_code
        OR h.environment_type <> 'TEST'
        OR h.status <> 'ACTIVE'
   )
  THEN 'org003_preflight=PASS'
  ELSE 'org003_preflight=FAIL'
END;
'@
    $preflight = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $database -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $preflightSql
    if ($preflight.ExitCode -ne 0 -or ($preflight.Output -join [Environment]::NewLine) -notmatch "org003_preflight=PASS") {
        throw "ORG-003 requires the verified DB-008 schema and canonical ORG-002 Hospitals; diagnostic output suppressed."
    }

    $endpoints = @(
        [pscustomobject]@{ Id = "05000000-0000-4000-8000-000000000001"; HospitalId = "04000000-0000-4000-8000-000000000001"; Type = "QIDO_RS"; BaseUrl = $orthancAUrl; Enabled = $true },
        [pscustomobject]@{ Id = "05000000-0000-4000-8000-000000000002"; HospitalId = "04000000-0000-4000-8000-000000000001"; Type = "WADO_RS"; BaseUrl = $orthancAUrl; Enabled = $false },
        [pscustomobject]@{ Id = "05000000-0000-4000-8000-000000000003"; HospitalId = "04000000-0000-4000-8000-000000000002"; Type = "QIDO_RS"; BaseUrl = $orthancBUrl; Enabled = $true },
        [pscustomobject]@{ Id = "05000000-0000-4000-8000-000000000004"; HospitalId = "04000000-0000-4000-8000-000000000002"; Type = "STOW_RS"; BaseUrl = $orthancBUrl; Enabled = $false }
    )

    $insertRows = @()
    $expectedRows = @()
    foreach ($endpoint in $endpoints) {
        $id = ConvertTo-SqlLiteral $endpoint.Id
        $hospitalId = ConvertTo-SqlLiteral $endpoint.HospitalId
        $type = ConvertTo-SqlLiteral $endpoint.Type
        $baseUrl = ConvertTo-SqlLiteral $endpoint.BaseUrl
        $enabled = if ($endpoint.Enabled) { "true" } else { "false" }
        $insertRows += "($id`::uuid, $hospitalId`::uuid, $type, $baseUrl, $enabled, now(), now())"

        $expectedBaseUrl = $endpoint.BaseUrl
        $expectedEnabled = $endpoint.Enabled
        if ($ProbeUrlConflictForTest -and $endpoint.Id -eq "05000000-0000-4000-8000-000000000001") {
            $expectedBaseUrl = $endpoint.BaseUrl + "/intentional-conflict-probe"
        }
        if ($ProbeEnabledConflictForTest -and $endpoint.Id -eq "05000000-0000-4000-8000-000000000001") {
            $expectedEnabled = $false
        }
        $expectedBaseUrlSql = ConvertTo-SqlLiteral $expectedBaseUrl
        $expectedEnabledSql = if ($expectedEnabled) { "true" } else { "false" }
        $expectedRows += "($id`::uuid, $hospitalId`::uuid, $type, $expectedBaseUrlSql, $expectedEnabledSql)"
    }

    $sqlTemplate = @'
BEGIN;
DO $parent_check$
DECLARE mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM (VALUES
    ('04000000-0000-4000-8000-000000000001'::uuid, 'TEST-HOSPITAL-A'),
    ('04000000-0000-4000-8000-000000000002'::uuid, 'TEST-HOSPITAL-B'),
    ('04000000-0000-4000-8000-000000000003'::uuid, 'TEST-HOSPITAL-C')
  ) AS expected(hospital_id, hospital_code)
  LEFT JOIN public.hospitals h ON h.hospital_id = expected.hospital_id
  WHERE h.hospital_id IS NULL
     OR h.hospital_code <> expected.hospital_code
     OR h.environment_type <> 'TEST'
     OR h.status <> 'ACTIVE';

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIQ_ORG_003_HOSPITAL_PARENT_CONFLICT';
  END IF;
END
$parent_check$;

INSERT INTO public.hospital_endpoints
  (endpoint_id, hospital_id, endpoint_type, base_url, enabled, created_at, updated_at)
VALUES
  __ENDPOINT_INSERT_ROWS__
ON CONFLICT (hospital_id, endpoint_type) DO NOTHING;

DO $endpoint_check$
DECLARE mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM (VALUES
    __ENDPOINT_EXPECTED_ROWS__
  ) AS expected(endpoint_id, hospital_id, endpoint_type, base_url, enabled)
  LEFT JOIN public.hospital_endpoints actual
    ON actual.hospital_id = expected.hospital_id
   AND actual.endpoint_type = expected.endpoint_type
  WHERE actual.endpoint_id IS NULL
     OR actual.endpoint_id <> expected.endpoint_id
     OR actual.base_url <> expected.base_url
     OR actual.enabled <> expected.enabled;

  IF mismatch_count <> 0
     OR (SELECT count(*) FROM public.hospital_endpoints
         WHERE hospital_id IN (
           '04000000-0000-4000-8000-000000000001'::uuid,
           '04000000-0000-4000-8000-000000000002'::uuid,
           '04000000-0000-4000-8000-000000000003'::uuid
         )) <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIQ_ORG_003_SEED_CONFLICT';
  END IF;
END
$endpoint_check$;

COMMIT;
SELECT 'org003_endpoint_seed_commit=PASS';
'@
    $sql = $sqlTemplate.Replace("__ENDPOINT_INSERT_ROWS__", ($insertRows -join ("," + [Environment]::NewLine + "  ")))
    $sql = $sql.Replace("__ENDPOINT_EXPECTED_ROWS__", ($expectedRows -join ("," + [Environment]::NewLine + "    ")))

    $isConflictProbe = $ProbeUrlConflictForTest -or $ProbeEnabledConflictForTest
    $action = if ($isConflictProbe) { "run rollback-only synthetic endpoint conflict probe" } else { "insert-if-absent synthetic DICOMweb endpoint fixtures" }
    if (-not $PSCmdlet.ShouldProcess("local PostgreSQL database", $action)) { return }

    $result = Invoke-LocalPsql -Network $network -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $database -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    $combinedOutput = $result.Output -join [Environment]::NewLine
    if ($isConflictProbe) {
        if ($result.ExitCode -eq 0 -or $combinedOutput -notmatch "MEDIQ_ORG_003_SEED_CONFLICT") {
            throw "ORG-003 endpoint conflict probe did not fail closed as expected."
        }
        Write-Output "org003_conflict_probe=PASS existing_rows_unchanged=true transaction_rolled_back=true"
        return
    }
    if ($result.ExitCode -ne 0 -or $combinedOutput -notmatch "org003_endpoint_seed_commit=PASS") {
        throw "ORG-003 endpoint seed failed or conflicted with existing rows; database output suppressed."
    }
    Write-Output "org003_endpoint_seed=PASS endpoints=4 qido_enabled=2 unverified_disabled=2 mode=insert-only"
}
finally {
    Pop-Location
}
