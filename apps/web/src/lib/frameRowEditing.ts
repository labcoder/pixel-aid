import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import type { FrameResizeHandle, Point, Size } from "./frameEditing";
import { resizeFrameBySourceDelta } from "./frameEditing";
import { resizeAnimationCells } from "./sheetLayoutModel";

export function resizeAnimationRowFromSourceFrame({
  frames,
  animations,
  frameIndex,
  handle,
  delta,
  scaleX,
  scaleY,
  sourceSize,
  outputSize,
  margin,
  spacing
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  frameIndex: number;
  handle: FrameResizeHandle;
  delta: Point;
  scaleX: number;
  scaleY: number;
  sourceSize: Size;
  outputSize: Size;
  margin: number;
  spacing: number;
}): SpriteFrame[] {
  const frame = frames[frameIndex];
  if (!frame) {
    return [...frames];
  }

  const resizedFrame = resizeFrameBySourceDelta({
    frame,
    handle,
    deltaX: delta.x,
    deltaY: delta.y,
    scaleX,
    scaleY,
    sourceSize,
    outputSize,
    minOutputSize: { width: 4, height: 4 }
  });
  const withResizedFrame = frames.map((item, index) => (index === frameIndex ? resizedFrame : item));
  const animationName = resizedFrame.tags?.find((tag) => animations.some((animation) => animation.name === tag));
  if (!animationName) {
    return withResizedFrame;
  }

  return resizeAnimationCells({
    frames: withResizedFrame,
    animations,
    animationName,
    cellWidth: resizedFrame.rect.w,
    cellHeight: resizedFrame.rect.h,
    margin,
    spacing,
    scaleX,
    scaleY,
    sourceSize
  });
}
