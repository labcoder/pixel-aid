import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import {
  findFrameAtSourcePoint,
  findFrameResizeHandleAtSourcePoint,
  moveFrameBySourceDelta,
  moveFrameSourceRectOnly,
  resizeFrameBySourceDelta,
  resizeFrameSourceRectOnly,
  updateFramePivot
} from "./frameEditing";

const frame: SpriteFrame = {
  name: "row_1_000",
  rect: { x: 10, y: 8, w: 16, h: 12 },
  sourceRect: { x: 40, y: 32, w: 64, h: 48 },
  pivot: { x: 8, y: 12 },
  durationMs: 120,
  tags: ["row_1"]
};

describe("frame editing", () => {
  test("moves source and native frame rects by a grid-scaled source delta", () => {
    const moved = moveFrameBySourceDelta({
      frame,
      deltaX: 8,
      deltaY: -4,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 160, height: 120 },
      outputSize: { width: 40, height: 30 }
    });

    expect(moved.sourceRect).toEqual({ x: 48, y: 28, w: 64, h: 48 });
    expect(moved.rect).toEqual({ x: 12, y: 7, w: 16, h: 12 });
    expect(moved.tags).toEqual(["row_1"]);
  });

  test("clamps movement inside source and output bounds", () => {
    const moved = moveFrameBySourceDelta({
      frame,
      deltaX: -100,
      deltaY: 200,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 160, height: 120 },
      outputSize: { width: 40, height: 30 }
    });

    expect(moved.sourceRect).toEqual({ x: 0, y: 72, w: 64, h: 48 });
    expect(moved.rect).toEqual({ x: 0, y: 18, w: 16, h: 12 });
  });

  test("moves only the source rect while preserving the packed output cell", () => {
    const moved = moveFrameSourceRectOnly({
      frame,
      deltaX: 12,
      deltaY: 8,
      sourceSize: { width: 180, height: 140 }
    });

    expect(moved.sourceRect).toEqual({ x: 52, y: 40, w: 64, h: 48 });
    expect(moved.rect).toEqual(frame.rect);
    expect(moved.pivot).toEqual(frame.pivot);
    expect(moved.tags).toEqual(["row_1"]);
  });

  test("hit-tests topmost frame by source point", () => {
    const frames: SpriteFrame[] = [
      frame,
      { ...frame, name: "row_1_001", sourceRect: { x: 90, y: 32, w: 64, h: 48 } }
    ];

    expect(findFrameAtSourcePoint(frames, { x: 96, y: 40 })).toBe(1);
    expect(findFrameAtSourcePoint(frames, { x: 12, y: 12 })).toBe(-1);
  });

  test("hit-tests source-space resize handles before frame bodies", () => {
    const frames: SpriteFrame[] = [
      frame,
      { ...frame, name: "row_1_001", sourceRect: { x: 90, y: 32, w: 64, h: 48 } }
    ];

    expect(findFrameResizeHandleAtSourcePoint(frames, { x: 151, y: 78 }, 5)).toEqual({ frameIndex: 1, handle: "se" });
    expect(findFrameResizeHandleAtSourcePoint(frames, { x: 94, y: 36 }, 5)).toEqual({ frameIndex: 1, handle: "nw" });
    expect(findFrameResizeHandleAtSourcePoint(frames, { x: 112, y: 48 }, 5)).toBeNull();
  });

  test("resizes a frame from a corner and updates native output rects", () => {
    const resized = resizeFrameBySourceDelta({
      frame,
      handle: "se",
      deltaX: 12,
      deltaY: 8,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 180, height: 140 },
      outputSize: { width: 48, height: 36 }
    });

    expect(resized.sourceRect).toEqual({ x: 40, y: 32, w: 76, h: 56 });
    expect(resized.rect).toEqual({ x: 10, y: 8, w: 19, h: 14 });
    expect(resized.pivot).toEqual({ x: 8, y: 12 });
    expect(resized.tags).toEqual(["row_1"]);
  });

  test("resizes a frame from the west edge without crossing the minimum output size", () => {
    const resized = resizeFrameBySourceDelta({
      frame,
      handle: "w",
      deltaX: 200,
      deltaY: 0,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 180, height: 140 },
      outputSize: { width: 48, height: 36 },
      minOutputSize: { width: 4, height: 4 }
    });

    expect(resized.sourceRect).toEqual({ x: 88, y: 32, w: 16, h: 48 });
    expect(resized.rect).toEqual({ x: 22, y: 8, w: 4, h: 12 });
    expect(resized.pivot).toEqual({ x: 4, y: 12 });
  });

  test("resizes only the source rect and keeps output rect metadata distinct", () => {
    const resized = resizeFrameSourceRectOnly({
      frame,
      handle: "se",
      deltaX: 12,
      deltaY: 8,
      sourceSize: { width: 180, height: 140 }
    });

    expect(resized.sourceRect).toEqual({ x: 40, y: 32, w: 76, h: 56 });
    expect(resized.rect).toEqual(frame.rect);
    expect(resized.pivot).toEqual(frame.pivot);
  });

  test("updates frame pivots as baseline metadata without moving rects", () => {
    const corrected = updateFramePivot({
      frame,
      pivot: { x: 20, y: 99 }
    });

    expect(corrected.pivot).toEqual({ x: 16, y: 12 });
    expect(corrected.rect).toEqual(frame.rect);
    expect(corrected.sourceRect).toEqual(frame.sourceRect);
  });
});
