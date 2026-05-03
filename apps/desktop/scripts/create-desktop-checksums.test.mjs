import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDesktopChecksums } from "./create-desktop-checksums.mjs";

test("writes sorted sha256 checksums for desktop release artifacts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-checksums-"));
  try {
    await writeFile(path.join(dir, "PixelAid.msi"), "installer");
    await writeFile(path.join(dir, "PixelAid.dmg"), "disk-image");

    const result = await createDesktopChecksums({ artifactDir: dir });

    assert.equal(result.entries.length, 2);
    assert.deepEqual(result.entries.map((entry) => entry.relativePath), ["PixelAid.dmg", "PixelAid.msi"]);
    const contents = await readFile(result.outputPath, "utf8");
    assert.match(contents, /PixelAid\.dmg/);
    assert.match(contents, /PixelAid\.msi/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
