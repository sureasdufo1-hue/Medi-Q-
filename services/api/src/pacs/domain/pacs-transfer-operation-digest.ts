import { createHash } from "node:crypto";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PacsTransferOperationSemantics {
  readonly tenantId: string;
  readonly actorId: string;
  readonly exchangeSessionId: string;
  readonly studyRefId: string;
  readonly consentId: string;
  readonly grantId: string;
  readonly action: "PACS_IMPORT";
}

export function pacsTransferOperationDigest(
  input: PacsTransferOperationSemantics,
): string {
  const values = [
    input.tenantId,
    input.actorId,
    input.exchangeSessionId,
    input.studyRefId,
    input.consentId,
    input.grantId,
  ];
  if (values.some((value) => !uuidPattern.test(value))) {
    throw new TypeError("PACS_TRANSFER_OPERATION_SEMANTICS_INVALID");
  }
  if (input.action !== "PACS_IMPORT") {
    throw new TypeError("PACS_TRANSFER_OPERATION_SEMANTICS_INVALID");
  }

  const canonical = JSON.stringify({
    action: input.action,
    actorId: input.actorId.toLowerCase(),
    consentId: input.consentId.toLowerCase(),
    exchangeSessionId: input.exchangeSessionId.toLowerCase(),
    grantId: input.grantId.toLowerCase(),
    studyRefId: input.studyRefId.toLowerCase(),
    tenantId: input.tenantId.toLowerCase(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
