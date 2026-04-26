import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import { mapFrameToSource } from "./sourceFrameMapping";

describe("source frame mapping", () => {
  test("uses detected source rects before falling back to grid scaling", () => {
    const frame: SpriteFrame = {
      name: "row_1_000",
      rect: { x: 10, y: 8, w: 16, h: 12 },
      sourceRect: { x: 41, y: 35, w: 63, h: 47 },
      pivot: { x: 8, y: 12 },
      durationMs: 120
    };

    expect(mapFrameToSource(frame, 4, 4).rect).toEqual({ x: 41, y: 35, w: 63, h: 47 });
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
