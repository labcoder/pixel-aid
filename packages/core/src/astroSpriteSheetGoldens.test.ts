import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixImage, suggestFixSettings } from "./index";
import { compareGoldenImage, readGoldenPng, readGoldenWebp } from "./goldenImage.test-utils";
import type { FixOptions, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");
const cleanAstroSheetPath = path.join(goldenDir, "astro-spritesheet-normalized-fixed.png");
const noisyAstroSheetPath = path.join(goldenDir, "astro-spritesheet-source.webp");
const hollowKnightSheetPath = path.join(goldenDir, "hollowknight-source.webp");
const cleanHollowKnightSheetPath = path.join(goldenDir, "hollowknight-unfake-pixel-art-scaled.png");
const samuraiMagentaSheetPath = path.join(goldenDir, "samurai-magenta.png");

type AlphaMaskDiff = {
  falseOpaque: number;
  falseTransparent: number;
  bothOpaqueChanged: number;
};

function buildFixOptions(image: RGBAImage): FixOptions {
  const suggestion = suggestFixSettings(image);
  const sheet = suggestion.sheetLayout;
  return {
    mode: suggestion.mode,
    assetType: suggestion.assetType,
    targetWidth: suggestion.targetWidth,
    targetHeight: suggestion.targetHeight,
    maxColors: suggestion.maxColors,
    paletteSettings: {
      mode: "auto",
      strategy: suggestion.paletteStrategy,
      maxColors: suggestion.maxColors,
      lockScope: suggestion.mode === "single" ? "single" : "sheet",
      dithering: "none"
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: suggestion.gridScaleX,
      scaleY: suggestion.gridScaleY,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: false,
      localCorrection: suggestion.localCorrection
    },
    downscale: suggestion.downscale,
    alpha: suggestion.alpha,
    alphaSettings: suggestion.alphaSettings,
    cleanup: {
      removeOrphans: suggestion.removeOrphans,
      jaggyCleanup: suggestion.jaggyCleanup,
      preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
      removeHalos: suggestion.removeHalos,
      denoiseStrength: suggestion.denoiseStrength,
      inferNativeScale: suggestion.inferNativeScale,
      ...(suggestion.contrastExpansionEnabled ? { contrastExpansion: { enabled: true } } : {}),
      outlineMode: suggestion.outlineMode,
      outlineSize: suggestion.outlineSize,
      outlineSourceColors: suggestion.outlineSourceColors,
      ...(suggestion.matteCleanup
        ? {
            morphology: {
              enabled: true,
              matteCleanup: true,
              alphaThreshold: suggestion.alphaSettings.threshold ?? 128
            }
          }
        : {})
    },
    ...(sheet ? buildSheetOptions(sheet) : {})
  };
}

function buildSheetOptions(sheet: SheetLayoutDetection): Pick<FixOptions, "sheet" | "sheetFrames"> {
  return {
    sheet: {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      rows: sheet.rows,
      columns: sheet.columns,
      margin: sheet.margin,
      spacing: sheet.spacing,
      extrude: 0
    },
    sheetFrames: sheet.frames
  };
}

function countExactRgbaColors(image: RGBAImage): number {
  const colors = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]},${image.data[offset + 3]}`);
  }
  return colors.size;
}

function countVisibleGreenMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a > 0 && g > r * 1.2 && g > b * 1.2 && g - r > 20) {
      count += 1;
    }
  }
  return count;
}

function countVisibleMagentaMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a > 0 && r > 90 && b > 64 && g < Math.min(r, b) - 20) {
      count += 1;
    }
  }
  return count;
}

function countStrongVisibleMagentaMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a > 0 && r >= 170 && b >= 150 && g <= 90 && Math.min(r, b) - g >= 80) {
      count += 1;
    }
  }
  return count;
}

function countTransparentPixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset]! === 0) {
      count += 1;
    }
  }
  return count;
}

function compareAlphaMasks(actual: RGBAImage, expected: RGBAImage): AlphaMaskDiff {
  const width = Math.min(actual.width, expected.width);
  const height = Math.min(actual.height, expected.height);
  let falseOpaque = 0;
  let falseTransparent = 0;
  let bothOpaqueChanged = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const actualOffset = (y * actual.width + x) * 4;
      const expectedOffset = (y * expected.width + x) * 4;
      const actualAlpha = actual.data[actualOffset + 3]!;
      const expectedAlpha = expected.data[expectedOffset + 3]!;
      if (actualAlpha > 0 && expectedAlpha === 0) {
        falseOpaque += 1;
        continue;
      }
      if (actualAlpha === 0 && expectedAlpha > 0) {
        falseTransparent += 1;
        continue;
      }
      if (actualAlpha === 0 || expectedAlpha === 0) {
        continue;
      }
      if (
        Math.abs(actual.data[actualOffset]! - expected.data[expectedOffset]!) > 40 ||
        Math.abs(actual.data[actualOffset + 1]! - expected.data[expectedOffset + 1]!) > 40 ||
        Math.abs(actual.data[actualOffset + 2]! - expected.data[expectedOffset + 2]!) > 40
      ) {
        bothOpaqueChanged += 1;
      }
    }
  }

  return { falseOpaque, falseTransparent, bothOpaqueChanged };
}

function cropTopLeft(image: RGBAImage, width: number, height: number): RGBAImage {
  const croppedWidth = Math.min(image.width, width);
  const croppedHeight = Math.min(image.height, height);
  const data = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);
  for (let y = 0; y < croppedHeight; y += 1) {
    const sourceStart = y * image.width * 4;
    const targetStart = y * croppedWidth * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + croppedWidth * 4), targetStart);
  }
  return {
    width: croppedWidth,
    height: croppedHeight,
    data
  };
}

function cropRect(image: RGBAImage, rect: { x: number; y: number; w: number; h: number }): RGBAImage {
  const croppedWidth = Math.max(1, Math.min(rect.w, image.width - rect.x));
  const croppedHeight = Math.max(1, Math.min(rect.h, image.height - rect.y));
  const data = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);
  for (let y = 0; y < croppedHeight; y += 1) {
    const sourceStart = ((rect.y + y) * image.width + rect.x) * 4;
    const targetStart = y * croppedWidth * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + croppedWidth * 4), targetStart);
  }
  return {
    width: croppedWidth,
    height: croppedHeight,
    data
  };
}

function sheetFrameRect(row: number, column: number): { x: number; y: number; w: number; h: number } {
  return {
    x: column * 192,
    y: row * 208,
    w: 192,
    h: 208
  };
}

describe("astro sprite sheet golden regressions", () => {
  test("preserves the clean normalized astro sheet exactly", () => {
    const source = readGoldenPng(cleanAstroSheetPath);
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));
    const comparison = compareGoldenImage(result.image, source, { mode: "exact" });

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout?.columns).toBe(8);
    expect(suggestion.sheetLayout?.rows).toBe(9);
    expect(suggestion.sheetLayout?.frameWidth).toBe(192);
    expect(suggestion.sheetLayout?.frameHeight).toBe(208);
    expect(suggestion.targetWidth).toBe(source.width);
    expect(suggestion.targetHeight).toBe(source.height);
    expect(suggestion.maxColors).toBeGreaterThanOrEqual(countExactRgbaColors(source));
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expect(suggestion.alpha).toBe("preserve");
    expect(suggestion.matteCleanup).toBe(false);
    expect(suggestion.removeHalos).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.denoiseStrength).toBe(0);
    expect(comparison.message).toBe("Golden matched 1536x1872; changed pixels 0, max channel delta 0.");
    expect(comparison.matches).toBe(true);
  }, 10_000);

  test("recovers the noisy astro WebP toward the normalized sheet golden", async () => {
    const source = await readGoldenWebp(noisyAstroSheetPath);
    const golden = readGoldenPng(cleanAstroSheetPath);
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));
    const comparison = compareGoldenImage(result.image, golden, {
      mode: "tolerance",
      perChannelTolerance: 40,
      allowedChangedPixels: 300_000
    });
    const alphaDiff = compareAlphaMasks(result.image, golden);

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout?.columns).toBe(8);
    expect(suggestion.sheetLayout?.rows).toBe(9);
    expect(suggestion.sheetLayout?.frameWidth).toBe(192);
    expect(suggestion.sheetLayout?.frameHeight).toBe(208);
    expect(suggestion.targetWidth).toBe(golden.width);
    expect(suggestion.targetHeight).toBe(golden.height);
    expect(suggestion.removeOrphans).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.contrastExpansionEnabled).toBe(false);
    expect(suggestion.outlineMode).toBe("none");
    expect(result.image.width).toBe(golden.width);
    expect(result.image.height).toBe(golden.height);
    expect(countExactRgbaColors(result.image)).toBeLessThanOrEqual(32);
    expect(countVisibleGreenMattePixels(result.image)).toBeLessThan(countVisibleGreenMattePixels(source) * 0.2);
    expect(alphaDiff.falseOpaque).toBeLessThanOrEqual(130_000);
    expect(alphaDiff.falseTransparent).toBeLessThanOrEqual(12_000);
    expect(alphaDiff.bothOpaqueChanged).toBeLessThanOrEqual(220_000);
    expect(comparison.message).toContain("Golden matched");
    expect(comparison.matches).toBe(true);
  }, 10_000);

  test("preserves the first noisy astro source frame without crispy line repair artifacts", async () => {
    const source = await readGoldenWebp(noisyAstroSheetPath);
    const golden = readGoldenPng(cleanAstroSheetPath);
    const result = fixImage(source, buildFixOptions(source));
    const frame = sheetFrameRect(0, 0);
    const actualFrame = cropRect(result.image, frame);
    const goldenFrame = cropRect(golden, frame);
    const comparison = compareGoldenImage(actualFrame, goldenFrame, {
      mode: "tolerance",
      perChannelTolerance: 32,
      allowedChangedPixels: 6_000
    });
    const alphaDiff = compareAlphaMasks(actualFrame, goldenFrame);

    expect(alphaDiff.falseOpaque).toBeLessThanOrEqual(2_800);
    expect(alphaDiff.falseTransparent).toBeLessThanOrEqual(500);
    expect(alphaDiff.bothOpaqueChanged).toBeLessThanOrEqual(4_250);
    expect(comparison.message).toContain("Golden matched");
    expect(comparison.matches).toBe(true);
  }, 10_000);

  test("recovers the noisy Hollow Knight WebP toward the cleaned sheet golden", async () => {
    const source = await readGoldenWebp(hollowKnightSheetPath);
    const golden = readGoldenPng(cleanHollowKnightSheetPath);
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));
    const comparableResult = cropTopLeft(result.image, golden.width, golden.height);
    const comparison = compareGoldenImage(comparableResult, golden, {
      mode: "tolerance",
      perChannelTolerance: 40,
      allowedChangedPixels: 190_000
    });
    const alphaDiff = compareAlphaMasks(comparableResult, golden);

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout?.columns).toBe(8);
    expect(suggestion.sheetLayout?.rows).toBe(9);
    expect(suggestion.sheetLayout?.frameWidth).toBe(192);
    expect(suggestion.sheetLayout?.frameHeight).toBe(208);
    expect(suggestion.removeOrphans).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.contrastExpansionEnabled).toBe(false);
    expect(suggestion.outlineMode).toBe("none");
    expect(result.image.width).toBe(source.width);
    expect(result.image.height).toBe(source.height);
    expect(countExactRgbaColors(result.image)).toBeLessThanOrEqual(32);
    expect(countVisibleMagentaMattePixels(result.image)).toBeLessThan(20);
    expect(alphaDiff.falseOpaque).toBeLessThanOrEqual(45_000);
    expect(alphaDiff.falseTransparent).toBeLessThanOrEqual(80_000);
    expect(alphaDiff.bothOpaqueChanged).toBeLessThanOrEqual(110_000);
    expect(comparison.message).toContain("Golden matched");
    expect(comparison.matches).toBe(true);
  }, 10_000);

  test("preserves Hollow Knight row 7 chair frame linework while removing matte artifacts", async () => {
    const source = await readGoldenWebp(hollowKnightSheetPath);
    const golden = readGoldenPng(cleanHollowKnightSheetPath);
    const result = fixImage(source, buildFixOptions(source));
    const frame = sheetFrameRect(6, 4);
    const actualFrame = cropRect(result.image, frame);
    const goldenFrame = cropRect(golden, frame);
    const comparison = compareGoldenImage(actualFrame, goldenFrame, {
      mode: "tolerance",
      perChannelTolerance: 32,
      allowedChangedPixels: 6_000
    });
    const alphaDiff = compareAlphaMasks(actualFrame, goldenFrame);

    expect(countVisibleMagentaMattePixels(cropRect(result.image, sheetFrameRect(6, 1)))).toBe(0);
    expect(countVisibleMagentaMattePixels(actualFrame)).toBe(0);
    expect(alphaDiff.falseOpaque).toBeLessThanOrEqual(1_800);
    expect(alphaDiff.falseTransparent).toBeLessThanOrEqual(2_200);
    expect(alphaDiff.bothOpaqueChanged).toBeLessThanOrEqual(3_600);
    expect(comparison.message).toContain("Golden matched");
    expect(comparison.matches).toBe(true);
  }, 10_000);

  test("removes magenta matte from Samurai animation sheets instead of repairing it as outline", () => {
    const source = readGoldenPng(samuraiMagentaSheetPath);
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(suggestion.outlineMode).toBe("none");
    expect(suggestion.outlineSourceColors).toEqual([]);
    expect(countTransparentPixels(result.image)).toBeGreaterThan(500_000);
    expect(countStrongVisibleMagentaMattePixels(result.image)).toBe(0);
  }, 10_000);
});
