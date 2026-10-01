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
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-005 test input is missing: $([IO.Path]::GetFileName($file))" }
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
        throw "Local migration role does not match the approved DB-005 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-005 tests." }
    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $postgresId | Out-String).Trim() | ConvertFrom-Json
    $databaseNetworks = @($networkMap.PSObject.Properties.Name | Where-Object { $_ -match '(^|_)database$' })
    if ($databaseNetworks.Count -ne 1) { throw "PostgreSQL is not attached to exactly one isolated database network." }

    $runToken = [guid]::NewGuid().ToString("N").ToUpperInvariant()
    $organizationId = [guid]::NewGuid().ToString()
    $tenantId = [guid]::NewGuid().ToString()
    $hospitalAId = [guid]::NewGuid().ToString()
    $hospitalBId = [guid]::NewGuid().ToString()
    $requesterActorId = [guid]::NewGuid().ToString()
    $recipientActorId = [guid]::NewGuid().ToString()
    $patientRefId = [guid]::NewGuid().ToString()
    $sessionId = [guid]::NewGuid().ToString()
    $packageId = [guid]::NewGuid().ToString()
    $organizationCode = "DB005-ORG-$runToken"
    $tenantCode = "DB005-TEN-$runToken"
    $hospitalACode = "DB005-HA-$runToken"
    $hospitalBCode = "DB005-HB-$runToken"
    $patientRefCode = "MQ-TEST-DB005-$runToken"
    $sessionPurpose = "synthetic-consent-grant-schema-test"

    $consentStatuses = @("PENDING", "ACTIVE", "WITHDRAWN", "EXPIRED", "REJECTED")
    $consentIds = @((1..$consentStatuses.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $consentValues = for ($i = 0; $i -lt $consentStatuses.Count; $i++) {
        $issuedAt = if ($consentStatuses[$i] -eq "PENDING") { "NULL" } else { "now()" }
        $expiresAt = if ($consentStatuses[$i] -eq "PENDING") { "NULL" } else { "now() + interval '1 day'" }
        $withdrawnAt = if ($consentStatuses[$i] -eq "WITHDRAWN") { "now()" } else { "NULL" }
        "('$($consentIds[$i])', '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', '$packageId', '$($consentStatuses[$i])', $($i + 1), $issuedAt, $expiresAt, $withdrawnAt, now(), now())"
    }
    $consentValuesSql = $consentValues -join ",`n"
    $activeConsentId = $consentIds[1]

    $actions = @("VIEW", "DOWNLOAD", "PACS_IMPORT", "MOBILE_EXPORT")
    $consentActionIds = @((1..$actions.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $actionValues = for ($i = 0; $i -lt $actions.Count; $i++) {
        "('$($consentActionIds[$i])', '$activeConsentId', '$($actions[$i])')"
    }
    $actionValuesSql = $actionValues -join ",`n"

    $grantStatuses = @("ACTIVE", "EXPIRED", "REVOKED", "CONSUMED")
    $grantIds = @((1..$grantStatuses.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $grantValues = for ($i = 0; $i -lt $grantStatuses.Count; $i++) {
        $actorValue = if ($i -eq 0) { "'$recipientActorId'" } else { "NULL" }
        $packageValue = if ($i -eq 0) { "'$packageId'" } else { "NULL" }
        "('$($grantIds[$i])', '$sessionId', '$activeConsentId', '$tenantId', '$hospitalBId', $actorValue, $packageValue, '$($grantStatuses[$i])', now(), now() + interval '1 day', NULL, now())"
    }
    $grantValuesSql = $grantValues -join ",`n"
    $activeGrantId = $grantIds[0]

    $scopes = @("study:view", "study:download", "study:pacs-transfer", "study:mobile-export")
    $scopeIds = @((1..$scopes.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $scopeValues = for ($i = 0; $i -lt $scopes.Count; $i++) {
        "('$($scopeIds[$i])', '$activeGrantId', '$($scopes[$i])')"
    }
    $scopeValuesSql = $scopeValues -join ",`n"

    $sql = @"
DO `$`$
DECLARE
  actual_count integer;
BEGIN
  IF EXISTS (
    VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('imaging_packages'),
      ('study_references'), ('consents'), ('consent_actions'), ('transfer_grants'),
      ('transfer_grant_scopes')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB005_REQUIRED_TABLE_MISSING'; END IF;
  SELECT count(*) INTO actual_count FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations';
  IF actual_count < 14 THEN RAISE EXCEPTION 'DB005_PRODUCT_TABLE_COUNT_BELOW_SCOPE'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('imaging_packages'),
      ('study_references'), ('consents'), ('consent_actions'), ('transfer_grants'),
      ('transfer_grant_scopes'), ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB005_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('consents','consent_id','uuid',NULL::integer,'NO'),
      ('consents','exchange_session_id','uuid',NULL::integer,'NO'),
      ('consents','patient_ref_id','uuid',NULL::integer,'NO'),
      ('consents','source_hospital_id','uuid',NULL::integer,'NO'),
      ('consents','destination_hospital_id','uuid',NULL::integer,'NO'),
      ('consents','imaging_package_id','uuid',NULL::integer,'YES'),
      ('consents','status','character varying',20,'NO'),
      ('consents','consent_version','integer',NULL::integer,'NO'),
      ('consents','issued_at','timestamp with time zone',NULL::integer,'YES'),
      ('consents','expires_at','timestamp with time zone',NULL::integer,'YES'),
      ('consents','withdrawn_at','timestamp with time zone',NULL::integer,'YES'),
      ('consents','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('consents','updated_at','timestamp with time zone',NULL::integer,'NO'),
      ('consent_actions','consent_action_id','uuid',NULL::integer,'NO'),
      ('consent_actions','consent_id','uuid',NULL::integer,'NO'),
      ('consent_actions','action','character varying',32,'NO'),
      ('transfer_grants','grant_id','uuid',NULL::integer,'NO'),
      ('transfer_grants','exchange_session_id','uuid',NULL::integer,'NO'),
      ('transfer_grants','consent_id','uuid',NULL::integer,'NO'),
      ('transfer_grants','recipient_tenant_id','uuid',NULL::integer,'NO'),
      ('transfer_grants','recipient_hospital_id','uuid',NULL::integer,'NO'),
      ('transfer_grants','recipient_actor_id','uuid',NULL::integer,'YES'),
      ('transfer_grants','imaging_package_id','uuid',NULL::integer,'YES'),
      ('transfer_grants','status','character varying',20,'NO'),
      ('transfer_grants','issued_at','timestamp with time zone',NULL::integer,'NO'),
      ('transfer_grants','expires_at','timestamp with time zone',NULL::integer,'NO'),
      ('transfer_grants','revoked_at','timestamp with time zone',NULL::integer,'YES'),
      ('transfer_grants','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('transfer_grants','idempotency_key','uuid',NULL::integer,'YES'),
      ('transfer_grant_scopes','grant_scope_id','uuid',NULL::integer,'NO'),
      ('transfer_grant_scopes','grant_id','uuid',NULL::integer,'NO'),
      ('transfer_grant_scopes','scope','character varying',64,'NO')
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
       AND actual.table_name IN ('consents','consent_actions','transfer_grants','transfer_grant_scopes')
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB005_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('consents','consent_actions','transfer_grants','transfer_grant_scopes')
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB005_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('consents'::regclass,'consent_actions'::regclass,'transfer_grants'::regclass,'transfer_grant_scopes'::regclass)
     AND contype = 'p';
  IF actual_count <> 4 THEN RAISE EXCEPTION 'DB005_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('consents'::regclass,'consent_actions'::regclass,'transfer_grants'::regclass,'transfer_grant_scopes'::regclass)
     AND contype = 'f';
  IF actual_count <> 13 THEN RAISE EXCEPTION 'DB005_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN ('consents'::regclass,'consent_actions'::regclass,'transfer_grants'::regclass,'transfer_grant_scopes'::regclass)
        AND contype = 'f' AND confdeltype <> 'r')
    THEN RAISE EXCEPTION 'DB005_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('consents'::regclass,'consent_actions'::regclass,'transfer_grants'::regclass,'transfer_grant_scopes'::regclass)
     AND contype = 'c';
  IF actual_count <> 7 THEN RAISE EXCEPTION 'DB005_CHECK_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('consents'::regclass,'consent_actions'::regclass,'transfer_grants'::regclass,'transfer_grant_scopes'::regclass)
     AND contype = 'u';
  IF actual_count <> 3 THEN RAISE EXCEPTION 'DB005_UNIQUE_INVENTORY_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'consents_one_active_per_session_uidx', 'consents_exchange_session_id_idx',
     'consents_patient_ref_id_idx', 'consents_status_idx', 'consents_expires_at_idx',
     'consent_actions_consent_id_idx', 'transfer_grants_exchange_session_id_idx',
     'transfer_grants_consent_id_idx', 'transfer_grants_recipient_tenant_id_idx',
     'transfer_grants_recipient_hospital_id_idx', 'transfer_grants_status_idx',
     'transfer_grants_expires_at_idx', 'transfer_grants_exchange_session_status_idx',
     'transfer_grants_tenant_actor_idempotency_key_unique'
  );
  IF actual_count <> 14 THEN RAISE EXCEPTION 'DB005_INDEX_INVENTORY_MISMATCH'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES ('$organizationId', '$organizationCode', 'Synthetic Consent Organization', 'SYNTHETIC', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES ('$tenantId', '$organizationId', '$tenantCode', 'Synthetic Consent Tenant', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalAId', '$tenantId', '$organizationId', '$hospitalACode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalBId', '$tenantId', '$organizationId', '$hospitalBCode', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES
  ('$requesterActorId', '$tenantId', '$hospitalAId', 'USER', 'synthetic-requester-$runToken', 'Synthetic Requester', 'ACTIVE', now(), now()),
  ('$recipientActorId', '$tenantId', '$hospitalBId', 'USER', 'synthetic-recipient-$runToken', 'Synthetic Recipient', 'ACTIVE', now(), now());
INSERT INTO patient_refs (patient_ref_id, patient_ref_code, status, created_at, updated_at)
VALUES ('$patientRefId', '$patientRefCode', 'ACTIVE', now(), now());
INSERT INTO exchange_sessions (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, purpose, state, created_at, updated_at, idempotency_key)
VALUES ('$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', '$requesterActorId', '$sessionPurpose', 'READY', now(), now(), gen_random_uuid());
INSERT INTO imaging_packages (package_id, exchange_session_id, patient_ref_id, source_hospital_id, state, storage_ref, study_count, created_at, updated_at)
VALUES ('$packageId', '$sessionId', '$patientRefId', '$hospitalAId', 'AVAILABLE', NULL, 1, now(), now());
INSERT INTO consents (consent_id, exchange_session_id, patient_ref_id, source_hospital_id, destination_hospital_id, imaging_package_id, status, consent_version, issued_at, expires_at, withdrawn_at, created_at, updated_at)
VALUES
$consentValuesSql;
INSERT INTO consent_actions (consent_action_id, consent_id, action)
VALUES
$actionValuesSql;
INSERT INTO transfer_grants (grant_id, exchange_session_id, consent_id, recipient_tenant_id, recipient_hospital_id, recipient_actor_id, imaging_package_id, status, issued_at, expires_at, revoked_at, created_at)
VALUES
$grantValuesSql;
INSERT INTO transfer_grant_scopes (grant_scope_id, grant_id, scope)
VALUES
$scopeValuesSql;

DO `$`$
DECLARE
  affected_count integer;
BEGIN
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', NULL, 'UNKNOWN', 100, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', NULL, 'PENDING', 0, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_VERSION_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO consent_actions VALUES (gen_random_uuid(), '$activeConsentId', 'INVALID_ACTION');
    RAISE EXCEPTION 'DB005_EXPECTED_ACTION_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', '$tenantId', '$hospitalBId', NULL, NULL, 'UNKNOWN', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', '$tenantId', '$hospitalBId', NULL, NULL, 'ACTIVE', now(), now(), NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_EXPIRY_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grant_scopes VALUES (gen_random_uuid(), '$activeGrantId', 'invalid:scope');
    RAISE EXCEPTION 'DB005_EXPECTED_SCOPE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', NULL, 'PENDING', 1, NULL, NULL, NULL, now(), now())
    ON CONFLICT (exchange_session_id, consent_version) DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_VERSION_UNIQUE'; END IF;

  INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', NULL, 'ACTIVE', 100, now(), now() + interval '1 day', NULL, now(), now())
    ON CONFLICT (exchange_session_id) WHERE status = 'ACTIVE' DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'DB005_EXPECTED_ACTIVE_CONSENT_UNIQUE'; END IF;

  INSERT INTO consent_actions VALUES (gen_random_uuid(), '$activeConsentId', 'VIEW')
    ON CONFLICT (consent_id, action) DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_ACTION_UNIQUE'; END IF;

  INSERT INTO transfer_grant_scopes VALUES (gen_random_uuid(), '$activeGrantId', 'study:view')
    ON CONFLICT (grant_id, scope) DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'DB005_EXPECTED_GRANT_SCOPE_UNIQUE'; END IF;

  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), gen_random_uuid(), '$patientRefId', '$hospitalAId', '$hospitalBId', NULL, 'PENDING', 101, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', gen_random_uuid(), '$hospitalAId', '$hospitalBId', NULL, 'PENDING', 102, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_PATIENT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', gen_random_uuid(), '$hospitalBId', NULL, 'PENDING', 103, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_SOURCE_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', gen_random_uuid(), NULL, 'PENDING', 104, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_DESTINATION_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO consents VALUES (gen_random_uuid(), '$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', gen_random_uuid(), 'PENDING', 105, NULL, NULL, NULL, now(), now());
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_PACKAGE_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO consent_actions VALUES (gen_random_uuid(), gen_random_uuid(), 'VIEW');
    RAISE EXCEPTION 'DB005_EXPECTED_ACTION_CONSENT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), gen_random_uuid(), '$activeConsentId', '$tenantId', '$hospitalBId', NULL, NULL, 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', gen_random_uuid(), '$tenantId', '$hospitalBId', NULL, NULL, 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_CONSENT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', gen_random_uuid(), '$hospitalBId', NULL, NULL, 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_TENANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', '$tenantId', gen_random_uuid(), NULL, NULL, 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', '$tenantId', '$hospitalBId', gen_random_uuid(), NULL, 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_ACTOR_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grants VALUES (gen_random_uuid(), '$sessionId', '$activeConsentId', '$tenantId', '$hospitalBId', NULL, gen_random_uuid(), 'ACTIVE', now(), now() + interval '1 day', NULL, now(), NULL);
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_PACKAGE_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO transfer_grant_scopes VALUES (gen_random_uuid(), gen_random_uuid(), 'study:view');
    RAISE EXCEPTION 'DB005_EXPECTED_SCOPE_GRANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM exchange_sessions WHERE session_id = '$sessionId';
    RAISE EXCEPTION 'DB005_EXPECTED_SESSION_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM patient_refs WHERE patient_ref_id = '$patientRefId';
    RAISE EXCEPTION 'DB005_EXPECTED_PATIENT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalAId';
    RAISE EXCEPTION 'DB005_EXPECTED_SOURCE_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalBId';
    RAISE EXCEPTION 'DB005_EXPECTED_DESTINATION_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM imaging_packages WHERE package_id = '$packageId';
    RAISE EXCEPTION 'DB005_EXPECTED_PACKAGE_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM consents WHERE consent_id = '$activeConsentId';
    RAISE EXCEPTION 'DB005_EXPECTED_CONSENT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM tenants WHERE tenant_id = '$tenantId';
    RAISE EXCEPTION 'DB005_EXPECTED_TENANT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM actors WHERE actor_id = '$recipientActorId';
    RAISE EXCEPTION 'DB005_EXPECTED_ACTOR_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM transfer_grants WHERE grant_id = '$activeGrantId';
    RAISE EXCEPTION 'DB005_EXPECTED_GRANT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;

ROLLBACK;
SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code = '$organizationCode') = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code = '$tenantCode') = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalACode','$hospitalBCode')) = 0
  AND (SELECT count(*) FROM patient_refs WHERE patient_ref_code = '$patientRefCode') = 0
  AND (SELECT count(*) FROM actors WHERE external_subject IN ('synthetic-requester-$runToken','synthetic-recipient-$runToken')) = 0
  AND (SELECT count(*) FROM exchange_sessions WHERE session_id = '$sessionId') = 0
  AND (SELECT count(*) FROM imaging_packages WHERE package_id = '$packageId') = 0
  AND (SELECT count(*) FROM consents WHERE consent_id IN ('$($consentIds -join "','")')) = 0
  AND (SELECT count(*) FROM consent_actions WHERE consent_action_id IN ('$($consentActionIds -join "','")')) = 0
  AND (SELECT count(*) FROM transfer_grants WHERE grant_id IN ('$($grantIds -join "','")')) = 0
  AND (SELECT count(*) FROM transfer_grant_scopes WHERE grant_scope_id IN ('$($scopeIds -join "','")')) = 0
THEN 'db005_rollback=PASS' ELSE 'db005_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db005_rollback=PASS") {
        $failureTags = @($result.Output | ForEach-Object {
            foreach ($match in [regex]::Matches([string]$_, "DB005_[A-Z_]+")) { $match.Value }
        } | Sort-Object -Unique)
        $safeTags = if ($failureTags.Count -eq 0) { "NO_DB005_ASSERTION_TAG" } else { $failureTags -join "," }
        $safeDiagnostics = @($result.Output | ForEach-Object {
            $line = $_.ToString()
            if ($line -match "^(ERROR:|psql:|FATAL:|db005_rollback=|CONTEXT: PL/pgSQL function inline_code_block line [0-9]+ at SQL statement)") {
                $line -replace '\b[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}\b', '<uuid>' -replace '\b(?:[0-9]+\.){5,}[0-9]+\b', '<uid>'
            }
        } | Select-Object -First 5)
        $safeDiagnostic = if ($safeDiagnostics.Count -eq 0) { "NO_SAFE_DIAGNOSTIC_LINE" } else { $safeDiagnostics -join " | " }
        throw "DB-005 Consent/Grant constraints or rollback test failed; psql_exit=$($result.ExitCode); failure_tag=$safeTags; diagnostic=$safeDiagnostic; SQL output suppressed."
    }

    Write-Output "db005_schema=PASS scope_tables=4 columns=32 primary_keys=4 explicit_indexes=14 checks=7 foreign_keys=13 unique_constraints=3"
    Write-Output "db005_synthetic_constraints=PASS consent_states=5 actions=4 grant_states=4 scopes=4 invalid_checks=6 invalid_fk=13 duplicate_keys=4 delete_restrict=9 nullable_fields=PASS"
    Write-Output "db005_rollback=PASS synthetic_consent_grant_rows_persisted=0"
    Write-Output "db005_consent_grant_status=PASS"
}
finally { Pop-Location }
