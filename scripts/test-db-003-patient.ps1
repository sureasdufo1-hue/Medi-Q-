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
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -h postgres -U $User -d $Database -f - 2>&1)
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-003 test input is missing: $([IO.Path]::GetFileName($file))" }
}

Push-Location $repositoryRoot
try {
    & (Join-Path $PSScriptRoot "test-database-migrations.ps1") -EnvFile $EnvFile -ComposeFile $ComposeFile

    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before database credentials are read." }
    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_DB", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
            throw "Required local database test setting is missing: $key"
        }
    }
    if ($settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") {
        throw "Local migration role does not match the approved DB-003 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-003 tests." }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }

    $runToken = [guid]::NewGuid().ToString("N").ToUpperInvariant()
    $organizationId = [guid]::NewGuid().ToString()
    $tenantId = [guid]::NewGuid().ToString()
    $hospitalAId = [guid]::NewGuid().ToString()
    $hospitalBId = [guid]::NewGuid().ToString()
    $patientRefIds = @((1..4 | ForEach-Object { [guid]::NewGuid().ToString() }))
    $mappingIds = @((1..4 | ForEach-Object { [guid]::NewGuid().ToString() }))
    $organizationCode = "DB003-ORG-$runToken"
    $tenantCode = "DB003-TEN-$runToken"
    $hospitalACode = "DB003-HA-$runToken"
    $hospitalBCode = "DB003-HB-$runToken"
    $patientRefCodes = @((1..4 | ForEach-Object { "MQ-TEST-$runToken-$_" }))

    $sql = @"
DO `$`$
DECLARE
  actual_count integer;
