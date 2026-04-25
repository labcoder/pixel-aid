import { describe, expect, test } from "vitest";
import { chooseSuggestionGrid, suggestFixSettings } from "./fixSuggestions";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";

function blankImage(width: number, height: number): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255)
  };
}

function singleSpriteOnBrightBackground(): RGBAImage {
  const image = blankImage(160, 192);
  for (let y = 68; y < 124; y += 1) {
    for (let x = 56; x < 104; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = 40;
      image.data[offset + 1] = 80;
      image.data[offset + 2] = 80;
      image.data[offset + 3] = 255;
    }
  }
  return image;
}

describe("fix setting suggestions", () => {
  test("suggests sprite sheet mode for wide sources", () => {
    const suggestion = suggestFixSettings(blankImage(256, 64));

    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.reason).toContain("wide");
  });

  test("suggests tile sheet mode for evenly tiled square sources", () => {
    const suggestion = suggestFixSettings(blankImage(128, 128));

    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.maxColors).toBe(16);
  });

  test("uses grid detection candidate dimensions when available", () => {
    const suggestion = suggestFixSettings(blankImage(32, 16));

    expect(suggestion.gridDetect).toBe("auto");
    expect(suggestion.targetWidth).toBeGreaterThan(0);
    expect(suggestion.targetHeight).toBeGreaterThan(0);
    expect(suggestion.gridScaleX).toBeGreaterThan(0);
    expect(suggestion.gridScaleY).toBeGreaterThan(0);
  });

  test("reports high single-sprite mode confidence for portrait character art", () => {
    const suggestion = suggestFixSettings(blankImage(706, 878));

    expect(suggestion.mode).toBe("single");
    expect(suggestion.downscale).toBe("dominant");
    expect(suggestion.reason).toContain("dominant");
    expect(suggestion.modeConfidence).toBeGreaterThan(0.85);
    expect(suggestion.targetWidth).toBeLessThanOrEqual(176);
    expect(suggestion.targetHeight).toBeLessThanOrEqual(220);
  });

  test("suggests background flood-fill for single sprites on bright opaque backgrounds", () => {
    const suggestion = suggestFixSettings(singleSpriteOnBrightBackground());

    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.downscale).toBe("dominant");
  });

  test("prefers plausible single-sprite native sizes over tiny high-confidence scales", () => {
    const tinyScale: GridCandidate = {
      outputWidth: 353,
      outputHeight: 439,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.46,
      reason: "tiny scale"
    };
    const plausibleScale: GridCandidate = {
      outputWidth: 88,
      outputHeight: 109,
      scaleX: 8,
      scaleY: 8,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.4,
      reason: "plausible scale"
    };

    expect(chooseSuggestionGrid({ width: 706, height: 878 }, [tinyScale, plausibleScale], "single")).toBe(plausibleScale);
  });

  test("creates a plausible single-sprite grid when all candidates are oversized", () => {
    const oversized: GridCandidate = {
      outputWidth: 176,
      outputHeight: 219,
      scaleX: 4,
      scaleY: 4,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.43,
      reason: "oversized"
    };

    expect(chooseSuggestionGrid({ width: 706, height: 878 }, [oversized], "single")).toMatchObject({
      outputWidth: 100,
      outputHeight: 125,
      scaleX: 7,
      scaleY: 7,
      reason: "Plausible single-sprite native size"
    });
  });
});
