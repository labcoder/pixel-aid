import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { applyLineCleanup } from "./lineCleanup";
import { detectMixels, normalizeMixels } from "./mixels";
import { detectPixelScale } from "./pixelScale";
import { snapToGrid } from "./snap";
import { createImage, readPixel, writePixel } from "./image";

type Color = readonly [number, number, number, number];

const palette = [
  [20, 20, 28, 255],
  [220, 80, 70, 255],
  [60, 170, 110, 255],
  [70, 100, 220, 255],
  [230, 190, 70, 255],
  [150, 70, 190, 255],
  [40, 180, 200, 255]
] as const;

function colorForCell(x: number, y: number): Color {
  return palette[(x * 3 + y * 5) % palette.length]!;
}

function drawRect(image: RGBAImage, startX: number, startY: number, width: number, height: number, color: Color): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function upscaledSprite(cellsX: number, cellsY: number, scale: number): RGBAImage {
  const image = createImage(cellsX * scale, cellsY * scale, [0, 0, 0, 0]);
  for (let y = 0; y < cellsY; y += 1) {
    for (let x = 0; x < cellsX; x += 1) {
      drawRect(image, x * scale, y * scale, scale, scale, colorForCell(x, y));
    }
  }
  return image;
}

function mixelSprite(widths: readonly number[], heights: readonly number[]): RGBAImage {
  const width = widths.reduce((total, value) => total + value, 0);
  const height = heights.reduce((total, value) => total + value, 0);
  const image = createImage(width, height, [0, 0, 0, 0]);
  let yStart = 0;
  for (let y = 0; y < heights.length; y += 1) {
    let xStart = 0;
    for (let x = 0; x < widths.length; x += 1) {
      drawRect(image, xStart, yStart, widths[x]!, heights[y]!, colorForCell(x, y));
      xStart += widths[x]!;
    }
    yStart += heights[y]!;
  }
  return image;
}

function bytes(image: RGBAImage): number[] {
  return Array.from(image.data);
}

function pixelKey(pixel: readonly number[]): string {
  return pixel.join(",");
}

describe("grid and pixel-perfect helpers", () => {
  test("detectPixelScale reports a clean 6x sprite scale", () => {
    const report = detectPixelScale(upscaledSprite(8, 8, 6), { maxScale: 12 });

    expect(report.scaleX).toBe(6);
    expect(report.scaleY).toBe(6);
    expect(report.uniform).toBe(true);
    expect(["medium", "high"]).toContain(report.label);
    expect(report.source).toBe("grid-candidate");
  });

  test("detectMixels and normalizeMixels handle non-uniform block sizes deterministically", () => {
    const widths = [6, 6, 5, 6, 6, 5, 6];
    const heights = [6, 5, 6, 6, 5];
    const source = mixelSprite(widths, heights);
    const report = detectMixels(source, { maxScale: 12 });

    expect(report.hasMixels).toBe(true);
    expect(report.axisX.irregularity).toBeGreaterThan(0);
    expect(report.axisY.irregularity).toBeGreaterThan(0);
    expect(report.targetScaleX).toBe(6);
    expect(report.targetScaleY).toBe(6);

    const first = normalizeMixels(source, report);
    const second = normalizeMixels(source, report);
    expect(first.image.width).toBe(widths.length);
    expect(first.image.height).toBe(heights.length);
    expect(Array.from(first.xBoundaries)).toEqual(report.axisX.boundaries);
    expect(Array.from(first.yBoundaries)).toEqual(report.axisY.boundaries);
    expect(bytes(second.image)).toEqual(bytes(first.image));

    const sourceColors = new Set<string>();
    for (let y = 0; y < heights.length; y += 1) {
      for (let x = 0; x < widths.length; x += 1) {
        sourceColors.add(pixelKey(colorForCell(x, y)));
      }
    }
    for (let y = 0; y < first.image.height; y += 1) {
      for (let x = 0; x < first.image.width; x += 1) {
        expect(sourceColors.has(pixelKey(readPixel(first.image, x, y)))).toBe(true);
      }
    }
  });

  test("detects a finer 8/9 mixel pattern (tuned irregularity threshold)", () => {
    const widths = [9, 8, 9, 9, 8, 9];
    const heights = [8, 9, 8, 9];
    const source = mixelSprite(widths, heights);
    const report = detectMixels(source, { maxScale: 16 });

    // The 8/9 mix (1px of 9 ~= 0.111 irregularity) must clear the tuned threshold,
    // and the robust-median target scale must be 9 on both axes.
    expect(report.hasMixels).toBe(true);
    expect(report.targetScaleX).toBe(9);
    expect(report.targetScaleY).toBe(9);
    // Normalization is deterministic and never invents a color outside the source palette.
    const first = normalizeMixels(source, report);
    const second = normalizeMixels(source, report);
    expect(bytes(second.image)).toEqual(bytes(first.image));
    const sourceColors = new Set<string>();
    for (let y = 0; y < heights.length; y += 1) {
      for (let x = 0; x < widths.length; x += 1) {
        sourceColors.add(pixelKey(colorForCell(x, y)));
      }
    }
    for (let y = 0; y < first.image.height; y += 1) {
      for (let x = 0; x < first.image.width; x += 1) {
        expect(sourceColors.has(pixelKey(readPixel(first.image, x, y)))).toBe(true);
      }
    }
  });

  test("uniform images are not mixels and normalize to the detected block count", () => {
    const source = upscaledSprite(5, 4, 6);
    const report = detectMixels(source, { maxScale: 12 });
    const normalized = normalizeMixels(source, report);

    expect(report.hasMixels).toBe(false);
    expect(report.axisX.irregularity).toBe(0);
    expect(report.axisY.irregularity).toBe(0);
    expect(normalized.image.width).toBe(5);
    expect(normalized.image.height).toBe(4);
  });

  test("snapToGrid returns expected dimensions and colors for a uniform source", () => {
    const source = upscaledSprite(4, 3, 4);
    const snapped = snapToGrid(source, { scaleX: 4, scaleY: 4, phaseX: 0, phaseY: 0 });

    expect(snapped.image.width).toBe(4);
    expect(snapped.image.height).toBe(3);
    expect(Array.from(snapped.xBoundaries)).toEqual([0, 4, 8, 12, 16]);
    expect(Array.from(snapped.yBoundaries)).toEqual([0, 4, 8, 12]);
    expect(readPixel(snapped.image, 2, 1)).toEqual([...colorForCell(2, 1)]);
  });

  test("applyLineCleanup off is identity and low/high remove a single-pixel jaggy", () => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    const black = [0, 0, 0, 255] as const;
    drawRect(source, 1, 2, 3, 1, black);
    writePixel(source, 2, 1, black[0], black[1], black[2], black[3]);

    const off = applyLineCleanup(source, { strength: "off" });
    const low = applyLineCleanup(source, { strength: "low" });
    const high = applyLineCleanup(source, { strength: "high" });
    const lowAgain = applyLineCleanup(source, { strength: "low" });

    expect(bytes(off.image)).toEqual(bytes(source));
    expect(readPixel(off.image, 2, 1)).toEqual([...black]);
    expect(readPixel(low.image, 2, 1)[3]).toBe(0);
    expect(readPixel(high.image, 2, 1)[3]).toBe(0);
    expect(low.diagnostics.removedJaggyPixels).toBeGreaterThan(0);
    expect(bytes(lowAgain.image)).toEqual(bytes(low.image));
  });
});
