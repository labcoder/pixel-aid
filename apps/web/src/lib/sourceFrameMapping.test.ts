import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import { createSourceFrameMappingKey, mapFrameToSource } from "./sourceFrameMapping";

describe("source frame mapping", () => {
  test("uses detected source rects before falling back to grid scaling", () => {
    const frame: SpriteFrame = {
      name: "row_1_000",
      rect: { x: 10, y: 8, w: 16, h: 12 },
      sourceRect: { x: 41, y: 35, w: 63, h: 47 },
      pivot: { x: 8, y: 12 },
      durationMs: 120
    };

    expect(mapFrameToSource(frame, 4, 4)).toMatchObject({
      rect: { x: 41, y: 35, w: 63, h: 47 },
      pivot: { x: 32, y: 47 }
    });
  });

  test("keeps detected source pivots stable when output size settings change", () => {
    const frame: SpriteFrame = {
      name: "row_1_000",
      rect: { x: 0, y: 0, w: 96, h: 104 },
      sourceRect: { x: 0, y: 0, w: 192, h: 208 },
      pivot: { x: 48, y: 104 },
      durationMs: 120
    };

    expect(mapFrameToSource(frame, 2, 2).pivot).toEqual({ x: 96, y: 208 });
    expect(mapFrameToSource(frame, 4, 4).pivot).toEqual({ x: 96, y: 208 });
  });

  test("keeps the source mapping key stable for output-only cell size edits", () => {
    const sourceRect = { x: 0, y: 0, w: 192, h: 208 };
    const smaller: SpriteFrame = {
      name: "row_1_000",
      rect: { x: 0, y: 0, w: 96, h: 104 },
      sourceRect,
      pivot: { x: 48, y: 104 },
      durationMs: 120
    };
    const larger: SpriteFrame = {
      ...smaller,
      rect: { x: 0, y: 0, w: 384, h: 416 },
      pivot: { x: 192, y: 416 }
    };

    expect(createSourceFrameMappingKey([smaller], 2, 2)).toBe(createSourceFrameMappingKey([larger], 2, 2));
  });

  test("scales manual frame rects into source space", () => {
    const frame: SpriteFrame = {
      name: "frame_000",
      rect: { x: 10, y: 8, w: 16, h: 12 },
      pivot: { x: 8, y: 12 },
      durationMs: 120
    };

    expect(mapFrameToSource(frame, 3, 2)).toMatchObject({
      rect: { x: 30, y: 16, w: 48, h: 24 },
      pivot: { x: 24, y: 24 }
    });
  });
});
