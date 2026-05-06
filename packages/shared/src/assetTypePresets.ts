import { getAssetTypeDefinition } from "./assetTypes";
import type { AlphaCleanupSettings, AlphaMode, AssetType, AssetTypeWarning, DownscaleMethod } from "./types";

export type AssetTypeCleanupPreset = {
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings: AlphaCleanupSettings;
  alphaWarningCodes: string[];
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  lockPaletteAcrossFrames: boolean;
  warningCodes: string[];
};

const strictSpriteAlpha: AlphaCleanupSettings = {
  threshold: 128,
  tolerance: 18,
  decontaminateRgb: true,
  transparentRgb: "#000000"
};

const strictIconAlpha: AlphaCleanupSettings = {
  threshold: 144,
  tolerance: 18,
  decontaminateRgb: true,
  transparentRgb: "#000000"
};

const preserveSoftAlpha: AlphaCleanupSettings = {
  threshold: 128,
  tolerance: 18,
  decontaminateRgb: false,
  transparentRgb: "#000000"
};

export function getAssetTypeCleanupPreset(assetType: AssetType): AssetTypeCleanupPreset {
  switch (assetType) {
    case "icon":
      return {
        maxColors: 16,
        downscale: "dominant",
        alpha: "binary",
        alphaSettings: strictIconAlpha,
        alphaWarningCodes: [],
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 15,
        lockPaletteAcrossFrames: false,
        warningCodes: []
      };
    case "sprite":
      return {
        maxColors: 24,
        downscale: "adaptive",
        alpha: "binary",
        alphaSettings: strictSpriteAlpha,
        alphaWarningCodes: [],
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        lockPaletteAcrossFrames: false,
        warningCodes: []
      };
    case "spriteSheet":
    case "animationSheet":
    case "characterSheet":
      return {
        maxColors: 32,
        downscale: "dominant",
        alpha: "preserve",
        alphaSettings: preserveSoftAlpha,
        alphaWarningCodes: ["preserve-intentional-soft-alpha"],
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        lockPaletteAcrossFrames: true,
        warningCodes: []
      };
    case "tileset":
      return {
        maxColors: 16,
        downscale: "dominant",
        alpha: "preserve",
        alphaSettings: preserveSoftAlpha,
        alphaWarningCodes: [],
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 10,
        lockPaletteAcrossFrames: true,
        warningCodes: ["tileset-engine-metadata-next"]
      };
    case "tilemap":
      return {
        maxColors: 32,
        downscale: "dominant",
        alpha: "preserve",
        alphaSettings: preserveSoftAlpha,
        alphaWarningCodes: [],
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        lockPaletteAcrossFrames: true,
        warningCodes: ["tilemap-grid-review"]
      };
    case "portrait":
    case "uiElement":
    case "background":
      return {
        maxColors: assetType === "background" ? 64 : 32,
        downscale: "adaptive",
        alpha: "preserve",
        alphaSettings: preserveSoftAlpha,
        alphaWarningCodes: ["preserve-intentional-soft-alpha"],
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: assetType !== "background",
        denoiseStrength: assetType === "background" ? 0 : 10,
        lockPaletteAcrossFrames: false,
        warningCodes: [`${assetType}-inspect-only`]
      };
  }
}

export function getAssetTypeWarnings(assetType: AssetType): AssetTypeWarning[] {
  const definition = getAssetTypeDefinition(assetType);
  const preset = getAssetTypeCleanupPreset(assetType);
  const warnings = [...definition.defaultWarnings];
  const knownCodes = new Set(warnings.map((warning) => warning.code));

  for (const code of [...preset.warningCodes, ...preset.alphaWarningCodes]) {
    if (!knownCodes.has(code)) {
      warnings.push({
        code,
        severity: code === "preserve-intentional-soft-alpha" ? "warning" : "info",
        message: codeToAssetTypeWarningMessage(code)
      });
      knownCodes.add(code);
    }
  }

  return warnings;
}

function codeToAssetTypeWarningMessage(code: string): string {
  if (code === "tilemap-grid-review") {
    return "Tilemap export is metadata-first; confirm grid, offsets, and tile identity threshold before using map data in an engine.";
  }
  if (code === "tileset-engine-metadata-next") {
    return "Tileset seam diagnostics are available; engine-specific tileset metadata arrives with export adapters.";
  }
  if (code === "preserve-intentional-soft-alpha") {
    return "This preset preserves intentional soft alpha; destructive alpha cleanup can flatten glow, effects, and soft edges.";
  }
  return "This asset type uses a generic fix/export workflow in 0.1.0.";
}
