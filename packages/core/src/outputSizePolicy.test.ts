import { createGoldenSignature } from "@pixelaid/fixtures";
import type { FixOptions, GridCandidate, RGBAImage } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { fixImage } from "./fix";

describe("output-size policies", () => {
  test("omitting the policy preserves the legacy target-guided result", () => {
    const source = createBlockImage(24, 18, 3);
    const result = fixImage(source, options({ targetWidth: 8, targetHeight: 6 }));

    expect(result.image).toMatchObject({ width: 8, height: 6 });
    expect(result.grid.reason).toContain("Target-guided auto grid");
  });

  test("source preserves the full decoded canvas and ignores target dimensions", () => {
    const source = createBlockImage(24, 18, 3);
    const result = fixImage(
      source,
      options({
        outputSizeMode: "source",
        targetWidth: 8,
        targetHeight: 6,
        grid: { detect: "auto", cropToBounds: true }
      })
    );

    expect(result.image).toMatchObject({ width: 24, height: 18 });
    expect(result.grid).toMatchObject({
      outputWidth: 24,
      outputHeight: 18,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      reason: "Source-size output policy"
    });
    expect(result.grid.sourceRect).toBeUndefined();
  });

  test("exact guarantees the requested dimensions even when crop is enabled", () => {
    const source = createBlockImage(24, 18, 3);
    const result = fixImage(
      source,
      options({
        outputSizeMode: "exact",
        targetWidth: 10,
        targetHeight: 7,
        grid: { detect: "auto", cropToBounds: true }
      })
    );

    expect(result.image).toMatchObject({ width: 10, height: 7 });
    expect(result.grid).toMatchObject({ outputWidth: 10, outputHeight: 7 });
    expect(result.grid.sourceRect).toBeUndefined();
  });

  test.fails("exact full-canvas mapping does not reuse detected subject crop dimensions", () => {
    const source = createBlockImage(24, 18, 3);
    const detectedSubject: GridCandidate = {
      outputWidth: 6,
      outputHeight: 4,
      scaleX: 3,
      scaleY: 3,
      phaseX: 2,
      phaseY: 1,
      sourceRect: { x: 3, y: 3, w: 18, h: 12 },
      confidence: 0.9,
      reason: "Characterized detected foreground crop"
    };
    const expected = fixImage(source, options({ outputSizeMode: "source" }));
    const exact = fixImage(
      source,
      options({
        outputSizeMode: "exact",
        targetWidth: source.width,
        targetHeight: source.height,
        grid: { detect: "auto", cropToBounds: true }
      }),
      { gridCandidates: [detectedSubject] }
    );

    expect(exact.image).toMatchObject({ width: source.width, height: source.height });
    expect(createGoldenSignature(exact.image)).toEqual(
      createGoldenSignature(expected.image)
    );
  });

  test("detected ignores stale target dimensions", () => {
    const source = createBlockImage(24, 18, 3);
    const detected = fixImage(
      source,
      options({ outputSizeMode: "detected", targetWidth: 5, targetHeight: 5 })
    );
    const withoutTargets = fixImage(source, options({ outputSizeMode: "detected" }));

    expect(detected.grid).toEqual(withoutTargets.grid);
    expect(createGoldenSignature(detected.image)).toEqual(
      createGoldenSignature(withoutTargets.image)
    );
  });

  test("exact rejects an incomplete target", () => {
    const source = createBlockImage(24, 18, 3);

    expect(() =>
      fixImage(source, options({ outputSizeMode: "exact", targetWidth: 8 }))
    ).toThrow("requires both targetWidth and targetHeight");
  });
});

function options(overrides: Partial<FixOptions>): FixOptions {
  const base: FixOptions = {
    mode: "single",
    assetType: "background",
    maxColors: 8,
    grid: { detect: "auto", cropToBounds: false },
    downscale: "adaptive",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  };
  return {
    ...base,
    ...overrides,
    grid: overrides.grid ?? base.grid
  };
}

function createBlockImage(width: number, height: number, scale: number): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const light = (Math.floor(x / scale) + Math.floor(y / scale)) % 2 === 0;
      data[offset] = light ? 224 : 36;
      data[offset + 1] = light ? 192 : 62;
      data[offset + 2] = light ? 96 : 104;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}
