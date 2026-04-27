import { describe, expect, test } from "vitest";
import { getAssetTypeCleanupPreset } from "./assetTypePresets";

describe("asset type cleanup presets", () => {
  test("uses binary alpha for sprite and icon cleanup", () => {
    expect(getAssetTypeCleanupPreset("sprite").alpha).toBe("binary");
    expect(getAssetTypeCleanupPreset("icon").alpha).toBe("binary");
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
    expect(preset.maxColors).toBe(64);
    expect(preset.denoiseStrength).toBe(0);
  });
});
