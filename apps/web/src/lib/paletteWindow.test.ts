import { describe, expect, test } from "vitest";
import { getPaletteWindow } from "./paletteWindow";

describe("palette window", () => {
  test("returns a bounded page of colors for large palettes", () => {
    const colors = Array.from({ length: 1000 }, (_, index) => `#${index.toString(16).padStart(6, "0")}`);

    expect(getPaletteWindow(colors, { page: 2, pageSize: 128 })).toEqual({
      colors: colors.slice(256, 384),
      page: 2,
      pageCount: 8,
      start: 256,
      end: 384,
      total: 1000
    });
  });

  test("clamps page indexes and page sizes", () => {
    const colors = ["#000000", "#ffffff", "#ff0000"];

    expect(getPaletteWindow(colors, { page: 99, pageSize: 0 })).toEqual({
      colors,
      page: 0,
      pageCount: 1,
      start: 0,
      end: 3,
      total: 3
    });
  });
});
