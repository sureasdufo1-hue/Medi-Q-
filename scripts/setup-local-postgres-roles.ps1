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
    $result = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($result.ContainsKey($key)) { throw "Duplicate key in local environment file: $key" }
        $rawValue = $line.Substring($separator + 1).Trim()
        if ($rawValue.Length -ge 2 -and $rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) {
            $value = ConvertFrom-Json -InputObject $rawValue
        }
        elseif ($rawValue.Length -ge 2 -and $rawValue.StartsWith("'") -and $rawValue.EndsWith("'")) {
            $value = $rawValue.Substring(1, $rawValue.Length - 2).Replace("''", "'")
        }
        else { $value = $rawValue }
        $result[$key] = [string]$value
    }
    return $result
}

function New-LocalPassword {
    $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Is-Placeholder([string]$Value) {
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -match "(?i)(replace[-_ ]?before|change[-_ ]?me|placeholder|^todo$)"
}

function Invoke-ContainerPsql {
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
        $captured = @($Sql | & docker run --rm --interactive --network $Network --env PGPASSWORD $postgresImage psql -X -w -q -t -A -v ON_ERROR_STOP=1 -h postgres -U $User -d $Database -f - 2>&1)
        $exitCode = $LASTEXITCODE
        return [pscustomobject]@{ ExitCode = $exitCode; Output = $captured }
    }
    finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
    throw "Local env file was not found. Copy .env.example to the ignored root .env and set the bootstrap credentials."
}

Push-Location $repositoryRoot
$temporaryEnvPath = $null
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The env file must be ignored by Git before credentials are read." }

    $values = Read-LocalEnv $resolvedEnvFile
    foreach ($requiredKey in @("MEDIQ_POSTGRES_USER", "MEDIQ_POSTGRES_PASSWORD", "MEDIQ_POSTGRES_DB")) {
        if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($values[$requiredKey])) {
            throw "Required local database bootstrap setting is missing: $requiredKey"
        }
    }
    if (Is-Placeholder $values["MEDIQ_POSTGRES_PASSWORD"]) { throw "The PostgreSQL bootstrap password is still a placeholder." }
    if ($values["MEDIQ_RUNTIME_PROFILE"] -and $values["MEDIQ_RUNTIME_PROFILE"] -ne "container") {
        throw "This Compose baseline supports only the container runtime profile; no host ports will be opened."
    }

    $rolePattern = '^[a-z_][a-z0-9_]{0,62}$'
    $runtimeUser = if ($values["MEDIQ_DB_RUNTIME_USER"]) { $values["MEDIQ_DB_RUNTIME_USER"] } else { "mediq_runtime" }
    $migrationUser = if ($values["MEDIQ_DB_MIGRATION_USER"]) { $values["MEDIQ_DB_MIGRATION_USER"] } else { "mediq_migrator" }
    $databaseName = $values["MEDIQ_POSTGRES_DB"]
    if ($runtimeUser -ne "mediq_runtime" -or $migrationUser -ne "mediq_migrator") {
        throw "Database role names must match the approved runtime/migration baseline."
    }
    if ($runtimeUser -notmatch $rolePattern -or $migrationUser -notmatch $rolePattern -or $databaseName -notmatch $rolePattern) {
        throw "Database identifiers contain unsupported characters."
    }

    $runtimePassword = $values["MEDIQ_DB_RUNTIME_PASSWORD"]
    if (Is-Placeholder $runtimePassword) { $runtimePassword = New-LocalPassword }
    $migrationPassword = $values["MEDIQ_DB_MIGRATION_PASSWORD"]
    if (Is-Placeholder $migrationPassword) { $migrationPassword = New-LocalPassword }
    if ($runtimePassword -eq $values["MEDIQ_POSTGRES_PASSWORD"]) { $runtimePassword = New-LocalPassword }
    if ($migrationPassword -eq $values["MEDIQ_POSTGRES_PASSWORD"]) { $migrationPassword = New-LocalPassword }
    if ($runtimePassword -eq $migrationPassword) { throw "Runtime and migration credentials must be distinct." }

    $runtimeUrl = "postgresql://$runtimeUser`:$([Uri]::EscapeDataString($runtimePassword))@postgres:5432/$([Uri]::EscapeDataString($databaseName))"
    $migrationUrl = "postgresql://$migrationUser`:$([Uri]::EscapeDataString($migrationPassword))@postgres:5432/$([Uri]::EscapeDataString($databaseName))"
    $updates = [ordered]@{
        MEDIQ_RUNTIME_PROFILE = "container"
        MEDIQ_DB_RUNTIME_USER = $runtimeUser
        MEDIQ_DB_RUNTIME_PASSWORD = $runtimePassword
        MEDIQ_DATABASE_URL = $runtimeUrl
        MEDIQ_DB_MIGRATION_USER = $migrationUser
        MEDIQ_DB_MIGRATION_PASSWORD = $migrationPassword
        MEDIQ_MIGRATION_DATABASE_URL = $migrationUrl
    }

    $lines = [Collections.Generic.List[string]]::new()
    $seenKeys = @{}
    foreach ($line in [IO.File]::ReadAllLines($resolvedEnvFile)) {
        $separator = $line.IndexOf("=")
        if ($separator -gt 0 -and -not $line.TrimStart().StartsWith("#")) {
            $key = $line.Substring(0, $separator).Trim()
            if ($updates.Contains($key)) {
                if ($seenKeys.ContainsKey($key)) { throw "Duplicate key in local environment file: $key" }
                $lines.Add("$key=$($updates[$key])")
                $seenKeys[$key] = $true
                continue
            }
        }
        $lines.Add($line)
    }
    foreach ($key in $updates.Keys) {
        if (-not $seenKeys.ContainsKey($key)) { $lines.Add("$key=$($updates[$key])") }
    }

    $content = [string]::Join("`r`n", $lines) + "`r`n"
    $temporaryEnvPath = Join-Path $repositoryRoot (".env.env008." + [Guid]::NewGuid().ToString("N") + ".tmp")
    [IO.File]::WriteAllText($temporaryEnvPath, $content, [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporaryEnvPath, $resolvedEnvFile, $true)
    $temporaryEnvPath = $null

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $containerId = (& docker @composeArgs ps -q postgres | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw "PostgreSQL is not running. Start the approved Compose postgres service first."
    }
    $state = (& docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}' $containerId | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $state -ne "running|healthy") { throw "PostgreSQL must be healthy before role provisioning." }

    $networks = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $containerId | Out-String).Trim() | ConvertFrom-Json
    $networkNames = @($networks.PSObject.Properties.Name)
    if ($networkNames.Count -ne 1 -or $networkNames[0] -notmatch '(^|_)database$') {
        throw "PostgreSQL is not attached to the expected isolated database network."
    }
    $databaseNetwork = $networkNames[0]

    $roleSql = @"
