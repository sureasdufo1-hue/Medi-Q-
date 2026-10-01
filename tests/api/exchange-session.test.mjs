import { describe, expect, it } from "vitest";
import {
  exchangeSessionStates,
  ExchangeSession,
  InvalidExchangeSessionError,
  InvalidExchangeSessionTransitionError,
} from "../../services/api/dist/exchange/domain/exchange-session.js";

const fixedNow = new Date("2026-09-30T00:00:00.000Z");
const patientRefId = "22000000-0000-4000-8000-000000000001";
const sourceHospitalId = "04000000-0000-4000-8000-000000000001";
const destinationHospitalId = "04000000-0000-4000-8000-000000000002";
const requesterActorId = "03000000-0000-4000-8000-000000000001";
const sessionId = "25000000-0000-4000-8000-000000000001";

function session(overrides = {}) {
  return ExchangeSession.create({
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    requesterActorId,
    purpose: "Referral imaging review",
    now: fixedNow,
    ...overrides,
  });
}

function snapshot(overrides = {}) {
  return {
    sessionId,
    patientRefId,
    sourceHospitalId,
    destinationHospitalId,
    requesterActorId,
    purpose: "Referral imaging review",
    state: "REQUESTED",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    expiresAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("ExchangeSession domain", () => {
  it("creates a unique Session with approved context and REQUESTED state", () => {
    const first = session();
    const second = session();

    expect(ExchangeSession.isValidId(first.sessionId)).toBe(true);
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.patientRefId).toBe(patientRefId);
    expect(first.sourceHospitalId).toBe(sourceHospitalId);
    expect(first.destinationHospitalId).toBe(destinationHospitalId);
    expect(first.requesterActorId).toBe(requesterActorId);
    expect(first.purpose).toBe("Referral imaging review");
    expect(first.state).toBe("REQUESTED");
    expect(first.createdAt.toISOString()).toBe(fixedNow.toISOString());
    expect(first.updatedAt.toISOString()).toBe(fixedNow.toISOString());
    expect(first.expiresAt).toBeNull();
    expect(first.completedAt).toBeNull();
  });

  it("accepts optional valid expiry and preserves purpose without normalization", () => {
    const expiresAt = new Date("2026-10-01T00:00:00.000Z");
    const created = session({ purpose: "  Referral  ", expiresAt });

    expect(created.purpose).toBe("  Referral  ");
    expect(created.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });

  it("does not infer expiry or completion-time relationships to created state", () => {
    const reconstituted = ExchangeSession.reconstitute(snapshot({
      state: "REQUESTED",
      expiresAt: new Date("2026-09-29T00:00:00.000Z"),
      completedAt: fixedNow,
    }));

    expect(reconstituted.state).toBe("REQUESTED");
    expect(reconstituted.expiresAt?.toISOString()).toBe(
      "2026-09-29T00:00:00.000Z",
    );
    expect(reconstituted.completedAt?.toISOString()).toBe(
      fixedNow.toISOString(),
    );
  });

  it.each([
    ["patientRefId", "not-a-uuid"],
    ["sourceHospitalId", "not-a-uuid"],
    ["destinationHospitalId", "not-a-uuid"],
    ["requesterActorId", "not-a-uuid"],
    ["purpose", "   "],
    ["purpose", "x".repeat(256)],
    ["purpose", "😀".repeat(256)],
  ])("rejects invalid field %s without reflecting its value", (field, value) => {
    let failure;
    try {
      session({ [field]: value });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(InvalidExchangeSessionError);
    expect(failure.message).toBe("EXCHANGE_SESSION_INVALID");
    expect(failure.message).not.toContain(String(value));
  });

  it("rejects identical source and destination Hospitals", () => {
    expect(() => session({ destinationHospitalId: sourceHospitalId })).toThrow(
      InvalidExchangeSessionError,
    );
  });

  it("reconstitutes every approved state and rejects unknown states", () => {
    expect(exchangeSessionStates).toHaveLength(12);
    for (const state of exchangeSessionStates) {
      expect(ExchangeSession.reconstitute(snapshot({ state })).state).toBe(state);
    }

    expect(() =>
      ExchangeSession.reconstitute(snapshot({ state: "UNKNOWN" })),
    ).toThrow(InvalidExchangeSessionError);
  });

  it("rejects invalid timestamps and updatedAt earlier than createdAt", () => {
    expect(() =>
      ExchangeSession.reconstitute(snapshot({
        createdAt: new Date("invalid"),
      })),
    ).toThrow(InvalidExchangeSessionError);
    expect(() =>
      ExchangeSession.reconstitute(snapshot({
        updatedAt: new Date("2026-09-29T23:59:59.000Z"),
      })),
    ).toThrow(InvalidExchangeSessionError);
    expect(() =>
      ExchangeSession.reconstitute(snapshot({ expiresAt: new Date("invalid") })),
    ).toThrow(InvalidExchangeSessionError);
    expect(() =>
      ExchangeSession.reconstitute(snapshot({ completedAt: new Date("invalid") })),
    ).toThrow(InvalidExchangeSessionError);
  });

  it("does not expose mutable Date references", () => {
    const created = session({
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    const createdAt = created.createdAt;
    const expiresAt = created.expiresAt;
    createdAt.setUTCFullYear(2000);
    expiresAt?.setUTCFullYear(2000);

    expect(created.createdAt.toISOString()).toBe(fixedNow.toISOString());
    expect(created.expiresAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("allows only the ordered mainline and records completion time", () => {
    const positivePath = [
      "REQUESTED",
      "CONSENT_PENDING",
      "CONSENTED",
      "AUTHORIZED",
      "READY",
      "ACTIVE",
      "COMPLETED",
    ];
    let current = session();

    for (const [index, nextState] of positivePath.slice(1).entries()) {
      const before = current;
      const transitionAt = new Date(fixedNow.getTime() + (index + 1) * 1000);
      current = current.transitionTo(nextState, transitionAt);

      expect(current.state).toBe(nextState);
      expect(before.state).toBe(positivePath[index]);
      expect(before.updatedAt.toISOString()).toBe(
        new Date(fixedNow.getTime() + index * 1000).toISOString(),
      );
      expect(current.updatedAt.toISOString()).toBe(transitionAt.toISOString());
      expect(current.completedAt?.toISOString() ?? null).toBe(
        nextState === "COMPLETED" ? transitionAt.toISOString() : null,
      );
    }

    expect(current.state).toBe("COMPLETED");
  });

  it("permits only state-appropriate terminal transitions", () => {
    const nonTerminalStates = exchangeSessionStates.filter(
      (state) =>
        ![
          "COMPLETED",
          "REJECTED",
          "EXPIRED",
          "REVOKED",
          "FAILED",
          "CANCELLED",
        ].includes(state),
    );

    for (const state of nonTerminalStates) {
      for (const terminalState of ["EXPIRED", "FAILED", "CANCELLED"]) {
        expect(
          ExchangeSession.reconstitute(snapshot({ state })).transitionTo(
            terminalState,
            fixedNow,
          ).state,
        ).toBe(terminalState);
      }
    }

    for (const state of ["REQUESTED", "CONSENT_PENDING"]) {
      expect(
        ExchangeSession.reconstitute(snapshot({ state })).transitionTo(
          "REJECTED",
          fixedNow,
        ).state,
      ).toBe("REJECTED");
    }

    for (const state of ["CONSENTED", "AUTHORIZED", "READY", "ACTIVE"]) {
      expect(
        ExchangeSession.reconstitute(snapshot({ state })).transitionTo(
          "REVOKED",
          fixedNow,
        ).state,
      ).toBe("REVOKED");
    }
  });

  it.each([
    ["REQUESTED", "CONSENTED"],
    ["CONSENT_PENDING", "READY"],
    ["AUTHORIZED", "CONSENTED"],
    ["ACTIVE", "READY"],
    ["REQUESTED", "REQUESTED"],
    ["CONSENT_PENDING", "REVOKED"],
    ["CONSENTED", "REJECTED"],
  ])("rejects invalid transition %s -> %s without mutating the aggregate", (
    fromState,
    toState,
  ) => {
    const current = ExchangeSession.reconstitute(snapshot({ state: fromState }));

    expect(() => current.transitionTo(toState, fixedNow)).toThrow(
      InvalidExchangeSessionTransitionError,
    );
    expect(current.state).toBe(fromState);
    expect(current.updatedAt.toISOString()).toBe(fixedNow.toISOString());
  });

  it("does not allow a terminal state to transition again", () => {
    for (const terminalState of [
      "COMPLETED",
      "REJECTED",
      "EXPIRED",
      "REVOKED",
      "FAILED",
      "CANCELLED",
    ]) {
      expect(() =>
        ExchangeSession.reconstitute(snapshot({ state: terminalState })).transitionTo(
          "REQUESTED",
          fixedNow,
        ),
      ).toThrow(InvalidExchangeSessionTransitionError);
    }
  });

  it("requires monotonic transition time and a consistent pre-transition completion timestamp", () => {
    const current = session();
    expect(() =>
      current.transitionTo(
        "CONSENT_PENDING",
        new Date(fixedNow.getTime() - 1),
      ),
    ).toThrow(InvalidExchangeSessionTransitionError);
    expect(() =>
      current.transitionTo("CONSENT_PENDING", new Date("invalid")),
    ).toThrow(InvalidExchangeSessionTransitionError);

    const inconsistent = ExchangeSession.reconstitute(
      snapshot({ completedAt: fixedNow }),
    );
    expect(() =>
      inconsistent.transitionTo("CONSENT_PENDING", fixedNow),
    ).toThrow(InvalidExchangeSessionTransitionError);
  });

  it("uses a fixed non-disclosing transition error for unknown runtime state values", () => {
    const current = session();
    let failure;
    try {
      current.transitionTo("INTERNAL-STATE", fixedNow);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(InvalidExchangeSessionTransitionError);
    expect(failure.message).toBe("EXCHANGE_SESSION_TRANSITION_INVALID");
    expect(failure.message).not.toContain("INTERNAL-STATE");
  });
});
