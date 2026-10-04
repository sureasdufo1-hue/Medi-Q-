const SAFE_NODE_DATABASE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ERR_QUERY_TIMEOUT",
  "ERR_SOCKET_CLOSED",
]);

const SAFE_DATABASE_ERROR_NAMES = new Set([
  "AggregateError",
  "AbortError",
  "DatabaseError",
  "Error",
  "QueryError",
  "SocketError",
  "TimeoutError",
]);

const SAFE_DATABASE_MESSAGE_CLASSES = new Map([
  ["query read timeout", "QUERY_READ_TIMEOUT"],
  ["connection terminated unexpectedly", "CONNECTION_TERMINATED_UNEXPECTEDLY"],
  ["connection terminated", "CONNECTION_TERMINATED"],
  ["client has already been released", "CLIENT_ALREADY_RELEASED"],
  ["connection timeout expired", "CONNECTION_TIMEOUT"],
  ["timeout exceeded when trying to connect", "CONNECT_TIMEOUT"],
  ["socket hang up", "SOCKET_HANG_UP"],
]);

const SAFE_DATABASE_CONSTRAINT_CLASSES = new Map([
  ["integrity_evidence_destination_verify_binding_check", "DESTINATION_EVIDENCE_CHECK"],
  ["integrity_evidence_destination_verify_guard", "DESTINATION_EVIDENCE_GUARD"],
  ["provenance_records_destination_integrity_link_guard", "PROVENANCE_INTEGRITY_LINK_GUARD"],
]);

/** Return only static/allowlisted diagnostic categories; never return raw error data. */
export function safeDatabaseErrorClass(error) {
  if (typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) {
    if (error.code === "42P08" && typeof error.message === "string") {
      const parameter = /^could not determine data type of parameter \$(\d+)$/i.exec(error.message.trim())?.[1];
      if (parameter && Number(parameter) >= 1 && Number(parameter) <= 32) {
        return `SQLSTATE_42P08_PARAMETER_${parameter}`;
      }
    }
    if (error.code === "23514" && typeof error.constraint === "string") {
      const constraintClass = SAFE_DATABASE_CONSTRAINT_CLASSES.get(error.constraint);
      if (constraintClass) return `SQLSTATE_23514_${constraintClass}`;
    }
    return `SQLSTATE_${error.code}`;
  }
  if (typeof error?.code === "string" && SAFE_NODE_DATABASE_CODES.has(error.code)) {
    return `NODE_${error.code}`;
  }
  if (typeof error?.message === "string") {
    const messageClass = SAFE_DATABASE_MESSAGE_CLASSES.get(error.message.trim().toLowerCase());
    if (messageClass) return messageClass;
  }
  return SAFE_DATABASE_ERROR_NAMES.has(error?.name)
    ? `ERROR_${error.name.toUpperCase()}`
    : "UNCLASSIFIED";
}

/** Bucket elapsed query time so diagnostics reveal no fine-grained workload trace. */
export function safeQueryDurationBucket(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "INVALID_DURATION";
  if (durationMs < 10) return "LT10MS";
  if (durationMs < 100) return "10TO99MS";
  if (durationMs < 1_000) return "100TO999MS";
  return "GTE1000MS";
}
