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
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -h postgres -U $User -d $Database -f - 2>&1)
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-002 test input is missing: $([IO.Path]::GetFileName($file))" }
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
        throw "Local migration role does not match the approved DB-002 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-002 tests." }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }

    $runToken = [guid]::NewGuid().ToString("N")
    $organizationCode = "DB002-ORG-$runToken"
    $organizationCode2 = "DB002-ORG2-$runToken"
    $tenantCode = "DB002-TEN-$runToken"
    $tenantCode2 = "DB002-TEN2-$runToken"
    $hospitalCode = "DB002-HSP-$runToken"
    $hospitalCode2 = "DB002-HSP2-$runToken"
    $orgId = [guid]::NewGuid().ToString()
    $orgId2 = [guid]::NewGuid().ToString()
    $tenantId = [guid]::NewGuid().ToString()
    $tenantId2 = [guid]::NewGuid().ToString()
    $hospitalId = [guid]::NewGuid().ToString()
    $hospitalId2 = [guid]::NewGuid().ToString()
    $hospitalIdSuspended = [guid]::NewGuid().ToString()
    $hospitalIdInactive = [guid]::NewGuid().ToString()
    $hospitalCodeSuspended = "DB002-HSP-SUSP-$runToken"
    $hospitalCodeInactive = "DB002-HSP-INACT-$runToken"
    $endpointIdQido = [guid]::NewGuid().ToString()
    $endpointIdWado = [guid]::NewGuid().ToString()
    $endpointIdStow = [guid]::NewGuid().ToString()
    $actorIdUser = [guid]::NewGuid().ToString()
    $actorIdService = [guid]::NewGuid().ToString()
    $actorIdSuspended = [guid]::NewGuid().ToString()
    $actorIdInactive = [guid]::NewGuid().ToString()
    $subject = "synthetic-$runToken"

    $sql = @"
DO `$`$
DECLARE
  actual_count integer;
