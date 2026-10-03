// Deterministic contracts only; these do not replace actual PostgreSQL/RLS proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dispatchedReadCases as cases, dispatchedReadIds as ids,
  dispatchedReadDigest, dispatchedExpectedAudits } from '../fixtures/dispatched-source-read-fixture.mjs';
import { pacsTransferOperationDigest } from '../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [seed, observer, wrapper, integration, compose, dockerfile] = await Promise.all([
  read('../../scripts/seed-int001-dispatched-reads.mjs'), read('../../scripts/verify-int001-dispatched-reads.mjs'),
  read('../../scripts/test-int001-source-capture.ps1'),
  read('../integration/authorized-source-capture.orthanc.integration.test.mjs'),
  read('../../infra/docker-compose.yml'), read('../../services/api/Dockerfile'),
]);
const named = name => cases.find(item => item.name === name);

test('actual diagnostic projector keeps fixed assertion/line only and reserves non-case budget', () => {
  const ast = ts.createSourceFile('capture.mjs',integration,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'dispatchedReadFailureMarkers');
  assert.equal(declarations.length,1);
  const project = runInNewContext(`${declarations[0].getText(ast)}; dispatchedReadFailureMarkers`);
  const result = project({ code:'ERR_ASSERTION', message:'DISPREAD_ACTUAL_SELECT_MATCHES\n\nSENSITIVE_TEST_VALUE',
    stack:'SENSITIVE_TEST_PATH/authorized-source-capture.orthanc.integration.test.mjs:123:9' });
  assert.deepEqual({ ...result },{ code:'ERR_ASSERTION',check:'DISPREAD_ACTUAL_SELECT_MATCHES',line:'123' });
  assert.ok(!JSON.stringify(result).includes('SENSITIVE'));
  assert.deepEqual({ ...project({ code:'PRIVATE_CODE',message:'PRIVATE_MESSAGE',stack:'PRIVATE_PATH' }) },
    { code:'SUPPRESSED',check:'SUPPRESSED',line:'0' });
  assert.deepEqual({ ...project({ code:'ERR_ASSERTION',message:'DISPREAD_ARBITRARY_PATIENT_VALUE' }) },
    { code:'ERR_ASSERTION',check:'SUPPRESSED',line:'0' });
  assert.ok(wrapper.includes("Where-Object { $_ -notmatch '^(?:DEC017|DISPREAD)_CASE_' }"));
  assert.ok(wrapper.includes("Where-Object { $_ -notmatch '^DISPREAD_CASE_' }"));
});

test('matrix has exactly 17 immutable explicit cases and 18 expected Node tests', () => {
  assert.deepEqual(cases.map(item => item.name), [
    'valid','wrong_digest','wrong_count','no_provenance','wrong_provenance',
    'missing_preflight_audit','missing_dispatch_audit','not_dispatched','cross_tenant',
    'revoked_between','withdrawn_between','state_changed_between','commit_ack_lost',
    'read_audit_failure','consumer_failure','wrong_actor','future_dispatch',
  ]);
  assert.ok(Object.isFrozen(cases) && Object.isFrozen(ids) && cases.every(Object.isFrozen));
  assert.equal(cases.length + 1, 18);
});

test('all graph selectors are UUIDs, mutually disjoint and outside old source fixture range', () => {
  const values = new Set();
  for (const item of cases) for (const [key,value] of Object.entries(item)) {
    if (!/(?:Id|Key)$/.test(key) || key === 'operationActorId') continue;
    assert.match(value, /^[0-9a-f]{8}-0000-4000-8000-\d{12}$/);
    assert.ok(Number(value.slice(-12)) >= 2001);
    assert.ok(!values.has(value), `duplicate selector: ${key}`); values.add(value);
  }
  assert.equal(ids.tenant, '02000000-0000-4000-8000-000000000002');
  assert.notEqual(ids.tenant, ids.otherTenant);
});

