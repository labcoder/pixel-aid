import { describe, expect, test } from "vitest";
import { createImage, readPixel, writePixel } from "./image";
import { analyzeTilesetSeams } from "./tileDiagnostics";
import { applyTilesetSeamRepairs } from "./tilesetRepair";

describe("tileset seam repair", () => {
  test("applies conservative edge harmonization and improves seam diagnostics", () => {
    const image = createImage(4, 2, [0, 0, 0, 255]);
    fillRect(image, 0, 0, 2, 2, [40, 100, 60, 255]);
    fillRect(image, 2, 0, 2, 2, [70, 130, 90, 255]);

    const before = analyzeTilesetSeams(image, { tileWidth: 2, tileHeight: 2 });
    const result = applyTilesetSeamRepairs(image, { tileWidth: 2, tileHeight: 2 });

    expect(result.appliedRepairs).toHaveLength(1);
    expect(result.appliedRepairs[0]).toMatchObject({
      strategy: "edgeColorHarmonization",
      edge: "right-left",
      tileA: { row: 0, column: 0 },
      tileB: { row: 0, column: 1 }
    });
    expect(result.diagnosticsAfter.maxEdgeDelta).toBeLessThan(before.maxEdgeDelta);
    expect(readPixel(result.image, 1, 0)).toEqual([55, 115, 75, 255]);
    expect(readPixel(result.image, 2, 0)).toEqual([55, 115, 75, 255]);
    expect(readPixel(image, 1, 0)).toEqual([40, 100, 60, 255]);
  });

  test("does not modify already clean tilesets", () => {
    const image = createImage(4, 2, [0, 0, 0, 255]);
    fillRect(image, 0, 0, 4, 2, [40, 100, 60, 255]);

    const result = applyTilesetSeamRepairs(image, { tileWidth: 2, tileHeight: 2 });

    expect(result.appliedRepairs).toEqual([]);
    expect(result.skippedRepairs).toEqual([]);
    expect(result.image.data).toEqual(image.data);
  });

  test("keeps severe manual-repaint seams skipped", () => {
    const image = createImage(4, 2, [0, 0, 0, 255]);
    fillRect(image, 0, 0, 2, 2, [0, 0, 0, 255]);
    fillRect(image, 2, 0, 2, 2, [255, 255, 255, 255]);

    const result = applyTilesetSeamRepairs(image, { tileWidth: 2, tileHeight: 2 });

    expect(result.appliedRepairs).toEqual([]);
    expect(result.skippedRepairs).toContainEqual(expect.objectContaining({ strategy: "manualRepaint", reason: "manual-review-required" }));
    expect(result.image.data).toEqual(image.data);
  });
});

function fillRect(
  image: ReturnType<typeof createImage>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      writePixel(image, column, row, ...color);
    }
  }
}
