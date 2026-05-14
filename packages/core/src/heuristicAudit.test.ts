import { describe, expect, test } from "vitest";
import { createImage, detectSheetLayout, suggestFixSettings, suggestFixSettingsForAssetType, writePixel } from "./index";
import type { RGBAImage } from "@pixelaid/shared";

function fillRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function nonCommonRegularObjectGrid(): RGBAImage {
  const columns = 6;
  const rows = 6;
  const frameWidth = 73;
  const frameHeight = 67;
  const image = createImage(columns * frameWidth, rows * frameHeight, [0, 0, 0, 0]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * frameWidth;
      const y = row * frameHeight;
      const tone = 88 + ((row + column) % 4) * 16;
      fillRect(image, x + 22, y + 14, 29, 10, [tone, 180, 166, 255]);
      fillRect(image, x + 18, y + 25, 37, 26, [236, 240, 224, 255]);
      fillRect(image, x + 27, y + 32, 8, 8, [12, 16, 28, 255]);
      fillRect(image, x + 40, y + 32, 8, 8, [12, 16, 28, 255]);
    }
  }

  return image;
}

function distinctIconSetGrid(): RGBAImage {
  const columns = 6;
  const rows = 6;
  const frameWidth = 72;
  const frameHeight = 72;
  const image = createImage(columns * frameWidth, rows * frameHeight, [0, 0, 0, 0]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * frameWidth;
      const y = row * frameHeight;
      const seed = row * columns + column;
      const r = 48 + (seed * 37) % 176;
      const g = 52 + (seed * 53) % 168;
      const b = 56 + (seed * 71) % 160;
      fillRect(image, x + 18 + (seed % 3) * 3, y + 16 + (seed % 4), 28 + (seed % 4) * 3, 18 + (seed % 5), [r, g, b, 255]);
      fillRect(image, x + 24, y + 38, 18 + (seed % 5) * 3, 10 + (seed % 4) * 3, [240 - ((seed * 11) % 130), 72 + ((seed * 17) % 144), 52 + ((seed * 23) % 156), 255]);
      fillRect(image, x + 26 + (seed % 5), y + 54, 10 + (seed % 4) * 4, 4, [16 + seed * 3, 18 + seed * 2, 28 + seed, 255]);
    }
  }

  return image;
}

function matteArtifactIconSetGrid(): RGBAImage {
  const image = distinctIconSetGrid();
  const frameWidth = 72;
  const frameHeight = 72;

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const x = column * frameWidth;
      const y = row * frameHeight;
      fillRect(image, x + 16, y + 14, 42, 2, [248, 0, 220, 180]);
      fillRect(image, x + 16, y + 58, 42, 1, [0, 236, 255, 164]);
      fillRect(image, x + 58, y + 18, 2, 36, [128, 0, 160, 196]);
    }
  }

  return image;
}

function repeatedTilemap(): RGBAImage {
  const columns = 8;
  const rows = 8;
  const tileSize = 16;
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);
  const palette: readonly (readonly [number, number, number, number])[] = [
    [28, 68, 52, 255],
    [48, 104, 68, 255],
    [74, 136, 82, 255],
    [32, 52, 84, 255]
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const color = palette[(row + column * 2) % palette.length]!;
      fillRect(image, column * tileSize, row * tileSize, tileSize, tileSize, color);
      fillRect(image, column * tileSize + 3, row * tileSize + 3, 4, 4, [color[0] + 8, color[1] + 8, color[2] + 8, 255]);
    }
  }

  return image;
}

function uniqueTileset(): RGBAImage {
  const columns = 8;
  const rows = 8;
  const tileSize = 16;
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const seed = row * columns + column;
      const x = column * tileSize;
      const y = row * tileSize;
      fillRect(image, x, y, tileSize, tileSize, [24 + (seed * 11) % 96, 32 + (seed * 17) % 104, 48 + (seed * 23) % 96, 255]);
      fillRect(image, x + (seed % 6), y + ((seed * 3) % 6), 6, 6, [160 + (seed * 5) % 80, 96 + (seed * 7) % 120, 48 + (seed * 13) % 144, 255]);
    }
  }

  return image;
}

