import { describe, expect, test } from "vitest";
import { createImage, fixImage, suggestFixSettings, suggestFixSettingsForAssetType, writePixel } from "./index";
import type { FixOptions, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";

const atlasColumns = 8;
const atlasRows = 9;
const atlasCellWidth = 192;
const atlasCellHeight = 208;

function fillRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  const endX = Math.min(image.width, startX + width);
  const endY = Math.min(image.height, startY + height);
  for (let y = Math.max(0, startY); y < endY; y += 1) {
    for (let x = Math.max(0, startX); x < endX; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function largeNearCroppedAtlas(trimRight = 3, trimBottom = 3): RGBAImage {
  const image = createImage(atlasColumns * atlasCellWidth - trimRight, atlasRows * atlasCellHeight - trimBottom, [0, 0, 0, 255]);
  const bodyColors = [
    [244, 248, 250, 255],
    [0, 136, 236, 255],
    [22, 190, 255, 255],
    [40, 74, 112, 255],
    [8, 16, 28, 255]
  ] as const;

  for (let row = 0; row < atlasRows; row += 1) {
    for (let column = 0; column < atlasColumns; column += 1) {
      const cellX = column * atlasCellWidth;
      const cellY = row * atlasCellHeight;
      const driftX = (row + column * 2) % 9;
      const driftY = (row * 3 + column) % 7;
      const baseX = cellX + 50 + driftX;
      const baseY = cellY + 18 + driftY;

      fillRect(image, baseX + 28, baseY, 72, 50, bodyColors[0]);
      fillRect(image, baseX + 36, baseY + 12, 56, 24, bodyColors[4]);
      fillRect(image, baseX + 48, baseY + 22, 8, 5, bodyColors[2]);
      fillRect(image, baseX + 72, baseY + 22, 8, 5, bodyColors[2]);
      fillRect(image, baseX + 42, baseY + 54, 46, 52, bodyColors[0]);
      fillRect(image, baseX + 52, baseY + 60, 26, 28, bodyColors[1]);
      fillRect(image, baseX + 18, baseY + 68, 28, 44, bodyColors[0]);
      fillRect(image, baseX + 86, baseY + 68, 28, 44, bodyColors[0]);
      fillRect(image, baseX + 36, baseY + 102, 22, 48, bodyColors[0]);
      fillRect(image, baseX + 72, baseY + 102, 22, 48, bodyColors[0]);
      fillRect(image, baseX + 24, baseY + 134, 34, 10, bodyColors[1]);
      fillRect(image, baseX + 70, baseY + 134, 34, 10, bodyColors[1]);
      fillRect(image, baseX + 28, baseY - 6, 76, 4, bodyColors[1]);
      fillRect(image, baseX + 104, baseY - 22, 6, 18, bodyColors[0]);
      fillRect(image, baseX + 99, baseY - 32, 16, 16, bodyColors[2]);

      if (row >= 5) {
        fillRect(image, baseX + 26, baseY + 96, 84, 42, bodyColors[3]);
        fillRect(image, baseX + 36, baseY + 114, 64, 18, [2, 6, 12, 255]);
      }
    }
  }

  return image;
}

function buildSuggestedFixOptions(image: RGBAImage, suggestion = suggestFixSettings(image)): FixOptions {
  const layout = suggestion.sheetLayout;
  if (!layout) {
    throw new Error("Expected a sheet layout suggestion");
  }

  return {
    mode: suggestion.mode,
    assetType: suggestion.assetType,
    targetWidth: suggestion.targetWidth,
    targetHeight: suggestion.targetHeight,
    maxColors: suggestion.maxColors,
    paletteSettings: {
      mode: "auto",
      strategy: "medianCut",
      maxColors: suggestion.maxColors,
      lockScope: "sheet",
      dithering: "none"
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: suggestion.gridScaleX,
      scaleY: suggestion.gridScaleY,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY
    },
    downscale: suggestion.downscale,
    alpha: suggestion.alpha,
    alphaSettings: suggestion.alphaSettings,
    cleanup: {
      removeOrphans: suggestion.removeOrphans,
      jaggyCleanup: suggestion.jaggyCleanup,
      preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
      removeHalos: suggestion.removeHalos,
      denoiseStrength: suggestion.denoiseStrength,
      inferNativeScale: suggestion.inferNativeScale,
      ...(suggestion.matteCleanup
        ? {
            morphology: {
              enabled: true,
              matteCleanup: true,
              alphaThreshold: suggestion.alphaSettings.threshold ?? 128
            }
          }
        : {})
    },
    sheet: {
      frameWidth: layout.frameWidth,
      frameHeight: layout.frameHeight,
      rows: layout.rows,
      columns: layout.columns,
      margin: layout.margin,
      spacing: layout.spacing,
      extrude: 0
    },
    sheetFrames: layout.frames
  };
}

function expectAtlasLayout(layout: SheetLayoutDetection | undefined): asserts layout is SheetLayoutDetection {
  expect(layout).toMatchObject({
    frameWidth: atlasCellWidth,
    frameHeight: atlasCellHeight,
    rows: atlasRows,
    columns: atlasColumns
  });
  expect(layout?.frames).toHaveLength(atlasColumns * atlasRows);
}

function countChangedPixelsInSourceRegion(source: RGBAImage, output: RGBAImage): number {
  let changed = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const outputOffset = (y * output.width + x) * 4;
      if (
        source.data[sourceOffset] !== output.data[outputOffset] ||
        source.data[sourceOffset + 1] !== output.data[outputOffset + 1] ||
        source.data[sourceOffset + 2] !== output.data[outputOffset + 2] ||
        source.data[sourceOffset + 3] !== output.data[outputOffset + 3]
      ) {
        changed += 1;
      }
    }
  }
  return changed;
}

describe("large atlas quality recovery", () => {
  test("classifies near-cropped 8x9 pixel-perfect atlases as animation sheets instead of portraits", () => {
    const suggestion = suggestFixSettings(largeNearCroppedAtlas());

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expect(suggestion.targetWidth).toBe(atlasColumns * atlasCellWidth);
    expect(suggestion.targetHeight).toBe(atlasRows * atlasCellHeight);
    expectAtlasLayout(suggestion.sheetLayout);
  });

  test("re-runs large atlas detection when a user manually changes the type to animation sheet", () => {
    const suggestion = suggestFixSettingsForAssetType(largeNearCroppedAtlas(), "animationSheet");

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expectAtlasLayout(suggestion.sheetLayout);
  });

  test("preserves source pixels in near-cropped keep-size atlas processing instead of stretching edge cells", () => {
    const source = largeNearCroppedAtlas();
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildSuggestedFixOptions(source, suggestion));

    expect(result.image.width).toBe(atlasColumns * atlasCellWidth);
    expect(result.image.height).toBe(atlasRows * atlasCellHeight);
    expect(suggestion.removeOrphans).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.removeHalos).toBe(false);
    expect(suggestion.denoiseStrength).toBe(0);
    expect(countChangedPixelsInSourceRegion(source, result.image)).toBe(0);
  });
});
