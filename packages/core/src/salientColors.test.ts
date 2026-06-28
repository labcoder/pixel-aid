import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createImage, writePixel } from "./image";
import { resolvePalette } from "./palette";

// Build a sprite that is mostly grayscale fur (many dull shades) with a TINY but vivid magenta accent
// region — the palette-stress version of "green eyes / pink nose" that frequency-based quantization drops.
function furWithTinyAccent(): RGBAImage {
  const size = 160;
  const image = createImage(size, size, [0, 0, 0, 0]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Dull gray body with gentle per-pixel variation -> many low-saturation shades.
      const v = 60 + ((x * 3 + y * 5) % 120);
      writePixel(image, x, y, v, v, v + ((x + y) % 6), 255);
    }
  }
  // Tiny vivid magenta accent: ~36 of 25600 px (~0.14%), below the 1% frequency floor and its raw
  // count threshold (256), so only salience-based protection (0.1% floor) reserves it.
  for (let y = 70; y < 76; y += 1) {
    for (let x = 70; x < 76; x += 1) {
      writePixel(image, x, y, 230, 20, 200, 255);
    }
  }
  return image;
}

function hasVividMagenta(palette: string[]): boolean {
  return palette.some((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return r > 150 && b > 120 && g < 90;
  });
}

describe("salient color protection", () => {
  test("reserves a small vivid accent so it survives a low color budget", () => {
    const image = furWithTinyAccent();

    const on = resolvePalette(image, {
      requested: { mode: "auto", strategy: "perceptual", maxColors: 12, protectSalientColors: true },
      fallbackMaxColors: 12
    });

    // Salience-based protection explicitly reserves the vivid accent, guaranteeing it survives even a
    // tight 12-color budget dominated by the dull gray body.
    expect(hasVividMagenta(on.diagnostics.protectedColors ?? [])).toBe(true);
    expect(hasVividMagenta(on.palette)).toBe(true);
  });

  test("is deterministic", () => {
    const image = furWithTinyAccent();
    const a = resolvePalette(image, {
      requested: { mode: "auto", strategy: "perceptual", maxColors: 16, protectSalientColors: true },
      fallbackMaxColors: 16
    });
    const b = resolvePalette(image, {
      requested: { mode: "auto", strategy: "perceptual", maxColors: 16, protectSalientColors: true },
      fallbackMaxColors: 16
    });
    expect(a.palette).toEqual(b.palette);
    expect(a.diagnostics.protectedColors).toEqual(b.diagnostics.protectedColors);
  });
});
