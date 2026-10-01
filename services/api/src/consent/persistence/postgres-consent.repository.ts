import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import {
  ConsentArtifact,
  InvalidConsentArtifactError,
  type ConsentArtifactSnapshot,
  type ConsentArtifactStatus,
  type P0ConsentAction,
} from "../domain/consent-artifact.js";
import type {
  ConsentRepository,
  CreatePendingConsentInput,
} from "./consent.repository.js";
import { acquireExchangeSessionFence } from "../../exchange/persistence/exchange-session-fence.js";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const consentColumns = `
  consent_id,
  exchange_session_id,
  patient_ref_id,
  source_hospital_id,
  destination_hospital_id,
  imaging_package_id,
  status,
  consent_version,
  issued_at,
  expires_at,
  withdrawn_at,
  created_at,
  updated_at
`;

interface SessionContextRow extends QueryResultRow {
  session_id: string;
  patient_ref_id: string;
  source_hospital_id: string;
  destination_hospital_id: string;
}

interface ConsentRow extends QueryResultRow {
  consent_id: string;
  exchange_session_id: string;
  patient_ref_id: string;
  source_hospital_id: string;
  destination_hospital_id: string;
  imaging_package_id: string | null;
  status: ConsentArtifactStatus;
  consent_version: number;
  issued_at: Date | null;
  expires_at: Date | null;
  withdrawn_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ConsentActionRow extends QueryResultRow {
  consent_action_id: string;
  action: P0ConsentAction;
}

interface IsolationRow extends QueryResultRow {
  transaction_isolation: string;
}

export class ConsentContextDeniedError extends Error {
  constructor() {
    super("CONSENT_CONTEXT_DENIED");
    this.name = "ConsentContextDeniedError";
  }
}

export class ConsentPersistenceError extends Error {
  constructor() {
    super("CONSENT_PERSISTENCE_FAILED");
    this.name = "ConsentPersistenceError";
  }
}

export class ConsentVersionConflictError extends Error {
  constructor() {
    super("CONSENT_VERSION_CONFLICT");
    this.name = "ConsentVersionConflictError";
  }
}

export class ConsentVersionExhaustedError extends Error {
  constructor() {
    super("CONSENT_VERSION_EXHAUSTED");
    this.name = "ConsentVersionExhaustedError";
  }
}

export class ConsentApprovalConflictError extends Error {
  constructor() {
    super("CONSENT_APPROVAL_CONFLICT");
    this.name = "ConsentApprovalConflictError";
  }
}

export class ConsentWithdrawalConflictError extends Error {
  constructor() {
    super("CONSENT_WITHDRAWAL_CONFLICT");
    this.name = "ConsentWithdrawalConflictError";
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function postgresErrorConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("constraint" in error)) {
    return undefined;
  }
  return typeof error.constraint === "string" ? error.constraint : undefined;
}

function toSnapshot(
  row: ConsentRow,
  actions: readonly P0ConsentAction[],
): ConsentArtifactSnapshot {
  return {
    consentId: row.consent_id,
    exchangeSessionId: row.exchange_session_id,
    patientRefId: row.patient_ref_id,
    sourceHospitalId: row.source_hospital_id,
    destinationHospitalId: row.destination_hospital_id,
    imagingPackageId: row.imaging_package_id,
    actions,
    status: row.status,
    consentVersion: row.consent_version,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDomain(
  row: ConsentRow,
  actions: readonly P0ConsentAction[],
): ConsentArtifact {
  return ConsentArtifact.reconstitute(toSnapshot(row, actions));
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly database: Pick<PoolClient, "query">) {}

  async createPending(
    input: CreatePendingConsentInput,
  ): Promise<ConsentArtifact> {
    let validatedInput: ConsentArtifact;
    try {
      validatedInput = ConsentArtifact.create({
        exchangeSessionId: input.exchangeSessionId,
        patientRefId: input.patientRefId,
        sourceHospitalId: input.sourceHospitalId,
        destinationHospitalId: input.destinationHospitalId,
        imagingPackageId: input.imagingPackageId,
        actions: [...input.actions].sort(),
        consentVersion: 1,
        now: input.now,
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      if (error instanceof InvalidConsentArtifactError) throw error;
      throw new InvalidConsentArtifactError();
    }

    const savepointName = `mediq_consent_${randomUUID().replaceAll("-", "")}`;
    let savepointCreated = false;
    try {
      // Fail before any write if this adapter is accidentally used without the
      // caller's explicit IAM-002 transaction.
      await this.database.query(`SAVEPOINT ${savepointName}`);
      savepointCreated = true;

      const isolationResult = await this.database.query<IsolationRow>(
        "SELECT current_setting('transaction_isolation') AS transaction_isolation",
      );
      if (
        isolationResult.rows.length !== 1 ||
        isolationResult.rows[0].transaction_isolation !== "read committed"
      ) {
        throw new ConsentPersistenceError();
      }

      // The caller's IAM-002 transaction owns this lock until commit/rollback.
      await acquireExchangeSessionFence(
        this.database,
        validatedInput.exchangeSessionId,
      );

      const sessionResult = await this.database.query<SessionContextRow>(
        `SELECT session_id, patient_ref_id, source_hospital_id, destination_hospital_id
           FROM exchange_sessions
          WHERE session_id = $1`,
        [validatedInput.exchangeSessionId],
      );
      if (sessionResult.rows.length !== 1) {
        throw new ConsentContextDeniedError();
      }
      const session = sessionResult.rows[0];
      if (
        !sameId(session.session_id, validatedInput.exchangeSessionId) ||
        !sameId(session.patient_ref_id, validatedInput.patientRefId) ||
        !sameId(session.source_hospital_id, validatedInput.sourceHospitalId) ||
        !sameId(
          session.destination_hospital_id,
          validatedInput.destinationHospitalId,
        )
      ) {
        throw new ConsentContextDeniedError();
      }

      const versionResult = await this.database.query<
        QueryResultRow & { next_version: string | number }
      >(
        `SELECT COALESCE(MAX(consent_version)::bigint, 0) + 1 AS next_version
           FROM consents
          WHERE exchange_session_id = $1`,
        [validatedInput.exchangeSessionId],
      );
      if (versionResult.rows.length !== 1) {
        throw new ConsentPersistenceError();
      }
      const nextVersion = Number(versionResult.rows[0].next_version);
      if (
        !Number.isSafeInteger(nextVersion) ||
        nextVersion <= 0 ||
        nextVersion > POSTGRES_INTEGER_MAX
      ) {
        throw new ConsentVersionExhaustedError();
      }

      const consent = ConsentArtifact.create({
        exchangeSessionId: validatedInput.exchangeSessionId,
        patientRefId: validatedInput.patientRefId,
        sourceHospitalId: validatedInput.sourceHospitalId,
        destinationHospitalId: validatedInput.destinationHospitalId,
        imagingPackageId: validatedInput.imagingPackageId,
        actions: validatedInput.actions,
        consentVersion: nextVersion,
        now: validatedInput.createdAt,
        expiresAt: validatedInput.expiresAt,
      });

      const inserted = await this.database.query<ConsentRow>(
        `INSERT INTO consents
          (consent_id, exchange_session_id, patient_ref_id,
           source_hospital_id, destination_hospital_id, imaging_package_id,
           status, consent_version, issued_at, expires_at, withdrawn_at,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, NULL, $8, NULL, $9, $10)
         RETURNING ${consentColumns}`,
        [
          consent.consentId,
          consent.exchangeSessionId,
          consent.patientRefId,
          consent.sourceHospitalId,
          consent.destinationHospitalId,
          consent.imagingPackageId,
          consent.consentVersion,
          consent.expiresAt,
          consent.createdAt,
          consent.updatedAt,
        ],
      );
      if (inserted.rows.length !== 1) throw new ConsentPersistenceError();

      for (const action of consent.actions) {
        const actionResult = await this.database.query(
          `INSERT INTO consent_actions (consent_action_id, consent_id, action)
           VALUES ($1, $2, $3)`,
          [randomUUID(), consent.consentId, action],
        );
        if (actionResult.rowCount !== 1) throw new ConsentPersistenceError();
      }

      const persisted = toDomain(inserted.rows[0], consent.actions);
      await this.database.query(`RELEASE SAVEPOINT ${savepointName}`);
      savepointCreated = false;
      return persisted;
    } catch (error) {
      if (savepointCreated) {
        try {
          await this.database.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await this.database.query(`RELEASE SAVEPOINT ${savepointName}`);
        } catch {
          // The trusted outer transaction boundary will discard/rollback the
          // client if PostgreSQL can no longer recover this savepoint.
        }
      }
      if (
        error instanceof ConsentContextDeniedError ||
        error instanceof ConsentVersionExhaustedError ||
        error instanceof ConsentPersistenceError
      ) {
        throw error;
      }
      if (
        postgresErrorCode(error) === "23505" &&
        postgresErrorConstraint(error) === "consents_session_version_unique"
      ) {
        throw new ConsentVersionConflictError();
      }
      throw new ConsentPersistenceError();
    }
  }

  async findById(consentId: string): Promise<ConsentArtifact | null> {
    if (!ConsentArtifact.isValidId(consentId)) {
      throw new InvalidConsentArtifactError();
    }

    try {
      const result = await this.database.query<ConsentRow>(
        `SELECT ${consentColumns}
           FROM consents
          WHERE consent_id = $1`,
        [consentId.toLowerCase()],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1) throw new ConsentPersistenceError();

      const actionResult = await this.database.query<ConsentActionRow>(
        `SELECT consent_action_id, action
           FROM consent_actions
          WHERE consent_id = $1
          ORDER BY action ASC`,
        [consentId.toLowerCase()],
      );
      const actions = actionResult.rows.map((row) => row.action);
      return toDomain(result.rows[0], actions);
    } catch (error) {
      if (error instanceof ConsentPersistenceError) throw error;
      throw new ConsentPersistenceError();
    }
  }

  async findPendingBySession(
    exchangeSessionId: string,
  ): Promise<readonly ConsentArtifact[]> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exchangeSessionId)) {
      throw new InvalidConsentArtifactError();
    }
    try {
      const result = await this.database.query<ConsentRow>(
        `SELECT ${consentColumns}
           FROM consents
          WHERE exchange_session_id = $1 AND status = 'PENDING'
          ORDER BY consent_version DESC
          LIMIT 2`,
        [exchangeSessionId.toLowerCase()],
      );
      const artifacts: ConsentArtifact[] = [];
      for (const row of result.rows) {
        const actionResult = await this.database.query<ConsentActionRow>(
          `SELECT consent_action_id, action
             FROM consent_actions
            WHERE consent_id = $1
            ORDER BY action ASC`,
          [row.consent_id],
        );
        artifacts.push(toDomain(row, actionResult.rows.map((action) => action.action)));
      }
      return Object.freeze(artifacts);
    } catch (error) {
      if (error instanceof ConsentPersistenceError) throw error;
      throw new ConsentPersistenceError();
    }
  }

  async approvePending(input: {
    consent: ConsentArtifact;
    now: Date;
  }): Promise<ConsentArtifact> {
    if (
      !(input.consent instanceof ConsentArtifact) ||
      !(input.now instanceof Date) ||
      !Number.isFinite(input.now.getTime())
    ) {
      throw new InvalidConsentArtifactError();
    }
    let approved: ConsentArtifact;
    try {
      approved = input.consent.approve(input.now);
    } catch {
      throw new ConsentApprovalConflictError();
    }
    try {
      const updated = await this.database.query<ConsentRow>(
        `UPDATE consents
            SET status = 'ACTIVE', issued_at = $4, updated_at = $4
          WHERE consent_id = $1
            AND exchange_session_id = $2
            AND patient_ref_id = $3
            AND status = 'PENDING'
            AND (expires_at IS NULL OR expires_at > $4)
          RETURNING ${consentColumns}`,
        [approved.consentId, approved.exchangeSessionId, approved.patientRefId, input.now],
      );
      if (updated.rows.length !== 1) throw new ConsentApprovalConflictError();
      const actions = await this.database.query<ConsentActionRow>(
        `SELECT consent_action_id, action
           FROM consent_actions
          WHERE consent_id = $1
          ORDER BY action ASC`,
        [approved.consentId],
      );
      return toDomain(updated.rows[0], actions.rows.map((row) => row.action));
    } catch (error) {
      if (error instanceof ConsentApprovalConflictError) throw error;
      throw new ConsentPersistenceError();
    }
  }

  async withdrawActive(input: {
    consent: ConsentArtifact;
    now: Date;
  }): Promise<ConsentArtifact> {
    if (
      !(input.consent instanceof ConsentArtifact) ||
      !(input.now instanceof Date) ||
      !Number.isFinite(input.now.getTime())
    ) {
      throw new InvalidConsentArtifactError();
    }
    let withdrawn: ConsentArtifact;
    try {
      withdrawn = input.consent.withdraw(input.now);
    } catch {
      throw new ConsentWithdrawalConflictError();
    }
    try {
      const updated = await this.database.query<ConsentRow>(
        `UPDATE consents
            SET status = 'WITHDRAWN', withdrawn_at = $4, updated_at = $4
          WHERE consent_id = $1
            AND exchange_session_id = $2
            AND patient_ref_id = $3
            AND status = 'ACTIVE'
            AND withdrawn_at IS NULL
          RETURNING ${consentColumns}`,
        [withdrawn.consentId, withdrawn.exchangeSessionId, withdrawn.patientRefId, input.now],
      );
      if (updated.rows.length !== 1) throw new ConsentWithdrawalConflictError();
      const actions = await this.database.query<ConsentActionRow>(
        `SELECT consent_action_id, action
           FROM consent_actions
          WHERE consent_id = $1
          ORDER BY action ASC`,
        [withdrawn.consentId],
      );
      return toDomain(updated.rows[0], actions.rows.map((row) => row.action));
    } catch (error) {
      if (error instanceof ConsentWithdrawalConflictError) throw error;
      throw new ConsentPersistenceError();
    }
  }
}
