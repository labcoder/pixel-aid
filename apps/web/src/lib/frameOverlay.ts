import type { Pivot, Rect } from "@pixelaid/shared";

export type FrameOverlayGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
};

export function getFrameOverlayGeometry(
  frame: { rect: Rect; pivot: Pivot },
  origin: { x: number; y: number },
  zoom: number
): FrameOverlayGeometry {
  return {
    x: origin.x + frame.rect.x * zoom + 0.5,
    y: origin.y + frame.rect.y * zoom + 0.5,
    width: frame.rect.w * zoom - 1,
    height: frame.rect.h * zoom - 1,
    pivotX: origin.x + (frame.rect.x + frame.pivot.x) * zoom,
    pivotY: origin.y + (frame.rect.y + frame.pivot.y) * zoom
  };
}
