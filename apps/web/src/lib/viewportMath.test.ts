import { describe, expect, test } from "vitest";
import {
  chooseRulerTickStep,
  getAlignedComparisonRects,
  getAutoViewportZoom,
  getComparisonSize,
  getImageDrawRect,
  getWheelZoom,
  zoomAtPoint
} from "./viewportMath";

describe("viewport math", () => {
  test("centers the image with pan offset applied", () => {
    expect(getImageDrawRect({ width: 200, height: 100 }, { width: 10, height: 5 }, 4, { x: 3, y: -2 })).toEqual({
      x: 83,
      y: 38,
      width: 40,
      height: 20
    });
  });

  test("keeps the native pixel under the cursor stable while zooming", () => {
    const nextPan = zoomAtPoint({
      viewport: { width: 200, height: 100 },
      image: { width: 10, height: 10 },
      pan: { x: 0, y: 0 },
      pointer: { x: 125, y: 50 },
      zoom: 5,
      nextZoom: 10
    });

    expect(nextPan).toEqual({ x: -25, y: 0 });
  });

  test("chooses ruler ticks that remain readable at different zoom levels", () => {
    expect(chooseRulerTickStep(2)).toBe(20);
    expect(chooseRulerTickStep(8)).toBe(10);
    expect(chooseRulerTickStep(16)).toBe(5);
  });

  test("uses a shared footprint for split comparisons", () => {
    expect(getComparisonSize({ width: 64, height: 32 }, { width: 16, height: 16 })).toEqual({
      width: 64,
      height: 32
    });
  });

  test("aligns a cropped fixed image back into its source crop without stretching", () => {
    const layout = getAlignedComparisonRects({
      viewport: { width: 900, height: 700 },
      before: { width: 706, height: 878 },
      after: { width: 102, height: 144 },
      afterSourceRect: { x: 50, y: 1, w: 612, h: 864 },
      zoom: 1,
      pan: { x: 0, y: 0 }
    });

    expect(layout.before).toEqual({ x: 97, y: -89, width: 706, height: 878 });
    expect(layout.after).toEqual({ x: 147, y: -88, width: 612, height: 864 });
  });

  test("centers a non-matching fixed crop inside the detected source footprint", () => {
    const layout = getAlignedComparisonRects({
      viewport: { width: 200, height: 100 },
      before: { width: 100, height: 50 },
      after: { width: 20, height: 20 },
      afterSourceRect: { x: 10, y: 5, w: 80, h: 40 },
      zoom: 2,
      pan: { x: 0, y: 0 }
    });

    expect(layout.before).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(layout.after).toEqual({ x: 60, y: 10, width: 80, height: 80 });
  });

  test("auto-fits large before images below 100 percent", () => {
    expect(
      getAutoViewportZoom({
        viewport: { width: 900, height: 700 },
        source: { width: 706, height: 878 },
        fixed: null,
        viewMode: "before"
      })
    ).toBeCloseTo(0.72, 2);
  });

  test("auto-fits cropped after images to their source footprint scale", () => {
    const zoom = getAutoViewportZoom({
      viewport: { width: 900, height: 700 },
      source: { width: 706, height: 878 },
      fixed: { width: 102, height: 144 },
      fixedSourceRect: { x: 50, y: 1, w: 612, h: 864 },
      viewMode: "after"
    });

    expect(zoom).toBeCloseTo(4.38, 2);
  });

  test("auto-fits split view from the source image footprint", () => {
    expect(
      getAutoViewportZoom({
        viewport: { width: 900, height: 700 },
        source: { width: 706, height: 878 },
        fixed: { width: 102, height: 144 },
        fixedSourceRect: { x: 50, y: 1, w: 612, h: 864 },
        viewMode: "split"
      })
    ).toBeCloseTo(0.72, 2);
  });

  test("uses smaller wheel zoom steps below 100 percent", () => {
    expect(getWheelZoom(0.72, -1)).toBe(0.82);
    expect(getWheelZoom(0.72, 1)).toBe(0.62);
    expect(getWheelZoom(4, -1)).toBe(5);
  });
});
