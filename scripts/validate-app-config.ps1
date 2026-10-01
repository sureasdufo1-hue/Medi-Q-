[CmdletBinding()]
param([string]$EnvFile = ".env")

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
    throw "Local env file was not found. Run the local configuration setup first."
}

Push-Location $repositoryRoot
try {
    & npm run typecheck:app-config
    if ($LASTEXITCODE -ne 0) { throw "Application configuration typecheck failed." }
    & npm run test:app-config
    if ($LASTEXITCODE -ne 0) { throw "Application configuration tests failed." }

    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The env file must be ignored by Git." }

    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($resolvedEnvFile)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($values.ContainsKey($key)) { throw "Duplicate key in local environment file: $key" }
        $rawValue = $line.Substring($separator + 1).Trim()
        if ($rawValue.Length -ge 2 -and $rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) {
            $value = ConvertFrom-Json -InputObject $rawValue
        }
        elseif ($rawValue.Length -ge 2 -and $rawValue.StartsWith("'") -and $rawValue.EndsWith("'")) {
            $value = $rawValue.Substring(1, $rawValue.Length - 2).Replace("''", "'")
        }
        else { $value = $rawValue }
        $values[$key] = [string]$value
    }

    $applicationEnvironment = [ordered]@{}
    foreach ($key in @(
        "MEDIQ_RUNTIME_PROFILE", "MEDIQ_ENV", "MEDIQ_LOG_LEVEL", "MEDIQ_API_PORT",
        "MEDIQ_POSTGRES_DB", "MEDIQ_DATABASE_URL",
        "ORTHANC_A_URL", "ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD",
        "ORTHANC_B_URL", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD"
    )) {
        if (-not $values.ContainsKey($key)) { throw "Required application setting is missing: $key" }
        $applicationEnvironment[$key] = $values[$key]
    }

    function Test-DatabaseUrlMatches([string]$Url, [string]$User, [string]$Password, [string]$Database) {
        try {
            $uri = [Uri]$Url
            $userInfo = $uri.UserInfo
            $credentialSeparator = $userInfo.IndexOf(':')
            if ($credentialSeparator -lt 1) { return $false }
            $actualUser = [Uri]::UnescapeDataString($userInfo.Substring(0, $credentialSeparator))
            $actualPassword = [Uri]::UnescapeDataString($userInfo.Substring($credentialSeparator + 1))
            $actualDatabase = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
            return ($uri.Scheme -in @('postgres', 'postgresql') -and $uri.Host -eq 'postgres' -and $uri.Port -eq 5432 -and
                $actualUser -ceq $User -and $actualPassword -ceq $Password -and $actualDatabase -ceq $Database)
        }
        catch { return $false }
    }
    function Assert-DatabaseUrlMatches([string]$UrlKey, [string]$UserKey, [string]$PasswordKey, [string]$DatabaseKey) {
        foreach ($key in @($UrlKey, $UserKey, $PasswordKey, $DatabaseKey)) {
            if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
                throw "Required database credential mapping is missing: $key"
            }
        }
        if (-not (Test-DatabaseUrlMatches -Url $values[$UrlKey] -User $values[$UserKey] -Password $values[$PasswordKey] -Database $values[$DatabaseKey])) {
            throw "Database URL does not match its dedicated credential settings: $UrlKey"
        }
    }
    Assert-DatabaseUrlMatches -UrlKey 'MEDIQ_DATABASE_URL' -UserKey 'MEDIQ_DB_RUNTIME_USER' -PasswordKey 'MEDIQ_DB_RUNTIME_PASSWORD' -DatabaseKey 'MEDIQ_POSTGRES_DB'
    Assert-DatabaseUrlMatches -UrlKey 'MEDIQ_MIGRATION_DATABASE_URL' -UserKey 'MEDIQ_DB_MIGRATION_USER' -PasswordKey 'MEDIQ_DB_MIGRATION_PASSWORD' -DatabaseKey 'MEDIQ_POSTGRES_DB'
    if (Test-DatabaseUrlMatches -Url 'postgresql://mediq_runtime:test-password@postgres:5432/mediq' -User 'mediq_runtime' -Password 'incorrect-test-password' -Database 'mediq') {
        throw 'Database URL validator accepted a deliberately mismatched test credential.'
    }

    $json = $applicationEnvironment | ConvertTo-Json -Compress
    $nodeProbe = 'import { parseAppConfig } from "./dist/app-config/config/app-config.js";let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{const c=parseAppConfig(JSON.parse(s));console.log("app_config_validation=PASS profile="+c.runtimeProfile+" database_role="+c.databaseRole+" db_host="+new URL(c.databaseUrl).hostname+" orthanc_a_host="+new URL(c.orthancAUrl).hostname+" orthanc_b_host="+new URL(c.orthancBUrl).hostname);}catch(e){console.error("app_config_validation=FAIL reason="+e.message);process.exitCode=1;}});'
    $json | & node --input-type=module -e $nodeProbe
    if ($LASTEXITCODE -ne 0) { throw "Application environment validation failed; no secret values were printed." }

    Write-Output "database_url_mismatch_rejection=PASS"
    Write-Output "PASS: local configuration maps only allowlisted runtime values; bootstrap and migration credentials are not passed to the config loader."
}
finally { Pop-Location }
