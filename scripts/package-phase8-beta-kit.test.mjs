import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { getPhase8BetaKitName, packagePhase8BetaKit, parsePhase8PackageArgs } from "./package-phase8-beta-kit.mjs";

test("parses Phase 8 package arguments and names the kit", () => {
  assert.deepEqual(parsePhase8PackageArgs([]), { skipBuild: false });
  assert.deepEqual(parsePhase8PackageArgs(["--skip-build"]), { skipBuild: true });
  assert.equal(getPhase8BetaKitName("1.2.3"), "PixelAid-1.2.3-phase8-beta-kit");
});

test("packages local web, CLI, and unsigned Windows beta artifacts with checksums", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "pixelaid-phase8-package-"));
  try {
    await writeFixture(fixture);
    const result = await packagePhase8BetaKit({ packageRepoRoot: fixture, skipBuild: true, platform: "win32", arch: "x64" });
    const archive = unzipSync(new Uint8Array(await readFile(result.archivePath)));

    assert.ok(archive["packages/PixelAid-0.2.0-web-standalone.zip"]);
    assert.ok(archive["packages/pixelaid-0.2.0.tgz"]);
    assert.ok(archive["packages/PixelAid-0.2.0-windows-x64-portable.zip"]);
    assert.match(strFromU8(archive["README.txt"]), /Classic remains the default/u);
    assert.match(strFromU8(archive["SHA256SUMS.txt"]), /manifest\.json/u);
    const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
    assert.equal(manifest.publicationAuthorized, false);
    assert.equal(manifest.desktopSigned, false);
    assert.equal(manifest.files.some((entry) => entry.path === "packages/pixelaid-0.2.0.tgz"), true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function writeFixture(root) {
  await mkdir(path.join(root, "artifacts/web"), { recursive: true });
  await mkdir(path.join(root, "artifacts/cli"), { recursive: true });
  await mkdir(path.join(root, "artifacts/desktop"), { recursive: true });
  await mkdir(path.join(root, "docs/research"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "pixelaid", version: "0.2.0" }), "utf8");
  await writeFile(path.join(root, "artifacts/web/PixelAid-0.2.0-web-standalone.zip"), "web", "utf8");
  await writeFile(path.join(root, "artifacts/cli/pixelaid-0.2.0.tgz"), "cli", "utf8");
  await writeFile(path.join(root, "artifacts/desktop/PixelAid-0.2.0-windows-x64-portable.zip"), "desktop", "utf8");
  await writeFile(path.join(root, "docs/phase8-beta.md"), "reviewer guide", "utf8");
  await writeFile(path.join(root, "docs/research/robust-preview-phase-8-protocol.md"), "protocol", "utf8");
  await writeFile(path.join(root, "docs/robust-preview.md"), "robust", "utf8");
  for (const file of ["RELEASE_NOTES.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    await writeFile(path.join(root, file), file, "utf8");
  }
}
