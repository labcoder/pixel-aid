import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { decodePngFile, encodePngFile } from "./imageIo";
import {
  createAutomationCancellationController,
  exportEngineBundle,
  extractPaletteFile,
  fixSprite,
  fixSpriteSheet,
  createQualityReport,
  inspectImage,
  suggestFixSettings,
  type AutomationProgressEvent,
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
      expect(result.value.source).toMatchObject({
        format: "png",
        normalizedFormat: "rgba",
        alpha: "preserved",
      });
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

  it("suggests foreground-cleaned grid and non-destructive cleanup for low-scale baked checkerboard sprites", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-baked-sprite-"));
    const input = path.join(dir, "baked-sprite.png");
    try {
      await encodePngFile(createLowScaleBakedCheckerboardSprite(), input);

      const result = await suggestFixSettings({ inputPath: input, options: { assetType: "sprite" } });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.options.assetType).toBe("sprite");
      expect(result.value.options.alpha).toBe("backgroundFloodFill");
      expect(result.value.options.downscale).toBe("dominant");
      expect(result.value.options.targetWidth).toBeLessThan(80);
      expect(result.value.options.targetHeight).toBeLessThan(90);
      expect(result.value.options.grid.scaleX).toBeLessThanOrEqual(3.25);
      expect(result.value.options.cleanup.removeOrphans).toBe(false);
      expect(result.value.options.cleanup.jaggyCleanup).toBe(false);
      expect(result.value.options.cleanup.removeHalos).toBe(false);
      expect(result.value.options.cleanup.denoiseStrength).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("suggests regular Codex-style pet atlases as animation sheets before tilemap fallbacks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-pet-atlas-"));
    const input = path.join(dir, "astro-atlas.png");
    try {
      await encodePngFile(createAutomationPetAtlasImage(), input);

      const result = await suggestFixSettings({ inputPath: input });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.options.assetType).toBe("animationSheet");
      expect(result.value.options.mode).toBe("spriteSheet");
      expect(result.value.options.targetWidth).toBe(1536);
      expect(result.value.options.targetHeight).toBe(1872);
      expect(result.value.options.maxColors).toBe(16);
      expect(result.value.options.alpha).toBe("binary");
      expect(result.value.options.alphaSettings?.decontaminateRgb).toBe(true);
      expect(result.value.options.cleanup.removeHalos).toBe(true);
      expect(result.value.options.cleanup.denoiseStrength).toBe(20);
      expect(result.value.options.cleanup.inferNativeScale).toBe(true);
      expect(result.value.options.grid.scaleX).toBe(1);
      expect(result.value.options.grid.scaleY).toBe(1);
      expect(result.value.options.sheet).toMatchObject({
        frameWidth: 192,
        frameHeight: 208,
        rows: 9,
        columns: 8
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("tightens cleanup suggestions for noisy soft-alpha pet atlases", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-noisy-pet-atlas-"));
    const input = path.join(dir, "astro-noisy-atlas.png");
    try {
      await encodePngFile(createSevereAutomationPetAtlasImage(), input);

      const result = await suggestFixSettings({ inputPath: input });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.options.assetType).toBe("animationSheet");
      expect(result.value.options.mode).toBe("spriteSheet");
      expect(result.value.options.maxColors).toBe(16);
      expect(result.value.options.alpha).toBe("binary");
      expect(result.value.options.cleanup.removeHalos).toBe(true);
      expect(result.value.options.cleanup.denoiseStrength).toBe(20);
      expect(result.value.options.cleanup.inferNativeScale).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
      const events: AutomationProgressEvent[] = [];

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
      }, {
        jobId: "fix-job-1",
        onProgress: (event) => events.push(event),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.files.map((file) => file.kind)).toEqual(["image", "manifest"]);
      expect(result.value.result.metrics.outputWidth).toBe(2);
      expect((await decodePngFile(out)).ok).toBe(true);
      const manifestJson = JSON.parse(await readFile(manifest, "utf8")) as { meta: { assetType: string } };
      expect(manifestJson.meta.assetType).toBe("sprite");
      expect(events[0]).toMatchObject({ operation: "fix_sprite", stage: "input-read", jobId: "fix-job-1" });
      expect(events.map((event) => event.stage)).toContain("downsampling");
      expect(events.at(-1)).toMatchObject({ operation: "fix_sprite", stage: "complete", percent: 100 });
    });
  });

  it("cancels a fix cooperatively before writing partial output", async () => {
    await withFixture(async ({ dir, input }) => {
      const out = path.join(dir, "out", "cancelled.png");
      const controller = createAutomationCancellationController();
      const events: AutomationProgressEvent[] = [];

      const result = await fixSprite({
        inputPath: input,
        outputPath: out,
        options: {
          assetType: "sprite",
          target: "2x2",
          maxColors: 4,
          grid: { detect: "manual", scale: 2 },
        },
      }, {
        signal: controller.signal,
        onProgress: (event) => {
          events.push(event);
          if (event.stage === "downsampling") {
            controller.cancel("Stop after first downsample progress");
          }
        },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({
        code: "cancelled",
        exitCode: 5,
      });
      expect(result.error.message).toContain("Stop after first downsample progress");
      await expect(stat(out)).rejects.toBeTruthy();
      expect(events.at(-1)).toMatchObject({ operation: "fix_sprite", stage: "cancelled", percent: 100 });
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
        targets: ["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"],
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
      expect(paths).toContain("tiled/input.fixed.tileset.json");
      expect(paths).toContain("ldtk/input_fixed.ldtk-tileset.json");
    });
  });

  it("classifies repeated map-like images as tilemaps and surfaces tile candidates", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-tilemap-"));
    const input = path.join(dir, "map.png");
    try {
      await encodePngFile(createRepeatedTilemapImage(8, 8, 16), input);

      const inspection = await inspectImage({ inputPath: input });
      const report = await createQualityReport({ inputPaths: [input] });

      expect(inspection.ok).toBe(true);
      expect(report.ok).toBe(true);
      if (!inspection.ok || !report.ok) return;
      expect(inspection.value.suggestion.options.assetType).toBe("tilemap");
      expect(inspection.value.diagnostics.tilemap?.selected).toMatchObject({
        tileWidth: 16,
        tileHeight: 16,
        rows: 8,
        columns: 8
      });
      expect(report.value.reports[0]?.assetType).toBe("tilemap");
      expect(report.value.reports[0]?.findings.map((finding) => finding.id)).toContain("tilemap-grid-candidate");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

function createRepeatedTilemapImage(columns: number, rows: number, tileSize: number): RGBAImage {
  const patterns = [
    [
      [38, 92, 48, 255],
      [48, 112, 58, 255],
      [30, 74, 42, 255],
      [72, 140, 80, 255]
    ],
    [
      [42, 98, 140, 255],
      [64, 126, 176, 255],
      [28, 72, 120, 255],
      [84, 150, 196, 255]
    ],
    [
      [120, 110, 66, 255],
      [150, 136, 82, 255],
      [96, 88, 54, 255],
      [176, 158, 96, 255]
    ],
    [
      [88, 88, 96, 255],
      [116, 118, 128, 255],
      [62, 64, 72, 255],
      [146, 148, 156, 255]
    ]
  ] as const;
  const data = new Uint8ClampedArray(columns * rows * tileSize * tileSize * 4);
  const image: RGBAImage = { width: columns * tileSize, height: rows * tileSize, data };
  const half = Math.floor(tileSize / 2);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pattern = patterns[(row + column * 3) % patterns.length]!;
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          const index = (x < half ? 0 : 1) + (y < half ? 0 : 2);
          const color = pattern[index]!;
          const offset = ((row * tileSize + y) * image.width + column * tileSize + x) * 4;
          image.data[offset] = color[0];
          image.data[offset + 1] = color[1];
          image.data[offset + 2] = color[2];
          image.data[offset + 3] = color[3];
        }
      }
    }
  }

  return image;
}