test('digest and wrong actor/count/state cases isolate their declared predicate', () => {
  for (const item of cases) {
    const expected = pacsTransferOperationDigest({ tenantId: ids.tenant, actorId: ids.actor,
      exchangeSessionId: item.sessionId, studyRefId: item.studyRefId,
      consentId: item.consentId, grantId: item.grantId, action: 'PACS_IMPORT' });
    assert.match(dispatchedReadDigest(item), /^[0-9a-f]{64}$/);
    assert.equal(dispatchedReadDigest(item) === expected, item.name !== 'wrong_digest');
    assert.equal(item.count, item.name === 'wrong_count' ? 2 : 3);
    assert.equal(item.operationActorId === ids.actor, item.name !== 'wrong_actor');
    assert.equal(item.version, item.name === 'state_changed_between' ? 3 : item.name === 'not_dispatched' ? 1 : 2);
  }
});

test('actual claim expectations total 21 SELECTs/13 matches and no scope-denial SELECT', () => {
  assert.equal(cases.reduce((sum,item) => sum + item.claimQueries,0),21);
  assert.equal(cases.reduce((sum,item) => sum + item.claimMatches,0),13);
  for (const name of ['cross_tenant','not_dispatched']) assert.equal(named(name).claimQueries,0);
  for (const name of ['revoked_between','withdrawn_between','state_changed_between','commit_ack_lost']) {
    assert.equal(named(name).claimMatches,1); assert.equal(named(name).beforeDelivery,0);
  }
  assert.equal(named('valid').beforeDelivery,3);
  assert.equal(named('consumer_failure').beforeDelivery,1);
});

test('audit ledger expectations preserve deliberate missing evidence and commit uncertainty', () => {
  const key = reason => `PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|${reason}`;
  assert.equal(dispatchedExpectedAudits(named('missing_preflight_audit'))[key('PREFLIGHT_PASSED')],undefined);
  assert.equal(dispatchedExpectedAudits(named('missing_dispatch_audit'))[key('STOW_STARTED')],undefined);
  assert.equal(dispatchedExpectedAudits(named('not_dispatched'))[key('STOW_STARTED')],undefined);
  assert.equal(dispatchedExpectedAudits(named('state_changed_between'))[key('VERIFYING')],1);
  assert.equal(dispatchedExpectedAudits(named('commit_ack_lost'))['PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT'],1);
  assert.equal(dispatchedExpectedAudits(named('read_audit_failure'))['PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT'],undefined);
  for (const item of cases) {
    assert.equal(dispatchedExpectedAudits(item)['PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|EXPLICIT_CLOSE'],1);
    assert.ok(!Object.keys(dispatchedExpectedAudits(item)).some(key => /COMPLETED|VERIFIED/.test(key)));
  }
});

test('seed and observer reject unowned projects or missing DB before pool construction', () => {
  for (const source of [seed,observer]) {
    const guards = source.slice(source.indexOf('const check ='),source.indexOf('const pool ='));
    for (const project of ['', 'mediq', 'mediq-int001-capture-xyz','mediq-int001-capture-123456789abc-extra']) {
      assert.throws(() => runInNewContext(guards,{ assert, process: { env: { MEDIQ_TEST_PROJECT: project,
        MEDIQ_TEST_FIXTURE_DATABASE_URL:'synthetic-not-used' } } }),/PROJECT/);
    }
    assert.throws(() => runInNewContext(guards,{ assert,process: { env: { MEDIQ_TEST_PROJECT:'mediq-int001-capture-123456789abc' } } }),/DATABASE/);
    runInNewContext(guards,{ assert,process: { env: { MEDIQ_TEST_PROJECT:'mediq-int001-capture-123456789abc',
      MEDIQ_TEST_FIXTURE_DATABASE_URL:'synthetic-not-used' } } });
    assert.match(source,/client\?\.release\(\); await pool\.end\(\)/);
  }
});

