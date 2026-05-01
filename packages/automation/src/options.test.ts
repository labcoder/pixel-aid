import { describe, expect, it } from "vitest";
import { normalizeFixOptions, parseAutomationAssetType } from "./options";

describe("automation option normalization", () => {
  it.each([
    ["sprite", "sprite", "single"],
    ["sprite-sheet", "spriteSheet", "spriteSheet"],
    ["spriteSheet", "spriteSheet", "spriteSheet"],
    ["animation", "animationSheet", "spriteSheet"],
    ["animationSheet", "animationSheet", "spriteSheet"],
    ["character", "characterSheet", "spriteSheet"],
    ["tileset", "tileset", "tileSheet"],
    ["tilemap", "tilemap", "tileSheet"],
    ["portrait", "portrait", "single"],
    ["icon", "icon", "single"],
    ["ui", "uiElement", "single"],
    ["background", "background", "single"],
  ])("maps %s to %s", (input, assetType, mode) => {
    const result = parseAutomationAssetType(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.assetType).toBe(assetType);
    expect(result.value.mode).toBe(mode);
  });

  it("rejects unknown asset types with invalid_options", () => {
    const result = parseAutomationAssetType("poster");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_options");
    expect(result.error.exitCode).toBe(2);
  });

  it("normalizes target, grid, palette, alpha, cleanup, and outline settings", () => {
    const result = normalizeFixOptions({
      assetType: "animation",
      target: "64x48",
      maxColors: 16,
      palette: ["#000000", "#ffffff"],
      paletteMode: "fixed",
      paletteLockScope: "sheet",
      downscale: "detailPreserving",
      alpha: "binary",
      alphaThreshold: 96,
      grid: {
        detect: "manual",
        scale: 8,
        phaseX: 2,
        phaseY: 3,
        localCorrection: true,
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        outlineMode: "repairExisting",
        outlineSourceColors: ["#102020", "#203030"],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assetType).toBe("animationSheet");
    expect(result.value.mode).toBe("spriteSheet");
    expect(result.value.targetWidth).toBe(64);
    expect(result.value.targetHeight).toBe(48);
    expect(result.value.maxColors).toBe(16);
    expect(result.value.paletteSettings).toMatchObject({
      mode: "fixed",
      maxColors: 16,
      lockScope: "sheet",
      colors: ["#000000", "#ffffff"],
    });
    expect(result.value.grid).toMatchObject({
      detect: "manual",
      scale: 8,
      phaseX: 2,
      phaseY: 3,
      localCorrection: true,
    });
    expect(result.value.alphaSettings).toMatchObject({ threshold: 96 });
    expect(result.value.cleanup.outlineSourceColors).toEqual(["#102020", "#203030"]);
  });

  it("uses asset-specific conservative defaults for inspect-only asset classes", () => {
    const result = normalizeFixOptions({ assetType: "background" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assetType).toBe("background");
    expect(result.value.mode).toBe("single");
    expect(result.value.maxColors).toBeGreaterThanOrEqual(32);
    expect(result.value.downscale).toBe("averageThenPalette");
    expect(result.value.alpha).toBe("preserve");
  });

  it("normalizes perceptual quantization and explicit dithering for automation callers", () => {
    const result = normalizeFixOptions({
      paletteStrategy: "perceptual",
      paletteDithering: "ordered",
    } as Parameters<typeof normalizeFixOptions>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.paletteSettings).toMatchObject({
      strategy: "perceptual",
      dithering: "ordered",
    });
  });

  it.each(["contrast", "kCentroid"] as const)("accepts %s downscale mode for automation callers", (downscale) => {
    const result = normalizeFixOptions({ downscale });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.downscale).toBe(downscale);
  });
});