function createAutomationPetAtlasImage(): RGBAImage {
  const columns = 8;
  const rows = 9;
  const frameWidth = 192;
  const frameHeight = 208;
  const image: RGBAImage = {
    width: columns * frameWidth,
    height: rows * frameHeight,
    data: new Uint8ClampedArray(columns * frameWidth * rows * frameHeight * 4)
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellX = column * frameWidth;
      const cellY = row * frameHeight;
      const bob = row % 3;
      fillRect(image, cellX + 72, cellY + 20 + bob, 48, 14, [0, 255, 0, 180]);
      fillRect(image, cellX + 58, cellY + 42 + bob, 74, 62, [248, 248, 248, 255]);
      fillRect(image, cellX + 66, cellY + 52 + bob, 58, 38, [8, 12, 24, 255]);
      fillRect(image, cellX + 78, cellY + 66 + bob, 10, 8, [0, 220, 255, 255]);
      fillRect(image, cellX + 104, cellY + 66 + bob, 10, 8, [0, 220, 255, 255]);
      fillRect(image, cellX + 72, cellY + 104 + bob, 48, 48, [250, 250, 250, 255]);
      fillRect(image, cellX + 84, cellY + 106 + bob, 24, 28, [0, 128, 255, 255]);
      fillRect(image, cellX + 50, cellY + 120 + bob, 28, 46, [248, 248, 248, 255]);
      fillRect(image, cellX + 116, cellY + 120 + bob, 28, 46, [248, 248, 248, 255]);
      fillRect(image, cellX + 74, cellY + 152 + bob, 18, 42, [248, 248, 248, 255]);
      fillRect(image, cellX + 104, cellY + 152 + bob, 18, 42, [248, 248, 248, 255]);
    }
  }

  return image;
}

