import { describe, expect, it } from "vitest";
import { assetTypeDefinitions, assetTypeToMode, getAssetTypeDefinition } from "./assetTypes";
import type { AssetType } from "./types";

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

  it("marks full, inspect-only, and future support levels", () => {
    expect(getAssetTypeDefinition("sprite").support).toBe("full");
    expect(getAssetTypeDefinition("icon").support).toBe("full");
    expect(getAssetTypeDefinition("spriteSheet").support).toBe("full");
    expect(getAssetTypeDefinition("animationSheet").support).toBe("full");
    expect(getAssetTypeDefinition("characterSheet").support).toBe("full");
    expect(getAssetTypeDefinition("tileset").support).toBe("inspectOnly");
    expect(getAssetTypeDefinition("tilemap").support).toBe("future");
  });
});
