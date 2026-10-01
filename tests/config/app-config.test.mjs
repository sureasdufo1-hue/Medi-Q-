import assert from "node:assert/strict";
import test from "node:test";
import { parseAppConfig } from "../../dist/app-config/config/app-config.js";

function validEnvironment() {
  return {
    MEDIQ_RUNTIME_PROFILE: "container",
    MEDIQ_ENV: "test",
    MEDIQ_LOG_LEVEL: "INFO",
    MEDIQ_API_PORT: "8080",
    MEDIQ_POSTGRES_DB: "mediq",
    MEDIQ_DATABASE_URL: "postgresql://mediq_runtime:local-test-password@postgres:5432/mediq",
    ORTHANC_A_URL: "https://orthanc-a:8042",
    ORTHANC_A_USERNAME: "orthanc_a_test",
    ORTHANC_A_PASSWORD: "local-test-a-password",
    ORTHANC_B_URL: "https://orthanc-b:8042",
    ORTHANC_B_USERNAME: "orthanc_b_test",
    ORTHANC_B_PASSWORD: "local-test-b-password",
  };
}

test("accepts only the container profile and returns validated service config", () => {
  const config = parseAppConfig(validEnvironment());
  assert.equal(config.databaseRole, "mediq_runtime");
  assert.equal(new URL(config.databaseUrl).hostname, "postgres");
  assert.equal(config.orthancAUrl, "https://orthanc-a:8042");
  assert.equal(config.orthancBUrl, "https://orthanc-b:8042");
  assert.equal(config.apiPort, 8080);
  assert.equal(config.oidcAuthentication, null);
});

test("accepts complete OIDC verifier configuration with test-only loopback HTTP", () => {
  const environment = validEnvironment();
  environment.MEDIQ_OIDC_ISSUER = "http://127.0.0.1:4011/test-issuer";
  environment.MEDIQ_OIDC_AUDIENCE = "mediq-api-test";
  environment.MEDIQ_OIDC_JWKS_URI = "http://127.0.0.1:4011/test-issuer/jwks";
  const config = parseAppConfig(environment);
  assert.deepEqual(config.oidcAuthentication, {
    issuer: "http://127.0.0.1:4011/test-issuer",
    audience: "mediq-api-test",
    jwksUri: "http://127.0.0.1:4011/test-issuer/jwks",
  });
});

test("rejects partial or non-test HTTP OIDC configuration", () => {
  const partial = validEnvironment();
  partial.MEDIQ_OIDC_ISSUER = "https://identity.example.test/issuer";
  assert.throws(() => parseAppConfig(partial), /APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION/);

  const nonTestHttp = validEnvironment();
  nonTestHttp.MEDIQ_ENV = "development";
  nonTestHttp.MEDIQ_OIDC_ISSUER = "http://127.0.0.1:4011/issuer";
  nonTestHttp.MEDIQ_OIDC_AUDIENCE = "mediq-api";
  nonTestHttp.MEDIQ_OIDC_JWKS_URI = "http://127.0.0.1:4011/jwks";
  assert.throws(() => parseAppConfig(nonTestHttp), /APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION/);

  const placeholderAudience = validEnvironment();
  placeholderAudience.MEDIQ_OIDC_ISSUER = "https://identity.example.test/issuer";
  placeholderAudience.MEDIQ_OIDC_AUDIENCE = "replace-before-start";
  placeholderAudience.MEDIQ_OIDC_JWKS_URI = "https://identity.example.test/jwks";
  assert.throws(() => parseAppConfig(placeholderAudience), /APP_CONFIG_INVALID:MEDIQ_OIDC_CONFIGURATION/);
});

test("rejects missing required configuration without exposing values", () => {
  const environment = validEnvironment();
  delete environment.MEDIQ_DATABASE_URL;
  assert.throws(() => parseAppConfig(environment), /^Error: APP_CONFIG_INVALID:MEDIQ_DATABASE_URL$/);
});

test("rejects placeholder credentials", () => {
  const environment = validEnvironment();
  environment.MEDIQ_DATABASE_URL = "postgresql://mediq_runtime:replace-before-start@postgres:5432/mediq";
  assert.throws(() => parseAppConfig(environment), /APP_CONFIG_INVALID:MEDIQ_DATABASE_URL/);
});

