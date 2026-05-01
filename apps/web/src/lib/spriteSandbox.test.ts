import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import type { FramePreviewPlacement } from "./frameNormalization";
import { selectSandboxSource, stepSandboxPosition } from "./spriteSandbox";

describe("sprite sandbox", () => {
  test("moves at the configured speed without touching React state", () => {
    const next = stepSandboxPosition({
      position: { x: 10, y: 20 },
      input: { left: false, right: true, up: false, down: false },
      speedPxPerSecond: 96,
      deltaMs: 500
    });

    expect(next).toEqual({ x: 58, y: 20 });
  });

  test("normalizes diagonal movement so previews do not move faster", () => {
    const next = stepSandboxPosition({
      position: { x: 0, y: 0 },
      input: { left: false, right: true, up: false, down: true },
      speedPxPerSecond: 10,
      deltaMs: 1000
    });

    expect(Math.hypot(next.x, next.y)).toBeCloseTo(10, 5);
  });

  test("clamps movement to the preview scene bounds", () => {
    const next = stepSandboxPosition({
      position: { x: 95, y: 5 },
      input: { left: false, right: true, up: true, down: false },
      speedPxPerSecond: 100,
      deltaMs: 1000,
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    });

    expect(next).toEqual({ x: 100, y: 0 });
  });

  test("uses output as the primary source when comparing fixed animation against input", () => {
    const inputPlacements = [placement("input_0"), placement("input_1"), placement("input_2")];
    const outputPlacements = [placement("output_0"), placement("output_1")];

    expect(selectSandboxSource({ sourceMode: "compare", inputPlacements, outputPlacements })).toEqual({
      primary: "output",
      comparison: "input",
      frameCount: 2
    });
  });

  test("falls back to whichever animation source is available", () => {
    const outputPlacements = [placement("output_0")];

    expect(selectSandboxSource({ sourceMode: "input", inputPlacements: [], outputPlacements })).toEqual({
      primary: "output",
      comparison: null,
      frameCount: 1
    });
  });
});

function placement(name: string): FramePreviewPlacement {
  const frame: SpriteFrame = {
    name,
    rect: { x: 0, y: 0, w: 16, h: 16 },
    pivot: { x: 8, y: 16 },
    durationMs: 100
  };

  return {
    frame,
    canvas: { width: 16, height: 16 },
    offset: { x: 0, y: 0 },
    normalizedPivot: { x: 8, y: 16 },
    normalized: false
  };
}
