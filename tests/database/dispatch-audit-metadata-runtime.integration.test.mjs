// SQL/role/RLS acceptance only; Audit visibility is not image authorization.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { auditDispatchSelectColumns, assertRuntimePrivilegeCatalog } from '../fixtures/runtime-privilege-contract.mjs';

test('R3 exact Audit metadata SELECT and immutable writes obey forced Tenant RLS', async () => {
  assert.equal(process.env.MEDIQ_TEST_INSPECT_DATABASE_URL,undefined,'R3_NO_INSPECT_URL');
  assert.equal(process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL,undefined,'R3_NO_OWNER_URL');
  const url = process.env.MEDIQ_TEST_DATABASE_URL;
  assert.ok(url,'R3_RUNTIME_URL_REQUIRED');
  assert.equal(decodeURIComponent(new URL(url).username),'mediq_runtime');
  const fixture = JSON.parse(process.env.MEDIQ_AUT005_TEST_FIXTURE ?? 'null');
  assert.ok(fixture,'R3_SYNTHETIC_FIXTURE_REQUIRED');
  const pool = new pg.Pool({ connectionString:url, max:1, connectionTimeoutMillis:5000 });
  let client;
  try {
    client = await pool.connect();
    const role = (await client.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.deepEqual(role,{ role:'mediq_runtime',rolsuper:false,rolbypassrls:false });
    await assertRuntimePrivilegeCatalog(client);
    assert.deepEqual((await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='audit_events'::regclass")).rows[0],
      { relrowsecurity:true,relforcerowsecurity:true });
    await client.query('BEGIN');
    const markers = [randomUUID(),randomUUID()];
    for (const [index,tenant,actor] of [[0,fixture.tenantA,fixture.actorA],[1,fixture.tenantB,fixture.actorB]]) {
      await client.query("SELECT set_config('mediq.tenant_id',$1,true)",[tenant]);
      await client.query(`INSERT INTO audit_events
        (audit_event_id,occurred_at,actor_id,tenant_id,exchange_session_id,resource_type,resource_id,action,result,reason_code,correlation_id,created_at)
        VALUES($1,now(),$2,$3,NULL,'TEST_RESOURCE',$4,'R3_TEST_EVENT','SUCCESS',NULL,NULL,now())`,
      [randomUUID(),actor,tenant,markers[index]]);
    }
    for (const [tenant,index] of [[fixture.tenantA,0],[fixture.tenantB,1],[fixture.tenantC,-1],['',-1]]) {
      await client.query("SELECT set_config('mediq.tenant_id',$1,true)",[tenant]);
      const rows = (await client.query(`SELECT ${auditDispatchSelectColumns.join(',')} FROM audit_events
        WHERE resource_id=ANY($1::uuid[])`,[markers])).rows;
      assert.equal(rows.length,index < 0 ? 0 : 1,'R3_EXACT_TENANT_AUDIT_VISIBILITY');
      if (rows.length) {
        assert.equal(rows[0].resource_id,markers[index],'R3_NO_OTHER_TENANT_EVENT');
        assert.equal(rows[0].tenant_id,tenant,'R3_EXACT_AUDIT_TENANT');
      }
    }
    await client.query("SELECT set_config('mediq.tenant_id',$1,true)",[fixture.tenantB]);
    const denied = [
      'SELECT audit_event_id FROM audit_events WHERE false',
      'SELECT correlation_id FROM audit_events WHERE false',
      'SELECT created_at FROM audit_events WHERE false',
      'SELECT * FROM audit_events WHERE false',
      'UPDATE audit_events SET action=action WHERE false',
      'DELETE FROM audit_events WHERE false',
    ];
    for (const statement of denied) {
      await client.query('SAVEPOINT r3_denial');
      await assert.rejects(client.query(statement),error => error.code === '42501','R3_EXCLUDED_PROJECTION_OR_MUTATION_DENIED');
      await client.query('ROLLBACK TO SAVEPOINT r3_denial');
      await client.query('RELEASE SAVEPOINT r3_denial');
    }
    await client.query('ROLLBACK');
    const absent = await client.query('SELECT resource_id FROM audit_events WHERE resource_id=ANY($1::uuid[])',[markers]);
    assert.equal(absent.rowCount,0,'R3_NO_CONTEXT_AFTER_ROLLBACK');
    await client.query('BEGIN'); await client.query("SELECT set_config('mediq.tenant_id',$1,true)",[fixture.tenantB]);
    assert.equal((await client.query('SELECT resource_id FROM audit_events WHERE resource_id=ANY($1::uuid[])',[markers])).rowCount,0,'R3_NO_PERSISTED_TEST_EVENTS');
    await client.query('ROLLBACK');
    console.log('dispatch_audit_metadata=PASS exact_privileges=253 audit_select=9 insert=12 rls=forced immutable=true synthetic_rollback=true');
  } catch (error) {
    const code = ['ERR_ASSERTION','42501','23503','23514','25P02'].includes(error?.code) ? error.code : 'SUPPRESSED';
    throw new Error(`R3_AUDIT_METADATA_FAILED_${code}`);
  } finally {
    await client?.query('ROLLBACK').catch(() => undefined);
    client?.release(); await pool.end();
  }
});