function createSevereAutomationPetAtlasImage(): RGBAImage {
  const image = createAutomationPetAtlasImage();
  const columns = 8;
  const rows = 9;
  const frameWidth = 192;
  const frameHeight = 208;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellX = column * frameWidth;
      const cellY = row * frameHeight;
      fillRect(image, cellX + 18, cellY + 94, frameWidth - 36, 14, [0, 255, 0, 170]);
      for (let y = cellY + 44; y < cellY + 154; y += 1) {
        for (let x = cellX + 52; x < cellX + 140; x += 1) {
          const offset = (y * image.width + x) * 4;
          image.data[offset] = (x * 17 + y * 11 + row * 19 + column * 23) % 256;
          image.data[offset + 1] = (x * 7 + y * 29 + row * 31 + column * 13) % 256;
          image.data[offset + 2] = (x * 37 + y * 5 + row * 17 + column * 41) % 256;
          image.data[offset + 3] = 255;
        }
      }
    }
  }

  return image;
}

function createLowScaleBakedCheckerboardSprite(): RGBAImage {
  const scale = 3;
  const nativeWidth = 91;
  const nativeHeight = 96;
  const image = {
    width: nativeWidth * scale,
    height: nativeHeight * scale,
    data: new Uint8ClampedArray(nativeWidth * nativeHeight * scale * scale * 4)
  } satisfies RGBAImage;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const darkCell = (Math.floor(x / 24) + Math.floor(y / 24)) % 2 === 1;
      const value = darkCell ? 202 : 250;
      const offset = (y * image.width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }

  fillScaledRect(image, scale, 31, 12, 29, 6, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 25, 18, 41, 20, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 28, 17, 35, 31, [253, 247, 219, 255]);
  fillScaledRect(image, scale, 20, 37, 16, 29, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 55, 37, 16, 29, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 37, 45, 17, 30, [253, 247, 219, 255]);
  fillScaledRect(image, scale, 30, 70, 13, 10, [114, 80, 65, 255]);
  fillScaledRect(image, scale, 49, 70, 13, 10, [114, 80, 65, 255]);
  fillScaledRect(image, scale, 32, 29, 7, 8, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 52, 29, 7, 8, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 43, 37, 5, 3, [22, 20, 31, 255]);
  fillScaledRect(image, scale, 39, 42, 13, 3, [22, 20, 31, 255]);

  return image;
}

function fillRect(
  image: RGBAImage,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * image.width + px) * 4;
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }
}

function fillScaledRect(
  image: RGBAImage,
  scale: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let py = y * scale; py < (y + height) * scale; py += 1) {
    for (let px = x * scale; px < (x + width) * scale; px += 1) {
      const offset = (py * image.width + px) * 4;
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }
}
