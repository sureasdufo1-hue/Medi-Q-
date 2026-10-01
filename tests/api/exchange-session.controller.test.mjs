import { afterEach, describe, expect, it, vi } from "vitest";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ExchangeSessionController } from "../../services/api/dist/exchange/presentation/exchange-session.controller.js";
import { ExchangeSessionCreationService, InvalidExchangeSessionRequestError } from "../../services/api/dist/exchange/application/exchange-session-creation.service.js";
import { BearerAuthenticationGuard } from "../../services/api/dist/authentication/bearer-authentication.guard.js";
import { OIDC_TOKEN_VERIFIER } from "../../services/api/dist/authentication/authentication.tokens.js";

const principal = Object.freeze({
  issuer: "https://identity.example.test/issuer",
  subject: "synthetic-user-b",
});
const session = Object.freeze({
  sessionId: "25000000-0000-4000-8000-000000000001",
  patientRefId: "22000000-0000-4000-8000-000000000001",
  sourceHospitalId: "04000000-0000-4000-8000-000000000001",
  destinationHospitalId: "04000000-0000-4000-8000-000000000002",
  requesterActorId: "03000000-0000-4000-8000-000000000001",
  purpose: "Referral imaging review",
  state: "REQUESTED",
  createdAt: new Date("2026-09-30T00:00:00.000Z"),
  expiresAt: null,
  completedAt: null,
});

describe("POST /api/v1/exchange-sessions", () => {
  let app;
  let create;

  async function setup(options = {}) {
    const verifier = options.verifier;
    create = vi.fn().mockResolvedValue({
      session,
      replayed: false,
      correlationId: "26000000-0000-4000-8000-000000000002",
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [ExchangeSessionController],
      providers: [
        { provide: ExchangeSessionCreationService, useValue: { create } },
        {
          provide: OIDC_TOKEN_VERIFIER,
          useValue: Object.hasOwn(options, "verifier")
            ? verifier
            : { verify: vi.fn().mockResolvedValue(principal) },
        },
        { provide: APP_GUARD, useClass: BearerAuthenticationGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication(new FastifyAdapter({ logger: false }), { logger: false });
    app.setGlobalPrefix("api/v1");
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("requires verified Bearer authentication before invoking the create operation", async () => {
    await setup();
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/api/v1/exchange-sessions",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
    expect(response.body).not.toMatch(/patient|hospital|sql|stack|token/i);
  });

  it("uses only the verified principal and the explicit candidate/idempotency headers", async () => {
    await setup();
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/api/v1/exchange-sessions",
      headers: {
        authorization: "Bearer a.b.c",
        "x-tenant-id": "01000000-0000-4000-8000-000000000002",
        "idempotency-key": "26000000-0000-4000-8000-000000000001",
        "x-correlation-id": "26000000-0000-4000-8000-000000000002",
      },
      payload: {
        patientRefId: session.patientRefId,
        sourceHospitalId: session.sourceHospitalId,
        destinationHospitalId: session.destinationHospitalId,
        purpose: session.purpose,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-correlation-id"]).toBe("26000000-0000-4000-8000-000000000002");
    expect(response.headers.location).toBeUndefined();
    expect(response.json()).toEqual({
      sessionId: session.sessionId,
      patientRefId: session.patientRefId,
      sourceHospitalId: session.sourceHospitalId,
      destinationHospitalId: session.destinationHospitalId,
      purpose: session.purpose,
      state: "REQUESTED",
      createdAt: "2026-09-30T00:00:00.000Z",
    });
    expect(response.body).not.toContain("requesterActorId");
    expect(response.body).not.toContain("idempotency");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      principal,
      tenantCandidate: "01000000-0000-4000-8000-000000000002",
      idempotencyKey: "26000000-0000-4000-8000-000000000001",
      body: expect.objectContaining({ purpose: session.purpose }),
    }));
  });

  it("maps invalid create requests to a fixed response without echoing details", async () => {
    await setup();
    create.mockRejectedValue(new InvalidExchangeSessionRequestError());
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/api/v1/exchange-sessions",
      headers: {
        authorization: "Bearer a.b.c",
        "x-tenant-id": "01000000-0000-4000-8000-000000000002",
        "idempotency-key": "26000000-0000-4000-8000-000000000001",
      },
      payload: { purpose: "sensitive synthetic detail" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "EXCHANGE_REQUEST_INVALID" });
    expect(response.body).not.toContain("sensitive synthetic detail");
  });

  it("fails closed when the OIDC verifier is unavailable", async () => {
    await setup({ verifier: null });
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url: "/api/v1/exchange-sessions",
      headers: { authorization: "Bearer a.b.c" },
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
    expect(create).not.toHaveBeenCalled();
  });
});
