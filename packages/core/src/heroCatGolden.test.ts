import path from "node:path";
import { describe, expect, test } from "vitest";
import { fixImage, suggestFixSettings } from "./index";
import { compareGoldenImage, readGoldenPng, shouldUpdateGoldens, writeGoldenPng } from "./goldenImage.test-utils";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import type { FixSettingSuggestion } from "./fixSuggestions";

const sourcePath = path.resolve("src/goldens/hero-cat-ai.png");
const goldenPath = path.resolve("src/goldens/hero-cat-fixed-128.png");

describe("hero cat golden regression", () => {
  test("keeps guided 128px cat cleanup stable", () => {
    const source = readGoldenPng(sourcePath);
    const expected = readGoldenPng(goldenPath);
    const suggestion = suggestFixSettings(source);

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(suggestion.paletteStrategy).toBe("perceptual");

    const result = fixImage(source, buildGuidedHeroCatOptions(source, suggestion));

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
  const targetSize = 128;
  const maxColors = 64;

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
      dithering: "none"
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: image.width / targetSize,
      scaleY: image.height / targetSize,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: false,
      localCorrection: false
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
    }
  };
}
