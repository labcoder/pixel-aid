import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixImage, suggestFixSettings } from "./index";
import { compareGoldenImage, readGoldenPng, readGoldenWebp } from "./goldenImage.test-utils";
import type { FixOptions, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");
const cleanAstroSheetPath = path.join(goldenDir, "astro-spritesheet-normalized-fixed.png");
const noisyAstroSheetPath = path.join(goldenDir, "astro-spritesheet-source.webp");

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
      strategy: "medianCut",
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
  });

  test("recovers the noisy astro WebP toward the normalized sheet golden", async () => {
    const source = await readGoldenWebp(noisyAstroSheetPath);
    const golden = readGoldenPng(cleanAstroSheetPath);
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));
    const comparison = compareGoldenImage(result.image, golden, {
      mode: "tolerance",
      perChannelTolerance: 40,
      allowedChangedPixels: 350_000
    });

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout?.columns).toBe(8);
    expect(suggestion.sheetLayout?.rows).toBe(9);
    expect(suggestion.sheetLayout?.frameWidth).toBe(192);
    expect(suggestion.sheetLayout?.frameHeight).toBe(208);
    expect(suggestion.targetWidth).toBe(golden.width);
    expect(suggestion.targetHeight).toBe(golden.height);
    expect(result.image.width).toBe(golden.width);
    expect(result.image.height).toBe(golden.height);
    expect(countExactRgbaColors(result.image)).toBeLessThanOrEqual(32);
    expect(countVisibleGreenMattePixels(result.image)).toBeLessThan(countVisibleGreenMattePixels(source) * 0.2);
    expect(comparison.message).toContain("Golden matched");
    expect(comparison.matches).toBe(true);
  }, 10_000);
});
