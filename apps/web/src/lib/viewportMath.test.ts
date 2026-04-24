import { describe, expect, test } from "vitest";
import { chooseRulerTickStep, getImageDrawRect, zoomAtPoint } from "./viewportMath";

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
});
