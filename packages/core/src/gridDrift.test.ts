import { describe, expect, test } from "vitest";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";
import { downsampleBlocks } from "./downsample";
import { createImage, readPixel, writePixel } from "./image";
import { planLocalGridDrift } from "./gridDrift";

function drawRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function cleanGridImage(): RGBAImage {
  const image = createImage(24, 16, [255, 255, 255, 255]);
  const colors = [
    [20, 20, 28, 255],
    [90, 140, 180, 255],
    [180, 90, 80, 255],
    [60, 180, 120, 255]
  ] as const;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      drawRect(image, x * 4, y * 4, 4, 4, colors[(x + y) % colors.length]!);
    }
  }
  return image;
}

function driftedVerticalGridImage(): RGBAImage {
  const image = createImage(24, 16, [255, 255, 255, 255]);
  for (let y = 0; y < image.height; y += 1) {
    const boundary = y >= 8 ? 10 : 8;
    drawRect(image, 0, y, boundary, 1, [30, 40, 50, 255]);
    drawRect(image, boundary, y, image.width - boundary, 1, [210, 120, 90, 255]);
  }
  return image;
}

function rowLocalDriftImage(): RGBAImage {
  const image = createImage(12, 8, [0, 0, 0, 255]);
  const red = [220, 20, 20, 255] as const;
  const green = [20, 210, 70, 255] as const;
  const blue = [40, 80, 230, 255] as const;

  drawRect(image, 0, 0, 4, 4, red);
  drawRect(image, 4, 0, 4, 4, green);
  drawRect(image, 8, 0, 4, 4, blue);
  drawRect(image, 0, 4, 6, 4, red);
  drawRect(image, 6, 4, 2, 4, green);
  drawRect(image, 8, 4, 4, 4, blue);

  return image;
}

const candidate: GridCandidate = {
  outputWidth: 6,
  outputHeight: 4,
  scaleX: 4,
  scaleY: 4,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.9,
  reason: "test grid"
};

const rowCandidate: GridCandidate = {
  outputWidth: 3,
  outputHeight: 2,
  scaleX: 4,
  scaleY: 4,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.9,
  reason: "row-local test grid"
};

describe("local grid drift planning", () => {
  test("returns an unused plan for clean global grids", () => {
    const plan = planLocalGridDrift(cleanGridImage(), candidate);

    expect(plan.used).toBe(false);
    expect(Array.from(plan.xBoundaries)).toEqual([0, 4, 8, 12, 16, 20, 24]);
    expect(Array.from(plan.yBoundaries)).toEqual([0, 4, 8, 12, 16]);
    expect(plan.diagnostics.localCorrectionUsed).toBe(false);
    expect(plan.diagnostics.correctedBoundaryCount).toBe(0);
  });

  test("rejects ambiguous low-signal grids and preserves nominal boundaries", () => {
    const plan = planLocalGridDrift(createImage(24, 16, [120, 120, 120, 255]), candidate, {
      maxOffsetPx: 3,
      minImprovementScore: 0.02,
      smoothnessWeight: 0.05
    });

    expect(plan.used).toBe(false);
    expect(Array.from(plan.xBoundaries)).toEqual([0, 4, 8, 12, 16, 20, 24]);
    expect(Array.from(plan.yBoundaries)).toEqual([0, 4, 8, 12, 16]);
    expect(plan.diagnostics.localCorrectionUsed).toBe(false);
    expect(plan.diagnostics.correctedBoundaryCount).toBe(0);
  });

  test("corrects mild boundary drift when edge evidence improves", () => {
    const plan = planLocalGridDrift(driftedVerticalGridImage(), candidate, {
      maxOffsetPx: 3,
      minImprovementScore: 0.02,
      smoothnessWeight: 0.05
    });

    expect(plan.used).toBe(true);
    expect(plan.xBoundaries[2]).toBeGreaterThan(8);
    expect(plan.diagnostics.localCorrectionUsed).toBe(true);
    expect(plan.diagnostics.correctedBoundaryCount).toBeGreaterThan(0);
    expect(plan.diagnostics.maxOffsetPx).toBeGreaterThanOrEqual(1);
  });

  test("uses row-local boundaries so shifted rows improve without changing clean rows", () => {
    const plan = planLocalGridDrift(rowLocalDriftImage(), rowCandidate, {
      maxOffsetPx: 3,
      minImprovementScore: 0.02,
      smoothnessWeight: 0.05
    });

    expect(plan.used).toBe(true);
    expect(Array.from(plan.xBoundaryRows!.subarray(0, 4))).toEqual([0, 4, 8, 12]);
    expect(plan.xBoundaryRows![5]).toBe(6);
    expect(plan.diagnostics.boundaryModel).toBe("perCell");
    expect(plan.diagnostics.xBoundaryStride).toBe(4);
    expect(plan.diagnostics.xBoundaryOffsets).toHaveLength(8);
    expect(plan.diagnostics.xBoundaryOffsets![5]).toBe(2);

    const fixed = downsampleBlocks(rowLocalDriftImage(), {
      outputWidth: rowCandidate.outputWidth,
      outputHeight: rowCandidate.outputHeight,
      scaleX: rowCandidate.scaleX,
      scaleY: rowCandidate.scaleY,
      phaseX: rowCandidate.phaseX,
      phaseY: rowCandidate.phaseY,
      xBoundaryRows: plan.xBoundaryRows,
      yBoundaryColumns: plan.yBoundaryColumns,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([220, 20, 20, 255]);
    expect(readPixel(fixed, 1, 0)).toEqual([20, 210, 70, 255]);
    expect(readPixel(fixed, 2, 0)).toEqual([40, 80, 230, 255]);
    expect(readPixel(fixed, 0, 1)).toEqual([220, 20, 20, 255]);
    expect(readPixel(fixed, 1, 1)).toEqual([20, 210, 70, 255]);
    expect(readPixel(fixed, 2, 1)).toEqual([40, 80, 230, 255]);
  });
});
