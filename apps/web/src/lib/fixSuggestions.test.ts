import { describe, expect, test } from "vitest";
import { createSingleSpriteCleanupFixture } from "@pixelaid/fixtures";
import { chooseSuggestionGrid, suggestFixSettings } from "./fixSuggestions";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";

function blankImage(width: number, height: number): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255)
  };
}

function singleSpriteOnBrightBackground(): RGBAImage {
  const image = blankImage(160, 192);
  for (let y = 68; y < 124; y += 1) {
    for (let x = 56; x < 104; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = 40;
      image.data[offset + 1] = 80;
      image.data[offset + 2] = 80;
      image.data[offset + 3] = 255;
    }
  }
  return image;
}

function largeAnimationSheetLikeSource(): RGBAImage {
  const image = blankImage(768, 512);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 10;
    image.data[offset + 1] = 12;
    image.data[offset + 2] = 12;
    image.data[offset + 3] = 255;
  }

  const rows = [
    { y: 24, cells: 5 },
    { y: 98, cells: 8 },
    { y: 172, cells: 6 },
    { y: 246, cells: 9 },
    { y: 320, cells: 7 },
    { y: 394, cells: 9 }
  ];

  for (const row of rows) {
    for (let column = 0; column < row.cells; column += 1) {
      const x = 92 + column * 62;
      drawRect(image, x, row.y, 60, 56, [70, 75, 75, 255]);
      drawRect(image, x + 16, row.y + 10, 28, 32, [90, 178, 166, 255]);
    }
  }

  return image;
}

function complexPresentationSheetLikeSource(): RGBAImage {
  const image = blankImage(512, 320);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 10;
    image.data[offset + 1] = 12;
    image.data[offset + 2] = 12;
    image.data[offset + 3] = 255;
  }

  const rows = [
    { y: 24, cells: 3 },
    { y: 116, cells: 4 },
    { y: 208, cells: 3 }
  ];
  const startX = 104;
  const cellWidth = 64;
  const cellHeight = 64;

  for (const row of rows) {
    const rowWidth = row.cells * cellWidth;
    drawRect(image, startX, row.y, rowWidth, 2, [22, 24, 24, 255]);
    drawRect(image, startX, row.y + cellHeight - 2, rowWidth, 2, [22, 24, 24, 255]);
    for (let column = 0; column <= row.cells; column += 1) {
      drawRect(image, startX + column * cellWidth, row.y, 2, cellHeight, [22, 24, 24, 255]);
    }
    for (let column = 0; column < row.cells; column += 1) {
      const baseX = startX + column * cellWidth + 20;
      const baseY = row.y + 18;
      for (let y = baseY; y < baseY + 26; y += 1) {
        for (let x = baseX; x < baseX + 24; x += 1) {
          const offset = (y * image.width + x) * 4;
          image.data[offset] = (x * 17 + y * 11 + column * 31) % 256;
          image.data[offset + 1] = (x * 9 + y * 23 + row.y) % 256;
          image.data[offset + 2] = (x * 29 + y * 5 + column * 13) % 256;
          image.data[offset + 3] = 255;
        }
      }
    }
  }

  return image;
}

function drawRect(image: RGBAImage, startX: number, startY: number, width: number, height: number, rgba: [number, number, number, number]) {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }
}

