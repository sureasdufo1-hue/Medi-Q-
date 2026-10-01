[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))
$resolvedComposeFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ComposeFile))
$resolvedTestCa = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "data/local-tls/test-ca.crt"))
$nodeImage = "node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43"

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
    throw "Local env file was not found. Copy .env.example to the ignored .env and set test credentials."
}
if (-not (Test-Path -LiteralPath $resolvedTestCa -PathType Leaf)) {
    throw "Local Test CA is missing. Run scripts/new-local-test-orthanc-certs.ps1 first."
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) {
        throw "The env file must be ignored by Git before credentials are read."
    }

    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($resolvedEnvFile)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }

        $key = $line.Substring(0, $separator).Trim()
        $rawValue = $line.Substring($separator + 1).Trim()
        if ($rawValue.Length -ge 2 -and $rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) {
            $value = ConvertFrom-Json -InputObject $rawValue
        }
        elseif ($rawValue.Length -ge 2 -and $rawValue.StartsWith("'") -and $rawValue.EndsWith("'")) {
            $value = $rawValue.Substring(1, $rawValue.Length - 2).Replace("''", "'")
        }
        else {
            $value = $rawValue
        }
        $values[$key] = [string]$value
    }

    foreach ($requiredKey in @("ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD")) {
        if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrEmpty($values[$requiredKey])) {
            throw "Required Orthanc A test setting is missing: $requiredKey"
        }
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $containerId = (& docker @composeArgs ps -q orthanc-a | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw "Hospital A Orthanc is not running. Start it with docker compose up -d orthanc-a."
    }

    $state = (& docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}' $containerId | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $state -ne "running|healthy") {
        throw "Hospital A Orthanc is not healthy. Observed state: $state"
    }

    $healthArgs = $composeArgs + @("exec", "-T", "orthanc-a", "python3", "/probes/mediq-tls-healthcheck.py", "/run/mediq/test-ca.crt")
    & docker @healthArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital A Orthanc aliveness probe failed."
    }

    $probeInput = @{
        username = $values["ORTHANC_A_USERNAME"]
        password = $values["ORTHANC_A_PASSWORD"]
    } | ConvertTo-Json -Compress

    $nodeProbe = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const c=JSON.parse(s),base="https://orthanc-a:8042",good="Basic "+Buffer.from(c.username+":"+c.password).toString("base64"),bad="Basic "+Buffer.from(c.username+":invalid-test-password").toString("base64");async function get(path,authorization){const h={Accept:"application/dicom+json"};if(authorization)h.Authorization=authorization;const r=await fetch(base+path,{headers:h});return {status:r.status,type:r.headers.get("content-type")||"",body:await r.text()};}const denied=await get("/dicom-web/studies"),invalid=await get("/dicom-web/studies",bad),system=await get("/system",good),plugins=await get("/plugins",good),qido=await get("/dicom-web/studies",good);let loaded=false,count=-1;try{loaded=JSON.parse(plugins.body).some(x=>String(typeof x==="string"?x:(x.Name||x.name||"")).toLowerCase()==="dicom-web");}catch{}try{count=JSON.parse(qido.body).length;}catch{}let name="unknown",version="unknown",aet="unknown";try{const d=JSON.parse(system.body);name=d.Name;version=d.Version;aet=d.DicomAet;}catch{}console.log("unauthenticated_qido_status="+denied.status);console.log("invalid_password_qido_status="+invalid.status);console.log("authenticated_system_status="+system.status);console.log("orthanc="+name+" version="+version+" aet="+aet);console.log("dicomweb_plugin_loaded="+loaded);console.log("authenticated_qido_status="+qido.status+" content_type="+qido.type+" study_count="+count);if(denied.status!==401||invalid.status!==401||system.status!==200||!loaded||qido.status!==200||!qido.type.toLowerCase().includes("application/dicom+json")||count<0)process.exitCode=1;}catch(e){console.error("probe_failed="+e.name);process.exitCode=1;}});'

    $probeInput | & docker run --rm --interactive --network mediq_hospital-a --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $nodeProbe
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital A authenticated DICOMweb probe failed."
    }

    $portsJson = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $containerId | Out-String).Trim() | ConvertFrom-Json
    $publishedBindings = @($portsJson.PSObject.Properties | Where-Object { $null -ne $_.Value -and @($_.Value).Count -gt 0 })
    if ($publishedBindings.Count -gt 0) {
        throw "Hospital A unexpectedly has host-published ports."
    }

    Write-Output "PASS: Hospital A is healthy; unauthenticated and invalid credentials are rejected; authenticated DICOMweb QIDO works from the isolated hospital-a network; no host ports are published."
}
finally {
    Pop-Location
}
