import { describe, expect, test } from "vitest";
import { remapToPalette, resolvePalette } from "./palette";
import type { PaletteDitheringMode, PaletteStrategy, RGBAImage, SpriteFrame } from "@pixelaid/shared";

describe("palette dithering", () => {
  test("perceptual quantization chooses representative source colors instead of averaged mud colors", () => {
    const sourceColors = ["#101112", "#183f3c", "#5cb09c", "#96d8c4"];
    const source = imageFromHexRows([
      ["#101112", "#101112", "#101112", "#183f3c"],
      ["#183f3c", "#5cb09c", "#5cb09c", "#96d8c4"]
    ]);

    const result = resolvePalette(source, {
      requested: { mode: "auto", strategy: "perceptual" as PaletteStrategy, maxColors: 2, dithering: "none" },
      fallbackMaxColors: 2
    });

    expect(result.diagnostics.strategy).toBe("perceptual");
    expect(result.palette).toHaveLength(2);
    expect(result.palette.every((color) => sourceColors.includes(color))).toBe(true);
  });

  test("ordered dithering intentionally mixes neighboring palette colors for flat midtones", () => {
    const source = solidImage(4, 4, [128, 128, 128, 255]);
    const remapped = remapToPalette(source, ["#000000", "#ffffff"], { dithering: "ordered" as PaletteDitheringMode });

    expect(visibleColors(remapped)).toEqual(new Set(["#000000", "#ffffff"]));
    expect(readHex(remapped, 0, 0)).not.toBe(readHex(remapped, 1, 0));
  });

  test("error diffusion dithering spreads quantization error while staying inside the active palette", () => {
    const source = solidImage(4, 4, [128, 128, 128, 255]);
    const remapped = remapToPalette(source, ["#000000", "#ffffff"], { dithering: "errorDiffusion" as PaletteDitheringMode });

    expect(visibleColors(remapped)).toEqual(new Set(["#000000", "#ffffff"]));
    expect(readHex(remapped, 3, 3)).toBe("#ffffff");
  });

  test("warns when dithering is requested for multi-frame palette diagnostics", () => {
    const source = solidImage(4, 2, [128, 128, 128, 255]);
    const frames: SpriteFrame[] = [
      { name: "frame_000", rect: { x: 0, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120 },
      { name: "frame_001", rect: { x: 2, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120 }
    ];

    const result = resolvePalette(source, {
      requested: {
        mode: "auto",
        strategy: "medianCut",
        maxColors: 2,
        lockScope: "sheet",
        dithering: "ordered" as PaletteDitheringMode
      },
      fallbackMaxColors: 2,
      frames
    });

    expect(result.diagnostics.dithering).toBe("ordered");
    expect(result.diagnostics.warnings).toContain("Dithering can introduce crawling noise across animation frames; keep it disabled for stable sheets unless reviewed.");
  });

  test("keeps extreme accidental colors deterministic under current in-house strategies", () => {
    const source = noisyGradientImage(16, 16);
    const frames: SpriteFrame[] = [
      { name: "left", rect: { x: 0, y: 0, w: 8, h: 16 }, pivot: { x: 4, y: 16 }, durationMs: 120 },
      { name: "right", rect: { x: 8, y: 0, w: 8, h: 16 }, pivot: { x: 4, y: 16 }, durationMs: 120 }
    ];
    const first = resolvePalette(source, {
      requested: { mode: "auto", strategy: "perceptual", maxColors: 8, lockScope: "sheet", dithering: "none" },
      fallbackMaxColors: 8,
      frames
    });
    const second = resolvePalette(source, {
      requested: { mode: "auto", strategy: "perceptual", maxColors: 8, lockScope: "sheet", dithering: "none" },
      fallbackMaxColors: 8,
      frames
    });

    expect(first.diagnostics.inputColorCount).toBeGreaterThan(200);
    expect(first.diagnostics.outputColorCount).toBeLessThanOrEqual(8);
    expect(first.palette).toEqual(second.palette);
    expect(first.diagnostics.drift?.checkedFrameCount).toBe(2);
  });
});

function solidImage(width: number, height: number, rgba: readonly [number, number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = rgba[3];
  }
  return { width, height, data };
}

function noisyGradientImage(width: number, height: number): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 17 + y * 7) & 0xff;
      data[offset + 1] = (x * 5 + y * 19) & 0xff;
      data[offset + 2] = (x * 11 + y * 13) & 0xff;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function imageFromHexRows(rows: readonly (readonly string[])[]): RGBAImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const hex = rows[y]![x]!;
      const value = Number.parseInt(hex.slice(1), 16);
      const offset = (y * width + x) * 4;
      data[offset] = (value >> 16) & 0xff;
      data[offset + 1] = (value >> 8) & 0xff;
      data[offset + 2] = value & 0xff;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function visibleColors(image: RGBAImage): Set<string> {
  const colors = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! >= 16) {
      colors.add(rgbHex(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!));
    }
  }
  return colors;
}

function readHex(image: RGBAImage, x: number, y: number): string {
  const offset = (y * image.width + x) * 4;
  return rgbHex(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
