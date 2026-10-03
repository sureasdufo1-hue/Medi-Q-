import pg from "pg";
import { allSourceLifecycleCases as temporaryCaptureLifecycleCases } from "../tests/fixtures/temporary-capture-lifecycle-fixture.mjs";

const { Pool } = pg;
const databaseUrl = process.env.MEDIQ_TEST_FIXTURE_DATABASE_URL;
if (!databaseUrl) throw new Error("INT001_FIXTURE_DATABASE_URL_REQUIRED");

const ids = Object.freeze({
  organizationA: "01000000-0000-4000-8000-000000000001",
  organizationB: "01000000-0000-4000-8000-000000000002",
  tenantA: "02000000-0000-4000-8000-000000000001",
  tenantB: "02000000-0000-4000-8000-000000000002",
  hospitalA: "04000000-0000-4000-8000-000000000001",
  hospitalB: "04000000-0000-4000-8000-000000000002",
  actorB: "0a000000-0000-4000-8000-000000000001",
  patient: "15000000-0000-4000-8000-000000000001",
  mapping: "15000000-0000-4000-8000-000000000002",
  session: "16000000-0000-4000-8000-000000000001",
  sessionOther: "16000000-0000-4000-8000-000000000011",
  sessionSourceMismatch: "16000000-0000-4000-8000-000000000012",
  sessionInFlightRevocation: "16000000-0000-4000-8000-000000000021",
  imagingPackage: "17000000-0000-4000-8000-000000000001",
  imagingPackageOther: "17000000-0000-4000-8000-000000000011",
  imagingPackageSourceMismatch: "17000000-0000-4000-8000-000000000012",
  study: "18000000-0000-4000-8000-000000000001",
  studyOther: "18000000-0000-4000-8000-000000000011",
  studySourceMismatch: "18000000-0000-4000-8000-000000000012",
  studyMissingCount: "18000000-0000-4000-8000-000000000013",
  studyInFlightRevocation: "18000000-0000-4000-8000-000000000021",
  consent: "19000000-0000-4000-8000-000000000001",
  consentInFlightRevocation: "19000000-0000-4000-8000-000000000031",
  grant: "1a000000-0000-4000-8000-000000000001",
  grantInFlightRevocation: "1a000000-0000-4000-8000-000000000031",
  grantInFlightRevocationScope: "1a000000-0000-4000-8000-000000000032",
  packageInFlightRevocation: "17000000-0000-4000-8000-000000000021",
  operation: "1b000000-0000-4000-8000-000000000001",
  operationBindingMismatch: "1b000000-0000-4000-8000-000000000011",
  operationSourceMismatch: "1b000000-0000-4000-8000-000000000012",
  operationNotCreated: "1b000000-0000-4000-8000-000000000013",
  operationMissingCount: "1b000000-0000-4000-8000-000000000014",
  operationInFlightRevocation: "1b000000-0000-4000-8000-000000000015",
  cap012StartSession: "16000000-0000-4000-8000-000000000031",
  cap012EvidenceSession: "16000000-0000-4000-8000-000000000032",
  cap012SuccessAuditSession: "16000000-0000-4000-8000-000000000033",
  cap012StartPackage: "17000000-0000-4000-8000-000000000031",
  cap012EvidencePackage: "17000000-0000-4000-8000-000000000032",
  cap012SuccessAuditPackage: "17000000-0000-4000-8000-000000000033",
  cap012StartStudy: "18000000-0000-4000-8000-000000000031",
  cap012EvidenceStudy: "18000000-0000-4000-8000-000000000032",
  cap012SuccessAuditStudy: "18000000-0000-4000-8000-000000000033",
  cap012StartConsent: "19000000-0000-4000-8000-000000000041",
  cap012EvidenceConsent: "19000000-0000-4000-8000-000000000042",
  cap012SuccessAuditConsent: "19000000-0000-4000-8000-000000000043",
  cap012StartGrant: "1a000000-0000-4000-8000-000000000041",
  cap012EvidenceGrant: "1a000000-0000-4000-8000-000000000042",
  cap012SuccessAuditGrant: "1a000000-0000-4000-8000-000000000043",
  cap012StartOperation: "1b000000-0000-4000-8000-000000000021",
  cap012EvidenceOperation: "1b000000-0000-4000-8000-000000000022",
  cap012SuccessAuditOperation: "1b000000-0000-4000-8000-000000000023",
  cap012StartCorrelation: "1d000000-0000-4000-8000-000000000029",
  cap012EvidenceCorrelation: "1d000000-0000-4000-8000-000000000030",
  cap012SuccessAuditCorrelation: "1d000000-0000-4000-8000-000000000031",
});
const cap012Cases = Object.freeze([
  Object.freeze({
    name: "start_audit",
    sessionId: ids.cap012StartSession,
    sessionKey: "1c000000-0000-4000-8000-000000000031",
    packageId: ids.cap012StartPackage,
    studyRefId: ids.cap012StartStudy,
    consentId: ids.cap012StartConsent,
    consentActionId: "19000000-0000-4000-8000-000000000051",
    grantId: ids.cap012StartGrant,
    grantKey: "1c000000-0000-4000-8000-000000000041",
    grantScopeId: "1c000000-0000-4000-8000-000000000051",
    operationId: ids.cap012StartOperation,
    operationKey: "1c000000-0000-4000-8000-000000000061",
    correlationId: ids.cap012StartCorrelation,
  }),
  Object.freeze({
    name: "evidence_insert",
    sessionId: ids.cap012EvidenceSession,
    sessionKey: "1c000000-0000-4000-8000-000000000032",
    packageId: ids.cap012EvidencePackage,
    studyRefId: ids.cap012EvidenceStudy,
    consentId: ids.cap012EvidenceConsent,
    consentActionId: "19000000-0000-4000-8000-000000000052",
    grantId: ids.cap012EvidenceGrant,
    grantKey: "1c000000-0000-4000-8000-000000000042",
    grantScopeId: "1c000000-0000-4000-8000-000000000052",
    operationId: ids.cap012EvidenceOperation,
    operationKey: "1c000000-0000-4000-8000-000000000062",
    correlationId: ids.cap012EvidenceCorrelation,
  }),
  Object.freeze({
    name: "success_audit",
    sessionId: ids.cap012SuccessAuditSession,
    sessionKey: "1c000000-0000-4000-8000-000000000033",
    packageId: ids.cap012SuccessAuditPackage,
    studyRefId: ids.cap012SuccessAuditStudy,
    consentId: ids.cap012SuccessAuditConsent,
    consentActionId: "19000000-0000-4000-8000-000000000053",
    grantId: ids.cap012SuccessAuditGrant,
    grantKey: "1c000000-0000-4000-8000-000000000043",
    grantScopeId: "1c000000-0000-4000-8000-000000000053",
    operationId: ids.cap012SuccessAuditOperation,
    operationKey: "1c000000-0000-4000-8000-000000000063",
    correlationId: ids.cap012SuccessAuditCorrelation,
  }),
]);

