import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog } from "@pixelaid/fixtures";
import type { Rect, SheetLayoutDetection } from "@pixelaid/shared";
import { detectSheetLayout } from "./index";

type SheetLayoutBaseline = {
  fixtureId: string;
  rows: number;
  maxColumns: number;
  rowFrameCounts: number[];
  rowAnimationNames: string[];
  minConfidence: number;
  warningIncludes: string[];
  firstSourceRect: Rect;
  lastSourceRect: Rect;
  rectTolerancePx: number;
};

const baselines: SheetLayoutBaseline[] = [
  {
    fixtureId: "presentation-mockup-2x6-sheet",
    rows: 2,
    maxColumns: 6,
    rowFrameCounts: [6, 6],
    rowAnimationNames: ["row_1", "row_2"],
    minConfidence: 0.8,
    warningIncludes: ["Presentation-style sheet artifacts detected"],
    firstSourceRect: { x: 74, y: 80, w: 57, h: 81 },
    lastSourceRect: { x: 595, y: 242, w: 60, h: 81 },
    rectTolerancePx: 2
  },
  {
    fixtureId: "uneven-gutter-labeled-sheet",
    rows: 3,
    maxColumns: 6,
    rowFrameCounts: [4, 6, 5],
    rowAnimationNames: ["row_1", "row_2", "row_3"],
    minConfidence: 0.85,
    warningIncludes: ["Rows contain different frame counts", "Presentation-style sheet artifacts detected"],
    firstSourceRect: { x: 101, y: 30, w: 26, h: 29 },
    lastSourceRect: { x: 381, y: 238, w: 26, h: 29 },
    rectTolerancePx: 3
  }
];

describe("sheet layout metadata baselines", () => {
  test.each(baselines)("keeps $fixtureId sheet metadata stable", (baseline) => {
    const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === baseline.fixtureId);
    if (!fixture) {
      throw new Error(`Missing sheet fixture ${baseline.fixtureId}`);
    }

    const detection = detectSheetLayout(fixture.createImage());

    expect(detection.rows, `${baseline.fixtureId} row count changed`).toBe(baseline.rows);
    expect(detection.columns, `${baseline.fixtureId} max column count changed`).toBe(baseline.maxColumns);
    expect(detection.rowFrameCounts, `${baseline.fixtureId} per-row frame counts changed`).toEqual(baseline.rowFrameCounts);
    expect(detection.frames, `${baseline.fixtureId} frame count changed`).toHaveLength(totalFrames(baseline.rowFrameCounts));
    expect(detection.rowAnimations.map((animation) => animation.name), `${baseline.fixtureId} row animation names changed`).toEqual(baseline.rowAnimationNames);
    expect(detection.confidence, `${baseline.fixtureId} detection confidence dropped`).toBeGreaterThanOrEqual(baseline.minConfidence);

    for (const warning of baseline.warningIncludes) {
      expect(detection.warnings.join("\n"), `${baseline.fixtureId} missing warning containing ${warning}`).toContain(warning);
    }

    expectRectClose(`${baseline.fixtureId} first frame sourceRect`, firstSourceRect(detection), baseline.firstSourceRect, baseline.rectTolerancePx);
    expectRectClose(`${baseline.fixtureId} last frame sourceRect`, lastSourceRect(detection), baseline.lastSourceRect, baseline.rectTolerancePx);
  });
});

function totalFrames(rowFrameCounts: readonly number[]): number {
  return rowFrameCounts.reduce((sum, count) => sum + count, 0);
}

function firstSourceRect(detection: SheetLayoutDetection): Rect {
  const frame = detection.frames[0];
  if (!frame?.sourceRect) {
    throw new Error("Detection did not include first frame sourceRect");
  }
  return frame.sourceRect;
}

function lastSourceRect(detection: SheetLayoutDetection): Rect {
  const frame = detection.frames.at(-1);
  if (!frame?.sourceRect) {
    throw new Error("Detection did not include last frame sourceRect");
  }
  return frame.sourceRect;
}

function expectRectClose(label: string, actual: Rect, expected: Rect, tolerancePx: number): void {
  for (const field of ["x", "y", "w", "h"] as const) {
    const delta = Math.abs(actual[field] - expected[field]);
    expect(delta, `${label}.${field} changed: expected ${expected[field]} ±${tolerancePx}, received ${actual[field]}`).toBeLessThanOrEqual(tolerancePx);
  }
}
