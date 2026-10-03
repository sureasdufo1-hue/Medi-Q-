import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { RemoteJwksOidcTokenVerifier } from "../../services/api/dist/authentication/oidc-jwt.verifier.js";
import { ActorTenantContextService } from "../../services/api/dist/identity/application/actor-tenant-context.service.js";
import { ActorRegistryRepository } from "../../services/api/dist/identity/persistence/actor-registry.repository.js";
import { PacsTransferOperation } from "../../services/api/dist/pacs/domain/pacs-transfer-operation.js";
import { PostgresPacsTransferOperationRepository } from "../../services/api/dist/pacs/persistence/postgres-pacs-transfer-operation.repository.js";
import { PostgresTemporaryPayloadMetadataRepository } from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-metadata.repository.js";
import { PostgresTemporaryPayloadQuotaRepository } from "../../services/api/dist/imaging-storage/persistence/postgres-temporary-payload-quota.repository.js";
import { EphemeralEncryptedTemporaryImagingStore } from "../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js";
import { TemporaryPayloadPurgeCoordinator } from "../../services/api/dist/imaging-storage/application/temporary-payload-purge.coordinator.js";
import { TemporaryPayloadExpiryRunner } from "../../services/api/dist/imaging-storage/application/temporary-payload-expiry.runner.js";

