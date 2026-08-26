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

const source: RGBAImage = {
  width: 1254,
  height: 1254,
  data: new Uint8ClampedArray(1254 * 1254 * 4)
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

  test("compares a native-canvas preserved composition against the full source canvas", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "single",
        sourceImage: source,
        fixedImage: source,
        grid: {
          ...grid,
          sourceRect: { x: 233, y: 11, w: 788, h: 1230 }
        },
        packaging: {
          canvasMode: "native",
          framing: "preserveComposition",
          scaleMode: "native",
          anchor: "center",
          canvas: { width: 1254, height: 1254 },
          placement: { x: 233, y: 11, w: 788, h: 1230 },
          appliedScale: 1,
          trimOffset: { x: 0, y: 0 },
          warnings: []
        }
      })
    ).toEqual({ x: 0, y: 0, w: 1254, h: 1254 });
  });

  test("compares an exact canvas matching the native composition against the full source canvas", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "single",
        sourceImage: source,
        fixedImage: source,
        grid: {
          ...grid,
          sourceRect: { x: 233, y: 11, w: 788, h: 1230 }
        },
        reconstruction: {
          nativeCanvas: { width: 1254, height: 1254 },
          reconstructedImage: { width: 788, height: 1230 },
          compositionPlacement: { x: 233, y: 11, w: 788, h: 1230 },
          contentBounds: { x: 0, y: 0, w: 788, h: 1230 },
          contentBoundsSource: "alpha",
          requestedStrategy: "robust",
          usedStrategy: "robust"
        },
        packaging: {
          canvasMode: "exact",
          framing: "preserveComposition",
          scaleMode: "native",
          anchor: "center",
          canvas: { width: 1254, height: 1254 },
          placement: { x: 233, y: 11, w: 788, h: 1230 },
          appliedScale: 1,
          trimOffset: { x: 0, y: 0 },
          warnings: []
        }
      })
    ).toEqual({ x: 0, y: 0, w: 1254, h: 1254 });
  });

  test("does not use source crop footprints for sheet modes", () => {
    expect(
      getFixedComparisonSourceRect({
        mode: "spriteSheet",
        fixedImage: fixed,
        grid: {
          ...grid,
          sourceRect: { x: 0, y: 0, w: 1536, h: 1872 }
        }
      })
    ).toBeUndefined();
  });
});
