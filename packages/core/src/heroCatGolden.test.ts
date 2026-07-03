import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixImage, suggestFixSettings } from "./index";
import { compareGoldenImage, readGoldenPng, shouldUpdateGoldens, writeGoldenPng } from "./goldenImage.test-utils";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import type { FixSettingSuggestion } from "./fixSuggestions";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDir, "goldens/hero-cat-ai.png");
const goldenPath = path.resolve(testDir, "goldens/hero-cat-fixed-guided.png");
const guidedAlphaHash = "6687882db21b4017ca2268e284391b186464777d7ffc120721a4d698ff0c6365";

describe("hero cat golden regression", () => {
  test("keeps guided 128px cat cleanup stable", () => {
    const source = readGoldenPng(sourcePath);
    const expected = readGoldenPng(goldenPath);
    const suggestion = suggestFixSettings(source);

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(suggestion.paletteStrategy).toBe("familyFirst");
    // This AI sprite is mixel-laden, so the guided flow should auto-recommend the fix (near-certain bar).
    expect(suggestion.fixMixels).toBe(true);

    const result = fixImage(source, buildGuidedHeroCatOptions(source, suggestion));

    expect(result.image.width).toBe(90);
    expect(result.image.height).toBe(113);
    expect(result.palette.length).toBeLessThanOrEqual(24);
    expect(alphaHash(result.image)).toBe(guidedAlphaHash);

    if (shouldUpdateGoldens()) {
      writeGoldenPng(goldenPath, result.image);
      return;
    }

    const comparison = compareGoldenImage(result.image, expected, { mode: "exact" });
    expect(
      comparison.matches,
      `${comparison.message} Run PIXELAID_UPDATE_GOLDENS=1 npm run test -w @pixelaid/core -- src/heroCatGolden.test.ts to update intentionally.`
    ).toBe(true);
  });
});

function buildGuidedHeroCatOptions(image: RGBAImage, suggestion: FixSettingSuggestion): FixOptions {
  // The real web flow applied the guided suggestion, then the user changed only the target size to 128px.
  // The web size-edit path derives grid scale from the full source dimensions, not suggestion.gridScaleX/Y.
  const targetSize = 128;
  const maxColors = suggestion.maxColors;
  // Keep drift loud: packages/core/src/heroCatGuided24Regression.test.ts locks the guided 24-color contract.
  expect(maxColors).toBe(24);

  return {
    mode: suggestion.mode,
    assetType: suggestion.assetType,
    targetWidth: targetSize,
    targetHeight: targetSize,
    maxColors,
    paletteSettings: {
      mode: "auto",
      strategy: suggestion.paletteStrategy,
      maxColors,
      lockScope: "single",
      dithering: "none",
      colorSpace: "oklab",
      weighting: "area",
      minRegion: 1,
      protectColors: "auto",
      protectSalientColors: true
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: image.width / targetSize,
      scaleY: image.height / targetSize,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: true,
      localCorrection: false,
      fixMixels: suggestion.fixMixels
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
      dominantThreshold: 0.6,
      inferNativeScale: false,
      outlineMode: suggestion.outlineMode,
      outlineSize: suggestion.outlineSize,
      ...(suggestion.outlineSourceColors.length > 0 ? { outlineSourceColors: suggestion.outlineSourceColors } : {}),
      ...(suggestion.matteCleanup
        ? {
            morphology: {
              enabled: true,
              close: false,
              fillTinyHoles: false,
              removeTinyComponents: false,
              preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
              maxHolePixels: 1,
              maxComponentPixels: 1,
              matteCleanup: true,
              alphaThreshold: suggestion.alphaSettings.threshold ?? 128,
              connectivity: 8
            }
          }
        : {})
    }
  };
}

function alphaHash(image: RGBAImage): string {
  const alpha = new Uint8Array(image.width * image.height);
  for (let source = 3, target = 0; source < image.data.length; source += 4, target += 1) {
    alpha[target] = image.data[source]!;
  }
  return createHash("sha256").update(alpha).digest("hex");
}
