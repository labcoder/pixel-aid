import { describe, expect, test } from "vitest";
import { getContainedDrawRect } from "./previewGeometry";

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
});
