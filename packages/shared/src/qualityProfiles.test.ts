import { describe, expect, test } from "vitest";
import type { FixOptions } from "./types";
import {
  applyQualityProfileToFixOptions,
  getQualityProfileDefinition,
  qualityProfileDefinitions
} from "./qualityProfiles";

const baseOptions: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 32,
  targetHeight: 32,
  maxColors: 32,
  paletteSettings: {
    mode: "auto",
    strategy: "medianCut",
    maxColors: 32,
    lockScope: "single",
    dithering: "none"
  },
  grid: {
    detect: "auto",
    cropToBounds: true,
    localCorrection: false
  },
  downscale: "adaptive",
  alpha: "preserve",
  alphaSettings: {
    threshold: 128,
    tolerance: 18,
    decontaminateRgb: true,
    transparentRgb: "#000000"
  },
  cleanup: {
    removeOrphans: true,
    jaggyCleanup: true,
    preserveSinglePixelDetails: true,
    removeHalos: true,
    denoiseStrength: 20,
    inferNativeScale: false,
    outlineMode: "none",
    outlineSize: 1,
    outlineAlpha: 255
  }
};

describe("quality profiles", () => {
  test("defines stable cleanup profiles for common pixel-art workflows", () => {
    expect(qualityProfileDefinitions.map((profile) => profile.id)).toEqual([
      "balanced",
      "cleanSprite",
      "cleanSheet",
      "cleanIconSet",
      "tilesetSafe",
      "preserveBackground"
    ]);
    expect(getQualityProfileDefinition("cleanSheet").settings.cleanup.morphology).toMatchObject({
      enabled: true,
      matteCleanup: true,
      fillTinyHoles: true,
      removeTinyComponents: true
    });
  });

  test("applies strict sheet cleanup without making the caller lose explicit overrides", () => {
    const profiled = applyQualityProfileToFixOptions(baseOptions, "cleanSheet", {
      maxColors: 24,
      cleanup: {
        jaggyCleanup: false,
        dominantThreshold: 0.78
      }
    });

    expect(profiled.maxColors).toBe(24);
    expect(profiled.alpha).toBe("binary");
    expect(profiled.downscale).toBe("adaptive");
    expect(profiled.cleanup.removeHalos).toBe(true);
    expect(profiled.cleanup.jaggyCleanup).toBe(false);
    expect(profiled.cleanup.dominantThreshold).toBe(0.78);
    expect(profiled.cleanup.morphology).toMatchObject({
      enabled: true,
      matteCleanup: true,
      fillTinyHoles: true,
      removeTinyComponents: true,
      alphaThreshold: 128
    });
  });

  test("keeps background-preserving cleanup conservative", () => {
    const profiled = applyQualityProfileToFixOptions(baseOptions, "preserveBackground");

    expect(profiled.alpha).toBe("preserve");
    expect(profiled.maxColors).toBe(64);
    expect(profiled.cleanup.removeHalos).toBe(false);
    expect(profiled.cleanup.removeOrphans).toBe(false);
    expect(profiled.cleanup.jaggyCleanup).toBe(false);
    expect(profiled.cleanup.morphology?.enabled).toBe(false);
  });
});
