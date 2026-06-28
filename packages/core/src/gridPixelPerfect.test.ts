import { describe, expect, test } from "vitest";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import { applyLineCleanup } from "./lineCleanup";
import { detectMixels, regularizeMixels } from "./mixels";
import { detectPixelScale } from "./pixelScale";
import { snapToGrid } from "./snap";
import { fixImage } from "./fix";
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

describe("grid and pixel-perfect helpers", () => {
  test("detectPixelScale reports a clean 6x sprite scale", () => {
    const report = detectPixelScale(upscaledSprite(8, 8, 6), { maxScale: 12 });

    expect(report.scaleX).toBe(6);
    expect(report.scaleY).toBe(6);
    expect(report.uniform).toBe(true);
    expect(["medium", "high"]).toContain(report.label);
    expect(report.source).toBe("grid-candidate");
  });

  test("detectMixels flags noisy (non-flat) cells and normalizes deterministically", () => {
    // Real mixels = an upscaled grid whose cells are NOT flat (per-pixel noise), the way AI/upscaler
    // output looks. Build a 6x grid then add deterministic intra-cell noise so blocks aren't uniform.
    const base = upscaledSprite(10, 10, 6);
    const source = createImage(base.width, base.height, [0, 0, 0, 0]);
    source.data.set(base.data);
    let seed = 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const [r, g, b, a] = readPixel(source, x, y);
        if (a === 0) continue;
        const jitter = Math.round((rand() - 0.5) * 60);
        writePixel(source, x, y, r + jitter, g + jitter, b + jitter, a);
      }
    }

    const report = detectMixels(source, { maxScale: 12 });
    expect(report.hasMixels).toBe(true);
    expect(report.axisX.irregularity).toBeGreaterThan(0.4);

    const first = regularizeMixels(source, report);
    const second = regularizeMixels(source, report);
    // Full-resolution de-mixel preserves dimensions and is deterministic.
    expect(first.image.width).toBe(source.width);
    expect(first.image.height).toBe(source.height);
    expect(bytes(second.image)).toEqual(bytes(first.image));
  });

  test("clean flat-block art is NOT flagged as mixels even at odd block sizes", () => {
    // Flat solid-color blocks (even of varying size) are clean pixel art, not mixels: the new detector
    // keys on cell FLATNESS, not block-size variance, so these score as not-mixel.
    const widths = [9, 8, 9, 9, 8, 9];
    const heights = [8, 9, 8, 9];
    const source = mixelSprite(widths, heights);
    const report = detectMixels(source, { maxScale: 16 });

    expect(report.hasMixels).toBe(false);
    expect(report.axisX.irregularity).toBeLessThan(0.3);
  });

  test("clean upscaled art is not mixels and regularize returns it unchanged", () => {
    const source = upscaledSprite(5, 4, 6);
    const report = detectMixels(source, { maxScale: 12 });
    const regularized = regularizeMixels(source, report);

    expect(report.hasMixels).toBe(false);
    expect(report.axisX.irregularity).toBeLessThan(0.3);
    // No mixels => source returned byte-identical (never degrade clean input).
    expect(regularized.diagnostics.used).toBe(false);
    expect(bytes(regularized.image)).toEqual(bytes(source));
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

  test("regularizeMixels preserves full image dimensions (de-mixel pre-pass)", () => {
    const widths = [6, 6, 5, 6, 6, 5, 6];
    const heights = [6, 5, 6, 6, 5];
    const source = mixelSprite(widths, heights);
    const result = regularizeMixels(source, { maxScale: 12 });
    // Unlike normalizeMixels (collapses to block count), regularize keeps the source size.
    expect(result.image.width).toBe(source.width);
    expect(result.image.height).toBe(source.height);
    // Deterministic and no invented colors.
    expect(bytes(regularizeMixels(source, { maxScale: 12 }).image)).toEqual(bytes(result.image));
  });

  test("fixImage with fixMixels honors the requested target dimensions (regression for squish bug)", () => {
    const widths = [6, 6, 5, 6, 6, 5, 6, 6, 5, 6];
    const heights = [6, 5, 6, 6, 5, 6, 6, 5, 6, 6];
    const source = mixelSprite(widths, heights);

    const baseOptions: FixOptions = {
      mode: "single",
      assetType: "sprite",
      targetWidth: 16,
      targetHeight: 16,
      maxColors: 16,
      paletteSettings: { mode: "auto", strategy: "medianCut", maxColors: 16, lockScope: "single", dithering: "none" },
      grid: { detect: "auto", cropToBounds: false, localCorrection: false },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
    };

    const without = fixImage(source, baseOptions);
    const withMixels = fixImage(source, { ...baseOptions, grid: { ...baseOptions.grid, fixMixels: true } });

    // The bug: fixMixels produced block-count dims (non-target, non-square) → squished output.
    // Both paths must now produce the same target dimensions.
    expect(without.image.width).toBe(16);
    expect(without.image.height).toBe(16);
    expect(withMixels.image.width).toBe(16);
    expect(withMixels.image.height).toBe(16);
  });
});
