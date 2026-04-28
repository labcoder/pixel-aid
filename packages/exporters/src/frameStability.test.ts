import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { analyzeFrameStability } from "./frameStability";

const stableFrames: SpriteFrame[] = [
  { name: "idle_000", rect: { x: 0, y: 0, w: 32, h: 32 }, pivot: { x: 16, y: 30 }, durationMs: 120 },
  { name: "idle_001", rect: { x: 32, y: 0, w: 32, h: 32 }, pivot: { x: 16, y: 30 }, durationMs: 120 }
];

describe("frame stability diagnostics", () => {
  test("returns no issues for stable frames", () => {
    const diagnostics = analyzeFrameStability(stableFrames);

    expect(diagnostics.frameCount).toBe(2);
    expect(diagnostics.stableFrameCount).toBe(2);
    expect(diagnostics.issues).toEqual([]);
  });

  test("reports baseline and pivot drift", () => {
    const diagnostics = analyzeFrameStability([
      stableFrames[0]!,
      { ...stableFrames[1]!, name: "idle_001", pivot: { x: 18, y: 34 } }
    ]);

    expect(diagnostics.issues.map((issue) => issue.code)).toContain("baseline-drift");
    expect(diagnostics.issues.map((issue) => issue.code)).toContain("pivot-drift");
    expect(diagnostics.maxBaselineDeltaPx).toBeGreaterThan(1);
    expect(diagnostics.issues.find((issue) => issue.code === "baseline-drift")).toMatchObject({
      affectedFrameNames: ["idle_000", "idle_001"],
      unit: "px"
    });
  });

  test("uses source rects to detect content center drift", () => {
    const diagnostics = analyzeFrameStability([
      { ...stableFrames[0]!, sourceRect: { x: 0, y: 0, w: 32, h: 32 } },
      { ...stableFrames[1]!, sourceRect: { x: 40, y: 0, w: 32, h: 32 } }
    ]);

    expect(diagnostics.issues.map((issue) => issue.code)).toContain("content-center-drift");
  });

  test("reports frame size and duration variance with correct units", () => {
    const diagnostics = analyzeFrameStability([
      stableFrames[0]!,
      { ...stableFrames[1]!, rect: { x: 32, y: 0, w: 40, h: 30 }, durationMs: 160 }
    ]);

    expect(diagnostics.issues.find((issue) => issue.code === "frame-size-variance")).toMatchObject({
      maxDelta: 4,
      unit: "px"
    });
    expect(diagnostics.issues.find((issue) => issue.code === "duration-variance")).toMatchObject({
      maxDelta: 20,
      unit: "ms"
    });
  });
});
