import { describe, expect, test } from "vitest";
import { createSingleSpriteCleanupFixture } from "@pixelaid/fixtures";
import {
  applyAlphaMode,
  applyDenoise,
  applyHaloRemoval,
  applyOutlineCleanup,
  createImage,
  detectSpriteBounds,
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
  test("detects foreground bounds for a bright-background single sprite fixture", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const bounds = detectSpriteBounds(fixture.image, { backgroundTolerance: 18 });

    expect(bounds).toEqual(fixture.expected.foregroundBounds);
  });

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

  test("prefers plausible native sprite sizes for large low-signal sources", () => {
    const source = createImage(706, 878);
    const [candidate] = detectGridCandidates(source, { maxScale: 32 });

    expect(candidate!.outputWidth).toBeLessThanOrEqual(176);
    expect(candidate!.outputHeight).toBeLessThanOrEqual(220);
    expect(candidate!.scaleX).toBeGreaterThanOrEqual(4);
  });

  test("ranks the single-sprite fixture by its six-pixel pseudo grid", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const [candidate] = detectGridCandidates(fixture.image, { maxScale: 16 });

    expect(candidate).toMatchObject({
      scaleX: fixture.expected.scale,
      scaleY: fixture.expected.scale,
      phaseX: fixture.expected.phaseX,
      phaseY: fixture.expected.phaseY
    });
    expect(candidate!.confidence).toBeGreaterThan(0.82);
  });

  test("attaches structured confidence diagnostics to grid candidates", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const [candidate] = detectGridCandidates(fixture.image, { maxScale: 16 });

    expect((candidate as any).diagnostics).toMatchObject({
      confidenceLabel: "high",
      cropUsed: true,
      scaleScore: expect.any(Number),
      edgeScore: expect.any(Number),
      runScore: expect.any(Number),
      sizeScore: expect.any(Number)
    });
    expect((candidate as any).diagnostics.notes).toContain("Foreground crop used");
  });
});

