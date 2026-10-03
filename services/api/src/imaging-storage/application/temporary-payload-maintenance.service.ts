import type { OidcTokenVerifier } from "../../authentication/authentication.types.js";
import type { TemporaryPayloadExpiryRunner, TemporaryPayloadExpiryResult } from "./temporary-payload-expiry.runner.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKEN_BYTES = 8 * 1024;

export class TemporaryPayloadMaintenanceUnavailableError extends Error {
  constructor(readonly phase: "VALIDATION" | "AUTHENTICATION" | "CLEANUP") {
    super("TEMPORARY_PAYLOAD_MAINTENANCE_UNAVAILABLE");
    this.name = "TemporaryPayloadMaintenanceUnavailableError";
  }
}

function snapshotCommand(input: unknown) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error();
    const fields = Object.getOwnPropertyDescriptors(input);
    const required = ["token", "tenantCandidate", "correlationId"];
    if (required.some(key => !Object.hasOwn(fields, key)) ||
      Reflect.ownKeys(fields).some(key => typeof key !== "string" ||
        (!required.includes(key) && key !== "batchLimit") || !Object.hasOwn(fields[key]!, "value"))) {
      throw new Error();
    }
    const token = fields.token!.value as unknown;
    const tenant = fields.tenantCandidate!.value as unknown;
    const correlation = fields.correlationId!.value as unknown;
    const batch = fields.batchLimit?.value as unknown;
    if (typeof token !== "string" || !token || Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES ||
      typeof tenant !== "string" || !UUID.test(tenant) ||
      typeof correlation !== "string" || !UUID.test(correlation) ||
      (batch !== undefined && (typeof batch !== "number" || !Number.isInteger(batch) || batch < 1 || batch > 100))) {
      throw new Error();
    }
    return Object.freeze({ token, tenantCandidate: tenant.toLowerCase(), correlationId: correlation.toLowerCase(),
      ...(typeof batch === "number" ? { batchLimit: batch } : {}) });
  } catch {
    throw new TemporaryPayloadMaintenanceUnavailableError("VALIDATION");
  }
}

/** Internal authenticated one-shot operation; no route, timer or token retention. */
export class TemporaryPayloadMaintenanceService {
  constructor(
    private readonly verifier: OidcTokenVerifier | null,
    private readonly expiry: Pick<TemporaryPayloadExpiryRunner, "run">,
  ) {}

  async run(input: unknown): Promise<Readonly<TemporaryPayloadExpiryResult>> {
    const command = snapshotCommand(input);
    let principal;
    try {
      if (!this.verifier) throw new Error();
      principal = await this.verifier.verify(command.token);
    } catch {
      throw new TemporaryPayloadMaintenanceUnavailableError("AUTHENTICATION");
    }
    try {
      // Registry membership/SERVICE and Tenant RLS are rechecked by the runner,
      // independently of successful token verification, before each effect.
      const result = await this.expiry.run({
        principal, tenantCandidate: command.tenantCandidate, correlationId: command.correlationId,
        ...(command.batchLimit === undefined ? {} : { batchLimit: command.batchLimit }),
      });
      const counts = [result.attempted, result.purged, result.alreadyPurged, result.retryable];
      if (!counts.every(count => Number.isInteger(count) && count >= 0 && count <= (command.batchLimit ?? 50)) ||
        result.attempted !== result.purged + result.alreadyPurged + result.retryable || typeof result.hasMore !== "boolean") {
        throw new Error();
      }
      return Object.freeze({ attempted: result.attempted, purged: result.purged,
        alreadyPurged: result.alreadyPurged, retryable: result.retryable, hasMore: result.hasMore });
    } catch {
      throw new TemporaryPayloadMaintenanceUnavailableError("CLEANUP");
    }
  }
}
