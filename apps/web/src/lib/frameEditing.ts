import type { Rect, SpriteFrame } from "@pixelaid/shared";

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type FrameResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type FrameResizeHit = {
  frameIndex: number;
  handle: FrameResizeHandle;
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
  const nextOutputRect = {
    ...frame.rect,
    x: clampInteger(Math.round(nextSourceRect.x / Math.max(0.01, scaleX)), 0, Math.max(0, outputSize.width - frame.rect.w)),
    y: clampInteger(Math.round(nextSourceRect.y / Math.max(0.01, scaleY)), 0, Math.max(0, outputSize.height - frame.rect.h))
  };

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

export function moveFrameSourceRectOnly({
  frame,
  deltaX,
  deltaY,
  sourceSize
}: {
  frame: SpriteFrame;
  deltaX: number;
  deltaY: number;
  sourceSize: Size;
}): SpriteFrame {
  const sourceRect = frame.sourceRect ?? frame.rect;
  return copyFrameWithGeometry({
    frame,
    rect: frame.rect,
    sourceRect: moveRect(sourceRect, Math.round(deltaX), Math.round(deltaY), sourceSize),
    pivot: frame.pivot
  });
}

export function resizeFrameBySourceDelta({
  frame,
  handle,
  deltaX,
  deltaY,
  scaleX,
  scaleY,
  sourceSize,
  outputSize,
  minOutputSize = { width: 1, height: 1 }
}: {
  frame: SpriteFrame;
  handle: FrameResizeHandle;
  deltaX: number;
  deltaY: number;
  scaleX: number;
  scaleY: number;
  sourceSize: Size;
  outputSize: Size;
  minOutputSize?: Size;
}): SpriteFrame {
  const sourceRect = frame.sourceRect ?? frame.rect;
  const safeScaleX = Math.max(0.01, scaleX);
  const safeScaleY = Math.max(0.01, scaleY);
  const minSourceWidth = Math.max(1, Math.round(minOutputSize.width * safeScaleX));
  const minSourceHeight = Math.max(1, Math.round(minOutputSize.height * safeScaleY));
  const nextSourceRect = resizeRect(sourceRect, handle, Math.round(deltaX), Math.round(deltaY), sourceSize, {
    width: minSourceWidth,
    height: minSourceHeight
  });
  const nextOutputRect = {
    x: clampInteger(Math.round(nextSourceRect.x / safeScaleX), 0, Math.max(0, outputSize.width - 1)),
    y: clampInteger(Math.round(nextSourceRect.y / safeScaleY), 0, Math.max(0, outputSize.height - 1)),
    w: clampInteger(Math.round(nextSourceRect.w / safeScaleX), 1, outputSize.width),
    h: clampInteger(Math.round(nextSourceRect.h / safeScaleY), 1, outputSize.height)
  };
  const resized: SpriteFrame = {
    ...frame,
    rect: {
      ...nextOutputRect,
      w: Math.min(nextOutputRect.w, Math.max(1, outputSize.width - nextOutputRect.x)),
      h: Math.min(nextOutputRect.h, Math.max(1, outputSize.height - nextOutputRect.y))
    },
    sourceRect: nextSourceRect,
    pivot: {
      x: clampInteger(frame.pivot.x, 0, Math.max(1, nextOutputRect.w)),
      y: clampInteger(frame.pivot.y, 0, Math.max(1, nextOutputRect.h))
    }
  };
  if (frame.tags) {
    resized.tags = [...frame.tags];
  }
  return resized;
}

export function resizeFrameSourceRectOnly({
  frame,
  handle,
  deltaX,
  deltaY,
  sourceSize,
  minSourceSize = { width: 1, height: 1 }
}: {
  frame: SpriteFrame;
  handle: FrameResizeHandle;
  deltaX: number;
  deltaY: number;
  sourceSize: Size;
  minSourceSize?: Size;
}): SpriteFrame {
  const sourceRect = frame.sourceRect ?? frame.rect;
  return copyFrameWithGeometry({
    frame,
    rect: frame.rect,
    sourceRect: resizeRect(sourceRect, handle, Math.round(deltaX), Math.round(deltaY), sourceSize, minSourceSize),
    pivot: frame.pivot
  });
}

export function updateFramePivot({
  frame,
  pivot
}: {
  frame: SpriteFrame;
  pivot: Point;
}): SpriteFrame {
  return copyFrameWithGeometry({
    frame,
    rect: frame.rect,
    sourceRect: frame.sourceRect,
    pivot: {
      x: clampInteger(pivot.x, 0, frame.rect.w),
      y: clampInteger(pivot.y, 0, frame.rect.h)
    }
  });
}

export function findFrameAtSourcePoint(frames: readonly SpriteFrame[], point: Point): number {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const rect = frames[index]?.sourceRect ?? frames[index]?.rect;
    if (!rect) {
      continue;
    }

    if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) {
      return index;
    }
  }

  return -1;
}

