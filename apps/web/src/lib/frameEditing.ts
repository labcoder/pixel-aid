import type { Rect, SpriteFrame } from "@pixelaid/shared";

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export function moveFrameBySourceDelta({
  frame,
  deltaX,
  deltaY,
  scaleX,
  scaleY,
  sourceSize,
  outputSize
}: {
  frame: SpriteFrame;
  deltaX: number;
  deltaY: number;
  scaleX: number;
  scaleY: number;
  sourceSize: Size;
  outputSize: Size;
}): SpriteFrame {
  const sourceRect = frame.sourceRect ?? frame.rect;
  const nextSourceRect = moveRect(sourceRect, Math.round(deltaX), Math.round(deltaY), sourceSize);
  const outputDeltaX = Math.round((nextSourceRect.x - sourceRect.x) / Math.max(0.01, scaleX));
  const outputDeltaY = Math.round((nextSourceRect.y - sourceRect.y) / Math.max(0.01, scaleY));
  const nextOutputRect = moveRect(frame.rect, outputDeltaX, outputDeltaY, outputSize);

  const moved: SpriteFrame = {
    ...frame,
    rect: nextOutputRect,
    sourceRect: nextSourceRect,
    pivot: { ...frame.pivot }
  };
  if (frame.tags) {
    moved.tags = [...frame.tags];
  }
  return moved;
}

export function findFrameAtSourcePoint(frames: readonly SpriteFrame[], point: Point): number {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const rect = frames[index]?.sourceRect;
    if (!rect) {
      continue;
    }

    if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) {
      return index;
    }
  }

  return -1;
}

function moveRect(rect: Rect, deltaX: number, deltaY: number, bounds: Size): Rect {
  return {
    x: clampInteger(rect.x + deltaX, 0, Math.max(0, bounds.width - rect.w)),
    y: clampInteger(rect.y + deltaY, 0, Math.max(0, bounds.height - rect.h)),
    w: rect.w,
    h: rect.h
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
