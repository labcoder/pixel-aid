import type { AssetMode } from "@pixelaid/shared";

export type TimelineState = {
  enabled: boolean;
  message: string;
};

export function isSheetLikeMode(mode: AssetMode): boolean {
  return mode === "spriteSheet" || mode === "tileSheet";
}

export function getTimelineState(mode: AssetMode, frameCount: number): TimelineState {
  if (!isSheetLikeMode(mode) || frameCount <= 1) {
    return {
      enabled: false,
      message: "Timeline is available after choosing a sheet mode and defining frames."
    };
  }

  return {
    enabled: true,
    message: `${frameCount} frames ready for timeline preview.`
  };
}
