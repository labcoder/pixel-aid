import { describe, expect, test } from "vitest";
import { applyAlphaMode, createImage, fixImage, readPixel, writePixel } from "./index";
import type { RGBAImage, RgbaTuple } from "./index";

const BASE_MAGENTA: RgbaTuple = [255, 0, 245, 255];
const OUTLINE_WHITE: RgbaTuple = [250, 250, 246, 255];
const DARK_FUR: RgbaTuple = [18, 18, 18, 255];
const CHEST_WHITE: RgbaTuple = [244, 238, 218, 255];
const MAGENTA_FRINGE: RgbaTuple = [210, 0, 205, 255];

function createOutlinedCatSilhouetteFixture(): RGBAImage {
  const image = createImage(13, 13, BASE_MAGENTA);

  for (let y = 2; y <= 10; y += 1) {
    for (let x = 2; x <= 10; x += 1) {
      if (x === 2 || x === 10 || y === 2 || y === 10) {
        writePixel(image, x, y, ...OUTLINE_WHITE);
      }
    }
  }

  for (let y = 3; y <= 9; y += 1) {
    for (let x = 3; x <= 9; x += 1) {
      writePixel(image, x, y, ...DARK_FUR);
    }
  }

  for (let y = 5; y <= 9; y += 1) {
    writePixel(image, 6, y, ...CHEST_WHITE);
  }

  for (let x = 3; x <= 9; x += 1) {
    writePixel(image, x, 1, ...MAGENTA_FRINGE);
    writePixel(image, x, 11, ...MAGENTA_FRINGE);
  }
  for (let y = 3; y <= 9; y += 1) {
    writePixel(image, 1, y, ...MAGENTA_FRINGE);
    writePixel(image, 11, y, ...MAGENTA_FRINGE);
  }

  return image;
}

function createNoOutlineCatSilhouetteFixture(): RGBAImage {
  const image = createImage(24, 24, BASE_MAGENTA);

  fillRect(image, 8, 8, 8, 4, DARK_FUR);
  fillRect(image, 8, 12, 4, 4, DARK_FUR);
  fillRect(image, 12, 12, 4, 4, CHEST_WHITE);

  fillRect(image, 6, 9, 2, 3, DARK_FUR);
  fillRect(image, 16, 9, 2, 3, DARK_FUR);
  fillRect(image, 9, 6, 3, 2, DARK_FUR);
  fillRect(image, 13, 6, 2, 2, DARK_FUR);

  return image;
}

function fillRect(image: RGBAImage, startX: number, startY: number, width: number, height: number, color: RgbaTuple): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, ...color);
    }
  }
}

function countVisibleMagentaMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! === 0) {
      continue;
    }
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (r >= 160 && b >= 150 && g <= 48 && Math.min(r, b) - g >= 120) {
      count += 1;
    }
  }
  return count;
}

describe("outline-guided background cleanup", () => {
  test("uses a bright silhouette outline to peel exterior magenta matte pixels", () => {
    const source = createOutlinedCatSilhouetteFixture();

    const { image: cleaned } = applyAlphaMode(source, "backgroundFloodFill", {
      tolerance: 10,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });

    expect(countVisibleMagentaMattePixels(cleaned)).toBe(0);
    expect(readPixel(cleaned, 1, 6)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 11, 6)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 2, 6)).toEqual(OUTLINE_WHITE);
    expect(readPixel(cleaned, 6, 6)).toEqual(CHEST_WHITE);
  });

  test("preserves no-outline silhouette edge pixels while removing magenta background", () => {
    const source = createNoOutlineCatSilhouetteFixture();

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 6,
      targetHeight: 6,
      maxColors: 8,
      grid: {
        detect: "manual",
        scale: 4,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      alphaSettings: {
        threshold: 128,
        tolerance: 18,
        decontaminateRgb: true,
        transparentRgb: "#000000"
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false
      }
    });

    expect(countVisibleMagentaMattePixels(result.image)).toBe(0);
    expect(readPixel(result.image, 1, 2)[3]).toBe(255);
    expect(readPixel(result.image, 4, 2)[3]).toBe(255);
    expect(readPixel(result.image, 2, 1)[3]).toBe(255);
    expect(readPixel(result.image, 3, 3)[3]).toBe(255);
  });
});