BEGIN
  IF EXISTS (
    VALUES ('patient_refs'), ('patient_mappings')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB003_REQUIRED_TABLE_MISSING'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('consents'), ('consent_actions'),
      ('transfer_grants'), ('transfer_grant_scopes'), ('imaging_packages'), ('study_references'),
      ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB003_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('patient_refs','patient_ref_id','uuid',NULL::integer,'NO'),
      ('patient_refs','patient_ref_code','character varying',64,'NO'),
      ('patient_refs','status','character varying',20,'NO'),
      ('patient_refs','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('patient_refs','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('patient_mappings','mapping_id','uuid',NULL::integer,'NO'),
      ('patient_mappings','patient_ref_id','uuid',NULL::integer,'NO'),
      ('patient_mappings','hospital_id','uuid',NULL::integer,'NO'),
      ('patient_mappings','local_patient_id','character varying',128,'NO'),
      ('patient_mappings','status','character varying',20,'NO'),
      ('patient_mappings','validated_at','timestamp with time zone',NULL::integer,'YES'),
      ('patient_mappings','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('patient_mappings','updated_at','timestamp with time zone',NULL::integer,'NO')
  ), differences AS (
    SELECT expected.table_name, expected.column_name
      FROM expected
      LEFT JOIN information_schema.columns actual
        ON actual.table_schema = 'public'
       AND actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
     WHERE actual.column_name IS NULL
        OR actual.data_type <> expected.data_type
        OR actual.character_maximum_length IS DISTINCT FROM expected.max_length
        OR actual.is_nullable <> expected.nullable
    UNION ALL
    SELECT actual.table_name, actual.column_name
      FROM information_schema.columns actual
      LEFT JOIN expected
        ON expected.table_name = actual.table_name
       AND expected.column_name = actual.column_name
     WHERE actual.table_schema = 'public'
       AND actual.table_name IN ('patient_refs','patient_mappings')
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB003_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('patient_refs','patient_mappings')
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB003_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'p'
     AND conrelid IN ('patient_refs'::regclass,'patient_mappings'::regclass);
  IF actual_count <> 2 THEN RAISE EXCEPTION 'DB003_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'f'
     AND conrelid = 'patient_mappings'::regclass;
  IF actual_count <> 2 THEN RAISE EXCEPTION 'DB003_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND contype = 'f' AND conrelid = 'patient_mappings'::regclass AND confdeltype <> 'r')
    THEN RAISE EXCEPTION 'DB003_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'u'
     AND conrelid IN ('patient_refs'::regclass,'patient_mappings'::regclass);
  IF actual_count <> 3 THEN RAISE EXCEPTION 'DB003_UNIQUE_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'c'
     AND conname IN ('patient_refs_status_check','patient_refs_p0_synthetic_code_check','patient_mappings_status_check');
  IF actual_count <> 3 THEN RAISE EXCEPTION 'DB003_CHECK_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'patient_refs_status_idx', 'patient_mappings_patient_ref_id_idx',
     'patient_mappings_hospital_id_idx', 'patient_mappings_status_idx'
   );
  IF actual_count <> 4 THEN RAISE EXCEPTION 'DB003_INDEX_INVENTORY_MISMATCH'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES ('$organizationId', '$organizationCode', 'Synthetic Patient Organization', 'SYNTHETIC', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES ('$tenantId', '$organizationId', '$tenantCode', 'Synthetic Patient Tenant', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalAId', '$tenantId', '$organizationId', '$hospitalACode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalBId', '$tenantId', '$organizationId', '$hospitalBCode', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO patient_refs (patient_ref_id, patient_ref_code, status, created_at, updated_at)
VALUES
  ('$($patientRefIds[0])', '$($patientRefCodes[0])', 'ACTIVE', now(), now()),
  ('$($patientRefIds[1])', '$($patientRefCodes[1])', 'ACTIVE', now(), now()),
  ('$($patientRefIds[2])', '$($patientRefCodes[2])', 'ACTIVE', now(), now()),
  ('$($patientRefIds[3])', '$($patientRefCodes[3])', 'INACTIVE', now(), now());
INSERT INTO patient_mappings (mapping_id, patient_ref_id, hospital_id, local_patient_id, status, validated_at, created_at, updated_at)
VALUES
  ('$($mappingIds[0])', '$($patientRefIds[0])', '$hospitalAId', 'TEST-A-001', 'VALID', now(), now(), now()),
  ('$($mappingIds[1])', '$($patientRefIds[0])', '$hospitalBId', 'TEST-B-001', 'UNVERIFIED', NULL, now(), now()),
  ('$($mappingIds[2])', '$($patientRefIds[1])', '$hospitalAId', 'TEST-A-002', 'AMBIGUOUS', NULL, now(), now()),
  ('$($mappingIds[3])', '$($patientRefIds[2])', '$hospitalBId', 'TEST-B-002', 'REVOKED', NULL, now(), now());

DO `$`$
BEGIN
  BEGIN INSERT INTO patient_refs VALUES (gen_random_uuid(), '$($patientRefCodes[0])', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_REF_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO patient_refs VALUES (gen_random_uuid(), 'REAL-PATIENT-CODE', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_REF_SYNTHETIC_CODE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO patient_mappings VALUES (gen_random_uuid(), '$($patientRefIds[1])', '$hospitalAId', 'TEST-A-001', 'VALID', NULL, now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_HOSPITAL_LOCAL_ID_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO patient_mappings VALUES (gen_random_uuid(), '$($patientRefIds[0])', '$hospitalAId', 'TEST-A-999', 'VALID', NULL, now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_HOSPITAL_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN INSERT INTO patient_refs VALUES (gen_random_uuid(), 'MQ-TEST-INVALID-$runToken', 'UNKNOWN', now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_REF_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO patient_mappings VALUES (gen_random_uuid(), '$($patientRefIds[0])', '$hospitalAId', 'TEST-A-INVALID', 'UNKNOWN', NULL, now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_MAPPING_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO patient_mappings VALUES (gen_random_uuid(), gen_random_uuid(), '$hospitalAId', 'TEST-A-FAKE', 'VALID', NULL, now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_REF_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO patient_mappings VALUES (gen_random_uuid(), '$($patientRefIds[3])', gen_random_uuid(), 'TEST-UNKNOWN-HOSPITAL', 'VALID', NULL, now(), now());
    RAISE EXCEPTION 'DB003_EXPECTED_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM patient_refs WHERE patient_ref_id = '$($patientRefIds[0])';
    RAISE EXCEPTION 'DB003_EXPECTED_PATIENT_REF_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalAId';
    RAISE EXCEPTION 'DB003_EXPECTED_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;

ROLLBACK;
SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code = '$organizationCode') = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code = '$tenantCode') = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalACode','$hospitalBCode')) = 0
  AND (SELECT count(*) FROM patient_refs WHERE patient_ref_code IN ('$($patientRefCodes[0])','$($patientRefCodes[1])','$($patientRefCodes[2])','$($patientRefCodes[3])')) = 0
  AND (SELECT count(*) FROM patient_mappings WHERE mapping_id IN ('$($mappingIds[0])','$($mappingIds[1])','$($mappingIds[2])','$($mappingIds[3])')) = 0
THEN 'db003_rollback=PASS' ELSE 'db003_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db003_rollback=PASS") {
        $combinedOutput = $result.Output -join "`n"
        $knownSqlState = [regex]::Match($combinedOutput, '\b(23514|23503|23505|23502|42501|42P01|42703|42710|P0001)\b').Groups[1].Value
        $safeMarker = [regex]::Match($combinedOutput, '\bDB003_[A-Z_]+\b').Value
        $safeConstraint = [regex]::Match($combinedOutput, 'constraint "([a-z0-9_]+)"').Groups[1].Value
        $errorClass = if ($combinedOutput -match 'permission denied') { 'permission-denied' }
            elseif ($combinedOutput -match 'violates check constraint') { 'check-constraint' }
            elseif ($combinedOutput -match 'violates foreign key constraint') { 'foreign-key-constraint' }
            elseif ($combinedOutput -match 'violates unique constraint') { 'unique-constraint' }
            elseif ($combinedOutput -match 'does not exist') { 'missing-object' }
            elseif ($combinedOutput -match 'already exists') { 'already-exists' }
            elseif ($combinedOutput -match 'ERROR') { 'database-error' }
            else { 'no-recognized-error-text' }
        $stateSummary = if ($knownSqlState) { " SQLSTATE=$knownSqlState." } else { " SQLSTATE unavailable." }
        $markerSummary = if ($safeMarker) { " Check=$safeMarker." } else { " Check marker unavailable." }
        $constraintSummary = if ($safeConstraint) { " Constraint=$safeConstraint." } else { '' }
        throw "DB-003 patient schema constraints or transaction rollback test failed (exit=$($result.ExitCode), outputLines=$($result.Output.Count), class=$errorClass).$stateSummary$markerSummary$constraintSummary Raw SQL output suppressed."
    }

    Write-Output "db003_schema=PASS scope_tables=2 columns=13 primary_keys=2 explicit_indexes=4 checks=3 foreign_keys=2 unique=3"
    Write-Output "db003_synthetic_constraints=PASS patient_reference_status=2 mapping_status=4 invalid_fk=2 unique=3 check=3 synthetic_patient_ref=required delete_restrict=2"
    Write-Output "db003_rollback=PASS synthetic_patient_rows_persisted=0"
    Write-Output "db003_patient_status=PASS"
}
finally { Pop-Location }
