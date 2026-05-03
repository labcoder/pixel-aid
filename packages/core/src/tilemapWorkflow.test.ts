import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createImage, writePixel } from "./image";
import { extractTilemapMetadata } from "./tilemapWorkflow";

type Color = readonly [number, number, number, number];

const grass: Color[] = [
  [42, 98, 48, 255],
  [55, 118, 54, 255],
  [36, 82, 42, 255],
  [71, 132, 68, 255]
];
const water: Color[] = [
  [34, 78, 120, 255],
  [48, 100, 156, 255],
  [20, 62, 112, 255],
  [66, 128, 180, 255]
];

describe("tilemap workflow", () => {
  test("deduplicates repeated tiles into a stable tile index map", () => {
    const image = createPatternMap([
      [grass, water, grass, water],
      [water, grass, grass, water],
      [grass, grass, water, water]
    ]);

    const metadata = extractTilemapMetadata(image, {
      tileWidth: 4,
      tileHeight: 4,
      identityThreshold: 0.01
    });

    expect(metadata.status).toBe("ready");
    expect(metadata).toMatchObject({
      type: "tilemap",
      tileWidth: 4,
      tileHeight: 4,
      rows: 3,
      columns: 4,
      tileCount: 12,
      uniqueTileCount: 2,
      repeatedTileRatio: expect.closeTo(10 / 12, 6)
    });
    expect(metadata.layers[0]?.data).toEqual([
      [0, 1, 0, 1],
      [1, 0, 0, 1],
      [0, 0, 1, 1]
    ]);
    expect(metadata.tiles.map((tile) => [tile.id, tile.occurrenceCount, tile.firstOccurrence])).toEqual([
      [0, 6, { row: 0, column: 0 }],
      [1, 6, { row: 0, column: 1 }]
    ]);
  });

  test("uses identity threshold to merge near-repeated tiles", () => {
    const nearGrass = grass.map(([r, g, b, a]) => [r + 2, g + 1, b + 2, a] as const);
    const image = createPatternMap([[grass, nearGrass]]);

    expect(
      extractTilemapMetadata(image, {
        tileWidth: 4,
        tileHeight: 4,
        identityThreshold: 0.02
      }).uniqueTileCount
    ).toBe(1);
    expect(
      extractTilemapMetadata(image, {
        tileWidth: 4,
        tileHeight: 4,
        identityThreshold: 0.001
      }).uniqueTileCount
    ).toBe(2);
  });

  test("honors offset spacing and explicit map dimensions when generating tile rects", () => {
    const image = createImage(12, 12, [0, 0, 0, 0]);
    drawTile(image, 2, 1, 3, grass);
    drawTile(image, 6, 1, 3, water);
    drawTile(image, 2, 5, 3, water);
    drawTile(image, 6, 5, 3, grass);

    const metadata = extractTilemapMetadata(image, {
      tileWidth: 3,
      tileHeight: 3,
      offsetX: 2,
      offsetY: 1,
      spacing: 1,
      columns: 2,
      rows: 2,
      identityThreshold: 0.01
    });

    expect(metadata.tiles.map((tile) => tile.rect)).toEqual([
      { x: 2, y: 1, w: 3, h: 3 },
      { x: 6, y: 1, w: 3, h: 3 }
    ]);
    expect(metadata.layers[0]?.data).toEqual([
      [0, 1],
      [1, 0]
    ]);
  });

  test("keeps non-repeating maps inspect-only with warnings", () => {
    const image = createUniqueMap(4, 4, 4);
    const metadata = extractTilemapMetadata(image, {
      tileWidth: 4,
      tileHeight: 4,
      identityThreshold: 0.01
    });

    expect(metadata.status).toBe("inspectOnly");
    expect(metadata.uniqueTileCount).toBe(16);
    expect(metadata.warnings.map((warning) => warning.code)).toContain("tilemap-low-repeat-confidence");
  });
});

function createPatternMap(rows: Color[][]): RGBAImage {
  const tileSize = 4;
  const image = createImage(rows[0]!.length * tileSize, rows.length * tileSize, [0, 0, 0, 255]);
  rows.forEach((row, rowIndex) => {
    row.forEach((pattern, columnIndex) => {
      drawTile(image, columnIndex * tileSize, rowIndex * tileSize, tileSize, pattern);
    });
  });
  return image;
}

function createUniqueMap(columns: number, rows: number, tileSize: number): RGBAImage {
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const seed = row * columns + column;
      drawTile(image, column * tileSize, row * tileSize, tileSize, [
        [(seed * 17) & 255, 40, 80, 255],
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
