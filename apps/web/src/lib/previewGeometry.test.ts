import { describe, expect, test } from "vitest";
import { getContainedDrawRect, sampleRgbaImageNearest } from "./previewGeometry";

describe("preview geometry", () => {
  test("fits a large portrait image fully inside a thumbnail", () => {
    const rect = getContainedDrawRect({ width: 38, height: 38 }, { width: 706, height: 878 });

    expect(rect.width).toBeLessThanOrEqual(38);
    expect(rect.height).toBeLessThanOrEqual(38);
    expect(rect.width).toBe(30);
    expect(rect.height).toBe(38);
    expect(rect.x).toBe(4);
    expect(rect.y).toBe(0);
  });

  test("scales tiny pixel art up by an integer when possible", () => {
    expect(getContainedDrawRect({ width: 38, height: 38 }, { width: 8, height: 4 })).toEqual({
      x: 3,
      y: 11,
      width: 32,
      height: 16
    });
  });

  test("samples a large source into a target-sized preview buffer", () => {
    const source = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
        255, 0, 255, 255, 0, 255, 255, 255, 80, 80, 80, 255, 160, 160, 160, 255,
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
        1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 11, 12, 13, 255
      ])
    };

    const preview = sampleRgbaImageNearest(source, { x: 0, y: 0, w: 4, h: 4 }, { width: 2, height: 2 });

    expect(preview.width).toBe(2);
    expect(preview.height).toBe(2);
    expect(preview.data.length).toBe(2 * 2 * 4);
    expect([...preview.data]).toEqual([
      0, 255, 255, 255, 160, 160, 160, 255,
      4, 5, 6, 255, 11, 12, 13, 255
    ]);
  });
});
