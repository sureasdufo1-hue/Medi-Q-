import { describe, expect, it } from "vitest";
import {
  AuthorizationContext,
  InvalidAuthorizationContextError,
} from "../../services/api/dist/authorization/domain/authorization-context.js";

const identity = Object.freeze({
  issuer: "https://issuer.synthetic.test",
  subject: "synthetic-user-001",
  actorId: "03000000-0000-4000-8000-000000000001",
  tenantId: "01000000-0000-4000-8000-000000000001",
  hospitalId: "04000000-0000-4000-8000-000000000001",
  actorType: "USER",
});

const validInput = () => ({
  identity,
  exchangeSessionId: "25000000-0000-4000-8000-000000000001",
  resource: {
    kind: "STUDY",
    id: "28000000-0000-4000-8000-000000000001",
  },
  action: "VIEW",
  consentId: "26000000-0000-4000-8000-000000000001",
  grantId: "27000000-0000-4000-8000-000000000001",
});

describe("AuthorizationContext domain", () => {
  it("binds the complete server-side context without producing a decision", () => {
    const context = AuthorizationContext.create(validInput());

    expect(context).toMatchObject({
      issuer: identity.issuer,
      subject: identity.subject,
      actorId: identity.actorId,
      tenantId: identity.tenantId,
      hospitalId: identity.hospitalId,
      actorType: "USER",
      exchangeSessionId: "25000000-0000-4000-8000-000000000001",
      resource: {
        kind: "STUDY",
        id: "28000000-0000-4000-8000-000000000001",
      },
      action: "VIEW",
      consentId: "26000000-0000-4000-8000-000000000001",
      grantId: "27000000-0000-4000-8000-000000000001",
    });
    expect(Object.hasOwn(context, "decision")).toBe(false);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it.each([
    ["missing whole context", null],
    ["missing identity", { identity: null }],
    ["empty issuer", { identity: { ...identity, issuer: "" } }],
    ["empty subject", { identity: { ...identity, subject: "" } }],
    ["malformed actor", { identity: { ...identity, actorId: "actor-1" } }],
    ["malformed tenant", { identity: { ...identity, tenantId: "tenant-1" } }],
    ["malformed hospital", { identity: { ...identity, hospitalId: "hospital-1" } }],
    ["unknown actor type", { identity: { ...identity, actorType: "ADMIN" } }],
    ["missing session", { exchangeSessionId: null }],
    ["missing resource", { resource: null }],
    ["missing action", { action: null }],
    ["missing consent", { consentId: null }],
    ["missing grant", { grantId: null }],
  ])("rejects %s without a permissive fallback", (_label, override) => {
    const candidate = override === null
      ? override
      : { ...validInput(), ...override };
    expect(() => AuthorizationContext.create(candidate)).toThrow(
      InvalidAuthorizationContextError,
    );
  });

  it.each(["STUDY", "SERIES", "INSTANCE"])(
    "accepts only the declared resource kind %s",
    (kind) => {
      const context = AuthorizationContext.create({
        ...validInput(),
        resource: { ...validInput().resource, kind },
      });
      expect(context.resource.kind).toBe(kind);
    },
  );

  it.each(["VIEW", "DOWNLOAD", "PACS_IMPORT"])(
    "accepts the explicit action %s without action promotion",
    (action) => {
      const context = AuthorizationContext.create({ ...validInput(), action });
      expect(context.action).toBe(action);
    },
  );

  it.each([
    ["arbitrary resource kind", { resource: { kind: "PATIENT", id: "28000000-0000-4000-8000-000000000001" } }],
    ["DICOM UID as external authority", { resource: { kind: "STUDY", id: "1.2.840.10008.1" } }],
    ["arbitrary action", { action: "ADMIN" }],
    ["malformed consent reference", { consentId: "consent-1" }],
    ["malformed grant reference", { grantId: "grant-1" }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      AuthorizationContext.create({ ...validInput(), ...override }),
    ).toThrow(InvalidAuthorizationContextError);
  });

  it("copies and freezes the resource reference rather than retaining mutable input", () => {
    const input = validInput();
    const context = AuthorizationContext.create(input);
    input.resource.id = "28000000-0000-4000-8000-000000000099";

    expect(context.resource.id).toBe("28000000-0000-4000-8000-000000000001");
    expect(Object.isFrozen(context.resource)).toBe(true);
    expect(() => {
      context.resource.id = "28000000-0000-4000-8000-000000000002";
    }).toThrow(TypeError);
  });

  it("normalizes UUID references while preserving verified issuer and subject", () => {
    const input = validInput();
    input.exchangeSessionId = input.exchangeSessionId.toUpperCase();
    input.consentId = input.consentId.toUpperCase();
    input.grantId = input.grantId.toUpperCase();
    input.resource.id = input.resource.id.toUpperCase();

    const context = AuthorizationContext.create(input);

    expect(context.exchangeSessionId).toBe(input.exchangeSessionId.toLowerCase());
    expect(context.consentId).toBe(input.consentId.toLowerCase());
    expect(context.grantId).toBe(input.grantId.toLowerCase());
    expect(context.resource.id).toBe(input.resource.id.toLowerCase());
    expect(context.issuer).toBe(identity.issuer);
    expect(context.subject).toBe(identity.subject);
  });
});
