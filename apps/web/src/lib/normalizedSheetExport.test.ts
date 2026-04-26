import type { FixOptions, PixelFixResult, RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { createNormalizedSheetExport } from "./normalizedSheetExport";

const image: RGBAImage = {
  width: 6,
  height: 4,
  data: new Uint8ClampedArray(6 * 4 * 4)
};

writePixel(image, 0, 0, 255, 0, 0, 255);
writePixel(image, 3, 1, 0, 0, 255, 255);

const settings: FixOptions = {
  mode: "spriteSheet",
  targetWidth: 6,
  targetHeight: 4,
  maxColors: 4,
  grid: { detect: "manual", scale: 1 },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

const result: PixelFixResult = {
  image,
  palette: ["#ff0000", "#0000ff"],
  grid: {
    outputWidth: 6,
    outputHeight: 4,
    scaleX: 1,
    scaleY: 1,
    phaseX: 0,
    phaseY: 0,
    confidence: 1,
    reason: "test"
  },
  metrics: {
    durationMs: 1,
    sourceWidth: 6,
    sourceHeight: 4,
    outputWidth: 6,
    outputHeight: 4,
    paletteCount: 2,
    gridConfidence: 1
  },
  settings
};

const frames: SpriteFrame[] = [
  { name: "row_1_000", rect: { x: 0, y: 0, w: 1, h: 1 }, pivot: { x: 0, y: 1 }, durationMs: 120, tags: ["row_1"] },
  { name: "row_2_000", rect: { x: 3, y: 1, w: 1, h: 1 }, pivot: { x: 1, y: 1 }, durationMs: 120, tags: ["row_2"] }
];

describe("normalized sheet export", () => {
  test("creates a packed result image and matching frame metadata", () => {
    const normalized = createNormalizedSheetExport({
      result,
      frames,
      spacing: 1,
      margin: 0,
      extrude: 0,
      rowFrameCounts: [1, 1]
    });

    expect(normalized.result.image.width).toBe(2);
    expect(normalized.result.image.height).toBe(3);
    expect(normalized.sheet).toMatchObject({ frameWidth: 2, frameHeight: 1, rows: 2, columns: 1, spacing: 1, pivot: { x: 1, y: 1 } });
    expect(normalized.frames.map((frame) => frame.rect)).toEqual([
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 }
    ]);
    expect(normalized.result.metrics.outputWidth).toBe(2);
    expect(normalized.result.metrics.outputHeight).toBe(3);
  });
});

function writePixel(image: RGBAImage, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}
