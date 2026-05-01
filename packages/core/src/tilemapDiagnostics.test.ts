import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createImage, writePixel } from "./image";
import { analyzeTilemapDiagnostics, detectTilemapGridCandidates } from "./tilemapDiagnostics";

type Color = readonly [number, number, number, number];

const tilePatterns: Color[][] = [
  [
    [42, 98, 48, 255],
    [55, 118, 54, 255],
    [36, 82, 42, 255],
    [71, 132, 68, 255]
  ],
  [
    [34, 78, 120, 255],
    [48, 100, 156, 255],
    [20, 62, 112, 255],
    [66, 128, 180, 255]
  ],
  [
    [124, 112, 74, 255],
    [150, 135, 86, 255],
    [96, 88, 62, 255],
    [170, 152, 98, 255]
  ],
  [
    [84, 84, 94, 255],
    [112, 114, 126, 255],
    [58, 60, 68, 255],
    [138, 140, 148, 255]
  ]
];

describe("tilemap diagnostics", () => {
  test("scores repeated map tiles and ranks the intended tile size first", () => {
    const image = createRepeatedTilemap(8, 8, 16);
    const candidates = detectTilemapGridCandidates(image, { candidateSizes: [8, 16, 32] });

    expect(candidates[0]).toMatchObject({
      tileWidth: 16,
      tileHeight: 16,
      rows: 8,
      columns: 8,
      tileCount: 64,
      uniqueTileSignatures: 4,
      repeatedTileRatio: expect.closeTo(0.9375, 6),
      dimensionFitScore: 1,
      gridConsistencyScore: 1
    });
    expect(candidates[0]!.confidence).toBeGreaterThan(0.8);
  });

  test("keeps low-repeat images below tilemap confidence thresholds", () => {
    const image = createUniqueTileset(4, 4, 16);
    const diagnostics = analyzeTilemapDiagnostics(image, { candidateSizes: [16] });

    expect(diagnostics.selected).toBeUndefined();
    expect(diagnostics.candidates[0]).toMatchObject({
      tileWidth: 16,
      tileHeight: 16,
      uniqueTileSignatures: 16,
      repeatedTileRatio: 0
    });
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain("tilemap-low-repeat-confidence");
  });
});

function createRepeatedTilemap(columns: number, rows: number, tileSize: number): RGBAImage {
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      drawTile(image, column * tileSize, row * tileSize, tileSize, tilePatterns[(row * 3 + column * 5) % tilePatterns.length]!);
    }
  }
  return image;
}

function createUniqueTileset(columns: number, rows: number, tileSize: number): RGBAImage {
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const seed = row * columns + column;
      drawTile(image, column * tileSize, row * tileSize, tileSize, [
        [(seed * 19) & 255, 40, 80, 255],
        [80, (seed * 23) & 255, 110, 255],
        [120, 90, (seed * 29) & 255, 255],
        [(seed * 31) & 255, (seed * 37) & 255, 150, 255]
      ]);
    }
  }
  return image;
}

function drawTile(image: RGBAImage, startX: number, startY: number, tileSize: number, pattern: Color[]): void {
  const half = Math.floor(tileSize / 2);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const index = (x < half ? 0 : 1) + (y < half ? 0 : 2);
      writePixel(image, startX + x, startY + y, ...pattern[index]!);
    }
  }
}
