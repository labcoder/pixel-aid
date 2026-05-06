import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, createGoldenSignature, visualRegressionCases } from "@pixelaid/fixtures";
import type { DownscaleMethod } from "@pixelaid/shared";
import { downsampleBlocks, createImage, fixImage, readPixel, writePixel } from "./index";

describe("advanced downsample modes", () => {
  test("dominant and adaptive reset reusable color histograms between blocks", () => {
    const source = createImage(4, 2, [0, 0, 0, 0]);
    writePixel(source, 0, 0, 250, 0, 0, 255);
    writePixel(source, 1, 0, 252, 2, 0, 255);
    writePixel(source, 0, 1, 248, 1, 1, 255);
    writePixel(source, 1, 1, 12, 12, 12, 0);
    writePixel(source, 2, 0, 0, 0, 252, 255);
    writePixel(source, 3, 0, 0, 2, 250, 255);
    writePixel(source, 2, 1, 2, 0, 248, 255);
    writePixel(source, 3, 1, 0, 0, 255, 255);

    const dominant = downsampleBlocks(source, {
      outputWidth: 2,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });
    const adaptive = downsampleBlocks(source, {
      outputWidth: 2,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "adaptive",
      alpha: "preserve"
    });

    expect(readPixel(dominant, 0, 0)).toEqual([250, 1, 0, 191]);
    expect(readPixel(dominant, 1, 0)).toEqual([1, 1, 251, 255]);
    expect(readPixel(adaptive, 0, 0)).toEqual(readPixel(dominant, 0, 0));
    expect(readPixel(adaptive, 1, 0)).toEqual(readPixel(dominant, 1, 0));
  });

  test("median downsampling preserves odd even and alpha median semantics", () => {
    const oddSource = createImage(3, 1);
    writePixel(oddSource, 0, 0, 10, 30, 90, 0);
    writePixel(oddSource, 1, 0, 100, 80, 60, 128);
    writePixel(oddSource, 2, 0, 250, 210, 40, 255);
    const odd = downsampleBlocks(oddSource, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 3,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      method: "median",
      alpha: "preserve"
    });

    const evenSource = createImage(2, 2);
    writePixel(evenSource, 0, 0, 0, 10, 100, 0);
    writePixel(evenSource, 1, 0, 10, 20, 110, 100);
    writePixel(evenSource, 0, 1, 100, 200, 120, 200);
    writePixel(evenSource, 1, 1, 255, 250, 130, 255);
    const even = downsampleBlocks(evenSource, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "median",
      alpha: "preserve"
    });

    expect(readPixel(odd, 0, 0)).toEqual([100, 80, 60, 128]);
    expect(readPixel(even, 0, 0)).toEqual([55, 110, 115, 150]);
  });

  test("contrast preserves sparse dark linework missed by existing block modes", () => {
    const source = createImage(6, 6, [220, 214, 190, 255]);
    writePixel(source, 2, 1, 22, 24, 30, 255);
    writePixel(source, 2, 2, 20, 22, 28, 255);
    writePixel(source, 2, 3, 24, 26, 32, 255);

    const dominant = downsample(source, "dominant");
    const adaptive = downsample(source, "adaptive");
    const detailPreserving = downsample(source, "detailPreserving");
    const contrast = downsample(source, "contrast");

    expect(luma(readPixel(dominant, 0, 0))).toBeGreaterThan(180);
    expect(luma(readPixel(adaptive, 0, 0))).toBeGreaterThan(180);
    expect(luma(readPixel(detailPreserving, 0, 0))).toBeGreaterThan(180);
    expect(readPixel(contrast, 0, 0)).toEqual([22, 24, 30, 255]);
  });

  test("kCentroid deterministically selects the largest noisy color cluster", () => {
    const source = createImage(4, 4, [0, 0, 0, 255]);
    const redCluster = [
      [210, 30, 28],
      [204, 34, 30],
      [214, 26, 34],
      [208, 32, 26],
      [212, 28, 31],
      [206, 35, 33],
      [216, 29, 29]
    ] as const;
    const blueCluster = [
      [32, 42, 210],
      [28, 38, 206],
      [34, 40, 214],
      [30, 44, 208],
      [36, 41, 212],
      [29, 39, 204]
    ] as const;
    const highlights = [
      [234, 220, 188],
      [226, 214, 196],
      [230, 218, 192]
    ] as const;
    const colors = [...redCluster, ...blueCluster, ...highlights];

    colors.forEach((color, index) => {
      writePixel(source, index % 4, Math.floor(index / 4), color[0], color[1], color[2], 255);
    });

    const first = downsample(source, "kCentroid");
    const second = downsample(source, "kCentroid");

    expect(readPixel(second, 0, 0)).toEqual(readPixel(first, 0, 0));
    expect(readPixel(first, 0, 0)).toEqual([210, 31, 30, 255]);
  });

  test("compares advanced modes against existing visual regression fixture methods", () => {
    const fixtureCase = visualRegressionCases.find((candidate) => candidate.id === "single-robot-grid-outline");
    const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === fixtureCase?.fixtureId);
    if (!fixtureCase || !fixture) {
      throw new Error("Missing single robot visual regression fixture");
    }

    const methods: DownscaleMethod[] = ["dominant", "adaptive", "detailPreserving", "contrast", "kCentroid"];
    const signatures = methods.map((method) => {
      const result = fixImage(fixture.createImage(), {
        ...fixtureCase.options,
        downscale: method
      });
      return createGoldenSignature(result.image, fixtureCase.signatureOptions);
    });

    expect(signatures.every((signature) => signature.width === signatures[0]!.width)).toBe(true);
    expect(signatures.every((signature) => signature.height === signatures[0]!.height)).toBe(true);
    expect(signatures.every((signature) => signature.visiblePixels > 0)).toBe(true);
    expect(new Set(signatures.map((signature) => signature.checksum)).size).toBeGreaterThan(1);
  });
});

function downsample(source: ReturnType<typeof createImage>, method: Parameters<typeof downsampleBlocks>[1]["method"]) {
  return downsampleBlocks(source, {
    outputWidth: 1,
    outputHeight: 1,
    scaleX: source.width,
    scaleY: source.height,
    phaseX: 0,
    phaseY: 0,
    method,
    alpha: "preserve"
  });
}

function luma(pixel: readonly [number, number, number, number]): number {
  return pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114;
}