function largeSingleSprite(): RGBAImage {
  const image = createImage(512, 512, [0, 0, 0, 0]);
  fillRect(image, 160, 104, 192, 152, [238, 242, 236, 255]);
  fillRect(image, 196, 148, 120, 52, [18, 22, 36, 255]);
  fillRect(image, 216, 168, 16, 14, [36, 184, 224, 255]);
  fillRect(image, 280, 168, 16, 14, [36, 184, 224, 255]);
  fillRect(image, 212, 256, 88, 120, [36, 132, 220, 255]);
  fillRect(image, 128, 284, 84, 36, [238, 242, 236, 255]);
  fillRect(image, 300, 284, 84, 36, [238, 242, 236, 255]);
  fillRect(image, 196, 376, 44, 96, [238, 242, 236, 255]);
  fillRect(image, 272, 376, 44, 96, [238, 242, 236, 255]);
  return image;
}

function gradientOutlinedCatSprite(): RGBAImage {
  const image = createImage(512, 512, [0, 0, 0, 255]);
  for (let y = 0; y < image.height; y += 1) {
    const t = y / Math.max(1, image.height - 1);
    const r = Math.round(112 + t * 146);
    const g = Math.round(204 - t * 36);
    const b = Math.round(232 - t * 108);
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, r, g, b, 255);
    }
  }

  const outlineColor = [38, 36, 34, 255] as const;
  const orange = [244, 166, 82, 255] as const;
  const cream = [232, 222, 200, 255] as const;
  const blush = [238, 126, 116, 255] as const;

  fillRect(image, 132, 92, 28, 116, outlineColor);
  fillRect(image, 320, 92, 28, 116, outlineColor);
  fillRect(image, 160, 128, 164, 24, outlineColor);
  fillRect(image, 108, 204, 40, 64, outlineColor);
  fillRect(image, 344, 204, 40, 64, outlineColor);
  fillRect(image, 140, 268, 216, 104, outlineColor);
  fillRect(image, 132, 352, 236, 36, outlineColor);
  fillRect(image, 344, 292, 48, 84, outlineColor);

  fillRect(image, 148, 108, 24, 88, orange);
  fillRect(image, 308, 108, 24, 88, orange);
  fillRect(image, 160, 152, 164, 96, orange);
  fillRect(image, 136, 212, 216, 64, orange);
  fillRect(image, 156, 276, 172, 92, orange);
  fillRect(image, 356, 296, 24, 68, orange);

  fillRect(image, 224, 200, 80, 92, cream);
  fillRect(image, 164, 268, 172, 72, cream);
  fillRect(image, 212, 340, 80, 36, cream);
  fillRect(image, 204, 376, 36, 40, cream);
  fillRect(image, 272, 376, 36, 40, cream);

  fillRect(image, 196, 196, 36, 52, outlineColor);
  fillRect(image, 304, 196, 36, 52, outlineColor);
  fillRect(image, 160, 244, 76, 12, outlineColor);
  fillRect(image, 304, 244, 76, 12, outlineColor);
  fillRect(image, 240, 252, 16, 16, outlineColor);
  fillRect(image, 256, 268, 36, 16, outlineColor);
  fillRect(image, 268, 236, 14, 24, blush);

  return image;
}

