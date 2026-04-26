import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import { createSheetFixFramePlan } from "./sheetFixFrames";

const frames: SpriteFrame[] = [
  {
    name: "walk_000",
    rect: { x: 2, y: 3, w: 16, h: 16 },
    sourceRect: { x: 20, y: 30, w: 64, h: 64 },
    pivot: { x: 8, y: 16 },
    durationMs: 90,
    tags: ["walk"]
  }
];

describe("sheet fix frame plans", () => {
  test("copies explicit source frame metadata for worker sheet fixes", () => {
    const plan = createSheetFixFramePlan(frames);

    expect(plan).toEqual(frames);
    expect(plan[0]).not.toBe(frames[0]);
    expect(plan[0]?.rect).not.toBe(frames[0]?.rect);
    expect(plan[0]?.sourceRect).not.toBe(frames[0]?.sourceRect);
    expect(plan[0]?.tags).not.toBe(frames[0]?.tags);
  });
});
