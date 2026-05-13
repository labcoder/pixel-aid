import { describe, expect, test } from "vitest";
import { createImage, fixImage, readPixel, suggestFixSettings, writePixel } from "./index";
import type { FixOptions, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";

const transparent = [0, 0, 0, 0] as const;
const dark = [1, 2, 8, 255] as const;
const outline = [3, 11, 35, 255] as const;
const white = [249, 248, 248, 255] as const;
const blue = [3, 132, 242, 255] as const;
const cyan = [25, 193, 255, 255] as const;
const gray = [202, 199, 201, 255] as const;

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

function drawTile(image: RGBAImage, startX: number, startY: number, colorA: readonly [number, number, number, number], colorB: readonly [number, number, number, number]): void {
  fillRect(image, startX, startY, 8, 8, colorA);
  fillRect(image, startX + 2, startY + 2, 4, 4, colorB);
  fillRect(image, startX + 1, startY + 6, 6, 1, [95, 87, 79, 255]);
}

function packedLowColorTilemap(): RGBAImage {
  const image = createImage(120, 80, [255, 204, 170, 255]);
  const colors = [
    [255, 163, 0, 255],
    [255, 119, 168, 255],
    [41, 173, 255, 255],
    [255, 0, 77, 255],
    [131, 118, 156, 255],
    [29, 43, 83, 255]
  ] as const;
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 15; column += 1) {
      const colorA = colors[(row + column) % colors.length]!;
      const colorB = colors[(row * 3 + column * 2) % colors.length]!;
      drawTile(image, column * 8, row * 8, colorA, colorB);
    }
  }
  return image;
}

function transparentGridTilemap(): RGBAImage {
  const columns = 15;
  const rows = 10;
  const tileSize = 8;
  const image = createImage(columns * tileSize + columns + 1, rows * tileSize + rows + 1, transparent);
  const colors = [
    [255, 204, 170, 255],
    [255, 163, 0, 255],
    [255, 119, 168, 255],
    [41, 173, 255, 255],
    [131, 118, 156, 255]
  ] as const;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = 1 + column * (tileSize + 1);
      const y = 1 + row * (tileSize + 1);
      drawTile(image, x, y, colors[(row + column) % colors.length]!, colors[(row + column + 2) % colors.length]!);
    }
  }
  return image;
}

function cleanBlueSourceSizedAtlas(): RGBAImage {
  const cellWidth = 64;
  const cellHeight = 72;
  const columns = 8;
  const rows = 9;
  const image = createImage(columns * cellWidth - 3, rows * cellHeight - 3, transparent);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const baseX = column * cellWidth + 17 + ((row + column) % 3);
      const baseY = row * cellHeight + 11 + ((row * 2 + column) % 3);
      fillRect(image, baseX + 6, baseY, 32, 16, white);
      fillRect(image, baseX + 8, baseY + 3, 28, 10, outline);
      fillRect(image, baseX + 14, baseY + 7, 4, 2, cyan);
      fillRect(image, baseX + 27, baseY + 7, 4, 2, cyan);
      fillRect(image, baseX + 10, baseY + 20, 26, 24, white);
      fillRect(image, baseX + 15, baseY + 22, 16, 13, blue);
      fillRect(image, baseX + 2, baseY + 31, 10, 20, gray);
      fillRect(image, baseX + 34, baseY + 31, 10, 20, gray);
      fillRect(image, baseX + 13, baseY + 44, 8, 18, white);
      fillRect(image, baseX + 27, baseY + 44, 8, 18, white);
      fillRect(image, baseX + 11, baseY + 58, 12, 4, blue);
      fillRect(image, baseX + 25, baseY + 58, 12, 4, blue);
      if (row >= 5) {
        fillRect(image, baseX + 10, baseY + 34, 29, 14, dark);
      }
    }
  }
  return image;
}

function opaqueSpriteWithGreenMatte(): RGBAImage {
  const background = [47, 26, 26, 255] as const;
  const greenMatte = [39, 91, 20, 255] as const;
  const image = createImage(32, 36, background);
  fillRect(image, 10, 5, 12, 1, greenMatte);
  fillRect(image, 8, 6, 16, 2, greenMatte);
  fillRect(image, 7, 8, 18, 15, greenMatte);
  fillRect(image, 9, 9, 14, 13, white);
  fillRect(image, 10, 10, 12, 4, dark);
  fillRect(image, 13, 12, 2, 1, cyan);
  fillRect(image, 18, 12, 2, 1, cyan);
  fillRect(image, 12, 22, 8, 8, blue);
  fillRect(image, 8, 21, 5, 8, white);
  fillRect(image, 20, 21, 5, 8, white);
  fillRect(image, 11, 29, 4, 5, white);
  fillRect(image, 18, 29, 4, 5, white);
  return image;
}

function outlinedMagentaMatteSprite(): RGBAImage {
  const background = [255, 0, 245, 255] as const;
  const magentaFringe = [210, 0, 205, 255] as const;
  const whiteOutline = [250, 250, 246, 255] as const;
  const fur = [18, 18, 18, 255] as const;
  const image = createImage(64, 64, background);

  fillRect(image, 18, 9, 28, 4, magentaFringe);
  fillRect(image, 18, 51, 28, 4, magentaFringe);
  fillRect(image, 13, 18, 4, 28, magentaFringe);
  fillRect(image, 47, 18, 4, 28, magentaFringe);

  fillRect(image, 18, 13, 28, 4, whiteOutline);
  fillRect(image, 18, 47, 28, 4, whiteOutline);
  fillRect(image, 17, 17, 4, 30, whiteOutline);
  fillRect(image, 43, 17, 4, 30, whiteOutline);

  fillRect(image, 21, 17, 22, 30, fur);
  fillRect(image, 29, 24, 6, 20, white);
  fillRect(image, 24, 27, 4, 4, cyan);
  fillRect(image, 36, 27, 4, 4, cyan);

  return image;
}

