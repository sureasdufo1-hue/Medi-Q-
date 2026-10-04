// Disjoint synthetic test graphs; simulated transitions are NOT full Preflight/STOW evidence.
import { dispatchedReadIds as ids, dispatchedReadDigest } from './dispatched-source-read-fixture.mjs';
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const destinationFixtureKinds = Object.freeze(['exact', 'tampered', 'missing', 'extra']);
export const destinationVerificationCases = Object.freeze([
  'valid','wrong_digest','wrong_count','no_provenance','missing_preflight_audit','missing_dispatch_audit',
  'missing_verifying_audit','cross_tenant','revoked_between','withdrawn_between','commit_ack_lost',
  'verify_audit_failure','wrong_actor','tampered','missing','extra',
].map((name, index) => {
  const n = 3001 + index;
  return Object.freeze({ name, fixtureKind: destinationFixtureKinds.includes(name) ? name : 'exact',
    sessionId: id('16',n), sessionKey: id('1c',n), packageId: id('17',n), studyRefId: id('18',n),
    consentId: id('19',n), consentActionId: id('19',n+100), grantId: id('1a',n), grantKey: id('1c',n+100),
    grantScopeId: id('1a',n+100), operationId: id('1b',n), operationKey: id('1c',n+200),
    correlationId: id('1d',n), revokeCorrelationId: id('1d',n+100),
    operationActorId: name === 'wrong_actor' ? id('0a',3) : ids.actor,
    count: name === 'wrong_count' ? 2 : 3, state: 'VERIFYING', version: 3,
    identityCalls: ['valid','revoked_between','withdrawn_between','tampered','missing','extra'].includes(name) ? name === 'valid' ? 2 : 1 : 0,
    byteCalls: ['valid','revoked_between','withdrawn_between','tampered'].includes(name) ? name === 'valid' ? 3 : 1 : 0,
  });
}));
export const destinationVerificationDigest = dispatchedReadDigest;
export function destinationExpectedAudits(item) {
  const counts = { 'PACS_SOURCE_CAPTURE_STARTED|ALLOW|':1, 'PACS_SOURCE_CAPTURED|SUCCESS|':1,
    'PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|EXPLICIT_CLOSE':1 };
  for (const state of ['PREFLIGHT_PASSED','STOW_STARTED','VERIFYING']) {
    if (item.name !== `missing_${state === 'PREFLIGHT_PASSED' ? 'preflight' : state === 'STOW_STARTED' ? 'dispatch' : 'verifying'}_audit`)
      counts[`PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|${state}`] = 1;
  }
  if (item.name === 'valid') {
    counts['PACS_DESTINATION_INTEGRITY_RECORDED|SUCCESS|DESTINATION_MATCH'] = 1;
    for (const [phase,n] of Object.entries({ BEFORE_IDENTITY:2,AFTER_IDENTITY:2,BEFORE_BYTES:3,AFTER_BYTES:3,FINAL:1 }))
      counts[`PACS_DESTINATION_VERIFY_AUTHORIZED|ALLOW|${phase}`] = n;
  } else {
    if (item.identityCalls || item.name === 'commit_ack_lost') counts['PACS_DESTINATION_VERIFY_AUTHORIZED|ALLOW|BEFORE_IDENTITY'] = 1;
    if (item.byteCalls) { counts['PACS_DESTINATION_VERIFY_AUTHORIZED|ALLOW|AFTER_IDENTITY'] = 1;
      counts['PACS_DESTINATION_VERIFY_AUTHORIZED|ALLOW|BEFORE_BYTES'] = 1; }
    if (item.name !== 'cross_tenant') counts['PACS_DESTINATION_VERIFY_FAILED|FAILURE|DESTINATION_VERIFY_FAILED'] = 1;
  }
  return counts;
}
