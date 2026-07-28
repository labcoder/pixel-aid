import { describe, expect, it } from "vitest";
import { normalizeFixOptions, parseAutomationAssetType } from "./options";

describe("automation option normalization", () => {
  it("keeps robust native-size inference out of automation defaults and inputs", () => {
    const defaultResult = normalizeFixOptions({});
    const requestedResult = normalizeFixOptions({
      grid: {
        detect: "auto",
        autoStrategy: "robust",
      },
    });

    expect(defaultResult.ok).toBe(true);
    expect(requestedResult.ok).toBe(true);
    if (!defaultResult.ok || !requestedResult.ok) return;
    expect(defaultResult.value.grid.autoStrategy).toBeUndefined();
    expect(requestedResult.value.grid.autoStrategy).toBeUndefined();
  });

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
    ["icon-set", "iconSet", "spriteSheet"],
    ["iconSet", "iconSet", "spriteSheet"],
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

  it("rejects unknown background detection modes with invalid_options", () => {
    const result = normalizeFixOptions({ backgroundDetection: "magic" as "adaptive" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_options");
    expect(result.error.message).toContain("backgroundDetection");
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
      backgroundDetection: "adaptive",
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
        dominantThreshold: 0.72,
        denoiseStrength: 20,
        outlineMode: "repairExisting",
        outlineSourceColors: ["#102020", "#203030"],
        contrastExpansion: {
          enabled: true,
          radius: 1,
          minContrast: 64,
        },
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
    expect(result.value.alphaSettings).toMatchObject({ threshold: 96, backgroundDetection: "adaptive" });
    expect(result.value.cleanup.dominantThreshold).toBe(0.72);
    expect(result.value.cleanup.outlineSourceColors).toEqual(["#102020", "#203030"]);
    expect(result.value.cleanup.contrastExpansion).toMatchObject({
      enabled: true,
      radius: 1,
      minContrast: 64,
    });
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

  it("preserves explicit morphology cleanup settings for automation callers", () => {
    const result = normalizeFixOptions({
      cleanup: {
        morphology: {
          enabled: true,
          fillTinyHoles: true,
          matteCleanup: true,
          removeTinyComponents: true,
          maxHolePixels: 1,
          maxComponentPixels: 2,
          preserveSinglePixelDetails: true,
          connectivity: 4,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cleanup.morphology).toEqual({
      enabled: true,
      fillTinyHoles: true,
      matteCleanup: true,
      removeTinyComponents: true,
      maxHolePixels: 1,
      maxComponentPixels: 2,
      preserveSinglePixelDetails: true,
      connectivity: 4,
    });
  });

  it("normalizes new color and palette controls", () => {
    const result = normalizeFixOptions({
      maxColors: "auto",
      colorSpace: "oklab",
      quantizer: "wu",
      dither: "bayer4",
      downscaleMethod: "perceptual",
      paletteWeighting: "area",
      minRegion: 2,
      seed: 42,
      protectColors: "auto",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxColors).toBe(512);
    expect(result.value.paletteSettings).toMatchObject({
      maxColors: "auto",
      colorSpace: "oklab",
      strategy: "wu",
      dithering: "bayer4",
      weighting: "area",
      minRegion: 2,
      seed: 42,
      protectColors: "auto",
    });
    expect(result.value.downscale).toBe("perceptual");
  });

  it.each(["wu", "kmeans"] as const)("accepts %s quantizer", (quantizer) => {
    const result = normalizeFixOptions({ quantizer });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.paletteSettings?.strategy).toBe(quantizer);
  });

  it.each(["bayer2", "bayer4", "floyd"] as const)("accepts %s dithering", (dither) => {
    const result = normalizeFixOptions({ dither });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.paletteSettings?.dithering).toBe(dither);
  });

  it.each(["perceptual", "nearest", "bilinear"] as const)("accepts %s downscale method", (downscaleMethod) => {
    const result = normalizeFixOptions({ downscaleMethod });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.downscale).toBe(downscaleMethod);
  });

  it("parses protected colors and clamps explicit max colors", () => {
    const result = normalizeFixOptions({ maxColors: 999, protectColors: "#ff0000,00ff00" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxColors).toBe(512);
    expect(result.value.paletteSettings?.maxColors).toBe(512);
    expect(result.value.paletteSettings?.protectColors).toEqual(["#ff0000", "#00ff00"]);
  });

  it.each([
    { colorSpace: "xyz" },
    { quantizer: "octree" },
    { dither: "noise" },
    { downscaleMethod: "lanczos" },
    { protectColors: "not-hex" },
  ] as const)("rejects invalid new option %# with invalid_options", (input) => {
    const result = normalizeFixOptions(input as Parameters<typeof normalizeFixOptions>[0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_options");
  });
});
