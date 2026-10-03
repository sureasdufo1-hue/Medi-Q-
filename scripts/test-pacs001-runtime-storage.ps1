[CmdletBinding()]
param([string]$Image = 'mediq-api:dec018-validation')

$ErrorActionPreference = 'Stop'
$probeRun = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$probeVolume = "mediq-dec018-$probeRun-ciphertext"
$probeTicket = 'MEDIQ-PACS-001-DEC-018'
$probeNames = @('stage', 'restart', 'readonly') | ForEach-Object { "mediq-dec018-$probeRun-$_" }

function Assert-NativeSuccess([string]$Code) {
    if ($LASTEXITCODE -ne 0) { throw $Code }
}

$probeScript = @'
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {NestFactory} from '@nestjs/core';
import {AppModule} from './dist/app.module.js';
import {EphemeralEncryptedTemporaryImagingStore} from './dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js';
import {TemporaryPayloadMaintenanceService} from './dist/imaging-storage/application/temporary-payload-maintenance.service.js';
import {AuthorizedSourceCaptureService} from './dist/integrity/application/authorized-source-capture.service.js';
const root='/var/lib/mediq/temporary-imaging', phase=process.env.MEDIQ_PROBE_PHASE;
const id=n=>`a2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding={tenantId:id(1),exchangeSessionId:id(2),packageId:id(3),purpose:'PACS_IMPORT'};
const instance={studyRefId:id(4),seriesInstanceUid:'2.25.21',sopInstanceUid:'2.25.22'};
const bytes=Buffer.from('TEST-SYNTHETIC-DEC018-VOLUME');
let app, probeStage='STARTUP';
async function main(){
 assert.notEqual(process.getuid(),0);
 if(phase==='readonly'){
  await assert.rejects(NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false}),
   e=>e.message==='TEMPORARY_IMAGING_STORAGE_UNAVAILABLE');
  console.log('runtime_storage_probe=PASS phase=readonly startup=DENIED');return;
 }
 try{
  app=await NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false});
  const store=app.get(EphemeralEncryptedTemporaryImagingStore);
  assert.equal(app.get(AuthorizedSourceCaptureService).temporaryImagingStore,store);
  await store.initializeForRuntime();
  probeStage='ROOT';
  const rootStat=await stat(root);assert.equal(rootStat.uid,process.getuid());assert.equal(rootStat.mode&0o777,0o700);
  probeStage='AUTHENTICATION';
  await assert.rejects(app.get(TemporaryPayloadMaintenanceService).run({token:'TEST-NO-ISSUER',tenantCandidate:id(1),correlationId:id(5)}),
   e=>e.message==='TEMPORARY_PAYLOAD_MAINTENANCE_UNAVAILABLE'&&e.phase==='AUTHENTICATION');
  if(phase==='stage'){
   probeStage='STAGE';
   assert.deepEqual(await readdir(root),[]);
   const handle=await store.beginPackage(binding);
   const receipt=await store.stageInstance({storageRef:handle.storageRef,packageBinding:binding,instanceBinding:instance,
    source:(async function*(){yield bytes;})()});
   await store.sealPackage({storageRef:handle.storageRef,binding});
   const directory=join(root,handle.storageRef),path=join(directory,`${receipt.objectRef}.enc`);
   assert.equal((await stat(directory)).mode&0o777,0o700);assert.equal((await stat(path)).mode&0o777,0o600);
   assert.notDeepEqual(await readFile(path),bytes);
   console.log('runtime_storage_probe=PASS phase=stage singleton=PASS root_mode=0700 file_mode=0600 ciphertext=PASS auth_denial=PASS');
  }else{
   probeStage='RESTART_INVENTORY';
   assert.equal(phase,'restart');
   const dirs=await readdir(root);assert.equal(dirs.length,1);
   const files=await readdir(join(root,dirs[0]));assert.equal(files.length,1);
   assert.match(files[0],/^[0-9a-f-]{36}\.enc$/);
   assert.notDeepEqual(await readFile(join(root,dirs[0],files[0])),bytes);
   probeStage='RESTART_BLOCK';
   await assert.rejects(store.beginPackage(binding),e=>e.code==='RECOVERY_REQUIRED');
   probeStage='RESTART_READ';
   await assert.rejects(store.consumeInstance({storageRef:dirs[0],objectRef:files[0].slice(0,-4),packageBinding:binding,
    instanceBinding:instance,expectedByteLength:bytes.length,expectedSha256:'sha256:'+'0'.repeat(64)},async()=>'VERIFIED',async()=>assert.fail()),
    e=>e.code==='RECOVERY_REQUIRED');
   // Owned synthetic primitive fixture cleanup only; not product RLS/Audit proof.
   probeStage='FIXTURE_PURGE';
   await store.purgeByReference({storageRef:dirs[0],binding});assert.deepEqual(await readdir(root),[]);
   console.log('runtime_storage_probe=PASS phase=restart ciphertext_retained=PASS no_key_read=DENIED new_staging=DENIED fixture_recovery=PASS scope=primitive_volume_only');
  }
 }finally{await app?.close();}
}
main().catch(error=>{
 const codes=['RECOVERY_REQUIRED','AUTHORIZATION_DENIED','STORAGE_UNAVAILABLE','PACKAGE_NOT_FOUND'];
 const code=codes.includes(error?.code)?error.code:error?.name==='AssertionError'?'ASSERTION':'GENERIC';
 console.error(`runtime_storage_probe=FAIL stage=${probeStage} code=${code}`);process.exitCode=1;
});
'@

$probeEnvironment = @(
    '--env', 'MEDIQ_RUNTIME_PROFILE=container', '--env', 'MEDIQ_ENV=test',
    '--env', 'MEDIQ_LOG_LEVEL=INFO', '--env', 'MEDIQ_API_PORT=8080',
    '--env', 'MEDIQ_POSTGRES_DB=mediq',
    '--env', 'MEDIQ_DATABASE_URL=postgresql://mediq_runtime:synthetic-dec018-db@postgres:5432/mediq',
    '--env', 'ORTHANC_A_URL=https://orthanc-a:8042', '--env', 'ORTHANC_A_USERNAME=TEST-A',
    '--env', 'ORTHANC_A_PASSWORD=synthetic-dec018-a', '--env', 'ORTHANC_B_URL=https://orthanc-b:8042',
    '--env', 'ORTHANC_B_USERNAME=TEST-B', '--env', 'ORTHANC_B_PASSWORD=synthetic-dec018-b'
)
# No real credentials, connections, published ports, host bind or DB/PACS startup.
$probeCreated = $false
try {
    $probeExisting = @(& docker volume ls -q --filter "name=^${probeVolume}$" | Where-Object { $_ })
    Assert-NativeSuccess 'RUNTIME_VOLUME_INVENTORY_FAILED'
    if ($probeExisting.Count -ne 0) { throw 'RUNTIME_VOLUME_ALREADY_EXISTS' }
    & docker volume create --label "mediq.validation.run=$probeRun" --label "mediq.validation.ticket=$probeTicket" $probeVolume | Out-Null
    Assert-NativeSuccess 'RUNTIME_VOLUME_CREATE_FAILED'
    $probeCreated = $true
    foreach ($probePhase in @('stage', 'restart', 'readonly')) {
        $probeName = "mediq-dec018-$probeRun-$probePhase"
        $probeMount = "type=volume,src=$probeVolume,dst=/var/lib/mediq/temporary-imaging"
        if ($probePhase -eq 'readonly') { $probeMount += ',readonly' }
        $probeArguments = @('run', '--rm', '--name', $probeName,
            '--label', "mediq.validation.run=$probeRun", '--label', "mediq.validation.ticket=$probeTicket",
            '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', '64', '--mount', $probeMount, '--workdir', '/workspace/services/api',
            '--entrypoint', 'node', '--env', "MEDIQ_PROBE_PHASE=$probePhase") + $probeEnvironment +
            @($Image, '--input-type=module', '-e', $probeScript)
        & docker @probeArguments
        Assert-NativeSuccess 'RUNTIME_CONTAINER_PROBE_FAILED'
    }
    $probeImageId = (& docker image inspect --format '{{.Id}}' $Image | Out-String).Trim()
    Assert-NativeSuccess 'RUNTIME_IMAGE_INVENTORY_FAILED'
    Write-Output "runtime_storage_image=$probeImageId"
} finally {
    # Only exact names with both expected labels may be removed on failure.
    foreach ($probeName in $probeNames) {
        $probeContainer = @(& docker ps -aq --filter "name=^${probeName}$" | Where-Object { $_ })
        Assert-NativeSuccess 'RUNTIME_CONTAINER_INVENTORY_FAILED'
        foreach ($probeContainerId in $probeContainer) {
            $probeOwner = (& docker inspect --format '{{index .Config.Labels "mediq.validation.run"}}|{{index .Config.Labels "mediq.validation.ticket"}}' $probeContainerId | Out-String).Trim()
            Assert-NativeSuccess 'RUNTIME_CONTAINER_OWNERSHIP_FAILED'
            if ($probeOwner -ne "$probeRun|$probeTicket") { throw 'RUNTIME_CONTAINER_OWNERSHIP_MISMATCH' }
            & docker rm -f $probeContainerId | Out-Null
            Assert-NativeSuccess 'RUNTIME_CONTAINER_CLEANUP_FAILED'
        }
    }
    if ($probeCreated) {
        $probeOwner = (& docker volume inspect --format '{{index .Labels "mediq.validation.run"}}|{{index .Labels "mediq.validation.ticket"}}' $probeVolume | Out-String).Trim()
        Assert-NativeSuccess 'RUNTIME_VOLUME_OWNERSHIP_FAILED'
        if ($probeOwner -ne "$probeRun|$probeTicket") { throw 'RUNTIME_VOLUME_OWNERSHIP_MISMATCH' }
        & docker volume rm $probeVolume | Out-Null
        Assert-NativeSuccess 'RUNTIME_VOLUME_CLEANUP_FAILED'
    }
    $probeRemainingContainers = @(& docker ps -aq --filter "label=mediq.validation.run=$probeRun" | Where-Object { $_ })
    Assert-NativeSuccess 'RUNTIME_CONTAINER_FINAL_INVENTORY_FAILED'
    $probeRemainingVolumes = @(& docker volume ls -q --filter "label=mediq.validation.run=$probeRun" | Where-Object { $_ })
    Assert-NativeSuccess 'RUNTIME_VOLUME_FINAL_INVENTORY_FAILED'
    if ($probeRemainingContainers.Count -or $probeRemainingVolumes.Count) { throw 'RUNTIME_RESOURCE_CLEANUP_INCOMPLETE' }
    Write-Output "runtime_storage_cleanup=PASS containers=0 volumes=0 run=$probeRun"
}
