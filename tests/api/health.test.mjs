import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { HealthController } from "../../services/api/dist/health/health.controller.js";
import { HealthService } from "../../services/api/dist/health/health.service.js";
import { BearerAuthenticationGuard } from "../../services/api/dist/authentication/bearer-authentication.guard.js";
import { OIDC_TOKEN_VERIFIER } from "../../services/api/dist/authentication/authentication.tokens.js";

describe("operational health endpoints", () => {
  let app;
  let healthState;

  beforeEach(async () => {
    healthState = vi.fn().mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { isReady: healthState } },
        { provide: OIDC_TOKEN_VERIFIER, useValue: null },
        { provide: APP_GUARD, useClass: BearerAuthenticationGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter({ logger: false }), { logger: false });
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("reports process liveness without dependency details or cacheability", async () => {
    const response = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/api/v1/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "alive" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(healthState).not.toHaveBeenCalled();
  });

  it("reports ready only when the dependency probe succeeds", async () => {
    const response = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(healthState).toHaveBeenCalledOnce();
  });

  it("fails closed with a generic response when a dependency probe fails", async () => {
    healthState.mockResolvedValue(false);
    const response = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
    expect(response.body).not.toMatch(/postgres|orthanc|password|credential|host/i);
  });
});
