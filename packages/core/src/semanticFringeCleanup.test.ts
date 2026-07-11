import { describe, expect, test } from "vitest";
import { createImage, fixImage, readPixel, writePixel } from "./index";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";

const FRINGE_GREEN = [42, 109, 35, 255] as const;
const NEAR_FRINGE_GREEN = [48, 116, 40, 255] as const;
const OUTLINE_BLACK = [16, 17, 18, 255] as const;
const BODY = [180, 166, 132, 255] as const;

describe("semantic fringe cleanup", () => {
  test("removes only exterior-connected semantic fringe colors and preserves enclosed same-hue details", () => {
    const source = createGreenShellSpriteWithInteriorGreenDetail();
    const withoutSemantic = fixImage(source, buildOptions());
    const withSemantic = fixImage(source, buildOptions({ semanticFringeColors: ["#2a6d23"] }));

    expect(countGreenFamily(withoutSemantic.image)).toBeGreaterThan(countGreenFamily(withSemantic.image));
    expect(readPixel(withSemantic.image, 7, 16)[3]).toBe(0);
    expect(readPixel(withSemantic.image, 24, 25)[3]).toBe(0);
    expect(readPixel(withSemantic.image, 16, 7)[3]).toBe(255);
    expect(readPixel(withSemantic.image, 16, 7).slice(0, 3)).toEqual([16, 17, 18]);
    expect(readPixel(withSemantic.image, 16, 16)[3]).toBe(255);
    expect(isGreenFamily(readPixel(withSemantic.image, 16, 16))).toBe(true);
    expect(withSemantic.diagnostics?.semanticFringe).toMatchObject({
      enabled: true,
      colorCount: 1,
      clearedPixels: expect.any(Number)
    });
    expect(withSemantic.diagnostics?.semanticFringe?.clearedPixels).toBeGreaterThan(0);
  });
});

type SemanticFringeCleanupInput = { semanticFringeColors?: string[] };

function buildOptions(cleanup: SemanticFringeCleanupInput = {}): FixOptions {
  return {
    mode: "single",
    assetType: "sprite",
    targetWidth: 32,
    targetHeight: 32,
    maxColors: 8,
    paletteSettings: {
      mode: "fixed",
      colors: ["#101112", "#b4a684", "#2a6d23", "#307428"],
      maxColors: 8,
      lockScope: "single",
      dithering: "none",
      colorSpace: "oklab"
    },
    grid: {
      detect: "manual",
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      cropToBounds: false,
      localCorrection: false,
      fixMixels: false
    },
    downscale: "nearest",
    alpha: "backgroundFloodFill",
    alphaSettings: {
      tolerance: 0,
      colorKey: "#ff00ff",
      decontaminateRgb: true,
      transparentRgb: "#000000",
      backgroundDetection: "classic"
    },
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      outlineMode: "none",
      outlineSize: 1,
      outlineColor: "#101112",
      outlineAlpha: 255,
      morphology: {
        enabled: true,
        open: false,
        close: false,
        fillTinyHoles: false,
        matteCleanup: false,
        removeTinyComponents: false,
        preserveSinglePixelDetails: true,
        alphaThreshold: 128,
        connectivity: 8
      },
      ...cleanup
    }
  };
}

function createGreenShellSpriteWithInteriorGreenDetail(): RGBAImage {
  const image = createImage(32, 32, [255, 0, 255, 255]);
  fillRect(image, 7, 5, 18, 2, FRINGE_GREEN);
  fillRect(image, 7, 25, 18, 2, NEAR_FRINGE_GREEN);
  fillRect(image, 7, 5, 2, 22, FRINGE_GREEN);
  fillRect(image, 23, 5, 2, 22, NEAR_FRINGE_GREEN);
  fillRect(image, 9, 7, 16, 2, OUTLINE_BLACK);
  fillRect(image, 9, 23, 16, 2, OUTLINE_BLACK);
  fillRect(image, 9, 7, 2, 18, OUTLINE_BLACK);
  fillRect(image, 23, 7, 2, 18, OUTLINE_BLACK);
  fillRect(image, 11, 9, 12, 14, BODY);
  fillRect(image, 15, 15, 3, 3, FRINGE_GREEN);
  return image;
}

function fillRect(image: RGBAImage, x: number, y: number, width: number, height: number, rgba: readonly [number, number, number, number]): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      writePixel(image, px, py, rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
}

function countGreenFamily(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (isGreenFamily([image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!])) {
      count += 1;
    }
  }
  return count;
}

function isGreenFamily(pixel: readonly number[]): boolean {
  const [r, g, b, a] = pixel;
  return (a ?? 0) >= 128 && (g ?? 0) >= 80 && (g ?? 0) > (r ?? 0) * 1.4 && (g ?? 0) > (b ?? 0) * 1.2;
}