test("DEC-016 verified SERVICE expiry with real Tenant RLS and ciphertext", { timeout: 180_000 }, async () => {
  assert.equal(process.env.MEDIQ_EXPIRY_TEST_SCOPE, "DB008_SCRATCH");
  const fixture = JSON.parse(process.env.MEDIQ_TEMP_PAYLOAD_TEST_FIXTURE ?? "null");
  assert.ok(fixture?.sourceTenantId && fixture?.tenantId && fixture?.packageId);
  const pool = new Pool({ connectionString: process.env.MEDIQ_TEST_DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 });
  const inspector = new Pool({ connectionString: process.env.MEDIQ_TEST_INSPECT_DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  const tenantA = fixture.sourceTenantId;
  const tenantB = fixture.tenantId;
  const targets = [];
  let stage = "PRIVILEGES";
  let root;
  let server;
  let store;
  let physicalCalls = 0;
  let candidateQueries = 0;
  let activeTransactions = 0;
  const transactionScope = new AsyncLocalStorage();
  let concurrentProbe = false;
  let fakeNow = Date.now();
  let beforePhysical;
  let afterDiscovery;
  let failAudit = false;
  const diagnosticCategories = new Set();
  let aggregateDiagnostic = "NONE";
  const activeActors = [];
  try {
    const role = await pool.query("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
    assert.deepEqual(role.rows[0], { current_user: "mediq_runtime", rolsuper: false, rolbypassrls: false });
    const grants = await pool.query("SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee='mediq_runtime' AND table_schema='public'");
    assert.equal(grants.rows[0].n, 253);
    const rls = await pool.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='study_references'::regclass");
    assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    const beforePackage = (await inspector.query("SELECT * FROM imaging_packages WHERE package_id=$1", [fixture.packageId])).rows[0];

    stage = "SIGNED_OIDC_AND_SERVICE_FIXTURES";
    const keys = await generateKeyPair("RS256", { modulusLength: 2048 });
    const jwk = { ...await exportJWK(keys.publicKey), kid: "TEST-CLEANUP-KEY", alg: "RS256", use: "sig" };
    server = createServer((request, response) => {
      if (request.url !== "/jwks") return response.writeHead(404).end();
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const issuer = `http://127.0.0.1:${server.address().port}/test-issuer`;
    const config = { issuer, audience: "TEST-CLEANUP", jwksUri: `http://127.0.0.1:${server.address().port}/jwks` };
    const verifier = new RemoteJwksOidcTokenVerifier(config);
    const signPrincipal = async (subject) => verifier.verify(await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid, typ: "at+jwt" })
      .setIssuer(issuer).setAudience(config.audience).setSubject(subject)
      .setNotBefore(Math.floor(Date.now() / 1000) - 1).setExpirationTime("2m").sign(keys.privateKey));
    async function seedActor(tenant, type = "SERVICE", hospital = null, status = "ACTIVE") {
      const id = randomUUID();
      const subject = `TEST-CLEANUP-${randomUUID()}`;
      await inspector.query(`INSERT INTO actors
        (actor_id,tenant_id,hospital_id,actor_type,external_subject,display_name,status,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,'Synthetic cleanup test',$6,now(),now())`, [id, tenant, hospital, type, subject, status]);
      activeActors.push(id);
      return { id, tenant, subject };
    }
    const actorA = await seedActor(tenantA);
    const actorB = await seedActor(tenantB);
    const user = await seedActor(tenantA, "USER");
    const hospitalService = await seedActor(tenantA, "SERVICE", fixture.sourceHospitalId);
    const inactive = await seedActor(tenantA, "SERVICE", null, "INACTIVE");
    const inactiveTenant = randomUUID();
    await inspector.query(`INSERT INTO tenants (tenant_id,organization_id,tenant_code,name,status,created_at,updated_at)
      SELECT $1,organization_id,$2,'Synthetic inactive cleanup tenant','INACTIVE',now(),now() FROM tenants WHERE tenant_id=$3`,
    [inactiveTenant, `TEST-CLEANUP-${randomUUID()}`, tenantA]);
    const inactiveTenantActor = await seedActor(inactiveTenant);
    const service = new ActorTenantContextService({ oidcAuthentication: config }, { connect: () => pool.connect() }, new ActorRegistryRepository());
    const principals = new Map([[tenantA, await signPrincipal(actorA.subject)], [tenantB, await signPrincipal(actorB.subject)]]);
    const runner = {
      async run(principal, tenant, work) {
        let discovery = false;
        activeTransactions += 1;
        let result;
        try {
          result = await transactionScope.run(true, () => service.run(principal, tenant, (context, client) => work(context, {
            query(sql, ...args) {
              if (typeof sql === "string" && sql.startsWith("SELECT candidate.*")) {
                candidateQueries += 1;
                discovery = true;
              }
              if (failAudit && typeof sql === "string" && sql.includes("INSERT INTO audit_events")) {
                return client.query("SELECT 1 / 0");
              }
              return client.query(sql, ...args).catch((error) => {
                diagnosticCategories.add(/^[0-9A-Z]{5}$/.test(error?.code ?? "") ? `SQL_${error.code}` : "SQL_UNAVAILABLE");
                throw error;
              });
            },
          })));
        } finally { activeTransactions -= 1; }
        if (discovery) await afterDiscovery?.();
        return result;
      },
    };
    const quota = new PostgresTemporaryPayloadQuotaRepository({
      withTenant: (tenant, work) => service.run(principals.get(tenant), tenant, (_ctx, tx) => work(tx)),
    });
    root = await mkdtemp(join(tmpdir(), "mediq-expiry-"));
    const storageRoot = join(root, "ciphertext");
    store = new EphemeralEncryptedTemporaryImagingStore({ rootDirectory: storageRoot, now: () => fakeNow, sharedQuota: quota });
    const physical = { async purgeByReference(input) {
      try {
      assert.notEqual(transactionScope.getStore(), true, "NO_OWN_TRANSACTION_DURING_FILESYSTEM");
      if (!concurrentProbe) {
        assert.equal(activeTransactions, 0, "NO_TRANSACTION_DURING_FILESYSTEM");
        // Same role can see its other sessions' transaction details without
        // pg_monitor privileges. Exclude this short observer SELECT itself.
        const open = await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND usename=current_user
            AND pid <> pg_backend_pid() AND xact_start IS NOT NULL`);
        assert.equal(open.rows[0].n, 0, "NO_RUNTIME_TRANSACTION_DURING_SEQUENTIAL_FILESYSTEM");
      }
      } catch (error) {
        diagnosticCategories.add("PHYSICAL_TRANSACTION_OBSERVER");
        throw error;
      }
      physicalCalls += 1;
      await beforePhysical?.(input);
      return store.purgeByReference(input);
    } };
    const clock = () => new Date(fakeNow);
    const cleanup = new TemporaryPayloadExpiryRunner(runner, physical, clock);
    const purge = new TemporaryPayloadPurgeCoordinator(runner, physical, clock);
    const cmd = async (actor, extra = {}) => ({ principal: await signPrincipal(actor.subject), tenantCandidate: actor.tenant, correlationId: randomUUID(), ...extra });
    async function seedTarget(actor, state = "AVAILABLE") {
      const studyRefId = randomUUID();
      const storageRef = randomUUID();
      await inspector.query(`INSERT INTO study_references
        (study_ref_id,package_id,source_hospital_id,study_instance_uid,modality,series_count,instance_count,created_at)
        VALUES ($1,$2,$3,$4,'CT',1,1,now())`, [studyRefId, fixture.packageId, fixture.sourceHospitalId, `2.25.${BigInt('0x' + randomUUID().replaceAll('-', ''))}`]);
      const operation = PacsTransferOperation.create({ operationId: randomUUID(), semantics: {
        tenantId: actor.tenant, actorId: actor.id, exchangeSessionId: fixture.sessionId, studyRefId,
        consentId: randomUUID(), grantId: randomUUID(), action: "PACS_IMPORT",
      }, idempotencyKey: randomUUID(), now: new Date() });
      const binding = { operationId: operation.snapshot.operationId, tenantId: actor.tenant,
        exchangeSessionId: fixture.sessionId, packageId: fixture.packageId, studyRefId, sourceHospitalId: fixture.sourceHospitalId };
      await service.run(principals.get(actor.tenant), actor.tenant, async (_ctx, tx) => {
        await new PostgresPacsTransferOperationRepository(tx).createIdempotently({ operation, correlationId: randomUUID() });
        await new PostgresTemporaryPayloadMetadataRepository(tx).reserveStaging({ binding, storageRef, expiresAt: new Date(fakeNow + 30 * 60_000) });
      });
      const packageBinding = { tenantId: actor.tenant, exchangeSessionId: fixture.sessionId, packageId: fixture.packageId, purpose: "PACS_IMPORT" };
      await store.beginReservedPackage(packageBinding, storageRef);
      const bytes = Buffer.from("SYNTHETIC-CLEANUP-BYTES-NOT-DICOM-OR-PHI");
      await store.stageInstance({ storageRef, packageBinding, instanceBinding: { studyRefId, seriesInstanceUid: "2.25.90001", sopInstanceUid: "2.25.90002" },
        source: (async function* () { yield bytes; })() });
      const receipt = await store.sealPackage({ storageRef, binding: packageBinding });
      await service.run(principals.get(actor.tenant), actor.tenant, async (_ctx, tx) => {
        const repo = new PostgresTemporaryPayloadMetadataRepository(tx);
        if (state !== "STAGING") await repo.markAvailable({ binding, storageRef, now: new Date(fakeNow) });
        if (state === "PURGE_PENDING") await repo.markPurgePending({ binding, storageRef });
      });
      const directory = join(storageRoot, storageRef);
      const files = await readdir(directory);
      assert.equal(files.length, 1);
      const ciphertext = await readFile(join(directory, files[0]));
      assert.equal(ciphertext.includes(bytes), false);
      const target = { binding, storageRef, actor, directory, file: files[0], digest: createHash("sha256").update(ciphertext).digest("hex"), expiresAt: receipt.expiresAt };
      targets.push(target);
      return target;
    }
    const stateOf = async (target) => (await inspector.query("SELECT temporary_payload_state AS state FROM study_references WHERE study_ref_id=$1", [target.binding.studyRefId])).rows[0].state;
    const auditCount = async (target) => (await inspector.query("SELECT count(*)::int AS n FROM audit_events WHERE resource_id=$1 AND action='PACS_TEMPORARY_OBJECT_PURGED'", [target.binding.studyRefId])).rows[0].n;
    async function quotaCount(target, tenant = target.actor.tenant) {
      const tx = await inspector.connect();
      try {
        await tx.query("BEGIN");
        await tx.query("SET LOCAL ROLE mediq_quota_owner");
        if (tenant !== null) await tx.query("SELECT set_config('mediq.tenant_id',$1,true)", [tenant]);
        const result = await tx.query("SELECT count(*)::int AS n FROM temporary_payload_reservations WHERE study_ref_id=$1", [target.binding.studyRefId]);
        await tx.query("COMMIT");
        return result.rows[0].n;
      } finally { await tx.query("ROLLBACK"); tx.release(); }
    }
    const expectIntact = async (target) => assert.equal(createHash("sha256").update(await readFile(join(target.directory, target.file))).digest("hex"), target.digest);
    const expectPurged = async (target) => {
      assert.equal(await stateOf(target), "PURGED");
      assert.equal(await auditCount(target), 1);
      assert.equal(await quotaCount(target), 0);
      await assert.rejects(stat(target.directory), { code: "ENOENT" });
    };

    stage = "SEED_A_STAGING";
    const a1 = await seedTarget(actorA, "STAGING");
    stage = "SEED_A_AVAILABLE";
    const a2 = await seedTarget(actorA);
    stage = "SEED_A_PENDING";
    const a3 = await seedTarget(actorA, "PURGE_PENDING");
    stage = "SEED_B_AVAILABLE";
    const b1 = await seedTarget(actorB);
    fakeNow += 31 * 60_000;
    stage = "SEED_A_UNEXPIRED";
    const unexpired = await seedTarget(actorA);
    // Candidate discovery has a transaction-local Tenant predicate as well as RLS.
    stage = "DISCOVERY_WITHOUT_CONTEXT";
    assert.deepEqual(await new PostgresTemporaryPayloadMetadataRepository(pool).findExpired({ tenantId: tenantA, now: clock(), limit: 10 }), []);
    stage = "DISCOVERY_WRONG_TENANT";
    await service.run(principals.get(tenantB), tenantB, async (_ctx, tx) => {
      assert.deepEqual(await new PostgresTemporaryPayloadMetadataRepository(tx).findExpired({ tenantId: tenantA, now: clock(), limit: 10 }), []);
    });
    beforePhysical = (input) => { if (input.storageRef === a1.storageRef) throw new Error("TEST_UNLINK_FAILURE"); };
    stage = "PARTIAL_BATCH_OUTCOME";
    const partial = await cleanup.run(await cmd(actorA));
    aggregateDiagnostic = [partial.attempted, partial.purged, partial.alreadyPurged, partial.retryable, Number(partial.hasMore)].join("_");
    assert.deepEqual(partial, { attempted: 3, purged: 2, alreadyPurged: 0, retryable: 1, hasMore: false });
    stage = "PARTIAL_FAILURE_RETAINED_EVIDENCE";
    assert.equal(await stateOf(a1), "PURGE_PENDING");
    assert.equal(await auditCount(a1), 0);
    assert.equal(await quotaCount(a1, null), 0, "NO_CONTEXT_QUOTA_HIDDEN");
    assert.equal(await quotaCount(a1, tenantB), 0, "OTHER_TENANT_QUOTA_HIDDEN");
    assert.equal(await quotaCount(a1), 1);
    await expectIntact(a1); await expectIntact(b1); await expectIntact(unexpired);
    stage = "HEALTHY_SIBLING_PURGE_EVIDENCE";
    await expectPurged(a2); await expectPurged(a3);
    beforePhysical = undefined;
    stage = "FAILED_TARGET_RETRY";
    assert.equal((await cleanup.run(await cmd(actorA))).purged, 1);
    await expectPurged(a1);
    stage = "OTHER_TENANT_CLEANUP";
    assert.equal((await cleanup.run(await cmd(actorB))).purged, 1);
    await expectPurged(b1); await expectIntact(unexpired);

    stage = "IDENTITY_DENIAL_BEFORE_DISCOVERY";
    const deniedCommands = [await cmd(user), await cmd(hospitalService), await cmd(inactive), await cmd(inactiveTenantActor),
      await cmd(actorA, { tenantCandidate: tenantB }), await cmd(actorA, { principal: null }),
      await cmd(actorA, { principal: { issuer: "https://wrong.test", subject: actorA.subject } }),
      await cmd(actorA, { principal: await signPrincipal("TEST-UNKNOWN-SERVICE") })];
    for (const denied of deniedCommands) {
      const before = [candidateQueries, physicalCalls];
      await assert.rejects(cleanup.run(denied), { name: "TemporaryPayloadExpiryUnavailableError" });
      assert.deepEqual([candidateQueries, physicalCalls], before);
    }

    stage = "STALE_EXPIRY_REFERENCE_AND_SERVICE";
    fakeNow += 31 * 60_000; // unexpired is now the sole pending target.
    for (const change of ["expiry", "ref", "service"]) {
      afterDiscovery = async () => {
        if (change === "expiry") await inspector.query("UPDATE study_references SET temporary_payload_expires_at=$2 WHERE study_ref_id=$1", [unexpired.binding.studyRefId, new Date(fakeNow + 60_000)]);
        if (change === "ref") await inspector.query("UPDATE study_references SET temporary_storage_ref=$2 WHERE study_ref_id=$1", [unexpired.binding.studyRefId, randomUUID()]);
        if (change === "service") await inspector.query("UPDATE actors SET actor_type='USER' WHERE actor_id=$1", [actorA.id]);
      };
      const before = physicalCalls;
      assert.equal((await cleanup.run(await cmd(actorA))).retryable, 1);
      assert.equal(physicalCalls, before);
      assert.equal(await auditCount(unexpired), 0);
      await expectIntact(unexpired);
      afterDiscovery = undefined;
      await inspector.query("UPDATE actors SET actor_type='SERVICE' WHERE actor_id=$1", [actorA.id]);
      await inspector.query("UPDATE study_references SET temporary_storage_ref=$2, temporary_payload_expires_at=$3 WHERE study_ref_id=$1", [unexpired.binding.studyRefId, unexpired.storageRef, unexpired.expiresAt]);
    }

    stage = "POST_UNLINK_REVOCATION_AND_AUDIT_ROLLBACK";
    beforePhysical = async () => { await inspector.query("UPDATE actors SET status='INACTIVE' WHERE actor_id=$1", [actorA.id]); };
    assert.equal((await cleanup.run(await cmd(actorA))).retryable, 1);
    assert.equal(await stateOf(unexpired), "PURGE_PENDING");
    assert.equal(await auditCount(unexpired), 0);
    assert.equal(await quotaCount(unexpired), 1);
    await assert.rejects(stat(unexpired.directory), { code: "ENOENT" });
    beforePhysical = undefined;
    await inspector.query("UPDATE actors SET status='ACTIVE' WHERE actor_id=$1", [actorA.id]);
    failAudit = true;
    assert.equal((await cleanup.run(await cmd(actorA))).retryable, 1);
    assert.equal(await stateOf(unexpired), "PURGE_PENDING");
    assert.equal(await auditCount(unexpired), 0);
    assert.equal(await quotaCount(unexpired), 1);
    failAudit = false;
    assert.equal((await cleanup.run(await cmd(actorA))).purged, 1);
    await expectPurged(unexpired);

    stage = "BOUNDED_AND_CONCURRENT_IDEMPOTENCY";
    const c1 = await seedTarget(actorA);
    const c2 = await seedTarget(actorA);
    fakeNow += 31 * 60_000;
    const bounded = await cleanup.run(await cmd(actorA, { batchLimit: 1 }));
    assert.deepEqual(bounded, { attempted: 1, purged: 1, alreadyPurged: 0, retryable: 0, hasMore: true });
    // Both discovery transactions finish before either starts its purge saga.
    let arrivals = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    afterDiscovery = async () => { if (++arrivals === 2) release(); await barrier; };
    concurrentProbe = true;
    const results = await Promise.all([cleanup.run(await cmd(actorA)), cleanup.run(await cmd(actorA))]);
    concurrentProbe = false;
    afterDiscovery = undefined;
    assert.equal(results.reduce((n, r) => n + r.purged, 0), 1);
    assert.equal(results.reduce((n, r) => n + r.alreadyPurged, 0), 1);
    assert.equal(results.reduce((n, r) => n + r.retryable, 0), 0);
    await expectPurged(c1); await expectPurged(c2);
    assert.equal((await cleanup.run(await cmd(actorA))).attempted, 0);
    assert.deepEqual(await purge.purge({ ...await cmd(actorA), binding: c1.binding, storageRef: c1.storageRef, reason: "TTL_EXPIRED" }), { kind: "ALREADY_PURGED" });
    await expectPurged(c1);
    assert.deepEqual((await inspector.query("SELECT * FROM imaging_packages WHERE package_id=$1", [fixture.packageId])).rows[0], beforePackage);
    const reset = await pool.query("SELECT NULLIF(current_setting('mediq.tenant_id',true),'') AS tenant");
    assert.equal(reset.rows[0].tenant, null);
    assert.equal(activeTransactions, 0);
  } catch (error) {
    const code = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : error?.code === "ERR_ASSERTION" ? "ASSERTION" : "UNAVAILABLE";
    throw new Error(`EXPIRY_STAGE=${stage} code=${code} details=${aggregateDiagnostic}:${[...diagnosticCategories].sort().join("_") || "NONE"}`);
  } finally {
    beforePhysical = undefined;
    afterDiscovery = undefined;
    failAudit = false;
    // Only this test's fresh UUID actor rows and mkdtemp ciphertext directory.
    if (activeActors.length) await inspector.query("UPDATE actors SET status='ACTIVE' WHERE actor_id=ANY($1::uuid[])", [activeActors]).catch(() => {});
    for (const target of targets) {
      await store?.purgeByReference({ storageRef: target.storageRef, binding: {
        tenantId: target.actor.tenant, exchangeSessionId: fixture.sessionId, packageId: fixture.packageId, purpose: "PACS_IMPORT",
      } }).catch(() => {});
    }
    if (root) {
      assert.equal(dirname(root), tmpdir());
      assert.ok(basename(root).startsWith("mediq-expiry-"));
      await rm(root, { recursive: true, force: true });
      await assert.rejects(stat(root), { code: "ENOENT" });
    }
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await Promise.all([pool.end(), inspector.end()]);
  }
});
