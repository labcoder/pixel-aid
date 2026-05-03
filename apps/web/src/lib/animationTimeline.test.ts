import { describe, expect, test } from "vitest";
import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { getAnimationFrameIndexes, getFrameIndexFromTimelinePosition, getTimelinePositionForFrame } from "./animationTimeline";

const frames: SpriteFrame[] = [
  frame("row_1_000"),
  frame("row_1_001"),
  frame("row_2_000"),
  frame("row_2_001"),
  frame("row_2_002")
];

const animations: AnimationTag[] = [
  { name: "row_1", frameNames: ["row_1_000", "row_1_001"], fps: 8, loop: true },
  { name: "row_2", frameNames: ["row_2_000", "row_2_001", "row_2_002"], fps: 8, loop: true }
];

describe("animation timeline mapping", () => {
  test("maps selected row animations to global frame indexes", () => {
    expect(getAnimationFrameIndexes(frames, animations, "row_2")).toEqual([2, 3, 4]);
  });

  test("falls back to all frames when no animation is selected", () => {
    expect(getAnimationFrameIndexes(frames, animations, "all")).toEqual([0, 1, 2, 3, 4]);
  });

  test("falls back to all frames when a stale clip references removed frames", () => {
    expect(
      getAnimationFrameIndexes(frames, [{ name: "stale", frameNames: ["missing_000"], fps: 8, loop: true }], "stale")
    ).toEqual([0, 1, 2, 3, 4]);
  });

  test("converts between global frame indexes and clip-local positions", () => {
    const frameIndexes = getAnimationFrameIndexes(frames, animations, "row_2");

    expect(getTimelinePositionForFrame(frameIndexes, 3)).toBe(1);
    expect(getTimelinePositionForFrame(frameIndexes, 0)).toBe(0);
    expect(getFrameIndexFromTimelinePosition(frameIndexes, 2)).toBe(4);
  });
});

function frame(name: string): SpriteFrame {
  return {
    name,
    rect: { x: 0, y: 0, w: 16, h: 16 },
    pivot: { x: 8, y: 16 },
    durationMs: 120
  };
}
