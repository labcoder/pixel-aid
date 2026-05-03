import { describe, expect, test } from "vitest";
import type { AnimationTag, Rect, SpriteFrame } from "@pixelaid/shared";
import {
  createManualSheetLayout,
  fillRowToFrameCount,
  fillSparseRowsToFrameCount,
  insertFrameAtRowEdge,
  insertFrameNearSelection,
  insertRowNearSelection,
  joinSheetRowsIntoClip,
  removeAnimationOrSheetRow,
  removeFrameAtSelection,
  removeRowAtSelection
} from "./sheetManualEditing";

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
  test("turns manual grid frames into named editable row animations", () => {
    const layout = createManualSheetLayout({
      frames: [
        frame("frame_000", "", { x: 0, y: 0, w: 16, h: 16 }, { x: 0, y: 0, w: 32, h: 32 }),
        frame("frame_001", "", { x: 16, y: 0, w: 16, h: 16 }, { x: 32, y: 0, w: 32, h: 32 }),
        frame("frame_002", "", { x: 0, y: 16, w: 16, h: 16 }, { x: 0, y: 32, w: 32, h: 32 }),
        frame("frame_003", "", { x: 16, y: 16, w: 16, h: 16 }, { x: 32, y: 32, w: 32, h: 32 })
      ],
      rows: 2,
      columns: 2,
      fps: 10
    });

    expect(layout.animations).toEqual([
      { name: "row_1", frameNames: ["row_1_000", "row_1_001"], fps: 10, loop: true, direction: "forward" },
      { name: "row_2", frameNames: ["row_2_000", "row_2_001"], fps: 10, loop: true, direction: "forward" }
    ]);
    expect(layout.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001", "row_2_000", "row_2_001"]);
    expect(layout.frames.map((item) => item.tags)).toEqual([["row_1"], ["row_1"], ["row_2"], ["row_2"]]);
  });

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

  test("inserts a new row before the selected row with a draggable source cell", () => {
    const result = insertRowNearSelection({
      frames,
      animations,
      selectedAnimationName: "row_2",
      placement: "before",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1", "row_3", "row_2"]);
    expect(result.animations[1]).toMatchObject({
      name: "row_3",
      frameNames: ["row_3_000"],
      loop: true,
      fps: 8,
      direction: "forward"
    });
    expect(result.selectedFrameIndex).toBe(2);
    expect(result.selectedAnimationName).toBe("row_3");
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001", "row_3_000", "row_2_000"]);
    expect(result.frames[2]).toMatchObject({
      name: "row_3_000",
      tags: ["row_3"],
      rect: { x: 0, y: 64, w: 64, h: 64 },
      sourceRect: { x: 100, y: 52, w: 128, h: 128 },
      pivot: { x: 32, y: 64 },
      durationMs: 120
    });
    expect(result.frames[3]?.rect).toEqual({ x: 0, y: 128, w: 64, h: 64 });
  });

  test("inserts a new row after the selected row and selects its first frame", () => {
    const result = insertRowNearSelection({
      frames,
      animations,
      selectedAnimationName: "row_1",
      placement: "after",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1", "row_3", "row_2"]);
    expect(result.selectedFrameIndex).toBe(2);
    expect(result.selectedAnimationName).toBe("row_3");
    expect(result.frames[2]).toMatchObject({
      name: "row_3_000",
      tags: ["row_3"],
      rect: { x: 0, y: 64, w: 64, h: 64 },
      sourceRect: { x: 100, y: 148, w: 128, h: 128 }
    });
  });

  test("generates row names after the largest existing numbered row", () => {
    const numberedFrames = [
      frame("row_7_000", "row_7", { x: 0, y: 0, w: 64, h: 64 }, { x: 0, y: 0, w: 64, h: 64 }),
      frame("row_8_000", "row_8", { x: 0, y: 64, w: 64, h: 64 }, { x: 0, y: 64, w: 64, h: 64 })
    ];
    const numberedAnimations: AnimationTag[] = [
      { name: "row_7", frameNames: ["row_7_000"], loop: true },
      { name: "row_8", frameNames: ["row_8_000"], loop: true }
    ];

    const result = insertRowNearSelection({
      frames: numberedFrames,
      animations: numberedAnimations,
      selectedAnimationName: "row_7",
      placement: "after",
      margin: 0,
      spacing: 0,
      scaleX: 1,
      scaleY: 1,
      sourceSize: { width: 256, height: 256 }
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_7", "row_9", "row_8"]);
    expect(result.frames[1]).toMatchObject({ name: "row_9_000", tags: ["row_9"] });
  });

  test("removes the selected row and selects the nearest remaining row", () => {
    const result = removeRowAtSelection({
      frames,
      animations,
      selectedAnimationName: "row_1",
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_2"]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_2_000"]);
    expect(result.frames[0]?.rect).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(result.selectedFrameIndex).toBe(0);
    expect(result.selectedAnimationName).toBe("row_2");
  });

  test("does not remove the final row", () => {
    const result = removeRowAtSelection({
      frames: [frames[2]!],
      animations: [animations[1]!],
      selectedAnimationName: "row_2",
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_2"]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_2_000"]);
    expect(result.selectedFrameIndex).toBe(0);
    expect(result.selectedAnimationName).toBe("row_2");
  });

  test("removes row frames when deleting a sheet row animation", () => {
    const result = removeAnimationOrSheetRow({
      frames,
      animations,
      selectedAnimationName: "row_2",
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1"]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001"]);
    expect(result.selectedAnimationName).toBe("row_1");
  });

  test("removes only the clip when deleting a custom animation", () => {
    const result = removeAnimationOrSheetRow({
      frames,
      animations: [...animations, { name: "attack", frameNames: ["row_1_001", "row_2_000"], fps: 12, loop: false }],
      selectedAnimationName: "attack",
      margin: 0,
      spacing: 0
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1", "row_2"]);
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001", "row_2_000"]);
    expect(result.selectedAnimationName).toBe("row_1");
  });

  test("recovers a missing first cell at the selected row edge", () => {
    const result = insertFrameAtRowEdge({
      frames,
      animations,
      selectedAnimationName: "row_1",
      edge: "start",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations[0]?.frameNames).toEqual(["row_1_002", "row_1_000", "row_1_001"]);
    expect(result.selectedAnimationName).toBe("row_1");
    expect(result.selectedFrameIndex).toBe(0);
    expect(result.frames[0]).toMatchObject({
      name: "row_1_002",
      tags: ["row_1"],
      rect: { x: 0, y: 0, w: 64, h: 64 },
      sourceRect: { x: 0, y: 20, w: 128, h: 128 }
    });
    expect(result.frames[1]?.rect).toEqual({ x: 64, y: 0, w: 64, h: 64 });
  });

  test("recovers a missing last cell at the selected row edge", () => {
    const result = insertFrameAtRowEdge({
      frames,
      animations,
      selectedAnimationName: "row_2",
      edge: "end",
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations[1]?.frameNames).toEqual(["row_2_000", "row_2_001"]);
    expect(result.selectedAnimationName).toBe("row_2");
    expect(result.selectedFrameIndex).toBe(3);
    expect(result.frames[3]).toMatchObject({
      name: "row_2_001",
      tags: ["row_2"],
      rect: { x: 64, y: 64, w: 64, h: 64 },
      sourceRect: { x: 228, y: 180, w: 128, h: 128 }
    });
  });

  test("fills a sparse row to a target frame count", () => {
    const result = fillRowToFrameCount({
      frames,
      animations,
      selectedAnimationName: "row_2",
      targetFrameCount: 3,
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 640, height: 512 }
    });

    expect(result.animations[1]?.frameNames).toEqual(["row_2_000", "row_2_001", "row_2_002"]);
    expect(result.selectedAnimationName).toBe("row_2");
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001", "row_2_000", "row_2_001", "row_2_002"]);
    expect(result.frames[3]?.sourceRect).toEqual({ x: 228, y: 180, w: 128, h: 128 });
    expect(result.frames[4]?.sourceRect).toEqual({ x: 356, y: 180, w: 128, h: 128 });
    expect(result.frames[4]?.rect).toEqual({ x: 128, y: 64, w: 64, h: 64 });
  });

  test("fills every sparse row to the widest row count", () => {
    const result = fillSparseRowsToFrameCount({
      frames,
      animations,
      targetFrameCount: 2,
      margin: 0,
      spacing: 0,
      scaleX: 2,
      scaleY: 2,
      sourceSize: { width: 512, height: 512 }
    });

    expect(result.animations.map((animation) => animation.frameNames)).toEqual([
      ["row_1_000", "row_1_001"],
      ["row_2_000", "row_2_001"]
    ]);
    expect(result.selectedAnimationName).toBe("row_2");
    expect(result.selectedFrameIndex).toBe(3);
    expect(result.frames[3]?.sourceRect).toEqual({ x: 228, y: 180, w: 128, h: 128 });
  });

  test("joins multiple detected rows into one row-major animation clip", () => {
    const result = joinSheetRowsIntoClip({
      frames,
      animations,
      rowNames: ["row_1", "row_2"]
    });

    expect(result.animations.map((animation) => animation.name)).toEqual(["row_1", "row_2", "joined_rows"]);
    expect(result.animations[2]).toMatchObject({
      name: "joined_rows",
      frameNames: ["row_1_000", "row_1_001", "row_2_000"],
      fps: 8,
      loop: true,
      direction: "forward"
    });
    expect(result.frames.map((item) => item.name)).toEqual(["row_1_000", "row_1_001", "row_2_000"]);
    expect(result.selectedAnimationName).toBe("joined_rows");
    expect(result.selectedFrameIndex).toBe(0);
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
