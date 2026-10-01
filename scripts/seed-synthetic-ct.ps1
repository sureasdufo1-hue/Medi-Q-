[CmdletBinding()]
param(
    [string]$EnvFile = ".env",
    [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedEnvFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $EnvFile))
$resolvedComposeFile = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ComposeFile))
$fixtureDirectory = Join-Path $repositoryRoot "data/synthetic-ct-env007"
$python = Join-Path $repositoryRoot ".venv-env007/Scripts/python.exe"
$resolvedTestCa = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "data/local-tls/test-ca.crt"))
$nodeImage = "node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43"

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
    throw "Local env file was not found. Copy .env.example to the ignored root .env and set test credentials."
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "The pinned ENV-007 Python environment is missing. Follow scripts/README.md to create it."
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

    & $python scripts/validate-synthetic-ct.py
    if ($LASTEXITCODE -ne 0) {
        throw "Synthetic CT fixture validation failed; no Orthanc request was made."
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

    foreach ($requiredKey in @("ORTHANC_A_USERNAME", "ORTHANC_A_PASSWORD", "ORTHANC_B_USERNAME", "ORTHANC_B_PASSWORD")) {
        if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrEmpty($values[$requiredKey])) {
            throw "Required local test setting is missing: $requiredKey"
        }
    }

    $composeArgs = @("compose", "--env-file", $resolvedEnvFile, "-f", $resolvedComposeFile)
    $aId = (& docker @composeArgs ps -q orthanc-a | Out-String).Trim()
    $bId = (& docker @composeArgs ps -q orthanc-b | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($aId) -or [string]::IsNullOrWhiteSpace($bId)) {
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
        $portsJson = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $site.Id | Out-String).Trim() | ConvertFrom-Json
        $publishedBindings = @($portsJson.PSObject.Properties | Where-Object { $null -ne $_.Value -and @($_.Value).Count -gt 0 })
        if ($publishedBindings.Count -gt 0) {
            throw "Hospital $($site.Name) unexpectedly has host-published ports."
        }
    }

    $bInput = @{
        username = $values["ORTHANC_B_USERNAME"]
        password = $values["ORTHANC_B_PASSWORD"]
    } | ConvertTo-Json -Compress
    $nodeCheckB = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const c=JSON.parse(s),auth="Basic "+Buffer.from(c.username+":"+c.password).toString("base64"),r=await fetch("https://orthanc-b:8042/dicom-web/studies",{headers:{Authorization:auth,Accept:"application/dicom+json"},signal:AbortSignal.timeout(15000)});if(r.status!==200)throw Error("qido_http_"+r.status);if(!(r.headers.get("content-type")||"").toLowerCase().includes("application/dicom+json"))throw Error("qido_content_type");const rows=await r.json();if(!Array.isArray(rows)||rows.length!==0)throw Error("hospital_b_expected_empty");console.log("hospital_b_qido=PASS studies=0 seed_requests=0");}catch(e){console.error("hospital_b_check_failed="+e.message);process.exitCode=1;}});'
    $bInput | & docker run --rm --interactive --network mediq_hospital-b --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $nodeCheckB
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital B must be empty before seeding the Hospital A source fixture."
    }

    $manifest = Get-Content -LiteralPath (Join-Path $fixtureDirectory "manifest.json") -Raw | ConvertFrom-Json
    $instances = foreach ($entry in $manifest.instances) {
        $filePath = Join-Path $fixtureDirectory $entry.file
        [ordered]@{
            sopInstanceUID = [string]$entry.sopInstanceUID
            contentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($filePath))
        }
    }
    $aInput = [ordered]@{
        username = $values["ORTHANC_A_USERNAME"]
        password = $values["ORTHANC_A_PASSWORD"]
        studyUID = [string]$manifest.studyInstanceUID
        seriesUID = [string]$manifest.seriesInstanceUID
        instances = @($instances)
    } | ConvertTo-Json -Depth 6 -Compress

    $nodeSeed = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const c=JSON.parse(s),base="https://orthanc-a:8042",auth="Basic "+Buffer.from(c.username+":"+c.password).toString("base64");async function qido(path){const r=await fetch(base+path,{headers:{Authorization:auth,Accept:"application/dicom+json"},signal:AbortSignal.timeout(15000)});if(r.status!==200)throw Error("qido_http_"+r.status);const t=r.headers.get("content-type")||"";if(!t.toLowerCase().includes("application/dicom+json"))throw Error("qido_content_type");return JSON.parse(await r.text());}function uid(row,tag){return row?.[tag]?.Value?.[0]||"";}function sorted(a){return [...a].sort();}function same(a,b){return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));}async function verify(){const studies=await qido("/dicom-web/studies"),target=await qido("/dicom-web/studies?StudyInstanceUID="+encodeURIComponent(c.studyUID));if(target.length!==1||uid(target[0],"0020000D")!==c.studyUID||studies.length!==1)throw Error("study_set_mismatch");const series=await qido("/dicom-web/studies/"+encodeURIComponent(c.studyUID)+"/series");if(series.length!==1||uid(series[0],"0020000E")!==c.seriesUID)throw Error("series_set_mismatch");const rows=await qido("/dicom-web/studies/"+encodeURIComponent(c.studyUID)+"/series/"+encodeURIComponent(c.seriesUID)+"/instances");const actual=rows.map(x=>uid(x,"00080018"));const expected=c.instances.map(x=>x.sopInstanceUID);if(rows.length!==3||!same(actual,expected))throw Error("instance_set_mismatch");return {studyCount:studies.length,seriesCount:series.length,instanceCount:rows.length};}const before=await qido("/dicom-web/studies"),target=await qido("/dicom-web/studies?StudyInstanceUID="+encodeURIComponent(c.studyUID));let stowCount=0,status=0;if(target.length){const state=await verify();console.log("seed_mode=already_seeded_noop stow_requests=0");console.log("hospital_a_qido=PASS studies="+state.studyCount+" series="+state.seriesCount+" instances="+state.instanceCount);}else{if(before.length!==0)throw Error("hospital_a_has_unexpected_existing_studies_refusing_write");const boundary="mediq-env007-"+crypto.randomUUID();const chunks=[];for(const item of c.instances){chunks.push(Buffer.from("--"+boundary+"\r\nContent-Type: application/dicom\r\nContent-Transfer-Encoding: binary\r\n\r\n"));chunks.push(Buffer.from(item.contentBase64,"base64"));chunks.push(Buffer.from("\r\n"));}chunks.push(Buffer.from("--"+boundary+"--\r\n"));const response=await fetch(base+"/dicom-web/studies",{method:"POST",headers:{Authorization:auth,Accept:"application/dicom+json","Content-Type":"multipart/related; type=\"application/dicom\"; boundary=\""+boundary+"\""},body:Buffer.concat(chunks),signal:AbortSignal.timeout(60000)});status=response.status;const body=await response.text();if(status!==200&&status!==202)throw Error("stow_http_"+status);if((response.headers.get("content-type")||"").toLowerCase().includes("application/dicom+json")){try{const result=JSON.parse(body),failed=result?.["00081198"]?.Value||[];if(failed.length)throw Error("stow_reported_failed_instances");}catch(e){if(e.message==="stow_reported_failed_instances")throw e;throw Error("stow_response_invalid_json");}}stowCount=1;const state=await verify();console.log("seed_mode=created stow_requests="+stowCount+" stow_http_status="+status);console.log("hospital_a_qido=PASS studies="+state.studyCount+" series="+state.seriesCount+" instances="+state.instanceCount);} }catch(e){console.error("seed_failed="+e.message);process.exitCode=1;}});'
    $aInput | & docker run --rm --interactive --network mediq_hospital-a --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $nodeSeed
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital A synthetic CT seed or post-seed QIDO verification failed."
    }

    $bInput | & docker run --rm --interactive --network mediq_hospital-b --mount "type=bind,source=$resolvedTestCa,target=/run/mediq/test-ca.crt,readonly" --env "NODE_EXTRA_CA_CERTS=/run/mediq/test-ca.crt" $nodeImage node -e $nodeCheckB
    if ($LASTEXITCODE -ne 0) {
        throw "Hospital B must remain empty during this source-fixture Ticket."
    }

    Write-Output "PASS: deterministic synthetic CT is present on Hospital A only; repeat execution is idempotent; Hospital B remains empty; no host ports are published."
}
finally {
    Pop-Location
}
