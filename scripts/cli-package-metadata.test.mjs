import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = path.join(repoRoot, "packages", "cli");

test("CLI npm package includes required legal and release guidance files", async () => {
  const packageJson = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  const requiredFiles = [
    "dist/bin.cjs",
    "README.md",
    "LICENSE",
    "LICENSES.md",
    "NOTICE",
    "THIRD_PARTY_NOTICES.md",
  ];

  for (const requiredFile of requiredFiles) {
    assert.ok(packageJson.files.includes(requiredFile), `${requiredFile} must be in the CLI npm package allowlist`);
    if (requiredFile !== "dist/bin.cjs") {
      await access(path.join(cliRoot, requiredFile));
    }
  }
});
