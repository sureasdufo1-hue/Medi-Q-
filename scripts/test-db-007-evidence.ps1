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
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-007 test input is missing: $([IO.Path]::GetFileName($file))" }
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
        throw "Local migration role does not match the approved DB-007 test boundary."
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $postgresId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresId)) { throw "PostgreSQL is not running for DB-007 tests." }
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
    $packageId = [guid]::NewGuid().ToString()
    $studyRefId = [guid]::NewGuid().ToString()
    $operationId = [guid]::NewGuid().ToString()
    $operationKey = [guid]::NewGuid().ToString()
    $operationDigest = ("{0}" -f ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))).Substring(0, 64)
    $organizationCode = "DB007-ORG-$runToken"
    $tenantCode = "DB007-TEN-$runToken"
    $hospitalACode = "DB007-HA-$runToken"
    $hospitalBCode = "DB007-HB-$runToken"
    $patientRefCode = "MQ-TEST-DB007-$runToken"
    $actorSubject = "synthetic-actor-$runToken"
    $sessionPurpose = "synthetic-evidence-schema-test"
    $uidToken = "{0}{1:D6}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), (Get-Random -Minimum 0 -Maximum 1000000)
    $studyUid = "1.2.826.0.1.3680043.10.543.7.$uidToken"

    $integrityStatuses = @("PENDING", "VERIFIED", "FAILED", "NOT_APPLICABLE")
    $verificationStages = @("SOURCE_CAPTURE", "DESTINATION_VERIFY", "END_TO_END", "END_TO_END")
    $integrityIds = @((1..$integrityStatuses.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $integrityValues = for ($i = 0; $i -lt $integrityStatuses.Count; $i++) {
        $studyValue = "'$studyRefId'"
        $sourceCount = if ($i -eq 0) { "3" } else { "1" }
        $destinationCount = if ($i -eq 0) { "NULL" } else { "1" }
        $algorithmValue = if ($i -eq 0) { "'SHA256-MANIFEST-V1'" } else { "'SHA-256'" }
        $digestValues = if ($i -eq 0) { "'sha256:$(([guid]::NewGuid().ToString('N')))$(([guid]::NewGuid().ToString('N')))', NULL" } elseif ($i -eq 1) { "'synthetic-source-digest', 'synthetic-destination-digest'" } else { "NULL, NULL" }
        $verifiedAt = if ($integrityStatuses[$i] -eq "VERIFIED" -or $integrityStatuses[$i] -eq "FAILED") { "now()" } else { "NULL" }
        $verifiedAt = if ($i -eq 0) { "NULL" } else { $verifiedAt }
        $operationValue = if ($i -eq 0) { "'$operationId'" } else { "NULL" }
        "('$($integrityIds[$i])', '$sessionId', '$packageId', $studyValue, '$($verificationStages[$i])', $algorithmValue, $digestValues, $sourceCount, $destinationCount, '$($integrityStatuses[$i])', $verifiedAt, now(), $operationValue)"
    }
    $integrityValuesSql = $integrityValues -join ",`n"
    $verifiedIntegrityId = $integrityIds[1]

    $transferTypes = @("PACS_IMPORT", "VIEW", "DOWNLOAD", "MOBILE_EXPORT")
    $transferStatuses = @("PENDING", "IN_PROGRESS", "COMPLETED", "FAILED")
    $provenanceIds = @((1..$transferTypes.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $provenanceValues = for ($i = 0; $i -lt $transferTypes.Count; $i++) {
        $isPacsImport = $transferTypes[$i] -eq "PACS_IMPORT"
        $studyValue = if ($isPacsImport) { "'$studyRefId'" } else { "NULL" }
        $destinationValue = if ($isPacsImport) { "'$hospitalBId'" } else { "NULL" }
        $integrityValue = if ($isPacsImport) { "'$verifiedIntegrityId'" } else { "NULL" }
        $ingestedAt = if ($isPacsImport) { "now()" } else { "NULL" }
        $transferredAt = if ($transferStatuses[$i] -eq "COMPLETED") { "now()" } else { "NULL" }
        $operationValue = if ($isPacsImport) { "'$operationId'" } else { "NULL" }
        "('$($provenanceIds[$i])', '$sessionId', '$packageId', $studyValue, '$hospitalAId', $destinationValue, $integrityValue, '$($transferTypes[$i])', '$($transferStatuses[$i])', $ingestedAt, $transferredAt, now(), $operationValue)"
    }
    $provenanceValuesSql = $provenanceValues -join ",`n"

    $auditResults = @("SUCCESS", "FAILURE", "ALLOW", "DENY")
    $auditActions = @("SESSION_CREATED", "AUTHORIZATION_DENIED", "PACS_TRANSFER_COMPLETED", "SYNTHETIC_EXTENSION_EVENT")
    $auditIds = @((1..$auditResults.Count | ForEach-Object { [guid]::NewGuid().ToString() }))
    $auditValues = for ($i = 0; $i -lt $auditResults.Count; $i++) {
        $actorValue = if ($i -eq 0) { "'$actorId'" } else { "NULL" }
        $tenantValue = if ($i -eq 0) { "'$tenantId'" } else { "NULL" }
        $sessionValue = if ($i -eq 0 -or $i -eq 2) { "'$sessionId'" } else { "NULL" }
        $resourceType = if ($i -eq 2) { "'ExchangeSession'" } else { "NULL" }
        $resourceId = if ($i -eq 2) { "'$sessionId'" } else { "NULL" }
        $reasonCode = if ($i -eq 1 -or $i -eq 3) { "'SYNTHETIC_REASON'" } else { "NULL" }
        $correlationValue = if ($i -eq 2) { "'$([guid]::NewGuid().ToString())'" } else { "NULL" }
        "('$($auditIds[$i])', now(), $actorValue, $tenantValue, $sessionValue, $resourceType, $resourceId, '$($auditActions[$i])', '$($auditResults[$i])', $reasonCode, $correlationValue, now())"
    }
    $auditValuesSql = $auditValues -join ",`n"

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
      ('transfer_grant_scopes'), ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
    EXCEPT
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) THEN RAISE EXCEPTION 'DB007_REQUIRED_TABLE_MISSING'; END IF;
  SELECT count(*) INTO actual_count FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations';
  IF actual_count <> 18 THEN RAISE EXCEPTION 'DB007_PRODUCT_TABLE_COUNT_MISMATCH'; END IF;
  IF EXISTS (
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
    EXCEPT VALUES
      ('organizations'), ('tenants'), ('hospitals'), ('hospital_endpoints'), ('actors'),
      ('patient_refs'), ('patient_mappings'), ('exchange_sessions'), ('imaging_packages'),
      ('study_references'), ('consents'), ('consent_actions'), ('transfer_grants'),
      ('transfer_grant_scopes'), ('integrity_evidence'), ('provenance_records'), ('audit_events'), ('pacs_transfer_operations')
  ) THEN RAISE EXCEPTION 'DB007_UNAPPROVED_TABLE_FOUND'; END IF;

  WITH expected(table_name, column_name, data_type, max_length, nullable) AS (
    VALUES
      ('integrity_evidence','integrity_id','uuid',NULL::integer,'NO'),
      ('integrity_evidence','exchange_session_id','uuid',NULL::integer,'NO'),
      ('integrity_evidence','package_id','uuid',NULL::integer,'NO'),
      ('integrity_evidence','study_ref_id','uuid',NULL::integer,'YES'),
      ('integrity_evidence','verification_stage','character varying',32,'NO'),
      ('integrity_evidence','algorithm','character varying',32,'YES'),
      ('integrity_evidence','source_digest','character varying',256,'YES'),
      ('integrity_evidence','destination_digest','character varying',256,'YES'),
      ('integrity_evidence','source_object_count','integer',NULL::integer,'YES'),
      ('integrity_evidence','destination_object_count','integer',NULL::integer,'YES'),
      ('integrity_evidence','status','character varying',20,'NO'),
      ('integrity_evidence','verified_at','timestamp with time zone',NULL::integer,'YES'),
      ('integrity_evidence','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('integrity_evidence','operation_id','uuid',NULL::integer,'YES'),
      ('provenance_records','provenance_id','uuid',NULL::integer,'NO'),
      ('provenance_records','exchange_session_id','uuid',NULL::integer,'NO'),
      ('provenance_records','package_id','uuid',NULL::integer,'NO'),
      ('provenance_records','study_ref_id','uuid',NULL::integer,'YES'),
      ('provenance_records','source_hospital_id','uuid',NULL::integer,'NO'),
      ('provenance_records','destination_hospital_id','uuid',NULL::integer,'YES'),
      ('provenance_records','integrity_id','uuid',NULL::integer,'YES'),
      ('provenance_records','transfer_type','character varying',32,'NO'),
      ('provenance_records','transfer_status','character varying',20,'NO'),
      ('provenance_records','ingested_at','timestamp with time zone',NULL::integer,'YES'),
      ('provenance_records','transferred_at','timestamp with time zone',NULL::integer,'YES'),
      ('provenance_records','created_at','timestamp with time zone',NULL::integer,'NO'),
      ('provenance_records','operation_id','uuid',NULL::integer,'YES'),
      ('audit_events','audit_event_id','uuid',NULL::integer,'NO'),
      ('audit_events','occurred_at','timestamp with time zone',NULL::integer,'NO'),
      ('audit_events','actor_id','uuid',NULL::integer,'YES'),
      ('audit_events','tenant_id','uuid',NULL::integer,'YES'),
      ('audit_events','exchange_session_id','uuid',NULL::integer,'YES'),
      ('audit_events','resource_type','character varying',64,'YES'),
      ('audit_events','resource_id','uuid',NULL::integer,'YES'),
      ('audit_events','action','character varying',64,'NO'),
      ('audit_events','result','character varying',20,'NO'),
      ('audit_events','reason_code','character varying',64,'YES'),
      ('audit_events','correlation_id','uuid',NULL::integer,'YES'),
      ('audit_events','created_at','timestamp with time zone',NULL::integer,'NO')
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
       AND actual.table_name IN ('integrity_evidence','provenance_records','audit_events')
       AND expected.column_name IS NULL
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB007_COLUMN_SHAPE_MISMATCH'; END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('integrity_evidence','provenance_records','audit_events')
     AND column_default IS NOT NULL;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB007_UNDOCUMENTED_COLUMN_DEFAULT'; END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
     AND contype = 'p';
  IF actual_count <> 3 THEN RAISE EXCEPTION 'DB007_PRIMARY_KEY_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
     AND contype = 'f';
  IF actual_count <> 14 THEN RAISE EXCEPTION 'DB007_FOREIGN_KEY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
        AND contype = 'f' AND confdeltype <> 'r')
    THEN RAISE EXCEPTION 'DB007_FOREIGN_KEY_DELETE_POLICY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
     AND contype = 'c';
  IF actual_count <> 9 THEN RAISE EXCEPTION 'DB007_CHECK_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
     AND contype = 'u';
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB007_UNDECLARED_UNIQUE_CONSTRAINT'; END IF;

  WITH expected(index_name) AS (
    VALUES
      ('integrity_evidence_exchange_session_id_idx'), ('integrity_evidence_package_id_idx'),
      ('integrity_evidence_status_idx'), ('integrity_evidence_operation_stage_unique'),
      ('provenance_records_exchange_session_id_idx'),
      ('provenance_records_package_id_idx'), ('provenance_records_source_hospital_id_idx'),
      ('provenance_records_destination_hospital_id_idx'), ('provenance_records_transfer_status_idx'),
      ('provenance_records_operation_id_unique'),
      ('audit_events_occurred_at_idx'), ('audit_events_exchange_session_occurred_at_idx'),
      ('audit_events_actor_occurred_at_idx'), ('audit_events_tenant_occurred_at_idx'),
      ('audit_events_correlation_id_idx')
  ), actual(index_name) AS (
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename IN ('integrity_evidence','provenance_records','audit_events')
       AND indexname NOT LIKE '%_pkey'
  ), differences AS (
    SELECT index_name FROM expected EXCEPT SELECT index_name FROM actual
    UNION ALL
    SELECT index_name FROM actual EXCEPT SELECT index_name FROM expected
  )
  SELECT count(*) INTO actual_count FROM differences;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'DB007_INDEX_INVENTORY_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count FROM pg_index
   WHERE indrelid IN ('integrity_evidence'::regclass,'provenance_records'::regclass,'audit_events'::regclass)
     AND indisunique AND NOT indisprimary;
  IF actual_count <> 2 OR NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
     WHERE i.indrelid='provenance_records'::regclass
       AND c.relname='provenance_records_operation_id_unique'
       AND i.indisunique AND i.indpred IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
     WHERE i.indrelid='integrity_evidence'::regclass
       AND c.relname='integrity_evidence_operation_stage_unique'
       AND i.indisunique AND i.indpred IS NOT NULL
  ) THEN RAISE EXCEPTION 'DB007_UNDECLARED_UNIQUE_INDEX'; END IF;
END
`$`$;

BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
VALUES ('$organizationId', '$organizationCode', 'Synthetic Evidence Organization', 'SYNTHETIC', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
VALUES ('$tenantId', '$organizationId', '$tenantCode', 'Synthetic Evidence Tenant', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
VALUES
  ('$hospitalAId', '$tenantId', '$organizationId', '$hospitalACode', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalBId', '$tenantId', '$organizationId', '$hospitalBCode', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
VALUES ('$actorId', '$tenantId', '$hospitalAId', 'USER', '$actorSubject', 'Synthetic Evidence Actor', 'ACTIVE', now(), now());
INSERT INTO patient_refs (patient_ref_id, patient_ref_code, status, created_at, updated_at)
VALUES ('$patientRefId', '$patientRefCode', 'ACTIVE', now(), now());
INSERT INTO exchange_sessions (session_id, patient_ref_id, source_hospital_id, destination_hospital_id, requester_actor_id, purpose, state, created_at, updated_at, idempotency_key)
VALUES ('$sessionId', '$patientRefId', '$hospitalAId', '$hospitalBId', '$actorId', '$sessionPurpose', 'READY', now(), now(), gen_random_uuid());
INSERT INTO imaging_packages (package_id, exchange_session_id, patient_ref_id, source_hospital_id, state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
VALUES ('$packageId', '$sessionId', '$patientRefId', '$hospitalAId', 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL);
INSERT INTO study_references (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
VALUES ('$studyRefId', '$packageId', '$hospitalAId', '$studyUid', 'CT', 1, 3, now());
INSERT INTO pacs_transfer_operations
 (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
  idempotency_key, request_digest, state, version, created_at, updated_at)
VALUES ('$operationId', '$tenantId', '$sessionId', '$studyRefId', '$actorId',
        '$operationKey', '$operationDigest', 'CREATED', 0, now(), now());

INSERT INTO integrity_evidence (integrity_id, exchange_session_id, package_id, study_ref_id, verification_stage, algorithm, source_digest, destination_digest, source_object_count, destination_object_count, status, verified_at, created_at, operation_id)
VALUES
$integrityValuesSql;
INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at, operation_id)
VALUES
$provenanceValuesSql;
INSERT INTO audit_events (audit_event_id, occurred_at, actor_id, tenant_id, exchange_session_id, resource_type, resource_id, action, result, reason_code, correlation_id, created_at)
VALUES
$auditValuesSql;

DO `$`$
BEGIN
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, 'UNKNOWN', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_STAGE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, 'END_TO_END', NULL, NULL, NULL, NULL, NULL, 'UNKNOWN', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, 'SOURCE_CAPTURE', NULL, NULL, NULL, -1, NULL, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_SOURCE_COUNT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, 'SOURCE_CAPTURE', NULL, NULL, NULL, NULL, -1, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_DESTINATION_COUNT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, '$hospitalAId', NULL, NULL, 'UNKNOWN', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_TRANSFER_TYPE_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, '$hospitalAId', NULL, NULL, 'VIEW', 'UNKNOWN', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_TRANSFER_STATUS_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO audit_events VALUES (gen_random_uuid(), now(), NULL, NULL, NULL, NULL, NULL, 'SYNTHETIC_EXTENSION_EVENT', 'UNKNOWN', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_AUDIT_RESULT_CHECK'; EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), gen_random_uuid(), '$packageId', NULL, 'DESTINATION_VERIFY', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', gen_random_uuid(), NULL, 'DESTINATION_VERIFY', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_PACKAGE_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence VALUES (gen_random_uuid(), '$sessionId', '$packageId', gen_random_uuid(), 'DESTINATION_VERIFY', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, now(), NULL);
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_STUDY_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO integrity_evidence
    (integrity_id, exchange_session_id, package_id, study_ref_id, verification_stage,
     algorithm, source_digest, source_object_count, status, verified_at, created_at, operation_id)
    VALUES (gen_random_uuid(), '$sessionId', '$packageId', '$studyRefId', 'SOURCE_CAPTURE',
     'SHA256-MANIFEST-V1', 'sha256:' || repeat('a',64), 1, 'PENDING', NULL, now(), gen_random_uuid());
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_OPERATION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), '$packageId', NULL, '$hospitalAId', NULL, NULL, 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', gen_random_uuid(), NULL, '$hospitalAId', NULL, NULL, 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_PACKAGE_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', gen_random_uuid(), '$hospitalAId', NULL, NULL, 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_STUDY_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, gen_random_uuid(), NULL, NULL, 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_SOURCE_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, '$hospitalAId', gen_random_uuid(), NULL, 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_DESTINATION_HOSPITAL_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at) VALUES (gen_random_uuid(), '$sessionId', '$packageId', NULL, '$hospitalAId', NULL, gen_random_uuid(), 'VIEW', 'PENDING', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_INTEGRITY_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO provenance_records (provenance_id, exchange_session_id, package_id, study_ref_id, source_hospital_id, destination_hospital_id, integrity_id, transfer_type, transfer_status, ingested_at, transferred_at, created_at, operation_id)
    VALUES (gen_random_uuid(), '$sessionId', '$packageId', '$studyRefId', '$hospitalAId', '$hospitalBId', '$verifiedIntegrityId', 'PACS_IMPORT', 'PENDING', now(), NULL, now(), gen_random_uuid());
    RAISE EXCEPTION 'DB007_EXPECTED_PROVENANCE_OPERATION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN INSERT INTO audit_events VALUES (gen_random_uuid(), now(), gen_random_uuid(), NULL, NULL, NULL, NULL, 'ACCESS_DENIED', 'DENY', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_AUDIT_ACTOR_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO audit_events VALUES (gen_random_uuid(), now(), NULL, gen_random_uuid(), NULL, NULL, NULL, 'ACCESS_DENIED', 'DENY', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_AUDIT_TENANT_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO audit_events VALUES (gen_random_uuid(), now(), NULL, NULL, gen_random_uuid(), NULL, NULL, 'ACCESS_DENIED', 'DENY', NULL, NULL, now());
    RAISE EXCEPTION 'DB007_EXPECTED_AUDIT_SESSION_FK'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM exchange_sessions WHERE session_id = '$sessionId';
    RAISE EXCEPTION 'DB007_EXPECTED_SESSION_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM imaging_packages WHERE package_id = '$packageId';
    RAISE EXCEPTION 'DB007_EXPECTED_PACKAGE_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM study_references WHERE study_ref_id = '$studyRefId';
    RAISE EXCEPTION 'DB007_EXPECTED_STUDY_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalAId';
    RAISE EXCEPTION 'DB007_EXPECTED_SOURCE_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM hospitals WHERE hospital_id = '$hospitalBId';
    RAISE EXCEPTION 'DB007_EXPECTED_DESTINATION_HOSPITAL_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM integrity_evidence WHERE integrity_id = '$verifiedIntegrityId';
    RAISE EXCEPTION 'DB007_EXPECTED_INTEGRITY_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM actors WHERE actor_id = '$actorId';
    RAISE EXCEPTION 'DB007_EXPECTED_ACTOR_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM pacs_transfer_operations WHERE operation_id = '$operationId';
    RAISE EXCEPTION 'DB007_EXPECTED_OPERATION_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN DELETE FROM tenants WHERE tenant_id = '$tenantId';
    RAISE EXCEPTION 'DB007_EXPECTED_TENANT_DELETE_RESTRICT'; EXCEPTION WHEN restrict_violation THEN NULL; END;
END
`$`$;

ROLLBACK;
SELECT CASE WHEN
  (SELECT count(*) FROM organizations WHERE organization_code = '$organizationCode') = 0
  AND (SELECT count(*) FROM tenants WHERE tenant_code = '$tenantCode') = 0
  AND (SELECT count(*) FROM hospitals WHERE hospital_code IN ('$hospitalACode','$hospitalBCode')) = 0
  AND (SELECT count(*) FROM patient_refs WHERE patient_ref_code = '$patientRefCode') = 0
  AND (SELECT count(*) FROM actors WHERE external_subject = '$actorSubject') = 0
  AND (SELECT count(*) FROM exchange_sessions WHERE session_id = '$sessionId') = 0
  AND (SELECT count(*) FROM imaging_packages WHERE package_id = '$packageId') = 0
  AND (SELECT count(*) FROM study_references WHERE study_ref_id = '$studyRefId') = 0
  AND (SELECT count(*) FROM integrity_evidence WHERE integrity_id IN ('$($integrityIds -join "','")')) = 0
  AND (SELECT count(*) FROM provenance_records WHERE provenance_id IN ('$($provenanceIds -join "','")')) = 0
  AND (SELECT count(*) FROM pacs_transfer_operations WHERE operation_id='$operationId') = 0
  AND (SELECT count(*) FROM audit_events WHERE audit_event_id IN ('$($auditIds -join "','")')) = 0
THEN 'db007_rollback=PASS' ELSE 'db007_rollback=FAIL' END;
"@

    $result = Invoke-LocalPsql -Network $databaseNetworks[0] -User $settings["MEDIQ_DB_MIGRATION_USER"] -Database $settings["MEDIQ_POSTGRES_DB"] -Password $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $sql
    if ($result.ExitCode -ne 0 -or ($result.Output -join "`n") -notmatch "db007_rollback=PASS") {
        $failureTags = @($result.Output | ForEach-Object {
            foreach ($match in [regex]::Matches([string]$_, "DB007_[A-Z_]+")) { $match.Value }
        } | Sort-Object -Unique)
        $safeTags = if ($failureTags.Count -eq 0) { "NO_DB007_ASSERTION_TAG" } else { $failureTags -join "," }
        $safeDiagnostics = @($result.Output | ForEach-Object {
            $line = $_.ToString()
            if ($line -match "^(ERROR:|psql:|FATAL:|db007_rollback=|CONTEXT: PL/pgSQL function inline_code_block line [0-9]+ at SQL statement)") {
                $line -replace '\b[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}\b', '<uuid>' -replace '\b(?:[0-9]+\.){5,}[0-9]+\b', '<uid>'
            }
        } | Select-Object -First 5)
        $safeDiagnostic = if ($safeDiagnostics.Count -eq 0) { "NO_SAFE_DIAGNOSTIC_LINE" } else { $safeDiagnostics -join " | " }
        throw "DB-007 evidence schema constraints or rollback test failed; psql_exit=$($result.ExitCode); failure_tag=$safeTags; diagnostic=$safeDiagnostic; SQL output suppressed."
    }

    Write-Output "db007_schema=PASS scope_tables=3 columns=39 primary_keys=3 explicit_indexes=15 checks=9 foreign_keys=14 unique_constraints=0 unique_indexes=2"
    Write-Output "db007_synthetic_constraints=PASS integrity_statuses=4 verification_stages=3 provenance_types=4 provenance_statuses=4 audit_results=4 invalid_checks=7 invalid_fk=14 delete_restrict=9 nullable_fields=PASS extensible_audit_action=PASS"
    Write-Output "db007_rollback=PASS synthetic_evidence_rows_persisted=0"
    Write-Output "db007_evidence_status=PASS"
}
finally { Pop-Location }
