import { describe, expect, expectTypeOf, it } from "vitest";
import { assetTypeDefinitions, assetTypeToMode, getAssetTypeDefinition } from "./assetTypes";
import type { AssetMode, AssetType, SceneAssetDiagnostics, TilemapDiagnostics, TilesetSeamDiagnostics } from "./types";

const assetTypes: AssetType[] = [
  "sprite",
  "spriteSheet",
  "animationSheet",
  "characterSheet",
  "tileset",
  "tilemap",
  "portrait",
  "icon",
  "uiElement",
  "background"
];

describe("asset type taxonomy", () => {
  it("defines exactly one entry for every supported asset type", () => {
    expect(assetTypeDefinitions.map((definition) => definition.type).sort()).toEqual([...assetTypes].sort());

    for (const assetType of assetTypes) {
      expect(assetTypeDefinitions.filter((definition) => definition.type === assetType)).toHaveLength(1);
    }
  });

  it("maps product asset types to processing modes", () => {
    expect(assetTypeToMode("sprite")).toBe("single");
    expect(assetTypeToMode("icon")).toBe("single");
    expect(assetTypeToMode("animationSheet")).toBe("spriteSheet");
    expect(assetTypeToMode("characterSheet")).toBe("spriteSheet");
    expect(assetTypeToMode("tileset")).toBe("tileSheet");
    expect(assetTypeToMode("tilemap")).toBe("tileSheet");
  });

  it("keeps asset modes limited to actual algorithm paths", () => {
    expectTypeOf<AssetMode>().toEqualTypeOf<"single" | "spriteSheet" | "tileSheet">();
    expect(assetTypeToMode("characterSheet")).toBe("spriteSheet");
  });

  it("marks full, inspect-only, and future support levels", () => {
    expect(getAssetTypeDefinition("sprite").support).toBe("full");
    expect(getAssetTypeDefinition("icon").support).toBe("full");
    expect(getAssetTypeDefinition("spriteSheet").support).toBe("full");
    expect(getAssetTypeDefinition("animationSheet").support).toBe("full");
    expect(getAssetTypeDefinition("characterSheet").support).toBe("full");
    expect(getAssetTypeDefinition("tileset").support).toBe("full");
    expect(getAssetTypeDefinition("tilemap").support).toBe("inspectOnly");
  });

  it("marks 0.2 tileset diagnostics as supported while keeping tilemaps inspect-first", () => {
    expect(getAssetTypeDefinition("tileset").support).toBe("full");
    expect(getAssetTypeDefinition("tileset").defaultWarnings.map((warning) => warning.code)).toContain(
      "tileset-engine-metadata-next"
    );
    expect(getAssetTypeDefinition("tilemap").support).toBe("inspectOnly");
    expect(getAssetTypeDefinition("tilemap").defaultWarnings.map((warning) => warning.code)).toContain(
      "tilemap-inspect-only"
    );
    expect(getAssetTypeDefinition("background").support).toBe("inspectOnly");
  });

  it("has serializable diagnostics contracts for tile and scene inspection", () => {
    const tileDiagnostics: TilesetSeamDiagnostics = {
      tileWidth: 16,
      tileHeight: 16,
      rows: 2,
      columns: 2,
      checkedSeams: 4,
      averageEdgeDelta: 0,
      maxEdgeDelta: 0,
      seamRiskScore: 0,
      lightingRiskScore: 0,
      issues: [],
      repairSuggestions: []
    };
    const sceneDiagnostics: SceneAssetDiagnostics = {
      assetType: "background",
      sampledPixelCount: 100,
      colorBinCount: 12,
      detailDensity: 0.12,
      detailDensityLabel: "medium",
      paletteRiskScore: 0.2,
      warnings: []
    };
    const tilemapDiagnostics: TilemapDiagnostics = {
      candidates: [
        {
          tileWidth: 16,
          tileHeight: 16,
          rows: 8,
          columns: 8,
          tileCount: 64,
          uniqueTileSignatures: 12,
          repeatedTileRatio: 0.8,
          dimensionFitScore: 1,
          gridConsistencyScore: 1,
          confidence: 0.9,
          reason: "test"
        }
      ],
      warnings: []
    };

    expect(tileDiagnostics.issues).toEqual([]);
    expect(sceneDiagnostics.detailDensityLabel).toBe("medium");
    expect(tilemapDiagnostics.candidates[0]?.tileWidth).toBe(16);
  });
});
