import { describe, expect, test } from "vitest";
import { downsampleBlocks } from "./downsample";
import { applyContrastExpansion } from "./contrastExpansion";
import { fixImage } from "./fix";
import { createImage, readPixel, writePixel } from "./image";

describe("contrast-aware expansion prepass", () => {
  test("expands thin dark linework before dominant block downsampling", () => {
    const source = createImage(8, 8, [156, 188, 176, 255]);
    for (let y = 0; y < source.height; y += 1) {
      writePixel(source, 1, y, 18, 26, 30, 255);
      writePixel(source, 5, y, 18, 26, 30, 255);
    }

    const withoutExpansion = downsampleBlocks(source, {
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 4,
      scaleY: 4,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });
    const expanded = applyContrastExpansion(source, {
      enabled: true,
      darkThreshold: 48,
      minContrast: 64,
      radius: 1
    });
    const withExpansion = downsampleBlocks(expanded.image, {
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 4,
      scaleY: 4,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(withoutExpansion, 0, 0)).toEqual([156, 188, 176, 255]);
    expect(readPixel(withExpansion, 0, 0)).toEqual([18, 26, 30, 255]);
    expect(readPixel(withExpansion, 1, 1)).toEqual([18, 26, 30, 255]);
    expect(expanded.diagnostics.changedPixels).toBeGreaterThan(0);
    expect(expanded.diagnostics.darkFeaturePixels).toBe(16);
  });

  test("does not thicken transparent halos or low-contrast texture", () => {
    const source = createImage(5, 5, [130, 136, 132, 255]);
    writePixel(source, 2, 2, 118, 124, 120, 255);
    writePixel(source, 1, 2, 8, 12, 14, 0);

    const expanded = applyContrastExpansion(source, {
      enabled: true,
      darkThreshold: 48,
      minContrast: 64,
      radius: 1
    });

    expect(readPixel(expanded.image, 2, 2)).toEqual([118, 124, 120, 255]);
    expect(readPixel(expanded.image, 1, 2)).toEqual([8, 12, 14, 0]);
    expect(expanded.diagnostics.changedPixels).toBe(0);
    expect(expanded.diagnostics.skippedTransparentPixels).toBe(1);
  });

  test("fix pipeline applies the prepass independently of outline repair", () => {
    const source = createImage(8, 8, [156, 188, 176, 255]);
    for (let y = 0; y < source.height; y += 1) {
      writePixel(source, 1, y, 18, 26, 30, 255);
    }

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 2,
      targetHeight: 2,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 4,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "none",
        contrastExpansion: {
          enabled: true,
          darkThreshold: 48,
          minContrast: 64,
          radius: 1
        }
      }
    });

    expect(readPixel(result.image, 0, 0)).toEqual([18, 26, 30, 255]);
    expect(result.diagnostics?.contrastExpansion).toMatchObject({
      enabled: true,
      changedPixels: expect.any(Number),
      darkFeaturePixels: 8
    });
    expect(result.settings.cleanup.outlineMode).toBe("none");
  });
});
