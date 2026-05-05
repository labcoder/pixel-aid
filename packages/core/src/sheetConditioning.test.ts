import { describe, expect, test } from "vitest";
import { presentationSpriteSheetFixtures } from "@pixelaid/fixtures";
import { analyzeSheetConditioning } from "./index";
import type { RGBAImage } from "@pixelaid/shared";

const rgba = (r: number, g: number, b: number, a = 255) => [r, g, b, a] as const;

function image(width: number, height: number, fill: readonly [number, number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
  }
  return { width, height, data };
}

function writePixel(target: RGBAImage, x: number, y: number, color: readonly [number, number, number, number]): void {
  const offset = (y * target.width + x) * 4;
  target.data[offset] = color[0];
  target.data[offset + 1] = color[1];
  target.data[offset + 2] = color[2];
  target.data[offset + 3] = color[3];
}

describe("sheet source conditioning diagnostics", () => {
  test("recommends frame-first conditioning for excessive exact colors and coarse palette density", () => {
    const source = image(96, 72, rgba(12, 12, 12));
    for (let y = 8; y < 64; y += 1) {
      for (let x = 8; x < 88; x += 1) {
        writePixel(source, x, y, rgba((x * 17 + y * 11) % 256, (x * 9 + y * 23) % 256, (x * 29 + y * 5) % 256));
      }
    }

    const diagnostics = analyzeSheetConditioning(source, { maxExactColors: 256, maxCoarseBins: 8 });

    expect(diagnostics.exactColorCount).toBeGreaterThan(256);
    expect(diagnostics.coarseColorBinCount).toBeGreaterThan(8);
    expect(diagnostics.recommendFrameFirst).toBe(true);
    expect(diagnostics.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["excessive-exact-colors", "dense-coarse-palette"])
    );
  });

  test("flags opaque dark low-coverage sheets as presentation-like", () => {
    const source = image(160, 100, rgba(10, 10, 10));
    for (let y = 20; y < 45; y += 1) {
      for (let x = 42; x < 58; x += 1) {
        writePixel(source, x, y, rgba(55, 196, 190));
      }
    }
    for (let y = 54; y < 78; y += 1) {
      for (let x = 84; x < 104; x += 1) {
        writePixel(source, x, y, rgba(0, 238, 255));
      }
    }

    const diagnostics = analyzeSheetConditioning(source);

    expect(diagnostics.background).toMatchObject({ r: 10, g: 10, b: 10, a: 255 });
    expect(diagnostics.foregroundPixelRatio).toBeLessThan(0.1);
    expect(diagnostics.presentationLike).toBe(true);
    expect(diagnostics.recommendFrameFirst).toBe(true);
    expect(diagnostics.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["opaque-dark-background", "low-foreground-coverage"])
    );
  });

  test("flags presentation mockup sheets with checkerboard cells and captions", () => {
    const diagnostics = analyzeSheetConditioning(presentationSpriteSheetFixtures[0]!.createImage());

    expect(diagnostics.presentationLike).toBe(true);
    expect(diagnostics.recommendFrameFirst).toBe(true);
    expect(diagnostics.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["presentation-sheet-artifacts", "baked-checkerboard-cells", "caption-bracket-ignored"])
    );
  });

  test("does not recommend conditioning for a small low-color transparent native sheet", () => {
    const source = image(64, 32, rgba(0, 0, 0, 0));
    for (let y = 4; y < 28; y += 1) {
      for (let x = 4; x < 28; x += 1) {
        writePixel(source, x, y, rgba(80, 132, 120));
      }
      for (let x = 36; x < 60; x += 1) {
        writePixel(source, x, y, rgba(0, 238, 255));
      }
    }

    const diagnostics = analyzeSheetConditioning(source);

    expect(diagnostics.exactColorCount).toBe(3);
    expect(diagnostics.presentationLike).toBe(false);
    expect(diagnostics.recommendFrameFirst).toBe(false);
    expect(diagnostics.issues).toEqual([]);
  });

  test("flags soft alpha and chroma matte noise in source-sized AI atlases", () => {
    const source = image(160, 120, rgba(0, 0, 0, 0));
    for (let y = 8; y < 112; y += 1) {
      for (let x = 8; x < 152; x += 1) {
        writePixel(source, x, y, rgba(250, 250, 250));
      }
    }
    for (let y = 10; y < 110; y += 1) {
      for (let x = 4; x < 14; x += 1) {
        writePixel(source, x, y, rgba(0, 255, 0, 160));
      }
    }
    for (let y = 24; y < 90; y += 1) {
      for (let x = 140; x < 148; x += 1) {
        writePixel(source, x, y, rgba(20, 72, 42, 255));
      }
    }

    const diagnostics = analyzeSheetConditioning(source);

    expect(diagnostics.recommendFrameFirst).toBe(true);
    expect(diagnostics.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["soft-alpha-noise", "chroma-matte-artifacts"])
    );
  });
});