function noOutlineMagentaMatteSprite(): RGBAImage {
  const background = [255, 0, 245, 255] as const;
  const fur = [18, 18, 18, 255] as const;
  const image = createImage(64, 64, background);

  fillRect(image, 18, 13, 28, 4, fur);
  fillRect(image, 17, 17, 30, 30, fur);
  fillRect(image, 16, 24, 4, 20, fur);
  fillRect(image, 44, 24, 4, 20, fur);
  fillRect(image, 29, 24, 6, 20, white);
  fillRect(image, 24, 27, 4, 4, cyan);
  fillRect(image, 36, 27, 4, 4, cyan);

  return image;
}

function countVisibleMagentaMatte(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! === 0) {
      continue;
    }
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (r >= 160 && b >= 150 && g <= 48 && Math.min(r, b) - g >= 120) {
      count += 1;
    }
  }
  return count;
}

function buildFixOptions(image: RGBAImage): FixOptions {
  const suggestion = suggestFixSettings(image);
  const sheet = suggestion.sheetLayout;
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
      lockScope: suggestion.mode === "single" ? "single" : "sheet",
      dithering: "none"
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: suggestion.gridScaleX,
      scaleY: suggestion.gridScaleY,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: false,
      localCorrection: suggestion.localCorrection
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
      outlineMode: suggestion.outlineMode,
      outlineSize: suggestion.outlineSize,
      outlineSourceColors: suggestion.outlineSourceColors,
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
    ...(sheet ? buildSheetOptions(sheet) : {})
  };
}

function buildSheetOptions(sheet: SheetLayoutDetection): Pick<FixOptions, "sheet" | "sheetFrames"> {
  return {
    sheet: {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      rows: sheet.rows,
      columns: sheet.columns,
      margin: sheet.margin,
      spacing: sheet.spacing,
      extrude: 0
    },
    sheetFrames: sheet.frames
  };
}

function changedPixels(source: RGBAImage, output: RGBAImage): number {
  let changed = 0;
  for (let y = 0; y < Math.min(source.height, output.height); y += 1) {
    for (let x = 0; x < Math.min(source.width, output.width); x += 1) {
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

function countVisibleGreenMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a > 0 && g > r * 1.2 && g > b * 1.2 && g - r > 20) {
      count += 1;
    }
  }
  return count;
}

function countTransparentPixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) {
      count += 1;
    }
  }
  return count;
}

function countDarkOpaquePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a === 255 && r <= 48 && g <= 48 && b <= 48) {
      count += 1;
    }
  }
  return count;
}

describe("quality recovery regressions", () => {
  test("classifies packed low-color maps as preservation-first tilemaps", () => {
    const image = packedLowColorTilemap();
    const suggestion = suggestFixSettings(image);

    expect(suggestion.assetType).toBe("tilemap");
    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.targetWidth).toBe(image.width);
    expect(suggestion.targetHeight).toBe(image.height);
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expect(suggestion.alpha).toBe("preserve");
    expect(suggestion.removeOrphans).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.removeHalos).toBe(false);
    expect(suggestion.denoiseStrength).toBe(0);
  });

  test("classifies transparent grid maps as tilemaps without destructive resizing", () => {
    const image = transparentGridTilemap();
    const suggestion = suggestFixSettings(image);

    expect(suggestion.assetType).toBe("tilemap");
    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.targetWidth).toBe(image.width);
    expect(suggestion.targetHeight).toBe(image.height);
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expect(suggestion.alpha).toBe("preserve");
  });

  test("keeps clean low-color source-sized animation atlases nearly identical", () => {
    const source = cleanBlueSourceSizedAtlas();
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.gridScaleX).toBe(1);
    expect(suggestion.gridScaleY).toBe(1);
    expect(suggestion.downscale).toBe("dominant");
    expect(suggestion.matteCleanup).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.outlineMode).toBe("none");
    expect(changedPixels(source, result.image)).toBe(0);
  });

  test("removes opaque sprite backgrounds and green matte fringes by default", () => {
    const source = opaqueSpriteWithGreenMatte();
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(countTransparentPixels(result.image)).toBeGreaterThan(500);
    expect(countVisibleGreenMattePixels(result.image)).toBe(0);
    expect(readPixel(result.image, 15, 12)[3]).toBe(255);
  });

  test("guided cleanup removes exterior magenta matte around a white outlined sprite", () => {
    const source = outlinedMagentaMatteSprite();
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(result.settings.cleanup.morphology).toMatchObject({
      enabled: true,
      matteCleanup: true
    });
    expect(countVisibleMagentaMatte(result.image)).toBe(0);
    expect(readPixel(result.image, 17, 32)[3]).toBe(255);
    expect(readPixel(result.image, 29, 32)[3]).toBe(255);
  });

  test("guided cleanup preserves no-outline dark silhouettes on magenta backgrounds", () => {
    const source = noOutlineMagentaMatteSprite();
    const suggestion = suggestFixSettings(source);
    const result = fixImage(source, buildFixOptions(source));

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.matteCleanup).toBe(true);
    expect(countVisibleMagentaMatte(result.image)).toBe(0);
    expect(countDarkOpaquePixels(result.image)).toBeGreaterThanOrEqual(6);
  });
});