describe("optimization 6.6 heuristic audit", () => {
  test("detects regular atlases from grid evidence without requiring common frame sizes", () => {
    const image = nonCommonRegularObjectGrid();
    const detection = detectSheetLayout(image);
    const suggestion = suggestFixSettings(image);

    expect(detection).toMatchObject({
      frameWidth: 73,
      frameHeight: 67,
      rows: 6,
      columns: 6
    });
    expect(detection.confidence).toBeGreaterThanOrEqual(0.7);
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout).toMatchObject({
      frameWidth: 73,
      frameHeight: 67,
      rows: 6,
      columns: 6
    });
  });

  test("classifies regular object grids as icon sets without animation semantics", () => {
    const suggestion = suggestFixSettings(distinctIconSetGrid());

    expect(suggestion.assetType).toBe("iconSet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.classificationCandidates[0]).toMatchObject({
      assetType: "iconSet",
      mode: "spriteSheet"
    });
    expect(suggestion.classificationCandidates.map((candidate) => candidate.confidence)).toEqual(
      [...suggestion.classificationCandidates.map((candidate) => candidate.confidence)].sort((a, b) => b - a)
    );
    expect(suggestion.classificationCandidates.map((candidate) => candidate.assetType)).toEqual(
      expect.arrayContaining(["iconSet", "animationSheet", "spriteSheet"])
    );
    expect(suggestion.classificationCandidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("object")])
    );
    expect(suggestion.sheetLayout).toMatchObject({
      frameWidth: 72,
      frameHeight: 72,
      rows: 6,
      columns: 6,
      rowAnimations: []
    });
  });

  test("keeps matte cleanup eligible when a sheet is manually treated as an icon set", () => {
    const suggestion = suggestFixSettingsForAssetType(matteArtifactIconSetGrid(), "iconSet");

    expect(suggestion.assetType).toBe("iconSet");
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.matteCleanup).toBe(true);
    expect(suggestion.inferNativeScale).toBe(true);
    expect(suggestion.nativeScaleInference).toMatchObject({
      enabled: true,
      scope: "cell-grid",
      scaleX: 1,
      scaleY: 1
    });
    expect(suggestion.nativeScaleInference?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "matteCleanup",
        enabled: true,
        reasonCode: "matte-artifact-evidence"
      })
    );
  });

  test("allows source-sized cleanup-first native scale inference for matte-heavy tilesets", () => {
    const suggestion = suggestFixSettingsForAssetType(matteArtifactIconSetGrid(), "tileset");

    expect(suggestion.assetType).toBe("tileset");
    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.inferNativeScale).toBe(true);
    expect(suggestion.nativeScaleInference).toMatchObject({
      enabled: true,
      scope: "cell-grid"
    });
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "nativeScaleInference",
        enabled: true,
        reasonCode: "source-sized-cleanup-first"
      })
    );
  });

  test("keeps low-confidence background overrides out of native scale inference", () => {
    const suggestion = suggestFixSettingsForAssetType(matteArtifactIconSetGrid(), "background");

    expect(suggestion.assetType).toBe("background");
    expect(suggestion.inferNativeScale).toBe(false);
    expect(suggestion.nativeScaleInference).toMatchObject({
      enabled: false,
      scope: "none"
    });
  });

  test("classifies repeated placed grids as tilemaps rather than animation sheets", () => {
    const suggestion = suggestFixSettings(repeatedTilemap());

    expect(suggestion.assetType).toBe("tilemap");
    expect(suggestion.classificationCandidates[0]).toMatchObject({
      assetType: "tilemap",
      mode: "tileSheet"
    });
    expect(suggestion.classificationCandidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("repeated tile")])
    );
  });

  test("keeps unique square grids out of tilemap classification", () => {
    const suggestion = suggestFixSettings(uniqueTileset());

    expect(suggestion.assetType).toBe("tileset");
    expect(suggestion.classificationCandidates[0]).toMatchObject({
      assetType: "tileset"
    });
    expect(suggestion.classificationCandidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("unique")])
    );
  });

  test("keeps large isolated foreground objects classified as single sprites", () => {
    const suggestion = suggestFixSettings(largeSingleSprite());

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.classificationCandidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("single foreground object")])
    );
  });

  test("classifies outlined sprites on smooth gradient backgrounds as single sprites", () => {
    const suggestion = suggestFixSettings(gradientOutlinedCatSprite());

    expect(suggestion.assetType).toBe("sprite");
    expect(suggestion.mode).toBe("single");
    expect(suggestion.classificationCandidates[0]).toMatchObject({
      assetType: "sprite",
      mode: "single"
    });
    expect(suggestion.classificationCandidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("single foreground object")])
    );
  });
});
