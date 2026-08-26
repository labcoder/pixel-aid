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

  test("exact full-canvas mapping does not reuse detected subject crop dimensions", () => {
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
    expect(exact.reconstruction).toMatchObject({
      nativeCanvas: { width: source.width, height: source.height },
      reconstructedImage: { width: source.width, height: source.height }
    });
    expect(exact.packaging).toMatchObject({
      canvasMode: "legacy",
      canvas: { width: source.width, height: source.height }
    });
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

  test("automatic native reconstruction ignores compatibility target dimensions", () => {
    const source = createBlockImage(24, 18, 3);
    const detectedSubject: GridCandidate = {
      outputWidth: 6,
      outputHeight: 4,
      scaleX: 3,
      scaleY: 3,
      phaseX: 0,
      phaseY: 0,
      sourceRect: { x: 3, y: 3, w: 18, h: 12 },
      confidence: 0.9,
      reason: "Automatic reconstruction candidate"
    };
    const result = fixImage(
      source,
      options({
        reconstruction: { sizeMode: "auto" },
        targetWidth: 128,
        targetHeight: 128,
        grid: { detect: "auto", cropToBounds: true }
      }),
      { gridCandidates: [detectedSubject] }
    );

    expect(result.grid).toMatchObject({
      outputWidth: 6,
      outputHeight: 4,
      scaleX: 3,
      scaleY: 3
    });
  });

  test("canvas packaging does not change native reconstruction geometry", () => {
    const source = createBlockImage(24, 18, 3);
    const base = options({
      reconstruction: { sizeMode: "manual", width: 8, height: 6 },
      packaging: {
        canvasMode: "exact",
        width: 12,
        height: 10,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      },
      grid: { detect: "auto", cropToBounds: true }
    });
    const first = fixImage(source, base);
    const second = fixImage(source, {
      ...base,
      packaging: { ...base.packaging!, width: 16, height: 12 }
    });

    expect(first.reconstruction).toEqual(second.reconstruction);
    expect(first.grid).toEqual(second.grid);
    expect(first.palette).toEqual(second.palette);
    expect(first.image).toMatchObject({ width: 12, height: 10 });
    expect(second.image).toMatchObject({ width: 16, height: 12 });
  });

  test("background preservation changes pixels without changing the native grid or canvas", () => {
    const source = createMatteSubjectImage();
    const detectedSubject: GridCandidate = {
      outputWidth: 6,
      outputHeight: 4,
      scaleX: 3,
      scaleY: 3,
      phaseX: 0,
      phaseY: 0,
      sourceRect: { x: 3, y: 3, w: 18, h: 12 },
      confidence: 0.96,
      reason: "Fixed subject geometry"
    };
    const common = options({
      assetType: "sprite",
      reconstruction: { sizeMode: "manual", width: 8, height: 6 },
      packaging: {
        canvasMode: "exact",
        width: 8,
        height: 6,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      },
      grid: { detect: "auto", cropToBounds: true }
    });
    const preserved = fixImage(
      source,
      { ...common, alpha: "preserve" },
      { gridCandidates: [detectedSubject] }
    );
    const removed = fixImage(
      source,
      {
        ...common,
        alpha: "backgroundFloodFill",
        alphaSettings: {
          backgroundDetection: "classic",
          tolerance: 0,
          decontaminateRgb: true
        }
      },
      { gridCandidates: [detectedSubject] }
    );

    expect(preserved.grid).toMatchObject({ scaleX: 3, scaleY: 3 });
    expect(removed.grid).toMatchObject({ scaleX: 3, scaleY: 3 });
    expect(preserved.reconstruction).toMatchObject({
      nativeCanvas: { width: 8, height: 6 },
      reconstructedImage: { width: 8, height: 6 },
      compositionPlacement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(removed.reconstruction).toMatchObject({
      nativeCanvas: { width: 8, height: 6 },
      reconstructedImage: { width: 8, height: 6 },
      compositionPlacement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(preserved.packaging).toMatchObject({
      canvas: { width: 8, height: 6 },
      placement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(removed.packaging).toMatchObject({
      canvas: { width: 8, height: 6 },
      placement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(alphaAt(preserved.image, 0, 0)).toBe(255);
    expect(alphaAt(removed.image, 0, 0)).toBe(0);
  });

  test("preserved composition keeps the manual native canvas when background cleanup removes the matte", () => {
    const source = createMatteSubjectImage();
    const detectedSubject: GridCandidate = {
      outputWidth: 6,
      outputHeight: 4,
      scaleX: 3,
      scaleY: 3,
      phaseX: 0,
      phaseY: 0,
      sourceRect: { x: 3, y: 3, w: 18, h: 12 },
      confidence: 0.96,
      reason: "Robust-style foreground crop"
    };

    const result = fixImage(
      source,
      options({
        assetType: "sprite",
        reconstruction: { sizeMode: "manual", width: 8, height: 6 },
        packaging: {
          canvasMode: "content",
          framing: "preserveComposition",
          scale: "native",
          anchor: "center"
        },
        grid: {
          detect: "auto",
          autoStrategy: "robust",
          robustSafety: "guarded",
          cropToBounds: true
        },
        alpha: "backgroundFloodFill",
        alphaSettings: {
          backgroundDetection: "classic",
          tolerance: 0,
          decontaminateRgb: true
        }
      }),
      { gridCandidates: [detectedSubject] }
    );

    expect(result.image).toMatchObject({ width: 8, height: 6 });
    expect(result.grid).toMatchObject({ outputWidth: 8, outputHeight: 6 });
    expect(result.grid.sourceRect).toBeUndefined();
    expect(result.reconstruction).toMatchObject({
      nativeCanvas: { width: 8, height: 6 },
      reconstructedImage: { width: 8, height: 6 },
      compositionPlacement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(result.packaging).toMatchObject({
      canvasMode: "content",
      canvas: { width: 8, height: 6 },
      placement: { x: 0, y: 0, w: 8, h: 6 }
    });
    expect(alphaAt(result.image, 0, 0)).toBe(0);
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

function createMatteSubjectImage(): RGBAImage {
  const width = 24;
  const height = 18;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const subject = x >= 3 && x < 21 && y >= 3 && y < 15;
      data[offset] = subject ? 42 : 255;
      data[offset + 1] = subject ? 104 : 0;
      data[offset + 2] = subject ? 196 : 255;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function alphaAt(image: RGBAImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3]!;
}
