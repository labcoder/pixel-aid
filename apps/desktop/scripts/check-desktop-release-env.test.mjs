import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesktopReleaseEnv, parseDesktopReleaseCheckArgs } from "./check-desktop-release-env.mjs";

test("allows explicit unsigned desktop release checks for local dry runs", () => {
  const result = evaluateDesktopReleaseEnv({ platform: "win32", env: {}, allowUnsigned: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.warnings.join("\n"), /unsigned/);
});

test("fails Windows release checks when signing configuration is absent", () => {
  const result = evaluateDesktopReleaseEnv({ platform: "win32", env: {}, allowUnsigned: false });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    "WINDOWS_SIGNING_ENDPOINT + WINDOWS_SIGNING_ACCOUNT_NAME + WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME or WINDOWS_SIGNING_CERT_PATH or WINDOWS_SIGNING_COMMAND",
  ]);
});

test("accepts Windows Artifact Signing configuration", () => {
  const result = evaluateDesktopReleaseEnv({
    platform: "win32",
    allowUnsigned: false,
    env: {
      WINDOWS_SIGNING_ENDPOINT: "https://wus2.codesigning.azure.net",
      WINDOWS_SIGNING_ACCOUNT_NAME: "examplecodesign",
      WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME: "examplepublic",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("accepts macOS notarization with app store connect API credentials", () => {
  const result = evaluateDesktopReleaseEnv({
    platform: "darwin",
    allowUnsigned: false,
    env: {
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_API_KEY: "AuthKey_1234567890",
      APPLE_API_ISSUER: "f0e1d2c3-b4a5-6789-cdef-0123456789ab",
      APPLE_API_KEY_PATH: "/secure/AuthKey_1234567890.p8",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("rejects macOS API notarization when issuer is not UUID-only", () => {
  const result = evaluateDesktopReleaseEnv({
    platform: "darwin",
    allowUnsigned: false,
    env: {
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_API_KEY: "AuthKey_1234567890",
      APPLE_API_ISSUER: "NOT_A_UUID_VALUE",
      APPLE_API_KEY_PATH: "/secure/AuthKey_1234567890.p8",
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["APPLE_API_ISSUER must be a UUID-only App Store Connect issuer ID"]);
});

test("parses release check env-file options", () => {
  assert.deepEqual(parseDesktopReleaseCheckArgs(["--platform", "darwin", "--env-file", ".env.local"]), {
    allowUnsigned: false,
    envFile: ".env.local",
    noEnvFile: false,
    platform: "darwin",
  });
  assert.deepEqual(parseDesktopReleaseCheckArgs(["--no-env-file"]), {
    allowUnsigned: false,
    envFile: undefined,
    noEnvFile: true,
    platform: process.platform,
  });
});

test("uses the last repeated release check value flag", () => {
  assert.equal(parseDesktopReleaseCheckArgs(["--platform", "all", "--platform", "darwin"]).platform, "darwin");
});

test("rejects conflicting release check env-file options", () => {
  assert.throws(
    () => parseDesktopReleaseCheckArgs(["--env-file", ".env", "--no-env-file"]),
    /Use either --env-file or --no-env-file/u,
  );
});
