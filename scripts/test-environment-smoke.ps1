[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml",
    [string]$PythonExecutable = ".venv-env007/Scripts/python.exe"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))
$resolvedComposeFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ComposeFile))
$resolvedPython = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $PythonExecutable))
$fixtureDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "data/synthetic-ct-env007"))
$resolvedTestCa = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "data/local-tls/test-ca.crt"))
$nodeImage = "node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43"

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

foreach ($file in @($resolvedEnvFile, $resolvedComposeFile, $resolvedPython, $resolvedTestCa)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required smoke-test input is missing: $([IO.Path]::GetFileName($file))"
    }
}
if (-not (Test-Path -LiteralPath $fixtureDirectory -PathType Container)) {
    throw "The approved synthetic CT fixture is missing; run the documented ENV-007 fixture setup first."
}

Push-Location $repositoryRoot
try {
    & git check-ignore --quiet -- $EnvFile
    if ($LASTEXITCODE -ne 0) { throw "The local env file must be ignored by Git before credentials are read." }

    $settings = Read-LocalEnv $resolvedEnvFile
    foreach ($requiredKey in @("ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD")) {
        if (-not $settings.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($settings[$requiredKey])) {
            throw "Required local test credential is missing: $requiredKey"
        }
    }

    & $resolvedPython (Join-Path $repositoryRoot "scripts/validate-synthetic-ct.py")
    if ($LASTEXITCODE -ne 0) { throw "Synthetic CT fixture validation failed." }

    & (Join-Path $PSScriptRoot "validate-compose-baseline.ps1") -EnvFile $EnvFile

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    & docker @composeArgs up -d --build --wait
    if ($LASTEXITCODE -ne 0) { throw "Compose failed to start the approved local environment." }

    & (Join-Path $PSScriptRoot "test-environment-health.ps1") -EnvFile $EnvFile -ComposeFile $ComposeFile

    $manifest = Get-Content -LiteralPath (Join-Path $fixtureDirectory "manifest.json") -Raw | ConvertFrom-Json
    $instanceUids = @($manifest.instances | ForEach-Object { [string]$_.sopInstanceUID })
    $uniqueInstanceCount = @($instanceUids | Select-Object -Unique).Count
    if ($manifest.instanceCount -ne 3 -or $instanceUids.Count -ne 3 -or $uniqueInstanceCount -ne 3) {
        throw "The approved fixture manifest does not declare the expected three unique CT instances."
    }

    $placementProbe = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const c=JSON.parse(s),auth="Basic "+Buffer.from(c.username+":"+c.password).toString("base64"),base=process.argv[1]==="A"?"https://orthanc-a:8042/dicom-web":"https://orthanc-b:8042/dicom-web";async function qido(path){const r=await fetch(base+path,{headers:{Accept:"application/dicom+json",Authorization:auth},signal:AbortSignal.timeout(3000)});if(r.status!==200||!(r.headers.get("content-type")||"").toLowerCase().includes("application/dicom+json"))throw Error();const j=await r.json();if(!Array.isArray(j))throw Error();return j;}if(process.argv[1]==="B"){const studies=await qido("/studies");if(studies.length!==0)throw Error();console.log("destination_study_count=0");return;}const studies=await qido("/studies");if(studies.length!==1)throw Error();const study=studies[0]["0020000D"]?.Value?.[0];if(study!==c.studyUid)throw Error();const series=await qido("/studies/"+encodeURIComponent(study)+"/series");if(series.length!==1)throw Error();const seriesUid=series[0]["0020000E"]?.Value?.[0];if(seriesUid!==c.seriesUid)throw Error();const instances=await qido("/studies/"+encodeURIComponent(study)+"/series/"+encodeURIComponent(seriesUid)+"/instances");const sopUids=instances.map(x=>String(x["00080018"]?.Value?.[0]||"")).sort();if(instances.length!==3||JSON.stringify(sopUids)!==JSON.stringify([...c.instanceUids].sort()))throw Error();console.log("source_study_count=1 source_series_count=1 source_instance_count=3");}catch{console.error("synthetic_placement_probe=FAILED");process.exitCode=1;}});'
    $sourceProbe = @{
        username = $settings["ORTHANC_A_USERNAME"]
        password = $settings["ORTHANC_A_PASSWORD"]
        studyUid = [string]$manifest.studyInstanceUID
        seriesUid = [string]$manifest.seriesInstanceUID
        instanceUids = $instanceUids
    } | ConvertTo-Json -Compress -Depth 5
    $sourceProbe | & docker run --rm --interactive --network mediq_hospital-a --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $placementProbe A
    if ($LASTEXITCODE -ne 0) { throw "Hospital A synthetic fixture QIDO placement check failed." }

    $destinationProbe = @{
        username = $settings["ORTHANC_B_USERNAME"]
        password = $settings["ORTHANC_B_PASSWORD"]
    } | ConvertTo-Json -Compress
    $destinationProbe | & docker run --rm --interactive --network mediq_hospital-b --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $placementProbe B
    if ($LASTEXITCODE -ne 0) { throw "Hospital B synthetic destination must remain empty." }

    Write-Output "synthetic_fixture=PASS location=data/synthetic-ct-env007"
    Write-Output "synthetic_placement=PASS hospital_a=1/1/3 hospital_b=0"
    Write-Output "environment_smoke_status=PASS"
}
finally {
    Pop-Location
}
