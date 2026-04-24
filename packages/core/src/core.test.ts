import { describe, expect, test } from "vitest";
import {
  applyAlphaMode,
  createImage,
  detectGridCandidates,
  downsampleBlocks,
  extractPalette,
  fixImage,
  pixelOffset,
  readPixel,
  remapToPalette,
  sliceSheetFrames,
  writePixel
} from "./index";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";

const rgba = (r: number, g: number, b: number, a = 255) => [r, g, b, a] as const;

function imageFromPixels(width: number, pixels: readonly (readonly [number, number, number, number])[]): RGBAImage {
  const data = new Uint8ClampedArray(width * (pixels.length / width) * 4);
  for (let i = 0; i < pixels.length; i += 1) {
    const pixel = pixels[i]!;
    const offset = i * 4;
    data[offset] = pixel[0];
    data[offset + 1] = pixel[1];
    data[offset + 2] = pixel[2];
    data[offset + 3] = pixel[3];
  }
  return { width, height: pixels.length / width, data };
}

function blockySource(): RGBAImage {
  return imageFromPixels(4, [
    rgba(255, 0, 0),
    rgba(252, 2, 0),
    rgba(0, 255, 0),
    rgba(0, 250, 4),
    rgba(251, 1, 1),
    rgba(249, 0, 0),
    rgba(0, 252, 2),
    rgba(2, 248, 0),
    rgba(0, 0, 255),
    rgba(0, 2, 250),
    rgba(255, 255, 0),
    rgba(252, 252, 3),
    rgba(1, 0, 248),
    rgba(0, 0, 252),
    rgba(249, 249, 0),
    rgba(255, 250, 2)
  ]);
}

const defaultOptions: FixOptions = {
  mode: "single",
  targetWidth: 2,
  targetHeight: 2,
  maxColors: 4,
  grid: {
    detect: "manual",
    scale: 2,
    phaseX: 0,
    phaseY: 0
  },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

describe("RGBA image helpers", () => {
  test("computes offsets and writes pixels into a typed image buffer", () => {
    const image = createImage(3, 2);

    writePixel(image, 2, 1, 12, 34, 56, 78);

    expect(pixelOffset(image, 2, 1)).toBe(20);
    expect(readPixel(image, 2, 1)).toEqual([12, 34, 56, 78]);
  });
});

describe("grid detection", () => {
  test("returns a high-confidence 2x candidate for a clean blocky source", () => {
    const [candidate] = detectGridCandidates(blockySource(), { maxScale: 4 });

    expect(candidate).toMatchObject({
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0
    });
    expect(candidate!.confidence).toBeGreaterThan(0.7);
  });
});

describe("block downsampling", () => {
  test("collapses each source block to one dominant output pixel", () => {
    const fixed = downsampleBlocks(blockySource(), {
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([248, 0, 0, 255]);
    expect(readPixel(fixed, 1, 0)).toEqual([0, 248, 0, 255]);
    expect(readPixel(fixed, 0, 1)).toEqual([0, 0, 248, 255]);
    expect(readPixel(fixed, 1, 1)).toEqual([248, 248, 0, 255]);
  });

  test("uses median channel values for noisy mixed blocks", () => {
    const source = imageFromPixels(2, [
      rgba(10, 20, 30),
      rgba(20, 40, 60),
      rgba(200, 210, 220),
      rgba(30, 60, 90)
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "median",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([25, 50, 75, 255]);
  });
});

describe("palette reduction", () => {
  test("extracts frequent colors and remaps to the nearest palette entry", () => {
    const palette = extractPalette(blockySource(), 3);
    const remapped = remapToPalette(blockySource(), palette);

    expect(palette).toHaveLength(3);
    expect(new Set(palette).size).toBe(3);
    expect(palette).toContain("#f80000");
    expect(readPixel(remapped, 0, 0)).toEqual([248, 0, 0, 255]);
  });
});

describe("alpha cleanup", () => {
  test("converts alpha to binary using the configured threshold", () => {
    const source = imageFromPixels(2, [rgba(1, 2, 3, 127), rgba(4, 5, 6, 128)]);

    const cleaned = applyAlphaMode(source, "binary", { threshold: 128 });

    expect(readPixel(cleaned, 0, 0)[3]).toBe(0);
    expect(readPixel(cleaned, 1, 0)[3]).toBe(255);
  });

  test("flood-fills connected corner background pixels to transparency", () => {
    const source = imageFromPixels(3, [
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(200, 20, 20),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10)
    ]);

    const cleaned = applyAlphaMode(source, "backgroundFloodFill", { tolerance: 0 });

    expect(readPixel(cleaned, 0, 0)[3]).toBe(0);
    expect(readPixel(cleaned, 1, 1)).toEqual([200, 20, 20, 255]);
  });
});

describe("sheet slicing", () => {
  test("generates deterministic frame rects from rows columns margin and spacing", () => {
    const frames = sliceSheetFrames({
      frameWidth: 16,
      frameHeight: 12,
      rows: 2,
      columns: 3,
      margin: 1,
      spacing: 2,
      extrude: 0
    });

    expect(frames.map((frame) => frame.rect)).toEqual([
      { x: 1, y: 1, w: 16, h: 12 },
      { x: 19, y: 1, w: 16, h: 12 },
      { x: 37, y: 1, w: 16, h: 12 },
      { x: 1, y: 15, w: 16, h: 12 },
      { x: 19, y: 15, w: 16, h: 12 },
      { x: 37, y: 15, w: 16, h: 12 }
    ]);
    expect(frames[5]!.name).toBe("frame_005");
    expect(frames[5]!.pivot).toEqual({ x: 8, y: 12 });
  });
});

describe("fix pipeline", () => {
  test("downsamples remaps palette and returns reproducible metadata", () => {
    const result = fixImage(blockySource(), defaultOptions);

    expect(result.image.width).toBe(2);
    expect(result.image.height).toBe(2);
    expect(result.palette).toEqual(["#f80000", "#00f800", "#0000f8", "#f8f800"]);
    expect(result.grid.confidence).toBe(1);
    expect(result.metrics.paletteCount).toBe(4);
    expect(result.settings).toEqual(defaultOptions);
  });

  test("honors target dimensions as an auto-grid hint", () => {
    const result = fixImage(blockySource(), {
      ...defaultOptions,
      targetWidth: 4,
      targetHeight: 4,
      grid: {
        detect: "auto",
        scaleX: 1,
        scaleY: 1,
        phaseX: 0,
        phaseY: 0
      }
    });

    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(4);
    expect(result.grid.reason).toContain("Target-guided");
  });
});
