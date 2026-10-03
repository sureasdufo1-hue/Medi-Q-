// Disjoint test-only graphs, not permission to dispatch or full Preflight evidence.
import { pacsTransferOperationDigest } from '../../services/api/dist/pacs/domain/pacs-transfer-operation-digest.js';
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const dispatchedReadIds = Object.freeze({
  tenant: id('02', 2), otherTenant: id('02', 1), actor: id('0a', 1), patient: id('15', 1),
  source: id('04', 1), destination: id('04', 2),
  studyUid: '2.25.139413224574575433810421680499794275977',
});
export const dispatchedReadCases = Object.freeze([
  'valid', 'wrong_digest', 'wrong_count', 'no_provenance', 'wrong_provenance',
  'missing_preflight_audit', 'missing_dispatch_audit', 'not_dispatched', 'cross_tenant',
  'revoked_between', 'withdrawn_between', 'state_changed_between', 'commit_ack_lost',
  'read_audit_failure', 'consumer_failure',
  'wrong_actor', 'future_dispatch',
].map((name, index) => {
  const n = 2001 + index;
  const good = name === 'valid', between = ['revoked_between', 'withdrawn_between', 'state_changed_between', 'commit_ack_lost'].includes(name);
  const scopeDenial = ['cross_tenant', 'not_dispatched'].includes(name), consumerFailure = name === 'consumer_failure';
  const queryMatches = good ? 6 : between || consumerFailure || name === 'read_audit_failure' ? consumerFailure ? 2 : 1 : 0;
  return Object.freeze({ name,
    sessionId: id('16', n), sessionKey: id('1c', n), packageId: id('17', n), studyRefId: id('18', n),
    consentId: id('19', n), consentActionId: id('19', n + 100), grantId: id('1a', n),
    grantKey: id('1c', n + 100), grantScopeId: id('1a', n + 100), operationId: id('1b', n),
    operationKey: id('1c', n + 200), correlationId: id('1d', n), revokeCorrelationId: id('1d', n + 100),
    operationActorId: name === 'wrong_actor' ? id('0a', 3) : dispatchedReadIds.actor,
    state: name === 'state_changed_between' ? 'VERIFYING' : name === 'not_dispatched' ? 'PREFLIGHT_PASSED' : 'STOW_STARTED',
    version: name === 'state_changed_between' ? 3 : name === 'not_dispatched' ? 1 : 2,
    count: name === 'wrong_count' ? 2 : 3,
    claimQueries: good ? 6 : scopeDenial ? 0 : consumerFailure ? 2 : 1,
    claimMatches: queryMatches,
    beforeDecrypt: good ? 3 : between || consumerFailure ? 1 : 0,
    beforeDelivery: good ? 3 : consumerFailure ? 1 : 0,
    readFailures: name === 'cross_tenant' ? 0 : 1,
  });
}));
export function dispatchedReadDigest(scenario) {
  return scenario.name === 'wrong_digest' ? '1'.repeat(64) : pacsTransferOperationDigest({
    tenantId: dispatchedReadIds.tenant, actorId: dispatchedReadIds.actor,
    exchangeSessionId: scenario.sessionId, studyRefId: scenario.studyRefId,
    consentId: scenario.consentId, grantId: scenario.grantId, action: 'PACS_IMPORT',
  });
}
export function dispatchedExpectedAudits(scenario) {
  const counts = {
    'PACS_SOURCE_CAPTURE_STARTED|ALLOW|': 1, 'PACS_SOURCE_CAPTURED|SUCCESS|': 1,
    'PACS_TEMPORARY_OBJECT_PURGED|SUCCESS|EXPLICIT_CLOSE': 1,
  };
  if (scenario.name !== 'missing_preflight_audit') counts['PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|PREFLIGHT_PASSED'] = 1;
  if (!['missing_dispatch_audit', 'not_dispatched'].includes(scenario.name)) counts['PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|STOW_STARTED'] = 1;
  if (scenario.name === 'state_changed_between') counts['PACS_TRANSFER_OPERATION_STATE_CHANGED|SUCCESS|VERIFYING'] = 1;
  if (scenario.beforeDecrypt) counts['PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DECRYPT'] = scenario.beforeDecrypt;
  if (scenario.beforeDelivery) counts['PACS_TEMPORARY_READ_AUTHORIZED|ALLOW|BEFORE_DELIVERY'] = scenario.beforeDelivery;
  if (scenario.readFailures) counts['PACS_TEMPORARY_READ_FAILED|FAILURE|TEMPORARY_READ_FAILED'] = scenario.readFailures;
  return counts;
}
