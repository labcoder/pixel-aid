import type { AssetMode, AssetType } from "@pixelaid/shared";
import { sheetPlaybackEnabled, type SheetPlaybackMode } from "./timelineState";

export type BottomPanelSection = "timeline" | "tilePreview" | "diagnostics";

export function getBottomPanelSections(
  mode: AssetMode,
  assetType: AssetType = "sprite",
  timelineFrameCount = 0,
  playbackMode: SheetPlaybackMode = "auto"
): BottomPanelSection[] {
  if (assetType === "tileset") {
    return ["tilePreview", "diagnostics"];
  }

  if (assetType === "iconSet" && !sheetPlaybackEnabled(assetType, playbackMode)) {
    return ["diagnostics"];
  }

  if (mode === "single" || timelineFrameCount <= 0) {
    return ["diagnostics"];
  }

  if (!sheetPlaybackEnabled(assetType, playbackMode)) {
    return ["diagnostics"];
  }

  return ["timeline", "diagnostics"];
}
