import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { analyzeBackground } from "./backgroundAnalysis";
import { suggestFixSettings } from "./fixSuggestions";
import { readGoldenPng } from "./goldenImage.test-utils";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");

describe("adaptive background confidence suggestions", () => {
  test("opts high-confidence single sprite/icon solid background cleanup into adaptive detection", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));
    const analysis = analyzeBackground(source);
    const suggestion = suggestFixSettings(source);

    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8);
    expect(["solid", "multi"]).toContain(analysis.kind);
    expect(suggestion.mode).toBe("single");
    expect(["sprite", "icon"]).toContain(suggestion.assetType);
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.alphaSettings.backgroundDetection).toBe("adaptive");
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "backgroundDetection",
        enabled: true,
        reasonCode: "adaptive-background-high-confidence"
      })
    );
  });

  test("keeps high-confidence chroma matte sheets classic-compatible while removing visible matte", () => {
    const source = readGoldenPng(path.join(goldenDir, "samurai-magenta.png"));
    const analysis = analyzeBackground(source);
    const suggestion = suggestFixSettings(source);
    const cleaned = applyAlphaMode(source, suggestion.alpha, suggestion.alphaSettings).image;

    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8);
    expect(suggestion.mode).not.toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.alphaSettings.backgroundDetection).toBeUndefined();
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "backgroundDetection",
        enabled: false,
        reasonCode: "adaptive-background-not-applicable"
      })
    );
    expect(countVisiblePixels(cleaned)).toBeGreaterThan(320_000);
    expect(countVisibleSourceMagentaPixels(source, cleaned)).toBeLessThan(countVisibleSourceMagentaPixels(source, source) * 0.05);
  });

  test("does not force adaptive detection for high-confidence checkerboard guided suggestions", () => {
    const source = createCheckerboardSpriteImage();
    const analysis = analyzeBackground(source);
    const suggestion = suggestFixSettings(source);

    expect(analysis.kind).toBe("checkerboard");
    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8);
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.alphaSettings.backgroundDetection).toBeUndefined();
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "backgroundDetection",
        enabled: false,
        reasonCode: "adaptive-background-checkerboard-manual"
      })
    );
  });

  test("does not force adaptive detection when border contamination lowers background confidence", () => {
    const source = createBorderTouchingSubjectImage();
    const analysis = analyzeBackground(source);
    const suggestion = suggestFixSettings(source);

    expect(analysis.confidence).toBeLessThan(0.8);
    expect(suggestion.alphaSettings.backgroundDetection).toBeUndefined();
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "backgroundDetection",
        enabled: false
      })
    );
  });
});

function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(image: RGBAImage, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

function fillRect(image: RGBAImage, x0: number, y0: number, width: number, height: number, r: number, g: number, b: number): void {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      setPixel(image, x, y, r, g, b);
    }
  }
}

function createCheckerboardSpriteImage(): RGBAImage {
  const image = createImage(192, 192);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const value = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? 250 : 202;
      setPixel(image, x, y, value, value, value);
    }
  }
  fillRect(image, 64, 58, 64, 82, 32, 48, 180);
  fillRect(image, 76, 72, 40, 24, 240, 230, 180);
  fillRect(image, 82, 106, 28, 22, 84, 128, 220);
  return image;
}

function createBorderTouchingSubjectImage(): RGBAImage {
  const image = createImage(128, 128);
  fillRect(image, 0, 0, 128, 128, 240, 192, 208);
  fillRect(image, 44, 88, 40, 40, 32, 48, 180);
  return image;
}

function countVisiblePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset]! > 0) {
      count += 1;
    }
  }
  return count;
}

function countVisibleSourceMagentaPixels(source: RGBAImage, output: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    if (
      source.data[offset]! >= 200 &&
      source.data[offset + 1]! <= 96 &&
      source.data[offset + 2]! >= 180 &&
      source.data[offset + 3]! > 0 &&
      output.data[offset + 3]! > 0
    ) {
      count += 1;
    }
  }
  return count;
}
