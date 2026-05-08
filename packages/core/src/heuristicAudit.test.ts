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
    expect(suggestion.cleanupEligibility).toContainEqual(
      expect.objectContaining({
        pass: "matteCleanup",
        enabled: true,
        reasonCode: "matte-artifact-evidence"
      })
    );
  });
});