describe("block downsampling", () => {
  test("keeps representative dominant colors instead of returning quantized bucket colors", () => {
    const source = imageFromPixels(2, [
      rgba(10, 20, 30),
      rgba(11, 21, 31),
      rgba(12, 22, 32),
      rgba(240, 240, 240)
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([11, 21, 31, 255]);
  });

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

    expect(readPixel(fixed, 0, 0)).toEqual([252, 1, 0, 255]);
    expect(readPixel(fixed, 1, 0)).toEqual([1, 251, 2, 255]);
    expect(readPixel(fixed, 0, 1)).toEqual([0, 1, 251, 255]);
    expect(readPixel(fixed, 1, 1)).toEqual([253, 252, 1, 255]);
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
  test("keeps exact colors when the image is already within the color budget", () => {
    const source = imageFromPixels(2, [rgba(10, 20, 30), rgba(0, 200, 240)]);

    expect(extractPalette(source, 4)).toEqual(["#0a141e", "#00c8f0"]);
  });

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

describe("denoise cleanup", () => {
  test("leaves the image unchanged when strength is zero", () => {
    const source = imageFromPixels(2, [rgba(10, 20, 30), rgba(40, 50, 60), rgba(70, 80, 90), rgba(0, 0, 0, 0)]);

    const denoised = applyDenoise(source, { strength: 0 });

    expect(Array.from(denoised.data)).toEqual(Array.from(source.data));
    expect(denoised).not.toBe(source);
  });

  test("removes a mild off-color speck inside a flat color region", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 130, 207, 187, 255);

    const denoised = applyDenoise(source, { strength: 20 });

    expect(readPixel(denoised, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("does not spread the first scanned noisy color across a clean cluster", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 0, 0, 130, 207, 187, 255);

    const denoised = applyDenoise(source, { strength: 20 });

    expect(readPixel(denoised, 0, 0)).toEqual([120, 200, 180, 255]);
    expect(readPixel(denoised, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("uses stronger settings to flatten a wider similar-color patch", () => {
    const source = createImage(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const variant = (x + y) % 3;
        const color =
          variant === 0
            ? [120, 200, 180, 255]
            : variant === 1
              ? [145, 210, 190, 255]
              : [104, 188, 170, 255];
        writePixel(source, x, y, color[0]!, color[1]!, color[2]!, color[3]!);
      }
    }

    const light = applyDenoise(source, { strength: 20 });
    const strong = applyDenoise(source, { strength: 90 });

    expect(new Set([readPixel(light, 1, 1).join(","), readPixel(light, 2, 1).join(","), readPixel(light, 3, 1).join(",")]).size).toBeGreaterThan(1);
    expect(new Set([readPixel(strong, 1, 1).join(","), readPixel(strong, 2, 1).join(","), readPixel(strong, 3, 1).join(",")]).size).toBe(1);
  });

  test("does not denoise transparent pixels into visible colors", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 0, 0, 0, 0);

    const denoised = applyDenoise(source, { strength: 100 });

    expect(readPixel(denoised, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe("halo cleanup", () => {
  test("remaps semi-transparent edge halos to neighboring subject color", () => {
    const source = createImage(5, 5);
    writePixel(source, 2, 2, 70, 140, 130, 255);
    writePixel(source, 1, 2, 230, 240, 236, 96);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([70, 140, 130, 255]);
    expect(readPixel(cleaned, 2, 2)).toEqual([70, 140, 130, 255]);
  });

  test("remaps background-colored opaque halos on a flat canvas", () => {
    const source = createImage(5, 5, [255, 255, 255, 255]);
    writePixel(source, 2, 2, 70, 140, 130, 255);
    writePixel(source, 1, 2, 232, 242, 238, 255);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([70, 140, 130, 255]);
    expect(readPixel(cleaned, 0, 2)).toEqual([255, 255, 255, 255]);
  });

  test("leaves image unchanged when disabled", () => {
    const source = createImage(3, 3);
    writePixel(source, 1, 1, 200, 220, 216, 96);

    const cleaned = applyHaloRemoval(source, { enabled: false });

    expect(Array.from(cleaned.data)).toEqual(Array.from(source.data));
    expect(cleaned).not.toBe(source);
  });
});

describe("outline cleanup", () => {
  test("adds a one-pixel outline around visible pixels without resizing the image", () => {
    const source = createImage(3, 3);
    writePixel(source, 1, 1, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203" });

    expect(outlined.width).toBe(3);
    expect(outlined.height).toBe(3);
    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 2, 1)).toEqual([1, 2, 3, 255]);
  });

  test("repair mode uses an existing dark edge color but does not invent outlines when none exist", () => {
    const withEdge = createImage(5, 3);
    writePixel(withEdge, 1, 1, 10, 11, 12, 255);
    writePixel(withEdge, 2, 1, 120, 200, 180, 255);

    const repaired = applyOutlineCleanup(withEdge, "repairExisting");

    expect(readPixel(repaired, 3, 1)).toEqual([10, 11, 12, 255]);

    const noEdge = createImage(3, 3);
    writePixel(noEdge, 1, 1, 120, 200, 180, 255);

    const unchanged = applyOutlineCleanup(noEdge, "repairExisting");

    expect(readPixel(unchanged, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  test("adds an outline over opaque background pixels when alpha is preserved", () => {
    const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203" });

    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 2, 1)).toEqual([1, 2, 3, 255]);
  });

  test("supports larger outline sizes and custom colors", () => {
    const source = createImage(5, 5, [255, 255, 255, 255]);
    writePixel(source, 2, 2, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#443322", size: 2 });

    expect(readPixel(outlined, 0, 2)).toEqual([68, 51, 34, 255]);
    expect(readPixel(outlined, 1, 1)).toEqual([68, 51, 34, 255]);
    expect(readPixel(outlined, 2, 2)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([68, 51, 34, 255]);
  });

  test("applies configured alpha when adding a custom outline", () => {
    const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);
    const outlineOptions = { color: "#443322", alpha: 128 };

    const outlined = applyOutlineCleanup(source, "add", outlineOptions);

    expect(readPixel(outlined, 0, 0)).toEqual([68, 51, 34, 128]);
    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("removes isolated exterior pixels before they can grow their own outline", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 5, 2, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203", removeOrphans: true });

    expect(readPixel(outlined, 0, 2)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 5, 2)[3]).toBe(0);
    expect(readPixel(outlined, 6, 2)[3]).toBe(0);
  });

  test("closes one-pixel subject gaps before drawing added outlines", () => {
    const source = createImage(5, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 90, 150, 140, 255);
      }
    }

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203", closeGaps: true });

    expect(readPixel(outlined, 2, 2)).toEqual([90, 150, 140, 255]);
    expect(readPixel(outlined, 0, 2)).toEqual([1, 2, 3, 255]);
  });

  test("runs orphan and gap cleanup even when no outline is drawn", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 90, 150, 140, 255);
      }
    }
    writePixel(source, 5, 2, 90, 150, 140, 255);

    const cleaned = applyOutlineCleanup(source, "none", { removeOrphans: true, closeGaps: true });

    expect(readPixel(cleaned, 2, 2)).toEqual([90, 150, 140, 255]);
    expect(readPixel(cleaned, 5, 2)[3]).toBe(0);
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
    expect(result.palette).toEqual(["#fc0100", "#01fb02", "#0001fb", "#fdfc01"]);
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

  test("auto-fixes the single-sprite fixture from its background-aware source crop", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      maxColors: 24,
      grid: {
        detect: "auto"
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.sourceRect).toEqual(fixture.expected.foregroundBounds);
    expect(result.grid.scaleX).toBe(fixture.expected.scale);
    expect(result.grid.scaleY).toBe(fixture.expected.scale);
    expect(result.image.width).toBe(102);
    expect(result.image.height).toBe(144);
    expect(result.palette.length).toBeLessThanOrEqual(24);
    expect(result.grid.confidence).toBeGreaterThan(0.82);
  });

  test("keeps the background-aware crop when target dimensions are only an auto-grid hint", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.sourceRect).toEqual(fixture.expected.foregroundBounds);
    expect(result.image.width).toBe(102);
    expect(result.image.height).toBe(144);
  });

  test("reserves custom outline color during palette reduction", () => {
    const source = createImage(9, 9, [255, 255, 255, 255]);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }

    const result = fixImage(source, {
      mode: "single",
      targetWidth: 9,
      targetHeight: 9,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#443322"
      }
    });

    expect(result.palette).toContain("#443322");
    expect(readPixel(result.image, 1, 1)).toEqual([68, 51, 34, 255]);
  });

  test("passes configured outline alpha through the full fix pipeline", () => {
    const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);
    const options = {
      mode: "single",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#443322",
        outlineAlpha: 128
      }
    } as FixOptions;

    const result = fixImage(source, options);

    expect(readPixel(result.image, 0, 0)).toEqual([68, 51, 34, 128]);
  });

  test("adds native padding for outlines on auto-cropped preserved-alpha sprites", () => {
    const fixture = createSingleSpriteCleanupFixture();

    const result = fixImage(fixture.image, {
      mode: "single",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#101112"
      }
    });

    expect(result.image.width).toBe(104);
    expect(result.image.height).toBe(146);
    expect(result.grid.outputWidth).toBe(104);
    expect(result.grid.outputHeight).toBe(146);
    expect(result.grid.sourceRect).toEqual({
      x: fixture.expected.foregroundBounds.x - fixture.expected.scale,
      y: fixture.expected.foregroundBounds.y - fixture.expected.scale,
      w: fixture.expected.foregroundBounds.w + fixture.expected.scale * 2,
      h: fixture.expected.foregroundBounds.h + fixture.expected.scale * 2
    });
    expect(readPixel(result.image, 47, 0)).toEqual([16, 17, 18, 255]);
  });

  test("passes orphan and gap cleanup into the outline stage", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 5, 2, 120, 200, 180, 255);

    const result = fixImage(source, {
      mode: "single",
      targetWidth: 7,
      targetHeight: 5,
      maxColors: 3,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineColor: "#010203"
      }
    });

    expect(readPixel(result.image, 2, 2)).toEqual([120, 200, 180, 255]);
    expect(readPixel(result.image, 5, 2)[3]).toBe(0);
    expect(readPixel(result.image, 6, 2)[3]).toBe(0);
  });

  test("passes denoise strength through before palette extraction", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 130, 207, 187, 255);

    const result = fixImage(source, {
      mode: "single",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 8,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        denoiseStrength: 20
      }
    });

    expect(result.palette).toEqual(["#78c8b4"]);
    expect(readPixel(result.image, 1, 1)).toEqual([120, 200, 180, 255]);
  });
});