DO `$env008_role_setup`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$runtimeUser') THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$runtimeUser', '$runtimePassword');
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$runtimeUser', '$runtimePassword');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$migrationUser') THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$migrationUser', '$migrationPassword');
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', '$migrationUser', '$migrationPassword');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mediq_quota_owner') THEN
    ALTER ROLE mediq_quota_owner WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    CREATE ROLE mediq_quota_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
`$env008_role_setup`$;
REVOKE CONNECT ON DATABASE "$databaseName" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE "$databaseName" FROM "$runtimeUser", "$migrationUser";
GRANT CONNECT ON DATABASE "$databaseName" TO "$runtimeUser", "$migrationUser";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM "$runtimeUser", "$migrationUser";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "$runtimeUser";
GRANT USAGE, CREATE ON SCHEMA public TO "$migrationUser";
GRANT USAGE, CREATE ON SCHEMA public TO mediq_quota_owner;
GRANT mediq_quota_owner TO "$migrationUser";
"@

    $bootstrap = Invoke-ContainerPsql -Network $databaseNetwork -User $values["MEDIQ_POSTGRES_USER"] -Database $databaseName -Password $values["MEDIQ_POSTGRES_PASSWORD"] -Sql $roleSql
    if ($bootstrap.ExitCode -ne 0) { throw "Database role provisioning failed; command output was suppressed to protect local credentials." }

    $runtimeProbeSql = "SELECT current_user || chr(124) || r.rolsuper::text || chr(124) || r.rolcreatedb::text || chr(124) || r.rolcreaterole::text || chr(124) || r.rolbypassrls::text FROM pg_roles r WHERE r.rolname = current_user;`nSELECT 1;"
    $runtimeProbe = Invoke-ContainerPsql -Network $databaseNetwork -User $runtimeUser -Database $databaseName -Password $runtimePassword -Sql $runtimeProbeSql
    $runtimeProbeOutput = ($runtimeProbe.Output -join "`n").Trim()
    if ($runtimeProbe.ExitCode -ne 0 -or $runtimeProbeOutput -ne "mediq_runtime|false|false|false|false`n1") {
        throw "Runtime role authentication or least-privilege verification failed; output was suppressed."
    }

    $invalidPasswordProbe = Invoke-ContainerPsql -Network $databaseNetwork -User $runtimeUser -Database $databaseName -Password (New-LocalPassword) -Sql "SELECT 1;"
    if ($invalidPasswordProbe.ExitCode -eq 0) {
        throw "PostgreSQL accepted an invalid runtime password."
    }

    $runtimeDdl = Invoke-ContainerPsql -Network $databaseNetwork -User $runtimeUser -Database $databaseName -Password $runtimePassword -Sql "CREATE TABLE public.mediq_env008_runtime_permission_probe (id integer);"
    if ($runtimeDdl.ExitCode -eq 0) { throw "Runtime role unexpectedly has schema DDL privileges." }

    $migrationDdl = Invoke-ContainerPsql -Network $databaseNetwork -User $migrationUser -Database $databaseName -Password $migrationPassword -Sql "BEGIN; CREATE TABLE public.mediq_env008_migration_permission_probe (id integer); ROLLBACK;"
    if ($migrationDdl.ExitCode -ne 0) { throw "Migration role lacks expected schema DDL privileges; output was suppressed." }

    $migrationProbeSql = "SELECT current_user || chr(124) || r.rolsuper::text || chr(124) || r.rolcreatedb::text || chr(124) || r.rolcreaterole::text || chr(124) || r.rolbypassrls::text FROM pg_roles r WHERE r.rolname = current_user;"
    $migrationProbe = Invoke-ContainerPsql -Network $databaseNetwork -User $migrationUser -Database $databaseName -Password $migrationPassword -Sql $migrationProbeSql
    if ($migrationProbe.ExitCode -ne 0 -or ($migrationProbe.Output -join "").Trim() -ne "mediq_migrator|false|false|false|false") {
        throw "Migration role authentication or least-privilege verification failed; output was suppressed."
    }
    $migrationRollbackProbe = Invoke-ContainerPsql -Network $databaseNetwork -User $values["MEDIQ_POSTGRES_USER"] -Database $databaseName -Password $values["MEDIQ_POSTGRES_PASSWORD"] -Sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='mediq_env008_migration_permission_probe';"
    if ($migrationRollbackProbe.ExitCode -ne 0 -or ($migrationRollbackProbe.Output -join "").Trim() -ne "0") {
        throw "Migration test object remained after transaction rollback; output was suppressed."
    }

    $roleBoundarySql = "SELECT count(*) FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member WHERE member_role.rolname='$runtimeUser';"
    $membership = Invoke-ContainerPsql -Network $databaseNetwork -User $values["MEDIQ_POSTGRES_USER"] -Database $databaseName -Password $values["MEDIQ_POSTGRES_PASSWORD"] -Sql $roleBoundarySql
    if ($membership.ExitCode -ne 0 -or ($membership.Output -join "").Trim() -ne "0") {
        throw "Runtime role has unexpected inherited memberships; output was suppressed."
    }

    Write-Output "postgres_bootstrap=local-provisioning-only"
    Write-Output "runtime_role=mediq_runtime superuser=false create_db=false create_role=false bypass_rls=false ddl=false"
    Write-Output "migration_role=mediq_migrator superuser=false create_db=false create_role=false bypass_rls=false ddl=public-schema-only"
    Write-Output "runtime_and_migration_passwords=distinct; local_values_not_displayed"
    Write-Output "runtime_role_auth=PASS invalid_password_rejected=PASS runtime_ddl_denied=PASS migration_ddl_transaction=PASS rollback_clean=PASS"
}
finally {
    if ($temporaryEnvPath -and (Test-Path -LiteralPath $temporaryEnvPath)) {
        Remove-Item -LiteralPath $temporaryEnvPath -Force
    }
    Pop-Location
}
