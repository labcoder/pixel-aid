import { describe, expect, test } from "vitest";
import {
  getAssetStructure,
  getAssetTypeForStructure,
  getGridAnimationIntent,
  getSheetPlaybackModeForGridAnimationIntent
} from "./assetStructureControls";

describe("asset structure controls", () => {
  test("groups single-object asset types together", () => {
    expect(getAssetStructure("sprite", "single")).toBe("single");
    expect(getAssetStructure("portrait", "single")).toBe("single");
    expect(getAssetStructure("background", "single")).toBe("single");
    expect(getAssetStructure("icon", "single")).toBe("single");
  });

  test("groups grid-based asset types together", () => {
    expect(getAssetStructure("spriteSheet", "spriteSheet")).toBe("grid");
    expect(getAssetStructure("animationSheet", "spriteSheet")).toBe("grid");
    expect(getAssetStructure("iconSet", "spriteSheet")).toBe("grid");
    expect(getAssetStructure("tileset", "tileSheet")).toBe("grid");
    expect(getAssetStructure("tilemap", "tileSheet")).toBe("grid");
  });

  test("maps the simplified structure control to safe default asset types", () => {
    expect(getAssetTypeForStructure("single")).toBe("sprite");
    expect(getAssetTypeForStructure("grid")).toBe("spriteSheet");
  });

  test("keeps animation intent separate from grid structure", () => {
    expect(getGridAnimationIntent("animationSheet", "auto")).toBe("auto");
    expect(getGridAnimationIntent("characterSheet", "player")).toBe("animated");
    expect(getGridAnimationIntent("iconSet", "none")).toBe("still");
    expect(getSheetPlaybackModeForGridAnimationIntent("auto")).toBe("auto");
    expect(getSheetPlaybackModeForGridAnimationIntent("animated")).toBe("player");
    expect(getSheetPlaybackModeForGridAnimationIntent("still")).toBe("none");
  });
});