test("rejects bootstrap/superuser and migration credentials in the application process", () => {
  const environment = validEnvironment();
  environment.MEDIQ_POSTGRES_PASSWORD = "must-not-reach-app";
  assert.throws(() => parseAppConfig(environment), /APP_CONFIG_FORBIDDEN_VARIABLE:MEDIQ_POSTGRES_PASSWORD/);

  const superuserUrl = validEnvironment();
  superuserUrl.MEDIQ_DATABASE_URL = "postgresql://mediq:local-test-password@postgres:5432/mediq";
  assert.throws(() => parseAppConfig(superuserUrl), /DATABASE_ROLE_MUST_BE_MEDIQ_RUNTIME/);

  const encryptionPlaceholder = validEnvironment();
  encryptionPlaceholder.MEDIQ_ENCRYPTION_KEY = "change-me";
  assert.throws(() => parseAppConfig(encryptionPlaceholder), /APP_CONFIG_FORBIDDEN_VARIABLE:MEDIQ_ENCRYPTION_KEY/);

  const testPrivateKey = validEnvironment();
  testPrivateKey.MEDIQ_OIDC_TEST_PRIVATE_KEY = "not-allowed-in-api-runtime";
  assert.throws(() => parseAppConfig(testPrivateKey), /APP_CONFIG_FORBIDDEN_VARIABLE:MEDIQ_OIDC_TEST_PRIVATE_KEY/);
});

test("rejects host profile until a separately published host endpoint is approved", () => {
  const environment = validEnvironment();
  environment.MEDIQ_RUNTIME_PROFILE = "host";
  assert.throws(() => parseAppConfig(environment), /APP_CONFIG_UNSUPPORTED_RUNTIME_PROFILE/);
});

test("rejects host loopback or wrong PACS service aliases in container profile", () => {
  const environment = validEnvironment();
  environment.ORTHANC_A_URL = "https://localhost:14242";
  assert.throws(() => parseAppConfig(environment), /APP_CONFIG_INVALID:ORTHANC_A_URL/);

  const plaintext = validEnvironment();
  plaintext.ORTHANC_A_URL = "http://orthanc-a:8042";
  assert.throws(() => parseAppConfig(plaintext), /APP_CONFIG_INVALID:ORTHANC_A_URL/);

  const wrongHost = validEnvironment();
  wrongHost.ORTHANC_B_URL = "https://orthanc-a:8042";
  assert.throws(() => parseAppConfig(wrongHost), /APP_CONFIG_INVALID:ORTHANC_B_URL/);

  const wrongDatabaseHost = validEnvironment();
  wrongDatabaseHost.MEDIQ_DATABASE_URL = "postgresql://mediq_runtime:local-test-password@localhost:15432/mediq";
  assert.throws(() => parseAppConfig(wrongDatabaseHost), /APP_CONFIG_INVALID:MEDIQ_DATABASE_URL/);
});

test("rejects non-HTTPS and non-exact Orthanc origins", () => {
  for (const url of [
    "http://orthanc-a:8042",
    "https://untrusted.invalid:8042",
    "https://orthanc-a:8443",
    "https://user@orthanc-a:8042",
    "https://orthanc-a:8042/dicom-web",
    "https://orthanc-a:8042?target=other",
    "https://orthanc-a:8042#fragment",
  ]) {
    const environment = validEnvironment();
    environment.ORTHANC_A_URL = url;
    assert.throws(() => parseAppConfig(environment), /APP_CONFIG_INVALID:ORTHANC_A_URL/);
  }
});

test("rejects database user/name mismatch and invalid API port", () => {
  const wrongDatabase = validEnvironment();
  wrongDatabase.MEDIQ_DATABASE_URL = "postgresql://mediq_runtime:local-test-password@postgres:5432/other";
  assert.throws(() => parseAppConfig(wrongDatabase), /DATABASE_NAME_MISMATCH/);

  const invalidPort = validEnvironment();
  invalidPort.MEDIQ_API_PORT = "70000";
  assert.throws(() => parseAppConfig(invalidPort), /APP_CONFIG_INVALID:MEDIQ_API_PORT/);
});

test("rejects reused Hospital A and Hospital B passwords", () => {
  const environment = validEnvironment();
  environment.ORTHANC_B_PASSWORD = environment.ORTHANC_A_PASSWORD;
  assert.throws(() => parseAppConfig(environment), /ORTHANC_CREDENTIALS_MUST_BE_DISTINCT/);
});
