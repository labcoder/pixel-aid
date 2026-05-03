import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesktopReleaseEnv } from "./check-desktop-release-env.mjs";

test("allows explicit unsigned desktop release checks for local dry runs", () => {
  const result = evaluateDesktopReleaseEnv({ platform: "win32", env: {}, allowUnsigned: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.warnings.join("\n"), /unsigned/);
});

test("fails Windows release checks when signing configuration is absent", () => {
  const result = evaluateDesktopReleaseEnv({ platform: "win32", env: {}, allowUnsigned: false });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["WINDOWS_SIGNING_CERT_PATH or WINDOWS_SIGNING_COMMAND"]);
});

test("accepts macOS notarization with app store connect API credentials", () => {
  const result = evaluateDesktopReleaseEnv({
    platform: "darwin",
    allowUnsigned: false,
    env: {
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Mighty Games",
      APPLE_API_KEY: "AuthKey_1234567890",
      APPLE_API_ISSUER: "issuer-id",
      APPLE_API_KEY_PATH: "/secure/AuthKey_1234567890.p8",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});
