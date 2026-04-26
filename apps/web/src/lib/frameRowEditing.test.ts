import { describe, expect, test } from "vitest";
import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { resizeAnimationRowFromSourceFrame } from "./frameRowEditing";

const frames: SpriteFrame[] = [
  {
    name: "walk_000",
    rect: { x: 0, y: 0, w: 16, h: 12 },
    sourceRect: { x: 40, y: 32, w: 64, h: 48 },
    pivot: { x: 8, y: 12 },
    durationMs: 120,
    tags: ["walk"]
  },
  {
    name: "walk_001",
    rect: { x: 16, y: 0, w: 16, h: 12 },
    sourceRect: { x: 120, y: 32, w: 64, h: 48 },
    pivot: { x: 8, y: 12 },
    durationMs: 120,
    tags: ["walk"]
  },
  {
    name: "idle_000",
    rect: { x: 0, y: 12, w: 16, h: 12 },
    sourceRect: { x: 40, y: 96, w: 64, h: 48 },
    pivot: { x: 8, y: 12 },
    durationMs: 120,
    tags: ["idle"]
  }
];

const animations: AnimationTag[] = [
  { name: "walk", frameNames: ["walk_000", "walk_001"], fps: 8, loop: true },
  { name: "idle", frameNames: ["idle_000"], fps: 8, loop: true }
];

describe("frame row editing", () => {
  test("applies a source resize handle to every output cell in the same animation row", () => {
    const resized = resizeAnimationRowFromSourceFrame({
      frames,
      animations,
      frameIndex: 0,
      handle: "se",
      delta: { x: 8, y: 8 },
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 400, height: 240 },
      outputSize: { width: 128, height: 128 },
      margin: 0,
      spacing: 0
    });

    const walkFrames = resized.filter((frame) => frame.tags?.includes("walk"));
    const idleFrame = resized.find((frame) => frame.name === "idle_000");

    expect(walkFrames.map((frame) => frame.rect)).toEqual([
      { x: 0, y: 0, w: 18, h: 14 },
      { x: 18, y: 0, w: 18, h: 14 }
    ]);
    expect(walkFrames[0]?.sourceRect).toEqual({ x: 40, y: 32, w: 72, h: 56 });
    expect(walkFrames[1]?.sourceRect).toEqual({ x: 116, y: 28, w: 72, h: 56 });
    expect(idleFrame?.rect).toEqual({ x: 0, y: 14, w: 16, h: 12 });
  });
});
