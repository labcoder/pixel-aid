import { describe, expect, it } from "vitest";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";
import { createDiagnosticOverlayModel } from "./diagnosticOverlays";

function image(width: number, pixels: readonly (readonly [number, number, number, number])[]): RGBAImage {
  const data = new Uint8ClampedArray(width * Math.ceil(pixels.length / width) * 4);
  pixels.forEach((pixel, index) => {
    data.set(pixel, index * 4);
  });
  return { width, height: Math.ceil(pixels.length / width), data };
}

function grid(width: number, height: number, scale = 1): GridCandidate {
  return {
    outputWidth: width,
    outputHeight: height,
    scaleX: scale,
    scaleY: scale,
    phaseX: 0,
    phaseY: 0,
    confidence: 0.84,
    reason: "test"
  };
}

describe("diagnostic overlays", () => {
  it("marks changed output pixels and corresponding source pixels", () => {
    const source = image(2, [
      [10, 10, 10, 255],
      [20, 20, 20, 255],
      [30, 30, 30, 255],
      [40, 40, 40, 255]
    ]);
    const fixed = image(2, [
      [10, 10, 10, 255],
      [80, 80, 80, 255],
      [30, 30, 30, 255],
      [40, 40, 40, 255]
    ]);

    const model = createDiagnosticOverlayModel({
      mode: "changedPixels",
      sourceImage: source,
      fixedImage: fixed,
      grid: grid(2, 2)
    });

    expect(model.active).toBe(true);
    expect([...model.fixedMask!.data]).toEqual([0, 1, 0, 0]);
    expect([...model.sourceMask!.data]).toEqual([0, 1, 0, 0]);
    expect(model.summary).toContain("1 output pixels");
  });

  it("marks source blocks whose output alpha was removed", () => {
    const source = image(2, [
      [10, 10, 10, 255],
      [20, 20, 20, 255],
      [30, 30, 30, 255],
      [40, 40, 40, 255]
    ]);
    const fixed = image(2, [
      [10, 10, 10, 255],
      [20, 20, 20, 0],
      [30, 30, 30, 255],
      [40, 40, 40, 255]
    ]);

    const model = createDiagnosticOverlayModel({
      mode: "removedAlpha",
      sourceImage: source,
      fixedImage: fixed,
      grid: grid(2, 2)
    });

    expect(model.active).toBe(true);
    expect([...model.fixedMask!.data]).toEqual([0, 1, 0, 0]);
  });

  it("marks palette remaps when source colors were outside the fixed palette", () => {
    const source = image(2, [
      [12, 12, 12, 255],
      [101, 42, 42, 255],
      [12, 12, 12, 255],
      [12, 12, 12, 255]
    ]);
    const fixed = image(2, [
      [8, 8, 8, 255],
      [80, 32, 32, 255],
      [8, 8, 8, 255],
      [8, 8, 8, 255]
    ]);

    const model = createDiagnosticOverlayModel({
      mode: "paletteRemap",
      sourceImage: source,
      fixedImage: fixed,
      grid: grid(2, 2),
      palette: ["#080808", "#502020"]
    });

    expect(model.active).toBe(true);
    expect([...model.fixedMask!.data]).toEqual([1, 1, 1, 1]);
  });

  it("returns source crop and block scale for source grid overlays", () => {
    const source = image(4, new Array(16).fill([0, 0, 0, 255]) as [number, number, number, number][]);
    const model = createDiagnosticOverlayModel({
      mode: "sourceGrid",
      sourceImage: source,
      fixedImage: null,
      grid: { ...grid(2, 2, 2), sourceRect: { x: 0, y: 0, w: 4, h: 4 } }
    });

    expect(model.active).toBe(true);
    expect(model.sourceGrid?.rect).toEqual({ x: 0, y: 0, w: 4, h: 4 });
    expect(model.legend.map((item) => item.label)).toContain("Block");
  });

  it("marks outline candidate colors only at source edges", () => {
    const white = [255, 255, 255, 255] as const;
    const dark = [16, 18, 18, 255] as const;
    const fill = [90, 140, 130, 255] as const;
    const source = image(4, [
      white,
      white,
      white,
      white,
      white,
      dark,
      dark,
      white,
      white,
      dark,
      fill,
      white,
      white,
      white,
      white,
      white
    ]);

    const model = createDiagnosticOverlayModel({
      mode: "outlineCandidates",
      sourceImage: source,
      fixedImage: null,
      outlineCandidateColors: ["#101212"]
    });

    expect(model.active).toBe(true);
    expect(model.sourceMask!.data[5]).toBe(1);
    expect(model.sourceMask!.data[10]).toBe(0);
  });
});
