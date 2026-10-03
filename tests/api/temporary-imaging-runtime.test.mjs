import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { TemporaryImagingStorageModule, TEMPORARY_IMAGING_ROOT } from '../../services/api/dist/imaging-storage/temporary-imaging-storage.module.js';
import { EphemeralEncryptedTemporaryImagingStore } from '../../services/api/dist/imaging-storage/application/ephemeral-encrypted-temporary-imaging-store.js';
import { TemporaryPayloadExpiryRunner } from '../../services/api/dist/imaging-storage/application/temporary-payload-expiry.runner.js';
import { TemporaryPayloadMaintenanceService } from '../../services/api/dist/imaging-storage/application/temporary-payload-maintenance.service.js';
import { RemoteJwksOidcTokenVerifier } from '../../services/api/dist/authentication/oidc-jwt.verifier.js';
import { OIDC_TOKEN_VERIFIER } from '../../services/api/dist/authentication/authentication.tokens.js';
import { APP_CONFIG } from '../../services/api/dist/health/health.tokens.js';
import { RuntimeDatabaseService } from '../../services/api/dist/database/runtime-database.service.js';
import { ActorTenantContextService } from '../../services/api/dist/identity/application/actor-tenant-context.service.js';

const id = n => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const issuer = 'https://synthetic-runtime.test';
const audience = 'mediq-runtime-maintenance';
const principal = Object.freeze({ issuer, subject: 'TEST-SERVICE' });
const result = Object.freeze({ attempted: 0, purged: 0, alreadyPurged: 0, retryable: 0, hasMore: false });
const input = token => ({ token, tenantCandidate: id(1), correlationId: id(2), batchLimit: 2 });
const roots = [], modules = [];
let keyPair, jwk;
beforeAll(async () => {
  keyPair = await generateKeyPair('RS256');
  jwk = { ...await exportJWK(keyPair.publicKey), kid: 'TEST-RUNTIME', alg: 'RS256', use: 'sig' };
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const moduleRef of modules.splice(0)) await moduleRef.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function token(overrides = {}) {
  return new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'TEST-RUNTIME', typ: 'at+jwt' })
    .setIssuer(overrides.issuer ?? issuer).setAudience(overrides.audience ?? audience)
    .setSubject('TEST-SERVICE').setIssuedAt().setExpirationTime(overrides.expiry ?? '2m').sign(keyPair.privateKey);
}
function verifier() {
  vi.stubGlobal('fetch', vi.fn(async url => {
    expect(String(url)).toBe(`${issuer}/jwks`);
    return Response.json({ keys: [jwk] });
  }));
  return new RemoteJwksOidcTokenVerifier({ issuer, audience, jwksUri: `${issuer}/jwks` });
}
async function root() {
  const directory = await mkdtemp(join(tmpdir(), 'mediq-runtime-storage-'));
  roots.push(directory); return directory;
}
async function compile(directory, context = { run: vi.fn() }, auth = null) {
  const moduleRef = await Test.createTestingModule({ imports: [TemporaryImagingStorageModule] })
    .overrideProvider(APP_CONFIG).useValue({ oidcAuthentication: null })
    .overrideProvider(RuntimeDatabaseService).useValue({})
    .overrideProvider(ActorTenantContextService).useValue(context)
    .overrideProvider(OIDC_TOKEN_VERIFIER).useValue(auth)
    .overrideProvider(TEMPORARY_IMAGING_ROOT).useValue(directory).compile();
  modules.push(moduleRef); return moduleRef;
}

