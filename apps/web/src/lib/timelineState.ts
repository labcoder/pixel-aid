import type { AssetMode, AssetType } from "@pixelaid/shared";

export type TimelineState = {
  enabled: boolean;
  message: string;
};

export type SheetPlaybackMode = "auto" | "player" | "none";

export function isSheetLikeMode(mode: AssetMode): boolean {
  return mode === "spriteSheet" || mode === "tileSheet";
}

export function assetTypeHasTimelineSemantics(assetType: AssetType): boolean {
  return assetType === "animationSheet" || assetType === "characterSheet";
}

export function sheetPlaybackEnabled(assetType: AssetType, playbackMode: SheetPlaybackMode): boolean {
  if (playbackMode === "player") {
    return true;
  }
  if (playbackMode === "none") {
    return false;
  }
  return assetTypeHasTimelineSemantics(assetType);
}

export function getTimelineState(
  mode: AssetMode,
  frameCount: number,
  assetType: AssetType = "sprite",
  playbackMode: SheetPlaybackMode = "auto"
): TimelineState {
  if (!isSheetLikeMode(mode) || frameCount <= 0) {
    return {
      enabled: false,
      message: "Timeline is available after choosing a sheet mode and defining frames."
    };
  }

  if (playbackMode === "none") {
    return {
      enabled: false,
      message: "Sheet playback is disabled; cell/frame editing remains available."
    };
  }

  if (!sheetPlaybackEnabled(assetType, playbackMode)) {
    return {
      enabled: false,
      message: "Sheet cells are available without timeline playback."
    };
  }

  return {
    enabled: true,
    message: `${frameCount} frame${frameCount === 1 ? "" : "s"} ready for timeline preview.`
  };
}
