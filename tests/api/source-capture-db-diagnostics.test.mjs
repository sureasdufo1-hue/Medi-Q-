import { describe, expect, it } from "vitest";
import {
  safeDatabaseErrorClass,
  safeQueryDurationBucket,
} from "../integration/safe-database-diagnostics.mjs";

describe("safe source-capture database diagnostics", () => {
  it("retains only a well-formed PostgreSQL SQLSTATE", () => {
    expect(safeDatabaseErrorClass({ code: "08006", message: "dsn=do-not-record" })).toBe("SQLSTATE_08006");
    expect(safeDatabaseErrorClass({ code: "42P08", message: "could not determine data type of parameter $10" }))
      .toBe("SQLSTATE_42P08_PARAMETER_10");
    expect(safeDatabaseErrorClass({ code: "42P08", message: "could not determine data type of parameter $99" }))
      .toBe("SQLSTATE_42P08");
    expect(safeDatabaseErrorClass({ code: "42P08", message: "could not determine type for patient TEST-001" }))
      .toBe("SQLSTATE_42P08");
    expect(safeDatabaseErrorClass({ code: "23514", constraint: "integrity_evidence_destination_verify_guard" }))
      .toBe("SQLSTATE_23514_DESTINATION_EVIDENCE_GUARD");
    expect(safeDatabaseErrorClass({ code: "23514", constraint: "patient_private_do_not_record" }))
      .toBe("SQLSTATE_23514");
    expect(safeDatabaseErrorClass({ code: "db-secret-123", name: "Error" })).toBe("ERROR_ERROR");
    expect(safeDatabaseErrorClass({ code: "db-secret-123", name: "UntrustedType" })).toBe("UNCLASSIFIED");
  });

  it("retains only allowlisted Node database error codes", () => {
    expect(safeDatabaseErrorClass({ code: "ECONNRESET" })).toBe("NODE_ECONNRESET");
    expect(safeDatabaseErrorClass({ code: "ERR_QUERY_TIMEOUT" })).toBe("NODE_ERR_QUERY_TIMEOUT");
    expect(safeDatabaseErrorClass({ code: "SECRET_VALUE" })).toBe("UNCLASSIFIED");
  });

  it("maps only exact known messages and never returns arbitrary text", () => {
    expect(safeDatabaseErrorClass({ message: "Query read timeout" })).toBe("QUERY_READ_TIMEOUT");
    expect(safeDatabaseErrorClass({ message: "Connection terminated unexpectedly" })).toBe(
      "CONNECTION_TERMINATED_UNEXPECTEDLY",
    );
    const unsafe = "password=secret patient=TEST-PATIENT-001";
    const classified = safeDatabaseErrorClass({ name: "Error", message: unsafe });
    expect(classified).toBe("ERROR_ERROR");
    expect(classified).not.toContain(unsafe);
  });

  it("reports coarse bounded query duration classes only", () => {
    expect(safeQueryDurationBucket(0)).toBe("LT10MS");
    expect(safeQueryDurationBucket(10)).toBe("10TO99MS");
    expect(safeQueryDurationBucket(100)).toBe("100TO999MS");
    expect(safeQueryDurationBucket(1_000)).toBe("GTE1000MS");
    expect(safeQueryDurationBucket(Number.NaN)).toBe("INVALID_DURATION");
  });
});
