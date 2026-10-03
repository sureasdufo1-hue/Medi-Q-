// Controlled fixture/helper tests. Not actual DICOM conformance, SQL/RLS or PACS evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {test} from 'node:test';
import YAML from 'yaml';
import {destinationFixtureDataset,runDestinationPacsFixture} from '../../scripts/int001-destination-pacs-fixture.mjs';
import {destinationVerificationCases as cases,destinationFixtureKinds as kinds,destinationExpectedAudits} from '../fixtures/destination-verification-fixture.mjs';
import {dispatchedReadCases,dispatchedReadIds} from '../fixtures/dispatched-source-read-fixture.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const originals = new Map();
  const instances = [1,2,3].map(n => {
    const sopInstanceUID = `2.25.100${n}`, file = `fixture${n}.dcm`,bytes = Buffer.alloc(512,n);
    bytes.write('DICM',128,'ascii'); bytes.write(sopInstanceUID,144,'ascii'); bytes.write(sopInstanceUID,192,'ascii');
    originals.set(file,bytes); return {sopInstanceUID,file,sizeBytes:bytes.length,sha256:sha(bytes)};
  });
  return {originals,manifest:{fixtureId:'MEDIQ-ENV-007-SYNTHETIC-CT-V1',studyInstanceUID:dispatchedReadIds.studyUid,seriesInstanceUID:'2.25.100',instances}};
}
test('16 immutable disjoint graphs retain 14+2+2+2 actual Node tests',() => {
  assert.equal(cases.length,16); assert.ok(Object.isFrozen(cases) && cases.every(Object.isFrozen));
  assert.deepEqual(kinds.map(kind => cases.filter(item => item.fixtureKind === kind).length+1),[14,2,2,2]);
  const old = new Set(dispatchedReadCases.flatMap(item => Object.entries(item).filter(([key]) => /(?:Id|Key)$/.test(key) && key !== 'operationActorId').map(([,value]) => value)));
  const seen = new Set();
  for (const item of cases) for (const [key,value] of Object.entries(item)) {
    if (!/(?:Id|Key)$/.test(key) || key === 'operationActorId') continue;
    assert.match(value,/^[0-9a-f]{8}-0000-4000-8000-\d{12}$/); assert.ok(!seen.has(value) && !old.has(value));seen.add(value);
  }
});
for (const kind of kinds) test(`pure ${kind} fixture copies and preserves original inputs`,() => {
  const {manifest,originals} = fixture(),prior = [...originals].map(([file,bytes]) => [file,sha(bytes)]);
  const data = destinationFixtureDataset(manifest,originals,kind);
  assert.equal(data.length,kind === 'missing' ? 2 : kind === 'extra' ? 4 : 3);
  assert.deepEqual([...originals].map(([file,bytes]) => [file,sha(bytes)]),prior);
  assert.equal(new Set(data.map(item => item.sop)).size,data.length);
  if (kind === 'tampered') {assert.equal(data[0].bytes.length,512);assert.notEqual(sha(data[0].bytes),manifest.instances[0].sha256);}
  if (kind === 'extra') {
    assert.ok(!manifest.instances.some(item => item.sopInstanceUID === data[3].sop));
    assert.equal(data[3].bytes.length,512); assert.equal(data[3].bytes.subarray(128,132).toString('ascii'),'DICM');
    assert.equal(data[3].bytes.subarray(144,144+data[3].sop.length).toString('ascii'),data[3].sop);
    assert.equal(data[3].bytes.subarray(192,192+data[3].sop.length).toString('ascii'),data[3].sop);
  }
});
for (const [label,mutate] of [
  ['wrong study',f => f.manifest.studyInstanceUID='2.25.999'],
  ['wrong fixture',f => f.manifest.fixtureId='ARBITRARY'],
  ['duplicate SOP',f => f.manifest.instances[1].sopInstanceUID=f.manifest.instances[0].sopInstanceUID],
  ['wrong length',f => f.manifest.instances[0].sizeBytes--],
  ['wrong hash',f => f.manifest.instances[0].sha256='0'.repeat(64)],
  ['raw non-DICOM',f => {const item=f.manifest.instances[0],bytes=f.originals.get(item.file);bytes.write('NOPE',128);item.sha256=sha(bytes);}],
  ['path escape',f => f.manifest.instances[0].file='../escape.dcm'],
  ['absolute path',f => f.manifest.instances[0].file='C:\\escape.dcm'],
]) test(`rejects ${label} before constructing B fixture`,() => {
  const f=fixture();mutate(f);assert.throws(() => destinationFixtureDataset(f.manifest,f.originals,'exact'),/DESTVERIFY_FIXTURE_/);
});
async function withHelper(callback) {
  const root=await mkdtemp(join(tmpdir(),'mediq-destination-helper-test-'));
  try {
    const f=fixture(),manifestPath=join(root,'manifest.json');
    await writeFile(manifestPath,JSON.stringify(f.manifest));
    for (const [file,bytes] of f.originals) await writeFile(join(root,file),bytes);
    const env={MEDIQ_TEST_PROJECT:'mediq-int001-capture-123456789abc',ORTHANC_B_URL:'https://orthanc-b:8042/',
      ORTHANC_B_USERNAME:'synthetic-test-user',ORTHANC_B_PASSWORD:'synthetic-test-password',MEDIQ_DICOM_TEST_MANIFEST:manifestPath};
    const calls=[],stored=new Map(),study='a'.repeat(44), ids=new Map();
    const fetcher=async (url,init) => {
      assert.equal(url.origin,'https://orthanc-b:8042');assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.headers.authorization,`Basic ${Buffer.from('synthetic-test-user:synthetic-test-password').toString('base64')}`);
      const path=url.pathname,method=init.method ?? 'GET';calls.push({path,method});
      if (method === 'POST' && path === '/instances') {
        const bytes=Buffer.from(init.body),sop=/^[0-9.]+/.exec(bytes.subarray(144).toString('ascii'))?.[0];assert.ok(sop);stored.set(sop,bytes);
        ids.set(sop,`${String(stored.size).repeat(44)}`);return new Response('{}',{status:200});
      }
      if (method === 'DELETE' && path === `/studies/${study}`) {stored.clear();return new Response('{}');}
      let body;
      if (path === '/studies') body=stored.size ? [study] : [];
      else if (path === `/studies/${study}`) body={MainDicomTags:{StudyInstanceUID:f.manifest.studyInstanceUID}};
      else if (path === `/studies/${study}/instances`) body=[...stored].map(([sop]) => ({ID:ids.get(sop),MainDicomTags:{SOPInstanceUID:sop}}));
      else if (path.endsWith('/file')) {
        const sop=[...ids].find(([,id]) => `/instances/${id}/file` === path)?.[0];assert.ok(sop);return new Response(stored.get(sop));
      } else throw new Error('UNEXPECTED_TEST_ROUTE');
      return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
    };
    await callback({f,env,calls,stored,fetcher});
  } finally {
    assert.equal(resolve(dirname(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('mediq-destination-helper-test-'));
    await rm(root,{recursive:true,force:true});
  }
}
for (const kind of kinds) test(`real helper logic ${kind} seeds exact inventory then deletes only verified known Study`,async () => withHelper(async ({env,calls,fetcher}) => {
  assert.match(await runDestinationPacsFixture(env,'seed',kind,fetcher),/action=seed/);
  assert.match(await runDestinationPacsFixture(env,'purge',kind,fetcher),/action=purge/);
  assert.equal(calls.filter(item => item.method === 'DELETE').length,1);
  assert.ok(calls.every(item => item.method === 'GET' || item.path === '/instances' && item.method === 'POST' || /^\/studies\/[a-f]{44}$/.test(item.path) && item.method === 'DELETE'));
}));
test('helper refuses wrong project/endpoint/action before any fetch',async () => withHelper(async ({env,fetcher,calls}) => {
  for (const patch of [{MEDIQ_TEST_PROJECT:'mediq'},{ORTHANC_B_URL:'http://orthanc-b:8042/'},{ORTHANC_B_URL:'https://orthanc-a:8042/'},
    {ORTHANC_B_URL:'https://orthanc-b:8042/?query=1'},{ORTHANC_B_URL:'https://user:pass@orthanc-b:8042/'}]) {
    await assert.rejects(runDestinationPacsFixture({...env,...patch},'purge','exact',fetcher),/DESTVERIFY_FIXTURE_/);
  }
  await assert.rejects(runDestinationPacsFixture(env,'unknown','exact',fetcher),/ACTION/);assert.equal(calls.length,0);
}));
test('same-length changed stored byte refuses purge and leaves B unchanged',async () => withHelper(async ({env,stored,fetcher,calls}) => {
  await runDestinationPacsFixture(env,'seed','exact',fetcher);stored.values().next().value[511]^=1;
  await assert.rejects(runDestinationPacsFixture(env,'purge','exact',fetcher),/EXACT_STORED_BYTES/);
  assert.equal(calls.filter(item => item.method === 'DELETE').length,0);assert.equal(stored.size,3);
}));
test('unknown Study refuses purge without DELETE',async () => withHelper(async ({env,fetcher,calls}) => {
  await runDestinationPacsFixture(env,'seed','exact',fetcher);
  const wrong=async (url,init) => url.pathname === `/studies/${'a'.repeat(44)}`
    ? new Response(JSON.stringify({MainDicomTags:{StudyInstanceUID:'2.25.999'}})) : fetcher(url,init);
  await assert.rejects(runDestinationPacsFixture(env,'purge','exact',wrong),/STUDY_ID/);
  assert.equal(calls.filter(item => item.method === 'DELETE').length,0);
}));
test('nonempty B refuses seed before POST',async () => withHelper(async ({env,fetcher,calls}) => {
  await runDestinationPacsFixture(env,'seed','exact',fetcher);const before=calls.length;
  await assert.rejects(runDestinationPacsFixture(env,'seed','exact',fetcher),/NOT_EMPTY/);
  assert.ok(calls.slice(before).every(item => item.method === 'GET'));
}));
test('expected Audit partitions include exactly11 success gates and no false terminal evidence',() => {
  const valid=destinationExpectedAudits(cases.find(item => item.name === 'valid'));
  assert.equal(Object.entries(valid).filter(([key]) => key.startsWith('PACS_DESTINATION_VERIFY_AUTHORIZED')).reduce((n,[,count]) => n+count,0),11);
  for (const item of cases) {
    assert.ok(!Object.keys(destinationExpectedAudits(item)).some(key => /COMPLETED|VERIFIED/.test(key)));
    assert.equal(item.state,'VERIFYING');assert.equal(item.version,3);
  }
});
test('actual Compose separates runtime app/B setup, keeps A-only profile and one hardened tmpfs',async () => {
  const doc=YAML.parse(await readFile(new URL('../../infra/docker-compose.yml',import.meta.url),'utf8'));
  const app=doc.services['api-destination-verification-test'],helper=doc.services['source-capture-orthanc-b-fixture'],old=doc.services['api-source-capture-test'];
  for (const service of [app,helper]) {
    assert.deepEqual(service.tmpfs,['/tmp:rw,noexec,nosuid,size=16m']);assert.equal(service.user,'node');assert.equal(service.read_only,true);
    assert.deepEqual(service.cap_drop,['ALL']);assert.deepEqual(service.security_opt,['no-new-privileges:true']);
    assert.ok(!Object.keys(service.environment).some(key => /MIGRATION|FIXTURE_DATABASE/.test(key)));
  }
  assert.deepEqual(helper.networks,['hospital-b']);assert.deepEqual(app.networks,['database','hospital-a','hospital-b']);
  assert.deepEqual(old.networks,['database','hospital-a']);assert.equal(old.environment.ORTHANC_B_PASSWORD,'source-capture-b-disabled');
});
test('wrapper retains58+18 and invokes actual seed/test/purge/observer with exact20 destination checks',async () => {
  const source=await readFile(new URL('../../scripts/test-int001-source-capture.ps1',import.meta.url),'utf8');
  assert.match(source,/\$testPass -ne "58" -or \$testFail -ne "0"/);assert.match(source,/\$dispatchPass -ne "18" -or \$dispatchFail -ne "0"/);
  assert.match(source,/\$IncludeDispatchedReads = \$IncludeDispatchedReads -or \$IncludeDestinationVerification/);
  const part=source.slice(source.indexOf('    if ($IncludeDestinationVerification)'),source.indexOf('INT001_ORTHANC_B_AFTER_PROBE_FAILED'));
  assert.match(part,/MEDIQ_TEST_DESTINATION_VERIFY_MODE=true/);assert.match(part,/MEDIQ_TEST_DESTINATION_FIXTURE_KIND=\$destinationKind/);
  assert.match(part,/'exact', 'tampered', 'missing', 'extra'/);assert.match(part,/'seed', 'test', 'purge'/);
  assert.match(part,/\{ '14' \} else \{ '2' \}/);assert.match(part,/verify-int001-destination-verification\.mjs/);
  assert.doesNotMatch(part,/MEDIQ_(?:MIGRATION|TEST_FIXTURE)_DATABASE_URL/);
  assert.match(part,/destination_verification_observer=PASS cases=16/);assert.match(part,/\$capturePrivacyValues/);
});
test('independent observer is read-only/exact Audit/source/provenance/quota and copied into test image',async () => {
  const source=await readFile(new URL('../../scripts/verify-int001-destination-verification.mjs',import.meta.url),'utf8');
  const image=await readFile(new URL('../../services/api/Dockerfile',import.meta.url),'utf8');
  assert.match(source,/REPEATABLE READ READ ONLY/);assert.match(source,/SET LOCAL ROLE mediq_quota_owner/);
  for (const marker of ['EXACT_AUDIT_PARTITION','PENDING_SOURCE_ONLY','PENDING_PROVENANCE_BINDING','NO_COMPLETION','ROLE_RESET','assertRuntimePrivilegeCatalog']) assert.ok(source.includes(marker));
  assert.doesNotMatch(source,/GRANT\s|INSERT\s|UPDATE\s|DELETE\s|MEDIQ_DATABASE_URL/);
  assert.match(source,/ORDER BY occurred_at,audit_event_id/);
  assert.ok(image.includes('COPY scripts/verify-int001-destination-verification.mjs scripts/verify-int001-destination-verification.mjs'));
});
