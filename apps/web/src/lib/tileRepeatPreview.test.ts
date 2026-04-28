import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { createTileRepeatPreviewLayout, getTilePreviewFrame } from "./tileRepeatPreview";

const frames: SpriteFrame[] = [
  {
    name: "grass_000",
    rect: { x: 4, y: 8, w: 16, h: 12 },
    pivot: { x: 8, y: 10 },
    durationMs: 100
  },
  {
    name: "water_000",
    rect: { x: 24, y: 8, w: 16, h: 12 },
    sourceRect: { x: 96, y: 32, w: 64, h: 48 },
    pivot: { x: 8, y: 10 },
    durationMs: 100
  }
];

describe("tile repeat preview", () => {
  test("returns the selected frame when the index is valid", () => {
    expect(getTilePreviewFrame(frames, 1)).toBe(frames[1]);
  });

  test("returns null when no frame is selected", () => {
    expect(getTilePreviewFrame(frames, -1)).toBeNull();
    expect(getTilePreviewFrame(frames, 5)).toBeNull();
    expect(getTilePreviewFrame([], 0)).toBeNull();
  });

  test("creates a serializable 3x3 repeat layout from the selected frame rect", () => {
    const layout = createTileRepeatPreviewLayout(frames[0]);

    expect(layout).toEqual({
      repeats: 3,
      cellWidth: 16,
      cellHeight: 12,
      width: 48,
      height: 36,
      sourceRect: { x: 4, y: 8, w: 16, h: 12 },
      cells: [
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 0, y: 0, w: 16, h: 12 }, row: 0, column: 0 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 16, y: 0, w: 16, h: 12 }, row: 0, column: 1 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 32, y: 0, w: 16, h: 12 }, row: 0, column: 2 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 0, y: 12, w: 16, h: 12 }, row: 1, column: 0 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 16, y: 12, w: 16, h: 12 }, row: 1, column: 1 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 32, y: 12, w: 16, h: 12 }, row: 1, column: 2 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 0, y: 24, w: 16, h: 12 }, row: 2, column: 0 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 16, y: 24, w: 16, h: 12 }, row: 2, column: 1 },
        { sourceRect: { x: 4, y: 8, w: 16, h: 12 }, outputRect: { x: 32, y: 24, w: 16, h: 12 }, row: 2, column: 2 }
      ],
      seamGuideLines: [
        { axis: "x", position: 16 },
        { axis: "x", position: 32 },
        { axis: "y", position: 12 },
        { axis: "y", position: 24 }
      ]
    });
  });

  test("returns an empty layout for a missing frame", () => {
    expect(createTileRepeatPreviewLayout(null)).toEqual({
      repeats: 0,
      cellWidth: 0,
      cellHeight: 0,
      width: 0,
      height: 0,
      sourceRect: null,
      cells: [],
      seamGuideLines: []
    });
  });
});