export function findFrameResizeHandleAtSourcePoint(
  frames: readonly SpriteFrame[],
  point: Point,
  hitRadius: number
): FrameResizeHit | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const rect = frames[index]?.sourceRect ?? frames[index]?.rect;
    if (!rect) {
      continue;
    }

    const handle = findResizeHandle(rect, point, Math.max(1, hitRadius));
    if (handle) {
      return { frameIndex: index, handle };
    }
  }

  return null;
}

function copyFrameWithGeometry({
  frame,
  rect,
  sourceRect,
  pivot
}: {
  frame: SpriteFrame;
  rect: Rect;
  sourceRect: Rect | undefined;
  pivot: Point;
}): SpriteFrame {
  return {
    ...frame,
    rect: { ...rect },
    ...(sourceRect ? { sourceRect: { ...sourceRect } } : {}),
    pivot: { x: Math.round(pivot.x), y: Math.round(pivot.y) },
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
    ...(frame.anchors ? { anchors: frame.anchors.map((anchor) => ({ ...anchor, point: { ...anchor.point } })) } : {}),
    ...(frame.boxes ? { boxes: frame.boxes.map((box) => ({ ...box, rect: { ...box.rect } })) } : {}),
    ...(frame.sheetLayout ? { sheetLayout: { ...frame.sheetLayout } } : {})
  };
}

function moveRect(rect: Rect, deltaX: number, deltaY: number, bounds: Size): Rect {
  return {
    x: clampInteger(rect.x + deltaX, 0, Math.max(0, bounds.width - rect.w)),
    y: clampInteger(rect.y + deltaY, 0, Math.max(0, bounds.height - rect.h)),
    w: rect.w,
    h: rect.h
  };
}

function resizeRect(rect: Rect, handle: FrameResizeHandle, deltaX: number, deltaY: number, bounds: Size, minSize: Size): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;

  if (handle.includes("w")) {
    left = clampInteger(left + deltaX, 0, right - minSize.width);
  }
  if (handle.includes("e")) {
    right = clampInteger(right + deltaX, left + minSize.width, bounds.width);
  }
  if (handle.includes("n")) {
    top = clampInteger(top + deltaY, 0, bottom - minSize.height);
  }
  if (handle.includes("s")) {
    bottom = clampInteger(bottom + deltaY, top + minSize.height, bounds.height);
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top
  };
}

function findResizeHandle(rect: Rect, point: Point, hitRadius: number): FrameResizeHandle | null {
  const handles: Array<[FrameResizeHandle, Point]> = [
    ["nw", { x: rect.x, y: rect.y }],
    ["n", { x: rect.x + rect.w / 2, y: rect.y }],
    ["ne", { x: rect.x + rect.w, y: rect.y }],
    ["e", { x: rect.x + rect.w, y: rect.y + rect.h / 2 }],
    ["se", { x: rect.x + rect.w, y: rect.y + rect.h }],
    ["s", { x: rect.x + rect.w / 2, y: rect.y + rect.h }],
    ["sw", { x: rect.x, y: rect.y + rect.h }],
    ["w", { x: rect.x, y: rect.y + rect.h / 2 }]
  ];

  for (const [handle, handlePoint] of handles) {
    if (Math.abs(point.x - handlePoint.x) <= hitRadius && Math.abs(point.y - handlePoint.y) <= hitRadius) {
      return handle;
    }
  }

  return null;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
