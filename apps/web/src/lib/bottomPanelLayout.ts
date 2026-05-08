import type { AssetMode, AssetType } from "@pixelaid/shared";

export type BottomPanelSection = "timeline" | "tilePreview" | "diagnostics";

export function getBottomPanelSections(mode: AssetMode, assetType: AssetType = "sprite", timelineFrameCount = 0): BottomPanelSection[] {
  if (assetType === "tileset") {
    return ["tilePreview", "diagnostics"];
  }

  if (assetType === "iconSet") {
    return ["diagnostics"];
  }

  if (mode === "single" || timelineFrameCount <= 0) {
    return ["diagnostics"];
  }

  return ["timeline", "diagnostics"];
}
