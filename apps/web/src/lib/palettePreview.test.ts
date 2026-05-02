import { describe, expect, test } from "vitest";
import { analyzeVisiblePalettePreview, countVisibleColors, extractVisiblePalette } from "./palettePreview";
import type { RGBAImage } from "@pixelaid/shared";

const image = (pixels: number[]): RGBAImage => ({
  width: pixels.length / 4,
  height: 1,
  data: new Uint8ClampedArray(pixels)
});

describe("palette preview", () => {
  test("extracts exact visible source colors by frequency", () => {
    const source = image([
      10, 20, 30, 255,
      10, 20, 30, 255,
      0, 200, 240, 255,
      250, 0, 0, 0,
      120, 130, 140, 255
    ]);

    expect(extractVisiblePalette(source, 2)).toEqual(["#0a141e", "#00c8f0"]);
    expect(countVisibleColors(source)).toBe(3);
  });

  test("bounds source palette analysis for extremely high color inputs", () => {
    const pixels: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      pixels.push(index, index + 1, index + 2, 255);
    }

    const preview = analyzeVisiblePalettePreview(image(pixels), 3, { maxUniqueColors: 4 });

    expect(preview.colors).toHaveLength(3);
    expect(preview.totalColors).toBe(4);
    expect(preview.truncated).toBe(true);
  });
});
