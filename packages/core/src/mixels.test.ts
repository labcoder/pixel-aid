import path from "node:path";
import { describe, expect, test } from "vitest";
import type { FixOptions, MixelReport, RGBAImage } from "@pixelaid/shared";
import { fixImage } from "./fix";
import { createImage, readPixel, writePixel } from "./image";
import { regularizeMixels } from "./mixels";
import { readGoldenPng } from "./goldenImage.test-utils";

type ColorFamily = "dark" | "pinkish" | "light" | "green" | "other";

describe("structure-guarded mixel regularization", () => {
  test("flattens noisy homogeneous cells", () => {
    const image = createImage(4, 4, [0, 0, 0, 0]);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const jitter = ((x * 7 + y * 11) % 17) - 8;
        writePixel(image, x, y, 82 + jitter, 146 + jitter, 96 + jitter, 255);
      }
    }

    const result = regularizeMixels(image, oneCellReport(4, 4));
    const [r, g, b, a] = readPixel(result.image, 0, 0);

    expect(a).toBe(255);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        expect(readPixel(result.image, x, y)).toEqual([r, g, b, 255]);
      }
    }
    expect(result.diagnostics.notes.some((note) => note.includes("flattened 1 low-structure cells; preserved 0 structured cells"))).toBe(true);
  });

  test("preserves opaque cells with multiple distinct color structures verbatim", () => {
    const image = createImage(4, 4, [0, 0, 0, 0]);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const color = x < 2 ? ([18, 22, 26, 255] as const) : ([242, 210, 218, 255] as const);
        writePixel(image, x, y, color[0], color[1], color[2], color[3]);
      }
    }

    const result = regularizeMixels(image, oneCellReport(4, 4));

    expect(Array.from(result.image.data)).toEqual(Array.from(image.data));
    expect(result.diagnostics.notes.some((note) => note.includes("flattened 0 low-structure cells; preserved 1 structured cells"))).toBe(true);
  });

  test("preserves silhouette-straddling mixed-alpha cells verbatim", () => {
    const image = createImage(4, 4, [0, 0, 0, 0]);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        if (x < 2) {
          writePixel(image, x, y, 0, 0, 0, 0);
        } else {
          writePixel(image, x, y, 40 + y * 8, 120 + x * 5, 80, 255);
        }
      }
    }

    const result = regularizeMixels(image, oneCellReport(4, 4));

    expect(Array.from(result.image.data)).toEqual(Array.from(image.data));
  });

  test("hero cat guided output keeps structured edge and nose cells", () => {
    const source = readGoldenPng(path.resolve("src/goldens/hero-cat-ai.png"));
    const result = fixImage(source, heroCatValidationOptions(true));
    const edge = edgeAudit(result.image);
    const nose = regionAudit(result.image, 52, 54, 77, 76);

    expect(edge.dark).toBeLessThanOrEqual(168);
    expect(edge.pinkish).toBeLessThanOrEqual(17);
    expect(nose.dark).toBeGreaterThanOrEqual(80);
    expect(nose.pinkish).toBeGreaterThanOrEqual(30);
    expect(result.diagnostics?.mixels?.notes.some((note: string) => /Regularized \d+ cells; flattened \d+ low-structure cells; preserved \d+ structured cells/.test(note))).toBe(true);
  });
});

function oneCellReport(width: number, height: number): MixelReport {
  return {
    hasMixels: true,
    axisX: { medianBlock: width, minBlock: width, maxBlock: width, irregularity: 0.8, boundaries: [0, width] },
    axisY: { medianBlock: height, minBlock: height, maxBlock: height, irregularity: 0.8, boundaries: [0, height] },
    targetScaleX: width,
    targetScaleY: height,
    confidence: 1,
    notes: ["synthetic mixel report"]
  };
}

function heroCatValidationOptions(fixMixels: boolean): FixOptions {
  return {
    mode: "single",
    assetType: "sprite",
    targetWidth: 128,
    targetHeight: 128,
    maxColors: 24,
    paletteSettings: {
      mode: "auto",
      strategy: "perceptual",
      maxColors: 24,
      lockScope: "single",
      dithering: "none",
      colorSpace: "oklab",
      weighting: "area",
      minRegion: 1,
      protectColors: "auto",
      protectSalientColors: true
    },
    grid: {
      detect: "auto",
      scaleX: 9.796875,
      scaleY: 9.796875,
      cropToBounds: false,
      localCorrection: false,
      fixMixels,
      phaseX: 0,
      phaseY: 0
    },
    downscale: "adaptive",
    alpha: "backgroundFloodFill",
    alphaSettings: {
      threshold: 128,
      tolerance: 18,
      colorKey: "#ffffff",
      decontaminateRgb: true,
      transparentRgb: "#000000"
    },
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      dominantThreshold: 0.6,
      inferNativeScale: false,
      morphology: {
        enabled: true,
        close: false,
        fillTinyHoles: false,
        removeTinyComponents: false,
        preserveSinglePixelDetails: true,
        maxHolePixels: 1,
        maxComponentPixels: 1,
        matteCleanup: true,
        alphaThreshold: 128,
        connectivity: 8
      },
      outlineMode: "none",
      outlineSize: 1
    }
  };
}

function edgeAudit(image: RGBAImage): Record<ColorFamily | "total", number> {
  const counts = { total: 0, dark: 0, pinkish: 0, light: 0, green: 0, other: 0 };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const idx = (y * image.width + x) * 4;
      if (image.data[idx + 3]! < 128 || !touchesTransparency(image, x, y)) continue;
      counts.total += 1;
      counts[classifyColor(image.data[idx]!, image.data[idx + 1]!, image.data[idx + 2]!)] += 1;
    }
  }
  return counts;
}

function regionAudit(image: RGBAImage, x0: number, y0: number, x1: number, y1: number): Record<ColorFamily | "total", number> {
  const counts = { total: 0, dark: 0, pinkish: 0, light: 0, green: 0, other: 0 };
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const idx = (y * image.width + x) * 4;
      if (image.data[idx + 3]! < 128) continue;
      counts.total += 1;
      counts[classifyColor(image.data[idx]!, image.data[idx + 1]!, image.data[idx + 2]!)] += 1;
    }
  }
  return counts;
}

function touchesTransparency(image: RGBAImage, x: number, y: number): boolean {
  if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) return true;
  return alphaAt(image, x - 1, y) < 128 || alphaAt(image, x + 1, y) < 128 || alphaAt(image, x, y - 1) < 128 || alphaAt(image, x, y + 1) < 128;
}

function alphaAt(image: RGBAImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3]!;
}

function classifyColor(r: number, g: number, b: number): ColorFamily {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 80) return "dark";
  if (r > g + 20 && b > g - 10 && r > 120) return "pinkish";
  if (r > 190 && g > 190 && b > 170) return "light";
  if (g > r + 10 && g > b + 10) return "green";
  return "other";
}
