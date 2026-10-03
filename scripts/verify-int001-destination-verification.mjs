// Independent read-only final observer; migrator credentials never enter the app.
import assert from 'node:assert/strict';
import pg from 'pg';
import { assertRuntimePrivilegeCatalog } from '../tests/fixtures/runtime-privilege-contract.mjs';
import { dispatchedReadIds as ids } from '../tests/fixtures/dispatched-source-read-fixture.mjs';
import { destinationVerificationCases, destinationVerificationDigest, destinationExpectedAudits } from '../tests/fixtures/destination-verification-fixture.mjs';
const check = (value,code) => assert.ok(value,`DESTVERIFY_OBSERVER_${code}`);
check(/^mediq-int001-capture-[0-9a-f]{12}$/.test(process.env.MEDIQ_TEST_PROJECT ?? ''),'PROJECT');
check(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL,'DATABASE');
const pool = new pg.Pool({connectionString:process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const scopeSql = "SELECT current_user AS role,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation";
  const assertScope = async role => {
    const rows = (await client.query(scopeSql)).rows;
    check(rows.length === 1 && rows[0].role === role && rows[0].read_only === 'on' && rows[0].isolation === 'repeatable read','READ_ONLY_SCOPE');
  };
  await assertScope('mediq_migrator');
  await client.query("SELECT set_config('mediq.tenant_id',$1,true)",[ids.tenant]);
  await assertRuntimePrivilegeCatalog(client);
  check((await client.query("SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public'")).rows[0].n === 0,'NO_TABLE_RIGHTS');
  const baseline = (await client.query("SELECT source_digest FROM integrity_evidence WHERE operation_id='1b000000-0000-4000-8000-000000000001' AND verification_stage='SOURCE_CAPTURE'")).rows;
  check(baseline.length === 1 && /^sha256:[0-9a-f]{64}$/.test(baseline[0].source_digest),'SOURCE_BASELINE');
  for (const item of destinationVerificationCases) {
    const graph = (await client.query(`SELECT op.*,sr.package_id,sr.temporary_storage_ref,sr.temporary_payload_state,
      sr.temporary_payload_expires_at,sr.temporary_payload_purged_at,g.status AS grant_status,c.status AS consent_status,
      es.state AS session_state,es.completed_at
      FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
      JOIN exchange_sessions es ON es.session_id=op.exchange_session_id
      JOIN transfer_grants g ON g.grant_id=$2 JOIN consents c ON c.consent_id=g.consent_id WHERE op.operation_id=$1`,[item.operationId,item.grantId])).rows;
    check(graph.length === 1,'GRAPH_COUNT'); const row = graph[0];
    check(row.tenant_id === ids.tenant && row.actor_id === item.operationActorId && row.exchange_session_id === item.sessionId &&
      row.study_ref_id === item.studyRefId && row.package_id === item.packageId && row.idempotency_key === item.operationKey &&
      row.request_digest === destinationVerificationDigest(item),'EXACT_OPERATION_BINDING');
    check(row.state === 'VERIFYING' && row.version === 3 && row.source_object_count === item.count && row.destination_object_count === null &&
      row.reason_code === null && row.session_state === 'ACTIVE' && row.completed_at === null,'NO_COMPLETION');
    check(row.stow_started_at instanceof Date && row.stow_started_at >= row.created_at && row.stow_started_at <= row.updated_at,'DISPATCH_TIMESTAMP');
    check(row.temporary_payload_state === 'PURGED' && row.temporary_payload_purged_at instanceof Date &&
      row.temporary_payload_expires_at instanceof Date && /^[0-9a-f-]{36}$/.test(row.temporary_storage_ref),'PURGE_METADATA');
    check(row.grant_status === (item.name === 'revoked_between' ? 'REVOKED' : 'ACTIVE') &&
      row.consent_status === (item.name === 'withdrawn_between' ? 'WITHDRAWN' : 'ACTIVE'),'CURRENT_AUTHORITY');
    const evidence = (await client.query('SELECT * FROM integrity_evidence WHERE operation_id=$1',[item.operationId])).rows;
    check(evidence.length === 1,'SOURCE_EVIDENCE_COUNT'); const source = evidence[0];
    check(source.exchange_session_id === item.sessionId && source.package_id === item.packageId && source.study_ref_id === item.studyRefId &&
      source.verification_stage === 'SOURCE_CAPTURE' && source.status === 'PENDING' && source.source_digest === baseline[0].source_digest &&
      source.source_object_count === 3 && source.destination_digest === null && source.destination_object_count === null && source.verified_at === null,'PENDING_SOURCE_ONLY');
    const provenance = (await client.query('SELECT * FROM provenance_records WHERE operation_id=$1',[item.operationId])).rows;
    check(provenance.length === (item.name === 'no_provenance' ? 0 : 1),'PROVENANCE_COUNT');
    if (provenance.length) {
      const pr = provenance[0];
      check(pr.exchange_session_id === item.sessionId && pr.package_id === item.packageId && pr.study_ref_id === item.studyRefId &&
        pr.source_hospital_id === ids.source && pr.destination_hospital_id === ids.destination && pr.transfer_type === 'PACS_IMPORT' &&
        pr.transfer_status === 'PENDING' && pr.integrity_id === null && pr.ingested_at === null && pr.transferred_at === null &&
        pr.created_at <= row.stow_started_at,'PENDING_PROVENANCE_BINDING');
    }
    const audits = (await client.query(`SELECT actor_id,tenant_id,exchange_session_id,resource_type,resource_id,
      action,result,reason_code,correlation_id,occurred_at FROM audit_events WHERE exchange_session_id=$1 ORDER BY occurred_at,audit_event_id`,[item.sessionId])).rows;
    const counts = {}, mutations = [];
    for (const ae of audits) {
      check(ae.tenant_id === ids.tenant && ae.exchange_session_id === item.sessionId && ae.occurred_at instanceof Date,'AUDIT_CONTEXT');
      if (['GRANT_REVOKED','CONSENT_WITHDRAWN'].includes(ae.action)) {
        check(ae.correlation_id === item.revokeCorrelationId && ae.result === 'SUCCESS' &&
          ae.actor_id === (ae.action === 'GRANT_REVOKED' ? ids.actor : '0a000000-0000-4000-8000-000000000003') &&
          ae.resource_id === (ae.action === 'GRANT_REVOKED' ? item.grantId : item.consentId),'REVOCATION_AUDIT');
        mutations.push(ae.action); continue;
      }
      const state = ae.action === 'PACS_TRANSFER_OPERATION_STATE_CHANGED';
      check(ae.correlation_id === item.correlationId && ae.actor_id === (state ? item.operationActorId : ids.actor) &&
        ae.resource_type === (state ? 'PACS_TRANSFER_OPERATION' : 'STUDY') && ae.resource_id === (state ? item.operationId : item.studyRefId),'AUDIT_BINDING');
      if (state && ae.reason_code === 'STOW_STARTED') check(ae.occurred_at.getTime() === row.stow_started_at.getTime(),'DISPATCH_AUDIT_TIMESTAMP');
      if (state && ae.reason_code === 'PREFLIGHT_PASSED') check(ae.occurred_at <= row.stow_started_at,'PREFLIGHT_AUDIT_TIMESTAMP');
      if (state && ae.reason_code === 'VERIFYING') check(ae.occurred_at.getTime() === row.updated_at.getTime(),'VERIFYING_AUDIT_TIMESTAMP');
      const key = `${ae.action}|${ae.result}|${ae.reason_code ?? ''}`; counts[key] = (counts[key] ?? 0)+1;
    }
    const sorted = value => JSON.stringify(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)));
    check(sorted(counts) === sorted(destinationExpectedAudits(item)),'EXACT_AUDIT_PARTITION');
    check(mutations.join(',') === (item.name === 'revoked_between' ? 'GRANT_REVOKED' : item.name === 'withdrawn_between' ? 'CONSENT_WITHDRAWN' : ''),'EXACT_REVOCATION_COUNT');
  }
  await assertScope('mediq_migrator');
  await client.query('SET LOCAL ROLE mediq_quota_owner');
  await assertScope('mediq_quota_owner');
  check((await client.query('SELECT count(*)::int AS n FROM temporary_payload_reservations')).rows[0].n === 0,'NO_RESERVATIONS');
  check((await client.query('SELECT count(*)::int AS n FROM temporary_payload_package_quotas')).rows[0].n === 0,'NO_PACKAGE_QUOTAS');
  const environment = (await client.query('SELECT reserved_bytes::text AS bytes FROM temporary_payload_quota_state')).rows;
  check(environment.length === 1 && environment[0].bytes === '0','NO_ENVIRONMENT_QUOTA');
  await client.query('COMMIT');
  check((await client.query('SELECT current_user AS role')).rows[0].role === 'mediq_migrator','ROLE_RESET');
  console.log('destination_verification_observer=PASS cases=16 exact_audit_provenance=true pending_source_only=true quota=0');
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  const code = /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'SUPPRESSED';
  throw new Error(`DESTVERIFY_OBSERVER_FAILED_${code}`);
} finally { client?.release(); await pool.end(); }
