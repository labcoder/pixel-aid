import type { SpriteFrame } from "@pixelaid/shared";

export function mapFrameToSource(frame: SpriteFrame, scaleX: number, scaleY: number): SpriteFrame {
  if (frame.sourceRect) {
    return {
      ...frame,
      rect: { ...frame.sourceRect },
      pivot: {
        x: Math.round(frame.pivot.x * scaleX),
        y: Math.round(frame.pivot.y * scaleY)
      }
    };
  }

  return {
    ...frame,
    rect: {
      x: Math.round(frame.rect.x * scaleX),
      y: Math.round(frame.rect.y * scaleY),
      w: Math.max(1, Math.round(frame.rect.w * scaleX)),
      h: Math.max(1, Math.round(frame.rect.h * scaleY))
    },
    pivot: {
      x: Math.round(frame.pivot.x * scaleX),
      y: Math.round(frame.pivot.y * scaleY)
    }
  };
}