BEGIN
  IF EXISTS (
    VALUES ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB002_REQUIRED_TABLE_MISSING'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('consents'), ('consent_actions'),
      ('transfer_grants'), ('transfer_grant_scopes'), ('imaging_packages'), ('study_references'),
      ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB002_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('organizations','organization_id','uuid',NULL::integer,'NO'),
      ('organizations','organization_code','character varying',64,'NO'),
      ('organizations','name','character varying',200,'NO'),
      ('organizations','organization_type','character varying',32,'NO'),
      ('organizations','status','character varying',20,'NO'),
      ('organizations','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('organizations','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('tenants','tenant_id','uuid',NULL::integer,'NO'),
      ('tenants','organization_id','uuid',NULL::integer,'NO'),
      ('tenants','tenant_code','character varying',64,'NO'),
      ('tenants','name','character varying',200,'NO'),
      ('tenants','status','character varying',20,'NO'),
      ('tenants','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('tenants','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('hospitals','hospital_id','uuid',NULL::integer,'NO'),
      ('hospitals','tenant_id','uuid',NULL::integer,'NO'),
      ('hospitals','organization_id','uuid',NULL::integer,'NO'),
      ('hospitals','hospital_code','character varying',64,'NO'),
      ('hospitals','name','character varying',200,'NO'),
      ('hospitals','environment_type','character varying',20,'NO'),
      ('hospitals','status','character varying',20,'NO'),
      ('hospitals','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('hospitals','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('hospital_endpoints','endpoint_id','uuid',NULL::integer,'NO'),
      ('hospital_endpoints','hospital_id','uuid',NULL::integer,'NO'),
      ('hospital_endpoints','endpoint_type','character varying',20,'NO'),
      ('hospital_endpoints','base_url','character varying',500,'NO'),
      ('hospital_endpoints','enabled','boolean',NULL::integer,'NO'),
      ('hospital_endpoints','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('hospital_endpoints','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('actors','actor_id','uuid',NULL::integer,'NO'),
      ('actors','tenant_id','uuid',NULL::integer,'NO'),
      ('actors','hospital_id','uuid',NULL::integer,'YES'),
      ('actors','actor_type','character varying',20,'NO'),
      ('actors','external_subject','character varying',255,'NO'),
      ('actors','display_name','character varying',200,'YES'),
      ('actors','status','character varying',20,'NO'),
      ('actors','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('actors','updated_at','timestamp with time zone',NULL::integer,'NO')
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
       AND actual.table_name IN ('organizations','tenants','hospitals','hospital_endpoints','actors')
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB002_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('organizations','tenants','hospitals','hospital_endpoints','actors')
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB002_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'organizations_status_idx', 'tenants_organization_id_idx', 'tenants_status_idx',
     'hospitals_tenant_id_idx', 'hospitals_organization_id_idx', 'hospitals_status_idx',
     'hospital_endpoints_hospital_id_idx', 'hospital_endpoints_endpoint_type_idx',
     'actors_tenant_id_idx', 'actors_hospital_id_idx', 'actors_status_idx'
   );
  IF actual_count <> 11 THEN RAISE EXCEPTION 'DB002_INDEX_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'c'
     AND conname IN ('organizations_status_check','tenants_status_check',
       'hospitals_environment_type_check','hospital_endpoints_endpoint_type_check','actors_actor_type_check',
       'hospitals_status_check','actors_status_check');
  IF actual_count <> 7 THEN RAISE EXCEPTION 'DB002_CHECK_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'u'
     AND conname IN ('organizations_organization_code_unique','tenants_tenant_code_unique',
       'hospitals_hospital_code_unique','hospital_endpoints_hospital_type_unique',
       'actors_tenant_subject_unique','tenants_tenant_org_unique','hospitals_tenant_hospital_unique');
  IF actual_count <> 7 THEN RAISE EXCEPTION 'DB002_UNIQUE_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'p'
     AND conrelid IN ('organizations'::regclass,'tenants'::regclass,'hospitals'::regclass,
       'hospital_endpoints'::regclass,'actors'::regclass);
  IF actual_count <> 5 THEN RAISE EXCEPTION 'DB002_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype = 'f'
     AND conrelid IN ('organizations'::regclass,'tenants'::regclass,'hospitals'::regclass,
       'hospital_endpoints'::regclass,'actors'::regclass);
  IF actual_count <> 8 THEN RAISE EXCEPTION 'DB002_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace AND contype = 'f'
       AND conrelid IN ('tenants'::regclass,'hospitals'::regclass,'hospital_endpoints'::regclass,'actors'::regclass)
       AND confdeltype <> 'r'
  ) THEN RAISE EXCEPTION 'DB002_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES
  ('$orgId', '$organizationCode', 'Synthetic Organization One', 'SYNTHETIC', 'ACTIVE', now(), now()),
  ('$orgId2', '$organizationCode2', 'Synthetic Organization Two', 'DB002_CUSTOM_ORGANIZATION_TYPE', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES
  ('$tenantId', '$orgId', '$tenantCode', 'Synthetic Tenant One', 'ACTIVE', now(), now()),
  ('$tenantId2', '$orgId2', '$tenantCode2', 'Synthetic Tenant Two', 'SUSPENDED', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalId', '$tenantId', '$orgId', '$hospitalCode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalId2', '$tenantId2', '$orgId2', '$hospitalCode2', 'Synthetic Hospital B', 'DEVELOPMENT', 'ACTIVE', now(), now()),
  ('$hospitalIdSuspended', '$tenantId', '$orgId', '$hospitalCodeSuspended', 'Synthetic Suspended Hospital', 'TEST', 'SUSPENDED', now(), now()),
  ('$hospitalIdInactive', '$tenantId', '$orgId', '$hospitalCodeInactive', 'Synthetic Inactive Hospital', 'TEST', 'INACTIVE', now(), now());
INSERT INTO hospital_endpoints (endpoint_id, hospital_id, endpoint_type, base_url, enabled, created_at, updated_at)
VALUES
  ('$endpointIdQido', '$hospitalId', 'QIDO_RS', 'https://orthanc-a:8042/dicom-web', true, now(), now()),
  ('$endpointIdWado', '$hospitalId', 'WADO_RS', 'https://orthanc-a:8042/dicom-web', true, now(), now()),
  ('$endpointIdStow', '$hospitalId', 'STOW_RS', 'https://orthanc-a:8042/dicom-web', true, now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES
  ('$actorIdUser', '$tenantId', '$hospitalId', 'USER', '$subject', 'Synthetic User', 'ACTIVE', now(), now()),
  ('$actorIdService', '$tenantId', NULL, 'SERVICE', 'service-$runToken', NULL, 'ACTIVE', now(), now()),
  ('$actorIdSuspended', '$tenantId', '$hospitalId', 'USER', 'suspended-$runToken', 'Synthetic Suspended Actor', 'SUSPENDED', now(), now()),
  ('$actorIdInactive', '$tenantId', '$hospitalId', 'USER', 'inactive-$runToken', 'Synthetic Inactive Actor', 'INACTIVE', now(), now());

DO `$`$
BEGIN
  BEGIN INSERT INTO organizations VALUES (gen_random_uuid(), '$organizationCode', 'Duplicate', 'SYNTHETIC', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ORGANIZATION_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO tenants VALUES (gen_random_uuid(), '$orgId', '$tenantCode', 'Duplicate', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_TENANT_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantId', '$orgId', '$hospitalCode', 'Duplicate', 'TEST', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO hospital_endpoints VALUES (gen_random_uuid(), '$hospitalId', 'QIDO_RS', 'http://synthetic.invalid/dicom-web', true, now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ENDPOINT_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), '$tenantId', NULL, 'SERVICE', '$subject', NULL, 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_UNIQUE'; EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN INSERT INTO organizations VALUES (gen_random_uuid(), 'DB002-invalid-org-status-$runToken', 'Invalid', 'SYNTHETIC', 'INVALID', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ORG_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO tenants VALUES (gen_random_uuid(), '$orgId', 'DB002-invalid-tenant-status-$runToken', 'Invalid', 'INVALID', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_TENANT_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantId', '$orgId', 'DB002-invalid-env-$runToken', 'Invalid', 'PRODUCTION', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_ENV_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantId', '$orgId', 'DB002-invalid-hospital-status-$runToken', 'Invalid', 'TEST', 'INVALID', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO hospital_endpoints VALUES (gen_random_uuid(), '$hospitalId', 'FTP', 'http://synthetic.invalid/ftp', true, now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ENDPOINT_TYPE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), '$tenantId', NULL, 'ADMIN', 'invalid-$runToken', NULL, 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_TYPE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), '$tenantId', NULL, 'SERVICE', 'invalid-status-$runToken', NULL, 'INVALID', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO tenants VALUES (gen_random_uuid(), gen_random_uuid(), 'DB002-invalid-tenant-fk-$runToken', 'Invalid', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_TENANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), gen_random_uuid(), '$orgId', 'DB002-H1-$runToken', 'Invalid', 'TEST', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_TENANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantId', gen_random_uuid(), 'DB002-H2-$runToken', 'Invalid', 'TEST', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_ORG_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantId', '$orgId2', 'DB002-owner-mismatch-$runToken', 'Invalid owner pair', 'TEST', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_OWNER_PAIR_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO hospital_endpoints VALUES (gen_random_uuid(), gen_random_uuid(), 'QIDO_RS', 'http://synthetic.invalid/dicom-web', true, now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ENDPOINT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), gen_random_uuid(), NULL, 'SERVICE', 'invalid-tenant-$runToken', NULL, 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_TENANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), '$tenantId', gen_random_uuid(), 'USER', 'invalid-hospital-$runToken', NULL, 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO actors VALUES (gen_random_uuid(), '$tenantId', '$hospitalId2', 'USER', 'actor-owner-mismatch-$runToken', NULL, 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB002_EXPECTED_ACTOR_OWNER_PAIR_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM organizations WHERE organization_id = '$orgId';
    RAISE EXCEPTION 'DB002_EXPECTED_ORG_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM tenants WHERE tenant_id = '$tenantId';
    RAISE EXCEPTION 'DB002_EXPECTED_TENANT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalId';
    RAISE EXCEPTION 'DB002_EXPECTED_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;
ROLLBACK;

SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code IN ('$organizationCode','$organizationCode2')) = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code IN ('$tenantCode','$tenantCode2')) = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalCode','$hospitalCode2','$hospitalCodeSuspended','$hospitalCodeInactive')) = 0
  AND (SELECT count(*) FROM hospital_endpoints WHERE endpoint_id IN ('$endpointIdQido','$endpointIdWado','$endpointIdStow')) = 0
  AND (SELECT count(*) FROM actors WHERE actor_id IN ('$actorIdUser','$actorIdService','$actorIdSuspended','$actorIdInactive')) = 0
THEN 'db002_rollback=PASS' ELSE 'db002_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db002_rollback=PASS") {
        throw "DB-002 registry constraints or transaction rollback test failed."
    }

    Write-Output "db002_schema=PASS tables=5 columns=39 primary_keys=5 explicit_indexes=11 unique=7 checks=7 foreign_keys=8"
    Write-Output "db002_synthetic_constraints=PASS natural_unique=5 reference_unique=2 check=7 foreign_key=8 delete_restrict=3 owner_pair_rejections=2"
    Write-Output "db002_rollback=PASS synthetic_rows_persisted=0"
    Write-Output "db002_registry_status=PASS"
}
finally { Pop-Location }
