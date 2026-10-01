import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JSONWebKeySet,
} from "jose";
import type { OidcAuthenticationConfig } from "../config/app-config.js";
import type {
  OidcTokenVerifier,
  VerifiedAuthenticationPrincipal,
} from "./authentication.types.js";

const MAX_JWT_BYTES = 8 * 1024;
const MAX_JWKS_BYTES = 64 * 1024;
const MAX_JWKS_KEYS = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidAuthenticationTokenError extends Error {
  constructor() {
    super("AUTHENTICATION_TOKEN_INVALID");
    this.name = "InvalidAuthenticationTokenError";
  }
}

export class AuthenticationProviderUnavailableError extends Error {
  constructor() {
    super("AUTHENTICATION_PROVIDER_UNAVAILABLE");
    this.name = "AuthenticationProviderUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePublicJwks(value: unknown): value is JSONWebKeySet {
  if (!isRecord(value) || !Array.isArray(value.keys) || value.keys.length === 0 || value.keys.length > MAX_JWKS_KEYS) {
    return false;
  }

  const kids = new Set<string>();
  for (const candidate of value.keys) {
    if (!isRecord(candidate)) return false;
    if (
      candidate.kty !== "RSA" ||
      typeof candidate.kid !== "string" ||
      candidate.kid.length === 0 ||
      candidate.kid.length > 128 ||
      typeof candidate.n !== "string" ||
      typeof candidate.e !== "string"
    ) {
      return false;
    }
    if (kids.has(candidate.kid)) return false;
    kids.add(candidate.kid);
    if (candidate.alg !== undefined && candidate.alg !== "RS256") return false;
    if (candidate.use !== undefined && candidate.use !== "sig") return false;
    if (
      candidate.key_ops !== undefined &&
      (!Array.isArray(candidate.key_ops) || !candidate.key_ops.includes("verify"))
    ) {
      return false;
    }
    if (["d", "p", "q", "dp", "dq", "qi", "oth"].some((name) => name in candidate)) {
      return false;
    }
  }
  return true;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_JWKS_BYTES) {
    throw new AuthenticationProviderUnavailableError();
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JWKS_BYTES) {
        await reader.cancel();
        throw new AuthenticationProviderUnavailableError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function boundedJwksFetch(expectedUri: string): FetchImplementation {
  return async (url, options) => {
    if (url !== expectedUri) throw new AuthenticationProviderUnavailableError();
    try {
      const upstream = await fetch(url, { ...options, redirect: "error" });
      if (upstream.status !== 200 || upstream.redirected) {
        throw new AuthenticationProviderUnavailableError();
      }
      const body = await readBoundedBody(upstream);
      const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
      if (!validatePublicJwks(parsed)) throw new AuthenticationProviderUnavailableError();
      return new Response(Buffer.from(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      if (error instanceof AuthenticationProviderUnavailableError) throw error;
      throw new AuthenticationProviderUnavailableError();
    }
  };
}

export class RemoteJwksOidcTokenVerifier implements OidcTokenVerifier {
  private readonly remoteJwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: OidcAuthenticationConfig) {
    const jwksUri = new URL(config.jwksUri).href;
    this.remoteJwks = createRemoteJWKSet(new URL(config.jwksUri), {
      timeoutDuration: 1_500,
      cooldownDuration: 30_000,
      cacheMaxAge: 300_000,
      [customFetch]: boundedJwksFetch(jwksUri),
    });
  }

  async verify(token: string): Promise<VerifiedAuthenticationPrincipal> {
    if (Buffer.byteLength(token, "utf8") > MAX_JWT_BYTES) {
      throw new InvalidAuthenticationTokenError();
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.remoteJwks, {
        algorithms: ["RS256"],
        issuer: this.config.issuer,
        audience: this.config.audience,
        typ: "at+jwt",
      }));
    } catch (error) {
      if (error instanceof AuthenticationProviderUnavailableError) throw error;
      throw new InvalidAuthenticationTokenError();
    }

    const subject = payload.sub;
    const patientRefId = payload.mediq_patient_ref_id;
    const expiresAt = payload.exp;
    const notBefore = payload.nbf;
    if (
      typeof payload.iss !== "string" ||
      typeof subject !== "string" ||
      subject.trim().length === 0 ||
      Array.from(subject).length > 255 ||
      typeof expiresAt !== "number" ||
      !Number.isFinite(expiresAt) ||
      (notBefore !== undefined && (typeof notBefore !== "number" || !Number.isFinite(notBefore))) ||
      (patientRefId !== undefined &&
        (typeof patientRefId !== "string" || !UUID_PATTERN.test(patientRefId)))
    ) {
      throw new InvalidAuthenticationTokenError();
    }

    return Object.freeze({
      issuer: payload.iss,
      subject,
      ...(typeof patientRefId === "string"
        ? { patientRefId: patientRefId.toLowerCase() }
        : {}),
    });
  }
}
