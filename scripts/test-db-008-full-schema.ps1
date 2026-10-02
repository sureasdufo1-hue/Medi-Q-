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
$approvedProductTables = @(
    "organizations", "tenants", "hospitals", "hospital_endpoints", "actors",
    "patient_refs", "patient_mappings", "exchange_sessions", "consents", "consent_actions",
    "transfer_grants", "transfer_grant_scopes", "imaging_packages", "study_references",
    "integrity_evidence", "provenance_records", "audit_events", "pacs_transfer_operations"
)
$expectedCatalogCounts = "18|50|17|40"

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

function Invoke-DockerQuiet {
    param([string]$Label, [string[]]$DockerArgs)
    $null = @(& docker @DockerArgs 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "$Label failed (exit=$exitCode); raw output suppressed." }
}

function Invoke-ScratchPsqlRaw {
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
        $output = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -h postgres -U $User -d $Database -f - 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
        $sqlState = $null
        if ($exitCode -ne 0 -and ($output -join "`n") -match '\b([0-9][0-9A-Z]{4})\b') { $sqlState = $Matches[1] }
        return [pscustomobject]@{ ExitCode = $exitCode; SqlState = $sqlState; Output = @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne "" }) }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

function Invoke-ScratchPsql {
    param(
        [string]$Network,
        [string]$User,
        [string]$Database,
        [string]$Password,
        [string]$Sql,
        [string]$Label
    )
    $result = Invoke-ScratchPsqlRaw -Network $Network -User $User -Database $Database -Password $Password -Sql $Sql
    if ($result.ExitCode -ne 0) { throw "$Label failed (exit=$($result.ExitCode), sqlstate=$($result.SqlState)); database output suppressed." }
    return @($result.Output)
}

function Get-ProjectResourceIds {
    param([string]$ProjectName)
    $containers = @(& docker ps -aq --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $containerExit = $LASTEXITCODE
    $volumes = @(& docker volume ls -q --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $volumeExit = $LASTEXITCODE
    $networks = @(& docker network ls -q --filter "label=com.docker.compose.project=$ProjectName" | Where-Object { $_ })
    $networkExit = $LASTEXITCODE
    if ($containerExit -ne 0 -or $volumeExit -ne 0 -or $networkExit -ne 0) { throw "Docker resource inventory failed." }
    return [pscustomobject]@{ Containers = $containers; Volumes = $volumes; Networks = $networks }
}

function Assert-NoProjectResources([string]$ProjectName) {
    $resources = Get-ProjectResourceIds $ProjectName
    if ($resources.Containers.Count -ne 0 -or $resources.Volumes.Count -ne 0 -or $resources.Networks.Count -ne 0) {
        throw "Temporary Compose project is not empty after reset; cleanup verification failed."
    }
}

function Assert-OwnedResources([string]$ProjectName) {
    $resources = Get-ProjectResourceIds $ProjectName
    foreach ($containerId in $resources.Containers) {
        $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $containerId | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "Refusing to remove a container not owned by this temporary project." }
    }
    foreach ($volumeName in $resources.Volumes) {
        $owner = (& docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' $volumeName | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "Refusing to remove a volume not owned by this temporary project." }
    }
    foreach ($networkId in $resources.Networks) {
        $owner = (& docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' $networkId | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "Refusing to remove a network not owned by this temporary project." }
    }
}

function Remove-TemporaryProject {
    param([string[]]$ComposeArgs, [string]$ProjectName)
    Assert-OwnedResources $ProjectName
    Invoke-DockerQuiet -Label "DB-008 temporary project cleanup" -DockerArgs ($ComposeArgs + @("down", "--volumes", "--remove-orphans", "--timeout", "10"))
    Assert-NoProjectResources $ProjectName
}

function Start-ScratchDatabase {
    param([string[]]$ComposeArgs, [string]$ProjectName, [hashtable]$Settings)

    Invoke-DockerQuiet -Label "DB-008 scratch PostgreSQL startup" -DockerArgs ($ComposeArgs + @("up", "--detach", "postgres"))
    $psArgs = $ComposeArgs + @("ps", "-q", "postgres")
    $containerId = (& docker @psArgs | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) { throw "DB-008 scratch PostgreSQL container was not created." }
    $owner = (& docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $containerId | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $owner -ne $ProjectName) { throw "DB-008 scratch PostgreSQL ownership verification failed." }
    $ready = $false
    $consecutiveHealthy = 0
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $state = (& docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}' $containerId | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw "DB-008 scratch PostgreSQL state inspection failed." }
        if ($state -match '^exited\|' -or $state -match '^dead\|') { throw "DB-008 scratch PostgreSQL exited before readiness." }
        if ($state -eq "running|healthy") {
            $consecutiveHealthy++
            if ($consecutiveHealthy -ge 3) { $ready = $true; break }
        }
        else { $consecutiveHealthy = 0 }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "DB-008 scratch PostgreSQL did not remain healthy for three consecutive probes before timeout." }

    $networkMap = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $containerId | Out-String).Trim() | ConvertFrom-Json
    $networks = @($networkMap.PSObject.Properties.Name)
    if ($networks.Count -ne 1 -or $networks[0] -notmatch '(^|_)database$') {
        throw "DB-008 scratch PostgreSQL is not on exactly one isolated database network."
    }
    $network = [string]$networks[0]

    $migrationUser = $Settings["MEDIQ_DB_MIGRATION_USER"]
    $runtimeUser = $Settings["MEDIQ_DB_RUNTIME_USER"]
    $migrationPassword = ConvertTo-SqlLiteral $Settings["MEDIQ_DB_MIGRATION_PASSWORD"]
    $runtimePassword = ConvertTo-SqlLiteral $Settings["MEDIQ_DB_RUNTIME_PASSWORD"]
    $database = $Settings["MEDIQ_POSTGRES_DB"]
$roleSql = @"
BEGIN;
DO `$db008_roles`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('$runtimeUser', '$migrationUser')) THEN
    RAISE EXCEPTION 'DB008_ROLE_PREEXISTS';
  END IF;
  EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$runtimeUser', $runtimePassword);
  EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$migrationUser', $migrationPassword);
END
`$db008_roles`$;
REVOKE CONNECT ON DATABASE "$database" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$database" TO "$runtimeUser", "$migrationUser";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "$runtimeUser";
GRANT USAGE, CREATE ON SCHEMA public TO "$migrationUser";
COMMIT;
"@
    $bootstrap = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $bootstrap = Invoke-ScratchPsqlRaw -Network $network -User $Settings["MEDIQ_POSTGRES_USER"] -Database $database -Password $Settings["MEDIQ_POSTGRES_PASSWORD"] -Sql $roleSql
        if ($bootstrap.ExitCode -eq 0 -and $bootstrap.Output.Count -eq 0) { break }
        $bootstrapOutput = [string]::Join("`n", [string[]]@($bootstrap.Output))
        $transientConnectFailure = $bootstrapOutput -match '(?i)(could not translate host name|connection refused|no route to host|network is unreachable|database system is starting up|database system is shutting down|database .* does not exist|server is not accepting connections|57P03|3D000)'
        $containerState = (& docker inspect --format '{{.State.Status}}' $containerId | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw "DB-008 scratch PostgreSQL state inspection failed during role bootstrap." }
        if ($containerState -ne "running") { throw "DB-008 scratch PostgreSQL exited during role bootstrap (state=$containerState)." }
        if (-not $transientConnectFailure -or $attempt -eq 19) {
            $failureClass = if ($bootstrapOutput -match '(?i)password authentication failed') { "AUTHENTICATION" }
                elseif ($bootstrapOutput -match '(?i)already exists') { "ROLE_PREEXISTS" }
                elseif ($bootstrapOutput -match '(?i)syntax error') { "SQL_SYNTAX" }
                elseif ($transientConnectFailure) { "CONNECTIVITY_TIMEOUT" }
                else { "UNCLASSIFIED" }
            throw "DB-008 scratch role bootstrap failed (class=$failureClass, exit=$($bootstrap.ExitCode), SQLSTATE=$($bootstrap.SqlState)); database output suppressed."
        }
        Start-Sleep -Seconds 2
    }
    return $network
}

function Invoke-Migrations([string[]]$ComposeArgs) {
    Invoke-DockerQuiet -Label "DB-008 scratch migration apply" -DockerArgs ($ComposeArgs + @("--profile", "migration", "run", "--build", "--rm", "migrator"))
}

