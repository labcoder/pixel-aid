import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import {
  applyPivotOverrides,
  clearAnimationPivotOverride,
  clearFramePivotOverride,
  emptyPivotOverrides,
  renamePivotOverrides,
  setAnimationPivotOverride,
  setFramePivotOverride
} from "./pivotOverrides";

const animations: AnimationTag[] = [
  { name: "idle", frameNames: ["idle_000", "idle_001"], fps: 8, loop: true },
  { name: "walk", frameNames: ["walk_000"], fps: 10, loop: true }
];

const frames: SpriteFrame[] = [
  {
    name: "idle_000",
    rect: { x: 0, y: 0, w: 16, h: 16 },
    sourceRect: { x: 0, y: 0, w: 64, h: 64 },
    pivot: { x: 8, y: 14 },
    durationMs: 125,
    tags: ["idle"]
  },
  {
    name: "idle_001",
    rect: { x: 16, y: 0, w: 16, h: 16 },
    sourceRect: { x: 64, y: 0, w: 64, h: 64 },
    pivot: { x: 8, y: 14 },
    durationMs: 125,
    tags: ["idle"]
  },
  {
    name: "walk_000",
    rect: { x: 0, y: 16, w: 16, h: 16 },
    pivot: { x: 7, y: 15 },
    durationMs: 100,
    tags: ["walk"]
  },
  {
    name: "loose_000",
    rect: { x: 16, y: 16, w: 16, h: 16 },
    pivot: { x: 6, y: 13 },
    durationMs: 100
  }
];

describe("pivot overrides", () => {
  test("uses frame override before animation override and keeps unrelated frame pivots", () => {
    const state = setFramePivotOverride(setAnimationPivotOverride(emptyPivotOverrides, "idle", { x: 10, y: 15 }), "idle_001", {
      x: 12,
      y: 16
    });

    const updated = applyPivotOverrides({ frames, animations, overrides: state });

    expect(updated.map((frame) => frame.pivot)).toEqual([
      { x: 10, y: 15 },
      { x: 12, y: 16 },
      { x: 7, y: 15 },
      { x: 6, y: 13 }
    ]);
  });

  test("applies an animation override to every frame in that tag", () => {
    const state = setAnimationPivotOverride(emptyPivotOverrides, "idle", { x: 9, y: 12 });

    const updated = applyPivotOverrides({ frames, animations, overrides: state });

    expect(updated.find((frame) => frame.name === "idle_000")?.pivot).toEqual({ x: 9, y: 12 });
    expect(updated.find((frame) => frame.name === "idle_001")?.pivot).toEqual({ x: 9, y: 12 });
    expect(updated.find((frame) => frame.name === "walk_000")?.pivot).toEqual({ x: 7, y: 15 });
  });

  test("clears frame and animation overrides independently", () => {
    const overridden = setFramePivotOverride(
      setAnimationPivotOverride(emptyPivotOverrides, "idle", { x: 9, y: 12 }),
      "idle_001",
      { x: 11, y: 13 }
    );

    const frameCleared = clearFramePivotOverride(overridden, "idle_001");
    const allCleared = clearAnimationPivotOverride(frameCleared, "idle");

    expect(applyPivotOverrides({ frames, animations, overrides: frameCleared }).map((frame) => frame.pivot)).toEqual([
      { x: 9, y: 12 },
      { x: 9, y: 12 },
      { x: 7, y: 15 },
      { x: 6, y: 13 }
    ]);
    expect(applyPivotOverrides({ frames, animations, overrides: allCleared }).map((frame) => frame.pivot)).toEqual(frames.map((frame) => frame.pivot));
  });

  test("renames frame and animation override keys while preserving pivots", () => {
    const state = setFramePivotOverride(setAnimationPivotOverride(emptyPivotOverrides, "idle", { x: 9, y: 12 }), "idle_001", {
      x: 11,
      y: 13
    });

    expect(
      renamePivotOverrides({
        overrides: state,
        frameNames: new Map([["idle_001", "stand_001"]]),
        animationNames: new Map([["idle", "stand"]])
      })
    ).toEqual({
      frames: {
        stand_001: { x: 11, y: 13 }
      },
      animations: {
        stand: { x: 9, y: 12 }
      }
    });
  });
});
