// Independent synthetic fixture setup only. Never imported by application code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { destinationFixtureKinds } from '../tests/fixtures/destination-verification-fixture.mjs';
import { dispatchedReadIds } from '../tests/fixtures/dispatched-source-read-fixture.mjs';
const check = (condition, code) => assert.ok(condition, `DESTVERIFY_FIXTURE_${code}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uid = value => typeof value === 'string' && value.length <= 64 && /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(value);
const fixtureFile = value => typeof value === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.dcm$/.test(value) && basename(value) === value;

export function destinationFixtureDataset(manifest, originals, kind) {
  check(destinationFixtureKinds.includes(kind), 'KIND');
  check(manifest?.fixtureId === 'MEDIQ-ENV-007-SYNTHETIC-CT-V1' && manifest.instances?.length === 3 &&
    manifest.studyInstanceUID === dispatchedReadIds.studyUid && uid(manifest.seriesInstanceUID), 'MANIFEST');
  const seen = new Set();
  let dataset = manifest.instances.map(item => {
    check(uid(item.sopInstanceUID) && !seen.has(item.sopInstanceUID) && fixtureFile(item.file), 'IDENTITY');
    seen.add(item.sopInstanceUID);
    const bytes = originals.get(item.file);
    check(Buffer.isBuffer(bytes) && bytes.length > 132 && bytes.length <= 64*1024*1024 &&
      bytes.subarray(128,132).toString('ascii') === 'DICM' && bytes.length === item.sizeBytes && sha(bytes) === item.sha256, 'SOURCE_BYTES');
    return { sop: item.sopInstanceUID, bytes: Buffer.from(bytes) };
  }).sort((a,b) => a.sop < b.sop ? -1 : 1);
  if (kind === 'tampered') dataset[0].bytes[dataset[0].bytes.length-1] ^= 1;
  if (kind === 'missing') dataset = dataset.slice(0,2);
  if (kind === 'extra') {
    const original = dataset[0], source = Buffer.from(original.sop,'ascii');
    const sop = original.sop.slice(0,-1) + (original.sop.endsWith('0') ? '1' : '0');
    check(uid(sop) && !seen.has(sop), 'EXTRA_UID');
    const bytes = Buffer.from(original.bytes); let offset = 0, replacements = 0;
    while ((offset = bytes.indexOf(source,offset)) !== -1) {
      bytes.write(sop,offset,'ascii'); offset += source.length; replacements++;
    }
    check(replacements === 2, 'EXTRA_HEADER_BINDING');
    dataset.push({ sop, bytes });
  }
  return dataset;
}

export async function runDestinationPacsFixture(environment, action, kind = 'exact', fetcher = fetch) {
  check(/^mediq-int001-capture-[0-9a-f]{12}$/.test(environment.MEDIQ_TEST_PROJECT ?? ''), 'PROJECT');
  check(['seed','purge'].includes(action), 'ACTION');
  const origin = new URL(environment.ORTHANC_B_URL);
  check(origin.protocol === 'https:' && origin.hostname === 'orthanc-b' && origin.port === '8042' &&
    !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === '/', 'ENDPOINT');
  check(environment.ORTHANC_B_USERNAME && environment.ORTHANC_B_PASSWORD && environment.MEDIQ_DICOM_TEST_MANIFEST, 'CONFIG');
  const manifest = JSON.parse(await readFile(environment.MEDIQ_DICOM_TEST_MANIFEST,'utf8'));
  const originals = new Map();
  for (const item of manifest.instances ?? []) {
    check(fixtureFile(item.file), 'FILE');
    originals.set(item.file,await readFile(join(dirname(environment.MEDIQ_DICOM_TEST_MANIFEST),item.file)));
  }
  const dataset = destinationFixtureDataset(manifest,originals,kind);
  const authorization = `Basic ${Buffer.from(`${environment.ORTHANC_B_USERNAME}:${environment.ORTHANC_B_PASSWORD}`).toString('base64')}`;
  const request = async (path, init = {}) => {
    const response = await fetcher(new URL(path,origin),{ ...init, headers: { authorization,...init.headers },
      redirect:'error',signal:AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('DESTVERIFY_FIXTURE_HTTP'); }
    return response;
  };
  const initial = await (await request('/studies')).json();
  check(Array.isArray(initial), 'STUDIES');
  if (action === 'seed') {
    check(initial.length === 0, 'NOT_EMPTY');
    for (const item of dataset) {
      const response = await request('/instances',{method:'POST',headers:{'content-type':'application/dicom'},body:item.bytes});
      await response.body?.cancel().catch(() => {});
    }
  }
  const studies = await (await request('/studies')).json();
  check(Array.isArray(studies) && studies.length === 1 && /^[0-9a-f-]{44}$/.test(studies[0]), 'ONE_KNOWN_STUDY');
  const study = await (await request(`/studies/${studies[0]}`)).json();
  check(study.MainDicomTags?.StudyInstanceUID === manifest.studyInstanceUID, 'STUDY_ID');
  const instances = await (await request(`/studies/${studies[0]}/instances`)).json();
  check(Array.isArray(instances) && instances.length === dataset.length, 'COUNT');
  const expected = new Map(dataset.map(item => [item.sop,item]));
  for (const item of instances) {
    const known = expected.get(item.MainDicomTags?.SOPInstanceUID);
    check(known && /^[0-9a-f-]{44}$/.test(item.ID), 'INSTANCE_ID');
    expected.delete(known.sop);
    const actual = Buffer.from(await (await request(`/instances/${item.ID}/file`)).arrayBuffer());
    check(actual.length === known.bytes.length && sha(actual) === sha(known.bytes), 'EXACT_STORED_BYTES');
  }
  check(expected.size === 0, 'COMPLETE_INVENTORY');
  if (action === 'purge') {
    // Exact single verified synthetic Study only; never a broad PACS delete.
    const response = await request(`/studies/${studies[0]}`,{method:'DELETE'}); await response.body?.cancel().catch(() => {});
    const after = await (await request('/studies')).json(); check(Array.isArray(after) && after.length === 0, 'PURGED_EMPTY');
  }
  return `destination_pacs_fixture=PASS action=${action} kind=${kind} instances=${dataset.length} exact_identity_bytes=true`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(await runDestinationPacsFixture(process.env,process.argv[2],process.argv[3])); }
  catch (error) {
    const code = /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'SUPPRESSED';
    throw new Error(`DESTVERIFY_FIXTURE_FAILED_${code}`);
  }
}