function Assert-Db009AccessBoundary {
    param([string]$Network, [hashtable]$Settings, [string[]]$ComposeArgs)

    $inventorySql = @"
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('patient_refs','__drizzle_migrations')
      AND c.relrowsecurity AND c.relforcerowsecurity)::text || '|' ||
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'mediq_runtime'::name = ANY(roles))::text || '|' ||
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'mediq_migrator'::name = ANY(roles))::text || '|' ||
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='patient_refs' AND c.relrowsecurity)::text || '|' ||
  (SELECT count(*) FROM information_schema.column_privileges
    WHERE grantee='mediq_runtime' AND table_schema='public')::text || '|' ||
    (SELECT count(*) FROM information_schema.table_privileges
    WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public')::text;
"@
    $inventory = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $inventorySql -Label "DB-009 privilege/RLS catalog inventory"
    $inventoryValue = [string]::Join("", [string[]]@($inventory)).Trim()
    if (@($inventory).Count -ne 1 -or $inventoryValue -ne "17|17|17|0|236|0") {
        $actualInventory = [string]::Join(",", [string[]]@($inventory))
        throw "DB-009 privilege/RLS catalog inventory mismatch; observed_count=$($inventory.Count) observed=$actualInventory."
    }

    $runtimeRoleSql = @"
SELECT (
  r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
  AND NOT r.rolinherit AND NOT r.rolbypassrls
  AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relowner=r.oid
  )
  AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid)
)::text
FROM pg_roles r WHERE r.rolname='mediq_runtime';
SELECT (
  count(*)=236
  AND count(*) FILTER (WHERE table_name='patient_refs' AND privilege_type='SELECT')=5
  AND count(*) FILTER (WHERE table_name='patient_refs' AND privilege_type='INSERT')=5
  AND count(*) FILTER (WHERE table_name IN ('actors','tenants','hospitals') AND privilege_type='SELECT')=11
  AND count(*) FILTER (WHERE table_name IN ('exchange_sessions','consents','consent_actions','transfer_grants','transfer_grant_scopes','imaging_packages','study_references') AND privilege_type='SELECT')=56
  AND count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT')=6
  AND count(*) FILTER (WHERE table_name='study_references' AND privilege_type='SELECT' AND column_name NOT IN ('study_ref_id','package_id','source_hospital_id','study_instance_uid','series_count','instance_count'))=0
  AND count(*) FILTER (WHERE table_name='study_references' AND privilege_type IN ('INSERT','UPDATE','DELETE'))=0
  AND count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='SELECT')=12
  AND count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type='INSERT')=12
  AND count(*) FILTER (WHERE table_name='integrity_evidence' AND privilege_type IN ('UPDATE','DELETE'))=0
  AND count(*) FILTER (WHERE table_name='integrity_evidence' AND column_name NOT IN ('integrity_id','operation_id','exchange_session_id','package_id','study_ref_id','verification_stage','algorithm','source_digest','source_object_count','status','verified_at','created_at'))=0
  AND count(*) FILTER (WHERE table_name='transfer_grants' AND privilege_type='SELECT')=13
  AND count(*) FILTER (WHERE table_name='transfer_grants' AND privilege_type='INSERT')=13
  AND count(*) FILTER (WHERE table_name='transfer_grants' AND privilege_type='UPDATE')=2
  AND count(*) FILTER (WHERE table_name='transfer_grants' AND privilege_type='UPDATE' AND column_name NOT IN ('status','revoked_at'))=0
  AND count(*) FILTER (WHERE table_name='transfer_grant_scopes' AND privilege_type='INSERT')=3
  AND count(*) FILTER (WHERE table_name='exchange_sessions' AND privilege_type='SELECT')=12
  AND count(*) FILTER (WHERE table_name='exchange_sessions' AND privilege_type='INSERT')=12
  AND count(*) FILTER (WHERE table_name='audit_events' AND privilege_type='INSERT')=12
  AND count(*) FILTER (WHERE table_name='pacs_transfer_operations' AND privilege_type='SELECT')=15
  AND count(*) FILTER (WHERE table_name='pacs_transfer_operations' AND privilege_type='INSERT')=15
  AND count(*) FILTER (WHERE table_name='pacs_transfer_operations' AND privilege_type='UPDATE')=7
  AND count(*) FILTER (WHERE table_name='pacs_transfer_operations' AND privilege_type='UPDATE' AND column_name NOT IN ('state','version','reason_code','source_object_count','destination_object_count','updated_at','stow_started_at'))=0
  AND count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='SELECT')=13
  AND count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type='INSERT')=13
  AND count(*) FILTER (WHERE table_name='provenance_records' AND privilege_type IN ('UPDATE','DELETE'))=0
  AND count(*) FILTER (WHERE table_name='patient_mappings' AND privilege_type='SELECT')=8
  AND count(*) FILTER (WHERE table_name='exchange_sessions' AND privilege_type='UPDATE')=2
  AND count(*) FILTER (WHERE table_name='exchange_sessions' AND privilege_type='UPDATE' AND column_name NOT IN ('state','updated_at'))=0
  AND count(*) FILTER (WHERE table_name='consents' AND privilege_type='UPDATE')=4
  AND count(*) FILTER (WHERE table_name='consents' AND privilege_type='UPDATE' AND column_name NOT IN ('status','issued_at','updated_at','withdrawn_at'))=0
  AND count(*) FILTER (WHERE privilege_type NOT IN ('SELECT','INSERT','UPDATE'))=0
  AND count(*) FILTER (WHERE table_name NOT IN ('patient_refs','actors','tenants','hospitals','patient_mappings','exchange_sessions','consents','consent_actions','transfer_grants','transfer_grant_scopes','imaging_packages','study_references','integrity_evidence','audit_events','pacs_transfer_operations','provenance_records'))=0
  AND count(*) FILTER (WHERE table_name='patient_refs' AND column_name NOT IN ('patient_ref_id','patient_ref_code','status','created_at','updated_at'))=0
  AND count(*) FILTER (WHERE table_name='patient_mappings' AND column_name NOT IN ('mapping_id','patient_ref_id','hospital_id','local_patient_id','status','validated_at','created_at','updated_at'))=0
  AND count(*) FILTER (WHERE table_name='transfer_grants' AND column_name NOT IN ('grant_id','exchange_session_id','consent_id','recipient_tenant_id','recipient_hospital_id','recipient_actor_id','imaging_package_id','idempotency_key','status','issued_at','expires_at','revoked_at','created_at'))=0
  AND count(*) FILTER (WHERE table_name='exchange_sessions' AND column_name NOT IN ('session_id','patient_ref_id','source_hospital_id','destination_hospital_id','requester_actor_id','idempotency_key','purpose','state','created_at','updated_at','expires_at','completed_at'))=0
  AND count(*) FILTER (WHERE table_name='audit_events' AND column_name NOT IN ('audit_event_id','occurred_at','actor_id','tenant_id','exchange_session_id','resource_type','resource_id','action','result','reason_code','correlation_id','created_at'))=0
  AND count(*) FILTER (WHERE table_name='pacs_transfer_operations' AND column_name NOT IN ('operation_id','tenant_id','exchange_session_id','study_ref_id','actor_id','idempotency_key','request_digest','state','version','reason_code','source_object_count','destination_object_count','created_at','updated_at','stow_started_at'))=0
  AND count(*) FILTER (WHERE table_name='provenance_records' AND column_name NOT IN ('provenance_id','exchange_session_id','package_id','study_ref_id','source_hospital_id','destination_hospital_id','integrity_id','transfer_type','transfer_status','ingested_at','transferred_at','created_at','operation_id'))=0
)::text
FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public';
SELECT count(*)::text
FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE d.defaclnamespace IN (0,'public'::regnamespace)
  AND a.grantee IN (0,'mediq_runtime'::regrole);
"@
    $runtimeRoleBoundary = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $runtimeRoleSql -Label "DB-009 runtime role and exact column-grant inventory"
    if ($runtimeRoleBoundary.Count -ne 3 -or $runtimeRoleBoundary[0] -ne "true" -or $runtimeRoleBoundary[1] -ne "true" -or $runtimeRoleBoundary[2] -ne "0") {
        $boundarySummary = [string]::Join("|", [string[]]@($runtimeRoleBoundary))
        $privilegeDetails = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql "SELECT table_name || ':' || privilege_type || ':' || count(*)::text || ':' || string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' GROUP BY table_name, privilege_type ORDER BY table_name, privilege_type;" -Label "DB-009 safe privilege breakdown"
        throw "DB-009 runtime attributes, ownership, exact column grants, or default-privilege inventory failed; safe catalog summary=$boundarySummary; breakdown=$([string]::Join(';', [string[]]@($privilegeDetails)))."
    }

    foreach ($ddlProbe in @(
        "CREATE TABLE public.db009_runtime_ddl_probe (probe integer);",
        "CREATE ROLE db009_runtime_role_probe;",
        "ALTER TABLE public.tenants ADD COLUMN db009_runtime_ddl_probe integer;",
        "SET ROLE mediq_migrator;",
        "TRUNCATE TABLE patient_refs;",
        "UPDATE public.transfer_grants SET recipient_actor_id = recipient_actor_id WHERE FALSE;",
        "UPDATE public.transfer_grants SET expires_at = expires_at WHERE FALSE;",
        "UPDATE public.transfer_grant_scopes SET scope = scope WHERE FALSE;"
    )) {
        $ddlDenied = Invoke-ScratchPsqlRaw -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $ddlProbe
        if ($ddlDenied.ExitCode -eq 0 -or $ddlDenied.SqlState -ne "42501") {
            throw "DB-009 runtime DDL/elevation/TRUNCATE probe did not fail with insufficient privilege."
        }
    }

    $token = [guid]::NewGuid().ToString("N").ToUpperInvariant()
    $organizationA = [guid]::NewGuid().ToString()
    $organizationB = [guid]::NewGuid().ToString()
    $organizationC = [guid]::NewGuid().ToString()
    $tenantA = [guid]::NewGuid().ToString()
    $tenantB = [guid]::NewGuid().ToString()
    $tenantC = [guid]::NewGuid().ToString()
    $hospitalA = [guid]::NewGuid().ToString()
    $hospitalAOther = [guid]::NewGuid().ToString()
    $hospitalB = [guid]::NewGuid().ToString()
    $hospitalC = [guid]::NewGuid().ToString()
    $actorA = [guid]::NewGuid().ToString()
    $actorB = [guid]::NewGuid().ToString()
    $actorC = [guid]::NewGuid().ToString()
    $exc003ActorB = [guid]::NewGuid().ToString()
    $subjectA = "synthetic-iam002-$token"
    $subjectB = "synthetic-aut005-b-$token"
    $subjectC = "synthetic-aut005-c-$token"
    $exc003SubjectB = "synthetic-exc003-user-$token"
    $patientMappingActorA = [guid]::NewGuid().ToString()
    $patientMappingActorB = [guid]::NewGuid().ToString()
    $patientMappingActorC = [guid]::NewGuid().ToString()
    $patientMappingActorServiceA = [guid]::NewGuid().ToString()
    $patientMappingActorTenantLevel = [guid]::NewGuid().ToString()
    $patientMappingSubjectA = "synthetic-pat002-a-$token"
    $patientMappingSubjectB = "synthetic-pat002-b-$token"
    $patientMappingSubjectC = "synthetic-pat002-c-$token"
    $patientMappingSubjectServiceA = "synthetic-pat002-service-a-$token"
    $patientMappingSubjectTenantLevel = "synthetic-pat002-tenant-level-$token"
    $patientRefId = [guid]::NewGuid().ToString()
    $patientMappingIdA = [guid]::NewGuid().ToString()
    $patientMappingIdAOther = [guid]::NewGuid().ToString()
    $patientMappingIdB = [guid]::NewGuid().ToString()
    $patientMappingIdC = [guid]::NewGuid().ToString()
    $patientMappingWriteProbe = [guid]::NewGuid().ToString()
    $sessionId = [guid]::NewGuid().ToString()
    $consentId = [guid]::NewGuid().ToString()
    $withdrawnConsentId = [guid]::NewGuid().ToString()
    $grantId = [guid]::NewGuid().ToString()
    $revokedGrantId = [guid]::NewGuid().ToString()
    $expiredGrantId = [guid]::NewGuid().ToString()
    $withdrawnConsentGrantId = [guid]::NewGuid().ToString()
    $packageId = [guid]::NewGuid().ToString()
    $studyRefId = [guid]::NewGuid().ToString()
    $pacsFenceSessionId = [guid]::NewGuid().ToString()
    $pacsFencePackageId = [guid]::NewGuid().ToString()
    $pacsFenceStudyRefId = [guid]::NewGuid().ToString()
    $pacsFenceConsentId = [guid]::NewGuid().ToString()
    $pacsFenceGrantId = [guid]::NewGuid().ToString()
    $provenanceSessionId = [guid]::NewGuid().ToString()
    $provenancePackageId = [guid]::NewGuid().ToString()
    $provenanceStudyRefId = [guid]::NewGuid().ToString()
    $provenanceLateStudyRefId = [guid]::NewGuid().ToString()
    $integritySessionId = [guid]::NewGuid().ToString()
    $integrityPackageId = [guid]::NewGuid().ToString()
    $integrityStudyRefId = [guid]::NewGuid().ToString()
    $integrityLateStudyRefId = [guid]::NewGuid().ToString()
    $syntheticStudyUid = "2.25.309.$([Convert]::ToUInt64($token.Substring(0, 15), 16))"
    $pacsFenceStudyUid = "2.25.310.$([Convert]::ToUInt64($token.Substring(15, 15), 16))"
    $provenanceStudyUid = "2.25.311.$([Convert]::ToUInt64($token.Substring(8, 15), 16))"
    $provenanceLateStudyUid = "2.25.312.$([Convert]::ToUInt64($token.Substring(16, 15), 16))"
    $integrityStudyUid = "2.25.313.$([Convert]::ToUInt64($token.Substring(8, 15), 16))"
    $integrityLateStudyUid = "2.25.314.$([Convert]::ToUInt64($token.Substring(16, 15), 16))"
    $fixtureSql = @"
