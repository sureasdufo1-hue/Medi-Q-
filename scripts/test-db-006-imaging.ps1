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
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -h postgres -U $User -d $Database -f - 2>&1 | ForEach-Object { $_.ToString() })
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-006 test input is missing: $([IO.Path]::GetFileName($file))" }
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
        throw "Local migration role does not match the approved DB-006 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-006 tests." }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }

    $runToken = [guid]::NewGuid().ToString("N").ToUpperInvariant()
    $organizationId = [guid]::NewGuid().ToString()
    $tenantId = [guid]::NewGuid().ToString()
    $hospitalAId = [guid]::NewGuid().ToString()
    $hospitalBId = [guid]::NewGuid().ToString()
    $actorId = [guid]::NewGuid().ToString()
    $patientRefId = [guid]::NewGuid().ToString()
    $sessionId = [guid]::NewGuid().ToString()
    $organizationCode = "DB006-ORG-$runToken"
    $tenantCode = "DB006-TEN-$runToken"
    $hospitalACode = "DB006-HA-$runToken"
    $hospitalBCode = "DB006-HB-$runToken"
    $patientRefCode = "MQ-TEST-DB006-$runToken"
    $sessionPurpose = "synthetic-imaging-metadata-test"
    $states = @("REGISTERED", "AVAILABLE", "IN_EXCHANGE", "SESSION_COMPLETE", "RETENTION_PENDING", "DELETED", "FAILED")
    $packageIds = @((1..$states.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $packageValues = for ($i = 0; $i -lt $states.Count; $i++) {
        $storageRef = if ($i -eq 1) { "'synthetic://test/$runToken'" } else { "NULL" }
        "('$($packageIds[$i])', '$sessionId', '$patientRefId', '$hospitalAId', '$($states[$i])', $storageRef, 1, now(), now(), NULL, NULL)"
    }
    $packageValuesSql = $packageValues -join ",`n"
    $uidToken = "{0}{1:D6}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), (Get-Random -Minimum 0 -Maximum 1000000)
    $studyUidOne = "1.2.826.0.1.3680043.10.543.6.$uidToken.1"
    $studyUidTwo = "1.2.826.0.1.3680043.10.543.6.$uidToken.2"
    $studyUidNegativeSeries = "1.2.826.0.1.3680043.10.543.6.$uidToken.3"
    $studyUidNegativeInstances = "1.2.826.0.1.3680043.10.543.6.$uidToken.4"
    $studyUidInvalidHospital = "1.2.826.0.1.3680043.10.543.6.$uidToken.5"
    $studyRefIdOne = [guid]::NewGuid().ToString()
    $studyRefIdTwo = [guid]::NewGuid().ToString()
    $studyPackageId = $packageIds[1]

    $sql = @"
DO `$`$
DECLARE
  actual_count integer;
BEGIN
  IF EXISTS (
    VALUES ('imaging_packages'), ('study_references')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB006_REQUIRED_TABLE_MISSING'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('consents'), ('consent_actions'),
      ('transfer_grants'), ('transfer_grant_scopes'), ('imaging_packages'), ('study_references'),
      ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB006_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('imaging_packages','package_id','uuid',NULL::integer,'NO'),
      ('imaging_packages','exchange_session_id','uuid',NULL::integer,'NO'),
      ('imaging_packages','patient_ref_id','uuid',NULL::integer,'NO'),
      ('imaging_packages','source_hospital_id','uuid',NULL::integer,'NO'),
      ('imaging_packages','state','character varying',32,'NO'),
      ('imaging_packages','storage_ref','character varying',1024,'YES'),
      ('imaging_packages','study_count','integer',NULL::integer,'NO'),
      ('imaging_packages','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('imaging_packages','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('imaging_packages','retention_expires_at','timestamp with time zone',NULL::integer,'YES'),
      ('imaging_packages','deleted_at','timestamp with time zone',NULL::integer,'YES'),
      ('study_references','study_ref_id','uuid',NULL::integer,'NO'),
      ('study_references','package_id','uuid',NULL::integer,'NO'),
      ('study_references','source_hospital_id','uuid',NULL::integer,'NO'),
      ('study_references','study_instance_uid','character varying',128,'NO'),
      ('study_references','modality','character varying',16,'YES'),
      ('study_references','series_count','integer',NULL::integer,'YES'),
      ('study_references','instance_count','integer',NULL::integer,'YES'),
      ('study_references','created_at','timestamp with time zone',NULL::integer,'NO')
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
      LEFT JOIN expected ON expected.column_name = actual.column_name
       AND expected.table_name = actual.table_name
     WHERE actual.table_schema = 'public'
       AND actual.table_name IN ('imaging_packages','study_references')
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB006_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('imaging_packages','study_references')
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB006_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid IN ('imaging_packages'::regclass,'study_references'::regclass)
     AND contype = 'p';
  IF actual_count <> 2 THEN RAISE EXCEPTION 'DB006_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid IN ('imaging_packages'::regclass,'study_references'::regclass)
     AND contype = 'f';
  IF actual_count <> 5 THEN RAISE EXCEPTION 'DB006_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN ('imaging_packages'::regclass,'study_references'::regclass)
        AND contype = 'f' AND confdeltype <> 'r')
    THEN RAISE EXCEPTION 'DB006_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid IN ('imaging_packages'::regclass,'study_references'::regclass)
     AND contype = 'c';
  IF actual_count <> 4 THEN RAISE EXCEPTION 'DB006_CHECK_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid IN ('imaging_packages'::regclass,'study_references'::regclass)
     AND contype = 'u';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'DB006_UNIQUE_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'imaging_packages_exchange_session_id_idx', 'imaging_packages_patient_ref_id_idx',
     'imaging_packages_source_hospital_id_idx', 'imaging_packages_state_idx',
     'imaging_packages_retention_expires_at_idx', 'study_references_package_id_idx',
     'study_references_source_hospital_id_idx', 'study_references_study_instance_uid_idx'
   );
  IF actual_count <> 8 THEN RAISE EXCEPTION 'DB006_INDEX_INVENTORY_MISMATCH'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES ('$organizationId', '$organizationCode', 'Synthetic Imaging Organization', 'SYNTHETIC', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES ('$tenantId', '$organizationId', '$tenantCode', 'Synthetic Imaging Tenant', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalAId', '$tenantId', '$organizationId', '$hospitalACode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalBId', '$tenantId', '$organizationId', '$hospitalBCode', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES ('$actorId', '$tenantId', '$hospitalAId', 'USER', 'synthetic-actor-$runToken', 'Synthetic Requester', 'ACTIVE', now(), now());
INSERT INTO patient_refs (patient_ref_id, patient_ref_code, status, created_at, updated_at)
VALUES ('$patientRefId', '$patientRefCode', 'ACTIVE', now(), now());
INSERT INTO exchange_sessions (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, purpose, state, created_at, updated_at, idempotency_key)
VALUES ('$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', '$actorId', '$sessionPurpose', 'READY', now(), now(), gen_random_uuid());
INSERT INTO imaging_packages (package_id, exchange_session_id, patient_ref_id, source_hospital_id, state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
VALUES
$packageValuesSql;
INSERT INTO study_references (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
VALUES
  ('$studyRefIdOne', '$studyPackageId', '$hospitalAId', '$studyUidOne', NULL, NULL, NULL, now()),
  ('$studyRefIdTwo', '$studyPackageId', '$hospitalAId', '$studyUidTwo', 'CT', 1, 3, now());

DO `$`$
DECLARE
  affected_count integer;
BEGIN
  BEGIN INSERT INTO imaging_packages VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', 'UNKNOWN', NULL, 1, now(), now(), NULL, NULL);
    RAISE EXCEPTION 'DB006_EXPECTED_PACKAGE_STATE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO imaging_packages VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', 'AVAILABLE', NULL, -1, now(), now(), NULL, NULL);
    RAISE EXCEPTION 'DB006_EXPECTED_PACKAGE_COUNT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO imaging_packages VALUES (gen_random_uuid(), gen_random_uuid(), '$patientRefId', '$hospitalAId', 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL);
    RAISE EXCEPTION 'DB006_EXPECTED_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO imaging_packages VALUES (gen_random_uuid(), '$sessionId', gen_random_uuid(), '$hospitalAId', 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL);
    RAISE EXCEPTION 'DB006_EXPECTED_PATIENT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO imaging_packages VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', gen_random_uuid(), 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL);
    RAISE EXCEPTION 'DB006_EXPECTED_PACKAGE_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO study_references VALUES (gen_random_uuid(), gen_random_uuid(), '$hospitalAId', '$studyUidOne', 'CT', 1, 1, now());
    RAISE EXCEPTION 'DB006_EXPECTED_STUDY_PACKAGE_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO study_references VALUES (gen_random_uuid(), '$studyPackageId', gen_random_uuid(), '$studyUidInvalidHospital', 'CT', 1, 1, now());
    RAISE EXCEPTION 'DB006_EXPECTED_STUDY_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO study_references VALUES (gen_random_uuid(), '$studyPackageId', '$hospitalAId', '$studyUidOne', 'CT', 1, 1, now())
    ON CONFLICT (package_id, study_instance_uid) DO NOTHING;
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count <> 0 THEN RAISE EXCEPTION 'DB006_EXPECTED_PACKAGE_UID_UNIQUE'; END IF;
  END;
  BEGIN INSERT INTO study_references VALUES (gen_random_uuid(), '$studyPackageId', '$hospitalAId', '$studyUidNegativeSeries', 'CT', -1, 1, now());
    RAISE EXCEPTION 'DB006_EXPECTED_SERIES_COUNT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO study_references VALUES (gen_random_uuid(), '$studyPackageId', '$hospitalAId', '$studyUidNegativeInstances', 'CT', 1, -1, now());
    RAISE EXCEPTION 'DB006_EXPECTED_INSTANCE_COUNT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN DELETE FROM exchange_sessions WHERE session_id = '$sessionId';
    RAISE EXCEPTION 'DB006_EXPECTED_SESSION_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM patient_refs WHERE patient_ref_id = '$patientRefId';
    RAISE EXCEPTION 'DB006_EXPECTED_PATIENT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalAId';
    RAISE EXCEPTION 'DB006_EXPECTED_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM imaging_packages WHERE package_id = '$studyPackageId';
    RAISE EXCEPTION 'DB006_EXPECTED_PACKAGE_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;

ROLLBACK;
SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code = '$organizationCode') = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code = '$tenantCode') = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalACode','$hospitalBCode')) = 0
  AND (SELECT count(*) FROM patient_refs WHERE patient_ref_code = '$patientRefCode') = 0
  AND (SELECT count(*) FROM actors WHERE external_subject = 'synthetic-actor-$runToken') = 0
  AND (SELECT count(*) FROM exchange_sessions WHERE session_id = '$sessionId') = 0
  AND (SELECT count(*) FROM imaging_packages WHERE package_id IN ('$($packageIds -join "','")')) = 0
  AND (SELECT count(*) FROM study_references WHERE study_instance_uid IN ('$studyUidOne','$studyUidTwo')) = 0
THEN 'db006_rollback=PASS' ELSE 'db006_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db006_rollback=PASS") {
        $failureTags = @($result.Output | ForEach-Object {
            foreach ($match in [regex]::Matches([string]$_, "DB006_[A-Z_]+")) { $match.Value }
        } | Sort-Object -Unique)
        $safeTags = if ($failureTags.Count -eq 0) { "NO_DB006_ASSERTION_TAG" } else { $failureTags -join "," }
        $safeDiagnostics = @($result.Output | ForEach-Object {
            $line = $_.ToString()
            if ($line -match "^(ERROR:|psql:|FATAL:|db006_rollback=|CONTEXT: PL/pgSQL function inline_code_block line [0-9]+ at SQL statement)") {
                $line -replace '\b[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}\b', '<uuid>' -replace '\b(?:[0-9]+\.){5,}[0-9]+\b', '<uid>'
            }
        } | Select-Object -First 5)
        $safeDiagnostic = if ($safeDiagnostics.Count -eq 0) { "NO_SAFE_DIAGNOSTIC_LINE" } else { $safeDiagnostics -join " | " }
        throw "DB-006 Imaging metadata constraints or transaction rollback test failed; psql_exit=$($result.ExitCode); failure_tag=$safeTags; diagnostic=$safeDiagnostic; SQL output suppressed."
    }

    Write-Output "db006_schema=PASS scope_tables=2 columns=19 primary_keys=2 explicit_indexes=8 checks=4 foreign_keys=5 unique=1"
    Write-Output "db006_synthetic_constraints=PASS states=7 invalid_state=1 invalid_count=3 invalid_fk=5 duplicate_package_uid=1 delete_restrict=4 nullable_study_counts=PASS"
    Write-Output "db006_rollback=PASS synthetic_metadata_rows_persisted=0"
    Write-Output "db006_imaging_status=PASS"
}
finally { Pop-Location }
