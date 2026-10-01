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
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-004 test input is missing: $([IO.Path]::GetFileName($file))" }
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
        throw "Local migration role does not match the approved DB-004 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-004 tests." }
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
    $organizationCode = "DB004-ORG-$runToken"
    $tenantCode = "DB004-TEN-$runToken"
    $hospitalACode = "DB004-HA-$runToken"
    $hospitalBCode = "DB004-HB-$runToken"
    $patientRefCode = "MQ-TEST-DB004-$runToken"
    $states = @("REQUESTED", "CONSENT_PENDING", "CONSENTED", "AUTHORIZED", "READY", "ACTIVE", "COMPLETED", "REJECTED", "EXPIRED", "REVOKED", "FAILED", "CANCELLED")
    $sessionIds = @((1..$states.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $sessionValues = for ($i = 0; $i -lt $states.Count; $i++) {
        $expiresAt = if ($states[$i] -eq "COMPLETED") { "now() + interval '1 day'" } else { "NULL" }
        $completedAt = if ($states[$i] -eq "COMPLETED") { "now()" } else { "NULL" }
        "('$($sessionIds[$i])', '$patientRefId', '$hospitalAId', '$hospitalBId', '$actorId', 'synthetic-imaging-exchange', '$($states[$i])', now(), now(), $expiresAt, $completedAt, '$([guid]::NewGuid())')"
    }
    $sessionValuesSql = $sessionValues -join ",`n"

    $sql = @"
DO `$`$
DECLARE
  actual_count integer;
BEGIN
  IF EXISTS (
    VALUES ('exchange_sessions')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB004_REQUIRED_TABLE_MISSING'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('consents'), ('consent_actions'),
      ('transfer_grants'), ('transfer_grant_scopes'), ('imaging_packages'), ('study_references'),
      ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB004_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('exchange_sessions','session_id','uuid',NULL::integer,'NO'),
      ('exchange_sessions','patient_ref_id','uuid',NULL::integer,'NO'),
      ('exchange_sessions','source_hospital_id','uuid',NULL::integer,'NO'),
      ('exchange_sessions','destination_hospital_id','uuid',NULL::integer,'NO'),
      ('exchange_sessions','requester_actor_id','uuid',NULL::integer,'NO'),
      ('exchange_sessions','purpose','character varying',255,'NO'),
      ('exchange_sessions','state','character varying',32,'NO'),
      ('exchange_sessions','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('exchange_sessions','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('exchange_sessions','expires_at','timestamp with time zone',NULL::integer,'YES'),
      ('exchange_sessions','completed_at','timestamp with time zone',NULL::integer,'YES'),
      ('exchange_sessions','idempotency_key','uuid',NULL::integer,'NO')
  ), differences AS (
    SELECT expected.column_name
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
    SELECT actual.column_name
      FROM information_schema.columns actual
      LEFT JOIN expected ON expected.column_name = actual.column_name
       AND expected.table_name = actual.table_name
     WHERE actual.table_schema = 'public'
       AND actual.table_name = 'exchange_sessions'
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB004_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'exchange_sessions'
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB004_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid = 'exchange_sessions'::regclass
     AND contype = 'p';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'DB004_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid = 'exchange_sessions'::regclass
     AND contype = 'f';
  IF actual_count <> 4 THEN RAISE EXCEPTION 'DB004_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND conrelid = 'exchange_sessions'::regclass AND contype = 'f' AND confdeltype <> 'r')
    THEN RAISE EXCEPTION 'DB004_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid = 'exchange_sessions'::regclass
     AND contype = 'c';
  IF actual_count <> 2 THEN RAISE EXCEPTION 'DB004_CHECK_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND conrelid = 'exchange_sessions'::regclass
     AND contype = 'u';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'DB004_IDEMPOTENCY_UNIQUE_CONSTRAINT_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'exchange_sessions_patient_ref_id_idx', 'exchange_sessions_source_hospital_id_idx',
     'exchange_sessions_destination_hospital_id_idx', 'exchange_sessions_requester_actor_id_idx',
     'exchange_sessions_state_idx', 'exchange_sessions_created_at_idx',
     'exchange_sessions_destination_state_idx'
   );
  IF actual_count <> 7 THEN RAISE EXCEPTION 'DB004_INDEX_INVENTORY_MISMATCH'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES ('$organizationId', '$organizationCode', 'Synthetic Exchange Organization', 'SYNTHETIC', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES ('$tenantId', '$organizationId', '$tenantCode', 'Synthetic Exchange Tenant', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalAId', '$tenantId', '$organizationId', '$hospitalACode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalBId', '$tenantId', '$organizationId', '$hospitalBCode', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES ('$actorId', '$tenantId', '$hospitalAId', 'USER', 'synthetic-actor-$runToken', 'Synthetic Requester', 'ACTIVE', now(), now());
INSERT INTO patient_refs (patient_ref_id, patient_ref_code, status, created_at, updated_at)
VALUES ('$patientRefId', '$patientRefCode', 'ACTIVE', now(), now());
INSERT INTO exchange_sessions (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, purpose, state, created_at, updated_at, expires_at, completed_at, idempotency_key)
VALUES
$sessionValuesSql;

DO `$`$
BEGIN
  BEGIN INSERT INTO exchange_sessions VALUES ('$($sessionIds[0])', '$patientRefId', '$hospitalAId', '$hospitalBId', '$actorId', 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_SESSION_PRIMARY_KEY'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), '$patientRefId', '$hospitalAId', '$hospitalBId', '$actorId', 'synthetic-imaging-exchange', 'UNKNOWN', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_STATE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), '$patientRefId', '$hospitalAId', '$hospitalAId', '$actorId', 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_DESTINATION_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), gen_random_uuid(), '$hospitalAId', '$hospitalBId', '$actorId', 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_PATIENT_REF_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), '$patientRefId', gen_random_uuid(), '$hospitalBId', '$actorId', 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_SOURCE_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), '$patientRefId', '$hospitalAId', gen_random_uuid(), '$actorId', 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_DESTINATION_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO exchange_sessions VALUES (gen_random_uuid(), '$patientRefId', '$hospitalAId', '$hospitalBId', gen_random_uuid(), 'synthetic-imaging-exchange', 'REQUESTED', now(), now(), NULL, NULL, gen_random_uuid());
    RAISE EXCEPTION 'DB004_EXPECTED_REQUESTER_ACTOR_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM patient_refs WHERE patient_ref_id = '$patientRefId';
    RAISE EXCEPTION 'DB004_EXPECTED_PATIENT_REF_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalAId';
    RAISE EXCEPTION 'DB004_EXPECTED_SOURCE_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalBId';
    RAISE EXCEPTION 'DB004_EXPECTED_DESTINATION_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM actors WHERE actor_id = '$actorId';
    RAISE EXCEPTION 'DB004_EXPECTED_REQUESTER_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;

ROLLBACK;
SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code = '$organizationCode') = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code = '$tenantCode') = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalACode','$hospitalBCode')) = 0
  AND (SELECT count(*) FROM patient_refs WHERE patient_ref_code = '$patientRefCode') = 0
  AND (SELECT count(*) FROM actors WHERE external_subject = 'synthetic-actor-$runToken') = 0
  AND (SELECT count(*) FROM exchange_sessions WHERE session_id IN ('$($sessionIds -join "','")')) = 0
THEN 'db004_rollback=PASS' ELSE 'db004_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db004_rollback=PASS") {
        throw "DB-004 ExchangeSession constraints or transaction rollback test failed; SQL output suppressed."
    }

    Write-Output "db004_schema=PASS scope_tables=1 columns=12 primary_keys=1 explicit_indexes=7 checks=2 foreign_keys=4 idempotency_unique=1"
    Write-Output "db004_synthetic_constraints=PASS states=12 invalid_state=1 same_hospital=1 invalid_fk=4 primary_key=1 delete_restrict=4"
    Write-Output "db004_rollback=PASS synthetic_session_rows_persisted=0"
    Write-Output "db004_exchange_status=PASS"
}
finally { Pop-Location }
