import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { APP_GUARD } from "@nestjs/core";
import { Controller, Get, Req } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { BearerAuthenticationGuard } from "../../services/api/dist/authentication/bearer-authentication.guard.js";
import { OIDC_TOKEN_VERIFIER } from "../../services/api/dist/authentication/authentication.tokens.js";
import { RemoteJwksOidcTokenVerifier } from "../../services/api/dist/authentication/oidc-jwt.verifier.js";

const issuerHost = "http://127.0.0.1";
const audience = "mediq-api-test";

class AuthenticationProbeController {
  whoami(request) {
    return request.authPrincipal ?? null;
  }
}

Controller("auth-probe")(AuthenticationProbeController);
const whoamiDescriptor = Object.getOwnPropertyDescriptor(
  AuthenticationProbeController.prototype,
  "whoami",
);
Req()(AuthenticationProbeController.prototype, "whoami", 0);
Get("whoami")(
  AuthenticationProbeController.prototype,
  "whoami",
  whoamiDescriptor,
);

async function makeApp(tokenVerifier) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthenticationProbeController],
    providers: [
      { provide: OIDC_TOKEN_VERIFIER, useValue: tokenVerifier },
      { provide: APP_GUARD, useClass: BearerAuthenticationGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication(
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

function jwksServer(bodyProvider) {
  return createServer(async (request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    await bodyProvider(request, response);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function issueToken(privateKey, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: options.issuer ?? options.configIssuer,
    aud: options.audience ?? audience,
    ...(options.subject === null ? {} : { sub: options.subject ?? "TEST-ACTOR-001" }),
    ...(options.exp === null ? {} : { exp: options.exp ?? now + 60 }),
    ...(options.nbf === null ? {} : { nbf: options.nbf ?? now - 1 }),
    ...(Object.hasOwn(options, "patientRefId") ? { mediq_patient_ref_id: options.patientRefId } : {}),
  };
  const alg = options.alg ?? "RS256";
  return new SignJWT(payload)
    .setProtectedHeader({
      alg,
      kid: options.kid ?? "test-key-1",
      typ: options.typ ?? "at+jwt",
    })
    .sign(alg === "HS256" ? new TextEncoder().encode("test-only-disallowed-algorithm-key") : privateKey);
}

describe("global OIDC/JWT bearer authentication guard", () => {
  let server;
  let privateKey;
  let wrongPrivateKey;
  let verifier;
  let config;
  let jwksFetches;

  beforeAll(async () => {
    const keyPair = await generateKeyPair("RS256", { modulusLength: 2048 });
    const wrongKeyPair = await generateKeyPair("RS256", { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    wrongPrivateKey = wrongKeyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    Object.assign(publicJwk, { kid: "test-key-1", alg: "RS256", use: "sig" });

    server = jwksServer(async (_request, response) => {
      jwksFetches += 1;
      const body = JSON.stringify({ keys: [publicJwk] });
      response.writeHead(200, { "content-type": "application/json" }).end(body);
    });
    jwksFetches = 0;
    const port = await listen(server);
    const issuer = `${issuerHost}:${port}/test-issuer`;
    config = {
      issuer,
      audience,
      jwksUri: `${issuerHost}:${port}/jwks`,
    };
    verifier = new RemoteJwksOidcTokenVerifier(config);
  });

  afterAll(async () => {
    await close(server);
  });

  it("requires a Bearer token and returns the same generic denial for malformed credentials", async () => {
    const app = await makeApp(verifier);
    try {
      const missing = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
      });
      const malformed = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: "Bearer not-a-jwt" },
      });
      expect(missing.statusCode).toBe(401);
      expect(malformed.statusCode).toBe(401);
      expect(missing.json()).toEqual({ code: "AUTHENTICATION_REQUIRED" });
      expect(malformed.json()).toEqual({ code: "AUTHENTICATION_REQUIRED" });
      expect(missing.headers["www-authenticate"]).toContain("Bearer");
      expect(jwksFetches).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("accepts a valid token and exposes only immutable verified issuer/subject principal", async () => {
    const app = await makeApp(verifier);
    try {
      const token = await issueToken(privateKey, { configIssuer: config.issuer });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ issuer: config.issuer, subject: "TEST-ACTOR-001" });
      expect(response.body).not.toContain(token);
      expect(jwksFetches).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("exposes only a valid signed synthetic patient-reference claim", async () => {
    const app = await makeApp(verifier);
    try {
      const token = await issueToken(privateKey, {
        configIssuer: config.issuer,
        patientRefId: "22000000-0000-4000-8000-000000000001".toUpperCase(),
      });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        issuer: config.issuer,
        subject: "TEST-ACTOR-001",
        patientRefId: "22000000-0000-4000-8000-000000000001",
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    ["wrong issuer", { issuer: `${issuerHost}:9/wrong` }],
    ["wrong audience", { audience: "another-api" }],
    ["expired token", { exp: Math.floor(Date.now() / 1000) - 30 }],
    ["not-yet-valid token", { nbf: Math.floor(Date.now() / 1000) + 300 }],
    ["wrong typ", { typ: "JWT" }],
    ["missing subject", { subject: null }],
    ["missing expiry", { exp: null }],
    ["disallowed algorithm", { alg: "HS256" }],
    ["unknown key id", { kid: "untrusted-key-id" }],
    ["malformed synthetic patient reference claim", { patientRefId: "not-a-uuid" }],
    ["non-string synthetic patient reference claim", { patientRefId: { id: "22000000-0000-4000-8000-000000000001" } }],
  ])("denies %s with a generic response", async (_label, tokenOptions) => {
    const app = await makeApp(verifier);
    try {
      const token = await issueToken(privateKey, {
        configIssuer: config.issuer,
        ...tokenOptions,
      });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_REQUIRED" });
      expect(response.body).not.toContain(token);
    } finally {
      await app.close();
    }
  });

  it("denies a forged signature and does not return signature diagnostics", async () => {
    const app = await makeApp(verifier);
    try {
      const token = await issueToken(wrongPrivateKey, {
        configIssuer: config.issuer,
      });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_REQUIRED" });
      expect(response.body).not.toContain("signature");
    } finally {
      await app.close();
    }
  });

  it("rejects oversized, duplicate-looking and unsupported Authorization values before JWKS lookup", async () => {
    const app = await makeApp(verifier);
    const before = jwksFetches;
    try {
      for (const authorization of [
        `Bearer ${"a".repeat(8 * 1024 + 1)}`,
        "Bearer abc.def.ghi, Bearer jkl.mno.pqr",
        "Basic abc.def.ghi",
      ]) {
        const response = await app.getHttpAdapter().getInstance().inject({
          method: "GET",
          url: "/api/v1/auth-probe/whoami",
          headers: { authorization },
        });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ code: "AUTHENTICATION_REQUIRED" });
      }
      expect(jwksFetches).toBe(before);
    } finally {
      await app.close();
    }
  });

  it("fails closed with 503 when no OIDC verifier is configured", async () => {
    const app = await makeApp(null);
    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: "Bearer aaa.bbb.ccc" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
    } finally {
      await app.close();
    }
  });

  it("fails closed when the configured JWKS endpoint is unavailable", async () => {
    const unavailableVerifier = new RemoteJwksOidcTokenVerifier({
      issuer: `${issuerHost}:1/test-issuer`,
      audience,
      jwksUri: `${issuerHost}:1/jwks`,
    });
    const app = await makeApp(unavailableVerifier);
    try {
      const token = await issueToken(privateKey, {
        configIssuer: `${issuerHost}:1/test-issuer`,
      });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
      expect(response.body).not.toContain(token);
    } finally {
      await app.close();
    }
  });

  it("fails closed when a JWKS response declares a body larger than the configured limit", async () => {
    const oversizedServer = jwksServer(async (_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": `${64 * 1024 + 1}`,
      }).end("{}");
    });
    const port = await listen(oversizedServer);
    const oversizedIssuer = `${issuerHost}:${port}/test-issuer`;
    const oversizedVerifier = new RemoteJwksOidcTokenVerifier({
      issuer: oversizedIssuer,
      audience,
      jwksUri: `${issuerHost}:${port}/jwks`,
    });
    const app = await makeApp(oversizedVerifier);
    try {
      const token = await issueToken(privateKey, { configIssuer: oversizedIssuer });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
    } finally {
      await app.close();
      await close(oversizedServer);
    }
  });

  it("fails closed when the JWKS request times out", async () => {
    const slowServer = createServer(() => {});
    const port = await listen(slowServer);
    const slowIssuer = `${issuerHost}:${port}/test-issuer`;
    const slowVerifier = new RemoteJwksOidcTokenVerifier({
      issuer: slowIssuer,
      audience,
      jwksUri: `${issuerHost}:${port}/jwks`,
    });
    const app = await makeApp(slowVerifier);
    try {
      const token = await issueToken(privateKey, { configIssuer: slowIssuer });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
    } finally {
      await app.close();
      slowServer.closeAllConnections();
      await close(slowServer);
    }
  });

  it("fails closed when a JWKS response contains an invalid public key set", async () => {
    const malformedServer = jwksServer(async (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" }).end('{"keys":[{}]}');
    });
    const port = await listen(malformedServer);
    const malformedIssuer = `${issuerHost}:${port}/test-issuer`;
    const malformedVerifier = new RemoteJwksOidcTokenVerifier({
      issuer: malformedIssuer,
      audience,
      jwksUri: `${issuerHost}:${port}/jwks`,
    });
    const app = await makeApp(malformedVerifier);
    try {
      const token = await issueToken(privateKey, { configIssuer: malformedIssuer });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
      expect(response.body).not.toContain(token);
    } finally {
      await app.close();
      await close(malformedServer);
    }
  });

  it("does not follow a JWKS redirect to another endpoint", async () => {
    let redirectedRequests = 0;
    const targetServer = createServer((_request, response) => {
      redirectedRequests += 1;
      response.writeHead(200, { "content-type": "application/json" }).end('{"keys":[]}');
    });
    const targetPort = await listen(targetServer);
    const redirectServer = createServer((_request, response) => {
      response.writeHead(302, { location: `${issuerHost}:${targetPort}/jwks` }).end();
    });
    const redirectPort = await listen(redirectServer);
    const redirectIssuer = `${issuerHost}:${redirectPort}/issuer`;
    const redirectVerifier = new RemoteJwksOidcTokenVerifier({
      issuer: redirectIssuer,
      audience,
      jwksUri: `${issuerHost}:${redirectPort}/jwks`,
    });
    const app = await makeApp(redirectVerifier);
    try {
      const token = await issueToken(privateKey, { configIssuer: redirectIssuer });
      const response = await app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: "/api/v1/auth-probe/whoami",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: "AUTHENTICATION_UNAVAILABLE" });
      expect(redirectedRequests).toBe(0);
    } finally {
      await app.close();
      await close(redirectServer);
      await close(targetServer);
    }
  });
});