describe('DEC-018 authenticated one-shot maintenance', () => {
  it('verifies a real signed token and sends only verified principal and copied selectors to cleanup', async () => {
    const runner = { run: vi.fn(async () => ({ ...result, token: 'TEST-MUST-NOT-RETURN' })) };
    const maintenance = new TemporaryPayloadMaintenanceService(verifier(), runner);
    expect(await maintenance.run(input(await token()))).toEqual(result);
    expect(runner.run).toHaveBeenCalledWith({ principal, tenantCandidate: id(1), correlationId: id(2), batchLimit: 2 });
  });
  it.each(['wrong-issuer', 'wrong-audience', 'expired', 'invalid-signature'])('denies %s before cleanup', async variant => {
    let bearer = await token(variant === 'wrong-issuer' ? { issuer: 'https://synthetic-other.test' }
      : variant === 'wrong-audience' ? { audience: 'TEST-OTHER' }
      : variant === 'expired' ? { expiry: 1 } : {});
    if (variant === 'invalid-signature') {
      const parts = bearer.split('.');
      parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
      bearer = parts.join('.');
    }
    const runner = { run: vi.fn() };
    await expect(new TemporaryPayloadMaintenanceService(verifier(), runner).run(input(bearer)))
      .rejects.toMatchObject({ message: 'TEMPORARY_PAYLOAD_MAINTENANCE_UNAVAILABLE', phase: 'AUTHENTICATION' });
    expect(runner.run).not.toHaveBeenCalled();
  });
  it('missing configured verifier fails closed without cleanup', async () => {
    const runner = { run: vi.fn() };
    await expect(new TemporaryPayloadMaintenanceService(null, runner).run(input('TEST-TOKEN')))
      .rejects.toMatchObject({ phase: 'AUTHENTICATION' });
    expect(runner.run).not.toHaveBeenCalled();
  });
  it('rejects authority fields, accessors, malformed selectors/limits and oversized UTF-8 tokens before verification', async () => {
    const auth = { verify: vi.fn() }, runner = { run: vi.fn() };
    const maintenance = new TemporaryPayloadMaintenanceService(auth, runner);
    let accessed = false;
    const getter = { ...input('TEST-TOKEN'), get tenantCandidate() { accessed = true; return id(1); } };
    for (const candidate of [null, [], { ...input('TEST-TOKEN'), principal }, getter,
      { ...input('TEST-TOKEN'), token: '' }, input('가'.repeat(3000)),
      { ...input('TEST-TOKEN'), tenantCandidate: 'TEST-NOT-UUID' },
      { ...input('TEST-TOKEN'), correlationId: 'TEST-NOT-UUID' },
      ...[0,101,1.5,'2',NaN].map(batchLimit => ({ ...input('TEST-TOKEN'), batchLimit })),
      { ...input('TEST-TOKEN'), [Symbol('TEST-AUTHORITY')]: true }]) {
      await expect(maintenance.run(candidate)).rejects.toMatchObject({ phase: 'VALIDATION' });
    }
    expect(accessed).toBe(false); expect(auth.verify).not.toHaveBeenCalled(); expect(runner.run).not.toHaveBeenCalled();
  });
  it('snapshots caller selectors before asynchronous verification', async () => {
    let finish;
    const runner = { run: vi.fn(async () => result) };
    const command = input('TEST-TOKEN');
    const maintenance = new TemporaryPayloadMaintenanceService({ verify: () => new Promise(resolve => { finish = resolve; }) }, runner);
    const running = maintenance.run(command);
    command.tenantCandidate = id(99); command.correlationId = id(98); command.batchLimit = 100;
    finish(principal); await running;
    expect(runner.run).toHaveBeenCalledWith({ principal, tenantCandidate: id(1), correlationId: id(2), batchLimit: 2 });
  });
  it('sanitizes dependencies and rejects contradictory aggregate results', async () => {
    for (const value of [{ ...result, attempted: 1 }, { ...result, purged: -1 }, { ...result, hasMore: 'TEST-RAW' },
      { attempted: 3, purged: 3, alreadyPurged: 0, retryable: 0, hasMore: false }]) {
      await expect(new TemporaryPayloadMaintenanceService({ verify: async () => principal }, { run: async () => value }).run(input('TEST-TOKEN')))
        .rejects.toMatchObject({ message: 'TEMPORARY_PAYLOAD_MAINTENANCE_UNAVAILABLE', phase: 'CLEANUP' });
    }
    const maintenance = new TemporaryPayloadMaintenanceService({ verify: async () => { throw new Error('TEST-RAW-TOKEN'); } }, { run: vi.fn() });
    await expect(maintenance.run(input('TEST-TOKEN'))).rejects.toMatchObject({ message: 'TEMPORARY_PAYLOAD_MAINTENANCE_UNAVAILABLE' });
  });
  it.each(['USER', 'hospital-service', 'inactive'])('successful token verification does not bypass %s registry denial', async variant => {
    const query = vi.fn(), purgeByReference = vi.fn();
    const context = { run: vi.fn(async (_p, tenantId, work) => {
      if (variant === 'inactive') throw new Error('TEST-INACTIVE');
      return work({ ...principal, actorId: id(3), tenantId,
        actorType: variant === 'USER' ? 'USER' : 'SERVICE', hospitalId: variant === 'hospital-service' ? id(4) : null }, { query });
    }) };
    const maintenance = new TemporaryPayloadMaintenanceService(verifier(), new TemporaryPayloadExpiryRunner(context, { purgeByReference }));
    await expect(maintenance.run(input(await token()))).rejects.toMatchObject({ phase: 'CLEANUP' });
    expect(query).not.toHaveBeenCalled(); expect(purgeByReference).not.toHaveBeenCalled();
  });
});

