import type { AssetMode, AssetType } from "@pixelaid/shared";

export type BottomPanelSection = "timeline" | "tilePreview" | "logs" | "metrics";

export function getBottomPanelSections(mode: AssetMode, assetType: AssetType = "sprite"): BottomPanelSection[] {
  if (assetType === "tileset") {
    return ["tilePreview", "logs", "metrics"];
  }

  if (mode === "single") {
    return ["logs", "metrics"];
  }

  return ["timeline", "logs", "metrics"];
}