BEGIN;
INSERT INTO organizations VALUES
 ('$organizationA','DB009-ORGA-$token','Synthetic DB009 A','HOSPITAL','ACTIVE',now(),now()),
 ('$organizationB','DB009-ORGB-$token','Synthetic DB009 B','HOSPITAL','ACTIVE',now(),now()),
 ('$organizationC','DB009-ORGC-$token','Synthetic DB009 C','HOSPITAL','ACTIVE',now(),now());
INSERT INTO tenants VALUES
 ('$tenantA','$organizationA','DB009-TENA-$token','Synthetic DB009 Tenant A','ACTIVE',now(),now()),
 ('$tenantB','$organizationB','DB009-TENB-$token','Synthetic DB009 Tenant B','ACTIVE',now(),now()),
 ('$tenantC','$organizationC','DB009-TENC-$token','Synthetic DB009 Tenant C','ACTIVE',now(),now());
INSERT INTO hospitals VALUES
 ('$hospitalA','$tenantA','$organizationA','DB009-HA-$token','Synthetic DB009 Hospital A','TEST','ACTIVE',now(),now()),
 ('$hospitalAOther','$tenantA','$organizationA','DB009-HA2-$token','Synthetic DB009 Hospital A Other','TEST','ACTIVE',now(),now()),
 ('$hospitalB','$tenantB','$organizationB','DB009-HB-$token','Synthetic DB009 Hospital B','TEST','ACTIVE',now(),now()),
 ('$hospitalC','$tenantC','$organizationC','DB009-HC-$token','Synthetic DB009 Hospital C','TEST','ACTIVE',now(),now());
INSERT INTO actors VALUES
 ('$actorA','$tenantA','$hospitalA','SERVICE','$subjectA','Synthetic DB009 Service','ACTIVE',now(),now()),
 ('$actorB','$tenantB','$hospitalB','SERVICE','$subjectB','Synthetic DB009 Destination','ACTIVE',now(),now()),
 ('$actorC','$tenantC','$hospitalC','SERVICE','$subjectC','Synthetic DB009 Third Tenant','ACTIVE',now(),now()),
 ('$exc003ActorB','$tenantB','$hospitalB','USER','$exc003SubjectB','Synthetic EXC003 Destination User','ACTIVE',now(),now()),
 ('$patientMappingActorA','$tenantA','$hospitalA','USER','$patientMappingSubjectA','Synthetic PAT002 User A','ACTIVE',now(),now()),
 ('$patientMappingActorB','$tenantB','$hospitalB','USER','$patientMappingSubjectB','Synthetic PAT002 User B','ACTIVE',now(),now()),
 ('$patientMappingActorC','$tenantC','$hospitalC','USER','$patientMappingSubjectC','Synthetic PAT002 User C','ACTIVE',now(),now()),
 ('$patientMappingActorServiceA','$tenantA','$hospitalA','SERVICE','$patientMappingSubjectServiceA','Synthetic PAT002 Service A','ACTIVE',now(),now()),
 ('$patientMappingActorTenantLevel','$tenantA',NULL,'SERVICE','$patientMappingSubjectTenantLevel','Synthetic PAT002 Tenant Actor','ACTIVE',now(),now());
INSERT INTO patient_refs VALUES
 ('$patientRefId','MQ-TEST-DB009-$token','ACTIVE',now(),now());
INSERT INTO patient_mappings
 (mapping_id,patient_ref_id,hospital_id,local_patient_id,status,validated_at,created_at,updated_at)
VALUES
 ('$patientMappingIdA','$patientRefId','$hospitalA','TEST-A-001','UNVERIFIED',NULL,now(),now()),
 ('$patientMappingIdAOther','$patientRefId','$hospitalAOther','TEST-A2-001','UNVERIFIED',NULL,now(),now()),
 ('$patientMappingIdB','$patientRefId','$hospitalB','TEST-B-001','UNVERIFIED',NULL,now(),now()),
 ('$patientMappingIdC','$patientRefId','$hospitalC','TEST-C-001','UNVERIFIED',NULL,now(),now());
INSERT INTO exchange_sessions
 (session_id,patient_ref_id,source_hospital_id,destination_hospital_id,requester_actor_id,purpose,state,created_at,updated_at,idempotency_key)
VALUES ('$sessionId','$patientRefId','$hospitalA','$hospitalB','$actorA','Synthetic RLS test','AUTHORIZED',now(),now(),gen_random_uuid());
INSERT INTO imaging_packages
 (package_id,exchange_session_id,patient_ref_id,source_hospital_id,state,storage_ref,study_count,created_at,updated_at)
