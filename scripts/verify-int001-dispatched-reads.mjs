// Separate final test observer. Its migrator URL is never an application right.
import assert from 'node:assert/strict';
import pg from 'pg';
import { dispatchedReadCases, dispatchedReadIds as ids, dispatchedReadDigest, dispatchedExpectedAudits } from '../tests/fixtures/dispatched-source-read-fixture.mjs';
const check = (condition, marker) => assert.ok(condition, `DISPREAD_OBSERVER_${marker}`);
check(/^mediq-int001-capture-[0-9a-f]{12}$/.test(process.env.MEDIQ_TEST_PROJECT ?? ''), 'PROJECT');
check(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, 'DATABASE');
const pool = new pg.Pool({ connectionString: process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  check((await client.query('SELECT current_user AS role')).rows[0].role === 'mediq_migrator', 'ROLE');
  await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
  check((await client.query("SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public'")).rows[0].n === 244, 'UNCHANGED_COLUMN_RIGHTS');
  check((await client.query("SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee IN ('PUBLIC','mediq_runtime') AND table_schema='public'")).rows[0].n === 0, 'NO_TABLE_RIGHTS');
  const baseline = (await client.query("SELECT source_digest FROM integrity_evidence WHERE operation_id='1b000000-0000-4000-8000-000000000001' AND verification_stage='SOURCE_CAPTURE'")).rows;
  check(baseline.length === 1 && /^sha256:[0-9a-f]{64}$/.test(baseline[0].source_digest), 'OLD_SOURCE_BASELINE');
  for (const item of dispatchedReadCases) {
    const graph = (await client.query(`SELECT op.*,sr.package_id,sr.temporary_storage_ref,sr.temporary_payload_state,
      sr.temporary_payload_expires_at,sr.temporary_payload_purged_at,g.status AS grant_status,c.status AS consent_status
      FROM pacs_transfer_operations op JOIN study_references sr ON sr.study_ref_id=op.study_ref_id
      JOIN transfer_grants g ON g.grant_id=$2 JOIN consents c ON c.consent_id=g.consent_id WHERE op.operation_id=$1`,
    [item.operationId,item.grantId])).rows;
    check(graph.length === 1, 'GRAPH_COUNT'); const row = graph[0];
    check(row.tenant_id === ids.tenant && row.actor_id === item.operationActorId && row.exchange_session_id === item.sessionId &&
      row.study_ref_id === item.studyRefId && row.package_id === item.packageId && row.idempotency_key === item.operationKey &&
      row.request_digest === dispatchedReadDigest(item), 'EXACT_OPERATION_BINDING');
    check(row.state === item.state && row.version === item.version && row.source_object_count === item.count &&
      row.destination_object_count === null && row.reason_code === null, 'EXACT_STATE_NOT_COMPLETED');
    check(item.name === 'not_dispatched' ? row.stow_started_at === null : row.stow_started_at instanceof Date &&
      row.stow_started_at >= row.created_at && row.stow_started_at <= row.updated_at, 'DISPATCH_TIMESTAMP');
    check(row.temporary_payload_state === 'PURGED' && row.temporary_payload_purged_at instanceof Date &&
      row.temporary_payload_expires_at instanceof Date && /^[0-9a-f-]{36}$/.test(row.temporary_storage_ref), 'PURGE_METADATA');
    check(row.grant_status === (item.name === 'revoked_between' ? 'REVOKED' : 'ACTIVE') &&
      row.consent_status === (item.name === 'withdrawn_between' ? 'WITHDRAWN' : 'ACTIVE'), 'CURRENT_AUTHORITY');
    const evidence = (await client.query(`SELECT exchange_session_id,package_id,study_ref_id,verification_stage,status,
      source_digest,source_object_count,destination_digest,destination_object_count,verified_at FROM integrity_evidence WHERE operation_id=$1`, [item.operationId])).rows;
    check(evidence.length === 1, 'SOURCE_EVIDENCE_COUNT'); const source = evidence[0];
    check(source.exchange_session_id === item.sessionId && source.package_id === item.packageId && source.study_ref_id === item.studyRefId &&
      source.verification_stage === 'SOURCE_CAPTURE' && source.status === 'PENDING' && source.source_digest === baseline[0].source_digest &&
      source.source_object_count === 3 && source.destination_digest === null && source.destination_object_count === null && source.verified_at === null,
    'ONLY_PENDING_SOURCE_EVIDENCE');
    const provenance = (await client.query('SELECT * FROM provenance_records WHERE operation_id=$1', [item.operationId])).rows;
    check(provenance.length === (item.name === 'no_provenance' ? 0 : 1), 'PROVENANCE_COUNT');
    if (provenance.length) {
      const record = provenance[0];
      check(record.exchange_session_id === item.sessionId && record.package_id === item.packageId && record.study_ref_id === item.studyRefId &&
        record.source_hospital_id === ids.source && record.destination_hospital_id === (item.name === 'wrong_provenance' ? ids.source : ids.destination) &&
        record.transfer_type === 'PACS_IMPORT' && record.transfer_status === 'PENDING' && record.integrity_id === null &&
        record.ingested_at === null && record.transferred_at === null && record.created_at <= (row.stow_started_at ?? row.updated_at), 'PROVENANCE_BINDING');
    }
    const audit = (await client.query(`SELECT actor_id,tenant_id,exchange_session_id,resource_type,resource_id,
      action,result,reason_code,correlation_id,occurred_at FROM audit_events WHERE exchange_session_id=$1`, [item.sessionId])).rows;
    const counts = {}, authorityMutations = [];
    for (const event of audit) {
      check(event.tenant_id === ids.tenant && event.exchange_session_id === item.sessionId && event.occurred_at instanceof Date, 'AUDIT_CONTEXT');
      if (['GRANT_REVOKED','CONSENT_WITHDRAWN'].includes(event.action)) {
        check(event.correlation_id === item.revokeCorrelationId && event.result === 'SUCCESS' &&
          event.actor_id === (event.action === 'GRANT_REVOKED' ? ids.actor : '0a000000-0000-4000-8000-000000000003') &&
          event.resource_id === (event.action === 'GRANT_REVOKED' ? item.grantId : item.consentId), 'REVOCATION_AUDIT');
        authorityMutations.push(event.action); continue;
      }
      const stateEvent = event.action === 'PACS_TRANSFER_OPERATION_STATE_CHANGED';
      check(event.correlation_id === item.correlationId && event.actor_id === (stateEvent ? item.operationActorId : ids.actor) &&
        event.resource_type === (stateEvent ? 'PACS_TRANSFER_OPERATION' : 'STUDY') &&
        event.resource_id === (stateEvent ? item.operationId : item.studyRefId), 'AUDIT_BINDING');
      if (stateEvent && event.reason_code === 'STOW_STARTED') check(event.occurred_at.getTime() === row.stow_started_at.getTime(), 'DISPATCH_AUDIT_TIMESTAMP');
      if (stateEvent && event.reason_code === 'PREFLIGHT_PASSED') check(event.occurred_at <= (row.stow_started_at ?? row.updated_at), 'PREFLIGHT_AUDIT_TIMESTAMP');
      if (item.name === 'future_dispatch' && event.action === 'PACS_TEMPORARY_READ_FAILED') {
        check(event.occurred_at < row.stow_started_at && row.stow_started_at < row.temporary_payload_expires_at, 'FUTURE_DISPATCH_AT_ATTEMPT');
      }
      const key = `${event.action}|${event.result}|${event.reason_code ?? ''}`; counts[key] = (counts[key] ?? 0) + 1;
    }
    const sort = value => JSON.stringify(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)));
    check(sort(counts) === sort(dispatchedExpectedAudits(item)), 'EXACT_AUDIT_PARTITION');
    check(authorityMutations.join(',') === (item.name === 'revoked_between' ? 'GRANT_REVOKED' : item.name === 'withdrawn_between' ? 'CONSENT_WITHDRAWN' : ''), 'EXACT_REVOCATION_COUNT');
  }
  check((await client.query('SELECT count(*)::int AS n FROM temporary_payload_reservations')).rows[0].n === 0, 'NO_RESERVATIONS');
  check((await client.query('SELECT count(*)::int AS n FROM temporary_payload_package_quotas')).rows[0].n === 0, 'NO_PACKAGE_QUOTAS');
  check(Number((await client.query('SELECT reserved_bytes FROM temporary_payload_quota_state')).rows[0].reserved_bytes) === 0, 'NO_ENVIRONMENT_QUOTA');
  await client.query('COMMIT');
  console.log('dispatched_read_observer=PASS cases=17 exact_claim_audit_provenance=true pending_source_only=true quota=0');
} catch (error) {
  await client?.query('ROLLBACK').catch(() => undefined);
  const code = /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'SUPPRESSED';
  throw new Error(`DISPREAD_OBSERVER_FAILED_${code}`);
} finally { client?.release(); await pool.end(); }
