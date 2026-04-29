import { describe, expect, test } from "vitest";
import type { AnimationTag, Rect, SpriteFrame } from "@pixelaid/shared";
import { insertFrameNearSelection, removeFrameAtSelection } from "./sheetManualEditing";

const frames: SpriteFrame[] = [
  frame("row_1_000", "row_1", { x: 0, y: 0, w: 64, h: 64 }, { x: 100, y: 20, w: 128, h: 128 }),
  frame("row_1_001", "row_1", { x: 64, y: 0, w: 64, h: 64 }, { x: 228, y: 20, w: 128, h: 128 }),
  frame("row_2_000", "row_2", { x: 0, y: 64, w: 64, h: 64 }, { x: 100, y: 180, w: 128, h: 128 })
];

const animations: AnimationTag[] = [
  { name: "row_1", frameNames: ["row_1_000", "row_1_001"], loop: true, fps: 8, direction: "forward" },
  { name: "row_2", frameNames: ["row_2_000"], loop: true, fps: 8, direction: "forward" }
];

describe("manual sheet editing", () => {
  test("inserts a new cell before the selected frame and keeps row membership", () => {
    const result = insertFrameNearSelection({
      frames,
      animations,
      selectedFrameIndex: 1,
      placement: "before",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations[0]?.frameNames).toEqual(["row_1_000", "row_1_002", "row_1_001"]);
    expect(result.selectedFrameIndex).toBe(1);
    expect(result.selectedAnimationName).toBe("row_1");
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_002", "row_1_001", "row_2_000"]);
    expect(result.frames[1]).toMatchObject({
      name: "row_1_002",
      tags: ["row_1"],
      rect: { x: 64, y: 0, w: 64, h: 64 },
      sourceRect: { x: 100, y: 20, w: 128, h: 128 },
      pivot: { x: 32, y: 64 },
      durationMs: 120
    });
    expect(result.frames[2]?.rect).toEqual({ x: 128, y: 0, w: 64, h: 64 });
    expect(result.frames[3]?.rect).toEqual({ x: 0, y: 64, w: 64, h: 64 });
  });

  test("inserts a new cell after the selected frame and selects the inserted frame", () => {
    const result = insertFrameNearSelection({
      frames,
      animations,
      selectedFrameIndex: 1,
      placement: "after",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations[0]?.frameNames).toEqual(["row_1_000", "row_1_001", "row_1_002"]);
    expect(result.selectedFrameIndex).toBe(2);
    expect(result.frames[2]).toMatchObject({
      name: "row_1_002",
      tags: ["row_1"],
      rect: { x: 128, y: 0, w: 64, h: 64 },
      sourceRect: { x: 356, y: 20, w: 128, h: 128 }
    });
  });

  test("removes the selected cell and selects the nearest remaining frame", () => {
    const result = removeFrameAtSelection({
      frames,
      animations,
      selectedFrameIndex: 1,
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.frameNames)).toEqual([["row_1_000"], ["row_2_000"]]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_2_000"]);
    expect(result.frames.map((item) => item.rect)).toEqual([
      { x: 0, y: 0, w: 64, h: 64 },
      { x: 0, y: 64, w: 64, h: 64 }
    ]);
    expect(result.selectedFrameIndex).toBe(0);
    expect(result.selectedAnimationName).toBe("row_1");
  });

  test("removing the only cell in a row removes that row animation", () => {
    const result = removeFrameAtSelection({
      frames,
      animations,
      selectedFrameIndex: 2,
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1"]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001"]);
    expect(result.selectedFrameIndex).toBe(1);
    expect(result.selectedAnimationName).toBe("row_1");
  });
});

function frame(name: string, rowName: string, rect: Rect, sourceRect: Rect): SpriteFrame {
  return {
    name,
    rect,
    sourceRect,
    pivot: { x: Math.floor(rect.w / 2), y: rect.h },
    durationMs: 120,
    tags: [rowName]
  };
}
