import { describe, expect, test } from "vitest";
import type { AnimationTag, Rect, SheetLayoutDiagnostics, SpriteFrame } from "@pixelaid/shared";
import { createSheetDetectorReview, reconcileSheetDetectorWarnings } from "./sheetDetectorReview";

const frames: SpriteFrame[] = [
  frame("idle_000", "idle", { x: 0, y: 0, w: 64, h: 64 }, { x: 180, y: 30, w: 128, h: 128 }),
  frame("idle_001", "idle", { x: 64, y: 0, w: 64, h: 64 }, { x: 308, y: 30, w: 128, h: 128 }),
  frame("walk_000", "walk", { x: 0, y: 64, w: 64, h: 64 }, { x: 180, y: 190, w: 128, h: 128 }),
  frame("walk_001", "walk", { x: 64, y: 64, w: 64, h: 64 }, { x: 308, y: 190, w: 128, h: 128 }),
  frame("death_000", "death", { x: 0, y: 128, w: 64, h: 64 }, { x: 180, y: 350, w: 128, h: 128 })
];

const animations: AnimationTag[] = [
  { name: "idle", frameNames: ["idle_000", "idle_001"], loop: true, fps: 8 },
  { name: "walk", frameNames: ["walk_000", "walk_001"], loop: true, fps: 8 },
  { name: "death", frameNames: ["death_000"], loop: false, fps: 8 }
];

const diagnostics: SheetLayoutDiagnostics = {
  rowConfidence: {
    label: "high",
    rowCount: 3,
    averageBandHeight: 64,
    heightSpreadRatio: 0.08
  },
  columnConfidence: {
    label: "medium",
    columnCount: 2,
    pitchPx: 128,
    maxCenterDriftPx: 6,
    mergedComponentCount: 1
  },
  notes: ["Rows: high confidence, 3 bands detected.", "Columns: medium confidence, 2 columns at about 128px pitch."]
};

describe("sheet detector review", () => {
  test("summarizes detector rationale and sparse row recovery candidates", () => {
    const review = createSheetDetectorReview({
      frames,
      animations,
      selectedAnimationName: "death",
      margin: 0,
      spacing: 0,
      warnings: ["Rows contain variable frame counts."],
      diagnostics
    });

    expect(review.summary).toEqual({
      frameCount: 5,
      rowCount: 3,
      maxFrameCount: 2,
      hasSparseRows: true
    });
    expect(review.confidenceItems.map((item) => [item.label, item.value, item.tone])).toEqual([
      ["Rows", "high", "good"],
      ["Columns", "medium", "warning"],
      ["Frame size", "64x64", "neutral"],
      ["Margin / spacing", "0 / 0", "neutral"],
      ["Sparse rows", "1 row", "warning"]
    ]);
    expect(review.sparseRows).toEqual([
      {
        rowName: "death",
        frameCount: 1,
        targetFrameCount: 2,
        missingCount: 1,
        canRecoverFirst: true,
        canRecoverLast: true,
        canFill: true
      }
    ]);
    expect(review.selectedRow).toEqual({
      rowName: "death",
      frameCount: 1,
      targetFrameCount: 2,
      missingCount: 1,
      canRecoverFirst: true,
      canRecoverLast: true,
      canFill: true
    });
    expect(review.candidates.map((candidate) => [candidate.id, candidate.frameCount, candidate.action])).toEqual([
      ["detected-layout", 5, "none"],
      ["fill-sparse-rows", 6, "fillSparseRows"]
    ]);
    expect(review.candidates[1]?.description).toContain("1 missing cell");
  });

  test("does not offer sparse recovery when every row has the same frame count", () => {
    const review = createSheetDetectorReview({
      frames: frames.slice(0, 4),
      animations: animations.slice(0, 2),
      selectedAnimationName: "idle",
      margin: 1,
      spacing: 2,
      warnings: [],
      diagnostics
    });

    expect(review.summary.hasSparseRows).toBe(false);
    expect(review.sparseRows).toEqual([]);
    expect(review.selectedRow).toBeUndefined();
    expect(review.candidates.map((candidate) => candidate.id)).toEqual(["detected-layout"]);
    expect(review.confidenceItems.find((item) => item.label === "Sparse rows")).toBeUndefined();
  });

  test("falls back to the first sparse row when the selected row is already complete", () => {
    const review = createSheetDetectorReview({
      frames,
      animations,
      selectedAnimationName: "idle",
      margin: 0,
      spacing: 0,
      warnings: [],
      diagnostics: undefined
    });

    expect(review.selectedRow?.rowName).toBe("death");
    expect(review.confidenceItems[0]).toMatchObject({
      label: "Rows",
      value: "review",
      tone: "neutral"
    });
  });

  test("removes stale variable-row warnings after rows are filled uniformly", () => {
    expect(
      reconcileSheetDetectorWarnings({
        animations: [
          { name: "row_1", frameNames: ["a", "b"], loop: true },
          { name: "row_2", frameNames: ["c", "d"], loop: true }
        ],
        warnings: [
          "Rows contain different frame counts; rectangular sheet controls will include empty cells unless explicit frames are used.",
          "Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."
        ]
      })
    ).toEqual(["Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."]);
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
