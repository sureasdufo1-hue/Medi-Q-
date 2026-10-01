import type { PoolClient, QueryResultRow } from "pg";
import type { AuthorizationContext } from "../domain/authorization-context.js";
import type { AuthorizationPolicyFacts } from "../domain/authorization-facts.js";
import type { AuthorizationEvidenceReader } from "../application/authorization-evidence.reader.js";

interface AuthorizationEvidenceRow extends QueryResultRow {
  session_id: string;
  patient_ref_id: string;
  source_hospital_id: string;
  destination_hospital_id: string;
  session_state: string;
  session_expires_at: Date | null;
  consent_id: string;
  consent_session_id: string;
  consent_patient_ref_id: string;
  consent_source_hospital_id: string;
  consent_destination_hospital_id: string;
  consent_package_id: string | null;
  consent_status: string;
  consent_issued_at: Date | null;
  consent_expires_at: Date | null;
  consent_withdrawn_at: Date | null;
  allowed_actions: string[];
  grant_id: string;
  grant_session_id: string;
  grant_consent_id: string;
  recipient_tenant_id: string;
  recipient_hospital_id: string;
  recipient_actor_id: string | null;
  grant_package_id: string | null;
  grant_status: string;
  grant_issued_at: Date;
  grant_expires_at: Date;
  grant_revoked_at: Date | null;
  grant_scopes: string[];
  study_ref_id: string;
  package_id: string;
  package_session_id: string;
  package_patient_ref_id: string;
  package_source_hospital_id: string;
  package_state: string;
  retention_expires_at: Date | null;
  package_deleted_at: Date | null;
}

const STUDY_AUTHORIZATION_EVIDENCE_SQL = `
SELECT
  e.session_id::text AS session_id,
  e.patient_ref_id::text AS patient_ref_id,
  e.source_hospital_id::text AS source_hospital_id,
  e.destination_hospital_id::text AS destination_hospital_id,
  e.state AS session_state,
  e.expires_at AS session_expires_at,
  c.consent_id::text AS consent_id,
  c.exchange_session_id::text AS consent_session_id,
  c.patient_ref_id::text AS consent_patient_ref_id,
  c.source_hospital_id::text AS consent_source_hospital_id,
  c.destination_hospital_id::text AS consent_destination_hospital_id,
  c.imaging_package_id::text AS consent_package_id,
  c.status AS consent_status,
  c.issued_at AS consent_issued_at,
  c.expires_at AS consent_expires_at,
  c.withdrawn_at AS consent_withdrawn_at,
  COALESCE((
    SELECT array_agg(ca.action ORDER BY ca.action)
      FROM consent_actions AS ca
     WHERE ca.consent_id = c.consent_id
  ), ARRAY[]::varchar[]) AS allowed_actions,
  g.grant_id::text AS grant_id,
  g.exchange_session_id::text AS grant_session_id,
  g.consent_id::text AS grant_consent_id,
  g.recipient_tenant_id::text AS recipient_tenant_id,
  g.recipient_hospital_id::text AS recipient_hospital_id,
  g.recipient_actor_id::text AS recipient_actor_id,
  g.imaging_package_id::text AS grant_package_id,
  g.status AS grant_status,
  g.issued_at AS grant_issued_at,
  g.expires_at AS grant_expires_at,
  g.revoked_at AS grant_revoked_at,
  COALESCE((
    SELECT array_agg(gs.scope ORDER BY gs.scope)
      FROM transfer_grant_scopes AS gs
     WHERE gs.grant_id = g.grant_id
  ), ARRAY[]::varchar[]) AS grant_scopes,
  sr.study_ref_id::text AS study_ref_id,
  p.package_id::text AS package_id,
  p.exchange_session_id::text AS package_session_id,
  p.patient_ref_id::text AS package_patient_ref_id,
  p.source_hospital_id::text AS package_source_hospital_id,
  p.state AS package_state,
  p.retention_expires_at AS retention_expires_at,
  p.deleted_at AS package_deleted_at
FROM exchange_sessions AS e
JOIN consents AS c
  ON c.exchange_session_id = e.session_id
 AND c.consent_id = $2::uuid
JOIN transfer_grants AS g
  ON g.exchange_session_id = e.session_id
 AND g.consent_id = c.consent_id
 AND g.grant_id = $3::uuid
JOIN imaging_packages AS p
  ON p.package_id = g.imaging_package_id
 AND p.exchange_session_id = e.session_id
 AND p.patient_ref_id = e.patient_ref_id
 AND p.source_hospital_id = e.source_hospital_id
JOIN study_references AS sr
  ON sr.package_id = p.package_id
 AND sr.source_hospital_id = p.source_hospital_id
 AND sr.study_ref_id = $4::uuid
WHERE e.session_id = $1::uuid
`;

/**
 * Resolves only the Study-level evidence represented by the current schema.
 * It is intentionally not registered in an HTTP or PACS workflow.
 */
export class PostgresAuthorizationEvidenceReader
  implements AuthorizationEvidenceReader
{
  async resolve(
    context: AuthorizationContext,
    transactionClient: PoolClient,
  ): Promise<AuthorizationPolicyFacts | null> {
    if (context.resource.kind !== "STUDY") return null;

    const result = await transactionClient.query<AuthorizationEvidenceRow>(
      STUDY_AUTHORIZATION_EVIDENCE_SQL,
      [
        context.exchangeSessionId,
        context.consentId,
        context.grantId,
        context.resource.id,
      ],
    );
    if (result.rows.length !== 1) return null;

    const row = result.rows[0];
    return {
      exchangeSession: {
        sessionId: row.session_id,
        patientRefId: row.patient_ref_id,
        sourceHospitalId: row.source_hospital_id,
        destinationHospitalId: row.destination_hospital_id,
        state: row.session_state,
        expiresAt: row.session_expires_at,
      },
      consent: {
        consentId: row.consent_id,
        exchangeSessionId: row.consent_session_id,
        patientRefId: row.consent_patient_ref_id,
        sourceHospitalId: row.consent_source_hospital_id,
        destinationHospitalId: row.consent_destination_hospital_id,
        imagingPackageId: row.consent_package_id,
        status: row.consent_status,
        issuedAt: row.consent_issued_at,
        expiresAt: row.consent_expires_at,
        withdrawnAt: row.consent_withdrawn_at,
        allowedActions: row.allowed_actions,
      },
      transferGrant: {
        grantId: row.grant_id,
        exchangeSessionId: row.grant_session_id,
        consentId: row.grant_consent_id,
        recipientTenantId: row.recipient_tenant_id,
        recipientHospitalId: row.recipient_hospital_id,
        recipientActorId: row.recipient_actor_id,
        imagingPackageId: row.grant_package_id,
        status: row.grant_status,
        issuedAt: row.grant_issued_at,
        expiresAt: row.grant_expires_at,
        revokedAt: row.grant_revoked_at,
        scopes: row.grant_scopes,
      },
      resourceBinding: {
        kind: "STUDY",
        resourceId: row.study_ref_id,
        studyRefId: row.study_ref_id,
        exchangeSessionId: row.package_session_id,
        patientRefId: row.package_patient_ref_id,
        sourceHospitalId: row.package_source_hospital_id,
        imagingPackageId: row.package_id,
        packageState: row.package_state,
        retentionExpiresAt: row.retention_expires_at,
        deletedAt: row.package_deleted_at,
      },
    };
  }
}