test('test application receives runtime URL only; owner seed/observer are separate roles', () => {
  const app = compose.slice(compose.indexOf('  api-source-capture-test:'),compose.indexOf('  source-capture-db-observer:'));
  assert.match(app,/MEDIQ_DATABASE_URL:/);
  assert.doesNotMatch(app,/MEDIQ_(?:MIGRATION|TEST_FIXTURE)_DATABASE_URL/);
  assert.match(integration,/assert\.equal\(process\.env\.MEDIQ_TEST_FIXTURE_DATABASE_URL, undefined/);
  assert.match(integration,/assert\.equal\(process\.env\.MEDIQ_MIGRATION_DATABASE_URL, undefined/);
  assert.match(seed,/role === 'mediq_migrator'/);
  assert.match(observer,/role === 'mediq_migrator'/);
  assert.match(observer,/REPEATABLE READ READ ONLY/);
  assert.match(observer,/await assertRuntimePrivilegeCatalog\(client\)/);
  assert.match(observer,/NO_TABLE_RIGHTS/);
});

test('wrapper keeps default 58 and separately validates 18, exact markers, privacy and owned cleanup', () => {
  assert.match(wrapper,/\[switch\]\$IncludeDispatchedReads/);
  assert.ok(/\$testPass -ne "58" -or \$testFail -ne "0"/.test(wrapper), 'DISPREAD_CONTRACT_ORIGINAL_58');
  assert.match(wrapper,/\$dispatchPass -ne "18" -or \$dispatchFail -ne "0"/);
  const start = wrapper.indexOf('    if ($IncludeDispatchedReads)');
  assert.ok(start > wrapper.indexOf('audit_and_evidence_observer=PASS'));
  const stage = wrapper.slice(start,wrapper.indexOf('INT001_ORTHANC_B_AFTER_PROBE_FAILED',start));
  assert.ok(stage.indexOf('seed-int001-dispatched-reads.mjs') < stage.indexOf('MEDIQ_TEST_DISPATCH_READ_MODE=true'));
  assert.ok(stage.indexOf('MEDIQ_TEST_DISPATCH_READ_MODE=true') < stage.indexOf('verify-int001-dispatched-reads.mjs'));
  assert.match(stage,/INT001_DISPATCH_FIXTURE_MARKER_MISSING/);
  assert.match(stage,/INT001_DISPATCH_OBSERVER_MARKER_MISSING/);
  assert.equal((stage.match(/\$capturePrivacyValues/g) ?? []).length,3);
  assert.doesNotMatch(stage,/MEDIQ_(?:MIGRATION|TEST_FIXTURE)_DATABASE_URL/);
  assert.match(wrapper,/Assert-NoProjectResources/);
  for (const path of ['tests/fixtures/dispatched-source-read-fixture.mjs','scripts/seed-int001-dispatched-reads.mjs',
    'scripts/verify-int001-dispatched-reads.mjs']) assert.ok(dockerfile.includes(`COPY ${path} ${path}`));
});

test('real-query acknowledgement fault is after real COMMIT result, and cleanup validates owned temp root', () => {
  const start = integration.indexOf('const dispatchSelect =');
  const query = integration.slice(start,integration.indexOf('const value = Reflect.get(target, property, target);',start));
  assert.ok(query.indexOf('Reflect.apply(target.query, target, args)') < query.indexOf('queryResult.then'));
  assert.ok(query.indexOf('querySettled(true)') < query.indexOf('throw new Error("DISPREAD_COMMIT_ACK_LOST")'));
  assert.match(query,/dispatchClaimMatches \+= result\.rowCount/);
  assert.match(integration,/DISPREAD_OWNED_ROOT/);
  assert.match(integration,/DISPREAD_OWNED_PREFIX/);
  assert.match(observer,/EXACT_AUDIT_PARTITION/);
  assert.match(observer,/ONLY_PENDING_SOURCE_EVIDENCE/);
  assert.match(observer,/NO_RESERVATIONS/);
  assert.match(observer,/NO_PACKAGE_QUOTAS/);
  assert.match(observer,/NO_ENVIRONMENT_QUOTA/);
});