const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO organizations
      (organization_id, organization_code, name, organization_type, status, created_at, updated_at)
     VALUES
      ($1, 'INT001-ORG-A', 'Synthetic INT001 Hospital A', 'HOSPITAL', 'ACTIVE', now(), now()),
      ($2, 'INT001-ORG-B', 'Synthetic INT001 Hospital B', 'HOSPITAL', 'ACTIVE', now(), now())`,
    [ids.organizationA, ids.organizationB],
  );
  await client.query(
    `INSERT INTO tenants
      (tenant_id, organization_id, tenant_code, name, status, created_at, updated_at)
     VALUES
      ($1, $3, 'INT001-TENANT-A', 'Synthetic INT001 Tenant A', 'ACTIVE', now(), now()),
      ($2, $4, 'INT001-TENANT-B', 'Synthetic INT001 Tenant B', 'ACTIVE', now(), now())`,
    [ids.tenantA, ids.tenantB, ids.organizationA, ids.organizationB],
  );
  await client.query(
    `INSERT INTO hospitals
      (hospital_id, tenant_id, organization_id, hospital_code, name, environment_type, status, created_at, updated_at)
     VALUES
      ($1, $3, $5, 'TEST-HOSPITAL-A', 'Synthetic Hospital A', 'TEST', 'ACTIVE', now(), now()),
      ($2, $4, $6, 'TEST-HOSPITAL-B', 'Synthetic Hospital B', 'TEST', 'ACTIVE', now(), now())`,
    [ids.hospitalA, ids.hospitalB, ids.tenantA, ids.tenantB, ids.organizationA, ids.organizationB],
  );
  await client.query(
    `INSERT INTO actors
      (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'USER', 'synthetic-int001-source-capture-actor',
             'Synthetic Destination Clinician', 'ACTIVE', now(), now())`,
    [ids.actorB, ids.tenantB, ids.hospitalB],
  );
  await client.query(
    `INSERT INTO actors
      (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
     VALUES ('0a000000-0000-4000-8000-000000000002', $1, $2, 'USER',
             'synthetic-int001-cross-tenant-actor', 'Synthetic Cross-Tenant Clinician',
             'ACTIVE', now(), now())`,
    [ids.tenantA, ids.hospitalA],
  );
  await client.query(
    `INSERT INTO patient_refs
      (patient_ref_id, patient_ref_code, status, created_at, updated_at)
     VALUES ($1, 'MQ-TEST-INT001-SYNTHETIC-PATIENT', 'ACTIVE', now(), now())`,
    [ids.patient],
  );
  await client.query(
    `INSERT INTO patient_mappings
      (mapping_id, patient_ref_id, hospital_id, local_patient_id, status, validated_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'TEST-PATIENT-007', 'VALID', now(), now(), now())`,
    [ids.mapping, ids.patient, ids.hospitalB],
  );
  await client.query(
    `INSERT INTO exchange_sessions
      (session_id, patient_ref_id, source_hospital_id, destination_hospital_id,
       requester_actor_id, purpose, state, created_at, updated_at, expires_at, completed_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'Synthetic CAP-014 source capture', 'ACTIVE',
             now(), now(), now() + interval '1 hour', NULL, $6)`,
    [ids.session, ids.patient, ids.hospitalA, ids.hospitalB, ids.actorB, "16000000-0000-4000-8000-000000000002"],
  );
  await client.query(
    `INSERT INTO exchange_sessions
      (session_id, patient_ref_id, source_hospital_id, destination_hospital_id,
       requester_actor_id, purpose, state, created_at, updated_at, expires_at, completed_at, idempotency_key)
     VALUES
       ($1, $2, $3, $4, $5, 'Synthetic CAP-003 alternate valid graph', 'ACTIVE', now(), now(), now() + interval '1 hour', NULL, $6),
       ($7, $2, $4, $3, $5, 'Synthetic CAP-003 source mismatch graph', 'ACTIVE', now(), now(), now() + interval '1 hour', NULL, $8)`,
    [ids.sessionOther, ids.patient, ids.hospitalA, ids.hospitalB, ids.actorB,
      "16000000-0000-4000-8000-000000000013", ids.sessionSourceMismatch,
      "16000000-0000-4000-8000-000000000014"],
  );
  await client.query(
    `INSERT INTO exchange_sessions
      (session_id, patient_ref_id, source_hospital_id, destination_hospital_id,
       requester_actor_id, purpose, state, created_at, updated_at, expires_at, completed_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'Synthetic CAP-009 in-flight Grant revocation', 'ACTIVE',
             now(), now(), now() + interval '1 hour', NULL, $6)`,
    [ids.sessionInFlightRevocation, ids.patient, ids.hospitalA, ids.hospitalB, ids.actorB,
      "16000000-0000-4000-8000-000000000022"],
  );
  await client.query(
    `INSERT INTO imaging_packages
      (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
       state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
     VALUES ($1, $2, $3, $4, 'AVAILABLE', NULL, 2, now(), now(), NULL, NULL)`,
    [ids.imagingPackage, ids.session, ids.patient, ids.hospitalA],
  );
  await client.query(
    `INSERT INTO imaging_packages
      (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
       state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
     VALUES
       ($1, $2, $3, $4, 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL),
       ($5, $6, $3, $7, 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL)`,
    [ids.imagingPackageOther, ids.sessionOther, ids.patient, ids.hospitalA,
      ids.imagingPackageSourceMismatch, ids.sessionSourceMismatch, ids.hospitalB],
  );
  await client.query(
    `INSERT INTO imaging_packages
      (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
       state, storage_ref, study_count, created_at, updated_at, retention_expires_at, deleted_at)
     VALUES ($1, $2, $3, $4, 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL)`,
    [ids.packageInFlightRevocation, ids.sessionInFlightRevocation, ids.patient, ids.hospitalA],
  );
  await client.query(
    `INSERT INTO study_references
      (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
     VALUES ($1, $2, $3, $4, 'CT', 1, 3, now())`,
    [ids.study, ids.imagingPackage, ids.hospitalA, "2.25.139413224574575433810421680499794275977"],
  );
  await client.query(
    `INSERT INTO study_references
      (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
     VALUES
       ($1, $2, $3, '2.25.139413224574575433810421680499794275978', 'CT', 1, 3, now()),
       ($4, $5, $6, '2.25.139413224574575433810421680499794275979', 'CT', 1, 3, now())`,
    [ids.studyOther, ids.imagingPackageOther, ids.hospitalA,
      ids.studySourceMismatch, ids.imagingPackageSourceMismatch, ids.hospitalB],
  );
  await client.query(
    `INSERT INTO study_references
      (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
     VALUES ($1, $2, $3, '2.25.139413224574575433810421680499794275977', 'CT', 1, 3, now())`,
    [ids.studyInFlightRevocation, ids.packageInFlightRevocation, ids.hospitalA],
  );
  await client.query(
    `INSERT INTO study_references
      (study_ref_id, package_id, source_hospital_id, study_instance_uid, modality, series_count, instance_count, created_at)
     VALUES ($1, $2, $3, '2.25.139413224574575433810421680499794275980', 'CT', 1, NULL, now())`,
    [ids.studyMissingCount, ids.imagingPackage, ids.hospitalA],
  );
  await client.query(
    `INSERT INTO consents
      (consent_id, exchange_session_id, patient_ref_id, source_hospital_id,
       destination_hospital_id, imaging_package_id, status, consent_version,
       issued_at, expires_at, withdrawn_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 1, now(), now() + interval '1 hour', NULL, now(), now())`,
    [ids.consent, ids.session, ids.patient, ids.hospitalA, ids.hospitalB, ids.imagingPackage],
  );
  await client.query(
    `INSERT INTO consent_actions (consent_action_id, consent_id, action)
     VALUES ($1, $2, 'PACS_IMPORT')`,
    ["19000000-0000-4000-8000-000000000002", ids.consent],
  );
  await client.query(
    `INSERT INTO consents
      (consent_id, exchange_session_id, patient_ref_id, source_hospital_id,
       destination_hospital_id, imaging_package_id, status, consent_version,
       issued_at, expires_at, withdrawn_at, created_at, updated_at)
     VALUES
       ('19000000-0000-4000-8000-000000000011', $1, $2, $3, $4, $5, 'WITHDRAWN', 2,
        now() - interval '2 hours', now() + interval '1 hour', now(), now(), now()),
       ('19000000-0000-4000-8000-000000000012', $1, $2, $3, $4, $5, 'EXPIRED', 3,
        now() - interval '2 hours', now() - interval '1 hour', NULL, now(), now())`,
    [ids.session, ids.patient, ids.hospitalA, ids.hospitalB, ids.imagingPackage],
  );
  await client.query(
    `INSERT INTO consent_actions (consent_action_id, consent_id, action)
     VALUES ('19000000-0000-4000-8000-000000000021', '19000000-0000-4000-8000-000000000011', 'PACS_IMPORT'),
            ('19000000-0000-4000-8000-000000000022', '19000000-0000-4000-8000-000000000012', 'PACS_IMPORT')`,
  );
  await client.query(
    `INSERT INTO consents
      (consent_id, exchange_session_id, patient_ref_id, source_hospital_id,
       destination_hospital_id, imaging_package_id, status, consent_version,
       issued_at, expires_at, withdrawn_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 1, now(), now() + interval '1 hour', NULL, now(), now())`,
    [ids.consentInFlightRevocation, ids.sessionInFlightRevocation, ids.patient,
      ids.hospitalA, ids.hospitalB, ids.packageInFlightRevocation],
  );
  await client.query(
    `INSERT INTO consent_actions (consent_action_id, consent_id, action)
     VALUES ('19000000-0000-4000-8000-000000000032', $1, 'PACS_IMPORT')`,
    [ids.consentInFlightRevocation],
  );
  await client.query(
    `INSERT INTO transfer_grants
      (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
       recipient_hospital_id, recipient_actor_id, imaging_package_id, idempotency_key,
       status, issued_at, expires_at, revoked_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE',
             now() - interval '1 minute', now() + interval '1 hour', NULL, now())`,
    [ids.grant, ids.session, ids.consent, ids.tenantB, ids.hospitalB, ids.actorB,
      ids.imagingPackage, "1a000000-0000-4000-8000-000000000002"],
  );
  await client.query(
    `INSERT INTO transfer_grant_scopes (grant_scope_id, grant_id, scope)
     VALUES ($1, $2, 'study:pacs-transfer')`,
    ["1a000000-0000-4000-8000-000000000003", ids.grant],
  );
  const deniedGrants = [
    {
      grantId: "1a000000-0000-4000-8000-000000000011",
      idempotencyKey: "1a000000-0000-4000-8000-000000000111",
      consentId: ids.consent,
      status: "REVOKED",
      issuedOffset: "-1 minute",
      expiresOffset: "+1 hour",
      revoked: true,
      grantScopeId: "1a000000-0000-4000-8000-000000000101",
      scope: "study:pacs-transfer",
    },
    {
      grantId: "1a000000-0000-4000-8000-000000000012",
      idempotencyKey: "1a000000-0000-4000-8000-000000000112",
      consentId: ids.consent,
      status: "ACTIVE",
      issuedOffset: "-2 hours",
      expiresOffset: "-1 hour",
      revoked: false,
      grantScopeId: "1a000000-0000-4000-8000-000000000102",
      scope: "study:pacs-transfer",
    },
    {
      grantId: "1a000000-0000-4000-8000-000000000013",
      idempotencyKey: "1a000000-0000-4000-8000-000000000113",
      consentId: ids.consent,
      status: "ACTIVE",
      issuedOffset: "-1 minute",
      expiresOffset: "+1 hour",
      revoked: false,
      grantScopeId: "1a000000-0000-4000-8000-000000000103",
      scope: "study:view",
    },
    {
      grantId: "1a000000-0000-4000-8000-000000000014",
      idempotencyKey: "1a000000-0000-4000-8000-000000000114",
      consentId: "19000000-0000-4000-8000-000000000011",
      status: "ACTIVE",
      issuedOffset: "-1 minute",
      expiresOffset: "+1 hour",
      revoked: false,
      grantScopeId: "1a000000-0000-4000-8000-000000000104",
      scope: "study:pacs-transfer",
    },
    {
      grantId: "1a000000-0000-4000-8000-000000000015",
      idempotencyKey: "1a000000-0000-4000-8000-000000000115",
      consentId: "19000000-0000-4000-8000-000000000012",
      status: "ACTIVE",
      issuedOffset: "-1 minute",
      expiresOffset: "+1 hour",
      revoked: false,
      grantScopeId: "1a000000-0000-4000-8000-000000000105",
      scope: "study:pacs-transfer",
    },
  ];
  for (const grant of deniedGrants) {
    await client.query(
      `INSERT INTO transfer_grants
        (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
         recipient_hospital_id, recipient_actor_id, imaging_package_id, idempotency_key,
         status, issued_at, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               now() + $10::interval, now() + $11::interval,
               CASE WHEN $12::boolean THEN now() ELSE NULL END, now())`,
      [grant.grantId, ids.session, grant.consentId, ids.tenantB, ids.hospitalB,
        ids.actorB, ids.imagingPackage, grant.idempotencyKey, grant.status,
        grant.issuedOffset, grant.expiresOffset, grant.revoked],
    );
    await client.query(
      `INSERT INTO transfer_grant_scopes (grant_scope_id, grant_id, scope)
       VALUES ($1, $2, $3)`,
      [grant.grantScopeId, grant.grantId, grant.scope],
    );
  }
  await client.query(
    `INSERT INTO transfer_grants
      (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
       recipient_hospital_id, recipient_actor_id, imaging_package_id, idempotency_key,
       status, issued_at, expires_at, revoked_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE',
             now() - interval '1 minute', now() + interval '1 hour', NULL, now())`,
    [ids.grantInFlightRevocation, ids.sessionInFlightRevocation, ids.consentInFlightRevocation,
      ids.tenantB, ids.hospitalB, ids.actorB, ids.packageInFlightRevocation,
      "1a000000-0000-4000-8000-000000000033"],
  );
  await client.query(
    `INSERT INTO transfer_grant_scopes (grant_scope_id, grant_id, scope)
     VALUES ($1, $2, 'study:pacs-transfer')`,
    [ids.grantInFlightRevocationScope, ids.grantInFlightRevocation],
  );
  await client.query(`INSERT INTO actors
    (actor_id, tenant_id, hospital_id, actor_type, external_subject, display_name, status, created_at, updated_at)
    VALUES ('0a000000-0000-4000-8000-000000000003', $1, NULL, 'USER',
      'synthetic-int001-patient-actor', 'Synthetic Consent Patient', 'ACTIVE', now(), now())`, [ids.tenantB]);
  for (const scenario of [...cap012Cases, ...temporaryCaptureLifecycleCases]) {
    await client.query(
      `INSERT INTO exchange_sessions
        (session_id, patient_ref_id, source_hospital_id, destination_hospital_id,
         requester_actor_id, purpose, state, created_at, updated_at, expires_at,
         completed_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, 'Synthetic CAP-012 persistence fault', 'ACTIVE',
               now(), now(), now() + interval '1 hour', NULL, $6)`,
      [scenario.sessionId, ids.patient, ids.hospitalA, ids.hospitalB, ids.actorB, scenario.sessionKey],
    );
    await client.query(
      `INSERT INTO imaging_packages
        (package_id, exchange_session_id, patient_ref_id, source_hospital_id,
         state, storage_ref, study_count, created_at, updated_at,
         retention_expires_at, deleted_at)
       VALUES ($1, $2, $3, $4, 'AVAILABLE', NULL, 1, now(), now(), NULL, NULL)`,
      [scenario.packageId, scenario.sessionId, ids.patient, ids.hospitalA],
    );
    await client.query(
      `INSERT INTO study_references
        (study_ref_id, package_id, source_hospital_id, study_instance_uid,
         modality, series_count, instance_count, created_at)
       VALUES ($1, $2, $3, '2.25.139413224574575433810421680499794275977', 'CT', 1, 3, now())`,
      [scenario.studyRefId, scenario.packageId, ids.hospitalA],
    );
    await client.query(
      `INSERT INTO consents
        (consent_id, exchange_session_id, patient_ref_id, source_hospital_id,
         destination_hospital_id, imaging_package_id, status, consent_version,
         issued_at, expires_at, withdrawn_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 1, now(),
               now() + interval '1 hour', NULL, now(), now())`,
      [scenario.consentId, scenario.sessionId, ids.patient, ids.hospitalA,
        ids.hospitalB, scenario.packageId],
    );
    await client.query(
      `INSERT INTO consent_actions (consent_action_id, consent_id, action)
       VALUES ($1, $2, 'PACS_IMPORT')`,
      [scenario.consentActionId, scenario.consentId],
    );
    await client.query(
      `INSERT INTO transfer_grants
        (grant_id, exchange_session_id, consent_id, recipient_tenant_id,
         recipient_hospital_id, recipient_actor_id, imaging_package_id,
         idempotency_key, status, issued_at, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', now(),
               now() + interval '1 hour', NULL, now())`,
      [scenario.grantId, scenario.sessionId, scenario.consentId, ids.tenantB,
        ids.hospitalB, ids.actorB, scenario.packageId, scenario.grantKey],
    );
    await client.query(
      `INSERT INTO transfer_grant_scopes (grant_scope_id, grant_id, scope)
       VALUES ($1, $2, 'study:pacs-transfer')`,
      [scenario.grantScopeId, scenario.grantId],
    );
  }
  await client.query(
    `INSERT INTO pacs_transfer_operations
      (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
       idempotency_key, request_digest, state, version, reason_code,
       source_object_count, destination_object_count, created_at, updated_at, stow_started_at)
     VALUES ($1, $2, $3, $4, $5, $6, repeat('a', 64), 'CREATED', 0, NULL,
             NULL, NULL, now(), now(), NULL)`,
    [ids.operation, ids.tenantB, ids.session, ids.study, ids.actorB,
      "1b000000-0000-4000-8000-000000000002"],
  );
  await client.query(
    `INSERT INTO pacs_transfer_operations
      (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
       idempotency_key, request_digest, state, version, reason_code,
       source_object_count, destination_object_count, created_at, updated_at, stow_started_at)
     VALUES ($1, $2, $3, $4, $5, $6, repeat('e', 64), 'CREATED', 0, NULL,
             NULL, NULL, now(), now(), NULL)`,
    [ids.operationMissingCount, ids.tenantB, ids.session, ids.studyMissingCount,
      ids.actorB, "1b000000-0000-4000-8000-000000000015"],
  );
  await client.query(
    `INSERT INTO pacs_transfer_operations
      (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
       idempotency_key, request_digest, state, version, reason_code,
       source_object_count, destination_object_count, created_at, updated_at, stow_started_at)
     VALUES
       ($1, $2, $3, $4, $5, '1b000000-0000-4000-8000-000000000012', repeat('b', 64), 'CREATED', 0, NULL, NULL, NULL, now(), now(), NULL),
       ($6, $2, $3, $7, $5, '1b000000-0000-4000-8000-000000000013', repeat('c', 64), 'CREATED', 0, NULL, NULL, NULL, now(), now(), NULL),
       ($8, $2, $9, $10, $5, '1b000000-0000-4000-8000-000000000014', repeat('d', 64), 'CREATED', 0, NULL, NULL, NULL, now(), now(), NULL)`,
    [ids.operationBindingMismatch, ids.tenantB, ids.session, ids.studyOther, ids.actorB,
      ids.operationSourceMismatch, ids.studySourceMismatch, ids.operationNotCreated,
      ids.sessionOther, ids.studyOther],
  );
  await client.query(
    `INSERT INTO pacs_transfer_operations
      (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
       idempotency_key, request_digest, state, version, reason_code,
       source_object_count, destination_object_count, created_at, updated_at, stow_started_at)
     VALUES ($1, $2, $3, $4, $5, $6, repeat('f', 64), 'CREATED', 0, NULL,
             NULL, NULL, now(), now(), NULL)`,
    [ids.operationInFlightRevocation, ids.tenantB, ids.sessionInFlightRevocation,
      ids.studyInFlightRevocation, ids.actorB,
      "1b000000-0000-4000-8000-000000000016"],
  );

  for (const scenario of [...cap012Cases, ...temporaryCaptureLifecycleCases]) {
    await client.query(
      `INSERT INTO pacs_transfer_operations
        (operation_id, tenant_id, exchange_session_id, study_ref_id, actor_id,
         idempotency_key, request_digest, state, version, reason_code,
         source_object_count, destination_object_count, created_at, updated_at,
         stow_started_at)
       VALUES ($1, $2, $3, $4, $5, $6, repeat('1', 64), 'CREATED', 0, NULL,
               NULL, NULL, now(), now(), NULL)`,
      [scenario.operationId, ids.tenantB, scenario.sessionId, scenario.studyRefId,
        ids.actorB, scenario.operationKey],
    );
  }

  await client.query(`
    CREATE FUNCTION public.int001_cap012_audit_insert_fault() RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF (NEW.correlation_id = '1d000000-0000-4000-8000-000000000029'::uuid
          AND NEW.action = 'PACS_SOURCE_CAPTURE_STARTED')
         OR (NEW.correlation_id = '1d000000-0000-4000-8000-000000000031'::uuid
          AND NEW.action = 'PACS_SOURCE_CAPTURED')
         OR (NEW.correlation_id = '1d000000-0000-4000-8000-000000000103'::uuid
          AND NEW.action = 'PACS_SOURCE_CAPTURED')
         OR (NEW.correlation_id = '1d000000-0000-4000-8000-000000000104'::uuid
          AND NEW.action = 'PACS_TEMPORARY_READ_AUTHORIZED'
          AND NEW.reason_code = 'BEFORE_DELIVERY') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INT001_CAP012_TEST_FAULT';
      END IF;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER int001_cap012_audit_insert_fault
      BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.int001_cap012_audit_insert_fault();

    CREATE FUNCTION public.int001_cap012_evidence_insert_fault() RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.operation_id IN ('1b000000-0000-4000-8000-000000000022'::uuid,
          '1b000000-0000-4000-8000-000000000113'::uuid)
         AND NEW.verification_stage = 'SOURCE_CAPTURE'
         AND NEW.status = 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INT001_CAP012_TEST_FAULT';
      END IF;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER int001_cap012_evidence_insert_fault
      BEFORE INSERT ON public.integrity_evidence
      FOR EACH ROW EXECUTE FUNCTION public.int001_cap012_evidence_insert_fault();
  `);
  await client.query("COMMIT");
  console.log("int001_database_fixture=PASS synthetic_only=true");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  const safeCode = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : "UNCLASSIFIED";
  const constraint = typeof error?.constraint === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(error.constraint)
    ? error.constraint
    : typeof error?.message === "string" && /^[A-Z0-9_]{1,96}$/.test(error.message)
      ? error.message
      : "UNKNOWN_CONSTRAINT";
  throw new Error(`INT001_FIXTURE_SEED_FAILED:${safeCode}:${constraint}`);
} finally {
  client.release();
  await pool.end();
}
