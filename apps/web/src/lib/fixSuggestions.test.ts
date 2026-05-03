import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, createSingleSpriteCleanupFixture } from "@pixelaid/fixtures";
import { fixImage } from "@pixelaid/core";
import { chooseSuggestionGrid, suggestFixSettings } from "./fixSuggestions";
import type { FixOptions, GridCandidate, Rect, RGBAImage } from "@pixelaid/shared";

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

function cleanAnimationSheetLikeSource(): RGBAImage {
  const image = blankImage(768, 512);
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

function detailedPresentationSheetLikeSource(): RGBAImage {
  const image = complexPresentationSheetLikeSource();
  const frameX = 104;
  const frameY = 24;

  for (let y = 0; y < 36; y += 1) {
    const x = frameX + 16 + Math.floor(y * 0.55);
    drawRect(image, x, frameY + 10 + y, 2, 2, [14, 24, 26, 255]);
    drawRect(image, x + 3, frameY + 10 + y, 2, 2, [188, 225, 218, 255]);
  }
  drawRect(image, frameX + 20, frameY + 42, 28, 3, [14, 24, 26, 255]);
  drawRect(image, frameX + 27, frameY + 35, 18, 5, [0, 244, 246, 255]);

  return image;
}

function lowScaleBakedCheckerboardPandaSource(): RGBAImage {
  const scale = 3;
  const nativeWidth = 91;
  const nativeHeight = 96;
  const image = blankImage(nativeWidth * scale, nativeHeight * scale);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const darkCell = (Math.floor(x / 24) + Math.floor(y / 24)) % 2 === 1;
      const hasInteriorCompressionSeam = x > 0 && y > 0 && x < image.width - 1 && y < image.height - 1 && (x % 24 === 11 || y % 24 === 11);
      const value = hasInteriorCompressionSeam ? 226 : darkCell ? 202 : 250;
      const offset = (y * image.width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }

  const outline: [number, number, number, number] = [22, 20, 31, 255];
  const shadow: [number, number, number, number] = [54, 49, 51, 255];
  const cream: [number, number, number, number] = [253, 247, 219, 255];
  const brown: [number, number, number, number] = [114, 80, 65, 255];

  fillScaledRect(image, scale, 31, 12, 29, 6, outline);
  fillScaledRect(image, scale, 25, 18, 41, 20, outline);
  fillScaledRect(image, scale, 28, 17, 35, 31, cream);
  fillScaledRect(image, scale, 20, 37, 16, 29, outline);
  fillScaledRect(image, scale, 55, 37, 16, 29, outline);
  fillScaledRect(image, scale, 26, 42, 10, 20, shadow);
  fillScaledRect(image, scale, 55, 42, 10, 20, shadow);
  fillScaledRect(image, scale, 37, 45, 17, 30, cream);
  fillScaledRect(image, scale, 30, 70, 13, 10, brown);
  fillScaledRect(image, scale, 49, 70, 13, 10, brown);
  fillScaledRect(image, scale, 32, 29, 7, 8, outline);
  fillScaledRect(image, scale, 52, 29, 7, 8, outline);
  fillScaledRect(image, scale, 43, 37, 5, 3, outline);
  fillScaledRect(image, scale, 39, 42, 13, 3, outline);
  fillScaledRect(image, scale, 40, 18, 12, 3, [255, 253, 235, 255]);
  addNativePixelVariation(image, scale);

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

function fillScaledRect(image: RGBAImage, scale: number, x: number, y: number, width: number, height: number, rgba: [number, number, number, number]) {
  drawRect(image, x * scale, y * scale, width * scale, height * scale, rgba);
}

function addNativePixelVariation(image: RGBAImage, scale: number) {
  const nativeWidth = Math.floor(image.width / scale);
  const nativeHeight = Math.floor(image.height / scale);

  for (let nativeY = 0; nativeY < nativeHeight; nativeY += 1) {
    for (let nativeX = 0; nativeX < nativeWidth; nativeX += 1) {
      const sampleOffset = (nativeY * scale * image.width + nativeX * scale) * 4;
      const r = image.data[sampleOffset]!;
      const g = image.data[sampleOffset + 1]!;
      const b = image.data[sampleOffset + 2]!;
      if (Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1 && r >= 190) {
        continue;
      }

      const delta = (nativeX + nativeY) % 2 === 0 ? -6 : 6;
      const color: [number, number, number, number] = [
        Math.max(0, Math.min(255, r + delta)),
        Math.max(0, Math.min(255, g + delta)),
        Math.max(0, Math.min(255, b + delta)),
        255
      ];
      drawRect(image, nativeX * scale, nativeY * scale, scale, scale, color);
    }
  }
}

function buildSuggestedFixOptions(image: RGBAImage, cleanupOverride: Partial<FixOptions["cleanup"]> = {}): FixOptions {
  const suggestion = suggestFixSettings(image);
  const layout = suggestion.sheetLayout;
  if (!layout) {
    throw new Error("Expected sheet layout");
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
    alphaSettings: { ...suggestion.alphaSettings, transparentRgb: "#000000" },
    cleanup: {
      removeOrphans: suggestion.removeOrphans,
      jaggyCleanup: suggestion.jaggyCleanup,
      preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
      removeHalos: suggestion.removeHalos,
      denoiseStrength: suggestion.denoiseStrength,
      ...cleanupOverride
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

function buildSuggestedSingleFixOptions(image: RGBAImage): FixOptions {
  const suggestion = suggestFixSettings(image);
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
      lockScope: "single",
      dithering: "none"
    },
    grid: {
      detect: suggestion.gridDetect,
      scaleX: suggestion.gridScaleX,
      scaleY: suggestion.gridScaleY,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: true,
      localCorrection: suggestion.localCorrection
    },
    downscale: suggestion.downscale,
    alpha: suggestion.alpha,
    alphaSettings: { ...suggestion.alphaSettings, transparentRgb: "#000000" },
    cleanup: {
      removeOrphans: suggestion.removeOrphans,
      jaggyCleanup: suggestion.jaggyCleanup,
      preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
      removeHalos: suggestion.removeHalos,
      denoiseStrength: suggestion.denoiseStrength,
      ...(suggestion.contrastExpansionEnabled ? { contrastExpansion: { enabled: true } } : {}),
      outlineMode: suggestion.outlineMode,
      outlineSize: suggestion.outlineSize,
      ...(suggestion.outlineSourceColors.length > 0 ? { outlineSourceColors: suggestion.outlineSourceColors } : {})
    }
  };
}

function cropImage(image: RGBAImage, rect: Rect): RGBAImage {
  const out = blankImage(rect.w, rect.h);
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const sourceOffset = ((rect.y + y) * image.width + rect.x + x) * 4;
      const outputOffset = (y * out.width + x) * 4;
      out.data[outputOffset] = image.data[sourceOffset]!;
      out.data[outputOffset + 1] = image.data[sourceOffset + 1]!;
      out.data[outputOffset + 2] = image.data[sourceOffset + 2]!;
      out.data[outputOffset + 3] = image.data[sourceOffset + 3]!;
    }
  }
  return out;
}

function frameDetailMetrics(image: RGBAImage): { darkPixels: number; edgeEnergy: number } {
  let darkPixels = 0;
  let edgeEnergy = 0;
  let edgeCount = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const a = image.data[offset + 3]!;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      if (a >= 16 && luma < 55) {
        darkPixels += 1;
      }

      if (x + 1 < image.width) {
        const nextOffset = offset + 4;
        const nextLuma =
          image.data[nextOffset]! * 0.299 + image.data[nextOffset + 1]! * 0.587 + image.data[nextOffset + 2]! * 0.114;
        edgeEnergy += Math.abs(luma - nextLuma);
        edgeCount += 1;
      }
      if (y + 1 < image.height) {
        const nextOffset = ((y + 1) * image.width + x) * 4;
        const nextLuma =
          image.data[nextOffset]! * 0.299 + image.data[nextOffset + 1]! * 0.587 + image.data[nextOffset + 2]! * 0.114;
        edgeEnergy += Math.abs(luma - nextLuma);
        edgeCount += 1;
      }
    }
  }

  return {
    darkPixels,
    edgeEnergy: edgeEnergy / Math.max(1, edgeCount)
  };
}

function countSoftAlphaPixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha > 0 && alpha < 255) {
      count += 1;
    }
  }
  return count;
}

function countVisibleCreamPixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (r >= 220 && g >= 200 && b >= 150 && r - b >= 35) {
      count += 1;
    }
  }
  return count;
}

function exteriorEdgeColorMetrics(image: RGBAImage): { edgePixels: number; darkEdgePixels: number; uniqueEdgeColors: number } {
  const colors = new Set<string>();
  let edgePixels = 0;
  let darkEdgePixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < 16 || !hasTransparentNeighbor(image, x, y)) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      edgePixels += 1;
      if (luma < 72) {
        darkEdgePixels += 1;
      }
      colors.add(`${r},${g},${b}`);
    }
  }

  return { edgePixels, darkEdgePixels, uniqueEdgeColors: colors.size };
}

function darkPixelRatioInRect(image: RGBAImage, rect: Rect): number {
  let total = 0;
  let dark = 0;

  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < 16) {
        continue;
      }

      const luma = image.data[offset]! * 0.299 + image.data[offset + 1]! * 0.587 + image.data[offset + 2]! * 0.114;
      total += 1;
      if (luma < 72) {
        dark += 1;
      }
    }
  }

  return dark / Math.max(1, total);
}

function projectNativeRectToOutput(grid: GridCandidate, nativeScale: number, rect: Rect): Rect {
  const sourceX = grid.sourceRect?.x ?? grid.phaseX;
  const sourceY = grid.sourceRect?.y ?? grid.phaseY;
  return {
    x: Math.max(0, Math.floor((rect.x * nativeScale - sourceX) / grid.scaleX)),
    y: Math.max(0, Math.floor((rect.y * nativeScale - sourceY) / grid.scaleY)),
    w: Math.max(1, Math.ceil((rect.w * nativeScale) / grid.scaleX)),
    h: Math.max(1, Math.ceil((rect.h * nativeScale) / grid.scaleY))
  };
}

