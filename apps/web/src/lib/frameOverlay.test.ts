import { describe, expect, test } from "vitest";
import { getFrameOverlayGeometry } from "./frameOverlay";

describe("frame overlay geometry", () => {
  test("projects frame rects and pivots into viewport pixels", () => {
    expect(
      getFrameOverlayGeometry(
        {
          rect: { x: 2, y: 3, w: 16, h: 12 },
          pivot: { x: 8, y: 10 }
        },
        { x: 20, y: 30 },
        4
      )
    ).toEqual({
      x: 28.5,
      y: 42.5,
      width: 63,
      height: 47,
      pivotX: 60,
      pivotY: 82
    });
  });
});
