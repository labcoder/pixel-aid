import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { PaletteStrategy, RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { rgbToOklab } from "./color";
import { readGoldenPng } from "./goldenImage.test-utils";
import { extractAutoPalette } from "./palette";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const goldensDir = path.join(testDir, "goldens");
const familyFirst = "familyFirst" as PaletteStrategy;

describe("familyFirst palette extraction", () => {
  test("keeps major hero-cat color families at 8 colors", () => {
    const palette = paletteFor("hero-cat-ai.png", 8);
    const message = `palette: ${palette.join(", ")}`;

    expect(palette).toHaveLength(8);
    expect(palette.some(isNearBlackHex), message).toBe(true);
    expect(palette.some(isNearWhiteHex), message).toBe(true);
    expect(palette.some(isGreyHex), message).toBe(true);
    expect(palette.some(isGreenishHex), message).toBe(true);
    expect(palette.some(isPinkishHex), message).toBe(true);
    expect(palette.some(isBrownishOrangeHex), message).toBe(true);
  });

  test("nested palettes are monotone as budgets increase", () => {
    for (const fixture of ["hero-cat-ai.png", "samurai-magenta.png"] as const) {
      const at8 = new Set(paletteFor(fixture, 8));
      const at16 = new Set(paletteFor(fixture, 16));
      const at24 = new Set(paletteFor(fixture, 24));
      const at32 = new Set(paletteFor(fixture, 32));
      expect(isSubset(at8, at16), fixture).toBe(true);
      expect(isSubset(at16, at24), fixture).toBe(true);
      expect(isSubset(at24, at32), fixture).toBe(true);
    }
  }, 20_000);

  test("is deterministic across independent extractions", () => {
    expect(paletteFor("hero-cat-ai.png", 16)).toEqual(paletteFor("hero-cat-ai.png", 16));
  });

  test("never exceeds budget and keeps dark/light anchors at low budget", () => {
    const at4 = paletteFor("hero-cat-ai.png", 4);
    const at8 = paletteFor("hero-cat-ai.png", 8);
    const at16 = paletteFor("hero-cat-ai.png", 16);
    const message = `palette(4): ${at4.join(", ")}`;

    expect(at4.length).toBeLessThanOrEqual(4);
    expect(at8.length).toBeLessThanOrEqual(8);
    expect(at16.length).toBeLessThanOrEqual(16);
    expect(at4.some(isNearBlackHex), message).toBe(true);
    expect(at4.some(isNearWhiteHex), message).toBe(true);
  });
});

function paletteFor(filename: string, maxColors: number): string[] {
  const image = readGoldenPng(path.join(goldensDir, filename));
  return extractAutoPalette(removeBackground(image), maxColors, familyFirst);
}

function removeBackground(image: RGBAImage): RGBAImage {
  return applyAlphaMode(image, "backgroundFloodFill", {}).image;
}

function isSubset(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function isNearBlackHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return Math.max(r, g, b) <= 60;
}

function isNearWhiteHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return Math.min(r, g, b) >= 200;
}

function isGreyHex(hex: string): boolean {
  const lab = oklch(hex);
  return lab.chroma < 0.035 && lab.lightness >= 0.28 && lab.lightness <= 0.82;
}

function isGreenishHex(hex: string): boolean {
  const lab = oklch(hex);
  return lab.chroma >= 0.035 && lab.hue >= 100 && lab.hue <= 165;
}

function isPinkishHex(hex: string): boolean {
  const lab = oklch(hex);
  return lab.chroma >= 0.035 && lab.lightness > 0.5 && (lab.hue >= 330 || lab.hue <= 30);
}

function isBrownishOrangeHex(hex: string): boolean {
  const lab = oklch(hex);
  return lab.chroma >= 0.025 && lab.hue >= 30 && lab.hue <= 90 && lab.lightness >= 0.3 && lab.lightness <= 0.7;
}

function oklch(hex: string): { lightness: number; chroma: number; hue: number } {
  const color = Number.parseInt(hex.slice(1), 16);
  const lab = rgbToOklab(color);
  const chroma = Math.hypot(lab.y, lab.z);
  const hue = (Math.atan2(lab.z, lab.y) * 180) / Math.PI;
  return { lightness: lab.x, chroma, hue: hue < 0 ? hue + 360 : hue };
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const color = Number.parseInt(hex.slice(1), 16);
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}
