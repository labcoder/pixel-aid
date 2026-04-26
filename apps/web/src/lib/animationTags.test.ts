import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { applyFrameDurationOverrides, renameAnimationTag, updateAnimationTagTiming, updateFrameDuration } from "./animationTags";

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

  test("updates one frame duration without mutating other frame metadata", () => {
    const updated = updateFrameDuration({ frames, frameName: "row_1_001", durationMs: 83 });

    expect(updated[0]).toEqual(frames[0]);
    expect(updated[1]).toEqual({
      ...frames[1],
      durationMs: 83
    });
    expect(updated[2]).toEqual(frames[2]);
    expect(updated).not.toBe(frames);
  });

  test("clamps edited frame duration to engine-friendly bounds", () => {
    expect(updateFrameDuration({ frames, frameName: "row_1_000", durationMs: -20 })[0]?.durationMs).toBe(1);
    expect(updateFrameDuration({ frames, frameName: "row_1_000", durationMs: 120_000 })[0]?.durationMs).toBe(60_000);
    expect(updateFrameDuration({ frames, frameName: "row_1_000", durationMs: Number.NaN })[0]?.durationMs).toBe(120);
  });

  test("applies frame duration overrides by name", () => {
    const updated = applyFrameDurationOverrides(frames, {
      row_1_000: 200,
      missing_frame: 40
    });

    expect(updated.map((frame) => frame.durationMs)).toEqual([200, 125, 100]);
    expect(updated[0]?.rect).toEqual(frames[0]?.rect);
    expect(updated[0]?.rect).not.toBe(frames[0]?.rect);
  });
});
