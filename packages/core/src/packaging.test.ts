import type { OutputPackagingOptions, RGBAImage } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { packagePixelArt } from "./packaging";

describe("pixel-art output packaging", () => {
  const source = compositionFixture();
  const contentBounds = { x: 2, y: 1, w: 3, h: 5 };

  test("preserves source composition inside an equal exact canvas", () => {
    const result = packagePixelArt(
      source,
      contentBounds,
      packaging({ canvasMode: "exact", width: 8, height: 8 })
    );

    expect(result.image).toMatchObject({ width: source.width, height: source.height });
    expect(visiblePixelMismatches(result.image, source)).toBe(0);
    expect(pixel(result.image, 0, 0)).toEqual(pixel(source, 0, 0));
    expect(result.metadata).toMatchObject({
      canvas: { width: 8, height: 8 },
      placement: { x: 0, y: 0, w: 8, h: 8 },
      appliedScale: 1,
      trimOffset: { x: 0, y: 0 }
    });
  });

  test("pads the full native composition without changing its pixels", () => {
    const result = packagePixelArt(
      source,
      contentBounds,
      packaging({ canvasMode: "exact", width: 12, height: 10 })
    );

    expect(result.metadata.placement).toEqual({ x: 2, y: 1, w: 8, h: 8 });
    expect(pixel(result.image, 4, 2)).toEqual(pixel(source, 2, 1));
  });

  test("restores a trimmed reconstruction to its original native-canvas offset", () => {
    const trimmed = cropImage(source, contentBounds);
    const result = packagePixelArt(
      trimmed,
      { x: 0, y: 0, w: trimmed.width, h: trimmed.height },
      packaging({ canvasMode: "exact", width: 8, height: 8 }),
      {
        nativeCanvas: { width: 8, height: 8 },
        compositionPlacement: contentBounds
      }
    );

    expect(result.metadata.placement).toEqual(contentBounds);
    expect(pixel(result.image, 2, 1)).toEqual(pixel(trimmed, 0, 0));
    expect(pixel(result.image, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  test("packs unscaled subject bounds at the selected anchor", () => {
    const result = packagePixelArt(
      source,
      contentBounds,
      packaging({
        canvasMode: "exact",
        width: 8,
        height: 8,
        framing: "packSubject",
        anchor: "bottomCenter"
      })
    );

    expect(result.metadata).toMatchObject({
      placement: { x: 2, y: 3, w: 3, h: 5 },
      trimOffset: { x: 2, y: 1 }
    });
    expect(pixel(result.image, 2, 3)).toEqual(pixel(source, 2, 1));
  });

  test("uses only whole-pixel enlargement for integer fit", () => {
    const result = packagePixelArt(
      source,
      contentBounds,
      packaging({
        canvasMode: "exact",
        width: 8,
        height: 12,
        framing: "fitSubject",
        scale: "integerFit"
      })
    );

    expect(result.metadata.appliedScale).toBe(2);
    expect(result.metadata.placement).toEqual({ x: 1, y: 1, w: 6, h: 10 });
  });

  test("requires an explicit scaling policy when the canvas is too small", () => {
    expect(() =>
      packagePixelArt(
        source,
        contentBounds,
        packaging({ canvasMode: "exact", width: 6, height: 6 })
      )
    ).toThrow("smaller than");
  });
});

function packaging(
  overrides: Partial<OutputPackagingOptions>
): OutputPackagingOptions {
  return {
    canvasMode: "native",
    framing: "preserveComposition",
    scale: "native",
    anchor: "center",
    ...overrides
  };
}

function compositionFixture(): RGBAImage {
  const width = 8;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = x * 24;
      data[offset + 1] = y * 24;
      data[offset + 2] = 96;
      data[offset + 3] = x >= 2 && x < 5 && y >= 1 && y < 6 ? 255 : 0;
    }
  }
  return { width, height, data };
}

function pixel(image: RGBAImage, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}

function cropImage(image: RGBAImage, rect: { x: number; y: number; w: number; h: number }): RGBAImage {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const sourceStart = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(
      image.data.subarray(sourceStart, sourceStart + rect.w * 4),
      y * rect.w * 4
    );
  }
  return { width: rect.w, height: rect.h, data };
}

function visiblePixelMismatches(actual: RGBAImage, expected: RGBAImage): number {
  let mismatches = 0;
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    if (expected.data[offset + 3]! === 0) {
      continue;
    }
    for (let channel = 0; channel < 4; channel += 1) {
      if (actual.data[offset + channel] !== expected.data[offset + channel]) {
        mismatches += 1;
        break;
      }
    }
  }
  return mismatches;
}
