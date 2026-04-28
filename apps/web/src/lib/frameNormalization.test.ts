import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { getFramePreviewDiagnostics, getFramePreviewPlacement, getOnionSkinPlacements, normalizeFramePlacements } from "./frameNormalization";

const frames: SpriteFrame[] = [
  {
    name: "idle_000",
    rect: { x: 0, y: 0, w: 24, h: 30 },
    pivot: { x: 12, y: 28 },
    durationMs: 120
  },
  {
    name: "idle_001",
    rect: { x: 24, y: 0, w: 30, h: 24 },
    pivot: { x: 16, y: 22 },
    durationMs: 120
  },
  {
    name: "idle_002",
    rect: { x: 54, y: 0, w: 20, h: 34 },
    pivot: { x: 10, y: 32 },
    durationMs: 120
  }
];

describe("frame normalization", () => {
  test("computes one shared canvas from frame extents around pivots", () => {
    const placements = normalizeFramePlacements(frames);

    expect(placements.map((placement) => placement.canvas)).toEqual([
      { width: 30, height: 34 },
      { width: 30, height: 34 },
      { width: 30, height: 34 }
    ]);
    expect(placements.map((placement) => placement.normalizedPivot)).toEqual([
      { x: 16, y: 32 },
      { x: 16, y: 32 },
      { x: 16, y: 32 }
    ]);
  });

  test("offsets frames so their pivots land on the shared pivot", () => {
    const placements = normalizeFramePlacements(frames);

    expect(placements.map((placement) => placement.offset)).toEqual([
      { x: 4, y: 4 },
      { x: 0, y: 10 },
      { x: 6, y: 0 }
    ]);
  });

  test("returns a passthrough preview placement when normalization is disabled", () => {
    expect(getFramePreviewPlacement(frames, 1, false)).toEqual({
      frame: frames[1],
      canvas: { width: 30, height: 24 },
      offset: { x: 0, y: 0 },
      normalizedPivot: { x: 16, y: 22 },
      normalized: false
    });
  });

  test("can preview source bounds inside the intended output cell before fix", () => {
    const sourceFrames: SpriteFrame[] = [
      {
        ...frames[1]!,
        rect: { x: 160, y: 80, w: 320, h: 240 },
        pivot: { x: 160, y: 220 }
      }
    ];

    expect(getFramePreviewPlacement([frames[1]!], 0, false, sourceFrames)).toEqual({
      frame: frames[1],
      drawRect: { x: 160, y: 80, w: 320, h: 240 },
      canvas: { width: 30, height: 24 },
      offset: { x: 0, y: 0 },
      normalizedPivot: { x: 16, y: 22 },
      normalized: false
    });
  });

  test("returns a normalized preview placement for the selected frame", () => {
    expect(getFramePreviewPlacement(frames, 1, true)).toEqual({
      frame: frames[1],
      canvas: { width: 30, height: 34 },
      offset: { x: 0, y: 10 },
      normalizedPivot: { x: 16, y: 32 },
      normalized: true
    });
  });

  test("returns previous current and next placements for onion skin", () => {
    const onion = getOnionSkinPlacements(frames, 1, true);

    expect(onion.previous?.frame.name).toBe("idle_000");
    expect(onion.current?.frame.name).toBe("idle_001");
    expect(onion.next?.frame.name).toBe("idle_002");
    expect(onion.previous?.canvas).toEqual({ width: 30, height: 34 });
    expect(onion.next?.offset).toEqual({ x: 6, y: 0 });
  });

  test("does not wrap onion skin neighbors by default", () => {
    const onion = getOnionSkinPlacements(frames, 0, true);

    expect(onion.previous).toBeNull();
    expect(onion.current?.frame.name).toBe("idle_000");
    expect(onion.next?.frame.name).toBe("idle_001");
  });

  test("can wrap onion skin neighbors for looping clips", () => {
    const onion = getOnionSkinPlacements(frames, 0, false, { wrap: true });

    expect(onion.previous?.frame.name).toBe("idle_002");
    expect(onion.current?.frame.name).toBe("idle_000");
    expect(onion.next?.frame.name).toBe("idle_001");
    expect(onion.previous?.canvas).toEqual({ width: 20, height: 34 });
  });

  test("reports timeline frame stability diagnostics", () => {
    const diagnostics = getFramePreviewDiagnostics([
      frames[0]!,
      { ...frames[1]!, pivot: { x: 18, y: 34 } }
    ]);

    expect(diagnostics.issues.map((issue) => issue.code)).toContain("baseline-drift");
    expect(diagnostics.issues.map((issue) => issue.code)).toContain("pivot-drift");
  });
});
