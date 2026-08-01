import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import {
  getWebArtifactName,
  packageWebArtifact,
  parseWebPackageArgs,
  resolveWebPackageTarget
} from "./package-web-artifacts.mjs";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createWebPackageFixture() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pixelaid-web-package-test-"));
  await writeJson(path.join(repoRoot, "package.json"), {
    name: "pixelaid",
    version: "0.1.0"
  });
  await mkdir(path.join(repoRoot, "apps/web/dist/assets"), { recursive: true });
  await writeFile(path.join(repoRoot, "apps/web/dist/index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");
  await writeFile(path.join(repoRoot, "apps/web/dist/assets/app.js"), "console.log('PixelAid');\n", "utf8");

  for (const noticeFile of ["LICENSE", "NOTICE", "LICENSES.md", "THIRD_PARTY_NOTICES.md", "RELEASE_NOTES.md"]) {
    await writeFile(path.join(repoRoot, noticeFile), `${noticeFile} text\n`, "utf8");
  }

  return repoRoot;
}

test("resolves web package targets", () => {
  assert.equal(resolveWebPackageTarget(undefined), "standalone");
  assert.equal(resolveWebPackageTarget("itch"), "itch");
  assert.equal(resolveWebPackageTarget("standalone"), "standalone");
  assert.throws(
    () => resolveWebPackageTarget("desktop"),
    (error) => error.code === "INVALID_TARGET" && /itch/u.test(error.message)
  );
});

test("parses web package arguments", () => {
  assert.deepEqual(parseWebPackageArgs([]), { skipBuild: false, target: "standalone" });
  assert.deepEqual(parseWebPackageArgs(["itch", "--skip-build"]), { skipBuild: true, target: "itch" });
});

test("names web artifacts by version and target", () => {
  assert.equal(getWebArtifactName({ version: "1.2.3", target: "itch" }), "PixelAid-1.2.3-web-itch.zip");
  assert.equal(getWebArtifactName({ version: "1.2.3", target: "standalone" }), "PixelAid-1.2.3-web-standalone.zip");
});

test("packages an itch web build with index.html at the zip root", async () => {
  const repoRoot = await createWebPackageFixture();

  try {
    const result = await packageWebArtifact({ repoRoot, target: "itch", skipBuild: true });

    assert.equal(result.archivePath, path.join(repoRoot, "artifacts/web/PixelAid-0.1.0-web-itch.zip"));
    assert.equal(result.stageDir, path.join(repoRoot, "artifacts/web/staging/PixelAid-0.1.0-web-itch"));
    assert.match(await readFile(path.join(result.stageDir, "README.txt"), "utf8"), /Robust Preview is opt-in/u);

    const archive = unzipSync(new Uint8Array(await readFile(result.archivePath)));
    assert.equal(strFromU8(archive["index.html"]), "<!doctype html><div id=\"root\"></div>\n");
    assert.equal(strFromU8(archive["assets/app.js"]), "console.log('PixelAid');\n");
    assert.equal(strFromU8(archive["LICENSE"]), "LICENSE text\n");
    assert.equal(strFromU8(archive["RELEASE_NOTES.md"]), "RELEASE_NOTES.md text\n");
    assert.match(strFromU8(archive["README.txt"]), /Classic remains the default/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("builds with a relative Vite base before packaging", async () => {
  const repoRoot = await createWebPackageFixture();
  const calls = [];

  try {
    await packageWebArtifact({
      repoRoot,
      target: "standalone",
      skipBuild: false,
      runCommand: async (command, options = {}) => {
        calls.push({ command, env: options.env });
      }
    });

    assert.deepEqual(calls[0].command.slice(0, 5), ["npm", "run", "build", "-w", "@pixelaid/web"]);
    assert.equal(calls[0].env.PIXELAID_WEB_BASE, "./");
    assert.equal(calls[0].env.PIXELAID_WEB_PACKAGE_TARGET, "standalone");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
