import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadRepoEnv, parseEnvFile, resolveUserPath } from "./desktop-env.mjs";

test("parses local .env values without shelling out", () => {
  assert.deepEqual(
    parseEnvFile([
      "# local signing settings",
      "APPLE_SIGNING_IDENTITY=\"Developer ID Application: Example\"",
      "export APPLE_API_KEY=ABC123 # key id",
      "APPLE_API_ISSUER='issuer-id'",
      "APPLE_API_KEY_PATH=$HOME/.appstoreconnect/private_keys/AuthKey_ABC123.p8",
      "",
    ].join("\n")),
    {
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_API_KEY: "ABC123",
      APPLE_API_ISSUER: "issuer-id",
      APPLE_API_KEY_PATH: "$HOME/.appstoreconnect/private_keys/AuthKey_ABC123.p8",
    },
  );
});

test("rejects malformed .env entries", () => {
  assert.throws(
    () => parseEnvFile("APPLE SIGNING IDENTITY=value\n"),
    (error) => error.code === "INVALID_ENV_KEY",
  );
  assert.throws(
    () => parseEnvFile("APPLE_SIGNING_IDENTITY\n"),
    (error) => error.code === "INVALID_ENV_LINE",
  );
});

test("loads repo .env values with process env taking precedence", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pixelaid-env-test-"));
  try {
    await writeFile(path.join(repoRoot, ".env"), "APPLE_API_KEY=file-key\nAPPLE_API_ISSUER=file-issuer\n", "utf8");

    const result = await loadRepoEnv({
      repoRoot,
      env: {
        APPLE_API_KEY: "shell-key",
      },
    });

    assert.equal(result.loaded, true);
    assert.equal(result.env.APPLE_API_KEY, "shell-key");
    assert.equal(result.env.APPLE_API_ISSUER, "file-issuer");
    assert.equal(await readFile(result.envFile, "utf8"), "APPLE_API_KEY=file-key\nAPPLE_API_ISSUER=file-issuer\n");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("missing repo .env is optional", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pixelaid-env-missing-test-"));
  try {
    const result = await loadRepoEnv({ repoRoot, env: { PATH: "/bin" } });

    assert.equal(result.loaded, false);
    assert.deepEqual(result.env, { PATH: "/bin" });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("resolves home-relative API key paths", () => {
  assert.equal(resolveUserPath("~/key.p8", { homeDir: "/Users/example" }), "/Users/example/key.p8");
  assert.equal(resolveUserPath("$HOME/key.p8", { homeDir: "/Users/example" }), "/Users/example/key.p8");
  assert.equal(resolveUserPath("/secure/key.p8", { homeDir: "/Users/example" }), "/secure/key.p8");
});
