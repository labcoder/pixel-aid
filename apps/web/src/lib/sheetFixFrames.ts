import type { SpriteFrame } from "@pixelaid/shared";

export function createSheetFixFramePlan(frames: readonly SpriteFrame[]): SpriteFrame[] {
  return frames.map((frame) => {
    const next: SpriteFrame = {
      ...frame,
      rect: { ...frame.rect },
      pivot: { ...frame.pivot },
      durationMs: frame.durationMs
    };
    if (frame.sourceRect) {
      next.sourceRect = { ...frame.sourceRect };
    }
    if (frame.tags) {
      next.tags = [...frame.tags];
    }
    return next;
  });
}