VALUES ('$packageId','$sessionId','$patientRefId','$hospitalA','AVAILABLE',NULL,1,now(),now());
INSERT INTO study_references
 (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
VALUES ('$studyRefId','$packageId','$hospitalA','$syntheticStudyUid','CT',1,1,now());
INSERT INTO consents
 (consent_id,exchange_session_id,patient_ref_id,source_hospital_id,destination_hospital_id,imaging_package_id,status,consent_version,issued_at,expires_at,withdrawn_at,created_at,updated_at)
VALUES
 ('$consentId','$sessionId','$patientRefId','$hospitalA','$hospitalB',NULL,'ACTIVE',1,now()-interval '1 day',NULL,NULL,now(),now()),
 ('$withdrawnConsentId','$sessionId','$patientRefId','$hospitalA','$hospitalB',NULL,'WITHDRAWN',2,now()-interval '1 day',NULL,now()-interval '5 minutes',now(),now());
INSERT INTO consent_actions (consent_action_id,consent_id,action)
SELECT gen_random_uuid(), c.consent_id, a.action
  FROM (VALUES ('$consentId'::uuid),('$withdrawnConsentId'::uuid)) AS c(consent_id)
 CROSS JOIN (VALUES ('VIEW'),('DOWNLOAD'),('PACS_IMPORT')) AS a(action);
INSERT INTO transfer_grants
 (grant_id,exchange_session_id,consent_id,recipient_tenant_id,recipient_hospital_id,recipient_actor_id,imaging_package_id,status,issued_at,expires_at,revoked_at,created_at)
VALUES
 ('$grantId','$sessionId','$consentId','$tenantB','$hospitalB','$actorB','$packageId','ACTIVE',now()-interval '1 hour',now()+interval '1 day',NULL,now()),
 ('$revokedGrantId','$sessionId','$consentId','$tenantB','$hospitalB','$actorB','$packageId','REVOKED',now()-interval '2 hours',now()+interval '1 day',now()-interval '5 minutes',now()),
 ('$expiredGrantId','$sessionId','$consentId','$tenantB','$hospitalB','$actorB','$packageId','ACTIVE',now()-interval '2 hours',now()-interval '1 hour',NULL,now()),
 ('$withdrawnConsentGrantId','$sessionId','$withdrawnConsentId','$tenantB','$hospitalB','$actorB','$packageId','ACTIVE',now()-interval '1 hour',now()+interval '1 day',NULL,now());
INSERT INTO transfer_grant_scopes (grant_scope_id,grant_id,scope)
SELECT gen_random_uuid(), g.grant_id, s.scope
  FROM (VALUES ('$grantId'::uuid),('$revokedGrantId'::uuid),('$expiredGrantId'::uuid),('$withdrawnConsentGrantId'::uuid)) AS g(grant_id)
 CROSS JOIN (VALUES ('study:view'),('study:download'),('study:pacs-transfer')) AS s(scope);
INSERT INTO exchange_sessions
 (session_id,patient_ref_id,source_hospital_id,destination_hospital_id,requester_actor_id,purpose,state,created_at,updated_at,expires_at,completed_at,idempotency_key)
VALUES ('$pacsFenceSessionId','$patientRefId','$hospitalA','$hospitalB','$exc003ActorB','Synthetic PACS authorization fence test','ACTIVE',now(),now(),now()+interval '1 day',NULL,gen_random_uuid());
INSERT INTO imaging_packages
 (package_id,exchange_session_id,patient_ref_id,source_hospital_id,state,storage_ref,study_count,created_at,updated_at,retention_expires_at,deleted_at)
VALUES ('$pacsFencePackageId','$pacsFenceSessionId','$patientRefId','$hospitalA','AVAILABLE',NULL,1,now(),now(),now()+interval '1 day',NULL);
INSERT INTO study_references
 (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
VALUES ('$pacsFenceStudyRefId','$pacsFencePackageId','$hospitalA','$pacsFenceStudyUid','CT',1,1,now());
INSERT INTO exchange_sessions
 (session_id,patient_ref_id,source_hospital_id,destination_hospital_id,requester_actor_id,purpose,state,created_at,updated_at,idempotency_key)
VALUES ('$provenanceSessionId','$patientRefId','$hospitalA','$hospitalB','$actorB','Synthetic Provenance persistence test','AUTHORIZED',now(),now(),gen_random_uuid());
INSERT INTO imaging_packages
 (package_id,exchange_session_id,patient_ref_id,source_hospital_id,state,storage_ref,study_count,created_at,updated_at)
VALUES ('$provenancePackageId','$provenanceSessionId','$patientRefId','$hospitalA','AVAILABLE',NULL,2,now(),now());
INSERT INTO study_references
 (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
VALUES
 ('$provenanceStudyRefId','$provenancePackageId','$hospitalA','$provenanceStudyUid','CT',1,1,now()),
 ('$provenanceLateStudyRefId','$provenancePackageId','$hospitalA','$provenanceLateStudyUid','MR',1,1,now());
INSERT INTO exchange_sessions
 (session_id,patient_ref_id,source_hospital_id,destination_hospital_id,requester_actor_id,purpose,state,created_at,updated_at,idempotency_key)
VALUES ('$integritySessionId','$patientRefId','$hospitalA','$hospitalB','$actorB','Synthetic source Integrity persistence test','AUTHORIZED',now(),now(),gen_random_uuid());
INSERT INTO imaging_packages
 (package_id,exchange_session_id,patient_ref_id,source_hospital_id,state,storage_ref,study_count,created_at,updated_at)
VALUES ('$integrityPackageId','$integritySessionId','$patientRefId','$hospitalA','AVAILABLE',NULL,2,now(),now());
INSERT INTO study_references
 (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
VALUES
 ('$integrityStudyRefId','$integrityPackageId','$hospitalA','$integrityStudyUid','CT',1,3,now()),
 ('$integrityLateStudyRefId','$integrityPackageId','$hospitalA','$integrityLateStudyUid','MR',1,2,now());
INSERT INTO consents
 (consent_id,exchange_session_id,patient_ref_id,source_hospital_id,destination_hospital_id,imaging_package_id,status,consent_version,issued_at,expires_at,withdrawn_at,created_at,updated_at)
VALUES ('$pacsFenceConsentId','$pacsFenceSessionId','$patientRefId','$hospitalA','$hospitalB','$pacsFencePackageId','ACTIVE',1,now(),now()+interval '1 day',NULL,now(),now());
INSERT INTO consent_actions (consent_action_id,consent_id,action)
VALUES (gen_random_uuid(),'$pacsFenceConsentId','PACS_IMPORT');
INSERT INTO transfer_grants
 (grant_id,exchange_session_id,consent_id,recipient_tenant_id,recipient_hospital_id,recipient_actor_id,imaging_package_id,status,issued_at,expires_at,revoked_at,created_at)
VALUES ('$pacsFenceGrantId','$pacsFenceSessionId','$pacsFenceConsentId','$tenantB','$hospitalB','$exc003ActorB','$pacsFencePackageId','ACTIVE',now(),now()+interval '1 day',NULL,now());
INSERT INTO transfer_grant_scopes (grant_scope_id,grant_id,scope)
VALUES (gen_random_uuid(),'$pacsFenceGrantId','study:pacs-transfer');
COMMIT;
GRANT SELECT (organization_id) ON TABLE organizations TO mediq_runtime;
GRANT SELECT (organization_id) ON TABLE tenants TO mediq_runtime;
GRANT INSERT (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
  ON TABLE hospitals TO mediq_runtime;
"@
    $null = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $fixtureSql -Label "DB-009 synthetic Tenant A/B/C fixture"

    $rlsSql = @"
BEGIN;
DO `$db009_rls`$
DECLARE row_count integer;
BEGIN
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 0 THEN RAISE EXCEPTION 'DB009_MISSING_CONTEXT_NOT_DENIED'; END IF;
  PERFORM set_config('mediq.tenant_id','$tenantA',true);
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_TENANT_A_HOSPITAL_SCOPE_FAILED'; END IF;
  SELECT count(*) INTO row_count FROM organizations WHERE organization_id IN ('$organizationA','$organizationB','$organizationC');
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_TENANT_A_ORG_SCOPE_FAILED'; END IF;
  SELECT count(*) INTO row_count FROM exchange_sessions WHERE session_id='$sessionId';
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_SOURCE_EXCHANGE_SCOPE_FAILED'; END IF;
  BEGIN
    INSERT INTO hospitals VALUES (gen_random_uuid(),'$tenantB','$organizationB','DB009-WRONG-$token','Wrong Tenant Write','TEST','ACTIVE',now(),now());
    RAISE EXCEPTION 'DB009_WRONG_TENANT_WRITE_NOT_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('mediq.tenant_id','$tenantB',true);
  SELECT count(*) INTO row_count FROM exchange_sessions WHERE session_id='$sessionId';
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_DESTINATION_EXCHANGE_SCOPE_FAILED'; END IF;
  PERFORM set_config('mediq.tenant_id','$tenantC',true);
  SELECT count(*) INTO row_count FROM exchange_sessions WHERE session_id='$sessionId';
  IF row_count <> 0 THEN RAISE EXCEPTION 'DB009_THIRD_TENANT_NOT_DENIED'; END IF;
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_TENANT_C_OWN_SCOPE_FAILED'; END IF;
  PERFORM set_config('mediq.tenant_id','$tenantB',true);
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 1 THEN RAISE EXCEPTION 'DB009_MUTABLE_CONTEXT_LIMITATION_NOT_REPRODUCED'; END IF;
END
`$db009_rls`$;
COMMIT;
BEGIN;
DO `$db009_pool_reset`$
DECLARE row_count integer;
BEGIN
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 0 THEN RAISE EXCEPTION 'DB009_TRANSACTION_LOCAL_CONTEXT_LEAKED'; END IF;
END
`$db009_pool_reset`$;
ROLLBACK;
BEGIN;
SELECT set_config('mediq.tenant_id','$tenantA',true);
ROLLBACK;
BEGIN;
DO `$db009_rollback_reset`$
DECLARE row_count integer;
BEGIN
  SELECT count(*) INTO row_count FROM hospitals WHERE hospital_id IN ('$hospitalA','$hospitalB','$hospitalC');
  IF row_count <> 0 THEN RAISE EXCEPTION 'DB009_ROLLBACK_CONTEXT_LEAKED'; END IF;
END
`$db009_rollback_reset`$;
ROLLBACK;
"@
    $null = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $rlsSql -Label "DB-009 fail-closed and cross-Tenant RLS probes"

    $malformedSql = @"
BEGIN;
SELECT set_config('mediq.tenant_id','not-a-uuid',true);
SELECT count(*) FROM hospitals;
ROLLBACK;
"@
    $malformed = Invoke-ScratchPsqlRaw -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $malformedSql
    if ($malformed.ExitCode -eq 0) { throw "DB-009 malformed Tenant context was not denied." }

    $patientToken = "MQ-TEST-DB009-ROUNDTRIP-" + $token
    $patientRoundTripSql = @"
BEGIN;
INSERT INTO patient_refs (patient_ref_id,patient_ref_code,status,created_at,updated_at)
VALUES ('$([guid]::NewGuid())','$patientToken','ACTIVE',now(),now())
RETURNING patient_ref_code;
SELECT count(*) FROM patient_refs WHERE patient_ref_code='$patientToken';
ROLLBACK;
"@
    $patientRoundTrip = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $patientRoundTripSql -Label "DB-009 restricted synthetic PatientReference round trip"
    if ($patientRoundTrip.Count -ne 2 -or $patientRoundTrip[0] -ne $patientToken -or $patientRoundTrip[1] -ne "1") {
        throw "DB-009 runtime synthetic PatientReference round trip did not match the expected result."
    }

    $invalidCodeSql = "INSERT INTO patient_refs (patient_ref_id,patient_ref_code,status,created_at,updated_at) VALUES (gen_random_uuid(),'REAL-PATIENT-CODE','ACTIVE',now(),now());"
    $invalidCode = Invoke-ScratchPsqlRaw -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $invalidCodeSql
    if ($invalidCode.ExitCode -eq 0 -or $invalidCode.SqlState -ne "23514") { throw "DB-009 database synthetic-code constraint did not reject an invalid value." }

    foreach ($sqlText in @(
        "UPDATE patient_refs SET status='INACTIVE' WHERE patient_ref_id='$patientRefId';",
        "DELETE FROM patient_refs WHERE patient_ref_id='$patientRefId';",
        "TRUNCATE TABLE patient_refs;",
        "INSERT INTO patient_mappings (mapping_id, patient_ref_id, hospital_id, local_patient_id, status, created_at, updated_at) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'TEST-DENIED-001', 'UNVERIFIED', now(), now());",
        "UPDATE patient_mappings SET status='REVOKED';",
        "DELETE FROM patient_mappings;",
        "TRUNCATE TABLE patient_mappings;"
    )) {
        $denied = Invoke-ScratchPsqlRaw -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql $sqlText
        if ($denied.ExitCode -eq 0) { throw "DB-009 runtime privilege probe unexpectedly succeeded." }
    }

    $noTenantMappingRows = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql "SELECT count(*) FROM patient_mappings;" -Label "DB-009 patient mapping RLS fail-closed read"
    if ($noTenantMappingRows.Count -ne 1 -or [string]$noTenantMappingRows[0] -ne "0") { throw "DB-009 patient mapping read unexpectedly returned rows without Tenant context." }

    $revokeSql = "REVOKE SELECT (organization_id) ON TABLE organizations FROM mediq_runtime; REVOKE SELECT (organization_id) ON TABLE tenants FROM mediq_runtime; REVOKE INSERT (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at) ON TABLE hospitals FROM mediq_runtime;"
    $null = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $revokeSql -Label "DB-009 temporary RLS test grants cleanup"

    $autFixture = [ordered]@{
        subjectA = $subjectA; actorA = $actorA; tenantA = $tenantA; hospitalA = $hospitalA
        subjectB = $subjectB; actorB = $actorB; tenantB = $tenantB; hospitalB = $hospitalB
        subjectC = $subjectC; actorC = $actorC; tenantC = $tenantC; hospitalC = $hospitalC
        subjectUserB = $exc003SubjectB; actorUserB = $exc003ActorB
        subjectUserC = $patientMappingSubjectC; actorUserC = $patientMappingActorC
        patientRefId = $patientRefId; sessionId = $sessionId; consentId = $consentId
        withdrawnConsentId = $withdrawnConsentId; grantId = $grantId
        revokedGrantId = $revokedGrantId; expiredGrantId = $expiredGrantId
        withdrawnConsentGrantId = $withdrawnConsentGrantId; packageId = $packageId
        studyRefId = $studyRefId
    } | ConvertTo-Json -Compress
    $patFixture = [ordered]@{
        subjectUserA = $patientMappingSubjectA; subjectUserB = $patientMappingSubjectB
        subjectUserC = $patientMappingSubjectC; subjectServiceA = $patientMappingSubjectServiceA
        subjectTenantLevel = $patientMappingSubjectTenantLevel
        tenantA = $tenantA; tenantB = $tenantB; tenantC = $tenantC
        hospitalA = $hospitalA; hospitalAOther = $hospitalAOther
        hospitalB = $hospitalB; hospitalC = $hospitalC
        patientRefId = $patientRefId; mappingA = $patientMappingIdA
        mappingAOther = $patientMappingIdAOther; mappingB = $patientMappingIdB
        mappingC = $patientMappingIdC; mappingWriteProbe = $patientMappingWriteProbe
    } | ConvertTo-Json -Compress
    $pacsFixture = [ordered]@{
        tenantId = $tenantB; otherTenantId = $tenantA; actorId = $actorB
        sessionId = $sessionId; studyRefId = $studyRefId
        consentId = $consentId; grantId = $grantId
    } | ConvertTo-Json -Compress
    $pacsFenceFixture = [ordered]@{
        subject = $exc003SubjectB; tenantId = $tenantB
        sessionId = $pacsFenceSessionId; studyRefId = $pacsFenceStudyRefId
        consentId = $pacsFenceConsentId; grantId = $pacsFenceGrantId
        otherSubject = $subjectB; withdrawnSessionId = $sessionId
        withdrawnStudyRefId = $studyRefId; withdrawnConsentId = $withdrawnConsentId
        withdrawnGrantId = $withdrawnConsentGrantId
    } | ConvertTo-Json -Compress
    $provenanceFixture = [ordered]@{
        tenantId = $tenantB; otherTenantId = $tenantC; actorId = $actorB
        sessionId = $provenanceSessionId; studyRefId = $provenanceStudyRefId
        lateStudyRefId = $provenanceLateStudyRefId
        sourceHospitalId = $hospitalA; destinationHospitalId = $hospitalB
    } | ConvertTo-Json -Compress
    $integrityFixture = [ordered]@{
        tenantId = $tenantB; otherTenantId = $tenantC; actorId = $actorB
        sessionId = $integritySessionId; packageId = $integrityPackageId
        studyRefId = $integrityStudyRefId; lateStudyRefId = $integrityLateStudyRefId
        sourceHospitalId = $hospitalA; destinationHospitalId = $hospitalB
    } | ConvertTo-Json -Compress
    $auditFailureTriggerSql = @"
CREATE FUNCTION public.pacs007_audit_failure_probe() RETURNS trigger
LANGUAGE plpgsql AS `$pacs007_audit_failure`$
BEGIN
  IF NEW.resource_type = 'PACS_TRANSFER_OPERATION'
     AND NEW.reason_code = 'AUDIT_FAIL_TEST' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PACS007_AUDIT_FAILURE_PROBE';
  END IF;
  RETURN NEW;
END
`$pacs007_audit_failure`$;
CREATE TRIGGER pacs007_audit_failure_probe
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.pacs007_audit_failure_probe();
"@
    $null = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $auditFailureTriggerSql -Label "PACS-007 isolated Audit failure probe setup"
    try {
        $pacs007Args = $ComposeArgs + @(
            "--profile", "test", "run", "--build", "--rm", "--no-deps",
            "--env", "MEDIQ_PACS007_TEST_FIXTURE=$pacsFixture",
            "api-db-integration-test",
            "node", "--test", "tests/database/pacs-transfer-operation-runtime.integration.test.mjs"
        )
        $pacs007Output = @(& docker @pacs007Args 2>&1 | ForEach-Object { $_.ToString() })
        $pacs007ExitCode = $LASTEXITCODE
        $pacs007Summary = [string]::Join("`n", [string[]]@($pacs007Output))
        if ($pacs007ExitCode -ne 0 -or $pacs007Summary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
            $safeFailureCode = [regex]::Match($pacs007Summary, '\b(PACS007_[A-Z_]+|42501|23505|23514|P0001|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|AssertionError)\b').Groups[1].Value
            if (-not $safeFailureCode) { $safeFailureCode = 'unclassified' }
            throw "PACS-007 PostgreSQL/RLS integration failed (exit=$pacs007ExitCode, safe_error=$safeFailureCode); raw output suppressed."
        }
        Write-Output "pacs007_runtime=PASS exact_replay=PASS semantic_conflict=PASS session_study_unique=PASS advisory_lock_cas=PASS audit_savepoint_rollback=PASS unknown_persisted_no_retry=PASS bilateral_tenant_rls=PASS"
    }
    finally {
        $dropAuditFailureTriggerSql = @"
DROP TRIGGER IF EXISTS pacs007_audit_failure_probe ON audit_events;
DROP FUNCTION IF EXISTS public.pacs007_audit_failure_probe();
"@
        $null = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $dropAuditFailureTriggerSql -Label "PACS-007 isolated Audit failure probe cleanup"
    }

    $integrationArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_IAM002_TEST_SUBJECT=$subjectA",
        "--env", "MEDIQ_IAM002_TEST_ACTOR_ID=$actorA",
        "--env", "MEDIQ_IAM002_TEST_TENANT_A=$tenantA",
        "--env", "MEDIQ_IAM002_TEST_TENANT_B=$tenantB",
        "--env", "MEDIQ_IAM002_TEST_TENANT_C=$tenantC",
        "--env", "MEDIQ_IAM002_TEST_HOSPITAL_A=$hospitalA",
        "--env", "MEDIQ_AUT005_TEST_FIXTURE=$autFixture",
        "--env", "MEDIQ_PAT002_TEST_FIXTURE=$patFixture",
        "api-db-integration-test"
    )
    $integrationOutput = @(& docker @integrationArgs 2>&1 | ForEach-Object { $_.ToString() })
    $integrationExitCode = $LASTEXITCODE
    $integrationSummary = [string]::Join("`n", [string[]]@($integrationOutput))
    if ($integrationExitCode -ne 0 -or $integrationSummary -notmatch '(?m)^(?:#|ℹ) pass 4$') {
        $passCount = [regex]::Match($integrationSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($integrationSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($integrationSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($integrationSummary, '\b((?:IAM002|AUT005|PAT002)_STAGE=[A-Z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $privilegeDiagnostic = [regex]::Match($integrationSummary, '(?:IAM002|AUT005)_PRIVILEGE_MISMATCH=([^\r\n]{1,1200})').Groups[1].Value
        $privilegeSummary = if ($privilegeDiagnostic) { $privilegeDiagnostic } else { "unavailable" }
        $safeFailureCode = [regex]::Match($integrationSummary, '\b(PATIENT_REFERENCE_PERSISTENCE_FAILED|PATIENT_REFERENCE_CONFLICT|PATIENT_MAPPING_[A-Z_]+|IAM002_(?!STAGE=)[A-Z0-9_]+|AUT005_(?!STAGE=)[A-Z0-9_]+|PAT002_(?!STAGE=)[A-Z0-9_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        $safeDatabaseCode = [regex]::Match($integrationSummary, 'databaseCode=([0-9A-Z]{5})').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = 'unclassified' }
        $safeFailureSummary = if ($safeDatabaseCode) { "$safeFailureCode/$safeDatabaseCode" } else { $safeFailureCode }
        throw "DB-009 PAT-001/IAM-002/AUT-005/PAT-002 runtime integration failed (exit=$integrationExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, privilege_mismatch=$privilegeSummary, safe_error=$safeFailureSummary); raw output suppressed."
    }
    Write-Output "db009_access_boundary=PASS runtime_role=non_owner_non_superuser_nobypassrls ddl=deny column_privileges=236 patient_ref=exact_column_select_insert patient_mapping=exact_8_column_select_read_only exchange_session=exact_12_column_select_insert_plus_2_update audit_event=exact_12_column_insert consent=exact_13_column_select_insert_plus_4_update consent_action=exact_3_column_select_insert grant=exact_13_column_insert_plus_2_select_plus_2_update(status,revoked_at) grant_scopes=exact_3_column_insert pacs_operation=15_select_15_insert_7_update integrity_evidence=exact_12_select_12_insert study_references=exact_6_select auth_evidence=56_select_columns rls_enable_force=17 cross_tenant=PASS third_tenant=DENY commit_rollback_context_reset=PASS pat001_repository=PASS iam002_context=PASS aut005_study_policy=PASS pat002_mapping_read=PASS mutable_guc_residual=recorded"

    $excFixture = [ordered]@{
        subjectA = $subjectA; actorA = $actorA; tenantA = $tenantA; hospitalA = $hospitalA
        subjectB = $subjectB; actorB = $actorB; tenantB = $tenantB; hospitalB = $hospitalB
        subjectC = $subjectC; actorC = $actorC; tenantC = $tenantC; hospitalC = $hospitalC
        patientRefId = $patientRefId
    } | ConvertTo-Json -Compress
    $exc003Fixture = [ordered]@{
        subjectA = $subjectA; actorA = $actorA; tenantA = $tenantA; hospitalA = $hospitalA
        subjectB = $exc003SubjectB; actorB = $exc003ActorB; tenantB = $tenantB; hospitalB = $hospitalB
        serviceSubjectB = $subjectB; serviceActorB = $actorB
        subjectC = $subjectC; actorC = $actorC; tenantC = $tenantC; hospitalC = $hospitalC
        patientRefId = $patientRefId
    } | ConvertTo-Json -Compress
    $exchangePrivilegeSql = @"
SELECT (
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public')=236
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='exchange_sessions' AND privilege_type='SELECT')=12
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='exchange_sessions' AND privilege_type='INSERT')=12
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='audit_events' AND privilege_type='INSERT')=12
  AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE grantee='mediq_runtime' AND table_schema='public')
    )::text || '|' ||
  (SELECT count(*)::text FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public');
"@
    $exchangeGrantCheck = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $exchangePrivilegeSql -Label "EXC-003 exact persistent scratch privilege inventory"
    $exchangeGrantCheckValues = @($exchangeGrantCheck)
    $exchangeGrantCheckValue = [string]::Join("", [string[]]$exchangeGrantCheckValues).Trim()
    if ($exchangeGrantCheckValues.Count -ne 1 -or $exchangeGrantCheckValue -ne "true|236") {
        throw "EXC-003 exact runtime privilege inventory mismatch; observed=$exchangeGrantCheckValue."
    }

    $exchangeIntegrationArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_EXC002_TEST_FIXTURE=$excFixture",
        "api-db-integration-test",
        "node", "--test", "tests/database/exchange-session-repository-runtime.integration.test.mjs"
    )
    $exchangeOutput = @(& docker @exchangeIntegrationArgs 2>&1 | ForEach-Object { $_.ToString() })
    $exchangeExitCode = $LASTEXITCODE
    $exchangeSummary = [string]::Join("`n", [string[]]@($exchangeOutput))
    if ($exchangeExitCode -ne 0 -or $exchangeSummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($exchangeSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($exchangeSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($exchangeSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($exchangeSummary, '\b(EXC002_STAGE=[A-Z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($exchangeSummary, '\b(EXC002_[A-Z0-9_]+|EXCHANGE_SESSION_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "EXC-002 PostgreSQL repository Acceptance failed (exit=$exchangeExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "exc002_repository=PASS create_read=PASS bilateral_rls=PASS unrelated_tenant=DENY no_context=DENY rollback=PASS persistent_column_privileges=236"

    $exchangeCreationArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_EXC003_TEST_FIXTURE=$exc003Fixture",
        "api-db-integration-test",
        "node", "--test", "tests/database/exchange-session-creation-runtime.integration.test.mjs"
    )
    $creationOutput = @(& docker @exchangeCreationArgs 2>&1 | ForEach-Object { $_.ToString() })
    $creationExitCode = $LASTEXITCODE
    $creationSummary = [string]::Join("`n", [string[]]@($creationOutput))
    if ($creationExitCode -ne 0 -or $creationSummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($creationSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($creationSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($creationSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($creationSummary, '\b(EXC003_STAGE=[A-Z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $failureMarker = [regex]::Match($creationSummary, '\bEXC003_FAILURE=([A-Z0-9_]+)').Groups[1].Value
        $databaseFailureCode = [regex]::Match($creationSummary, '\bdatabaseCode=([0-9A-Z]{5})').Groups[1].Value
        $recognizedFailure = [regex]::Match($creationSummary, '\b(EXCHANGE_SESSION_[A-Z_]+|PATIENT_REFERENCE_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ERR_MODULE_NOT_FOUND|ENOENT|28P01|42501|23502|23505|23514|AssertionError)\b').Groups[1].Value
        $safeFailureCode = if ($failureMarker) { $failureMarker } elseif ($databaseFailureCode) { $databaseFailureCode } else { $recognizedFailure }
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "EXC-003 PostgreSQL API Acceptance failed (exit=$creationExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "exc003_creation_api=PASS idempotency=PASS atomic_audit=PASS destination_hospital=PASS unauthorized=no_write"

    $consentPrivilegeSql = @"
SELECT (
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public')=236
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consents' AND privilege_type='SELECT')=13
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consents' AND privilege_type='INSERT')=13
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consent_actions' AND privilege_type='SELECT')=3
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consent_actions' AND privilege_type='INSERT')=3
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consents' AND privilege_type='UPDATE')=4
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='transfer_grants' AND privilege_type='UPDATE')=2
  AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='transfer_grants' AND privilege_type='UPDATE' AND column_name NOT IN ('status','revoked_at'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='consents' AND privilege_type='UPDATE' AND column_name NOT IN ('status','issued_at','updated_at','withdrawn_at'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE grantee='mediq_runtime' AND table_schema='public')
  AND (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='exchange_sessions' AND privilege_type='UPDATE')=2
  AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND privilege_type NOT IN ('SELECT','INSERT','UPDATE'))
    )::text || '|' ||
  (SELECT count(*)::text FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public');
"@
    $consentGrantCheck = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $consentPrivilegeSql -Label "CON-002 regression under current exact runtime grants"
    $consentGrantCheckValues = @($consentGrantCheck)
    $consentGrantCheckValue = [string]::Join("", [string[]]$consentGrantCheckValues).Trim()
    if ($consentGrantCheckValues.Count -ne 1 -or $consentGrantCheckValue -ne "true|236") {
        throw "CON-002 runtime privilege baseline mismatch; observed=$consentGrantCheckValue."
    }
    $consentIntegrationArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_CON002_TEST_FIXTURE=$excFixture",
        "api-db-integration-test",
        "node", "--test", "tests/database/consent-persistence-runtime.integration.test.mjs"
    )
    $consentOutput = @(& docker @consentIntegrationArgs 2>&1 | ForEach-Object { $_.ToString() })
    $consentIntegrationExitCode = $LASTEXITCODE
    $consentSummary = [string]::Join("`n", [string[]]@($consentOutput))
    if ($consentIntegrationExitCode -ne 0 -or $consentSummary -notmatch '(?m)^(?:#|ℹ) pass 7$') {
        $passCount = [regex]::Match($consentSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($consentSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($consentSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($consentSummary, '\b(CONSENT_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|25P01|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "CON-002 PostgreSQL persistence Acceptance failed (exit=$consentIntegrationExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "con002_persistence=PASS pending_only=PASS atomic_version=PASS concurrent=PASS rls=PASS current_exact_privileges=236"

    $consentRequestArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_CON003_TEST_FIXTURE=$exc003Fixture",
        "--env", "MEDIQ_TEST_INSPECT_DATABASE_URL=$($Settings["MEDIQ_MIGRATION_DATABASE_URL"])",
        "api-db-integration-test",
        "node", "--test", "tests/database/consent-request-api-runtime.integration.test.mjs"
    )
    $consentRequestOutput = @(& docker @consentRequestArgs 2>&1 | ForEach-Object { $_.ToString() })
    $consentRequestExitCode = $LASTEXITCODE
    $consentRequestSummary = [string]::Join("`n", [string[]]@($consentRequestOutput))
    if ($consentRequestExitCode -ne 0 -or $consentRequestSummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($consentRequestSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($consentRequestSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($consentRequestSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($consentRequestSummary, '\b(CON003_STAGE=[A-Z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($consentRequestSummary, '\b(CONSENT_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "CON-003 signed OIDC HTTP/PostgreSQL Acceptance failed (exit=$consentRequestExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "con003_request_api=PASS signed_oidc=PASS http_postgresql=PASS tenant_rls=PASS semantic_replay=PASS rollback=PASS exact_privileges=236"

    $consentApprovalArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_CON004_TEST_FIXTURE=$exc003Fixture",
        "--env", "MEDIQ_TEST_INSPECT_DATABASE_URL=$($Settings["MEDIQ_MIGRATION_DATABASE_URL"])",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/consent-approval-api-runtime.integration.test.mjs"
    )
    $consentApprovalOutput = @(& docker @consentApprovalArgs 2>&1 | ForEach-Object { $_.ToString() })
    $consentApprovalExitCode = $LASTEXITCODE
    $consentApprovalSummary = [string]::Join("`n", [string[]]@($consentApprovalOutput))
    if ($consentApprovalExitCode -ne 0 -or $consentApprovalSummary -notmatch '(?m)^(?:#|ℹ) pass 2$') {
        $passCount = [regex]::Match($consentApprovalSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($consentApprovalSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($consentApprovalSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($consentApprovalSummary, '\b(CON00[45]_STAGE=[A-Z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($consentApprovalSummary, '\b(CON00[45]_[A-Z_]+|CONSENT_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ERR_MODULE_NOT_FOUND|ENOENT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "CON-004/005 signed OIDC HTTP/PostgreSQL Acceptance failed (exit=$consentApprovalExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "con004_approval_api=PASS signed_oidc=PASS tenant_rls=PASS atomic_transition=PASS replay_concurrency=PASS rollback=PASS exact_privileges=236"
    Write-Output "con005_withdrawal_api=PASS signed_oidc=PASS tenant_rls=PASS expiry_independent=PASS atomic_audit=PASS replay_concurrency=PASS rollback=PASS exact_privileges=236"

    $grantIntegrationArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_GRT002_TEST_FIXTURE=$autFixture",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/transfer-grant-persistence-runtime.integration.test.mjs"
    )
    $grantOutput = @(& docker @grantIntegrationArgs 2>&1 | ForEach-Object { $_.ToString() })
    $grantIntegrationExitCode = $LASTEXITCODE
    $grantSummary = [string]::Join("`n", [string[]]@($grantOutput))
    if ($grantIntegrationExitCode -ne 0 -or $grantSummary -notmatch '(?m)^(?:#|ℹ) pass 7$') {
        $passCount = [regex]::Match($grantSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($grantSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($grantSummary, '(?m)^(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($grantSummary, '\b(TRANSFER_GRANT_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "GRT-002 synthetic PostgreSQL/RLS regression failed (exit=$grantIntegrationExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, safe_error=$safeFailureCode); current persistent inventory=236."
    }
    Write-Output "grt002_persistence_regression=PASS insert_read=PASS savepoint_rollback=PASS tenant_rls=PASS no_context=DENY current_persistent_privileges=236"

    $grantIssueArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_GRT003_TEST_FIXTURE=$autFixture",
        "--env", "MEDIQ_TEST_INSPECT_DATABASE_URL=$($Settings["MEDIQ_MIGRATION_DATABASE_URL"])",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/grant-issue-api-runtime.integration.test.mjs"
    )
    $grantIssueOutput = @(& docker @grantIssueArgs 2>&1 | ForEach-Object { $_.ToString() })
    $grantIssueExitCode = $LASTEXITCODE
    $grantIssueSummary = [string]::Join("`n", [string[]]@($grantIssueOutput))
    if ($grantIssueExitCode -ne 0 -or $grantIssueSummary -notmatch '(?m)^(?:#|ℹ) pass 14$') {
        $passCount = [regex]::Match($grantIssueSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($grantIssueSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($grantIssueSummary, '(?m)^\s*(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $failedStages = @([regex]::Matches($grantIssueSummary, '\b(GRT00[34]_STAGE=[A-Z_-]+)') | ForEach-Object { $_.Groups[1].Value })
        $failedStageSummary = if ($failedStages.Count -gt 0) { [string]::Join(",", [string[]]$failedStages) } else { "unavailable" }
        $safeTestDiagnostic = [regex]::Match($grantIssueSummary, 'GRT00[34]_FAILURE=[^\r\n]{1,240}').Value
        if (-not $safeTestDiagnostic) { $safeTestDiagnostic = "unavailable" }
        $safePreflightFacts = [regex]::Match($grantIssueSummary, 'GRT003_PREFLIGHT_FACTS=[a-z_:,]{1,300}').Value
        if (-not $safePreflightFacts) { $safePreflightFacts = "unavailable" }
        $safeFailureCode = [regex]::Match($grantIssueSummary, '\b(GRT00[34]_(?!STAGE=|FAILURE=)[A-Z_]+|GRANT_[A-Z_]+|CONSENT_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ACTOR_TENANT_[A-Z_]+|ACCESS_DENIED|SERVICE_UNAVAILABLE|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "GRT-003/004 signed OIDC HTTP/PostgreSQL Acceptance failed (exit=$grantIssueExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, stages=$failedStageSummary, safe_error=$safeFailureCode, diagnostic=$safeTestDiagnostic, preflight=$safePreflightFacts); raw output suppressed."
    }
    Write-Output "grt003_issue_api=PASS signed_oidc=PASS consent_binding=PASS actor_tenant_binding=PASS semantic_idempotency=PASS concurrency=PASS audit_atomicity=PASS cumulative_exact_privileges=236"
    Write-Output "grt004_revoke_api=PASS signed_oidc=PASS exact_recipient=PASS expiry_independent=PASS replay=PASS concurrency=PASS atomic_audit_rollback=PASS denial=PASS offline_and_inflight_nonrecall_boundary=DOCUMENTED exact_grant_update_columns=status,revoked_at"

    $pacsFenceArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_PACS001_FENCE_FIXTURE=$pacsFenceFixture",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/pacs-import-authorization-fence.integration.test.mjs"
    )
    $pacsFenceOutput = @(& docker @pacsFenceArgs 2>&1 | ForEach-Object { $_.ToString() })
    $pacsFenceExitCode = $LASTEXITCODE
    $pacsFenceSummary = [string]::Join("`n", [string[]]@($pacsFenceOutput))
    if ($pacsFenceExitCode -ne 0 -or $pacsFenceSummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($pacsFenceSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($pacsFenceSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($pacsFenceSummary, '(?m)^\s*(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($pacsFenceSummary, '\b(PACS001_FENCE_[A-Z_]+|GRANT_REVOCATION_[A-Z_]+|AUTHORIZATION_DENIED|PROTECTED_OPERATION_UNAVAILABLE|ACTOR_TENANT_[A-Z_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "PACS-001 Session-fence PostgreSQL Acceptance failed (exit=$pacsFenceExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "pacs001_session_fence=PASS auth_after_lock=PASS revoke_serialized=PASS post_revoke_denied=PASS no_operation_state_change=PASS no_dicom_call=PASS"

    $provenanceArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_PROV001_TEST_FIXTURE=$provenanceFixture",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/provenance-repository-runtime.integration.test.mjs"
    )
    $provenanceOutput = @(& docker @provenanceArgs 2>&1 | ForEach-Object { $_.ToString() })
    $provenanceExitCode = $LASTEXITCODE
    $provenanceSummary = [string]::Join("`n", [string[]]@($provenanceOutput))
    if ($provenanceExitCode -ne 0 -or $provenanceSummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($provenanceSummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($provenanceSummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTests = @([regex]::Matches($provenanceSummary, '(?m)^\s*(?:not ok \d+ - |✖ )([^\r\n]{1,120})') | ForEach-Object { $_.Groups[1].Value.Trim() })
        $failedTestSummary = if ($failedTests.Count -gt 0) { [string]::Join(",", [string[]]$failedTests) } else { "unavailable" }
        $safeFailureCode = [regex]::Match($provenanceSummary, '\b(PROV001_[A-Z_]+|PROVENANCE_[A-Z_]+|PACS_TRANSFER_OPERATION_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "PROV-001 PostgreSQL/RLS Acceptance failed (exit=$provenanceExitCode, pass=$passCount, fail=$failCount, failed_tests=$failedTestSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    Write-Output "prov001_runtime=PASS operation_binding=PASS pending_only=PASS replay=PASS rollback=PASS no_context=DENY cross_tenant=DENY late_first_write=DENY exact_236_privileges=PASS update_delete=DENY"

    $integrityArgs = $ComposeArgs + @(
        "--profile", "test", "run", "--build", "--rm", "--no-deps",
        "--env", "MEDIQ_INT001_TEST_FIXTURE=$integrityFixture",
        "api-db-integration-test",
        "node", "--test", "--test-reporter=tap", "tests/database/source-integrity-evidence-runtime.integration.test.mjs"
    )
    $integrityOutput = @(& docker @integrityArgs 2>&1 | ForEach-Object { $_.ToString() })
    $integrityExitCode = $LASTEXITCODE
    $integritySummary = [string]::Join("`n", [string[]]@($integrityOutput))
    if ($integrityExitCode -ne 0 -or $integritySummary -notmatch '(?m)^(?:#|ℹ) pass 1$') {
        $passCount = [regex]::Match($integritySummary, '(?m)^(?:#|ℹ) pass (\d+)$').Groups[1].Value
        $failCount = [regex]::Match($integritySummary, '(?m)^(?:#|ℹ) fail (\d+)$').Groups[1].Value
        $failedTest = [regex]::Match($integritySummary, '(?m)^not ok \d+ - ([^\r\n]{1,120})').Groups[1].Value
        if (-not $failedTest) { $failedTest = "unavailable" }
        $assertionSummary = [regex]::Match($integritySummary, 'AssertionError(?: \[ERR_ASSERTION\])?: ([^\r\n]{1,160})').Groups[1].Value
        if (-not $assertionSummary) { $assertionSummary = "unavailable" }
        $safeFailureCode = [regex]::Match($integritySummary, '\b(INT001_[A-Z_]+|SOURCE_INTEGRITY_EVIDENCE_[A-Z_]+|PACS_TRANSFER_OPERATION_[A-Z_]+|EXCHANGE_SESSION_[A-Z_]+|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|28P01|42501|23505|23514|23503|AssertionError)\b').Groups[1].Value
        if (-not $safeFailureCode) { $safeFailureCode = "unclassified" }
        throw "INT-001 source Integrity PostgreSQL/RLS Acceptance failed (exit=$integrityExitCode, pass=$passCount, fail=$failCount, test=$failedTest, assertion=$assertionSummary, safe_error=$safeFailureCode); raw output suppressed."
    }
    $integrityPrivilegeRestoreSql = @"
SELECT
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public')::text || '|' ||
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='integrity_evidence' AND privilege_type='SELECT')::text || '|' ||
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='integrity_evidence' AND privilege_type='INSERT')::text || '|' ||
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name='study_references' AND privilege_type='SELECT')::text || '|' ||
  (SELECT count(*) FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public' AND table_name IN ('integrity_evidence','study_references') AND privilege_type IN ('UPDATE','DELETE'))::text;
"@
    $integrityPrivilegeRestore = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $integrityPrivilegeRestoreSql -Label "INT-001 persistent runtime privilege restoration"
    $integrityPrivilegeRestoreText = [string]::Join("", [string[]]@($integrityPrivilegeRestore))
    if ($integrityPrivilegeRestore.Count -ne 1 -or $integrityPrivilegeRestoreText -ne "236|12|12|6|0") {
        throw "INT-001 permanent runtime privilege inventory mismatch; actual=$integrityPrivilegeRestoreText expected=236|12|12|6|0."
    }
    Write-Output "int001_runtime=PASS operation_binding=PASS pending_only=PASS exact_replay=PASS conflict=DENY rollback=PASS no_context=DENY cross_tenant=DENY late_first_write=DENY exact_evidence_12_select_12_insert=PASS exact_study_scope_6_select=PASS persistent_236=PASS update_delete=DENY"
}

function Assert-ScratchSchema {
    param([string]$Network, [hashtable]$Settings, [string[]]$ComposeArgs, [switch]$RunRegistryPolicyAcceptance)

    $tables = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '__drizzle_migrations' ORDER BY tablename;" -Label "DB-008 scratch table inventory"
    $actualTables = @($tables | Sort-Object)
    $expectedTables = @($approvedProductTables | Sort-Object)
    $tableSetsMatch = [string]::Equals(($actualTables -join ","), ($expectedTables -join ","), [StringComparison]::Ordinal)
    if (-not $tableSetsMatch) { throw "DB-008 scratch table allowlist mismatch; actual=$($actualTables.Count) expected=$($expectedTables.Count)." }

    $catalogSql = @"
SELECT
  (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid <> 'public.__drizzle_migrations'::regclass AND contype='p')::text || '|' ||
  (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid <> 'public.__drizzle_migrations'::regclass AND contype='f')::text || '|' ||
  (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid <> 'public.__drizzle_migrations'::regclass AND contype='u')::text || '|' ||
  (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid <> 'public.__drizzle_migrations'::regclass AND contype='c')::text;
"@
    $catalog = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $catalogSql -Label "DB-008 scratch constraint catalog"
    $catalogValue = [string]::Join("", [string[]]@($catalog))
    $catalogMatches = $catalog.Count -eq 1 -and [regex]::IsMatch($catalogValue, '^18\|50\|17\|40$')
    if (-not $catalogMatches) {
        $actualCodes = (@($catalogValue.ToCharArray()) | ForEach-Object { [int]$_ }) -join ","
        throw "DB-008 scratch PK/FK/UNIQUE/CHECK catalog mismatch; actual=$catalogValue length=$($catalogValue.Length) codes=$actualCodes expected=$expectedCatalogCounts."
    }

    $ledger = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql "SELECT count(*)::text || '|' || (SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='__drizzle_migrations') FROM public.__drizzle_migrations;" -Label "DB-008 scratch migration ledger"
    $ledgerText = [string]::Join("", [string[]]@($ledger))
    if ($ledger.Count -ne 1 -or $ledgerText -notmatch '^23\|mediq_migrator$') { throw "P0 scratch migration ledger mismatch; actual=$ledgerText." }

    $runtimeProbe = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql "SELECT 1;" -Label "DB-008 scratch runtime role probe"
    $runtimeText = [string]::Join("", [string[]]@($runtimeProbe))
    if ($runtimeProbe.Count -ne 1 -or $runtimeText -notmatch '^1$') { throw "DB-008 scratch runtime role probe failed." }
    $runtimeLedger = Invoke-ScratchPsqlRaw -Network $Network -User $Settings["MEDIQ_DB_RUNTIME_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_RUNTIME_PASSWORD"] -Sql "SELECT count(*) FROM public.__drizzle_migrations;"
    if ($runtimeLedger.ExitCode -eq 0) { throw "DB-008 runtime role unexpectedly read the migration ledger." }

    Assert-Db009AccessBoundary -Network $Network -Settings $Settings -ComposeArgs $ComposeArgs

    if ($RunRegistryPolicyAcceptance) {
        $token = [guid]::NewGuid().ToString("N")
        $organizationA = [guid]::NewGuid().ToString()
        $organizationB = [guid]::NewGuid().ToString()
        $tenantA = [guid]::NewGuid().ToString()
        $tenantB = [guid]::NewGuid().ToString()
        $hospitalA = [guid]::NewGuid().ToString()
        $hospitalSuspended = [guid]::NewGuid().ToString()
        $hospitalInactive = [guid]::NewGuid().ToString()
        $hospitalB = [guid]::NewGuid().ToString()
        $actorActive = [guid]::NewGuid().ToString()
        $actorSuspended = [guid]::NewGuid().ToString()
        $actorInactive = [guid]::NewGuid().ToString()
        $actorTenantLevel = [guid]::NewGuid().ToString()
        $policyAcceptanceSql = @"
BEGIN;
INSERT INTO organizations (organization_id, organization_code, name, organization_type, status, created_at, updated_at) VALUES
  ('$organizationA', 'DB008-ORGA-$token', 'Synthetic Org A', 'DB008_CUSTOM_CATEGORY', 'ACTIVE', now(), now()),
  ('$organizationB', 'DB008-ORGB-$token', 'Synthetic Org B', 'DB008_OTHER_CATEGORY', 'ACTIVE', now(), now());
INSERT INTO tenants (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at) VALUES
  ('$tenantA', '$organizationA', 'DB008-TENA-$token', 'Synthetic Tenant A', 'ACTIVE', now(), now()),
  ('$tenantB', '$organizationB', 'DB008-TENB-$token', 'Synthetic Tenant B', 'ACTIVE', now(), now());
INSERT INTO hospitals (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at) VALUES
  ('$hospitalA', '$tenantA', '$organizationA', 'DB008-HA-$token', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
  ('$hospitalSuspended', '$tenantA', '$organizationA', 'DB008-HS-$token', 'Synthetic Suspended Hospital', 'TEST', 'SUSPENDED', now(), now()),
  ('$hospitalInactive', '$tenantA', '$organizationA', 'DB008-HI-$token', 'Synthetic Inactive Hospital', 'TEST', 'INACTIVE', now(), now()),
  ('$hospitalB', '$tenantB', '$organizationB', 'DB008-HB-$token', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now());
INSERT INTO actors (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at) VALUES
  ('$actorActive', '$tenantA', '$hospitalA', 'USER', 'db008-active-$token', 'Synthetic Active Actor', 'ACTIVE', now(), now()),
  ('$actorSuspended', '$tenantA', '$hospitalA', 'USER', 'db008-suspended-$token', 'Synthetic Suspended Actor', 'SUSPENDED', now(), now()),
  ('$actorInactive', '$tenantA', '$hospitalA', 'USER', 'db008-inactive-$token', 'Synthetic Inactive Actor', 'INACTIVE', now(), now()),
  ('$actorTenantLevel', '$tenantA', NULL, 'SERVICE', 'db008-tenant-level-$token', 'Synthetic Tenant Actor', 'ACTIVE', now(), now());
DO `$db008_policy`$
BEGIN
  BEGIN
    INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantA', '$organizationB', 'DB008-BAD-ORG-$token', 'Mismatched Hospital', 'TEST', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB008_EXPECTED_HOSPITAL_OWNER_PAIR_FK';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO actors VALUES (gen_random_uuid(), '$tenantA', '$hospitalB', 'USER', 'db008-bad-actor-$token', 'Mismatched Actor', 'ACTIVE', now(), now());
    RAISE EXCEPTION 'DB008_EXPECTED_ACTOR_OWNER_PAIR_FK';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO hospitals VALUES (gen_random_uuid(), '$tenantA', '$organizationA', 'DB008-BAD-HS-$token', 'Invalid Hospital Status', 'TEST', 'UNKNOWN', now(), now());
    RAISE EXCEPTION 'DB008_EXPECTED_HOSPITAL_STATUS_CHECK';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO actors VALUES (gen_random_uuid(), '$tenantA', '$hospitalA', 'USER', 'db008-bad-status-$token', 'Invalid Actor Status', 'UNKNOWN', now(), now());
    RAISE EXCEPTION 'DB008_EXPECTED_ACTOR_STATUS_CHECK';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
`$db008_policy`$;
SELECT
  (SELECT count(DISTINCT status) FROM hospitals WHERE hospital_id IN ('$hospitalA', '$hospitalSuspended', '$hospitalInactive'))::text || '|' ||
  (SELECT count(DISTINCT status) FROM actors WHERE actor_id IN ('$actorActive', '$actorSuspended', '$actorInactive'))::text || '|' ||
  (SELECT count(*) FROM organizations WHERE organization_id IN ('$organizationA', '$organizationB') AND organization_type IN ('DB008_CUSTOM_CATEGORY', 'DB008_OTHER_CATEGORY'))::text || '|' ||
  (SELECT count(*) FROM actors WHERE actor_id = '$actorTenantLevel' AND hospital_id IS NULL)::text;
ROLLBACK;
SELECT count(*) FROM organizations WHERE organization_code IN ('DB008-ORGA-$token', 'DB008-ORGB-$token');
"@
        $policyAcceptance = Invoke-ScratchPsql -Network $Network -User $Settings["MEDIQ_DB_MIGRATION_USER"] -Database $Settings["MEDIQ_POSTGRES_DB"] -Password $Settings["MEDIQ_DB_MIGRATION_PASSWORD"] -Sql $policyAcceptanceSql -Label "DB-008 approved registry policy acceptance"
        $policyAcceptanceText = if ($policyAcceptance.Count -gt 0) { [string]$policyAcceptance[0] } else { "" }
        $persistedCanaryRows = if ($policyAcceptance.Count -gt 1) { [string]$policyAcceptance[1] } else { "" }
        if ($policyAcceptance.Count -ne 2 -or $policyAcceptanceText -notmatch '^3\|3\|2\|1$' -or $persistedCanaryRows -notmatch '^0$') {
            throw "DB-008 approved registry policy acceptance did not produce the expected positive, negative, and rollback results."
        }
        Write-Output "db008_policy_conformance=PASS hospital_owner_mismatch=rejected actor_owner_mismatch=rejected hospital_statuses=3 actor_statuses=3 custom_org_type=accepted tenant_level_actor=null synthetic_rows_persisted=0"
    }
}

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required DB-008 input is missing: $([IO.Path]::GetFileName($file))" }
}

Push-Location $repositoryRoot
$temporaryProject = "mediq-db008-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
$composeArgs = @("compose", "--project-name", $temporaryProject, "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
$scratchCreated = $false
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be Git-ignored before credentials are read." }
    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($key in @("MEDIQ_POSTGRES_USER", "MEDIQ_POSTGRES_PASSWORD", "MEDIQ_POSTGRES_DB", "MEDIQ_DB_RUNTIME_USER", "MEDIQ_DB_RUNTIME_PASSWORD", "MEDIQ_DB_MIGRATION_USER", "MEDIQ_DB_MIGRATION_PASSWORD")) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) { throw "Required local DB-008 setting is missing: $key" }
    }
    if ($settings["MEDIQ_DB_RUNTIME_USER"] -ne "mediq_runtime" -or $settings["MEDIQ_DB_MIGRATION_USER"] -ne "mediq_migrator") { throw "DB-008 role names do not match the approved baseline." }
    foreach ($key in @("MEDIQ_POSTGRES_PASSWORD", "MEDIQ_DB_RUNTIME_PASSWORD", "MEDIQ_DB_MIGRATION_PASSWORD")) {
        if (Is-Placeholder $settings[$key]) { throw "A DB-008 local credential remains a placeholder: $key" }
    }
    if ($settings["MEDIQ_DB_RUNTIME_PASSWORD"] -eq $settings["MEDIQ_DB_MIGRATION_PASSWORD"] -or $settings["MEDIQ_POSTGRES_PASSWORD"] -in @($settings["MEDIQ_DB_RUNTIME_PASSWORD"], $settings["MEDIQ_DB_MIGRATION_PASSWORD"])) { throw "DB-008 credentials must be distinct." }
    if ($settings["MEDIQ_POSTGRES_DB"] -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw "DB-008 database identifier is invalid." }

    Assert-NoProjectResources $temporaryProject
    $scratchCreated = $true
    $network = Start-ScratchDatabase -ComposeArgs $composeArgs -ProjectName $temporaryProject -Settings $settings
    Write-Output "db008_scratch_postgres=PASS role_bootstrap=PASS"
    Invoke-Migrations $composeArgs
    Assert-ScratchSchema -Network $network -Settings $settings -ComposeArgs $composeArgs -RunRegistryPolicyAcceptance
    Invoke-Migrations $composeArgs
    Assert-ScratchSchema -Network $network -Settings $settings -ComposeArgs $composeArgs
    Write-Output "db008_clean_up=PASS product_tables=18 ledger=23 catalog=$expectedCatalogCounts"

    Remove-TemporaryProject -ComposeArgs $composeArgs -ProjectName $temporaryProject
    Write-Output "db008_reset=PASS only_owned_ephemeral_compose_resources_removed=true"

    $network = Start-ScratchDatabase -ComposeArgs $composeArgs -ProjectName $temporaryProject -Settings $settings
    Write-Output "db008_reset_postgres=PASS role_bootstrap=PASS"
    Invoke-Migrations $composeArgs
    Assert-ScratchSchema -Network $network -Settings $settings -ComposeArgs $composeArgs -RunRegistryPolicyAcceptance
    Write-Output "db008_reset_reapply=PASS product_tables=18 ledger=23"

    foreach ($scriptName in @("test-db-002-registry.ps1", "test-db-003-patient.ps1", "test-db-004-exchange.ps1", "test-db-005-consent-grant.ps1", "test-db-006-imaging.ps1", "test-db-007-evidence.ps1")) {
        $scriptPath = Join-Path $PSScriptRoot $scriptName
        if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "Required regression script is missing: $scriptName" }
        & $scriptPath -EnvFile $EnvFile -ComposeFile $ComposeFile
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "DB-008 regression failed: $scriptName" }
    }
    Write-Output "db008_prior_schema_regressions=PASS tickets=DB-002,DB-003,DB-004,DB-005,DB-006,DB-007"

    Remove-TemporaryProject -ComposeArgs $composeArgs -ProjectName $temporaryProject
    $scratchCreated = $false
    Write-Output "db008_ephemeral_cleanup=PASS"
    Write-Output "db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false"
}
finally {
    try {
        if ($scratchCreated) { Remove-TemporaryProject -ComposeArgs $composeArgs -ProjectName $temporaryProject }
    }
    finally { Pop-Location }
}
