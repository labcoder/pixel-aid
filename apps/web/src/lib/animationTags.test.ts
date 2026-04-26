import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { renameAnimationTag, updateAnimationTagTiming } from "./animationTags";

const animations: AnimationTag[] = [
  { name: "row_1", frameNames: ["row_1_000", "row_1_001"], fps: 8, loop: true },
  { name: "row_2", frameNames: ["row_2_000"], fps: 10, loop: false }
];

const frames: SpriteFrame[] = [
  {
    name: "row_1_000",
    rect: { x: 0, y: 0, w: 16, h: 16 },
    sourceRect: { x: 0, y: 0, w: 64, h: 64 },
    pivot: { x: 8, y: 16 },
    durationMs: 125,
    tags: ["row_1"]
  },
  {
    name: "row_1_001",
    rect: { x: 16, y: 0, w: 16, h: 16 },
    sourceRect: { x: 64, y: 0, w: 64, h: 64 },
    pivot: { x: 8, y: 16 },
    durationMs: 125,
    tags: ["row_1"]
  },
  {
    name: "row_2_000",
    rect: { x: 0, y: 16, w: 16, h: 16 },
    sourceRect: { x: 0, y: 64, w: 64, h: 64 },
    pivot: { x: 8, y: 16 },
    durationMs: 100,
    tags: ["row_2"]
  }
];

describe("animation tag editing", () => {
  test("renames an animation and matching frame tags", () => {
    const renamed = renameAnimationTag({ animations, frames, fromName: "row_1", toName: "walk" });

    expect(renamed.animations.map((animation) => animation.name)).toEqual(["walk", "row_2"]);
    expect(renamed.frames.map((frame) => frame.tags)).toEqual([["walk"], ["walk"], ["row_2"]]);
    expect(renamed.selectedAnimationName).toBe("walk");
  });

  test("keeps animation names unique when renaming into an existing name", () => {
    const renamed = renameAnimationTag({ animations, frames, fromName: "row_1", toName: "row_2" });

    expect(renamed.animations.map((animation) => animation.name)).toEqual(["row_2_2", "row_2"]);
    expect(renamed.frames[0]?.tags).toEqual(["row_2_2"]);
  });

  test("updates animation timing without rewriting other clips", () => {
    const updated = updateAnimationTagTiming({ animations, name: "row_2", fps: 12, loop: true });

    expect(updated).toEqual([
      { name: "row_1", frameNames: ["row_1_000", "row_1_001"], fps: 8, loop: true },
      { name: "row_2", frameNames: ["row_2_000"], fps: 12, loop: true }
    ]);
  });
});
