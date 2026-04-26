import { describe, expect, test } from "vitest";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";
import { getFixedComparisonSourceRect } from "./viewportComparison";

const grid: GridCandidate = {
  outputWidth: 64,
  outputHeight: 80,
  scaleX: 8,
  scaleY: 8,
  phaseX: 2,
  phaseY: 4,
  confidence: 0.9,
  reason: "test"
};

const fixed: RGBAImage = {
  width: 64,
  height: 80,
  data: new Uint8ClampedArray(64 * 80 * 4)
};

describe("viewport comparison", () => {
  test("uses explicit crop metadata when the fixed output was cropped", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "single",
        fixedImage: fixed,
        grid: {
          ...grid,
          sourceRect: { x: 20, y: 30, w: 320, h: 400 }
        }
      })
    ).toEqual({ x: 20, y: 30, w: 320, h: 400 });
  });

  test("synthesizes a source-space footprint for uncropped single sprite comparisons", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "single",
        fixedImage: fixed,
        grid
      })
    ).toEqual({ x: 2, y: 4, w: 512, h: 640 });
  });

  test("does not synthesize compare footprints for sheet modes", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "spriteSheet",
        fixedImage: fixed,
        grid
      })
    ).toBeUndefined();
  });
});
