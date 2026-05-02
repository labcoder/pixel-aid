import type { AssetMode, AssetType } from "@pixelaid/shared";

export type BottomPanelSection = "timeline" | "tilePreview" | "diagnostics";

export function getBottomPanelSections(mode: AssetMode, assetType: AssetType = "sprite"): BottomPanelSection[] {
  if (assetType === "tileset") {
    return ["tilePreview", "diagnostics"];
  }

  if (mode === "single") {
    return ["diagnostics"];
  }

  return ["timeline", "diagnostics"];
}