describe('DEC-018 real Nest/private filesystem composition', () => {
  it('signed maintenance purges the original live store through the composed SERVICE runner (modeled SQL)', async () => {
    const directory = join(await root(), 'ciphertext');
    let open = false, state = 'AVAILABLE', storageRef, audits = 0;
    const context = { run: async (p, tenantId, work) => {
      expect(p).toEqual(principal); expect(tenantId).toBe(id(1));
      open = true;
      try {
        return await work({ ...p, actorId: id(6), tenantId, actorType: 'SERVICE', hospitalId: null }, {
          query: async sql => {
            if (sql.startsWith('SELECT candidate.*')) return { rows: state === 'PURGED' ? [] : [{
              operation_id: id(7), tenant_id: id(1), exchange_session_id: id(3), package_id: id(4),
              study_ref_id: id(5), source_hospital_id: id(8), temporary_storage_ref: storageRef,
            }] };
            if (sql.includes('SET temporary_payload_state = CASE')) { state = 'PURGE_PENDING'; return { rowCount: 1 }; }
            if (sql.includes("SET temporary_payload_state = 'PURGED'")) { state = 'PURGED'; return { rowCount: 1 }; }
            if (sql.includes('release_temporary_payload_quota')) return { rowCount: 1 };
            if (sql.includes('INSERT INTO audit_events')) { audits++; return { rowCount: 1 }; }
            throw new Error('TEST-UNEXPECTED-SQL');
          },
        });
      } finally { open = false; }
    } };
    const moduleRef = await compile(directory, context, verifier());
    const store = moduleRef.get(EphemeralEncryptedTemporaryImagingStore);
    const binding = { tenantId: id(1), exchangeSessionId: id(3), packageId: id(4), purpose: 'PACS_IMPORT' };
    ({ storageRef } = await store.beginPackage(binding));
    const bytes = Buffer.from('TEST-SYNTHETIC-INSTANCE');
    async function* source() { yield bytes; }
    const receipt = await store.stageInstance({ storageRef, packageBinding: binding,
      instanceBinding: { studyRefId: id(5), seriesInstanceUid: '2.25.11', sopInstanceUid: '2.25.12' }, source: source() });
    await store.sealPackage({ storageRef, binding });
    const original = store.purgeByReference.bind(store);
    const physical = vi.spyOn(store, 'purgeByReference').mockImplementation(async command => {
      expect(open).toBe(false); expect(state).toBe('PURGE_PENDING'); return original(command);
    });
    expect(await moduleRef.get(TemporaryPayloadMaintenanceService).run(input(await token())))
      .toEqual({ attempted: 1, purged: 1, alreadyPurged: 0, retryable: 0, hasMore: false });
    expect(physical).toHaveBeenCalledOnce(); expect(audits).toBe(1); expect(await readdir(directory)).toEqual([]);
    await expect(store.consumeInstance({ storageRef, objectRef: receipt.objectRef, packageBinding: binding,
      instanceBinding: { studyRefId: id(5), seriesInstanceUid: '2.25.11', sopInstanceUid: '2.25.12' },
      expectedByteLength: receipt.byteLength, expectedSha256: receipt.sha256 }, async () => 'VERIFIED', async () => {}))
      .rejects.toMatchObject({ message: 'TEMPORARY_IMAGING_STORAGE_UNAVAILABLE' });
  });
  it('awaits initialization and keeps missing-OIDC maintenance away from DB/files', async () => {
    const directory = join(await root(), 'ciphertext'), context = { run: vi.fn() };
    const moduleRef = await compile(directory, context);
    expect((await stat(directory)).isDirectory()).toBe(true);
    await expect(moduleRef.get(TemporaryPayloadMaintenanceService).run(input('TEST-TOKEN'))).rejects.toMatchObject({ phase: 'AUTHENTICATION' });
    expect(context.run).not.toHaveBeenCalled(); expect(await readdir(directory)).toEqual([]);
  });
  it.each(['file', 'symlink'])('bootstrap rejects a %s root with a fixed storage error', async variant => {
    const directory = await root(), invalid = join(directory, 'invalid');
    if (variant === 'file') await writeFile(invalid, 'TEST-NOT-DIRECTORY');
    else { const target = join(directory, 'target'); await mkdir(target); await symlink(target, invalid, 'junction'); }
    await expect(compile(invalid)).rejects.toMatchObject({ message: 'TEMPORARY_IMAGING_STORAGE_UNAVAILABLE' });
  });
  it('restart initialization retains ciphertext and blocks new staging until authorized purge-only recovery', async () => {
    const directory = join(await root(), 'ciphertext');
    const first = await compile(directory), store = first.get(EphemeralEncryptedTemporaryImagingStore);
    const binding = { tenantId: id(1), exchangeSessionId: id(3), packageId: id(4), purpose: 'PACS_IMPORT' };
    const handle = await store.beginPackage(binding);
    const bytes = Buffer.from('TEST-SYNTHETIC-INSTANCE');
    async function* source() { yield bytes; }
    const receipt = await store.stageInstance({ storageRef: handle.storageRef, packageBinding: binding,
      instanceBinding: { studyRefId: id(5), seriesInstanceUid: '2.25.11', sopInstanceUid: '2.25.12' }, source: source() });
    const ciphertextPath = join(directory, handle.storageRef, `${receipt.objectRef}.enc`);
    const encrypted = await readFile(ciphertextPath); expect(encrypted).not.toEqual(bytes);
    await first.close(); modules.splice(modules.indexOf(first), 1);
    const second = await compile(directory), restarted = second.get(EphemeralEncryptedTemporaryImagingStore);
    expect(await readFile(ciphertextPath)).toEqual(encrypted);
    await expect(restarted.beginPackage(binding)).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
    // This direct primitive call is isolated fixture recovery, not SERVICE/RLS acceptance.
    await restarted.purgeByReference({ storageRef: handle.storageRef, binding });
    expect(await readdir(directory)).toEqual([]);
  });
});