describe("fix setting suggestions", () => {
  test("suggests sprite sheet mode for wide sources", () => {
    const suggestion = suggestFixSettings(blankImage(256, 64));

    expect(suggestion.assetType).toBe("spriteSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.reason).toContain("wide");
  });

  test("suggests tile sheet mode for evenly tiled square sources", () => {
    const suggestion = suggestFixSettings(blankImage(128, 128));

    expect(suggestion.assetType).toBe("tileset");
    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.maxColors).toBe(16);
    expect(suggestion.categoryWarnings.map((warning) => warning.code)).toContain("tileset-engine-metadata-next");
  });

  test("uses grid detection candidate dimensions when available", () => {
    const suggestion = suggestFixSettings(blankImage(32, 16));

    expect(suggestion.gridDetect).toBe("auto");
    expect(suggestion.gridCandidates.length).toBeGreaterThan(0);
    expect(suggestion.targetWidth).toBeGreaterThan(0);
    expect(suggestion.targetHeight).toBeGreaterThan(0);
    expect(suggestion.gridScaleX).toBeGreaterThan(0);
    expect(suggestion.gridScaleY).toBeGreaterThan(0);
  });

  test("reports high single-sprite mode confidence for portrait character art", () => {
    const suggestion = suggestFixSettings(blankImage(706, 878));

    expect(suggestion.assetType).toBe("portrait");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.downscale).toBe("adaptive");
    expect(suggestion.reason).toContain("adaptive");
    expect(suggestion.categoryReason).toContain("portrait");
    expect(suggestion.categoryWarnings.map((warning) => warning.code)).toContain("portrait-inspect-only");
    expect(suggestion.modeConfidence).toBeGreaterThan(0.85);
    expect(suggestion.targetWidth).toBeLessThanOrEqual(176);
    expect(suggestion.targetHeight).toBeLessThanOrEqual(220);
  });

  test("suggests background flood-fill for single sprites on bright opaque backgrounds", () => {
    const suggestion = suggestFixSettings(singleSpriteOnBrightBackground());

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.alphaSettings).toMatchObject({
      tolerance: 18,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });
    expect(suggestion.downscale).toBe("adaptive");
  });

  test("suggests local correction for high-resolution single sprites", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const suggestion = suggestFixSettings(fixture.image);

    expect(suggestion.localCorrection).toBe(true);
    expect(suggestion.gridPhaseX).toBe(fixture.expected.phaseX);
    expect(suggestion.gridPhaseY).toBe(fixture.expected.phaseY);
  });

  test("suggests sprite sheet mode for large landscape animation sheets with rows", () => {
    const suggestion = suggestFixSettings(largeAnimationSheetLikeSource());

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.categoryConfidence).toBeGreaterThan(0.75);
    expect(suggestion.categoryReason).toMatch(/timeline|animation/i);
    expect(suggestion.modeConfidence).toBeGreaterThan(0.75);
    expect(suggestion.reason).toContain("multiple frames");
  });

  test("recommends frame-first conditioning for complex presentation sheets", () => {
    const suggestion = suggestFixSettings(complexPresentationSheetLikeSource());

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.downscale).toBe("detailPreserving");
    expect(suggestion.removeHalos).toBe(false);
    expect(suggestion.denoiseStrength).toBe(0);
    expect(suggestion.reason).toContain("Frame-first source conditioning");
    expect(suggestion.categoryWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "sheet-frame-first-conditioning",
          severity: "warning"
        })
      ])
    );
    expect(suggestion.sheetLayout?.diagnostics?.conditioning?.recommendFrameFirst).toBe(true);
  });

  test("keeps normal animation sheet cleanup defaults when conditioning is not needed", () => {
    const suggestion = suggestFixSettings(largeAnimationSheetLikeSource());

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.removeHalos).toBe(true);
    expect(suggestion.denoiseStrength).toBe(20);
    expect(suggestion.sheetLayout?.diagnostics?.conditioning?.recommendFrameFirst).toBe(false);
  });

  test("suggests icon defaults for small near-square sources", () => {
    const suggestion = suggestFixSettings(blankImage(48, 48));

    expect(suggestion.assetType).toBe("icon");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.alphaSettings).toMatchObject({
      threshold: 144,
      decontaminateRgb: true
    });
    expect(suggestion.maxColors).toBe(16);
  });

  test("uses preservation defaults for large background-like sources", () => {
    const suggestion = suggestFixSettings(blankImage(1280, 720));

    expect(suggestion.assetType).toBe("background");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("preserve");
    expect(suggestion.alphaSettings).toMatchObject({ decontaminateRgb: false });
    expect(suggestion.maxColors).toBe(64);
    expect(suggestion.categoryWarnings.map((warning) => warning.code)).toContain("background-inspect-only");
    expect(suggestion.categoryWarnings.map((warning) => warning.code)).toContain("preserve-intentional-soft-alpha");
  });

  test("includes detected sheet controls for row-based animation sheets", () => {
    const suggestion = suggestFixSettings(largeAnimationSheetLikeSource());

    expect(suggestion.sheetLayout).toMatchObject({
      rows: 6,
      columns: 9,
      rowFrameCounts: [5, 8, 6, 9, 7, 9],
      spacing: expect.any(Number)
    });
    expect(suggestion.sheetLayout?.frames).toHaveLength(44);
    expect(suggestion.sheetLayout?.rowAnimations).toHaveLength(6);
  });

  test("packs detected sheet frames into clean output coordinates while preserving source rects", () => {
    const suggestion = suggestFixSettings(largeAnimationSheetLikeSource());
    const layout = suggestion.sheetLayout;

    expect(layout).toBeDefined();
    expect(layout?.margin).toBe(0);
    expect(layout?.spacing).toBe(0);
    expect(layout?.frames[0]).toMatchObject({
      rect: { x: 0, y: 0, w: layout?.frameWidth, h: layout?.frameHeight }
    });
    expect(layout?.frames[0]?.sourceRect?.x).toBeGreaterThan(80);
    expect(layout?.frames[0]?.sourceRect?.y).toBeGreaterThan(10);

    const secondRowFirstFrame = layout?.frames[5];
    expect(secondRowFirstFrame).toMatchObject({
      rect: { x: 0, y: layout?.frameHeight, w: layout?.frameWidth, h: layout?.frameHeight }
    });
    expect(secondRowFirstFrame?.sourceRect?.x).toBeGreaterThan(80);
    expect(secondRowFirstFrame?.sourceRect?.y).toBeGreaterThan(80);
  });

  test("targets the packed sheet dimensions from detected native frames", () => {
    const suggestion = suggestFixSettings(largeAnimationSheetLikeSource());
    const layout = suggestion.sheetLayout;

    expect(layout).toBeDefined();
    expect(suggestion.targetWidth).toBe((layout?.columns ?? 0) * (layout?.frameWidth ?? 0));
    expect(suggestion.targetHeight).toBe((layout?.rows ?? 0) * (layout?.frameHeight ?? 0));
  });

  test("prefers plausible single-sprite native sizes over tiny high-confidence scales", () => {
    const tinyScale: GridCandidate = {
      outputWidth: 353,
      outputHeight: 439,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.46,
      reason: "tiny scale"
    };
    const plausibleScale: GridCandidate = {
      outputWidth: 88,
      outputHeight: 109,
      scaleX: 8,
      scaleY: 8,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.4,
      reason: "plausible scale"
    };

    expect(chooseSuggestionGrid({ width: 706, height: 878 }, [tinyScale, plausibleScale], "single")).toBe(plausibleScale);
  });

  test("creates a plausible single-sprite grid when all candidates are oversized", () => {
    const oversized: GridCandidate = {
      outputWidth: 176,
      outputHeight: 219,
      scaleX: 4,
      scaleY: 4,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.43,
      reason: "oversized"
    };

    expect(chooseSuggestionGrid({ width: 706, height: 878 }, [oversized], "single")).toMatchObject({
      outputWidth: 100,
      outputHeight: 125,
      scaleX: 7,
      scaleY: 7,
      reason: "Plausible single-sprite native size"
    });
  });
});
