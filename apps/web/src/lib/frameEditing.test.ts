import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import { findFrameAtSourcePoint, moveFrameBySourceDelta } from "./frameEditing";

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

  test("hit-tests topmost frame by source point", () => {
    const frames: SpriteFrame[] = [
      frame,
      { ...frame, name: "row_1_001", sourceRect: { x: 90, y: 32, w: 64, h: 48 } }
    ];

    expect(findFrameAtSourcePoint(frames, { x: 96, y: 40 })).toBe(1);
    expect(findFrameAtSourcePoint(frames, { x: 12, y: 12 })).toBe(-1);
  });
});
