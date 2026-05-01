import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createTiledTileset, createTiledTilesetExport } from "./tiled";

describe("Tiled tileset export adapter", () => {
  test("creates tileset JSON metadata for a cleaned PixelAid tileset image", () => {
    const tileset = createTiledTileset(createTilesetManifest());

    expect(tileset).toEqual({
      type: "tileset",
      name: "terrain_tiles",
      tilewidth: 16,
      tileheight: 16,
      spacing: 2,
      margin: 1,
      tilecount: 6,
      columns: 3,
      image: "terrain_tiles.png",
      imagewidth: 54,
      imageheight: 36,
      properties: [
        { name: "pixelAid.palette", type: "string", value: "#000000,#4b692f,#9bbc0f" },
        { name: "pixelAid.assetType", type: "string", value: "tileSheet" },
        { name: "pixelAid.sourceSize", type: "string", value: "220x148" },
        { name: "pixelAid.gridConfidence", type: "float", value: 0.98 },
        { name: "pixelAid.provenance.origin", type: "string", value: "generated" },
        { name: "pixelAid.provenance.provider", type: "string", value: "fixture-ai" },
        { name: "pixelAid.provenance.model", type: "string", value: "tiles-v1" }
      ]
    });
  });

  test("exports companion files and warns for inconsistent tile dimensions", () => {
    const manifest = createTilesetManifest();
    manifest.sheet.frameWidth = 0;

    const result = createTiledTilesetExport(manifest);

    expect(result.files.map((file) => file.path)).toEqual(["tiled/terrain_tiles.tileset.json", "tiled/README.md"]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "engine-tiled-invalid-tile-size",
      "engine-tiled-sheet-width-misaligned"
    ]);
  });
});

function createTilesetManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "terrain_tiles.png",
      assetType: "tileSheet",
      palette: ["#000000", "#4b692f", "#9bbc0f"],
      provenance: {
        origin: "generated",
        provider: "fixture-ai",
        model: "tiles-v1"
      },
      source: { width: 220, height: 148 },
      operation: {
        settings: {
          mode: "tileSheet",
          assetType: "tileSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 54,
          outputHeight: 36,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 0.98,
          reason: "test"
        },
        durationMs: 3
      }
    },
    sheet: { width: 54, height: 36, frameWidth: 16, frameHeight: 16, margin: 1, spacing: 2, extrude: 0 },
    frames: [
      { name: "grass", rect: { x: 1, y: 1, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
      { name: "water", rect: { x: 19, y: 1, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
      { name: "stone", rect: { x: 37, y: 1, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
      { name: "dirt", rect: { x: 1, y: 19, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
      { name: "sand", rect: { x: 19, y: 19, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
      { name: "edge", rect: { x: 37, y: 19, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 }
    ],
    animations: {}
  };
}
