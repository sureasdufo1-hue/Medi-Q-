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
    throw "Local env file was not found. Copy .env.example to the ignored root .env and set test credentials."
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

    foreach ($requiredKey in @("ORTHANC_A_PASSWORD", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD")) {
        if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrEmpty($values[$requiredKey])) {
            throw "Required Hospital B test setting is missing: $requiredKey"
        }
    }
    if ($values["ORTHANC_A_PASSWORD"] -ceq $values["ORTHANC_B_PASSWORD"]) {
        throw "Hospital A and B must use distinct test passwords."
    }
    Write-Output "distinct_local_orthanc_passwords=true"

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $bId = (& docker @composeArgs ps -q orthanc-b | Out-String).Trim()
    $aId = (& docker @composeArgs ps -q orthanc-a | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($bId) -or [string]::IsNullOrWhiteSpace($aId)) {
        throw "Hospital A and B Test Orthanc containers must both be running."
    }

    foreach ($site in @(@{ Name = "A"; Id = $aId; Network = "hospital-a" }, @{ Name = "B"; Id = $bId; Network = "hospital-b" })) {
        $state = (& docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}' $site.Id | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $state -ne "running|healthy") {
            throw "Hospital $($site.Name) Orthanc is not healthy. Observed state: $state"
        }
        $networkJson = (& docker inspect --format '{{json .NetworkSettings.Networks}}' $site.Id | Out-String).Trim() | ConvertFrom-Json
        $networkNames = @($networkJson.PSObject.Properties.Name)
        if ($networkNames.Count -ne 1 -or $networkNames[0] -notmatch [regex]::Escape($site.Network)) {
            throw "Hospital $($site.Name) Orthanc is attached to an unexpected network."
        }
        $mounts = (& docker inspect --format '{{json .Mounts}}' $site.Id | Out-String).Trim() | ConvertFrom-Json
        $dataMounts = @($mounts | Where-Object { $_.Destination -eq "/var/lib/orthanc/db" })
        if ($dataMounts.Count -ne 1) {
            throw "Hospital $($site.Name) Orthanc does not have exactly one database volume."
        }
        if ($site.Name -eq "A") { $aVolume = $dataMounts[0].Name } else { $bVolume = $dataMounts[0].Name }
    }
    if ($aVolume -eq $bVolume) {
        throw "Hospital A and B must use distinct Orthanc data volumes."
    }

    $publishedPorts = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $bId | Out-String).Trim() | ConvertFrom-Json
    $publishedBindings = @($publishedPorts.PSObject.Properties | Where-Object { $null -ne $_.Value -and @($_.Value).Count -gt 0 })
    if ($publishedBindings.Count -gt 0) {
        throw "Hospital B unexpectedly has host-published ports."
    }
    $bIp = (& docker inspect --format '{{(index .NetworkSettings.Networks "mediq_hospital-b").IPAddress}}' $bId | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($bIp)) {
        throw "Hospital B container IP was not found on its isolated network."
    }
    foreach ($port in @(4242, 8042)) {
        $client = [System.Net.Sockets.TcpClient]::new()
        $hostReachable = $false
        try {
            $pending = $client.BeginConnect($bIp, $port, $null, $null)
            if ($pending.AsyncWaitHandle.WaitOne(3000) -and $client.Connected) {
                $hostReachable = $true
            }
        }
        catch {
            $hostReachable = $false
        }
        finally {
            $client.Dispose()
        }
        if ($hostReachable) {
            throw "Host unexpectedly reached unpublished Hospital B container port $port."
        }
    }
    Write-Output "host_to_b_container_ip_ports_4242_8042=unreachable"

    $healthArgs = $composeArgs + @("exec", "-T", "orthanc-b", "python3", "/probes/mediq-tls-healthcheck.py", "/run/mediq/test-ca.crt")
    & docker @healthArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital B Orthanc aliveness probe failed."
    }

    $probeInput = @{
        username = $values["ORTHANC_B_USERNAME"]
        password = $values["ORTHANC_B_PASSWORD"]
    } | ConvertTo-Json -Compress
    $nodeProbe = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const c=JSON.parse(s),base="https://orthanc-b:8042",good="Basic "+Buffer.from(c.username+":"+c.password).toString("base64"),bad="Basic "+Buffer.from(c.username+":invalid-test-password").toString("base64");async function get(path,authorization){const h={Accept:"application/dicom+json"};if(authorization)h.Authorization=authorization;const r=await fetch(base+path,{headers:h});return {status:r.status,type:r.headers.get("content-type")||"",body:await r.text()};}const denied=await get("/dicom-web/studies"),invalid=await get("/dicom-web/studies",bad),system=await get("/system",good),plugins=await get("/plugins",good),qido=await get("/dicom-web/studies",good);let loaded=false,count=-1;try{loaded=JSON.parse(plugins.body).some(x=>String(typeof x==="string"?x:(x.Name||x.name||"")).toLowerCase()==="dicom-web");}catch{}try{count=JSON.parse(qido.body).length;}catch{}let name="unknown",version="unknown",aet="unknown";try{const d=JSON.parse(system.body);name=d.Name;version=d.Version;aet=d.DicomAet;}catch{}console.log("unauthenticated_qido_status="+denied.status);console.log("invalid_password_qido_status="+invalid.status);console.log("authenticated_system_status="+system.status);console.log("orthanc="+name+" version="+version+" aet="+aet);console.log("dicomweb_plugin_loaded="+loaded);console.log("authenticated_qido_status="+qido.status+" content_type="+qido.type+" study_count="+count);if(denied.status!==401||invalid.status!==401||system.status!==200||name!=="Hospital B Test Orthanc"||aet!=="MEDIQB"||!loaded||qido.status!==200||!qido.type.toLowerCase().includes("application/dicom+json")||count<0)process.exitCode=1;}catch(e){console.error("probe_failed="+e.name);process.exitCode=1;}});'
    $probeInput | & docker run --rm --interactive --network mediq_hospital-b --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $nodeProbe
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital B authenticated DICOMweb probe failed."
    }

    $isolationProbe = 'fetch(process.argv[1]+"/system",{signal:AbortSignal.timeout(3000)}).then(()=>{console.error("unexpected_cross_hospital_reachability");process.exitCode=1;}).catch(()=>console.log("cross_hospital_endpoint=unreachable"));'
    foreach ($network in @(@{ Name = "A"; Network = "mediq_hospital-a"; Other = "https://orthanc-b:8042" }, @{ Name = "B"; Network = "mediq_hospital-b"; Other = "https://orthanc-a:8042" })) {
        & docker run --rm --network $network.Network --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $isolationProbe $network.Other
        if ($LASTEXITCODE -ne 0) {
            throw "Hospital $($network.Name) network can unexpectedly reach the other hospital Orthanc."
        }
    }

    Write-Output "PASS: Hospital B is healthy; unauthenticated and invalid credentials are rejected; authenticated DICOMweb QIDO works on hospital-b; A/B networks, data volumes, and published-port boundary are isolated."
}
finally {
    Pop-Location
}
