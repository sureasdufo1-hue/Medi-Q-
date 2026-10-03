// Only the separately isolated fixture service receives the test migrator URL.
import pg from 'pg';
import { dispatchedReadCases, dispatchedReadIds as ids, dispatchedReadDigest } from '../tests/fixtures/dispatched-source-read-fixture.mjs';
import { destinationVerificationCases } from '../tests/fixtures/destination-verification-fixture.mjs';
const destinationMode = process.env.MEDIQ_TEST_DESTINATION_VERIFY_MODE === 'true';
const cases = destinationMode ? destinationVerificationCases : dispatchedReadCases;
const check = (condition, code) => { if (!condition) throw new Error(`DISPREAD_SEED_${code}`); };
check(/^mediq-int001-capture-[0-9a-f]{12}$/.test(process.env.MEDIQ_TEST_PROJECT ?? ''), 'PROJECT');
check(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, 'DATABASE');
const pool = new pg.Pool({ connectionString: process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
let client;
try {
  client = await pool.connect(); await client.query('BEGIN');
  check((await client.query('SELECT current_user AS role')).rows[0].role === 'mediq_migrator', 'ROLE');
  await client.query("SELECT set_config('mediq.tenant_id',$1,true)", [ids.tenant]);
  check((await client.query('SELECT actor_id FROM actors WHERE actor_id=$1 AND tenant_id=$2 AND hospital_id=$3 AND status=\'ACTIVE\'',
    [ids.actor, ids.tenant, ids.destination])).rowCount === 1, 'REGISTRY');
  for (const item of cases) {
    await client.query(`INSERT INTO exchange_sessions
      (session_id,patient_ref_id,source_hospital_id,destination_hospital_id,requester_actor_id,purpose,state,
       created_at,updated_at,expires_at,completed_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,'Synthetic committed read predicate test','ACTIVE',now(),now(),now()+interval '1 hour',NULL,$6)`,
    [item.sessionId, ids.patient, ids.source, ids.destination, ids.actor, item.sessionKey]);
    await client.query(`INSERT INTO imaging_packages
      (package_id,exchange_session_id,patient_ref_id,source_hospital_id,state,storage_ref,study_count,created_at,updated_at,retention_expires_at,deleted_at)
      VALUES($1,$2,$3,$4,'AVAILABLE',NULL,1,now(),now(),NULL,NULL)`, [item.packageId,item.sessionId,ids.patient,ids.source]);
    await client.query(`INSERT INTO study_references
      (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
      VALUES($1,$2,$3,$4,'CT',1,3,now())`, [item.studyRefId,item.packageId,ids.source,ids.studyUid]);
    await client.query(`INSERT INTO consents
      (consent_id,exchange_session_id,patient_ref_id,source_hospital_id,destination_hospital_id,imaging_package_id,status,consent_version,
       issued_at,expires_at,withdrawn_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',1,now(),now()+interval '1 hour',NULL,now(),now())`,
    [item.consentId,item.sessionId,ids.patient,ids.source,ids.destination,item.packageId]);
    await client.query(`INSERT INTO consent_actions(consent_action_id,consent_id,action) VALUES($1,$2,'PACS_IMPORT')`, [item.consentActionId,item.consentId]);
    await client.query(`INSERT INTO transfer_grants
      (grant_id,exchange_session_id,consent_id,recipient_tenant_id,recipient_hospital_id,recipient_actor_id,imaging_package_id,
       idempotency_key,status,issued_at,expires_at,revoked_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',now(),now()+interval '1 hour',NULL,now())`,
    [item.grantId,item.sessionId,item.consentId,ids.tenant,ids.destination,ids.actor,item.packageId,item.grantKey]);
    await client.query("INSERT INTO transfer_grant_scopes(grant_scope_id,grant_id,scope) VALUES($1,$2,'study:pacs-transfer')", [item.grantScopeId,item.grantId]);
    await client.query(`INSERT INTO pacs_transfer_operations
      (operation_id,tenant_id,exchange_session_id,study_ref_id,actor_id,idempotency_key,request_digest,state,version,reason_code,
       source_object_count,destination_object_count,created_at,updated_at,stow_started_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'CREATED',0,NULL,NULL,NULL,now(),now(),NULL)`,
    [item.operationId,ids.tenant,item.sessionId,item.studyRefId,item.operationActorId,item.operationKey,dispatchedReadDigest(item)]);
    if (item.name === 'wrong_provenance') {
      await client.query(`INSERT INTO provenance_records
        (provenance_id,operation_id,exchange_session_id,package_id,study_ref_id,source_hospital_id,destination_hospital_id,
         integrity_id,transfer_type,transfer_status,ingested_at,transferred_at,created_at)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$5,NULL,'PACS_IMPORT','PENDING',NULL,NULL,now())`,
      [item.operationId,item.sessionId,item.packageId,item.studyRefId,ids.source]);
    }
  }
  const failure = cases.find(item => item.name === (destinationMode ? 'verify_audit_failure' : 'read_audit_failure'));
  // A real DB trigger, scoped to one disjoint synthetic correlation, not a runtime privilege.
  await client.query(`CREATE FUNCTION public.${destinationMode ? 'destverify' : 'dispread'}_test_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.correlation_id='${failure.correlationId}'::uuid AND NEW.action='${destinationMode ? 'PACS_DESTINATION_VERIFY_AUTHORIZED' : 'PACS_TEMPORARY_READ_AUTHORIZED'}'
        AND NEW.reason_code='${destinationMode ? 'BEFORE_IDENTITY' : 'BEFORE_DECRYPT'}' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DISPREAD_SYNTHETIC_AUDIT_FAILURE';
      END IF;
      RETURN NEW;
    END;$body$;
    CREATE TRIGGER ${destinationMode ? 'destverify' : 'dispread'}_test_audit_fault BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.${destinationMode ? 'destverify' : 'dispread'}_test_audit_fault()`);
  await client.query('COMMIT'); console.log(`${destinationMode ? 'destination' : 'dispatched'}_fixture=PASS synthetic_only=true cases=${cases.length}`);
} catch (error) {
  await client?.query('ROLLBACK').catch(() => undefined);
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : /^[A-Z0-9_]{1,80}$/.test(error?.message ?? '') ? error.message : 'SUPPRESSED';
  throw new Error(`DISPREAD_SEED_FAILED_${code}`);
} finally { client?.release(); await pool.end(); }
