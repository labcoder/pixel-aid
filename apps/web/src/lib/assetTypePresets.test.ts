import { describe, expect, test } from "vitest";
import { getAssetTypeCleanupPreset } from "./assetTypePresets";

describe("asset type cleanup presets", () => {
  test("uses binary alpha for sprite and icon cleanup", () => {
    const sprite = getAssetTypeCleanupPreset("sprite");
    const icon = getAssetTypeCleanupPreset("icon");

    expect(sprite.alpha).toBe("binary");
    expect(icon.alpha).toBe("binary");
    expect(sprite.alphaSettings).toMatchObject({
      threshold: 128,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });
    expect(icon.alphaSettings).toMatchObject({
      threshold: 144,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });
  });

  test("locks palettes across animation and character sheets", () => {
    expect(getAssetTypeCleanupPreset("animationSheet").lockPaletteAcrossFrames).toBe(true);
    expect(getAssetTypeCleanupPreset("characterSheet").lockPaletteAcrossFrames).toBe(true);
  });

  test("keeps tileset cleanup conservative until seam diagnostics exist", () => {
    const preset = getAssetTypeCleanupPreset("tileset");

    expect(preset.jaggyCleanup).toBe(false);
    expect(preset.warningCodes).toContain("tileset-seams-inspect-only");
  });

  test("preserves backgrounds with a larger palette budget and no denoise", () => {
    const preset = getAssetTypeCleanupPreset("background");

    expect(preset.alpha).toBe("preserve");
    expect(preset.alphaSettings).toMatchObject({ decontaminateRgb: false });
    expect(preset.alphaWarningCodes).toContain("preserve-intentional-soft-alpha");
    expect(preset.maxColors).toBe(64);
    expect(preset.denoiseStrength).toBe(0);
  });

  test("preserves UI and portrait soft alpha by default", () => {
    for (const assetType of ["uiElement", "portrait"] as const) {
      const preset = getAssetTypeCleanupPreset(assetType);

      expect(preset.alpha).toBe("preserve");
      expect(preset.alphaSettings).toMatchObject({ decontaminateRgb: false });
      expect(preset.alphaWarningCodes).toContain("preserve-intentional-soft-alpha");
    }
  });
});
