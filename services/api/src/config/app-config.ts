export type RuntimeEnvironment = "development" | "test";
export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

export interface AppConfig {
  environment: RuntimeEnvironment;
  runtimeProfile: "container";
  logLevel: LogLevel;
  apiPort: number;
  databaseUrl: string;
  databaseRole: "mediq_runtime";
  orthancAUrl: string;
  orthancAUsername: string;
  orthancAPassword: string;
  orthancBUrl: string;
  orthancBUsername: string;
  orthancBPassword: string;
  oidcAuthentication: OidcAuthenticationConfig | null;
}

export interface OidcAuthenticationConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
}

type Environment = Record<string, string | undefined>;

const forbiddenApplicationVariables = [
  "MEDIQ_POSTGRES_USER",
  "MEDIQ_POSTGRES_PASSWORD",
  "MEDIQ_DB_RUNTIME_USER",
  "MEDIQ_DB_MIGRATION_USER",
  "MEDIQ_DB_MIGRATION_PASSWORD",
  "MEDIQ_MIGRATION_DATABASE_URL",
  "MEDIQ_DB_RUNTIME_PASSWORD",
  "MEDIQ_ENCRYPTION_KEY",
  "MEDIQ_OIDC_PRIVATE_KEY",
  "MEDIQ_OIDC_TEST_PRIVATE_KEY",
];

const placeholderPattern = /(?:replace[-_ ]?before|change[-_ ]?me|your[-_ ]|example|placeholder|^todo$)/i;

function required(environment: Environment, key: string): string {
  const value = environment[key]?.trim();
  if (!value || placeholderPattern.test(value)) {
    throw new Error(`APP_CONFIG_INVALID:${key}`);
  }
  return value;
}

function decodeComponent(value: string, key: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`APP_CONFIG_INVALID:${key}`);
  }
}

function serviceUrl(value: string, key: string, hostname: string, port: number): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`APP_CONFIG_INVALID:${key}`);
  }
  const effectivePort = parsed.port ? Number(parsed.port) : 443;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== hostname ||
    effectivePort !== port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`APP_CONFIG_INVALID:${key}`);
  }
  return `${parsed.protocol}//${parsed.hostname}:${effectivePort}`;
}

function databaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_DATABASE_URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== "postgres" ||
    (parsed.port && parsed.port !== "5432") ||
    !parsed.username ||
    !parsed.password ||
    !/^\/[a-zA-Z0-9_-]+$/.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_DATABASE_URL");
  }
  if (decodeComponent(parsed.username, "MEDIQ_DATABASE_URL") !== "mediq_runtime") {
    throw new Error("APP_CONFIG_INVALID:DATABASE_ROLE_MUST_BE_MEDIQ_RUNTIME");
  }
  if (placeholderPattern.test(decodeComponent(parsed.password, "MEDIQ_DATABASE_URL"))) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_DATABASE_URL");
  }
  return parsed;
}

function oidcAuthenticationConfig(
  environment: Environment,
  environmentName: RuntimeEnvironment,
): OidcAuthenticationConfig | null {
  const issuer = environment.MEDIQ_OIDC_ISSUER?.trim();
  const audience = environment.MEDIQ_OIDC_AUDIENCE?.trim();
  const jwksUri = environment.MEDIQ_OIDC_JWKS_URI?.trim();
  const supplied = [issuer, audience, jwksUri].filter(Boolean).length;
  if (supplied === 0) return null;
  if (
    supplied !== 3 ||
    !issuer ||
    !audience ||
    placeholderPattern.test(audience) ||
    !jwksUri ||
    audience.length > 255
  ) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION");
  }

  let issuerUrl: URL;
  let jwksUrl: URL;
  try {
    issuerUrl = new URL(issuer);
    jwksUrl = new URL(jwksUri);
  } catch {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION");
  }

  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  const validOrigin = (url: URL): boolean => {
    if (url.username || url.password || url.search || url.hash || !url.hostname) return false;
    if (url.protocol === "https:") return true;
    return environmentName === "test" && url.protocol === "http:" && loopbackHosts.has(url.hostname);
  };

  if (
    issuer.length > 2048 ||
    jwksUri.length > 2048 ||
    !validOrigin(issuerUrl) ||
    !validOrigin(jwksUrl) ||
    issuerUrl.protocol !== jwksUrl.protocol
  ) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION");
  }

  return { issuer, audience, jwksUri };
}

export function parseAppConfig(environment: Environment): AppConfig {
  for (const key of forbiddenApplicationVariables) {
    if (environment[key]?.trim()) {
      throw new Error(`APP_CONFIG_FORBIDDEN_VARIABLE:${key}`);
    }
  }

  const runtimeProfile = required(environment, "MEDIQ_RUNTIME_PROFILE");
  if (runtimeProfile !== "container") {
    throw new Error("APP_CONFIG_UNSUPPORTED_RUNTIME_PROFILE");
  }

  const environmentName = required(environment, "MEDIQ_ENV");
  if (environmentName !== "development" && environmentName !== "test") {
    throw new Error("APP_CONFIG_UNSUPPORTED_ENVIRONMENT");
  }

  const logLevel = required(environment, "MEDIQ_LOG_LEVEL").toUpperCase();
  if (!["ERROR", "WARN", "INFO", "DEBUG"].includes(logLevel)) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_LOG_LEVEL");
  }

  const apiPortValue = required(environment, "MEDIQ_API_PORT");
  if (!/^\d+$/.test(apiPortValue)) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_API_PORT");
  }
  const apiPort = Number(apiPortValue);
  if (!Number.isSafeInteger(apiPort) || apiPort < 1024 || apiPort > 65535) {
    throw new Error("APP_CONFIG_INVALID:MEDIQ_API_PORT");
  }

  const database = databaseUrl(required(environment, "MEDIQ_DATABASE_URL"));
  const databaseName = decodeComponent(database.pathname.slice(1), "MEDIQ_DATABASE_URL");
  const configuredDatabaseName = required(environment, "MEDIQ_POSTGRES_DB");
  if (databaseName !== configuredDatabaseName) {
    throw new Error("APP_CONFIG_INVALID:DATABASE_NAME_MISMATCH");
  }

  const orthancAUrl = serviceUrl(required(environment, "ORTHANC_A_URL"), "ORTHANC_A_URL", "orthanc-a", 8042);
  const orthancBUrl = serviceUrl(required(environment, "ORTHANC_B_URL"), "ORTHANC_B_URL", "orthanc-b", 8042);
  const orthancAUsername = required(environment, "ORTHANC_A_USERNAME");
  const orthancAPassword = required(environment, "ORTHANC_A_PASSWORD");
  const orthancBUsername = required(environment, "ORTHANC_B_USERNAME");
  const orthancBPassword = required(environment, "ORTHANC_B_PASSWORD");
  if (orthancAPassword === orthancBPassword) {
    throw new Error("APP_CONFIG_INVALID:ORTHANC_CREDENTIALS_MUST_BE_DISTINCT");
  }

  return {
    environment: environmentName,
    runtimeProfile: "container",
    logLevel: logLevel as LogLevel,
    apiPort,
    databaseUrl: database.toString(),
    databaseRole: "mediq_runtime",
    orthancAUrl,
    orthancAUsername,
    orthancAPassword,
    orthancBUrl,
    orthancBUsername,
    orthancBPassword,
    oidcAuthentication: oidcAuthenticationConfig(environment, environmentName),
  };
}
