import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { decodePngFile, encodePngFile } from "./imageIo";
import {
  exportEngineBundle,
  extractPaletteFile,
  fixSprite,
  fixSpriteSheet,
  createQualityReport,
  inspectImage,
  suggestFixSettings,
} from "./operations";

async function withFixture<T>(run: (paths: { dir: string; input: string }) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-ops-"));
  const input = path.join(dir, "input.png");
  try {
    await encodePngFile(createFixtureImage(), input);
    return await run({ dir, input });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("automation operations", () => {
  it("inspects image dimensions, colors, grid candidates, and suggestions", async () => {
    await withFixture(async ({ input }) => {
      const result = await inspectImage({ inputPath: input });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.image.width).toBe(4);
      expect(result.value.image.height).toBe(4);
      expect(result.value.palette.exactColorCount).toBeGreaterThan(1);
      expect(result.value.gridCandidates.length).toBeGreaterThan(0);
      expect(result.value.suggestion.options.assetType).toBe("sprite");
    });
  });

  it("suggests normalized fix options without writing files", async () => {
    await withFixture(async ({ input }) => {
      const result = await suggestFixSettings({ inputPath: input, options: { assetType: "icon", target: "2x2", maxColors: 4 } });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.options.assetType).toBe("icon");
      expect(result.value.options.targetWidth).toBe(2);
      expect(result.value.options.targetHeight).toBe(2);
      expect(result.value.options.maxColors).toBe(4);
    });
  });

  it("creates a deterministic non-destructive batch quality report", async () => {
    await withFixture(async ({ dir, input }) => {
      const second = path.join(dir, "background.png");
      await encodePngFile(createFixtureImage(), second);

      const result = await createQualityReport({
        assets: [
          { inputPath: input, options: { assetType: "sprite", maxColors: 3 } },
          { inputPath: second, options: { assetType: "background", maxColors: 64 } },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.assetCount).toBe(2);
      expect(result.value.reports.map((report) => report.assetType)).toEqual(["sprite", "background"]);
      expect(result.value.reports[0]?.findings.some((finding) => finding.id === "palette-over-budget")).toBe(true);
      expect(result.value.reports[1]?.findings.some((finding) => finding.id === "asset-inspect-only")).toBe(true);
      expect(JSON.parse(JSON.stringify(result.value))).toMatchObject({
        summary: { assetCount: 2 },
      });
    });
  });

  it("fixes a single sprite and writes a manifest", async () => {
    await withFixture(async ({ dir, input }) => {
      const out = path.join(dir, "out", "fixed.png");
      const manifest = path.join(dir, "out", "fixed.json");

      const result = await fixSprite({
        inputPath: input,
        outputPath: out,
        manifestPath: manifest,
        options: {
          assetType: "sprite",
          target: "2x2",
          maxColors: 4,
          grid: { detect: "manual", scale: 2 },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.files.map((file) => file.kind)).toEqual(["image", "manifest"]);
      expect(result.value.result.metrics.outputWidth).toBe(2);
      expect((await decodePngFile(out)).ok).toBe(true);
      const manifestJson = JSON.parse(await readFile(manifest, "utf8")) as { meta: { assetType: string } };
      expect(manifestJson.meta.assetType).toBe("sprite");
    });
  });

  it("fixes a sprite sheet from explicit frames", async () => {
    await withFixture(async ({ dir, input }) => {
      const outDir = path.join(dir, "sheet-out");
      const result = await fixSpriteSheet({
        inputPath: input,
        outDir,
        detectSheet: false,
        frames: [
          { name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 }, sourceRect: { x: 0, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120, tags: ["idle"] },
          { name: "idle_001", rect: { x: 2, y: 0, w: 2, h: 2 }, sourceRect: { x: 2, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120, tags: ["idle"] },
        ],
        options: {
          assetType: "animation",
          maxColors: 4,
          grid: { detect: "manual", scale: 1 },
          sheet: { frameWidth: 2, frameHeight: 2, rows: 1, columns: 2, margin: 0, spacing: 0, extrude: 0 },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.manifest.frames).toHaveLength(2);
      expect(result.value.manifest.animations.idle.frames).toEqual(["idle_000", "idle_001"]);
      await expect(stat(path.join(outDir, "input.fixed.png"))).resolves.toBeTruthy();
    });
  });

  it("extracts palettes as hex and JSON files", async () => {
    await withFixture(async ({ dir, input }) => {
      const hexPath = path.join(dir, "palette.hex");
      const jsonPath = path.join(dir, "palette.json");

      const hex = await extractPaletteFile({ inputPath: input, outputPath: hexPath, maxColors: 3 });
      const json = await extractPaletteFile({ inputPath: input, outputPath: jsonPath, maxColors: 3 });

      expect(hex.ok).toBe(true);
      expect(json.ok).toBe(true);
      expect(await readFile(hexPath, "utf8")).toContain("#");
      expect(JSON.parse(await readFile(jsonPath, "utf8"))).toMatchObject({ app: "PixelAid", colorCount: 3 });
    });
  });

  it("exports generic and engine bundle files", async () => {
    await withFixture(async ({ dir, input }) => {
      const outDir = path.join(dir, "bundle");

      const result = await exportEngineBundle({
        inputPath: input,
        outDir,
        targets: ["godot", "unity", "phaser", "texturepacker"],
        options: {
          assetType: "sprite",
          target: "2x2",
          maxColors: 4,
          grid: { detect: "manual", scale: 2 },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((file) => file.relativePath);
      expect(paths).toContain("input.fixed.png");
      expect(paths).toContain("input.manifest.json");
      expect(paths).toContain("input.palette.hex");
      expect(paths).toContain("engines/README.md");
      expect(paths).toContain("texturepacker/input.fixed.json");
    });
  });
});

function createFixtureImage(): RGBAImage {
  return {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255,
    ]),
  };
}
