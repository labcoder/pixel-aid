import type { AssetMode, AssetType } from "@pixelaid/shared";
import type { SheetPlaybackMode } from "./timelineState";

export type AssetStructure = "single" | "grid";
export type GridAnimationIntent = "auto" | "animated" | "still";

export function getAssetStructure(_assetType: AssetType, mode: AssetMode): AssetStructure {
  return mode === "single" ? "single" : "grid";
}

export function getAssetTypeForStructure(structure: AssetStructure): AssetType {
  return structure === "single" ? "sprite" : "spriteSheet";
}

export function getGridAnimationIntent(_assetType: AssetType, playbackMode: SheetPlaybackMode): GridAnimationIntent {
  if (playbackMode === "player") {
    return "animated";
  }
  if (playbackMode === "none") {
    return "still";
  }
  return "auto";
}

export function getSheetPlaybackModeForGridAnimationIntent(intent: GridAnimationIntent): SheetPlaybackMode {
  if (intent === "animated") {
    return "player";
  }
  if (intent === "still") {
    return "none";
  }
  return "auto";
}
