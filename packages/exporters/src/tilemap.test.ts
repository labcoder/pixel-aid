import { describe, expect, test } from "vitest";
import type { TilemapExportMetadata } from "@pixelaid/shared";
import { createGenericTilemapExport, validateTilemapMetadata } from "./tilemap";

const metadata: TilemapExportMetadata = {
  type: "tilemap",
  status: "ready",
  tileWidth: 16,
  tileHeight: 16,
  offsetX: 0,
  offsetY: 0,
  spacing: 0,
  rows: 2,
  columns: 3,
  tileCount: 6,
  uniqueTileCount: 2,
  repeatedTileRatio: 4 / 6,
  identityThreshold: 0.01,
  confidence: 0.86,
  tiles: [
    {
      id: 0,
      rect: { x: 0, y: 0, w: 16, h: 16 },
      firstOccurrence: { row: 0, column: 0 },
      occurrenceCount: 3,
      signature: "grass",
      averageColor: "#2a6230"
    },
    {
      id: 1,
      rect: { x: 16, y: 0, w: 16, h: 16 },
      firstOccurrence: { row: 0, column: 1 },
      occurrenceCount: 3,
      signature: "water",
      averageColor: "#224e78"
    }
  ],
  layers: [
    {
      name: "Tilemap",
      rows: 2,
      columns: 3,
      data: [
        [0, 1, 0],
        [1, 0, 1]
      ]
    }
  ],
  warnings: []
};

describe("generic tilemap export", () => {
  test("creates a stable generic tilemap companion bundle", () => {
    const bundle = createGenericTilemapExport(metadata, { name: "forest_map" });

    expect(bundle.files).toEqual([
      {
        path: "tilemap/forest_map.tilemap.json",
        kind: "json",
        contents: metadata
      },
      {
        path: "tilemap/README.md",
        kind: "text",
        contents: expect.stringContaining("Generic Tilemap Metadata")
      }
    ]);
    expect(bundle.warnings).toEqual([]);
  });

  test("warns when exporting inspect-only tilemap metadata", () => {
    const bundle = createGenericTilemapExport({
      ...metadata,
      status: "inspectOnly",
      warnings: [{ code: "tilemap-low-repeat-confidence", severity: "warning", message: "Low repeat confidence." }]
    });

    expect(bundle.warnings).toContainEqual({
      target: "tiled",
      code: "generic-tilemap-inspect-only",
      severity: "warning",
      message: "Tilemap metadata is inspect-only; review tile identities before treating it as engine-ready map data."
    });
  });

  test("validates map dimensions and tile references", () => {
    expect(validateTilemapMetadata(metadata)).toEqual([]);

    expect(
      validateTilemapMetadata({
        ...metadata,
        tileCount: 99,
        layers: [{ name: "bad", rows: 1, columns: 3, data: [[0, 2]] }]
      })
    ).toEqual([
      "tileCount must equal rows * columns",
      "Layer bad row count does not match tilemap rows",
      "Layer bad row 0 column count does not match tilemap columns",
      "Layer bad references missing tile id 2"
    ]);
  });
});
