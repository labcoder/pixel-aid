import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, createGoldenSignature } from "@pixelaid/fixtures";
import type { CleanupFixture } from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { detectGridCandidates, detectSheetLayout, fixImage, sliceSheetFrames } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));

describe("cleanup fixture suite", () => {
  test("detects grid and crop metadata for the high-resolution robot fixture", () => {
    const fixture = requiredFixture("single-robot-6x");
    const image = fixture.createImage();
    const [candidate] = detectGridCandidates(image, { maxScale: 16 });

    expect(candidate).toMatchObject({
      scaleX: fixture.expected.grid?.scaleX,
      scaleY: fixture.expected.grid?.scaleY,
      phaseX: fixture.expected.grid?.phaseX,
      phaseY: fixture.expected.grid?.phaseY,
      sourceRect: fixture.expected.grid?.sourceRect
    });
    expect(candidate!.confidence).toBeGreaterThanOrEqual(fixture.expected.grid!.minConfidence);
  });

  test("cleans transparent halo fixtures into compact golden signatures", () => {
    const fixture = requiredFixture("halo-transparent-edge");
    const result = fixImage(fixture.createImage(), singleOptions("sprite", 64, 64, "binary", true));
    const signature = createGoldenSignature(result.image, { samplePoints: ["0,0", "32,34"], maxPalette: 8 });

    expect(signature.transparentPixels).toBeGreaterThanOrEqual(fixture.expected.alpha!.transparentPixelsAtLeast!);
    expect(countVisibleNearWhitePixels(result.image.data)).toBeLessThanOrEqual(fixture.expected.alpha!.visibleNearWhitePixelsAtMost!);
    expect(signature.checksum).toBe("31c28e6c");
  });

  test("keeps palette-drift animation sheets on one shared palette", () => {
    const fixture = requiredFixture("palette-drift-walk-4f");
    const sheet = fixture.expected.sheet!;
    const result = fixImage(fixture.createImage(), {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: fixture.expected.palette!.maxColors,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: sheet.options,
      sheetFrames: sheet.frames
    });
    const signature = createGoldenSignature(result.image, { samplePoints: ["12,16", "84,16"], maxPalette: 16 });

    expect(result.palette.length).toBeLessThanOrEqual(fixture.expected.palette!.maxColors);
    expect(result.image.width).toBe(96);
    expect(result.image.height).toBe(32);
    expect(signature.checksum).toBe("0130e5a5");
  });

  test("detects row structure for uneven animation-sheet fixtures", () => {
    const fixture = requiredFixture("uneven-gutter-labeled-sheet");
    const detection = detectSheetLayout(fixture.createImage());

    expect(detection.rows).toBeGreaterThanOrEqual(3);
    expect(detection.frames.length).toBeGreaterThanOrEqual(12);
    expect(detection.rowFrameCounts.slice(0, 3)).toEqual(fixture.expected.sheet!.rowFrameCounts);
  });

  test("fixes tileset seam fixtures with deterministic frame metadata", () => {
    const fixture = requiredFixture("tileset-seams-4x4-16");
    const sheetOptions = fixture.expected.sheet!.options;
    const frames = sliceSheetFrames(sheetOptions);
    const result = fixImage(fixture.createImage(), {
      mode: "tileSheet",
      assetType: "tileset",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: fixture.expected.palette!.maxColors,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: sheetOptions,
      sheetFrames: frames
    });

    expect(result.image.width).toBe(64);
    expect(result.image.height).toBe(64);
    expect(result.palette.length).toBeLessThanOrEqual(16);
    expect(result.settings.assetType).toBe("tileset");
  });
});

function requiredFixture(id: string): CleanupFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixture;
}

function singleOptions(assetType: "sprite" | "icon", width: number, height: number, alpha: FixOptions["alpha"], removeHalos: boolean): FixOptions {
  return {
    mode: "single",
    assetType,
    targetWidth: width,
    targetHeight: height,
    maxColors: 8,
    grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
    downscale: "dominant",
    alpha,
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos
    }
  };
}

function countVisibleNearWhitePixels(data: Uint8ClampedArray): number {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! >= 16 && data[offset]! > 220 && data[offset + 1]! > 220 && data[offset + 2]! > 220) {
      count += 1;
    }
  }
  return count;
}
