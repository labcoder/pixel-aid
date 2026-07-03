import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { fixSprite } from "./operations";
import { readRgbaImageFile } from "./imageIo";

const testDir = path.dirname(fileURLToPath(import.meta.url));
// The core golden is regenerated from the live guided suggestion + the user's single 128px size
// override (see packages/core/src/heroCatGolden.test.ts). This test proves the bare automation
// default (no autoSuggest field, no algorithm options) reproduces that web-guided output exactly,
// so CLI/MCP/automation cannot silently drift from the canonical web recommendation.
const heroCatSourcePath = path.resolve(testDir, "../../core/src/goldens/hero-cat-ai.png");
const guidedGoldenPath = path.resolve(testDir, "../../core/src/goldens/hero-cat-fixed-guided.png");

let tempDir: string | undefined;

afterAll(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("guided cross-surface consistency", () => {
  test("bare fixSprite with a target size reproduces the web guided golden pixel-for-pixel", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "pixelaid-guided-"));
    const outputPath = path.join(tempDir, "hero-cat-fixed.png");

    // No autoSuggest field: exercises the new guided-by-default path. The only override is the
    // target size, mirroring the real user flow (apply recommendation, then set 128px).
    const result = await fixSprite({
      inputPath: heroCatSourcePath,
      outputPath,
      options: { targetWidth: 128, targetHeight: 128 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const written = await readRgbaImageFile(outputPath);
    const golden = await readRgbaImageFile(guidedGoldenPath);
    expect(written.ok).toBe(true);
    expect(golden.ok).toBe(true);
    if (!written.ok || !golden.ok) {
      return;
    }

    // Compare decoded RGBA, not raw PNG bytes (encoder settings may differ between surfaces).
    expect(written.value.width).toBe(golden.value.width);
    expect(written.value.height).toBe(golden.value.height);
    expect(Buffer.from(written.value.data).equals(Buffer.from(golden.value.data))).toBe(true);

    const paletteCount = result.value.result.palette.length;
    expect(paletteCount).toBeLessThanOrEqual(24);
    expect(result.value.result.metrics.paletteCount).toBe(paletteCount);
  });
});