function hasTransparentNeighbor(image: RGBAImage, x: number, y: number): boolean {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ] as const;

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
      return true;
    }
    if (image.data[(ny * image.width + nx) * 4 + 3]! < 16) {
      return true;
    }
  }

  return false;
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

  test("suggests crisp sprite cleanup for baked checkerboard panda backgrounds", () => {
    const fixture = cleanupFixtureCatalog.find((item) => item.id === "high-contrast-checkerboard-panda");
    if (!fixture) {
      throw new Error("Expected panda checkerboard fixture");
    }

    const suggestion = suggestFixSettings(fixture.createImage());

    expect(["sprite", "icon"]).toContain(suggestion.assetType);
    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.downscale).toBe("dominant");
    expect(suggestion.contrastExpansionEnabled).toBe(false);
    expect(suggestion.outlineMode).toBe("repairExisting");
    expect(suggestion.outlineSize).toBe(1);
    expect(suggestion.outlineSourceColors).toHaveLength(1);
  });

  test("suggested baked checkerboard panda cleanup preserves body and repairs exterior outline", () => {
    const fixture = cleanupFixtureCatalog.find((item) => item.id === "high-contrast-checkerboard-panda");
    if (!fixture) {
      throw new Error("Expected panda checkerboard fixture");
    }

    const result = fixImage(fixture.createImage(), buildSuggestedSingleFixOptions(fixture.createImage()));
    const edgeMetrics = exteriorEdgeColorMetrics(result.image);

    expect(result.settings.downscale).toBe("dominant");
    expect(result.settings.cleanup.contrastExpansion?.enabled).not.toBe(true);
    expect(result.settings.cleanup.outlineMode).toBe("repairExisting");
    expect(result.settings.cleanup.outlineSize).toBe(1);
    expect(countSoftAlphaPixels(result.image)).toBe(0);
    expect(countVisibleCreamPixels(result.image)).toBeGreaterThanOrEqual(20);
    expect(edgeMetrics.edgePixels).toBeGreaterThan(0);
    expect(edgeMetrics.darkEdgePixels / edgeMetrics.edgePixels).toBeGreaterThanOrEqual(0.8);
    expect(edgeMetrics.uniqueEdgeColors).toBeLessThanOrEqual(3);
  });

  test("avoids dark detail expansion for low-scale baked checkerboard sprites", () => {
    const source = lowScaleBakedCheckerboardPandaSource();
    const suggestion = suggestFixSettings(source);

    expect(suggestion.mode).toBe("single");
    expect(suggestion.alpha).toBe("backgroundFloodFill");
    expect(suggestion.downscale).toBe("dominant");
    expect(suggestion.gridScaleX).toBeLessThanOrEqual(3.25);
    expect(suggestion.removeOrphans).toBe(false);
    expect(suggestion.jaggyCleanup).toBe(false);
    expect(suggestion.removeHalos).toBe(false);
    expect(suggestion.denoiseStrength).toBe(0);
    expect(suggestion.contrastExpansionEnabled).toBe(false);
    expect(suggestion.outlineMode).toBe("repairExisting");
    expect(suggestion.outlineSize).toBe(1);
    expect(suggestion.outlineSourceColors).toHaveLength(1);
  });

  test("suggested low-scale baked checkerboard cleanup does not spread dark pixels across the face", () => {
    const source = lowScaleBakedCheckerboardPandaSource();
    const result = fixImage(source, buildSuggestedSingleFixOptions(source));
    const faceRect = projectNativeRectToOutput(result.grid, 3, { x: 28, y: 17, w: 35, h: 31 });

    expect(result.settings.cleanup.contrastExpansion?.enabled).not.toBe(true);
    expect(result.settings.cleanup.outlineSize).toBe(1);
    expect(result.settings.cleanup.outlineSourceColors).toHaveLength(1);
    expect(darkPixelRatioInRect(result.image, faceRect)).toBeLessThan(0.45);
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
    const suggestion = suggestFixSettings(cleanAnimationSheetLikeSource());

    expect(suggestion.assetType).toBe("animationSheet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.removeHalos).toBe(true);
    expect(suggestion.denoiseStrength).toBe(20);
    expect(suggestion.sheetLayout?.diagnostics?.conditioning?.recommendFrameFirst).toBe(false);
  });

  test("preserves final frame detail better than destructive sheet cleanup for complex sheets", () => {
    const source = detailedPresentationSheetLikeSource();
    const recommendedOptions = buildSuggestedFixOptions(source);
    const destructiveOptions = buildSuggestedFixOptions(source, {
      removeHalos: true,
      denoiseStrength: 20
    });
    const frame = recommendedOptions.sheetFrames?.[0];

    if (!frame) {
      throw new Error("Expected first frame");
    }

    const recommended = cropImage(fixImage(source, recommendedOptions).image, frame.rect);
    const destructive = cropImage(fixImage(source, destructiveOptions).image, frame.rect);
    const recommendedMetrics = frameDetailMetrics(recommended);
    const destructiveMetrics = frameDetailMetrics(destructive);

    expect(recommendedOptions.downscale).toBe("detailPreserving");
    expect(recommendedOptions.cleanup.removeHalos).toBe(false);
    expect(recommendedOptions.cleanup.denoiseStrength).toBe(0);
    expect(recommendedMetrics.darkPixels).toBeGreaterThan(destructiveMetrics.darkPixels);
    expect(recommendedMetrics.edgeEnergy).toBeGreaterThan(destructiveMetrics.edgeEnergy);
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
